import { Component, type ReactNode } from 'react';
import { Button } from 'antd';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-brand-bg">
          <div className="text-center max-w-md px-6">
            <p className="text-5xl mb-4">⚠️</p>
            <h2 className="text-2xl font-medium mb-2" style={{ color: '#2C2C2C' }}>页面加载异常</h2>
            <p className="text-sm text-brand-muted mb-6">
              {this.state.error?.message || '发生了未知错误，请尝试刷新页面'}
            </p>
            <Button
              type="primary"
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              style={{ background: '#B8944E', borderColor: '#B8944E' }}
            >
              刷新页面
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
