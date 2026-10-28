use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

const SCHEMA_SQL: &str = include_str!("schema.sql");

pub struct Database {
    db_path: Option<PathBuf>,
    conn: Mutex<Connection>,
}

impl Database {
    /// Membuka database SQLite pada file path yang ditentukan dan menerapkan PRAGMA WAL + skema DDL.
    pub fn open_file(db_path: &Path) -> AppResult<Self> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(db_path)?;
        Self::configure_and_migrate(&conn)?;
        Ok(Self {
            db_path: Some(db_path.to_path_buf()),
            conn: Mutex::new(conn),
        })
    }

    /// Membuka database SQLite di memori (untuk unit testing).
    pub fn open_in_memory() -> AppResult<Self> {
        let conn = Connection::open_in_memory()?;
        Self::configure_and_migrate(&conn)?;
        Ok(Self {
            db_path: None,
            conn: Mutex::new(conn),
        })
    }

    fn configure_and_migrate(conn: &Connection) -> AppResult<()> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        conn.execute_batch(SCHEMA_SQL)?;
        Self::run_migrations(conn)?;
        Ok(())
    }

    fn run_migrations(conn: &Connection) -> AppResult<()> {
        // 1. Migrasi kolom shift_id pada tabel sales
        let has_shift_id: bool = {
            let mut stmt = conn.prepare("PRAGMA table_info(sales)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == "shift_id" {
                    found = true;
                    break;
                }
            }
            found
        };

        if !has_shift_id {
            conn.execute(
                "ALTER TABLE sales ADD COLUMN shift_id TEXT REFERENCES cashier_shifts(id)",
                [],
            )?;
        }

        // 2. Migrasi kolom applied_tier_min_qty dan applied_tier_price pada tabel sale_line_items
        let (has_tier_min_qty, has_tier_price): (bool, bool) = {
            let mut stmt = conn.prepare("PRAGMA table_info(sale_line_items)")?;
            let mut rows = stmt.query([])?;
            let mut found_min = false;
            let mut found_price = false;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == "applied_tier_min_qty" {
                    found_min = true;
                }
                if name == "applied_tier_price" {
                    found_price = true;
                }
            }
            (found_min, found_price)
        };

        if !has_tier_min_qty {
            conn.execute(
                "ALTER TABLE sale_line_items ADD COLUMN applied_tier_min_qty INTEGER",
                [],
            )?;
        }
        if !has_tier_price {
            conn.execute(
                "ALTER TABLE sale_line_items ADD COLUMN applied_tier_price INTEGER",
                [],
            )?;
        }

        // Pastikan indeks shift pada sales terpasang
        conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON sales(shift_id);")?;

        Ok(())
    }

    pub fn lock_conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::Database("Gagal mengunci koneksi database SQLite.".to_string()))
    }

    pub fn db_path(&self) -> Option<&Path> {
        self.db_path.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_from_legacy_schema_without_shift_id() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("legacy_muditamart.db");

        // 1. Buat database lama secara manual di mana tabel sales belum memiliki shift_id
        // dan sale_line_items belum memiliki applied_tier_*
        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute_batch(
                "CREATE TABLE users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    admin_pin_hash TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE products (
                    id TEXT PRIMARY KEY,
                    sku TEXT NOT NULL UNIQUE,
                    barcode TEXT UNIQUE,
                    name TEXT NOT NULL,
                    unit TEXT NOT NULL,
                    category TEXT NOT NULL,
                    cost_price INTEGER NOT NULL,
                    selling_price INTEGER NOT NULL,
                    stock INTEGER NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE sales (
                    id TEXT PRIMARY KEY,
                    receipt_number TEXT NOT NULL UNIQUE,
                    cashier_id TEXT NOT NULL REFERENCES users(id),
                    cashier_name_snapshot TEXT NOT NULL,
                    terminal_name TEXT NOT NULL,
                    subtotal INTEGER NOT NULL,
                    discount_total INTEGER NOT NULL,
                    total_amount INTEGER NOT NULL,
                    cash_received INTEGER NOT NULL,
                    change_amount INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'COMPLETED',
                    voided_by_user_id TEXT,
                    voided_by_name_snapshot TEXT,
                    void_reason TEXT,
                    voided_at TEXT,
                    transaction_date TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE sale_line_items (
                    id TEXT PRIMARY KEY,
                    sale_id TEXT NOT NULL REFERENCES sales(id),
                    product_id TEXT NOT NULL REFERENCES products(id),
                    sku_snapshot TEXT NOT NULL,
                    barcode_snapshot TEXT,
                    product_name_snapshot TEXT NOT NULL,
                    unit_snapshot TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    cost_price_snapshot INTEGER NOT NULL,
                    selling_price_snapshot INTEGER NOT NULL,
                    discount_type_snapshot TEXT NOT NULL,
                    discount_value_snapshot INTEGER NOT NULL,
                    unit_discount_amount INTEGER NOT NULL,
                    subtotal INTEGER NOT NULL
                );",
            )
            .unwrap();
        }

        // 2. Buka database menggunakan Database::open_file()
        // Ini harus berhasil menjalankan configure_and_migrate tanpa panic atau error no such column!
        let db = Database::open_file(&db_path)
            .expect("Harus berhasil membuka dan memigrasi database versi lama");

        // 3. Verifikasi kolom shift_id telah terpasang pada sales
        {
            let conn = db.lock_conn().unwrap();
            let mut stmt = conn.prepare("PRAGMA table_info(sales)").unwrap();
            let mut rows = stmt.query([]).unwrap();
            let mut found_shift_id = false;
            while let Some(row) = rows.next().unwrap() {
                let name: String = row.get(1).unwrap();
                if name == "shift_id" {
                    found_shift_id = true;
                    break;
                }
            }
            assert!(
                found_shift_id,
                "Kolom shift_id wajib terpasang setelah migrasi!"
            );

            // 4. Verifikasi indeks idx_sales_shift_id terpasang
            let mut stmt_idx = conn
                .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_sales_shift_id'")
                .unwrap();
            assert!(
                stmt_idx.exists([]).unwrap(),
                "Indeks idx_sales_shift_id wajib terpasang!"
            );

            // 5. Verifikasi kolom tier pada sale_line_items terpasang
            let mut stmt_tier = conn.prepare("PRAGMA table_info(sale_line_items)").unwrap();
            let mut rows_tier = stmt_tier.query([]).unwrap();
            let mut found_min_qty = false;
            let mut found_price = false;
            while let Some(row) = rows_tier.next().unwrap() {
                let name: String = row.get(1).unwrap();
                if name == "applied_tier_min_qty" {
                    found_min_qty = true;
                }
                if name == "applied_tier_price" {
                    found_price = true;
                }
            }
            assert!(
                found_min_qty && found_price,
                "Kolom tier pricing wajib terpasang pada sale_line_items!"
            );
        }
    }
}
