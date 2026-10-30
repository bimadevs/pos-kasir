import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck,
  KeyRound,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { MassOpnameView } from "../components/stock/MassOpnameView";
import { useAuth } from "../context/AuthContext";
import { ipc } from "../services/ipc";
import type {
  AdjustmentType,
  Product,
  StockAdjustment,
  StockAdjustmentRequest,
  StockAdjustmentResult,
} from "../types/domain";
import { formatDateTimeId, formatRupiah } from "../utils/posCalculator";

export const StockAdjustmentPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "AD_HOC" | "MASS_OPNAME" | "APPROVALS"
  >("AD_HOC");
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [pendingRequests, setPendingRequests] = useState<
    StockAdjustmentRequest[]
  >([]);
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
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  // Modal otorisasi persetujuan / penolakan
  const [modalAction, setModalAction] = useState<"APPROVE" | "REJECT" | null>(
    null
  );
  const [selectedReq, setSelectedReq] = useState<StockAdjustmentRequest | null>(
    null
  );
  const [adminPin, setAdminPin] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodList, adjList, reqList] = await Promise.all([
        ipc.listProducts({ only_active: true }),
        ipc.listStockAdjustments(null),
        isAdmin ? ipc.listStockAdjustmentRequests("PENDING") : Promise.resolve([]),
      ]);
      setProducts(prodList);
      setAdjustments(adjList);
      setPendingRequests(reqList);
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
  }, [selectedProductId, isAdmin]);

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
      const res: StockAdjustmentResult = await ipc.createStockAdjustment({
        product_id: selectedProductId,
        adjustment_type: adjustmentType,
        quantity: reqQuantity,
        note: note.trim() || `Penyesuaian stok (${adjustmentType})`,
      });
      setNote("");
      await loadData();

      if (res.outcome_type === "PendingApproval") {
        setFeedback({
          type: "warning",
          message: `Penyesuaian stok sebesar ${signedDelta > 0 ? "+" : ""}${signedDelta} ${selectedProduct?.unit} melebihi batas toleransi toko (Rp 100.000 / 10%). Permohonan diajukan ke antrean persetujuan Admin toko.`,
        });
      } else {
        setFeedback({
          type: "success",
          message: `Stok produk "${selectedProduct?.name}" berhasil diperbarui menjadi ${res.adjustment.stock_after}.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    if (!adminPin || adminPin.length !== 6) {
      setModalError("PIN Admin harus terdiri dari 6 digit angka.");
      return;
    }

    setActionLoading(true);
    setModalError(null);
    try {
      if (modalAction === "APPROVE") {
        await ipc.approveStockAdjustmentRequest({
          request_id: selectedReq.id,
          admin_pin: adminPin,
        });
        setFeedback({
          type: "success",
          message: `Pengajuan penyesuaian stok produk "${selectedReq.product_name}" berhasil disetujui.`,
        });
      } else if (modalAction === "REJECT") {
        if (!rejectReason.trim()) {
          setModalError("Alasan penolakan wajib diisi.");
          setActionLoading(false);
          return;
        }
        await ipc.rejectStockAdjustmentRequest({
          request_id: selectedReq.id,
          admin_pin: adminPin,
          rejection_reason: rejectReason.trim(),
        });
        setFeedback({
          type: "success",
          message: `Pengajuan penyesuaian stok produk "${selectedReq.product_name}" telah ditolak.`,
        });
      }
      setModalAction(null);
      setSelectedReq(null);
      setAdminPin("");
      setRejectReason("");
      await loadData();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
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
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : feedback.type === "warning"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.type === "warning" ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          ) : feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
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
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab("APPROVALS")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "APPROVALS"
                ? "border-teal-600 text-teal-700 bg-white rounded-t-xl border-t border-x border-zinc-200 -mb-px shadow-2xs"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            Antrean Persetujuan
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-600 text-white font-extrabold animate-pulse">
                {pendingRequests.length}
              </span>
            )}
          </button>
        )}
      </div>

      {activeTab === "MASS_OPNAME" ? (
        <MassOpnameView onSessionCommitted={() => void loadData()} />
      ) : activeTab === "APPROVALS" ? (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-teal-600" />
              <div>
                <h3 className="font-bold text-sm text-zinc-900">
                  Antrean Persetujuan Penyesuaian Stok
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Permohonan koreksi stok yang melebihi ambang batas toleransi toko (≥ Rp 100.000 atau ≥ 10%) memerlukan otorisasi PIN Admin.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
              {pendingRequests.length} Menunggu Tindakan
            </span>
          </div>

          <div className="p-5">
            {pendingRequests.length === 0 ? (
              <div className="text-center py-12 px-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h4 className="font-bold text-sm text-zinc-800">
                  Semua Bersih! Tidak Ada Antrean
                </h4>
                <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                  Seluruh permohonan penyesuaian stok telah diproses atau belum ada permohonan baru dari Petugas Stok.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 transition-all shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              req.adjustment_type === "RESTOCK"
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : req.adjustment_type === "CORRECTION"
                                ? "bg-teal-50 text-teal-800 border border-teal-200"
                                : "bg-rose-50 text-rose-800 border border-rose-200"
                            }`}
                          >
                            {req.adjustment_type}
                          </span>
                          <span className="font-mono text-xs text-zinc-500">
                            [{req.product_sku}]
                          </span>
                          <span className="text-xs font-bold text-zinc-900 truncate">
                            {req.product_name}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs bg-zinc-50 p-3 rounded-lg border border-zinc-150">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                              Perubahan Qty
                            </span>
                            <span
                              className={`font-mono font-bold text-sm ${
                                req.quantity_delta >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-600"
                              }`}
                            >
                              {req.quantity_delta >= 0
                                ? `+${req.quantity_delta}`
                                : req.quantity_delta}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                              Estimasi Nilai HPP
                            </span>
                            <span className="font-mono font-bold text-sm text-zinc-800">
                              {formatRupiah(req.total_estimated_value)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                              Selisih Persen
                            </span>
                            <span
                              className={`font-mono font-bold text-sm ${
                                req.discrepancy_percent >= 10
                                  ? "text-rose-600"
                                  : "text-zinc-700"
                              }`}
                            >
                              {req.discrepancy_percent}%
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                              Pemohon & Terminal
                            </span>
                            <span className="text-zinc-700 font-medium truncate block">
                              @{req.requested_by_name} ({req.terminal_name})
                            </span>
                          </div>
                        </div>

                        <div className="mt-2.5 text-xs text-zinc-600 flex items-start gap-1.5">
                          <span className="font-semibold text-zinc-700 shrink-0">
                            Alasan:
                          </span>
                          <span className="italic">{req.reason || "-"}</span>
                          <span className="text-[11px] text-zinc-400 ml-auto shrink-0 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDateTimeId(req.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReq(req);
                            setModalAction("APPROVE");
                            setAdminPin("");
                            setRejectReason("");
                            setModalError(null);
                          }}
                          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Setujui
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReq(req);
                            setModalAction("REJECT");
                            setAdminPin("");
                            setRejectReason("");
                            setModalError(null);
                          }}
                          className="px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Tolak
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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

      {/* Modal Otorisasi PIN Admin untuk Approval / Rejection */}
      {modalAction && selectedReq && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className={`w-5 h-5 ${
                    modalAction === "APPROVE" ? "text-teal-600" : "text-rose-600"
                  }`}
                />
                <h3 className="font-bold text-sm text-zinc-900">
                  {modalAction === "APPROVE"
                    ? "Otorisasi Persetujuan Penyesuaian Stok"
                    : "Otorisasi Penolakan Penyesuaian Stok"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalAction(null);
                  setSelectedReq(null);
                }}
                className="text-zinc-400 hover:text-zinc-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleConfirmApproval(e)} className="mt-4 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
                <div className="font-bold text-zinc-900 text-sm">
                  {selectedReq.product_name}
                </div>
                <div className="text-zinc-500 font-mono text-[11px]">
                  SKU: {selectedReq.product_sku} • Pemohon: @{selectedReq.requested_by_name}
                </div>
                <div className="pt-2 mt-2 border-t border-zinc-200 grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-zinc-400 block text-[10px]">Delta Qty</span>
                    <span
                      className={`font-bold ${
                        selectedReq.quantity_delta >= 0
                          ? "text-emerald-700"
                          : "text-rose-600"
                      }`}
                    >
                      {selectedReq.quantity_delta >= 0
                        ? `+${selectedReq.quantity_delta}`
                        : selectedReq.quantity_delta}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px]">Estimasi Nilai HPP</span>
                    <span className="font-bold text-zinc-900">
                      {formatRupiah(selectedReq.total_estimated_value)}
                    </span>
                  </div>
                </div>
              </div>

              {modalAction === "REJECT" && (
                <div>
                  <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                    Alasan Penolakan *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Contoh: Barang diperiksa kembali dan masih layak jual."
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
                  PIN Administrator (6 Digit) *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  autoFocus
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  className="w-full px-3 py-2.5 font-mono text-center text-lg tracking-widest font-bold border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalAction(null);
                    setSelectedReq(null);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-zinc-300 hover:bg-zinc-50 font-bold text-zinc-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || adminPin.length !== 6}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-white font-bold cursor-pointer transition-all disabled:opacity-50 ${
                    modalAction === "APPROVE"
                      ? "bg-teal-600 hover:bg-teal-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {actionLoading
                    ? "Memproses..."
                    : modalAction === "APPROVE"
                    ? "Konfirmasi Setujui"
                    : "Konfirmasi Tolak"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
