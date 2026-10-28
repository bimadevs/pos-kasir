import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Printer,
  Sparkles,
  Store,
} from "lucide-react";
import { useTerminal } from "../../context/TerminalContext";
import { ipc } from "../../services/ipc";
import type { CashierShift, ShiftReportData } from "../../types/domain";
import { formatDateTimeId, formatRupiah } from "../../utils/posCalculator";

interface ShiftCloseModalProps {
  isOpen: boolean;
  activeShift: CashierShift;
  onClose: () => void;
  onShiftClosed: (closedShift: CashierShift, report: ShiftReportData) => void;
}

export const ShiftCloseModal: React.FC<ShiftCloseModalProps> = ({
  isOpen,
  activeShift,
  onClose,
  onShiftClosed,
}) => {
  const { openShiftReportPreview } = useTerminal();
  const [actualCash, setActualCash] = useState<number>(0);
  const [actualRaw, setActualRaw] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Result state after shift closed
  const [closedResult, setClosedResult] = useState<{
    shift: CashierShift;
    report: ShiftReportData;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setActualCash(0);
      setActualRaw("");
      setNotes("");
      setClosedResult(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRawChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    setActualRaw(digits);
    const parsed = parseInt(digits, 10);
    setActualCash(Number.isNaN(parsed) ? 0 : parsed);
  };

  const handleCloseShift = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (actualCash < 0) {
      setError("Kas fisik tidak boleh bernilai negatif.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const closed = await ipc.closeShift({
        shift_id: activeShift.id,
        actual_closing_cash: actualCash,
        notes: notes.trim() ? notes.trim() : null,
      });

      // Ambil laporan shift final (Z-Report)
      const report = await ipc.getShiftXReport(activeShift.id);

      // Picu cetak fisik dan kick drawer RJ11 secara otomatis
      try {
        const printOutcome = await ipc.printShiftReport(report);
        if (printOutcome.show_preview_modal) {
          openShiftReportPreview(report, printOutcome);
        }
      } catch (printErr) {
        console.warn("Gagal mencetak struk Z-Report otomatis:", printErr);
      }

      setClosedResult({ shift: closed, report });
      onShiftClosed(closed, report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menutup shift kasir.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-zinc-200/90 overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-zinc-800 via-zinc-900 to-black text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
              <Banknote className="w-5 h-5 text-zinc-300" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">
                Tutup Shift Kasir (Z-Report)
              </h2>
              <p className="text-xs text-zinc-400">
                Rekap kas fisik laci (Blind Close) &amp; cetak laporan penutupan
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

        {/* Info Shift */}
        <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-zinc-400" />
            <span>Terminal: <strong>{activeShift.terminal_name}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>Dibuka: {formatDateTimeId(activeShift.opened_at)}</span>
          </div>
        </div>

        {closedResult ? (
          /* Tampilan Rekonsiliasi Sukses */
          <div className="p-6 space-y-5 animate-in fade-in">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-900">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <div className="font-extrabold text-sm">Shift Berhasil Ditutup!</div>
                <div className="text-xs text-emerald-700 mt-0.5">
                  Laporan Z-Report telah diproses dan laci kas otomatis dibuka.
                </div>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200/90 space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-zinc-600">
                <span>Modal Awal (Float)</span>
                <span className="font-mono font-semibold">{formatRupiah(activeShift.opening_float)}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-600">
                <span>Kas Sistem Diharapkan</span>
                <span className="font-mono font-bold text-zinc-900">
                  {formatRupiah(closedResult.shift.expected_closing_cash ?? 0)}
                </span>
              </div>
              <div className="flex justify-between items-center text-zinc-600">
                <span>Kas Fisik Dihitung (Aktual)</span>
                <span className="font-mono font-bold text-zinc-900">
                  {formatRupiah(closedResult.shift.actual_closing_cash ?? 0)}
                </span>
              </div>
              <div className="border-t border-zinc-200 pt-2 flex justify-between items-center">
                <span className="font-bold text-zinc-700">Selisih Kas Laci</span>
                <div className="text-right">
                  <span
                    className={`font-mono font-extrabold text-sm ${
                      (closedResult.shift.cash_discrepancy ?? 0) === 0
                        ? "text-emerald-600"
                        : (closedResult.shift.cash_discrepancy ?? 0) > 0
                        ? "text-blue-600"
                        : "text-rose-600"
                    }`}
                  >
                    {formatRupiah(closedResult.shift.cash_discrepancy ?? 0)}
                  </span>
                  <span className="ml-1 text-[11px] font-bold text-zinc-500">
                    ({(closedResult.shift.cash_discrepancy ?? 0) === 0
                      ? "SESUAI"
                      : (closedResult.shift.cash_discrepancy ?? 0) > 0
                      ? "LEBIH"
                      : "KURANG"})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => openShiftReportPreview(closedResult.report)}
                className="flex-1 py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl border border-zinc-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4 text-zinc-600" />
                <span>Lihat / Cetak Ulang Z-Report</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-6 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Selesai (Esc)
              </button>
            </div>
          </div>
        ) : (
          /* Form Input Blind Close */
          <form onSubmit={handleCloseShift} className="p-6 space-y-5">
            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="font-medium">{error}</div>
              </div>
            )}

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <Banknote className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Prinsip Blind Close:</strong> Hitung seluruh uang kertas &amp; koin fisik di laci tunai Anda saat ini, lalu masukkan totalnya. Nominal sistem akan direkonsiliasi otomatis setelah ditutup.
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                Total Uang Fisik di Laci Tunai
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 font-bold text-sm">
                  Rp
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  required
                  value={actualCash ? formatRupiah(actualCash, false) : actualRaw}
                  onChange={(e) => handleRawChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCloseShift();
                    }
                  }}
                  className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-300 rounded-xl text-xl font-mono font-extrabold text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all shadow-inner"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                Catatan Penutupan Shift <span className="text-zinc-400 font-normal">(Opsional)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Tutup shift lancar, uang koin sisa 500 lengkap"
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
              />
            </div>

            <div className="pt-2 flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl border border-zinc-200 transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 px-4 bg-zinc-900 hover:bg-black text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <span>Menutup Shift...</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-zinc-300" />
                    <span>Tutup Shift &amp; Cetak Laporan Z (Enter)</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};