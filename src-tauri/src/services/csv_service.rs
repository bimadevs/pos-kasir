use crate::error::{AppError, AppResult};
use crate::models::{
    calculate_unit_discount, CsvImportResult, DiscountType, ImportProductsResult, ProductFilter,
    ProductImportRow, SalesReportFilter, User,
};
use crate::services::core_service::CoreService;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductCsvRow {
    pub sku: String,
    #[serde(default)]
    pub barcode: String,
    pub name: String,
    #[serde(default = "default_category")]
    pub category_name: String,
    #[serde(default = "default_unit")]
    pub unit: String,
    pub cost_price: i64,
    pub selling_price: i64,
    #[serde(default = "default_discount_type")]
    pub discount_type: String,
    #[serde(default)]
    pub discount_value: i64,
    #[serde(default)]
    pub stock: i64,
    #[serde(default = "default_active")]
    pub is_active: i64,
}

fn default_category() -> String {
    "Umum".to_string()
}
fn default_unit() -> String {
    "pcs".to_string()
}
fn default_discount_type() -> String {
    "NONE".to_string()
}
fn default_active() -> i64 {
    1
}

impl CoreService {
    /// Mengekspor seluruh katalog `Product` menjadi string CSV (`FR-PROD-04`).
    pub fn export_products_csv(&self, actor: &User) -> AppResult<String> {
        Self::require_admin(actor)?;
        let products = self.list_products(
            actor,
            &ProductFilter {
                search: None,
                category: None,
                only_active: Some(false),
            },
        )?;

        let mut wtr = csv::Writer::from_writer(vec![]);
        for p in products {
            wtr.serialize(ProductCsvRow {
                sku: p.sku,
                barcode: p.barcode.unwrap_or_default(),
                name: p.name,
                category_name: p.category_name,
                unit: p.unit,
                cost_price: p.cost_price,
                selling_price: p.selling_price,
                discount_type: p.discount_type.as_str().to_string(),
                discount_value: p.discount_value,
                stock: p.stock,
                is_active: if p.is_active { 1 } else { 0 },
            })?;
        }

        let bytes = wtr
            .into_inner()
            .map_err(|e| AppError::Io(format!("Gagal menyelesaikan penulisan CSV: {e}")))?;
        String::from_utf8(bytes)
            .map_err(|e| AppError::Validation(format!("Enkoding UTF-8 CSV tidak valid: {e}")))
    }

