import { useEffect, useRef, type RefObject } from "react";

export default function useCatalogDialog(
  onClose: () => void,
  returnFocusRef: RefObject<HTMLElement | null>,
  active = true,
  resolveReturnFocus?: () => HTMLElement | null,
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    const ownerDocument = dialog?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    if (!dialog || !ownerDocument || !ownerWindow) return;
    const returnFocusTarget = returnFocusRef.current;

    const previousOverflow = ownerDocument.body.style.overflow;
    ownerDocument.body.style.overflow = "hidden";
    const focusTimer = ownerWindow.setTimeout(
      () => initialFocusRef.current?.focus({ preventScroll: true }),
      0,
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && ownerDocument.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && ownerDocument.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    ownerWindow.addEventListener("keydown", onKeyDown);
    return () => {
      ownerWindow.clearTimeout(focusTimer);
      ownerWindow.removeEventListener("keydown", onKeyDown);
      ownerDocument.body.style.overflow = previousOverflow;
      if (resolveReturnFocus) {
        ownerWindow.setTimeout(() => {
          ownerWindow.requestAnimationFrame(() =>
            resolveReturnFocus()?.focus({ preventScroll: true }),
          );
        }, 0);
      } else {
        ownerWindow.setTimeout(
          () => returnFocusTarget?.focus({ preventScroll: true }),
          0,
        );
      }
    };
  }, [active, onClose, resolveReturnFocus, returnFocusRef]);

  return { dialogRef, initialFocusRef };
}
