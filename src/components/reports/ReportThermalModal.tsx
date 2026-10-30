import React from "react";
import { Check, Copy, Printer, X } from "lucide-react";

interface ReportThermalModalProps {
  title: string;
  reportText: string;
  onClose: () => void;
}

export const ReportThermalModal: React.FC<ReportThermalModalProps> = ({
  title,
  reportText,
  onClose,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            @page { margin: 0; size: 58mm auto; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              line-height: 1.25;
              padding: 8px;
              margin: 0;
              color: #000;
              white-space: pre-wrap;
              word-break: break-all;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
          <div>
            <h3 className="font-bold text-sm text-zinc-900">{title}</h3>
            <p className="text-[11px] text-zinc-500">
              Format struk thermal Raw ESC/POS 58mm / 80mm
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

        {/* Paper Body */}
        <div className="p-4 overflow-y-auto bg-zinc-200/70 flex justify-center">
          <div className="bg-white p-4 shadow-md rounded-md w-full font-mono text-[11px] leading-relaxed text-zinc-900 whitespace-pre overflow-x-auto border border-zinc-300">
            {reportText}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
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
                Salin Teks
              </>
            )}
          </button>

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
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-xs font-bold cursor-pointer transition-all shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Thermal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
