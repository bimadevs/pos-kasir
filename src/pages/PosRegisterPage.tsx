import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Barcode,
  CheckCircle2,
  Clock,
  FileText,
  History,
  PauseCircle,
  Printer,
  RotateCcw,
  Search,
  Zap,
} from "lucide-react";
import { CartTable } from "../components/pos/CartTable";
import { CashMovementModal } from "../components/pos/CashMovementModal";
import { HeldBillsModal } from "../components/pos/HeldBillsModal";
import { PaymentModal } from "../components/pos/PaymentModal";
import { ShiftCloseModal } from "../components/pos/ShiftCloseModal";
import { ShiftOpenModal } from "../components/pos/ShiftOpenModal";
import { TodaySalesDrawer } from "../components/pos/TodaySalesDrawer";
import { ShiftReportPreviewModal } from "../components/receipt/ShiftReportPreviewModal";
import { useAuth } from "../context/AuthContext";
import { useTerminal } from "../context/TerminalContext";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { usePosShortcuts } from "../hooks/usePosShortcuts";
import { ipc } from "../services/ipc";
import type {
  CartItem,
  HeldBill,
  PrintOutcome,
  Product,
  ReceiptData,
  SaleWithItems,
} from "../types/domain";
import {
  addProductToCart,
  calculateCartTotals,
  formatRupiah,
  updateCartItemQuantity,
} from "../utils/posCalculator";
import { playErrorBeep, playScanSuccessBeep } from "../utils/sound";
import { APP_VERSION_LABEL } from "../version";

