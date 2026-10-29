use crate::error::{AppError, AppResult};
use crate::models::User;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::Utc;
use rand::Rng;
use std::collections::HashMap;
use std::sync::RwLock;
use uuid::Uuid;

/// Masa berlaku sesi login pengguna: 1 jam (3.600 detik), diperpanjang otomatis (sliding window) selama aktif.
pub const SESSION_TTL_SECONDS: i64 = 3600;

/// Mengembalikan waktu saat ini dalam Unix epoch seconds (UTC).
pub fn now_unix_ts() -> i64 {
    Utc::now().timestamp()
}

/// Menghasilkan token sesi baru (`sess_<uuid>`).
pub fn generate_session_token() -> String {
    format!("sess_{}", Uuid::new_v4().simple())
}

/// Hash password atau PIN Admin menggunakan Argon2id dengan salt kriptografis acak.
pub fn hash_secret(secret: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(secret.as_bytes(), &salt)
        .map_err(|e| AppError::Validation(format!("Gagal melakukan hashing kredensial: {e}")))?
        .to_string();
    Ok(hash)
}

/// Verifikasi password atau PIN Admin terhadap string PHC Argon2.
pub fn verify_secret(secret: &str, phc_hash: &str) -> bool {
    let Ok(parsed_hash) = PasswordHash::new(phc_hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(secret.as_bytes(), &parsed_hash)
        .is_ok()
}

/// Menghasilkan Pairing Code 6 karakter alfanumerik huruf besar (tanpa karakter ambigu 0/O/1/I).
pub fn generate_pairing_code() -> String {
    const CHARSET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Menyimpan cache sesi aktif (`session_token -> (User, expires_at)`) di memori Server Terminal
/// yang disinkronkan dengan tabel SQLite `user_sessions`.
#[derive(Default)]
pub struct SessionStore {
    sessions: RwLock<HashMap<String, (User, i64)>>,
}

impl SessionStore {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    pub fn create_session(&self, user: User) -> AppResult<(String, i64)> {
        let token = generate_session_token();
        let expires_at = now_unix_ts() + SESSION_TTL_SECONDS;
        self.insert_with_expiry(token.clone(), user, expires_at)?;
        Ok((token, expires_at))
    }

    pub fn insert_with_expiry(&self, token: String, user: User, expires_at: i64) -> AppResult<()> {
        let mut map = self
            .sessions
            .write()
            .map_err(|_| AppError::Database("Gagal mengunci penyimpanan sesi.".to_string()))?;
        map.insert(token, (user, expires_at));
        Ok(())
    }

    pub fn remove_session(&self, token: &str) -> AppResult<()> {
        let mut map = self
            .sessions
            .write()
            .map_err(|_| AppError::Database("Gagal mengunci penyimpanan sesi.".to_string()))?;
        map.remove(token);
        Ok(())
    }

    pub fn revoke_user_sessions(&self, user_id: &str) -> AppResult<()> {
        let mut map = self
            .sessions
            .write()
            .map_err(|_| AppError::Database("Gagal mengunci penyimpanan sesi.".to_string()))?;
        map.retain(|_, (u, _)| u.id != user_id);
        Ok(())
    }

    pub fn clear_all(&self) -> AppResult<()> {
        let mut map = self
            .sessions
            .write()
            .map_err(|_| AppError::Database("Gagal mengunci penyimpanan sesi.".to_string()))?;
        map.clear();
        Ok(())
    }
}
