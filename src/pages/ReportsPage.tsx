import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Calendar,
  Download,
  Eye,
  Printer,
  TrendingUp,
} from "lucide-react";
import { VoidPinModal } from "../components/pos/VoidPinModal";
import { useTerminal } from "../context/TerminalContext";
import { ipc } from "../services/ipc";
import type { Sale, SalesReport, User } from "../types/domain";
import {
  formatDateTimeId,
  formatRupiah,
  todayLocalIsoDate,
} from "../utils/posCalculator";

function getLocalDateStr(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const ReportsPage: React.FC = () => {
  const { openReceiptPreview } = useTerminal();

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

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const [rep, userList] = await Promise.all([
        ipc.getSalesReport({
          start_date: startDate,
          end_date: endDate,
          cashier_id: cashierId || null,
          terminal_name: terminalName.trim() || null,
        }),
        ipc.listUsers(),
      ]);
      setReport(rep);
      setUsers(userList);
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
    void loadReport();
  }, [loadReport]);

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

  const handleExportCsv = async () => {
    try {
      const csvContent = await ipc.exportSalesReportCsv({
        start_date: startDate,
        end_date: endDate,
        cashier_id: cashierId || null,
        terminal_name: terminalName.trim() || null,
      });
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-penjualan-${startDate}-sd-${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback({
        type: "success",
        message: "Laporan penjualan berhasil diekspor ke file CSV.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal ekspor CSV: ${
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

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-zinc-100/70 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">
            Laporan Penjualan &amp; Laba Kotor (Gross Profit)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Perhitungan historis akurat berdasarkan snapshot harga jual, diskon, dan HPP saat transaksi terjadi (BR-03).
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleExportCsv()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-zinc-800 text-xs font-bold shadow-2xs transition-all cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-600" />
          Export CSV Laporan
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
          <div className="bg-zinc-950 text-white rounded-2xl p-4 shadow-xs border border-zinc-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Omzet Bersih (Net Sales)
            </div>
            <div className="text-2xl font-extrabold font-mono text-emerald-400 mt-1 tabular-nums">
              {formatRupiah(report.net_sales)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 font-mono">
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
                                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 active:scale-[0.98] text-white transition-all cursor-pointer shadow-2xs"
                                title="Cetak Ulang Struk"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!isVoided && isSameDay && (
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
    </div>
  );
};
