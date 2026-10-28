import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Banknote, Sparkles, Store } from "lucide-react";
import { ipc } from "../../services/ipc";
import type { CashierShift } from "../../types/domain";
import { formatRupiah } from "../../utils/posCalculator";

interface ShiftOpenModalProps {
  isOpen: boolean;
  isBarrier?: boolean;
  cashierName: string;
  terminalName: string;
  onShiftOpened: (shift: CashierShift) => void;
  onClose?: () => void;
}

const PRESET_FLOATS = [50_000, 100_000, 200_000, 500_000];

export const ShiftOpenModal: React.FC<ShiftOpenModalProps> = ({
  isOpen,
  isBarrier = true,
  cashierName,
  terminalName,
  onShiftOpened,
  onClose,
}) => {
  const [floatAmount, setFloatAmount] = useState<number>(100_000);
  const [floatRaw, setFloatRaw] = useState<string>("100000");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setFloatAmount(100_000);
      setFloatRaw("100000");
      setNotes("");
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRawChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    setFloatRaw(digits);
    const parsed = parseInt(digits, 10);
    setFloatAmount(Number.isNaN(parsed) ? 0 : parsed);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (floatAmount < 0) {
      setError("Modal awal kas tidak boleh bernilai negatif.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const shift = await ipc.openShift({
        opening_float: floatAmount,
        notes: notes.trim() ? notes.trim() : null,
      });
      onShiftOpened(shift);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuka shift kasir.");
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
        <div className="px-6 py-5 bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
              <Banknote className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">
                Buka Shift Kasir Baru
              </h2>
              <p className="text-xs text-teal-200/90">
                Input modal kas awal (Float) sebelum melayani pelanggan
              </p>
            </div>
          </div>
          {!isBarrier && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-white/70 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Info Terminal & Kasir */}
        <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-zinc-400" />
            <span>Terminal: <strong>{terminalName}</strong></span>
          </div>
          <div>
            Kasir: <strong>{cashierName}</strong>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-medium">{error}</div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
              Modal Awal Kas Laci (Shift Float)
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
                value={floatAmount ? formatRupiah(floatAmount, false) : floatRaw}
                onChange={(e) => handleRawChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-300 rounded-xl text-xl font-mono font-extrabold text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all shadow-inner"
                placeholder="100.000"
              />
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-4 gap-2 mt-2.5">
              {PRESET_FLOATS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setFloatAmount(preset);
                    setFloatRaw(String(preset));
                    inputRef.current?.focus();
                  }}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    floatAmount === preset
                      ? "bg-teal-600 text-white border-teal-600 shadow-2xs"
                      : "bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200"
                  }`}
                >
                  {formatRupiah(preset)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
              Catatan Pembukaan Shift <span className="text-zinc-400 font-normal">(Opsional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Uang pecahan kecil lengkap 2rb dan 5rb"
              className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <span>Membuka Shift...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-teal-200" />
                  <span>Buka Shift &amp; Buka Register (Enter)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};