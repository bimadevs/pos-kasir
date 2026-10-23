import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  PlusCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { ParsedImportSummary, ProductImportRow } from "../../types/domain";

interface ProductImportPreviewModalProps {
  fileName: string;
  summary: ParsedImportSummary;
  isSaving: boolean;
  onConfirm: (rows: ProductImportRow[]) => void;
  onCancel: () => void;
}

type FilterTab = "ALL" | "NEW" | "UPDATE" | "ERROR";

export const ProductImportPreviewModal: React.FC<
  ProductImportPreviewModalProps
> = ({ fileName, summary, isSaving, onConfirm, onCancel }) => {
  const [filterTab, setFilterTab] = useState<FilterTab>("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Tutup modal dengan tombol Escape jika sedang tidak menyimpan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onCancel]);

  const filteredRows = useMemo(() => {
    return summary.rows.filter((r) => {
      // Filter Tab
      if (filterTab === "NEW" && !r.isNew) return false;
      if (filterTab === "UPDATE" && (r.isNew || !r.isValid)) return false;
      if (filterTab === "ERROR" && r.isValid) return false;

      // Filter Pencarian
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        r.data.sku.toLowerCase().includes(q) ||
        (r.data.barcode && r.data.barcode.toLowerCase().includes(q)) ||
        r.data.name.toLowerCase().includes(q) ||
        r.data.category_name.toLowerCase().includes(q)
      );
    });
  }, [summary.rows, filterTab, searchTerm]);

  const handleSave = () => {
    if (!summary.isValid || isSaving) return;
    const validRows = summary.rows.map((r) => r.data);
    onConfirm(validRows);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex flex-col w-full max-w-6xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Pratinjau Impor Katalog Produk (.xlsx)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                File: <span className="font-semibold text-slate-700 dark:text-slate-300">{fileName}</span> &bull; {summary.totalRows} baris terdeteksi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ringkasan Kartu Metrik & Status Validasi */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
          {/* Total Baris */}
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Baris Terdeteksi</span>
            <div className="flex items-center gap-1.5 mt-1">
              <FileSpreadsheet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-lg font-bold text-slate-900 dark:text-white">{summary.totalRows} Produk</span>
            </div>
          </div>

          {/* Produk Baru */}
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Produk Baru Ditambahkan</span>
            <div className="flex items-center gap-1.5 mt-1 text-emerald-600 dark:text-emerald-400">
              <PlusCircle className="w-4 h-4" />
              <span className="text-lg font-bold">{summary.newCount} Produk</span>
            </div>
          </div>

          {/* Produk Diperbarui */}
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Produk Diperbarui (Update)</span>
            <div className="flex items-center gap-1.5 mt-1 text-amber-600 dark:text-amber-400">
              <RefreshCw className="w-4 h-4" />
              <span className="text-lg font-bold">{summary.updateCount} Produk</span>
            </div>
          </div>

          {/* Status Validasi */}
          <div
            className={`p-3 rounded-xl border shadow-2xs ${
              summary.isValid
                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60"
                : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60"
            }`}
          >
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Status Integritas Data</span>
            <div className="flex items-center gap-1.5 mt-1">
              {summary.isValid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">100% Siap Impor</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span className="text-sm font-bold text-rose-700 dark:text-rose-300">
                    {summary.errorCount} Baris Bermasalah
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Peringatan Error Jika Ada Baris Tidak Valid */}
        {!summary.isValid && (
          <div className="px-6 py-3.5 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-900/60 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 dark:text-rose-200 space-y-1">
              <p className="font-semibold text-rose-900 dark:text-rose-100">
                Ditemukan kesalahan data pada {summary.errorCount} baris di dalam file Excel.
              </p>
              <p>
                Demi melindungi database dan akurasi stok toko, sistem mewajibkan seluruh baris valid (Atomic Transaction).
                Periksa baris bertanda merah di tabel bawah, perbaiki file Excel Anda, dan unggah ulang.
              </p>
            </div>
          </div>
        )}

        {/* Bar Filter & Pencarian */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterTab("ALL")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filterTab === "ALL"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              Semua ({summary.totalRows})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("NEW")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filterTab === "NEW"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              Produk Baru ({summary.newCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("UPDATE")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filterTab === "UPDATE"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              Pembaruan ({summary.updateCount})
            </button>
            {summary.errorCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab("ERROR")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  filterTab === "ERROR"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-200"
                }`}
              >
                Bermasalah ({summary.errorCount})
              </button>
            )}
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari SKU / Barcode / Nama..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Tabel Data Pratinjau */}
        <div className="flex-1 overflow-auto max-h-[50vh]">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-3 py-2.5 text-center w-12">Baris</th>
                <th className="px-3 py-2.5 text-center w-24">Aksi</th>
                <th className="px-3 py-2.5">Kode SKU</th>
                <th className="px-3 py-2.5">Barcode</th>
                <th className="px-3 py-2.5 min-w-[180px]">Nama Produk</th>
                <th className="px-3 py-2.5">Kategori / Satuan</th>
                <th className="px-3 py-2.5 text-right">Harga Modal (HPP)</th>
                <th className="px-3 py-2.5 text-right">Harga Jual</th>
                <th className="px-3 py-2.5 text-center">Diskon</th>
                <th className="px-3 py-2.5 text-right">Stok</th>
                <th className="px-3 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    Tidak ada baris data yang cocok dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={`transition-colors ${
                      !row.isValid
                        ? "bg-rose-50/60 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        : row.isNew
                          ? "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          : "bg-amber-50/20 dark:bg-amber-950/10 hover:bg-amber-50/40"
                    }`}
                  >
                    <td className="px-3 py-2 text-center font-mono text-slate-400">
                      #{row.rowNumber}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {!row.isValid ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200">
                          Error
                        </span>
                      ) : row.isNew ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                          + Baru
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                          ↺ Update
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {row.data.sku || <span className="text-rose-500 italic">(Kosong)</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                      {row.data.barcode || "-"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {row.data.name || <span className="text-rose-500 italic">(Kosong)</span>}
                      </div>
                      {!row.isValid && (
                        <div className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex flex-col gap-0.5">
                          {row.errors.map((err, i) => (
                            <span key={i}>&bull; {err}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      <span className="inline-block px-1.5 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800 text-[10px] mr-1">
                        {row.data.category_name}
                      </span>
                      <span className="text-slate-400 text-[11px] font-mono">
                        /{row.data.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">
                      Rp {row.data.cost_price.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 dark:text-white">
                      Rp {row.data.selling_price.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                      {row.data.discount_type === "NONE" ? (
                        "-"
                      ) : row.data.discount_type === "PERCENT" ? (
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {row.data.discount_value}%
                        </span>
                      ) : (
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          -Rp {row.data.discount_value.toLocaleString("id-ID")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {row.data.stock.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                          row.data.is_active ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      <span className="text-[11px]">
                        {row.data.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Modal */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {summary.isValid ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                ✓ Seluruh data lolos validasi atomik dan siap disimpan.
              </span>
            ) : (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                ⚠ Harap perbaiki {summary.errorCount} baris bermasalah di file Excel sebelum menyimpan.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
            >
              Batal / Pilih File Lain
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!summary.isValid || isSaving || summary.totalRows === 0}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all shadow-md ${
                summary.isValid && !isSaving && summary.totalRows > 0
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-emerald-600/20 active:scale-98 cursor-pointer"
                  : "bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed shadow-none"
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyimpan ke Database...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan ke Database ({summary.totalRows} Produk)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
