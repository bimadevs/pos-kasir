import React, { useCallback, useEffect, useState } from "react";
import {
  Boxes,
  Download,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { useTerminal } from "../../context/TerminalContext";
import { ipc } from "../../services/ipc";
import type { StockReport } from "../../types/domain";
import {
  buildStockReportWorkbook,
  saveWorkbookAsFile,
} from "../../utils/excelService";
import { formatRupiah, todayLocalIsoDate } from "../../utils/posCalculator";
import { ReportThermalModal } from "./ReportThermalModal";

function renderStockThermalText(
  report: StockReport,
  storeName: string,
  cols = 32
): string {
  const divider = "-".repeat(cols);
  const doubleDivider = "=".repeat(cols);
  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((cols - text.length) / 2));
    return " ".repeat(pad) + text;
  };
  const leftRight = (left: string, right: string) => {
    if (right.length >= cols) return right.slice(0, cols);
    const maxLeft = cols - right.length - 1;
    const truncatedLeft = left.slice(0, maxLeft);
    const space = Math.max(1, cols - truncatedLeft.length - right.length);
    return truncatedLeft + " ".repeat(space) + right;
  };

  const lines: string[] = [];
  lines.push(doubleDivider);
  lines.push(center(storeName.toUpperCase()));
  lines.push(center("LAPORAN VALUASI INVENTARIS"));
  lines.push(doubleDivider);
  lines.push(leftRight("Waktu Cetak", new Date().toLocaleDateString("id-ID")));
  lines.push(divider);
  lines.push(leftRight("Total Produk", String(report.total_products)));
  lines.push(leftRight("Produk Aktif", String(report.active_products)));
  lines.push(leftRight("Total Fisik Unit", String(report.total_stock_qty)));
  lines.push(divider);
  lines.push(
    leftRight(
      "Valuasi Modal HPP",
      formatRupiah(report.total_cost_valuation, false)
    )
  );
  lines.push(
    leftRight(
      "Valuasi Retail",
      formatRupiah(report.total_retail_valuation, false)
    )
  );
  lines.push(doubleDivider);
  lines.push(
    leftRight(
      "POTENSI LABA STOK",
      `Rp ${formatRupiah(report.potential_profit, false)}`
    )
  );
  lines.push(doubleDivider);
  lines.push(leftRight("Produk Kritis (<=5)", String(report.low_stock_count)));
  lines.push(leftRight("Produk Habis (0)", String(report.out_of_stock_count)));
  lines.push(divider);
  lines.push(center("-- MUTASI STOK --"));
  lines.push(leftRight("Restock (+)", String(report.movements.restock_qty)));
  lines.push(leftRight("Terjual (-)", String(report.movements.sold_qty)));
  lines.push(leftRight("Rusak (-)", String(report.movements.damage_qty)));
  lines.push(leftRight("Hilang (-)", String(report.movements.loss_qty)));
  lines.push(
    leftRight("Koreksi (+/-)", String(report.movements.correction_delta))
  );
  lines.push(doubleDivider);
  return lines.join("\n");
}

