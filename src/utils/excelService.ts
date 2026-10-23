import ExcelJS from "exceljs";
import type {
  DiscountType,
  ParsedImportRow,
  ParsedImportSummary,
  Product,
  SalesReport,
} from "../types/domain";

// Palet Warna & Styling Tema Profesional Kassio POS
const THEME_PRIMARY_NAVY = "FF1E3A8A"; // #1E3A8A (Navy Kasir)
const THEME_HEADER_TEXT = "FFFFFFFF"; // White
const THEME_ZEBRA_ROW = "FFF8FAFC"; // #F8FAFC
const THEME_BORDER_COLOR = "FFE2E8F0"; // #E2E8F0
const THEME_ACCENT_GREEN = "FF059669"; // #059669 (Emerald)

const COMMON_UNITS = [
  "pcs",
  "pack",
  "box",
  "kg",
  "gr",
  "liter",
  "ikat",
  "botol",
  "sachet",
  "renceng",
  "dus",
  "lusin",
  "strip",
  "kaleng",
];

const COMMON_CATEGORIES = [
  "Umum",
  "Sembako",
  "Minuman",
  "Makanan",
  "Bumbu",
  "Perlengkapan",
  "Obat",
  "Rokok",
  "Susu",
  "Snack",
];

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: THEME_BORDER_COLOR } },
  left: { style: "thin", color: { argb: THEME_BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: THEME_BORDER_COLOR } },
  right: { style: "thin", color: { argb: THEME_BORDER_COLOR } },
};

/**
 * Membangun lembar kerja template impor produk 2-sheet:
 * - Sheet 1: 'Data Produk' (dengan format teks anti-notasi ilmiah barcode dan dropdown validasi)
 * - Sheet 2: 'Petunjuk & Aturan' (panduan ramah orang awam)
 */
