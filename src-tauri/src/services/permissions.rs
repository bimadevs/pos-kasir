use crate::error::{AppError, AppResult};
use crate::models::{User, UserRole};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    /// Akses ke layar kasir POS, keranjang, bayar tunai, dan buka/tutup shift kasir
    AccessPos,
    /// Akses mengelola informasi dasar produk (nama, barcode, satuan, kategori)
    ManageProducts,
    /// Akses mengubah harga jual, diskon, dan tier harga produk
    ManageProductPrices,
    /// Akses melihat harga modal (cost_price)
    ViewCostPrice,
    /// Akses melakukan penyesuaian stok (restock, rusak, hilang, koreksi, dan opname)
    AdjustStock,
    /// Akses menyetujui pengajuan penyesuaian stok yang melewati ambang batas
    ApproveStockAdjustment,
    /// Akses membatalkan transaksi (Void)
    PerformVoid,
    /// Akses melihat laporan transaksi dan shift kasir
    ViewSalesReport,
    /// Akses melihat laporan ringkasan keuangan / arus kas toko
    ViewFinancialReport,
    /// Akses melihat laporan laba kotor
    ViewProfitReport,
    /// Akses melihat laporan inventaris & nilai stok
    ViewStockReport,
    /// Akses mengelola akun pengguna (tambah, edit, aktif/nonaktifkan)
    ManageUsers,
    /// Akses mengelola konfigurasi toko, ambang persetujuan, LAN pairing code, & backup database
    ManageStoreSettings,
}

/// Mengecek apakah suatu peran pengguna memiliki izin tertentu.
pub fn role_has(role: UserRole, permission: Permission) -> bool {
    match permission {
        Permission::AccessPos => matches!(role, UserRole::ADMIN | UserRole::CASHIER),
        Permission::ManageProducts => matches!(role, UserRole::ADMIN | UserRole::STOCK),
        Permission::ManageProductPrices => matches!(role, UserRole::ADMIN),
        Permission::ViewCostPrice => {
            matches!(role, UserRole::ADMIN | UserRole::STOCK | UserRole::REPORTER)
        }
        Permission::AdjustStock => matches!(role, UserRole::ADMIN | UserRole::STOCK),
        Permission::ApproveStockAdjustment => matches!(role, UserRole::ADMIN),
        Permission::PerformVoid => matches!(role, UserRole::ADMIN),
        Permission::ViewSalesReport => matches!(role, UserRole::ADMIN | UserRole::REPORTER),
        Permission::ViewFinancialReport => matches!(role, UserRole::ADMIN | UserRole::REPORTER),
        Permission::ViewProfitReport => matches!(role, UserRole::ADMIN | UserRole::REPORTER),
        Permission::ViewStockReport => {
            matches!(role, UserRole::ADMIN | UserRole::STOCK | UserRole::REPORTER)
        }
        Permission::ManageUsers => matches!(role, UserRole::ADMIN),
        Permission::ManageStoreSettings => matches!(role, UserRole::ADMIN),
    }
}

