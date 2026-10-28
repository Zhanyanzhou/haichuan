import { getBrowserPublicContentLocale } from "@/i18n/publicLocale";
import { createPortal } from "react-dom";

type RouteLoadingScope = "viewport" | "admin-content" | "workspace";

interface RouteLoadingProps {
  label?: string;
  scope?: RouteLoadingScope;
}

export default function RouteLoading({ label, scope = "viewport" }: RouteLoadingProps = {}) {
  const english = getBrowserPublicContentLocale() === "en";
  const statusText = label || (english ? "Loading page" : "页面加载中");
  const scopeClass = scope === "viewport" ? "" : ` site-route-loading--${scope}`;

  const loadingNode = (
    <div className={`site-route-loading${scopeClass}`} role="status" aria-live="polite">
      <span className="site-route-loading__indicator" aria-hidden="true">
        <span className="site-route-loading__ring" />
        <img
          className="site-route-loading__mark"
          src="/favicon.svg?v=20261027c"
          alt=""
          width="32"
          height="32"
        />
      </span>
      <span className="site-route-loading__text">{statusText}</span>
    </div>
  );

  // 所有整页加载层都直接挂到 body，确保首帧和后续加载阶段使用同一个视口坐标系。
  if (scope !== "workspace" && typeof document !== "undefined") {
    return createPortal(loadingNode, document.body);
  }

  return loadingNode;
}
