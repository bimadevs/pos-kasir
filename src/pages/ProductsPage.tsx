import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Download,
  Edit3,
  FileSpreadsheet,
  Layers,
  PackagePlus,
  Plus,
  PowerOff,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ipc } from "../services/ipc";
import { ProductImportPreviewModal } from "../components/products/ProductImportPreviewModal";
import type {
  DiscountType,
  ParsedImportSummary,
  PriceTierInput,
  Product,
  ProductImportRow,
  UpsertProductRequest,
} from "../types/domain";
import {
  buildProductTemplateWorkbook,
  buildProductsExportWorkbook,
  parseProductImportExcel,
  saveWorkbookAsFile,
} from "../utils/excelService";
import {
  calculateEffectiveUnitPrice,
  calculateUnitDiscount,
  formatRupiah,
} from "../utils/posCalculator";
import { useAuth } from "../context/AuthContext";

export const ProductsPage: React.FC = () => {
  const { canManageProductPrices, canViewCostPrice } = useAuth();
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
  const [modalError, setModalError] = useState<string | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<"BASIC" | "TIERS">(
    "BASIC"
  );
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
  const [formPriceTiers, setFormPriceTiers] = useState<PriceTierInput[]>([]);
  const [saving, setSaving] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Excel Import Preview Modal State
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [importSummary, setImportSummary] =
    useState<ParsedImportSummary | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const [isSavingImport, setIsSavingImport] = useState<boolean>(false);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalOpen && !saving) {
        setModalOpen(false);
        setModalError(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, saving]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setActiveModalTab("BASIC");
    setFormPriceTiers([]);
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
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = async (product: Product) => {
    setEditingProduct(product);
    setActiveModalTab("BASIC");
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
    setModalError(null);
    setModalOpen(true);

    try {
      const tiers = await ipc.getProductPriceTiers(product.id);
      setFormPriceTiers(
        tiers.map((t) => ({
          min_quantity: t.min_quantity,
          tier_price: t.tier_price,
        }))
      );
    } catch {
      setFormPriceTiers([]);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    const costPrice = parseInt(formCostPrice, 10) || 0;
    const sellingPrice = parseInt(formSellingPrice, 10) || 0;
    const discountVal =
      formDiscountType === "NONE" ? 0 : parseInt(formDiscountValue, 10) || 0;
    const initialStock = parseInt(formInitialStock, 10) || 0;

    if (!formSku.trim()) {
      setModalError("Kode SKU produk wajib diisi.");
      return;
    }
    if (!formName.trim()) {
      setModalError("Nama produk wajib diisi.");
      return;
    }
    if (costPrice < 0) {
      setModalError("Harga modal (HPP) tidak boleh bernilai negatif.");
      return;
    }
    if (sellingPrice < 0) {
      setModalError("Harga jual tidak boleh bernilai negatif.");
      return;
    }

    // Validate price tiers (BR-04)
    for (const tier of formPriceTiers) {
      if (tier.min_quantity < 2) {
        setModalError(
          `Minimal kuantitas grosir harus minimal 2 (ditemukan: ${tier.min_quantity}).`
        );
        setActiveModalTab("TIERS");
        return;
      }
      if (tier.tier_price <= 0) {
        setModalError("Harga grosir harus lebih besar dari Rp 0.");
        setActiveModalTab("TIERS");
        return;
      }
      if (tier.tier_price < costPrice) {
        setModalError(
          `Harga grosir (${formatRupiah(
            tier.tier_price,
          )}) tidak boleh lebih rendah dari harga modal/HPP (${formatRupiah(
            costPrice,
          )}).`,
        );
        setActiveModalTab("TIERS");
        return;
      }
      if (tier.tier_price >= sellingPrice) {
        setModalError(
          `Harga grosir (${formatRupiah(
            tier.tier_price
          )}) harus lebih murah dari harga jual normal (${formatRupiah(
            sellingPrice
          )}).`
        );
        setActiveModalTab("TIERS");
        return;
      }
    }

    // Check duplicate min_quantity
    const qtys = formPriceTiers.map((t) => t.min_quantity);
    if (new Set(qtys).size !== qtys.length) {
      setModalError(
        "Terdapat minimal kuantitas yang duplikat pada tabel harga grosir."
      );
      setActiveModalTab("TIERS");
      return;
    }

    setSaving(true);
    setModalError(null);
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
        price_tiers: formPriceTiers,
      };
      await ipc.upsertProduct(payload);
      setModalOpen(false);
      setModalError(null);
      await loadProducts();
      setFeedback({
        type: "success",
        message: editingProduct
          ? `Produk "${payload.name}" berhasil diperbarui.`
          : `Produk "${payload.name}" berhasil ditambahkan ke katalog.`,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      let readable = raw;
      if (
        raw.includes("UNIQUE constraint failed: products.sku") ||
        raw.includes("sku") && raw.includes("already exists")
      ) {
        readable = `Kode SKU "${formSku.trim()}" sudah digunakan oleh produk lain. Silakan masukkan SKU unik.`;
      } else if (
        raw.includes("UNIQUE constraint failed: products.barcode") ||
        raw.includes("barcode") && raw.includes("already exists")
      ) {
        readable = `Kode Barcode "${formBarcode.trim()}" sudah terdaftar pada produk lain.`;
      }
      setModalError(readable);
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

  const handleExportExcel = async () => {
    try {
      const wb = buildProductsExportWorkbook(products);
      const filename = `katalog-produk-${new Date().toISOString().slice(0, 10)}.xlsx`;
      await saveWorkbookAsFile(wb, filename);
      setFeedback({
        type: "success",
        message: "Katalog produk berhasil diekspor ke file Excel (.xlsx).",
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

  const handleDownloadTemplateExcel = async () => {
    try {
      const wb = buildProductTemplateWorkbook();
      await saveWorkbookAsFile(wb, "template-import-produk-mudita-mart.xlsx");
      setFeedback({
        type: "success",
        message: "Template impor Excel berhasil diunduh.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal mengunduh template Excel: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const handleSelectExcelFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      // Pastikan list produk lengkap termuat untuk lookup SKU
      const allProducts = await ipc.listProducts({ only_active: false });
      const summary = await parseProductImportExcel(buffer, allProducts);
      setImportSummary(summary);
      setImportFileName(file.name);
      setImportModalOpen(true);
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal membaca file Excel: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleConfirmImport = async (validRows: ProductImportRow[]) => {
    setIsSavingImport(true);
    try {
      const result = await ipc.importProducts(validRows);
      await loadProducts();
      setImportModalOpen(false);
      setImportSummary(null);
      setFeedback({
        type: "success",
        message: `Impor Excel berhasil! ${result.total_processed} produk diproses (${result.inserted_count} baru ditambahkan, ${result.updated_count} diperbarui).`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Impor Excel dibatalkan (Atomic Rollback): ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      setIsSavingImport(false);
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
    <div className="flex-1 overflow-y-auto p-6 bg-zinc-100/70 space-y-5">
      {/* Header & Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">
            Manajemen Katalog Produk &amp; Diskon
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kelola SKU, barcode, harga modal (HPP), harga jual, serta diskon per item.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => void handleSelectExcelFile(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => void handleDownloadTemplateExcel()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-zinc-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            title="Unduh Template Excel 2-Sheet berpetunjuk lengkap"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            Template Excel
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-zinc-800 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            title="Impor file Excel (.xlsx) dengan pratinjau data dan validasi otomatis"
          >
            <Upload className="w-4 h-4 text-teal-600" />
            Import Excel
          </button>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-zinc-800 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            title="Ekspor seluruh katalog produk saat ini ke file Excel (.xlsx)"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <PackagePlus className="w-4 h-4" />
            + Tambah Produk
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-2xs ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline ml-4 cursor-pointer font-bold"
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
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === "ALL"
              ? "bg-emerald-700 text-white border-emerald-700 shadow-sm"
              : "bg-white text-zinc-800 border-zinc-200/90 hover:border-zinc-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
              Total Katalog
            </span>
            <span className="w-2 h-2 rounded-full bg-zinc-400" />
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1.5 tabular-nums">
            {products.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStockFilter("LOW")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === "LOW"
              ? "bg-amber-600 text-white border-amber-600 shadow-sm"
              : "bg-white text-zinc-800 border-zinc-200/90 hover:border-zinc-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
              Stok Menipis (1–5)
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1.5 tabular-nums">
            {lowCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStockFilter("OUT")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === "OUT"
              ? "bg-rose-700 text-white border-rose-700 shadow-sm"
              : "bg-white text-zinc-800 border-zinc-200/90 hover:border-zinc-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
              Stok Habis (0)
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1.5 tabular-nums">
            {outCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStockFilter("PROMO")}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            stockFilter === "PROMO"
              ? "bg-emerald-700 text-white border-emerald-700 shadow-sm"
              : "bg-white text-zinc-800 border-zinc-200/90 hover:border-zinc-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
              Produk Diskon Aktif
            </span>
            <span className="w-2 h-2 rounded-full bg-teal-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1.5 tabular-nums">
            {promoCount}
          </div>
        </button>
      </div>

      {/* Search & Toggles Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-zinc-200 flex items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center flex-1 bg-zinc-50 border border-zinc-300/80 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-600 transition-all">
          <Search className="w-4 h-4 text-zinc-400 mr-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama produk, SKU, atau scan barcode..."
            className="w-full text-xs font-medium bg-transparent focus:outline-none text-zinc-900 placeholder:text-zinc-400"
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
          />
          Tampilkan Produk Nonaktif
        </label>
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
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
          <tbody className="divide-y divide-zinc-200 text-xs">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-zinc-500">
                  Memuat katalog produk...
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-zinc-500">
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
                    className={`hover:bg-zinc-50/80 transition-colors ${
                      !product.is_active ? "opacity-55 bg-zinc-50" : ""
                    }`}
                  >
                    <td className="py-3 px-4 font-mono">
                      <div className="font-bold text-zinc-800">
                        {product.sku}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {product.barcode || "Tanpa Barcode"}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-zinc-900 text-sm">
                        {product.name}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Kategori: {product.category_name || "Umum"} • Satuan:{" "}
                        {product.unit}
                        {!product.is_active && (
                          <span className="ml-1 px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 font-bold">
                            NONAKTIF
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-zinc-600 tabular-nums">
                      {canViewCostPrice
                        ? formatRupiah(product.cost_price)
                        : "•••"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-800 tabular-nums">
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
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 tabular-nums">
                      {formatRupiah(effectivePrice)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono font-bold text-xs tabular-nums ${
                          isOut
                            ? "bg-rose-50 border border-rose-200 text-rose-700"
                            : isLow
                            ? "bg-amber-50 border border-amber-200 text-amber-800"
                            : "bg-emerald-50 border border-emerald-200 text-emerald-700"
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
                          onClick={() => void openEditModal(product)}
                          className="p-1.5 rounded-lg text-zinc-600 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                          title="Edit Produk"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {product.is_active && (
                          <button
                            type="button"
                            onClick={() => void handleDeactivate(product)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/40 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setModalOpen(false);
              setModalError(null);
            }
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-zinc-200/80 w-full max-w-xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between border-b border-emerald-800/80 shadow-xs">
              <h3 className="font-bold text-base tracking-tight text-white">
                {editingProduct ? "Edit Data Produk" : "Tambah Produk Baru"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!saving) {
                    setModalOpen(false);
                    setModalError(null);
                  }
                }}
                disabled={saving}
                title="Tutup (Esc)"
                className="text-emerald-100 hover:text-white p-1 rounded-lg cursor-pointer transition-colors disabled:opacity-40 hover:bg-emerald-800/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-zinc-200 bg-zinc-50 px-6 pt-2.5">
              <button
                type="button"
                onClick={() => setActiveModalTab("BASIC")}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  activeModalTab === "BASIC"
                    ? "border-teal-600 text-teal-700 bg-white rounded-t-lg border-t border-x border-zinc-200 -mb-px"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                Informasi Utama & Diskon
              </button>
              <button
                type="button"
                onClick={() => setActiveModalTab("TIERS")}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeModalTab === "TIERS"
                    ? "border-teal-600 text-teal-700 bg-white rounded-t-lg border-t border-x border-zinc-200 -mb-px"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Harga Grosir / Bertingkat
                {formPriceTiers.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-teal-100 text-teal-800 font-extrabold">
                    {formPriceTiers.length}
                  </span>
                )}
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSaveProduct(e)}
              className="p-6 space-y-4 text-xs"
            >
              {modalError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-rose-950 uppercase tracking-wider">
                        Gagal Menyimpan Data Produk
                      </h4>
                      <button
                        type="button"
                        onClick={() => setModalError(null)}
                        className="text-rose-400 hover:text-rose-700 p-0.5 rounded transition-colors cursor-pointer"
                        aria-label="Tutup pesan error"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-rose-800 mt-1 font-semibold leading-relaxed">
                      {modalError}
                    </p>
                  </div>
                </div>
              )}

              {activeModalTab === "TIERS" ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-teal-50/80 border border-teal-200 text-teal-900 flex items-start gap-3">
                    <Layers className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                    <div className="text-xs leading-relaxed">
                      <div className="font-bold text-teal-950">
                        Aturan Diskon Grosir Bertingkat (BR-04)
                      </div>
                      <div className="text-teal-800 mt-0.5">
                        Tier harga grosir otomatis aktif di Kasir saat kuantitas pembelian produk mencapai batas minimal.
                        Harga grosir menggantikan diskon reguler demi menjaga batas keuntungan toko.
                      </div>
                      <div className="mt-2 text-[11px] font-mono font-semibold text-teal-900 bg-white/70 px-2 py-1 rounded border border-teal-200 inline-block">
                        Harga Normal: {formatRupiah(parseInt(formSellingPrice, 10) || 0)} • HPP Modal: {formatRupiah(parseInt(formCostPrice, 10) || 0)}
                      </div>
                    </div>
                  </div>

                  {formPriceTiers.length === 0 ? (
                    <div className="text-center py-8 px-4 border-2 border-dashed border-zinc-200 rounded-xl bg-zinc-50/50">
                      <Layers className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-zinc-600">
                        Belum ada aturan harga grosir untuk produk ini.
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Tambahkan tier harga untuk memberikan potongan bagi pelanggan yang membeli dalam jumlah banyak (misal: beli 3, 6, atau 12 pcs).
                      </p>
                    </div>
                  ) : (
                    <div className="border border-zinc-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                          <tr>
                            <th className="py-2.5 px-3">Beli Min. Qty</th>
                            <th className="py-2.5 px-3">Harga Grosir / Pcs</th>
                            <th className="py-2.5 px-3 text-right">Hemat / Pcs</th>
                            <th className="py-2.5 px-3 text-right">Estimasi Margin</th>
                            <th className="py-2.5 px-2 text-center w-10">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {formPriceTiers.map((tier, idx) => {
                            const costP = parseInt(formCostPrice, 10) || 0;
                            const sellP = parseInt(formSellingPrice, 10) || 0;
                            const savings = sellP - tier.tier_price;
                            const margin = tier.tier_price - costP;

                            return (
                              <tr key={idx} className="hover:bg-zinc-50/50">
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={2}
                                      value={tier.min_quantity}
                                      onChange={(e) => {
                                        const val = Math.max(2, parseInt(e.target.value, 10) || 2);
                                        const updated = [...formPriceTiers];
                                        updated[idx] = { ...tier, min_quantity: val };
                                        setFormPriceTiers(updated);
                                      }}
                                      className="w-20 px-2 py-1 font-mono font-bold text-center border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                    <span className="text-zinc-500 font-medium">{formUnit || "pcs"}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1">
                                    <span className="text-zinc-400 font-mono text-[11px]">Rp</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={tier.tier_price}
                                      onChange={(e) => {
                                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                        const updated = [...formPriceTiers];
                                        updated[idx] = { ...tier, tier_price: val };
                                        setFormPriceTiers(updated);
                                      }}
                                      className="w-28 px-2 py-1 font-mono font-bold text-right border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-teal-700 font-bold">
                                  {savings > 0 ? `-${formatRupiah(savings)}` : "Rp 0"}
                                </td>
                                <td
                                  className={`py-2 px-3 text-right font-mono font-bold ${
                                    margin >= 0 ? "text-emerald-700" : "text-rose-600"
                                  }`}
                                >
                                  {formatRupiah(margin)}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormPriceTiers(
                                        formPriceTiers.filter((_, i) => i !== idx)
                                      );
                                    }}
                                    className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Hapus baris tier"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={() => {
                        const sellP = parseInt(formSellingPrice, 10) || 10000;
                        const nextQty =
                          formPriceTiers.length === 0
                            ? 3
                            : Math.max(...formPriceTiers.map((t) => t.min_quantity)) + 3;
                        const defTierPrice = Math.max(1, Math.round(sellP * 0.9));
                        setFormPriceTiers([
                          ...formPriceTiers,
                          { min_quantity: nextQty, tier_price: defTierPrice },
                        ]);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tambah Baris Grosir
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                        Kode SKU *
                      </label>
                      <input
                        type="text"
                        required
                        value={formSku}
                        onChange={(e) => setFormSku(e.target.value)}
                        className="w-full px-3 py-2 font-mono border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                        Kode Barcode (EAN/UPC)
                      </label>
                      <input
                        type="text"
                        value={formBarcode}
                        onChange={(e) => setFormBarcode(e.target.value)}
                        placeholder="Scan atau ketik barcode..."
                        className="w-full px-3 py-2 font-mono border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all placeholder:text-zinc-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                        Nama Produk *
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Contoh: Indomie Goreng 85g"
                        className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all placeholder:text-zinc-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                        Kategori
                      </label>
                      <input
                        type="text"
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        placeholder="Makanan / Minuman"
                        className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all placeholder:text-zinc-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                        Satuan
                      </label>
                      <input
                        type="text"
                        value={formUnit}
                        onChange={(e) => setFormUnit(e.target.value)}
                        placeholder="pcs / btl / bks"
                        className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all placeholder:text-zinc-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                        Harga Modal / HPP (Rp) *
                      </label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={formCostPrice}
                        onChange={(e) => setFormCostPrice(e.target.value)}
                        className="w-full px-3 py-2 font-mono font-bold border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-bold uppercase tracking-wider text-zinc-600">
                          Harga Jual Normal (Rp) *
                        </label>
                        {!canManageProductPrices && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Dikelola Admin
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min={0}
                        required={canManageProductPrices}
                        disabled={!canManageProductPrices}
                        value={formSellingPrice}
                        onChange={(e) => setFormSellingPrice(e.target.value)}
                        className="w-full px-3 py-2 font-mono font-bold border border-zinc-300 rounded-xl disabled:bg-zinc-100 disabled:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-bold uppercase tracking-wider text-zinc-600">
                          Tipe Diskon Produk
                        </label>
                        {!canManageProductPrices && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Dikelola Admin
                          </span>
                        )}
                      </div>
                      <select
                        disabled={!canManageProductPrices}
                        value={formDiscountType}
                        onChange={(e) =>
                          setFormDiscountType(e.target.value as DiscountType)
                        }
                        className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white disabled:bg-zinc-100 disabled:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
                      >
                        <option value="NONE">Tanpa Diskon (NONE)</option>
                        <option value="NOMINAL">
                          Potongan Nominal Rupiah (Rp)
                        </option>
                        <option value="PERCENT">Potongan Persentase (%)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                        Nilai Diskon{" "}
                        {formDiscountType === "PERCENT" ? "(0–100%)" : "(Rp)"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={formDiscountType === "PERCENT" ? 100 : undefined}
                        disabled={!canManageProductPrices || formDiscountType === "NONE"}
                        value={
                          formDiscountType === "NONE" ? "0" : formDiscountValue
                        }
                        onChange={(e) => setFormDiscountValue(e.target.value)}
                        className="w-full px-3 py-2 font-mono font-bold border border-zinc-300 rounded-xl disabled:bg-zinc-100 disabled:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
                      />
                    </div>
                  </div>

                  {!editingProduct ? (
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                        Stok Awal *
                      </label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={formInitialStock}
                        onChange={(e) => setFormInitialStock(e.target.value)}
                        className="w-full px-3 py-2 font-mono font-bold border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                      <span className="text-zinc-600">
                        Stok saat ini:{" "}
                        <strong className="font-mono text-zinc-900">
                          {editingProduct.stock}
                        </strong>{" "}
                        (Gunakan menu <em>Penyesuaian Stok</em> untuk koreksi stok)
                      </span>
                      <label className="flex items-center gap-2 font-bold text-zinc-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formIsActive}
                          onChange={(e) => setFormIsActive(e.target.checked)}
                          className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                        />
                        Produk Aktif
                      </label>
                    </div>
                  )}

                  {/* Live Price & Margin Preview */}
                  <div className="bg-emerald-50/90 text-emerald-950 rounded-xl p-3.5 flex items-center justify-between border-2 border-emerald-500/80 shadow-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-800">
                        Harga Jual Efektif (Setelah Diskon)
                      </div>
                      <div className="text-lg font-extrabold font-mono text-emerald-950 tabular-nums">
                        {formatRupiah(previewEffective)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-800">
                        Estimasi Margin Laba / {formUnit || "pcs"}
                      </div>
                      <div
                        className={`text-sm font-bold font-mono tabular-nums ${
                          previewMargin >= 0
                            ? "text-emerald-700"
                            : "text-rose-600"
                        }`}
                      >
                        {formatRupiah(previewMargin)}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setModalError(null);
                  }}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 font-bold text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] transition-all cursor-pointer text-xs shadow-2xs disabled:opacity-50"
                >
                  Batal (Esc)
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white font-bold transition-all cursor-pointer shadow-xs disabled:bg-zinc-300 disabled:cursor-not-allowed text-xs"
                >
                  {saving ? "Menyimpan..." : "Simpan Produk"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pratinjau Impor Excel */}
      {importModalOpen && importSummary && (
        <ProductImportPreviewModal
          fileName={importFileName}
          summary={importSummary}
          isSaving={isSavingImport}
          onConfirm={(validRows) => void handleConfirmImport(validRows)}
          onCancel={() => {
            if (!isSavingImport) {
              setImportModalOpen(false);
              setImportSummary(null);
            }
          }}
        />
      )}
    </div>
  );
};
