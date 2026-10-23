import { invoke } from "@tauri-apps/api/core";
import type {
  AuthSession,
  CreateHeldBillRequest,
  CreateSaleRequest,
  CreateStockAdjustmentRequest,
  CsvImportResult,
  HealthCheckResponse,
  HeldBill,
  ImportProductsResult,
  LocalConfig,
  LoginRequest,
  PrinterConfig,
  PrintOutcome,
  Product,
  ProductFilter,
  ProductImportRow,
  RecalledHeldBill,
  ReceiptData,
  SaleWithItems,
  SalesReport,
  SalesReportFilter,
  SetupClientRequest,
  SetupServerRequest,
  StockAdjustment,
  StoreSettings,
  TerminalStatus,
  UpdateStoreSettingsRequest,
  UpsertProductRequest,
  UpsertUserRequest,
  User,
  VoidSaleRequest,
} from "../types/domain";

/**
 * Mengekstrak pesan error yang ramah pengguna dari objek AppError Rust ({ code, message }) maupun string.
 */
export function extractErrorMessage(err: unknown): string {
  if (!err) return "Terjadi kesalahan yang tidak diketahui.";
  if (typeof err === "string") {
    try {
      const parsed = JSON.parse(err) as { message?: string };
      if (parsed && typeof parsed.message === "string") {
        return parsed.message;
      }
    } catch {
      return err;
    }
    return err;
  }
  if (typeof err === "object") {
    const obj = err as { message?: unknown; code?: unknown };
    if (typeof obj.message === "string") {
      return obj.message;
    }
  }
  return String(err);
}

async function callCommand<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export const ipc = {
  // 1. Setup & Status Terminal
  getTerminalStatus: () => callCommand<TerminalStatus>("get_terminal_status"),
  testClientConnection: (req: SetupClientRequest) =>
    callCommand<HealthCheckResponse>("test_client_connection", { req }),
  setupServerTerminal: (req: SetupServerRequest) =>
    callCommand<TerminalStatus>("setup_server_terminal", { req }),
  setupClientTerminal: (req: SetupClientRequest) =>
    callCommand<TerminalStatus>("setup_client_terminal", { req }),

  // 2. Autentikasi
  login: (req: LoginRequest) => callCommand<AuthSession>("auth_login", { req }),
  logout: () => callCommand<void>("auth_logout"),
  getActiveSession: () =>
    callCommand<AuthSession | null>("get_active_session"),

  // 3. Produk & CSV
  listProducts: (filter: ProductFilter = {}) =>
    callCommand<Product[]>("list_products", { filter }),
  findProductByCode: (code: string) =>
    callCommand<Product>("find_product_by_code", { code }),
  upsertProduct: (req: UpsertProductRequest) =>
    callCommand<Product>("upsert_product", { req }),
  deactivateProduct: (productId: string) =>
    callCommand<void>("deactivate_product", { productId }),
  exportProductsCsv: () => callCommand<string>("export_products_csv"),
  importProductsCsv: (csvContent: string) =>
    callCommand<CsvImportResult>("import_products_csv", { csvContent }),
  importProducts: (rows: ProductImportRow[]) =>
    callCommand<ImportProductsResult>("import_products", { rows }),

  // 4. Inventaris & Stock Adjustment
  createStockAdjustment: (req: CreateStockAdjustmentRequest) =>
    callCommand<StockAdjustment>("create_stock_adjustment", { req }),
  listStockAdjustments: (productId?: string | null) =>
    callCommand<StockAdjustment[]>("list_stock_adjustments", {
      productId: productId ?? null,
    }),

  // 5. Kasir (Sale, Reprint, Void, Held Bill)
  createSale: (req: CreateSaleRequest) =>
    callCommand<ReceiptData>("create_sale", { req }),
  listTodaySales: () => callCommand<SaleWithItems[]>("list_today_sales"),
  getSaleReceipt: (saleId: string, isReprint = true) =>
    callCommand<ReceiptData>("get_sale_receipt", { saleId, isReprint }),
  voidSale: (req: VoidSaleRequest) =>
    callCommand<SaleWithItems>("void_sale", { req }),
  createHeldBill: (req: CreateHeldBillRequest) =>
    callCommand<HeldBill>("create_held_bill", { req }),
  listHeldBills: () => callCommand<HeldBill[]>("list_held_bills"),
  consumeHeldBill: (heldBillId: string) =>
    callCommand<RecalledHeldBill>("consume_held_bill", { heldBillId }),
  deleteHeldBill: (heldBillId: string) =>
    callCommand<void>("delete_held_bill", { heldBillId }),

  // 6. Laporan, Pengguna, & Pengaturan Toko
  getSalesReport: (filter: SalesReportFilter) =>
    callCommand<SalesReport>("get_sales_report", { filter }),
  exportSalesReportCsv: (filter: SalesReportFilter) =>
    callCommand<string>("export_sales_report_csv", { filter }),
  listUsers: () => callCommand<User[]>("list_users"),
  upsertUser: (req: UpsertUserRequest) =>
    callCommand<User>("upsert_user", { req }),
  getStoreSettings: () => callCommand<StoreSettings>("get_store_settings"),
  updateStoreSettings: (req: UpdateStoreSettingsRequest) =>
    callCommand<StoreSettings>("update_store_settings", { req }),

  // 7. Perangkat Keras Lokal & Database Backup
  listLocalPrinters: () => callCommand<string[]>("list_local_printers"),
  updatePrinterConfig: (printer: PrinterConfig) =>
    callCommand<LocalConfig>("update_printer_config", { printer }),
  printReceipt: (receipt: ReceiptData) =>
    callCommand<PrintOutcome>("print_receipt", { receipt }),
  kickCashDrawer: () => callCommand<PrintOutcome>("kick_cash_drawer"),
  testPrinterAndDrawer: (printer?: PrinterConfig, openDrawer = true) =>
    callCommand<PrintOutcome>("test_printer_and_drawer", {
      printer: printer ?? null,
      openDrawer,
    }),
  backupDatabase: (targetPath: string) =>
    callCommand<string>("backup_database", { targetPath }),
  restoreDatabase: (sourcePath: string) =>
    callCommand<void>("restore_database", { sourcePath }),
  quitApplication: () => callCommand<void>("quit_application"),
};
