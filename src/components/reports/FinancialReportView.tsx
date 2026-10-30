import React, { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Download,
  Printer,
  Receipt,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useTerminal } from "../../context/TerminalContext";
import { ipc } from "../../services/ipc";
import type { FinancialReport } from "../../types/domain";
import {
  buildFinancialReportWorkbook,
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

function renderFinancialThermalText(
  report: FinancialReport,
  storeName: string,
  totalCols = 32,
  leftMarginChars = 0
): string {
  const marginCount = Math.min(
    Math.max(0, leftMarginChars),
    Math.max(0, totalCols - 16)
  );
  const cols = Math.max(20, totalCols - marginCount);
  const margin = " ".repeat(marginCount);
  const divider = margin + "-".repeat(cols);
  const doubleDivider = margin + "=".repeat(cols);
  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((cols - text.length) / 2));
    return margin + " ".repeat(pad) + text;
  };
  const leftRight = (left: string, right: string) => {
    if (right.length >= cols) return margin + right.slice(0, cols);
    const maxLeft = cols - right.length - 1;
    const truncatedLeft = left.slice(0, maxLeft);
    const space = Math.max(1, cols - truncatedLeft.length - right.length);
    return margin + truncatedLeft + " ".repeat(space) + right;
  };

  const lines: string[] = [];
  lines.push(doubleDivider);
  lines.push(center(storeName.toUpperCase()));
  lines.push(center("LAPORAN ARUS KAS & KEUANGAN"));
  lines.push(doubleDivider);
  lines.push(leftRight("Periode", `${report.start_date} sd ${report.end_date}`));
  lines.push(leftRight("Dicetak", new Date().toLocaleDateString("id-ID")));
  lines.push(divider);
  lines.push(leftRight("Penjualan Kotor", formatRupiah(report.gross_sales, false)));
  lines.push(leftRight("Total Diskon", `-${formatRupiah(report.total_discount, false)}`));
  lines.push(leftRight("Penjualan Bersih", formatRupiah(report.net_sales, false)));
  lines.push(leftRight("Total Void", formatRupiah(report.total_void_amount, false)));
  lines.push(divider);
  lines.push(leftRight("Kas Penjualan", formatRupiah(report.cash_sales, false)));
  lines.push(leftRight("Kas Masuk Ops", `+${formatRupiah(report.cash_in_amount, false)}`));
  lines.push(leftRight("Kas Keluar Ops", `-${formatRupiah(report.cash_out_amount, false)}`));
  lines.push(leftRight("Selisih Shift", formatRupiah(report.total_shift_discrepancy, false)));
  lines.push(doubleDivider);
  lines.push(leftRight("ARUS KAS BERSIH", `Rp ${formatRupiah(report.net_cash_flow, false)}`));
  lines.push(doubleDivider);
  lines.push(leftRight("Tx Sukses", String(report.completed_sales_count)));
  lines.push(leftRight("Tx Void", String(report.voided_sales_count)));
  lines.push(doubleDivider);
  return lines.join("\n");
}

