import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildFinancialReportWorkbook,
  buildOpnameReportWorkbook,
  buildProductTemplateWorkbook,
  buildProductsExportWorkbook,
  buildProfitReportWorkbook,
  buildSalesReportExportWorkbook,
  buildStockReportWorkbook,
  parseProductImportExcel,
} from "./excelService";
import type {
  FinancialReport,
  Product,
  ProfitReport,
  SalesReport,
  StockOpnameItem,
  StockOpnameSession,
  StockReport,
} from "../types/domain";

const sampleProducts: Product[] = [
  {
    id: "p1",
    sku: "TEST-001",
    barcode: "8992761000011",
    name: "Beras Super 5kg",
    category_name: "Sembako",
    unit: "sak",
    cost_price: 60000,
    selling_price: 72000,
    discount_type: "NONE",
    discount_value: 0,
    unit_discount_amount: 0,
    effective_unit_price: 72000,
    stock: 25,
    is_active: true,
    created_at: "2026-10-23T00:00:00Z",
    updated_at: "2026-10-23T00:00:00Z",
  },
  {
    id: "p2",
    sku: "TEST-002",
    barcode: "8991002000022",
    name: "Minyak Goreng 2L",
    category_name: "Sembako",
    unit: "pouch",
    cost_price: 28000,
    selling_price: 34000,
    discount_type: "NOMINAL",
    discount_value: 1000,
    unit_discount_amount: 1000,
    effective_unit_price: 33000,
    stock: 15,
    is_active: true,
    created_at: "2026-10-23T00:00:00Z",
    updated_at: "2026-10-23T00:00:00Z",
  },
];

