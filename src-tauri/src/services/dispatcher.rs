use crate::config::{detect_local_lan_ips, LocalConfig, PrinterConfig, TerminalMode};
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::lan::client::RemoteHttpClient;
use crate::lan::server::spawn_lan_server;
use crate::models::{
    AuthSession, CashMovement, CashMovementRequest, CashierShift, CloseShiftRequest,
    CommitOpnameSessionRequest, CreateHeldBillRequest, CreateOpnameSessionRequest, CreateSaleRequest,
    CreateStockAdjustmentRequest, CsvImportResult, HealthCheckResponse, HeldBill,
    ImportProductsResult, LoginRequest, OpenShiftRequest, OpnameSessionDetail, Product,
    ProductFilter, ProductImportRow, ProductPriceTier, RecalledHeldBill, ReceiptData,
    RecordOpnameScanRequest, SaleWithItems, SalesReport, SalesReportFilter, SetPriceTiersRequest,
    SetupClientRequest, SetupServerRequest, ShiftReportData, StockAdjustment, StockOpnameItem,
    StockOpnameSession, StoreSettings, TerminalStatus, UpdateOpnameItemQtyRequest,
    UpdateStoreSettingsRequest, UpsertProductRequest, UpsertUserRequest, User, VoidSaleRequest,
};
use crate::services::core_service::CoreService;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tokio::sync::Mutex as AsyncMutex;

pub struct BackendDispatcher {
    app_data_dir: PathBuf,
    config: RwLock<LocalConfig>,
    core: Arc<CoreService>,
    active_session: RwLock<Option<AuthSession>>,
    lan_server_handle: AsyncMutex<Option<tokio::task::JoinHandle<()>>>,
}

impl BackendDispatcher {
    pub fn new(app_data_dir: PathBuf) -> AppResult<Self> {
        let config = LocalConfig::load_or_default(&app_data_dir)?;
        let db_path = app_data_dir.join("muditamart.db");
        let db = Arc::new(Database::open_file(&db_path)?);
        let core = Arc::new(CoreService::new(db));

        Ok(Self {
            app_data_dir,
            config: RwLock::new(config),
            core,
            active_session: RwLock::new(None),
            lan_server_handle: AsyncMutex::new(None),
        })
    }

    pub fn app_data_dir(&self) -> &Path {
        &self.app_data_dir
    }

    pub fn get_config(&self) -> LocalConfig {
        self.config
            .read()
            .map(|c| c.clone())
            .unwrap_or_default()
    }

    pub fn is_server_mode(&self) -> bool {
        self.get_config().terminal_mode == TerminalMode::SERVER
    }

    fn save_config(&self, new_cfg: LocalConfig) -> AppResult<LocalConfig> {
        new_cfg.save(&self.app_data_dir)?;
        if let Ok(mut guard) = self.config.write() {
            *guard = new_cfg.clone();
        }
        Ok(new_cfg)
    }

    pub async fn ensure_lan_server_running(&self) -> AppResult<()> {
        let cfg = self.get_config();
        if cfg.terminal_mode != TerminalMode::SERVER {
            return Ok(());
        }
        let mut guard = self.lan_server_handle.lock().await;
        if guard.is_some() {
            return Ok(());
        }

        let bind_addr = format!("0.0.0.0:{}", cfg.server_bind_port);
        match spawn_lan_server(
            self.core.clone(),
            cfg.terminal_name.clone(),
            &bind_addr,
        )
        .await
        {
            Ok((_addr, handle)) => {
                *guard = Some(handle);
                Ok(())
            }
            Err(e) => {
                // Jangan menggagalkan startup aplikasi jika port sudah dipakai oleh instance lain
                eprintln!("Peringatan bind server LAN ({bind_addr}): {e}");
                Ok(())
            }
        }
    }

    fn remote_client_for_config(cfg: &LocalConfig) -> RemoteHttpClient {
        RemoteHttpClient::new(
            &cfg.client_target_ip,
            cfg.client_target_port,
            &cfg.pairing_code,
            &cfg.terminal_name,
        )
    }

    fn require_local_session(&self) -> AppResult<AuthSession> {
        let guard = self
            .active_session
            .read()
            .map_err(|_| AppError::Database("Gagal membaca sesi aktif.".to_string()))?;
        guard.clone().ok_or_else(|| {
            AppError::Unauthorized("Silakan login terlebih dahulu.".to_string())
        })
    }