    /// Mengimpor (Upsert massal) katalog `Product` dari baris data terstruktur dalam satu transaksi atomik.
    pub fn import_products_rows(
        &self,
        actor: &User,
        terminal_name: &str,
        rows: Vec<ProductImportRow>,
    ) -> AppResult<ImportProductsResult> {
        Self::require_admin(actor)?;
        if rows.is_empty() {
            return Err(AppError::Validation(
                "Tidak ada baris produk untuk diimpor.".to_string(),
            ));
        }

        let now = Self::now_iso();
        let mut conn = self.db_lock()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let mut inserted_count = 0usize;
        let mut updated_count = 0usize;

        for (idx, row) in rows.into_iter().enumerate() {
            let line_no = idx + 1;
            let sku = row.sku.trim();
            let name = row.name.trim();
            if sku.is_empty() || name.is_empty() {
                return Err(AppError::Validation(format!(
                    "Baris ke-{line_no}: kolom 'sku' dan 'name' wajib diisi."
                )));
            }
            if row.cost_price < 0 || row.selling_price < 0 || row.stock < 0 {
                return Err(AppError::Validation(format!(
                    "Baris ke-{line_no} (SKU {sku}): harga dan stok tidak boleh bernilai negatif."
                )));
            }
            let disc_type = DiscountType::from_str(&row.discount_type).map_err(|e| {
                AppError::Validation(format!("Baris ke-{line_no} (SKU {sku}): {e}"))
            })?;
            let _ = calculate_unit_discount(row.selling_price, disc_type, row.discount_value)
                .map_err(|e| {
                    AppError::Validation(format!("Baris ke-{line_no} (SKU {sku}): {e}"))
                })?;

            let barcode_opt = match row.barcode {
                Some(b) => {
                    let trimmed = b.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                }
                None => None,
            };
            let category = if row.category_name.trim().is_empty() {
                "Umum"
            } else {
                row.category_name.trim()
            };
            let unit = if row.unit.trim().is_empty() {
                "pcs"
            } else {
                row.unit.trim()
            };
            let is_active = if row.is_active { 1 } else { 0 };

            let existing: Option<(String, i64)> = tx
                .query_row(
                    "SELECT id, stock FROM products WHERE sku = ?1 COLLATE NOCASE",
                    params![sku],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;

            if let Some((existing_id, stock_before)) = existing {
                tx.execute(
                    "UPDATE products
                     SET barcode = ?1, name = ?2, category_name = ?3, unit = ?4,
                         cost_price = ?5, selling_price = ?6, discount_type = ?7,
                         discount_value = ?8, stock = ?9, is_active = ?10, updated_at = ?11
                     WHERE id = ?12",
                    params![
                        barcode_opt,
                        name,
                        category,
                        unit,
                        row.cost_price,
                        row.selling_price,
                        disc_type.as_str(),
                        row.discount_value,
                        row.stock,
                        is_active,
                        now,
                        existing_id
                    ],
                )?;

                if row.stock != stock_before {
                    tx.execute(
                        "INSERT INTO stock_adjustments (
                            id, product_id, user_id, terminal_name, adjustment_type,
                            stock_before, quantity_delta, stock_after, note, created_at
                         ) VALUES (?1, ?2, ?3, ?4, 'CORRECTION', ?5, ?6, ?7, 'Penyesuaian via Import Excel', ?8)",
                        params![
                            Uuid::new_v4().to_string(),
                            existing_id,
                            actor.id,
                            terminal_name,
                            stock_before,
                            row.stock - stock_before,
                            row.stock,
                            now
                        ],
                    )?;
                }
                let target_prod_id = existing_id.clone();
                updated_count += 1;

                if let (Some(min_qty), Some(tier_price)) = (row.tier_min_qty, row.tier_price) {
                    if min_qty >= 2 && tier_price >= row.cost_price && tier_price < row.selling_price {
                        tx.execute(
                            "DELETE FROM product_price_tiers WHERE product_id = ?1",
                            params![target_prod_id],
                        )?;
                        tx.execute(
                            "INSERT INTO product_price_tiers (id, product_id, min_quantity, tier_price, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                            params![
                                Uuid::new_v4().to_string(),
                                target_prod_id,
                                min_qty,
                                tier_price,
                                now
                            ],
                        )?;
                    }
                }
            } else {
                let new_id = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO products (
                        id, sku, barcode, name, category_name, unit,
                        cost_price, selling_price, discount_type, discount_value,
                        stock, is_active, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)",
                    params![
                        new_id,
                        sku,
                        barcode_opt,
                        name,
                        category,
                        unit,
                        row.cost_price,
                        row.selling_price,
                        disc_type.as_str(),
                        row.discount_value,
                        row.stock,
                        is_active,
                        now
                    ],
                )?;

                if row.stock > 0 {
                    tx.execute(
                        "INSERT INTO stock_adjustments (
                            id, product_id, user_id, terminal_name, adjustment_type,
                            stock_before, quantity_delta, stock_after, note, created_at
                         ) VALUES (?1, ?2, ?3, ?4, 'RESTOCK', 0, ?5, ?5, 'Stok awal via Import Excel', ?6)",
                        params![
                            Uuid::new_v4().to_string(),
                            new_id,
                            actor.id,
                            terminal_name,
                            row.stock,
                            now
                        ],
                    )?;
                }

