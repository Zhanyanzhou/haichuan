import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Button, Popover, Tooltip, Input, Select, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { settingsApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import AdminPageHeader from '@/components/common/AdminPageHeader';
import { AdminLoadingState, AdminEmptyState, AdminErrorState } from '@/components/common/AdminDataStates';
import type { PaginatedResult } from '@/types';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';

/** 详情列：JSON 结构化摘要 + Popover 查看全文；纯文本 ellipsis + Tooltip（审计 P3 体验项） */
function DetailCell({ value }: { value: string | null }) {
  if (!value) return <span style={{ fontSize: 13, color: 'var(--adm-text)' }}>—</span>;
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
        <span style={{ fontSize: 13, color: 'var(--adm-text)', cursor: 'pointer', maxWidth: 280, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
          {summary || '查看详情'}
        </span>
      </Popover>
    );
  }
  return (
    <Tooltip title={value}>
      <span style={{ fontSize: 13, color: 'var(--adm-text)', maxWidth: 280, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
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
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [module, setModule] = useState<string | undefined>(undefined);

  const load = useCallback(async (p = page) => {
    setLoading(true); setError('');
    try {
      const res = await settingsApi.getLogs({ page: p, pageSize: 30, keyword: keyword || undefined, module });
      const data = unwrapResponse<PaginatedResult<any>>(res);
      setLogs(data?.list || []);
      setTotal(data?.total || 0);
    } catch (e: any) { setError(getSafeAdminErrorMessage(e, '操作日志加载失败，请稍后重新加载。')); }
    finally { setLoading(false); }
  }, [page, keyword, module]);

  useEffect(() => { void load(); }, [load]);

  const columns = [
    { title: '时间', dataIndex: 'createdAt', width: 160, render: (v: string) => <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--adm-muted)', fontVariantNumeric: 'tabular-nums' }}>{v}</span> },
    { title: '操作人', dataIndex: 'user', render: (u: any) => <span style={{ fontWeight: 500, color: 'var(--adm-ink)' }}>{u?.realName || u?.username || '系统'}</span> },
    { title: '操作', dataIndex: 'action', width: 120, render: (v: string) => <Tag>{v}</Tag> },
    { title: '详情', dataIndex: 'detail', render: (v: string) => <DetailCell value={v} /> },
  ];

  return (
    <div>
      <AdminPageHeader title="操作日志" subtitle="管理员操作记录" extra={
        <Button icon={<ReloadOutlined />} onClick={() => load(1)} style={{ borderColor: '#E7E6E2', color: 'var(--adm-text)' }}>刷新</Button>
      } />
      <Card style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)' }}>
        <Space style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="搜索操作人 / 动作 / 模块"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
            style={{ width: 260 }}
          />
          <Select
            allowClear
            placeholder="全部模块"
            style={{ width: 140 }}
            value={module}
            onChange={(v) => { setModule(v); setPage(1); }}
            options={[
              { value: 'product', label: '商品' },
              { value: 'category', label: '分类' },
              { value: 'order', label: '订单' },
              { value: 'user', label: '后台员工' },
              { value: 'gold_price', label: '金价' },
            ]}
          />
        </Space>
        {loading ? <AdminLoadingState subject="操作日志" /> :
          error ? <AdminErrorState message={error} onRetry={() => load(1)} /> :
            logs.length === 0 ? <AdminEmptyState message="暂无操作记录" /> :
              <Table dataSource={logs} rowKey="id" columns={columns} size="middle"
                pagination={{ current: page, total, pageSize: 30, onChange: (p) => { setPage(p); load(p); } }} />}
      </Card>
    </div>
  );
}
