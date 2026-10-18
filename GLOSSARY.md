# POS-Kasir

Sistem Point-of-Sale (POS) ritel minimarket untuk operasional kasir multi-terminal di satu toko fisik.

## Language

### Peran & Pengguna

**User**:
Akun operator terdaftar yang memiliki kredensial masuk dan satu peran spesifik (**Admin** atau **Cashier**).
_Avoid_: Account, Staff, Employee

**Cashier**:
Peran pengguna yang bertugas melayani transaksi penjualan di meja kasir.
_Avoid_: Operator, Clerk, Kasir (ketika merujuk pada layar atau mesin)

**Admin**:
Peran pengguna dengan akses penuh untuk mengelola katalog produk, inventaris, akun pengguna, laporan, dan otorisasi pembatalan transaksi, sekaligus dapat beroperasi sebagai **Cashier**.
_Avoid_: Manager, Owner, Superuser

### Katalog & Inventaris

**Product**:
Barang dagangan ritel berbentuk satuan bulat tetap (pcs, bungkus, botol) yang memiliki kode barcode/SKU, harga modal, harga jual, diskon produk opsional, dan stok bulat non-negatif ($\ge 0$).
_Avoid_: Item, Goods, Merchandise

**Cost Price**:
Harga beli atau modal per satuan **Product** dalam Rupiah bulat yang menjadi dasar perhitungan laba kotor.
_Avoid_: HPP, Buy Price, Base Price

**Selling Price**:
Harga jual final bersih per satuan **Product** dalam Rupiah bulat (sudah termasuk pajak) sebelum dikurangi **Product Discount**.
_Avoid_: Retail Price, Unit Price

**Product Discount**:
Potongan harga per satuan **Product** (berupa nominal Rupiah atau persentase) yang ditetapkan oleh **Admin** pada katalog dan otomatis berlaku saat transaksi.
_Avoid_: Promo, Voucher, Manual Discount

**Stock Adjustment**:
Pencatatan penambahan stok barang masuk atau pengurangan stok di luar transaksi penjualan (barang rusak, hilang, atau koreksi fisik).
_Avoid_: Stock Mutation, Inventory Log

### Transaksi Kasir

**Sale**:
Transaksi penjualan tunai yang telah dibayar lunas, menghasilkan struk, dan memotong stok **Product**.
_Avoid_: Order, Invoice, Checkout, Kasir

**Line Item**:
Satu baris rincian **Product** beserta kuantitas bulat dan salinan tetap (*snapshot*) nama produk, **Cost Price**, **Selling Price**, serta **Product Discount** pada detik **Sale** terjadi.
_Avoid_: Cart Item, Order Detail, Product Row

**Held Bill**:
Keranjang belanja yang ditangguhkan sementara di **Server Terminal** sebelum pembayaran (tanpa mengunci stok **Product**) agar **Cashier** di terminal mana pun dapat melanjutkan transaksi tersebut nanti.
_Avoid_: Draft Order, Pending Sale, Parked Transaction

**Void**:
Pembatalan penuh atas **Sale** di hari yang sama dengan otorisasi PIN **Admin**, yang mengembalikan stok **Product** terkait dan mengecualikan transaksi dari omzet bersih.
_Avoid_: Cancel, Delete Sale, Refund

**Receipt**:
Bukti cetak fisik transaksi **Sale** pada kertas thermal (58mm/80mm) yang memuat identitas toko, daftar **Line Item**, total tagihan, nominal tunai diterima, dan uang kembalian.
_Avoid_: Bill, Invoice, Ticket

### Terminal & Perangkat

**Server Terminal**:
Komputer kasir utama yang menjadi pusat penyimpanan data toko di jaringan lokal sekaligus dapat digunakan untuk melayani **Sale**.
_Avoid_: Master PC, Host Server, Backoffice PC

**Client Terminal**:
Komputer meja kasir pendamping yang terhubung ke **Server Terminal** melalui jaringan lokal toko untuk melayani **Sale**.
_Avoid_: Slave PC, Client Node, Workstation

**Pairing Code**:
Kode rahasia toko yang ditampilkan di **Server Terminal** untuk mengautentikasi dan menghubungkan **Client Terminal** di jaringan lokal.
_Avoid_: API Key, Server Password, Secret Token

**Cash Drawer**:
Laci uang fisik yang terhubung ke printer thermal (via RJ11) di masing-masing terminal dan terbuka otomatis melalui sinyal ESC/POS saat **Sale** selesai dibayar.
_Avoid_: Money Box, Register Till
