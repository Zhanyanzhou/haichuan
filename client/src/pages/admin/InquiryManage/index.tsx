import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Drawer, Select, Input, message, Space } from 'antd';
import { EyeOutlined, PhoneOutlined, MailOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { inquiriesApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { PaginatedResult } from '@/types';

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'orange', label: '待处理' },
  PROCESSING: { color: 'blue', label: '处理中' },
  REPLIED: { color: 'green', label: '已回复' },
  CLOSED: { color: 'default', label: '已关闭' },
};

const TYPE_MAP: Record<string, string> = {
  jewelry_consult: '珠宝咨询', custom_order: '定制咨询',
  price_inquiry: '价格咨询', after_sales: '售后服务', other: '其他',
};

export default function InquiryManage() {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selected, setSelected] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (p = page, status = statusFilter) => {
    setLoading(true);
    try {
      const res = await inquiriesApi.getList({ page: p, pageSize: 20, status: status || undefined });
      const data = unwrapResponse<PaginatedResult<any>>(res);
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch { setList([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSaving(true);
    try {
      await inquiriesApi.updateStatus(selected.id, { status: 'REPLIED', reply: replyText });
      message.success('已回复');
      setDrawerOpen(false);
      setReplyText('');
      load();
    } catch { message.error('回复失败'); }
    finally { setSaving(false); }
  };

  const columns = [
    { title: '客户', dataIndex: 'customerName', render: (v: string) => <span style={{ color: '#252522', fontWeight: 500 }}>{v || '—'}</span> },
    { title: '电话', dataIndex: 'customerPhone', render: (v: string) => v || '—' },
    { title: '咨询类型', dataIndex: 'consultationType', render: (v: string) => <span style={{ fontSize: 12 }}>{TYPE_MAP[v] || v || '—'}</span> },
    { title: '状态', dataIndex: 'status', render: (v: string) => {
      const s = STATUS_MAP[v] || { color: 'default', label: v };
      return <Tag color={s.color}>{s.label}</Tag>;
    }},
    { title: '时间', dataIndex: 'createdAt', render: (v: string) => <span style={{ fontSize: 12, color: '#96928A' }}>{v || '—'}</span> },
    { title: '操作', render: (_: any, record: any) => (
      <Button type="link" size="small" icon={<EyeOutlined />} style={{ color: '#B69052' }}
        onClick={() => { setSelected(record); setDrawerOpen(true); }}>
        查看
      </Button>
    )},
  ];

  return (
    <div>
      <div className="mb-5">
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#252522', margin: 0 }}>预约咨询</h1>
        <p style={{ fontSize: 13, color: '#96928A', marginTop: 4 }}>客户提交的咨询与预约记录</p>
      </div>

      <Card style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)' }}>
        <div className="mb-4 flex gap-2">
          {['', 'PENDING', 'PROCESSING', 'REPLIED', 'CLOSED'].map(s => (
            <Button key={s} size="small" type={statusFilter === s ? 'primary' : 'default'}
              onClick={() => { setStatusFilter(s); setPage(1); load(1, s); }}
              style={statusFilter === s ? {} : { borderColor: '#E7E6E2', color: '#66645F' }}>
              {s === '' ? '全部' : STATUS_MAP[s]?.label || s}
            </Button>
          ))}
        </div>

        <Table
          dataSource={list} rowKey="id" loading={loading} columns={columns}
          pagination={{ current: page, total, pageSize: 20, onChange: (p) => { setPage(p); load(p); } }}
          locale={{ emptyText: <span style={{ color: '#96928A' }}>暂无预约记录</span> }}
        />
      </Card>

      <Drawer title="预约详情" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={480}
        styles={{ body: { background: '#FCFCFB' } }}>
        {selected && (
          <div className="space-y-5">
            <div className="bg-white rounded-lg p-4 border" style={{ borderColor: '#E7E6E2' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#252522' }}>{selected.customerName || '未留名'}</h3>
              <div className="mt-3 space-y-2">
                {selected.customerPhone && <p className="flex items-center gap-2" style={{ fontSize: 13, color: '#66645F' }}><PhoneOutlined />{selected.customerPhone}</p>}
                {selected.customerEmail && <p className="flex items-center gap-2" style={{ fontSize: 13, color: '#66645F' }}><MailOutlined />{selected.customerEmail}</p>}
                <p style={{ fontSize: 13, color: '#96928A' }}>咨询类型：{TYPE_MAP[selected.consultationType] || selected.consultationType || '—'}</p>
                {selected.budgetRange && <p style={{ fontSize: 13, color: '#96928A' }}>预算：{selected.budgetRange}</p>}
                {selected.preferredContact && <p style={{ fontSize: 13, color: '#96928A' }}>偏好联系：{selected.preferredContact}</p>}
              </div>
            </div>

            {selected.message && (
              <div className="bg-white rounded-lg p-4 border" style={{ borderColor: '#E7E6E2' }}>
                <p style={{ fontSize: 12, color: '#96928A', marginBottom: 8 }}>客户留言</p>
                <p style={{ fontSize: 14, color: '#252522', lineHeight: 1.7 }}>{selected.message}</p>
              </div>
            )}

            <div className="bg-white rounded-lg p-4 border" style={{ borderColor: '#E7E6E2' }}>
              <p style={{ fontSize: 12, color: '#96928A', marginBottom: 8 }}>回复内容</p>
              <Input.TextArea rows={4} value={replyText} onChange={e => setReplyText(e.target.value)}
                placeholder="输入回复内容..." style={{ fontSize: 14 }} />
              <Button type="primary" onClick={handleReply} loading={saving}
                style={{ marginTop: 12, background: '#B69052', borderColor: '#B69052' }}>
                确认回复
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
