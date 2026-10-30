# Spesifikasi Antarmuka, Pintasan Keyboard, & Ergonomi Kasir (UI-UX-SPEC) — POS-Kasir

Dokumen ini mendefinisikan struktur layar, perilaku *Barcode Scanner USB*, pemetaan pintasan keyboard (*shortcuts*), dan alur interaksi pengguna agar **Cashier** dan **Admin** dapat bekerja dengan cepat tanpa bergantung pada mouse.

---

## 1. Prinsip Desain Antarmuka Kasir Minimarket

1. **Keyboard-First & Scanner-Ready**: Di layar kasir (**POS Register**), seluruh aksi harian dapat dilakukan 100% melalui keyboard dan *Barcode Scanner*.
2. **Kontras Tinggi & Keterbacaan Jarak Meja Kasir**: Angka `Total Tagihan`, `Tunai Diterima`, dan `Kembalian` menggunakan ukuran font ekstra besar (`32px`–`48px`, `tabular-nums` / *monospace alignment*) agar mudah terlihat oleh kasir maupun pembeli.
3. **Umpan Balik Instan (Visual & Audio)**:
   - Scan berhasil $\rightarrow$ *highlight* hijau singkat pada baris item yang bertambah.
   - Scan gagal (barcode tidak dikenal atau **Stok = 0**) $\rightarrow$ bunyi *error beep* (Web Audio API oscillator singkat) + banner peringatan merah jelas di bagian atas keranjang.
4. **Indikator Status LAN & Terminal Selalu Terlihat**: Bilah atas (*Top Bar*) selalu menampilkan:
   - Nama Terminal & Mode (contoh: `🖥️ Kasir 2 (Client) — Terhubung ke Server 192.168.1.10` dengan titik hijau, atau titik merah berkedip jika koneksi LAN terputus).
   - Nama **User** yang sedang aktif beserta badge perannya (`CASHIER` atau `ADMIN`).

---

## 2. Deteksi *USB Barcode Scanner* (HID Keyboard Wedge)

*Barcode Scanner USB* standar bekerja dengan mengetikkan karakter kode barang secara beruntun dengan sangat cepat ($\le 30\text{ ms}$ antar karakter) lalu diakhiri tombol `Enter`.

### Aturan Implementasi `useBarcodeScanner` Hook
1. **Tangkap Global di Layar POS**: Listener `keydown` tingkat `window` memantau jeda waktu (`performance.now()`) antar karakter yang dapat dicetak (*printable characters*).
2. Jika terdapat rangkaian $\ge 3$ karakter beruntun dengan jeda antar karakter $< 40\text{ ms}$ yang diakhiri `Enter` (bahkan ketika kursor tidak sedang berada di kotak pencarian), sistem mengenalinya sebagai input **Barcode Scanner** dan langsung memanggil `find_product_by_code(code)`.
3. Kotak input utama di kiri atas layar POS juga berfungsi ganda: kasir dapat langsung men-scan barcode di sana **atau** mengetik nama/SKU barang secara manual lalu memilih dari daftar *dropdown* hasil pencarian dengan tombol panah `↑` / `↓` dan `Enter`.

---

## 3. Peta Pintasan Keyboard (`Keyboard Shortcuts`) di Layar POS

Semua tombol pintasan wajib ditampilkan sebagai label kecil (`[F1]`, `[F2]`, dst.) pada tombol UI terkait agar kasir hafal secara alami:

| Tombol | Aksi di Layar POS | Perilaku Detail |
| :--- | :--- | :--- |
| **`F1`** | Fokus Input Scan / Cari Barang | Memindahkan fokus kursor langsung ke kolom input Barcode / Pencarian Produk dan memilih seluruh teks di dalamnya. |
| **`F2`** | Ubah Kuantitas (`Qty`) | Membuka input ubah jumlah bulat pada baris **Line Item** yang sedang dipilih (atau item terakhir yang baru di-scan). Menekan `Enter` menyimpan jumlah baru (divalidasi $\le \text{stock}$). |
| **`↑` / `↓`** | Navigasi Baris Keranjang | Memindahkan baris **Line Item** yang aktif di tabel keranjang belanja. |
| **`Delete`** | Hapus Item dari Keranjang | Menghapus baris **Line Item** yang sedang dipilih dari keranjang. |
| **`F4`** | Tahan Pesanan (**Hold Bill**) | Menyimpan keranjang saat ini sebagai **Held Bill** ke **Server Terminal** (meminta catatan singkat opsional, tekan `Enter` untuk langsung simpan). |
| **`F5`** | Panggil Pesanan (**Recall Held Bill**) | Membuka modal daftar **Held Bill** aktif dari seluruh meja kasir lengkap dengan jumlah badge. |
| **`F6`** | Riwayat Transaksi Hari Ini & **Void** | Membuka panel/modal daftar transaksi **Sale** hari ini untuk keperluan **Reprint** atau **Void**. |
| **`F8`** | Bayar Tunai (Buka Modal Pembayaran) | Membuka modal input uang tunai diterima dan langsung memfokuskan kursor ke nominal uang tunai. |
| **`F9`** | Bayar Uang Pas (*Quick Exact Cash*) | Jika keranjang tidak kosong, langsung mengisi `Tunai Diterima = Total Tagihan` dan membuka konfirmasi akhir pembayaran (tekan `Enter` sekali lagi untuk cetak struk). |
| **`F10`** | Cetak Ulang Struk Terakhir (**Reprint**) | Mencetak ulang struk transaksi terakhir yang baru saja diselesaikan di terminal ini (dengan label `"CETAKAN ULANG"`). |
| **`Esc`** | Tutup Modal / Bersihkan Pencarian | Menutup modal yang sedang terbuka atau mengembalikan fokus ke input scan utama. |