export function buildProductTemplateWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kassio POS";
  wb.lastModifiedBy = "Kassio POS";
  wb.created = new Date();
  wb.modified = new Date();

  // --------------------------------------------------------------------------
  // SHEET 1: DATA PRODUK
  // --------------------------------------------------------------------------
  const sheet = wb.addWorksheet("Data Produk", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Kode SKU", key: "sku", width: 18 },
    { header: "Barcode", key: "barcode", width: 22 },
    { header: "Nama Produk", key: "name", width: 36 },
    { header: "Kategori", key: "category_name", width: 18 },
    { header: "Satuan", key: "unit", width: 14 },
    { header: "Harga Modal (HPP)", key: "cost_price", width: 20 },
    { header: "Harga Jual", key: "selling_price", width: 20 },
    { header: "Tipe Diskon", key: "discount_type", width: 16 },
    { header: "Nilai Diskon", key: "discount_value", width: 16 },
    { header: "Stok Awal", key: "stock", width: 14 },
    { header: "Status Aktif", key: "is_active", width: 16 },
  ];

  // Styling Baris Header (Baris 1)
  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: THEME_HEADER_TEXT }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: THEME_PRIMARY_NAVY },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  });

  // Contoh Data Awal Realistis Minimarket Indonesia
  const sampleData = [
    {
      sku: "BRS-001",
      barcode: "8992761000011",
      name: "Beras Ramos Super 5kg",
      category_name: "Sembako",
      unit: "sak",
      cost_price: 64000,
      selling_price: 72000,
      discount_type: "NONE",
      discount_value: 0,
      stock: 20,
      is_active: "Aktif",
    },
    {
      sku: "MYK-001",
      barcode: "8991002000022",
      name: "Minyak Goreng Sawit 2L",
      category_name: "Sembako",
      unit: "pouch",
      cost_price: 29000,
      selling_price: 34500,
      discount_type: "NOMINAL",
      discount_value: 500,
      stock: 35,
      is_active: "Aktif",
    },
    {
      sku: "KCP-001",
      barcode: "8993004000033",
      name: "Kecap Manis Botol 600ml",
      category_name: "Bumbu",
      unit: "botol",
      cost_price: 18000,
      selling_price: 22000,
      discount_type: "PERCENT",
      discount_value: 5,
      stock: 15,
      is_active: "Aktif",
    },
  ];

  for (const item of sampleData) {
    const row = sheet.addRow(item);
    row.height = 22;
    applyProductRowFormatting(row);
  }

  // Terapkan AutoFilter
  sheet.autoFilter = "A1:K1";

  // Data Validation Dropdown pada Kolom Sheet
  // Berlaku untuk 500 baris pertama
  const unitsFormula = `"${COMMON_UNITS.join(",")}"`;
  const categoriesFormula = `"${COMMON_CATEGORIES.join(",")}"`;
  const discountTypeFormula = '"NONE,PERCENT,NOMINAL"';
  const statusFormula = '"Aktif,Nonaktif"';

  for (let r = 2; r <= 500; r++) {
    sheet.getCell(`D${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [categoriesFormula],
    };
    sheet.getCell(`E${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [unitsFormula],
    };
    sheet.getCell(`H${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [discountTypeFormula],
    };
    sheet.getCell(`K${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [statusFormula],
    };
  }

  // --------------------------------------------------------------------------
  // SHEET 2: PETUNJUK & ATURAN
  // --------------------------------------------------------------------------
  buildGuideSheet(wb);

  return wb;
}

/**
 * Membangun lembar kerja ekspor seluruh katalog produk saat ini (2-sheet).
 */
export function buildProductsExportWorkbook(products: Product[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kassio POS";
  wb.lastModifiedBy = "Kassio POS";
  wb.created = new Date();
  wb.modified = new Date();

  const sheet = wb.addWorksheet("Data Produk", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Kode SKU", key: "sku", width: 18 },
    { header: "Barcode", key: "barcode", width: 22 },
    { header: "Nama Produk", key: "name", width: 36 },
    { header: "Kategori", key: "category_name", width: 18 },
    { header: "Satuan", key: "unit", width: 14 },
    { header: "Harga Modal (HPP)", key: "cost_price", width: 20 },
    { header: "Harga Jual", key: "selling_price", width: 20 },
    { header: "Tipe Diskon", key: "discount_type", width: 16 },
    { header: "Nilai Diskon", key: "discount_value", width: 16 },
    { header: "Stok", key: "stock", width: 14 },
    { header: "Status Aktif", key: "is_active", width: 16 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: THEME_HEADER_TEXT }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: THEME_PRIMARY_NAVY },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  });

  products.forEach((p, index) => {
    const row = sheet.addRow({
      sku: p.sku,
      barcode: p.barcode ?? "",
      name: p.name,
      category_name: p.category_name,
      unit: p.unit,
      cost_price: p.cost_price,
      selling_price: p.selling_price,
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      stock: p.stock,
      is_active: p.is_active ? "Aktif" : "Nonaktif",
    });

    row.height = 22;
    applyProductRowFormatting(row);

    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: THEME_ZEBRA_ROW },
        };
      });
    }
  });

  sheet.autoFilter = "A1:K1";

  // Tambahkan Sheet Petunjuk & Aturan
  buildGuideSheet(wb);

  return wb;
}

/**
 * Membangun lembar kerja ekspor Laporan Penjualan (2-sheet):
 * - Sheet 1: 'Ringkasan Laporan' (KPI eksekutif, rekap metode pembayaran, produk terlaris)
 * - Sheet 2: 'Rincian Penjualan' (Tabel detail transaksi per item dengan format Rupiah)
 */
