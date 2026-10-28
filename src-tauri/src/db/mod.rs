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