---

## 4. Struktur Tata Letak per Layar (Wireframes)

### 4.1. Layar Setup Awal (*First-Run Wizard*)
Ditampilkan hanya ketika `terminal_mode == "UNCONFIGURED"`:
- **Langkah 1**: Dua kartu pilihan besar:
  1. **Jadikan Komputer Server Utama (`Server Terminal`)** — *"Pilih ini untuk 1 komputer utama toko yang menyimpan database dan juga dipakai sebagai kasir."*
  2. **Hubungkan sebagai Kasir Pendamping (`Client Terminal`)** — *"Pilih ini untuk 3–5 komputer kasir lain yang terhubung ke Komputer Server via LAN."*
- **Langkah 2A (Jika Server)**: Form `Nama Toko`, `Alamat`, `Telepon`, `Nama Terminal`, serta pembuatan akun **Admin Pertama** (`Username`, `Nama Lengkap`, `Password`, `PIN 6 Digit`).
- **Langkah 2B (Jika Client)**: Form `IP Server` (contoh `192.168.1.10`), `Port` (`3847`), `Pairing Code` (6 karakter), `Nama Terminal` (contoh `Kasir 2`), tombol **Uji Koneksi**, dan tombol **Simpan & Masuk**.

### 4.2. Layar Kasir Utama (`PosRegisterPage`)
Menggunakan tata letak *Split-Screen* 2 kolom penuh layar (tanpa *scroll* halaman utama):

```text
+--------------------------------------------------------------------------------------------------+
| [POS-KASIR] Toko Maju Jaya | 🖥️ Kasir 1 (Server: Aktif) | 🟢 LAN OK | 👤 Budi (ADMIN) | [Menu ▾] |
+-----------------------------------------------------------------+--------------------------------+
| [F1] 🔍 Scan Barcode atau Ketik Nama/SKU Barang...              | RINGKASAN BELANJA              |
+-----------------------------------------------------------------+--------------------------------+
| NO | BARCODE/SKU | NAMA PRODUK        | HARGA  | QTY | SUBTOTAL | Subtotal       Rp       19.000 |
|----+-------------+--------------------+--------+-----+----------| Diskon Produk  Rp       -1.500 |
| 1  | 89910021    | Indomie Goreng 85g |  3.500 |  2  |    7.000 | ------------------------------ |
| 2* | 89920044    | Aqua Botol 600ml   |  4.000 |  3  |   10.500 | TOTAL TAGIHAN                  |
|    |             |   ↳ Diskon Rp 500/botol (-1.500)  |          | Rp 17.500                      |
|    |             |                    |        |     |          |                                |
|    |             |                    |        |     |          | [F4] Tahan   [F5] Panggil (2)  |
|    |             |                    |        |     |          | [F6] Riwayat [F10] Reprint     |
|    |             |                    |        |     |          |                                |
|    |             |                    |        |     |          | +----------------------------+ |
|    |             |                    |        |     |          | |   [F9] BAYAR UANG PAS      | |
|    |             |                    |        |     |          | +----------------------------+ |
|    |             |                    |        |     |          | +----------------------------+ |
|    |             |                    |        |     |          | |   [F8] BAYAR TUNAI (ENTER) | |
|    |             |                    |        |     |          | +----------------------------+ |
+-----------------------------------------------------------------+--------------------------------+
| Shortcut: [F1] Scan  [F2] Ubah Qty  [Del] Hapus Baris  [F4] Hold  [F5] Recall  [F6] Riwayat/Void |
+--------------------------------------------------------------------------------------------------+
```

### 4.3. Modal Pembayaran Tunai (`PaymentModal`)
Saat `F8` ditekan:
- Menampilkan `TOTAL TAGIHAN` besar di atas.
- Input `Nominal Tunai Diterima` (otomatis terfokus).
- Tombol pecahan cepat: `[Uang Pas]`, `[Rp 20.000]`, `[Rp 50.000]`, `[Rp 100.000]`.
- Menampilkan `KEMBALIAN` secara *live* (hijau jika $\ge 0$, merah `"Kurang Rp ..."` jika uang belum cukup).
- Menekan `Enter` saat nominal cukup langsung mengeksekusi transaksi atomik, mencetak struk, membuka laci uang, dan menampilkan **Layar Sukses & Nominal Kembalian Besar** (tekan `Enter` atau `Esc` atau langsung scan barang baru untuk memulai pelanggan berikutnya).

