import React, { useCallback, useEffect, useState } from "react";
import { ArrowRight, ClipboardCheck, PackageCheck, RefreshCw } from "lucide-react";
import { ipc } from "../services/ipc";
import type {
  AdjustmentType,
  Product,
  StockAdjustment,
} from "../types/domain";
import { formatDateTimeId } from "../utils/posCalculator";

export const StockAdjustmentPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form state
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [adjustmentType, setAdjustmentType] =
    useState<AdjustmentType>("RESTOCK");
  const [qtyMagnitude, setQtyMagnitude] = useState<string>("10");
  const [correctionDirection, setCorrectionDirection] = useState<"ADD" | "SUB">(
    "ADD"
  );
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodList, adjList] = await Promise.all([
        ipc.listProducts({ only_active: true }),
        ipc.listStockAdjustments(null),
      ]);
      setProducts(prodList);
      setAdjustments(adjList);
      if (!selectedProductId && prodList.length > 0) {
        setSelectedProductId(prodList[0].id);
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedProductId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedProduct =
    products.find((p) => p.id === selectedProductId) || null;
  const rawMagnitude = Math.abs(parseInt(qtyMagnitude, 10) || 0);

  let signedDelta = rawMagnitude;
  if (adjustmentType === "DAMAGE" || adjustmentType === "LOSS") {
    signedDelta = -rawMagnitude;
  } else if (adjustmentType === "CORRECTION") {
    signedDelta =
      correctionDirection === "ADD" ? rawMagnitude : -rawMagnitude;
  }

  const stockBefore = selectedProduct ? selectedProduct.stock : 0;
  const stockAfter = stockBefore + signedDelta;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;
    if (rawMagnitude <= 0) {
      setFeedback({
        type: "error",
        message: "Jumlah perubahan stok harus lebih dari 0.",
      });
      return;
    }
    if (stockAfter < 0) {
      setFeedback({
        type: "error",
        message: `Stok akhir tidak boleh negatif (${stockAfter}).`,
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const reqQuantity =
        adjustmentType === "CORRECTION" ? signedDelta : rawMagnitude;
      await ipc.createStockAdjustment({
        product_id: selectedProductId,
        adjustment_type: adjustmentType,
        quantity: reqQuantity,
        note: note.trim() || `Penyesuaian stok (${adjustmentType})`,
      });
      setNote("");
      await loadData();
      setFeedback({
        type: "success",
        message: `Stok produk "${selectedProduct?.name}" berhasil diperbarui menjadi ${stockAfter}.`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Penyesuaian Stok &amp; Audit Mutasi (Stock Opname)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Catat barang masuk (Restock), barang rusak/kedaluwarsa, kehilangan, atau koreksi stok opname.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Muat Ulang
        </button>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        {/* Form Card (4 cols) */}
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 h-fit">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
            <PackageCheck className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-sm text-slate-900">
              Formulir Penyesuaian Stok
            </h2>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-4 text-xs"
          >
            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                Pilih Produk *
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-medium focus:outline-none focus:border-blue-600"
              >
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    [{prod.sku}] {prod.name} (Stok: {prod.stock} {prod.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                Jenis Penyesuaian *
              </label>
              <select
                value={adjustmentType}
                onChange={(e) =>
                  setAdjustmentType(e.target.value as AdjustmentType)
                }
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-medium focus:outline-none focus:border-blue-600"
              >
                <option value="RESTOCK">
                  RESTOCK — Barang Masuk / Kulakan (+)
                </option>
                <option value="DAMAGE">
                  DAMAGE — Barang Rusak / Kedaluwarsa (-)
                </option>
                <option value="LOSS">
                  LOSS — Barang Hilang / Selisih Kurang (-)
                </option>
                <option value="CORRECTION">
                  CORRECTION — Koreksi Opname (+/-)
                </option>
              </select>
            </div>

            {adjustmentType === "CORRECTION" && (
              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Arah Koreksi Opname
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectionDirection("ADD")}
                    className={`py-2 rounded-xl font-bold border cursor-pointer ${
                      correctionDirection === "ADD"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    + Tambah Stok
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorrectionDirection("SUB")}
                    className={`py-2 rounded-xl font-bold border cursor-pointer ${
                      correctionDirection === "SUB"
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    - Kurangi Stok
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                Jumlah Unit (Qty) *
              </label>
              <input
                type="number"
                min={1}
                required
                value={qtyMagnitude}
                onChange={(e) => setQtyMagnitude(e.target.value)}
                className="w-full px-3 py-2.5 font-mono font-bold text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                Catatan / Keterangan Audit *
              </label>
              <input
                type="text"
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Nota Supplier PT Indofood #8821"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Live Stock Preview Box */}
            <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase text-slate-400">
                  Stok Awal
                </div>
                <div className="text-lg font-mono font-bold tabular-nums">
                  {stockBefore}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                    signedDelta >= 0
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {signedDelta >= 0 ? `+${signedDelta}` : signedDelta}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-slate-400">
                  Stok Akhir
                </div>
                <div
                  className={`text-xl font-mono font-extrabold tabular-nums ${
                    stockAfter >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {stockAfter}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || stockAfter < 0}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-xs tracking-wide transition-colors cursor-pointer"
            >
              {submitting ? "Menyimpan..." : "Simpan Mutasi Stok"}
            </button>
          </form>
        </div>

        {/* Audit History Table (8 cols) */}
        <div className="col-span-8 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-slate-700" />
              <h2 className="font-bold text-sm text-slate-900">
                Log Riwayat Mutasi Stok ({adjustments.length})
              </h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Produk</th>
                  <th className="py-3 px-4">Jenis</th>
                  <th className="py-3 px-4 text-right">Perubahan</th>
                  <th className="py-3 px-4 text-right">Stok Akhir</th>
                  <th className="py-3 px-4">Catatan &amp; Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      Memuat riwayat penyesuaian stok...
                    </td>
                  </tr>
                ) : adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      Belum ada riwayat penyesuaian stok.
                    </td>
                  </tr>
                ) : (
                  adjustments.map((adj) => (
                    <tr key={adj.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {formatDateTimeId(adj.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">
                          {adj.product_name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {adj.product_sku}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            adj.adjustment_type === "RESTOCK"
                              ? "bg-emerald-100 text-emerald-800"
                              : adj.adjustment_type === "CORRECTION"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {adj.adjustment_type}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                          adj.quantity_delta >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {adj.quantity_delta >= 0
                          ? `+${adj.quantity_delta}`
                          : adj.quantity_delta}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-800 tabular-nums">
                        <span className="text-slate-400">
                          {adj.stock_before} →{" "}
                        </span>
                        <strong>{adj.stock_after}</strong>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800 font-medium">
                          {adj.note || "-"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Oleh: {adj.user_name} ({adj.terminal_name})
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
