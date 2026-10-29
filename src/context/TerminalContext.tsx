import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ipc } from "../services/ipc";
import type {
  CashierShift,
  PrintOutcome,
  ReceiptData,
  ShiftReportData,
  TerminalStatus,
} from "../types/domain";

interface TerminalContextValue {
  terminalStatus: TerminalStatus | null;
  loadingTerminal: boolean;
  refreshTerminalStatus: () => Promise<TerminalStatus | null>;
  activeShift: CashierShift | null;
  loadingShift: boolean;
  refreshActiveShift: () => Promise<CashierShift | null>;
  previewReceipt: ReceiptData | null;
  previewOutcome: PrintOutcome | null;
  openReceiptPreview: (
    receipt: ReceiptData,
    outcome?: PrintOutcome | null,
  ) => void;
  closeReceiptPreview: () => void;
  previewShiftReport: ShiftReportData | null;
  openShiftReportPreview: (
    report: ShiftReportData,
    outcome?: PrintOutcome | null,
  ) => void;
  closeShiftReportPreview: () => void;
}

const TerminalContext = createContext<TerminalContextValue | undefined>(
  undefined,
);

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus | null>(
    null,
  );
  const [loadingTerminal, setLoadingTerminal] = useState<boolean>(true);
  const [activeShift, setActiveShift] = useState<CashierShift | null>(null);
  const [loadingShift, setLoadingShift] = useState<boolean>(true);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptData | null>(
    null,
  );
  const [previewOutcome, setPreviewOutcome] = useState<PrintOutcome | null>(
    null,
  );
  const [previewShiftReport, setPreviewShiftReport] =
    useState<ShiftReportData | null>(null);
  const pollingTerminalRef = useRef(false);
  const pollingShiftRef = useRef(false);

  const refreshTerminalStatus =
    useCallback(async (): Promise<TerminalStatus | null> => {
      try {
        const status = await ipc.getTerminalStatus();
        setTerminalStatus(status);
        return status;
      } catch (err) {
        console.error("Gagal membaca status terminal:", err);
        return null;
      } finally {
        setLoadingTerminal(false);
      }
    }, []);

  const refreshActiveShift =
    useCallback(async (): Promise<CashierShift | null> => {
      try {
        const shift = await ipc.getActiveShift();
        setActiveShift(shift);
        return shift;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Hanya hapus state activeShift jika pengguna memang belum login atau sesi telah berakhir.
        // Apabila gagal karena jaringan LAN ke Server sedang terputus sementara, pertahankan activeShift
        // terakhir agar Kasir tidak tiba-tiba terkunci di popup "Buka Shift Kasir Baru".
        if (
          msg.includes("Silakan login") ||
          msg.includes("Sesi tidak valid") ||
          msg.includes("Akun sudah tidak aktif")
        ) {
          setActiveShift(null);
        }
        return null;
      } finally {
        setLoadingShift(false);
      }
    }, []);

  useEffect(() => {
    void refreshTerminalStatus();
    void refreshActiveShift();
    // Polling kesehatan koneksi LAN berkala setiap 5 detik (NFR-REL-01) tanpa menumpuk request paralel
    const timer = window.setInterval(() => {
      if (!pollingTerminalRef.current) {
        pollingTerminalRef.current = true;
        void refreshTerminalStatus().finally(() => {
          pollingTerminalRef.current = false;
        });
      }
      if (!pollingShiftRef.current) {
        pollingShiftRef.current = true;
        void refreshActiveShift().finally(() => {
          pollingShiftRef.current = false;
        });
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshTerminalStatus, refreshActiveShift]);

  const openReceiptPreview = useCallback(
    (receipt: ReceiptData, outcome?: PrintOutcome | null) => {
      setPreviewReceipt(receipt);
      setPreviewOutcome(outcome ?? null);
    },
    [],
  );

  const closeReceiptPreview = useCallback(() => {
    setPreviewReceipt(null);
    setPreviewOutcome(null);
  }, []);

  const openShiftReportPreview = useCallback(
    (report: ShiftReportData, outcome?: PrintOutcome | null) => {
      setPreviewShiftReport(report);
      setPreviewOutcome(outcome ?? null);
    },
    [],
  );

  const closeShiftReportPreview = useCallback(() => {
    setPreviewShiftReport(null);
    setPreviewOutcome(null);
  }, []);

  return (
    <TerminalContext.Provider
      value={{
        terminalStatus,
        loadingTerminal,
        refreshTerminalStatus,
        activeShift,
        loadingShift,
        refreshActiveShift,
        previewReceipt,
        previewOutcome,
        openReceiptPreview,
        closeReceiptPreview,
        previewShiftReport,
        openShiftReportPreview,
        closeShiftReportPreview,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
};

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) {
    throw new Error("useTerminal harus digunakan di dalam TerminalProvider");
  }
  return ctx;
}
