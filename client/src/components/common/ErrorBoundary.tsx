import { Component, type ReactNode } from "react";
import { getBrowserPublicContentLocale } from "@/i18n/publicLocale";

interface Props {
  children: ReactNode;
  /** 自定义降级 UI；不传则用默认整页错误页。传 null 可静默吞掉错误（用于区块级兜底）。 */
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      "[ErrorBoundary] 未捕获错误:",
      error.message,
      errorInfo.componentStack,
    );
    if (this.props.fallback === undefined) {
      const english = getBrowserPublicContentLocale() === "en";
      let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex, nofollow";
      document.head.querySelector('link[rel="canonical"]')?.remove();
      document.head.querySelector('meta[property="og:url"]')?.remove();
      document.title = english ? "Page unavailable" : "页面加载异常";
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      const english = getBrowserPublicContentLocale() === "en";
      return (
        <div className="min-h-screen flex items-center justify-center bg-brand-bg">
          <div className="text-center max-w-md px-6">
            <p className="text-5xl mb-4">⚠️</p>
            <h2
              className="text-2xl font-medium mb-2"
              style={{ color: "#181A1B" }}
            >
              {english ? "Page unavailable" : "页面加载异常"}
            </h2>
            <p className="text-sm text-brand-muted mb-6">
              {english
                ? "This page cannot be displayed right now. Refresh and try again."
                : "当前页面暂时无法显示，请刷新后重试。"}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="rounded bg-[#181A1B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#101213] focus:outline-none focus:ring-2 focus:ring-[#181A1B] focus:ring-offset-2"
            >
              {english ? "Refresh page" : "刷新页面"}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
