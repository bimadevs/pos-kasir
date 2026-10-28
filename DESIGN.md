---
name: mudita-mart
description: Sistem Desain & Ergonomi Antarmuka Desktop Retail Mudita Mart (Tauri v2 + React 19 + Tailwind CSS)
colors:
  primary: "#16a34a"
  primary-hover: "#22c55e"
  primary-active: "#15803d"
  primary-light: "#f0fdf4"
  primary-border: "#bbf7d0"
  
  accent-gold: "#f59e0b"
  accent-gold-hover: "#fbbf24"
  accent-maroon: "#991b1b"

  neutral-canvas: "#f4f6f5"
  neutral-surface: "#ffffff"
  neutral-panel-dark: "#0a130f"
  neutral-panel-cockpit: "#101c16"
  neutral-panel-elevated: "#1b2e24"
  neutral-border-light: "#e2ebe5"
  neutral-border-strong: "#cbd7d0"
  neutral-border-dark: "#243c31"
  neutral-border-dark-subtle: "#2f4d3f"
  
  ink-primary-light: "#12161a"
  ink-secondary-light: "#4a545e"
  ink-muted-light: "#727f8d"
  ink-primary-dark: "#fafafa"
  ink-secondary-dark: "#d2d8df"
  ink-muted-dark: "#98a2ad"

  signal-success: "#059669"
  signal-success-hover: "#10b981"
  signal-success-surface: "#ecfdf5"
  signal-success-border: "#a7f3d0"
  signal-success-text: "#065f46"

  signal-warning: "#d97706"
  signal-warning-hover: "#f59e0b"
  signal-warning-surface: "#fffbeb"
  signal-warning-border: "#fde68a"
  signal-warning-text: "#92400e"

  signal-danger: "#e11d48"
  signal-danger-hover: "#f43f5e"
  signal-danger-surface: "#fff1f2"
  signal-danger-border: "#fecdd3"
  signal-danger-text: "#9f1239"

typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(2rem, 3.5vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.02em"
  mono-amount:
    fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace"
    fontSize: "clamp(1.75rem, 3vw, 2.75rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  mono-tabular:
    fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"

rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  2xl: "16px"
  full: "9999px"

spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.ink-primary-light}"
    rounded: "{rounded.xl}"
    height: "40px"
    padding: "0 16px"
  button-success:
    backgroundColor: "{colors.signal-success}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    height: "48px"
    padding: "0 20px"
  button-danger:
    backgroundColor: "{colors.signal-danger}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    height: "40px"
    padding: "0 16px"
---

# Panduan Sistem Desain & Ergonomi UI/UX (DESIGN.md) — Mudita Mart

Dokumen ini adalah **Sumber Kebenaran Tunggal (*Single Source of Truth*)** untuk seluruh keputusan desain visual, hierarki antarmuka, standarisasi warna, tipografi, dan perilaku komponen di aplikasi kasir minimarket **Mudita Mart** (Tauri v2 + React 19 + Tailwind CSS).

Tujuan utama dokumen ini adalah **mengeliminasi seluruh ketidakkonsistenan warna, tombol, radius, dan gaya antarmuka** di seluruh halaman dan komponen, serta memastikan identitas brand yang selaras dengan logo resmi SMK Mudita: kombinasi presisi antara **Mudita Forest Green (`#16a34a` / `#15803d`)**, aksen **Kuning Keemasan / Warm Gold (`#f59e0b` / `#fbbf24`)**, dan **Deep Emerald Charcoal (`#0a130f` / `#101c16`)**, kontras tinggi (*high readability*), ramah kerja shift 12 jam, dan berorientasi *keyboard & barcode scanner-first*.

---

## 1. Overview & Filosofi Desain Antarmuka Kasir

