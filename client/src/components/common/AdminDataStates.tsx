import { Button, Result } from 'antd';
import {
  ADMIN_COPY,
  getAdminEmptyText,
  getAdminLoadingText,
  getSafeAdminError,
  type AdminEmptyKind,
  type AdminErrorContext,
} from '@/constants/adminCopy';

interface Props {
  subject?: string;
  message?: string;
  description?: string;
  onRetry?: () => void;
}

interface LoadingProps {
  subject?: string;
  message?: string;
  compact?: boolean;
}

interface EmptyProps extends Props {
  kind?: AdminEmptyKind;
}

interface ErrorProps extends Props {
  error?: unknown;
  context?: AdminErrorContext;
  action?: string;
}

export function AdminLoadingState({ subject = '数据', message, compact = false }: LoadingProps = {}) {
  const text = message ?? getAdminLoadingText(subject);
  return (
    <div className={`flex items-center justify-center ${compact ? 'py-6' : 'py-20'}`} role="status" aria-live="polite">
      <div className="text-center">
        <div
          className="inline-block w-8 h-8 border-2 border-[#E7E6E2] border-t-[#6F5733] rounded-full animate-spin"
          aria-hidden="true"
        />
        <p style={{ marginTop: 16, color: 'var(--adm-text)', fontSize: 13 }}>{text}</p>
      </div>
    </div>
  );
}

export function AdminEmptyState({
  subject = '数据',
  kind = 'initial',
  message,
  description,
}: EmptyProps) {
  const text = description ?? message ?? getAdminEmptyText(subject, kind);
  return (
    <Result
      style={{ padding: '40px 0' }}
      subTitle={<span style={{ color: 'var(--adm-text)' }}>{text}</span>}
    />
  );
}

export function AdminErrorState({
  subject = '数据',
  message,
  description,
  onRetry,
  error,
  context = 'load',
  action,
}: ErrorProps) {
  const safeError = getSafeAdminError(error, { subject, context, action });
  const text = description ?? message ?? safeError.description;
  return (
    <Result
      status="error"
      title={safeError.title}
      subTitle={<span style={{ color: 'var(--adm-text)' }}>{text}</span>}
      extra={onRetry && <Button onClick={onRetry}>{ADMIN_COPY.actions.retry}</Button>}
    />
  );
}