export const StockReportView: React.FC = () => {
  const { terminalStatus } = useTerminal();
  const [report, setReport] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [showThermalModal, setShowThermalModal] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipc.getStockReport(
        categoryFilter.trim() || null,
        searchTerm.trim() || null
      );
      setReport(res);
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal memuat laporan stok: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleExportExcel = async () => {
    if (!report) return;
    try {
      const storeName = terminalStatus?.store_name || "Mudita Mart";
      const wb = buildStockReportWorkbook(report, storeName);
      await saveWorkbookAsFile(
        wb,
        `laporan-inventaris-stok-${todayLocalIsoDate()}.xlsx`
      );
      setFeedback({
        type: "success",
        message: "Laporan inventaris stok berhasil diekspor ke Excel.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal ekspor Excel: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const handlePrintA4 = () => {
    window.print();
  };

  const storeName = terminalStatus?.store_name || "Mudita Mart";

  // List categories from report items for dropdown
  const categories = React.useMemo(() => {
    if (!report?.items) return [];
    const set = new Set<string>();
    report.items.forEach((it) => {
      if (it.category_name) set.add(it.category_name);
    });
    return Array.from(set).sort();
  }, [report?.items]);

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Filter and Action Bar */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-4 flex flex-wrap items-end justify-between gap-4 shadow-2xs print:hidden">
        <div className="flex flex-wrap items-end gap-3 text-xs flex-1 max-w-xl">
          <div className="flex-1 min-w-[200px]">
            <label className="block font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Cari Produk (Nama / Barcode / SKU)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Cari barang inventaris..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 border border-zinc-300 rounded-xl text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all placeholder:text-zinc-400"
              />
            </div>
          </div>

          <div className="w-48">
            <label className="block font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Kategori
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
            >
              <option value="">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-300 hover:bg-zinc-50 text-zinc-600 transition-colors cursor-pointer"
            title="Segarkan data inventaris"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin text-teal-600" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setShowThermalModal(true)}
            disabled={!report || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:scale-[0.98] text-zinc-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            title="Pratinjau cetak ringkasan inventaris thermal"
          >
            <Receipt className="w-4 h-4 text-zinc-500" />
            Cetak Struk Thermal
          </button>
          <button
            type="button"
            onClick={handlePrintA4}
            disabled={!report || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:scale-[0.98] text-zinc-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            title="Cetak format kertas A4 atau simpan ke PDF"
          >
            <Printer className="w-4 h-4 text-zinc-500" />
            Cetak A4 / PDF
          </button>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={!report || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Ekspor laporan stok & valuasi ke format Excel (.xlsx)"
          >
            <Download className="w-4 h-4" />
            Ekspor Excel
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      {report && (
        <div className="grid grid-cols-12 gap-4">
          {/* Potential Gross Profit - Hero Card */}
          <div className="col-span-4 bg-teal-700 text-white rounded-2xl p-5 shadow-xs border border-teal-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-100 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-amber-300" />
                  Potensi Laba Kotor Stok
                </span>
                <span className="px-2 py-0.5 rounded-full bg-teal-800/80 text-amber-300 text-[10px] font-mono font-bold">
                  Retail − HPP
                </span>
              </div>
              <div className="text-3xl font-black font-mono text-amber-300 mt-2 tabular-nums">
                {formatRupiah(report.potential_profit)}
              </div>
            </div>
            <div className="pt-3 border-t border-teal-600/70 text-xs flex justify-between text-teal-100/90 font-mono">
              <span>Valuasi HPP: {formatRupiah(report.total_cost_valuation)}</span>
              <span>Retail: {formatRupiah(report.total_retail_valuation)}</span>
            </div>
          </div>

          {/* Total Stock Quantity & Registered Products */}
          <div className="col-span-4 bg-white rounded-2xl border border-zinc-200 p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block">
                Total Kuantitas Fisik Stok
              </span>
              <div className="text-2xl font-extrabold font-mono text-zinc-900 mt-1.5 tabular-nums">
                {report.total_stock_qty.toLocaleString("id-ID")}{" "}
                <span className="text-xs font-sans font-semibold text-zinc-500">
                  Unit Barang
                </span>
              </div>
            </div>
            <div className="pt-3 border-t border-zinc-100 text-[11px] text-zinc-500 flex justify-between font-mono">
              <span>{report.total_products} Jenis SKU Terdaftar</span>
              <span className="text-emerald-700 font-bold">
                {report.active_products} Produk Aktif
              </span>
            </div>
          </div>

          {/* Low Stock & Out of Stock Card */}
          <div className="col-span-4 bg-white rounded-2xl border border-zinc-200 p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block">
                Status Kritis &amp; Habis
              </span>
              <div className="flex items-baseline gap-4 mt-1.5">
                <div className="text-2xl font-extrabold font-mono text-amber-600 tabular-nums">
                  {report.low_stock_count}{" "}
                  <span className="text-xs font-sans font-semibold text-zinc-500">
                    Kritis (≤5)
                  </span>
                </div>
                <div className="text-2xl font-extrabold font-mono text-rose-600 tabular-nums">
                  {report.out_of_stock_count}{" "}
                  <span className="text-xs font-sans font-semibold text-zinc-500">
                    Habis (0)
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-zinc-100 text-[11px] text-zinc-500 flex justify-between">
              <span>Perlu pengadaan restock segera</span>
              <span className="text-amber-700 font-bold font-mono">
                {((report.low_stock_count / Math.max(1, report.total_products)) * 100).toFixed(0)}% Kritis
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Stock Movements Banner */}
      {report && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-emerald-950 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Boxes className="w-4 h-4 text-emerald-700" />
            Rekap Mutasi Stok Historis Keseluruhan
          </div>
          <div className="grid grid-cols-5 gap-3 text-xs">
            <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-2xs">
              <span className="text-zinc-500 text-[11px] block">Penambahan Stok (Restock)</span>
              <span className="font-mono font-bold text-sm text-emerald-700 tabular-nums">
                +{report.movements.restock_qty.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-2xs">
              <span className="text-zinc-500 text-[11px] block">Barang Terjual (Sales)</span>
              <span className="font-mono font-bold text-sm text-zinc-800 tabular-nums">
                -{report.movements.sold_qty.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-2xs">
              <span className="text-zinc-500 text-[11px] block">Barang Rusak (Damage)</span>
              <span className="font-mono font-bold text-sm text-amber-700 tabular-nums">
                -{report.movements.damage_qty.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-2xs">
              <span className="text-zinc-500 text-[11px] block">Barang Hilang (Loss)</span>
              <span className="font-mono font-bold text-sm text-rose-700 tabular-nums">
                -{report.movements.loss_qty.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-2xs">
              <span className="text-zinc-500 text-[11px] block">Koreksi Fisik (Correction)</span>
              <span
                className={`font-mono font-bold text-sm tabular-nums ${
                  report.movements.correction_delta >= 0
                    ? "text-teal-700"
                    : "text-rose-700"
                }`}
              >
                {report.movements.correction_delta >= 0 ? "+" : ""}
                {report.movements.correction_delta.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Searchable Valuation Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 font-bold text-sm text-zinc-900 flex items-center justify-between">
          <span>Daftar Nilai Stok Produk ({report?.items.length || 0})</span>
          <span className="text-xs text-zinc-400 font-normal">
            Valuasi HPP &times; Fisik Stok
          </span>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wider text-zinc-600 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4">Produk</th>
                <th className="py-3 px-4 text-center">Stok Fisik</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Harga Modal (HPP)</th>
                <th className="py-3 px-4 text-right">Harga Jual</th>
                <th className="py-3 px-4 text-right">Valuasi HPP</th>
                <th className="py-3 px-4 text-right">Valuasi Retail</th>
                <th className="py-3 px-4 text-right">Potensi Laba</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-500">
                    Memuat data inventaris...
                  </td>
                </tr>
              ) : !report || report.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-500">
                    Tidak ada produk yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                report.items.map((it) => (
                  <tr
                    key={it.product_id}
                    className={`hover:bg-zinc-50/80 transition-colors ${
                      it.stock <= 0
                        ? "bg-rose-50/30"
                        : it.is_low_stock
                        ? "bg-amber-50/30"
                        : ""
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-zinc-900">
                        {it.product_name}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400">
                        SKU: {it.sku} • {it.category_name}
                        {it.barcode ? ` • ${it.barcode}` : ""}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-zinc-800 tabular-nums">
                      {it.stock} {it.unit}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                          it.stock <= 0
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : it.is_low_stock
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        {it.stock <= 0
                          ? "HABIS"
                          : it.is_low_stock
                          ? "KRITIS"
                          : "AMAN"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-600">
                      {formatRupiah(it.cost_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-800">
                      {formatRupiah(it.selling_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-zinc-900">
                      {formatRupiah(it.total_cost_valuation)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-700">
                      {formatRupiah(it.total_retail_valuation)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-emerald-700">
                      {formatRupiah(it.potential_profit)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Thermal Preview Modal */}
      {showThermalModal && report && (
        <ReportThermalModal
          title="Laporan Valuasi Inventaris & Stok"
          reportText={renderStockThermalText(report, storeName)}
          onClose={() => setShowThermalModal(false)}
        />
      )}
    </div>
  );
};
