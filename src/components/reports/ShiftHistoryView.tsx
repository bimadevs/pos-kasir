import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import { useTerminal } from "../../context/TerminalContext";
import { ipc } from "../../services/ipc";
import type { CashierShift } from "../../types/domain";
import { formatDateTimeId, formatRupiah } from "../../utils/posCalculator";

export const ShiftHistoryView: React.FC = () => {
  const { openShiftReportPreview } = useTerminal();
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "OPEN" | "CLOSED">(
    "ALL"
  );
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [printingId, setPrintingId] = useState<string | null>(null);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await ipc.listShifts(null, null);
      setShifts(list);
    } catch (err) {
      setError(
        `Gagal memuat riwayat shift: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

  const handlePreviewReport = async (shift: CashierShift) => {
    setPrintingId(shift.id);
    try {
      const report = await ipc.getShiftXReport(shift.id);
      openShiftReportPreview(report);
    } catch (err) {
      setError(
        `Gagal membuka laporan shift: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setPrintingId(null);
    }
  };

  const filteredShifts = shifts.filter((s) => {
    if (filterStatus === "OPEN" && s.status !== "OPEN") return false;
    if (filterStatus === "CLOSED" && s.status !== "CLOSED") return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = s.cashier_name_snapshot.toLowerCase().includes(term);
      const matchTerm = s.terminal_name.toLowerCase().includes(term);
      if (!matchName && !matchTerm) return false;
    }
    return true;
  });

  // Calculate summary metrics
  const totalCashSales = shifts.reduce((sum, s) => sum + s.cash_sales_total, 0);
  const totalDiscrepancy = shifts.reduce(
    (sum, s) => sum + (s.cash_discrepancy || 0),
    0
  );
  const openShiftsCount = shifts.filter((s) => s.status === "OPEN").length;

  return (
    <div className="space-y-4 text-xs">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Total Sesi Shift Tercatat
          </div>
          <div className="text-xl font-extrabold font-mono text-zinc-900 mt-1">
            {shifts.length}{" "}
            <span className="text-xs font-normal text-zinc-500">
              ({openShiftsCount} aktif)
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
            Total Penjualan Tunai
          </div>
          <div className="text-xl font-extrabold font-mono text-teal-700 mt-1">
            {formatRupiah(totalCashSales)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Total Selisih Kas Laci
          </div>
          <div
            className={`text-xl font-extrabold font-mono mt-1 ${
              totalDiscrepancy < 0
                ? "text-rose-600"
                : totalDiscrepancy > 0
                ? "text-emerald-600"
                : "text-zinc-800"
            }`}
          >
            {formatRupiah(totalDiscrepancy)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs flex items-center justify-end">
          <button
            type="button"
            onClick={() => void loadShifts()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:bg-zinc-100 text-zinc-700 font-bold shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Muat Ulang Data
          </button>
        </div>
      </div>

      {/* Filter and Table Card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="p-3.5 border-b border-zinc-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterStatus("ALL")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-colors ${
                filterStatus === "ALL"
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              Semua Shift ({shifts.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("OPEN")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-colors ${
                filterStatus === "OPEN"
                  ? "bg-emerald-700 text-white"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              Shift Aktif ({openShiftsCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("CLOSED")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-colors ${
                filterStatus === "CLOSED"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              Shift Ditutup ({shifts.length - openShiftsCount})
            </button>
          </div>

          <div className="w-72 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama kasir / terminal..."
              className="w-full pl-8 pr-3 py-1.5 border border-zinc-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="py-2.5 px-3.5">Status</th>
                <th className="py-2.5 px-3.5">Kasir &amp; Terminal</th>
                <th className="py-2.5 px-3.5">Waktu Buka / Tutup</th>
                <th className="py-2.5 px-3.5 text-right">Modal Awal</th>
                <th className="py-2.5 px-3.5 text-right">Penjualan Kas</th>
                <th className="py-2.5 px-3.5 text-right">Kas Masuk / Keluar</th>
                <th className="py-2.5 px-3.5 text-right">Kas Diharapkan</th>
                <th className="py-2.5 px-3.5 text-right">Kas Fisik Aktual</th>
                <th className="py-2.5 px-3.5 text-right">Selisih</th>
                <th className="py-2.5 px-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-zinc-400">
                    Memuat daftar riwayat shift...
                  </td>
                </tr>
              ) : filteredShifts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-zinc-400">
                    Tidak ada sesi shift yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredShifts.map((shift) => {
                  const isOpen = shift.status === "OPEN";
                  const discrepancy = shift.cash_discrepancy ?? 0;

                  return (
                    <tr
                      key={shift.id}
                      className={`hover:bg-zinc-50/70 transition-colors ${
                        isOpen ? "bg-emerald-50/20" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isOpen
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-zinc-100 text-zinc-700 border border-zinc-200"
                          }`}
                        >
                          {isOpen ? "BUKA (OPEN)" : "TUTUP (CLOSED)"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="font-bold text-zinc-900">
                          {shift.cashier_name_snapshot}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {shift.terminal_name}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-[11px] font-mono text-zinc-600">
                        <div>Buka: {formatDateTimeId(shift.opened_at)}</div>
                        {shift.closed_at ? (
                          <div className="text-zinc-500">
                            Tutup: {formatDateTimeId(shift.closed_at)}
                          </div>
                        ) : (
                          <div className="text-emerald-700 font-semibold">
                            Sedang Berlangsung
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-zinc-700">
                        {formatRupiah(shift.opening_float)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-teal-700">
                        {formatRupiah(shift.cash_sales_total)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-zinc-600">
                        <div className="text-emerald-700">
                          +{formatRupiah(shift.cash_in_total)}
                        </div>
                        <div className="text-rose-600">
                          -{formatRupiah(shift.cash_out_total)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-zinc-800">
                        {shift.expected_closing_cash !== null
                          ? formatRupiah(shift.expected_closing_cash)
                          : formatRupiah(
                              shift.opening_float +
                                shift.cash_sales_total +
                                shift.cash_in_total -
                                shift.cash_out_total
                            )}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-extrabold text-zinc-900">
                        {shift.actual_closing_cash !== null
                          ? formatRupiah(shift.actual_closing_cash)
                          : "-"}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold">
                        {shift.actual_closing_cash !== null ? (
                          <span
                            className={
                              discrepancy < 0
                                ? "text-rose-600"
                                : discrepancy > 0
                                ? "text-emerald-600"
                                : "text-zinc-600"
                            }
                          >
                            {discrepancy > 0
                              ? `+${formatRupiah(discrepancy)}`
                              : formatRupiah(discrepancy)}
                          </span>
                        ) : (
                          <span className="text-zinc-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <button
                          type="button"
                          disabled={printingId === shift.id}
                          onClick={() => void handlePreviewReport(shift)}
                          className="px-2.5 py-1 rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                          title={
                            isOpen
                              ? "Pratinjau / Cetak Laporan X"
                              : "Pratinjau / Cetak Ulang Laporan Z"
                          }
                        >
                          <Printer className="w-3.5 h-3.5" />
                          {isOpen ? "Laporan X" : "Laporan Z"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