Aplikasi kasir minimarket **Mudita Mart** memiliki karakteristik kerja yang berbeda dari aplikasi SaaS atau dashboard analitik web biasa:
1. **Kecepatan & Tanpa Mouse (*Keyboard & Scanner Driven*)**: Kasir bekerja melayani antrean panjang pembeli. Setiap aksi (fokus scan, ubah kuantitas, tahan transaksi, bayar uang pas, input tunai, reprint) wajib memiliki kontrol keyboard fisik yang jelas dan terbaca.
2. **Keterbacaan Jarak 1 Meter (*1-Meter Checkout Legibility*)**: Nominal Total Tagihan, Uang Diterima, dan Kembalian harus dapat dibaca secara instan oleh kasir dan pembeli dari jarak meja kasir tanpa menyipitkan mata.
3. **Pemberian Umpan Balik Pasti (*Deterministic Sensory Feedback*)**: Setiap status berhasil, peringatan stok menipis, atau kegagalan transaksi memiliki perpaduan warna semantik standar, efek visual, serta umpan balik suara (*Web Audio API beep*).
4. **Filosofi Tampilan Ritel Segar & Harmoni Logo (*Fresh Retail & Logo Harmony*)**:
   - **Bilah Atas Sistem (Mudita Forest Green `#15803d` / `bg-emerald-700`)**: Bilah atas sistem (*TopBar*) mengadopsi hijau daun segar khas logo SMK Mudita dengan teks putih bersih, aksen brand *"Mart"* kuning keemasan, dan navigasi segmented putih kontras tinggi. Ini memperkuat identitas brand toko sejak detik pertama dan memberikan kesan ramah khas ritel minimarket modern.
   - **Operational Workspace & Ringkasan Pembayaran (Clean Light Surface `#f4f6f5` / `#ffffff`)**: Baik tabel keranjang belanja kasir maupun panel ringkasan kasir kanan (*Payment Summary*) menggunakan kontainer putih bersih (`bg-white border-zinc-200`). Box raksasa **TOTAL TAGIHAN** diberi bingkai hijau segar (`bg-emerald-50 border-2 border-emerald-500`) dengan nominal rupiah emerald pekat (`text-emerald-950`) dan badge emas, bebas dari warna gelap gulita agar ruang kerja kasir terasa luas, bersih, dan higienis.
5. **Harmonisasi Logo & Adaptasi Kontras Cerdas**:
   - Teks brand "Mudita Mart" memiliki dua komponen: *"Mudita"* dan *"Mart"*.
   - Pada latar belakang gelap (TopBar, Login Hero), suku kata *"Mudita"* ditampilkan dalam putih bersih (`#ffffff`) dan *"Mart"* dalam Kuning Keemasan (`#fbbf24`) untuk mempertahankan keterbacaan optimal dan kehangatan brand.
   - Pada latar belakang terang, teks brand menggunakan *"Mudita"* `#101c16` (Deep Charcoal) dan *"Mart"* `#d97706` (Warm Gold).

---

## 2. Sistem Warna Normatif (Color System & Palette)

Dilarang keras menggunakan warna ad-hoc acak. Seluruh elemen wajib mengacu pada sistem berikut:

### 2.1. Netral Struktural (Deep Emerald Charcoal Architecture)

| Token Desain | Tailwind Class | Hex Code | Peran Fungsional & Penempatan |
| :--- | :--- | :--- | :--- |
| **`surface-canvas`** | `bg-zinc-100/70` / `bg-[#f4f6f5]` | `#f4f6f5` | Latar belakang seluruh area kerja utama (POS, Produk, Laporan, Pengaturan, User). |
| **`surface-card`** | `bg-white` | `#ffffff` | Kontainer kartu, baris tabel data, modal popup, input form. |
| **`surface-cockpit`** | `bg-slate-900` / `bg-[#101c16]` | `#101c16` | Panel kanan ringkasan kasir, kartu login, header modal penting. |
| **`surface-cockpit-dark`**| `bg-slate-950` / `bg-[#0a130f]` | `#0a130f` | Bilah atas (*TopBar*), kotak display raksasa Total Tagihan, latar belakang login. |
| **`surface-muted`** | `bg-zinc-50` | `#f9fbf9` | Header tabel data, latar belakang read-only input, footer modal. |
| **`border-subtle`** | `border-zinc-200` | `#e2ebe5` | Garis batas kartu, pemisah baris tabel, batas kotak pencarian. |
| **`border-strong`** | `border-zinc-300` | `#cbd7d0` | Batas input field standar, tombol sekunder putih, batas keycap keyboard. |
| **`border-dark`** | `border-slate-800` | `#1b2e24` | Garis pemisah pada TopBar, panel ringkasan kasir gelap, modal dark header. |
| **`border-dark-subtle`**| `border-charcoal/60` | `#243c31` | Batas tombol sekunder pada mode gelap (Hold, Recall, Reprint). |
| **`ink-primary`** | `text-zinc-900` | `#0a130f` | Teks utama, judul halaman, nama barang di keranjang/tabel. |
| **`ink-secondary`** | `text-zinc-600` | `#3d5246` | Deskripsi, label input, header tabel, metadata produk. |
| **`ink-muted`** | `text-zinc-400` | `#647d70` | Placeholder input, barcode/SKU sekunder, shortcut keycap legend. |
| **`ink-dark-primary`** | `text-zinc-50` / `text-white` | `#fafafa` | Teks utama pada area gelap (TopBar, Total Tagihan Kasir, Kartu Login). |
| **`ink-dark-muted`** | `text-zinc-400` | `#98a2ad` | Label dan deskripsi pada area gelap (TopBar, panel kanan kasir). |

