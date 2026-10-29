# Changelog

Seluruh perubahan penting pada aplikasi **Mudita Mart** didokumentasikan di file ini.
Format mengacu pada [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan proyek ini mematuhi disiplin **Semantic Versioning (`MAJOR.MINOR.PATCH`) Lockstep** di seluruh manifest (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) serta tampilan UI (`src/version.ts`).

## [1.1.3] - 2026-10-29

### Fixed
- **Perbaikan Kritis Self-Deadlock Database SQLite saat Kasir Client Login via LAN (`get_active_shift_by_terminal_or_cashier`)**:
  - Menghilangkan penguncian ganda (`std::sync::Mutex<Connection>` re-entrant deadlock) pada `CoreService::get_active_shift_by_terminal_or_cashier` yang sebelumnya mengunci koneksi database kedua kalinya di thread yang sama ketika terminal kasir belum memiliki shift berstatus `OPEN`.
  - Memastikan komputer Server/Admin tidak lagi tertahan di status *"Memuat katalog produk..."* (*infinite loading*) dan komputer Kasir (Client) tidak terputus setelah login kasir atau saat polling shift 5 detik berjalan.
- **URL Encoding Query Parameter pada `RemoteHttpClient::get_active_shift`**:
  - Mengganti interpolasi string mentah `?terminal_name=...` pada path URL dengan `.query(&[("terminal_name", &self.terminal_name)])` agar nama terminal yang mengandung spasi atau tanda kurung (mis. `"Kasir 2 (Client)"`) di-*encode* sesuai standar HTTP.
- **Sinkronisasi Akumulasi `cash_sales_total` Shift Kasir & Resolusi Shift**:
  - Memperbarui kolom `cash_sales_total` pada tabel `cashier_shifts` secara atomik saat transaksi penjualan selesai (`create_sale`), dibatalkan (`void_sale`), maupun ditutup (`close_shift`).
  - Menyelaraskan pembacaan shift aktif pada `BackendDispatcher::get_active_shift` di mode `SERVER` agar turut memeriksa terminal dan kasir secara konsisten.
- **Pelaporan Status Bind Port LAN Akurat & Guard Polling Frontend**:
  - Menyimpan dan melaporkan status error apabila port LAN `3847` gagal di-*bind* (`lan_bind_error`) pada `BackendDispatcher::get_terminal_status`.
  - Menambahkan *in-flight guard* (`useRef`) pada polling 5 detik di `TerminalContext.tsx` agar request status terminal dan shift tidak menumpuk pada jaringan LAN yang lambat.
- **Kelengkapan Tabel pada `restore_database`**:
  - Menyertakan pembersihan dan pemulihan tabel `product_price_tiers`, `cashier_shifts`, `cash_movements`, `stock_opname_sessions`, dan `stock_opname_items` saat melakukan restore database cadangan.

## [1.1.2] - 2026-10-28

### Fixed
- **Ketahanan Jaringan Komunikasi LAN (Client ↔ Server Windows)**:
  - **Bypass Proxy Sistem Windows (`no_proxy`)**: Menonaktifkan auto-detection system proxy pada client HTTP LAN (`RemoteHttpClient`). Memastikan seluruh request LAN ke server terminal lokal tidak diblokir atau diarahkan ke server proxy sekolah/lab komputer.
  - **Connection Pooling & TCP Keepalive**: Menambahkan `tcp_keepalive(30s)`, `pool_idle_timeout(15s)`, dan `tcp_nodelay(true)` pada client reqwest untuk mencegah pemutusan koneksi TCP diam-diam oleh router/switch LAN saat terminal berada dalam keadaan idle.
  - **Peningkatan Batas Waktu Request (Timeout 30 Detik)**: Memperpanjang batas waktu timeout dari 6 detik menjadi 30 detik (dengan `connect_timeout` 10 detik) untuk mencegah false timeout pada PC server berkecepatan rendah atau disk lambat saat proses I/O transaksi SQLite berlangsung.
  - **Daur Ulang Client HTTP Terpusat (`remote_client_cache`)**: Menyimpan dan mendaur ulang instance client HTTP pada `BackendDispatcher` daripada membuat client baru pada setiap panggilan IPC, mengeliminasi socket churn dan port exhaustion pada Windows.
  - **Sanitasi Alamat IP & Port Input**: Menambahkan `sanitize_server_ip_and_port` yang secara cerdas membersihkan prefiks protokol (`http://`, `https://`), trailing slash, dan mengekstrak port jika pengguna memasukkan format `IP:PORT` pada form input IP.
  - **Sanitasi Header Nilai ASCII (`safe_header_value`)**: Menjamin seluruh header HTTP (`x-terminal-name`, `x-pairing-code`, `x-session-token`) hanya berisi karakter ASCII yang diizinkan (RFC 7230/9110) sehingga tidak memicu error parser reqwest ketika terminal diberi nama dengan karakter spesial.
  - **Penyembuhan Otomatis Server LAN (`ensure_lan_server_running`)**: Memastikan instance task Axum LAN server yang terhenti atau mengalami kegagalan binding secara otomatis dihidupkan kembali (*self-healing*).
  - **Pesan Kesalahan Jaringan Informatif**: Menyesuaikan mapping `From<reqwest::Error> for AppError` agar menampilkan penjelasan bahasa Indonesia yang ramah pengguna dan solutif (panduan pemeriksaan Windows Defender Firewall, IP/Port, serta status server).
  - **Deteksi IP LAN Lokal Multi-Probe (Mode Offline)**: Menambahkan probe alamat lokal (`192.168.1.1`, `10.0.0.1`, dll.) pada `detect_local_lan_ips` sehingga IP LAN server tetap terdeteksi pada laboratorium komputer sekolah yang tidak terhubung ke internet luar (offline).
  - **Koreksi Tampilan Port LAN di Settings**: Memperbaiki fallback port default pada kartu konektivitas LAN di `SettingsPage.tsx` menjadi 3847 (sebelumnya tertulis 9876).
  - **Dukungan Payload Ukuran Besar (25MB)**: Menambahkan `DefaultBodyLimit::max(25MB)` pada Axum router LAN untuk menjamin transfer CSV impor/ekspor massal berjalan lancar tanpa terpotong batas 2MB.

## [1.1.1] - 2026-10-28

### Added
- **Ekspor Excel Laporan Opname 2-Sheet (`buildOpnameReportWorkbook`)**:
  - Format laporan rekonsiliasi audit fisik berbasis `ExcelJS` dengan 2 lembar kerja profesional: Sheet 1 (*Ringkasan Sesi* dengan kartu KPI finansial & metadata) dan Sheet 2 (*Rincian Fisik Item* dengan formatting moneter, HPP, hitungan fisik vs sistem, serta selisih kuantitas/nilai).
  - Tombol aksi "Unduh Excel (2-Sheet)" pada header tampilan audit opname massal (`MassOpnameView.tsx`).
- **Dukungan Harga Grosir Bertingkat pada Impor & Ekspor Excel**:
  - Kolom `Min. Beli Grosir` dan `Harga Grosir / Satuan` pada template impor, ekspor produk, dan parser Excel di `excelService.ts`.
  - Integrasi penyimpanan aturan tier harga grosir otomatis saat proses impor produk massal (`import_products_rows`).
- **Detail Harga Grosir pada Struk Kasir & Pratinjau**:
  - Struk thermal ESC/POS (`append_line_item_text`) dan pratinjau struk (`ReceiptPreviewModal.tsx`) kini menampilkan harga satuan grosir, total harga grosir, dan baris penghematan `↳ [Harga Grosir] (Hemat Rp ...)`.
- **Indikator Status Shift Kasir Aktif**:
  - Chip status shift kasir (`Shift Aktif` / `Shift Tutup`) pada `TopBar.tsx` yang bersumber langsung dari `useTerminal().activeShift`.

### Fixed
- **Validasi Batas Bawah HPP Harga Grosir**:
  - Validasi ketat `tier_price >= cost_price` pada backend (`core_service.rs`) dan antarmuka client (`ProductsPage.tsx`) untuk melindungi margin toko dari penjualan di bawah harga pokok penjualan.
- **Idempotensi Penutupan Shift Kasir (`close_shift`)**:
  - Penutupan shift berulang pada shift yang sudah berstatus `CLOSED` kini mengembalikan data shift yang telah dibekukan secara aman (`Ok(shift)`), menjamin ketahanan terhadap retry jaringan LAN saat terjadi partisi koneksi.
- **Pemeriksaan Konkurensi Terminal pada Pembukaan Shift (`open_shift`)**:
  - Menolak pembukaan shift baru pada terminal yang sudah memiliki shift aktif berstatus `OPEN`, mencegah benturan kasir pada terminal fisik yang sama.
- **Pencatatan Alasan Pembatalan Opname (`cancel_opname_session`)**:
  - Meneruskan dan mencatat alasan pembatalan sesi opname ke kolom `notes` tabel `stock_opname_sessions` (`[Batal: <reason>]`).
- **Sinkronisasi Rute LAN & Query Parameter**:
  - Mendaftarkan rute alias `GET /api/v1/shifts/history` dan mendukung parameter `?terminal_name=...` pada `GET /api/v1/shifts/active`.
- **Sinkronisasi Dokumen Spesifikasi Inti SDD**:
  - Memperbarui skema DDL SQLite (tabel 8–12), indeks, dan tabel kontrak IPC/HTTP Section 4.1 pada `docs/SYSTEM-DESIGN.md`.
  - Menambahkan rumus bisnis `BR-04` serta kriteria fungsional `FR-SHIFT-01..03`, `FR-OPNAME-01..03`, dan `FR-TIER-01..02` pada `docs/REQUIREMENTS.md`.

## [1.1.0] - 2026-10-28

### Added
- **Retail Operations Suite (Modul Operasional Ritel Lanjutan)**:
  - **Manajemen Shift Kasir & Rekap Kas Laci (Cashier Shifts & Drawer Reconciliation)**:
    - Siklus shift kasir mandiri (`cashier_shifts`): pembukaan shift modal awal (`opening_float`), pencatatan mutasi kas masuk/keluar (`cash_movements` / `F7`) dengan validasi solvabilitas kas laci, dan penutupan shift metode *Blind Close* tanpa bocoran angka sistem.
    - Laporan X (Ringkasan penjualan shift berjalan) dan Laporan Z (Rekap audit resmi tutup shift) dengan kalkulasi selisih kas fisik (*cash discrepancy*).
    - Otomatisasi kick drawer pulsa RJ11 ESC/POS pada penutupan shift dan pencetakan struk audit thermal 58mm/80mm.
    - Tab "Rekap Shift & Kas Laci" pada halaman Laporan (`ReportsPage.tsx`).
  - **Alur Stok Opname Fisik Massal (Mass Physical Stock Opname)**:
    - Sesi audit fisik toko (`stock_opname_sessions` & `stock_opname_items`) dengan snapshot stok sistem beku.
    - Mode pemindaian USB barcode scanner: Mode ADD (`+1` count per scan) dan Mode REPLACE (input kuantitas fisik pasti).
    - Tabel rekonsiliasi selisih stok (Surplus vs Defisit) dan valuasi nominal HPP finansial real-time.
    - Otorisasi komit atomik (`commit_opname_session`) terlindungi PIN Admin dengan pencatatan otomatis ke mutasi inventaris SQLite.
    - Tab "Audit Opname Fisik Massal" pada halaman Penyesuaian Stok (`StockAdjustmentPage.tsx`).
  - **Diskon Grosir / Harga Bertingkat (Tiered Pricing & BR-04 Integration)**:
    - Konfigurasi tier harga grosir (`product_price_tiers`) berbasis kuantitas minimum (`min_quantity >= 2`, `tier_price < selling_price`).
    - Evaluasi otomatis kuantitas keranjang kasir (`posCalculator.ts` & `core_service.rs`): saat syarat kuantitas grosir terpenuhi, harga grosir menggantikan diskon reguler demi menjaga profit margin toko.
    - Tab "Harga Grosir / Bertingkat" pada formulir produk (`ProductsPage.tsx`).
    - Lencana "Grosir" dan petunjuk hemat upselling pada tabel keranjang kasir (`CartTable.tsx`).
  - **Dukungan Dual-Mode LAN**:
    - Seluruh endpoint shift, opname massal, dan harga bertingkat didukung penuh pada topologi Dual-Mode LAN (Axum REST API Server & Reqwest HTTP Client) dengan delegasi transparan via `BackendDispatcher`.

## [1.0.0] - 2026-10-24

### Added
- **Rebranding Resmi Menjadi "Mudita Mart"**:
  - Transformasi identitas visual, logo, dan penamaan aplikasi menjadi **Mudita Mart** dengan tagline resmi *"Sistem Kasir Ritel SMK Mudita"*.
  - Pemrosesan logo resmi SMK Mudita (`public/SMK_MUDITA.webp`) menjadi aset cutout transparan beresolusi tinggi di seluruh level aplikasi (`logo.png`, `logo-dark.png`, `logo-emblem.png`, `favicon.ico`, `favicon.png`).
  - Generasi bundel ikon desktop multi-resolusi untuk Windows 10/11 (`icon.ico`, `icon.png`, `32x32.png` s/d `256x256.png`, dan seluruh ubin Windows `Square*.png`).
- **Sistem Desain Visual Baru (Forest Green & Warm Gold)**:
  - Mengintegrasikan palet primer **Mudita Forest Green (`#16a34a` / `#15803d`)** yang selaras dengan lambang daun/padi pada logo SMK Mudita dengan kontras tinggi standar WCAG AAA.
  - Mengadopsi aksen **Kuning Keemasan / Warm Gold (`#f59e0b` / `#fbbf24`)** untuk teks brand, penanda status transaksi tertunda (Hold Bill), dan kartu ringkasan.
  - Mengadopsi palet latar belakang gelap **Deep Emerald Charcoal (`#0a130f` s/d `#1b2e24`)** pada bilah atas (TopBar), kartu login, dan panel pembayaran kasir (Payment Cockpit) untuk kenyamanan mata shift 12 jam.
  - Memperbarui palet tema ekspor spreadsheet Excel (`excelService.ts`) dengan header Forest Green dan aksen Gold yang elegan.
- **Konfigurasi Produksi & Database Mandiri**:
  - Migrasi basis data lokal ke `muditamart.db` di dalam `%APPDATA%\com.bimadev.muditamart`.
  - Pembaruan konfigurasi biner Tauri v2: identifier `com.bimadev.muditamart` dan nama produk Windows installer `"Mudita Mart"`.
  - Pembaruan teks identitas pada driver printer virtual ESC/POS dan header struk pengujian.

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
- **Rebranding Resmi Menjadi "Mudita Mart" & Sistem Aset Logo Baru**:
  - Mengubah identitas aplikasi dari *POS-Kasir* menjadi **Mudita Mart** di seluruh tingkatan teknis dan antarmuka pengguna (`package.json`, `src-tauri/tauri.conf.json` dengan `identifier: "com.bimadev.muditamart"`, window title, system tray, dan skema database `muditamart.db`).
  - Mengintegrasikan logo resmi Mudita Mart dengan pembuatan aset transparan berkualitas tinggi: logo transparan (`/logo-transparent.png`), logo gelap dengan kata "Mudita" putih dan "Mart" teal (`/logo-dark.png`), emblem transparan (`/logo-emblem.png`), emblem kontras tinggi untuk latar gelap (`/logo-emblem-dark.png`), dan favicon aplikasi (`/favicon.png`).
  - Tipografi wordmark adaptif: pada latar gelap (TopBar, Login, Setup Wizard) kata "Mudita" dirender putih bersih (`#ffffff`) dan "Mart" dalam Mudita Teal (`#1da2a1`), sedangkan pada latar terang menggunakan Charcoal Slate (`#394048`).

### Changed
- **Penyelarasan Palet Warna Mengikuti Logo Resmi Mudita Mart (`#1da2a1` Teal & `#394048` Charcoal Slate)**:
  - **`DESIGN.md`**: Memperbarui spesifikasi desain sistem menyeluruh ke *Mudita Mart Design System* dengan token warna utama Mudita Teal (`#1da2a1`, hover `#22b8b7`, active `#0e6e6d`) dan Slate Framing (`#12161a`, `#1a2026`, `#394048`).
  - **`src/App.css`**: Menambahkan pemetaan tema Tailwind CSS v4 `@theme` dengan skala warna Teal (`--color-teal-600: #1da2a1`, dll.) dan Charcoal Slate (`--color-charcoal: #394048`).
  - **Konsistensi Seluruh Layar & Komponen**:
    - **`TopBar.tsx`**: Menampilkan emblem resmi Mudita Mart, tipografi dual-tone brand ("Mudita" putih + "Mart" teal), bingkai Charcoal Slate-950, dan avatar Admin Mudita Teal.
    - **`LoginPage.tsx`**: Menggunakan logo kontras tinggi Mudita Mart, tombol submit Mudita Teal, dan bingkai Slate gelap.
    - **`SetupWizardPage.tsx`**: Mengadopsi palet Mudita Teal untuk kartu server/client, input, checkbox, dan tombol inisialisasi; memperbarui label penyimpanan lokal ke `%APPDATA%\com.bimadev.muditamart`.
    - **`PosRegisterPage.tsx`**: Tombol utama pembayaran kasir `[F8]` diubah menjadi Mudita Teal (`bg-teal-600 hover:bg-teal-500 active:bg-teal-700`), ring fokus dan dropdown pencarian barang menggunakan aksen Teal.
    - **`CartTable.tsx`**: Indikator baris keranjang terpilih diselaraskan ke `border-l-teal-600 bg-teal-50/70` dan border input kuantitas ke `border-teal-600`.
    - **`PaymentModal.tsx`**: Menyeragamkan input nominal, tombol uang pas, dan tombol transaksi baru ke palet Mudita Teal dan Slate.
    - **`HeldBillsModal.tsx` & `TodaySalesDrawer.tsx`**: Menyeragamkan header modal ke Slate-900, ikon aksen, dan tombol panggil/simpan ke Mudita Teal.
    - **`ReceiptPreviewModal.tsx`**: Header struk diselaraskan ke Slate-900 dan tombol aksi ke Mudita Teal; menyederhanakan pratinjau struk kasir agar langsung dan hanya menampilkan teks asli ESC/POS monospaced di atas kertas thermal proporsional (58mm / 80mm), meniadakan tab visual grafis dan tab switcher, serta menghapus tombol salin teks.
    - **`ProductsPage.tsx`**: Tombol tambah produk, import CSV, indikator diskon aktif, input form, live preview margin laba, dan tombol simpan diselaraskan ke Mudita Teal dan Slate-900.
    - **`UsersPage.tsx`**: Avatar identitas Admin menggunakan Mudita Teal (`bg-teal-600 text-white border-teal-500`), kartu pemilih peran Admin, dan tombol aksi form diselaraskan ke Mudita Teal.
    - **`StockAdjustmentPage.tsx`**: Formulir mutasi stok, badge jenis mutasi CORRECTION, dan preview stok akhir diselaraskan ke Mudita Teal dan Slate-900.
    - **`ReportsPage.tsx`**: Input filter tanggal, kasir, dan terminal diselaraskan ke focus ring Mudita Teal.
    - **`SettingsPage.tsx`**: Nilai default printer virtual diubah menjadi `Mudita Mart Virtual Thermal Printer (Simulasi)`, nama file backup menjadi `muditamart-backup.db`, dan seluruh tombol aksi diselaraskan ke Mudita Teal.
  - **Backend Rust (`src-tauri/`)**:
    - Paket crate diubah menjadi `name = "mudita-mart"` dan pustaka `mudita_mart_lib`.
    - Tray menu menampilkan "Buka Mudita Mart" dan tooltip "Mudita Mart — Server & Kasir Minimarket".
    - Jalur penyimpanan data dan validasi database backup diselaraskan ke `muditamart.db`.

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
