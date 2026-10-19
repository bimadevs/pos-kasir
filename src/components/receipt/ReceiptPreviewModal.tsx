import React, { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  Printer,
  Terminal,
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

  const [viewMode, setViewMode] = useState<"visual" | "raw">("visual");
  const [printing, setPrinting] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const handleCopyRaw = async () => {
    if (!renderedText) return;
    try {
      await navigator.clipboard.writeText(renderedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback manual jika clipboard API tidak tersedia
      const textarea = document.createElement("textarea");
      textarea.value = renderedText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const receipt = previewReceipt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Topbar */}
        <div className="bg-zinc-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-wide text-zinc-100">
                  Pratinjau Struk Kasir
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {paperWidth}mm • {cols} Kolom
                </span>
                {leftMarginChars > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800">
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

        {/* View Mode Tabs & Status Bar */}
        <div className="bg-zinc-100/90 border-b border-zinc-200 px-5 py-2 flex items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-1.5 p-0.5 bg-zinc-200/80 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode("visual")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer ${
                viewMode === "visual"
                  ? "bg-white text-zinc-900 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-indigo-600" />
              Tampilan Visual Struk
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer ${
                viewMode === "raw"
                  ? "bg-white text-zinc-900 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-zinc-500" />
              Teks Asli ESC/POS
            </button>
          </div>

          <div className="flex items-center gap-2">
            {viewMode === "raw" && (
              <button
                type="button"
                onClick={() => void handleCopyRaw()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-300 transition-colors cursor-pointer shadow-2xs"
                title="Salin teks mentah ESC/POS"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-semibold">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Salin Teks</span>
                  </>
                )}
              </button>
            )}
            <span className="flex items-center gap-1.5 font-medium text-zinc-700 hidden sm:inline-flex">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {receipt?.is_reprint ? "Cetakan Ulang" : "Struk Transaksi"}
            </span>
          </div>
        </div>

        {statusMessage && (
          <div className="bg-indigo-50 border-b border-indigo-200 px-5 py-2 text-xs text-indigo-900 font-medium">
            {statusMessage}
          </div>
        )}

        {/* Scrollable Receipt Area */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-zinc-200/90 flex justify-center flex-1">
          {viewMode === "visual" && receipt ? (
            /* Visual Thermal Card */
            <div
              className={`bg-white text-zinc-900 shadow-lg border border-zinc-300 rounded-sm p-5 sm:p-6 select-all transition-all duration-150 relative ${
                paperWidth === 80
                  ? "w-full max-w-[420px]"
                  : "w-full max-w-[330px]"
              }`}
              style={{
                fontFamily:
                  '"JetBrains Mono", "Consolas", "Courier New", monospace',
              }}
            >
              {/* Header Toko */}
              <div className="text-center space-y-1">
                <h4 className="font-extrabold text-base tracking-wide text-zinc-950 uppercase break-words leading-tight">
                  {receipt.store_name}
                </h4>
                {receipt.store_address && (
                  <p className="text-xs text-zinc-600 break-words leading-relaxed">
                    {receipt.store_address}
                  </p>
                )}
                {receipt.store_phone && (
                  <p className="text-xs text-zinc-600">
                    Telp: {receipt.store_phone}
                  </p>
                )}
              </div>

              {/* Garis Putus-putus Header */}
              <div className="border-b-2 border-dashed border-zinc-400/80 my-3.5" />

              {/* Status Banner Cetakan Ulang / Void */}
              {receipt.is_reprint && (
                <div className="text-center py-1 mb-2 bg-zinc-100 rounded border border-dashed border-zinc-400 text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  *** CETAKAN ULANG ***
                </div>
              )}
              {receipt.sale.status === "VOIDED" && (
                <div className="text-center py-1 mb-2 bg-rose-50 rounded border border-rose-300 text-xs font-bold text-rose-800 uppercase tracking-wider">
                  *** TRANSAKSI DIBATALKAN (VOID) ***
                </div>
              )}

              {/* Metadata Transaksi */}
              <div className="text-xs space-y-1 text-zinc-800">
                <div className="flex justify-between">
                  <span className="text-zinc-500">No. Struk</span>
                  <span className="font-bold text-zinc-950 font-mono">
                    {receipt.sale.receipt_number}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Waktu</span>
                  <span className="font-medium">
                    {formatDateTimeId(receipt.sale.created_at)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-zinc-500 shrink-0">Kasir</span>
                  <span className="text-right font-medium break-words">
                    {receipt.sale.cashier_name_snapshot}{" "}
                    <span className="text-zinc-500 text-[11px]">
                      ({receipt.sale.terminal_name})
                    </span>
                  </span>
                </div>
              </div>

              {/* Garis Pembatas Sebelum Item */}
              <div className="border-b border-dashed border-zinc-300 my-3" />

              {/* Rincian Line Items (Zero Overflow, Rapi & Presisi) */}
              <div className="space-y-2.5 text-xs">
                {receipt.items.map((item) => {
                  const grossLine =
                    item.selling_price_snapshot * item.quantity;
                  const totalDisc =
                    item.unit_discount_amount * item.quantity;

                  return (
                    <div key={item.id} className="space-y-0.5">
                      {/* Baris 1: Nama Produk (Bisa multi-baris tanpa overflow) */}
                      <div className="font-semibold text-zinc-950 break-words leading-snug">
                        {item.product_name_snapshot}
                      </div>

                      {/* Baris 2: Qty x Harga Satuan vs Subtotal Kotor */}
                      <div className="flex justify-between items-baseline text-zinc-700">
                        <span className="text-[11px] text-zinc-600 font-mono">
                          {item.quantity} {item.unit_snapshot} x{" "}
                          {formatRupiah(item.selling_price_snapshot, false)}
                        </span>
                        <span className="font-bold font-mono tabular-nums text-zinc-950">
                          {formatRupiah(grossLine, false)}
                        </span>
                      </div>

                      {/* Sub-baris: Diskon Produk (jika ada) */}
                      {totalDisc > 0 && (
                        <div className="flex justify-between items-baseline text-[11px] text-amber-800 font-mono">
                          <span className="pl-2">↳ Diskon Produk</span>
                          <span className="font-semibold tabular-nums">
                            -{formatRupiah(totalDisc, false)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Garis Pembatas Sebelum Ringkasan Total */}
              <div className="border-b border-dashed border-zinc-300 my-3" />

              {/* Ringkasan Pembayaran */}
              <div className="text-xs space-y-1.5 text-zinc-800">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Subtotal</span>
                  <span className="font-semibold font-mono tabular-nums">
                    {formatRupiah(receipt.sale.subtotal)}
                  </span>
                </div>

                {receipt.sale.discount_total > 0 && (
                  <div className="flex justify-between text-amber-800 font-medium">
                    <span>Total Diskon</span>
                    <span className="font-mono tabular-nums">
                      -{formatRupiah(receipt.sale.discount_total)}
                    </span>
                  </div>
                )}

                <div className="border-b-2 border-dashed border-zinc-400/80 my-2" />

                <div className="flex justify-between items-baseline pt-0.5">
                  <span className="font-extrabold text-sm text-zinc-950 tracking-wide">
                    TOTAL BAYAR
                  </span>
                  <span className="font-black text-base text-zinc-950 font-mono tabular-nums">
                    {formatRupiah(receipt.sale.total_amount)}
                  </span>
                </div>

                <div className="flex justify-between text-zinc-700 pt-1">
                  <span>Tunai</span>
                  <span className="font-semibold font-mono tabular-nums">
                    {formatRupiah(receipt.sale.cash_received)}
                  </span>
                </div>

                <div className="flex justify-between text-zinc-700">
                  <span>Kembalian</span>
                  <span className="font-bold text-emerald-700 font-mono tabular-nums">
                    {formatRupiah(receipt.sale.change_amount)}
                  </span>
                </div>
              </div>

              {/* Garis Pembatas Footer */}
              <div className="border-b-2 border-dashed border-zinc-400/80 my-4" />

              {/* Pesan Footer Toko */}
              {receipt.receipt_footer ? (
                <div className="text-center text-xs text-zinc-600 leading-relaxed italic break-words px-2">
                  {receipt.receipt_footer}
                </div>
              ) : (
                <div className="text-center text-xs text-zinc-500 italic">
                  Terima kasih atas kunjungan Anda!
                </div>
              )}
            </div>
          ) : (
            /* Raw Monospaced ESC/POS Preview */
            <div
              className={`thermal-paper bg-white text-zinc-900 shadow-md border border-zinc-300 p-5 rounded-xs select-all overflow-x-auto ${
                paperWidth === 80 ? "w-full max-w-[440px]" : "w-full max-w-[340px]"
              }`}
            >
              <pre className="font-mono text-xs leading-relaxed whitespace-pre m-0">
                {renderedText}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-zinc-50 border-t border-zinc-200 px-5 py-3.5 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Tekan <kbd className="kbd-key">Esc</kbd> untuk menutup
          </span>
          <div className="flex items-center gap-2.5">
            {previewReceipt && (
              <button
                type="button"
                onClick={() => void handlePrintAgain()}
                disabled={printing}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                {printing ? "Mencetak..." : "Cetak Ulang"}
              </button>
            )}
            <button
              type="button"
              onClick={closeReceiptPreview}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-xs"
            >
              Selesai (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
