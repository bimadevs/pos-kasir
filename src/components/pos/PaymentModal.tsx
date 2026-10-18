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
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
          <div className="bg-emerald-600 text-white px-6 py-5 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-100" />
            <h3 className="text-xl font-extrabold tracking-tight">
              TRANSAKSI BERHASIL
            </h3>
            <p className="text-xs font-mono text-emerald-100 mt-1">
              No. Struk: {completedReceipt.sale.receipt_number}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total Belanja</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatRupiah(completedReceipt.sale.total_amount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tunai Diterima</span>
                <span className="font-mono font-semibold text-slate-800 tabular-nums">
                  {formatRupiah(completedReceipt.sale.cash_received)}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2.5 flex justify-between items-baseline">
                <span className="font-bold text-slate-800">UANG KEMBALIAN</span>
                <span className="text-2xl font-extrabold font-mono text-emerald-600 tabular-nums">
                  {formatRupiah(completedReceipt.sale.change_amount)}
                </span>
              </div>
            </div>

            {printWarning && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs font-medium">
                Catatan Printer: {printWarning}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onShowReceiptPreview}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Lihat / Cetak Struk
              </button>
              <button
                type="button"
                onClick={onStartNewTransaction}
                autoFocus
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer"
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Banknote className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base">Pembayaran Tunai (CASH)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold">
              {errorMessage}
            </div>
          )}

          {/* Total Tagihan */}
          <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Tagihan
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Metode: Tunai (Cash)
              </div>
            </div>
            <div className="text-3xl font-extrabold font-mono text-emerald-400 tabular-nums">
              {formatRupiah(totalAmount)}
            </div>
          </div>

          {/* Input Nominal Uang Diterima */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
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
              className="w-full px-4 py-3 text-2xl font-mono font-extrabold text-slate-900 bg-slate-50 border-2 border-blue-600 rounded-xl focus:outline-none focus:bg-white tabular-nums"
              placeholder="Masukkan nominal uang diterima..."
            />
          </div>

          {/* Tombol Pecahan Cepat */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Nominal Cepat
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCashInput(String(totalAmount))}
                className="col-span-3 py-2 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Uang Pas ({formatRupiah(totalAmount)})</span>
                <kbd className="kbd-key">F9</kbd>
              </button>
              {QUICK_DENOMINATIONS.map((denom) => (
                <button
                  key={denom}
                  type="button"
                  onClick={() => setCashInput(String(denom))}
                  className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-mono font-bold text-xs tabular-nums transition-colors cursor-pointer"
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
                ? "bg-emerald-50/80 border-emerald-200"
                : "bg-red-50/80 border-red-200"
            }`}
          >
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                isSufficient ? "text-emerald-800" : "text-red-700"
              }`}
            >
              {isSufficient ? "Uang Kembalian" : "Kurang Bayar"}
            </span>
            <span
              className={`text-2xl font-extrabold font-mono tabular-nums ${
                isSufficient ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {isSufficient
                ? formatRupiah(changeAmount)
                : formatRupiah(Math.abs(changeAmount))}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
            >
              Batal (Esc)
            </button>
            <button
              type="submit"
              disabled={!isSufficient || submitting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-extrabold tracking-wide transition-colors cursor-pointer"
            >
              {submitting ? "Memproses..." : "Konfirmasi & Cetak Struk (Enter)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
