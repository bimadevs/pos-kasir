import type { ReceiptData } from "../types/domain";
import { formatRupiah } from "./posCalculator";

/**
 * Format timestamp ringkas dd/mm/yyyy hh:mm identik dengan implementasi Rust ESC/POS.
 */
export function formatTimestampShort(isoString: string): string {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString.slice(0, 16);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Memecah teks menjadi baris-baris yang tidak melebihi batas kolom (cols).
 * Jika ada kata yang panjangnya melebihi cols, kata tersebut akan dipecah per cols.
 */
export function wrapFallbackWords(text: string, cols: number): string[] {
  const trimmed = text.trim();
  if (!trimmed || cols <= 0) return [];
  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length <= cols) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= cols) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    } else {
      // Kata lebih panjang dari lebar kolom
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += cols) {
        const chunk = word.slice(i, i + cols);
        if (i + cols >= word.length) {
          current = chunk;
        } else {
          lines.push(chunk);
        }
      }
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

/**
 * Menghasilkan representasi string monospaced struk kasir untuk mode pratinjau (Receipt Preview)
 * maupun fallback cetak tanpa driver grafis.
 * Susunan teks dan label diselaraskan 100% identik dengan `render_receipt_text` di Rust ESC/POS.
 */
export function renderFallbackReceiptText(
  receipt: ReceiptData,
  cols: number,
  marginSpaces = 0,
): string {
  const marginCount = Math.min(marginSpaces, Math.max(0, cols - 16));
  const contentCols = cols - marginCount;
  const margin = " ".repeat(marginCount);
  const divider = "-".repeat(contentCols);

  const center = (text: string) => {
    return wrapFallbackWords(text, contentCols)
      .map((line) => {
        const pad = Math.max(0, Math.floor((contentCols - line.length) / 2));
        return margin + " ".repeat(pad) + line;
      })
      .join("\n");
  };

  const leftRight = (left: string, right: string) => {
    if (right.length >= contentCols) {
      return margin + right.slice(0, contentCols);
    }
    const maxLeft = contentCols - right.length - 1;
    const truncatedLeft = left.slice(0, Math.max(0, maxLeft));
    const space = Math.max(1, contentCols - truncatedLeft.length - right.length);
    return margin + truncatedLeft + " ".repeat(space) + right;
  };

  const lines: string[] = [];

  // 1. Identitas Toko (Rata Tengah)
  for (const line of wrapFallbackWords(receipt.store_name.toUpperCase(), contentCols)) {
    lines.push(center(line));
  }
  if (receipt.store_address?.trim()) {
    for (const line of wrapFallbackWords(receipt.store_address, contentCols)) {
      lines.push(center(line));
    }
  }
  if (receipt.store_phone?.trim()) {
    const phone = `Telp: ${receipt.store_phone.trim()}`;
    for (const line of wrapFallbackWords(phone, contentCols)) {
      lines.push(center(line));
    }
  }
  lines.push(margin + divider);

  // 2. Metadata Transaksi
  const noLine = `No   : ${receipt.sale.receipt_number}`;
  for (const line of wrapFallbackWords(noLine, contentCols)) {
    lines.push(margin + line);
  }
  const tglLine = `Tgl  : ${formatTimestampShort(receipt.sale.created_at)}`;
  for (const line of wrapFallbackWords(tglLine, contentCols)) {
    lines.push(margin + line);
  }
  const cashierLine = `Kasir: ${receipt.sale.cashier_name_snapshot} (${receipt.sale.terminal_name})`;
  for (const line of wrapFallbackWords(cashierLine, contentCols)) {
    lines.push(margin + line);
  }
  lines.push(margin + divider);

  // 3. Indikator Cetakan Ulang atau Void
  if (receipt.is_reprint) {
    lines.push(center("*** CETAKAN ULANG ***"));
  }
  if (receipt.sale.status === "VOIDED") {
    lines.push(center("*** TRANSAKSI DIBATALKAN (VOID) ***"));
  }

  // 4. Line Items
  for (const item of receipt.items) {
    for (const nameLine of wrapFallbackWords(
      item.product_name_snapshot,
      contentCols,
    )) {
      lines.push(margin + nameLine);
    }

    if (item.applied_tier_price != null && item.applied_tier_price > 0) {
      const grossLine = item.selling_price_snapshot * item.quantity;
      const lineTotal = item.subtotal;
      const savings = Math.max(0, grossLine - lineTotal);
      const qtyPriceLeft = `${item.quantity} ${item.unit_snapshot} x ${formatRupiah(item.applied_tier_price, false)}`;
      lines.push(
        leftRight(
          qtyPriceLeft,
          formatRupiah(lineTotal, false),
        ),
      );
      lines.push(
        leftRight(`  ↳ Harga Grosir`, `(Hemat ${formatRupiah(savings, false)})`),
      );
    } else {
      const grossLine = item.selling_price_snapshot * item.quantity;
      const qtyPriceLeft = `${item.quantity} ${item.unit_snapshot} x ${formatRupiah(item.selling_price_snapshot, false)}`;
      lines.push(
        leftRight(
          qtyPriceLeft,
          formatRupiah(grossLine, false),
        ),
      );
      if (item.unit_discount_amount > 0) {
        const totalDisc = item.unit_discount_amount * item.quantity;
        lines.push(
          leftRight(`  Diskon Produk`, `(${formatRupiah(totalDisc, false)})`),
        );
      }
    }
  }

  lines.push(margin + divider);

  // 5. Ringkasan Finansial Pembayaran
  lines.push(leftRight("Subtotal", formatRupiah(receipt.sale.subtotal, false)));
  if (receipt.sale.discount_total > 0) {
    lines.push(
      leftRight("Total Diskon", `(${formatRupiah(receipt.sale.discount_total, false)})`),
    );
  }
  lines.push(leftRight("TOTAL", formatRupiah(receipt.sale.total_amount, false)));
  lines.push(leftRight("Tunai", formatRupiah(receipt.sale.cash_received, false)));
  lines.push(leftRight("Kembalian", formatRupiah(receipt.sale.change_amount, false)));
  lines.push(margin + divider);

  // 6. Footer Struk
  if (receipt.receipt_footer?.trim()) {
    for (const line of wrapFallbackWords(receipt.receipt_footer, contentCols)) {
      lines.push(center(line));
    }
  }

  return lines.join("\n");
}
