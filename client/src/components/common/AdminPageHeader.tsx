import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}

export default function AdminPageHeader({ title, subtitle, extra }: Props) {
  return (
    <header className="flex items-start justify-between mb-5 flex-wrap gap-3">
      <div className="min-w-0 flex-1">
        <h1 style={{ fontSize: 26, lineHeight: '34px', fontWeight: 600, color: 'var(--adm-ink)', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, lineHeight: '20px', color: 'var(--adm-text)', marginTop: 4 }}>{subtitle}</p>}
      </div>
      {extra && <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap">{extra}</div>}
    </header>
  );
}
