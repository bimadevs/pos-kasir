-- Skema DDL Lengkap Mudita Mart (SQLite WAL)

-- 1. Pengaturan Toko (Single-Row Table: id = 1)
CREATE TABLE IF NOT EXISTS store_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    store_name TEXT NOT NULL,
    store_address TEXT NOT NULL DEFAULT '',
    store_phone TEXT NOT NULL DEFAULT '',
    receipt_footer TEXT NOT NULL DEFAULT 'Terima kasih atas kunjungan Anda. Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.',
    pairing_code TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. Pengguna (Admin & Cashier)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    pin_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CASHIER')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 3. Katalog Produk (Satuan Bulat & Stok Non-Negatif)
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
    barcode TEXT UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    category_name TEXT NOT NULL DEFAULT 'Umum',
    unit TEXT NOT NULL DEFAULT 'pcs',
    cost_price INTEGER NOT NULL CHECK (cost_price >= 0),
    selling_price INTEGER NOT NULL CHECK (selling_price >= 0),
    discount_type TEXT NOT NULL DEFAULT 'NONE' CHECK (discount_type IN ('NONE', 'NOMINAL', 'PERCENT')),
    discount_value INTEGER NOT NULL DEFAULT 0 CHECK (
        discount_value >= 0 AND (discount_type != 'PERCENT' OR discount_value <= 100)
    ),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- 4. Riwayat Penyesuaian Stok (Stock Adjustment)
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    terminal_name TEXT NOT NULL,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('RESTOCK', 'DAMAGE', 'LOSS', 'CORRECTION')),
    stock_before INTEGER NOT NULL CHECK (stock_before >= 0),
    quantity_delta INTEGER NOT NULL,
    stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_adj_product ON stock_adjustments(product_id, created_at DESC);

-- 5. Transaksi Penjualan (Sale)
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    receipt_number TEXT NOT NULL UNIQUE,
    cashier_id TEXT NOT NULL REFERENCES users(id),
    cashier_name_snapshot TEXT NOT NULL,
    terminal_name TEXT NOT NULL,
    shift_id TEXT REFERENCES cashier_shifts(id),
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
    discount_total INTEGER NOT NULL CHECK (discount_total >= 0),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    cash_received INTEGER NOT NULL CHECK (cash_received >= total_amount),
    change_amount INTEGER NOT NULL CHECK (change_amount >= 0),
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED')),
    voided_by_user_id TEXT REFERENCES users(id),
    voided_by_name_snapshot TEXT,
    void_reason TEXT,
    voided_at TEXT,
    transaction_date TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_date_status ON sales(transaction_date, status);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id, transaction_date);

-- 6. Rincian Barang per Transaksi (Line Item dengan Snapshot Harga)
CREATE TABLE IF NOT EXISTS sale_line_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    sku_snapshot TEXT NOT NULL,
    barcode_snapshot TEXT,
    product_name_snapshot TEXT NOT NULL,
    unit_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    cost_price_snapshot INTEGER NOT NULL CHECK (cost_price_snapshot >= 0),
    selling_price_snapshot INTEGER NOT NULL CHECK (selling_price_snapshot >= 0),
    discount_type_snapshot TEXT NOT NULL CHECK (discount_type_snapshot IN ('NONE', 'NOMINAL', 'PERCENT')),
    discount_value_snapshot INTEGER NOT NULL CHECK (discount_value_snapshot >= 0),
    unit_discount_amount INTEGER NOT NULL CHECK (unit_discount_amount >= 0),
    applied_tier_min_qty INTEGER,
    applied_tier_price INTEGER,
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_line_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_line_items(product_id);

-- 7. Keranjang Ditahan (Held Bill — Tidak Mengunci Stok)
CREATE TABLE IF NOT EXISTS held_bills (
    id TEXT PRIMARY KEY,
    hold_label TEXT NOT NULL DEFAULT '',
    cashier_id TEXT NOT NULL REFERENCES users(id),
    cashier_name TEXT NOT NULL,
    terminal_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS held_bill_items (
    id TEXT PRIMARY KEY,
    held_bill_id TEXT NOT NULL REFERENCES held_bills(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity >= 1)
);

-- 8. Sesi Shift Kasir (Cashier Shift)
CREATE TABLE IF NOT EXISTS cashier_shifts (
    id TEXT PRIMARY KEY,
    terminal_name TEXT NOT NULL,
    cashier_id TEXT NOT NULL REFERENCES users(id),
    cashier_name_snapshot TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    opening_float INTEGER NOT NULL CHECK (opening_float >= 0),
    cash_sales_total INTEGER NOT NULL DEFAULT 0,
    cash_in_total INTEGER NOT NULL DEFAULT 0,
    cash_out_total INTEGER NOT NULL DEFAULT 0,
    expected_closing_cash INTEGER,
    actual_closing_cash INTEGER,
    cash_discrepancy INTEGER,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shifts_terminal_status ON cashier_shifts(terminal_name, status);
CREATE INDEX IF NOT EXISTS idx_shifts_cashier ON cashier_shifts(cashier_id, opened_at DESC);

-- 9. Mutasi Kas Operasional Laci (Cash Movement)
CREATE TABLE IF NOT EXISTS cash_movements (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES cashier_shifts(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('CASH_IN', 'CASH_OUT')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements(shift_id);

-- 10. Sesi Audit Stok Opname Fisik Massal (Stock Opname Session)
CREATE TABLE IF NOT EXISTS stock_opname_sessions (
    id TEXT PRIMARY KEY,
    session_name TEXT NOT NULL,
    creator_user_id TEXT NOT NULL REFERENCES users(id),
    creator_name_snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COUNTING' CHECK (status IN ('COUNTING', 'REVIEW', 'COMMITTED', 'CANCELLED')),
    total_items_counted INTEGER NOT NULL DEFAULT 0,
    total_discrepancy_qty INTEGER NOT NULL DEFAULT 0,
    total_discrepancy_value INTEGER NOT NULL DEFAULT 0,
    committed_by_user_id TEXT REFERENCES users(id),
    committed_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opname_sessions_status ON stock_opname_sessions(status, created_at DESC);

-- 11. Item Hitungan Fisik Sesi Opname (Stock Opname Item)
CREATE TABLE IF NOT EXISTS stock_opname_items (
    id TEXT PRIMARY KEY,
    opname_session_id TEXT NOT NULL REFERENCES stock_opname_sessions(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    physical_count INTEGER NOT NULL DEFAULT 0 CHECK (physical_count >= 0),
    system_stock_snapshot INTEGER NOT NULL,
    cost_price_snapshot INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT uq_opname_item UNIQUE (opname_session_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_opname_items_session ON stock_opname_items(opname_session_id);
CREATE INDEX IF NOT EXISTS idx_opname_items_product ON stock_opname_items(product_id);

-- 12. Skema Harga Grosir Bertingkat (Product Price Tiers)
CREATE TABLE IF NOT EXISTS product_price_tiers (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    min_quantity INTEGER NOT NULL CHECK (min_quantity >= 2),
    tier_price INTEGER NOT NULL CHECK (tier_price >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT uq_product_tier UNIQUE (product_id, min_quantity)
);

CREATE INDEX IF NOT EXISTS idx_product_price_tiers_product_id ON product_price_tiers(product_id);

-- 13. Sesi Autentikasi Pengguna Aktif (User Sessions — Sliding TTL 1 Jam)
CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);


