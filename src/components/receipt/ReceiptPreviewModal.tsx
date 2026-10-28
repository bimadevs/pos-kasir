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
import {
  renderFallbackReceiptText,
  wrapFallbackWords,
} from "../../utils/receiptFormatter";

export { renderFallbackReceiptText, wrapFallbackWords };

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

  useEffect(() => {
    if (!previewReceipt && !previewOutcome) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        closeReceiptPreview();
      } else if (e.key === "F10") {
        e.preventDefault();
        void handlePrintAgain();
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

  const receipt = previewReceipt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/40 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Topbar */}
        <div className="bg-emerald-700 text-white px-5 py-3.5 flex items-center justify-between border-b border-emerald-800/80 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-800/80 border border-emerald-600/60 flex items-center justify-center text-amber-300">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-wide text-white">
                  Pratinjau Struk Kasir
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-800 text-emerald-100 border border-emerald-600/60">
                  {paperWidth}mm • {cols} Kolom
                </span>
                {leftMarginChars > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-400 text-amber-950 border border-amber-300">
                    +{leftMarginChars} Spasi
                  </span>
                )}
              </div>
              <p className="text-[11px] text-emerald-100 truncate max-w-xs sm:max-w-sm">
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
            className="text-emerald-100 hover:text-white p-1.5 rounded-lg hover:bg-emerald-800/80 transition-colors cursor-pointer"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-bar: Status Struk & Kembalian */}
        <div className="bg-zinc-100/90 border-b border-zinc-200 px-5 py-2.5 flex items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-700">Tampilan Asli Struk (ESC/POS)</span>
            <span className="text-zinc-400">•</span>
            <span className="text-zinc-500 font-mono text-[11px]">{cols} Kolom</span>
          </div>

          <div className="flex items-center gap-3">
            {receipt?.sale.change_amount !== undefined && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border font-mono ${
                  receipt.sale.change_amount > 0
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-zinc-200 text-zinc-700 border-zinc-300"
                }`}
              >
                {receipt.sale.change_amount > 0
                  ? `Kembalian: Rp ${receipt.sale.change_amount.toLocaleString("id-ID")}`
                  : "Uang Pas (Kembalian: Rp 0)"}
              </span>
            )}
            <span className="flex items-center gap-1.5 font-medium text-zinc-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {receipt?.is_reprint ? "Cetakan Ulang" : "Transaksi Berhasil"}
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
            Tekan <kbd className="kbd-key">Enter</kbd> atau <kbd className="kbd-key">Esc</kbd> untuk menutup
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
                {printing ? "Mencetak..." : "Cetak Ulang (F10)"}
              </button>
            )}
            <button
              type="button"
              onClick={closeReceiptPreview}
              autoFocus
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white transition-all cursor-pointer shadow-xs"
            >
              Selesai / Transaksi Baru (Enter)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
