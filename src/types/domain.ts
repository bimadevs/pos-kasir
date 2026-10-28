// Kontrak Tipe Domain Frontend TypeScript — Identik 100% dengan Struct Rust di src-tauri/src/models/mod.rs

export type TerminalMode = "UNCONFIGURED" | "SERVER" | "CLIENT";
export type UserRole = "ADMIN" | "CASHIER";
export type DiscountType = "NONE" | "NOMINAL" | "PERCENT";
export type AdjustmentType = "RESTOCK" | "DAMAGE" | "LOSS" | "CORRECTION";
export type SaleStatus = "COMPLETED" | "VOIDED";

export interface PrinterConfig {
  printer_name: string;
  paper_width: 58 | 80 | number;
  left_margin_chars?: number;
  auto_open_drawer: boolean;
  preview_on_screen: boolean;
}

export interface LocalConfig {
  terminal_mode: TerminalMode;
  terminal_name: string;
  server_bind_port: number;
  client_target_ip: string;
  client_target_port: number;
  pairing_code: string;
  printer: PrinterConfig;
}

export interface TerminalStatus {
  config: LocalConfig;
  local_lan_ips: string[];
  lan_connected: boolean;
  store_name: string | null;
  server_error: string | null;
}

export interface HealthCheckResponse {
  status: string;
  store_name: string;
  server_terminal_name: string;
  server_time: string;
}

export interface SetupServerRequest {
  store_name: string;
  store_address: string;
  store_phone: string;
  terminal_name: string;
  admin_username: string;
  admin_full_name: string;
  admin_password: string;
  admin_pin: string;
  seed_sample_data: boolean;
}

export interface SetupClientRequest {
  server_ip: string;
  server_port: number;
  pairing_code: string;
  terminal_name: string;
}

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  has_pin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthSession {
  session_token: string;
  user: User;
}

export interface UpsertUserRequest {
  id?: string | null;
  username: string;
  full_name: string;
  password?: string | null;
  pin?: string | null;
  role: UserRole;
  is_active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category_name: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  discount_type: DiscountType;
  discount_value: number;
  unit_discount_amount: number;
  effective_unit_price: number;
  stock: number;
  is_active: boolean;
  price_tiers?: ProductPriceTier[];
  created_at: string;
  updated_at: string;
}

export interface ProductFilter {
  search?: string | null;
  category?: string | null;
  only_active?: boolean | null;
}

export interface UpsertProductRequest {
  id?: string | null;
  sku: string;
  barcode?: string | null;
  name: string;
  category_name: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  discount_type: DiscountType;
  discount_value: number;
  initial_stock?: number | null;
  is_active?: boolean | null;
  price_tiers?: PriceTierInput[] | null;
}

export interface StockAdjustment {
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  user_id: string;
  user_name: string;
  terminal_name: string;
  adjustment_type: AdjustmentType;
  stock_before: number;
  quantity_delta: number;
  stock_after: number;
  note: string;
  created_at: string;
}

export interface CreateStockAdjustmentRequest {
  product_id: string;
  adjustment_type: AdjustmentType;
  quantity: number;
  note: string;
}

export interface Sale {
  id: string;
  receipt_number: string;
  cashier_id: string;
  cashier_name_snapshot: string;
  terminal_name: string;
  subtotal: number;
  discount_total: number;
  total_amount: number;
  cash_received: number;
  change_amount: number;
  shift_id: string | null;
  status: SaleStatus;
  voided_by_user_id: string | null;
  voided_by_name_snapshot: string | null;
  void_reason: string | null;
  voided_at: string | null;
  transaction_date: string;
  created_at: string;
}

export interface SaleLineItem {
  id: string;
  sale_id: string;
  product_id: string;
  sku_snapshot: string;
  barcode_snapshot: string | null;
  product_name_snapshot: string;
  unit_snapshot: string;
  quantity: number;
  cost_price_snapshot: number;
  selling_price_snapshot: number;
  discount_type_snapshot: DiscountType;
  discount_value_snapshot: number;
  unit_discount_amount: number;
  applied_tier_min_qty: number | null;
  applied_tier_price: number | null;
  subtotal: number;
}

export interface SaleWithItems {
  sale: Sale;
  items: SaleLineItem[];
}

export interface SaleItemInput {
  product_id: string;
  quantity: number;
}

export interface CreateSaleRequest {
  items: SaleItemInput[];
  cash_received: number;
}

export interface VoidSaleRequest {
  sale_id: string;
  admin_pin: string;
  void_reason: string;
}

export interface ReceiptData {
  store_name: string;
  store_address: string;
  store_phone: string;
  receipt_footer: string;
  sale: Sale;
  items: SaleLineItem[];
  is_reprint: boolean;
}

export interface HeldBillItemInput {
  product_id: string;
  quantity: number;
}

export interface CreateHeldBillRequest {
  hold_label: string;
  items: HeldBillItemInput[];
}

export interface HeldBillItemDetail {
  id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  unit: string;
  selling_price: number;
  discount_type: DiscountType;
  discount_value: number;
  unit_discount_amount: number;
  effective_unit_price: number;
  quantity: number;
  current_stock: number;
  is_active: boolean;
  stock_sufficient: boolean;
}

export interface HeldBill {
  id: string;
  hold_label: string;
  cashier_id: string;
  cashier_name: string;
  terminal_name: string;
  created_at: string;
  items: HeldBillItemDetail[];
  estimated_total: number;
}

export interface RecalledHeldBill {
  held_bill: HeldBill;
  warnings: string[];
}

