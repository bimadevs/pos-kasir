import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Barcode,
  CheckCircle2,
  FileCheck,
  Lock,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { ipc } from "../../services/ipc";
import type { OpnameSessionDetail } from "../../types/domain";
import { formatDateTimeId, formatRupiah } from "../../utils/posCalculator";
import { playErrorBeep, playScanSuccessBeep } from "../../utils/sound";

interface MassOpnameViewProps {
  onSessionCommitted?: () => void;
}

export const MassOpnameView: React.FC<MassOpnameViewProps> = ({
  onSessionCommitted,
}) => {
  const [detail, setDetail] = useState<OpnameSessionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create Session Form State
  const [newSessionName, setNewSessionName] = useState<string>("");
  const [newSessionNotes, setNewSessionNotes] = useState<string>("");
  const [creatingSession, setCreatingSession] = useState<boolean>(false);

  // Scan & Input State
  const [scanCode, setScanCode] = useState<string>("");
  const [scanQuantity, setScanQuantity] = useState<string>("1");
  const [scanMode, setScanMode] = useState<"ADD" | "REPLACE">("ADD");
  const [scanning, setScanning] = useState<boolean>(false);

  // Search & Filter State
  const [itemSearch, setItemSearch] = useState<string>("");
  const [itemFilter, setItemFilter] = useState<"ALL" | "DISCREPANCY" | "MATCH">(
    "ALL"
  );

  // Commit Modal State (Admin PIN)
  const [commitModalOpen, setCommitModalOpen] = useState<boolean>(false);
  const [adminPin, setAdminPin] = useState<string>("");
  const [committing, setCommitting] = useState<boolean>(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const loadActiveSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const countingSessions = await ipc.listOpnameSessions("COUNTING");
      if (countingSessions.length > 0) {
        const sessionDetail = await ipc.getOpnameSessionDetail(
          countingSessions[0].id
        );
        setDetail(sessionDetail);
      } else {
        setDetail(null);
      }
    } catch (err) {
      setError(
        `Gagal memuat sesi opname: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActiveSession();
  }, [loadActiveSession]);

  useEffect(() => {
    if (detail) {
      scanInputRef.current?.focus();
    } else {
      const now = new Date();
      setNewSessionName(
        `Opname Fisik Toko - ${now.toLocaleDateString("id-ID")}`
      );
    }
  }, [detail]);

  // Handle Create Session
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) {
      setError("Nama sesi opname wajib diisi.");
      return;
    }
    setCreatingSession(true);
    setError(null);
    try {
      await ipc.createOpnameSession({
        session_name: newSessionName.trim(),
        notes: newSessionNotes.trim() || null,
      });
      setSuccessMsg("Sesi opname fisik berhasil dibuka.");
      await loadActiveSession();
    } catch (err) {
      setError(
        `Gagal membuka sesi opname: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setCreatingSession(false);
    }
  };

  // Handle Barcode Scan
  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const code = scanCode.trim();
    if (!code) return;

    const qty = parseInt(scanQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setError("Kuantitas fisik harus minimal 1 unit.");
      return;
    }

    setScanning(true);
    setError(null);
    try {
      await ipc.recordOpnameScan({
        session_id: detail.session.id,
        product_identifier: code,
        count_mode: scanMode,
        quantity: qty,
      });
      playScanSuccessBeep();
      setScanCode("");
      setScanQuantity("1");
      setSuccessMsg(`Hitungan produk [${code}] berhasil dicatat.`);
      await loadActiveSession();
      scanInputRef.current?.focus();
    } catch (err) {
      playErrorBeep();
      setError(
        `Gagal mencatat scan opname: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setScanning(false);
    }
  };

  // Handle Manual Qty Update
  const handleUpdateItemQty = async (itemId: string, newCount: number) => {
    if (!detail) return;
    if (newCount < 0) return;
    try {
      await ipc.updateOpnameItemQty({
        item_id: itemId,
        physical_count: newCount,
      });
      await loadActiveSession();
    } catch (err) {
      setError(
        `Gagal memperbarui kuantitas: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  // Handle Cancel Session
  const handleCancelSession = async () => {
    if (!detail) return;
    const confirm = window.confirm(
      "Apakah Anda yakin ingin membatalkan sesi opname ini? Seluruh hitungan fisik sementara akan dihapus dan tidak ada stok yang diubah."
    );
    if (!confirm) return;

    setLoading(true);
    try {
      await ipc.cancelOpnameSession(
        detail.session.id,
        "Dibatalkan oleh pengguna via UI"
      );
      setSuccessMsg("Sesi opname fisik berhasil dibatalkan.");
      setDetail(null);
      await loadActiveSession();
    } catch (err) {
      setError(
        `Gagal membatalkan sesi: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle Commit Session
  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (!adminPin.trim()) {
      setCommitError("PIN Admin diperlukan untuk otorisasi sinkronisasi stok.");
      return;
    }

    setCommitting(true);
    setCommitError(null);
    try {
      const res = await ipc.commitOpnameSession({
        session_id: detail.session.id,
        admin_pin: adminPin.trim(),
      });
      setCommitModalOpen(false);
      setAdminPin("");
      setSuccessMsg(
        `Berhasil! Sesi opname fisik "${res.session_name}" telah resmi disinkronkan ke inventaris.`
      );
      setDetail(null);
      await loadActiveSession();
      if (onSessionCommitted) {
        onSessionCommitted();
      }
    } catch (err) {
      setCommitError(
        `Gagal komit opname: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setCommitting(false);
    }
  };

  // Discrepancy calculations
  const items = detail?.items || [];
  const surplusItems = items.filter((i) => i.discrepancy > 0);
  const deficitItems = items.filter((i) => i.discrepancy < 0);
  const matchItems = items.filter((i) => i.discrepancy === 0);

  const totalDiscrepancyCost = items.reduce(
    (sum, i) => sum + i.discrepancy_cost,
    0
  );

  // Filtered Items Table
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !itemSearch.trim() ||
      item.product_name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      item.sku.toLowerCase().includes(itemSearch.toLowerCase()) ||
      (item.barcode &&
        item.barcode.toLowerCase().includes(itemSearch.toLowerCase()));

    if (!matchesSearch) return false;
    if (itemFilter === "DISCREPANCY") return item.discrepancy !== 0;
    if (itemFilter === "MATCH") return item.discrepancy === 0;
    return true;
  });

  if (loading) {
    return (
      <div className="py-16 text-center text-zinc-500 text-xs">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
        Memeriksa sesi audit opname fisik...
      </div>
    );
  }

  // View when NO active opname session
  if (!detail) {
    return (
      <div className="space-y-6">
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-700 hover:text-rose-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="bg-teal-700 text-white p-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-800/80 rounded-xl">
                <FileCheck className="w-6 h-6 text-teal-200" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  Buka Sesi Audit Opname Fisik Massal
                </h3>
                <p className="text-xs text-teal-100 mt-0.5">
                  Rekonsiliasi stok fisik toko secara menyeluruh tanpa mengubah inventaris langsung sebelum komit.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleCreateSession(e)}
            className="p-6 space-y-5 text-xs"
          >
            <div>
              <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                Nama / Judul Sesi Opname *
              </label>
              <input
                type="text"
                required
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Contoh: Opname Akhir Bulan Oktober 2026"
                className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-medium transition-all"
              />
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                Keterangan / Catatan Tambahan (Opsional)
              </label>
              <textarea
                rows={3}
                value={newSessionNotes}
                onChange={(e) => setNewSessionNotes(e.target.value)}
                placeholder="Contoh: Audit fisik oleh Tim Kasir & Supervisor saat toko tutup"
                className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-medium transition-all resize-none placeholder:text-zinc-400"
              />
            </div>

            <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-950 text-xs leading-relaxed space-y-1.5">
              <div className="font-bold text-teal-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-teal-600" />
                Alur Kerja Opname Aman (Mudita Mart Invariant #2 & #7):
              </div>
              <ul className="list-disc list-inside space-y-1 text-teal-800">
                <li>
                  Snapshot stok sistem dibekukan saat sesi dibuka sebagai acuan pembanding.
                </li>
                <li>
                  Scan barcode barang berkali-kali (Mode ADD) atau ketik langsung angka hitungan fisik (Mode REPLACE).
                </li>
                <li>
                  Selisih (Surplus / Defisit) ditampilkan secara real-time lengkap dengan nilai nominal modal HPP.
                </li>
                <li>
                  Penyesuaian stok ke SQLite baru dieksekusi secara atomik saat Admin memasukkan PIN otorisasi (Commit).
                </li>
              </ul>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={creatingSession || !newSessionName.trim()}
                className="px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white font-bold text-xs shadow-xs transition-all cursor-pointer disabled:bg-zinc-300 disabled:cursor-not-allowed"
              >
                {creatingSession ? "Membuka Sesi..." : "Mulai Sesi Opname Sekarang"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // View when ACTIVE opname session exists
  return (
    <div className="space-y-4 text-xs">
      {/* Feedback Alerts */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Session Cockpit Bar */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs p-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-sm text-zinc-900">
              {detail.session.session_name}
            </h2>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
              SESI AKTIF (COUNTING)
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Dibuka oleh: <strong>{detail.session.creator_name_snapshot}</strong> •{" "}
            {formatDateTimeId(detail.session.created_at)}
            {detail.session.notes && ` • "${detail.session.notes}"`}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadActiveSession()}
            className="px-3 py-2 rounded-xl border border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100 text-zinc-700 font-bold transition-all cursor-pointer flex items-center gap-1.5"
            title="Muat ulang data sesi"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleCancelSession()}
            className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 active:bg-rose-100 font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Batalkan Sesi
          </button>
          <button
            type="button"
            onClick={() => {
              setCommitError(null);
              setAdminPin("");
              setCommitModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Komit Selisih Stok
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Total Item Terhitung
          </div>
          <div className="text-xl font-extrabold font-mono text-zinc-900 mt-1">
            {items.length} <span className="text-xs font-normal text-zinc-500">SKU</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Selisih Lebih (Surplus)
          </div>
          <div className="text-xl font-extrabold font-mono text-emerald-600 mt-1">
            +{surplusItems.length}{" "}
            <span className="text-xs font-normal text-zinc-500">SKU</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
            Selisih Kurang (Loss)
          </div>
          <div className="text-xl font-extrabold font-mono text-rose-600 mt-1">
            -{deficitItems.length}{" "}
            <span className="text-xs font-normal text-zinc-500">SKU</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Nilai Nominal Selisih (HPP)
          </div>
          <div
            className={`text-xl font-extrabold font-mono mt-1 ${
              totalDiscrepancyCost < 0
                ? "text-rose-600"
                : totalDiscrepancyCost > 0
                ? "text-emerald-600"
                : "text-zinc-900"
            }`}
          >
            {formatRupiah(totalDiscrepancyCost)}
          </div>
        </div>
      </div>

      {/* Barcode Scanner Input Card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs p-4">
        <form
          onSubmit={(e) => void handleScanSubmit(e)}
          className="flex items-center gap-3"
        >
          {/* Mode Selector */}
          <div className="flex bg-zinc-100 p-0.5 rounded-xl border border-zinc-200 shrink-0">
            <button
              type="button"
              onClick={() => setScanMode("ADD")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1 ${
                scanMode === "ADD"
                  ? "bg-teal-600 text-white shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Mode Tambah (+1)
            </button>
            <button
              type="button"
              onClick={() => setScanMode("REPLACE")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1 ${
                scanMode === "REPLACE"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              Mode Set Jumlah Pasti
            </button>
          </div>

          {/* Barcode Input */}
          <div className="flex-1 relative">
            <input
              ref={scanInputRef}
              type="text"
              required
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder="Scan Barcode USB atau ketik Kode SKU barang fisik..."
              className="w-full pl-9 pr-3.5 py-2 border border-zinc-300 rounded-xl font-mono text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all placeholder:font-sans placeholder:text-zinc-400"
            />
            <Barcode className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          </div>

          {/* Quantity Input */}
          <div className="w-24 shrink-0">
            <input
              type="number"
              min={1}
              required
              value={scanQuantity}
              onChange={(e) => setScanQuantity(e.target.value)}
              className="w-full px-2.5 py-2 text-center font-mono font-bold text-xs border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
              placeholder="Qty"
            />
          </div>

          <button
            type="submit"
            disabled={scanning || !scanCode.trim()}
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white font-bold transition-all cursor-pointer shadow-xs disabled:bg-zinc-200 disabled:cursor-not-allowed shrink-0"
          >
            {scanning ? "Mencatat..." : "Catat Hitungan"}
          </button>
        </form>
      </div>

      {/* Items Table & Search Card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        {/* Table Filter & Search Header */}
        <div className="p-3.5 border-b border-zinc-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setItemFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-colors ${
                itemFilter === "ALL"
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              Semua ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setItemFilter("DISCREPANCY")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-colors ${
                itemFilter === "DISCREPANCY"
                  ? "bg-rose-700 text-white"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              Hanya Selisih ({surplusItems.length + deficitItems.length})
            </button>
            <button
              type="button"
              onClick={() => setItemFilter("MATCH")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-colors ${
                itemFilter === "MATCH"
                  ? "bg-emerald-700 text-white"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              Sesuai ({matchItems.length})
            </button>
          </div>

          <div className="w-72 relative">
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Cari nama barang, barcode, SKU..."
              className="w-full pl-8 pr-3 py-1.5 border border-zinc-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-600 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3.5">SKU / Barcode</th>
                <th className="py-2.5 px-3.5">Nama Produk</th>
                <th className="py-2.5 px-3.5 text-center">Stok Sistem (Freeze)</th>
                <th className="py-2.5 px-3.5 text-center">Hitungan Fisik</th>
                <th className="py-2.5 px-3.5 text-center">Selisih Unit</th>
                <th className="py-2.5 px-3.5 text-right">Nilai Selisih (HPP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    Belum ada item opname yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isSurplus = item.discrepancy > 0;
                  const isDeficit = item.discrepancy < 0;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-zinc-50/70 transition-colors ${
                        isDeficit
                          ? "bg-rose-50/30"
                          : isSurplus
                          ? "bg-emerald-50/30"
                          : ""
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-mono">
                        <div className="font-bold text-zinc-900">{item.sku}</div>
                        <div className="text-[10px] text-zinc-400">
                          {item.barcode || "Tanpa Barcode"}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-zinc-900">
                          {item.product_name}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          Satuan: {item.unit} • HPP:{" "}
                          {formatRupiah(item.cost_price_snapshot)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-mono font-semibold text-zinc-600">
                        {item.system_stock_snapshot}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              void handleUpdateItemQty(
                                item.id,
                                Math.max(0, item.physical_count - 1)
                              )
                            }
                            className="w-6 h-6 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold flex items-center justify-center cursor-pointer text-xs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={item.physical_count}
                            onChange={(e) => {
                              const val = Math.max(
                                0,
                                parseInt(e.target.value, 10) || 0
                              );
                              void handleUpdateItemQty(item.id, val);
                            }}
                            className="w-16 px-1.5 py-1 text-center font-mono font-bold text-xs border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void handleUpdateItemQty(
                                item.id,
                                item.physical_count + 1
                              )
                            }
                            className="w-6 h-6 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold flex items-center justify-center cursor-pointer text-xs"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-mono font-bold">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${
                            isDeficit
                              ? "bg-rose-100 text-rose-800"
                              : isSurplus
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {isSurplus ? `+${item.discrepancy}` : item.discrepancy}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-3.5 text-right font-mono font-bold tabular-nums ${
                          isDeficit
                            ? "text-rose-600"
                            : isSurplus
                            ? "text-emerald-700"
                            : "text-zinc-400"
                        }`}
                      >
                        {formatRupiah(item.discrepancy_cost)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Authorization PIN Modal to Commit Opname */}
      {commitModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden">
            <div className="bg-teal-700 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-teal-200" />
                <h3 className="font-bold text-sm text-white">
                  Otorisasi Admin: Komit Opname Fisik
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCommitModalOpen(false)}
                className="text-teal-200 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleCommitSubmit(e)}
              className="p-6 space-y-4 text-xs"
            >
              {commitError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{commitError}</span>
                </div>
              )}

              <p className="text-zinc-600 leading-relaxed">
                Anda akan menerapkan seluruh hasil audit fisik sesi{" "}
                <strong>"{detail.session.session_name}"</strong>.
                Selisih stok akan otomatis dicatat sebagai mutasi koreksi stok resmi di database inventaris.
              </p>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Total Item Terhitung:</span>
                  <strong className="font-mono text-zinc-900">{items.length} SKU</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Item Selisih Kurang:</span>
                  <strong className="font-mono text-rose-600">{deficitItems.length} SKU</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Item Selisih Lebih:</span>
                  <strong className="font-mono text-emerald-600">{surplusItems.length} SKU</strong>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-200">
                  <span className="font-bold text-zinc-700">Total Nilai Selisih HPP:</span>
                  <strong className="font-mono font-bold text-zinc-900">
                    {formatRupiah(totalDiscrepancyCost)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Masukkan PIN Admin Otorisasi *
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    autoFocus
                    maxLength={10}
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    placeholder="Masukkan PIN Admin..."
                    className="w-full pl-9 pr-3.5 py-2.5 border border-zinc-300 rounded-xl font-mono text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  />
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setCommitModalOpen(false)}
                  disabled={committing}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 font-bold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={committing || !adminPin.trim()}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold transition-all cursor-pointer shadow-xs disabled:bg-zinc-300 text-xs"
                >
                  {committing ? "Menyinkronkan..." : "Otorisasi & Komit Stok"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