export function buildSalesReportExportWorkbook(
  report: SalesReport,
  storeName: string,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kassio POS";
  wb.lastModifiedBy = "Kassio POS";
  wb.created = new Date();
  wb.modified = new Date();

  // --------------------------------------------------------------------------
  // SHEET 1: RINGKASAN LAPORAN
  // --------------------------------------------------------------------------
  const summarySheet = wb.addWorksheet("Ringkasan Laporan");
  summarySheet.columns = [
    { width: 4 },
    { width: 32 },
    { width: 24 },
    { width: 4 },
    { width: 32 },
    { width: 24 },
  ];

  // Header Banner
  summarySheet.mergeCells("B2:F2");
  const titleCell = summarySheet.getCell("B2");
  titleCell.value = `LAPORAN PENJUALAN — ${storeName.toUpperCase()}`;
  titleCell.font = { bold: true, size: 16, color: { argb: THEME_PRIMARY_NAVY } };

  summarySheet.mergeCells("B3:F3");
  const subtitleCell = summarySheet.getCell("B3");
  subtitleCell.value = `Periode: ${report.start_date} s/d ${report.end_date} | Dicetak: ${new Date().toLocaleString("id-ID")}`;
  subtitleCell.font = { italic: true, size: 10, color: { argb: "FF64748B" } };

  // Tabel Metrik Utama (Baris 5)
  summarySheet.getCell("B5").value = "METRIK KINERJA PENJUALAN";
  summarySheet.getCell("B5").font = { bold: true, size: 12, color: { argb: THEME_PRIMARY_NAVY } };

  const metrics = [
    ["Omzet Penjualan (Kotor)", report.gross_sales, '"Rp" #,##0'],
    ["Total Potongan Diskon", report.total_discount, '"Rp" #,##0'],
    ["Penjualan Bersih (Net Sales)", report.net_sales, '"Rp" #,##0'],
    ["Total HPP / Modal Barang (COGS)", report.total_cogs, '"Rp" #,##0'],
    ["Laba Kotor (Gross Profit)", report.gross_profit, '"Rp" #,##0'],
    [
      "Margin Laba Kotor (%)",
      report.net_sales > 0 ? (report.gross_profit / report.net_sales) * 100 : 0,
      '0.0"%"',
    ],
    ["Total Transaksi Sukses", report.completed_sales_count, "#,##0"],
    ["Total Transaksi Void / Dibatalkan", report.voided_sales_count, "#,##0"],
  ];

  metrics.forEach(([label, value, fmt], idx) => {
    const rowNum = 6 + idx;
    const labelCell = summarySheet.getCell(`B${rowNum}`);
    const valCell = summarySheet.getCell(`C${rowNum}`);

    labelCell.value = label;
    labelCell.font = { size: 10 };
    labelCell.border = thinBorder;

    valCell.value = value;
    valCell.font = { bold: true, size: 10 };
    valCell.numFmt = fmt as string;
    valCell.alignment = { horizontal: "right" };
    valCell.border = thinBorder;

    if (label.toString().includes("Laba Kotor")) {
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFECFDF5" },
      };
      valCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFECFDF5" },
      };
      valCell.font = { bold: true, size: 11, color: { argb: THEME_ACCENT_GREEN } };
    }
  });

  // Top Produk Terlaris (Kolom E-F, Baris 5)
  summarySheet.getCell("E5").value = "PRODUK TERLARIS (TOP SALES)";
  summarySheet.getCell("E5").font = { bold: true, size: 12, color: { argb: THEME_PRIMARY_NAVY } };

  if (report.top_products.length > 0) {
    report.top_products.slice(0, 8).forEach((tp, idx) => {
      const rowNum = 6 + idx;
      const nameCell = summarySheet.getCell(`E${rowNum}`);
      const qtyCell = summarySheet.getCell(`F${rowNum}`);

      nameCell.value = `${idx + 1}. ${tp.product_name}`;
      nameCell.font = { size: 10 };
      nameCell.border = thinBorder;

      qtyCell.value = `${tp.total_qty_sold} ${tp.unit} (Rp ${tp.net_revenue.toLocaleString("id-ID")})`;
      qtyCell.font = { size: 9, bold: true };
      qtyCell.alignment = { horizontal: "right" };
      qtyCell.border = thinBorder;
    });
  } else {
    summarySheet.getCell("E6").value = "Belum ada data transaksi pada periode ini.";
    summarySheet.getCell("E6").font = { italic: true, size: 10, color: { argb: "FF94A3B8" } };
  }

  // --------------------------------------------------------------------------
  // SHEET 2: RINCIAN PENJUALAN
  // --------------------------------------------------------------------------
  const detailSheet = wb.addWorksheet("Rincian Penjualan", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  detailSheet.columns = [
    { header: "No. Struk", key: "receipt_number", width: 20 },
    { header: "Tanggal", key: "transaction_date", width: 14 },
    { header: "Waktu", key: "created_at", width: 12 },
    { header: "Terminal", key: "terminal_name", width: 14 },
    { header: "Kasir", key: "cashier_name", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Kode SKU", key: "sku", width: 16 },
    { header: "Nama Produk", key: "product_name", width: 34 },
    { header: "Qty", key: "quantity", width: 10 },
    { header: "Satuan", key: "unit", width: 10 },
    { header: "HPP Satuan", key: "cost_price", width: 18 },
    { header: "Harga Jual Satuan", key: "selling_price", width: 18 },
    { header: "Diskon Satuan", key: "unit_discount", width: 16 },
    { header: "Total Penjualan", key: "line_subtotal", width: 18 },
    { header: "Total HPP", key: "line_cogs", width: 18 },
    { header: "Laba Kotor", key: "line_profit", width: 18 },
    { header: "Alasan Void", key: "void_reason", width: 24 },
  ];

  const detailHeaderRow = detailSheet.getRow(1);
  detailHeaderRow.height = 28;
  detailHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: THEME_HEADER_TEXT }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: THEME_PRIMARY_NAVY },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  });

  let rowIndex = 0;
  for (const swi of report.sales) {
    const s = swi.sale;
    for (const li of swi.items) {
      const lineCogs = li.cost_price_snapshot * li.quantity;
      const lineProfit = li.subtotal - lineCogs;
      const timeStr = s.created_at.includes("T")
        ? s.created_at.slice(11, 16)
        : s.created_at.slice(0, 5);

      const row = detailSheet.addRow({
        receipt_number: s.receipt_number,
        transaction_date: s.transaction_date,
        created_at: timeStr,
        terminal_name: s.terminal_name,
        cashier_name: s.cashier_name_snapshot,
        status: s.status,
        sku: li.sku_snapshot,
        product_name: li.product_name_snapshot,
        quantity: li.quantity,
        unit: li.unit_snapshot,
        cost_price: li.cost_price_snapshot,
        selling_price: li.selling_price_snapshot,
        unit_discount: li.unit_discount_amount,
        line_subtotal: li.subtotal,
        line_cogs: lineCogs,
        line_profit: lineProfit,
        void_reason: s.void_reason ?? "",
      });

      row.height = 20;

      // Styling format angka
      row.getCell("receipt_number").numFmt = "@";
      row.getCell("sku").numFmt = "@";
      row.getCell("cost_price").numFmt = '"Rp" #,##0';
      row.getCell("selling_price").numFmt = '"Rp" #,##0';
      row.getCell("unit_discount").numFmt = '"Rp" #,##0';
      row.getCell("line_subtotal").numFmt = '"Rp" #,##0';
      row.getCell("line_cogs").numFmt = '"Rp" #,##0';
      row.getCell("line_profit").numFmt = '"Rp" #,##0';
      row.getCell("quantity").numFmt = "#,##0";

      // Border & Alignment
      row.eachCell((cell, colNum) => {
        cell.border = thinBorder;
        if ([1, 2, 3, 4, 6, 9, 10].includes(colNum)) {
          cell.alignment = { horizontal: "center" };
        } else if ([11, 12, 13, 14, 15, 16].includes(colNum)) {
          cell.alignment = { horizontal: "right" };
        }
      });

      // Status Void ditandai latar merah muda
      if (s.status === "VOIDED") {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEE2E2" }, // Light Red
          };
          cell.font = { color: { argb: "FF991B1B" } };
        });
      } else if (rowIndex % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: THEME_ZEBRA_ROW },
          };
        });
      }

      rowIndex++;
    }
  }

  detailSheet.autoFilter = "A1:Q1";

  return wb;
}

