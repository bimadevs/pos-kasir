import type { CartItem, DiscountType, Product } from "../types/domain";

/**
 * BR-01: Menghitung potongan harga per 1 satuan barang (Rupiah bulat integer floor).
 */
export function calculateUnitDiscount(
  sellingPrice: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  const price = Math.max(0, Math.trunc(sellingPrice));
  const val = Math.max(0, Math.trunc(discountValue));

  switch (discountType) {
    case "NONE":
      return 0;
    case "NOMINAL":
      return Math.min(val, price);
    case "PERCENT": {
      const pct = Math.min(100, val);
      return Math.floor((price * pct) / 100);
    }
    default:
      return 0;
  }
}

/**
 * BR-01: Menghitung harga bersih per satuan setelah diskon.
 */
export function calculateEffectiveUnitPrice(
  sellingPrice: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  const price = Math.max(0, Math.trunc(sellingPrice));
  return price - calculateUnitDiscount(price, discountType, discountValue);
}

export interface CartTotals {
  totalItemsCount: number;
  totalUnitsQty: number;
  subtotalGross: number;
  discountTotal: number;
  totalAmount: number;
}

/**
 * BR-02: Menghitung subtotal kotor, total potongan diskon, dan total tagihan bersih dari keranjang kasir.
 */
export function calculateCartTotals(items: CartItem[]): CartTotals {
  let totalUnitsQty = 0;
  let subtotalGross = 0;
  let discountTotal = 0;

  for (const item of items) {
    const qty = Math.max(1, Math.trunc(item.quantity));
    const unitPrice = Math.max(0, Math.trunc(item.product.selling_price));
    const unitDisc = calculateUnitDiscount(
      unitPrice,
      item.product.discount_type,
      item.product.discount_value,
    );

    totalUnitsQty += qty;
    subtotalGross += unitPrice * qty;
    discountTotal += unitDisc * qty;
  }

  return {
    totalItemsCount: items.length,
    totalUnitsQty,
    subtotalGross,
    discountTotal,
    totalAmount: subtotalGross - discountTotal,
  };
}

export interface AddToCartResult {
  items: CartItem[];
  added: boolean;
  error: string | null;
  highlightedProductId: string | null;
}

/**
 * BR-03 & FR-POS-02: Menambahkan produk ke keranjang dengan validasi blokir keras jika stock == 0 atau qty > stock.
 */
export function addProductToCart(
  currentItems: CartItem[],
  product: Product,
  incrementQty = 1,
): AddToCartResult {
  const delta = Math.max(1, Math.trunc(incrementQty));
  if (!product.is_active) {
    return {
      items: currentItems,
      added: false,
      error: `Produk "${product.name}" sedang nonaktif dan tidak dapat dijual.`,
      highlightedProductId: null,
    };
  }

  if (product.stock <= 0) {
    return {
      items: currentItems,
      added: false,
      error: `STOK HABIS! "${product.name}" memiliki stok 0 ${product.unit}. Transaksi diblokir.`,
      highlightedProductId: null,
    };
  }

  const existingIndex = currentItems.findIndex(
    (c) => c.product.id === product.id,
  );
  const existingQty =
    existingIndex >= 0 ? currentItems[existingIndex].quantity : 0;
  const targetQty = existingQty + delta;

  if (targetQty > product.stock) {
    return {
      items: currentItems,
      added: false,
      error: `Stok "${product.name}" tidak mencukupi! Tersedia: ${product.stock} ${product.unit} (di keranjang sudah ${existingQty} ${product.unit}).`,
      highlightedProductId: product.id,
    };
  }

  if (existingIndex >= 0) {
    const next = [...currentItems];
    next[existingIndex] = {
      product,
      quantity: targetQty,
    };
    return {
      items: next,
      added: true,
      error: null,
      highlightedProductId: product.id,
    };
  }

  return {
    items: [...currentItems, { product, quantity: delta }],
    added: true,
    error: null,
    highlightedProductId: product.id,
  };
}

/**
 * BR-03 & FR-POS-03: Mengubah kuantitas item di keranjang dengan validasi batas stok tersedia.
 */
export function updateCartItemQuantity(
  currentItems: CartItem[],
  productId: string,
  newQuantity: number,
): AddToCartResult {
  const index = currentItems.findIndex((c) => c.product.id === productId);
  if (index < 0) {
    return {
      items: currentItems,
      added: false,
      error: null,
      highlightedProductId: null,
    };
  }

  const target = currentItems[index];
  const qty = Math.trunc(newQuantity);
  if (qty <= 0) {
    return {
      items: currentItems.filter((c) => c.product.id !== productId),
      added: true,
      error: null,
      highlightedProductId: null,
    };
  }

  if (qty > target.product.stock) {
    const clamped = Math.max(1, target.product.stock);
    const next = [...currentItems];
    next[index] = { ...target, quantity: clamped };
    return {
      items: next,
      added: false,
      error: `Kuantitas "${target.product.name}" dibatasi ke sisa stok maksimum (${target.product.stock} ${target.product.unit}).`,
      highlightedProductId: productId,
    };
  }

  const next = [...currentItems];
  next[index] = { ...target, quantity: qty };
  return {
    items: next,
    added: true,
    error: null,
    highlightedProductId: productId,
  };
}

/**
 * Memformat bilangan bulat ke format mata uang Rupiah (contoh: 17500 -> "Rp 17.500").
 */
export function formatRupiah(amount: number, withPrefix = true): string {
  const rounded = Math.trunc(Number.isFinite(amount) ? amount : 0);
  const isNegative = rounded < 0;
  const formatted = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (!withPrefix) {
    return isNegative ? `-${formatted}` : formatted;
  }
  return isNegative ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

export function formatDateTimeId(isoString: string): string {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString.slice(0, 16);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeOnly(isoString: string): string {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString.slice(11, 16);
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function todayLocalIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
