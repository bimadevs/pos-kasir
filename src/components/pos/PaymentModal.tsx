import React, { useEffect, useRef, useState } from "react";
import { Banknote, CheckCircle2, Printer, X } from "lucide-react";
import type { ReceiptData } from "../../types/domain";
import { formatRupiah } from "../../utils/posCalculator";

interface PaymentModalProps {
  isOpen: boolean;
  totalAmount: number;
  submitting: boolean;
  completedReceipt: ReceiptData | null;
  printWarning: string | null;
  errorMessage: string | null;
  onClose: () => void;
  onConfirmCashPayment: (cashReceived: number) => void;
  onStartNewTransaction: () => void;
  onShowReceiptPreview: () => void;
}

const QUICK_DENOMINATIONS = [10000, 20000, 50000, 100000, 150000, 200000];

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  totalAmount,
  submitting,
  completedReceipt,
  printWarning,
  errorMessage,
  onClose,
  onConfirmCashPayment,
  onStartNewTransaction,
  onShowReceiptPreview,
}) => {
  const [cashInput, setCashInput] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && !completedReceipt) {
      setCashInput(String(totalAmount));
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
    }
  }, [isOpen, totalAmount, completedReceipt]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (completedReceipt) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          onStartNewTransaction();
        }
        return;
      }

      if (e.key === "F9") {
        e.preventDefault();
        onConfirmCashPayment(totalAmount);
      } else if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    completedReceipt,
    totalAmount,
    submitting,
    onConfirmCashPayment,
    onClose,
    onStartNewTransaction,
  ]);

  if (!isOpen) {
    return null;
  }

  const parsedCash = parseInt(cashInput.replace(/[^0-9]/g, ""), 10) || 0;
  const changeAmount = parsedCash - totalAmount;
  const isSufficient = parsedCash >= totalAmount && totalAmount > 0;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSufficient && !submitting) {
      onConfirmCashPayment(parsedCash);
    }
  };

  if (completedReceipt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden">
          <div className="bg-zinc-900 text-white px-6 py-5 text-center border-b border-zinc-800">
            <CheckCircle2 className="w-11 h-11 mx-auto mb-2 text-emerald-400" />
            <h3 className="text-xl font-extrabold tracking-tight">
              TRANSAKSI BERHASIL
            </h3>
            <p className="text-xs font-mono text-zinc-400 mt-1">
              No. Struk: {completedReceipt.sale.receipt_number}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2.5 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Total Belanja</span>
                <span className="font-mono font-bold text-zinc-900 tabular-nums">
                  {formatRupiah(completedReceipt.sale.total_amount)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Tunai Diterima</span>
                <span className="font-mono font-semibold text-zinc-800 tabular-nums">
                  {formatRupiah(completedReceipt.sale.cash_received)}
                </span>
              </div>
              <div className="border-t border-zinc-200 pt-2.5 flex justify-between items-baseline">
                <span className="font-bold text-zinc-800">UANG KEMBALIAN</span>
                <span className="text-2xl font-extrabold font-mono text-emerald-600 tabular-nums">
                  {formatRupiah(completedReceipt.sale.change_amount)}
                </span>
              </div>
            </div>

            {printWarning && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs font-semibold">
                Catatan Printer: {printWarning}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onShowReceiptPreview}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] font-bold text-xs transition-all cursor-pointer shadow-2xs"
              >
                <Printer className="w-4 h-4" />
                Lihat / Cetak Struk
              </button>
              <button
                type="button"
                onClick={onStartNewTransaction}
                autoFocus
                className="flex-1 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                Transaksi Baru (Enter)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Banknote className="w-5 h-5 text-teal-400" />
            <h3 className="font-extrabold text-base tracking-tight">Pembayaran Tunai (CASH)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs font-semibold">
              {errorMessage}
            </div>
          )}

          {/* Total Tagihan */}
          <div className="bg-zinc-950 text-white rounded-xl p-4 flex items-center justify-between border border-zinc-800 shadow-inner">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Total Tagihan
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Metode: Tunai (Cash)
              </div>
            </div>
            <div className="text-3xl font-extrabold font-mono text-zinc-50 tabular-nums">
              {formatRupiah(totalAmount)}
            </div>
          </div>

          {/* Input Nominal Uang Diterima */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 mb-1.5">
              Uang Tunai Diterima (Rp)
            </label>
            <input
              ref={inputRef}
              type="number"
              min={0}
              step={100}
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
              disabled={submitting}
              className="w-full px-4 py-3 text-2xl font-mono font-extrabold text-zinc-900 bg-zinc-50/70 border border-zinc-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 rounded-xl focus:outline-none focus:bg-white tabular-nums transition-all shadow-2xs"
              placeholder="Masukkan nominal uang diterima..."
            />
          </div>

          {/* Tombol Pecahan Cepat */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
              Nominal Cepat
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCashInput(String(totalAmount))}
                className="col-span-3 py-2 px-3 rounded-xl bg-teal-50 hover:bg-teal-100/80 active:scale-[0.98] border border-teal-200 text-teal-900 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
              >
                <span>Uang Pas ({formatRupiah(totalAmount)})</span>
                <kbd className="kbd-key">F9</kbd>
              </button>
              {QUICK_DENOMINATIONS.map((denom) => (
                <button
                  key={denom}
                  type="button"
                  onClick={() => setCashInput(String(denom))}
                  className="py-2 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 active:bg-zinc-200 active:scale-[0.98] border border-zinc-200 text-zinc-800 font-mono font-bold text-xs tabular-nums transition-all cursor-pointer shadow-2xs"
                >
                  {formatRupiah(denom)}
                </button>
              ))}
            </div>
          </div>

          {/* Kalkulasi Kembalian */}
          <div
            className={`rounded-xl p-4 border flex items-center justify-between ${
              isSufficient
                ? "bg-zinc-50 border-zinc-200"
                : "bg-rose-50/80 border-rose-200"
            }`}
          >
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                isSufficient ? "text-zinc-700" : "text-rose-700"
              }`}
            >
              {isSufficient ? "Uang Kembalian" : "Kurang Bayar"}
            </span>
            <span
              className={`text-2xl font-extrabold font-mono tabular-nums ${
                isSufficient ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {isSufficient
                ? formatRupiah(changeAmount)
                : formatRupiah(Math.abs(changeAmount))}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              Batal (Esc)
            </button>
            <button
              type="submit"
              disabled={!isSufficient || submitting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-[0.98] disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-xs font-extrabold tracking-wide shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {submitting ? "Memproses..." : "Konfirmasi & Cetak Struk (Enter)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