export const FinancialReportView: React.FC = () => {
  const { terminalStatus } = useTerminal();
  const printerCfg = terminalStatus?.config.printer;
  const paperWidth = printerCfg?.paper_width === 80 ? 80 : 58;
  const leftMarginChars = printerCfg?.left_margin_chars ?? 0;
  const printerName =
    printerCfg?.printer_name ||
    "Mudita Mart Virtual Thermal Printer (Simulasi)";
  const cols = paperWidth === 80 ? 48 : 32;

  const todayStr = todayLocalIsoDate();
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showThermalModal, setShowThermalModal] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipc.getFinancialReport({
        start_date: startDate,
        end_date: endDate,
      });
      setReport(res);
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal memuat laporan keuangan: ${
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
      const wb = buildFinancialReportWorkbook(report, storeName);
      await saveWorkbookAsFile(
        wb,
        `laporan-keuangan-arus-kas-${startDate}-sd-${endDate}.xlsx`
      );
      setFeedback({
        type: "success",
        message: "Laporan keuangan berhasil diekspor ke Excel.",
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
            title="Pratinjau cetak struk thermal 58mm/80mm"
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
            title="Ekspor laporan keuangan ke format Excel (.xlsx)"
          >
            <Download className="w-4 h-4" />
            Ekspor Excel
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      {report && (
        <div className="grid grid-cols-12 gap-4">
          {/* Net Cash Flow - Highlight Hero Card */}
          <div className="col-span-4 bg-teal-700 text-white rounded-2xl p-5 shadow-xs border border-teal-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-100 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-teal-200" />
                  Arus Kas Bersih (Net Cash Flow)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-teal-800/80 text-teal-200 text-[10px] font-mono font-bold">
                  Kas Masuk − Kas Keluar
                </span>
              </div>
              <div className="text-3xl font-black font-mono text-amber-300 mt-2 tabular-nums">
                {formatRupiah(report.net_cash_flow)}
              </div>
            </div>
            <div className="pt-3 border-t border-teal-600/70 text-xs flex justify-between text-teal-100/90 font-mono">
              <span>Kas Masuk Ops: +{formatRupiah(report.cash_in_amount)}</span>
              <span>Kas Keluar Ops: -{formatRupiah(report.cash_out_amount)}</span>
            </div>
          </div>

          {/* Net Sales */}
          <div className="col-span-4 bg-white rounded-2xl border border-zinc-200 p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block">
                Penjualan Bersih (Net Sales)
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

          {/* Cash Sales in Till */}
          <div className="col-span-4 bg-white rounded-2xl border border-zinc-200 p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block">
                Kas Penjualan Laci &amp; Selisih Shift
              </span>
              <div className="text-2xl font-extrabold font-mono text-emerald-700 mt-1.5 tabular-nums">
                {formatRupiah(report.cash_sales)}
              </div>
            </div>
            <div className="pt-3 border-t border-zinc-100 text-[11px] text-zinc-500 flex justify-between font-mono">
              <span>
                Selisih Shift:{" "}
                <span
                  className={
                    report.total_shift_discrepancy < 0
                      ? "text-rose-600 font-bold"
                      : "text-emerald-700 font-bold"
                  }
                >
                  {formatRupiah(report.total_shift_discrepancy)}
                </span>
              </span>
              <span className="text-rose-600">
                Void: {formatRupiah(report.total_void_amount)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Daily Breakdown Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 font-bold text-sm text-zinc-900 flex items-center justify-between">
          <span>Rincian Arus Kas Harian ({report?.daily_summaries.length || 0} Hari)</span>
          <span className="text-xs text-zinc-500 font-normal">
            Total {report?.completed_sales_count || 0} Transaksi Berhasil •{" "}
            {report?.voided_sales_count || 0} Void
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4 text-center">Tx Selesai</th>
                <th className="py-3 px-4 text-center">Tx Void</th>
                <th className="py-3 px-4 text-right">Penjualan Kotor</th>
                <th className="py-3 px-4 text-right">Diskon</th>
                <th className="py-3 px-4 text-right">Penjualan Bersih</th>
                <th className="py-3 px-4 text-right">Kas Penjualan</th>
                <th className="py-3 px-4 text-right">Kas Masuk Ops</th>
                <th className="py-3 px-4 text-right">Kas Keluar Ops</th>
                <th className="py-3 px-4 text-right">Selisih Shift</th>
                <th className="py-3 px-4 text-right">Arus Kas Bersih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-zinc-500">
                    Memuat rincian arus kas...
                  </td>
                </tr>
              ) : !report || report.daily_summaries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-zinc-500">
                    Belum ada transaksi pada rentang tanggal ini.
                  </td>
                </tr>
              ) : (
                report.daily_summaries.map((day) => (
                  <tr
                    key={day.date}
                    className="hover:bg-zinc-50/80 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-zinc-900">
                      {day.date}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-semibold text-zinc-700">
                      {day.completed_count}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-rose-600 font-semibold">
                      {day.voided_count > 0 ? day.voided_count : "-"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-600">
                      {formatRupiah(day.gross_sales)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-600">
                      {day.total_discount > 0
                        ? `-${formatRupiah(day.total_discount)}`
                        : "-"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-zinc-900">
                      {formatRupiah(day.net_sales)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {formatRupiah(day.cash_sales)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-teal-700">
                      {day.cash_in > 0 ? `+${formatRupiah(day.cash_in)}` : "-"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-700">
                      {day.cash_out > 0 ? `-${formatRupiah(day.cash_out)}` : "-"}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                        day.shift_discrepancy < 0
                          ? "text-rose-600"
                          : day.shift_discrepancy > 0
                          ? "text-emerald-700"
                          : "text-zinc-500"
                      }`}
                    >
                      {formatRupiah(day.shift_discrepancy)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black tabular-nums text-teal-800 bg-teal-50/50">
                      {formatRupiah(day.net_cash)}
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
          title={`Laporan Keuangan (${startDate} sd ${endDate})`}
          reportText={renderFinancialThermalText(
            report,
            storeName,
            cols,
            leftMarginChars
          )}
          paperWidth={paperWidth}
          leftMarginChars={leftMarginChars}
          printerName={printerName}
          onClose={() => setShowThermalModal(false)}
        />
      )}
    </div>
  );
};