    pub fn get_active_session(&self) -> Option<AuthSession> {
        self.active_session.read().ok().and_then(|g| g.clone())
    }

    // ========================================================================
    // 1. Setup Terminal, Status Koneksi LAN, & Pengaturan Printer Lokal
    // ========================================================================

    pub async fn get_terminal_status(&self) -> AppResult<TerminalStatus> {
        let mut cfg = self.get_config();
        // Jika local_config mengklaim SERVER tapi database belum diinisialisasi, kembalikan ke UNCONFIGURED
        if cfg.terminal_mode == TerminalMode::SERVER && !self.core.is_initialized()? {
            cfg.terminal_mode = TerminalMode::UNCONFIGURED;
        }

        let local_lan_ips = detect_local_lan_ips();

        match cfg.terminal_mode {
            TerminalMode::UNCONFIGURED => Ok(TerminalStatus {
                config: cfg,
                local_lan_ips,
                lan_connected: false,
                store_name: None,
                server_error: None,
            }),
            TerminalMode::SERVER => {
                let _ = self.ensure_lan_server_running().await;
                match self.core.get_store_settings() {
                    Ok(settings) => {
                        if cfg.pairing_code != settings.pairing_code {
                            cfg.pairing_code = settings.pairing_code.clone();
                            let _ = self.save_config(cfg.clone());
                        }
                        Ok(TerminalStatus {
                            config: cfg,
                            local_lan_ips,
                            lan_connected: true,
                            store_name: Some(settings.store_name),
                            server_error: None,
                        })
                    }
                    Err(e) => Ok(TerminalStatus {
                        config: cfg,
                        local_lan_ips,
                        lan_connected: false,
                        store_name: None,
                        server_error: Some(e.to_string()),
                    }),
                }
            }
            TerminalMode::CLIENT => {
                let client = Self::remote_client_for_config(&cfg);
                match client.health_check().await {
                    Ok(health) => Ok(TerminalStatus {
                        config: cfg,
                        local_lan_ips,
                        lan_connected: true,
                        store_name: Some(health.store_name),
                        server_error: None,
                    }),
                    Err(e) => Ok(TerminalStatus {
                        config: cfg,
                        local_lan_ips,
                        lan_connected: false,
                        store_name: None,
                        server_error: Some(e.to_string()),
                    }),
                }
            }
        }
    }

    pub async fn test_client_connection(
        &self,
        req: &SetupClientRequest,
    ) -> AppResult<HealthCheckResponse> {
        if req.server_ip.trim().is_empty() {
            return Err(AppError::Validation("IP Server wajib diisi.".to_string()));
        }
        if req.pairing_code.trim().is_empty() {
            return Err(AppError::Validation(
                "Pairing Code wajib diisi.".to_string(),
            ));
        }
        let client = RemoteHttpClient::new(
            &req.server_ip,
            req.server_port,
            &req.pairing_code,
            &req.terminal_name,
        );
        client.health_check().await
    }

    pub async fn setup_server_terminal(
        &self,
        req: &SetupServerRequest,
    ) -> AppResult<TerminalStatus> {
        let settings = self.core.setup_server(req)?;
        let mut cfg = self.get_config();
        cfg.terminal_mode = TerminalMode::SERVER;
        cfg.terminal_name = if req.terminal_name.trim().is_empty() {
            "Kasir Utama (Server)".to_string()
        } else {
            req.terminal_name.trim().to_string()
        };
        cfg.pairing_code = settings.pairing_code;
        self.save_config(cfg)?;
        self.ensure_lan_server_running().await?;
        self.get_terminal_status().await
    }

    pub async fn setup_client_terminal(
        &self,
        req: &SetupClientRequest,
    ) -> AppResult<TerminalStatus> {
        let terminal_name = if req.terminal_name.trim().is_empty() {
            "Kasir Client".to_string()
        } else {
            req.terminal_name.trim().to_string()
        };
        let _health = self.test_client_connection(req).await?;

        let mut cfg = self.get_config();
        cfg.terminal_mode = TerminalMode::CLIENT;
        cfg.terminal_name = terminal_name;
        cfg.client_target_ip = req.server_ip.trim().to_string();
        cfg.client_target_port = req.server_port;
        cfg.pairing_code = req.pairing_code.trim().to_uppercase();
        self.save_config(cfg)?;
        self.get_terminal_status().await
    }

