import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ipc } from "../services/ipc";
import type {
  PrintOutcome,
  ReceiptData,
  TerminalStatus,
} from "../types/domain";

interface TerminalContextValue {
  terminalStatus: TerminalStatus | null;
  loadingTerminal: boolean;
  refreshTerminalStatus: () => Promise<TerminalStatus | null>;
  previewReceipt: ReceiptData | null;
  previewOutcome: PrintOutcome | null;
  openReceiptPreview: (
    receipt: ReceiptData,
    outcome?: PrintOutcome | null,
  ) => void;
  closeReceiptPreview: () => void;
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
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptData | null>(
    null,
  );
  const [previewOutcome, setPreviewOutcome] = useState<PrintOutcome | null>(
    null,
  );

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

  useEffect(() => {
    void refreshTerminalStatus();
    // Polling kesehatan koneksi LAN berkala setiap 5 detik (NFR-REL-01)
    const timer = window.setInterval(() => {
      void refreshTerminalStatus();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshTerminalStatus]);

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

  return (
    <TerminalContext.Provider
      value={{
        terminalStatus,
        loadingTerminal,
        refreshTerminalStatus,
        previewReceipt,
        previewOutcome,
        openReceiptPreview,
        closeReceiptPreview,
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
