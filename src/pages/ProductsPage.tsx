import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Edit3,
  FileSpreadsheet,
  PackagePlus,
  PowerOff,
  Search,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { ipc } from "../services/ipc";
import type {
  DiscountType,
  Product,
  UpsertProductRequest,
} from "../types/domain";
import {
  calculateEffectiveUnitPrice,
  calculateUnitDiscount,
  formatRupiah,
} from "../utils/posCalculator";

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [stockFilter, setStockFilter] = useState<
    "ALL" | "LOW" | "OUT" | "PROMO"
  >("ALL");
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formSku, setFormSku] = useState<string>("");
  const [formBarcode, setFormBarcode] = useState<string>("");
  const [formName, setFormName] = useState<string>("");
  const [formCategory, setFormCategory] = useState<string>("Umum");
  const [formUnit, setFormUnit] = useState<string>("pcs");
  const [formCostPrice, setFormCostPrice] = useState<string>("0");
  const [formSellingPrice, setFormSellingPrice] = useState<string>("0");
  const [formDiscountType, setFormDiscountType] =
    useState<DiscountType>("NONE");
  const [formDiscountValue, setFormDiscountValue] = useState<string>("0");
  const [formInitialStock, setFormInitialStock] = useState<string>("0");
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ipc.listProducts({
        search: search.trim() || null,
        only_active: !includeInactive,
      });
      setProducts(list);
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal memuat produk: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      setLoading(false);
    }
  }, [search, includeInactive]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProducts();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormSku(`PRD-${Date.now().toString().slice(-5)}`);
    setFormBarcode("");
    setFormName("");
    setFormCategory("Umum");
    setFormUnit("pcs");
    setFormCostPrice("");
    setFormSellingPrice("");
    setFormDiscountType("NONE");
    setFormDiscountValue("0");
    setFormInitialStock("10");
    setFormIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormSku(product.sku);
    setFormBarcode(product.barcode || "");
    setFormName(product.name);
    setFormCategory(product.category_name || "Umum");
    setFormUnit(product.unit || "pcs");
    setFormCostPrice(String(product.cost_price));
    setFormSellingPrice(String(product.selling_price));
    setFormDiscountType(product.discount_type);
    setFormDiscountValue(String(product.discount_value));
    setFormInitialStock(String(product.stock));
    setFormIsActive(product.is_active);
    setModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    const costPrice = parseInt(formCostPrice, 10) || 0;
    const sellingPrice = parseInt(formSellingPrice, 10) || 0;
    const discountVal =
      formDiscountType === "NONE" ? 0 : parseInt(formDiscountValue, 10) || 0;
    const initialStock = parseInt(formInitialStock, 10) || 0;

    setSaving(true);
    setFeedback(null);
    try {
      const payload: UpsertProductRequest = {
        id: editingProduct?.id ?? null,
        sku: formSku.trim(),
        barcode: formBarcode.trim() ? formBarcode.trim() : null,
        name: formName.trim(),
        category_name: formCategory.trim() || "Umum",
        unit: formUnit.trim() || "pcs",
        cost_price: costPrice,
        selling_price: sellingPrice,
        discount_type: formDiscountType,
        discount_value: discountVal,
        initial_stock: editingProduct ? null : initialStock,
        is_active: formIsActive,
      };
      await ipc.upsertProduct(payload);
      setModalOpen(false);
      await loadProducts();
      setFeedback({
        type: "success",
        message: editingProduct
          ? `Produk "${payload.name}" berhasil diperbarui.`
          : `Produk "${payload.name}" berhasil ditambahkan ke katalog.`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (product: Product) => {
    try {
      await ipc.deactivateProduct(product.id);
      await loadProducts();
      setFeedback({
        type: "success",
        message: `Produk "${product.name}" telah dinonaktifkan (Soft-Delete).`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleExportCsv = async () => {
    try {
      const csvContent = await ipc.exportProductsCsv();
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `katalog-produk-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback({
        type: "success",
        message: "Katalog produk berhasil diekspor ke file CSV.",
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

  const handleDownloadTemplateCsv = () => {
    const sample =
      "sku,barcode,name,category_name,unit,cost_price,selling_price,discount_type,discount_value,stock,is_active\n" +
      "SKU-101,8991002101012,Kopi Kapal Api Special 165g,Minuman,pcs,11500,14500,NONE,0,30,true\n" +
      "SKU-102,8991002101029,Biskuit Roma Kelapa 300g,Makanan,pcs,8200,10500,NOMINAL,500,25,true\n";
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-import-produk-pos-kasir.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsvFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const result = await ipc.importProductsCsv(content);
      await loadProducts();
      setFeedback({
        type: "success",
        message: `Impor CSV berhasil! ${result.total_processed} baris diproses (${result.inserted_count} produk baru, ${result.updated_count} diperbarui).`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Impor CSV dibatalkan (Atomic Rollback): ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const filteredProducts = products.filter((p) => {
    if (stockFilter === "OUT") return p.stock <= 0;
    if (stockFilter === "LOW") return p.stock > 0 && p.stock <= 5;
    if (stockFilter === "PROMO")
      return p.discount_type !== "NONE" && p.discount_value > 0;
    return true;
  });

  const outCount = products.filter((p) => p.is_active && p.stock <= 0).length;
  const lowCount = products.filter(
    (p) => p.is_active && p.stock > 0 && p.stock <= 5
  ).length;
  const promoCount = products.filter(
    (p) => p.is_active && p.discount_type !== "NONE" && p.discount_value > 0
  ).length;

  // Live preview inside modal
  const previewCost = parseInt(formCostPrice, 10) || 0;
  const previewSell = parseInt(formSellingPrice, 10) || 0;
  const previewDiscVal =
    formDiscountType === "NONE" ? 0 : parseInt(formDiscountValue, 10) || 0;
  const previewEffective = calculateEffectiveUnitPrice(
    previewSell,
    formDiscountType,
    previewDiscVal
  );
  const previewMargin = previewEffective - previewCost;

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 space-y-5">
      {/* Header & Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Manajemen Katalog Produk &amp; Diskon
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola SKU, barcode, harga modal (HPP), harga jual, serta diskon per item.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleImportCsvFile(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={handleDownloadTemplateCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
            Template CSV
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-blue-600" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs transition-colors cursor-pointer"
          >
            <PackagePlus className="w-4 h-4" />
            + Tambah Produk
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline ml-4 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Quick Filter Cards */}
      <div className="grid grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStockFilter("ALL")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === "ALL"
              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
              : "bg-white text-slate-800 border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">
            Total Katalog
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1 tabular-nums">
            {products.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStockFilter("LOW")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === "LOW"
              ? "bg-amber-600 text-white border-amber-600 shadow-xs"
              : "bg-white text-slate-800 border-slate-200 hover:border-amber-300"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">
            Stok Menipis (1–5)
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1 tabular-nums">
            {lowCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStockFilter("OUT")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === "OUT"
              ? "bg-red-600 text-white border-red-600 shadow-xs"
              : "bg-white text-slate-800 border-slate-200 hover:border-red-300"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">
            Stok Habis (0)
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1 tabular-nums">
            {outCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStockFilter("PROMO")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === "PROMO"
              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
              : "bg-white text-slate-800 border-slate-200 hover:border-blue-300"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">
            Produk Diskon Aktif
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1 tabular-nums">
            {promoCount}
          </div>
        </button>
      </div>

      {/* Search & Toggles Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
        <div className="flex items-center flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-slate-400 mr-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama produk, SKU, atau scan barcode..."
            className="w-full text-xs font-medium bg-transparent focus:outline-none text-slate-900"
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Tampilkan Produk Nonaktif
        </label>
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
            <tr>
              <th className="py-3 px-4">SKU / Barcode</th>
              <th className="py-3 px-4">Nama Produk &amp; Kategori</th>
              <th className="py-3 px-4 text-right">HPP (Modal)</th>
              <th className="py-3 px-4 text-right">Harga Jual</th>
              <th className="py-3 px-4 text-right">Diskon</th>
              <th className="py-3 px-4 text-right">Harga Efektif</th>
              <th className="py-3 px-4 text-center">Stok</th>
              <th className="py-3 px-4 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  Memuat katalog produk...
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  Tidak ada produk yang sesuai dengan filter pencarian.
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => {
                const unitDisc = calculateUnitDiscount(
                  product.selling_price,
                  product.discount_type,
                  product.discount_value
                );
                const effectivePrice = product.selling_price - unitDisc;
                const isOut = product.stock <= 0;
                const isLow = product.stock > 0 && product.stock <= 5;

                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      !product.is_active ? "opacity-55 bg-slate-50" : ""
                    }`}
                  >
                    <td className="py-3 px-4 font-mono">
                      <div className="font-bold text-slate-800">
                        {product.sku}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {product.barcode || "Tanpa Barcode"}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-sm">
                        {product.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Kategori: {product.category_name || "Umum"} • Satuan:{" "}
                        {product.unit}
                        {!product.is_active && (
                          <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">
                            NONAKTIF
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                      {formatRupiah(product.cost_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800 tabular-nums">
                      {formatRupiah(product.selling_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {unitDisc > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                          <Tag className="w-3 h-3" />
                          {product.discount_type === "PERCENT"
                            ? `${product.discount_value}% (-${formatRupiah(
                                unitDisc
                              )})`
                            : `-${formatRupiah(unitDisc)}`}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {formatRupiah(effectivePrice)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono font-bold text-xs tabular-nums ${
                          isOut
                            ? "bg-red-100 text-red-700"
                            : isLow
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {(isOut || isLow) && (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {product.stock}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(product)}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="Edit Produk"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {product.is_active && (
                          <button
                            type="button"
                            onClick={() => void handleDeactivate(product)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Nonaktifkan Produk"
                          >
                            <PowerOff className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingProduct ? "Edit Data Produk" : "Tambah Produk Baru"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSaveProduct(e)}
              className="p-6 space-y-4 text-xs"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Kode SKU *
                  </label>
                  <input
                    type="text"
                    required
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Kode Barcode (EAN/UPC)
                  </label>
                  <input
                    type="text"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    placeholder="Scan atau ketik barcode..."
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Nama Produk *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Contoh: Indomie Goreng 85g"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Kategori
                  </label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="Makanan / Minuman"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Satuan
                  </label>
                  <input
                    type="text"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    placeholder="pcs / btl / bks"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Harga Modal / HPP (Rp) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(e.target.value)}
                    className="w-full px-3 py-2 font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Harga Jual Normal (Rp) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formSellingPrice}
                    onChange={(e) => setFormSellingPrice(e.target.value)}
                    className="w-full px-3 py-2 font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Tipe Diskon Produk
                  </label>
                  <select
                    value={formDiscountType}
                    onChange={(e) =>
                      setFormDiscountType(e.target.value as DiscountType)
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="NONE">Tanpa Diskon (NONE)</option>
                    <option value="NOMINAL">
                      Potongan Nominal Rupiah (Rp)
                    </option>
                    <option value="PERCENT">Potongan Persentase (%)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Nilai Diskon{" "}
                    {formDiscountType === "PERCENT" ? "(0–100%)" : "(Rp)"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={formDiscountType === "PERCENT" ? 100 : undefined}
                    disabled={formDiscountType === "NONE"}
                    value={formDiscountType === "NONE" ? "0" : formDiscountValue}
                    onChange={(e) => setFormDiscountValue(e.target.value)}
                    className="w-full px-3 py-2 font-mono font-bold border border-slate-300 rounded-xl disabled:bg-slate-100 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {!editingProduct ? (
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Stok Awal *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formInitialStock}
                    onChange={(e) => setFormInitialStock(e.target.value)}
                    className="w-full px-3 py-2 font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-600">
                    Stok saat ini:{" "}
                    <strong className="font-mono">{editingProduct.stock}</strong>{" "}
                    (Gunakan menu <em>Penyesuaian Stok</em> untuk koreksi stok)
                  </span>
                  <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                    />
                    Produk Aktif
                  </label>
                </div>
              )}

              {/* Live Price & Margin Preview */}
              <div className="bg-slate-900 text-white rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Harga Jual Efektif (Setelah Diskon)
                  </div>
                  <div className="text-lg font-extrabold font-mono text-emerald-400 tabular-nums">
                    {formatRupiah(previewEffective)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Estimasi Margin Laba / {formUnit || "pcs"}
                  </div>
                  <div
                    className={`text-sm font-bold font-mono tabular-nums ${
                      previewMargin >= 0 ? "text-emerald-300" : "text-red-400"
                    }`}
                  >
                    {formatRupiah(previewMargin)}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                >
                  {saving ? "Menyimpan..." : "Simpan Produk"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
