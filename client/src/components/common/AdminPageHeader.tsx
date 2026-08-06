import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}

export default function AdminPageHeader({ title, subtitle, extra }: Props) {
  return (
    <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#252522', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: '#96928A', marginTop: 4 }}>{subtitle}</p>}
      </div>
      {extra && <div className="flex items-center gap-2">{extra}</div>}
    </div>
  );
}
