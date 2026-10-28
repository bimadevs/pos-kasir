import React, { useEffect, useRef, useState } from "react";
import { Minus, Plus, ShoppingBag, Sparkles, Tag, Trash2, Zap } from "lucide-react";
import type { CartItem } from "../../types/domain";
import {
  calculateItemPrice,
  formatRupiah,
} from "../../utils/posCalculator";

interface CartTableProps {
  items: CartItem[];
  selectedIndex: number;
  editingProductId: string | null;
  highlightedProductId: string | null;
  onSelectRow: (index: number) => void;
  onStartEditQty: (productId: string) => void;
  onCommitQty: (productId: string, newQty: number) => void;
  onCancelEditQty: () => void;
  onRemoveItem: (productId: string) => void;
}

export const CartTable: React.FC<CartTableProps> = ({
  items,
  selectedIndex,
  editingProductId,
  highlightedProductId,
  onSelectRow,
  onStartEditQty,
  onCommitQty,
  onCancelEditQty,
  onRemoveItem,
}) => {
  const [qtyInput, setQtyInput] = useState<string>("1");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingProductId) {
      const target = items.find((item) => item.product.id === editingProductId);
      if (target) {
        setQtyInput(String(target.quantity));
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 10);
      }
    }
  }, [editingProductId, items]);

  const handleQtyKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    productId: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const parsed = parseInt(qtyInput, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        onCommitQty(productId, parsed);
      } else {
        onCancelEditQty();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancelEditQty();
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-zinc-200/90 p-8 text-center select-none shadow-2xs">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 border border-zinc-200/80 flex items-center justify-center text-zinc-400 mb-3 shadow-inner">
          <ShoppingBag className="w-7 h-7" />
        </div>
        <h3 className="text-base font-extrabold text-zinc-900 mb-1 tracking-tight">
          Keranjang Belanja Kosong
        </h3>
        <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
          Scan barcode barang menggunakan <strong>USB Barcode Scanner</strong> dari mana saja, atau tekan{" "}
          <kbd className="kbd-key">F1</kbd> untuk mencari nama / SKU barang secara manual.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden flex flex-col min-h-0">
      <div className="overflow-y-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="bg-zinc-50 border-b border-zinc-200 sticky top-0 z-10 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              <th className="py-2.5 px-3">Nama Produk &amp; Kode</th>
              <th className="py-2.5 px-3 w-36 text-center">
                Qty <span className="kbd-key ml-1">F2</span>
              </th>
              <th className="py-2.5 px-3 w-32 text-right">Harga</th>
              <th className="py-2.5 px-3 w-36 text-right">Subtotal</th>
              <th className="py-2.5 px-3 w-14 text-center">Hapus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 text-sm">
            {items.map((item, idx) => {
              const { product, quantity } = item;
              const isSelected = idx === selectedIndex;
              const isEditing = editingProductId === product.id;
              const isHighlighted = highlightedProductId === product.id;
              const isAtMaxStock = quantity >= product.stock;

              const calc = calculateItemPrice(product, quantity);
              const { effectiveUnitPrice, isTierApplied, appliedTierMinQty, appliedTierPrice, savingsTotal, subtotal: lineTotal, unitDiscount: unitDisc } = calc;

              // Cek apakah ada tier grosir berikutnya yang belum tercapai untuk upselling hint
              const nextTier = product.price_tiers && product.price_tiers.length > 0 && !isTierApplied
                ? [...product.price_tiers].sort((a, b) => a.min_quantity - b.min_quantity)[0]
                : null;

              return (
                <tr
                  key={product.id}
                  onClick={() => onSelectRow(idx)}
                  className={`transition-colors cursor-pointer ${
                    isHighlighted
                      ? "bg-teal-100/70 border-l-4 border-l-teal-600"
                      : isSelected
                      ? "bg-teal-50/70 border-l-4 border-l-teal-600"
                      : "hover:bg-zinc-50/80 border-l-4 border-l-transparent"
                  }`}
                >
                  <td className="py-3 px-3 text-center font-mono text-xs font-semibold text-zinc-500">
                    {idx + 1}
                  </td>

                  <td className="py-3 px-3">
                    <div className="font-bold text-zinc-900 leading-snug">
                      {product.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500 font-mono flex-wrap">
                      <span>SKU: {product.sku}</span>
                      {product.barcode && <span>• Bar: {product.barcode}</span>}
                      <span
                        className={`font-sans px-1.5 py-0.2 rounded text-[11px] font-semibold border ${
                          isAtMaxStock
                            ? "bg-amber-50 text-amber-700 border-amber-200/70"
                            : "bg-zinc-100 text-zinc-600 border-zinc-200/70"
                        }`}
                      >
                        Sisa Stok: {product.stock} {product.unit}
                      </span>
                    </div>

                    {isTierApplied ? (
                      <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-md shadow-2xs">
                        <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-500" />
                        <span>
                          Harga Grosir (Min. {appliedTierMinQty} {product.unit}): {formatRupiah(appliedTierPrice!)}/{product.unit} • Hemat {formatRupiah(savingsTotal)}
                        </span>
                      </div>
                    ) : unitDisc > 0 ? (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-md">
                        <Tag className="w-3 h-3" />
                        <span>
                          ↳ Diskon{" "}
                          {product.discount_type === "PERCENT"
                            ? `${product.discount_value}% (${formatRupiah(unitDisc)}/${product.unit})`
                            : `${formatRupiah(unitDisc)}/${product.unit}`}
                        </span>
                      </div>
                    ) : nextTier ? (
                      <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 bg-teal-50/70 border border-teal-200/60 px-2 py-0.2 rounded">
                        <Sparkles className="w-3 h-3 text-teal-600" />
                        <span>
                          Tier Grosir: Beli ≥ {nextTier.min_quantity} {product.unit} jadi {formatRupiah(nextTier.tier_price)}
                        </span>
                      </div>
                    ) : null}
                  </td>

                  <td className="py-3 px-3 text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          ref={inputRef}
                          type="number"
                          min={1}
                          max={product.stock}
                          value={qtyInput}
                          onChange={(e) => setQtyInput(e.target.value)}
                          onKeyDown={(e) => handleQtyKeyDown(e, product.id)}
                          onBlur={() => {
                            const parsed = parseInt(qtyInput, 10);
                            if (!Number.isNaN(parsed) && parsed > 0) {
                              onCommitQty(product.id, parsed);
                            } else {
                              onCancelEditQty();
                            }
                          }}
                          className="w-20 text-center font-mono font-bold text-sm px-2 py-1 border-2 border-teal-600 rounded-lg bg-white text-zinc-900 focus:outline-none tabular-nums"
                        />
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (quantity > 1) {
                              onCommitQty(product.id, quantity - 1);
                            } else {
                              onRemoveItem(product.id);
                            }
                          }}
                          className="p-1 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-md transition-colors cursor-pointer"
                          title="Kurangi Qty"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRow(idx);
                            onStartEditQty(product.id);
                          }}
                          className="min-w-[2.25rem] px-1.5 py-0.5 font-mono font-bold text-sm text-zinc-900 hover:bg-white rounded-md tabular-nums cursor-pointer"
                          title="Klik atau tekan F2 untuk ubah jumlah"
                        >
                          {quantity}
                        </button>
                        <button
                          type="button"
                          disabled={isAtMaxStock}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCommitQty(product.id, quantity + 1);
                          }}
                          className="p-1 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-md transition-colors disabled:opacity-35 cursor-pointer"
                          title={isAtMaxStock ? "Stok maksimum tercapai" : "Tambah Qty"}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {isTierApplied ? (
                      <div>
                        <div className="text-xs text-zinc-400 line-through">
                          {formatRupiah(product.selling_price)}
                        </div>
                        <div className="font-bold text-emerald-700">
                          {formatRupiah(effectiveUnitPrice)}
                        </div>
                      </div>
                    ) : unitDisc > 0 ? (
                      <div>
                        <div className="text-xs text-zinc-400 line-through">
                          {formatRupiah(product.selling_price)}
                        </div>
                        <div className="font-semibold text-zinc-800">
                          {formatRupiah(effectiveUnitPrice)}
                        </div>
                      </div>
                    ) : (
                      <span className="font-semibold text-zinc-800">
                        {formatRupiah(product.selling_price)}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right font-mono font-bold text-zinc-900 tabular-nums">
                    {formatRupiah(lineTotal)}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveItem(product.id);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Hapus baris (Delete)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
