import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

const COMPACT_WORKSPACE_QUERY = "(max-width: 1199px)";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function readCompactWorkspace() {
  return typeof window !== "undefined"
    && window.matchMedia(COMPACT_WORKSPACE_QUERY).matches;
}

/**
 * 页面装修与模板设计共用的窄屏覆盖面板焦点合同。
 * 只管理响应式语义、Esc、焦点圈定和回返，不接触任一工作区的业务状态。
 */
export default function useCompactWorkspaceOverlay({
  open,
  onOpen,
  onClose,
  modal = true,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  modal?: boolean;
}) {
  const [compact, setCompact] = useState(readCompactWorkspace);
  const panelRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const query = window.matchMedia(COMPACT_WORKSPACE_QUERY);
    const sync = (event: MediaQueryListEvent) => setCompact(event.matches);
    setCompact(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!compact || !open) return undefined;
    const frame = window.requestAnimationFrame(() => {
      (closeButtonRef.current ?? panelRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [compact, open]);

  const requestOpen = useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    onOpen();
  }, [onOpen]);

  const requestClose = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => {
      const opener = openerRef.current;
      if (opener?.isConnected) {
        opener.focus();
        return;
      }
      openButtonRef.current?.focus();
    });
  }, [onClose]);

  const onPanelKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!compact || !open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }
    if (!modal || event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => (
      !element.hasAttribute("disabled")
      && element.getAttribute("aria-hidden") !== "true"
      && element.getClientRects().length > 0
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [compact, modal, open, requestClose]);

  return {
    compact,
    panelRef,
    openButtonRef,
    closeButtonRef,
    requestOpen,
    requestClose,
    onPanelKeyDown,
  };
}
