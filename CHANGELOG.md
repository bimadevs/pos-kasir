# Changelog

Seluruh perubahan penting pada aplikasi **Kassio** didokumentasikan di file ini.
Format mengacu pada [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan proyek ini mematuhi disiplin **Semantic Versioning (`MAJOR.MINOR.PATCH`) Lockstep** di seluruh manifest (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) serta tampilan UI (`src/version.ts`).

## [0.3.0] - 2026-10-23

### Added
- **Subsistem Excel (.xlsx) Multi-Sheet Ramah Admin Awam**:
  - Mengintegrasikan pustaka `exceljs` untuk menghasilkan dan mem-parsing berkas spreadsheet Excel (`.xlsx`) modern, berformat rapi, dan mudah dikelola oleh admin toko yang awam.
  - **Template Impor 2-Sheet**:
    - Sheet 1 (`Data Produk`): Judul kolom Bahasa Indonesia ramah awam, proteksi kolom barcode EAN-13 & SKU sebagai format teks (`@`) anti-notasi ilmiah (`8.99E+11`) tanpa memotong angka nol di awal, dropdown validasi data langsung di dalam sel (`Kategori`, `Satuan`, `Tipe Diskon`, `Status Aktif`), serta format mata uang Rupiah (`"Rp" #,##0`).
    - Sheet 2 (`Petunjuk & Aturan`): Panduan pengisian langkah demi langkah, arti setiap kolom, batasan nilai, dan contoh data minimarket Indonesia.
  - **Ekspor Katalog Produk**: Ekspor seluruh katalog ke dalam file Excel 2-sheet bertema profesional Navy Blue dengan auto-filter aktif.
  - **Ekspor Laporan Penjualan 2-Sheet**:
    - Sheet 1 (`Ringkasan Laporan`): Kartu KPI kinerja penjualan (omzet kotor, diskon, penjualan bersih, HPP, laba kotor, margin %, total transaksi sukses/void, rekap metode bayar, dan produk terlaris).
    - Sheet 2 (`Rincian Penjualan`): Tabel transaksi per item lengkap dengan format Rupiah, tanggal, waktu, nomor struk, dan status void.
  - **Modal Pratinjau Impor Interaktif (`ProductImportPreviewModal.tsx`)**:
    - Menampilkan ringkasan visual sebelum data disimpan (jumlah total baris, produk baru vs update).
    - Deteksi kesalahan otomatis secara visual dengan sorotan baris merah dan daftar error spesifik per kolom.
    - Penguncian tombol simpan (Atomic Protection) hingga seluruh baris valid untuk melindungi integritas data inventaris kasir.
    - Toleransi cerdas terhadap simbol `Rp`, pemisah ribuan titik/koma, alias nama kolom, dan variasi status `Aktif`/`1`/`Ya`.
  - **Backend Rust Atomik & Dukungan LAN Dual-Mode**:
    - Menambahkan `CoreService::import_products_rows` untuk upsert massal atomik (`BEGIN IMMEDIATE`) dan pencatatan otomatis ke riwayat `stock_adjustments` jika stok produk yang ada diubah.
    - Menambahkan rute server LAN `POST /api/v1/products/import` dan fungsi klien HTTP Reqwest untuk sinkronisasi terminal klien.
    - Menambahkan perintah Tauri IPC `import_products`.

### Changed
- **Penyelarasan Antarmuka & SDD**:
  - Mengubah label menu bilah navigasi atas (`TopBar.tsx`) dari `"Produk & CSV"` menjadi `"Katalog Produk"`.
  - Mengubah seluruh tombol aksi di `ProductsPage.tsx` menjadi `"Template Excel"`, `"Import Excel"`, dan `"Export Excel"`.
  - Mengubah tombol aksi di `ReportsPage.tsx` menjadi `"Ekspor Excel Laporan"`.
  - Memperbarui `AGENTS.md` untuk mewajibkan agent proaktif langsung menaikkan nomor versi saat menyelesaikan fitur baru besar atau perombakan modul.
  - Memperbarui spesifikasi SDD `docs/REQUIREMENTS.md` (`FR-PROD-04`, `FR-REP-03`), `docs/SYSTEM-DESIGN.md`, dan tiket implementasi `.scratch/pos-kasir/issues/07-excel-import-export-redesign.md`.

## [0.2.0] - 2026-10-21

### Added
- **Rebranding Resmi Menjadi "Kassio" & Sistem Aset Logo Baru**:
  - Mengubah identitas aplikasi dari *POS-Kasir* menjadi **Kassio** di seluruh tingkatan teknis dan antarmuka pengguna (`package.json`, `src-tauri/tauri.conf.json` dengan `identifier: "com.bimadev.kassio"`, window title, system tray, dan skema database `kassio.db`).
  - Mengintegrasikan logo resmi Kassio dengan pembuatan aset transparan berkualitas tinggi: logo transparan (`/logo-transparent.png`), logo gelap dengan kata "Kas" putih dan "sio" teal (`/logo-dark.png`), emblem "K" transparan (`/logo-emblem.png`), emblem kontras tinggi untuk latar gelap (`/logo-emblem-dark.png`), dan favicon aplikasi (`/favicon.png`).
  - Tipografi wordmark adaptif: pada latar gelap (TopBar, Login, Setup Wizard) kata "Kas" dirender putih bersih (`#ffffff`) dan "sio" dalam Kassio Teal (`#1da2a1`), sedangkan pada latar terang "Kas" menggunakan Charcoal Slate (`#394048`).

### Changed
- **Penyelarasan Palet Warna Mengikuti Logo Resmi Kassio (`#1da2a1` Teal & `#394048` Charcoal Slate)**:
  - **`DESIGN.md`**: Memperbarui spesifikasi desain sistem menyeluruh ke *Kassio Design System* dengan token warna utama Kassio Teal (`#1da2a1`, hover `#22b8b7`, active `#0e6e6d`) dan Slate Framing (`#12161a`, `#1a2026`, `#394048`).
  - **`src/App.css`**: Menambahkan pemetaan tema Tailwind CSS v4 `@theme` dengan skala warna Teal (`--color-teal-600: #1da2a1`, dll.) dan Charcoal Slate (`--color-charcoal: #394048`).
  - **Konsistensi Seluruh Layar & Komponen**:
    - **`TopBar.tsx`**: Menampilkan emblem resmi Kassio, tipografi dual-tone brand ("Kas" putih + "sio" teal), bingkai Charcoal Slate-950, dan avatar Admin Kassio Teal.
    - **`LoginPage.tsx`**: Menggunakan logo kontras tinggi Kassio, tombol submit Kassio Teal, dan bingkai Slate gelap.
    - **`SetupWizardPage.tsx`**: Mengadopsi palet Kassio Teal untuk kartu server/client, input, checkbox, dan tombol inisialisasi; memperbarui label penyimpanan lokal ke `%APPDATA%\com.bimadev.kassio`.
    - **`PosRegisterPage.tsx`**: Tombol utama pembayaran kasir `[F8]` diubah menjadi Kassio Teal (`bg-teal-600 hover:bg-teal-500 active:bg-teal-700`), ring fokus dan dropdown pencarian barang menggunakan aksen Teal.
    - **`CartTable.tsx`**: Indikator baris keranjang terpilih diselaraskan ke `border-l-teal-600 bg-teal-50/70` dan border input kuantitas ke `border-teal-600`.
    - **`PaymentModal.tsx`**: Menyeragamkan input nominal, tombol uang pas, dan tombol transaksi baru ke palet Kassio Teal dan Slate.
    - **`HeldBillsModal.tsx` & `TodaySalesDrawer.tsx`**: Menyeragamkan header modal ke Slate-900, ikon aksen, dan tombol panggil/simpan ke Kassio Teal.
    - **`ReceiptPreviewModal.tsx`**: Header struk diselaraskan ke Slate-900 dan tombol aksi ke Kassio Teal; menyederhanakan pratinjau struk kasir agar langsung dan hanya menampilkan teks asli ESC/POS monospaced di atas kertas thermal proporsional (58mm / 80mm), meniadakan tab visual grafis dan tab switcher, serta menghapus tombol salin teks.
    - **`ProductsPage.tsx`**: Tombol tambah produk, import CSV, indikator diskon aktif, input form, live preview margin laba, dan tombol simpan diselaraskan ke Kassio Teal dan Slate-900.
    - **`UsersPage.tsx`**: Avatar identitas Admin menggunakan Kassio Teal (`bg-teal-600 text-white border-teal-500`), kartu pemilih peran Admin, dan tombol aksi form diselaraskan ke Kassio Teal.
    - **`StockAdjustmentPage.tsx`**: Formulir mutasi stok, badge jenis mutasi CORRECTION, dan preview stok akhir diselaraskan ke Kassio Teal dan Slate-900.
    - **`ReportsPage.tsx`**: Input filter tanggal, kasir, dan terminal diselaraskan ke focus ring Kassio Teal.
    - **`SettingsPage.tsx`**: Nilai default printer virtual diubah menjadi `Kassio Virtual Thermal Printer (Simulasi)`, nama file backup menjadi `kassio-backup.db`, dan seluruh tombol aksi diselaraskan ke Kassio Teal.
  - **Backend Rust (`src-tauri/`)**:
    - Paket crate diubah menjadi `name = "kassio"` dan pustaka `kassio_lib`.
    - Tray menu menampilkan "Buka Kassio" dan tooltip "Kassio — Server & Kasir Minimarket".
    - Jalur penyimpanan data dan validasi database backup diselaraskan ke `kassio.db`.

## [0.1.7] - 2026-10-21

### Added
- **Spesifikasi Desain Komprehensif (`DESIGN.md`)**:
  - Menyusun panduan sistem desain resmi (*Single Source of Truth*) yang mencakup filosofi desain, token warna semantik normatif (Dark Zinc Frame, Precision Indigo, Operational Emerald, Amber Warning, Rose Danger), skala tipografi dan *tabular-nums*, radius kelengkungan standar (`rounded-2xl` untuk kartu/modal, `rounded-xl` untuk tombol/input, `rounded-md` untuk keycap/badge), standar micro-interactions (`active:scale-[0.98]`), serta aturan audit per komponen dan per layar.

### Changed
- **Penyelarasan Konsistensi UI/UX Seluruh Layar & Komponen (Full Redesign Polish)**:
  - **`src/App.css`**: Menyelaraskan CSS custom properties token warna semantik (`--accent-indigo-hover: #6366f1`, `--accent-emerald`, `--accent-rose`) dan radius keycap fisik mekanikal (`0.375rem`).
  - **`LoginPage.tsx`**: Menyeragamkan ketinggian input (`h-10 rounded-xl`), focus ring, dan tombol login primer (`h-11 rounded-xl active:scale-[0.98]`).
  - **`SetupWizardPage.tsx`**: Menyelaraskan kartu pemilihan Server/Client ke `rounded-2xl`, form input ke `h-10 rounded-xl`, dan tombol aksi ke `rounded-xl active:scale-[0.98]`.
  - **`TopBar.tsx`**: Menyeragamkan warna badge avatar inisial pengguna (`bg-indigo-600` untuk Admin, `bg-zinc-800` untuk Kasir) dan kapsul segmented control.
  - **`PosRegisterPage.tsx`**: Menyeragamkan tombol operasional (Hold, Recall, Riwayat/Void, Reprint) dengan `active:scale-[0.98]`, tombol Bayar Cepat Uang Pas (`F9`) dengan tema Emerald `btnSuccess`, dan Proses Pembayaran (`F8`) dengan tema Indigo `btnPrimary`.
  - **`CartTable.tsx`**: Memperbarui container keranjang ke `rounded-2xl border-zinc-200/90` dan baris terpilih ke `bg-indigo-50/70 border-l-4 border-l-indigo-600`.
  - **`PaymentModal.tsx`**: Menghilangkan duplikasi tag penutup, menyelaraskan backdrop ke `bg-zinc-950/70 backdrop-blur-xs`, tombol pecahan cepat ke `rounded-xl active:scale-[0.98]`, dan tombol konfirmasi ke `btnSuccess` Emerald.
  - **`HeldBillsModal.tsx`**: Menghilangkan duplikasi elemen JSX, menyeragamkan input, tombol aksi, dan kartu daftar hold bill.
  - **`VoidPinModal.tsx`**: Menyeragamkan tombol aksi modal otorisasi void (`btnSecondary` Batal, `btnDanger` Konfirmasi Void) dengan micro-interaction `active:scale-[0.98]`.
  - **`TodaySalesDrawer.tsx`**: Menyeragamkan badge status (Emerald untuk Completed, Rose untuk Voided) dan tombol aksi drawer.
  - **`ReceiptPreviewModal.tsx`**: Menyeragamkan tombol cetak ulang dan tombol selesai dengan tema semantik konsisten.
  - **`ProductsPage.tsx`**: Mengganti filter warna-warni acak dengan kartu Dark Zinc aktif terpadu beserta dot indikator status; menyeragamkan seluruh tombol aksi dan modal.
  - **`UsersPage.tsx`**: Menghilangkan hash warna acak pelangi pada avatar pengguna; menyelaraskan avatar ke palet semantik berbasis peran (`Indigo` untuk Admin, `Zinc` untuk Kasir); menyeragamkan tombol segarkan dan aksi tabel.
  - **`StockAdjustmentPage.tsx`**: Menyeragamkan tombol muat ulang, formulir mutasi, tombol arah koreksi (+ Tambah Stok / - Kurangi Stok), dan badge mutasi.
  - **`ReportsPage.tsx`**: Menyeragamkan tombol preset tanggal, tombol export CSV, kartu KPI finansial, serta tombol aksi baris riwayat penjualan.
  - **`SettingsPage.tsx`**: Menyeragamkan tombol Simpan Printer, Test Print, Buka Laci, Simpan Identitas Toko, Backup Database, dan Restore Database ke standar `hover:bg-indigo-500 active:bg-indigo-700 active:scale-[0.98]`.

## [0.1.6] - 2026-10-20

### Fixed
- **Visibilitas Pesan Error Modal Pengguna (`UsersPage.tsx`) & Produk (`ProductsPage.tsx`)**:
  - Memperbaiki bug kritis di mana pesan kesalahan (*validation* / *database error*) saat menambah atau mengedit akun pengguna tersembunyi di balik latar belakang overlay pop-up yang gelap dan buram (*blurred backdrop* `z-40`).
  - Menghadirkan banner peringatan error interaktif (`role="alert"`, `aria-live="assertive"`) tepat di bagian atas formulir di dalam modal card dengan kontras tinggi, ikon `AlertCircle`, judul deskriptif, pesan solusi yang jelas, dan tombol tutup mandiri.
  - Menghilangkan bug pesan error kabur yang serupa pada modal tambah/edit katalog produk (`ProductsPage.tsx`).
  - Menerjemahkan pesan error teknis database SQLite (`UNIQUE constraint failed: users.username` / `products.sku`) menjadi instruksi bahasa Indonesia yang ramah dan langsung dapat dipahami kasir/admin.

### Changed
- **Peningkatan UI/UX Grade Maksimal Manajemen Pengguna (`UsersPage.tsx`)**:
  - **Pilihan Peran Interaktif (Role Cards)**: Menggantikan dropdown standar dengan kartu pemilih peran visual antara `CASHIER` (Kasir Operasional) dan `ADMIN` (Pemilik / Manajer) lengkap dengan ikon, deskripsi hak akses, dan ring status aktif.
  - **Fitur Lihat/Sembunyikan Kata Sandi & PIN**: Menambahkan tombol toggle mata (`Eye` / `EyeOff`) pada kolom Kata Sandi dan PIN Otorisasi Void agar admin/kasir dapat memverifikasi input tanpa salah ketik.
  - **Sinkronisasi Validasi Panjang Kata Sandi**: Memperbarui instruksi dan validasi batas minimal kata sandi dari 4 karakter menjadi 6 karakter agar selaras dengan aturan keamanan backend Argon2id.
  - **Metrik Ringkasan & Pencarian Real-Time**: Menambahkan 4 kartu ringkasan eksekutif (Total Pengguna, Kasir Operasional, Admin & Manajer, PIN Void Terkonfigurasi) serta bilah pencarian nama/username dan filter peran/status.
  - **Ergonomi Keyboard Modal Desktop**: Mendukung penutupan modal cepat menggunakan tombol keyboard `Escape` dan klik di luar area backdrop modal.
  - **Avatar Inisial Pengguna Otomatis**: Memberikan badge inisial nama dengan palet warna teratur pada tabel daftar pengguna untuk kemudahan pemindaian visual.

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
