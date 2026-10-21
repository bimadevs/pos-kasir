import React, { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import type { Sale } from "../../types/domain";
import { formatRupiah } from "../../utils/posCalculator";

interface VoidPinModalProps {
  sale: Sale | null;
  onClose: () => void;
  onConfirmVoid: (
    saleId: string,
    adminPin: string,
    voidReason: string
  ) => Promise<void>;
}

export const VoidPinModal: React.FC<VoidPinModalProps> = ({
  sale,
  onClose,
  onConfirmVoid,
}) => {
  const [voidReason, setVoidReason] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sale) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidReason.trim()) {
      setError("Alasan pembatalan (void) wajib diisi.");
      return;
    }
    if (adminPin.trim().length < 4) {
      setError("Masukkan PIN Otorisasi Admin (4-6 digit).");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onConfirmVoid(sale.id, adminPin.trim(), voidReason.trim());
      setVoidReason("");
      setAdminPin("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <div>
              <h3 className="font-bold text-sm">Otorisasi Void Transaksi</h3>
              <p className="text-xs text-zinc-400 font-mono">
                {sale.receipt_number} • {formatRupiah(sale.total_amount)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3.5 py-2.5 rounded-xl text-xs font-semibold">
              {error}
            </div>
          )}

          <div className="bg-amber-50/80 border border-amber-200 text-amber-900 rounded-xl p-3 text-xs leading-relaxed">
            <strong>Perhatian:</strong> Pembatalan transaksi (Void) akan mengembalikan stok seluruh barang pada struk ini secara otomatis dan tidak dapat dibatalkan.
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
              Alasan Void / Pembatalan
            </label>
            <input
              type="text"
              autoFocus
              required
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Contoh: Pelanggan batal beli / salah input barang"
              className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-xl focus:outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 text-zinc-900 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
              PIN Otorisasi Admin (4–6 Digit)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="••••••"
              className="w-full px-3.5 py-2.5 text-center font-mono text-xl tracking-[0.4em] font-bold border border-zinc-300 rounded-xl focus:outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 text-zinc-900 transition-all"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] transition-all cursor-pointer shadow-2xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {submitting ? "Memverifikasi..." : "Konfirmasi Void"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