/// Menegakkan izin pengguna aktif. Mengembalikan `AppError::Forbidden` jika tidak memiliki izin.
pub fn require_permission(user: &User, permission: Permission) -> AppResult<()> {
    if role_has(user.role, permission) {
        Ok(())
    } else {
        Err(AppError::Forbidden(format!(
            "Akses ditolak: pengguna '{}' dengan peran {:?} tidak memiliki izin {:?}",
            user.username, user.role, permission
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_user(role: UserRole) -> User {
        User {
            id: "user-test".to_string(),
            username: "tester".to_string(),
            full_name: "Test User".to_string(),
            role,
            has_pin: role == UserRole::ADMIN,
            is_active: true,
            created_at: "2026-10-30T00:00:00Z".to_string(),
            updated_at: "2026-10-30T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_admin_has_all_permissions() {
        let admin = dummy_user(UserRole::ADMIN);
        let all_permissions = [
            Permission::AccessPos,
            Permission::ManageProducts,
            Permission::ManageProductPrices,
            Permission::ViewCostPrice,
            Permission::AdjustStock,
            Permission::ApproveStockAdjustment,
            Permission::PerformVoid,
            Permission::ViewSalesReport,
            Permission::ViewFinancialReport,
            Permission::ViewProfitReport,
            Permission::ViewStockReport,
            Permission::ManageUsers,
            Permission::ManageStoreSettings,
        ];

        for perm in all_permissions {
            assert!(
                role_has(admin.role, perm),
                "ADMIN wajib memiliki izin {:?}",
                perm
            );
            assert!(
                require_permission(&admin, perm).is_ok(),
                "require_permission untuk ADMIN pada {:?} harus Ok",
                perm
            );
        }
    }

    #[test]
    fn test_cashier_strict_permissions() {
        let cashier = dummy_user(UserRole::CASHIER);

        // Hanya boleh POS
        assert!(role_has(cashier.role, Permission::AccessPos));
        assert!(require_permission(&cashier, Permission::AccessPos).is_ok());

        // Dilarang hal lainnya
        let forbidden = [
            Permission::ManageProducts,
            Permission::ManageProductPrices,
            Permission::ViewCostPrice,
            Permission::AdjustStock,
            Permission::ApproveStockAdjustment,
            Permission::PerformVoid,
            Permission::ViewSalesReport,
            Permission::ViewFinancialReport,
            Permission::ViewProfitReport,
            Permission::ViewStockReport,
            Permission::ManageUsers,
            Permission::ManageStoreSettings,
        ];

        for perm in forbidden {
            assert!(
                !role_has(cashier.role, perm),
                "CASHIER dilarang memiliki izin {:?}",
                perm
            );
            assert!(
                require_permission(&cashier, perm).is_err(),
                "require_permission untuk CASHIER pada {:?} harus Err",
                perm
            );
        }
    }

    #[test]
    fn test_stock_keeper_permissions() {
        let stock_keeper = dummy_user(UserRole::STOCK);

        // Boleh kelola produk, lihat modal, sesuaikan stok, dan lihat laporan stok
        assert!(role_has(stock_keeper.role, Permission::ManageProducts));
        assert!(role_has(stock_keeper.role, Permission::ViewCostPrice));
        assert!(role_has(stock_keeper.role, Permission::AdjustStock));
        assert!(role_has(stock_keeper.role, Permission::ViewStockReport));

        // Dilarang POS, ubah harga jual, approve penyesuaian, void, laporan keuangan, laba, user, setting
        let forbidden = [
            Permission::AccessPos,
            Permission::ManageProductPrices,
            Permission::ApproveStockAdjustment,
            Permission::PerformVoid,
            Permission::ViewSalesReport,
            Permission::ViewFinancialReport,
            Permission::ViewProfitReport,
            Permission::ManageUsers,
            Permission::ManageStoreSettings,
        ];

        for perm in forbidden {
            assert!(
                !role_has(stock_keeper.role, perm),
                "STOCK dilarang memiliki izin {:?}",
                perm
            );
            assert!(
                require_permission(&stock_keeper, perm).is_err(),
                "require_permission untuk STOCK pada {:?} harus Err",
                perm
            );
        }
    }

    #[test]
    fn test_reporter_permissions() {
        let reporter = dummy_user(UserRole::REPORTER);

        // Boleh lihat laporan penjualan, keuangan, laba, stok, dan harga modal
        assert!(role_has(reporter.role, Permission::ViewSalesReport));
        assert!(role_has(reporter.role, Permission::ViewFinancialReport));
        assert!(role_has(reporter.role, Permission::ViewProfitReport));
        assert!(role_has(reporter.role, Permission::ViewStockReport));
        assert!(role_has(reporter.role, Permission::ViewCostPrice));

        // Dilarang POS, ubah produk, ubah harga jual, ubah stok, approve stok, void, user, setting
        let forbidden = [
            Permission::AccessPos,
            Permission::ManageProducts,
            Permission::ManageProductPrices,
            Permission::AdjustStock,
            Permission::ApproveStockAdjustment,
            Permission::PerformVoid,
            Permission::ManageUsers,
            Permission::ManageStoreSettings,
        ];

        for perm in forbidden {
            assert!(
                !role_has(reporter.role, perm),
                "REPORTER dilarang memiliki izin {:?}",
                perm
            );
            assert!(
                require_permission(&reporter, perm).is_err(),
                "require_permission untuk REPORTER pada {:?} harus Err",
                perm
            );
        }
    }
}
