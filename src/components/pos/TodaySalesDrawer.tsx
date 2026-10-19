import React, { useState } from "react";
import { Ban, Eye, History, Printer, X } from "lucide-react";
import type { Sale, SaleWithItems } from "../../types/domain";
import { formatDateTimeId, formatRupiah } from "../../utils/posCalculator";
import { VoidPinModal } from "./VoidPinModal";

interface TodaySalesDrawerProps {
  isOpen: boolean;
  sales: SaleWithItems[];
  loading: boolean;
  onClose: () => void;
  onReprintSale: (saleId: string) => Promise<void>;
  onVoidSale: (
    saleId: string,
    adminPin: string,
    voidReason: string
  ) => Promise<void>;
}

export const TodaySalesDrawer: React.FC<TodaySalesDrawerProps> = ({
  isOpen,
  sales,
  loading,
  onClose,
  onReprintSale,
  onVoidSale,
}) => {
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl h-full shadow-2xl border-l border-zinc-200 flex flex-col">
        {/* Header */}
        <div className="bg-zinc-900 text-white px-6 py-4 flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-bold text-base">
                Riwayat Transaksi Hari Ini (F6)
              </h3>
              <p className="text-xs text-zinc-400">
                Cetak ulang struk atau batalkan (Void) transaksi di hari yang sama.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              Memuat transaksi hari ini...
            </div>
          ) : sales.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              Belum ada transaksi penjualan pada hari ini.
            </div>
          ) : (
            sales.map(({ sale, items }) => {
              const isVoided = sale.status === "VOIDED";
              const isExpanded = expandedSaleId === sale.id;

              return (
                <div
                  key={sale.id}
                  className={`border rounded-xl p-4 transition-colors ${
                    isVoided
                      ? "bg-rose-50/40 border-rose-200"
                      : "bg-white border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-zinc-900">
                          {sale.receipt_number}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${
                            isVoided
                              ? "bg-rose-100 text-rose-700 border-rose-200"
                              : "bg-zinc-100 text-zinc-700 border-zinc-200"
                          }`}
                        >
                          {isVoided ? "VOID / DIBATALKAN" : "COMPLETED"}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        Kasir: <strong>{sale.cashier_name_snapshot}</strong> ({sale.terminal_name}) •{" "}
                        {formatDateTimeId(sale.created_at)}
                      </div>
                      {isVoided && sale.void_reason && (
                        <div className="text-xs text-rose-700 mt-1 font-medium">
                          Alasan Void: &ldquo;{sale.void_reason}&rdquo; (oleh{" "}
                          {sale.voided_by_name_snapshot || "Admin"})
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-mono font-extrabold text-base tabular-nums ${
                          isVoided ? "line-through text-zinc-400" : "text-zinc-900"
                        }`}
                      >
                        {formatRupiah(sale.total_amount)}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        Tunai: {formatRupiah(sale.cash_received)} • Kembali:{" "}
                        {formatRupiah(sale.change_amount)}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Line Items */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-zinc-200 bg-zinc-50 rounded-lg p-3 text-xs space-y-1.5">
                      <div className="font-bold text-zinc-700 mb-1">
                        Rincian Item ({items.length} baris):
                      </div>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-zinc-700"
                        >
                          <span>
                            {item.product_name_snapshot} × {item.quantity} @{" "}
                            {formatRupiah(item.selling_price_snapshot)}
                            {item.unit_discount_amount > 0 &&
                              ` (Diskon -${formatRupiah(item.unit_discount_amount)})`}
                          </span>
                          <span className="font-mono font-semibold tabular-nums">
                            {formatRupiah(item.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSaleId(isExpanded ? null : sale.id)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {isExpanded ? "Tutup Rincian" : `Rincian (${items.length})`}
                    </button>

                    {!isVoided && (
                      <>
                        <button
                          type="button"
                          onClick={() => void onReprintSale(sale.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Cetak Ulang
                        </button>
                        <button
                          type="button"
                          onClick={() => setVoidTarget(sale)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Void
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <VoidPinModal
          sale={voidTarget}
          onClose={() => setVoidTarget(null)}
          onConfirmVoid={async (saleId, adminPin, voidReason) => {
            await onVoidSale(saleId, adminPin, voidReason);
          }}
        />
      </div>
    </div>
  );
};
