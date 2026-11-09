import type { MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { sanitizeCatalogReturnUrl } from "@/pages/public/Catalog/catalogReturnContext";
import { useCommerceFlags } from "@/store/featureFlags";
import { useSelectionStore } from "@/store/selectionStore";

function BagIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 11V8a5 5 0 0 1 10 0v3" />
      <path d="M7 14h16l1.5 13h-19L7 14Z" />
    </svg>
  );
}

/** 页头购物袋。购物车准备关闭时显示本地选款数量；准备开启后数量改由购物车页承担。 */
export default function ShoppingBagNavLink({
  onClick,
}: {
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const location = useLocation();
  const ready = useSelectionStore((state) => state.ready);
  const selectedCount = useSelectionStore((state) => state.selectedIds.size);
  const flags = useCommerceFlags((state) => state.flags);
  const cartPreparationOpen = flags?.cartEnabled === true;
  const count = ready && !cartPreparationOpen ? selectedCount : 0;
  const label = count > 0 ? `购物袋，已选 ${count} 款` : "购物袋";
  const catalogReturnUrl = sanitizeCatalogReturnUrl(`${location.pathname}${location.search}${location.hash}`);

  return (
    <Link
      to="/cart"
      state={catalogReturnUrl ? { catalogReturnUrl } : undefined}
      aria-label={label}
      className="site-header__nav-item site-header__nav-item--cart"
      onClick={onClick}
    >
      <span className="site-header__bag">
        <BagIcon />
        {count > 0 ? (
          <span className="site-header__bag-count" aria-hidden="true">{count}</span>
        ) : null}
      </span>
      <span className="site-header__nav-label hidden sm:inline">购物袋</span>
    </Link>
  );
}
