use crate::config::{LocalConfig, PrinterConfig};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

// ============================================================================
// 1. Peran & Pengguna (User, Admin, Cashier)
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UserRole {
    ADMIN,
    CASHIER,
}

impl UserRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ADMIN => "ADMIN",
            Self::CASHIER => "CASHIER",
        }
    }

    pub fn from_str(raw: &str) -> AppResult<Self> {
        match raw.trim().to_uppercase().as_str() {
            "ADMIN" => Ok(Self::ADMIN),
            "CASHIER" => Ok(Self::CASHIER),
            other => Err(AppError::Validation(format!(
                "Peran pengguna tidak dikenal: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub full_name: String,
    pub role: UserRole,
    pub has_pin: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthSession {
    pub session_token: String,
    pub user: User,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpsertUserRequest {
    pub id: Option<String>,
    pub username: String,
    pub full_name: String,
    pub password: Option<String>,
    pub pin: Option<String>,
    pub role: UserRole,
    pub is_active: bool,
}

// ============================================================================
// 2. Katalog Produk & Diskon (Product, Cost Price, Selling Price, Product Discount)
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiscountType {
    NONE,
    NOMINAL,
    PERCENT,
}

impl DiscountType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NONE => "NONE",
            Self::NOMINAL => "NOMINAL",
            Self::PERCENT => "PERCENT",
        }
    }

    pub fn from_str(raw: &str) -> AppResult<Self> {
        let upper = raw.trim().to_uppercase();
        match upper.as_str() {
            "NONE" | "" | "TIDAK ADA" | "TIDAK" | "0" => Ok(Self::NONE),
            "NOMINAL" | "FIXED" | "RP" | "RUPIAH" => Ok(Self::NOMINAL),
            "PERCENT" | "PERSEN" | "%" => Ok(Self::PERCENT),
            _ if upper.contains("NOMINAL") || upper.contains("RP") || upper.contains("FIXED") => {
                Ok(Self::NOMINAL)
            }
            _ if upper.contains("PERSEN") || upper.contains("%") => Ok(Self::PERCENT),
            _ if upper.contains("TIDAK") || upper.contains("NONE") => Ok(Self::NONE),
            other => Err(AppError::Validation(format!(
                "Jenis diskon produk tidak valid: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Product {
    pub id: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub name: String,
    pub category_name: String,
    pub unit: String,
    pub cost_price: i64,
    pub selling_price: i64,
    pub discount_type: DiscountType,
    pub discount_value: i64,
    pub unit_discount_amount: i64,
    pub effective_unit_price: i64,
    pub stock: i64,
    pub is_active: bool,
    pub price_tiers: Option<Vec<ProductPriceTier>>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProductPriceTier {
    pub id: String,
    pub product_id: String,
    pub min_quantity: i64,
    pub tier_price: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PriceTierInput {
    pub min_quantity: i64,
    pub tier_price: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SetPriceTiersRequest {
    pub product_id: String,
    pub tiers: Vec<PriceTierInput>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProductFilter {
    pub search: Option<String>,
    pub category: Option<String>,
    pub only_active: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpsertProductRequest {
    pub id: Option<String>,
    pub sku: String,
    pub barcode: Option<String>,
    pub name: String,
    pub category_name: String,
    pub unit: String,
    pub cost_price: i64,
    pub selling_price: i64,
    pub discount_type: DiscountType,
    pub discount_value: i64,
    /// Hanya diterapkan saat membuat produk baru (perubahan stok selanjutnya wajib melalui Stock Adjustment).
    pub initial_stock: Option<i64>,
    pub is_active: Option<bool>,
    pub price_tiers: Option<Vec<PriceTierInput>>,
}

// ============================================================================
// 3. Penyesuaian Stok (Stock Adjustment)
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdjustmentType {
    RESTOCK,
    DAMAGE,
    LOSS,
    CORRECTION,
}

impl AdjustmentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RESTOCK => "RESTOCK",
            Self::DAMAGE => "DAMAGE",
            Self::LOSS => "LOSS",
            Self::CORRECTION => "CORRECTION",
        }
    }

    pub fn from_str(raw: &str) -> AppResult<Self> {
        match raw.trim().to_uppercase().as_str() {
            "RESTOCK" => Ok(Self::RESTOCK),
            "DAMAGE" => Ok(Self::DAMAGE),
            "LOSS" => Ok(Self::LOSS),
            "CORRECTION" => Ok(Self::CORRECTION),
            other => Err(AppError::Validation(format!(
                "Jenis penyesuaian stok tidak valid: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StockAdjustment {
    pub id: String,
    pub product_id: String,
    pub product_sku: String,
    pub product_name: String,
    pub user_id: String,
    pub user_name: String,
    pub terminal_name: String,
    pub adjustment_type: AdjustmentType,
    pub stock_before: i64,
    pub quantity_delta: i64,
    pub stock_after: i64,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreateStockAdjustmentRequest {
    pub product_id: String,
    pub adjustment_type: AdjustmentType,
    /// Untuk RESTOCK/DAMAGE/LOSS berupa jumlah positif; untuk CORRECTION berupa nilai stok fisik aktual (>= 0).
    pub quantity: i64,
    pub note: String,
}

// ============================================================================
// 4. Transaksi Kasir (Sale, Line Item, Void, Receipt)
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SaleStatus {
    COMPLETED,
    VOIDED,
}

impl SaleStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::COMPLETED => "COMPLETED",
            Self::VOIDED => "VOIDED",
        }
    }

    pub fn from_str(raw: &str) -> AppResult<Self> {
        match raw.trim().to_uppercase().as_str() {
            "COMPLETED" => Ok(Self::COMPLETED),
            "VOIDED" => Ok(Self::VOIDED),
            other => Err(AppError::Validation(format!(
                "Status transaksi tidak valid: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Sale {
    pub id: String,
    pub receipt_number: String,
    pub cashier_id: String,
    pub cashier_name_snapshot: String,
    pub terminal_name: String,
    pub subtotal: i64,
    pub discount_total: i64,
    pub total_amount: i64,
    pub cash_received: i64,
    pub change_amount: i64,
    pub shift_id: Option<String>,
    pub status: SaleStatus,
    pub voided_by_user_id: Option<String>,
    pub voided_by_name_snapshot: Option<String>,
    pub void_reason: Option<String>,
    pub voided_at: Option<String>,
    pub transaction_date: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SaleLineItem {
    pub id: String,
    pub sale_id: String,
    pub product_id: String,
    pub sku_snapshot: String,
    pub barcode_snapshot: Option<String>,
    pub product_name_snapshot: String,
    pub unit_snapshot: String,
    pub quantity: i64,
    pub cost_price_snapshot: i64,
    pub selling_price_snapshot: i64,
    pub discount_type_snapshot: DiscountType,
    pub discount_value_snapshot: i64,
    pub unit_discount_amount: i64,
    pub applied_tier_min_qty: Option<i64>,
    pub applied_tier_price: Option<i64>,
    pub subtotal: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SaleWithItems {
    pub sale: Sale,
    pub items: Vec<SaleLineItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SaleItemInput {
    pub product_id: String,
    pub quantity: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreateSaleRequest {
    pub items: Vec<SaleItemInput>,
    pub cash_received: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VoidSaleRequest {
    pub sale_id: String,
    pub admin_pin: String,
    pub void_reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReceiptData {
    pub store_name: String,
    pub store_address: String,
    pub store_phone: String,
    pub receipt_footer: String,
    pub sale: Sale,
    pub items: Vec<SaleLineItem>,
    pub is_reprint: bool,
}

// ============================================================================
// 5. Keranjang Ditahan (Held Bill)
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeldBillItemInput {
    pub product_id: String,
    pub quantity: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreateHeldBillRequest {
    pub hold_label: String,
    pub items: Vec<HeldBillItemInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeldBillItemDetail {
    pub id: String,
    pub product_id: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub product_name: String,
    pub unit: String,
    pub selling_price: i64,
    pub discount_type: DiscountType,
    pub discount_value: i64,
    pub unit_discount_amount: i64,
    pub effective_unit_price: i64,
    pub quantity: i64,
    pub current_stock: i64,
    pub is_active: bool,
    pub stock_sufficient: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeldBill {
    pub id: String,
    pub hold_label: String,
    pub cashier_id: String,
    pub cashier_name: String,
    pub terminal_name: String,
    pub created_at: String,
    pub items: Vec<HeldBillItemDetail>,
    pub estimated_total: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecalledHeldBill {
    pub held_bill: HeldBill,
    pub warnings: Vec<String>,
}

// ============================================================================
// 6. Laporan Penjualan & Laba Kotor (SalesReport)
// ============================================================================

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SalesReportFilter {
    pub start_date: String,
    pub end_date: String,
    pub cashier_id: Option<String>,
    pub terminal_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TopProductRow {
    pub product_id: String,
    pub sku: String,
    pub product_name: String,
    pub unit: String,
    pub total_qty_sold: i64,
    pub net_revenue: i64,
    pub total_cost: i64,
    pub gross_profit: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LowStockProductRow {
    pub product_id: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub product_name: String,
    pub category_name: String,
    pub unit: String,
    pub stock: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SalesReport {
    pub start_date: String,
    pub end_date: String,
    pub completed_sales_count: i64,
    pub voided_sales_count: i64,
    pub gross_sales: i64,
    pub total_discount: i64,
    pub net_sales: i64,
    pub total_cogs: i64,
    pub gross_profit: i64,
    pub top_products: Vec<TopProductRow>,
    pub low_stock_products: Vec<LowStockProductRow>,
    pub sales: Vec<SaleWithItems>,
}

// ============================================================================
// 7. Pengaturan Toko, Setup Terminal, Perangkat Keras, & CSV
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoreSettings {
    pub store_name: String,
    pub store_address: String,
    pub store_phone: String,
    pub receipt_footer: String,
    pub pairing_code: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateStoreSettingsRequest {
    pub store_name: String,
    pub store_address: String,
    pub store_phone: String,
    pub receipt_footer: String,
    pub regenerate_pairing_code: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SetupServerRequest {
    pub store_name: String,
    pub store_address: String,
    pub store_phone: String,
    pub terminal_name: String,
    pub admin_username: String,
    pub admin_full_name: String,
    pub admin_password: String,
    pub admin_pin: String,
    pub seed_sample_data: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SetupClientRequest {
    pub server_ip: String,
    pub server_port: u16,
    pub pairing_code: String,
    pub terminal_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HealthCheckResponse {
    pub status: String,
    pub store_name: String,
    pub server_terminal_name: String,
    pub server_time: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TerminalStatus {
    pub config: LocalConfig,
    pub local_lan_ips: Vec<String>,
    pub lan_connected: bool,
    pub store_name: Option<String>,
    pub server_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrintOutcome {
    pub printer_name: String,
    pub paper_width: u16,
    #[serde(default)]
    pub left_margin_chars: u8,
    pub simulated: bool,
    pub drawer_kicked: bool,
    pub bytes_written: usize,
    pub rendered_text: String,
    pub show_preview_modal: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CsvImportResult {
    pub inserted_count: usize,
    pub updated_count: usize,
    pub total_processed: usize,
}

pub type ImportProductsResult = CsvImportResult;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProductImportRow {
    pub sku: String,
    #[serde(default)]
    pub barcode: Option<String>,
    pub name: String,
    #[serde(default = "default_category_name")]
    pub category_name: String,
    #[serde(default = "default_unit_name")]
    pub unit: String,
    pub cost_price: i64,
    pub selling_price: i64,
    #[serde(default = "default_discount_type_str")]
    pub discount_type: String,
    #[serde(default)]
    pub discount_value: i64,
    #[serde(default)]
    pub stock: i64,
    #[serde(default = "default_active_bool")]
    pub is_active: bool,
    #[serde(default)]
    pub tier_min_qty: Option<i64>,
    #[serde(default)]
    pub tier_price: Option<i64>,
}

fn default_category_name() -> String {
    "Umum".to_string()
}

fn default_unit_name() -> String {
    "pcs".to_string()
}

fn default_discount_type_str() -> String {
    "NONE".to_string()
}

fn default_active_bool() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdatePrinterConfigRequest {
    pub printer: PrinterConfig,
}

// ============================================================================
// 9. Manajemen Shift Kasir & Rekap Kas Laci (Shift Float & Cash Movements)
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CashierShift {
    pub id: String,
    pub terminal_name: String,
    pub cashier_id: String,
    pub cashier_name_snapshot: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub opening_float: i64,
    pub cash_sales_total: i64,
    pub cash_in_total: i64,
    pub cash_out_total: i64,
    pub expected_closing_cash: Option<i64>,
    pub actual_closing_cash: Option<i64>,
    pub cash_discrepancy: Option<i64>,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CashMovement {
    pub id: String,
    pub shift_id: String,
    pub movement_type: String,
    pub amount: i64,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OpenShiftRequest {
    pub opening_float: i64,
    #[serde(default)]
    pub terminal_name: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CloseShiftRequest {
    pub shift_id: String,
    pub actual_closing_cash: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CashMovementRequest {
    pub shift_id: String,
    pub movement_type: String,
    pub amount: i64,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShiftReportData {
    pub shift: CashierShift,
    pub movements: Vec<CashMovement>,
    pub gross_sales: i64,
    pub total_discounts: i64,
    pub net_sales: i64,
    pub total_transactions: i64,
    pub void_count: i64,
    pub void_total: i64,
    pub total_cash_sales: i64,
    pub total_cash_in: i64,
    pub total_cash_out: i64,
    pub expected_cash: i64,
    pub store_name: String,
    pub store_address: String,
    pub store_phone: String,
}

// ============================================================================
// 10. Alur Stok Opname Fisik Massal (Stock Opname Session & Items)
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StockOpnameSession {
    pub id: String,
    pub session_name: String,
    pub creator_user_id: String,
    pub creator_name_snapshot: String,
    pub status: String,
    pub total_items_counted: i64,
    pub total_discrepancy_qty: i64,
    pub total_discrepancy_value: i64,
    pub committed_by_user_id: Option<String>,
    pub committed_at: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StockOpnameItem {
    pub id: String,
    pub opname_session_id: String,
    pub product_id: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub product_name: String,
    pub unit: String,
    pub physical_count: i64,
    pub system_stock_snapshot: i64,
    pub cost_price_snapshot: i64,
    pub discrepancy: i64,
    pub discrepancy_cost: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreateOpnameSessionRequest {
    pub session_name: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecordOpnameScanRequest {
    pub session_id: String,
    pub product_identifier: String,
    pub count_mode: String,
    pub quantity: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateOpnameItemQtyRequest {
    pub item_id: String,
    pub physical_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommitOpnameSessionRequest {
    pub session_id: String,
    pub admin_pin: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CancelOpnameSessionRequest {
    pub session_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ShiftsQuery {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct OpnameQuery {
    pub status: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OpnameSessionDetail {
    pub session: StockOpnameSession,
    pub items: Vec<StockOpnameItem>,
}

// ============================================================================
// 8. Rumus Matematika Bisnis Domain (`BR-01` & `BR-02`)
// ============================================================================

/// `BR-01`: Menghitung potongan harga per 1 satuan barang (`unit_discount_amount`) dalam Rupiah bulat.
pub fn calculate_unit_discount(
    selling_price: i64,
    discount_type: DiscountType,
    discount_value: i64,
) -> AppResult<i64> {
    if selling_price < 0 {
        return Err(AppError::Validation(
            "Harga jual tidak boleh bernilai negatif.".to_string(),
        ));
    }
    if discount_value < 0 {
        return Err(AppError::Validation(
            "Nilai diskon tidak boleh bernilai negatif.".to_string(),
        ));
    }

    match discount_type {
        DiscountType::NONE => Ok(0),
        DiscountType::NOMINAL => Ok(discount_value.min(selling_price)),
        DiscountType::PERCENT => {
            if discount_value > 100 {
                return Err(AppError::Validation(
                    "Diskon persentase tidak boleh melebihi 100%.".to_string(),
                ));
            }
            Ok((selling_price * discount_value) / 100)
        }
    }
}

/// `BR-01`: Menghitung harga jual bersih per satuan setelah diskon (`effective_unit_price`).
pub fn calculate_effective_unit_price(
    selling_price: i64,
    discount_type: DiscountType,
    discount_value: i64,
) -> AppResult<i64> {
    let discount = calculate_unit_discount(selling_price, discount_type, discount_value)?;
    Ok(selling_price - discount)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineItemCalculation {
    pub unit_discount_amount: i64,
    pub effective_unit_price: i64,
    pub line_gross: i64,
    pub line_discount: i64,
    pub line_subtotal: i64,
    pub line_cost: i64,
    pub line_profit: i64,
}

/// `BR-02`: Menghitung rincian finansial satu `Line Item` dengan kuantitas bulat `qty >= 1`.
pub fn calculate_line_item(
    cost_price: i64,
    selling_price: i64,
    discount_type: DiscountType,
    discount_value: i64,
    qty: i64,
) -> AppResult<LineItemCalculation> {
    if qty < 1 {
        return Err(AppError::Validation(
            "Kuantitas item harus minimal 1.".to_string(),
        ));
    }
    if cost_price < 0 {
        return Err(AppError::Validation(
            "Harga modal (Cost Price) tidak boleh negatif.".to_string(),
        ));
    }

    let unit_discount_amount =
        calculate_unit_discount(selling_price, discount_type, discount_value)?;
    let effective_unit_price = selling_price - unit_discount_amount;
    let line_gross = selling_price * qty;
    let line_discount = unit_discount_amount * qty;
    let line_subtotal = effective_unit_price * qty;
    let line_cost = cost_price * qty;
    let line_profit = line_subtotal - line_cost;

    Ok(LineItemCalculation {
        unit_discount_amount,
        effective_unit_price,
        line_gross,
        line_discount,
        line_subtotal,
        line_cost,
        line_profit,
    })
}

/// `BR-04`: Menghitung rincian finansial satu `Line Item` dengan evaluasi harga bertingkat (tiered pricing / diskon grosir).
/// Jika ada tier yang memenuhi `qty >= tier.min_quantity`, dipilih tier dengan `min_quantity` terbesar.
/// Harga grosir menimpa selling_price dasar dan menonaktifkan diskon reguler (`unit_discount = 0`).
pub fn calculate_line_item_with_tiers(
    cost_price: i64,
    selling_price: i64,
    discount_type: DiscountType,
    discount_value: i64,
    qty: i64,
    tiers: Option<&[ProductPriceTier]>,
) -> AppResult<(LineItemCalculation, Option<(i64, i64)>)> {
    if qty < 1 {
        return Err(AppError::Validation(
            "Kuantitas item harus minimal 1.".to_string(),
        ));
    }
    if cost_price < 0 {
        return Err(AppError::Validation(
            "Harga modal (Cost Price) tidak boleh negatif.".to_string(),
        ));
    }

    let matched_tier = tiers.and_then(|ts| {
        ts.iter()
            .filter(|t| qty >= t.min_quantity)
            .max_by_key(|t| t.min_quantity)
    });

    if let Some(tier) = matched_tier {
        let effective_unit_price = tier.tier_price;
        let unit_discount_amount = 0;
        let line_gross = selling_price * qty;
        let line_subtotal = effective_unit_price * qty;
        let line_discount = (selling_price - effective_unit_price).max(0) * qty;
        let line_cost = cost_price * qty;
        let line_profit = line_subtotal - line_cost;

        Ok((
            LineItemCalculation {
                unit_discount_amount,
                effective_unit_price,
                line_gross,
                line_discount,
                line_subtotal,
                line_cost,
                line_profit,
            },
            Some((tier.min_quantity, tier.tier_price)),
        ))
    } else {
        let calc =
            calculate_line_item(cost_price, selling_price, discount_type, discount_value, qty)?;
        Ok((calc, None))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_br01_unit_discount_calculations() {
        // NONE discount
        assert_eq!(
            calculate_unit_discount(3_500, DiscountType::NONE, 500).unwrap(),
            0
        );

        // NOMINAL discount normal & capped at selling_price
        assert_eq!(
            calculate_unit_discount(4_000, DiscountType::NOMINAL, 500).unwrap(),
            500
        );
        assert_eq!(
            calculate_unit_discount(4_000, DiscountType::NOMINAL, 6_000).unwrap(),
            4_000
        );

        // PERCENT discount with integer floor division: floor(3_550 * 15 / 100) = floor(532.5) = 532
        assert_eq!(
            calculate_unit_discount(3_550, DiscountType::PERCENT, 15).unwrap(),
            532
        );
        assert_eq!(
            calculate_effective_unit_price(3_550, DiscountType::PERCENT, 15).unwrap(),
            3_018
        );

        // PERCENT > 100 rejected
        assert!(calculate_unit_discount(10_000, DiscountType::PERCENT, 105).is_err());
    }

    #[test]
    fn test_br02_line_item_totals_and_profit() {
        // Aqua Botol 600ml: cost 2500, selling 4000, discount NOMINAL 500, qty 3
        let calc = calculate_line_item(2_500, 4_000, DiscountType::NOMINAL, 500, 3).unwrap();
        assert_eq!(calc.unit_discount_amount, 500);
        assert_eq!(calc.effective_unit_price, 3_500);
        assert_eq!(calc.line_gross, 12_000);
        assert_eq!(calc.line_discount, 1_500);
        assert_eq!(calc.line_subtotal, 10_500);
        assert_eq!(calc.line_cost, 7_500);
        assert_eq!(calc.line_profit, 3_000);
    }

    #[test]
    fn test_br04_tiered_pricing() {
        let tiers = vec![
            ProductPriceTier {
                id: "t1".to_string(),
                product_id: "p1".to_string(),
                min_quantity: 6,
                tier_price: 3_500,
                created_at: "2026-10-28T00:00:00Z".to_string(),
                updated_at: "2026-10-28T00:00:00Z".to_string(),
            },
            ProductPriceTier {
                id: "t2".to_string(),
                product_id: "p1".to_string(),
                min_quantity: 12,
                tier_price: 3_200,
                created_at: "2026-10-28T00:00:00Z".to_string(),
                updated_at: "2026-10-28T00:00:00Z".to_string(),
            },
        ];

        // Qty 3 (< 6): Tier not triggered, standard nominal discount 500 applies (4000 - 500 = 3500)
        let (calc1, tier1) = calculate_line_item_with_tiers(
            2_500,
            4_000,
            DiscountType::NOMINAL,
            500,
            3,
            Some(&tiers),
        )
        .unwrap();
        assert!(tier1.is_none());
        assert_eq!(calc1.effective_unit_price, 3_500);
        assert_eq!(calc1.unit_discount_amount, 500);

        // Qty 6 (>= 6): Tier 1 triggered (tier_price = 3500), regular discount bypassed
        let (calc2, tier2) = calculate_line_item_with_tiers(
            2_500,
            4_000,
            DiscountType::NOMINAL,
            500,
            6,
            Some(&tiers),
        )
        .unwrap();
        assert_eq!(tier2, Some((6, 3_500)));
        assert_eq!(calc2.effective_unit_price, 3_500);
        assert_eq!(calc2.unit_discount_amount, 0);
        assert_eq!(calc2.line_subtotal, 21_000);

        // Qty 15 (>= 12): Tier 2 triggered (tier_price = 3200)
        let (calc3, tier3) = calculate_line_item_with_tiers(
            2_500,
            4_000,
            DiscountType::NOMINAL,
            500,
            15,
            Some(&tiers),
        )
        .unwrap();
        assert_eq!(tier3, Some((12, 3_200)));
        assert_eq!(calc3.effective_unit_price, 3_200);
        assert_eq!(calc3.line_subtotal, 48_000);
    }
}
