import { useEffect } from "react";

export interface PosShortcutHandlers {
  enabled: boolean;
  isModalOpen: boolean;
  onFocusSearch: () => void; // F1
  onEditSelectedQty: () => void; // F2
  onHoldBill: () => void; // F4
  onOpenHeldBills: () => void; // F5
  onOpenTodaySales: () => void; // F6
  onCashMovement?: () => void; // F7
  onOpenPaymentModal: () => void; // F8
  onQuickExactCash: () => void; // F9
  onReprintLastReceipt: () => void; // F10
  onMoveSelectionUp: () => void; // ArrowUp
  onMoveSelectionDown: () => void; // ArrowDown
  onDeleteSelectedItem: () => void; // Delete
  onEscape: () => void; // Escape
}

/**
 * Keyboard-first cashier shortcut handler (F1-F10, Arrows, Delete, Esc).
 * Follows docs/UI-UX-SPEC.md Section 1.
 */
export function usePosShortcuts(handlers: PosShortcutHandlers): void {
  useEffect(() => {
    if (!handlers.enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handlers.onEscape();
        return;
      }

      // Function keys F1-F10 work anywhere on the POS Register when no blocking modal is open
      // (F9 also works inside PaymentModal if handled there, or triggers quick exact cash from register)
      if (!handlers.isModalOpen) {
        switch (event.key) {
          case "F1":
            event.preventDefault();
            handlers.onFocusSearch();
            return;
          case "F2":
            event.preventDefault();
            handlers.onEditSelectedQty();
            return;
          case "F4":
            event.preventDefault();
            handlers.onHoldBill();
            return;
          case "F5":
            event.preventDefault();
            handlers.onOpenHeldBills();
            return;
          case "F6":
            event.preventDefault();
            handlers.onOpenTodaySales();
            return;
          case "F7":
            if (handlers.onCashMovement) {
              event.preventDefault();
              handlers.onCashMovement();
            }
            return;
          case "F8":
            event.preventDefault();
            handlers.onOpenPaymentModal();
            return;
          case "F9":
            event.preventDefault();
            handlers.onQuickExactCash();
            return;
          case "F10":
            event.preventDefault();
            handlers.onReprintLastReceipt();
            return;
          default:
            break;
        }

        const activeEl = document.activeElement;
        const isTypingInInput =
          activeEl instanceof HTMLInputElement ||
          activeEl instanceof HTMLTextAreaElement ||
          activeEl instanceof HTMLSelectElement;

        if (!isTypingInInput) {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            handlers.onMoveSelectionUp();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            handlers.onMoveSelectionDown();
          } else if (event.key === "Delete") {
            event.preventDefault();
            handlers.onDeleteSelectedItem();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handlers]);
}
