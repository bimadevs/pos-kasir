# Drift Resolution & Alignment Report (2026-10-28)

Status: **ALL 11 DRIFT ITEMS RESOLVED AND VERIFIED**
Target Documents: `docs/designs/retail_operations_suite.md` & `docs/designs/SITEMAP.md`
Acuan Spesifikasi: `docs/CONTEXT.md`, `docs/REQUIREMENTS.md`, `docs/SYSTEM-DESIGN.md`

---

## 1. docs/designs/SITEMAP.md
- **Status**: No drift detected.

---

## 2. docs/designs/retail_operations_suite.md

### Item 1: Model Field Incomplete (`ProductPriceTier`)
- **Status**: **RESOLVED**
- **Action**:
  - Menambahkan field `pub updated_at: String` pada struct `ProductPriceTier` di [src-tauri/src/models/mod.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/models/mod.rs).
  - Memperbarui query SQL SELECT dan INSERT di `core_service.rs` (`get_product_price_tiers`, `set_product_price_tiers`, `get_product_by_id`, `create_sale`) agar konsisten memuat kolom `updated_at`.

### Item 2: Missing Validation for Cost Price / HPP (`set_product_price_tiers`)
- **Status**: **RESOLVED**
- **Action**:
  - Mengambil `cost_price` produk pada `set_product_price_tiers` di [src-tauri/src/services/core_service.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/services/core_service.rs) dan menambahkan validasi ketat `tier_price >= cost_price`. Menolak jika harga grosir diatur di bawah modal HPP.
  - Menambahkan validasi sinkron pada sisi client di [src/pages/ProductsPage.tsx](file:///home/bimadev/project/antigravity/pos-kasir/src/pages/ProductsPage.tsx).

### Item 3: Non-Idempotent `close_shift` and Return Type Divergence
- **Status**: **RESOLVED**
- **Action**:
  - Mengubah fungsi `close_shift` di [src-tauri/src/services/core_service.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/services/core_service.rs) agar bersifat idempoten: apabila ID shift yang diminta sudah berstatus `CLOSED`, sistem mengembalikan data shift yang sudah dibekukan secara aman (`Ok(shift)`) alih-alih melempar error, mendukung toleransi retry jaringan LAN saat terjadi partisi koneksi.

### Item 4: Terminal Concurrency Check Missing in `open_shift`
- **Status**: **RESOLVED**
- **Action**:
  - Menambahkan validasi konkurensi terminal pada `open_shift` di [src-tauri/src/services/core_service.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/services/core_service.rs). Menolak pembukaan shift baru jika terminal (`terminal_name`) tersebut sudah memiliki shift aktif berstatus `OPEN`, meskipun dibuka oleh akun kasir yang berbeda.
  - Menambahkan field opsional `terminal_name` pada struct `OpenShiftRequest` di [src-tauri/src/models/mod.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/models/mod.rs).

### Item 5: Discarded Cancellation Reason in `cancel_opname_session`
- **Status**: **RESOLVED**
- **Action**:
  - Menambahkan parameter `reason: &str` pada `cancel_opname_session` di [src-tauri/src/services/core_service.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/services/core_service.rs) dan [src-tauri/src/services/dispatcher.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/services/dispatcher.rs).
  - Alasan pembatalan kini dicatat secara permanen pada kolom `notes` tabel `stock_opname_sessions` (`[Batal: <reason>]`).
  - Handler Axum `handle_cancel_opname_session` di [src-tauri/src/lan/server.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/lan/server.rs) meneruskan alasan pembatalan dari request body.

### Item 6: Missing Stock Opname 2-Sheet Excel Export
- **Status**: **RESOLVED**
- **Action**:
  - Mengimplementasikan `buildOpnameReportWorkbook` di [src/utils/excelService.ts](file:///home/bimadev/project/antigravity/pos-kasir/src/utils/excelService.ts) menggunakan `ExcelJS` untuk membuat laporan 2-sheet profesional: Sheet 1 (*Ringkasan Sesi* dengan metadata & kartu KPI finansial) dan Sheet 2 (*Rincian Fisik Item* dengan formatting moneter, HPP, hitungan fisik vs sistem, serta selisih kuantitas/nilai).
  - Menambahkan tombol aksi "Unduh Excel (2-Sheet)" pada header [src/components/stock/MassOpnameView.tsx](file:///home/bimadev/project/antigravity/pos-kasir/src/components/stock/MassOpnameView.tsx).

### Item 7: Missing Wholesale / Tier Details on Thermal Receipts
- **Status**: **RESOLVED**
- **Action**:
  - Memperbarui format teks struk ESC/POS pada `append_line_item_text` di [src-tauri/src/hardware/escpos.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/hardware/escpos.rs) untuk item dengan harga grosir (`applied_tier_price`): menampilkan harga satuan tier, total harga grosir, dan baris penghematan `↳ [Harga Grosir] (Hemat Rp ...)`.
  - Menyelaraskan pratinjau struk di [src/components/receipt/ReceiptPreviewModal.tsx](file:///home/bimadev/project/antigravity/pos-kasir/src/components/receipt/ReceiptPreviewModal.tsx) dengan badge tier dan nominal penghematan grosir.

### Item 8: Missing Price Tier Support in Excel Product Import/Export
- **Status**: **RESOLVED**
- **Action**:
  - Menambahkan kolom `Min. Beli Grosir` dan `Harga Grosir / Satuan` pada template impor, ekspor produk, dan parser Excel di [src/utils/excelService.ts](file:///home/bimadev/project/antigravity/pos-kasir/src/utils/excelService.ts).
  - Menambahkan field `tier_min_qty` dan `tier_price` pada struct `ProductImportRow` di [src-tauri/src/models/mod.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/models/mod.rs) dan tipe TypeScript [src/types/domain.ts](file:///home/bimadev/project/antigravity/pos-kasir/src/types/domain.ts).
  - Menghubungkan penyimpanan otomatis tier harga grosir saat impor massal produk di [src-tauri/src/services/csv_service.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/services/csv_service.rs).

### Item 9: Missing Active Shift Status Chip in `TopBar.tsx`
- **Status**: **RESOLVED**
- **Action**:
  - Mengintegrasikan state `activeShift` dari `useTerminal()` di [src/components/layout/TopBar.tsx](file:///home/bimadev/project/antigravity/pos-kasir/src/components/layout/TopBar.tsx), menampilkan indikator chip status shift aktif (`Shift Aktif` / `Shift Tutup`) di sebelah indikator LAN.

### Item 10: HTTP LAN Route & Contract Divergences
- **Status**: **RESOLVED**
- **Action**:
  - Menambahkan rute alias `GET /api/v1/shifts/history` di [src-tauri/src/lan/server.rs](file:///home/bimadev/project/antigravity/pos-kasir/src-tauri/src/lan/server.rs).
  - Mendukung query parameter `?terminal_name=...` pada `GET /api/v1/shifts/active`.
  - Menerima `terminal_name` baik dari request body maupun header pada pembukaan shift kasir.
  - Memastikan pencatatan `reason` pada endpoint pembatalan opname.

### Item 11: Unsynced Core Specification Documents
- **Status**: **RESOLVED**
- **Action**:
  - Menambahkan rumus `BR-04` (Prioritas Harga Bertingkat / Grosir) dan kriteria fungsional `FR-SHIFT-01..03`, `FR-OPNAME-01..03`, dan `FR-TIER-01..02` ke dalam [docs/REQUIREMENTS.md](file:///home/bimadev/project/antigravity/pos-kasir/docs/REQUIREMENTS.md).
  - Menambahkan skema DDL SQLite (tabel `cashier_shifts`, `cash_movements`, `stock_opname_sessions`, `stock_opname_items`, `product_price_tiers` beserta indeks) dan memperbarui tabel pemetaan kontrak IPC & HTTP Axum di Section 4.1 pada [docs/SYSTEM-DESIGN.md](file:///home/bimadev/project/antigravity/pos-kasir/docs/SYSTEM-DESIGN.md).

---

## 3. Hasil Verifikasi Otomatis
- **Backend Rust**: `cargo test` lulus 18 dari 18 pengujian (`18 passed; 0 failed`).
- **Frontend Vitest**: `pnpm test` lulus 27 dari 27 unit test (`27 passed; 0 failed`).
- **Frontend Build**: `pnpm build` sukses tanpa error tipe TypeScript (`tsc && vite build`).