                if let (Some(min_qty), Some(tier_price)) = (row.tier_min_qty, row.tier_price) {
                    if min_qty >= 2 && tier_price >= row.cost_price && tier_price < row.selling_price {
                        tx.execute(
                            "INSERT INTO product_price_tiers (id, product_id, min_quantity, tier_price, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                            params![
                                Uuid::new_v4().to_string(),
                                new_id,
                                min_qty,
                                tier_price,
                                now
                            ],
                        )?;
                    }
                }
                inserted_count += 1;
            }
        }

        tx.commit()?;

        Ok(ImportProductsResult {
            inserted_count,
            updated_count,
            total_processed: inserted_count + updated_count,
        })
    }

    /// Mengimpor (Upsert massal) katalog `Product` dari string CSV dalam satu transaksi atomik (`FR-PROD-04`).
    pub fn import_products_csv(
        &self,
        actor: &User,
        terminal_name: &str,
        csv_content: &str,
    ) -> AppResult<CsvImportResult> {
        Self::require_admin(actor)?;
        let trimmed = csv_content.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(
                "Konten file CSV kosong.".to_string(),
            ));
        }

        let mut rdr = csv::ReaderBuilder::new()
            .trim(csv::Trim::All)
            .from_reader(trimmed.as_bytes());

        let mut rows = Vec::new();
        for (idx, result) in rdr.deserialize::<ProductCsvRow>().enumerate() {
            let row = result.map_err(|e| {
                AppError::Validation(format!("Kesalahan pada baris CSV ke-{}: {e}", idx + 2))
            })?;
            rows.push(ProductImportRow {
                sku: row.sku,
                barcode: if row.barcode.trim().is_empty() {
                    None
                } else {
                    Some(row.barcode.trim().to_string())
                },
                name: row.name,
                category_name: row.category_name,
                unit: row.unit,
                cost_price: row.cost_price,
                selling_price: row.selling_price,
                discount_type: row.discount_type,
                discount_value: row.discount_value,
                stock: row.stock,
                is_active: row.is_active != 0,
                tier_min_qty: None,
                tier_price: None,
            });
        }

        if rows.is_empty() {
            return Err(AppError::Validation(
                "Tidak ada baris produk di dalam file CSV.".to_string(),
            ));
        }

        self.import_products_rows(actor, terminal_name, rows)
    }

    /// Mengekspor laporan penjualan periode terpilih ke format CSV (`FR-REP-03`).
    pub fn export_sales_report_csv(
        &self,
        actor: &User,
        filter: &SalesReportFilter,
    ) -> AppResult<String> {
        let report = self.get_sales_report(actor, filter)?;
        let mut wtr = csv::Writer::from_writer(vec![]);

        wtr.write_record([
            "receipt_number",
            "transaction_date",
            "created_at",
            "terminal_name",
            "cashier_name",
            "status",
            "sku",
            "product_name",
            "quantity",
            "unit",
            "cost_price_snapshot",
            "selling_price_snapshot",
            "unit_discount_amount",
            "line_subtotal",
            "line_cogs",
            "line_gross_profit",
            "void_reason",
        ])?;

        for swi in &report.sales {
            let s = &swi.sale;
            for li in &swi.items {
                let line_cogs = li.cost_price_snapshot * li.quantity;
                let line_profit = li.subtotal - line_cogs;
                wtr.write_record(&[
                    s.receipt_number.clone(),
                    s.transaction_date.clone(),
                    s.created_at.clone(),
                    s.terminal_name.clone(),
                    s.cashier_name_snapshot.clone(),
                    s.status.as_str().to_string(),
                    li.sku_snapshot.clone(),
                    li.product_name_snapshot.clone(),
                    li.quantity.to_string(),
                    li.unit_snapshot.clone(),
                    li.cost_price_snapshot.to_string(),
                    li.selling_price_snapshot.to_string(),
                    li.unit_discount_amount.to_string(),
                    li.subtotal.to_string(),
                    line_cogs.to_string(),
                    line_profit.to_string(),
                    s.void_reason.clone().unwrap_or_default(),
                ])?;
            }
        }

        let bytes = wtr
            .into_inner()
            .map_err(|e| AppError::Io(format!("Gagal menulis CSV laporan: {e}")))?;
        String::from_utf8(bytes)
            .map_err(|e| AppError::Validation(format!("Enkoding UTF-8 CSV tidak valid: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use crate::db::Database;
    use crate::models::{
        CreateSaleRequest, DiscountType, LoginRequest, ProductFilter, ProductImportRow,
        SaleItemInput, SalesReportFilter, SetupServerRequest, UpsertProductRequest,
    };
    use crate::services::core_service::CoreService;
    use std::sync::Arc;
    use tempfile::TempDir;

    #[test]
    fn test_csv_product_import_export_and_report_csv() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let service = CoreService::new(db);
        service
            .setup_server(&SetupServerRequest {
                store_name: "Toko CSV Test".to_string(),
                store_address: "Jl. CSV 1".to_string(),
                store_phone: "08111111".to_string(),
                terminal_name: "Kasir 1".to_string(),
                admin_username: "admin".to_string(),
                admin_full_name: "Admin CSV".to_string(),
                admin_password: "password123".to_string(),
                admin_pin: "123456".to_string(),
                seed_sample_data: false,
            })
            .unwrap();

        let admin = service
            .login(&LoginRequest {
                username: "admin".to_string(),
                password: "password123".to_string(),
            })
            .unwrap()
            .user;

        let csv_input = "sku,barcode,name,category_name,unit,cost_price,selling_price,discount_type,discount_value,stock,is_active\n\
                         CSV-001,899001,Beras 5kg,Sembako,sak,60000,72000,NONE,0,15,1\n\
                         CSV-002,899002,Susu Kotak,Minuman,kotak,4500,6000,NOMINAL,500,30,1\n";

        let import_res = service
            .import_products_csv(&admin, "Kasir 1", csv_input)
            .unwrap();
        assert_eq!(import_res.inserted_count, 2);
        assert_eq!(import_res.updated_count, 0);

        // Upsert kembali dengan perubahan harga dan stok pada CSV-001
        let csv_update = "sku,barcode,name,category_name,unit,cost_price,selling_price,discount_type,discount_value,stock,is_active\n\
                          CSV-001,899001,Beras Super 5kg,Sembako,sak,62000,75000,NONE,0,20,1\n";
        let update_res = service
            .import_products_csv(&admin, "Kasir 1", csv_update)
            .unwrap();
        assert_eq!(update_res.inserted_count, 0);
        assert_eq!(update_res.updated_count, 1);

        let exported = service.export_products_csv(&admin).unwrap();
        assert!(exported.contains("Beras Super 5kg"));
        assert!(exported.contains("75000"));
        assert!(exported.contains("Susu Kotak"));

        // Buat 1 transaksi lalu ekspor laporan CSV
        let p1 = service.find_product_by_code(&admin, "899001").unwrap();
        service
            .create_sale(
                &admin,
                "Kasir 1",
                &CreateSaleRequest {
                    items: vec![SaleItemInput {
                        product_id: p1.id,
                        quantity: 2,
                    }],
                    cash_received: 150_000,
                },
            )
            .unwrap();

        let report_csv = service
            .export_sales_report_csv(&admin, &SalesReportFilter::default())
            .unwrap();
        assert!(report_csv.contains("receipt_number,transaction_date"));
        assert!(report_csv.contains("Beras Super 5kg"));
        assert!(report_csv.contains("150000"));
    }

    #[test]
    fn test_sqlite_backup_vacuum_into_and_restore() {
        let temp_dir = TempDir::new().unwrap();
        let db_file = temp_dir.path().join("muditamart.db");
        let backup_file = temp_dir.path().join("backup_snapshot.db");

        let db = Arc::new(Database::open_file(&db_file).unwrap());
        let service = CoreService::new(db);
        service
            .setup_server(&SetupServerRequest {
                store_name: "Toko Backup Asli".to_string(),
                store_address: "Jl. Backup".to_string(),
                store_phone: "0812345".to_string(),
                terminal_name: "Kasir Server".to_string(),
                admin_username: "admin".to_string(),
                admin_full_name: "Admin Backup".to_string(),
                admin_password: "password123".to_string(),
                admin_pin: "123456".to_string(),
                seed_sample_data: false,
            })
            .unwrap();

        let admin = service
            .login(&LoginRequest {
                username: "admin".to_string(),
                password: "password123".to_string(),
            })
            .unwrap()
            .user;

        service
            .upsert_product(
                &admin,
                "Kasir Server",
                &UpsertProductRequest {
                    id: None,
                    sku: "BKP-001".to_string(),
                    barcode: Some("899777".to_string()),
                    name: "Produk Sebelum Backup".to_string(),
                    category_name: "Umum".to_string(),
                    unit: "pcs".to_string(),
                    cost_price: 5_000,
                    selling_price: 8_000,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(50),
                    is_active: Some(true),
                    price_tiers: None,
                },
            )
            .unwrap();

        // 1. Jalankan backup VACUUM INTO
        service.backup_database(&admin, &backup_file).unwrap();
        assert!(backup_file.exists());

        // 2. Tambah produk baru setelah backup
        service
            .upsert_product(
                &admin,
                "Kasir Server",
                &UpsertProductRequest {
                    id: None,
                    sku: "BKP-002".to_string(),
                    barcode: Some("899888".to_string()),
                    name: "Produk Sesudah Backup".to_string(),
                    category_name: "Umum".to_string(),
                    unit: "pcs".to_string(),
                    cost_price: 10_000,
                    selling_price: 15_000,
                    discount_type: DiscountType::NONE,
                    discount_value: 0,
                    initial_stock: Some(10),
                    is_active: Some(true),
                    price_tiers: None,
                },
            )
            .unwrap();
        assert_eq!(
            service
                .list_products(&admin, &ProductFilter::default())
                .unwrap()
                .len(),
            2
        );

        // 3. Restore dari backup_file -> jumlah produk harus kembali menjadi 1 ("BKP-001")
        service.restore_database(&admin, &backup_file).unwrap();
        let products_after_restore = service
            .list_products(&admin, &ProductFilter::default())
            .unwrap();
        assert_eq!(products_after_restore.len(), 1);
        assert_eq!(products_after_restore[0].sku, "BKP-001");
    }

    #[test]
    fn test_import_products_rows_atomic_and_stock_adjustments() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let service = CoreService::new(db);
        service
            .setup_server(&SetupServerRequest {
                store_name: "Toko Excel Import Test".to_string(),
                store_address: "Jl. Excel 1".to_string(),
                store_phone: "08222222".to_string(),
                terminal_name: "Kasir Server".to_string(),
                admin_username: "admin".to_string(),
                admin_full_name: "Admin Excel".to_string(),
                admin_password: "password123".to_string(),
                admin_pin: "123456".to_string(),
                seed_sample_data: false,
            })
            .unwrap();

        let admin = service
            .login(&LoginRequest {
                username: "admin".to_string(),
                password: "password123".to_string(),
            })
            .unwrap()
            .user;

        let rows = vec![
            ProductImportRow {
                sku: "XLS-001".to_string(),
                barcode: Some("899111222".to_string()),
                name: "Minyak Goreng 2L".to_string(),
                category_name: "Sembako".to_string(),
                unit: "pouch".to_string(),
                cost_price: 28000,
                selling_price: 34000,
                discount_type: "NONE".to_string(),
                discount_value: 0,
                stock: 25,
                is_active: true,
                tier_min_qty: Some(5),
                tier_price: Some(31000),
            },
            ProductImportRow {
                sku: "XLS-002".to_string(),
                barcode: None,
                name: "Gula Pasir 1kg".to_string(),
                category_name: "Sembako".to_string(),
                unit: "kg".to_string(),
                cost_price: 14000,
                selling_price: 17500,
                discount_type: "FIXED".to_string(),
                discount_value: 500,
                stock: 40,
                is_active: true,
                tier_min_qty: None,
                tier_price: None,
            },
        ];

        let result = service
            .import_products_rows(&admin, "Kasir Server", rows)
            .unwrap();
        assert_eq!(result.inserted_count, 2);
        assert_eq!(result.updated_count, 0);

        // Update stok XLS-001 dan ubah nama/harga XLS-002
        let update_rows = vec![
            ProductImportRow {
                sku: "XLS-001".to_string(),
                barcode: Some("899111222".to_string()),
                name: "Minyak Goreng 2L".to_string(),
                category_name: "Sembako".to_string(),
                unit: "pouch".to_string(),
                cost_price: 28000,
                selling_price: 34000,
                discount_type: "NONE".to_string(),
                discount_value: 0,
                stock: 30, // Stok berubah dari 25 menjadi 30 (+5 penyesuaian)
                is_active: true,
                tier_min_qty: Some(5),
                tier_price: Some(30500),
            },
            ProductImportRow {
                sku: "XLS-002".to_string(),
                barcode: Some("899333444".to_string()), // tambah barcode
                name: "Gula Pasir Premium 1kg".to_string(),
                category_name: "Sembako".to_string(),
                unit: "kg".to_string(),
                cost_price: 14500,
                selling_price: 18000,
                discount_type: "NONE".to_string(),
                discount_value: 0,
                stock: 40, // stok tetap sama
                is_active: true,
                tier_min_qty: None,
                tier_price: None,
            },
        ];

        let update_result = service
            .import_products_rows(&admin, "Kasir Server", update_rows)
            .unwrap();
        assert_eq!(update_result.inserted_count, 0);
        assert_eq!(update_result.updated_count, 2);

        // Verifikasi Stock Adjustment tercatat untuk XLS-001
        let adjs = service.list_stock_adjustments(&admin, None).unwrap();
        let xls001_adj = adjs.iter().find(|a| a.product_sku == "XLS-001");
        assert!(xls001_adj.is_some());

        // Verifikasi atomic rollback jika ada 1 baris yang salah
        let invalid_rows = vec![
            ProductImportRow {
                sku: "XLS-003".to_string(),
                barcode: None,
                name: "Kecap Manis".to_string(),
                category_name: "Bumbu".to_string(),
                unit: "botol".to_string(),
                cost_price: 8000,
                selling_price: 11000,
                discount_type: "NONE".to_string(),
                discount_value: 0,
                stock: 10,
                is_active: true,
                tier_min_qty: None,
                tier_price: None,
            },
            ProductImportRow {
                sku: "XLS-004".to_string(),
                barcode: None,
                name: "Saus Sambal".to_string(),
                category_name: "Bumbu".to_string(),
                unit: "botol".to_string(),
                cost_price: -500, // Invalid: negatif!
                selling_price: 9000,
                discount_type: "NONE".to_string(),
                discount_value: 0,
                stock: 10,
                is_active: true,
                tier_min_qty: None,
                tier_price: None,
            },
        ];

        let err = service
            .import_products_rows(&admin, "Kasir Server", invalid_rows)
            .unwrap_err();
        assert!(err.to_string().contains("harga dan stok tidak boleh"));

        // XLS-003 tidak boleh masuk karena rollback atomik
        let p3 = service.find_product_by_code(&admin, "XLS-003");
        assert!(p3.is_err());
    }
}