### 2.2. Warna Aksi Utama (Mudita Forest Green)

Aplikasi kasir ini menggunakan **Satu Warna Aksi Utama Konsisten**: **Mudita Forest Green (`#16a34a` / `#15803d`)**.
- **Base Primary**: `#16a34a` (`bg-teal-600` / `bg-brand-600`) — Tombol utama (Proses Pembayaran, Simpan, Tambah Produk, Login, Pilih, Lanjut Wizard).
- **Hover Primary**: `#22c55e` (`hover:bg-teal-500` / `hover:bg-brand-500`) — Transisi lebih cerah dan hidup pada hover tombol.
- **Active / Pressed**: `#15803d` (`active:bg-teal-700` atau `active:scale-[0.98]`).
- **Focus Ring**: `focus:ring-2 focus:ring-teal-500/25 focus:border-teal-600`.
- **Soft Highlight / Selected**: `bg-teal-50` (`#f0fdf4`) dengan teks `text-teal-800` dan batas `border-teal-600` — digunakan untuk baris terpilih pada tabel keranjang belanja atau item aktif di dropdown pencarian.
- **Admin Identity**: Avatar inisial Admin dan badge manajer menggunakan `bg-teal-600 text-white`.

### 2.3. Warna Semantik Operasional (Semantic Signals)

Warna semantik memiliki aturan ketat dan tidak boleh ditukar fungsi:

#### A. Sinyal Sukses & Transaksi Tunai (`Emerald Signal`)
- **Fungsi Mutlak**: Tombol Bayar Cepat Uang Pas (`F9`), Angka Uang Kembalian Positif, Transaksi Selesai, Status Stok Aman, Indikator Jaringan LAN Terhubung (*Connected*).
- **Primary Action (Tombol Bayar Uang Pas F9)**: `bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-[0.98] text-white`.
- **Soft Badge / Alert**: `bg-emerald-50 text-emerald-800 border-emerald-200/80`.
- **Nilai Kembalian / Nilai Positif**: `text-emerald-600 dark:text-emerald-400 font-mono font-extrabold`.
- **Status Dot LAN**: `bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]`.

#### B. Sinyal Peringatan & Promo (`Amber Warmth`)
- **Fungsi Mutlak**: Badge Diskon/PROMO produk, Peringatan Stok Menipis ($1 \le \text{Stok} \le 5$), Catatan Printer Thermal, Transaksi Tertahan (*Held Bills*).
- **Primary Button (Hold Bill)**: `bg-amber-600 hover:bg-amber-500 active:bg-amber-700 active:scale-[0.98] text-white`.
- **Soft Badge**: `bg-amber-50 text-amber-800 border-amber-200/70`.
- **Display Angka Diskon**: `text-amber-600 dark:text-amber-400 font-mono`.

#### C. Sinyal Bahaya, Batal, & Void (`Crimson Rose`)
- **Fungsi Mutlak**: Otorisasi Batal/Void Transaksi (`F6`), Hapus Baris Keranjang (`Del`), Stok Habis ($0$), Indikator Jaringan LAN Terputus (*Disconnected*), Tombol Hapus Data Permanen.
- **Primary Action (Tombol Void / Hapus)**: `bg-rose-600 hover:bg-rose-500 active:bg-rose-700 active:scale-[0.98] text-white`.
- **Outline Action**: `bg-white hover:bg-rose-50 active:bg-rose-100 active:scale-[0.98] border border-rose-200 text-rose-600 hover:text-rose-700`.
- **Soft Badge**: `bg-rose-50 text-rose-800 border-rose-200/70`.
- **Status Dot LAN Putus**: `bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]`.

