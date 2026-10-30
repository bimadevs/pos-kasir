import React, { useState } from "react";
import { Check, Copy, Globe, Printer, X } from "lucide-react";
import { ipc } from "../../services/ipc";
import type { PrintOutcome } from "../../types/domain";

interface ReportThermalModalProps {
  title: string;
  reportText: string;
  paperWidth?: number;
  leftMarginChars?: number;
  printerName?: string;
  onClose: () => void;
}

export const ReportThermalModal: React.FC<ReportThermalModalProps> = ({
  title,
  reportText,
  paperWidth = 58,
  leftMarginChars = 0,
  printerName = "Mudita Mart Virtual Thermal Printer (Simulasi)",
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [outcome, setOutcome] = useState<PrintOutcome | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cols = paperWidth === 80 ? 48 : 32;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleThermalPrint = async () => {
    setPrinting(true);
    setErrorMsg(null);
    try {
      const res = await ipc.printThermalText(reportText);
      setOutcome(res);
    } catch (err) {
      setErrorMsg(
        `Gagal mencetak: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setPrinting(false);
    }
  };

  const handleBrowserPrint = () => {
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) {
      window.print();
      return;
    }
    const widthCss = paperWidth === 80 ? "80mm" : "58mm";
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            @page { margin: 0; size: ${widthCss} auto; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.25;
              padding: 6px;
              margin: 0;
              color: #000;
              white-space: pre;
            }
          </style>
        </head>
        <body>${reportText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-zinc-900">{title}</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-100 text-teal-800 border border-teal-200">
                {paperWidth}mm • {cols} Kolom
              </span>
              {leftMarginChars > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                  +{leftMarginChars} Spasi
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Target Printer: <strong className="text-zinc-700">{printerName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alerts */}
        {outcome && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2 text-xs text-emerald-900 font-medium flex items-center justify-between">
            <span>
              {outcome.simulated
                ? "Simulasi Virtual Printer: data struk berhasil dikirim ke layar pratinjau."
                : `Struk thermal berhasil dikirim ke printer "${outcome.printer_name}" (${outcome.bytes_written} byte).`}
            </span>
            <button
              type="button"
              onClick={() => setOutcome(null)}
              className="text-emerald-700 hover:text-emerald-950 font-bold ml-2"
            >
              ×
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-2 text-xs text-rose-900 font-medium flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-rose-700 hover:text-rose-950 font-bold ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* Paper Body */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-zinc-200/80 flex justify-center flex-1">
          <div
            className={`bg-white p-5 sm:p-6 shadow-md rounded-xs font-mono text-xs leading-relaxed text-zinc-900 whitespace-pre overflow-x-auto border border-zinc-300 ${
              paperWidth === 80 ? "w-full max-w-[440px]" : "w-full max-w-[340px]"
            }`}
          >
            {reportText}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-semibold cursor-pointer transition-all shadow-2xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-500" />
                  Salin
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-semibold cursor-pointer transition-all shadow-2xs"
              title="Cetak via dialog browser standar (opsi simpan PDF)"
            >
              <Globe className="w-3.5 h-3.5 text-zinc-500" />
              Cetak Browser
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-zinc-600 hover:bg-zinc-200/60 text-xs font-semibold cursor-pointer transition-all"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => void handleThermalPrint()}
              disabled={printing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-xs font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              {printing ? "Mengirim ke Printer..." : "Cetak ke Printer Thermal"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
