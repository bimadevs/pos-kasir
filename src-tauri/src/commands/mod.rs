use crate::config::{LocalConfig, PrinterConfig};
use crate::error::AppResult;
use crate::hardware::spooler::{kick_drawer_local, list_local_printers as enumerate_printers, print_receipt_local};
use crate::models::{
    AuthSession, CreateHeldBillRequest, CreateSaleRequest, CreateStockAdjustmentRequest,
    CsvImportResult, DiscountType, HealthCheckResponse, HeldBill, LoginRequest, Product,
    ProductFilter, PrintOutcome, RecalledHeldBill, ReceiptData, Sale, SaleLineItem, SaleStatus,
    SaleWithItems, SalesReport, SalesReportFilter, SetupClientRequest, SetupServerRequest,
    StockAdjustment, StoreSettings, TerminalStatus, UpdateStoreSettingsRequest,
    UpsertProductRequest, UpsertUserRequest, User, VoidSaleRequest,
};
use crate::services::core_service::CoreService;
use crate::services::dispatcher::BackendDispatcher;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

pub type DispatcherState<'a> = State<'a, Arc<BackendDispatcher>>;

// ============================================================================
// 1. Setup Terminal & Status Koneksi LAN
// ============================================================================

#[tauri::command]
pub async fn get_terminal_status(state: DispatcherState<'_>) -> AppResult<TerminalStatus> {
    state.get_terminal_status().await
}

#[tauri::command]
pub async fn test_client_connection(
    state: DispatcherState<'_>,
    req: SetupClientRequest,
) -> AppResult<HealthCheckResponse> {
    state.test_client_connection(&req).await
}

#[tauri::command]
pub async fn setup_server_terminal(
    state: DispatcherState<'_>,
    req: SetupServerRequest,
) -> AppResult<TerminalStatus> {
    state.setup_server_terminal(&req).await
}

#[tauri::command]
pub async fn setup_client_terminal(
    state: DispatcherState<'_>,
    req: SetupClientRequest,
) -> AppResult<TerminalStatus> {
    state.setup_client_terminal(&req).await
}

// ============================================================================
// 2. Autentikasi & Sesi Pengguna
// ============================================================================

#[tauri::command]
pub async fn auth_login(state: DispatcherState<'_>, req: LoginRequest) -> AppResult<AuthSession> {
    state.login(&req).await
}

#[tauri::command]
pub async fn auth_logout(state: DispatcherState<'_>) -> AppResult<()> {
    state.logout().await
}

#[tauri::command]
pub async fn get_active_session(state: DispatcherState<'_>) -> AppResult<Option<AuthSession>> {
    Ok(state.get_active_session())
}

// ============================================================================
// 3. Katalog Produk & CSV
// ============================================================================

#[tauri::command]
pub async fn list_products(
    state: DispatcherState<'_>,
    filter: ProductFilter,
) -> AppResult<Vec<Product>> {
    state.list_products(&filter).await
}

#[tauri::command]
pub async fn find_product_by_code(
    state: DispatcherState<'_>,
    code: String,
) -> AppResult<Product> {
    state.find_product_by_code(&code).await
}

#[tauri::command]
pub async fn upsert_product(
    state: DispatcherState<'_>,
    req: UpsertProductRequest,
) -> AppResult<Product> {
    state.upsert_product(&req).await
}

#[tauri::command]
pub async fn deactivate_product(
    state: DispatcherState<'_>,
    product_id: String,
) -> AppResult<()> {
    state.deactivate_product(&product_id).await
}

#[tauri::command]
pub async fn export_products_csv(state: DispatcherState<'_>) -> AppResult<String> {
    state.export_products_csv().await
}

#[tauri::command]
pub async fn import_products_csv(
    state: DispatcherState<'_>,
    csv_content: String,
) -> AppResult<CsvImportResult> {
    state.import_products_csv(&csv_content).await
}

// ============================================================================
// 4. Penyesuaian Stok (`Stock Adjustment`)
// ============================================================================

