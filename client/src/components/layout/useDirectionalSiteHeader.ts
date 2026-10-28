import { useEffect, useRef, useState } from "react";

const SCROLLED_THRESHOLD = 40;
const TOP_LOCK = 8;
const DIRECTION_THRESHOLD = 12;

/**
 * 页头随阅读方向显隐：停在页顶时保持可见；继续向下阅读时收起，
 * 向上阅读时再回到画面。菜单打开或键盘进入页头时强制露出。
 */
export function useDirectionalSiteHeader({
  menuOpen,
  resetKey,
  concealEnabled = true,
}: {
  menuOpen: boolean;
  resetKey?: string;
  concealEnabled?: boolean;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [concealed, setConcealed] = useState(false);
  const [routeKey, setRouteKey] = useState(resetKey);
  const menuOpenRef = useRef(menuOpen);
  const concealEnabledRef = useRef(concealEnabled);
  const surfaceScrolledRef = useRef(false);
  menuOpenRef.current = menuOpen;
  concealEnabledRef.current = concealEnabled;
  if (!concealed || !concealEnabled) surfaceScrolledRef.current = scrolled;
  const surfaceScrolled = concealEnabled && concealed ? surfaceScrolledRef.current : scrolled;

  if (resetKey !== undefined && routeKey !== resetKey) {
    setRouteKey(resetKey);
    setConcealed(false);
  }

  useEffect(() => {
    if (menuOpen) setConcealed(false);
  }, [menuOpen]);

  useEffect(() => {
    const header = headerRef.current;
    const ownerWindow = header?.ownerDocument.defaultView;
    if (!ownerWindow) return;
    let anchorY = ownerWindow.scrollY;

    const sync = () => {
      const y = Math.max(0, ownerWindow.scrollY);
      const delta = y - anchorY;
      const nextScrolled = y > SCROLLED_THRESHOLD;
      setScrolled((current) => (current === nextScrolled ? current : nextScrolled));

      if (!concealEnabledRef.current || menuOpenRef.current || y <= TOP_LOCK) {
        anchorY = y;
        setConcealed(false);
        return;
      }
      if (delta > DIRECTION_THRESHOLD) {
        anchorY = y;
        setConcealed(true);
      } else if (delta < -DIRECTION_THRESHOLD) {
        anchorY = y;
        setConcealed(false);
      }
    };

    const revealForKeyboard = () => setConcealed(false);
    sync();
    ownerWindow.addEventListener("scroll", sync, { passive: true });
    header?.addEventListener("focusin", revealForKeyboard);
    return () => {
      ownerWindow.removeEventListener("scroll", sync);
      header?.removeEventListener("focusin", revealForKeyboard);
    };
  }, []);

  return {
    headerRef,
    scrolled,
    surfaceScrolled,
    concealed: concealEnabled ? concealed : false,
  };
}
