import React, { useEffect, useState } from "react";
import { Clock, PauseCircle, Play, Trash2, X } from "lucide-react";
import type { CartItem, HeldBill } from "../../types/domain";
import {
  calculateEffectiveUnitPrice,
  formatDateTimeId,
  formatRupiah,
} from "../../utils/posCalculator";

interface HeldBillsModalProps {
  isOpen: boolean;
  mode: "HOLD" | "RECALL";
  currentCart: CartItem[];
  heldBills: HeldBill[];
  loading: boolean;
  onClose: () => void;
  onConfirmHold: (holdLabel: string) => Promise<void>;
  onRecallBill: (billId: string) => Promise<void>;
  onDeleteBill: (billId: string) => Promise<void>;
}

export const HeldBillsModal: React.FC<HeldBillsModalProps> = ({
  isOpen,
  mode,
  currentCart,
  heldBills,
  loading,
  onClose,
  onConfirmHold,
  onRecallBill,
  onDeleteBill,
}) => {
  const [holdLabel, setHoldLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && mode === "HOLD") {
      setHoldLabel("");
    }
  }, [isOpen, mode]);

  if (!isOpen) {
    return null;
  }

  const handleHoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentCart.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onConfirmHold(holdLabel.trim() || "Pelanggan Umum");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {mode === "HOLD" ? (
              <PauseCircle className="w-5 h-5 text-amber-400" />
            ) : (
              <Clock className="w-5 h-5 text-blue-400" />
            )}
            <div>
              <h3 className="font-bold text-base">
                {mode === "HOLD"
                  ? "Tahan Transaksi (Hold Bill — F4)"
                  : `Daftar Transaksi Ditahan (${heldBills.length}) — F5`}
              </h3>
              <p className="text-xs text-slate-400">
                {mode === "HOLD"
                  ? "Keranjang disimpan sementara tanpa mengunci stok produk."
                  : "Transaksi yang ditahan dapat dipanggil kembali dari terminal kasir mana pun."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === "HOLD" ? (
          <form onSubmit={handleHoldSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Catatan / Nama Pelanggan (Opsional)
              </label>
              <input
                type="text"
                autoFocus
                value={holdLabel}
                onChange={(e) => setHoldLabel(e.target.value)}
                placeholder="Contoh: Ibu Rina (Ambil dompet di mobil)"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600">
              <div className="font-bold text-slate-800 mb-1">
                Ringkasan Keranjang ({currentCart.length} baris produk):
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {currentCart.map((item) => {
                  const unitPrice = calculateEffectiveUnitPrice(
                    item.product.selling_price,
                    item.product.discount_type,
                    item.product.discount_value
                  );
                  return (
                    <li key={item.product.id} className="flex justify-between">
                      <span>
                        {item.product.name} × {item.quantity}
                      </span>
                      <span className="font-mono font-semibold">
                        {formatRupiah(unitPrice * item.quantity)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Batal (Esc)
              </button>
              <button
                type="submit"
                disabled={submitting || currentCart.length === 0}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {submitting ? "Menyimpan..." : "Simpan ke Antrean Hold (Enter)"}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 overflow-y-auto flex-1 space-y-3">
            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Memuat daftar transaksi yang ditahan...
              </div>
            ) : heldBills.length === 0 ? (
              <div className="py-12 text-center">
                <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-700">
                  Tidak Ada Transaksi Ditahan
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Tekan <kbd className="kbd-key">F4</kbd> saat ada item di keranjang untuk menahan transaksi sementara.
                </p>
              </div>
            ) : (
              heldBills.map((bill) => (
                <div
                  key={bill.id}
                  className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors bg-slate-50/60"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {bill.hold_label || "Pelanggan Umum"}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                          {bill.items.length} produk
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Ditahan oleh <strong>{bill.cashier_name}</strong> ({bill.terminal_name}) •{" "}
                        {formatDateTimeId(bill.created_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Estimasi Total</div>
                      <div className="font-mono font-bold text-sm text-slate-900 tabular-nums">
                        {formatRupiah(bill.estimated_total)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-600 truncate max-w-md">
                      {bill.items
                        .map((i) => `${i.product_name} (×${i.quantity})`)
                        .join(", ")}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onDeleteBill(bill.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Hapus Hold Bill"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onRecallBill(bill.id)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Panggil ke Keranjang
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