### 4.4. Modal Otorisasi `Void` dengan PIN Admin (`VoidPinModal`)
Saat **Cashier** (atau **Admin**) memilih tombol **Void** pada salah satu transaksi di **Riwayat Transaksi Hari Ini**:
- Menampilkan ringkasan struk yang akan dibatalkan (`No. Struk`, `Jam`, `Total Rp`, daftar barang).
- Input wajib: **Alasan Pembatalan** (pilihan cepat: *"Salah Input Barang/Jumlah"*, *"Pembeli Batal Beli"*, atau ketik alasan lain).
- Input wajib: **PIN Admin (4–6 digit)** bertipe `password` (`******`).
- Tombol **Konfirmasi Void & Kembalikan Stok**.

### 4.5. Navigasi & Hak Akses Layar Berdasarkan 4 Peran
Bilah navigasi (`TopBar`) secara otomatis menyesuaikan tab yang tampil berdasarkan peran pengguna yang login:
- **`ADMIN`**: Akses penuh ke seluruh tab (🛒 Kasir POS, 📦 Katalog Produk, 📋 Penyesuaian Stok, 📊 Laporan, 👥 Pengguna, ⚙️ Pengaturan).
- **`CASHIER`**: 🛒 Kasir (POS), Riwayat Transaksi Hari Ini, dan ⚙️ Pengaturan (khusus tab Printer Lokal).
- **`STOCK` (Petugas Stok)**: 📦 Katalog Produk (harga jual/diskon dikunci), 📋 Penyesuaian Stok & Opname (beserta tab Persetujuan Tertunda), 📊 Laporan Stok Inventaris, dan ⚙️ Pengaturan (tab Printer Lokal). Dilarang mengakses tab Kasir (POS).
- **`REPORTER` (Petugas Laporan)**: 📊 Laporan Lengkap (Penjualan, Shift, Keuangan/Arus Kas, Laba Kotor, dan Inventaris Stok) dan ⚙️ Pengaturan (tab Printer Lokal). Dilarang mengakses tab Kasir (POS) maupun modifikasi data.

Rincian Halaman:
1. **🛒 Kasir (POS)**: Layar kasir utama (hanya untuk `ADMIN` dan `CASHIER`).
2. **📦 Produk (`ProductsPage`)**:
   - Tabel pencarian & filter kategori, indikator warna merah pada baris dengan `Stok = 0` dan kuning untuk `Stok <= 5`.
   - Tombol **+ Tambah Produk**, **Import Excel**, dan **Export Excel**.
   - Untuk peran `STOCK`, input harga jual (`selling_price`), diskon, dan harga grosir otomatis dinonaktifkan (read-only).
3. **📋 Stok Masuk / Koreksi (`StockAdjustmentPage`)**:
   - Form tambah mutasi stok (`RESTOCK`, `DAMAGE`, `LOSS`, `CORRECTION`), Stock Opname massal, dan riwayat mutasi.
   - Tab / Banner **Antrean Persetujuan Stok**: menampilkan pengajuan tertunda (`PENDING`) yang melewati ambang batas nominal/persen, dengan tombol Setujui (meminta PIN Admin) dan Tolak.
4. **📊 Laporan (`ReportsPage`)**:
   - Tab navigasi internal: **Penjualan**, **Shift Kasir**, **Keuangan / Arus Kas**, **Laba Kotor**, dan **Inventaris Stok**.
   - Tombol aksi: **Ekspor Excel (.xlsx)**, **Simpan ke Folder**, dan **Cetak Laporan** (A4/PDF dan Ringkasan Thermal).
5. **👥 Pengguna (`UsersPage`)**:
   - Daftar akun dengan filter 4 peran: `ADMIN`, `CASHIER`, `STOCK`, `REPORTER`.
   - Modal tambah/edit pengguna dengan dropdown peran, badge warna indikator, dan validasi PIN (hanya wajib dan dapat diisi jika peran = `ADMIN`).
6. **⚙️ Pengaturan (`SettingsPage`)**:
   - **Tab Printer Lokal (Tersedia untuk Seluruh Peran)**: Pilih Printer Windows, Lebar Kertas (`58mm` / `80mm`), toggle Buka Laci Otomatis, toggle Pratinjau Struk di Layar, tombol **Test Print**, dan **Test Buka Laci**.
   - **Tab Toko & Jaringan LAN (Khusus Admin)**: Ubah Identitas Toko, Ambang Batas Persetujuan Stok (Nominal Rupiah & Persentase), serta Pengaturan LAN / Pairing Code.
   - **Tab Database & Backup (Khusus Admin di Server Terminal)**: Tombol **Backup Database ke File (`.db`)** dan **Restore Database**.
