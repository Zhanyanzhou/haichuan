import { getBrowserPublicContentLocale } from "@/i18n/publicLocale";
import type { HTMLAttributes } from "react";
import { createPortal } from "react-dom";
import ProgressBar from "./ProgressBar";

type RouteLoadingScope = "viewport" | "admin-content" | "workspace" | "region" | "panel" | "inline";
type RouteLoadingSurface = "public" | "admin";

interface RouteLoadingProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  label?: string;
  scope?: RouteLoadingScope;
  surface?: RouteLoadingSurface;
  routeProgress?: boolean;
  /** 首屏加载断言要求区域内没有图片；其他路由保留站点标记。 */
  mark?: boolean;
}

export default function RouteLoading({
  label,
  scope = "viewport",
  surface = "admin",
  routeProgress = false,
  mark = true,
  className,
  ...rest
}: RouteLoadingProps = {}) {
  const english = getBrowserPublicContentLocale() === "en";
  const statusText = label || (english ? "Loading page" : "页面加载中");
  const scopeClass = scope === "viewport" ? "" : ` site-route-loading--${scope}`;
  const surfaceClass = surface === "public" ? " site-route-loading--public" : "";
  const extraClass = className ? ` ${className}` : "";

  const loadingNode = (
    <div
      {...rest}
      className={`site-route-loading${scopeClass}${surfaceClass}${extraClass}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusText}
    >
      {routeProgress ? <ProgressBar /> : null}
      <span className="site-route-loading__indicator" aria-hidden="true">
        <span className="site-route-loading__ring" />
        {mark ? (
          <img
            className="site-route-loading__mark"
            src="/favicon.svg?v=20261027c"
            alt=""
            width="32"
            height="32"
          />
        ) : null}
      </span>
      <span className="site-route-loading__text">{statusText}</span>
    </div>
  );

  // 整页切换挂到 body，和后台壳层无关，中心就是浏览器画面中心。
  // 后台内容加载留在主工作区里，避免被侧栏和顶栏把 H 挤离画面中心。
  if (scope === "viewport" && typeof document !== "undefined") {
    return createPortal(loadingNode, document.body);
  }

  return loadingNode;
}