#### D. Sinyal Netral / Informasi (`Metadata Badges`)
- **Fungsi**: Badge Peran Kasir, SKU/Barcode, Versi Aplikasi (`Mudita Mart vX.Y.Z`), Label Mode Terminal (Server / Client).
- **Pill Netral**: `bg-zinc-100 text-zinc-700 border-zinc-200/80` (pada area terang) atau `bg-slate-800 text-zinc-300 border-slate-700` (pada area gelap).

---

## 3. Tipografi & Arsitektur Nilai Angka

### 3.1. Font Stacks

1. **Font Antarmuka Utama (`font-sans`)**:
   `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
   - Digunakan untuk: Navigasi, label form, pesan alert, tombol, judul halaman, deskripsi.
2. **Font Angka Tabular & Kode Teknis (`font-mono`)**:
   `'JetBrains Mono', Consolas, 'Lucida Console', 'Courier New', monospace`
   - Digunakan untuk: **Seluruh nominal rupiah** (`formatRupiah`), kuantitas (`Qty`), persentase diskon, Barcode produk, SKU, Nomor Struk, jam digital kasir, tombol shortcut keyboard (`<kbd>`), dan preview kertas struk thermal.
   - **Aturan Tabular**: Seluruh angka di tabel kasir **wajib** menyertakan class `tabular-nums` atau rule CSS `font-variant-numeric: tabular-nums` agar lebar karakter angka `0–9` selalu seragam vertikal dan tidak bergoyang saat bertambah.

### 3.2. Skala Hierarki Tipografi

| Nama Tingkat | Ukuran (CSS / Tailwind) | Font Weight | Line Height | Penggunaan Spesifik |
| :--- | :--- | :--- | :--- | :--- |
| **Cashier Display** | `2.5rem`–`3rem` (`text-4xl` / `text-5xl`) | 800 (Extrabold) | 1.0 | Angka **TOTAL TAGIHAN** di panel kanan POS & Kembalian Sukses. |
| **Page Title** | `1.25rem` (`text-xl`) | 800 (Extrabold) | 1.25 | Judul utama halaman (Katalog Produk, Laporan Penjualan, Pengaturan). |
| **Card Header / Stat** | `1.5rem` (`text-2xl`) | 700 (Bold) | 1.2 | Nilai total ringkasan pada kartu filter (Total Produk, Omzet Hari Ini). |
| **Section Title** | `0.875rem` (`text-sm`) | 700 (Bold) | 1.3 | Judul blok panel, nama pelanggan/struk, nama barang di keranjang. |
| **Standard Body** | `0.875rem` (`text-sm`) | 400 (Regular) | 1.5 | Teks form input, teks deskripsi panduan, isi pesan modal konfirmasi. |
| **Table Header & Label**| `0.6875rem` (`text-[11px]`) | 700 (Bold) | 1.2 | Header kolom tabel keranjang/katalog (UPPERCASE, `tracking-wider`). |
| **Micro Caption / SKU** | `0.6875rem` (`text-[11px]`) | 500 (Medium) | 1.2 | SKU, barcode, unit satuan barang, timestamp riwayat struk. |

---

## 4. Spasi, Bentuk (*Shapes*), & Radius Konsisten

Ketidakkonsistenan radius sudut (sebagian `rounded-lg`, sebagian `rounded-xl`, sebagian `rounded-2xl`) membuat tampilan aplikasi terlihat compang-camping. Seluruh komponen wajib mematuhi aturan baku berikut:

| Token Radius | Nilai Pixel | Tailwind Class | Penggunaan Standar |
| :--- | :--- | :--- | :--- |
| **Keycaps & Badges** | `6px` / `0.375rem` | `rounded-md` | Tombol keyboard fisik (`<kbd>`), badge status mini, pill tag diskon. |
| **Small Inputs & Tabs**| `8px` / `0.5rem` | `rounded-lg` | Tab navigasi pada TopBar, input kuantitas di dalam tabel keranjang. |
| **Standard Controls** | `12px` / `0.75rem` | `rounded-xl` | **Seluruh tombol standar** (Primary, Secondary, Success, Danger), seluruh input form, kartu filter kecil. |
| **Containers & Modals** | `16px` / `1rem` | `rounded-2xl` | Kontainer panel kasir kanan, seluruh kartu konten halaman, jendela modal popup, laci riwayat (*Drawer*). |
| **Pills & Toggles** | `9999px` | `rounded-full` | Badge status LAN bulat, switch toggle pengaturan, avatar kasir. |

---

## 5. Elevasi, Kedalaman (*Depth*), & Efek Bayangan

1. **Flat-Layered Hierarchy**:
   Aplikasi kasir ini mengutamakan kecepatan render dan ketajaman kontras. Tidak diperkenankan menggunakan efek blur berat (*heavy blur*) yang memperlambat WebView2 Windows.
2. **Skala Bayangan Resmi**:
   - **`shadow-2xs`** (`0 1px 2px 0 rgba(0,0,0,0.03)`): Untuk input field dan tombol sekunder putih.
   - **`shadow-xs`** (`0 1px 2px 0 rgba(0,0,0,0.05)`): Untuk tombol utama (`bg-indigo-600`), tombol sukses (`bg-emerald-600`).
   - **`shadow-md`** (`0 4px 6px -1px rgba(0,0,0,0.07)`): Untuk kartu ringkasan metrik.
   - **`shadow-2xl`** (`0 25px 50px -12px rgba(0,0,0,0.25)`): Untuk jendela Modal popup dan Laci Samping (*Drawer*).
3. **Backdrop Modal**:
   Seluruh modal dan drawer wajib menggunakan backdrop konsisten:
   `bg-zinc-950/70 backdrop-blur-xs` (bukan `bg-black/40` atau `bg-zinc-900/90` acak).

---

## 6. Spesifikasi Pustaka Komponen Baku (*Standardized Component Library*)

### 6.1. Tombol (*Button System*)

Semua tombol wajib memiliki `cursor-pointer`, transisi halus (`transition-all duration-150`), status fokus yang jelas (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`), dan efek klik taktil (`active:scale-[0.98]`).

