import type { ReceiptData } from "../types/domain";
import { formatDateTimeId, formatRupiah } from "./posCalculator";

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
  const doubleDivider = "=".repeat(contentCols);

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
  lines.push(center(receipt.store_name.toUpperCase()));
  if (receipt.store_address?.trim()) {
    lines.push(center(receipt.store_address));
  }
  if (receipt.store_phone?.trim()) {
    lines.push(center(`Telp: ${receipt.store_phone.trim()}`));
  }
  lines.push(margin + doubleDivider);

  if (receipt.is_reprint) {
    lines.push(center("*** CETAKAN ULANG ***"));
  }
  if (receipt.sale.status === "VOIDED") {
    lines.push(center("*** TRANSAKSI DIBATALKAN (VOID) ***"));
  }

  for (const line of wrapFallbackWords(
    `No   : ${receipt.sale.receipt_number}`,
    contentCols,
  )) {
    lines.push(margin + line);
  }
  for (const line of wrapFallbackWords(
    `Waktu: ${formatDateTimeId(receipt.sale.created_at)}`,
    contentCols,
  )) {
    lines.push(margin + line);
  }
  const cashierLine = `Kasir: ${receipt.sale.cashier_name_snapshot} (${receipt.sale.terminal_name})`;
  for (const line of wrapFallbackWords(cashierLine, contentCols)) {
    lines.push(margin + line);
  }

  lines.push(margin + divider);

  for (const item of receipt.items) {
    for (const nameLine of wrapFallbackWords(
      item.product_name_snapshot,
      contentCols,
    )) {
      lines.push(margin + nameLine);
    }
    const grossLine = item.selling_price_snapshot * item.quantity;

    if (item.applied_tier_price != null && item.applied_tier_price > 0) {
      const lineTotal = item.subtotal;
      const savings = Math.max(0, grossLine - lineTotal);
      lines.push(
        leftRight(
          `  ${item.quantity} ${item.unit_snapshot} x ${formatRupiah(item.applied_tier_price, false)}`,
          formatRupiah(lineTotal, false),
        ),
      );
      lines.push(
        leftRight(`  ↳ [Harga Grosir]`, `(Hemat ${formatRupiah(savings, false)})`),
      );
    } else {
      lines.push(
        leftRight(
          `  ${item.quantity} ${item.unit_snapshot} x ${formatRupiah(item.selling_price_snapshot, false)}`,
          formatRupiah(grossLine, false),
        ),
      );
      if (item.unit_discount_amount > 0) {
        const totalDisc = item.unit_discount_amount * item.quantity;
        lines.push(
          leftRight(`  ↳ Diskon`, `-${formatRupiah(totalDisc, false)}`),
        );
      }
    }
  }

  lines.push(margin + divider);
  lines.push(leftRight("Subtotal", formatRupiah(receipt.sale.subtotal)));
  if (receipt.sale.discount_total > 0) {
    lines.push(
      leftRight("Total Diskon", `-${formatRupiah(receipt.sale.discount_total)}`),
    );
  }
  lines.push(margin + doubleDivider);
  lines.push(leftRight("TOTAL BAYAR", formatRupiah(receipt.sale.total_amount)));
  lines.push(leftRight("Tunai", formatRupiah(receipt.sale.cash_received)));
  lines.push(leftRight("Kembalian", formatRupiah(receipt.sale.change_amount)));
  lines.push(margin + divider);

  if (receipt.receipt_footer?.trim()) {
    lines.push(center(receipt.receipt_footer));
  }

  return lines.join("\n");
}