describe("excelService — Layanan Excel Ramah Admin Awam", () => {
  it("menghasilkan template Excel 2-sheet dengan petunjuk dan dropdown validasi", async () => {
    const wb = buildProductTemplateWorkbook();
    expect(wb.worksheets.length).toBe(2);

    const dataSheet = wb.getWorksheet("Data Produk");
    const guideSheet = wb.getWorksheet("Petunjuk & Aturan");

    expect(dataSheet).toBeDefined();
    expect(guideSheet).toBeDefined();

    // Verifikasi header row
    const headerRow = dataSheet!.getRow(1);
    expect(headerRow.getCell(1).value).toBe("Kode SKU");
    expect(headerRow.getCell(2).value).toBe("Barcode");
    expect(headerRow.getCell(3).value).toBe("Nama Produk");

    // Verifikasi contoh baris data
    expect(dataSheet!.rowCount).toBeGreaterThanOrEqual(4); // 1 header + minimal 3 sample rows

    // Verifikasi petunjuk pada Sheet 2
    expect(guideSheet!.rowCount).toBeGreaterThanOrEqual(10);
  });

  it("menghasilkan file ekspor katalog produk dengan data lengkap", async () => {
    const wb = buildProductsExportWorkbook(sampleProducts);
    const dataSheet = wb.getWorksheet("Data Produk");
    expect(dataSheet).toBeDefined();

    // Baris ke-2: TEST-001
    const row1 = dataSheet!.getRow(2);
    expect(row1.getCell(1).value).toBe("TEST-001");
    expect(row1.getCell(2).value).toBe("8992761000011");
    expect(row1.getCell(3).value).toBe("Beras Super 5kg");

    // Baris ke-3: TEST-002
    const row2 = dataSheet!.getRow(3);
    expect(row2.getCell(1).value).toBe("TEST-002");
    expect(row2.getCell(2).value).toBe("8991002000022");
  });

  it("menghasilkan file ekspor laporan penjualan 2-sheet (Ringkasan & Rincian)", async () => {
    const mockReport: SalesReport = {
      start_date: "2026-10-01",
      end_date: "2026-10-23",
      completed_sales_count: 5,
      voided_sales_count: 1,
      gross_sales: 500000,
      total_discount: 25000,
      net_sales: 475000,
      total_cogs: 350000,
      gross_profit: 125000,
      top_products: [
        {
          product_id: "p1",
          sku: "TEST-001",
          product_name: "Beras Super 5kg",
          unit: "sak",
          total_qty_sold: 5,
          net_revenue: 360000,
          total_cost: 300000,
          gross_profit: 60000,
        },
      ],
      low_stock_products: [],
      sales: [
        {
          sale: {
            id: "s1",
            shift_id: null,
            receipt_number: "INV-20261023-0001",
            cashier_id: "u1",
            cashier_name_snapshot: "Kasir 1",
            terminal_name: "POS-1",
            subtotal: 72000,
            discount_total: 0,
            total_amount: 72000,
            cash_received: 100000,
            change_amount: 28000,
            status: "COMPLETED",
            voided_by_user_id: null,
            voided_by_name_snapshot: null,
            void_reason: null,
            voided_at: null,
            transaction_date: "2026-10-23",
            created_at: "2026-10-23T10:15:00Z",
          },
          items: [
            {
              id: "li1",
              sale_id: "s1",
              product_id: "p1",
              sku_snapshot: "TEST-001",
              barcode_snapshot: "8992761000011",
              product_name_snapshot: "Beras Super 5kg",
              unit_snapshot: "sak",
              quantity: 1,
              cost_price_snapshot: 60000,
              selling_price_snapshot: 72000,
              discount_type_snapshot: "NONE",
              discount_value_snapshot: 0,
              unit_discount_amount: 0,
              applied_tier_min_qty: null,
              applied_tier_price: null,
              subtotal: 72000,
            },
          ],
        },
      ],
    };

    const wb = buildSalesReportExportWorkbook(mockReport, "Toko Kasir Sejahtera");
    expect(wb.worksheets.length).toBe(2);

    const summarySheet = wb.getWorksheet("Ringkasan Laporan");
    const detailSheet = wb.getWorksheet("Rincian Penjualan");

    expect(summarySheet).toBeDefined();
    expect(detailSheet).toBeDefined();

    // Verifikasi judul dan metrik pada summary sheet
    expect(summarySheet!.getCell("B2").value).toContain("LAPORAN PENJUALAN");
    expect(detailSheet!.getRow(1).getCell(1).value).toBe("No. Struk");
  }, 20000);

  it("mem-parsing file Excel yang valid secara cerdas dan toleran terhadap format awam", async () => {
    // Buat workbook simulasi buatan admin awam
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data Produk");

    // Header dengan variasi spasi / istilah awam
    ws.addRow([
      "Kode SKU",
      "Barcode",
      "Nama Produk",
      "Kategori",
      "Satuan",
      "Harga Modal (HPP)",
      "Harga Jual",
      "Tipe Diskon",
      "Nilai Diskon",
      "Stok",
      "Status Aktif",
    ]);

    // Baris 1: Produk baru dengan format teks Rp dan diskon persen
    ws.addRow([
      "NEW-001",
      "899999123456", // Barcode panjang
      "Sabun Mandi Wangi",
      "Perlengkapan",
      "pcs",
      "Rp 3.500", // ada format Rp dan titik ribuan
      "Rp 5.000",
      "Persen (%)", // nama ramah
      "10",
      "50",
      "Aktif", // nama ramah
    ]);

    // Baris 2: Produk yang sudah ada di database (TEST-001) dengan update harga & stok
    ws.addRow([
      "TEST-001",
      "8992761000011",
      "Beras Super 5kg",
      "Sembako",
      "sak",
      "62000",
      "75000",
      "NONE",
      "0",
      "30",
      "Aktif",
    ]);

    const buffer = await wb.xlsx.writeBuffer();
    const result = await parseProductImportExcel(buffer as ArrayBuffer, sampleProducts);

    expect(result.totalRows).toBe(2);
    expect(result.isValid).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.newCount).toBe(1); // NEW-001
    expect(result.updateCount).toBe(1); // TEST-001

    // Periksa baris 1 (NEW-001)
    const row1 = result.rows[0];
    expect(row1.data.sku).toBe("NEW-001");
    expect(row1.data.barcode).toBe("899999123456");
    expect(row1.data.cost_price).toBe(3500);
    expect(row1.data.selling_price).toBe(5000);
    expect(row1.data.discount_type).toBe("PERCENT");
    expect(row1.data.discount_value).toBe(10);
    expect(row1.data.stock).toBe(50);
    expect(row1.data.is_active).toBe(true);
    expect(row1.isNew).toBe(true);

    // Periksa baris 2 (TEST-001 update)
    const row2 = result.rows[1];
    expect(row2.data.sku).toBe("TEST-001");
    expect(row2.data.selling_price).toBe(75000);
    expect(row2.data.stock).toBe(30);
    expect(row2.isNew).toBe(false);
  });

  it("mendeteksi baris bermasalah dan mengumpulkan rincian pesan error", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data Produk");

    ws.addRow([
      "Kode SKU",
      "Barcode",
      "Nama Produk",
      "Kategori",
      "Satuan",
      "Harga Modal",
      "Harga Jual",
      "Tipe Diskon",
      "Nilai Diskon",
      "Stok",
      "Status Aktif",
    ]);

    // Baris 1: SKU kosong
    ws.addRow([
      "",
      "899123",
      "Produk Tanpa SKU",
      "Umum",
      "pcs",
      5000,
      7000,
      "NONE",
      0,
      10,
      "Aktif",
    ]);

    // Baris 2: Harga minus dan diskon melebihi harga jual
    ws.addRow([
      "ERR-002",
      "899456",
      "Produk Salah Harga",
      "Umum",
      "pcs",
      -2000, // Minus!
      10000,
      "NOMINAL",
      15000, // Diskon melebihi harga jual!
      -5, // Stok minus!
      "Aktif",
    ]);

    const buffer = await wb.xlsx.writeBuffer();
    const result = await parseProductImportExcel(buffer as ArrayBuffer, sampleProducts);

    expect(result.isValid).toBe(false);
    expect(result.errorCount).toBe(2);

    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors[0]).toContain("Kode SKU wajib diisi");

    expect(result.rows[1].isValid).toBe(false);
    expect(result.rows[1].errors.some((e) => e.includes("Harga Modal"))).toBe(true);
    expect(result.rows[1].errors.some((e) => e.includes("Stok"))).toBe(true);
    expect(result.rows[1].errors.some((e) => e.includes("Diskon"))).toBe(true);
  });

  it("menghasilkan file ekspor rekonsiliasi stok opname 2-sheet (Ringkasan & Rincian Item)", async () => {
    const mockSession: StockOpnameSession = {
      id: "opname-123",
      session_name: "Audit Bulanan ATK",
      creator_user_id: "u1",
      creator_name_snapshot: "Admin Bima",
      status: "COMMITTED",
      total_items_counted: 2,
      total_discrepancy_qty: -3,
      total_discrepancy_value: -15000,
      committed_by_user_id: "u1",
      committed_at: "2026-10-28T10:00:00Z",
      notes: "Audit selesai",
      created_at: "2026-10-28T08:00:00Z",
      updated_at: "2026-10-28T10:00:00Z",
    };

    const mockItems: StockOpnameItem[] = [
      {
        id: "item-1",
        opname_session_id: "opname-123",
        product_id: "p1",
        sku: "ATK-001",
        barcode: "899111",
        product_name: "Buku Tulis Sidu 38",
        unit: "pcs",
        physical_count: 45,
        system_stock_snapshot: 50,
        cost_price_snapshot: 3000,
        discrepancy: -5,
        discrepancy_cost: -15000,
        updated_at: "2026-10-28T09:00:00Z",
      },
      {
        id: "item-2",
        opname_session_id: "opname-123",
        product_id: "p2",
        sku: "ATK-002",
        barcode: "899222",
        product_name: "Pulpen Faster Hitam",
        unit: "pcs",
        physical_count: 22,
        system_stock_snapshot: 20,
        cost_price_snapshot: 2500,
        discrepancy: 2,
        discrepancy_cost: 5000,
        updated_at: "2026-10-28T09:05:00Z",
      },
    ];

    const wb = buildOpnameReportWorkbook(mockSession, mockItems);
    expect(wb.worksheets.length).toBe(2);

    const sheet1 = wb.getWorksheet("Ringkasan Sesi");
    const sheet2 = wb.getWorksheet("Rincian Fisik Item");
    expect(sheet1).toBeDefined();
    expect(sheet2).toBeDefined();

    // Verifikasi isi Sheet 1
    expect(sheet1!.getCell("B2").value).toContain("STOK OPNAME");
    expect(sheet1!.rowCount).toBeGreaterThanOrEqual(10);

    // Verifikasi isi Sheet 2
    expect(sheet2!.getRow(1).getCell(1).value).toBe("No");
    expect(sheet2!.getRow(1).getCell(2).value).toBe("Kode SKU");
    expect(sheet2!.getRow(2).getCell(2).value).toBe("ATK-001");
    expect(sheet2!.getRow(2).getCell(8).value).toBe(-5);
  });

  it("menghasilkan file ekspor laporan keuangan & arus kas 2-sheet (Ringkasan & Rekap Harian)", () => {
    const mockFinReport: FinancialReport = {
      start_date: "2026-10-01",
      end_date: "2026-10-28",
      completed_sales_count: 15,
      voided_sales_count: 1,
      gross_sales: 1500000,
      total_discount: 50000,
      net_sales: 1450000,
      total_void_amount: 30000,
      cash_sales: 1450000,
      cash_in_amount: 200000,
      cash_out_amount: 100000,
      total_shift_discrepancy: -5000,
      net_cash_flow: 1545000,
      daily_summaries: [
        {
          date: "2026-10-28",
          completed_count: 5,
          voided_count: 0,
          gross_sales: 500000,
          total_discount: 10000,
          net_sales: 490000,
          cash_sales: 490000,
          cash_in: 50000,
          cash_out: 20000,
          shift_discrepancy: 0,
          net_cash: 520000,
        },
      ],
    };

    const wb = buildFinancialReportWorkbook(mockFinReport, "Mudita Mart Test");
    expect(wb.worksheets.length).toBe(2);

    const sheet1 = wb.getWorksheet("Ringkasan Keuangan");
    const sheet2 = wb.getWorksheet("Rekap Harian");
    expect(sheet1).toBeDefined();
    expect(sheet2).toBeDefined();

    expect(sheet1!.getCell("B2").value).toContain("LAPORAN ARUS KAS & KEUANGAN");
    expect(sheet2!.getRow(1).getCell(1).value).toBe("Tanggal");
    expect(sheet2!.getRow(2).getCell("date").value).toBe("2026-10-28");
    expect(sheet2!.getRow(2).getCell("net_sales").value).toBe(490000);
  });

  it("menghasilkan file ekspor laporan laba kotor 2-sheet (Laba per Kategori & Produk Paling Untung)", () => {
    const mockProfitReport: ProfitReport = {
      start_date: "2026-10-01",
      end_date: "2026-10-28",
      gross_sales: 1000000,
      total_discount: 50000,
      net_sales: 950000,
      total_cogs: 700000,
      gross_profit: 250000,
      profit_margin_pct: 26.32,
      category_profits: [
        {
          category_name: "Sembako",
          total_qty_sold: 10,
          net_revenue: 500000,
          total_cogs: 380000,
          gross_profit: 120000,
          profit_margin_pct: 24.0,
        },
      ],
      product_profits: [
        {
          product_id: "p1",
          sku: "SMB-001",
          product_name: "Beras 5kg",
          unit: "sak",
          total_qty_sold: 5,
          net_revenue: 300000,
          total_cost: 220000,
          gross_profit: 80000,
        },
      ],
    };

    const wb = buildProfitReportWorkbook(mockProfitReport, "Mudita Mart Test");
    expect(wb.worksheets.length).toBe(2);

    const sheet1 = wb.getWorksheet("Laba per Kategori");
    const sheet2 = wb.getWorksheet("Produk Paling Untung");
    expect(sheet1).toBeDefined();
    expect(sheet2).toBeDefined();

    expect(sheet1!.getCell("B2").value).toContain("LAPORAN LABA KOTOR");
    expect(sheet2!.getRow(1).getCell(1).value).toBe("Kode SKU");
    expect(sheet2!.getRow(2).getCell("sku").value).toBe("SMB-001");
    expect(sheet2!.getRow(2).getCell("gross_profit").value).toBe(80000);
  });

  it("menghasilkan file ekspor laporan inventaris & nilai stok 2-sheet (Ringkasan & Daftar Nilai)", () => {
    const mockStockReport: StockReport = {
      total_products: 50,
      active_products: 48,
      total_stock_qty: 1200,
      total_cost_valuation: 15000000,
      total_retail_valuation: 18500000,
      potential_profit: 3500000,
      movements: {
        restock_qty: 500,
        sold_qty: 350,
        damage_qty: 5,
        loss_qty: 2,
        correction_delta: -10,
      },
      low_stock_count: 3,
      out_of_stock_count: 1,
      items: [
        {
          product_id: "p1",
          sku: "MNM-001",
          barcode: "899999",
          product_name: "Teh Botol 450ml",
          category_name: "Minuman",
          unit: "botol",
          stock: 4,
          min_stock: 5,
          cost_price: 3500,
          selling_price: 5000,
          total_cost_valuation: 14000,
          total_retail_valuation: 20000,
          potential_profit: 6000,
          is_low_stock: true,
        },
      ],
    };

    const wb = buildStockReportWorkbook(mockStockReport, "Mudita Mart Test");
    expect(wb.worksheets.length).toBe(2);

    const sheet1 = wb.getWorksheet("Ringkasan Inventaris");
    const sheet2 = wb.getWorksheet("Daftar Nilai Stok");
    expect(sheet1).toBeDefined();
    expect(sheet2).toBeDefined();

    expect(sheet1!.getCell("B2").value).toContain("LAPORAN INVENTARIS");
    expect(sheet2!.getRow(1).getCell(1).value).toBe("Kode SKU");
    expect(sheet2!.getRow(2).getCell("sku").value).toBe("MNM-001");
    expect(sheet2!.getRow(2).getCell("stock_status").value).toBe("Kritis");
    expect(sheet2!.getRow(2).getCell("potential_profit").value).toBe(6000);
  });
});
