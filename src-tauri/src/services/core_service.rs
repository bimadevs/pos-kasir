use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::services::permissions::{require_permission, role_has, Permission};
use crate::models::{
    calculate_effective_unit_price, calculate_line_item_with_tiers, calculate_unit_discount,
    AdjustmentType, ApproveStockAdjustmentRequest, AuditLog, AuthSession, CashMovement,
    CashMovementRequest, CashierShift, CategoryProfitRow, CloseShiftRequest,
    CommitOpnameSessionRequest, CreateHeldBillRequest, CreateOpnameSessionRequest, CreateSaleRequest,
    CreateStockAdjustmentRequest, DailyFinancialSummary, DiscountType, FinancialReport,
    HealthCheckResponse, HeldBill, HeldBillItemDetail, LoginRequest, LowStockProductRow,
    OpnameSessionDetail, OpenShiftRequest, Product, ProductFilter, ProductPriceTier, ProfitReport,
    RecalledHeldBill, ReceiptData, RecordOpnameScanRequest, RejectStockAdjustmentRequest, Sale,
    SaleLineItem, SaleStatus, SaleWithItems, SalesReport, SalesReportFilter, SetPriceTiersRequest,
    SetupServerRequest, ShiftReportData, StockAdjustment, StockAdjustmentRequest,
    StockAdjustmentResult, StockMovementSummary, StockOpnameItem, StockOpnameSession, StockReport,
    StockValuationItem, StoreSettings, TopProductRow, UpdateOpnameItemQtyRequest,
    UpdateStoreSettingsRequest, UpsertProductRequest, UpsertUserRequest, User, UserRole,
    VoidSaleRequest,
};
use crate::services::auth_service::{
    generate_pairing_code, hash_secret, now_unix_ts, verify_secret, SessionStore,
    SESSION_TTL_SECONDS,
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
            "INSERT INTO store_settings (id, store_name, store_address, store_phone, receipt_footer, pairing_code, stock_approval_amount_threshold, stock_approval_percent_threshold, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, 100000, 10, ?6)",
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
            "SELECT store_name, store_address, store_phone, receipt_footer, pairing_code,
                    stock_approval_amount_threshold, stock_approval_percent_threshold, updated_at
             FROM store_settings WHERE id = 1",
            [],
            |r| {
                Ok(StoreSettings {
                    store_name: r.get(0)?,
                    store_address: r.get(1)?,
                    store_phone: r.get(2)?,
                    receipt_footer: r.get(3)?,
                    pairing_code: r.get(4)?,
                    stock_approval_amount_threshold: r.get(5)?,
                    stock_approval_percent_threshold: r.get(6)?,
                    updated_at: r.get(7)?,
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
        require_permission(actor, Permission::ManageStoreSettings)?;
        let store_name = req.store_name.trim();
        if store_name.is_empty() {
            return Err(AppError::Validation("Nama toko wajib diisi.".to_string()));
        }

        let current = self.get_store_settings()?;
        let thresh_amt = req
            .stock_approval_amount_threshold
            .unwrap_or(current.stock_approval_amount_threshold);
        if thresh_amt < 0 {
            return Err(AppError::Validation(
                "Ambang batas nominal persetujuan stok tidak boleh negatif.".to_string(),
            ));
        }

        let thresh_pct = req
            .stock_approval_percent_threshold
            .unwrap_or(current.stock_approval_percent_threshold);
        if thresh_pct < 0 || thresh_pct > 100 {
            return Err(AppError::Validation(
                "Ambang batas persentase persetujuan stok harus antara 0% dan 100%.".to_string(),
            ));
        }

        let now = Self::now_iso();
        let conn = self.db.lock_conn()?;
        if req.regenerate_pairing_code {
            let new_code = generate_pairing_code();
            conn.execute(
                "UPDATE store_settings
                 SET store_name = ?1, store_address = ?2, store_phone = ?3, receipt_footer = ?4,
                     pairing_code = ?5, stock_approval_amount_threshold = ?6,
                     stock_approval_percent_threshold = ?7, updated_at = ?8
                 WHERE id = 1",
                params![
                    store_name,
                    req.store_address.trim(),
                    req.store_phone.trim(),
                    req.receipt_footer.trim(),
                    new_code,
                    thresh_amt,
                    thresh_pct,
                    now
                ],
            )?;
        } else {
            conn.execute(
                "UPDATE store_settings
                 SET store_name = ?1, store_address = ?2, store_phone = ?3, receipt_footer = ?4,
                     stock_approval_amount_threshold = ?5, stock_approval_percent_threshold = ?6,
                     updated_at = ?7
                 WHERE id = 1",
                params![
                    store_name,
                    req.store_address.trim(),
                    req.store_phone.trim(),
                    req.receipt_footer.trim(),
                    thresh_amt,
                    thresh_pct,
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

        let (session_token, expires_at) = self.sessions.create_session(user.clone())?;
        let now_ts = now_unix_ts();
        let now_iso = Self::now_iso();
        {
            let conn = self.db.lock_conn()?;
            let _ = conn.execute(
                "DELETE FROM user_sessions WHERE expires_at <= ?1",
                params![now_ts],
            );
            conn.execute(
                "INSERT OR REPLACE INTO user_sessions (token, user_id, expires_at, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)",
                params![session_token, user.id, expires_at, now_iso],
            )?;
        }

        Ok(AuthSession {
            session_token,
            user,
        })
    }

    pub fn logout(&self, session_token: &str) -> AppResult<()> {
        let _ = self.sessions.remove_session(session_token);
        let conn = self.db.lock_conn()?;
        let _ = conn.execute(
            "DELETE FROM user_sessions WHERE token = ?1",
            params![session_token],
        );
        Ok(())
    }

    pub fn validate_session(&self, session_token: &str) -> AppResult<User> {
        let now_ts = now_unix_ts();
        let new_expires_at = now_ts + SESSION_TTL_SECONDS;
        let now_iso = Self::now_iso();

        let conn = self.db.lock_conn()?;
        let row_opt = conn
            .query_row(
                "SELECT s.expires_at, u.id, u.username, u.full_name, u.pin_hash, u.role, u.is_active, u.created_at, u.updated_at
                 FROM user_sessions s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.token = ?1",
                params![session_token],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, Option<String>>(4)?.is_some(),
                        r.get::<_, String>(5)?,
                        r.get::<_, i64>(6)? != 0,
                        r.get::<_, String>(7)?,
                        r.get::<_, String>(8)?,
                    ))
                },
            )
            .optional()?;

        let Some((
            expires_at,
            id,
            username,
            full_name,
            has_pin,
            role_str,
            is_active,
            created_at,
            updated_at,
        )) = row_opt
        else {
            drop(conn);
            let _ = self.sessions.remove_session(session_token);
            return Err(AppError::Unauthorized(
                "Sesi tidak valid atau telah berakhir. Silakan login kembali.".to_string(),
            ));
        };

        if expires_at <= now_ts {
            let _ = conn.execute(
                "DELETE FROM user_sessions WHERE token = ?1",
                params![session_token],
            );
            drop(conn);
            let _ = self.sessions.remove_session(session_token);
            return Err(AppError::Unauthorized(
                "Sesi tidak valid atau telah berakhir. Silakan login kembali.".to_string(),
            ));
        }

        if !is_active {
            let _ = conn.execute(
                "DELETE FROM user_sessions WHERE user_id = ?1",
                params![id],
            );
            drop(conn);
            let _ = self.sessions.revoke_user_sessions(&id);
            return Err(AppError::Unauthorized(
                "Akun sudah tidak aktif. Silakan login kembali.".to_string(),
            ));
        }

        // Perpanjang masa berlaku sesi otomatis selama aktif (Sliding Window 1 Jam)
        if new_expires_at - expires_at >= 15 {
            let _ = conn.execute(
                "UPDATE user_sessions SET expires_at = ?1, updated_at = ?2 WHERE token = ?3",
                params![new_expires_at, now_iso, session_token],
            );
        }
        drop(conn);

        let user = User {
            id,
            username,
            full_name,
            role: UserRole::from_str(&role_str)?,
            has_pin,
            is_active,
            created_at,
            updated_at,
        };
        let _ = self.sessions.insert_with_expiry(
            session_token.to_string(),
            user.clone(),
            new_expires_at,
        );
        Ok(user)
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
        require_permission(actor, Permission::ManageUsers)?;
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
        require_permission(actor, Permission::ManageUsers)?;
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
                let _ = conn.execute(
                    "DELETE FROM user_sessions WHERE user_id = ?1",
                    params![existing_id],
                );
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

        // Sensor cost_price untuk peran selain yang berhak (hanya ADMIN, STOCK, REPORTER yang boleh lihat)
        let cost_price = if role_has(actor_role, Permission::ViewCostPrice) {
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
            price_tiers: None,
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
        require_permission(actor, Permission::ManageProducts)?;
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
            // Jika aktor tidak memiliki izin ManageProductPrices (misal STOCK), pertahankan harga jual & diskon yang ada
            let (effective_selling_price, effective_disc_type, effective_disc_val) =
                if !role_has(actor.role, Permission::ManageProductPrices) {
                    tx.query_row(
                        "SELECT selling_price, discount_type, discount_value FROM products WHERE id = ?1",
                        params![existing_id],
                        |r| {
                            let dt_str: String = r.get(1)?;
                            Ok((
                                r.get::<_, i64>(0)?,
                                dt_str,
                                r.get::<_, i64>(2)?,
                            ))
                        },
                    )?
                } else {
                    (req.selling_price, req.discount_type.as_str().to_string(), req.discount_value)
                };

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
                    effective_selling_price,
                    effective_disc_type,
                    effective_disc_val,
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

        if let Some(tiers) = &req.price_tiers {
            tx.execute(
                "DELETE FROM product_price_tiers WHERE product_id = ?1",
                params![product_id],
            )?;
            for tier in tiers {
                if tier.min_quantity < 2 {
                    return Err(AppError::Validation(
                        "Kuantitas minimum harga grosir harus minimal 2 unit.".to_string(),
                    ));
                }
                if tier.tier_price < 0 {
                    return Err(AppError::Validation(
                        "Harga grosir tier tidak boleh bernilai negatif.".to_string(),
                    ));
                }
                if tier.tier_price >= req.selling_price {
                    return Err(AppError::Validation(
                        "Harga grosir tier harus lebih murah dari harga jual satuan reguler.".to_string(),
                    ));
                }
                tx.execute(
                    "INSERT INTO product_price_tiers (id, product_id, min_quantity, tier_price, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        Uuid::new_v4().to_string(),
                        product_id,
                        tier.min_quantity,
                        tier.tier_price,
                        now,
                        now
                    ],
                )?;
            }
        }

        let mut product = tx.query_row(
            "SELECT id, sku, barcode, name, category_name, unit, cost_price, selling_price,
                    discount_type, discount_value, stock, is_active, created_at, updated_at
             FROM products WHERE id = ?1",
            params![product_id],
            |r| Self::map_product_row(r, actor.role),
        )?;

        let loaded_tiers = {
            let mut tiers_stmt = tx.prepare(
                "SELECT id, product_id, min_quantity, tier_price, created_at, updated_at
                 FROM product_price_tiers WHERE product_id = ?1 ORDER BY min_quantity ASC",
            )?;
            tiers_stmt
                .query_map(params![product_id], |r| {
                    Ok(ProductPriceTier {
                        id: r.get(0)?,
                        product_id: r.get(1)?,
                        min_quantity: r.get(2)?,
                        tier_price: r.get(3)?,
                        created_at: r.get(4)?,
                        updated_at: r.get(5)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?
        };

        product.price_tiers = Some(loaded_tiers);

        tx.commit()?;
        Ok(product)
    }

    pub fn get_product_price_tiers(&self, product_id: &str) -> AppResult<Vec<ProductPriceTier>> {
        let conn = self.db.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, product_id, min_quantity, tier_price, created_at, updated_at
             FROM product_price_tiers WHERE product_id = ?1 ORDER BY min_quantity ASC",
        )?;
        let rows = stmt
            .query_map(params![product_id], |r| {
                Ok(ProductPriceTier {
                    id: r.get(0)?,
                    product_id: r.get(1)?,
                    min_quantity: r.get(2)?,
                    tier_price: r.get(3)?,
                    created_at: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn set_product_price_tiers(
        &self,
        actor: &User,
        req: &SetPriceTiersRequest,
    ) -> AppResult<Vec<ProductPriceTier>> {
        require_permission(actor, Permission::ManageProductPrices)?;
        let now = Self::now_iso();
        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        // Pastikan produk ada dan ambil harga jual serta harga modalnya (HPP)
        let (selling_price, cost_price): (i64, i64) = tx
            .query_row(
                "SELECT selling_price, cost_price FROM products WHERE id = ?1",
                params![req.product_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| AppError::NotFound("Produk tidak ditemukan.".to_string()))?;

        tx.execute(
            "DELETE FROM product_price_tiers WHERE product_id = ?1",
            params![req.product_id],
        )?;

        for tier in &req.tiers {
            if tier.min_quantity < 2 {
                return Err(AppError::Validation(
                    "Kuantitas minimum tier harus minimal 2 unit.".to_string(),
                ));
            }
            if tier.tier_price < 0 {
                return Err(AppError::Validation(
                    "Harga grosir tier tidak boleh bernilai negatif.".to_string(),
                ));
            }
            if tier.tier_price < cost_price {
                return Err(AppError::Validation(format!(
                    "Harga grosir tier (Rp {}) tidak boleh lebih rendah dari harga modal/HPP (Rp {}).",
                    tier.tier_price, cost_price
                )));
            }
            if tier.tier_price >= selling_price {
                return Err(AppError::Validation(
                    "Harga grosir tier harus lebih murah dari harga jual satuan reguler.".to_string(),
                ));
            }
            tx.execute(
                "INSERT INTO product_price_tiers (id, product_id, min_quantity, tier_price, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    Uuid::new_v4().to_string(),
                    req.product_id,
                    tier.min_quantity,
                    tier.tier_price,
                    now,
                    now
                ],
            )?;
        }

        let rows = {
            let mut stmt = tx.prepare(
                "SELECT id, product_id, min_quantity, tier_price, created_at, updated_at
                 FROM product_price_tiers WHERE product_id = ?1 ORDER BY min_quantity ASC",
            )?;
            stmt.query_map(params![req.product_id], |r| {
                Ok(ProductPriceTier {
                    id: r.get(0)?,
                    product_id: r.get(1)?,
                    min_quantity: r.get(2)?,
                    tier_price: r.get(3)?,
                    created_at: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };

        tx.commit()?;
        Ok(rows)
    }

    pub fn deactivate_product(&self, actor: &User, product_id: &str) -> AppResult<()> {
        require_permission(actor, Permission::ManageProducts)?;
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
    // 4. Penyesuaian Stok (`Stock Adjustment` — FR-INV-01..05) & Audit Log
    // ========================================================================

    pub fn record_audit_log_conn(
        conn: &Connection,
        actor_id: &str,
        action: &str,
        entity_name: &str,
        entity_id: Option<&str>,
        old_value_json: Option<&str>,
        new_value_json: Option<&str>,
        notes: Option<&str>,
        created_at: &str,
    ) -> rusqlite::Result<()> {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO audit_logs (
                id, actor_id, action, entity_name, entity_id,
                old_value_json, new_value_json, notes, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                actor_id,
                action,
                entity_name,
                entity_id,
                old_value_json,
                new_value_json,
                notes,
                created_at
            ],
        )?;
        Ok(())
    }

    pub fn create_stock_adjustment(
        &self,
        actor: &User,
        terminal_name: &str,
        req: &CreateStockAdjustmentRequest,
    ) -> AppResult<StockAdjustmentResult> {
        require_permission(actor, Permission::AdjustStock)?;

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let (product_sku, product_name, stock_before, cost_price): (String, String, i64, i64) = tx
            .query_row(
                "SELECT sku, name, stock, cost_price FROM products WHERE id = ?1",
                params![req.product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
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
        let note = req.note.trim().to_string();

        // Evaluasi ambang batas persetujuan jika diinput oleh Petugas Stok (STOCK) sesuai FR-INV-04
        let is_stock_keeper = actor.role == UserRole::STOCK;
        let discrepancy_qty = quantity_delta.abs();
        let total_estimated_value = discrepancy_qty * cost_price;
        let discrepancy_percent = if stock_before > 0 {
            (discrepancy_qty * 100) / stock_before
        } else {
            100
        };

        let (threshold_amt, threshold_pct): (i64, i64) = tx
            .query_row(
                "SELECT stock_approval_amount_threshold, stock_approval_percent_threshold FROM store_settings WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap_or((100_000, 10));

        let requires_approval = is_stock_keeper
            && (total_estimated_value >= threshold_amt || discrepancy_percent >= threshold_pct);

        if requires_approval {
            let req_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO stock_adjustment_requests (
                    id, product_id, adjustment_type, quantity_delta, cost_price_at_request,
                    reason, status, requested_by, terminal_name, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'PENDING', ?7, ?8, ?9)",
                params![
                    req_id,
                    req.product_id,
                    req.adjustment_type.as_str(),
                    quantity_delta,
                    cost_price,
                    note,
                    actor.id,
                    terminal_name,
                    now
                ],
            )?;

            Self::record_audit_log_conn(
                &tx,
                &actor.id,
                "STOCK_ADJUSTMENT_REQUESTED",
                "products",
                Some(&req.product_id),
                None,
                Some(&format!(
                    "{{\"quantity_delta\": {}, \"cost_price\": {}, \"total_value\": {}, \"discrepancy_percent\": {}}}",
                    quantity_delta, cost_price, total_estimated_value, discrepancy_percent
                )),
                Some(&note),
                &now,
            )?;

            tx.commit()?;

            return Ok(StockAdjustmentResult::PendingApproval {
                request: StockAdjustmentRequest {
                    id: req_id,
                    product_id: req.product_id.clone(),
                    product_sku,
                    product_name,
                    adjustment_type: req.adjustment_type,
                    quantity_delta,
                    cost_price_at_request: cost_price,
                    total_estimated_value,
                    discrepancy_percent,
                    reason: note,
                    status: "PENDING".to_string(),
                    requested_by: actor.id.clone(),
                    requested_by_name: actor.full_name.clone(),
                    terminal_name: terminal_name.to_string(),
                    approved_by: None,
                    approved_by_name: None,
                    rejection_reason: None,
                    created_at: now,
                    resolved_at: None,
                },
            });
        }

        // Eksekusi langsung jika Admin atau di bawah ambang batas
        tx.execute(
            "UPDATE products SET stock = ?1, updated_at = ?2 WHERE id = ?3",
            params![stock_after, now, req.product_id],
        )?;

        let adj_id = Uuid::new_v4().to_string();
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

        Self::record_audit_log_conn(
            &tx,
            &actor.id,
            "STOCK_ADJUSTMENT_EXECUTED",
            "products",
            Some(&req.product_id),
            Some(&format!("{{\"stock_before\": {stock_before}}}")),
            Some(&format!(
                "{{\"stock_after\": {stock_after}, \"delta\": {quantity_delta}}}"
            )),
            Some(&note),
            &now,
        )?;

        tx.commit()?;

        Ok(StockAdjustmentResult::Executed {
            adjustment: StockAdjustment {
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
            },
        })
    }

    pub fn list_stock_adjustment_requests(
        &self,
        actor: &User,
        status_filter: Option<&str>,
    ) -> AppResult<Vec<StockAdjustmentRequest>> {
        require_permission(actor, Permission::AdjustStock)?;
        let conn = self.db.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT sar.id, sar.product_id, p.sku, p.name, sar.adjustment_type,
                    sar.quantity_delta, sar.cost_price_at_request, sar.reason, sar.status,
                    sar.requested_by, u_req.full_name, sar.terminal_name,
                    sar.approved_by, u_app.full_name, sar.rejection_reason,
                    sar.created_at, sar.resolved_at, p.stock
             FROM stock_adjustment_requests sar
             JOIN products p ON p.id = sar.product_id
             JOIN users u_req ON u_req.id = sar.requested_by
             LEFT JOIN users u_app ON u_app.id = sar.approved_by
             WHERE (?1 IS NULL OR sar.status = ?1)
             ORDER BY sar.created_at DESC, sar.rowid DESC",
        )?;

        let rows = stmt
            .query_map(params![status_filter], |r| {
                let adj_type_str: String = r.get(4)?;
                let qty_delta: i64 = r.get(5)?;
                let cost_price: i64 = r.get(6)?;
                let current_stock: i64 = r.get(17)?;
                let disc_qty = qty_delta.abs();
                let total_estimated_value = disc_qty * cost_price;
                let discrepancy_percent = if current_stock > 0 {
                    (disc_qty * 100) / current_stock
                } else {
                    100
                };

                Ok(StockAdjustmentRequest {
                    id: r.get(0)?,
                    product_id: r.get(1)?,
                    product_sku: r.get(2)?,
                    product_name: r.get(3)?,
                    adjustment_type: AdjustmentType::from_str(&adj_type_str)
                        .unwrap_or(AdjustmentType::CORRECTION),
                    quantity_delta: qty_delta,
                    cost_price_at_request: cost_price,
                    total_estimated_value,
                    discrepancy_percent,
                    reason: r.get(7)?,
                    status: r.get(8)?,
                    requested_by: r.get(9)?,
                    requested_by_name: r.get(10)?,
                    terminal_name: r.get(11)?,
                    approved_by: r.get(12)?,
                    approved_by_name: r.get(13)?,
                    rejection_reason: r.get(14)?,
                    created_at: r.get(15)?,
                    resolved_at: r.get(16)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn approve_stock_adjustment_request(
        &self,
        actor: &User,
        req: &ApproveStockAdjustmentRequest,
    ) -> AppResult<StockAdjustment> {
        require_permission(actor, Permission::ApproveStockAdjustment)?;

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let admin_user = Self::find_admin_by_pin_conn(&tx, &req.admin_pin)?;
        let now = Self::now_iso();

        let (product_id, adj_type_str, qty_delta, reason, status, terminal_name): (
            String, String, i64, String, String, String,
        ) = tx
            .query_row(
                "SELECT product_id, adjustment_type, quantity_delta, reason, status, terminal_name
                 FROM stock_adjustment_requests WHERE id = ?1",
                params![req.request_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .map_err(|_| AppError::NotFound("Pengajuan penyesuaian stok tidak ditemukan.".to_string()))?;

        if status != "PENDING" {
            return Err(AppError::Conflict(format!(
                "Pengajuan penyesuaian stok ini tidak berstatus PENDING (status saat ini: {status})."
            )));
        }

        let (product_sku, product_name, stock_before): (String, String, i64) = tx
            .query_row(
                "SELECT sku, name, stock FROM products WHERE id = ?1",
                params![product_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?;

        let stock_after = stock_before + qty_delta;
        if stock_after < 0 {
            return Err(AppError::Validation(format!(
                "Persetujuan ditolak karena menghasilkan stok minus (stok saat ini: {stock_before}, perubahan: {qty_delta})."
            )));
        }

        tx.execute(
            "UPDATE products SET stock = ?1, updated_at = ?2 WHERE id = ?3",
            params![stock_after, now, product_id],
        )?;

        let adj_id = Uuid::new_v4().to_string();
        let adj_type = AdjustmentType::from_str(&adj_type_str).unwrap_or(AdjustmentType::CORRECTION);
        tx.execute(
            "INSERT INTO stock_adjustments (
                id, product_id, user_id, terminal_name, adjustment_type,
                stock_before, quantity_delta, stock_after, note, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                adj_id,
                product_id,
                actor.id,
                terminal_name,
                adj_type.as_str(),
                stock_before,
                qty_delta,
                stock_after,
                format!("(Disetujui Admin: {}) {}", admin_user.username, reason),
                now
            ],
        )?;

        tx.execute(
            "UPDATE stock_adjustment_requests
             SET status = 'APPROVED', approved_by = ?1, resolved_at = ?2
             WHERE id = ?3",
            params![admin_user.id, now, req.request_id],
        )?;

        Self::record_audit_log_conn(
            &tx,
            &admin_user.id,
            "STOCK_ADJUSTMENT_APPROVED",
            "stock_adjustment_requests",
            Some(&req.request_id),
            Some("PENDING"),
            Some("APPROVED"),
            Some(&format!("Disetujui oleh admin @{}", admin_user.username)),
            &now,
        )?;

        tx.commit()?;

        Ok(StockAdjustment {
            id: adj_id,
            product_id,
            product_sku,
            product_name,
            user_id: admin_user.id,
            user_name: admin_user.full_name,
            terminal_name,
            adjustment_type: adj_type,
            stock_before,
            quantity_delta: qty_delta,
            stock_after,
            note: reason,
            created_at: now,
        })
    }

    pub fn reject_stock_adjustment_request(
        &self,
        actor: &User,
        req: &RejectStockAdjustmentRequest,
    ) -> AppResult<()> {
        require_permission(actor, Permission::ApproveStockAdjustment)?;

        let rejection_reason = req.rejection_reason.trim();
        if rejection_reason.is_empty() {
            return Err(AppError::Validation(
                "Alasan penolakan pengajuan stok wajib diisi.".to_string(),
            ));
        }

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let admin_user = Self::find_admin_by_pin_conn(&tx, &req.admin_pin)?;
        let now = Self::now_iso();

        let status: String = tx
            .query_row(
                "SELECT status FROM stock_adjustment_requests WHERE id = ?1",
                params![req.request_id],
                |r| r.get(0),
            )
            .map_err(|_| AppError::NotFound("Pengajuan penyesuaian stok tidak ditemukan.".to_string()))?;

        if status != "PENDING" {
            return Err(AppError::Conflict(format!(
                "Pengajuan penyesuaian stok ini tidak berstatus PENDING (status saat ini: {status})."
            )));
        }

        tx.execute(
            "UPDATE stock_adjustment_requests
             SET status = 'REJECTED', approved_by = ?1, rejection_reason = ?2, resolved_at = ?3
             WHERE id = ?4",
            params![admin_user.id, rejection_reason, now, req.request_id],
        )?;

        Self::record_audit_log_conn(
            &tx,
            &admin_user.id,
            "STOCK_ADJUSTMENT_REJECTED",
            "stock_adjustment_requests",
            Some(&req.request_id),
            Some("PENDING"),
            Some("REJECTED"),
            Some(rejection_reason),
            &now,
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn list_audit_logs(
        &self,
        actor: &User,
        entity_name: Option<&str>,
        limit: Option<i64>,
    ) -> AppResult<Vec<AuditLog>> {
        require_permission(actor, Permission::ManageStoreSettings)?;
        let conn = self.db.lock_conn()?;
        let limit_val = limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(
            "SELECT a.id, a.actor_id, u.full_name, a.action, a.entity_name,
                    a.entity_id, a.old_value_json, a.new_value_json, a.notes, a.created_at
             FROM audit_logs a
             JOIN users u ON u.id = a.actor_id
             WHERE (?1 IS NULL OR a.entity_name = ?1)
             ORDER BY a.created_at DESC, a.rowid DESC
             LIMIT ?2",
        )?;

        let rows = stmt
            .query_map(params![entity_name, limit_val], |r| {
                Ok(AuditLog {
                    id: r.get(0)?,
                    actor_id: r.get(1)?,
                    actor_name: r.get(2)?,
                    action: r.get(3)?,
                    entity_name: r.get(4)?,
                    entity_id: r.get(5)?,
                    old_value_json: r.get(6)?,
                    new_value_json: r.get(7)?,
                    notes: r.get(8)?,
                    created_at: r.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn list_stock_adjustments(
        &self,
        actor: &User,
        product_id: Option<&str>,
    ) -> AppResult<Vec<StockAdjustment>> {
        require_permission(actor, Permission::ViewStockReport)?;
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
        require_permission(actor, Permission::AccessPos)?;
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

        let active_shift_id: Option<String> = {
            let by_cashier: Option<String> = tx
                .query_row(
                    "SELECT id FROM cashier_shifts WHERE cashier_id = ?1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
                    params![actor.id],
                    |r| r.get(0),
                )
                .optional()?;
            if by_cashier.is_some() {
                by_cashier
            } else if !terminal_name.trim().is_empty() {
                tx.query_row(
                    "SELECT id FROM cashier_shifts WHERE terminal_name = ?1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
                    params![terminal_name.trim()],
                    |r| r.get(0),
                )
                .optional()?
            } else {
                None
            }
        };

        if actor.role == UserRole::CASHIER && active_shift_id.is_none() {
            return Err(AppError::Validation(
                "Kasir wajib membuka shift kasir terlebih dahulu sebelum melayani transaksi.".to_string(),
            ));
        }

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

            let is_in_active_opname: bool = tx.query_row(
                "SELECT COUNT(*) FROM stock_opname_items soi
                 JOIN stock_opname_sessions sos ON soi.opname_session_id = sos.id
                 WHERE sos.status = 'COUNTING' AND soi.product_id = ?1",
                params![pid],
                |r| r.get::<_, i64>(0),
            )? > 0;

            if is_in_active_opname {
                return Err(AppError::Conflict(format!(
                    "Produk '{name}' sedang dalam sesi stok opname aktif (Shift Freeze). Selesaikan atau batalkan opname terlebih dahulu."
                )));
            }

            if stock == 0 || stock < *qty {
                return Err(AppError::Conflict(format!(
                    "Stok {name} tidak mencukupi (tersisa: {stock} {unit}, diminta: {qty} {unit})."
                )));
            }

            let discount_type = DiscountType::from_str(&disc_type_str)?;

            // Load tiered pricing for this product
            let mut tiers_stmt = tx.prepare(
                "SELECT id, product_id, min_quantity, tier_price, created_at, updated_at
                 FROM product_price_tiers WHERE product_id = ?1 ORDER BY min_quantity ASC",
            )?;
            let product_tiers = tiers_stmt
                .query_map(params![pid], |r| {
                    Ok(ProductPriceTier {
                        id: r.get(0)?,
                        product_id: r.get(1)?,
                        min_quantity: r.get(2)?,
                        tier_price: r.get(3)?,
                        created_at: r.get(4)?,
                        updated_at: r.get(5)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            let (calc, applied_tier) = calculate_line_item_with_tiers(
                cost_price,
                selling_price,
                discount_type,
                discount_value,
                *qty,
                if product_tiers.is_empty() {
                    None
                } else {
                    Some(&product_tiers)
                },
            )?;
            let (applied_tier_min_qty, applied_tier_price) = match applied_tier {
                Some((min_q, t_price)) => (Some(min_q), Some(t_price)),
                None => (None, None),
            };

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
                applied_tier_min_qty,
                applied_tier_price,
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
                shift_id, status, transaction_date, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'COMPLETED', ?12, ?13)",
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
                active_shift_id,
                today_date,
                now
            ],
        )?;

        if let Some(ref sid) = active_shift_id {
            tx.execute(
                "UPDATE cashier_shifts SET cash_sales_total = cash_sales_total + ?1, updated_at = ?2 WHERE id = ?3",
                params![total_amount, now, sid],
            )?;
        }

        for li in &line_items {
            tx.execute(
                "INSERT INTO sale_line_items (
                    id, sale_id, product_id, sku_snapshot, barcode_snapshot,
                    product_name_snapshot, unit_snapshot, quantity,
                    cost_price_snapshot, selling_price_snapshot,
                    discount_type_snapshot, discount_value_snapshot,
                    unit_discount_amount, applied_tier_min_qty, applied_tier_price, subtotal
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
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
                    li.applied_tier_min_qty,
                    li.applied_tier_price,
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
            shift_id: active_shift_id,
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
            shift_id: r.get(17)?,
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
                    unit_discount_amount, subtotal, applied_tier_min_qty, applied_tier_price
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
                    cost_price_snapshot: if role_has(actor_role, Permission::ViewCostPrice) {
                        raw_cost
                    } else {
                        0
                    },
                    selling_price_snapshot: r.get(9)?,
                    discount_type_snapshot: DiscountType::from_str(&disc_type_str)
                        .unwrap_or(DiscountType::NONE),
                    discount_value_snapshot: r.get(11)?,
                    unit_discount_amount: r.get(12)?,
                    applied_tier_min_qty: r.get(14)?,
                    applied_tier_price: r.get(15)?,
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
                    voided_at, transaction_date, created_at, shift_id
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
                        voided_at, transaction_date, created_at, shift_id
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
        require_permission(actor, Permission::AccessPos)?;
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

        let (status_str, transaction_date, total_amount, shift_id): (
            String,
            String,
            i64,
            Option<String>,
        ) = tx
            .query_row(
                "SELECT status, transaction_date, total_amount, shift_id FROM sales WHERE id = ?1",
                params![req.sale_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
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

        if let Some(ref sid) = shift_id {
            tx.execute(
                "UPDATE cashier_shifts SET cash_sales_total = MAX(0, cash_sales_total - ?1), updated_at = ?2 WHERE id = ?3",
                params![total_amount, now, sid],
            )?;
        }

        tx.commit()?;
        drop(conn);

        let conn = self.db.lock_conn()?;
        let sale = conn.query_row(
            "SELECT id, receipt_number, cashier_id, cashier_name_snapshot, terminal_name,
                    subtotal, discount_total, total_amount, cash_received, change_amount,
                    status, voided_by_user_id, voided_by_name_snapshot, void_reason,
                    voided_at, transaction_date, created_at, shift_id
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
        require_permission(actor, Permission::AccessPos)?;
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
        require_permission(actor, Permission::ViewSalesReport)?;

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
                    voided_at, transaction_date, created_at, shift_id
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

    pub fn get_financial_report(
        &self,
        actor: &User,
        filter: &SalesReportFilter,
    ) -> AppResult<FinancialReport> {
        require_permission(actor, Permission::ViewFinancialReport)?;

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

        // 1. Hitung transaksi penjualan dari tabel sales
        let (completed_sales_count, voided_sales_count, cash_sales, total_void_amount): (
            i64, i64, i64, i64,
        ) = conn.query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'VOIDED' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'VOIDED' THEN total_amount ELSE 0 END), 0)
             FROM sales
             WHERE transaction_date >= ?1 AND transaction_date <= ?2
               AND (?3 IS NULL OR cashier_id = ?3)
               AND (?4 IS NULL OR terminal_name = ?4)",
            params![start_date, end_date, cashier_filter, terminal_filter],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

        // 2. Hitung Omzet Kotor, Diskon, dan Omzet Bersih dari sale_line_items
        let (gross_sales, total_discount, net_sales): (i64, i64, i64) = conn.query_row(
            "SELECT
                COALESCE(SUM(sli.selling_price_snapshot * sli.quantity), 0),
                COALESCE(SUM(sli.unit_discount_amount * sli.quantity), 0),
                COALESCE(SUM(sli.subtotal), 0)
             FROM sale_line_items sli
             JOIN sales s ON s.id = sli.sale_id
             WHERE s.status = 'COMPLETED'
               AND s.transaction_date >= ?1 AND s.transaction_date <= ?2
               AND (?3 IS NULL OR s.cashier_id = ?3)
               AND (?4 IS NULL OR s.terminal_name = ?4)",
            params![start_date, end_date, cashier_filter, terminal_filter],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;

        // 3. Hitung Kas Masuk, Kas Keluar, dan Selisih Shift dari cashier_shifts
        let (total_opening_float, total_cash_in, total_cash_out, total_shift_discrepancy): (
            i64, i64, i64, i64,
        ) = conn.query_row(
            "SELECT
                COALESCE(SUM(opening_float), 0),
                COALESCE(SUM(cash_in_total), 0),
                COALESCE(SUM(cash_out_total), 0),
                COALESCE(SUM(CASE WHEN status = 'CLOSED' THEN cash_discrepancy ELSE 0 END), 0)
             FROM cashier_shifts
             WHERE substr(opened_at, 1, 10) >= ?1 AND substr(opened_at, 1, 10) <= ?2
               AND (?3 IS NULL OR cashier_id = ?3)
               AND (?4 IS NULL OR terminal_name = ?4)",
            params![start_date, end_date, cashier_filter, terminal_filter],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

        let cash_in_amount = total_opening_float + total_cash_in;
        let cash_out_amount = total_cash_out;
        let net_cash_flow = cash_sales + cash_in_amount - cash_out_amount + total_shift_discrepancy;

        // 4. Rekapitulasi per hari (daily_summaries)
        let mut dates_stmt = conn.prepare(
            "SELECT DISTINCT d FROM (
                SELECT transaction_date AS d FROM sales
                WHERE transaction_date >= ?1 AND transaction_date <= ?2
                UNION
                SELECT substr(opened_at, 1, 10) AS d FROM cashier_shifts
                WHERE substr(opened_at, 1, 10) >= ?1 AND substr(opened_at, 1, 10) <= ?2
             ) ORDER BY d ASC",
        )?;

        let date_rows = dates_stmt
            .query_map(params![start_date, end_date], |r| r.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut daily_summaries = Vec::with_capacity(date_rows.len());
        for d in date_rows {
            let (d_comp, d_void, d_cash_sales): (i64, i64, i64) = conn.query_row(
                "SELECT
                    COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN status = 'VOIDED' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0)
                 FROM sales
                 WHERE transaction_date = ?1
                   AND (?2 IS NULL OR cashier_id = ?2)
                   AND (?3 IS NULL OR terminal_name = ?3)",
                params![d, cashier_filter, terminal_filter],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?;

            let (d_gross, d_disc, d_net): (i64, i64, i64) = conn.query_row(
                "SELECT
                    COALESCE(SUM(sli.selling_price_snapshot * sli.quantity), 0),
                    COALESCE(SUM(sli.unit_discount_amount * sli.quantity), 0),
                    COALESCE(SUM(sli.subtotal), 0)
                 FROM sale_line_items sli
                 JOIN sales s ON s.id = sli.sale_id
                 WHERE s.status = 'COMPLETED' AND s.transaction_date = ?1
                   AND (?2 IS NULL OR s.cashier_id = ?2)
                   AND (?3 IS NULL OR s.terminal_name = ?3)",
                params![d, cashier_filter, terminal_filter],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?;

            let (d_float, d_in, d_out, d_disc_shift): (i64, i64, i64, i64) = conn.query_row(
                "SELECT
                    COALESCE(SUM(opening_float), 0),
                    COALESCE(SUM(cash_in_total), 0),
                    COALESCE(SUM(cash_out_total), 0),
                    COALESCE(SUM(CASE WHEN status = 'CLOSED' THEN cash_discrepancy ELSE 0 END), 0)
                 FROM cashier_shifts
                 WHERE substr(opened_at, 1, 10) = ?1
                   AND (?2 IS NULL OR cashier_id = ?2)
                   AND (?3 IS NULL OR terminal_name = ?3)",
                params![d, cashier_filter, terminal_filter],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?;

            let d_cash_in = d_float + d_in;
            let d_net_cash = d_cash_sales + d_cash_in - d_out + d_disc_shift;

            daily_summaries.push(DailyFinancialSummary {
                date: d,
                completed_count: d_comp,
                voided_count: d_void,
                gross_sales: d_gross,
                total_discount: d_disc,
                net_sales: d_net,
                cash_sales: d_cash_sales,
                cash_in: d_cash_in,
                cash_out: d_out,
                shift_discrepancy: d_disc_shift,
                net_cash: d_net_cash,
            });
        }

        Ok(FinancialReport {
            start_date,
            end_date,
            completed_sales_count,
            voided_sales_count,
            gross_sales,
            total_discount,
            net_sales,
            total_void_amount,
            cash_sales,
            cash_in_amount,
            cash_out_amount,
            total_shift_discrepancy,
            net_cash_flow,
            daily_summaries,
        })
    }

    pub fn get_profit_report(
        &self,
        actor: &User,
        filter: &SalesReportFilter,
    ) -> AppResult<ProfitReport> {
        require_permission(actor, Permission::ViewProfitReport)?;

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

        // 1. Total ringkasan laba kotor toko
        let (gross_sales, total_discount, net_sales, total_cogs): (i64, i64, i64, i64) = conn.query_row(
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
        let profit_margin_pct = if net_sales > 0 {
            ((gross_profit as f64) / (net_sales as f64) * 10000.0).round() / 100.0
        } else {
            0.0
        };

        // 2. Laba per kategori barang
        let mut cat_stmt = conn.prepare(
            "SELECT
                COALESCE(p.category_name, 'Umum') AS cat_name,
                COALESCE(SUM(sli.quantity), 0),
                COALESCE(SUM(sli.subtotal), 0),
                COALESCE(SUM(sli.cost_price_snapshot * sli.quantity), 0)
             FROM sale_line_items sli
             JOIN sales s ON s.id = sli.sale_id
             LEFT JOIN products p ON p.id = sli.product_id
             WHERE s.status = 'COMPLETED'
               AND s.transaction_date >= ?1 AND s.transaction_date <= ?2
               AND (?3 IS NULL OR s.cashier_id = ?3)
               AND (?4 IS NULL OR s.terminal_name = ?4)
             GROUP BY COALESCE(p.category_name, 'Umum')
             ORDER BY (SUM(sli.subtotal) - SUM(sli.cost_price_snapshot * sli.quantity)) DESC",
        )?;

        let category_profits = cat_stmt
            .query_map(
                params![start_date, end_date, cashier_filter, terminal_filter],
                |r| {
                    let total_qty_sold: i64 = r.get(1)?;
                    let net_revenue: i64 = r.get(2)?;
                    let cogs: i64 = r.get(3)?;
                    let cat_profit = net_revenue - cogs;
                    let margin = if net_revenue > 0 {
                        ((cat_profit as f64) / (net_revenue as f64) * 10000.0).round() / 100.0
                    } else {
                        0.0
                    };
                    Ok(CategoryProfitRow {
                        category_name: r.get(0)?,
                        total_qty_sold,
                        net_revenue,
                        total_cogs: cogs,
                        gross_profit: cat_profit,
                        profit_margin_pct: margin,
                    })
                },
            )?
            .collect::<Result<Vec<_>, _>>()?;

        // 3. Laba per item produk (Top products)
        let mut top_stmt = conn.prepare(
            "SELECT
                sli.product_id,
                sli.sku_snapshot,
                sli.product_name_snapshot,
                sli.unit_snapshot,
                SUM(sli.quantity) as total_qty,
                SUM(sli.subtotal) as net_rev,
                SUM(sli.cost_price_snapshot * sli.quantity) as total_cost
             FROM sale_line_items sli
             JOIN sales s ON s.id = sli.sale_id
             WHERE s.status = 'COMPLETED'
               AND s.transaction_date >= ?1 AND s.transaction_date <= ?2
               AND (?3 IS NULL OR s.cashier_id = ?3)
               AND (?4 IS NULL OR s.terminal_name = ?4)
             GROUP BY sli.product_id, sli.sku_snapshot, sli.product_name_snapshot, sli.unit_snapshot
             ORDER BY (SUM(sli.subtotal) - SUM(sli.cost_price_snapshot * sli.quantity)) DESC
             LIMIT 50",
        )?;

        let product_profits = top_stmt
            .query_map(
                params![start_date, end_date, cashier_filter, terminal_filter],
                |r| {
                    let net_rev: i64 = r.get(5)?;
                    let cost: i64 = r.get(6)?;
                    Ok(TopProductRow {
                        product_id: r.get(0)?,
                        sku: r.get(1)?,
                        product_name: r.get(2)?,
                        unit: r.get(3)?,
                        total_qty_sold: r.get(4)?,
                        net_revenue: net_rev,
                        total_cost: cost,
                        gross_profit: net_rev - cost,
                    })
                },
            )?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(ProfitReport {
            start_date,
            end_date,
            gross_sales,
            total_discount,
            net_sales,
            total_cogs,
            gross_profit,
            profit_margin_pct,
            category_profits,
            product_profits,
        })
    }

    pub fn get_stock_report(
        &self,
        actor: &User,
        category_filter: Option<&str>,
        search_filter: Option<&str>,
    ) -> AppResult<StockReport> {
        require_permission(actor, Permission::ViewStockReport)?;
        let can_view_cost = role_has(actor.role, Permission::ViewCostPrice);

        let cat_filter = category_filter
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty() && !c.eq_ignore_ascii_case("ALL"));
        let search_pattern = search_filter
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .map(|s| format!("%{s}%"));

        let conn = self.db.lock_conn()?;

        // 1. Ringkasan total produk dan valuasi
        let (total_products, active_products, total_stock_qty, total_cost_raw, total_retail_valuation, low_stock_count, out_of_stock_count): (
            i64, i64, i64, i64, i64, i64, i64,
        ) = conn.query_row(
            "SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(stock), 0),
                COALESCE(SUM(stock * cost_price), 0),
                COALESCE(SUM(stock * selling_price), 0),
                COALESCE(SUM(CASE WHEN stock <= 5 AND stock > 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END), 0)
             FROM products",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
        )?;

        let total_cost_valuation = if can_view_cost { total_cost_raw } else { 0 };
        let potential_profit = if can_view_cost {
            total_retail_valuation - total_cost_valuation
        } else {
            0
        };

        // 2. Ringkasan mutasi stok dari stock_adjustments dan penjualan
        let (restock_qty, damage_qty, loss_qty, correction_delta): (i64, i64, i64, i64) = conn.query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN adjustment_type = 'RESTOCK' THEN quantity_delta ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN adjustment_type = 'DAMAGE' THEN ABS(quantity_delta) ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN adjustment_type = 'LOSS' THEN ABS(quantity_delta) ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN adjustment_type = 'CORRECTION' THEN quantity_delta ELSE 0 END), 0)
             FROM stock_adjustments",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

        let sold_qty: i64 = conn.query_row(
            "SELECT COALESCE(SUM(sli.quantity), 0)
             FROM sale_line_items sli
             JOIN sales s ON s.id = sli.sale_id
             WHERE s.status = 'COMPLETED'",
            [],
            |r| r.get(0),
        )?;

        let movements = StockMovementSummary {
            restock_qty,
            damage_qty,
            loss_qty,
            correction_delta,
            sold_qty,
        };

        // 3. Rincian valuasi per item produk
        let mut items_stmt = conn.prepare(
            "SELECT id, sku, barcode, name, category_name, unit, stock, cost_price, selling_price
             FROM products
             WHERE (?1 IS NULL OR category_name = ?1)
               AND (?2 IS NULL OR name LIKE ?2 OR sku LIKE ?2 OR barcode LIKE ?2)
             ORDER BY is_active DESC, stock ASC, name COLLATE NOCASE ASC",
        )?;

        let items = items_stmt
            .query_map(params![cat_filter, search_pattern], |r| {
                let stock: i64 = r.get(6)?;
                let min_stock: i64 = 5;
                let cost_price_raw: i64 = r.get(7)?;
                let selling_price: i64 = r.get(8)?;

                let cost_price = if can_view_cost { cost_price_raw } else { 0 };
                let total_cost_val = stock * cost_price;
                let total_ret_val = stock * selling_price;
                let pot_profit = if can_view_cost {
                    total_ret_val - total_cost_val
                } else {
                    0
                };

                Ok(StockValuationItem {
                    product_id: r.get(0)?,
                    sku: r.get(1)?,
                    barcode: r.get(2)?,
                    product_name: r.get(3)?,
                    category_name: r.get(4)?,
                    unit: r.get(5)?,
                    stock,
                    min_stock,
                    cost_price,
                    selling_price,
                    total_cost_valuation: total_cost_val,
                    total_retail_valuation: total_ret_val,
                    potential_profit: pot_profit,
                    is_low_stock: stock <= min_stock,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(StockReport {
            total_products,
            active_products,
            total_stock_qty,
            total_cost_valuation,
            total_retail_valuation,
            potential_profit,
            movements,
            low_stock_count,
            out_of_stock_count,
            items,
        })
    }

    // ========================================================================
    // 8. Backup (`VACUUM INTO`) & Restore Database SQLite (`FR-SYS-01`)
    // ========================================================================

    pub fn backup_database(&self, actor: &User, target_path: &Path) -> AppResult<String> {
        require_permission(actor, Permission::ManageStoreSettings)?;
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
        require_permission(actor, Permission::ManageStoreSettings)?;
        if !source_path.exists() {
            return Err(AppError::NotFound(
                "File cadangan database tidak ditemukan.".to_string(),
            ));
        }

        // Validasi terlebih dahulu bahwa source_path adalah file SQLite Mudita Mart yang sah
        {
            let src_conn = Connection::open(source_path)?;
            let store_count: i64 = src_conn
                .query_row("SELECT COUNT(*) FROM store_settings", [], |r| r.get(0))
                .map_err(|_| {
                    AppError::Validation(
                        "File yang dipilih bukan database cadangan Mudita Mart yang valid."
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
                 DELETE FROM user_sessions;
                 DELETE FROM stock_opname_items;
                 DELETE FROM stock_opname_sessions;
                 DELETE FROM cash_movements;
                 DELETE FROM cashier_shifts;
                 DELETE FROM product_price_tiers;
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
                 INSERT INTO held_bill_items SELECT * FROM backup_src.held_bill_items;",
            )?;

            for optional_table in [
                "product_price_tiers",
                "cashier_shifts",
                "cash_movements",
                "stock_opname_sessions",
                "stock_opname_items",
                "user_sessions",
            ] {
                let exists: i64 = tx.query_row(
                    "SELECT COUNT(*) FROM backup_src.sqlite_master WHERE type = 'table' AND name = ?1",
                    params![optional_table],
                    |r| r.get(0),
                )?;
                if exists > 0 {
                    tx.execute_batch(&format!(
                        "INSERT INTO {optional_table} SELECT * FROM backup_src.{optional_table};"
                    ))?;
                }
            }

            tx.execute_batch("PRAGMA foreign_keys = ON;")?;
            tx.commit()?;
            let _ = self.sessions.clear_all();
            Ok(())
        })();

        let _ = conn.execute("DETACH DATABASE backup_src", []);
        restore_result
    }

    // ========================================================================
    // 10. Manajemen Shift Kasir & Rekap Kas Laci (Shift Float & Cash Movements)
    // ========================================================================

    fn map_shift_row(r: &Row<'_>) -> rusqlite::Result<CashierShift> {
        Ok(CashierShift {
            id: r.get(0)?,
            terminal_name: r.get(1)?,
            cashier_id: r.get(2)?,
            cashier_name_snapshot: r.get(3)?,
            opened_at: r.get(4)?,
            closed_at: r.get(5)?,
            opening_float: r.get(6)?,
            cash_sales_total: r.get(7)?,
            cash_in_total: r.get(8)?,
            cash_out_total: r.get(9)?,
            expected_closing_cash: r.get(10)?,
            actual_closing_cash: r.get(11)?,
            cash_discrepancy: r.get(12)?,
            status: r.get(13)?,
            notes: r.get(14)?,
            created_at: r.get(15)?,
            updated_at: r.get(16)?,
        })
    }

    pub fn open_shift(
        &self,
        actor: &User,
        terminal_name: &str,
        req: &OpenShiftRequest,
    ) -> AppResult<CashierShift> {
        require_permission(actor, Permission::AccessPos)?;
        if req.opening_float < 0 {
            return Err(AppError::Validation(
                "Modal awal kasir (Opening Float) tidak boleh bernilai negatif.".to_string(),
            ));
        }

        let effective_terminal = req
            .terminal_name
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or(terminal_name);

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        // 1. Validasi: Kasir dilarang memiliki shift OPEN ganda
        let active_cashier_shift: Option<String> = tx
            .query_row(
                "SELECT id FROM cashier_shifts WHERE cashier_id = ?1 AND status = 'OPEN' LIMIT 1",
                params![actor.id],
                |r| r.get(0),
            )
            .optional()?;

        if active_cashier_shift.is_some() {
            return Err(AppError::Conflict(
                "Kasir ini masih memiliki shift yang sedang aktif (OPEN). Tutup shift sebelumnya terlebih dahulu."
                    .to_string(),
            ));
        }

        // 2. Validasi: Terminal dilarang memiliki lebih dari 1 shift OPEN sekaligus
        let active_terminal_shift: Option<(String, String)> = tx
            .query_row(
                "SELECT id, cashier_name_snapshot FROM cashier_shifts WHERE terminal_name = ?1 AND status = 'OPEN' LIMIT 1",
                params![effective_terminal],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;

        if let Some((_, active_cashier)) = active_terminal_shift {
            return Err(AppError::Conflict(format!(
                "Terminal '{effective_terminal}' masih memiliki shift aktif oleh {active_cashier}. Tutup shift sebelumnya terlebih dahulu."
            )));
        }

        let id = Uuid::new_v4().to_string();
        let now = Self::now_iso();

        tx.execute(
            "INSERT INTO cashier_shifts (
                id, terminal_name, cashier_id, cashier_name_snapshot, opened_at,
                opening_float, cash_sales_total, cash_in_total, cash_out_total,
                status, notes, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, 0, 'OPEN', ?7, ?8, ?8)",
            params![
                id,
                effective_terminal,
                actor.id,
                actor.full_name,
                now,
                req.opening_float,
                req.notes.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()),
                now
            ],
        )?;

        let shift = tx.query_row(
            "SELECT id, terminal_name, cashier_id, cashier_name_snapshot, opened_at, closed_at,
                    opening_float, cash_sales_total, cash_in_total, cash_out_total,
                    expected_closing_cash, actual_closing_cash, cash_discrepancy,
                    status, notes, created_at, updated_at
             FROM cashier_shifts WHERE id = ?1",
            params![id],
            Self::map_shift_row,
        )?;

        tx.commit()?;
        Ok(shift)
    }

    pub fn get_active_shift(&self, cashier_id: &str) -> AppResult<Option<CashierShift>> {
        let conn = self.db.lock_conn()?;
        let shift_opt = conn
            .query_row(
                "SELECT id, terminal_name, cashier_id, cashier_name_snapshot, opened_at, closed_at,
                        opening_float, cash_sales_total, cash_in_total, cash_out_total,
                        expected_closing_cash, actual_closing_cash, cash_discrepancy,
                        status, notes, created_at, updated_at
                 FROM cashier_shifts
                 WHERE cashier_id = ?1 AND status = 'OPEN'
                 ORDER BY opened_at DESC LIMIT 1",
                params![cashier_id],
                Self::map_shift_row,
            )
            .optional()?;
        Ok(shift_opt)
    }

    pub fn get_active_shift_by_terminal_or_cashier(
        &self,
        terminal_name: Option<&str>,
        cashier_id: &str,
    ) -> AppResult<Option<CashierShift>> {
        let conn = self.db.lock_conn()?;
        if let Some(t_name) = terminal_name.filter(|s| !s.trim().is_empty()) {
            let shift_by_term = conn
                .query_row(
                    "SELECT id, terminal_name, cashier_id, cashier_name_snapshot, opened_at, closed_at,
                            opening_float, cash_sales_total, cash_in_total, cash_out_total,
                            expected_closing_cash, actual_closing_cash, cash_discrepancy,
                            status, notes, created_at, updated_at
                     FROM cashier_shifts
                     WHERE terminal_name = ?1 AND status = 'OPEN'
                     ORDER BY opened_at DESC LIMIT 1",
                    params![t_name.trim()],
                    Self::map_shift_row,
                )
                .optional()?;
            if shift_by_term.is_some() {
                return Ok(shift_by_term);
            }
        }

        let shift_by_cashier = conn
            .query_row(
                "SELECT id, terminal_name, cashier_id, cashier_name_snapshot, opened_at, closed_at,
                        opening_float, cash_sales_total, cash_in_total, cash_out_total,
                        expected_closing_cash, actual_closing_cash, cash_discrepancy,
                        status, notes, created_at, updated_at
                 FROM cashier_shifts
                 WHERE cashier_id = ?1 AND status = 'OPEN'
                 ORDER BY opened_at DESC LIMIT 1",
                params![cashier_id],
                Self::map_shift_row,
            )
            .optional()?;
        Ok(shift_by_cashier)
    }

    pub fn get_shift_by_id(&self, shift_id: &str) -> AppResult<CashierShift> {
        let conn = self.db.lock_conn()?;
        conn.query_row(
            "SELECT id, terminal_name, cashier_id, cashier_name_snapshot, opened_at, closed_at,
                    opening_float, cash_sales_total, cash_in_total, cash_out_total,
                    expected_closing_cash, actual_closing_cash, cash_discrepancy,
                    status, notes, created_at, updated_at
             FROM cashier_shifts WHERE id = ?1",
            params![shift_id],
            Self::map_shift_row,
        )
        .map_err(|_| AppError::NotFound("Data shift tidak ditemukan.".to_string()))
    }

    pub fn record_cash_movement(
        &self,
        actor: &User,
        req: &CashMovementRequest,
    ) -> AppResult<CashMovement> {
        require_permission(actor, Permission::AccessPos)?;
        if req.amount <= 0 {
            return Err(AppError::Validation(
                "Nominal mutasi kas harus lebih besar dari 0.".to_string(),
            ));
        }

        let norm_type = match req.movement_type.trim().to_uppercase().as_str() {
            "IN" | "CASH_IN" => "CASH_IN",
            "OUT" | "CASH_OUT" => "CASH_OUT",
            _ => {
                return Err(AppError::Validation(
                    "Jenis mutasi kas harus 'CASH_IN' atau 'CASH_OUT'.".to_string(),
                ))
            }
        };

        let reason = req.reason.trim();
        if reason.is_empty() {
            return Err(AppError::Validation(
                "Alasan mutasi kas wajib diisi.".to_string(),
            ));
        }

        let shift = self.get_shift_by_id(&req.shift_id)?;
        if shift.status != "OPEN" {
            return Err(AppError::Validation(
                "Mutasi kas hanya dapat dicatat pada shift yang sedang aktif (OPEN).".to_string(),
            ));
        }

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        if norm_type == "CASH_OUT" {
            let net_cash_sales: i64 = tx.query_row(
                "SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE shift_id = ?1 AND status = 'COMPLETED'",
                params![shift.id],
                |r| r.get(0),
            )?;
            let cash_in: i64 = tx.query_row(
                "SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE shift_id = ?1 AND movement_type = 'CASH_IN'",
                params![shift.id],
                |r| r.get(0),
            )?;
            let cash_out: i64 = tx.query_row(
                "SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE shift_id = ?1 AND movement_type = 'CASH_OUT'",
                params![shift.id],
                |r| r.get(0),
            )?;

            let current_cash = shift.opening_float + net_cash_sales + cash_in - cash_out;
            if current_cash < req.amount {
                return Err(AppError::Conflict(format!(
                    "Saldo kas laci tidak mencukupi untuk pengeluaran kas (Tersedia: Rp {current_cash}, Diminta: Rp {}).",
                    req.amount
                )));
            }
        }

        let id = Uuid::new_v4().to_string();
        let now = Self::now_iso();

        tx.execute(
            "INSERT INTO cash_movements (
                id, shift_id, movement_type, amount, reason, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, shift.id, norm_type, req.amount, reason, now],
        )?;

        if norm_type == "CASH_IN" {
            tx.execute(
                "UPDATE cashier_shifts SET cash_in_total = cash_in_total + ?1, updated_at = ?2 WHERE id = ?3",
                params![req.amount, now, shift.id],
            )?;
        } else {
            tx.execute(
                "UPDATE cashier_shifts SET cash_out_total = cash_out_total + ?1, updated_at = ?2 WHERE id = ?3",
                params![req.amount, now, shift.id],
            )?;
        }

        let movement = CashMovement {
            id,
            shift_id: shift.id,
            movement_type: norm_type.to_string(),
            amount: req.amount,
            reason: reason.to_string(),
            created_at: now,
        };

        tx.commit()?;
        Ok(movement)
    }

    pub fn get_shift_x_report(&self, shift_id: &str) -> AppResult<ShiftReportData> {
        let shift = self.get_shift_by_id(shift_id)?;
        let conn = self.db.lock_conn()?;

        let mut stmt = conn.prepare(
            "SELECT id, shift_id, movement_type, amount, reason, created_at
             FROM cash_movements WHERE shift_id = ?1 ORDER BY created_at ASC",
        )?;
        let movements = stmt
            .query_map(params![shift_id], |r| {
                Ok(CashMovement {
                    id: r.get(0)?,
                    shift_id: r.get(1)?,
                    movement_type: r.get(2)?,
                    amount: r.get(3)?,
                    reason: r.get(4)?,
                    created_at: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let (gross_sales, total_discounts, net_sales, total_transactions): (i64, i64, i64, i64) =
            conn.query_row(
                "SELECT
                    COALESCE(SUM(subtotal), 0),
                    COALESCE(SUM(discount_total), 0),
                    COALESCE(SUM(total_amount), 0),
                    COUNT(*)
                 FROM sales
                 WHERE shift_id = ?1 AND status = 'COMPLETED'",
                params![shift_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?;

        let (void_count, void_total): (i64, i64) = conn.query_row(
            "SELECT
                COUNT(*),
                COALESCE(SUM(total_amount), 0)
             FROM sales
             WHERE shift_id = ?1 AND status = 'VOIDED'",
            params![shift_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;

        let total_cash_sales = net_sales;
        let mut total_cash_in = 0;
        let mut total_cash_out = 0;
        for m in &movements {
            if m.movement_type == "CASH_IN" {
                total_cash_in += m.amount;
            } else if m.movement_type == "CASH_OUT" {
                total_cash_out += m.amount;
            }
        }

        let expected_cash = shift.opening_float + total_cash_sales + total_cash_in - total_cash_out;

        let (store_name, store_address, store_phone): (String, String, String) = conn.query_row(
            "SELECT store_name, store_address, store_phone FROM store_settings WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;

        Ok(ShiftReportData {
            shift,
            movements,
            gross_sales,
            total_discounts,
            net_sales,
            total_transactions,
            void_count,
            void_total,
            total_cash_sales,
            total_cash_in,
            total_cash_out,
            expected_cash,
            store_name,
            store_address,
            store_phone,
        })
    }

    pub fn close_shift(&self, actor: &User, req: &CloseShiftRequest) -> AppResult<CashierShift> {
        require_permission(actor, Permission::AccessPos)?;
        let shift = self.get_shift_by_id(&req.shift_id)?;
        if shift.status != "OPEN" {
            if shift.status == "CLOSED" {
                // Idempotent (Risk 1 Mitigasi): kembalikan snapshot shift yang sudah dibekukan jika terjadi retry LAN
                return Ok(shift);
            }
            return Err(AppError::Validation(
                "Shift ini sudah ditutup sebelumnya.".to_string(),
            ));
        }

        if req.actual_closing_cash < 0 {
            return Err(AppError::Validation(
                "Kas fisik aktual tidak boleh bernilai negatif.".to_string(),
            ));
        }

        let report = self.get_shift_x_report(&shift.id)?;
        let expected_cash = report.expected_cash;
        let cash_discrepancy = req.actual_closing_cash - expected_cash;

        let notes_cleaned = req.notes.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
        if cash_discrepancy != 0 && notes_cleaned.is_none() {
            return Err(AppError::Validation(format!(
                "Terdapat selisih kas sebesar Rp {cash_discrepancy}. Catatan alasan selisih wajib diisi."
            )));
        }

        let now = Self::now_iso();
        let conn = self.db.lock_conn()?;
        conn.execute(
            "UPDATE cashier_shifts
             SET status = 'CLOSED', closed_at = ?1, cash_sales_total = ?2, expected_closing_cash = ?3,
                 actual_closing_cash = ?4, cash_discrepancy = ?5, notes = ?6, updated_at = ?1
             WHERE id = ?7",
            params![
                now,
                report.total_cash_sales,
                expected_cash,
                req.actual_closing_cash,
                cash_discrepancy,
                notes_cleaned,
                shift.id
            ],
        )?;

        drop(conn);
        self.get_shift_by_id(&shift.id)
    }

    pub fn list_shifts(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> AppResult<Vec<CashierShift>> {
        let conn = self.db.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, terminal_name, cashier_id, cashier_name_snapshot, opened_at, closed_at,
                    opening_float, cash_sales_total, cash_in_total, cash_out_total,
                    expected_closing_cash, actual_closing_cash, cash_discrepancy,
                    status, notes, created_at, updated_at
             FROM cashier_shifts
             WHERE (?1 IS NULL OR opened_at >= ?1) AND (?2 IS NULL OR opened_at <= ?2 || 'T23:59:59')
             ORDER BY opened_at DESC",
        )?;
        let rows = stmt
            .query_map(params![start_date, end_date], Self::map_shift_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ========================================================================
    // 11. Alur Stok Opname Fisik Massal (Stock Opname Session & Items)
    // ========================================================================

    fn map_opname_session_row(r: &Row<'_>) -> rusqlite::Result<StockOpnameSession> {
        Ok(StockOpnameSession {
            id: r.get(0)?,
            session_name: r.get(1)?,
            creator_user_id: r.get(2)?,
            creator_name_snapshot: r.get(3)?,
            status: r.get(4)?,
            total_items_counted: r.get(5)?,
            total_discrepancy_qty: r.get(6)?,
            total_discrepancy_value: r.get(7)?,
            committed_by_user_id: r.get(8)?,
            committed_at: r.get(9)?,
            notes: r.get(10)?,
            created_at: r.get(11)?,
            updated_at: r.get(12)?,
        })
    }

    fn map_opname_item_row(r: &Row<'_>) -> rusqlite::Result<StockOpnameItem> {
        let physical_count: i64 = r.get(7)?;
        let system_stock_snapshot: i64 = r.get(8)?;
        let cost_price_snapshot: i64 = r.get(9)?;
        let discrepancy = physical_count - system_stock_snapshot;
        let discrepancy_cost = discrepancy * cost_price_snapshot;

        Ok(StockOpnameItem {
            id: r.get(0)?,
            opname_session_id: r.get(1)?,
            product_id: r.get(2)?,
            sku: r.get(3)?,
            barcode: r.get(4)?,
            product_name: r.get(5)?,
            unit: r.get(6)?,
            physical_count,
            system_stock_snapshot,
            cost_price_snapshot,
            discrepancy,
            discrepancy_cost,
            updated_at: r.get(10)?,
        })
    }

    fn sync_opname_session_aggregates(tx: &Connection, session_id: &str, now: &str) -> AppResult<()> {
        let (total_items, total_disc_qty, total_disc_val): (i64, i64, i64) = tx.query_row(
            "SELECT
                COUNT(*),
                COALESCE(SUM(physical_count - system_stock_snapshot), 0),
                COALESCE(SUM((physical_count - system_stock_snapshot) * cost_price_snapshot), 0)
             FROM stock_opname_items
             WHERE opname_session_id = ?1",
            params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;

        tx.execute(
            "UPDATE stock_opname_sessions
             SET total_items_counted = ?1, total_discrepancy_qty = ?2, total_discrepancy_value = ?3, updated_at = ?4
             WHERE id = ?5",
            params![total_items, total_disc_qty, total_disc_val, now, session_id],
        )?;
        Ok(())
    }

    pub fn create_opname_session(
        &self,
        actor: &User,
        req: &CreateOpnameSessionRequest,
    ) -> AppResult<StockOpnameSession> {
        require_permission(actor, Permission::AdjustStock)?;
        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let active_session: Option<String> = tx
            .query_row(
                "SELECT id FROM stock_opname_sessions WHERE status IN ('COUNTING', 'REVIEW') LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()?;

        if active_session.is_some() {
            return Err(AppError::Conflict(
                "Masih ada sesi stok opname yang aktif (COUNTING/REVIEW). Selesaikan atau batalkan sesi tersebut terlebih dahulu."
                    .to_string(),
            ));
        }

        let today_compact = Self::today_compact_str();
        let today_date = Self::today_date_str();
        let count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM stock_opname_sessions WHERE created_at LIKE ?1 || '%'",
            params![today_date],
            |r| r.get(0),
        )?;
        let session_name = req
            .session_name
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("Opname-{}-{:03}", today_compact, count + 1));

        let id = Uuid::new_v4().to_string();
        let now = Self::now_iso();

        tx.execute(
            "INSERT INTO stock_opname_sessions (
                id, session_name, creator_user_id, creator_name_snapshot, status,
                total_items_counted, total_discrepancy_qty, total_discrepancy_value,
                notes, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, 'COUNTING', 0, 0, 0, ?5, ?6, ?6)",
            params![
                id,
                session_name,
                actor.id,
                actor.full_name,
                req.notes.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()),
                now
            ],
        )?;

        let session = tx.query_row(
            "SELECT id, session_name, creator_user_id, creator_name_snapshot, status,
                    total_items_counted, total_discrepancy_qty, total_discrepancy_value,
                    committed_by_user_id, committed_at, notes, created_at, updated_at
             FROM stock_opname_sessions WHERE id = ?1",
            params![id],
            Self::map_opname_session_row,
        )?;

        tx.commit()?;
        Ok(session)
    }

    pub fn get_opname_session_by_id(&self, session_id: &str) -> AppResult<StockOpnameSession> {
        let conn = self.db.lock_conn()?;
        conn.query_row(
            "SELECT id, session_name, creator_user_id, creator_name_snapshot, status,
                    total_items_counted, total_discrepancy_qty, total_discrepancy_value,
                    committed_by_user_id, committed_at, notes, created_at, updated_at
             FROM stock_opname_sessions WHERE id = ?1",
            params![session_id],
            Self::map_opname_session_row,
        )
        .map_err(|_| AppError::NotFound("Sesi stok opname tidak ditemukan.".to_string()))
    }

    pub fn list_opname_sessions(
        &self,
        status: Option<&str>,
    ) -> AppResult<Vec<StockOpnameSession>> {
        let conn = self.db.lock_conn()?;
        if let Some(st) = status {
            let mut stmt = conn.prepare(
                "SELECT id, session_name, creator_user_id, creator_name_snapshot, status,
                        total_items_counted, total_discrepancy_qty, total_discrepancy_value,
                        committed_by_user_id, committed_at, notes, created_at, updated_at
                 FROM stock_opname_sessions
                 WHERE status = ?1
                 ORDER BY created_at DESC",
            )?;
            let rows = stmt
                .query_map(params![st], Self::map_opname_session_row)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, session_name, creator_user_id, creator_name_snapshot, status,
                        total_items_counted, total_discrepancy_qty, total_discrepancy_value,
                        committed_by_user_id, committed_at, notes, created_at, updated_at
                 FROM stock_opname_sessions
                 ORDER BY created_at DESC",
            )?;
            let rows = stmt
                .query_map([], Self::map_opname_session_row)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }
    }

    pub fn get_opname_session_detail(&self, session_id: &str) -> AppResult<OpnameSessionDetail> {
        let session = self.get_opname_session_by_id(session_id)?;
        let conn = self.db.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT soi.id, soi.opname_session_id, soi.product_id,
                    p.sku, p.barcode, p.name, p.unit,
                    soi.physical_count, soi.system_stock_snapshot, soi.cost_price_snapshot,
                    soi.updated_at
             FROM stock_opname_items soi
             JOIN products p ON soi.product_id = p.id
             WHERE soi.opname_session_id = ?1
             ORDER BY soi.updated_at DESC",
        )?;
        let items = stmt
            .query_map(params![session_id], Self::map_opname_item_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(OpnameSessionDetail { session, items })
    }

    pub fn record_opname_scan(
        &self,
        actor: &User,
        req: &RecordOpnameScanRequest,
    ) -> AppResult<StockOpnameItem> {
        require_permission(actor, Permission::AdjustStock)?;
        let session = self.get_opname_session_by_id(&req.session_id)?;
        if session.status != "COUNTING" && session.status != "REVIEW" {
            return Err(AppError::Validation(
                "Pemindaian hanya diizinkan pada sesi stok opname yang berstatus COUNTING atau REVIEW."
                    .to_string(),
            ));
        }

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let target_ident = req.product_identifier.trim();
        let prod_row: Option<(String, String, Option<String>, String, String, i64, i64)> = tx
            .query_row(
                "SELECT id, sku, barcode, name, unit, stock, cost_price
                 FROM products
                 WHERE barcode = ?1 COLLATE NOCASE OR sku = ?1 COLLATE NOCASE OR id = ?1
                 LIMIT 1",
                params![target_ident],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                    ))
                },
            )
            .optional()?;

        let Some((pid, sku, barcode, name, unit, sys_stock, cost_price)) = prod_row else {
            return Err(AppError::NotFound(format!(
                "Produk dengan kode/barcode '{target_ident}' tidak ditemukan."
            )));
        };

        let existing_item: Option<(String, i64, i64, i64)> = tx
            .query_row(
                "SELECT id, physical_count, system_stock_snapshot, cost_price_snapshot
                 FROM stock_opname_items
                 WHERE opname_session_id = ?1 AND product_id = ?2",
                params![session.id, pid],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?;

        let now = Self::now_iso();
        let is_increment = req.count_mode.trim().to_uppercase() == "INCREMENT";

        let result_item = if let Some((item_id, item_phys_count, item_sys_stock, item_cost)) =
            existing_item
        {
            let physical_count = if is_increment {
                item_phys_count + req.quantity
            } else {
                req.quantity
            };
            let discrepancy = physical_count - item_sys_stock;
            let discrepancy_cost = discrepancy * item_cost;

            tx.execute(
                "UPDATE stock_opname_items
                 SET physical_count = ?1, updated_at = ?2
                 WHERE id = ?3",
                params![physical_count, now, item_id],
            )?;

            Self::sync_opname_session_aggregates(&tx, &session.id, &now)?;

            StockOpnameItem {
                id: item_id,
                opname_session_id: session.id.clone(),
                product_id: pid,
                sku,
                barcode,
                product_name: name,
                unit,
                physical_count,
                system_stock_snapshot: item_sys_stock,
                cost_price_snapshot: item_cost,
                discrepancy,
                discrepancy_cost,
                updated_at: now,
            }
        } else {
            let physical_count = req.quantity;
            let discrepancy = physical_count - sys_stock;
            let discrepancy_cost = discrepancy * cost_price;
            let new_id = Uuid::new_v4().to_string();

            tx.execute(
                "INSERT INTO stock_opname_items (
                    id, opname_session_id, product_id, physical_count,
                    system_stock_snapshot, cost_price_snapshot, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    new_id,
                    session.id,
                    pid,
                    physical_count,
                    sys_stock,
                    cost_price,
                    now
                ],
            )?;

            Self::sync_opname_session_aggregates(&tx, &session.id, &now)?;

            StockOpnameItem {
                id: new_id,
                opname_session_id: session.id.clone(),
                product_id: pid,
                sku,
                barcode,
                product_name: name,
                unit,
                physical_count,
                system_stock_snapshot: sys_stock,
                cost_price_snapshot: cost_price,
                discrepancy,
                discrepancy_cost,
                updated_at: now,
            }
        };

        tx.commit()?;
        Ok(result_item)
    }

    pub fn update_opname_item_qty(
        &self,
        actor: &User,
        req: &UpdateOpnameItemQtyRequest,
    ) -> AppResult<StockOpnameItem> {
        require_permission(actor, Permission::AdjustStock)?;
        if req.physical_count < 0 {
            return Err(AppError::Validation(
                "Kuantitas fisik stok tidak boleh bernilai negatif.".to_string(),
            ));
        }

        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let row: (
            String,
            String,
            String,
            String,
            Option<String>,
            String,
            String,
            i64,
            i64,
            String,
        ) = tx
            .query_row(
                "SELECT soi.id, soi.opname_session_id, soi.product_id, p.sku,
                        p.barcode, p.name, p.unit,
                        soi.system_stock_snapshot, soi.cost_price_snapshot, sos.status
                 FROM stock_opname_items soi
                 JOIN stock_opname_sessions sos ON soi.opname_session_id = sos.id
                 JOIN products p ON soi.product_id = p.id
                 WHERE soi.id = ?1",
                params![req.item_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                        r.get(7)?,
                        r.get(8)?,
                        r.get(9)?,
                    ))
                },
            )
            .map_err(|_| AppError::NotFound("Item opname tidak ditemukan.".to_string()))?;

        if row.9 != "COUNTING" && row.9 != "REVIEW" {
            return Err(AppError::Validation(
                "Item opname hanya dapat diedit pada sesi yang berstatus COUNTING atau REVIEW."
                    .to_string(),
            ));
        }

        let now = Self::now_iso();
        tx.execute(
            "UPDATE stock_opname_items
             SET physical_count = ?1, updated_at = ?2
             WHERE id = ?3",
            params![req.physical_count, now, row.0],
        )?;

        Self::sync_opname_session_aggregates(&tx, &row.1, &now)?;

        let discrepancy = req.physical_count - row.7;
        let discrepancy_cost = discrepancy * row.8;

        let item = StockOpnameItem {
            id: row.0,
            opname_session_id: row.1,
            product_id: row.2,
            sku: row.3,
            barcode: row.4,
            product_name: row.5,
            unit: row.6,
            physical_count: req.physical_count,
            system_stock_snapshot: row.7,
            cost_price_snapshot: row.8,
            discrepancy,
            discrepancy_cost,
            updated_at: now,
        };

        tx.commit()?;
        Ok(item)
    }

    pub fn commit_opname_session(
        &self,
        actor: &User,
        req: &CommitOpnameSessionRequest,
    ) -> AppResult<StockOpnameSession> {
        require_permission(actor, Permission::AdjustStock)?;
        let mut conn = self.db.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let admin_user = Self::find_admin_by_pin_conn(&tx, &req.admin_pin)?;

        let session: (String, String, String) = tx
            .query_row(
                "SELECT id, session_name, status FROM stock_opname_sessions WHERE id = ?1",
                params![req.session_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|_| AppError::NotFound("Sesi stok opname tidak ditemukan.".to_string()))?;

        if session.2 != "COUNTING" && session.2 != "REVIEW" {
            return Err(AppError::Conflict(format!(
                "Hanya sesi dengan status COUNTING atau REVIEW yang dapat di-commit (status saat ini: {}).",
                session.2
            )));
        }

        let items: Vec<(String, i64, i64, i64)> = {
            let mut stmt = tx.prepare(
                "SELECT product_id, system_stock_snapshot, physical_count, (physical_count - system_stock_snapshot)
                 FROM stock_opname_items WHERE opname_session_id = ?1",
            )?;
            let mapped = stmt
                .query_map(params![session.0], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            mapped
        };

        let now = Self::now_iso();

        for (pid, sys_stock, phys_count, discrepancy) in items {
            if discrepancy != 0 {
                tx.execute(
                    "UPDATE products SET stock = ?1, updated_at = ?2 WHERE id = ?3",
                    params![phys_count, now, pid],
                )?;

                let adj_id = Uuid::new_v4().to_string();
                let adj_note = format!(
                    "Audit Stok Opname Sesi {} (Fisik: {}, Sistem: {})",
                    session.1, phys_count, sys_stock
                );
                tx.execute(
                    "INSERT INTO stock_adjustments (
                        id, product_id, user_id, terminal_name, adjustment_type,
                        stock_before, quantity_delta, stock_after, note, created_at
                     ) VALUES (?1, ?2, ?3, 'Server Terminal', 'CORRECTION', ?4, ?5, ?6, ?7, ?8)",
                    params![
                        adj_id,
                        pid,
                        admin_user.id,
                        sys_stock,
                        discrepancy,
                        phys_count,
                        adj_note,
                        now
                    ],
                )?;
            }
        }

        tx.execute(
            "UPDATE stock_opname_sessions
             SET status = 'COMMITTED', committed_by_user_id = ?1, committed_at = ?2, updated_at = ?2
             WHERE id = ?3",
            params![admin_user.id, now, session.0],
        )?;

        tx.commit()?;
        drop(conn);

        self.get_opname_session_by_id(&session.0)
    }

    pub fn cancel_opname_session(
        &self,
        actor: &User,
        session_id: &str,
        reason: &str,
    ) -> AppResult<StockOpnameSession> {
        require_permission(actor, Permission::AdjustStock)?;
        let session = self.get_opname_session_by_id(session_id)?;
        if session.status != "COUNTING" && session.status != "REVIEW" {
            return Err(AppError::Conflict(format!(
                "Hanya sesi dengan status COUNTING atau REVIEW yang dapat dibatalkan (status saat ini: {}).",
                session.status
            )));
        }

        let reason_clean = reason.trim();
        let final_notes = if reason_clean.is_empty() {
            session.notes
        } else if let Some(existing) = session.notes.filter(|s| !s.trim().is_empty()) {
            Some(format!("{}\n[Batal: {}]", existing.trim(), reason_clean))
        } else {
            Some(format!("[Batal: {}]", reason_clean))
        };

        let now = Self::now_iso();
        let conn = self.db.lock_conn()?;
        conn.execute(
            "UPDATE stock_opname_sessions SET status = 'CANCELLED', notes = ?1, updated_at = ?2 WHERE id = ?3",
            params![final_notes, now, session_id],
        )?;

        drop(conn);
        self.get_opname_session_by_id(session_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{HeldBillItemInput, PriceTierInput, SaleItemInput};

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
                    price_tiers: None,
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
                    price_tiers: None,
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
                    price_tiers: None,
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
                    price_tiers: None,
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
                    price_tiers: None,
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
                    price_tiers: None,
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
                    price_tiers: None,
                },
            )
            .unwrap();

        // 1. RESTOCK +15 -> stok menjadi 25
        let restock_res = service
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
        let restock = match restock_res {
            StockAdjustmentResult::Executed { adjustment } => adjustment,
            _ => panic!("Expected Executed result for admin"),
        };
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
        let valid_damage_res = service
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
        let valid_damage = match valid_damage_res {
            StockAdjustmentResult::Executed { adjustment } => adjustment,
            _ => panic!("Expected Executed result for admin"),
        };
        assert_eq!(valid_damage.stock_after, 20);

        // 4. CORRECTION ke 18 -> quantity_delta = -2, stock_after = 18
        let correction_res = service
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
        let correction = match correction_res {
            StockAdjustmentResult::Executed { adjustment } => adjustment,
            _ => panic!("Expected Executed result for admin"),
        };
        assert_eq!(correction.quantity_delta, -2);
        assert_eq!(correction.stock_after, 18);

        let logs = service
            .list_stock_adjustments(&admin, Some(&prod.id))
            .unwrap();
        // 1 initial_stock + 3 manual adjustments = 4 log entries
        assert_eq!(logs.len(), 4);
    }

    #[test]
    fn test_cashier_shift_lifecycle_and_solvency() {
        let (service, admin) = create_test_service();

        let cashier = service
            .upsert_user(
                &admin,
                &UpsertUserRequest {
                    id: None,
                    username: "kasir1".to_string(),
                    full_name: "Siti Kasir".to_string(),
                    password: Some("kasir123".to_string()),
                    pin: None,
                    role: UserRole::CASHIER,
                    is_active: true,
                },
            )
            .unwrap();

        // 1. Kasir membuka shift dengan modal awal Rp 50.000
        let shift = service
            .open_shift(
                &cashier,
                "Kasir 1",
                &OpenShiftRequest {
                    opening_float: 50_000,
                    terminal_name: None,
                    notes: Some("Buka shift pagi".to_string()),
                },
            )
            .unwrap();
        assert_eq!(shift.status, "OPEN");
        assert_eq!(shift.opening_float, 50_000);

        // 2. Membuka shift lagi saat masih OPEN ditolak
        let dup = service.open_shift(
            &cashier,
            "Kasir 1",
            &OpenShiftRequest {
                opening_float: 10_000,
                terminal_name: None,
                notes: None,
            },
        );
        assert!(dup.is_err());

        // 2b. Membuka shift kedua pada terminal yang sama oleh kasir lain (Admin) juga ditolak
        let term_dup = service.open_shift(
            &admin,
            "Kasir 1",
            &OpenShiftRequest {
                opening_float: 10_000,
                terminal_name: None,
                notes: None,
            },
        );
        assert!(term_dup.is_err());

        // 3. Kas Masuk (CASH_IN) Rp 20.000
        let mov_in = service
            .record_cash_movement(
                &cashier,
                &CashMovementRequest {
                    shift_id: shift.id.clone(),
                    movement_type: "CASH_IN".to_string(),
                    amount: 20_000,
                    reason: "Uang tukar tambahan".to_string(),
                },
            )
            .unwrap();
        assert_eq!(mov_in.amount, 20_000);

        // 4. Kas Keluar melebihi saldo laci (50rb + 20rb = 70rb, minta 80rb) ditolak (Solvency rule)
        let insolv = service.record_cash_movement(
            &cashier,
            &CashMovementRequest {
                shift_id: shift.id.clone(),
                movement_type: "CASH_OUT".to_string(),
                amount: 80_000,
                reason: "Beli bensin toko".to_string(),
            },
        );
        assert!(insolv.is_err());

        // 5. Kas Keluar valid Rp 10.000
        let mov_out = service
            .record_cash_movement(
                &cashier,
                &CashMovementRequest {
                    shift_id: shift.id.clone(),
                    movement_type: "CASH_OUT".to_string(),
                    amount: 10_000,
                    reason: "Beli kantong kresek".to_string(),
                },
            )
            .unwrap();
        assert_eq!(mov_out.amount, 10_000);

        // 6. Buat produk dan lakukan transaksi penjualan kasir
        let prod = service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: None,
                    sku: "ROTI-01".to_string(),
                    barcode: Some("8991112223334".to_string()),
                    name: "Roti Tawar Gandum".to_string(),
                    category_name: "Makanan".to_string(),
                    unit: "bungkus".to_string(),
                    cost_price: 10_000,
                    selling_price: 15_000,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(10),
                    is_active: Some(true),
                    price_tiers: None,
                },
            )
            .unwrap();

        let sale_receipt = service
            .create_sale(
                &cashier,
                "Kasir 1",
                &CreateSaleRequest {
                    items: vec![SaleItemInput {
                        product_id: prod.id.clone(),
                        quantity: 1,
                    }],
                    cash_received: 20_000,
                },
            )
            .unwrap();
        assert_eq!(sale_receipt.sale.total_amount, 15_000);
        assert_eq!(sale_receipt.sale.shift_id, Some(shift.id.clone()));

        // 7. Laporan X (Audit Sementara)
        // Saldo laci diharapkan: 50.000 (float) + 20.000 (in) - 10.000 (out) + 15.000 (penjualan) = 75.000
        let x_rep = service.get_shift_x_report(&shift.id).unwrap();
        assert_eq!(x_rep.expected_cash, 75_000);
        assert_eq!(x_rep.total_transactions, 1);
        assert_eq!(x_rep.total_cash_sales, 15_000);

        // 8. Tutup Shift (Blind Close): Kasir menghitung fisik Rp 70.000 (selisih minus 5.000)
        let closed = service
            .close_shift(
                &cashier,
                &CloseShiftRequest {
                    shift_id: shift.id.clone(),
                    actual_closing_cash: 70_000,
                    notes: Some("Tutup shift sore".to_string()),
                },
            )
            .unwrap();
        assert_eq!(closed.status, "CLOSED");
        assert_eq!(closed.expected_closing_cash, Some(75_000));
        assert_eq!(closed.actual_closing_cash, Some(70_000));
        assert_eq!(closed.cash_discrepancy, Some(-5_000));

        // 9. Pemanggilan close_shift ulang bersifat idempotent (mengembalikan snapshot tanpa error)
        let closed_again = service
            .close_shift(
                &cashier,
                &CloseShiftRequest {
                    shift_id: shift.id.clone(),
                    actual_closing_cash: 70_000,
                    notes: Some("Retry tutup shift".to_string()),
                },
            )
            .unwrap();
        assert_eq!(closed_again.status, "CLOSED");
        assert_eq!(closed_again.actual_closing_cash, Some(70_000));
    }

    #[test]
    fn test_mass_stock_opname_flow_and_commit() {
        let (service, admin) = create_test_service();

        // Siapkan produk stok awal 20
        let prod = service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: None,
                    sku: "MIE-01".to_string(),
                    barcode: Some("8990001112223".to_string()),
                    name: "Mie Sedap Goreng".to_string(),
                    category_name: "Makanan".to_string(),
                    unit: "bungkus".to_string(),
                    cost_price: 2_500,
                    selling_price: 3_500,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(20),
                    is_active: Some(true),
                    price_tiers: None,
                },
            )
            .unwrap();

        // 1. Buat sesi stok opname
        let session = service
            .create_opname_session(
                &admin,
                &CreateOpnameSessionRequest {
                    session_name: Some("Opname Lorong 1".to_string()),
                    notes: Some("Audit berkala".to_string()),
                },
            )
            .unwrap();
        assert_eq!(session.status, "COUNTING");

        // 2. Sesi konkuren kedua harus ditolak
        let dup = service.create_opname_session(
            &admin,
            &CreateOpnameSessionRequest {
                session_name: Some("Opname Lorong 2".to_string()),
                notes: None,
            },
        );
        assert!(dup.is_err());

        // 3. Scan produk dengan mode REPLACE (hitung fisik = 15)
        let scan1 = service
            .record_opname_scan(
                &admin,
                &RecordOpnameScanRequest {
                    session_id: session.id.clone(),
                    product_identifier: "8990001112223".to_string(),
                    count_mode: "REPLACE".to_string(),
                    quantity: 15,
                },
            )
            .unwrap();
        assert_eq!(scan1.physical_count, 15);
        assert_eq!(scan1.system_stock_snapshot, 20);
        assert_eq!(scan1.discrepancy, -5);

        // 4. Update manual kuantitas fisik menjadi 18
        let updated = service
            .update_opname_item_qty(
                &admin,
                &UpdateOpnameItemQtyRequest {
                    item_id: scan1.id.clone(),
                    physical_count: 18,
                },
            )
            .unwrap();
        assert_eq!(updated.physical_count, 18);
        assert_eq!(updated.discrepancy, -2);
        assert_eq!(updated.discrepancy_cost, -5_000); // -2 * 2500

        // 5. Commit dengan PIN salah -> ditolak
        let bad_commit = service.commit_opname_session(
            &admin,
            &CommitOpnameSessionRequest {
                session_id: session.id.clone(),
                admin_pin: "000000".to_string(),
            },
        );
        assert!(bad_commit.is_err());

        // 6. Commit dengan PIN benar ("123456") -> sukses
        let committed = service
            .commit_opname_session(
                &admin,
                &CommitOpnameSessionRequest {
                    session_id: session.id.clone(),
                    admin_pin: "123456".to_string(),
                },
            )
            .unwrap();
        assert_eq!(committed.status, "COMMITTED");

        // 7. Cek stok produk sekarang terupdate otomatis menjadi 18
        let current_prod = service.find_product_by_code(&admin, &prod.sku).unwrap();
        assert_eq!(current_prod.stock, 18);

        // 8. Buat sesi opname kedua lalu batalkan dengan alasan tersimpan di notes
        let sess2 = service
            .create_opname_session(
                &admin,
                &CreateOpnameSessionRequest {
                    session_name: Some("Opname Uji Batal".to_string()),
                    notes: Some("Catatan awal".to_string()),
                },
            )
            .unwrap();
        let cancelled = service
            .cancel_opname_session(&admin, &sess2.id, "Toko mendadak ramai kasir")
            .unwrap();
        assert_eq!(cancelled.status, "CANCELLED");
        assert!(cancelled.notes.as_deref().unwrap().contains("Toko mendadak ramai kasir"));

        // 9. Verifikasi penyaringan status list_opname_sessions
        let counting_after_cancel = service.list_opname_sessions(Some("COUNTING")).unwrap();
        assert_eq!(counting_after_cancel.len(), 0);

        let cancelled_sessions = service.list_opname_sessions(Some("CANCELLED")).unwrap();
        assert_eq!(cancelled_sessions.len(), 1);
        assert_eq!(cancelled_sessions[0].id, sess2.id);

        let committed_sessions = service.list_opname_sessions(Some("COMMITTED")).unwrap();
        assert_eq!(committed_sessions.len(), 1);
        assert_eq!(committed_sessions[0].id, session.id);

        let all_sessions = service.list_opname_sessions(None).unwrap();
        assert_eq!(all_sessions.len(), 2);

        // 10. Buka sesi baru setelah pembatalan harus langsung sukses (tidak boleh terganjal sesi aktif)
        let sess3 = service
            .create_opname_session(
                &admin,
                &CreateOpnameSessionRequest {
                    session_name: Some("Opname Sesi Baru Pasca Batal".to_string()),
                    notes: None,
                },
            )
            .unwrap();
        assert_eq!(sess3.status, "COUNTING");

        let counting_now = service.list_opname_sessions(Some("COUNTING")).unwrap();
        assert_eq!(counting_now.len(), 1);
        assert_eq!(counting_now[0].id, sess3.id);
    }

    #[test]
    fn test_product_tiered_pricing_setup_and_sale() {
        let (service, admin) = create_test_service();

        // 1. Buat produk dasar harga Rp 5.000, diskon reguler Rp 500
        let prod = service
            .upsert_product(
                &admin,
                "Kasir 1",
                &UpsertProductRequest {
                    id: None,
                    sku: "SABUN-01".to_string(),
                    barcode: Some("8995556667778".to_string()),
                    name: "Sabun Mandi Wangi".to_string(),
                    category_name: "Kebersihan".to_string(),
                    unit: "pcs".to_string(),
                    cost_price: 3_000,
                    selling_price: 5_000,
                    discount_type: DiscountType::NOMINAL,
                    discount_value: 500, // Harga diskon reguler = 4.500
                    initial_stock: Some(50),
                    is_active: Some(true),
                    price_tiers: None,
                },
            )
            .unwrap();

        // 2. Set harga bertingkat: beli >= 5 harga Rp 4.000 / pcs
        let tiers = service
            .set_product_price_tiers(
                &admin,
                &SetPriceTiersRequest {
                    product_id: prod.id.clone(),
                    tiers: vec![PriceTierInput {
                        min_quantity: 5,
                        tier_price: 4_000,
                    }],
                },
            )
            .unwrap();
        assert_eq!(tiers.len(), 1);
        assert_eq!(tiers[0].min_quantity, 5);
        assert_eq!(tiers[0].tier_price, 4_000);

        // 3. Validasi tier: tier_price >= selling_price ditolak
        let invalid_tier = service.set_product_price_tiers(
            &admin,
            &SetPriceTiersRequest {
                product_id: prod.id.clone(),
                tiers: vec![PriceTierInput {
                    min_quantity: 5,
                    tier_price: 5_500,
                }],
            },
        );
        assert!(invalid_tier.is_err());

        // 3b. Validasi tier: tier_price < cost_price (HPP) ditolak guna melindungi margin
        let below_cost_tier = service.set_product_price_tiers(
            &admin,
            &SetPriceTiersRequest {
                product_id: prod.id.clone(),
                tiers: vec![PriceTierInput {
                    min_quantity: 5,
                    tier_price: 2_500, // < cost_price 3.000
                }],
            },
        );
        assert!(below_cost_tier.is_err());

        // 4. Admin buat shift dulu untuk transaksi
        let shift = service
            .open_shift(
                &admin,
                "Kasir Server",
                &OpenShiftRequest {
                    opening_float: 100_000,
                    terminal_name: None,
                    notes: None,
                },
            )
            .unwrap();
        assert_eq!(shift.status, "OPEN");

        // 5. Pembelian di bawah tier (qty = 3) -> menggunakan harga reguler diskon: 3 * (5000 - 500) = 13.500
        let sale_below = service
            .create_sale(
                &admin,
                "Kasir Server",
                &CreateSaleRequest {
                    items: vec![SaleItemInput {
                        product_id: prod.id.clone(),
                        quantity: 3,
                    }],
                    cash_received: 20_000,
                },
            )
            .unwrap();
        assert_eq!(sale_below.sale.total_amount, 13_500);
        let receipt_below = service.get_sale_receipt(&admin, &sale_below.sale.id, false).unwrap();
        assert_eq!(receipt_below.items[0].applied_tier_min_qty, None);

        // 6. Pembelian mencapai tier (qty = 6) -> menggunakan tier price (BR-04: menonaktifkan diskon reguler)
        // Subtotal = 6 * 4.000 = 24.000
        let sale_tiered = service
            .create_sale(
                &admin,
                "Kasir Server",
                &CreateSaleRequest {
                    items: vec![SaleItemInput {
                        product_id: prod.id.clone(),
                        quantity: 6,
                    }],
                    cash_received: 30_000,
                },
            )
            .unwrap();
        assert_eq!(sale_tiered.sale.total_amount, 24_000);
        let receipt_tiered = service.get_sale_receipt(&admin, &sale_tiered.sale.id, false).unwrap();
        assert_eq!(receipt_tiered.items[0].applied_tier_min_qty, Some(5));
        assert_eq!(receipt_tiered.items[0].applied_tier_price, Some(4_000));
        assert_eq!(receipt_tiered.items[0].subtotal, 24_000);
    }

    #[test]
    fn test_stock_keeper_approval_threshold_and_admin_pin_flow() {
        let (service, admin) = create_test_service();

        // 1. Buat user Petugas Stok
        let stock_keeper = service
            .upsert_user(
                &admin,
                &UpsertUserRequest {
                    id: None,
                    username: "petugas_stok".to_string(),
                    full_name: "Budi Petugas Gudang".to_string(),
                    role: UserRole::STOCK,
                    password: Some("password123".to_string()),
                    pin: None,
                    is_active: true,
                },
            )
            .unwrap();

        // 2. Tambah produk: Beras Rojolele 5kg (cost: 50.000, stock: 100)
        let beras = service
            .upsert_product(
                &admin,
                "Terminal Server",
                &UpsertProductRequest {
                    id: None,
                    sku: "BRS-5KG".to_string(),
                    barcode: Some("899123450001".to_string()),
                    name: "Beras Rojolele 5kg".to_string(),
                    category_name: "Sembako".to_string(),
                    unit: "sak".to_string(),
                    cost_price: 50_000,
                    selling_price: 65_000,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(100),
                    is_active: Some(true),
                    price_tiers: None,
                },
            )
            .unwrap();

        // 3. Penyesuaian di bawah ambang batas (1 sak = Rp 50.000 < 100.000, 1% < 10%)
        // Langsung dieksekusi tanpa persetujuan
        let adj_below = service
            .create_stock_adjustment(
                &stock_keeper,
                "Terminal Gudang",
                &CreateStockAdjustmentRequest {
                    product_id: beras.id.clone(),
                    adjustment_type: AdjustmentType::DAMAGE,
                    quantity: 1,
                    note: "Karung robek sedikit".to_string(),
                },
            )
            .unwrap();

        match adj_below {
            StockAdjustmentResult::Executed { adjustment } => {
                assert_eq!(adjustment.stock_after, 99);
            }
            _ => panic!("Expected Executed result for below-threshold adjustment"),
        }

        // Verifikasi stok di DB telah berkurang menjadi 99
        let beras_updated = service.find_product_by_code(&stock_keeper, "BRS-5KG").unwrap();
        assert_eq!(beras_updated.stock, 99);

        // 4. Penyesuaian melebihi ambang nominal (3 sak * 50.000 = Rp 150.000 >= 100.000)
        // Wajib berstatus PendingApproval dan stok TIDAK berkurang!
        let adj_above_amount = service
            .create_stock_adjustment(
                &stock_keeper,
                "Terminal Gudang",
                &CreateStockAdjustmentRequest {
                    product_id: beras.id.clone(),
                    adjustment_type: AdjustmentType::DAMAGE,
                    quantity: 3,
                    note: "Kena rembesan hujan di gudang".to_string(),
                },
            )
            .unwrap();

        let req_id = match adj_above_amount {
            StockAdjustmentResult::PendingApproval { request } => {
                assert_eq!(request.status, "PENDING");
                assert_eq!(request.quantity_delta, -3);
                assert_eq!(request.total_estimated_value, 150_000);
                assert_eq!(request.requested_by, stock_keeper.id);
                request.id
            }
            _ => panic!("Expected PendingApproval result for above-threshold adjustment"),
        };

        // Stok produk tetap 99
        let beras_pending = service.find_product_by_code(&stock_keeper, "BRS-5KG").unwrap();
        assert_eq!(beras_pending.stock, 99);

        // 5. Admin menolak permohonan dengan PIN valid
        // Verifikasi PIN salah terlebih dahulu
        let reject_wrong_pin = service.reject_stock_adjustment_request(
            &admin,
            &RejectStockAdjustmentRequest {
                request_id: req_id.clone(),
                admin_pin: "999999".to_string(),
                rejection_reason: "PIN salah test".to_string(),
            },
        );
        assert!(reject_wrong_pin.is_err());

        // Tolak dengan PIN benar ("123456")
        service
            .reject_stock_adjustment_request(
                &admin,
                &RejectStockAdjustmentRequest {
                    request_id: req_id.clone(),
                    admin_pin: "123456".to_string(),
                    rejection_reason: "Setelah dicek karung masih layak jual".to_string(),
                },
            )
            .unwrap();

        // Stok tetap 99
        let beras_after_reject = service.find_product_by_code(&stock_keeper, "BRS-5KG").unwrap();
        assert_eq!(beras_after_reject.stock, 99);

        // 6. Produk kedua: Lolipop (cost: 1.000, stock: 20)
        // Penyesuaian 3 pcs (Rp 3.000 < 100.000, TAPI 3/20 = 15% >= 10%)
        let lolipop = service
            .upsert_product(
                &admin,
                "Terminal Server",
                &UpsertProductRequest {
                    id: None,
                    sku: "LOL-001".to_string(),
                    barcode: Some("899123450002".to_string()),
                    name: "Permen Lolipop".to_string(),
                    category_name: "Makanan".to_string(),
                    unit: "pcs".to_string(),
                    cost_price: 1_000,
                    selling_price: 2_000,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(20),
                    is_active: Some(true),
                    price_tiers: None,
                },
            )
            .unwrap();

        let adj_above_percent = service
            .create_stock_adjustment(
                &stock_keeper,
                "Terminal Gudang",
                &CreateStockAdjustmentRequest {
                    product_id: lolipop.id.clone(),
                    adjustment_type: AdjustmentType::LOSS,
                    quantity: 3,
                    note: "Hilang saat display toko".to_string(),
                },
            )
            .unwrap();

        let lolipop_req_id = match adj_above_percent {
            StockAdjustmentResult::PendingApproval { request } => {
                assert_eq!(request.status, "PENDING");
                assert_eq!(request.discrepancy_percent, 15);
                request.id
            }
            _ => panic!("Expected PendingApproval due to 15% discrepancy >= 10% threshold"),
        };

        // 7. Admin menyetujui permohonan dengan PIN valid
        // Coba approve oleh Petugas Stok (bukan admin) -> wajib ditolak (Forbidden)
        let approve_by_stock_keeper = service.approve_stock_adjustment_request(
            &stock_keeper,
            &ApproveStockAdjustmentRequest {
                request_id: lolipop_req_id.clone(),
                admin_pin: "123456".to_string(),
            },
        );
        assert!(approve_by_stock_keeper.is_err());

        // Approve oleh Admin dengan PIN benar
        let approved_adj = service
            .approve_stock_adjustment_request(
                &admin,
                &ApproveStockAdjustmentRequest {
                    request_id: lolipop_req_id.clone(),
                    admin_pin: "123456".to_string(),
                },
            )
            .unwrap();

        assert_eq!(approved_adj.stock_after, 17);

        // Verifikasi stok produk lolipop di DB berkurang menjadi 17
        let lolipop_final = service.find_product_by_code(&admin, "LOL-001").unwrap();
        assert_eq!(lolipop_final.stock, 17);

        // 8. Verifikasi Audit Log tercatat lengkap
        let audit_logs = service.list_audit_logs(&admin, None, Some(10)).unwrap();
        let actions = audit_logs.iter().map(|l| l.action.as_str()).collect::<Vec<_>>();
        assert!(actions.contains(&"STOCK_ADJUSTMENT_APPROVED"));
        assert!(actions.contains(&"STOCK_ADJUSTMENT_REJECTED"));
    }

    #[test]
    fn test_comprehensive_financial_profit_and_stock_reports() {
        let (service, admin) = create_test_service();

        // 1. Buat user Petugas Laporan & Petugas Stok
        let reporter = service
            .upsert_user(
                &admin,
                &UpsertUserRequest {
                    id: None,
                    username: "petugas_laporan".to_string(),
                    full_name: "Siti Petugas Laporan".to_string(),
                    role: UserRole::REPORTER,
                    password: Some("password123".to_string()),
                    pin: None,
                    is_active: true,
                },
            )
            .unwrap();

        let stock_keeper = service
            .upsert_user(
                &admin,
                &UpsertUserRequest {
                    id: None,
                    username: "petugas_stok2".to_string(),
                    full_name: "Anto Petugas Stok".to_string(),
                    role: UserRole::STOCK,
                    password: Some("password123".to_string()),
                    pin: None,
                    is_active: true,
                },
            )
            .unwrap();

        // 2. Tambah 2 produk dengan kategori berbeda
        let minyak = service
            .upsert_product(
                &admin,
                "Terminal Server",
                &UpsertProductRequest {
                    id: None,
                    sku: "MYK-2L".to_string(),
                    barcode: Some("899111111111".to_string()),
                    name: "Minyak Goreng 2L".to_string(),
                    category_name: "Sembako".to_string(),
                    unit: "pouch".to_string(),
                    cost_price: 28_000,
                    selling_price: 35_000,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(50),
                    is_active: Some(true),
                    price_tiers: None,
                },
            )
            .unwrap();

        let sabun = service
            .upsert_product(
                &admin,
                "Terminal Server",
                &UpsertProductRequest {
                    id: None,
                    sku: "SBN-100G".to_string(),
                    barcode: Some("899222222222".to_string()),
                    name: "Sabun Mandi 100g".to_string(),
                    category_name: "Kebutuhan Rumah".to_string(),
                    unit: "pcs".to_string(),
                    cost_price: 3_000,
                    selling_price: 5_000,
                    discount_type: DiscountType::NOMINAL,
                    discount_value: 500, // effective selling price = 4.500
                    initial_stock: Some(100),
                    is_active: Some(true),
                    price_tiers: None,
                },
            )
            .unwrap();

        // 3. Buka shift kasir dengan modal Rp 100.000
        let shift = service
            .open_shift(
                &admin,
                "Terminal Server",
                &OpenShiftRequest {
                    opening_float: 100_000,
                    terminal_name: Some("Terminal Server".to_string()),
                    notes: Some("Shift Pagi".to_string()),
                },
            )
            .unwrap();

        // 4. Buat transaksi penjualan:
        // - 2 pouch Minyak Goreng: 2 * 35.000 = 70.000
        // - 4 pcs Sabun Mandi: 4 * 4.500 = 18.000 (diskon 4 * 500 = 2.000, gross 20.000)
        // Total Omzet Kotor = 90.000, Total Diskon = 2.000, Net Sales = 88.000
        use crate::models::SaleItemInput;
        let sale_res = service
            .create_sale(
                &admin,
                "Terminal Server",
                &CreateSaleRequest {
                    items: vec![
                        SaleItemInput {
                            product_id: minyak.id.clone(),
                            quantity: 2,
                        },
                        SaleItemInput {
                            product_id: sabun.id.clone(),
                            quantity: 4,
                        },
                    ],
                    cash_received: 100_000,
                },
            )
            .unwrap();
        assert_eq!(sale_res.sale.total_amount, 88_000);

        // 5. Mutasi kas kasir: IN 20.000 dan OUT 15.000
        service
            .record_cash_movement(
                &admin,
                &CashMovementRequest {
                    shift_id: shift.id.clone(),
                    movement_type: "IN".to_string(),
                    amount: 20_000,
                    reason: "Pecahan uang kembalian".to_string(),
                },
            )
            .unwrap();

        service
            .record_cash_movement(
                &admin,
                &CashMovementRequest {
                    shift_id: shift.id.clone(),
                    movement_type: "OUT".to_string(),
                    amount: 15_000,
                    reason: "Beli air galon".to_string(),
                },
            )
            .unwrap();

        // 6. Tutup shift kasir (expected = 100.000 + 88.000 + 20.000 - 15.000 = 193.000)
        service
            .close_shift(
                &admin,
                &CloseShiftRequest {
                    shift_id: shift.id.clone(),
                    actual_closing_cash: 193_000,
                    notes: Some("Tutup shift klop".to_string()),
                },
            )
            .unwrap();

        let today = CoreService::today_date_str();
        let filter = SalesReportFilter {
            start_date: today.clone(),
            end_date: today.clone(),
            cashier_id: None,
            terminal_name: None,
        };

        // 7. Pengujian Laporan Keuangan (Financial Report)
        // Reporter berhak melihat laporan keuangan
        let fin_rep = service.get_financial_report(&reporter, &filter).unwrap();
        assert_eq!(fin_rep.completed_sales_count, 1);
        assert_eq!(fin_rep.voided_sales_count, 0);
        assert_eq!(fin_rep.gross_sales, 90_000);
        assert_eq!(fin_rep.total_discount, 2_000);
        assert_eq!(fin_rep.net_sales, 88_000);
        assert_eq!(fin_rep.cash_sales, 88_000);
        assert_eq!(fin_rep.cash_in_amount, 120_000); // 100.000 float + 20.000 in
        assert_eq!(fin_rep.cash_out_amount, 15_000);
        assert_eq!(fin_rep.total_shift_discrepancy, 0);
        assert_eq!(fin_rep.net_cash_flow, 193_000);
        assert!(!fin_rep.daily_summaries.is_empty());

        // Petugas Stok DILARANG mengakses laporan keuangan
        let fin_rep_forbidden = service.get_financial_report(&stock_keeper, &filter);
        assert!(fin_rep_forbidden.is_err());

        // 8. Pengujian Laporan Laba Kotor (Profit Report)
        // Reporter berhak melihat laporan laba
        let prof_rep = service.get_profit_report(&reporter, &filter).unwrap();
        assert_eq!(prof_rep.net_sales, 88_000);
        // COGS: 2 * 28.000 + 4 * 3.000 = 56.000 + 12.000 = 68.000
        assert_eq!(prof_rep.total_cogs, 68_000);
        // Gross Profit: 88.000 - 68.000 = 20.000
        assert_eq!(prof_rep.gross_profit, 20_000);
        // Margin: 20.000 / 88.000 * 100 = 22.73%
        assert_eq!(prof_rep.profit_margin_pct, 22.73);
        assert_eq!(prof_rep.category_profits.len(), 2);

        // Petugas Stok DILARANG mengakses laporan laba
        let prof_rep_forbidden = service.get_profit_report(&stock_keeper, &filter);
        assert!(prof_rep_forbidden.is_err());

        // 9. Pengujian Laporan Inventaris & Nilai Stok (Stock Report)
        // Petugas Stok BERHAK mengakses laporan inventaris stok
        let stock_rep = service.get_stock_report(&stock_keeper, None, None).unwrap();
        assert_eq!(stock_rep.total_products, 2);
        assert_eq!(stock_rep.active_products, 2);
        // Stok tersisa: Minyak (50 - 2 = 48), Sabun (100 - 4 = 96) -> Total 144
        assert_eq!(stock_rep.total_stock_qty, 144);
        // Valuasi HPP: 48 * 28.000 + 96 * 3.000 = 1.344.000 + 288.000 = 1.632.000
        assert_eq!(stock_rep.total_cost_valuation, 1_632_000);
        // Valuasi Jual: 48 * 35.000 + 96 * 5.000 = 1.680.000 + 480.000 = 2.160.000
        assert_eq!(stock_rep.total_retail_valuation, 2_160_000);
        assert_eq!(stock_rep.potential_profit, 528_000);
        assert_eq!(stock_rep.movements.sold_qty, 6);
        assert_eq!(stock_rep.items.len(), 2);
    }
}
