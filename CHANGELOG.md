# Changelog

Seluruh perubahan penting pada aplikasi **POS-Kasir** didokumentasikan di file ini.
Format mengacu pada [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan proyek ini mematuhi disiplin **Semantic Versioning (`MAJOR.MINOR.PATCH`) Lockstep** di seluruh manifest (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) serta tampilan UI (`src/version.ts`).

## [0.1.2] - 2026-10-19

### Changed
- **Redesain Menyeluruh Frontend (Modern Zinc & Deep Indigo)**:
  - Menggantikan tampilan *AI slop* (perpaduan slate-900 kasar, putih kontras tajam, tombol hijau generik, dan warna-warni jenuh yang bersaing) dengan palet netral modern berkarakter: **Modern Zinc** (`zinc-950`/`zinc-900`/`zinc-100`) dan aksen primer terpadu **Deep Indigo** (`indigo-600`/`indigo-500`).
  - Merestrukturisasi tata letak kasir (`PosRegisterPage`): panel pembayaran kanan *high-contrast* dengan visual grand total yang tegas, tombol bayar primer indigo, serta tabel kasir (`CartTable`) ergonomis dengan sorotan baris terpilih yang presisi.
  - Memperbarui seluruh modal kasir (`PaymentModal`, `HeldBillsModal`, `VoidPinModal`, `TodaySalesDrawer`, `ReceiptPreviewModal`) dengan backdrop blur lembut (`backdrop-blur-xs`), sudut lengkung konsisten (`rounded-2xl`), dan penataan tombol yang terstruktur rapi.
  - Memperbarui halaman otentikasi & setup (`LoginPage` dan `SetupWizardPage`) dengan tampilan modern profesional berbasis kartu Zinc berelevasi halus.
  - Memperbarui seluruh modul Admin (`ProductsPage`, `StockAdjustmentPage`, `ReportsPage`, `SettingsPage`, `UsersPage`): kartu KPI keuangan bersih dengan kontras terukur, tabel data dengan *header* Zinc lembut dan garis pemisah halus, serta formulir input dengan *focus ring* indigo (`focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600`).
  - Menetapkan batas ketat untuk warna semantik: hijau emerald murni untuk transaksi sukses & nilai moneter positif, rose untuk pembatalan/void, dan amber untuk diskon & peringatan stok menipis.
  - Menyempurnakan tipografi keyboard shortcut kasir (`kbd-key` & `kbd-key-dark`) dengan tampilan tuts fisik taktil untuk ergonomi kasir minimarket.

## [0.1.1] - 2026-10-19

### Added
- **Manajemen Versi Terpusat (`SemVer Lockstep`)**: Menambahkan modul [`src/version.ts`](src/version.ts) (`APP_VERSION` & `APP_VERSION_LABEL`) sebagai *Single Source of Truth* tampilan versi aplikasi di `TopBar`, `LoginPage`, `PosRegisterPage`, `SetupWizardPage`, dan `SettingsPage`.
- **Automated Version Lockstep Guardrail**: Menambahkan pengujian otomatis di `src/utils/versionLockstep.test.ts` untuk memverifikasi kesamaan versi antara `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`, serta mencegah penulisan string versi *hardcoded* di komponen UI.
- **Aturan Disiplin Versi di `AGENTS.md`**: Menambahkan standar wajib pembaruan versi aplikasi (*SemVer Lockstep*) di dokumen instruksi AI agent.

### Changed
- **GitHub Actions Dynamic Release Versioning**: Memperbarui workflow [`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml) agar membaca nomor versi secara dinamis dari `package.json` saat mempublikasikan installer `.exe` dan `.msi` ke GitHub Releases.

### Fixed
- **Kompilasi Win32 Print Spooler (`windows-sys 0.59`)**: Menambahkan feature `"Win32_Graphics_Gdi"` pada `src-tauri/Cargo.toml` dan menyelaraskan tipe pointer `DOC_INFO_1W` pada `StartDocPrinterW` di `src-tauri/src/hardware/spooler.rs`.

## [0.1.0] - 2026-10-18

### Added
- **Rilis Perdana POS-Kasir (Windows 10/11 64-bit)**:
  - Arsitektur **Dual-Mode LAN** (`Server Terminal` dengan database SQLite WAL & HTTP Server Axum + `Client Terminal` sinkron real-time).
  - Layar **Kasir (`PosRegisterPage`)** *keyboard-first* (`F1`–`F10`) dengan deteksi otomatis *USB HID Barcode Scanner*, *Hold & Recall Bill*, serta *Void* berotorisasi PIN Admin.
  - Pencetakan struk thermal **Raw ESC/POS (58mm/80mm)** dan pemantik laci uang **Cash Drawer RJ11 (`0x1B 0x70`)** via *Win32 Print Spooler* beserta *Virtual Thermal Printer* di layar.
  - Modul Admin lengkap: Manajemen Katalog Produk & Impor/Ekspor CSV, Penyesuaian Stok (`Stock Adjustments`), Laporan Penjualan & Laba Kotor + Ekspor CSV, Manajemen Pengguna (`Admin` & `Cashier`), serta *Online Backup & Restore* SQLite (`VACUUM INTO`).
