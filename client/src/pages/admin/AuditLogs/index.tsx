import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Button, Popover, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { settingsApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import AdminPageHeader from '@/components/common/AdminPageHeader';
import { AdminLoadingState, AdminEmptyState, AdminErrorState } from '@/components/common/AdminDataStates';
import type { PaginatedResult } from '@/types';

/** 详情列：JSON 结构化摘要 + Popover 查看全文；纯文本 ellipsis + Tooltip（审计 P3 体验项） */
function DetailCell({ value }: { value: string | null }) {
  if (!value) return <span style={{ fontSize: 13, color: '#66645F' }}>—</span>;
  const trimmed = value.trim();
  let parsed: unknown = null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { parsed = JSON.parse(trimmed); } catch { /* 非 JSON，按纯文本处理 */ }
  }
  if (parsed && typeof parsed === 'object') {
    const summary = Array.isArray(parsed)
      ? `共 ${parsed.length} 项`
      : Object.entries(parsed as Record<string, unknown>)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? '…' : String(v).slice(0, 24)}`)
          .join(' · ');
    return (
      <Popover
        title="操作详情"
        content={
          <pre style={{ maxWidth: 480, maxHeight: 360, overflow: 'auto', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(parsed, null, 2)}
          </pre>
        }
      >
        <span style={{ fontSize: 13, color: '#66645F', cursor: 'pointer', maxWidth: 280, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
          {summary || '查看详情'}
        </span>
      </Popover>
    );
  }
  return (
    <Tooltip title={value}>
      <span style={{ fontSize: 13, color: '#66645F', maxWidth: 280, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
        {value.length > 40 ? `${value.slice(0, 40)}…` : value}
      </span>
    </Tooltip>
  );
}

export default function AuditLogs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(async (p = page) => {
    setLoading(true); setError('');
    try {
      const res = await settingsApi.getLogs({ page: p, pageSize: 30 });
      const data = unwrapResponse<PaginatedResult<any>>(res);
      setLogs(data?.list || []);
      setTotal(data?.total || 0);
    } catch (e: any) { setError(e.message || '加载失败'); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  const columns = [
    { title: '时间', dataIndex: 'createdAt', width: 160, render: (v: string) => <span style={{ fontSize: 12, color: '#96928A' }}>{v}</span> },
    { title: '操作人', dataIndex: 'user', render: (u: any) => <span style={{ fontWeight: 500, color: '#252522' }}>{u?.realName || u?.username || '系统'}</span> },
    { title: '操作', dataIndex: 'action', width: 120, render: (v: string) => <Tag>{v}</Tag> },
    { title: '详情', dataIndex: 'detail', render: (v: string) => <DetailCell value={v} /> },
  ];

  return (
    <div>
      <AdminPageHeader title="操作日志" subtitle="管理员操作记录" extra={
        <Button icon={<ReloadOutlined />} onClick={() => load(1)} style={{ borderColor: '#E7E6E2', color: '#66645F' }}>刷新</Button>
      } />
      <Card style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)' }}>
        {loading ? <AdminLoadingState /> :
          error ? <AdminErrorState message={error} onRetry={() => load(1)} /> :
            logs.length === 0 ? <AdminEmptyState message="暂无操作记录" /> :
              <Table dataSource={logs} rowKey="id" columns={columns} size="middle"
                pagination={{ current: page, total, pageSize: 30, onChange: (p) => { setPage(p); load(p); } }} />}
      </Card>
    </div>
  );
}
