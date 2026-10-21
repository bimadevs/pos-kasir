import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Printer,
  X,
} from "lucide-react";
import { useTerminal } from "../../context/TerminalContext";
import { ipc } from "../../services/ipc";
import type { ReceiptData } from "../../types/domain";
import { formatDateTimeId, formatRupiah } from "../../utils/posCalculator";

export function wrapFallbackWords(text: string, cols: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      if (word.length <= cols) {
        current = word;
      } else {
        for (let i = 0; i < word.length; i += cols) {
          lines.push(word.slice(i, i + cols));
        }
      }
    } else if (current.length + 1 + word.length <= cols) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word.length <= cols ? word : word.slice(0, cols);
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

export function renderFallbackReceiptText(receipt: ReceiptData, cols: number, marginSpaces = 0): string {
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
    const truncatedLeft = left.slice(0, maxLeft);
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

  for (const line of wrapFallbackWords(`No   : ${receipt.sale.receipt_number}`, contentCols)) {
    lines.push(margin + line);
  }
  for (const line of wrapFallbackWords(`Waktu: ${formatDateTimeId(receipt.sale.created_at)}`, contentCols)) {
    lines.push(margin + line);
  }
  const cashierLine = `Kasir: ${receipt.sale.cashier_name_snapshot} (${receipt.sale.terminal_name})`;
  for (const line of wrapFallbackWords(cashierLine, contentCols)) {
    lines.push(margin + line);
  }

  lines.push(margin + divider);

  for (const item of receipt.items) {
    for (const nameLine of wrapFallbackWords(item.product_name_snapshot, contentCols)) {
      lines.push(margin + nameLine);
    }
    const grossLine = item.selling_price_snapshot * item.quantity;
    lines.push(
      leftRight(
        `  ${item.quantity} ${item.unit_snapshot} x ${formatRupiah(item.selling_price_snapshot, false)}`,
        formatRupiah(grossLine, false)
      )
    );
    if (item.unit_discount_amount > 0) {
      const totalDisc = item.unit_discount_amount * item.quantity;
      lines.push(
        leftRight(
          `  ↳ Diskon`,
          `-${formatRupiah(totalDisc, false)}`
        )
      );
    }
  }

  lines.push(margin + divider);
  lines.push(leftRight("Subtotal", formatRupiah(receipt.sale.subtotal)));
  if (receipt.sale.discount_total > 0) {
    lines.push(
      leftRight("Total Diskon", `-${formatRupiah(receipt.sale.discount_total)}`)
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

export const ReceiptPreviewModal: React.FC = () => {
  const {
    previewReceipt,
    previewOutcome,
    openReceiptPreview,
    closeReceiptPreview,
    terminalStatus,
  } = useTerminal();

  const [printing, setPrinting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!previewReceipt && !previewOutcome) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeReceiptPreview();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewReceipt, previewOutcome, closeReceiptPreview]);

  if (!previewReceipt && !previewOutcome) {
    return null;
  }

  const paperWidth =
    previewOutcome?.paper_width ??
    terminalStatus?.config.printer.paper_width ??
    58;
  const leftMarginChars =
    previewOutcome?.left_margin_chars ??
    terminalStatus?.config.printer.left_margin_chars ??
    0;
  const cols = paperWidth === 80 ? 48 : 32;

  const renderedText =
    previewOutcome?.rendered_text ||
    (previewReceipt ? renderFallbackReceiptText(previewReceipt, cols, leftMarginChars) : "");

  const handlePrintAgain = async () => {
    if (!previewReceipt) return;
    setPrinting(true);
    setStatusMessage(null);
    try {
      const reprintData: ReceiptData = {
        ...previewReceipt,
        is_reprint: true,
      };
      const outcome = await ipc.printReceipt(reprintData);
      openReceiptPreview(reprintData, outcome);
      setStatusMessage("Struk berhasil dikirim ke printer (Cetakan Ulang).");
    } catch (err) {
      setStatusMessage(
        `Gagal mencetak: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setPrinting(false);
    }
  };

  const receipt = previewReceipt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Topbar */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-600/30 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-wide text-zinc-100">
                  Pratinjau Struk Kasir
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-zinc-300 border border-slate-700">
                  {paperWidth}mm • {cols} Kolom
                </span>
                {leftMarginChars > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-teal-950/80 text-teal-300 border border-teal-800">
                    +{leftMarginChars} Spasi
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 truncate max-w-xs sm:max-w-sm">
                {previewOutcome?.simulated
                  ? "Mode Virtual Thermal Printer (Simulasi)"
                  : `Target: ${
                      previewOutcome?.printer_name ??
                      terminalStatus?.config.printer.printer_name ??
                      "Default Printer"
                    }`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeReceiptPreview}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-bar: Status Struk */}
        <div className="bg-zinc-100/90 border-b border-zinc-200 px-5 py-2.5 flex items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-700">Tampilan Asli Struk (ESC/POS)</span>
            <span className="text-zinc-400">•</span>
            <span className="text-zinc-500 font-mono text-[11px]">{cols} Karakter / Baris</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-medium text-zinc-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {receipt?.is_reprint ? "Cetakan Ulang" : "Struk Transaksi"}
            </span>
          </div>
        </div>

        {statusMessage && (
          <div className="bg-teal-50 border-b border-teal-200 px-5 py-2 text-xs text-teal-900 font-medium">
            {statusMessage}
          </div>
        )}

        {/* Scrollable Receipt Area */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-zinc-200/90 flex justify-center flex-1">
          {/* Authentic Monospaced ESC/POS Thermal Receipt */}
          <div
            className={`thermal-paper bg-white text-zinc-900 shadow-md border border-zinc-300 p-5 sm:p-6 rounded-xs select-all overflow-x-auto ${
              paperWidth === 80 ? "w-full max-w-[440px]" : "w-full max-w-[340px]"
            }`}
          >
            <pre className="font-mono text-xs leading-relaxed whitespace-pre m-0">
              {renderedText}
            </pre>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-zinc-50 border-t border-zinc-200 px-6 py-4 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Tekan <kbd className="kbd-key">Esc</kbd> untuk menutup
          </span>
          <div className="flex items-center gap-2.5">
            {previewReceipt && (
              <button
                type="button"
                onClick={() => void handlePrintAgain()}
                disabled={printing}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-zinc-800 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                <Printer className="w-4 h-4" />
                {printing ? "Mencetak..." : "Cetak Ulang"}
              </button>
            )}
            <button
              type="button"
              onClick={closeReceiptPreview}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white transition-all cursor-pointer shadow-xs"
            >
              Selesai (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
