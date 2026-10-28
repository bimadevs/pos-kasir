import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  DollarSign,
  FileText,
  Printer,
} from "lucide-react";
import { ipc } from "../../services/ipc";
import type { PrintOutcome, ShiftReportData } from "../../types/domain";
import { formatDateTimeId, formatRupiah } from "../../utils/posCalculator";

interface ShiftReportPreviewModalProps {
  report: ShiftReportData | null;
  outcome?: PrintOutcome | null;
  onClose: () => void;
}

export function renderFallbackShiftReportText(
  report: ShiftReportData,
  cols = 32
): string {
  const divider = "-".repeat(cols);
  const doubleDivider = "=".repeat(cols);
  const isZ = report.shift.status === "CLOSED";
  const title = isZ ? "LAPORAN Z (TUTUP SHIFT)" : "LAPORAN X (SEMENTARA)";

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
  lines.push(center(report.store_name.toUpperCase()));
  lines.push(center(title));
  lines.push(doubleDivider);

  lines.push(leftRight("Terminal", report.shift.terminal_name));
  lines.push(leftRight("Kasir", report.shift.cashier_name_snapshot));
  lines.push(leftRight("Waktu Buka", formatDateTimeId(report.shift.opened_at)));
  if (isZ && report.shift.closed_at) {
    lines.push(leftRight("Waktu Tutup", formatDateTimeId(report.shift.closed_at)));
  } else {
    lines.push(leftRight("Waktu Cetak", formatDateTimeId(new Date().toISOString())));
  }
  lines.push(divider);

  lines.push(leftRight("Modal Awal (Float)", `Rp ${formatRupiah(report.shift.opening_float, false)}`));
  lines.push(leftRight("Penjualan Tunai Net", `Rp ${formatRupiah(report.total_cash_sales, false)}`));
  lines.push(leftRight("Total Kas Masuk", `Rp ${formatRupiah(report.total_cash_in, false)}`));
  lines.push(leftRight("Total Kas Keluar", `Rp ${formatRupiah(report.total_cash_out, false)}`));
  lines.push(divider);

  if (isZ) {
    lines.push(leftRight("Kas Sistem Diharapkan", `Rp ${formatRupiah(report.expected_cash, false)}`));
    lines.push(leftRight("Kas Fisik Dihitung", `Rp ${formatRupiah(report.shift.actual_closing_cash ?? 0, false)}`));
    lines.push(divider);
    const disc = report.shift.cash_discrepancy ?? 0;
    lines.push(leftRight("Selisih Kas Fisik", `Rp ${formatRupiah(disc, false)}`));
    lines.push(leftRight("Status Selisih", disc === 0 ? "PAS / SESUAI" : disc > 0 ? "LEBIH" : "KURANG"));
  } else {
    lines.push(leftRight("Saldo Kas Fisik Laci", `Rp ${formatRupiah(report.expected_cash, false)}`));
  }

  lines.push(divider);
  lines.push(leftRight("Total Transaksi", String(report.total_transactions)));
  lines.push(leftRight("Transaksi Void", `${report.void_count} (Rp ${formatRupiah(report.void_total, false)})`));
  lines.push(doubleDivider);

  if (isZ) {
    if (report.shift.notes?.trim()) {
      lines.push(`Catatan: ${report.shift.notes.trim()}`);
      lines.push(doubleDivider);
    }
    lines.push(center("[STATUS SHIFT: CLOSED]"));
  } else {
    lines.push(center("[STATUS SHIFT: MASIH AKTIF]"));
  }
  lines.push(doubleDivider);

  return lines.join("\n");
}

export const ShiftReportPreviewModal: React.FC<ShiftReportPreviewModalProps> = ({
  report,
  outcome,
  onClose,
}) => {
  const [printing, setPrinting] = useState<boolean>(false);
  const [kickSuccess, setKickSuccess] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!report) return null;

  const isZ = report.shift.status === "CLOSED";
  const previewText =
    outcome?.rendered_text ?? renderFallbackShiftReportText(report, 32);

  const handlePrintAgain = async () => {
    setPrinting(true);
    try {
      await ipc.printShiftReport(report);
    } catch (err) {
      console.error("Gagal mencetak ulang laporan shift:", err);
    } finally {
      setPrinting(false);
    }
  };

  const handleKickDrawer = async () => {
    try {
      await ipc.kickCashDrawer();
      setKickSuccess(true);
      setTimeout(() => setKickSuccess(false), 2000);
    } catch (err) {
      console.error("Gagal membuka laci:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-zinc-200/90 overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-zinc-800 via-zinc-900 to-black text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
              <FileText className="w-5 h-5 text-zinc-300" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">
                Pratinjau Struk {isZ ? "Laporan Z (Tutup Shift)" : "Laporan X (Audit Sementara)"}
              </h2>
              <p className="text-[11px] text-zinc-400">
                Format ESC/POS 58mm/80mm Thermal Printer
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Status Badge */}
        {outcome && (
          <div className="px-6 py-2.5 bg-zinc-100 border-b border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Printer: <strong>{outcome.printer_name}</strong></span>
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              Lebar: {outcome.paper_width}mm
            </span>
          </div>
        )}

        {/* Paper Container */}
        <div className="p-6 overflow-y-auto flex-1 bg-zinc-200/50 flex justify-center">
          <div className="w-full max-w-sm bg-white p-5 rounded-xl shadow-lg border border-zinc-300 font-mono text-xs leading-relaxed text-zinc-900 whitespace-pre selection:bg-teal-200">
            {previewText}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleKickDrawer}
            className={`py-2.5 px-3.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              kickSuccess
                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>{kickSuccess ? "Laci Terbuka!" : "Buka Laci (RJ11)"}</span>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={printing}
              onClick={handlePrintAgain}
              className="py-2.5 px-4 bg-zinc-800 hover:bg-zinc-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>{printing ? "Mencetak..." : "Cetak Struk"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer"
            >
              Tutup (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};