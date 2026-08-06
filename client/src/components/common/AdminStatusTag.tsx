import { Tag } from 'antd';

interface AdminStatusTagProps {
  status: string;
  mapping: Record<string, { color: string; label: string }>;
}

export default function AdminStatusTag({ status, mapping }: AdminStatusTagProps) {
  const info = mapping[status];
  if (!info) return <Tag>{status}</Tag>;
  return <Tag color={info.color}>{info.label}</Tag>;
}
