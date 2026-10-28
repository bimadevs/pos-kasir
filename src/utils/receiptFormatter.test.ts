import { describe, expect, it } from "vitest";
import {
  renderFallbackReceiptText,
  wrapFallbackWords,
} from "./receiptFormatter";
import type { ReceiptData } from "../types/domain";

describe("Receipt Preview & Fallback Formatter", () => {
  const sampleReceipt: ReceiptData = {
    store_name: "Supermarket Berkah Abadi Sejahtera Indonesia",
    store_address: "Jl. Boulevard Raya Barat No. 88, Kelapa Gading",
    store_phone: "0812-3456-7890",
    receipt_footer: "Terima kasih telah berbelanja di toko kami!",
    is_reprint: false,
    sale: {
      id: "sale-01",
      shift_id: null,
      receipt_number: "INV-20261019-0001",
      cashier_id: "u-1",
      cashier_name_snapshot: "Ahmad Saifullah Hidayat",
      terminal_name: "Terminal Kasir 01",
      subtotal: 75000,
      discount_total: 5000,
      total_amount: 70000,
      cash_received: 100000,
      change_amount: 30000,
      status: "COMPLETED",
      voided_by_user_id: null,
      voided_by_name_snapshot: null,
      void_reason: null,
      voided_at: null,
      transaction_date: "2026-10-19",
      created_at: "2026-10-19T14:30:00+07:00",
    },
    items: [
      {
        id: "item-1",
        sale_id: "sale-01",
        product_id: "prod-1",
        sku_snapshot: "SKU-001",
        barcode_snapshot: "89912345",
        product_name_snapshot:
          "Minyak Goreng Sawit Bimoli Spesial Pouch 2000ml Kemasan Refill",
        unit_snapshot: "pouch",
        quantity: 1,
        cost_price_snapshot: 32000,
        selling_price_snapshot: 40000,
        discount_type_snapshot: "NOMINAL",
        discount_value_snapshot: 5000,
        unit_discount_amount: 5000,
        applied_tier_min_qty: null,
        applied_tier_price: null,
        subtotal: 35000,
      },
      {
        id: "item-2",
        sale_id: "sale-01",
        product_id: "prod-2",
        sku_snapshot: "SKU-002",
        barcode_snapshot: "89954321",
        product_name_snapshot: "Gula Pasir Gulaku Premium 1kg",
        unit_snapshot: "kg",
        quantity: 2,
        cost_price_snapshot: 14000,
        selling_price_snapshot: 17500,
        discount_type_snapshot: "NONE",
        discount_value_snapshot: 0,
        unit_discount_amount: 0,
        applied_tier_min_qty: null,
        applied_tier_price: null,
        subtotal: 35000,
      },
    ],
  };

  it("wrapFallbackWords correctly wraps words without exceeding cols", () => {
    const text = "Minyak Goreng Sawit Bimoli Spesial Pouch 2000ml Kemasan Refill";
    const wrapped = wrapFallbackWords(text, 32);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const line of wrapped) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
  });

  it("renderFallbackReceiptText on 58mm (32 cols) ensures no line exceeds 32 chars", () => {
    const text58 = renderFallbackReceiptText(sampleReceipt, 32, 0);
    const lines = text58.split("\n");

    for (const line of lines) {
      expect(
        line.length,
        `Line exceeds 32 chars: "${line}" (${line.length})`
      ).toBeLessThanOrEqual(32);
    }

    expect(text58).toContain("INV-20261019-0001");
    expect(text58).toContain("TOTAL");
    expect(text58).toContain("Kembalian");
    expect(text58).not.toContain("*** CETAKAN ULANG ***");
  }, 20000);

  it("renderFallbackReceiptText with left margin offset prefixes lines correctly and stays within cols", () => {
    const text58Margin = renderFallbackReceiptText(sampleReceipt, 32, 3);
    const lines = text58Margin.split("\n");

    for (const line of lines) {
      expect(
        line.length,
        `Line with margin exceeds 32 chars: "${line}" (${line.length})`
      ).toBeLessThanOrEqual(32);
      expect(line.startsWith("   ")).toBe(true);
    }
  });

  it("renderFallbackReceiptText displays reprint indicator when is_reprint is true", () => {
    const reprintReceipt: ReceiptData = {
      ...sampleReceipt,
      is_reprint: true,
    };
    const text = renderFallbackReceiptText(reprintReceipt, 32, 0);
    expect(text).toContain("*** CETAKAN ULANG ***");
  });
});
