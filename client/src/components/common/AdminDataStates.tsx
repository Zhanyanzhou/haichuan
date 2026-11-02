import { Button, Result } from 'antd';
import {
  ADMIN_COPY,
  getAdminEmptyText,
  getAdminLoadingText,
  getSafeAdminError,
  type AdminEmptyKind,
  type AdminErrorContext,
} from '@/constants/adminCopy';
import RouteLoading from '@/components/common/RouteLoading';

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
    <RouteLoading
      scope={compact ? 'panel' : 'region'}
      surface="admin"
      label={text}
    />
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
