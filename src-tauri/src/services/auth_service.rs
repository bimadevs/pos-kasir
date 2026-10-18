use crate::error::{AppError, AppResult};
use crate::models::User;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::Rng;
use std::collections::HashMap;
use std::sync::RwLock;
use uuid::Uuid;

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

/// Menyimpan sesi aktif (`session_token -> User`) di memori Server Terminal.
#[derive(Default)]
pub struct SessionStore {
    sessions: RwLock<HashMap<String, User>>,
}

impl SessionStore {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    pub fn create_session(&self, user: User) -> AppResult<String> {
        let token = format!("sess_{}", Uuid::new_v4().simple());
        let mut map = self
            .sessions
            .write()
            .map_err(|_| AppError::Database("Gagal mengunci penyimpanan sesi.".to_string()))?;
        map.insert(token.clone(), user);
        Ok(token)
    }

    pub fn get_session(&self, token: &str) -> AppResult<User> {
        let map = self
            .sessions
            .read()
            .map_err(|_| AppError::Database("Gagal membaca penyimpanan sesi.".to_string()))?;
        map.get(token).cloned().ok_or_else(|| {
            AppError::Unauthorized(
                "Sesi tidak valid atau telah berakhir. Silakan login kembali.".to_string(),
            )
        })
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
        map.retain(|_, u| u.id != user_id);
        Ok(())
    }
}
