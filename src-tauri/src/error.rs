use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("{0}")]
    Validation(String),

    #[error("{0}")]
    Unauthorized(String),

    #[error("{0}")]
    Forbidden(String),

    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Conflict(String),

    #[error("Kesalahan database: {0}")]
    Database(String),

    #[error("Kesalahan I/O: {0}")]
    Io(String),

    #[error("Gagal terhubung ke Server Terminal: {0}")]
    Network(String),

    #[error("Kesalahan perangkat keras: {0}")]
    Hardware(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        match &err {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("Data yang diminta tidak ditemukan.".to_string())
            }
            rusqlite::Error::SqliteFailure(sqlite_err, msg) => {
                let detail = msg.clone().unwrap_or_else(|| sqlite_err.to_string());
                if detail.contains("UNIQUE constraint failed") {
                    AppError::Conflict(format!("Data duplikat terdeteksi ({detail})"))
                } else if detail.contains("CHECK constraint failed") {
                    AppError::Validation(format!("Pelanggaran aturan validasi data ({detail})"))
                } else {
                    AppError::Database(detail)
                }
            }
            _ => AppError::Database(err.to_string()),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Validation(format!("Format JSON tidak valid: {err}"))
    }
}

impl From<csv::Error> for AppError {
    fn from(err: csv::Error) -> Self {
        AppError::Validation(format!("Kesalahan format CSV: {err}"))
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            AppError::Network(format!(
                "Batas waktu komunikasi LAN habis (Timeout). Pastikan Server Terminal aktif dan terhubung ke jaringan: {err}"
            ))
        } else if err.is_connect() {
            AppError::Network(format!(
                "Gagal terhubung ke Server LAN (Koneksi Ditolak/Unreachable). Pastikan IP Server dan Port benar, Server aktif, dan Windows Defender Firewall mengizinkan port LAN: {err}"
            ))
        } else {
            AppError::Network(format!("Komunikasi LAN ke Server Terminal gagal: {err}"))
        }
    }
}
