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
