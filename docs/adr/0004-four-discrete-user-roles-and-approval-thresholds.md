# Empat Peran Pengguna Diskret dan Otorisasi Persetujuan Stok

Aplikasi membagi hak akses ke dalam tepat empat peran diskret (**Admin**, **Cashier**, **Stock Keeper**, dan **Reporter**) dengan prinsip pemisahan tugas (*segregation of duties*) dan satu peran per pengguna (*single role per user*):
1. **Pemisahan Jalur Kasir & Back-Office**: Pengguna dengan peran **Stock Keeper** (*Petugas Stok*) dan **Reporter** (*Petugas Laporan*) murni beroperasi di back-office dan dilarang mengakses modul POS maupun membuka shift kasir, mencegah personel inventaris atau analis keuangan memegang laci uang fisik (**Cash Drawer**).
2. **Keterbukaan Terbatas Harga Modal (Cost Price)**: **Admin**, **Stock Keeper** (saat input penerimaan barang), dan **Reporter** (analisis laba kotor) dapat membaca harga modal, sedangkan **Cashier** tetap diblokir total dari informasi harga modal.
3. **Ambang Batas Otorisasi Persetujuan Stok**: Penyesuaian stok atau selisih stock opname oleh **Stock Keeper** yang melampaui batas nilai nominal (Rp 100.000) atau persentase selisih (10%) berstatus ditangguhkan (*Pending Approval*) dan hanya memotong/menambah stok fisik setelah disetujui melalui verifikasi PIN **Admin**, dengan seluruh mutasi terekam pada tabel audit log.
4. **Peran Pelaporan Murni Read-Only**: **Reporter** tidak memiliki hak pembatalan transaksi (**Void**), tidak dapat mengubah data master katalog, dan hanya memiliki izin membaca data transaksi, mengekspor Excel, serta mencetak laporan ke format A4/PDF atau ringkasan thermal.

Pendekatan peran diskret berbasis izin baku ini dipilih dibanding matriks RBAC dinamis yang rumit agar konfigurasi toko ritel minimarket tetap sederhana, bebas risiko salah konfigurasi izin (*misconfiguration*), dan menjaga performa query SQLite pada jaringan lokal.