#### A. Varian Tombol

```tsx
// 1. Primary Button (Aksi Utama Sistem: Tambah Data, Simpan, Konfirmasi, Lanjut)
const btnPrimary = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

// 2. Secondary Light Button (Batal, Kembali, Unduh Template, Reset Filter)
const btnSecondary = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-zinc-700 hover:text-zinc-900 border border-zinc-300 shadow-2xs text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

// 3. Secondary Dark Button (Tombol Operasional di Area Gelap POS: Hold, Recall, Riwayat)
const btnSecondaryDark = "inline-flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 active:bg-slate-700 active:scale-[0.98] text-zinc-200 hover:text-white border border-slate-700/60 shadow-2xs text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

// 4. Success Action Button (Tombol Bayar Kasir F9 Uang Pas, Pembayaran Selesai)
const btnSuccess = "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-[0.98] text-white text-sm font-extrabold tracking-wide shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

// 5. Danger / Void Button (Otorisasi Void F6, Hapus Data Permanen)
const btnDanger = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

// 6. Danger Outline Button (Aksi Hapus Sekunder)
const btnDangerOutline = "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 active:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-semibold transition-all cursor-pointer";

// 7. Ghost Button (Icon Button di Header Modal, Tutup Panel, Pagination)
const btnGhost = "inline-flex items-center justify-center p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer";
```

#### B. Ukuran Tombol (*Button Sizing*)
- **Kecil (`sm`)**: Tinggi `32px` (`h-8`), padding `px-3`, teks `text-xs font-semibold`, rounded `rounded-lg` — untuk aksi baris tabel (Edit/Hapus baris).
- **Sedang (`md`)**: Tinggi `40px` (`h-10`), padding `px-4`, teks `text-xs font-bold`, rounded `rounded-xl` — **ukuran default seluruh form dan aksi header halaman**.
- **Besar (`lg`)**: Tinggi `48px`–`52px` (`h-12`), padding `px-6`, teks `text-sm font-extrabold`, rounded `rounded-xl` — khusus tombol bayar kasir utama (`PROSES PEMBAYARAN [F8]`, `BAYAR CEPAT UANG PAS [F9]`).

---

