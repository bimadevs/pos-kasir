# Changelog

Seluruh perubahan penting pada aplikasi **POS-Kasir** didokumentasikan di file ini.
Format mengacu pada [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan proyek ini mematuhi disiplin **Semantic Versioning (`MAJOR.MINOR.PATCH`) Lockstep** di seluruh manifest (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) serta tampilan UI (`src/version.ts`).

## [0.1.5] - 2026-10-19

### Changed
- **Redesain Modern & Responsif Bilah Navigasi Utama (`TopBar.tsx`)**:
  - **Eliminasi Teks Terpotong / 2 Baris**: Menerapkan `whitespace-nowrap` pada seluruh tab dan teks identitas toko, memastikan judul tombol seperti *"Kasir (POS)"*, *"Produk & CSV"*, *"Stok / Koreksi"*, dan *"Laporan & Laba"* selalu tampil rapi dalam satu baris.
  - **Gaya Navigasi Segmented Control Elegan**: Menggantikan tombol ungu gonjreng (`bg-indigo-600`) dengan kapsul *segmented control* gelap (`bg-zinc-900/90`) bergaya aplikasi desktop modern (macOS/Linear), di mana tab aktif berupa *elevated pill* Zinc halus (`bg-zinc-800` dengan border `zinc-700/60`).
  - **Adaptasi Responsif Hybrid untuk Monitor POS**: Tab prioritas *"Kasir (POS)"* selalu tampil penuh. Pada resolusi $\ge 1280$px, seluruh tab manajemen Admin tampil berjajar; sementara pada layar kasir yang lebih sempit (< 1280px), tab admin otomatis dirangkum ke dalam dropdown interaktif *"Menu Manajemen ▾"* lengkap dengan penutup klik-luar dan tombol `Escape`.
  - **Smart Terminal Chip & Brand Identity**: Menata ulang logo dan identitas toko, serta membersihkan nama terminal agar tidak terjadi redundansi kata (contoh: *"Kasir 1 • Server"* alih-alih duplikasi *"Kasir 1 (Server Utama) (Server)"*).
  - **Kapsul Status Terpadu (LAN & Jam Monospace)**: Menggabungkan indikator jaringan LAN (*pulsing status dot* hijau/merah) dan jam digital kasir (`tabular-nums`) ke dalam satu kapsul status minimalis berpresisi tinggi.
  - **Pill Profil Pengguna & Logout Terintegrasi**: Mengemas inisial avatar pengguna, nama kasir, badge peran (`ADMIN`/`CASHIER`), dan tombol keluar sesi kasir ke dalam satu pill interaktif yang ergonomis.

## [0.1.4] - 2026-10-19

### Added
- **Kontrol Offset Margin Kiri Printer Fisik**:
  - Menambahkan field `left_margin_chars` (0–8 karakter spasi, default `0`) pada `PrinterConfig` di backend Rust (`src-tauri/src/config.rs`) dan `src/types/domain.ts`.
  - Menambahkan kontrol interaktif **Offset Margin Kiri (Presisi Tengah)** di halaman Pengaturan Printer (`SettingsPage.tsx`) dengan tombol pemilih spasi cepat (`0` s/d `+6`) dan tombol uji coba langsung (*Test Print*).

### Changed
- **Redesain Pratinjau Struk Kasir (`ReceiptPreviewModal.tsx`)**:
  - Menggantikan tampilan teks mentah dengan **Kartu Struk Thermal Modern & Elegan** yang terstruktur, proporsional, dan simetris tepat di tengah layar.
  - Mengeliminasi masalah teks meluber (*zero overflow*): nama produk panjang, nama kasir, toko, dan alamat dibungkus (*word-wrapped*) secara dinamis dan rapi di dalam batas kertas 58mm maupun 80mm.
  - Menyediakan tombol *tab/toggle* di bilah atas pratinjau untuk beralih antara **"Tampilan Visual Struk"** dan **"Teks Asli ESC/POS"** (lengkap dengan fitur *Salin Teks*).
- **Presisi Perataan Tengah Cetakan Fisik ESC/POS**:
  - Menyelaraskan logika `build_escpos_bytes` dan `render_receipt_text` di `src-tauri/src/hardware/escpos.rs` agar penanda cetakan ulang (`*** CETAKAN ULANG ***`), void, header toko, dan footer struk menggunakan perataan tengah hardware atau offset margin yang terkalibrasi secara konsisten.

## [0.1.3] - 2026-10-19

### Added
- **Integrasi Penuh Logo Resmi Aplikasi**:
  - Mengonversi aset logo resmi (`public/logo.jpg`) menjadi aset beresolusi tinggi (`public/logo.png`), favicon web (`public/favicon.ico`, `public/favicon.png`), dan ikon *apple-touch-icon*.
  - Menghasilkan seluruh bundel ikon desktop Windows & macOS (`src-tauri/icons/icon.ico`, `icon.icns`, PNG multi-resolusi 32x32 hingga 128x128@2x, dan logo UWP/Store) menggunakan Tauri CLI (`pnpm tauri icon`).
  - Menampilkan logo resmi pada bilah navigasi utama (`TopBar`), kartu otentikasi kasir (`LoginPage`), panduan setup terminal (`SetupWizardPage`), dan profil toko (`SettingsPage`).

### Removed
- **Pembersihan Total Logo Default**:
  - Menghapus file SVG bawaan template (`public/tauri.svg` dan `public/vite.svg`).
  - Menggantikan placeholder ikon toko generik di seluruh antarmuka dengan logo resmi aplikasi.

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
