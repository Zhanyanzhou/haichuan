import { Button, Result } from 'antd';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export function AdminLoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-[#E7E6E2] border-t-[#B69052] rounded-full animate-spin" />
        <p style={{ marginTop: 16, color: '#96928A', fontSize: 13 }}>加载中...</p>
      </div>
    </div>
  );
}

export function AdminEmptyState({ message = '暂无数据' }: Props) {
  return (
    <Result
      style={{ padding: '40px 0' }}
      subTitle={<span style={{ color: '#96928A' }}>{message}</span>}
    />
  );
}

export function AdminErrorState({ message = '加载失败', onRetry }: Props) {
  return (
    <Result
      status="error"
      title="加载失败"
      subTitle={<span style={{ color: '#96928A' }}>{message}</span>}
      extra={onRetry && <Button onClick={onRetry} style={{ borderColor: '#E7E6E2', color: '#66645F' }}>重新加载</Button>}
    />
  );
}
