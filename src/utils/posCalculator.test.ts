import { describe, expect, it } from "vitest";
import { evaluateScannerBuffer } from "../hooks/useBarcodeScanner";
import type { Product } from "../types/domain";
import {
  addProductToCart,
  calculateCartTotals,
  calculateEffectiveUnitPrice,
  calculateUnitDiscount,
  formatRupiah,
  updateCartItemQuantity,
} from "./posCalculator";

function makeSampleProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    sku: "SKU-001",
    barcode: "8991002101012",
    name: "Indomie Goreng 85g",
    category_name: "Makanan",
    unit: "bks",
    cost_price: 2600,
    selling_price: 3100,
    discount_type: "NONE",
    discount_value: 0,
    unit_discount_amount: 0,
    effective_unit_price: 3100,
    stock: 10,
    is_active: true,
    created_at: "2026-10-18T10:00:00Z",
    updated_at: "2026-10-18T10:00:00Z",
    ...overrides,
  };
}

describe("BR-01 & BR-02: Kalkulator Diskon & Total Keranjang POS", () => {
  it("menghitung diskon NONE, NOMINAL, dan PERCENT (floor integer Rupiah)", () => {
    expect(calculateUnitDiscount(10000, "NONE", 500)).toBe(0);
    expect(calculateUnitDiscount(10000, "NOMINAL", 1500)).toBe(1500);
    // Nominal tidak boleh melebihi harga jual
    expect(calculateUnitDiscount(10000, "NOMINAL", 15000)).toBe(10000);
    // Persentase menggunakan pembulatan ke bawah (floor)
    expect(calculateUnitDiscount(10500, "PERCENT", 15)).toBe(1575);
    expect(calculateUnitDiscount(3333, "PERCENT", 10)).toBe(333);
    expect(calculateEffectiveUnitPrice(10500, "PERCENT", 15)).toBe(8925);
  });

  it("menghitung subtotal kotor, total diskon, dan total bersih keranjang (BR-02)", () => {
    const p1 = makeSampleProduct({
      id: "p1",
      selling_price: 10000,
      discount_type: "NOMINAL",
      discount_value: 1000,
    });
    const p2 = makeSampleProduct({
      id: "p2",
      selling_price: 20000,
      discount_type: "PERCENT",
      discount_value: 10,
    });

    const totals = calculateCartTotals([
      { product: p1, quantity: 2 }, // kotor 20.000, diskon 2.000
      { product: p2, quantity: 3 }, // kotor 60.000, diskon 6.000
    ]);

    expect(totals.totalItemsCount).toBe(2);
    expect(totals.totalUnitsQty).toBe(5);
    expect(totals.subtotalGross).toBe(80000);
    expect(totals.discountTotal).toBe(8000);
    expect(totals.totalAmount).toBe(72000);
  });
});

describe("BR-03 & FR-POS-02: Validasi Keras Stok == 0 & Batas Stok", () => {
  it("memblokir produk dengan stok 0 agar tidak masuk keranjang", () => {
    const outOfStockProduct = makeSampleProduct({ stock: 0 });
    const result = addProductToCart([], outOfStockProduct, 1);

    expect(result.added).toBe(false);
    expect(result.items).toHaveLength(0);
    expect(result.error).toContain("STOK HABIS");
  });

  it("memblokir penambahan kuantitas melebihi sisa stok tersedia", () => {
    const limitedProduct = makeSampleProduct({ stock: 2 });
    const step1 = addProductToCart([], limitedProduct, 2);
    expect(step1.added).toBe(true);
    expect(step1.items[0].quantity).toBe(2);

    const step2 = addProductToCart(step1.items, limitedProduct, 1);
    expect(step2.added).toBe(false);
    expect(step2.items[0].quantity).toBe(2);
    expect(step2.error).toContain("tidak mencukupi");
  });

  it("membatasi ubah kuantitas manual (F2) ke maksimum stok yang tersedia", () => {
    const prod = makeSampleProduct({ stock: 5 });
    const initial = [{ product: prod, quantity: 1 }];

    const updated = updateCartItemQuantity(initial, prod.id, 9);
    expect(updated.added).toBe(false);
    expect(updated.items[0].quantity).toBe(5);
    expect(updated.error).toContain("dibatasi ke sisa stok maksimum");
  });

  it("memformat nominal Rupiah dengan pemisah ribuan titik", () => {
    expect(formatRupiah(17500)).toBe("Rp 17.500");
    expect(formatRupiah(0)).toBe("Rp 0");
    expect(formatRupiah(1250000, false)).toBe("1.250.000");
  });
});

describe("Deteksi USB HID Barcode Scanner (evaluateScannerBuffer)", () => {
  it("mendeteksi rentetan karakter cepat (< 40ms per karakter, >= 3 karakter)", () => {
    const chars = ["8", "9", "9", "1", "0", "0"];
    const timestamps = [100, 112, 125, 138, 150, 162];
    expect(evaluateScannerBuffer(chars, timestamps)).toBe("899100");
  });

  it("menolak ketikan manual manusia yang lambat (> 40ms antar karakter)", () => {
    const chars = ["8", "9", "9", "1"];
    const timestamps = [100, 180, 260, 350];
    expect(evaluateScannerBuffer(chars, timestamps)).toBeNull();
  });

  it("menolak rentetan yang terlalu pendek (< 3 karakter)", () => {
    const chars = ["1", "2"];
    const timestamps = [100, 110];
    expect(evaluateScannerBuffer(chars, timestamps)).toBeNull();
  });
});
