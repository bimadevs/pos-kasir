import React, { useEffect, useState } from "react";
import { CheckCircle2, FileText, Printer, X } from "lucide-react";
import { useTerminal } from "../../context/TerminalContext";
import { ipc } from "../../services/ipc";
import type { ReceiptData } from "../../types/domain";
import { formatDateTimeId, formatRupiah } from "../../utils/posCalculator";

function renderFallbackReceiptText(receipt: ReceiptData, cols: number): string {
  const divider = "-".repeat(cols);
  const doubleDivider = "=".repeat(cols);
  const center = (text: string) => {
    const trimmed = text.slice(0, cols);
    const pad = Math.max(0, Math.floor((cols - trimmed.length) / 2));
    return " ".repeat(pad) + trimmed;
  };
  const leftRight = (left: string, right: string) => {
    const space = Math.max(1, cols - left.length - right.length);
    return left + " ".repeat(space) + right;
  };

  const lines: string[] = [];
  lines.push(center(receipt.store_name.toUpperCase()));
  if (receipt.store_address) lines.push(center(receipt.store_address));
  if (receipt.store_phone) lines.push(center(`Telp: ${receipt.store_phone}`));
  lines.push(doubleDivider);
  if (receipt.is_reprint) {
    lines.push(center("*** CETAKAN ULANG ***"));
    lines.push(divider);
  }
  lines.push(`No   : ${receipt.sale.receipt_number}`);
  lines.push(`Waktu: ${formatDateTimeId(receipt.sale.created_at)}`);
  lines.push(
    `Kasir: ${receipt.sale.cashier_name_snapshot} (${receipt.sale.terminal_name})`
  );
  lines.push(divider);

  for (const item of receipt.items) {
    lines.push(item.product_name_snapshot.slice(0, cols));
    const grossLine = item.selling_price_snapshot * item.quantity;
    lines.push(
      leftRight(
        `  ${item.quantity} x ${formatRupiah(item.selling_price_snapshot, false)}`,
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

  lines.push(divider);
  lines.push(leftRight("Subtotal", formatRupiah(receipt.sale.subtotal)));
  if (receipt.sale.discount_total > 0) {
    lines.push(
      leftRight("Total Diskon", `-${formatRupiah(receipt.sale.discount_total)}`)
    );
  }
  lines.push(doubleDivider);
  lines.push(leftRight("TOTAL BAYAR", formatRupiah(receipt.sale.total_amount)));
  lines.push(leftRight("TUNAI", formatRupiah(receipt.sale.cash_received)));
  lines.push(leftRight("KEMBALI", formatRupiah(receipt.sale.change_amount)));
  lines.push(divider);
  if (receipt.receipt_footer) {
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
  const cols = paperWidth === 80 ? 48 : 32;
  const renderedText =
    previewOutcome?.rendered_text ||
    (previewReceipt ? renderFallbackReceiptText(previewReceipt, cols) : "");

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm tracking-wide">
                Pratinjau Struk Thermal ({paperWidth}mm)
              </h3>
              <p className="text-xs text-slate-400">
                {previewOutcome?.simulated
                  ? "Mode Virtual Thermal Printer (Simulasi ESC/POS)"
                  : `Printer: ${
                      previewOutcome?.printer_name ??
                      terminalStatus?.config.printer.printer_name ??
                      "Default"
                    }`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeReceiptPreview}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-slate-100 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between text-xs text-slate-600">
          <span className="flex items-center gap-1.5 font-medium text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {previewReceipt?.is_reprint
              ? "Status: Cetakan Ulang"
              : "Status: Struk Transaksi"}
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            ESC/POS Raw ({cols} kolom)
          </span>
        </div>

        {statusMessage && (
          <div className="bg-blue-50 border-b border-blue-200 px-5 py-2 text-xs text-blue-800 font-medium">
            {statusMessage}
          </div>
        )}

        {/* Thermal Paper Scroll Area */}
        <div className="p-6 overflow-y-auto bg-slate-200/70 flex justify-center flex-1">
          <div
            className={`thermal-paper bg-white text-slate-900 shadow-lg border border-slate-300 px-5 py-6 rounded-xs select-all ${
              paperWidth === 80 ? "w-[410px]" : "w-[310px]"
            }`}
          >
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words m-0">
              {renderedText}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3.5 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Tekan <kbd className="kbd-key">Esc</kbd> untuk menutup
          </span>
          <div className="flex items-center gap-2.5">
            {previewReceipt && (
              <button
                type="button"
                onClick={() => void handlePrintAgain()}
                disabled={printing}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                {printing ? "Mencetak..." : "Cetak Ulang"}
              </button>
            )}
            <button
              type="button"
              onClick={closeReceiptPreview}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
            >
              Selesai (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
