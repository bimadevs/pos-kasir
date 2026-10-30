# Spesifikasi Kebutuhan Sistem (REQUIREMENTS) — POS-Kasir

Dokumen ini mendefinisikan kebutuhan fungsional (`FR`), aturan bisnis matematika (`BR`), dan kebutuhan non-fungsional (`NFR`) yang menjadi kontrak verifikasi dan pengujian (TDD) untuk aplikasi **POS-Kasir**. Seluruh istilah mengacu pada [GLOSSARY.md](file:///home/bimadev/project/antigravity/pos-kasir/GLOSSARY.md).

---

## 1. Aturan Bisnis & Rumus Perhitungan (`BR`)

Seluruh nilai mata uang disimpan dan dihitung sebagai **bilangan bulat 64-bit (`i64` / Rupiah utuh)** tanpa tipe *floating-point* untuk mencegah selisih pembulatan.

### `BR-01` — Perhitungan Diskon Satuan (`Product Discount`)
Setiap **Product** memiliki `selling_price` ($\ge 0$), `discount_type` (`NONE` | `NOMINAL` | `PERCENT`), dan `discount_value` ($\ge 0$).
Potongan harga per 1 satuan barang (`unit_discount_amount`) dihitung sebagai:
- Jika `discount_type == NONE`:
  $$\text{unit\_discount\_amount} = 0$$
- Jika `discount_type == NOMINAL`:
  $$\text{unit\_discount\_amount} = \min(\text{discount\_value}, \text{selling\_price})$$
- Jika `discount_type == PERCENT` (dengan $0 \le \text{discount\_value} \le 100$):
  $$\text{unit\_discount\_amount} = \left\lfloor \frac{\text{selling\_price} \times \text{discount\_value}}{100} \right\rfloor$$

Harga bersih per satuan setelah diskon (`effective_unit_price`):
$$\text{effective\_unit\_price} = \text{selling\_price} - \text{unit\_discount\_amount}$$

### `BR-02` — Perhitungan `Line Item` dan Total `Sale`
Untuk setiap **Line Item** dengan kuantitas bulat $\text{qty} \ge 1$:
- $\text{line\_gross} = \text{selling\_price\_snapshot} \times \text{qty}$
- $\text{line\_discount} = \text{unit\_discount\_amount} \times \text{qty}$
- $\text{line\_subtotal} = (\text{selling\_price\_snapshot} - \text{unit\_discount\_amount}) \times \text{qty}$
- $\text{line\_cost} = \text{cost\_price\_snapshot} \times \text{qty}$
- $\text{line\_profit} = \text{line\_subtotal} - \text{line\_cost}$

Untuk satu transaksi **Sale**:
- $\text{subtotal} = \sum \text{line\_gross}$
- $\text{discount\_total} = \sum \text{line\_discount}$
- $\text{total\_amount} = \sum \text{line\_subtotal} = \text{subtotal} - \text{discount\_total}$
- Syarat sah pembayaran tunai: $\text{cash\_received} \ge \text{total\_amount}$
- $\text{change\_amount} = \text{cash\_received} - \text{total\_amount}$

### `BR-03` — Invarian Stok Bulat Non-Negatif
- Stok **Product** wajib berupa bilangan bulat (`i64`) dan selalu memenuhi $\text{stock} \ge 0$.
- Penambahan item ke keranjang kasir dan penyelesaian **Sale** wajib ditolak jika $\text{qty\_requested} > \text{product.stock}$.
- Penyimpanan **Held Bill** tidak mengubah nilai `product.stock`.
- Eksekusi **Void** pada **Sale** berstatus `COMPLETED` menambahkan kembali $\text{qty}$ masing-masing **Line Item** ke `product.stock`.

### `BR-04` — Prioritas Harga Bertingkat / Grosir (Tiered Pricing)
- Skema harga grosir bertingkat disimpan per produk dengan ketentuan $\text{min\_quantity} \ge 2$ dan $\text{cost\_price} \le \text{tier\_price} < \text{selling\_price}$.
- Saat kuantitas item dalam keranjang belanja kasir mencapai ambang batas tier grosir tertinggi yang memenuhi syarat ($\text{qty} \ge \text{tier.min\_quantity}$):
  - Harga satuan efektif dihitung berdasarkan harga tier: $\text{effective\_unit\_price} = \text{tier.tier\_price}$.
  - Diskon promo reguler dinonaktifkan secara otomatis ($\text{unit\_discount\_amount} = 0$) guna memproteksi margin laba minimarket dari diskon ganda di bawah HPP.
  - $\text{line\_subtotal} = \text{tier.tier\_price} \times \text{qty}$.
  - Total penghematan pembeli dicatat secara transparan: $\text{savings\_total} = (\text{selling\_price} \times \text{qty}) - \text{line\_subtotal}$.

---

## 2. Kebutuhan Fungsional (`FR`)

### 2.1. Konfigurasi Awal & Mode Terminal (`FR-SETUP`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-SETUP-01` | Deteksi *First-Run* | Saat aplikasi dibuka dan file konfigurasi lokal belum ada (`terminal_mode == UNCONFIGURED`), sistem wajib menampilkan layar **Setup Awal Terminal** sebelum layar Login. |
| `FR-SETUP-02` | Inisialisasi **Server Terminal** | Jika pengguna memilih mode **Server Terminal**, pengguna wajib mengisi `Nama Toko`, `Alamat Toko` (opsional), `Telepon Toko` (opsional), `Nama Terminal` (default `"Kasir Server"`), serta membuat akun **Admin Pertama** (`Username`, `Nama Lengkap`, `Password` min. 6 karakter, `PIN` 4–6 digit angka). Sistem menginisialisasi database SQLite, menghasilkan **Pairing Code** 6 karakter alfanumerik acak, dan menyalakan HTTP Server di port LAN (default `3847`). |
| `FR-SETUP-03` | Inisialisasi **Client Terminal** | Jika pengguna memilih mode **Client Terminal**, pengguna wajib mengisi `IP Server`, `Port Server`, **Pairing Code**, dan `Nama Terminal` (misal `"Kasir 2"`). Tombol **Simpan** hanya aktif atau berhasil jika pengujian koneksi (`GET /api/v1/health` + verifikasi **Pairing Code**) ke **Server Terminal** sukses. |
| `FR-SETUP-04` | Perlindungan Penutupan **Server Terminal** | Pada **Server Terminal**, menekan tombol Close (`X`) pada jendela Windows tidak boleh menghentikan proses aplikasi; jendela disembunyikan ke *Windows System Tray* dengan notifikasi bahwa server LAN tetap berjalan. Keluar sepenuhnya hanya dapat dilakukan melalui aksi **"Matikan Server & Keluar"** yang meminta konfirmasi eksplisit. |

### 2.2. Autentikasi & Otorisasi Peran (`FR-AUTH`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-AUTH-01` | Login Pengguna | Pengguna masuk menggunakan `Username` dan `Password`. Akun dengan `is_active == false` wajib ditolak dengan pesan akun dinonaktifkan. |
| `FR-AUTH-02` | Pembatasan Navigasi Berdasarkan Peran | Pengguna diarahkan ke modul sesuai perannya: **Cashier** hanya melihat Layar Kasir, Riwayat Hari Ini, dan Pengaturan Printer; **Stock Keeper** melihat Katalog Produk, Penyesuaian Stok, dan Laporan Stok; **Reporter** melihat seluruh Laporan; **Admin** melihat seluruh modul. Akses ke endpoint terlarang wajib menghasilkan HTTP `403 Forbidden`. |
| `FR-AUTH-03` | Hak Akses Modul Kasir Terbatas | Hanya peran **Admin** dan **Cashier** yang berhak mengakses Layar Kasir (POS), menahan/memanggil **Held Bill**, dan membuka shift kasir. Peran **Stock Keeper** dan **Reporter** murni back-office dan diblokir dari seluruh aktivitas penjualan kasir. |
| `FR-AUTH-04` | Verifikasi PIN **Admin** untuk Otorisasi | Sistem menyediakan mekanisme verifikasi `PIN 4–6 digit` milik **Admin** aktif mana pun untuk mengotorisasi aksi terbatas (seperti **Void** dan persetujuan stok berlebih) langsung tanpa mengganti sesi login pengguna bersangkutan. |
| `FR-AUTH-05` | Manajemen 4 Peran Pengguna Diskret | **Admin** dapat membuat, mengubah, dan menonaktifkan pengguna dengan tepat satu dari 4 peran: `ADMIN`, `CASHIER`, `STOCK`, atau `REPORTER`. PIN 4–6 digit hanya wajib disetel untuk akun dengan peran `ADMIN`. |
| `FR-AUTH-06` | Kerahasiaan Harga Modal | Nilai harga beli/modal (`cost_price`) hanya diekspos kepada peran `ADMIN`, `STOCK` (saat penerimaan barang), dan `REPORTER` (agregat laba). Peran `CASHIER` tidak boleh menerima nilai `cost_price` sama sekali di endpoint katalog produk maupun baris transaksi. |

### 2.3. Katalog Produk & CSV (`FR-PROD`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-PROD-01` | CRUD **Product** oleh **Admin** | **Admin** dapat menambah dan mengubah **Product** dengan atribut: `sku` (unik), `barcode` (unik opsional, dapat di-scan langsung), `name` (wajib), `category_name`, `unit` (`pcs`, `bungkus`, `botol`, `pak`, `kotak`, `dus`), `cost_price` ($\ge 0$), `selling_price` ($\ge 0$), `discount_type`, `discount_value`, dan `stock` awal ($\ge 0$, hanya saat pembuatan produk baru). |
| `FR-PROD-02` | *Soft Delete* Produk | Jika **Admin** menghapus/menonaktifkan **Product** yang sudah pernah tercatat di `sale_line_items` atau `stock_adjustments`, sistem melakukan *soft delete* (`is_active = false`). Produk nonaktif tidak muncul di pencarian kasir, namun riwayat laporan masa lalu tetap utuh. |
| `FR-PROD-03` | Validasi Perubahan Harga | Ketika **Admin** mengubah `cost_price`, `selling_price`, atau `discount_value` suatu **Product**, perubahan langsung berlaku untuk transaksi baru di seluruh terminal, namun sama sekali tidak mengubah nilai pada transaksi **Sale** yang sudah tersimpan sebelumnya. |
| `FR-PROD-04` | Import & Export Excel (.xlsx) Produk | **Admin** dapat mengekspor seluruh katalog **Product** ke file Excel (`.xlsx`) 2-sheet (Data Produk & Petunjuk) dan mengimpor file `.xlsx` dengan modal pratinjau validasi baris atomik (jika `sku` sudah ada maka perbarui data produk, jika belum ada maka buat produk baru; kolom barcode terlindungi sebagai format teks). |
| `FR-PROD-05` | Batasan Master Produk untuk Petugas Stok | Pengguna dengan peran **Stock Keeper** dapat menambah dan mengedit informasi dasar produk (`sku`, `barcode`, `name`, `category_name`, `unit`) serta menginput/memperbarui harga modal (`cost_price`), namun input harga jual (`selling_price`), diskon produk (`discount_*`), dan tier harga grosir wajib dikunci/dinonaktifkan (hanya dapat diatur oleh **Admin**). |

### 2.4. Penyesuaian Stok (`FR-INV`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-INV-01` | Pencatatan **Stock Adjustment** | Perubahan stok di luar penjualan wajib melalui form **Stock Adjustment** oleh **Admin** atau **Stock Keeper** dengan memilih produk, jenis penyesuaian (`RESTOCK` menambah stok, `DAMAGE` / `LOSS` mengurangi stok, `CORRECTION` menetapkan stok fisik aktual), jumlah bulat, dan catatan alasan. |
| `FR-INV-02` | Pencegahan Stok Minus saat Koreksi | Jika pengguna menginput pengurangan stok (`DAMAGE` / `LOSS`) yang membuat hasil akhir `stock < 0`, sistem wajib menolak penyimpanan. |
| `FR-INV-03` | Audit Log Stok & Mutasi | Setiap perubahan master produk, penyesuaian stok, dan opname terekam di tabel `audit_logs` memuat `actor_id`, `action`, `entity_name`, `entity_id`, nilai sebelum/sesudah, dan waktu kejadian. |
| `FR-INV-04` | Ambang Batas Persetujuan Stok | Penyesuaian stok atau selisih opname fisik oleh **Stock Keeper** dengan nilai nominal $\ge \text{Rp } 100.000$ ($\text{delta} \times \text{cost\_price}$) ATAU selisih kuantitas $\ge 10\%$ dari stok sistem otomatis berstatus `PENDING` (`stock_adjustment_requests`) dan stok fisik belum berubah sebelum disetujui. Ambang batas ini dapat diatur oleh **Admin** di Pengaturan Toko. |
| `FR-INV-05` | Antrean Persetujuan Stok & Verifikasi PIN Admin | **Admin** dapat melihat daftar pengajuan penyesuaian stok tertunda (`PENDING`), meninjau alasan dan dampak nilai rupiah, lalu menyetujui (*Approve*) atau menolak (*Reject*) dengan verifikasi PIN Admin. Saat disetujui, stok produk diperbarui seketika dalam transaksi atomik. |

### 2.5. Transaksi Kasir / POS Register (`FR-POS`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-POS-01` | Input Barcode Scanner & Pencarian Cepat | Saat berada di layar POS, pemindaian *Barcode Scanner USB* langsung mencari **Product** aktif berdasarkan `barcode` atau `sku` secara eksak. Jika cocok dan `stock >= qty_in_cart + 1`, kuantitas item bertambah 1 secara instan. Kasir juga dapat mencari produk berdasarkan nama/kode melalui input pencarian. |
| `FR-POS-02` | Blokir Keras Stok `0` / Melebihi Stok | Jika **Cashier** men-scan atau memilih **Product** dengan `stock == 0`, atau mencoba menaikkan kuantitas di keranjang melebihi `product.stock` yang tersedia, sistem wajib memblokir aksi tersebut dan menampilkan peringatan jelas beserta bunyi *error beep*. |
| `FR-POS-03` | Pengelolaan Keranjang Belanja | **Cashier** dapat menambah/mengurangi kuantitas bulat ($\ge 1$, $\le \text{stock}$), menghapus baris **Line Item**, atau mengosongkan seluruh keranjang menggunakan mouse maupun pintasan keyboard. Diskon produk (**Product Discount**) terhitung otomatis tanpa input diskon manual oleh kasir. |
| `FR-POS-04` | Pembayaran Tunai & Kembalian | Saat menekan tombol Bayar (`F8`), muncul modal pembayaran tunai yang menampilkan `Total Tagihan`, pilihan tombol nominal uang cepat (Uang Pas `F9`, `Rp 10.000`, `Rp 20.000`, `Rp 50.000`, `Rp 100.000`), input nominal tunai diterima, dan tampilan `Kembalian` secara *real-time*. |
| `FR-POS-05` | Penyelesaian **Sale** secara Atomik | Saat pembayaran dikonfirmasi, **Server Terminal** menjalankan transaksi SQLite atomik (`BEGIN IMMEDIATE`): mengecek ulang `stock >= qty` untuk setiap **Line Item**, memotong `products.stock`, menyimpan header `sales` dengan nomor struk berurutan (`INV-YYYYMMDD-NNNN`), dan menyimpan `sale_line_items` beserta *snapshot* harga modal, harga jual, dan diskon. Jika ada satu saja barang yang stoknya tidak mencukupi (karena baru saja terbeli di kasir lain), seluruh transaksi di-*rollback* dan kasir diberi tahu barang mana yang stoknya kurang. |

### 2.6. Tahan Pesanan / `Held Bill` (`FR-HOLD`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-HOLD-01` | Simpan **Held Bill** ke Server | **Cashier** dapat menahan keranjang belanja yang memiliki minimal 1 item (`F4`) dengan label catatan opsional. Data disimpan di **Server Terminal** tanpa mengurangi `products.stock`, lalu keranjang lokal dikosongkan untuk melayani pembeli berikutnya. |
| `FR-HOLD-02` | Panggil Kembali (**Recall**) Lintas Terminal | **Cashier** di terminal mana pun dapat membuka daftar **Held Bill** aktif (`F5`), melihat rinciannya, dan memanggilnya ke keranjang kasir. Saat dipanggil, sistem mengambil harga/diskon/stok terbaru dari **Server Terminal** dan memberi peringatan jika ada item yang stoknya kini tidak mencukupi. Setelah berhasil dipanggil ke keranjang aktif, entri **Held Bill** tersebut dihapus dari daftar tunggu server. |

### 2.7. Riwayat Hari Ini, `Reprint`, & `Void` (`FR-VOID`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-VOID-01` | Riwayat Transaksi Hari Ini & **Reprint** | **Cashier** dapat melihat daftar transaksi **Sale** pada hari berjalan, melihat detail **Line Item**, dan mencetak ulang struk (**Reprint**). Cetakan ulang wajib menyertakan baris penanda `"*** CETAKAN ULANG ***"` pada struk dan **tidak** membuka **Cash Drawer**. |
| `FR-VOID-02` | Pembatalan Transaksi (**Void**) Hari Ini | Transaksi berstatus `COMPLETED` pada tanggal hari ini dapat di-**Void**. Jika dilakukan oleh **Cashier**, sistem meminta input **PIN Admin** dan alasan pembatalan (wajib diisi). Jika PIN valid, **Server Terminal** secara atomik mengubah status menjadi `VOIDED`, mencatat siapa **Admin** yang mengotorisasi beserta waktu & alasannya, dan mengembalikan kuantitas tiap **Line Item** ke `products.stock`. Transaksi dari tanggal kemarin atau sebelumnya tidak dapat di-**Void**. |

### 2.8. Laporan Penjualan & Laba Kotor (`FR-REP`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-REP-01` | Ringkasan Omzet & Laba Kotor (**Admin** & **Reporter**) | Pengguna berhak dapat melihat laporan berdasarkan rentang tanggal (Hari Ini, Kemarin, 7 Hari Terakhir, Bulan Ini, atau Tanggal Kustom) serta filter per **Cashier** dan per Terminal. Laporan menghitung dari transaksi `COMPLETED` (mengecualikan `VOIDED`): `Jumlah Transaksi Sukses`, `Jumlah Transaksi Void`, `Total Penjualan Kotor`, `Total Diskon`, `Omzet Bersih (Net Sales)`, `Total HPP (Cost Price Snapshot)`, dan `Laba Kotor (Gross Profit)`. |
| `FR-REP-02` | Laporan Produk Terlaris & Stok Menipis | Pengguna berhak dapat melihat daftar produk terlaris berdasarkan kuantitas terjual / laba, serta daftar peringatan produk yang stoknya habis (`stock == 0`) atau menipis (`stock <= 5`). |
| `FR-REP-03` | Ekspor Laporan ke Excel (.xlsx) | Pengguna berhak dapat mengekspor laporan transaksi dan rincian penjualan pada periode terpilih ke file Excel (`.xlsx`) 2-sheet (Sheet 1: Ringkasan Metrik Laba & Rekap Metode Bayar, Sheet 2: Rincian Penjualan per Item dengan format Rupiah rapi). |
| `FR-REP-04` | Laporan Arus Kas / Ringkasan Keuangan | Menyajikan ringkasan pergerakan kas toko: penerimaan penjualan tunai, pemotongan diskon, transaksi void, mutasi kas laci masuk (`IN`) dan keluar (`OUT`), selisih kas fisik shift kasir (`discrepancy`), serta rekapitulasi harian dan bulanan. |
| `FR-REP-05` | Laporan Laba Kotor Komprehensif | Menyajikan analisis keuntungan kotor mendalam: rincian omzet, HPP modal snapshot, laba rupiah, dan margin laba (%) per item produk, per kategori barang, dan tren berkala. |
| `FR-REP-06` | Laporan Inventaris & Nilai Stok | Menyajikan status stok terkini: kuantitas fisik, valuasi modal persediaan ($\sum \text{stok} \times \text{cost\_price}$), mutasi masuk/keluar pada rentang tanggal, riwayat stock opname, dan daftar barang tidak bergerak (*slow-moving*). Pengguna **Stock Keeper** memiliki hak akses khusus ke laporan ini. |
| `FR-REP-07` | Simpan Manual ke Folder & Cetak Laporan | Pengguna dapat menyimpan laporan terpilih ke file Excel langsung ke folder lokal/jaringan yang ditentukan pengguna melalui tombol "Simpan ke Folder", serta mencetak laporan ke format A4/PDF (via dialog cetak Windows) dan ringkasan harian ke printer thermal 58mm/80mm lokal. |

### 2.9. Perangkat Keras Kasir & Backup (`FR-HW` & `FR-SYS`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-HW-01` | Cetak Struk Raw ESC/POS & **Cash Drawer** | Setiap terminal dapat memilih printer dari daftar printer Windows yang terinstal, memilih lebar kertas (`58mm` / `80mm`), mengaktifkan/menonaktifkan buka laci uang otomatis saat **Sale** selesai, dan menjalankan **Test Print** serta **Test Buka Laci**. |
| `FR-HW-02` | Mode Pratinjau Struk di Layar | Jika printer belum dipilih atau opsi *Tampilkan Pratinjau Struk di Layar* diaktifkan, sistem menampilkan visualisasi struk thermal di layar setelah transaksi selesai. |
| `FR-SYS-01` | Backup & Restore Database SQLite | Pada **Server Terminal**, **Admin** dapat mencadangkan (*backup*) database SQLite menggunakan mekanisme `VACUUM INTO` / Online Backup API ke lokasi file pilihan pengguna (agar aman walau server sedang aktif), serta melakukan *restore* dari file backup valid. |

### 2.10. Manajemen Shift Kasir & Rekap Kas Laci (`FR-SHIFT`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-SHIFT-01` | Modal Awal (Opening Float) & Pembatas Shift | Kasir wajib menginput modal awal kas laci (`opening_float >= 0`) sebelum dapat memproses transaksi pertama. Sistem menolak pembukaan shift ganda pada kasir yang sama atau terminal yang sama. |
| `FR-SHIFT-02` | Mutasi Kas Operasional Laci (`F7`) | Kasir dapat mencatat mutasi kas masuk (`CASH_IN`) atau pengeluaran kas (`CASH_OUT`) dengan validasi batas saldo kas laci berjalan (`opening_float + net_cash_sales + cash_in - cash_out`). Pengeluaran melebihi kas laci ditolak. |
| `FR-SHIFT-03` | Laporan X & Rekonsiliasi Tutup Shift (*Blind Close*) | Kasir dapat mencetak Laporan X sewaktu-waktu untuk audit perantara. Saat tutup shift, kasir memasukkan uang fisik laci tanpa diperlihatkan saldo kas sistem (*Blind Close*). Sistem menghitung selisih kas fisik (`cash_discrepancy = actual - expected`), mencetak struk Z-Report permanen, dan membuka laci kasir RJ11 secara otomatis. |

### 2.11. Audit Stok Opname Fisik Massal (`FR-OPNAME`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-OPNAME-01` | Sesi Opname & *Shift Freeze* Transaksi | Admin dapat membuat sesi opname fisik baru dengan status `COUNTING`. Selama sesi aktif, transaksi penjualan pada produk yang diaudit dibekukan sementara (*Shift Freeze*) guna menjamin kepastian mutasi stok. |
| `FR-OPNAME-02` | Pemindaian Barcode Berulang & Tabel Selisih | Petugas toko dapat memindai barcode produk berulang kali untuk mengakumulasikan hitungan fisik. Sistem menampilkan tabel perbandingan real-time: Stok Sistem, Hitungan Fisik, Selisih Kuantitas, dan Nilai Nominal Kerugian/Keuntungan HPP. |
| `FR-OPNAME-03` | Commit Atomik Berizin PIN Admin & Ekspor Excel | Sinkronisasi perubahan stok ke katalog produk dieksekusi secara atomik (`BEGIN IMMEDIATE`) setelah Admin memasukkan PIN otorisasi valid. Sistem mencatat riwayat mutasi ke `stock_adjustments` dan menyediakan tombol unduh laporan rekonsiliasi Excel 2-sheet. |

### 2.12. Diskon Grosir Bertingkat (`FR-TIER`)

| ID | Kebutuhan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| `FR-TIER-01` | Konfigurasi Tier Harga per Produk | Admin dapat menentukan batas minimal kuantitas (`min_quantity >= 2`) dan harga grosir khusus (`cost_price <= tier_price < selling_price`) langsung dari katalog produk dan impor template Excel. |
| `FR-TIER-02` | Penerapan Otomatis di Kasir & Struk ESC/POS | Kasir yang menginput kuantitas grosir otomatis mendapatkan harga tier sesuai aturan `BR-04`. Layar kasir dan struk cetak ESC/POS menampilkan harga grosir satuan dan rincian penghematan secara transparan. |

---

## 3. Kebutuhan Non-Fungsional (`NFR`)

| ID | Kategori | Spesifikasi Target |
| :--- | :--- | :--- |
| `NFR-PERF-01` | Responsivitas Scan Barcode | Waktu dari pembacaan barcode hingga item tampil di tabel keranjang $\le 50\text{ ms}$ pada jaringan LAN lokal. |
| `NFR-PERF-02` | Konkurensi 5 Kasir Simultan | Database SQLite pada **Server Terminal** wajib menggunakan `PRAGMA journal_mode = WAL;` dan `PRAGMA busy_timeout = 5000;` sehingga 5 **Client Terminal** + 1 **Server Terminal** yang bertransaksi bersamaan tidak mengalami kegagalan `SQLITE_BUSY`. |
| `NFR-REL-01` | Ketahanan Koneksi LAN | Jika koneksi LAN antara **Client Terminal** dan **Server Terminal** terputus sementara, indikator status di pojok atas layar kasir langsung berubah menjadi `"Terputus dari Server"` dan keranjang yang sedang diketik di layar kasir **tidak hilang** sehingga kasir dapat menekan Bayar kembali begitu jaringan tersambung. |
| `NFR-SEC-01` | Keamanan Kredensial & LAN | Password dan PIN **Admin** wajib di-hash (menggunakan Argon2 / Bcrypt) sebelum disimpan di database. Seluruh komunikasi HTTP dari **Client Terminal** ke **Server Terminal** wajib menyertakan header autentikasi **Pairing Code** dan token sesi pengguna yang sedang login. |
| `NFR-WIN-01` | Kompatibilitas Windows | Aplikasi dikemas sebagai installer Windows (`.msi` / `-setup.exe` NSIS), menggunakan path standar `%APPDATA%` Windows (`tauri::path::BaseDirectory::AppData`), dan mendukung penuh Windows 10/11 (64-bit). |
