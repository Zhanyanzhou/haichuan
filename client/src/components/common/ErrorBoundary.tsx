import { Component, type ReactNode } from "react";

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
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-brand-bg">
          <div className="text-center max-w-md px-6">
            <p className="text-5xl mb-4">⚠️</p>
            <h2
              className="text-2xl font-medium mb-2"
              style={{ color: "#2C2C2C" }}
            >
              页面加载异常
            </h2>
            <p className="text-sm text-brand-muted mb-6">
              {this.state.error?.message || "发生了未知错误，请尝试刷新页面"}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="rounded bg-[#B8944E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a6803f] focus:outline-none focus:ring-2 focus:ring-[#B8944E] focus:ring-offset-2"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