/**
 * Mem-parsing file Excel (.xlsx) yang diunggah oleh admin secara cerdas & toleran terhadap format awam.
 */
export async function parseProductImportExcel(
  arrayBuffer: ArrayBuffer,
  existingProducts: Product[],
): Promise<ParsedImportSummary> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  // Cari sheet 'Data Produk' terlebih dahulu, jika tidak ada gunakan sheet pertama
  const sheet =
    wb.getWorksheet("Data Produk") ||
    wb.getWorksheet("Sheet1") ||
    wb.getWorksheet(1);

  if (!sheet) {
    throw new Error("File Excel tidak memiliki lembar kerja (worksheet).");
  }

  // Petakan indeks kolom header secara cerdas (mengenali Bahasa Indonesia & istilah teknis)
  const headerMap: Record<string, number> = {};
  const headerRow = sheet.getRow(1);

  headerRow.eachCell((cell, colNumber) => {
    const rawText = (cell.text || "").toString().trim().toLowerCase();
    const cleanKey = rawText.replace(/[^a-z0-9]/g, "");

    if (["kodesku", "sku", "kode", "kodeproduk"].includes(cleanKey)) {
      headerMap["sku"] = colNumber;
    } else if (["barcode", "kodescan", "upc", "ean"].includes(cleanKey)) {
      headerMap["barcode"] = colNumber;
    } else if (
      ["namaproduk", "nama", "name", "namabarang", "deskripsi"].includes(cleanKey)
    ) {
      headerMap["name"] = colNumber;
    } else if (
      ["kategori", "category", "categoryname", "kategoriproduk"].includes(cleanKey)
    ) {
      headerMap["category_name"] = colNumber;
    } else if (["satuan", "unit", "kemasan", "uom"].includes(cleanKey)) {
      headerMap["unit"] = colNumber;
    } else if (
      [
        "hargamodal",
        "hargamodalhpp",
        "hpp",
        "costprice",
        "modal",
        "hargabeli",
      ].includes(cleanKey)
    ) {
      headerMap["cost_price"] = colNumber;
    } else if (
      [
        "hargajual",
        "sellingprice",
        "harga",
        "hargakonsumen",
        "price",
      ].includes(cleanKey)
    ) {
      headerMap["selling_price"] = colNumber;
    } else if (
      ["tipediskon", "discounttype", "jenisdiskon", "diskon"].includes(cleanKey)
    ) {
      headerMap["discount_type"] = colNumber;
    } else if (
      [
        "nilaidiskon",
        "discountvalue",
        "potongandiskon",
        "besardiskon",
      ].includes(cleanKey)
    ) {
      headerMap["discount_value"] = colNumber;
    } else if (
      ["stok", "stokawal", "stock", "initialstock", "jumlah"].includes(cleanKey)
    ) {
      headerMap["stock"] = colNumber;
    } else if (
      ["statusaktif", "status", "isactive", "aktif"].includes(cleanKey)
    ) {
      headerMap["is_active"] = colNumber;
    }
  });

  // Validasi keberadaan kolom wajib
  if (!headerMap["sku"] || !headerMap["name"]) {
    throw new Error(
      "Format judul kolom tidak dikenali. Pastikan file Excel memiliki kolom 'Kode SKU' dan 'Nama Produk'.",
    );
  }

  // Buat lookup SKU existing untuk deteksi produk baru vs pembaruan
  const existingSkuMap = new Map<string, Product>();
  for (const p of existingProducts) {
    existingSkuMap.set(p.sku.trim().toLowerCase(), p);
  }

  const parsedRows: ParsedImportRow[] = [];
  let newCount = 0;
  let updateCount = 0;
  let errorCount = 0;

  // Baca setiap baris mulai baris ke-2
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);

    // Cek apakah baris sepenuhnya kosong
    let hasData = false;
    row.eachCell(() => {
      hasData = true;
    });
    if (!hasData) continue;

    const rowErrors: string[] = [];

    // 1. SKU
    const rawSku = getCellStringValue(row.getCell(headerMap["sku"]));
    const sku = rawSku.trim();
    if (!sku) {
      rowErrors.push("Kode SKU wajib diisi.");
    }

    // 2. Barcode (Konversi aman agar tidak ada format notasi ilmiah)
    let barcode: string | null = null;
    if (headerMap["barcode"]) {
      const rawBarcode = getCellStringValue(row.getCell(headerMap["barcode"]));
      const cleanBarcode = rawBarcode.trim();
      barcode = cleanBarcode.length > 0 ? cleanBarcode : null;
    }

    // 3. Nama Produk
    const rawName = getCellStringValue(row.getCell(headerMap["name"]));
    const name = rawName.trim();
    if (!name) {
      rowErrors.push("Nama Produk wajib diisi.");
    }

    // 4. Kategori
    let categoryName = "Umum";
    if (headerMap["category_name"]) {
      const c = getCellStringValue(row.getCell(headerMap["category_name"])).trim();
      if (c) categoryName = c;
    }

    // 5. Satuan
    let unit = "pcs";
    if (headerMap["unit"]) {
      const u = getCellStringValue(row.getCell(headerMap["unit"])).trim();
      if (u) unit = u;
    }

    // 6. Harga Modal
    let costPrice = 0;
    if (headerMap["cost_price"]) {
      const parsedCost = parseNumericCurrency(row.getCell(headerMap["cost_price"]));
      if (parsedCost === null || parsedCost < 0) {
        rowErrors.push("Harga Modal (HPP) tidak valid atau bernilai negatif.");
      } else {
        costPrice = parsedCost;
      }
    }

    // 7. Harga Jual
    let sellingPrice = 0;
    if (headerMap["selling_price"]) {
      const parsedSelling = parseNumericCurrency(
        row.getCell(headerMap["selling_price"]),
      );
      if (parsedSelling === null || parsedSelling < 0) {
        rowErrors.push("Harga Jual tidak valid atau bernilai negatif.");
      } else {
        sellingPrice = parsedSelling;
      }
    }

    // 8. Tipe Diskon
    let discountType: DiscountType = "NONE";
    if (headerMap["discount_type"]) {
      const rawType = getCellStringValue(
        row.getCell(headerMap["discount_type"]),
      ).toUpperCase();
      if (rawType.includes("PERSEN") || rawType.includes("%")) {
        discountType = "PERCENT";
      } else if (
        rawType.includes("NOMINAL") ||
        rawType.includes("RP") ||
        rawType.includes("FIXED")
      ) {
        discountType = "NOMINAL";
      } else {
        discountType = "NONE";
      }
    }

    // 9. Nilai Diskon
    let discountValue = 0;
    if (headerMap["discount_value"]) {
      const parsedDisc = parseNumericCurrency(
        row.getCell(headerMap["discount_value"]),
      );
      if (parsedDisc === null || parsedDisc < 0) {
        rowErrors.push("Nilai Diskon tidak valid atau bernilai negatif.");
      } else {
        discountValue = parsedDisc;
      }
    }

    // Validasi Logika Diskon
    if (discountType === "PERCENT") {
      if (discountValue > 100) {
        rowErrors.push("Nilai diskon persen tidak boleh melebihi 100%.");
      }
    } else if (discountType === "NOMINAL") {
      if (discountValue > sellingPrice) {
        rowErrors.push(
          `Nilai Diskon nominal (Rp ${discountValue.toLocaleString("id-ID")}) melebihi Harga Jual (Rp ${sellingPrice.toLocaleString("id-ID")}).`,
        );
      }
    }

    // 10. Stok
    let stock = 0;
    if (headerMap["stock"]) {
      const parsedStock = parseNumericCurrency(row.getCell(headerMap["stock"]));
      if (parsedStock === null || parsedStock < 0) {
        rowErrors.push("Stok barang tidak valid atau bernilai negatif.");
      } else {
        stock = parsedStock;
      }
    }

    // 11. Status Aktif
    let isActive = true;
    if (headerMap["is_active"]) {
      const rawActive = getCellStringValue(
        row.getCell(headerMap["is_active"]),
      ).toLowerCase();
      if (
        ["nonaktif", "tidak", "false", "0", "off", "non"].includes(rawActive)
      ) {
        isActive = false;
      }
    }

    const isNew = !existingSkuMap.has(sku.toLowerCase());
    const isValid = rowErrors.length === 0;

    if (!isValid) {
      errorCount++;
    } else if (isNew) {
      newCount++;
    } else {
      updateCount++;
    }

    parsedRows.push({
      rowNumber: r,
      isNew,
      isValid,
      errors: rowErrors,
      data: {
        sku,
        barcode,
        name,
        category_name: categoryName,
        unit,
        cost_price: costPrice,
        selling_price: sellingPrice,
        discount_type: discountType,
        discount_value: discountValue,
        stock,
        is_active: isActive,
      },
    });
  }

  return {
    rows: parsedRows,
    totalRows: parsedRows.length,
    newCount,
    updateCount,
    errorCount,
    isValid: errorCount === 0 && parsedRows.length > 0,
  };
}

