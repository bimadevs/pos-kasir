import { useEffect, useRef } from "react";

export const SCANNER_MAX_INTERVAL_MS = 40;
export const SCANNER_MIN_LENGTH = 3;

/**
 * Pure helper function for evaluating whether a sequence of keystrokes and timestamps
 * qualifies as a USB HID Barcode Scanner burst.
 */
export function evaluateScannerBuffer(
  chars: string[],
  timestamps: number[],
  maxIntervalMs: number = SCANNER_MAX_INTERVAL_MS,
  minLength: number = SCANNER_MIN_LENGTH
): string | null {
  if (chars.length < minLength || chars.length !== timestamps.length) {
    return null;
  }
  for (let i = 1; i < timestamps.length; i++) {
    const delta = timestamps[i] - timestamps[i - 1];
    if (delta > maxIntervalMs) {
      return null;
    }
  }
  const code = chars.join("").trim();
  return code.length >= minLength ? code : null;
}

interface UseBarcodeScannerOptions {
  enabled: boolean;
  onScan: (barcode: string) => void;
}

/**
 * Global window-level USB HID Barcode Scanner hook.
 * Detects rapid keystroke bursts (< 40ms between keys, >= 3 chars) ending with Enter.
 */
export function useBarcodeScanner({ enabled, onScan }: UseBarcodeScannerOptions): void {
  const charsRef = useRef<string[]>([]);
  const timestampsRef = useRef<number[]>([]);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) {
      charsRef.current = [];
      timestampsRef.current = [];
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const now = performance.now();
      const timestamps = timestampsRef.current;
      const lastTime = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;

      if (timestamps.length > 0 && now - lastTime > SCANNER_MAX_INTERVAL_MS) {
        charsRef.current = [];
        timestampsRef.current = [];
      }

      if (event.key === "Enter") {
        const scanned = evaluateScannerBuffer(
          charsRef.current,
          timestampsRef.current,
          SCANNER_MAX_INTERVAL_MS,
          SCANNER_MIN_LENGTH
        );
        charsRef.current = [];
        timestampsRef.current = [];

        if (scanned) {
          event.preventDefault();
          event.stopPropagation();
          onScanRef.current(scanned);
        }
        return;
      }

      if (event.key.length === 1) {
        charsRef.current.push(event.key);
        timestampsRef.current.push(now);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [enabled]);
}
