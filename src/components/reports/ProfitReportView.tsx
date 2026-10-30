import React, { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Download,
  PieChart,
  Printer,
  Receipt,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useTerminal } from "../../context/TerminalContext";
import { ipc } from "../../services/ipc";
import type { ProfitReport } from "../../types/domain";
import {
  buildProfitReportWorkbook,
  saveWorkbookAsFile,
} from "../../utils/excelService";
import { formatRupiah, todayLocalIsoDate } from "../../utils/posCalculator";
import { ReportThermalModal } from "./ReportThermalModal";

function getLocalDateStr(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderProfitThermalText(
  report: ProfitReport,
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
  lines.push(center("LAPORAN LABA KOTOR (PROFIT)"));
  lines.push(doubleDivider);
  lines.push(leftRight("Periode", `${report.start_date} sd ${report.end_date}`));
  lines.push(leftRight("Dicetak", new Date().toLocaleDateString("id-ID")));
  lines.push(divider);
  lines.push(leftRight("Penjualan Kotor", formatRupiah(report.gross_sales, false)));
  lines.push(leftRight("Total Diskon", `-${formatRupiah(report.total_discount, false)}`));
  lines.push(leftRight("Penjualan Bersih", formatRupiah(report.net_sales, false)));
  lines.push(leftRight("Total Modal HPP", formatRupiah(report.total_cogs, false)));
  lines.push(doubleDivider);
  lines.push(leftRight("LABA KOTOR", `Rp ${formatRupiah(report.gross_profit, false)}`));
  lines.push(leftRight("MARGIN LABA", `${report.profit_margin_pct.toFixed(1)}%`));
  lines.push(doubleDivider);

  if (report.category_profits.length > 0) {
    lines.push(center("-- LABA PER KATEGORI --"));
    report.category_profits.forEach((cat) => {
      lines.push(
        leftRight(
          cat.category_name,
          `Rp ${formatRupiah(cat.gross_profit, false)} (${cat.profit_margin_pct.toFixed(0)}%)`
        )
      );
    });
    lines.push(divider);
  }

  if (report.product_profits.length > 0) {
    lines.push(center("-- TOP 5 PRODUK PROFIT --"));
    report.product_profits.slice(0, 5).forEach((p, idx) => {
      lines.push(`${idx + 1}. ${p.product_name}`);
      lines.push(
        leftRight(
          `   ${p.total_qty_sold} ${p.unit}`,
          `Laba: Rp ${formatRupiah(p.gross_profit, false)}`
        )
      );
    });
    lines.push(doubleDivider);
  }

  return lines.join("\n");
}

export const ProfitReportView: React.FC = () => {
  const { terminalStatus } = useTerminal();
  const todayStr = todayLocalIsoDate();
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showThermalModal, setShowThermalModal] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipc.getProfitReport({
        start_date: startDate,
        end_date: endDate,
      });
      setReport(res);
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal memuat laporan laba kotor: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const applyPreset = (preset: "TODAY" | "YESTERDAY" | "7DAYS" | "MONTH") => {
    const today = getLocalDateStr(0);
    if (preset === "TODAY") {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === "YESTERDAY") {
      const y = getLocalDateStr(-1);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === "7DAYS") {
      setStartDate(getLocalDateStr(-6));
      setEndDate(today);
    } else if (preset === "MONTH") {
      const now = new Date();
      const firstOfMonth = `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}-01`;
      setStartDate(firstOfMonth);
      setEndDate(today);
    }
  };

  const handleExportExcel = async () => {
    if (!report) return;
    try {
      const storeName = terminalStatus?.store_name || "Mudita Mart";
      const wb = buildProfitReportWorkbook(report, storeName);
      await saveWorkbookAsFile(
        wb,
        `laporan-laba-kotor-${startDate}-sd-${endDate}.xlsx`
      );
      setFeedback({
        type: "success",
        message: "Laporan laba kotor berhasil diekspor ke Excel.",
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
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <div>
            <label className="block font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Dari Tanggal
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-zinc-300 rounded-xl font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
            />
          </div>
          <div>
            <label className="block font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-zinc-300 rounded-xl font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
            />
          </div>

          {/* Date Presets */}
          <div className="flex items-center gap-1.5 pt-1">
            <Calendar className="w-4 h-4 text-zinc-400 mr-0.5" />
            <button
              type="button"
              onClick={() => applyPreset("TODAY")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 font-bold text-zinc-700 transition-all cursor-pointer"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => applyPreset("YESTERDAY")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 font-bold text-zinc-700 transition-all cursor-pointer"
            >
              Kemarin
            </button>
            <button
              type="button"
              onClick={() => applyPreset("7DAYS")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 font-bold text-zinc-700 transition-all cursor-pointer"
            >
              7 Hari
            </button>
            <button
              type="button"
              onClick={() => applyPreset("MONTH")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 font-bold text-zinc-700 transition-all cursor-pointer"
            >
              Bulan Ini
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-300 hover:bg-zinc-50 text-zinc-600 transition-colors cursor-pointer"
            title="Segarkan data"
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
            title="Pratinjau cetak ringkasan laba kotor thermal"
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
            title="Ekspor laporan laba kotor ke format Excel (.xlsx)"
          >
            <Download className="w-4 h-4" />
            Ekspor Excel
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      {report && (
        <div className="grid grid-cols-12 gap-4">
          {/* Gross Profit Hero Card */}
          <div className="col-span-4 bg-emerald-700 text-white rounded-2xl p-5 shadow-xs border border-emerald-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-amber-300" />
                  Laba Kotor (Gross Profit)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-800/80 text-amber-300 text-[10px] font-mono font-bold">
                  BR-03
                </span>
              </div>
              <div className="text-3xl font-black font-mono text-amber-300 mt-2 tabular-nums">
                {formatRupiah(report.gross_profit)}
              </div>
            </div>
            <div className="pt-3 border-t border-emerald-600/70 text-xs flex justify-between text-emerald-100/90 font-mono">
              <span>Penjualan Bersih − Total HPP</span>
              <span className="font-bold text-white">
                Margin: {report.profit_margin_pct.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Net Sales */}
          <div className="col-span-4 bg-white rounded-2xl border border-zinc-200 p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block">
                Penjualan Bersih (Net Revenue)
              </span>
              <div className="text-2xl font-extrabold font-mono text-zinc-900 mt-1.5 tabular-nums">
                {formatRupiah(report.net_sales)}
              </div>
            </div>
            <div className="pt-3 border-t border-zinc-100 text-[11px] text-zinc-500 flex justify-between font-mono">
              <span>Kotor: {formatRupiah(report.gross_sales)}</span>
              <span className="text-amber-600 font-bold">
                Diskon: -{formatRupiah(report.total_discount)}
              </span>
            </div>
          </div>

          {/* Total COGS / HPP */}
          <div className="col-span-4 bg-white rounded-2xl border border-zinc-200 p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block">
                Total Modal Barang Terjual (COGS / HPP)
              </span>
              <div className="text-2xl font-extrabold font-mono text-zinc-800 mt-1.5 tabular-nums">
                {formatRupiah(report.total_cogs)}
              </div>
            </div>
            <div className="pt-3 border-t border-zinc-100 text-[11px] text-zinc-500 flex justify-between font-mono">
              <span>Berdasarkan snapshot cost_price</span>
              <span className="text-zinc-600">
                Porsi Modal:{" "}
                {report.net_sales > 0
                  ? ((report.total_cogs / report.net_sales) * 100).toFixed(1)
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2-Column Tables: Category Profitability & Top 50 Profitable Products */}
      {report && (
        <div className="grid grid-cols-12 gap-5">
          {/* Category Profitability Table */}
          <div className="col-span-5 bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-200 font-bold text-sm text-zinc-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-teal-600" />
                Laba Kotor per Kategori ({report.category_profits.length})
              </span>
            </div>
            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase text-zinc-500 tracking-wider sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Kategori</th>
                    <th className="py-2.5 px-4 text-right">Terjual</th>
                    <th className="py-2.5 px-4 text-right">Laba Kotor</th>
                    <th className="py-2.5 px-4 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {report.category_profits.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-zinc-400">
                        Belum ada data transaksi pada kategori manapun.
                      </td>
                    </tr>
                  ) : (
                    report.category_profits.map((cat) => (
                      <tr
                        key={cat.category_name}
                        className="hover:bg-zinc-50/80 transition-colors"
                      >
                        <td className="py-2.5 px-4 font-bold text-zinc-900">
                          {cat.category_name}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-zinc-700 tabular-nums">
                          {cat.total_qty_sold}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatRupiah(cat.gross_profit)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-teal-800">
                          {cat.profit_margin_pct.toFixed(1)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 50 Profitable Products Table */}
          <div className="col-span-7 bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-200 font-bold text-sm text-zinc-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                50 Produk Paling Menguntungkan
              </span>
              <span className="text-xs text-zinc-400 font-normal">
                Diurutkan berdasarkan Laba Kotor tertinggi
              </span>
            </div>
            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase text-zinc-500 tracking-wider sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Produk</th>
                    <th className="py-2.5 px-4 text-right">Terjual</th>
                    <th className="py-2.5 px-4 text-right">Penjualan</th>
                    <th className="py-2.5 px-4 text-right">HPP</th>
                    <th className="py-2.5 px-4 text-right">Laba Kotor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {report.product_profits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-400">
                        Belum ada data penjualan produk.
                      </td>
                    </tr>
                  ) : (
                    report.product_profits.map((p, idx) => (
                      <tr
                        key={p.product_id}
                        className="hover:bg-zinc-50/80 transition-colors"
                      >
                        <td className="py-2 px-4">
                          <div className="font-bold text-zinc-900 truncate max-w-[200px]">
                            {idx + 1}. {p.product_name}
                          </div>
                          <div className="font-mono text-[10px] text-zinc-400">
                            SKU: {p.sku}
                          </div>
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-zinc-700 tabular-nums">
                          {p.total_qty_sold} {p.unit}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-zinc-700 tabular-nums">
                          {formatRupiah(p.net_revenue)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-zinc-500 tabular-nums">
                          {formatRupiah(p.total_cost)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatRupiah(p.gross_profit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Preview Modal */}
      {showThermalModal && report && (
        <ReportThermalModal
          title={`Laporan Laba Kotor (${startDate} sd ${endDate})`}
          reportText={renderProfitThermalText(report, storeName)}
          onClose={() => setShowThermalModal(false)}
        />
      )}
    </div>
  );
};
