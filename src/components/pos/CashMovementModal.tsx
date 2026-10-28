import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
} from "lucide-react";
import { ipc } from "../../services/ipc";
import type { CashierShift, CashMovement } from "../../types/domain";
import { formatRupiah } from "../../utils/posCalculator";

interface CashMovementModalProps {
  isOpen: boolean;
  activeShift: CashierShift;
  onClose: () => void;
  onMovementRecorded: (movement: CashMovement) => void;
}

const PRESET_REASONS = {
  CASH_IN: [
    "Tambah Modal Uang Tukar",
    "Penerimaan Titipan Kas",
    "Koreksi Kas Masuk",
  ],
  CASH_OUT: [
    "Beli Kantong Kresek / Plastik",
    "Beli Perlengkapan Toko / Lakban",
    "Biaya Konsumsi / Air Galon",
    "Setor Sebagian Kas ke Brankas",
  ],
};

export const CashMovementModal: React.FC<CashMovementModalProps> = ({
  isOpen,
  activeShift,
  onClose,
  onMovementRecorded,
}) => {
  const [movementType, setMovementType] = useState<"CASH_IN" | "CASH_OUT">(
    "CASH_IN"
  );
  const [amount, setAmount] = useState<number>(0);
  const [amountRaw, setAmountRaw] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Perkiraan kas di laci saat ini untuk pencegahan insolvensi
  const currentDrawerCash =
    activeShift.opening_float +
    activeShift.cash_sales_total +
    activeShift.cash_in_total -
    activeShift.cash_out_total;

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setAmount(0);
      setAmountRaw("");
      setReason("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRawChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    setAmountRaw(digits);
    const parsed = parseInt(digits, 10);
    setAmount(Number.isNaN(parsed) ? 0 : parsed);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (amount <= 0) {
      setError("Nominal mutasi kas harus lebih besar dari Rp 0.");
      return;
    }
    if (!reason.trim()) {
      setError("Alasan mutasi kas wajib diisi.");
      return;
    }
    if (movementType === "CASH_OUT" && amount > currentDrawerCash) {
      setError(
        `Kas laci tidak mencukupi! Saldo saat ini: ${formatRupiah(currentDrawerCash)}.`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const movement = await ipc.recordCashMovement({
        shift_id: activeShift.id,
        movement_type: movementType,
        amount,
        reason: reason.trim(),
      });
      onMovementRecorded(movement);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan mutasi kas.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-200/90 overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
              <Banknote className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">
                Mutasi Kas Laci (F7)
              </h2>
              <p className="text-[11px] text-teal-200/90">
                Pencatatan kas masuk / kas keluar kasir
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-medium">{error}</div>
            </div>
          )}

          {/* Tipe Mutasi Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMovementType("CASH_IN");
                setReason("");
              }}
              className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                movementType === "CASH_IN"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Kas Masuk (IN)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMovementType("CASH_OUT");
                setReason("");
              }}
              className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                movementType === "CASH_OUT"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Kas Keluar (OUT)</span>
            </button>
          </div>

          {/* Nominal Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Nominal {movementType === "CASH_IN" ? "Kas Masuk" : "Kas Keluar"}
              </label>
              <span className="text-[11px] text-zinc-500">
                Saldo laci: <strong>{formatRupiah(currentDrawerCash)}</strong>
              </span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 font-bold text-sm">
                Rp
              </div>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                required
                value={amount ? formatRupiah(amount, false) : amountRaw}
                onChange={(e) => handleRawChange(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-lg font-mono font-extrabold text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all shadow-inner"
                placeholder="0"
              />
            </div>
          </div>

          {/* Preset Reasons */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
              Pilihan Alasan Cepat
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_REASONS[movementType].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`py-1 px-2.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                    reason === preset
                      ? "bg-teal-50 text-teal-800 border-teal-300 shadow-2xs font-bold"
                      : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Input Alasan */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
              Keterangan Alasan
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Beli kantong kresek ukuran 15"
              className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
            />
          </div>

          <div className="pt-2 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl border border-zinc-200 transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex-1 py-2.5 px-4 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                movementType === "CASH_IN"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {submitting ? (
                <span>Menyimpan...</span>
              ) : (
                <span>
                  Simpan {movementType === "CASH_IN" ? "Kas Masuk" : "Kas Keluar"} (Enter)
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};