### 6.2. Kolom Input & Form Controls

Seluruh input form di seluruh aplikasi wajib memiliki ukuran dan visual seragam:

```tsx
// Input Text Standard (Katalog Produk, Form User, Modal Input, Form Pengaturan)
const inputStandard = "w-full h-10 px-3.5 py-2 text-sm text-zinc-900 bg-white border border-zinc-300 rounded-xl placeholder:text-zinc-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 transition-all shadow-2xs disabled:bg-zinc-100 disabled:text-zinc-500";

// Input Search & Barcode Utama di POS Register (Scanner Ready)
const inputPosScan = "flex-1 text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none bg-transparent";
```

- **Wadah Search Bar POS**:
  `flex items-center bg-white border border-zinc-300 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-500/20 rounded-xl shadow-2xs px-3.5 py-2 transition-all`
- **Label Form**:
  `block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5`
- **Error Text Form**:
  `text-xs text-rose-600 font-semibold mt-1 flex items-center gap-1`

---

### 6.3. Keycap Keyboard Fisik (`<kbd>` Mechanical Style)

Pintasan keyboard kasir wajib ditampilkan dengan keycap mekanikal yang nyata agar kasir mudah menghafal tombol fungsi tanpa melihat mouse:

```css
/* Mode Terang (Default) */
.kbd-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.4rem;
  padding: 0 0.375rem;
  font-family: "JetBrains Mono", Consolas, "Courier New", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  border-radius: 0.375rem;
  border: 1px solid #d4d4d8;
  border-bottom-width: 2px;
  background-color: #f4f4f5;
  color: #18181b;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

/* Mode Gelap (Untuk Cockpit POS Kanan & TopBar) */
.kbd-key-dark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.85rem;
  height: 1.45rem;
  padding: 0 0.4rem;
  font-family: "JetBrains Mono", Consolas, "Courier New", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  border-radius: 0.375rem;
  border: 1px solid #3f3f46;
  border-bottom-width: 2px;
  background-color: #27272a;
  color: #fafafa;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
}
```

---

### 6.4. Status Badges & Chips

Setiap status memiliki formula:
`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border`

1. **Stok Aman / Transaksi Selesai / LAN OK (Hijau)**:
   `bg-emerald-50 text-emerald-800 border-emerald-200/80`
2. **Stok Menipis (1–5) / PROMO / Held Bill (Kuning/Amber)**:
   `bg-amber-50 text-amber-800 border-amber-200/80`
3. **Stok Habis (0) / Void / LAN Putus / Nonaktif (Merah)**:
   `bg-rose-50 text-rose-800 border-rose-200/80`
4. **Peran Admin (Mudita Teal)**:
   `bg-teal-50 text-teal-800 border-teal-200/80`
5. **Peran Kasir / Netral (Charcoal Slate / Zinc)**:
   `bg-zinc-100 text-zinc-700 border-zinc-200/80`

---

### 6.5. Kartu Konten & Statistik Metrik

1. **Kartu Konten Standar**:
   `bg-white border border-zinc-200/90 rounded-2xl p-6 shadow-2xs`
2. **Kartu Filter Cepat (Quick Filter Metric Tile)**:
   - Status Aktif: `bg-slate-900 text-white border-slate-900 shadow-xs p-4 rounded-xl text-left transition-all cursor-pointer`
   - Status Inaktif: `bg-white text-zinc-800 border-zinc-200 hover:border-zinc-300 p-4 rounded-xl text-left transition-all cursor-pointer`
   - Nilai angka di dalam kartu wajib menggunakan: `text-2xl font-extrabold font-mono mt-1 tabular-nums`.

---

### 6.6. Modal Popup & Laci Riwayat (*Drawers*)

Seluruh jendela dialog popup wajib mengikuti struktur tata letak 3 bagian:
1. **Backdrop**: `fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4`
2. **Container**: `bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]`
3. **Modal Header**: `px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-white shrink-0`
   - Judul: `text-base font-extrabold text-zinc-900 tracking-tight`
   - Tombol Tutup: `p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer`
4. **Modal Body**: `p-6 overflow-y-auto space-y-4`
5. **Modal Footer**: `px-6 py-3.5 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2.5 shrink-0`

---

### 6.7. Tabel Data Tabular

