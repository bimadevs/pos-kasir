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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/40 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex flex-col w-full max-w-6xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden">
        {/* Header Modal */}
        <div className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between border-b border-emerald-800/80 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-800/80 text-amber-300 border border-emerald-600/60">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight">
                Pratinjau Impor Katalog Produk (.xlsx)
              </h2>
              <p className="text-xs text-emerald-100 mt-0.5">
                File: <span className="font-semibold text-amber-200">{fileName}</span> &bull; {summary.totalRows} baris terdeteksi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="p-2 rounded-xl text-emerald-100 hover:text-white hover:bg-emerald-800/60 transition-colors cursor-pointer"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ringkasan Kartu Metrik & Status Validasi */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4 bg-zinc-50 border-b border-zinc-200">
          {/* Total Baris */}
          <div className="p-3 bg-white rounded-xl border border-zinc-200/90 shadow-2xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Baris Terdeteksi</span>
            <div className="flex items-center gap-1.5 mt-1">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span className="text-lg font-extrabold font-mono text-zinc-900">{summary.totalRows} Produk</span>
            </div>
          </div>

          {/* Produk Baru */}
          <div className="p-3 bg-white rounded-xl border border-zinc-200/90 shadow-2xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Produk Baru Ditambahkan</span>
            <div className="flex items-center gap-1.5 mt-1 text-emerald-600">
              <PlusCircle className="w-4 h-4" />
              <span className="text-lg font-extrabold font-mono">{summary.newCount} Produk</span>
            </div>
          </div>

          {/* Produk Diperbarui */}
          <div className="p-3 bg-white rounded-xl border border-zinc-200/90 shadow-2xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Produk Diperbarui (Update)</span>
            <div className="flex items-center gap-1.5 mt-1 text-amber-600">
              <RefreshCw className="w-4 h-4" />
              <span className="text-lg font-extrabold font-mono">{summary.updateCount} Produk</span>
            </div>
          </div>

          {/* Status Validasi */}
          <div
            className={`p-3 rounded-xl border shadow-2xs ${
              summary.isValid
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-rose-50 border-rose-300 text-rose-800"
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Status Integritas Data</span>
            <div className="flex items-center gap-1.5 mt-1">
              {summary.isValid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-extrabold text-emerald-800">100% Siap Impor</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span className="text-sm font-extrabold text-rose-800">
                    {summary.errorCount} Baris Bermasalah
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Peringatan Error Jika Ada Baris Tidak Valid */}
        {!summary.isValid && (
          <div className="px-6 py-3.5 bg-rose-50 border-b border-rose-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 space-y-1">
              <p className="font-bold text-rose-900">
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
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-zinc-200 bg-white">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterTab("ALL")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterTab === "ALL"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              Semua ({summary.totalRows})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("NEW")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterTab === "NEW"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              Produk Baru ({summary.newCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("UPDATE")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterTab === "UPDATE"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              Pembaruan ({summary.updateCount})
            </button>
            {summary.errorCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab("ERROR")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  filterTab === "ERROR"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                }`}
              >
                Bermasalah ({summary.errorCount})
              </button>
            )}
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Cari SKU / Barcode / Nama..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Tabel Data Pratinjau */}
        <div className="flex-1 overflow-auto max-h-[50vh]">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
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
            <tbody className="divide-y divide-zinc-200">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-zinc-400">
                    Tidak ada baris data yang cocok dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={`transition-colors ${
                      !row.isValid
                        ? "bg-rose-50/70 hover:bg-rose-100/70"
                        : row.isNew
                          ? "hover:bg-zinc-50/80"
                          : "bg-amber-50/30 hover:bg-amber-100/40"
                    }`}
                  >
                    <td className="px-3 py-2 text-center font-mono text-zinc-400">
                      #{row.rowNumber}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {!row.isValid ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          Error
                        </span>
                      ) : row.isNew ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          + Baru
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          ↺ Update
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-zinc-900">
                      {row.data.sku || <span className="text-rose-500 italic">(Kosong)</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-600">
                      {row.data.barcode || "-"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-900">
                        {row.data.name || <span className="text-rose-500 italic">(Kosong)</span>}
                      </div>
                      {!row.isValid && (
                        <div className="mt-1 text-[11px] font-semibold text-rose-600 flex flex-col gap-0.5">
                          {row.errors.map((err, i) => (
                            <span key={i}>&bull; {err}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      <span className="inline-block px-1.5 py-0.5 rounded-sm bg-zinc-100 border border-zinc-200 text-zinc-800 text-[10px] mr-1">
                        {row.data.category_name}
                      </span>
                      <span className="text-zinc-500 text-[11px] font-mono">
                        /{row.data.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-700">
                      Rp {row.data.cost_price.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                      Rp {row.data.selling_price.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-center text-zinc-600">
                      {row.data.discount_type === "NONE" ? (
                        "-"
                      ) : row.data.discount_type === "PERCENT" ? (
                        <span className="font-bold text-emerald-700">
                          {row.data.discount_value}%
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-700">
                          -Rp {row.data.discount_value.toLocaleString("id-ID")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                      {row.data.stock.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                          row.data.is_active ? "bg-emerald-600" : "bg-zinc-400"
                        }`}
                      />
                      <span className="text-[11px] font-semibold text-zinc-700">
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
        <div className="flex items-center justify-between px-6 py-4 bg-zinc-50 border-t border-zinc-200">
          <div className="text-xs">
            {summary.isValid ? (
              <span className="text-emerald-700 font-bold">
                ✓ Seluruh data lolos validasi atomik dan siap disimpan.
              </span>
            ) : (
              <span className="text-rose-700 font-bold">
                ⚠ Harap perbaiki {summary.errorCount} baris bermasalah di file Excel sebelum menyimpan.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-200 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
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
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none"
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