export const PosRegisterPage: React.FC = () => {
  const { user } = useAuth();
  const {
    activeShift,
    refreshActiveShift,
    openReceiptPreview,
    previewReceipt,
    previewShiftReport,
    previewOutcome,
    openShiftReportPreview,
    closeShiftReportPreview,
    terminalStatus,
  } = useTerminal();

  // Shift modals state
  const [shiftOpenModalOpen, setShiftOpenModalOpen] = useState<boolean>(false);
  const [shiftCloseModalOpen, setShiftCloseModalOpen] = useState<boolean>(false);
  const [cashMovementModalOpen, setCashMovementModalOpen] = useState<boolean>(false);

  // Cart & selection state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(
    null
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState<boolean>(false);
  const [dropdownIndex, setDropdownIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Feedback banners
  const [alertBanner, setAlertBanner] = useState<{
    type: "error" | "warning" | "success";
    message: string;
  } | null>(null);

  // Modals & drawers
  const [paymentModalOpen, setPaymentModalOpen] = useState<boolean>(false);
  const [submittingSale, setSubmittingSale] = useState<boolean>(false);
  const [completedReceipt, setCompletedReceipt] = useState<ReceiptData | null>(
    null
  );
  const [printWarning, setPrintWarning] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [lastCompletedSaleId, setLastCompletedSaleId] = useState<string | null>(
    null
  );
  const [lastPrintOutcome, setLastPrintOutcome] = useState<PrintOutcome | null>(
    null
  );
  const isSubmittingCheckoutRef = useRef<boolean>(false);

  const [heldModalMode, setHeldModalMode] = useState<"HOLD" | "RECALL" | null>(
    null
  );
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [loadingHeldBills, setLoadingHeldBills] = useState<boolean>(false);

  const [todaySalesOpen, setTodaySalesOpen] = useState<boolean>(false);
  const [todaySales, setTodaySales] = useState<SaleWithItems[]>([]);
  const [loadingTodaySales, setLoadingTodaySales] = useState<boolean>(false);

  const totals = calculateCartTotals(cart);

  const showBanner = useCallback(
    (type: "error" | "warning" | "success", message: string) => {
      setAlertBanner({ type, message });
    },
    []
  );

  // Auto-clear banners after 5s
  useEffect(() => {
    if (!alertBanner) return;
    const timer = setTimeout(() => {
      setAlertBanner(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [alertBanner]);

  // Flash highlight on newly scanned/updated cart row
  const flashProductHighlight = useCallback((productId: string) => {
    setHighlightedProductId(productId);
    setTimeout(() => {
      setHighlightedProductId((prev) => (prev === productId ? null : prev));
    }, 650);
  }, []);

  // Load Held Bills count on mount
  const refreshHeldBills = useCallback(async () => {
    try {
      const list = await ipc.listHeldBills();
      setHeldBills(list);
    } catch {
      // ignore background count error
    }
  }, []);

  useEffect(() => {
    void refreshHeldBills();
  }, [refreshHeldBills]);

  // Add a product object into the cart with stock validation
  const handleAddProductObject = useCallback(
    (product: Product) => {
      const result = addProductToCart(cart, product, 1);
      if (result.error) {
        playErrorBeep();
        showBanner("error", result.error);
        return;
      }
      playScanSuccessBeep();
      setCart(result.items);
      const idx = result.items.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        setSelectedIndex(idx);
      }
      flashProductHighlight(product.id);
      setSearchQuery("");
      setSearchResults([]);
      setSearchDropdownOpen(false);
    },
    [cart, flashProductHighlight, showBanner]
  );

  // Handle Barcode / Exact SKU scan from USB HID Scanner or Enter in search box
  const handleScanCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      try {
        const product = await ipc.findProductByCode(code);
        handleAddProductObject(product);
      } catch (err) {
        playErrorBeep();
        showBanner(
          "error",
          err instanceof Error
            ? err.message
            : `Kode barcode / SKU "${code}" tidak ditemukan.`
        );
      }
    },
    [handleAddProductObject, showBanner]
  );

  const isAnyModalOpen =
    paymentModalOpen ||
    heldModalMode !== null ||
    todaySalesOpen ||
    shiftOpenModalOpen ||
    shiftCloseModalOpen ||
    cashMovementModalOpen ||
    Boolean(previewReceipt) ||
    Boolean(previewShiftReport);

  // Invarian & FR-35: Kasir wajib membuka shift kasir terlebih dahulu
  useEffect(() => {
    if (user?.role === "CASHIER" && activeShift === null) {
      setShiftOpenModalOpen(true);
    }
  }, [user, activeShift]);

  const handlePrintXReport = useCallback(async () => {
    if (!activeShift) {
      showBanner("warning", "Belum ada shift kasir aktif.");
      return;
    }
    try {
      const rep = await ipc.getShiftXReport(activeShift.id);
      const outcome = await ipc.printShiftReport(rep);
      if (outcome.show_preview_modal) {
        openShiftReportPreview(rep, outcome);
      } else {
        showBanner("success", "Laporan X (audit sementara) berhasil dicetak.");
      }
    } catch (err) {
      showBanner(
        "error",
        `Gagal mencetak Laporan X: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }, [activeShift, openShiftReportPreview, showBanner]);

  // Global USB HID Barcode Scanner hook
  useBarcodeScanner({
    enabled: !isAnyModalOpen,
    onScan: (barcode) => {
      void handleScanCode(barcode);
    },
  });

  // Live product search when user types in search input
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchDropdownOpen(false);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        const products = await ipc.listProducts({
          search: trimmed,
          only_active: true,
        });
        setSearchResults(products.slice(0, 12));
        setDropdownIndex(0);
        setSearchDropdownOpen(true);
      } catch {
        setSearchResults([]);
      }
    }, 120);

    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Execute cash sale checkout
  const executeCheckout = useCallback(
    async (cashReceived: number) => {
      if (
        cart.length === 0 ||
        submittingSale ||
        isSubmittingCheckoutRef.current
      ) {
        return;
      }
      if (cashReceived < totals.totalAmount) {
        playErrorBeep();
        showBanner("error", "Nominal uang diterima kurang dari total tagihan.");
        return;
      }

      isSubmittingCheckoutRef.current = true;
      setSubmittingSale(true);
      setPaymentError(null);
      setPrintWarning(null);
      try {
        const receipt = await ipc.createSale({
          items: cart.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
          })),
          cash_received: cashReceived,
        });

        playScanSuccessBeep();
        setLastCompletedSaleId(receipt.sale.id);
        setCompletedReceipt(receipt);

        // Trigger local thermal print + cash drawer pulse (if enabled)
        try {
          const outcome = await ipc.printReceipt(receipt);
          setLastPrintOutcome(outcome);
          // CATATAN: Jangan memanggil openReceiptPreview() di sini agar tidak memunculkan
          // modal ganda yang saling bertumpuk (ReceiptPreviewModal di atas PaymentModal).
          // Layar sukses transaksi ditampilkan bersih di dalam PaymentModal (UI-UX-SPEC 4.3).
          // Kasir dapat mengklik "Lihat / Cetak Struk" di PaymentModal kapan saja jika diperlukan.
        } catch (printErr) {
          setPrintWarning(
            printErr instanceof Error ? printErr.message : String(printErr)
          );
        }

        setPaymentModalOpen(true);
      } catch (err) {
        playErrorBeep();
        const msg = err instanceof Error ? err.message : String(err);
        setPaymentError(msg);
        showBanner("error", msg);
      } finally {
        setSubmittingSale(false);
        isSubmittingCheckoutRef.current = false;
      }
    },
    [cart, submittingSale, totals.totalAmount, showBanner]
  );

  const handleStartNewTransaction = useCallback(() => {
    setCart([]);
    setSelectedIndex(0);
    setEditingProductId(null);
    setCompletedReceipt(null);
    setLastPrintOutcome(null);
    setPrintWarning(null);
    setPaymentError(null);
    setPaymentModalOpen(false);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 20);
  }, []);

  // Reprint last receipt (F10)
  const handleReprintLastReceipt = useCallback(async () => {
    try {
      let targetSaleId = lastCompletedSaleId;
      if (!targetSaleId) {
        const today = await ipc.listTodaySales();
        const latestCompleted = today.find(
          (s) => s.sale.status === "COMPLETED"
        );
        if (!latestCompleted) {
          showBanner(
            "warning",
            "Belum ada transaksi selesai hari ini untuk dicetak ulang."
          );
          return;
        }
        targetSaleId = latestCompleted.sale.id;
      }
      const receipt = await ipc.getSaleReceipt(targetSaleId, true);
      const outcome = await ipc.printReceipt(receipt);
      openReceiptPreview(receipt, outcome);
      showBanner("success", "Cetakan ulang struk terakhir berhasil diproses.");
    } catch (err) {
      playErrorBeep();
      showBanner(
        "error",
        `Gagal cetak ulang struk: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }, [lastCompletedSaleId, openReceiptPreview, showBanner]);

  // Open Held Bills modal (F4 or F5)
  const handleOpenHoldModal = useCallback(() => {
    if (cart.length === 0) {
      showBanner(
        "warning",
        "Keranjang masih kosong. Tambahkan produk sebelum menahan transaksi (Hold)."
      );
      return;
    }
    setHeldModalMode("HOLD");
  }, [cart.length, showBanner]);

  const handleOpenRecallModal = useCallback(async () => {
    setHeldModalMode("RECALL");
    setLoadingHeldBills(true);
    try {
      const list = await ipc.listHeldBills();
      setHeldBills(list);
    } catch (err) {
      showBanner(
        "error",
        `Gagal memuat transaksi ditahan: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setLoadingHeldBills(false);
    }
  }, [showBanner]);

  // Open Today's Sales & Void drawer (F6)
  const handleOpenTodaySales = useCallback(async () => {
    setTodaySalesOpen(true);
    setLoadingTodaySales(true);
    try {
      const sales = await ipc.listTodaySales();
      setTodaySales(sales);
    } catch (err) {
      showBanner(
        "error",
        `Gagal memuat riwayat transaksi hari ini: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setLoadingTodaySales(false);
    }
  }, [showBanner]);

  // Keyboard shortcuts hook
  usePosShortcuts({
    enabled: true,
    isModalOpen: isAnyModalOpen || editingProductId !== null,
    onFocusSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onEditSelectedQty: () => {
      const target = cart[selectedIndex];
      if (target) {
        setEditingProductId(target.product.id);
      }
    },
    onHoldBill: handleOpenHoldModal,
    onOpenHeldBills: () => {
      void handleOpenRecallModal();
    },
    onOpenTodaySales: () => {
      void handleOpenTodaySales();
    },
    onCashMovement: () => {
      if (activeShift) {
        setCashMovementModalOpen(true);
      } else {
        setShiftOpenModalOpen(true);
      }
    },
    onOpenPaymentModal: () => {
      if (cart.length === 0) {
        showBanner("warning", "Keranjang belanja masih kosong.");
        return;
      }
      setCompletedReceipt(null);
      setPrintWarning(null);
      setPaymentError(null);
      setPaymentModalOpen(true);
    },
    onQuickExactCash: () => {
      if (cart.length === 0) {
        showBanner("warning", "Keranjang belanja masih kosong.");
        return;
      }
      void executeCheckout(totals.totalAmount);
    },
    onReprintLastReceipt: () => {
      void handleReprintLastReceipt();
    },
    onMoveSelectionUp: () => {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    },
    onMoveSelectionDown: () => {
      setSelectedIndex((prev) =>
        Math.min(Math.max(0, cart.length - 1), prev + 1)
      );
    },
    onDeleteSelectedItem: () => {
      const target = cart[selectedIndex];
      if (target) {
        setCart((prev) =>
          prev.filter((i) => i.product.id !== target.product.id)
        );
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      }
    },
    onEscape: () => {
      if (editingProductId) {
        setEditingProductId(null);
      } else if (searchDropdownOpen || searchQuery) {
        setSearchDropdownOpen(false);
        setSearchQuery("");
        searchInputRef.current?.blur();
      } else if (heldModalMode) {
        setHeldModalMode(null);
      } else if (todaySalesOpen) {
        setTodaySalesOpen(false);
      }
    },
  });

  // Search box keyboard navigation
  const handleSearchKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (
      e.key === "ArrowDown" &&
      searchDropdownOpen &&
      searchResults.length > 0
    ) {
      e.preventDefault();
      setDropdownIndex((prev) => (prev + 1) % searchResults.length);
      return;
    }
    if (e.key === "ArrowUp" && searchDropdownOpen && searchResults.length > 0) {
      e.preventDefault();
      setDropdownIndex(
        (prev) => (prev - 1 + searchResults.length) % searchResults.length
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const query = searchQuery.trim();
      if (!query) return;

      // First try exact barcode or SKU lookup
      try {
        const exactProduct = await ipc.findProductByCode(query);
        handleAddProductObject(exactProduct);
        return;
      } catch {
        // Fallback to dropdown selection
      }

      if (searchResults.length > 0) {
        const chosen = searchResults[dropdownIndex] || searchResults[0];
        handleAddProductObject(chosen);
      } else {
        playErrorBeep();
        showBanner(
          "error",
          `Produk dengan kata kunci / kode "${query}" tidak ditemukan.`
        );
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-100/70 select-none">
      {/* Main 2-Column Split Workspace */}
      <div className="flex-1 grid grid-cols-12 gap-3 p-3 min-h-0">
        {/* LEFT COLUMN (8 cols / ~67%): Search Bar + Alert Banner + Cart Table */}
        <div className="col-span-8 flex flex-col gap-2.5 min-h-0">
          {/* Search & Barcode Input Bar */}
          <div className="relative z-20">
            <div className="flex items-center bg-white border border-zinc-300 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-500/20 rounded-xl shadow-2xs px-3.5 py-2 transition-all">
              <Search className="w-5 h-5 text-zinc-400 mr-2.5 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => void handleSearchKeyDown(e)}
                placeholder="Scan Barcode otomatis atau ketik nama / SKU barang..."
                className="flex-1 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none bg-transparent"
              />
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-700 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md">
                  <Barcode className="w-3.5 h-3.5 text-zinc-500" />
                  USB Scanner Aktif
                </span>
                <kbd className="kbd-key">F1</kbd>
              </div>
            </div>

            {/* Autocomplete Search Results Dropdown */}
            {searchDropdownOpen && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden max-h-80 overflow-y-auto z-30 divide-y divide-zinc-100">
                {searchResults.map((prod, idx) => {
                  const isOut = prod.stock <= 0;
                  const isLow = prod.stock > 0 && prod.stock <= 5;
                  const isActiveRow = idx === dropdownIndex;

                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleAddProductObject(prod)}
                      className={`w-full px-4 py-2.5 text-left flex items-center justify-between transition-colors cursor-pointer ${
                        isActiveRow ? "bg-teal-50/70" : "hover:bg-zinc-50"
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                          <span>{prod.name}</span>
                          {prod.discount_type !== "NONE" &&
                            prod.discount_value > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60">
                                PROMO
                              </span>
                            )}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">
                          SKU: {prod.sku}
                          {prod.barcode ? ` • Barcode: ${prod.barcode}` : ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                            isOut
                              ? "bg-rose-50 text-rose-700 border-rose-200/70"
                              : isLow
                              ? "bg-amber-50 text-amber-700 border-amber-200/70"
                              : "bg-zinc-100 text-zinc-700 border-zinc-200/70"
                          }`}
                        >
                          {isOut
                            ? "HABIS (0)"
                            : `Stok: ${prod.stock} ${prod.unit}`}
                        </span>
                        <span className="font-mono font-bold text-sm text-zinc-900 tabular-nums w-28 text-right">
                          {formatRupiah(prod.selling_price)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inline Feedback / Stock Error Banner */}
          {alertBanner && (
            <div
              className={`px-4 py-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-2xs ${
                alertBanner.type === "error"
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : alertBanner.type === "warning"
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {alertBanner.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{alertBanner.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setAlertBanner(null)}
                className="text-[11px] underline ml-4 opacity-75 hover:opacity-100 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Cart Table */}
          <CartTable
            items={cart}
            selectedIndex={selectedIndex}
            editingProductId={editingProductId}
            highlightedProductId={highlightedProductId}
            onSelectRow={(idx) => setSelectedIndex(idx)}
            onStartEditQty={(productId) => setEditingProductId(productId)}
            onCommitQty={(productId, newQty) => {
              const result = updateCartItemQuantity(cart, productId, newQty);
              if (result.error) {
                playErrorBeep();
                showBanner("warning", result.error);
              }
              setCart(result.items);
              setEditingProductId(null);
            }}
            onCancelEditQty={() => setEditingProductId(null)}
            onRemoveItem={(productId) => {
              setCart((prev) => prev.filter((i) => i.product.id !== productId));
              setSelectedIndex((prev) => Math.max(0, prev - 1));
            }}
          />
        </div>

        {/* RIGHT COLUMN (4 cols / ~33%): Clean Crisp Light Summary with Logo Green & Gold Accents */}
        <div className="col-span-4 bg-white text-zinc-900 rounded-2xl p-5 flex flex-col justify-between shadow-xs border border-zinc-200/90">
          {/* Top Summary Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Ringkasan Pembayaran
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {totals.totalItemsCount} baris produk ({totals.totalUnitsQty}{" "}
                  pcs)
                </p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCart([]);
                    setSelectedIndex(0);
                  }}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Kosongkan Keranjang"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}
            </div>

            {/* Subtotal & Discount Breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-zinc-600">
                <span className="font-medium">Subtotal Harga Normal</span>
                <span className="font-mono font-bold text-zinc-900 tabular-nums">
                  {formatRupiah(totals.subtotalGross)}
                </span>
              </div>
              <div className="flex items-center justify-between text-amber-600">
                <span className="font-medium">Total Potongan Diskon</span>
                <span className="font-mono font-bold text-amber-600 tabular-nums">
                  - {formatRupiah(totals.discountTotal)}
                </span>
              </div>
            </div>

            {/* Giant Grand Total Display — Mudita Green & Warm Gold Accent */}
            <div className="bg-emerald-50/80 border-2 border-emerald-500/80 rounded-xl p-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-emerald-800">
                <span>TOTAL TAGIHAN</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-sans tracking-normal shadow-2xs">
                  MUDITA MART
                </span>
              </div>
              <div className="text-4xl font-extrabold font-mono text-emerald-950 tracking-tight mt-1 tabular-nums">
                {formatRupiah(totals.totalAmount)}
              </div>
            </div>

            {/* Shift Cockpit Bar */}
            <div className="p-3 bg-zinc-50 border border-zinc-200/90 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    activeShift ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                  }`}
                />
                <div>
                  <div className="font-extrabold text-zinc-900">
                    {activeShift ? "Shift Kasir Aktif" : "Shift Belum Dibuka"}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {activeShift
                      ? `Float: ${formatRupiah(activeShift.opening_float)} • ${activeShift.terminal_name}`
                      : "Wajib buka shift untuk melayani"}
                  </div>
                </div>
              </div>
              {activeShift ? (
                <button
                  type="button"
                  onClick={() => setShiftCloseModalOpen(true)}
                  className="py-1 px-2.5 bg-zinc-900 hover:bg-black text-white font-bold text-[11px] rounded-lg transition-all cursor-pointer shadow-2xs"
                >
                  Tutup Shift (Z)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShiftOpenModalOpen(true)}
                  className="py-1 px-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] rounded-lg transition-all cursor-pointer shadow-2xs"
                >
                  Buka Shift
                </button>
              )}
            </div>

            {/* Secondary Operational Buttons (Hold, Recall, Today's Sales/Void, Mutasi Kas F7, Reprint, Laporan X) */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleOpenHoldModal}
                disabled={cart.length === 0}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 active:scale-[0.98] disabled:opacity-40 border border-zinc-200 text-left text-xs font-semibold text-zinc-700 hover:text-zinc-900 transition-all cursor-pointer shadow-2xs"
              >
                <span className="flex items-center gap-1.5">
                  <PauseCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  Tahan (Hold)
                </span>
                <kbd className="kbd-key">F4</kbd>
              </button>

              <button
                type="button"
                onClick={() => void handleOpenRecallModal()}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 active:scale-[0.98] border border-zinc-200 text-left text-xs font-semibold text-zinc-700 hover:text-zinc-900 transition-all cursor-pointer shadow-2xs"
              >
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  Recall ({heldBills.length})
                </span>
                <kbd className="kbd-key">F5</kbd>
              </button>

              <button
                type="button"
                onClick={() => void handleOpenTodaySales()}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 active:scale-[0.98] border border-zinc-200 text-left text-xs font-semibold text-zinc-700 hover:text-zinc-900 transition-all cursor-pointer shadow-2xs"
              >
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  Riwayat/Void
                </span>
                <kbd className="kbd-key">F6</kbd>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeShift) {
                    setCashMovementModalOpen(true);
                  } else {
                    setShiftOpenModalOpen(true);
                  }
                }}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 active:scale-[0.98] border border-zinc-200 text-left text-xs font-semibold text-zinc-700 hover:text-zinc-900 transition-all cursor-pointer shadow-2xs"
              >
                <span className="flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  Mutasi Kas
                </span>
                <kbd className="kbd-key">F7</kbd>
              </button>

              <button
                type="button"
                onClick={() => void handleReprintLastReceipt()}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 active:scale-[0.98] border border-zinc-200 text-left text-xs font-semibold text-zinc-700 hover:text-zinc-900 transition-all cursor-pointer shadow-2xs"
              >
                <span className="flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  Reprint Struk
                </span>
                <kbd className="kbd-key">F10</kbd>
              </button>

              <button
                type="button"
                disabled={!activeShift}
                onClick={() => void handlePrintXReport()}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 active:scale-[0.98] disabled:opacity-40 border border-zinc-200 text-left text-xs font-semibold text-zinc-700 hover:text-zinc-900 transition-all cursor-pointer shadow-2xs"
              >
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  Laporan X
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">Audit</span>
              </button>
            </div>
          </div>

          {/* Primary Checkout CTAs */}
          <div className="space-y-2.5 pt-4 border-t border-zinc-200">
            <button
              type="button"
              disabled={cart.length === 0 || submittingSale}
              onClick={() => void executeCheckout(totals.totalAmount)}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 active:scale-[0.98] disabled:bg-zinc-100 disabled:text-zinc-400 disabled:border-zinc-200 text-amber-950 font-bold text-xs flex items-center justify-between transition-all cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:active:scale-100"
            >
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-900" />
                Bayar Cepat Uang Pas ({formatRupiah(totals.totalAmount)})
              </span>
              <kbd className="kbd-key bg-amber-200/90 border-amber-300 text-amber-950 font-bold">F9</kbd>
            </button>

            <button
              type="button"
              disabled={cart.length === 0 || submittingSale}
              onClick={() => {
                setCompletedReceipt(null);
                setPrintWarning(null);
                setPaymentError(null);
                setPaymentModalOpen(true);
              }}
              className="w-full py-3.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-[0.98] disabled:bg-zinc-100 disabled:text-zinc-400 text-white font-extrabold text-sm tracking-wide flex items-center justify-between shadow-md transition-all cursor-pointer disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
            >
              <span className="flex items-center gap-2.5">
                <Banknote className="w-5 h-5 text-emerald-100" />
                PROSES PEMBAYARAN TUNAI
              </span>
              <kbd className="kbd-key bg-emerald-700/90 border-emerald-500 text-white font-bold text-xs">F8</kbd>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Mechanical Keycap Shortcut Legend */}
      <footer className="bg-white border-t border-zinc-200 px-4 py-1.5 flex items-center justify-between text-[11px] text-zinc-600 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span>
            <kbd className="kbd-key">F1</kbd> Cari Barang
          </span>
          <span>
            <kbd className="kbd-key">F2</kbd> Ubah Qty
          </span>
          <span>
            <kbd className="kbd-key">↑</kbd> <kbd className="kbd-key">↓</kbd>{" "}
            Pilih Baris
          </span>
          <span>
            <kbd className="kbd-key">Del</kbd> Hapus Item
          </span>
          <span>
            <kbd className="kbd-key">F4</kbd> Hold Transaksi
          </span>
          <span>
            <kbd className="kbd-key">F5</kbd> Panggil Hold ({heldBills.length})
          </span>
          <span>
            <kbd className="kbd-key">F6</kbd> Riwayat &amp; Void
          </span>
          <span>
            <kbd className="kbd-key">F8</kbd> Bayar Tunai
          </span>
          <span>
            <kbd className="kbd-key">F9</kbd> Uang Pas
          </span>
          <span>
            <kbd className="kbd-key">F10</kbd> Cetak Ulang
          </span>
        </div>
        <div className="font-mono text-zinc-400 text-[11px]">
          Mudita Mart {APP_VERSION_LABEL} • by{" "}
          <span className="font-semibold text-zinc-600">BimaDev</span>
        </div>
      </footer>

      {/* Payment Modal (F8 / F9) */}
      <PaymentModal
        isOpen={paymentModalOpen}
        totalAmount={totals.totalAmount}
        submitting={submittingSale}
        completedReceipt={completedReceipt}
        printWarning={printWarning}
        errorMessage={paymentError}
        onClose={() => setPaymentModalOpen(false)}
        onConfirmCashPayment={(cashReceived) => {
          void executeCheckout(cashReceived);
        }}
        onStartNewTransaction={handleStartNewTransaction}
        onShowReceiptPreview={() => {
          if (completedReceipt) {
            openReceiptPreview(completedReceipt, lastPrintOutcome);
          }
        }}
      />

      {/* Hold / Recall Modal (F4 / F5) */}
      <HeldBillsModal
        isOpen={heldModalMode !== null}
        mode={heldModalMode || "RECALL"}
        currentCart={cart}
        heldBills={heldBills}
        loading={loadingHeldBills}
        onClose={() => setHeldModalMode(null)}
        onConfirmHold={async (holdLabel) => {
          try {
            await ipc.createHeldBill({
              hold_label: holdLabel,
              items: cart.map((item) => ({
                product_id: item.product.id,
                quantity: item.quantity,
              })),
            });
            setCart([]);
            setSelectedIndex(0);
            setHeldModalMode(null);
            await refreshHeldBills();
            showBanner(
              "success",
              `Transaksi "${holdLabel}" berhasil ditahan (Hold Bill).`
            );
          } catch (err) {
            showBanner(
              "error",
              `Gagal menahan transaksi: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }}
        onRecallBill={async (billId) => {
          try {
            const recalled = await ipc.consumeHeldBill(billId);
            const recalledCart: CartItem[] = [];

            for (const item of recalled.held_bill.items) {
              if (!item.is_active || item.current_stock <= 0) {
                continue;
              }
              const clampedQty = Math.min(item.quantity, item.current_stock);
              const prod: Product = {
                id: item.product_id,
                sku: item.sku,
                barcode: item.barcode,
                name: item.product_name,
                category_name: "Umum",
                unit: item.unit,
                cost_price: 0,
                selling_price: item.selling_price,
                discount_type: item.discount_type,
                discount_value: item.discount_value,
                unit_discount_amount: item.unit_discount_amount,
                effective_unit_price: item.effective_unit_price,
                stock: item.current_stock,
                is_active: item.is_active,
                created_at: "",
                updated_at: "",
              };
              recalledCart.push({ product: prod, quantity: clampedQty });
            }

            setCart(recalledCart);
            setSelectedIndex(0);
            setHeldModalMode(null);
            await refreshHeldBills();

            if (recalled.warnings.length > 0) {
              showBanner(
                "warning",
                `Transaksi dipanggil dengan penyesuaian stok: ${recalled.warnings.join(
                  "; "
                )}`
              );
            } else {
              showBanner(
                "success",
                `Transaksi "${
                  recalled.held_bill.hold_label || "Pelanggan Umum"
                }" berhasil dipanggil ke keranjang.`
              );
            }
          } catch (err) {
            showBanner(
              "error",
              `Gagal memanggil transaksi: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }}
        onDeleteBill={async (billId) => {
          try {
            await ipc.deleteHeldBill(billId);
            const updated = await ipc.listHeldBills();
            setHeldBills(updated);
          } catch (err) {
            showBanner(
              "error",
              `Gagal menghapus Hold Bill: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }}
      />

      {/* Today's Sales & Void Drawer (F6) */}
      <TodaySalesDrawer
        isOpen={todaySalesOpen}
        sales={todaySales}
        loading={loadingTodaySales}
        onClose={() => setTodaySalesOpen(false)}
        onReprintSale={async (saleId) => {
          try {
            const receipt = await ipc.getSaleReceipt(saleId, true);
            const outcome = await ipc.printReceipt(receipt);
            openReceiptPreview(receipt, outcome);
          } catch (err) {
            showBanner(
              "error",
              `Gagal mencetak ulang: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }}
        onVoidSale={async (saleId, adminPin, voidReason) => {
          await ipc.voidSale({
            sale_id: saleId,
            admin_pin: adminPin,
            void_reason: voidReason,
          });
          const updated = await ipc.listTodaySales();
          setTodaySales(updated);
          showBanner(
            "success",
            "Transaksi berhasil dibatalkan (Void) & stok dikembalikan."
          );
        }}
      />

      {/* Shift Open Modal (Barrier modal if cashier has no active shift) */}
      <ShiftOpenModal
        isOpen={shiftOpenModalOpen || (user?.role === "CASHIER" && !activeShift)}
        isBarrier={user?.role === "CASHIER" && !activeShift}
        cashierName={user?.full_name || "Kasir"}
        terminalName={terminalStatus?.config.terminal_name || "Kasir"}
        onShiftOpened={async (shift) => {
          await refreshActiveShift();
          setShiftOpenModalOpen(false);
          showBanner(
            "success",
            `Shift kasir dibuka dengan modal kas ${formatRupiah(
              shift.opening_float
            )}.`
          );
        }}
        onClose={() => setShiftOpenModalOpen(false)}
      />

      {/* Shift Close Modal (Blind Close & Z-Report) */}
      {activeShift && (
        <ShiftCloseModal
          isOpen={shiftCloseModalOpen}
          activeShift={activeShift}
          onClose={() => setShiftCloseModalOpen(false)}
          onShiftClosed={async (_shift, report) => {
            await refreshActiveShift();
            setShiftCloseModalOpen(false);
            showBanner(
              "success",
              `Shift kasir (${report.shift.cashier_name_snapshot}) berhasil ditutup. Laporan Z telah diproses.`
            );
          }}
        />
      )}

      {/* Cash In / Cash Out Modal (F7) */}
      {activeShift && (
        <CashMovementModal
          isOpen={cashMovementModalOpen}
          activeShift={activeShift}
          onClose={() => setCashMovementModalOpen(false)}
          onMovementRecorded={async (movement) => {
            await refreshActiveShift();
            setCashMovementModalOpen(false);
            showBanner(
              "success",
              `${
                movement.movement_type === "CASH_IN" ? "Kas Masuk" : "Kas Keluar"
              } sebesar ${formatRupiah(movement.amount)} tercatat.`
            );
          }}
        />
      )}

      {/* Shift Report Preview & Re-print Modal */}
      <ShiftReportPreviewModal
        report={previewShiftReport}
        outcome={previewOutcome}
        onClose={closeShiftReportPreview}
      />
    </div>
  );
};
