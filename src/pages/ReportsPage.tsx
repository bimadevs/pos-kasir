import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Boxes,
  Calendar,
  Clock,
  Download,
  Eye,
  PieChart,
  Printer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { VoidPinModal } from "../components/pos/VoidPinModal";
import { ShiftReportPreviewModal } from "../components/receipt/ShiftReportPreviewModal";
import { FinancialReportView } from "../components/reports/FinancialReportView";
import { ProfitReportView } from "../components/reports/ProfitReportView";
import { ShiftHistoryView } from "../components/reports/ShiftHistoryView";
import { StockReportView } from "../components/reports/StockReportView";
import { useAuth } from "../context/AuthContext";
import { useTerminal } from "../context/TerminalContext";
import { ipc } from "../services/ipc";
import type { Sale, SalesReport, User } from "../types/domain";
import {
  buildSalesReportExportWorkbook,
  saveWorkbookAsFile,
} from "../utils/excelService";
import {
  formatDateTimeId,
  formatRupiah,
  todayLocalIsoDate,
} from "../utils/posCalculator";

export type ReportTab = "SALES" | "SHIFTS" | "FINANCIAL" | "PROFIT" | "STOCK";

function getLocalDateStr(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const ReportsPage: React.FC = () => {
  const {
    openReceiptPreview,
    previewShiftReport,
    previewOutcome,
    closeShiftReportPreview,
    terminalStatus,
  } = useTerminal();

  const { user } = useAuth();
  const isStockOnly = user?.role === "STOCK";

  const [activeReportTab, setActiveReportTab] = useState<ReportTab>(
    isStockOnly ? "STOCK" : "SALES"
  );

  useEffect(() => {
    if (isStockOnly && activeReportTab !== "STOCK") {
      setActiveReportTab("STOCK");
    }
  }, [isStockOnly, activeReportTab]);

  const todayStr = todayLocalIsoDate();
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [cashierId, setCashierId] = useState<string>("");
  const [terminalName, setTerminalName] = useState<string>("");

  const [users, setUsers] = useState<User[]>([]);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Muat daftar kasir untuk filter dropdown secara independen saat tab SALES aktif
  useEffect(() => {
    if (activeReportTab === "SALES" && users.length === 0) {
      ipc
        .listUsers()
        .then((userList) => setUsers(userList))
        .catch((err) => {
          console.warn("Gagal memuat daftar kasir untuk filter laporan:", err);
        });
    }
  }, [activeReportTab, users.length]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const rep = await ipc.getSalesReport({
        start_date: startDate,
        end_date: endDate,
        cashier_id: cashierId || null,
        terminal_name: terminalName.trim() || null,
      });
      setReport(rep);
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal memuat laporan: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, cashierId, terminalName]);

  useEffect(() => {
    if (activeReportTab === "SALES") {
      void loadReport();
    }
  }, [loadReport, activeReportTab]);

  const applyPreset = (preset: "TODAY" | "YESTERDAY" | "7DAYS" | "MONTH") => {
    const today = getLocalDateStr(0);
    if (preset === "TODAY") {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === "YESTERDAY") {
      const y = getLocalDateStr(-1);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === "7DAYS") {
      setStartDate(getLocalDateStr(-6));
      setEndDate(today);
    } else if (preset === "MONTH") {
      const now = new Date();
      const firstOfMonth = `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}-01`;
      setStartDate(firstOfMonth);
      setEndDate(today);
    }
  };

  const handleExportExcel = async () => {
    if (!report) return;
    try {
      const storeTitle = terminalStatus?.store_name || "Mudita Mart";
      const wb = buildSalesReportExportWorkbook(report, storeTitle);
      const filename = `laporan-penjualan-${startDate}-sd-${endDate}.xlsx`;
      await saveWorkbookAsFile(wb, filename);
      setFeedback({
        type: "success",
        message: "Laporan penjualan berhasil diekspor ke file Excel (.xlsx).",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal ekspor Excel: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const handleReprint = async (saleId: string) => {
    try {
      const receipt = await ipc.getSaleReceipt(saleId, true);
      const outcome = await ipc.printReceipt(receipt);
      openReceiptPreview(receipt, outcome);
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal cetak ulang: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const getHeaderInfo = () => {
    switch (activeReportTab) {
      case "FINANCIAL":
        return {
          title: "Laporan Arus Kas & Keuangan Komprehensif",
          desc: "Rekap omzet kotor, diskon, void, penerimaan tunai, mutasi kas operasional, dan arus kas bersih harian.",
        };
      case "PROFIT":
        return {
          title: "Laporan Laba Kotor & Analisis Margin Kategori",
          desc: "Perhitungan historis laba kotor akurat berdasarkan snapshot modal (HPP/COGS) saat transaksi terjadi (BR-03).",
        };
      case "STOCK":
        return {
          title: "Laporan Inventaris & Valuasi Nilai Stok",
          desc: "Valuasi total modal (HPP) vs harga retail, potensi laba inventaris toko, serta rekap mutasi barang.",
        };
      case "SALES":
        return {
          title: "Laporan Penjualan & Riwayat Struk Transaksi",
          desc: "Audit transaksi kasir, rincian diskon, pencetakan ulang struk, dan pembatalan transaksi (Void).",
        };
      case "SHIFTS":
        return {
          title: "Riwayat Shift Kasir & Rekap Kas Laci (Laporan X & Z)",
          desc: "Audit rekap kas, saldo modal awal (float), mutasi kas masuk/keluar, dan selisih kas fisik laci (cash discrepancy).",
        };
    }
  };
  const headerInfo = getHeaderInfo();

  const reportModules: Array<{
    id: ReportTab;
    title: string;
    subtitle: string;
    badge: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "FINANCIAL",
      title: "Arus Kas & Keuangan",
      subtitle: "Omzet, diskon, void, kas operasional, & arus kas harian",
      badge: "Keuangan Lengkap",
      icon: <Wallet className="w-4 h-4 text-teal-600" />,
    },
    {
      id: "PROFIT",
      title: "Laba Kotor (Profit)",
      subtitle: "Margin laba & snapshot HPP/COGS historis per kategori",
      badge: "Laba & Margin",
      icon: <PieChart className="w-4 h-4 text-indigo-600" />,
    },
    {
      id: "STOCK",
      title: "Inventaris & Nilai Stok",
      subtitle: "Valuasi total modal HPP vs harga retail & rekap mutasi",
      badge: "Laporan Stok",
      icon: <Boxes className="w-4 h-4 text-amber-600" />,
    },
    {
      id: "SALES",
      title: "Penjualan & Struk",
      subtitle: "Audit transaksi kasir, rincian diskon, struk, & void",
      badge: "Audit Penjualan",
      icon: <TrendingUp className="w-4 h-4 text-emerald-600" />,
    },
    {
      id: "SHIFTS",
      title: "Rekap Shift & Laci Kas",
      subtitle: "Saldo modal awal, fisik laci, & Laporan X / Z",
      badge: "Kas Laci",
      icon: <Clock className="w-4 h-4 text-sky-600" />,
    },
  ];

  const visibleModules = isStockOnly
    ? reportModules.filter((m) => m.id === "STOCK")
    : reportModules;

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-zinc-100/70 space-y-5">
      {/* Header Pusat Laporan */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-teal-100 text-teal-800 border border-teal-200 uppercase tracking-wider">
              {user?.role === "ADMIN"
                ? "Hak Akses Penuh: Admin"
                : user?.role === "STOCK"
                ? "Petugas Stok"
                : "Petugas Laporan"}
            </span>
            <span className="text-xs text-zinc-400">•</span>
            <span className="text-xs font-semibold text-zinc-500">
              Pusat Laporan Lengkap Mudita Mart
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight mt-1">
            {headerInfo.title}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {headerInfo.desc}
          </p>
        </div>

        {activeReportTab === "SALES" && (
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={!report || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-zinc-800 text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            title="Ekspor Laporan Penjualan 2-Sheet (Ringkasan & Rincian) ke format Excel (.xlsx)"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Ekspor Excel Laporan
          </button>
        )}
      </div>

      {/* Grid Kartu Menu Laporan Lengkap (Pusat Navigasi Visual) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 print:hidden">
        {visibleModules.map((mod) => {
          const isActive = activeReportTab === mod.id;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => setActiveReportTab(mod.id)}
              className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                isActive
                  ? "bg-white border-teal-600 shadow-md ring-2 ring-teal-500/20"
                  : "bg-white/80 border-zinc-200/90 hover:border-zinc-300 hover:bg-white shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`p-2 rounded-xl border ${
                    isActive
                      ? "bg-teal-50 border-teal-200 shadow-2xs"
                      : "bg-zinc-50 border-zinc-200/80"
                  }`}
                >
                  {mod.icon}
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive
                      ? "bg-teal-600 text-white"
                      : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                  }`}
                >
                  {isActive ? "Aktif" : mod.badge}
                </span>
              </div>
              <div>
                <h3
                  className={`text-xs font-extrabold ${
                    isActive ? "text-teal-950" : "text-zinc-800"
                  }`}
                >
                  {mod.title}
                </h3>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5 leading-snug">
                  {mod.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Subtab Switcher (Tab Strip Ringkas) */}
      <div className="flex border-b border-zinc-200 gap-1 overflow-x-auto print:hidden">
        {!isStockOnly && (
          <>
            <button
              type="button"
              onClick={() => setActiveReportTab("FINANCIAL")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeReportTab === "FINANCIAL"
                  ? "border-teal-600 text-teal-700 bg-white rounded-t-xl border-t border-x border-zinc-200 -mb-px shadow-2xs"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Wallet className="w-4 h-4" />
              Arus Kas &amp; Keuangan
            </button>
            <button
              type="button"
              onClick={() => setActiveReportTab("PROFIT")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeReportTab === "PROFIT"
                  ? "border-teal-600 text-teal-700 bg-white rounded-t-xl border-t border-x border-zinc-200 -mb-px shadow-2xs"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <PieChart className="w-4 h-4" />
              Laba Kotor (Gross Profit)
            </button>
            <button
              type="button"
              onClick={() => setActiveReportTab("STOCK")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeReportTab === "STOCK"
                  ? "border-teal-600 text-teal-700 bg-white rounded-t-xl border-t border-x border-zinc-200 -mb-px shadow-2xs"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Boxes className="w-4 h-4" />
              Inventaris &amp; Nilai Stok
            </button>
            <button
              type="button"
              onClick={() => setActiveReportTab("SALES")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeReportTab === "SALES"
                  ? "border-teal-600 text-teal-700 bg-white rounded-t-xl border-t border-x border-zinc-200 -mb-px shadow-2xs"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Penjualan &amp; Struk
            </button>
            <button
              type="button"
              onClick={() => setActiveReportTab("SHIFTS")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeReportTab === "SHIFTS"
                  ? "border-teal-600 text-teal-700 bg-white rounded-t-xl border-t border-x border-zinc-200 -mb-px shadow-2xs"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Clock className="w-4 h-4" />
              Rekap Shift &amp; Kas Laci
            </button>
          </>
        )}
        {isStockOnly && (
          <button
            type="button"
            onClick={() => setActiveReportTab("STOCK")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeReportTab === "STOCK"
                ? "border-teal-600 text-teal-700 bg-white rounded-t-xl border-t border-x border-zinc-200 -mb-px shadow-2xs"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Boxes className="w-4 h-4" />
            Inventaris &amp; Nilai Stok
          </button>
        )}
      </div>

      {activeReportTab === "SHIFTS" && <ShiftHistoryView />}
      {activeReportTab === "FINANCIAL" && <FinancialReportView />}
      {activeReportTab === "PROFIT" && <ProfitReportView />}
      {activeReportTab === "STOCK" && <StockReportView />}

      {activeReportTab === "SALES" && (
        <>
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

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-4 flex flex-wrap items-end justify-between gap-4 shadow-2xs">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <div>
            <label className="block font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Dari Tanggal
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-zinc-300 rounded-xl font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
            />
          </div>
          <div>
            <label className="block font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-zinc-300 rounded-xl font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
            />
          </div>
          <div>
            <label className="block font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Filter Kasir
            </label>
            <select
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className="px-3 py-2 border border-zinc-300 rounded-xl bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
            >
              <option value="">Semua Kasir</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Filter Terminal
            </label>
            <input
              type="text"
              value={terminalName}
              onChange={(e) => setTerminalName(e.target.value)}
              placeholder="Semua Terminal..."
              className="px-3 py-2 border border-zinc-300 rounded-xl text-zinc-900 w-40 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all placeholder:text-zinc-400"
            />
          </div>
        </div>

        {/* Date Presets */}
        <div className="flex items-center gap-1.5 text-xs">
          <Calendar className="w-4 h-4 text-zinc-400 mr-1" />
          <button
            type="button"
            onClick={() => applyPreset("TODAY")}
            className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 active:bg-zinc-200 active:scale-[0.98] font-bold text-zinc-700 transition-all cursor-pointer"
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => applyPreset("YESTERDAY")}
            className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 active:bg-zinc-200 active:scale-[0.98] font-bold text-zinc-700 transition-all cursor-pointer"
          >
            Kemarin
          </button>
          <button
            type="button"
            onClick={() => applyPreset("7DAYS")}
            className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 active:bg-zinc-200 active:scale-[0.98] font-bold text-zinc-700 transition-all cursor-pointer"
          >
            7 Hari
          </button>
          <button
            type="button"
            onClick={() => applyPreset("MONTH")}
            className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 active:bg-zinc-200 active:scale-[0.98] font-bold text-zinc-700 transition-all cursor-pointer"
          >
            Bulan Ini
          </button>
        </div>
      </div>

      {/* Financial Summary KPI Cards */}
      {report && (
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-emerald-700 text-white rounded-2xl p-4 shadow-xs border border-emerald-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">
              Omzet Bersih (Net Sales)
            </div>
            <div className="text-2xl font-black font-mono text-amber-300 mt-1 tabular-nums">
              {formatRupiah(report.net_sales)}
            </div>
            <div className="text-[11px] text-emerald-100/90 mt-1 font-mono">
              Kotor: {formatRupiah(report.gross_sales)}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Total Diskon Diberikan
            </div>
            <div className="text-2xl font-extrabold font-mono text-amber-600 mt-1 tabular-nums">
              {formatRupiah(report.total_discount)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Potongan harga item
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Total Modal (HPP / COGS)
            </div>
            <div className="text-2xl font-extrabold font-mono text-zinc-800 mt-1 tabular-nums">
              {formatRupiah(report.total_cogs)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Snapshot cost_price_snapshot
            </div>
          </div>

          <div className="bg-emerald-950/5 border border-emerald-200/80 rounded-2xl p-4 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              Laba Kotor (Gross Profit)
            </div>
            <div className="text-2xl font-extrabold font-mono text-emerald-700 mt-1 tabular-nums">
              {formatRupiah(report.gross_profit)}
            </div>
            <div className="text-[11px] text-emerald-700 mt-1 font-semibold">
              Omzet Bersih − Total HPP
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Volume Transaksi
            </div>
            <div className="text-2xl font-extrabold font-mono text-zinc-900 mt-1 tabular-nums">
              {report.completed_sales_count}{" "}
              <span className="text-xs font-sans font-semibold text-zinc-500">
                Sukses
              </span>
            </div>
            <div className="text-[11px] text-rose-600 mt-1 font-semibold">
              Transaksi Void: {report.voided_sales_count}
            </div>
          </div>
        </div>
      )}

      {/* Middle 2-Column Insights: Top Selling Products & Low Stock Alerts */}
      {report && (
        <div className="grid grid-cols-12 gap-5">
          {/* Top Selling Products */}
          <div className="col-span-7 bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-200 font-bold text-sm text-zinc-900">
              Produk Terlaris Periode Ini
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase text-zinc-500 tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Produk</th>
                  <th className="py-2.5 px-4 text-right">Terjual</th>
                  <th className="py-2.5 px-4 text-right">Omzet Bersih</th>
                  <th className="py-2.5 px-4 text-right">Laba Kotor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {report.top_products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-zinc-400">
                      Belum ada data penjualan produk pada periode ini.
                    </td>
                  </tr>
                ) : (
                  report.top_products.slice(0, 8).map((tp) => (
                    <tr key={tp.product_id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-zinc-900">
                          {tp.product_name}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-400">
                          {tp.sku}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-zinc-800 tabular-nums">
                        {tp.total_qty_sold} {tp.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-zinc-800 tabular-nums">
                        {formatRupiah(tp.net_revenue)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                        {formatRupiah(tp.gross_profit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Low Stock Alert Widget */}
          <div className="col-span-5 bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-200 font-bold text-sm text-zinc-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Peringatan Stok Menipis / Habis (≤ 5)
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-mono font-bold">
                {report.low_stock_products.length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 text-xs">
              {report.low_stock_products.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">
                  Seluruh stok produk berada di atas batas aman (&gt; 5).
                </div>
              ) : (
                report.low_stock_products.map((prod) => (
                  <div
                    key={prod.product_id}
                    className="px-4 py-2.5 flex items-center justify-between hover:bg-zinc-50/80 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-zinc-900">
                        {prod.product_name}
                      </div>
                      <div className="font-mono text-[11px] text-zinc-400">
                        SKU: {prod.sku} • {prod.category_name}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full font-mono font-bold text-xs ${
                        prod.stock <= 0
                          ? "bg-rose-50 border border-rose-200 text-rose-700"
                          : "bg-amber-50 border border-amber-200 text-amber-800"
                      }`}
                    >
                      {prod.stock <= 0
                        ? "HABIS (0)"
                        : `Sisa: ${prod.stock} ${prod.unit}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detailed Sales Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 font-bold text-sm text-zinc-900">
          Daftar Transaksi Penjualan ({report?.sales.length || 0})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="py-3 px-4">No. Struk</th>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Kasir &amp; Terminal</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">Diskon</th>
                <th className="py-3 px-4 text-right">Total Bayar</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-500">
                    Memuat data laporan...
                  </td>
                </tr>
              ) : !report || report.sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-500">
                    Tidak ada transaksi pada rentang tanggal ini.
                  </td>
                </tr>
              ) : (
                report.sales.map(({ sale, items }) => {
                  const isVoided = sale.status === "VOIDED";
                  const isSameDay = sale.transaction_date === todayStr;
                  const isExpanded = expandedSaleId === sale.id;

                  return (
                    <React.Fragment key={sale.id}>
                      <tr
                        className={`hover:bg-zinc-50/80 transition-colors ${
                          isVoided ? "bg-rose-50/30 text-zinc-500" : ""
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-zinc-900">
                          {sale.receipt_number}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-600">
                          {formatDateTimeId(sale.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-zinc-800">
                            {sale.cashier_name_snapshot}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {sale.terminal_name}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {formatRupiah(sale.subtotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-700 tabular-nums">
                          {sale.discount_total > 0
                            ? `-${formatRupiah(sale.discount_total)}`
                            : "-"}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-extrabold tabular-nums ${
                            isVoided
                              ? "line-through text-zinc-400"
                              : "text-zinc-900"
                          }`}
                        >
                          {formatRupiah(sale.total_amount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              isVoided
                                ? "bg-rose-50 border border-rose-200/60 text-rose-700"
                                : "bg-emerald-50 border border-emerald-200/60 text-emerald-800"
                            }`}
                          >
                            {sale.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSaleId(isExpanded ? null : sale.id)
                              }
                              className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 active:bg-zinc-200 active:scale-[0.98] text-zinc-700 transition-all cursor-pointer"
                              title="Lihat Rincian Item"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {!isVoided && (
                              <button
                                type="button"
                                onClick={() => void handleReprint(sale.id)}
                                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98] text-white transition-all cursor-pointer shadow-2xs"
                                title="Cetak Ulang Struk"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!isVoided && isSameDay && user?.role === "ADMIN" && (
                              <button
                                type="button"
                                onClick={() => setVoidTarget(sale)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 active:bg-rose-200 active:scale-[0.98] border border-rose-200 text-rose-700 transition-all cursor-pointer"
                                title="Void Transaksi (Hari Ini)"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-zinc-50 border-t border-b border-zinc-200/60">
                          <td colSpan={8} className="px-6 py-3">
                            <div className="text-xs space-y-1">
                              <div className="font-bold text-zinc-700 mb-1">
                                Snapshot Item Struk {sale.receipt_number}:
                              </div>
                              {items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between text-zinc-700 font-mono"
                                >
                                  <span>
                                    [{item.sku_snapshot}]{" "}
                                    {item.product_name_snapshot} ×{" "}
                                    {item.quantity} (HPP:{" "}
                                    {formatRupiah(item.cost_price_snapshot)},
                                    Jual:{" "}
                                    {formatRupiah(item.selling_price_snapshot)}
                                    {item.unit_discount_amount > 0
                                      ? `, Diskon: -${formatRupiah(
                                          item.unit_discount_amount
                                        )}`
                                      : ""}
                                    )
                                  </span>
                                  <span className="font-bold text-zinc-900">
                                    {formatRupiah(item.subtotal)}
                                  </span>
                                </div>
                              ))}
                              {sale.void_reason && (
                                <div className="text-rose-700 font-semibold pt-1">
                                  Alasan Void: {sale.void_reason} (Oleh:{" "}
                                  {sale.voided_by_name_snapshot})
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

          <VoidPinModal
            sale={voidTarget}
            onClose={() => setVoidTarget(null)}
            onConfirmVoid={async (saleId, adminPin, voidReason) => {
              await ipc.voidSale({
                sale_id: saleId,
                admin_pin: adminPin,
                void_reason: voidReason,
              });
              await loadReport();
              setFeedback({
                type: "success",
                message:
                  "Transaksi berhasil dibatalkan (Void) dan stok dikembalikan.",
              });
            }}
          />
        </>
      )}

      {/* Shift Report Preview & Reprint Modal */}
      <ShiftReportPreviewModal
        report={previewShiftReport}
        outcome={previewOutcome}
        onClose={closeShiftReportPreview}
      />
    </div>
  );
};