#[tauri::command]
pub async fn create_stock_adjustment(
    state: DispatcherState<'_>,
    req: CreateStockAdjustmentRequest,
) -> AppResult<StockAdjustment> {
    state.create_stock_adjustment(&req).await
}

#[tauri::command]
pub async fn list_stock_adjustments(
    state: DispatcherState<'_>,
    product_id: Option<String>,
) -> AppResult<Vec<StockAdjustment>> {
    state.list_stock_adjustments(product_id.as_deref()).await
}

// ============================================================================
// 5. Transaksi Kasir (`Sale`, `Reprint`, `Void`, `Held Bill`)
// ============================================================================

#[tauri::command]
pub async fn create_sale(
    state: DispatcherState<'_>,
    req: CreateSaleRequest,
) -> AppResult<ReceiptData> {
    state.create_sale(&req).await
}

#[tauri::command]
pub async fn list_today_sales(state: DispatcherState<'_>) -> AppResult<Vec<SaleWithItems>> {
    state.list_today_sales().await
}

#[tauri::command]
pub async fn get_sale_receipt(
    state: DispatcherState<'_>,
    sale_id: String,
    is_reprint: bool,
) -> AppResult<ReceiptData> {
    state.get_sale_receipt(&sale_id, is_reprint).await
}

#[tauri::command]
pub async fn void_sale(
    state: DispatcherState<'_>,
    req: VoidSaleRequest,
) -> AppResult<SaleWithItems> {
    state.void_sale(&req).await
}

#[tauri::command]
pub async fn create_held_bill(
    state: DispatcherState<'_>,
    req: CreateHeldBillRequest,
) -> AppResult<HeldBill> {
    state.create_held_bill(&req).await
}

#[tauri::command]
pub async fn list_held_bills(state: DispatcherState<'_>) -> AppResult<Vec<HeldBill>> {
    state.list_held_bills().await
}

#[tauri::command]
pub async fn consume_held_bill(
    state: DispatcherState<'_>,
    held_bill_id: String,
) -> AppResult<RecalledHeldBill> {
    state.consume_held_bill(&held_bill_id).await
}

#[tauri::command]
pub async fn delete_held_bill(
    state: DispatcherState<'_>,
    held_bill_id: String,
) -> AppResult<()> {
    state.delete_held_bill(&held_bill_id).await
}

// ============================================================================
// 6. Laporan, Pengguna, & Pengaturan Toko
// ============================================================================

#[tauri::command]
pub async fn get_sales_report(
    state: DispatcherState<'_>,
    filter: SalesReportFilter,
) -> AppResult<SalesReport> {
    state.get_sales_report(&filter).await
}

#[tauri::command]
pub async fn export_sales_report_csv(
    state: DispatcherState<'_>,
    filter: SalesReportFilter,
) -> AppResult<String> {
    state.export_sales_report_csv(&filter).await
}

#[tauri::command]
pub async fn list_users(state: DispatcherState<'_>) -> AppResult<Vec<User>> {
    state.list_users().await
}

#[tauri::command]
pub async fn upsert_user(
    state: DispatcherState<'_>,
    req: UpsertUserRequest,
) -> AppResult<User> {
    state.upsert_user(&req).await
}

#[tauri::command]
pub async fn get_store_settings(state: DispatcherState<'_>) -> AppResult<StoreSettings> {
    state.get_store_settings().await
}

#[tauri::command]
pub async fn update_store_settings(
    state: DispatcherState<'_>,
    req: UpdateStoreSettingsRequest,
) -> AppResult<StoreSettings> {
    state.update_store_settings(&req).await
}

// ============================================================================
// 7. Perangkat Keras Lokal (Printer Thermal ESC/POS & Cash Drawer RJ11)
// ============================================================================

#[tauri::command]
pub fn list_local_printers() -> AppResult<Vec<String>> {
    Ok(enumerate_printers())
}

#[tauri::command]
pub fn update_printer_config(
    state: DispatcherState<'_>,
    printer: PrinterConfig,
) -> AppResult<LocalConfig> {
    state.update_printer_config(printer)
}

