import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  FileCheck,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { MassOpnameView } from "../components/stock/MassOpnameView";
import { ipc } from "../services/ipc";
import type {
  AdjustmentType,
  Product,
  StockAdjustment,
} from "../types/domain";
import { formatDateTimeId } from "../utils/posCalculator";

export const StockAdjustmentPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"AD_HOC" | "MASS_OPNAME">(
    "AD_HOC"
  );
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
    <div className="flex-1 overflow-y-auto p-6 bg-zinc-100/70 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">
            Penyesuaian Stok &amp; Audit Mutasi (Stock Opname)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Catat barang masuk (Restock), barang rusak/kedaluwarsa, kehilangan, atau koreksi stok opname.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-xs font-bold text-zinc-700 shadow-2xs transition-all cursor-pointer"
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
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Subtab Switcher */}
      <div className="flex border-b border-zinc-200 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("AD_HOC")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "AD_HOC"
              ? "border-teal-600 text-teal-700 bg-white rounded-t-xl border-t border-x border-zinc-200 -mb-px shadow-2xs"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          Koreksi Stok Ad-Hoc
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("MASS_OPNAME")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "MASS_OPNAME"
              ? "border-teal-600 text-teal-700 bg-white rounded-t-xl border-t border-x border-zinc-200 -mb-px shadow-2xs"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          Audit Opname Fisik Massal
        </button>
      </div>

      {activeTab === "MASS_OPNAME" ? (
        <MassOpnameView onSessionCommitted={() => void loadData()} />
      ) : (
        <div className="grid grid-cols-12 gap-5">
        {/* Form Card (4 cols) */}
        <div className="col-span-4 bg-white rounded-2xl border border-zinc-200 shadow-2xs p-5 h-fit">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-zinc-200">
            <PackageCheck className="w-5 h-5 text-teal-600" />
            <h2 className="font-bold text-sm text-zinc-900">
              Formulir Penyesuaian Stok
            </h2>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-4 text-xs"
          >
            <div>
              <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                Pilih Produk *
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2.5 border border-zinc-300 rounded-xl bg-white text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
              >
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    [{prod.sku}] {prod.name} (Stok: {prod.stock} {prod.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                Jenis Penyesuaian *
              </label>
              <select
                value={adjustmentType}
                onChange={(e) =>
                  setAdjustmentType(e.target.value as AdjustmentType)
                }
                className="w-full px-3 py-2.5 border border-zinc-300 rounded-xl bg-white text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
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
                <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Arah Koreksi Opname
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectionDirection("ADD")}
                    className={`py-2 rounded-xl font-bold border transition-all cursor-pointer active:scale-[0.98] ${
                      correctionDirection === "ADD"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                        : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    + Tambah Stok
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorrectionDirection("SUB")}
                    className={`py-2 rounded-xl font-bold border transition-all cursor-pointer active:scale-[0.98] ${
                      correctionDirection === "SUB"
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                        : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    - Kurangi Stok
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                Jumlah Unit (Qty) *
              </label>
              <input
                type="number"
                min={1}
                required
                value={qtyMagnitude}
                onChange={(e) => setQtyMagnitude(e.target.value)}
                className="w-full px-3 py-2.5 font-mono font-bold text-sm border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
              />
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                Catatan / Keterangan Audit *
              </label>
              <input
                type="text"
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Nota Supplier PT Indofood #8821"
                className="w-full px-3 py-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all placeholder:text-zinc-400"
              />
            </div>

            {/* Live Stock Preview Box */}
            <div className="bg-emerald-50/90 text-emerald-950 rounded-xl p-4 flex items-center justify-between border-2 border-emerald-500/80 shadow-xs">
              <div>
                <div className="text-[10px] uppercase font-bold text-emerald-800">
                  Stok Awal
                </div>
                <div className="text-lg font-mono font-bold tabular-nums text-emerald-950">
                  {stockBefore}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                    signedDelta >= 0
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-rose-100 text-rose-800 border border-rose-300"
                  }`}
                >
                  {signedDelta >= 0 ? `+${signedDelta}` : signedDelta}
                </span>
                <ArrowRight className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-emerald-800">
                  Stok Akhir
                </div>
                <div
                  className={`text-xl font-mono font-extrabold tabular-nums ${
                    stockAfter >= 0 ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {stockAfter}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || stockAfter < 0}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-bold text-xs tracking-wide transition-all cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {submitting ? "Menyimpan..." : "Simpan Mutasi Stok"}
            </button>
          </form>
        </div>

        {/* Audit History Table (8 cols) */}
        <div className="col-span-8 bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-zinc-700" />
              <h2 className="font-bold text-sm text-zinc-900">
                Log Riwayat Mutasi Stok ({adjustments.length})
              </h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                <tr>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Produk</th>
                  <th className="py-3 px-4">Jenis</th>
                  <th className="py-3 px-4 text-right">Perubahan</th>
                  <th className="py-3 px-4 text-right">Stok Akhir</th>
                  <th className="py-3 px-4">Catatan &amp; Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-zinc-500">
                      Memuat riwayat penyesuaian stok...
                    </td>
                  </tr>
                ) : adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-zinc-500">
                      Belum ada riwayat penyesuaian stok.
                    </td>
                  </tr>
                ) : (
                  adjustments.map((adj) => (
                    <tr key={adj.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-zinc-500 whitespace-nowrap">
                        {formatDateTimeId(adj.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-zinc-900">
                          {adj.product_name}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-500">
                          {adj.product_sku}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            adj.adjustment_type === "RESTOCK"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200/60"
                              : adj.adjustment_type === "CORRECTION"
                              ? "bg-teal-50 text-teal-800 border border-teal-200/60"
                              : "bg-rose-50 text-rose-700 border border-rose-200/60"
                          }`}
                        >
                          {adj.adjustment_type}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                          adj.quantity_delta >= 0
                            ? "text-emerald-700"
                            : "text-rose-600"
                        }`}
                      >
                        {adj.quantity_delta >= 0
                          ? `+${adj.quantity_delta}`
                          : adj.quantity_delta}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-800 tabular-nums">
                        <span className="text-zinc-400">
                          {adj.stock_before} →{" "}
                        </span>
                        <strong>{adj.stock_after}</strong>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-zinc-800 font-medium">
                          {adj.note || "-"}
                        </div>
                        <div className="text-[11px] text-zinc-500">
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
      )}
    </div>
  );
};