export interface SalesReportFilter {
  start_date: string;
  end_date: string;
  cashier_id?: string | null;
  terminal_name?: string | null;
}

export interface TopProductRow {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  total_qty_sold: number;
  net_revenue: number;
  total_cost: number;
  gross_profit: number;
}

export interface LowStockProductRow {
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  category_name: string;
  unit: string;
  stock: number;
}

export interface SalesReport {
  start_date: string;
  end_date: string;
  completed_sales_count: number;
  voided_sales_count: number;
  gross_sales: number;
  total_discount: number;
  net_sales: number;
  total_cogs: number;
  gross_profit: number;
  top_products: TopProductRow[];
  low_stock_products: LowStockProductRow[];
  sales: SaleWithItems[];
}

export interface StoreSettings {
  store_name: string;
  store_address: string;
  store_phone: string;
  receipt_footer: string;
  pairing_code: string;
  updated_at: string;
}

export interface UpdateStoreSettingsRequest {
  store_name: string;
  store_address: string;
  store_phone: string;
  receipt_footer: string;
  regenerate_pairing_code: boolean;
}

export interface PrintOutcome {
  printer_name: string;
  paper_width: number;
  left_margin_chars?: number;
  simulated: boolean;
  drawer_kicked: boolean;
  bytes_written: number;
  rendered_text: string;
  show_preview_modal: boolean;
}

export interface CsvImportResult {
  inserted_count: number;
  updated_count: number;
  total_processed: number;
}

export type ImportProductsResult = CsvImportResult;

export interface ProductImportRow {
  sku: string;
  barcode?: string | null;
  name: string;
  category_name: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  discount_type: DiscountType;
  discount_value: number;
  stock: number;
  is_active: boolean;
  tier_min_qty?: number | null;
  tier_price?: number | null;
}

export interface ParsedImportRow {
  rowNumber: number;
  data: ProductImportRow;
  isNew: boolean;
  isValid: boolean;
  errors: string[];
}

export interface ParsedImportSummary {
  rows: ParsedImportRow[];
  totalRows: number;
  newCount: number;
  updateCount: number;
  errorCount: number;
  isValid: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type AppNavTab =
  | "POS"
  | "PRODUCTS"
  | "STOCK"
  | "REPORTS"
  | "USERS"
  | "SETTINGS";

// ============================================================================
// 9. Manajemen Shift Kasir & Rekap Kas Laci (Shift Float & Cash Movements)
// ============================================================================

export interface CashierShift {
  id: string;
  terminal_name: string;
  cashier_id: string;
  cashier_name_snapshot: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  cash_sales_total: number;
  cash_in_total: number;
  cash_out_total: number;
  expected_closing_cash: number | null;
  actual_closing_cash: number | null;
  cash_discrepancy: number | null;
  status: "OPEN" | "CLOSED";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashMovement {
  id: string;
  shift_id: string;
  movement_type: "CASH_IN" | "CASH_OUT";
  amount: number;
  reason: string;
  created_at: string;
}

export interface OpenShiftRequest {
  opening_float: number;
  notes?: string | null;
}

export interface CloseShiftRequest {
  shift_id: string;
  actual_closing_cash: number;
  notes?: string | null;
}

export interface CashMovementRequest {
  shift_id: string;
  movement_type: "CASH_IN" | "CASH_OUT";
  amount: number;
  reason: string;
}

export interface ShiftReportData {
  shift: CashierShift;
  movements: CashMovement[];
  gross_sales: number;
  total_discounts: number;
  net_sales: number;
  total_transactions: number;
  void_count: number;
  void_total: number;
  total_cash_sales: number;
  total_cash_in: number;
  total_cash_out: number;
  expected_cash: number;
  store_name: string;
  store_address: string;
  store_phone: string;
}

// ============================================================================
// 10. Alur Stok Opname Fisik Massal (Stock Opname Session & Items)
// ============================================================================

export interface StockOpnameSession {
  id: string;
  session_name: string;
  creator_user_id: string;
  creator_name_snapshot: string;
  status: "COUNTING" | "REVIEW" | "COMMITTED" | "CANCELLED";
  total_items_counted: number;
  total_discrepancy_qty: number;
  total_discrepancy_value: number;
  committed_by_user_id: string | null;
  committed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockOpnameItem {
  id: string;
  opname_session_id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  unit: string;
  physical_count: number;
  system_stock_snapshot: number;
  cost_price_snapshot: number;
  discrepancy: number;
  discrepancy_cost: number;
  updated_at: string;
}

export interface CreateOpnameSessionRequest {
  session_name?: string | null;
  notes?: string | null;
}

export interface RecordOpnameScanRequest {
  session_id: string;
  product_identifier: string;
  count_mode: "ADD" | "REPLACE";
  quantity: number;
}

export interface UpdateOpnameItemQtyRequest {
  item_id: string;
  physical_count: number;
}

export interface CommitOpnameSessionRequest {
  session_id: string;
  admin_pin: string;
}

export interface OpnameSessionDetail {
  session: StockOpnameSession;
  items: StockOpnameItem[];
}

// ============================================================================
// 11. Harga Bertingkat / Tiered Pricing
// ============================================================================

export interface ProductPriceTier {
  id: string;
  product_id: string;
  min_quantity: number;
  tier_price: number;
  created_at: string;
  updated_at: string;
}

export interface PriceTierInput {
  min_quantity: number;
  tier_price: number;
}

export interface SetPriceTiersRequest {
  product_id: string;
  tiers: PriceTierInput[];
}