Seluruh tabel (Keranjang POS, Produk, Pengguna, Laporan, Opname Stok) wajib seragam:
- **Header Kolom (`<thead>`)**:
  `bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wider text-zinc-500 py-3 px-4 text-left`
- **Baris Data (`<tbody> <tr>`)**:
  `border-b border-zinc-100 hover:bg-zinc-50/70 transition-colors`
- **Baris Terpilih di Keranjang Kasir**:
  `bg-teal-50/70 border-l-4 border-l-teal-600`
- **Kolom Angka**:
  Seluruh kolom harga, kuantitas, subtotal, dan stok **wajib** menggunakan:
  `text-right font-mono font-bold tabular-nums text-zinc-900`.

---

## 7. Cetak Biru Antarmuka per Layar (*Screen-by-Screen Ergonomic Blueprint*)

### 7.1. Layar Wizard Setup Awal (`SetupWizardPage.tsx`)
- **Latar Belakang**: `bg-slate-950 text-zinc-100` (Kanvas gelap fokus instalasi).
- **Pilihan Kartu Mode Terminal**: Dua kartu besar (`Server` vs `Client`) dengan bingkai `border-slate-800 bg-slate-900 hover:border-teal-500/60 transition-all rounded-2xl p-6`.
- **Tombol Navigasi Wizard**: Tombol "Kembali" menggunakan `btnSecondaryDark`, tombol "Lanjut / Simpan" menggunakan `btnPrimary`.

### 7.2. Layar Masuk / Kunci Kasir (`LoginPage.tsx`)
- **Latar Belakang**: `bg-slate-950 text-zinc-100`.
- **Bilah Status Atas**: Indikator nama toko, nama terminal, dan pill status LAN aktif (`bg-emerald-950/60 text-emerald-400 border-emerald-500/30`).
- **Kartu Login**: `max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl`.
- **Tombol Masuk**: `w-full h-11 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer`.

### 7.3. Layar Kasir Utama (`PosRegisterPage.tsx` — Split-Screen Cockpit)
- **Struktur**: 2 Kolom Penuh Layar tanpa scroll halaman (`h-[calc(100vh-3.5rem)] overflow-hidden`).
- **Kolom Kiri (~67% / 8 grid)**:
  - Kotak scan barcode & autocomplete search produk dengan indikator `[F1]` dan detektor USB Scanner.
  - Banner peringatan stok/error di bawah kotak pencarian.
  - Tabel keranjang belanja kasir (`CartTable`) dengan navigasi panah `↑` / `↓` dan ubah qty `F2`.
- **Kolom Kanan (~33% / 4 grid — Payment Cockpit)**:
  - Wadah gelap kontras tinggi: `bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 flex flex-col justify-between`.
  - Kotak display `TOTAL TAGIHAN` raksasa di `bg-slate-950 border border-slate-800` dengan font `text-4xl text-zinc-50 font-extrabold font-mono tabular-nums`.
  - Grid 4 tombol aksi operasional gelap (`F4 Hold`, `F5 Recall`, `F6 Riwayat/Void`, `F10 Cetak Ulang Struk`).
  - Dua tombol bayar besar di bawah:
    1. **`[F9] BAYAR CEPAT UANG PAS`**: `btnSuccess` (Emerald).
    2. **`[F8] PROSES PEMBAYARAN`**: `btnPrimary` (Mudita Forest Green).

### 7.4. Halaman Katalog Produk & Diskon (`ProductsPage.tsx`)
- **Header**: Judul tebal `text-xl font-extrabold text-zinc-900`, deskripsi `text-xs text-zinc-500`.
- **Action Group**: Tombol `Template Excel` (Secondary), `Import Excel` (Secondary), `Export Excel` (Secondary), dan `+ Tambah Produk` (`btnPrimary`).
- **Kartu Filter**: 4 kartu metrik (Total Katalog, Stok Menipis, Stok Habis, Promo Aktif).
- **Tabel Produk**: Tabel responsif dengan pagination bersih dan badge diskon konsisten.

### 7.5. Halaman Manajemen Pengguna (`UsersPage.tsx`)
- **Avatar Pengguna**: Dilarang menggunakan kombinasi warna-warni acak (`blue-600`, `purple-600`, dll.). Seluruh avatar kasir menggunakan latar netral elegan:
  `bg-slate-800 text-zinc-200 border border-slate-700 font-bold font-mono` untuk Kasir biasa, dan `bg-teal-600 text-white border border-teal-500` untuk Admin.
