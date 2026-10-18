use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{
     calculate_effective_unit_price, calculate_line_item, calculate_unit_discount, AdjustmentType,
    AuthSession, CreateHeldBillRequest, CreateSaleRequest, CreateStockAdjustmentRequest,
    DiscountType, HealthCheckResponse, HeldBill, HeldBillItemDetail, LoginRequest,
    LowStockProductRow, Product, ProductFilter, RecalledHeldBill, ReceiptData, Sale, SaleLineItem,
    SaleStatus, SaleWithItems, SalesReport, SalesReportFilter, SetupServerRequest, StockAdjustment,
    StoreSettings, TopProductRow, UpdateStoreSettingsRequest, UpsertProductRequest,
    UpsertUserRequest, User, UserRole, VoidSaleRequest,
};
use crate::services::auth_service::{
    generate_pairing_code, hash_secret, verify_secret, SessionStore,
};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

pub struct CoreService {
    db: Arc<Database>,
    sessions: Arc<SessionStore>,
}

impl CoreService {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            sessions: Arc::new(SessionStore::new()),
        }
    }

    pub(crate) fn db_lock(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.db.lock_conn()
    }

    pub fn now_iso() -> String {
        Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string()
    }

    pub fn today_date_str() -> String {
        Local::now().format("%Y-%m-%d").to_string()
    }

    pub fn today_compact_str() -> String {
        Local::now().format("%Y%m%d").to_string()
    }

    // ========================================================================
    // 1. Setup Server Terminal, Pengaturan Toko, & Health Check
    // ========================================================================

    pub fn is_initialized(&self) -> AppResult<bool> {
        let conn = self.db.lock_conn()?;
        let count: i64 =
            conn.query_row("SELECT COUNT(*) FROM store_settings WHERE id = 1", [], |r| {
                r.get(0)
            })?;
        Ok(count > 0)
    }

    pub fn setup_server(&self, req: &SetupServerRequest) -> AppResult<StoreSettings> {
        let store_name = req.store_name.trim();
        if store_name.is_empty() {
            return Err(AppError::Validation("Nama toko wajib diisi.".to_string()));
        }
        let username = req.admin_username.trim();
        if username.len() < 3 {
            return Err(AppError::Validation(
                "Username Admin minimal 3 karakter.".to_string(),
            ));
        }
        if req.admin_password.len() < 6 {
            return Err(AppError::Validation(
                "Password Admin minimal 6 karakter.".to_string(),
            ));
        }
        Self::validate_pin_format(&req.admin_pin)?;

        let password_hash = hash_secret(&req.admin_password)?;
        let pin_hash = hash_secret(&req.admin_pin)?;
        let pairing_code = generate_pairing_code();
        let now = Self::now_iso();

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let existing: i64 =
            tx.query_row("SELECT COUNT(*) FROM store_settings WHERE id = 1", [], |r| {
                r.get(0)
            })?;
        if existing > 0 {
            return Err(AppError::Conflict(
                "Server Terminal sudah pernah diinisialisasi sebelumnya.".to_string(),
            ));
        }

        let default_footer = "Terima kasih atas kunjungan Anda. Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.";
        tx.execute(
            "INSERT INTO store_settings (id, store_name, store_address, store_phone, receipt_footer, pairing_code, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                store_name,
                req.store_address.trim(),
                req.store_phone.trim(),
                default_footer,
                pairing_code,
                now
            ],
        )?;

        let admin_id = Uuid::new_v4().to_string();
        let admin_full_name = if req.admin_full_name.trim().is_empty() {
            "Administrator Toko"
        } else {
            req.admin_full_name.trim()
        };

        tx.execute(
            "INSERT INTO users (id, username, full_name, password_hash, pin_hash, role, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'ADMIN', 1, ?6, ?6)",
            params![
                admin_id,
                username,
                admin_full_name,
                password_hash,
                pin_hash,
                now
            ],
        )?;

        if req.seed_sample_data {
            Self::seed_minimarket_catalog(&tx, &admin_id, &req.terminal_name, &now)?;
        }

        tx.commit()?;
        drop(conn);

        self.get_store_settings()
    }

    fn seed_minimarket_catalog(
        tx: &rusqlite::Transaction<'_>,
        admin_id: &str,
        terminal_name: &str,
        now: &str,
    ) -> AppResult<()> {
        // Akun Cashier sampel untuk mempermudah pengujian multi-role
        let cashier_hash = hash_secret("kasir123")?;
        tx.execute(
            "INSERT OR IGNORE INTO users (id, username, full_name, password_hash, pin_hash, role, is_active, created_at, updated_at)
             VALUES (?1, 'kasir1', 'Siti (Kasir Pagi)', ?2, NULL, 'CASHIER', 1, ?3, ?3)",
            params![Uuid::new_v4().to_string(), cashier_hash, now],
        )?;

        let sample_products: &[(&str, &str, &str, &str, &str, i64, i64, &str, i64, i64)] = &[
            (
                "SKU-001",
                "8998866200011",
                "Indomie Goreng Spesial 85g",
                "Makanan Instan",
                "bungkus",
                2_600,
                3_500,
                "NONE",
                0,
                120,
            ),
            (
                "SKU-002",
                "8998866200028",
                "Indomie Kuah Soto Mie 75g",
                "Makanan Instan",
                "bungkus",
                2_500,
                3_300,
                "NONE",
                0,
                95,
            ),
            (
                "SKU-003",
                "8992752011005",
                "Aqua Air Mineral Botol 600ml",
                "Minuman",
                "botol",
                2_400,
                4_000,
                "NOMINAL",
                500,
                80,
            ),
            (
                "SKU-004",
                "8996001300114",
                "Teh Botol Sosro Kotak 250ml",
                "Minuman",
                "kotak",
                3_200,
                4_500,
                "NONE",
                0,
                60,
            ),
            (
                "SKU-005",
                "8992696401112",
                "Susu Ultra Milk Coklat 250ml",
                "Minuman",
                "kotak",
                5_200,
                7_000,
                "NONE",
                0,
                45,
            ),
            (
                "SKU-006",
                "8992770012015",
                "Minyak Goreng Bimoli Pouch 2L",
                "Sembako",
                "pouch",
                32_000,
                38_000,
                "PERCENT",
                5,
                30,
            ),
            (
                "SKU-007",
                "8995102101012",
                "Beras Kepala Super Ramos 5kg",
                "Sembako",
                "sak",
                64_000,
                74_500,
                "NONE",
                0,
                25,
            ),
            (
                "SKU-008",
                "8994096210018",
                "Gula Pasir Gulaku Premium 1kg",
                "Sembako",
                "bungkus",
                15_000,
                18_500,
                "NONE",
                0,
                40,
            ),
            (
                "SKU-009",
                "8991002101234",
                "Kopi Kapal Api Special Mix 10x24g",
                "Minuman",
                "pak",
                12_500,
                16_000,
                "NOMINAL",
                1_000,
                35,
            ),
            (
                "SKU-010",
                "8992775201001",
                "Roti Tawar Sari Roti Kupas",
                "Roti & Camilan",
                "bungkus",
                11_500,
                15_000,
                "NONE",
                0,
                15,
            ),
            (
                "SKU-011",
                "8999999001122",
                "Sabun Mandi Lifebuoy Cair 450ml",
                "Kebutuhan Rumah",
                "pouch",
                18_000,
                24_000,
                "PERCENT",
                10,
                22,
            ),
            (
                "SKU-012",
                "8999999002233",
                "Pasta Gigi Pepsodent White 190g",
                "Kebutuhan Rumah",
                "kotak",
                10_000,
                14_500,
                "NONE",
                0,
                28,
            ),
            (
                "SKU-013",
                "8999999003344",
                "Deterjen Rinso Anti Noda 770g",
                "Kebutuhan Rumah",
                "bungkus",
                19_500,
                25_000,
                "NONE",
                0,
                4, // Stok menipis (<= 5) untuk indikator peringatan stok
            ),
            (
                "SKU-014",
                "8999999004455",
                "Telur Ayam Negeri Isi 10 Butir",
                "Sembako",
                "pak",
                22_000,
                27_000,
                "NONE",
                0,
                3, // Stok menipis (<= 5)
            ),
            (
                "SKU-015",
                "8999999005566",
                "Galon Air Mineral Isi Ulang 19L",
                "Minuman",
                "galon",
                14_000,
                20_000,
                "NONE",
                0,
                0, // Stok = 0 untuk pengujian blokir keras stok habis
            ),
        ];

        for (sku, barcode, name, category, unit, cost, sell, disc_type, disc_val, stock) in
            sample_products
        {
            let prod_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO products (
                    id, sku, barcode, name, category_name, unit,
                    cost_price, selling_price, discount_type, discount_value,
                    stock, is_active, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?12)",
                params![
                    prod_id, sku, barcode, name, category, unit, cost, sell, disc_type, disc_val,
                    stock, now
                ],
            )?;

            if *stock > 0 {
                tx.execute(
                    "INSERT INTO stock_adjustments (
                        id, product_id, user_id, terminal_name, adjustment_type,
                        stock_before, quantity_delta, stock_after, note, created_at
                     ) VALUES (?1, ?2, ?3, ?4, 'RESTOCK', 0, ?5, ?5, 'Stok awal contoh minimarket', ?6)",
                    params![
                        Uuid::new_v4().to_string(),
                        prod_id,
                        admin_id,
                        terminal_name,
                        stock,
                        now
                    ],
                )?;
            }
        }

        Ok(())
    }

    pub fn get_store_settings(&self) -> AppResult<StoreSettings> {
        let conn = self.db.lock_conn()?;
        conn.query_row(
            "SELECT store_name, store_address, store_phone, receipt_footer, pairing_code, updated_at
             FROM store_settings WHERE id = 1",
            [],
            |r| {
                Ok(StoreSettings {
                    store_name: r.get(0)?,
                    store_address: r.get(1)?,
                    store_phone: r.get(2)?,
                    receipt_footer: r.get(3)?,
                    pairing_code: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            },
        )
        .map_err(|_| {
            AppError::NotFound(
                "Pengaturan toko belum diinisialisasi. Silakan jalankan Setup Wizard.".to_string(),
            )
        })
    }

    pub fn update_store_settings(
        &self,
        actor: &User,
        req: &UpdateStoreSettingsRequest,
    ) -> AppResult<StoreSettings> {
        Self::require_admin(actor)?;
        let store_name = req.store_name.trim();
        if store_name.is_empty() {
            return Err(AppError::Validation("Nama toko wajib diisi.".to_string()));
        }

        let now = Self::now_iso();
        let conn = self.db.lock_conn()?;
        if req.regenerate_pairing_code {
            let new_code = generate_pairing_code();
            conn.execute(
                "UPDATE store_settings
                 SET store_name = ?1, store_address = ?2, store_phone = ?3, receipt_footer = ?4,
                     pairing_code = ?5, updated_at = ?6
                 WHERE id = 1",
                params![
                    store_name,
                    req.store_address.trim(),
                    req.store_phone.trim(),
                    req.receipt_footer.trim(),
                    new_code,
                    now
                ],
            )?;
        } else {
            conn.execute(
                "UPDATE store_settings
                 SET store_name = ?1, store_address = ?2, store_phone = ?3, receipt_footer = ?4,
                     updated_at = ?5
                 WHERE id = 1",
                params![
                    store_name,
                    req.store_address.trim(),
                    req.store_phone.trim(),
                    req.receipt_footer.trim(),
                    now
                ],
            )?;
        }
        drop(conn);
        self.get_store_settings()
    }

    pub fn verify_pairing_code(&self, candidate_code: &str) -> AppResult<()> {
        let settings = self.get_store_settings()?;
        if settings.pairing_code.trim().eq_ignore_ascii_case(candidate_code.trim()) {
            Ok(())
        } else {
            Err(AppError::Unauthorized(
                "Pairing Code tidak sesuai dengan Server Terminal.".to_string(),
            ))
        }
    }

    pub fn health_check(&self, server_terminal_name: &str) -> AppResult<HealthCheckResponse> {
        let settings = self.get_store_settings()?;
        Ok(HealthCheckResponse {
            status: "OK".to_string(),
            store_name: settings.store_name,
            server_terminal_name: server_terminal_name.to_string(),
            server_time: Self::now_iso(),
        })
    }

    // ========================================================================
    // 2. Autentikasi, Sesi, Otorisasi Peran, & Manajemen User
    // ========================================================================

    pub fn require_admin(user: &User) -> AppResult<()> {
        if user.role != UserRole::ADMIN {
            return Err(AppError::Forbidden(
                "Akses ditolak: aksi ini hanya diizinkan untuk peran ADMIN.".to_string(),
            ));
        }
        Ok(())
    }

    fn validate_pin_format(pin: &str) -> AppResult<()> {
        let trimmed = pin.trim();
        if trimmed.len() < 4 || trimmed.len() > 6 || !trimmed.chars().all(|c| c.is_ascii_digit()) {
            return Err(AppError::Validation(
                "PIN Admin wajib terdiri dari 4 hingga 6 digit angka.".to_string(),
            ));
        }
        Ok(())
    }

    pub fn login(&self, req: &LoginRequest) -> AppResult<AuthSession> {
        let username = req.username.trim();
        if username.is_empty() || req.password.is_empty() {
            return Err(AppError::Validation(
                "Username dan password wajib diisi.".to_string(),
            ));
        }

        let conn = self.db.lock_conn()?;
        let row_opt = conn
            .query_row(
                "SELECT id, username, full_name, password_hash, pin_hash, role, is_active, created_at, updated_at
                 FROM users WHERE username = ?1 COLLATE NOCASE",
                params![username],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, i64>(6)? != 0,
                        r.get::<_, String>(7)?,
                        r.get::<_, String>(8)?,
                    ))
                },
            )
            .optional()?;
        drop(conn);

        let Some((
            id,
            db_username,
            full_name,
            password_hash,
            pin_hash,
            role_str,
            is_active,
            created_at,
            updated_at,
        )) = row_opt
        else {
            return Err(AppError::Unauthorized(
                "Username atau password salah.".to_string(),
            ));
        };

        if !verify_secret(&req.password, &password_hash) {
            return Err(AppError::Unauthorized(
                "Username atau password salah.".to_string(),
            ));
        }

        if !is_active {
            return Err(AppError::Forbidden(
                "Akun pengguna ini telah dinonaktifkan oleh Admin.".to_string(),
            ));
        }

        let role = UserRole::from_str(&role_str)?;
        let user = User {
            id,
            username: db_username,
            full_name,
            role,
            has_pin: pin_hash.is_some(),
            is_active,
            created_at,
            updated_at,
        };

        let session_token = self.sessions.create_session(user.clone())?;
        Ok(AuthSession {
            session_token,
            user,
        })
    }

    pub fn logout(&self, session_token: &str) -> AppResult<()> {
        self.sessions.remove_session(session_token)
    }

    pub fn validate_session(&self, session_token: &str) -> AppResult<User> {
        let session_user = self.sessions.get_session(session_token)?;
        // Pastikan status user masih aktif di database
        let conn = self.db.lock_conn()?;
        let active_role = conn
            .query_row(
                "SELECT role, is_active FROM users WHERE id = ?1",
                params![session_user.id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? != 0)),
            )
            .optional()?;
        drop(conn);

        match active_role {
            Some((role_str, true)) => {
                let mut refreshed = session_user;
                refreshed.role = UserRole::from_str(&role_str)?;
                Ok(refreshed)
            }
            _ => {
                let _ = self.sessions.remove_session(session_token);
                Err(AppError::Unauthorized(
                    "Akun sudah tidak aktif. Silakan login kembali.".to_string(),
                ))
            }
        }
    }

    /// Mencari user ADMIN aktif yang cocok dengan PIN yang diberikan (`FR-AUTH-04`).
    fn find_admin_by_pin_conn(conn: &Connection, admin_pin: &str) -> AppResult<User> {
        let pin = admin_pin.trim();
        if pin.is_empty() {
            return Err(AppError::Unauthorized(
                "PIN Admin wajib diisi untuk otorisasi.".to_string(),
            ));
        }

        let mut stmt = conn.prepare(
            "SELECT id, username, full_name, pin_hash, role, is_active, created_at, updated_at
             FROM users
             WHERE role = 'ADMIN' AND is_active = 1 AND pin_hash IS NOT NULL",
        )?;

        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)? != 0,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
            ))
        })?;

        for row_res in rows {
            let (id, username, full_name, pin_hash, role_str, is_active, created_at, updated_at) =
                row_res?;
            if verify_secret(pin, &pin_hash) {
                return Ok(User {
                    id,
                    username,
                    full_name,
                    role: UserRole::from_str(&role_str)?,
                    has_pin: true,
                    is_active,
                    created_at,
                    updated_at,
                });
            }
        }

        Err(AppError::Unauthorized(
            "PIN Admin tidak valid atau tidak terdaftar.".to_string(),
        ))
    }

    pub fn verify_admin_pin(&self, admin_pin: &str) -> AppResult<User> {
        let conn = self.db.lock_conn()?;
        Self::find_admin_by_pin_conn(&conn, admin_pin)
    }

    pub fn list_users(&self, actor: &User) -> AppResult<Vec<User>> {
        Self::require_admin(actor)?;
        let conn = self.db.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, username, full_name, pin_hash, role, is_active, created_at, updated_at
             FROM users
             ORDER BY role ASC, full_name COLLATE NOCASE ASC",
        )?;
        let users = stmt
            .query_map([], |r| {
                let role_str: String = r.get(4)?;
                Ok(User {
                    id: r.get(0)?,
                    username: r.get(1)?,
                    full_name: r.get(2)?,
                    has_pin: r.get::<_, Option<String>>(3)?.is_some(),
                    role: UserRole::from_str(&role_str).unwrap_or(UserRole::CASHIER),
                    is_active: r.get::<_, i64>(5)? != 0,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(users)
    }

    pub fn upsert_user(&self, actor: &User, req: &UpsertUserRequest) -> AppResult<User> {
        Self::require_admin(actor)?;
        let username = req.username.trim();
        let full_name = req.full_name.trim();
        if username.len() < 3 {
            return Err(AppError::Validation(
                "Username minimal 3 karakter.".to_string(),
            ));
        }
        if full_name.is_empty() {
            return Err(AppError::Validation(
                "Nama lengkap pengguna wajib diisi.".to_string(),
            ));
        }

        let now = Self::now_iso();
        let conn = self.db.lock_conn()?;

        let user_id = if let Some(existing_id) = &req.id {
            // Cegah menonaktifkan akun Admin terakhir
            if (!req.is_active || req.role != UserRole::ADMIN) && existing_id == &actor.id {
                return Err(AppError::Validation(
                    "Anda tidak dapat menonaktifkan atau menurunkan peran akun Admin yang sedang Anda gunakan.".to_string(),
                ));
            }

            let (curr_pwd_hash, curr_pin_hash): (String, Option<String>) = conn.query_row(
                "SELECT password_hash, pin_hash FROM users WHERE id = ?1",
                params![existing_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;

            let new_pwd_hash = match &req.password {
                Some(pwd) if !pwd.trim().is_empty() => {
                    if pwd.len() < 6 {
                        return Err(AppError::Validation(
                            "Password baru minimal 6 karakter.".to_string(),
                        ));
                    }
                    hash_secret(pwd)?
                }
                _ => curr_pwd_hash,
            };

            let new_pin_hash = match &req.pin {
                Some(pin) if !pin.trim().is_empty() => {
                    Self::validate_pin_format(pin)?;
                    Some(hash_secret(pin.trim())?)
                }
                _ => curr_pin_hash,
            };

            if req.role == UserRole::ADMIN && new_pin_hash.is_none() {
                return Err(AppError::Validation(
                    "Pengguna dengan peran ADMIN wajib memiliki PIN 4–6 digit.".to_string(),
                ));
            }

            conn.execute(
                "UPDATE users
                 SET username = ?1, full_name = ?2, password_hash = ?3, pin_hash = ?4,
                     role = ?5, is_active = ?6, updated_at = ?7
                 WHERE id = ?8",
                params![
                    username,
                    full_name,
                    new_pwd_hash,
                    new_pin_hash,
                    req.role.as_str(),
                    if req.is_active { 1 } else { 0 },
                    now,
                    existing_id
                ],
            )?;

            if !req.is_active {
                let _ = self.sessions.revoke_user_sessions(existing_id);
            }
            existing_id.clone()
        } else {
            let pwd = req.password.as_deref().unwrap_or("");
            if pwd.len() < 6 {
                return Err(AppError::Validation(
                    "Password pengguna baru minimal 6 karakter.".to_string(),
                ));
            }
            let password_hash = hash_secret(pwd)?;
            let pin_hash = match &req.pin {
                Some(pin) if !pin.trim().is_empty() => {
                    Self::validate_pin_format(pin)?;
                    Some(hash_secret(pin.trim())?)
                }
                _ => {
                    if req.role == UserRole::ADMIN {
                        return Err(AppError::Validation(
                            "Pengguna baru dengan peran ADMIN wajib memiliki PIN 4–6 digit."
                                .to_string(),
                        ));
                    }
                    None
                }
            };

            let new_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO users (id, username, full_name, password_hash, pin_hash, role, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                params![
                    new_id,
                    username,
                    full_name,
                    password_hash,
                    pin_hash,
                    req.role.as_str(),
                    if req.is_active { 1 } else { 0 },
                    now
                ],
            )?;
            new_id
        };

        conn.query_row(
            "SELECT id, username, full_name, pin_hash, role, is_active, created_at, updated_at
             FROM users WHERE id = ?1",
            params![user_id],
            |r| {
                let role_str: String = r.get(4)?;
                Ok(User {
                    id: r.get(0)?,
                    username: r.get(1)?,
                    full_name: r.get(2)?,
                    has_pin: r.get::<_, Option<String>>(3)?.is_some(),
                    role: UserRole::from_str(&role_str).unwrap_or(UserRole::CASHIER),
                    is_active: r.get::<_, i64>(5)? != 0,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            },
        )
        .map_err(Into::into)
    }

    // ========================================================================
    // 3. Katalog Produk (Product CRUD & Pencarian Cepat Barcode/SKU)
    // ========================================================================

    fn map_product_row(row: &Row<'_>, actor_role: UserRole) -> rusqlite::Result<Product> {
        let cost_price_raw: i64 = row.get(6)?;
        let selling_price: i64 = row.get(7)?;
        let disc_type_str: String = row.get(8)?;
        let discount_type = DiscountType::from_str(&disc_type_str).unwrap_or(DiscountType::NONE);
        let discount_value: i64 = row.get(9)?;
        let unit_discount_amount =
            calculate_unit_discount(selling_price, discount_type, discount_value).unwrap_or(0);
        let effective_unit_price = selling_price - unit_discount_amount;

        // Sensor cost_price untuk peran CASHIER sesuai FR-AUTH-02 & SYSTEM-DESIGN Tabel 4.1
        let cost_price = if actor_role == UserRole::ADMIN {
            cost_price_raw
        } else {
            0
        };

        Ok(Product {
            id: row.get(0)?,
            sku: row.get(1)?,
            barcode: row.get(2)?,
            name: row.get(3)?,
            category_name: row.get(4)?,
            unit: row.get(5)?,
            cost_price,
            selling_price,
            discount_type,
            discount_value,
            unit_discount_amount,
            effective_unit_price,
            stock: row.get(10)?,
            is_active: row.get::<_, i64>(11)? != 0,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    }

    pub fn list_products(&self, actor: &User, filter: &ProductFilter) -> AppResult<Vec<Product>> {
        let conn = self.db.lock_conn()?;
        let only_active = filter.only_active.unwrap_or(false);
        let search_pattern = filter
            .search
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .map(|s| format!("%{s}%"));
        let category_filter = filter
            .category
            .as_ref()
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty() && !c.eq_ignore_ascii_case("Semua"));

        let mut stmt = conn.prepare(
            "SELECT id, sku, barcode, name, category_name, unit, cost_price, selling_price,
                    discount_type, discount_value, stock, is_active, created_at, updated_at
             FROM products
             WHERE (?1 = 0 OR is_active = 1)
               AND (?2 IS NULL OR name LIKE ?2 COLLATE NOCASE OR sku LIKE ?2 COLLATE NOCASE OR barcode LIKE ?2 COLLATE NOCASE)
               AND (?3 IS NULL OR category_name = ?3 COLLATE NOCASE)
             ORDER BY is_active DESC, name COLLATE NOCASE ASC",
        )?;

        let rows = stmt
            .query_map(
                params![
                    if only_active { 1 } else { 0 },
                    search_pattern,
                    category_filter
                ],
                |r| Self::map_product_row(r, actor.role),
            )?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn find_product_by_code(&self, actor: &User, code: &str) -> AppResult<Product> {
        let trimmed = code.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(
                "Kode barcode atau SKU tidak boleh kosong.".to_string(),
            ));
        }

        let conn = self.db.lock_conn()?;
        conn.query_row(
            "SELECT id, sku, barcode, name, category_name, unit, cost_price, selling_price,
                    discount_type, discount_value, stock, is_active, created_at, updated_at
             FROM products
             WHERE is_active = 1 AND (barcode = ?1 COLLATE NOCASE OR sku = ?1 COLLATE NOCASE)
             LIMIT 1",
            params![trimmed],
            |r| Self::map_product_row(r, actor.role),
        )
        .map_err(|_| {
            AppError::NotFound(format!(
                "Produk dengan kode/barcode '{trimmed}' tidak ditemukan atau nonaktif."
            ))
        })
    }

    pub fn upsert_product(
        &self,
        actor: &User,
        terminal_name: &str,
        req: &UpsertProductRequest,
    ) -> AppResult<Product> {
        Self::require_admin(actor)?;
        let sku = req.sku.trim();
        let name = req.name.trim();
        if sku.is_empty() {
            return Err(AppError::Validation("SKU produk wajib diisi.".to_string()));
        }
        if name.is_empty() {
            return Err(AppError::Validation("Nama produk wajib diisi.".to_string()));
        }
        if req.cost_price < 0 || req.selling_price < 0 {
            return Err(AppError::Validation(
                "Harga modal dan harga jual tidak boleh bernilai negatif.".to_string(),
            ));
        }
        // Validasi rumus diskon BR-01
        let _ = calculate_unit_discount(req.selling_price, req.discount_type, req.discount_value)?;

        let barcode = req
            .barcode
            .as_ref()
            .map(|b| b.trim().to_string())
            .filter(|b| !b.is_empty());
        let category_name = if req.category_name.trim().is_empty() {
            "Umum".to_string()
        } else {
            req.category_name.trim().to_string()
        };
        let unit = if req.unit.trim().is_empty() {
            "pcs".to_string()
        } else {
            req.unit.trim().to_string()
        };
        let is_active = req.is_active.unwrap_or(true);
        let now = Self::now_iso();

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let product_id = if let Some(existing_id) = &req.id {
            tx.execute(
                "UPDATE products
                 SET sku = ?1, barcode = ?2, name = ?3, category_name = ?4, unit = ?5,
                     cost_price = ?6, selling_price = ?7, discount_type = ?8, discount_value = ?9,
                     is_active = ?10, updated_at = ?11
                 WHERE id = ?12",
                params![
                    sku,
                    barcode,
                    name,
                    category_name,
                    unit,
                    req.cost_price,
                    req.selling_price,
                    req.discount_type.as_str(),
                    req.discount_value,
                    if is_active { 1 } else { 0 },
                    now,
                    existing_id
                ],
            )?;
            existing_id.clone()
        } else {
            let initial_stock = req.initial_stock.unwrap_or(0);
            if initial_stock < 0 {
                return Err(AppError::Validation(
                    "Stok awal produk tidak boleh bernilai negatif.".to_string(),
                ));
            }
            let new_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO products (
                    id, sku, barcode, name, category_name, unit,
                    cost_price, selling_price, discount_type, discount_value,
                    stock, is_active, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)",
                params![
                    new_id,
                    sku,
                    barcode,
                    name,
                    category_name,
                    unit,
                    req.cost_price,
                    req.selling_price,
                    req.discount_type.as_str(),
                    req.discount_value,
                    initial_stock,
                    if is_active { 1 } else { 0 },
                    now
                ],
            )?;

            if initial_stock > 0 {
                tx.execute(
                    "INSERT INTO stock_adjustments (
                        id, product_id, user_id, terminal_name, adjustment_type,
                        stock_before, quantity_delta, stock_after, note, created_at
                     ) VALUES (?1, ?2, ?3, ?4, 'RESTOCK', 0, ?5, ?5, 'Stok awal produk baru', ?6)",
                    params![
                        Uuid::new_v4().to_string(),
                        new_id,
                        actor.id,
                        terminal_name,
                        initial_stock,
                        now
                    ],
                )?;
            }
            new_id
        };

        let product = tx.query_row(
            "SELECT id, sku, barcode, name, category_name, unit, cost_price, selling_price,
                    discount_type, discount_value, stock, is_active, created_at, updated_at
             FROM products WHERE id = ?1",
            params![product_id],
            |r| Self::map_product_row(r, actor.role),
        )?;

        tx.commit()?;
        Ok(product)
    }

    pub fn deactivate_product(&self, actor: &User, product_id: &str) -> AppResult<()> {
        Self::require_admin(actor)?;
        let now = Self::now_iso();
        let conn = self.db.lock_conn()?;
        let affected = conn.execute(
            "UPDATE products SET is_active = 0, updated_at = ?1 WHERE id = ?2",
            params![now, product_id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound("Produk tidak ditemukan.".to_string()));
        }
        Ok(())
    }

    // ========================================================================
    // 4. Penyesuaian Stok (`Stock Adjustment` — FR-INV-01..03)
    // ========================================================================

    pub fn create_stock_adjustment(
        &self,
        actor: &User,
        terminal_name: &str,
        req: &CreateStockAdjustmentRequest,
    ) -> AppResult<StockAdjustment> {
        Self::require_admin(actor)?;

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let (product_sku, product_name, stock_before): (String, String, i64) = tx
            .query_row(
                "SELECT sku, name, stock FROM products WHERE id = ?1",
                params![req.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|_| AppError::NotFound("Produk tidak ditemukan.".to_string()))?;

        let (quantity_delta, stock_after) = match req.adjustment_type {
            AdjustmentType::RESTOCK => {
                if req.quantity <= 0 {
                    return Err(AppError::Validation(
                        "Jumlah barang masuk (RESTOCK) harus lebih besar dari 0.".to_string(),
                    ));
                }
                (req.quantity, stock_before + req.quantity)
            }
            AdjustmentType::DAMAGE | AdjustmentType::LOSS => {
                if req.quantity <= 0 {
                    return Err(AppError::Validation(
                        "Jumlah pengurangan stok harus lebih besar dari 0.".to_string(),
                    ));
                }
                let after = stock_before - req.quantity;
                if after < 0 {
                    return Err(AppError::Validation(format!(
                        "Pengurangan stok ditolak karena menghasilkan stok minus (stok saat ini: {stock_before}, dikurangi: {}).",
                        req.quantity
                    )));
                }
                (-req.quantity, after)
            }
            AdjustmentType::CORRECTION => {
                if req.quantity < 0 {
                    return Err(AppError::Validation(
                        "Stok fisik aktual (CORRECTION) tidak boleh bernilai negatif.".to_string(),
                    ));
                }
                (req.quantity - stock_before, req.quantity)
            }
        };

        let now = Self::now_iso();
        tx.execute(
            "UPDATE products SET stock = ?1, updated_at = ?2 WHERE id = ?3",
            params![stock_after, now, req.product_id],
        )?;

        let adj_id = Uuid::new_v4().to_string();
        let note = req.note.trim().to_string();
        tx.execute(
            "INSERT INTO stock_adjustments (
                id, product_id, user_id, terminal_name, adjustment_type,
                stock_before, quantity_delta, stock_after, note, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                adj_id,
                req.product_id,
                actor.id,
                terminal_name,
                req.adjustment_type.as_str(),
                stock_before,
                quantity_delta,
                stock_after,
                note,
                now
            ],
        )?;

        tx.commit()?;

        Ok(StockAdjustment {
            id: adj_id,
            product_id: req.product_id.clone(),
            product_sku,
            product_name,
            user_id: actor.id.clone(),
            user_name: actor.full_name.clone(),
            terminal_name: terminal_name.to_string(),
            adjustment_type: req.adjustment_type,
            stock_before,
            quantity_delta,
            stock_after,
            note,
            created_at: now,
        })
    }

    pub fn list_stock_adjustments(
        &self,
        actor: &User,
        product_id: Option<&str>,
    ) -> AppResult<Vec<StockAdjustment>> {
        Self::require_admin(actor)?;
        let conn = self.db.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT sa.id, sa.product_id, p.sku, p.name, sa.user_id, u.full_name,
                    sa.terminal_name, sa.adjustment_type, sa.stock_before,
                    sa.quantity_delta, sa.stock_after, sa.note, sa.created_at
             FROM stock_adjustments sa
             JOIN products p ON p.id = sa.product_id
             JOIN users u ON u.id = sa.user_id
             WHERE (?1 IS NULL OR sa.product_id = ?1)
             ORDER BY sa.created_at DESC, sa.rowid DESC
             LIMIT 300",
        )?;

        let rows = stmt
            .query_map(params![product_id], |r| {
                let adj_type_str: String = r.get(7)?;
                Ok(StockAdjustment {
                    id: r.get(0)?,
                    product_id: r.get(1)?,
                    product_sku: r.get(2)?,
                    product_name: r.get(3)?,
                    user_id: r.get(4)?,
                    user_name: r.get(5)?,
                    terminal_name: r.get(6)?,
                    adjustment_type: AdjustmentType::from_str(&adj_type_str)
                        .unwrap_or(AdjustmentType::CORRECTION),
                    stock_before: r.get(8)?,
                    quantity_delta: r.get(9)?,
                    stock_after: r.get(10)?,
                    note: r.get(11)?,
                    created_at: r.get(12)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    // ========================================================================
    // 5. Transaksi Atomik `Sale` & `Void` (`FR-POS-05`, `FR-VOID-01..02`)
    // ========================================================================

    pub fn create_sale(
        &self,
        actor: &User,
        terminal_name: &str,
        req: &CreateSaleRequest,
    ) -> AppResult<ReceiptData> {
        if req.items.is_empty() {
            return Err(AppError::Validation(
                "Keranjang belanja masih kosong.".to_string(),
            ));
        }

        // Gabungkan item dengan product_id yang sama jika ada agar validasi stok akurat
        let mut merged_items: Vec<(String, i64)> = Vec::new();
        for item in &req.items {
            if item.quantity < 1 {
                return Err(AppError::Validation(
                    "Kuantitas setiap barang minimal 1.".to_string(),
                ));
            }
            if let Some(existing) = merged_items
                .iter_mut()
                .find(|(pid, _)| pid == &item.product_id)
            {
                existing.1 += item.quantity;
            } else {
                merged_items.push((item.product_id.clone(), item.quantity));
            }
        }

        let now = Self::now_iso();
        let today_date = Self::today_date_str();
        let today_compact = Self::today_compact_str();

        let mut conn = self.db.lock_conn()?;
        // Algoritma 5.1 SYSTEM-DESIGN: Buka transaksi dengan BEGIN IMMEDIATE
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let sale_id = Uuid::new_v4().to_string();
        let mut subtotal: i64 = 0;
        let mut discount_total: i64 = 0;
        let mut line_items: Vec<SaleLineItem> = Vec::with_capacity(merged_items.len());

        for (product_id, qty) in &merged_items {
            let row_opt = tx
                .query_row(
                    "SELECT id, sku, barcode, name, unit, cost_price, selling_price,
                            discount_type, discount_value, stock, is_active
                     FROM products WHERE id = ?1",
                    params![product_id],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, Option<String>>(2)?,
                            r.get::<_, String>(3)?,
                            r.get::<_, String>(4)?,
                            r.get::<_, i64>(5)?,
                            r.get::<_, i64>(6)?,
                            r.get::<_, String>(7)?,
                            r.get::<_, i64>(8)?,
                            r.get::<_, i64>(9)?,
                            r.get::<_, i64>(10)? != 0,
                        ))
                    },
                )
                .optional()?;

            let Some((
                pid,
                sku,
                barcode,
                name,
                unit,
                cost_price,
                selling_price,
                disc_type_str,
                discount_value,
                stock,
                is_active,
            )) = row_opt
            else {
                return Err(AppError::NotFound(format!(
                    "Produk dengan ID '{product_id}' tidak ditemukan."
                )));
            };

            if !is_active {
                return Err(AppError::Validation(format!(
                    "Produk '{name}' sudah tidak aktif."
                )));
            }

            if stock == 0 || stock < *qty {
                return Err(AppError::Conflict(format!(
                    "Stok {name} tidak mencukupi (tersisa: {stock} {unit}, diminta: {qty} {unit})."
                )));
            }

            let discount_type = DiscountType::from_str(&disc_type_str)?;
            let calc =
                calculate_line_item(cost_price, selling_price, discount_type, discount_value, *qty)?;

            tx.execute(
                "UPDATE products SET stock = stock - ?1, updated_at = ?2 WHERE id = ?3",
                params![qty, now, pid],
            )?;

            subtotal += calc.line_gross;
            discount_total += calc.line_discount;

            line_items.push(SaleLineItem {
                id: Uuid::new_v4().to_string(),
                sale_id: sale_id.clone(),
                product_id: pid,
                sku_snapshot: sku,
                barcode_snapshot: barcode,
                product_name_snapshot: name,
                unit_snapshot: unit,
                quantity: *qty,
                cost_price_snapshot: cost_price,
                selling_price_snapshot: selling_price,
                discount_type_snapshot: discount_type,
                discount_value_snapshot: discount_value,
                unit_discount_amount: calc.unit_discount_amount,
                subtotal: calc.line_subtotal,
            });
        }

        let total_amount = subtotal - discount_total;
        if req.cash_received < total_amount {
            return Err(AppError::Validation(format!(
                "Nominal tunai kurang (Total: Rp {total_amount}, Diterima: Rp {}).",
                req.cash_received
            )));
        }
        let change_amount = req.cash_received - total_amount;

        // Buat receipt_number berurutan: INV-YYYYMMDD-NNNN
        let today_seq: i64 = tx.query_row(
            "SELECT COUNT(*) FROM sales WHERE transaction_date = ?1",
            params![today_date],
            |r| r.get(0),
        )?;
        let receipt_number = format!("INV-{}-{:04}", today_compact, today_seq + 1);

        tx.execute(
            "INSERT INTO sales (
                id, receipt_number, cashier_id, cashier_name_snapshot, terminal_name,
                subtotal, discount_total, total_amount, cash_received, change_amount,
                status, transaction_date, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'COMPLETED', ?11, ?12)",
            params![
                sale_id,
                receipt_number,
                actor.id,
                actor.full_name,
                terminal_name,
                subtotal,
                discount_total,
                total_amount,
                req.cash_received,
                change_amount,
                today_date,
                now
            ],
        )?;

        for li in &line_items {
            tx.execute(
                "INSERT INTO sale_line_items (
                    id, sale_id, product_id, sku_snapshot, barcode_snapshot,
                    product_name_snapshot, unit_snapshot, quantity,
                    cost_price_snapshot, selling_price_snapshot,
                    discount_type_snapshot, discount_value_snapshot,
                    unit_discount_amount, subtotal
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    li.id,
                    li.sale_id,
                    li.product_id,
                    li.sku_snapshot,
                    li.barcode_snapshot,
                    li.product_name_snapshot,
                    li.unit_snapshot,
                    li.quantity,
                    li.cost_price_snapshot,
                    li.selling_price_snapshot,
                    li.discount_type_snapshot.as_str(),
                    li.discount_value_snapshot,
                    li.unit_discount_amount,
                    li.subtotal
                ],
            )?;
        }

        let (store_name, store_address, store_phone, receipt_footer): (
            String,
            String,
            String,
            String,
        ) = tx.query_row(
            "SELECT store_name, store_address, store_phone, receipt_footer
             FROM store_settings WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

        tx.commit()?;

        let sale = Sale {
            id: sale_id,
            receipt_number,
            cashier_id: actor.id.clone(),
            cashier_name_snapshot: actor.full_name.clone(),
            terminal_name: terminal_name.to_string(),
            subtotal,
            discount_total,
            total_amount,
            cash_received: req.cash_received,
            change_amount,
            status: SaleStatus::COMPLETED,
            voided_by_user_id: None,
            voided_by_name_snapshot: None,
            void_reason: None,
            voided_at: None,
            transaction_date: today_date,
            created_at: now,
        };

        Ok(ReceiptData {
            store_name,
            store_address,
            store_phone,
            receipt_footer,
            sale,
            items: line_items,
            is_reprint: false,
        })
    }

    fn map_sale_row(r: &Row<'_>) -> rusqlite::Result<Sale> {
        let status_str: String = r.get(10)?;
        Ok(Sale {
            id: r.get(0)?,
            receipt_number: r.get(1)?,
            cashier_id: r.get(2)?,
            cashier_name_snapshot: r.get(3)?,
            terminal_name: r.get(4)?,
            subtotal: r.get(5)?,
            discount_total: r.get(6)?,
            total_amount: r.get(7)?,
            cash_received: r.get(8)?,
            change_amount: r.get(9)?,
            status: SaleStatus::from_str(&status_str).unwrap_or(SaleStatus::COMPLETED),
            voided_by_user_id: r.get(11)?,
            voided_by_name_snapshot: r.get(12)?,
            void_reason: r.get(13)?,
            voided_at: r.get(14)?,
            transaction_date: r.get(15)?,
            created_at: r.get(16)?,
        })
    }

    fn fetch_line_items_for_sale(
        conn: &Connection,
        sale_id: &str,
        actor_role: UserRole,
    ) -> AppResult<Vec<SaleLineItem>> {
        let mut stmt = conn.prepare(
            "SELECT id, sale_id, product_id, sku_snapshot, barcode_snapshot,
                    product_name_snapshot, unit_snapshot, quantity,
                    cost_price_snapshot, selling_price_snapshot,
                    discount_type_snapshot, discount_value_snapshot,
                    unit_discount_amount, subtotal
             FROM sale_line_items
             WHERE sale_id = ?1
             ORDER BY rowid ASC",
        )?;

        let items = stmt
            .query_map(params![sale_id], |r| {
                let disc_type_str: String = r.get(10)?;
                let raw_cost: i64 = r.get(8)?;
                Ok(SaleLineItem {
                    id: r.get(0)?,
                    sale_id: r.get(1)?,
                    product_id: r.get(2)?,
                    sku_snapshot: r.get(3)?,
                    barcode_snapshot: r.get(4)?,
                    product_name_snapshot: r.get(5)?,
                    unit_snapshot: r.get(6)?,
                    quantity: r.get(7)?,
                    cost_price_snapshot: if actor_role == UserRole::ADMIN {
                        raw_cost
                    } else {
                        0
                    },
                    selling_price_snapshot: r.get(9)?,
                    discount_type_snapshot: DiscountType::from_str(&disc_type_str)
                        .unwrap_or(DiscountType::NONE),
                    discount_value_snapshot: r.get(11)?,
                    unit_discount_amount: r.get(12)?,
                    subtotal: r.get(13)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(items)
    }

    pub fn list_today_sales(&self, actor: &User) -> AppResult<Vec<SaleWithItems>> {
        let today = Self::today_date_str();
        let conn = self.db.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, receipt_number, cashier_id, cashier_name_snapshot, terminal_name,
                    subtotal, discount_total, total_amount, cash_received, change_amount,
                    status, voided_by_user_id, voided_by_name_snapshot, void_reason,
                    voided_at, transaction_date, created_at
             FROM sales
             WHERE transaction_date = ?1
             ORDER BY created_at DESC, rowid DESC",
        )?;

        let sales = stmt
            .query_map(params![today], Self::map_sale_row)?
            .collect::<Result<Vec<_>, _>>()?;

        let mut results = Vec::with_capacity(sales.len());
        for sale in sales {
            let items = Self::fetch_line_items_for_sale(&conn, &sale.id, actor.role)?;
            results.push(SaleWithItems { sale, items });
        }
        Ok(results)
    }

    pub fn get_sale_receipt(
        &self,
        actor: &User,
        sale_id: &str,
        is_reprint: bool,
    ) -> AppResult<ReceiptData> {
        let conn = self.db.lock_conn()?;
        let sale = conn
            .query_row(
                "SELECT id, receipt_number, cashier_id, cashier_name_snapshot, terminal_name,
                        subtotal, discount_total, total_amount, cash_received, change_amount,
                        status, voided_by_user_id, voided_by_name_snapshot, void_reason,
                        voided_at, transaction_date, created_at
                 FROM sales WHERE id = ?1",
                params![sale_id],
                Self::map_sale_row,
            )
            .map_err(|_| AppError::NotFound("Transaksi tidak ditemukan.".to_string()))?;

        let items = Self::fetch_line_items_for_sale(&conn, &sale.id, actor.role)?;
        let (store_name, store_address, store_phone, receipt_footer): (
            String,
            String,
            String,
            String,
        ) = conn.query_row(
            "SELECT store_name, store_address, store_phone, receipt_footer
             FROM store_settings WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

        Ok(ReceiptData {
            store_name,
            store_address,
            store_phone,
            receipt_footer,
            sale,
            items,
            is_reprint,
        })
    }

    /// Algoritma 5.2 SYSTEM-DESIGN: Pembatalan transaksi (`Void`) hari ini dengan verifikasi PIN Admin.
    pub fn void_sale(&self, actor: &User, req: &VoidSaleRequest) -> AppResult<SaleWithItems> {
        let reason = req.void_reason.trim();
        if reason.is_empty() {
            return Err(AppError::Validation(
                "Alasan pembatalan (Void) wajib diisi.".to_string(),
            ));
        }

        let today = Self::today_date_str();
        let now = Self::now_iso();

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let admin_user = Self::find_admin_by_pin_conn(&tx, &req.admin_pin)?;

        let (status_str, transaction_date): (String, String) = tx
            .query_row(
                "SELECT status, transaction_date FROM sales WHERE id = ?1",
                params![req.sale_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| AppError::NotFound("Transaksi tidak ditemukan.".to_string()))?;

        if status_str == "VOIDED" {
            return Err(AppError::Conflict(
                "Transaksi ini sudah pernah dibatalkan (VOIDED) sebelumnya.".to_string(),
            ));
        }

        if transaction_date != today {
            return Err(AppError::Validation(
                "Hanya transaksi pada hari ini yang dapat dibatalkan (Void).".to_string(),
            ));
        }

        let line_items: Vec<(String, i64)> = {
            let mut stmt = tx.prepare(
                "SELECT product_id, quantity FROM sale_line_items WHERE sale_id = ?1",
            )?;
            let mapped = stmt
                .query_map(params![req.sale_id], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            mapped
        };

        for (product_id, qty) in line_items {
            tx.execute(
                "UPDATE products SET stock = stock + ?1, updated_at = ?2 WHERE id = ?3",
                params![qty, now, product_id],
            )?;
        }

        tx.execute(
            "UPDATE sales
             SET status = 'VOIDED', voided_by_user_id = ?1, voided_by_name_snapshot = ?2,
                 void_reason = ?3, voided_at = ?4
             WHERE id = ?5",
            params![
                admin_user.id,
                admin_user.full_name,
                reason,
                now,
                req.sale_id
            ],
        )?;

        tx.commit()?;
        drop(conn);

        let conn = self.db.lock_conn()?;
        let sale = conn.query_row(
            "SELECT id, receipt_number, cashier_id, cashier_name_snapshot, terminal_name,
                    subtotal, discount_total, total_amount, cash_received, change_amount,
                    status, voided_by_user_id, voided_by_name_snapshot, void_reason,
                    voided_at, transaction_date, created_at
             FROM sales WHERE id = ?1",
            params![req.sale_id],
            Self::map_sale_row,
        )?;
        let items = Self::fetch_line_items_for_sale(&conn, &sale.id, actor.role)?;
        Ok(SaleWithItems { sale, items })
    }

    // ========================================================================
    // 6. Tahan Pesanan (`Held Bill` — Tidak Mengunci Stok)
    // ========================================================================

    pub fn create_held_bill(
        &self,
        actor: &User,
        terminal_name: &str,
        req: &CreateHeldBillRequest,
    ) -> AppResult<HeldBill> {
        if req.items.is_empty() {
            return Err(AppError::Validation(
                "Keranjang yang akan ditahan harus memiliki minimal 1 barang.".to_string(),
            ));
        }

        let mut merged_items: Vec<(String, i64)> = Vec::new();
        for item in &req.items {
            if item.quantity < 1 {
                return Err(AppError::Validation(
                    "Kuantitas barang minimal 1.".to_string(),
                ));
            }
            if let Some(existing) = merged_items
                .iter_mut()
                .find(|(pid, _)| pid == &item.product_id)
            {
                existing.1 += item.quantity;
            } else {
                merged_items.push((item.product_id.clone(), item.quantity));
            }
        }

        let now = Self::now_iso();
        let held_bill_id = Uuid::new_v4().to_string();
        let hold_label = if req.hold_label.trim().is_empty() {
            format!("Pesanan {}", Local::now().format("%H:%M:%S"))
        } else {
            req.hold_label.trim().to_string()
        };

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        tx.execute(
            "INSERT INTO held_bills (id, hold_label, cashier_id, cashier_name, terminal_name, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                held_bill_id,
                hold_label,
                actor.id,
                actor.full_name,
                terminal_name,
                now
            ],
        )?;

        for (product_id, qty) in &merged_items {
            let exists: i64 = tx.query_row(
                "SELECT COUNT(*) FROM products WHERE id = ?1",
                params![product_id],
                |r| r.get(0),
            )?;
            if exists == 0 {
                return Err(AppError::NotFound(format!(
                    "Produk dengan ID '{product_id}' tidak ditemukan."
                )));
            }
            tx.execute(
                "INSERT INTO held_bill_items (id, held_bill_id, product_id, quantity)
                 VALUES (?1, ?2, ?3, ?4)",
                params![Uuid::new_v4().to_string(), held_bill_id, product_id, qty],
            )?;
        }

        tx.commit()?;
        drop(conn);

        let conn = self.db.lock_conn()?;
        Self::fetch_held_bill_by_id(&conn, &held_bill_id)
    }

    fn fetch_held_bill_by_id(conn: &Connection, held_bill_id: &str) -> AppResult<HeldBill> {
        let (id, hold_label, cashier_id, cashier_name, terminal_name, created_at): (
            String,
            String,
            String,
            String,
            String,
            String,
        ) = conn
            .query_row(
                "SELECT id, hold_label, cashier_id, cashier_name, terminal_name, created_at
                 FROM held_bills WHERE id = ?1",
                params![held_bill_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                    ))
                },
            )
            .map_err(|_| AppError::NotFound("Held Bill tidak ditemukan.".to_string()))?;

        let mut stmt = conn.prepare(
            "SELECT hbi.id, hbi.product_id, p.sku, p.barcode, p.name, p.unit,
                    p.selling_price, p.discount_type, p.discount_value,
                    hbi.quantity, p.stock, p.is_active
             FROM held_bill_items hbi
             JOIN products p ON p.id = hbi.product_id
             WHERE hbi.held_bill_id = ?1
             ORDER BY hbi.rowid ASC",
        )?;

        let items = stmt
            .query_map(params![held_bill_id], |r| {
                let selling_price: i64 = r.get(6)?;
                let disc_type_str: String = r.get(7)?;
                let discount_type =
                    DiscountType::from_str(&disc_type_str).unwrap_or(DiscountType::NONE);
                let discount_value: i64 = r.get(8)?;
                let unit_discount_amount =
                    calculate_unit_discount(selling_price, discount_type, discount_value)
                        .unwrap_or(0);
                let effective_unit_price =
                    calculate_effective_unit_price(selling_price, discount_type, discount_value)
                        .unwrap_or(selling_price);
                let quantity: i64 = r.get(9)?;
                let current_stock: i64 = r.get(10)?;
                let is_active = r.get::<_, i64>(11)? != 0;

                Ok(HeldBillItemDetail {
                    id: r.get(0)?,
                    product_id: r.get(1)?,
                    sku: r.get(2)?,
                    barcode: r.get(3)?,
                    product_name: r.get(4)?,
                    unit: r.get(5)?,
                    selling_price,
                    discount_type,
                    discount_value,
                    unit_discount_amount,
                    effective_unit_price,
                    quantity,
                    current_stock,
                    is_active,
                    stock_sufficient: is_active && current_stock >= quantity,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let estimated_total: i64 = items
            .iter()
            .map(|i| i.effective_unit_price * i.quantity)
            .sum();

        Ok(HeldBill {
            id,
            hold_label,
            cashier_id,
            cashier_name,
            terminal_name,
            created_at,
            items,
            estimated_total,
        })
    }

    pub fn list_held_bills(&self) -> AppResult<Vec<HeldBill>> {
        let conn = self.db.lock_conn()?;
        let ids: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT id FROM held_bills ORDER BY created_at DESC, rowid DESC",
            )?;
            let mapped = stmt
                .query_map([], |r| r.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            mapped
        };

        let mut list = Vec::with_capacity(ids.len());
        for id in ids {
            list.push(Self::fetch_held_bill_by_id(&conn, &id)?);
        }
        Ok(list)
    }

    pub fn consume_held_bill(&self, held_bill_id: &str) -> AppResult<RecalledHeldBill> {
        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let held_bill = Self::fetch_held_bill_by_id(&tx, held_bill_id)?;
        let mut warnings = Vec::new();
        for item in &held_bill.items {
            if !item.is_active {
                warnings.push(format!(
                    "Produk '{}' kini telah dinonaktifkan oleh Admin.",
                    item.product_name
                ));
            } else if item.current_stock == 0 {
                warnings.push(format!(
                    "Stok '{}' kini sudah habis (0 {}).",
                    item.product_name, item.unit
                ));
            } else if item.current_stock < item.quantity {
                warnings.push(format!(
                    "Stok '{}' tersisa {} {} (kurang dari {} {} yang ditahan).",
                    item.product_name,
                    item.current_stock,
                    item.unit,
                    item.quantity,
                    item.unit
                ));
            }
        }

        tx.execute("DELETE FROM held_bills WHERE id = ?1", params![held_bill_id])?;
        tx.commit()?;

        Ok(RecalledHeldBill {
            held_bill,
            warnings,
        })
    }

    pub fn delete_held_bill(&self, held_bill_id: &str) -> AppResult<()> {
        let conn = self.db.lock_conn()?;
        let affected = conn.execute(
            "DELETE FROM held_bills WHERE id = ?1",
            params![held_bill_id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound("Held Bill tidak ditemukan.".to_string()));
        }
        Ok(())
    }

    // ========================================================================
    // 7. Laporan Penjualan & Laba Kotor (`get_sales_report` — Invarian #4)
    // ========================================================================

    pub fn get_sales_report(
        &self,
        actor: &User,
        filter: &SalesReportFilter,
    ) -> AppResult<SalesReport> {
        Self::require_admin(actor)?;

        let start_date = if filter.start_date.trim().is_empty() {
            Self::today_date_str()
        } else {
            filter.start_date.trim().to_string()
        };
        let end_date = if filter.end_date.trim().is_empty() {
            Self::today_date_str()
        } else {
            filter.end_date.trim().to_string()
        };
        let cashier_filter = filter
            .cashier_id
            .as_ref()
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty() && !c.eq_ignore_ascii_case("ALL"));
        let terminal_filter = filter
            .terminal_name
            .as_ref()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty() && !t.eq_ignore_ascii_case("ALL"));

        let conn = self.db.lock_conn()?;

        // 1. Hitung jumlah transaksi COMPLETED & VOIDED
        let (completed_sales_count, voided_sales_count): (i64, i64) = conn.query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'VOIDED' THEN 1 ELSE 0 END), 0)
             FROM sales
             WHERE transaction_date >= ?1 AND transaction_date <= ?2
               AND (?3 IS NULL OR cashier_id = ?3)
               AND (?4 IS NULL OR terminal_name = ?4)",
            params![start_date, end_date, cashier_filter, terminal_filter],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;

        // 2. Hitung Omzet Kotor, Diskon, Omzet Bersih, dan HPP murni dari kolom *_snapshot pada sale_line_items
        let (gross_sales, total_discount, net_sales, total_cogs): (i64, i64, i64, i64) = conn
            .query_row(
                "SELECT
                    COALESCE(SUM(sli.selling_price_snapshot * sli.quantity), 0),
                    COALESCE(SUM(sli.unit_discount_amount * sli.quantity), 0),
                    COALESCE(SUM(sli.subtotal), 0),
                    COALESCE(SUM(sli.cost_price_snapshot * sli.quantity), 0)
                 FROM sale_line_items sli
                 JOIN sales s ON s.id = sli.sale_id
                 WHERE s.status = 'COMPLETED'
                   AND s.transaction_date >= ?1 AND s.transaction_date <= ?2
                   AND (?3 IS NULL OR s.cashier_id = ?3)
                   AND (?4 IS NULL OR s.terminal_name = ?4)",
                params![start_date, end_date, cashier_filter, terminal_filter],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?;

        let gross_profit = net_sales - total_cogs;

        // 3. Produk terlaris berdasarkan kuantitas & laba kotor dari snapshot
        let mut top_stmt = conn.prepare(
            "SELECT
                sli.product_id,
                sli.sku_snapshot,
                sli.product_name_snapshot,
                sli.unit_snapshot,
                COALESCE(SUM(sli.quantity), 0) AS total_qty,
                COALESCE(SUM(sli.subtotal), 0) AS net_rev,
                COALESCE(SUM(sli.cost_price_snapshot * sli.quantity), 0) AS total_cost
             FROM sale_line_items sli
             JOIN sales s ON s.id = sli.sale_id
             WHERE s.status = 'COMPLETED'
               AND s.transaction_date >= ?1 AND s.transaction_date <= ?2
               AND (?3 IS NULL OR s.cashier_id = ?3)
               AND (?4 IS NULL OR s.terminal_name = ?4)
             GROUP BY sli.product_id, sli.sku_snapshot, sli.product_name_snapshot, sli.unit_snapshot
             ORDER BY total_qty DESC, net_rev DESC
             LIMIT 20",
        )?;

        let top_products = top_stmt
            .query_map(
                params![start_date, end_date, cashier_filter, terminal_filter],
                |r| {
                    let net_revenue: i64 = r.get(5)?;
                    let total_cost: i64 = r.get(6)?;
                    Ok(TopProductRow {
                        product_id: r.get(0)?,
                        sku: r.get(1)?,
                        product_name: r.get(2)?,
                        unit: r.get(3)?,
                        total_qty_sold: r.get(4)?,
                        net_revenue,
                        total_cost,
                        gross_profit: net_revenue - total_cost,
                    })
                },
            )?
            .collect::<Result<Vec<_>, _>>()?;

        // 4. Produk stok habis / menipis (stock <= 5 dan aktif)
        let mut low_stmt = conn.prepare(
            "SELECT id, sku, barcode, name, category_name, unit, stock
             FROM products
             WHERE is_active = 1 AND stock <= 5
             ORDER BY stock ASC, name COLLATE NOCASE ASC",
        )?;
        let low_stock_products = low_stmt
            .query_map([], |r| {
                Ok(LowStockProductRow {
                    product_id: r.get(0)?,
                    sku: r.get(1)?,
                    barcode: r.get(2)?,
                    product_name: r.get(3)?,
                    category_name: r.get(4)?,
                    unit: r.get(5)?,
                    stock: r.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // 5. Daftar rincian transaksi pada periode terpilih
        let mut sales_stmt = conn.prepare(
            "SELECT id, receipt_number, cashier_id, cashier_name_snapshot, terminal_name,
                    subtotal, discount_total, total_amount, cash_received, change_amount,
                    status, voided_by_user_id, voided_by_name_snapshot, void_reason,
                    voided_at, transaction_date, created_at
             FROM sales
             WHERE transaction_date >= ?1 AND transaction_date <= ?2
               AND (?3 IS NULL OR cashier_id = ?3)
               AND (?4 IS NULL OR terminal_name = ?4)
             ORDER BY created_at DESC, rowid DESC",
        )?;

        let sale_rows = sales_stmt
            .query_map(
                params![start_date, end_date, cashier_filter, terminal_filter],
                Self::map_sale_row,
            )?
            .collect::<Result<Vec<_>, _>>()?;

        let mut sales = Vec::with_capacity(sale_rows.len());
        for sale in sale_rows {
            let items = Self::fetch_line_items_for_sale(&conn, &sale.id, actor.role)?;
            sales.push(SaleWithItems { sale, items });
        }

        Ok(SalesReport {
            start_date,
            end_date,
            completed_sales_count,
            voided_sales_count,
            gross_sales,
            total_discount,
            net_sales,
            total_cogs,
            gross_profit,
            top_products,
            low_stock_products,
            sales,
        })
    }

    // ========================================================================
    // 8. Backup (`VACUUM INTO`) & Restore Database SQLite (`FR-SYS-01`)
    // ========================================================================

    pub fn backup_database(&self, actor: &User, target_path: &Path) -> AppResult<String> {
        Self::require_admin(actor)?;
        if let Some(parent) = target_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if target_path.exists() {
            std::fs::remove_file(target_path)?;
        }
        let target_str = target_path.to_string_lossy().to_string();
        let conn = self.db.lock_conn()?;
        conn.execute("VACUUM INTO ?1", params![target_str])?;
        Ok(target_str)
    }

    pub fn restore_database(&self, actor: &User, source_path: &Path) -> AppResult<()> {
        Self::require_admin(actor)?;
        if !source_path.exists() {
            return Err(AppError::NotFound(
                "File cadangan database tidak ditemukan.".to_string(),
            ));
        }

        // Validasi terlebih dahulu bahwa source_path adalah file SQLite POS-Kasir yang sah
        {
            let src_conn = Connection::open(source_path)?;
            let store_count: i64 = src_conn
                .query_row("SELECT COUNT(*) FROM store_settings", [], |r| r.get(0))
                .map_err(|_| {
                    AppError::Validation(
                        "File yang dipilih bukan database cadangan POS-Kasir yang valid."
                            .to_string(),
                    )
                })?;
            if store_count == 0 {
                return Err(AppError::Validation(
                    "Database cadangan kosong atau belum terinisialisasi.".to_string(),
                ));
            }
        }

        let source_str = source_path.to_string_lossy().to_string();
        let mut conn = self.db.lock_conn()?;
        conn.execute("ATTACH DATABASE ?1 AS backup_src", params![source_str])?;

        let restore_result = (|| -> AppResult<()> {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            tx.execute_batch(
                "PRAGMA foreign_keys = OFF;
                 DELETE FROM held_bill_items;
                 DELETE FROM held_bills;
                 DELETE FROM sale_line_items;
                 DELETE FROM sales;
                 DELETE FROM stock_adjustments;
                 DELETE FROM products;
                 DELETE FROM users;
                 DELETE FROM store_settings;

                 INSERT INTO store_settings SELECT * FROM backup_src.store_settings;
                 INSERT INTO users SELECT * FROM backup_src.users;
                 INSERT INTO products SELECT * FROM backup_src.products;
                 INSERT INTO stock_adjustments SELECT * FROM backup_src.stock_adjustments;
                 INSERT INTO sales SELECT * FROM backup_src.sales;
                 INSERT INTO sale_line_items SELECT * FROM backup_src.sale_line_items;
                 INSERT INTO held_bills SELECT * FROM backup_src.held_bills;
                 INSERT INTO held_bill_items SELECT * FROM backup_src.held_bill_items;
                 PRAGMA foreign_keys = ON;",
            )?;
            tx.commit()?;
            Ok(())
        })();

        let _ = conn.execute("DETACH DATABASE backup_src", []);
        restore_result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{HeldBillItemInput, SaleItemInput};

    fn create_test_service() -> (CoreService, User) {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let service = CoreService::new(db);
        service
            .setup_server(&SetupServerRequest {
                store_name: "Toko Maju Jaya".to_string(),
                store_address: "Jl. Merdeka No. 10".to_string(),
                store_phone: "08123456789".to_string(),
                terminal_name: "Kasir Server".to_string(),
                admin_username: "admin".to_string(),
                admin_full_name: "Budi Admin".to_string(),
                admin_password: "password123".to_string(),
                admin_pin: "123456".to_string(),
                seed_sample_data: false,
            })
            .unwrap();

        let session = service
            .login(&LoginRequest {
                username: "admin".to_string(),
                password: "password123".to_string(),
            })
            .unwrap();

        (service, session.user)
    }

    #[test]
    fn test_sale_deducts_stock_and_rejects_insufficient_stock_atomically() {
        let (service, admin) = create_test_service();

        let p1 = service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: None,
                    sku: "IND-01".to_string(),
                    barcode: Some("8991001".to_string()),
                    name: "Indomie Goreng".to_string(),
                    category_name: "Makanan".to_string(),
                    unit: "bungkus".to_string(),
                    cost_price: 2_500,
                    selling_price: 3_500,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(5),
                    is_active: Some(true),
                },
            )
            .unwrap();

        let p2 = service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: None,
                    sku: "AQU-01".to_string(),
                    barcode: Some("8992002".to_string()),
                    name: "Aqua 600ml".to_string(),
                    category_name: "Minuman".to_string(),
                    unit: "botol".to_string(),
                    cost_price: 2_400,
                    selling_price: 4_000,
                    discount_type: DiscountType::NOMINAL,
                    discount_value: 500,
                    initial_stock: Some(2),
                    is_active: Some(true),
                },
            )
            .unwrap();

        // 1. Transaksi sukses: 2 Indomie (7.000) + 2 Aqua (7.000 setelah diskon 500/botol) = 14.000
        let receipt = service
            .create_sale(
                &admin,
                "Kasir 1",
                &CreateSaleRequest {
                    items: vec![
                        SaleItemInput {
                            product_id: p1.id.clone(),
                            quantity: 2,
                        },
                        SaleItemInput {
                            product_id: p2.id.clone(),
                            quantity: 2,
                        },
                    ],
                    cash_received: 20_000,
                },
            )
            .unwrap();

        assert_eq!(receipt.sale.subtotal, 15_000);
        assert_eq!(receipt.sale.discount_total, 1_000);
        assert_eq!(receipt.sale.total_amount, 14_000);
        assert_eq!(receipt.sale.change_amount, 6_000);
        assert!(receipt.sale.receipt_number.starts_with("INV-"));
        assert!(receipt.sale.receipt_number.ends_with("-0001"));

        // Stok Indomie harus menjadi 3, stok Aqua harus menjadi 0
        let updated_p1 = service.find_product_by_code(&admin, "8991001").unwrap();
        let updated_p2 = service.find_product_by_code(&admin, "8992002").unwrap();
        assert_eq!(updated_p1.stock, 3);
        assert_eq!(updated_p2.stock, 0);

        // 2. Transaksi kedua gagal karena Aqua sudah stok 0 -> harus atomic rollback (stok Indomie tetap 3!)
        let failed = service.create_sale(
            &admin,
            "Kasir 1",
            &CreateSaleRequest {
                items: vec![
                    SaleItemInput {
                        product_id: p1.id.clone(),
                        quantity: 1,
                    },
                    SaleItemInput {
                        product_id: p2.id.clone(),
                        quantity: 1,
                    },
                ],
                cash_received: 10_000,
            },
        );
        assert!(failed.is_err());

        let after_rollback_p1 = service.find_product_by_code(&admin, "8991001").unwrap();
        assert_eq!(after_rollback_p1.stock, 3);
    }

    #[test]
    fn test_immutable_price_snapshot_in_sales_report() {
        let (service, admin) = create_test_service();

        let prod = service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: None,
                    sku: "KOPI-01".to_string(),
                    barcode: Some("8993003".to_string()),
                    name: "Kopi Kapal Api".to_string(),
                    category_name: "Minuman".to_string(),
                    unit: "pak".to_string(),
                    cost_price: 10_000,
                    selling_price: 15_000,
                    discount_type: DiscountType::PERCENT,
                    discount_value: 10, // Diskon 1.500 -> Harga bersih 13.500, laba 3.500/pak
                    initial_stock: Some(10),
                    is_active: Some(true),
                },
            )
            .unwrap();

        // Jual 2 pak: Gross = 30.000, Diskon = 3.000, Net = 27.000, HPP = 20.000, Laba Kotor = 7.000
        service
            .create_sale(
                &admin,
                "Kasir 1",
                &CreateSaleRequest {
                    items: vec![SaleItemInput {
                        product_id: prod.id.clone(),
                        quantity: 2,
                    }],
                    cash_received: 30_000,
                },
            )
            .unwrap();

        // Admin mengubah harga modal menjadi 20.000 dan harga jual menjadi 25.000 tanpa diskon
        service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: Some(prod.id.clone()),
                    sku: "KOPI-01".to_string(),
                    barcode: Some("8993003".to_string()),
                    name: "Kopi Kapal Api".to_string(),
                    category_name: "Minuman".to_string(),
                    unit: "pak".to_string(),
                    cost_price: 20_000,
                    selling_price: 25_000,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: None,
                    is_active: Some(true),
                },
            )
            .unwrap();

        // Laporan penjualan wajib tetap menggunakan angka snapshot saat transaksi terjadi!
        let report = service
            .get_sales_report(&admin, &SalesReportFilter::default())
            .unwrap();
        assert_eq!(report.completed_sales_count, 1);
        assert_eq!(report.gross_sales, 30_000);
        assert_eq!(report.total_discount, 3_000);
        assert_eq!(report.net_sales, 27_000);
        assert_eq!(report.total_cogs, 20_000);
        assert_eq!(report.gross_profit, 7_000);
    }

    #[test]
    fn test_held_bill_does_not_lock_stock_and_warns_on_recall() {
        let (service, admin) = create_test_service();

        let prod = service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: None,
                    sku: "MINYAK-01".to_string(),
                    barcode: Some("8994004".to_string()),
                    name: "Minyak Goreng 2L".to_string(),
                    category_name: "Sembako".to_string(),
                    unit: "pouch".to_string(),
                    cost_price: 30_000,
                    selling_price: 36_000,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(3),
                    is_active: Some(true),
                },
            )
            .unwrap();

        // Tahan keranjang berisi 2 pouch Minyak Goreng
        let held = service
            .create_held_bill(
                &admin,
                "Kasir 1",
                &CreateHeldBillRequest {
                    hold_label: "Ibu Ani Ambil Dompet".to_string(),
                    items: vec![HeldBillItemInput {
                        product_id: prod.id.clone(),
                        quantity: 2,
                    }],
                },
            )
            .unwrap();

        // Stok produk TIDAK berkurang saat Held Bill dibuat (tetap 3)
        let check_prod = service.find_product_by_code(&admin, "8994004").unwrap();
        assert_eq!(check_prod.stock, 3);

        // Pembeli lain membeli 2 pouch sehingga stok tersisa 1
        service
            .create_sale(
                &admin,
                "Kasir 2",
                &CreateSaleRequest {
                    items: vec![SaleItemInput {
                        product_id: prod.id.clone(),
                        quantity: 2,
                    }],
                    cash_received: 72_000,
                },
            )
            .unwrap();

        // Saat Held Bill Ibu Ani dipanggil kembali, sistem mendeteksi stok kini sisa 1 (< 2)
        let recalled = service.consume_held_bill(&held.id).unwrap();
        assert_eq!(recalled.held_bill.items[0].current_stock, 1);
        assert!(!recalled.held_bill.items[0].stock_sufficient);
        assert_eq!(recalled.warnings.len(), 1);
        assert!(service.list_held_bills().unwrap().is_empty());
    }

    #[test]
    fn test_void_sale_with_admin_pin_and_stock_restoration() {
        let (service, admin) = create_test_service();

        let prod = service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: None,
                    sku: "GULA-01".to_string(),
                    barcode: Some("8995005".to_string()),
                    name: "Gula Pasir 1kg".to_string(),
                    category_name: "Sembako".to_string(),
                    unit: "bungkus".to_string(),
                    cost_price: 14_000,
                    selling_price: 18_000,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(10),
                    is_active: Some(true),
                },
            )
            .unwrap();

        let receipt = service
            .create_sale(
                &admin,
                "Kasir 1",
                &CreateSaleRequest {
                    items: vec![SaleItemInput {
                        product_id: prod.id.clone(),
                        quantity: 4,
                    }],
                    cash_received: 80_000,
                },
            )
            .unwrap();

        assert_eq!(
            service.find_product_by_code(&admin, "8995005").unwrap().stock,
            6
        );

        // 1. Gagal Void jika PIN Admin salah
        let wrong_pin = service.void_sale(
            &admin,
            &VoidSaleRequest {
                sale_id: receipt.sale.id.clone(),
                admin_pin: "999999".to_string(),
                void_reason: "Salah input jumlah".to_string(),
            },
        );
        assert!(wrong_pin.is_err());
        assert_eq!(
            service.find_product_by_code(&admin, "8995005").unwrap().stock,
            6
        );

        // 2. Sukses Void dengan PIN Admin benar ("123456") -> stok kembali menjadi 10
        let voided = service
            .void_sale(
                &admin,
                &VoidSaleRequest {
                    sale_id: receipt.sale.id.clone(),
                    admin_pin: "123456".to_string(),
                    void_reason: "Pembeli batal beli".to_string(),
                },
            )
            .unwrap();

        assert_eq!(voided.sale.status, SaleStatus::VOIDED);
        assert_eq!(
            voided.sale.voided_by_name_snapshot.as_deref(),
            Some("Budi Admin")
        );
        assert_eq!(
            service.find_product_by_code(&admin, "8995005").unwrap().stock,
            10
        );

        // 3. Omzet bersih di laporan menjadi 0 dan voided_sales_count = 1
        let report = service
            .get_sales_report(&admin, &SalesReportFilter::default())
            .unwrap();
        assert_eq!(report.completed_sales_count, 0);
        assert_eq!(report.voided_sales_count, 1);
        assert_eq!(report.net_sales, 0);
        assert_eq!(report.gross_profit, 0);
    }

    #[test]
    fn test_stock_adjustments_and_negative_stock_prevention() {
        let (service, admin) = create_test_service();

        let prod = service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: None,
                    sku: "ADJ-01".to_string(),
                    barcode: Some("8996006".to_string()),
                    name: "Teh Botol Kotak".to_string(),
                    category_name: "Minuman".to_string(),
                    unit: "kotak".to_string(),
                    cost_price: 3_000,
                    selling_price: 4_500,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(10),
                    is_active: Some(true),
                },
            )
            .unwrap();

        // 1. RESTOCK +15 -> stok menjadi 25
        let restock = service
            .create_stock_adjustment(
                &admin,
                "Kasir 1",
                &CreateStockAdjustmentRequest {
                    product_id: prod.id.clone(),
                    adjustment_type: AdjustmentType::RESTOCK,
                    quantity: 15,
                    note: "Kiriman distributor".to_string(),
                },
            )
            .unwrap();
        assert_eq!(restock.stock_before, 10);
        assert_eq!(restock.quantity_delta, 15);
        assert_eq!(restock.stock_after, 25);

        // 2. DAMAGE -30 (melebihi stok 25) -> wajib ditolak!
        let invalid_damage = service.create_stock_adjustment(
            &admin,
            "Kasir 1",
            &CreateStockAdjustmentRequest {
                product_id: prod.id.clone(),
                adjustment_type: AdjustmentType::DAMAGE,
                quantity: 30,
                note: "Kemasan penyok".to_string(),
            },
        );
        assert!(invalid_damage.is_err());

        // 3. DAMAGE -5 -> stok menjadi 20
        let valid_damage = service
            .create_stock_adjustment(
                &admin,
                "Kasir 1",
                &CreateStockAdjustmentRequest {
                    product_id: prod.id.clone(),
                    adjustment_type: AdjustmentType::DAMAGE,
                    quantity: 5,
                    note: "Kemasan rusak".to_string(),
                },
            )
            .unwrap();
        assert_eq!(valid_damage.stock_after, 20);

        // 4. CORRECTION ke 18 -> quantity_delta = -2, stock_after = 18
        let correction = service
            .create_stock_adjustment(
                &admin,
                "Kasir 1",
                &CreateStockAdjustmentRequest {
                    product_id: prod.id.clone(),
                    adjustment_type: AdjustmentType::CORRECTION,
                    quantity: 18,
                    note: "Stok opname bulanan".to_string(),
                },
            )
            .unwrap();
        assert_eq!(correction.quantity_delta, -2);
        assert_eq!(correction.stock_after, 18);

        let logs = service
            .list_stock_adjustments(&admin, Some(&prod.id))
            .unwrap();
        // 1 initial_stock + 3 manual adjustments = 4 log entries
        assert_eq!(logs.len(), 4);
    }
}