#[tauri::command]
pub fn print_receipt(
    state: DispatcherState<'_>,
    receipt: ReceiptData,
) -> AppResult<PrintOutcome> {
    let cfg = state.get_config();
    print_receipt_local(state.app_data_dir(), &cfg.printer, &receipt)
}

#[tauri::command]
pub fn kick_cash_drawer(state: DispatcherState<'_>) -> AppResult<PrintOutcome> {
    let cfg = state.get_config();
    kick_drawer_local(state.app_data_dir(), &cfg.printer)
}

#[tauri::command]
pub fn test_printer_and_drawer(
    state: DispatcherState<'_>,
    printer: Option<PrinterConfig>,
    open_drawer: bool,
) -> AppResult<PrintOutcome> {
    let cfg = state.get_config();
    let mut target_printer = printer.unwrap_or(cfg.printer);
    target_printer.auto_open_drawer = open_drawer;

    let sample_receipt = ReceiptData {
        store_name: "UJI CETAK POS-KASIR".to_string(),
        store_address: "Terminal: ".to_string() + &cfg.terminal_name,
        store_phone: "Printer: ".to_string() + &target_printer.printer_name,
        receipt_footer: "Struk uji coba Raw ESC/POS berhasil dicetak.".to_string(),
        sale: Sale {
            id: "test-sale".to_string(),
            receipt_number: "TEST-0001".to_string(),
            cashier_id: "test-user".to_string(),
            cashier_name_snapshot: "Operator Uji".to_string(),
            terminal_name: cfg.terminal_name,
            subtotal: 19_000,
            discount_total: 1_500,
            total_amount: 17_500,
            cash_received: 20_000,
            change_amount: 2_500,
            status: SaleStatus::COMPLETED,
            voided_by_user_id: None,
            voided_by_name_snapshot: None,
            void_reason: None,
            voided_at: None,
            transaction_date: CoreService::today_date_str(),
            created_at: CoreService::now_iso(),
        },
        items: vec![
            SaleLineItem {
                id: "test-li-1".to_string(),
                sale_id: "test-sale".to_string(),
                product_id: "p-1".to_string(),
                sku_snapshot: "SKU-001".to_string(),
                barcode_snapshot: Some("8998866200011".to_string()),
                product_name_snapshot: "Indomie Goreng 85g".to_string(),
                unit_snapshot: "pcs".to_string(),
                quantity: 2,
                cost_price_snapshot: 2_600,
                selling_price_snapshot: 3_500,
                discount_type_snapshot: DiscountType::NONE,
                discount_value_snapshot: 0,
                unit_discount_amount: 0,
                subtotal: 7_000,
            },
            SaleLineItem {
                id: "test-li-2".to_string(),
                sale_id: "test-sale".to_string(),
                product_id: "p-2".to_string(),
                sku_snapshot: "SKU-003".to_string(),
                barcode_snapshot: Some("8992752011005".to_string()),
                product_name_snapshot: "Aqua Botol 600ml".to_string(),
                unit_snapshot: "botol".to_string(),
                quantity: 3,
                cost_price_snapshot: 2_400,
                selling_price_snapshot: 4_000,
                discount_type_snapshot: DiscountType::NOMINAL,
                discount_value_snapshot: 500,
                unit_discount_amount: 500,
                subtotal: 10_500,
            },
        ],
        is_reprint: false,
    };

    print_receipt_local(state.app_data_dir(), &target_printer, &sample_receipt)
}

// ============================================================================
// 8. Backup & Restore Database SQLite (Server Terminal)
// ============================================================================

#[tauri::command]
pub fn backup_database(state: DispatcherState<'_>, target_path: String) -> AppResult<String> {
    let path = PathBuf::from(target_path.trim());
    state.backup_database(&path)
}

#[tauri::command]
pub fn restore_database(state: DispatcherState<'_>, source_path: String) -> AppResult<()> {
    let path = PathBuf::from(source_path.trim());
    state.restore_database(&path)
}

#[tauri::command]
pub fn quit_application(app: tauri::AppHandle) {
    app.exit(0);
}