- **Badge Peran**: Admin (`Forest Green`), Cashier (`Slate / Zinc`).
- **Tombol Tambah Pengguna**: `btnPrimary`.

### 7.6. Halaman Penyesuaian Stok / Opname (`StockAdjustmentPage.tsx`)
- **Form Opname**: Input pencarian barang, display stok sistem vs stok fisik aktual, kalkulasi selisih secara *real-time* (Hijau jika bertambah, Merah jika berkurang).
- **Tombol Eksekusi**: `btnPrimary` dengan konfirmasi modal.

### 7.7. Halaman Laporan Penjualan (`ReportsPage.tsx`)
- **Kartu Ringkasan Penjualan**: Omzet Kotor, Total Diskon Diberikan, Omzet Bersih (Laba Kotor), Total Transaksi Sukses, Total Transaksi Dibatalkan (*Void*).
- **Tabel Riwayat Struk**: Lengkap dengan tombol cetak ulang dan badge metode bayar tunai.

### 7.8. Halaman Pengaturan & Printer Thermal (`SettingsPage.tsx`)
- **Tab Segmented**: Pengaturan Toko, Terminal & Jaringan LAN, Printer Thermal & Cash Drawer.
- **Form Input Terstruktur**: Menggunakan `inputStandard` dengan tombol simpan seragam `btnPrimary`.

---

## 8. Anti-Patterns, Larangan Mutlak, & Checklist Kualitas (Do's and Don'ts)

### 8.1. Larangan Mutlak (*Strictly Banned Patterns*)

- ❌ **DILARANG MENGGUNAKAN WARNA AD-HOC ACAK**: Dilarang memakai warna pelangi acak. Seluruh antarmuka hanya boleh menggunakan Deep Emerald Charcoal, Mudita Forest Green, Warm Gold, Emerald, Amber, dan Rose.
- ❌ **DILARANG MENGGUNAKAN HOVER YANG TIDAK KONSISTEN**: Seluruh tombol utama Forest Green wajib menggunakan `hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98]`.
- ❌ **DILARANG MENGGUNAKAN SUDUT RADIUS ACAK**: Dilarang mencampur `rounded-md`, `rounded-lg`, dan `rounded-xl` pada elemen tombol yang setara. Seluruh tombol form dan modal wajib `rounded-xl`.
- ❌ **DILARANG MENAMPILKAN ANGKA RUPIAH DENGAN FONT PROPORSIONAL**: Seluruh angka harga dan nominal rupiah wajib menggunakan font mono dengan `tabular-nums` agar tidak bergoyang.
- ❌ **DILARANG MENGGUNAKAN EMOJI SEBAGAI IKON ANTARMUKA**: Seluruh ikon wajib menggunakan SVG resmi dari **`lucide-react`**.
- ❌ **DILARANG TOMBOL TANPA `cursor-pointer`**: Seluruh elemen yang dapat diklik wajib memiliki class `cursor-pointer`.

### 8.2. Checklist Pra-Implementasi & Verifikasi UI/UX

Sebelum menganggap implementasi suatu halaman atau komponen selesai, verifikasi daftar periksa berikut:
- [ ] Apakah warna primer konsisten mengacu pada Mudita Forest Green (`#16a34a` / `bg-teal-600`)?
- [ ] Apakah warna sukses/pembayaran konsisten mengacu pada Emerald (`#059669`)?
- [ ] Apakah warna bahaya/void konsisten mengacu pada Rose (`#e11d48`)?
- [ ] Apakah seluruh tombol memiliki padding, tinggi, dan radius yang seragam sesuai ukurannya?
- [ ] Apakah seluruh input form memiliki border fokus `focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20`?
- [ ] Apakah seluruh shortcut kasir ditampilkan dalam bentuk `<kbd className="kbd-key">` atau `<kbd className="kbd-key-dark">`?
- [ ] Apakah backdrop seluruh modal menggunakan `bg-zinc-950/70 backdrop-blur-xs`?
- [ ] Apakah seluruh nominal uang menggunakan format `formatRupiah` dengan class `font-mono tabular-nums`?