    pub fn update_printer_config(&self, printer: PrinterConfig) -> AppResult<LocalConfig> {
        let mut cfg = self.get_config();
        cfg.printer = printer;
        self.save_config(cfg)
    }

    // ========================================================================
    // 2. Operasi Domain Terdistribusi (Server Lokal vs Client LAN HTTP)
    // ========================================================================

    pub async fn login(&self, req: &LoginRequest) -> AppResult<AuthSession> {
        let cfg = self.get_config();
        let session = match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.login(req)?,
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg).login(req).await?
            }
            TerminalMode::UNCONFIGURED => {
                return Err(AppError::Validation(
                    "Terminal belum dikonfigurasi. Silakan selesaikan Setup Wizard terlebih dahulu."
                        .to_string(),
                ))
            }
        };

        if let Ok(mut guard) = self.active_session.write() {
            *guard = Some(session.clone());
        }
        Ok(session)
    }

    pub async fn logout(&self) -> AppResult<()> {
        let current = self.get_active_session();
        if let Ok(mut guard) = self.active_session.write() {
            *guard = None;
        }
        if let Some(sess) = current {
            let cfg = self.get_config();
            match cfg.terminal_mode {
                TerminalMode::SERVER => {
                    let _ = self.core.logout(&sess.session_token);
                }
                TerminalMode::CLIENT => {
                    let _ = Self::remote_client_for_config(&cfg)
                        .logout(&sess.session_token)
                        .await;
                }
                TerminalMode::UNCONFIGURED => {}
            }
        }
        Ok(())
    }

    pub async fn list_products(&self, filter: &ProductFilter) -> AppResult<Vec<Product>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.list_products(&sess.user, filter),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .list_products(&sess.session_token, filter)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn find_product_by_code(&self, code: &str) -> AppResult<Product> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.find_product_by_code(&sess.user, code),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .find_product_by_code(&sess.session_token, code)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn upsert_product(&self, req: &UpsertProductRequest) -> AppResult<Product> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => {
                self.core
                    .upsert_product(&sess.user, &cfg.terminal_name, req)
            }
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .upsert_product(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn deactivate_product(&self, product_id: &str) -> AppResult<()> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.deactivate_product(&sess.user, product_id),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .deactivate_product(&sess.session_token, product_id)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn export_products_csv(&self) -> AppResult<String> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.export_products_csv(&sess.user),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .export_products_csv(&sess.session_token)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn import_products_csv(&self, csv_content: &str) -> AppResult<CsvImportResult> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => {
                self.core
                    .import_products_csv(&sess.user, &cfg.terminal_name, csv_content)
            }
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .import_products_csv(&sess.session_token, csv_content)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn import_products(&self, rows: Vec<ProductImportRow>) -> AppResult<ImportProductsResult> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => {
                self.core
                    .import_products_rows(&sess.user, &cfg.terminal_name, rows)
            }
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .import_products(&sess.session_token, &rows)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn create_stock_adjustment(
        &self,
        req: &CreateStockAdjustmentRequest,
    ) -> AppResult<StockAdjustment> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => {
                self.core
                    .create_stock_adjustment(&sess.user, &cfg.terminal_name, req)
            }
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .create_stock_adjustment(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn list_stock_adjustments(
        &self,
        product_id: Option<&str>,
    ) -> AppResult<Vec<StockAdjustment>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.list_stock_adjustments(&sess.user, product_id),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .list_stock_adjustments(&sess.session_token, product_id)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn create_sale(&self, req: &CreateSaleRequest) -> AppResult<ReceiptData> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.create_sale(&sess.user, &cfg.terminal_name, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .create_sale(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn list_today_sales(&self) -> AppResult<Vec<SaleWithItems>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.list_today_sales(&sess.user),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .list_today_sales(&sess.session_token)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn get_sale_receipt(
        &self,
        sale_id: &str,
        is_reprint: bool,
    ) -> AppResult<ReceiptData> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.get_sale_receipt(&sess.user, sale_id, is_reprint),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .get_sale_receipt(&sess.session_token, sale_id, is_reprint)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn void_sale(&self, req: &VoidSaleRequest) -> AppResult<SaleWithItems> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.void_sale(&sess.user, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .void_sale(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn create_held_bill(&self, req: &CreateHeldBillRequest) -> AppResult<HeldBill> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => {
                self.core
                    .create_held_bill(&sess.user, &cfg.terminal_name, req)
            }
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .create_held_bill(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn list_held_bills(&self) -> AppResult<Vec<HeldBill>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.list_held_bills(),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .list_held_bills(&sess.session_token)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn consume_held_bill(&self, held_bill_id: &str) -> AppResult<RecalledHeldBill> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.consume_held_bill(held_bill_id),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .consume_held_bill(&sess.session_token, held_bill_id)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn delete_held_bill(&self, held_bill_id: &str) -> AppResult<()> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.delete_held_bill(held_bill_id),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .delete_held_bill(&sess.session_token, held_bill_id)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn get_sales_report(&self, filter: &SalesReportFilter) -> AppResult<SalesReport> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.get_sales_report(&sess.user, filter),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .get_sales_report(&sess.session_token, filter)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn export_sales_report_csv(&self, filter: &SalesReportFilter) -> AppResult<String> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.export_sales_report_csv(&sess.user, filter),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .export_sales_report_csv(&sess.session_token, filter)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn list_users(&self) -> AppResult<Vec<User>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.list_users(&sess.user),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .list_users(&sess.session_token)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn upsert_user(&self, req: &UpsertUserRequest) -> AppResult<User> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.upsert_user(&sess.user, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .upsert_user(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn get_store_settings(&self) -> AppResult<StoreSettings> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.get_store_settings(),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .get_store_settings(&sess.session_token)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn update_store_settings(
        &self,
        req: &UpdateStoreSettingsRequest,
    ) -> AppResult<StoreSettings> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => {
                let updated = self.core.update_store_settings(&sess.user, req)?;
                if req.regenerate_pairing_code {
                    let mut new_cfg = cfg;
                    new_cfg.pairing_code = updated.pairing_code.clone();
                    let _ = self.save_config(new_cfg);
                }
                Ok(updated)
            }
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .update_store_settings(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub fn backup_database(&self, target_path: &Path) -> AppResult<String> {
        let sess = self.require_local_session()?;
        if !self.is_server_mode() {
            return Err(AppError::Validation(
                "Backup database hanya dapat dijalankan langsung dari Server Terminal.".to_string(),
            ));
        }
        self.core.backup_database(&sess.user, target_path)
    }

    pub fn restore_database(&self, source_path: &Path) -> AppResult<()> {
        let sess = self.require_local_session()?;
        if !self.is_server_mode() {
            return Err(AppError::Validation(
                "Restore database hanya dapat dijalankan langsung dari Server Terminal."
                    .to_string(),
            ));
        }
        self.core.restore_database(&sess.user, source_path)
    }

    // --- Shift Kasir & Rekap Kas Laci ---
    pub async fn open_shift(&self, req: &OpenShiftRequest) -> AppResult<CashierShift> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => {
                self.core.open_shift(&sess.user, &cfg.terminal_name, req)
            }
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .open_shift(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn get_active_shift(&self) -> AppResult<Option<CashierShift>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.get_active_shift(&sess.user.id),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .get_active_shift(&sess.session_token)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn record_cash_movement(&self, req: &CashMovementRequest) -> AppResult<CashMovement> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.record_cash_movement(&sess.user, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .record_cash_movement(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn get_shift_x_report(&self, shift_id: &str) -> AppResult<ShiftReportData> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.get_shift_x_report(shift_id),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .get_shift_x_report(&sess.session_token, shift_id)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn close_shift(&self, req: &CloseShiftRequest) -> AppResult<CashierShift> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.close_shift(&sess.user, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .close_shift(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn list_shifts(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> AppResult<Vec<CashierShift>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.list_shifts(start_date, end_date),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .list_shifts(&sess.session_token, start_date, end_date)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    // --- Alur Stok Opname Fisik Massal ---
    pub async fn create_opname_session(
        &self,
        req: &CreateOpnameSessionRequest,
    ) -> AppResult<StockOpnameSession> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.create_opname_session(&sess.user, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .create_opname_session(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn list_opname_sessions(
        &self,
        status: Option<&str>,
    ) -> AppResult<Vec<StockOpnameSession>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.list_opname_sessions(),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .list_opname_sessions(&sess.session_token, status)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn get_opname_session_detail(
        &self,
        session_id: &str,
    ) -> AppResult<OpnameSessionDetail> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.get_opname_session_detail(session_id),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .get_opname_session_detail(&sess.session_token, session_id)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn record_opname_scan(
        &self,
        req: &RecordOpnameScanRequest,
    ) -> AppResult<StockOpnameItem> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.record_opname_scan(&sess.user, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .record_opname_scan(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn update_opname_item_qty(
        &self,
        req: &UpdateOpnameItemQtyRequest,
    ) -> AppResult<StockOpnameItem> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.update_opname_item_qty(&sess.user, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .update_opname_item_qty(&sess.session_token, &req.item_id, req.physical_count)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn commit_opname_session(
        &self,
        req: &CommitOpnameSessionRequest,
    ) -> AppResult<StockOpnameSession> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.commit_opname_session(&sess.user, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .commit_opname_session(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn cancel_opname_session(
        &self,
        session_id: &str,
        reason: &str,
    ) -> AppResult<StockOpnameSession> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.cancel_opname_session(&sess.user, session_id),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .cancel_opname_session(&sess.session_token, session_id, reason)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    // --- Harga Bertingkat / Tiered Pricing ---
    pub async fn get_product_price_tiers(
        &self,
        product_id: &str,
    ) -> AppResult<Vec<ProductPriceTier>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.get_product_price_tiers(product_id),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .get_product_price_tiers(&sess.session_token, product_id)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }

    pub async fn set_product_price_tiers(
        &self,
        req: &SetPriceTiersRequest,
    ) -> AppResult<Vec<ProductPriceTier>> {
        let sess = self.require_local_session()?;
        let cfg = self.get_config();
        match cfg.terminal_mode {
            TerminalMode::SERVER => self.core.set_product_price_tiers(&sess.user, req),
            TerminalMode::CLIENT => {
                Self::remote_client_for_config(&cfg)
                    .set_product_price_tiers(&sess.session_token, req)
                    .await
            }
            TerminalMode::UNCONFIGURED => Err(AppError::Validation(
                "Terminal belum dikonfigurasi.".to_string(),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{DiscountType, HeldBillItemInput, SaleItemInput, SaleStatus};
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_lan_client_server_full_roundtrip() {
        let server_dir = TempDir::new().unwrap();
        let client_dir = TempDir::new().unwrap();

        let server_dispatcher = BackendDispatcher::new(server_dir.path().to_path_buf()).unwrap();
        let client_dispatcher = BackendDispatcher::new(client_dir.path().to_path_buf()).unwrap();

        // 1. Inisialisasi Server Terminal dengan data sampel minimarket
        let settings = server_dispatcher
            .core
            .setup_server(&SetupServerRequest {
                store_name: "Minimarket Berkah LAN".to_string(),
                store_address: "Jl. Sudirman No. 1".to_string(),
                store_phone: "0811223344".to_string(),
                terminal_name: "Kasir 1 (Server)".to_string(),
                admin_username: "admin".to_string(),
                admin_full_name: "Admin Utama".to_string(),
                admin_password: "adminpassword".to_string(),
                admin_pin: "654321".to_string(),
                seed_sample_data: true,
            })
            .unwrap();

        // Jalankan Axum LAN Server pada port ephemeral 127.0.0.1:0
        let (addr, _server_handle) = spawn_lan_server(
            server_dispatcher.core.clone(),
            "Kasir 1 (Server)".to_string(),
            "127.0.0.1:0",
        )
        .await
        .unwrap();

        // 2. Uji Pairing Code salah dari Client Terminal -> wajib ditolak (401 Unauthorized)
        let bad_pair = client_dispatcher
            .setup_client_terminal(&SetupClientRequest {
                server_ip: "127.0.0.1".to_string(),
                server_port: addr.port(),
                pairing_code: "WRONG1".to_string(),
                terminal_name: "Kasir 2 (Client)".to_string(),
            })
            .await;
        assert!(bad_pair.is_err());

        // 3. Uji Pairing Code benar dari Client Terminal -> berhasil terhubung
        let client_status = client_dispatcher
            .setup_client_terminal(&SetupClientRequest {
                server_ip: "127.0.0.1".to_string(),
                server_port: addr.port(),
                pairing_code: settings.pairing_code.clone(),
                terminal_name: "Kasir 2 (Client)".to_string(),
            })
            .await
            .unwrap();
        assert!(client_status.lan_connected);
        assert_eq!(
            client_status.store_name.as_deref(),
            Some("Minimarket Berkah LAN")
        );

        // 4. Login sebagai Cashier ("kasir1" / "kasir123" dari seed data) di Client Terminal
        let cashier_sess = client_dispatcher
            .login(&LoginRequest {
                username: "kasir1".to_string(),
                password: "kasir123".to_string(),
            })
            .await
            .unwrap();
        assert_eq!(cashier_sess.user.username, "kasir1");

        // 5. Cashier mencari produk via Barcode di jaringan LAN; pastikan cost_price disensor menjadi 0
        let aqua = client_dispatcher
            .find_product_by_code("8992752011005")
            .await
            .unwrap();
        assert_eq!(aqua.name, "Aqua Air Mineral Botol 600ml");
        assert_eq!(aqua.cost_price, 0); // Disensor untuk Cashier!
        assert_eq!(aqua.selling_price, 4_000);
        assert_eq!(aqua.discount_type, DiscountType::NOMINAL);
        assert_eq!(aqua.unit_discount_amount, 500);
        assert_eq!(aqua.effective_unit_price, 3_500);

        // 6. Cashier mencoba memanggil endpoint khusus Admin (upsert_product) -> ditolak 403 Forbidden
        let forbidden = client_dispatcher
            .upsert_product(&UpsertProductRequest {
                id: None,
                sku: "HACK-01".to_string(),
                barcode: None,
                name: "Produk Ilegal".to_string(),
                category_name: "Umum".to_string(),
                unit: "pcs".to_string(),
                cost_price: 1000,
                selling_price: 2000,
                discount_type: DiscountType::NONE,
                discount_value: 0,
                initial_stock: Some(10),
                is_active: Some(true),
                price_tiers: None,
            })
            .await;
        assert!(matches!(forbidden, Err(AppError::Forbidden(_))));

        // 7. Cashier membuka shift kasir dari Client Terminal
        let open_shift_res = client_dispatcher
            .open_shift(&OpenShiftRequest {
                opening_float: 100_000,
                notes: Some("Shift Pagi Client".to_string()),
            })
            .await
            .unwrap();
        assert_eq!(open_shift_res.status, "OPEN");
        assert_eq!(open_shift_res.opening_float, 100_000);

        // 8. Cashier menahan Held Bill di Client Terminal, lalu memanggilnya kembali
        let held = client_dispatcher
            .create_held_bill(&CreateHeldBillRequest {
                hold_label: "Pelanggan Kasir 2".to_string(),
                items: vec![HeldBillItemInput {
                    product_id: aqua.id.clone(),
                    quantity: 3,
                }],
            })
            .await
            .unwrap();
        assert_eq!(held.terminal_name, "Kasir 2 (Client)");
        assert_eq!(held.estimated_total, 10_500);

        let recalled = client_dispatcher.consume_held_bill(&held.id).await.unwrap();
        assert!(recalled.warnings.is_empty());
        assert_eq!(recalled.held_bill.items[0].quantity, 3);

        // 9. Cashier menyelesaikan pembayaran tunai (Sale) dari Client Terminal
        let receipt = client_dispatcher
            .create_sale(&CreateSaleRequest {
                items: vec![SaleItemInput {
                    product_id: aqua.id.clone(),
                    quantity: 3,
                }],
                cash_received: 20_000,
            })
            .await
            .unwrap();
        assert_eq!(receipt.sale.total_amount, 10_500);
        assert_eq!(receipt.sale.change_amount, 9_500);
        assert_eq!(receipt.sale.terminal_name, "Kasir 2 (Client)");

        // 10. Cashier melakukan Void pada transaksi tersebut menggunakan PIN Admin ("654321")
        let voided = client_dispatcher
            .void_sale(&VoidSaleRequest {
                sale_id: receipt.sale.id.clone(),
                admin_pin: "654321".to_string(),
                void_reason: "Pelanggan tukar barang".to_string(),
            })
            .await
            .unwrap();
        assert_eq!(voided.sale.status, SaleStatus::VOIDED);

        // 11. Cashier mencetak laporan X dan menutup shift dari Client Terminal
        let x_rep = client_dispatcher.get_shift_x_report(&open_shift_res.id).await.unwrap();
        assert_eq!(x_rep.shift.opening_float, 100_000);
        assert_eq!(x_rep.void_count, 1);

        let closed = client_dispatcher
            .close_shift(&CloseShiftRequest {
                shift_id: open_shift_res.id,
                actual_closing_cash: 100_000,
                notes: Some("Shift selesai".to_string()),
            })
            .await
            .unwrap();
        assert_eq!(closed.status, "CLOSED");
        assert_eq!(closed.cash_discrepancy, Some(0));
    }
}