/**
 * Mengonversi workbook ExcelJS menjadi file biner dan memicu download otomatis di browser/WebView2.
 */
export async function saveWorkbookAsFile(
  workbook: ExcelJS.Workbook,
  filename: string,
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// HELPER INTERNAL
// ============================================================================

function applyProductRowFormatting(row: ExcelJS.Row): void {
  row.getCell("sku").numFmt = "@";
  row.getCell("barcode").numFmt = "@";
  row.getCell("cost_price").numFmt = '"Rp" #,##0';
  row.getCell("selling_price").numFmt = '"Rp" #,##0';
  row.getCell("discount_value").numFmt = "#,##0";
  row.getCell("stock").numFmt = "#,##0";

  row.eachCell((cell, colNum) => {
    cell.border = thinBorder;
    if ([1, 2, 4, 5, 8, 11].includes(colNum)) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
    } else if ([6, 7, 9, 10].includes(colNum)) {
      cell.alignment = { horizontal: "right", vertical: "middle" };
    } else {
      cell.alignment = { horizontal: "left", vertical: "middle" };
    }
  });
}

function buildGuideSheet(wb: ExcelJS.Workbook): void {
  const guideSheet = wb.addWorksheet("Petunjuk & Aturan");
  guideSheet.columns = [
    { width: 4 },
    { header: "", width: 22 },
    { header: "", width: 65 },
  ];

  // Header Judul
  guideSheet.mergeCells("B2:C2");
  const titleCell = guideSheet.getCell("B2");
  titleCell.value = "PANDUAN PENGISIAN TEMPLATE IMPOR PRODUK — KASSIO POS";
  titleCell.font = { bold: true, size: 14, color: { argb: THEME_PRIMARY_NAVY } };

  guideSheet.mergeCells("B3:C3");
  const subCell = guideSheet.getCell("B3");
  subCell.value =
    "Ikuti petunjuk di bawah ini agar proses impor katalog produk berjalan lancar tanpa kendala format.";
  subCell.font = { italic: true, size: 10, color: { argb: "FF64748B" } };

  const rules: [string, string][] = [
    [
      "Kode SKU",
      "WAJIB DIISI. Kode unik produk (misal: BRS-001). Jika SKU sudah terdaftar, sistem akan memperbarui data produk lama tersebut.",
    ],
    [
      "Barcode",
      "OPSIONAL. Nomor barcode fisik produk (contoh EAN-13: 8992761000011). Kolom ini sudah dikunci sebagai TEKS agar tidak berubah menjadi notasi ilmiah (8.99E+11).",
    ],
    [
      "Nama Produk",
      "WAJIB DIISI. Nama lengkap barang beserta varian atau kemasannya (contoh: Minyak Goreng 2L).",
    ],
    [
      "Kategori",
      "Kategori barang. Pilih dari dropdown atau ketik kategori baru (contoh: Sembako, Minuman, Snack, Bumbu).",
    ],
    [
      "Satuan",
      "Satuan jual barang di kasir (contoh: pcs, pack, box, kg, botol, sachet).",
    ],
    [
      "Harga Modal (HPP)",
      "Harga beli barang dari distributor dalam Rupiah bulat (contoh: 25000). Tidak boleh bernilai negatif.",
    ],
    [
      "Harga Jual",
      "Harga jual ke pembeli di kasir dalam Rupiah bulat (contoh: 30000). Tidak boleh bernilai negatif.",
    ],
    [
      "Tipe Diskon",
      "Pilihan diskon: NONE (tanpa diskon), PERCENT (diskon persen %), atau NOMINAL (potongan harga Rp).",
    ],
    [
      "Nilai Diskon",
      "Besaran potongan diskon. Jika PERCENT, isi 1-100. Jika NOMINAL, isi nominal Rp (tidak boleh melebihi harga jual).",
    ],
    [
      "Stok Awal",
      "Jumlah fisik barang saat ini. Jika produk sudah ada dan stok diubah, sistem otomatis mencatat riwayat Penyesuaian Stok (Stock Adjustment).",
    ],
    [
      "Status Aktif",
      "Pilih 'Aktif' agar dapat dijual di kasir, atau 'Nonaktif' untuk mengarsipkan barang.",
    ],
  ];

  guideSheet.getCell("B5").value = "KOLOM";
  guideSheet.getCell("C5").value = "PENJELASAN & ATURAN PENGISIAN";
  [guideSheet.getCell("B5"), guideSheet.getCell("C5")].forEach((c) => {
    c.font = { bold: true, color: { argb: THEME_HEADER_TEXT }, size: 10 };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: THEME_PRIMARY_NAVY },
    };
    c.border = thinBorder;
  });

  rules.forEach(([colName, desc], idx) => {
    const r = 6 + idx;
    const c1 = guideSheet.getCell(`B${r}`);
    const c2 = guideSheet.getCell(`C${r}`);

    c1.value = colName;
    c1.font = { bold: true, size: 10 };
    c1.border = thinBorder;

    c2.value = desc;
    c2.font = { size: 9 };
    c2.alignment = { wrapText: true };
    c2.border = thinBorder;
  });
}

function getCellStringValue(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) {
    return "";
  }
  if (typeof cell.value === "object") {
    if ("text" in cell.value && typeof cell.value.text === "string") {
      return cell.value.text;
    }
    if ("result" in cell.value && cell.value.result !== undefined) {
      return String(cell.value.result);
    }
  }
  return String(cell.value);
}

function parseNumericCurrency(cell: ExcelJS.Cell): number | null {
  if (cell.value === null || cell.value === undefined) {
    return 0;
  }
  if (typeof cell.value === "number") {
    return isNaN(cell.value) ? null : Math.round(cell.value);
  }
  const str = getCellStringValue(cell);
  if (!str.trim()) {
    return 0;
  }

  // Bersihkan karakter 'Rp', 'RP', spasi, pemisah titik/koma ribuan
  const cleaned = str
    .replace(/[rR][pP]/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, "");

  const num = Number(cleaned);
  if (isNaN(num)) {
    return null;
  }
  return Math.round(num);
}
