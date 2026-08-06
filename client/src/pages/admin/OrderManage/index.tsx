import { useState, useEffect } from 'react';
import { Card, Table, Button, Tag, Space, Input, message } from 'antd';
import { EyeOutlined, PrinterOutlined, TruckOutlined, ExportOutlined } from '@ant-design/icons';
import { orderApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { Order, PaginatedResult } from '@/types';

const sm: Record<string, { c: string; t: string }> = {
  PENDING_PAYMENT: { c: 'gold', t: '待付款' }, PENDING_SHIP: { c: 'blue', t: '待发货' },
  SHIPPED: { c: 'cyan', t: '已发货' }, COMPLETED: { c: 'green', t: '已完成' }, CANCELLED: { c: 'red', t: '已取消' },
};

const tabs = [
  { k: 'all', l: '全部' },
  { k: 'PENDING_PAYMENT', l: '待付款' },
  { k: 'PENDING_SHIP', l: '待发货' },
  { k: 'SHIPPED', l: '已发货' },
  { k: 'COMPLETED', l: '已完成' },
];

export default function OrderManage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await orderApi.getList({ keyword: keyword || undefined, pageSize: 50 });
      const data = unwrapResponse<PaginatedResult<Order>>(res);
      setOrders(data?.list || []);
    } catch { setOrders([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = statusFilter === 'all'
    ? orders.filter(o => !keyword || o.orderNo.includes(keyword) || o.customerName.includes(keyword))
    : orders.filter(o => o.status === statusFilter && (!keyword || o.orderNo.includes(keyword) || o.customerName.includes(keyword)));

  const handleShip = async (id: number) => {
    try {
      await orderApi.updateStatus(id, { status: 'SHIPPED' });
      message.success('已发货');
      load();
    } catch (e: any) { message.error(e?.message || '操作失败'); }
  };

  const handleComplete = async (id: number) => {
    try {
      await orderApi.updateStatus(id, { status: 'COMPLETED' });
      message.success('已完成');
      load();
    } catch (e: any) { message.error(e?.message || '操作失败'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-display font-semibold text-brand-text">订单管理</h1><p className="text-sm text-brand-muted mt-1">订单处理 · 物流跟踪</p></div>
        <Space><Input placeholder="搜索订单号/客户" value={keyword} onChange={(e) => setKeyword(e.target.value)} className="w-48" /><Button icon={<ExportOutlined />}>导出</Button></Space></div>
      <div className="flex gap-2">
        {tabs.map(s => (
          <button key={s.k} onClick={() => setStatusFilter(s.k)}
            className={`px-4 py-2 text-sm border transition-all ${statusFilter === s.k ? 'border-brand-gold text-brand-gold' : 'border-brand-line text-brand-muted hover:text-brand-text hover:border-brand-gold'}`}>
            {s.l} <span className="text-brand-gold ml-1">{s.k === 'all' ? orders.length : orders.filter(o => o.status === s.k).length}</span>
          </button>
        ))}
      </div>
      <Card className="!bg-white !border-brand-line">
        <Table dataSource={filtered} rowKey="id" loading={loading} pagination={false} size="middle"
          columns={[
            { title: '订单号', dataIndex: 'orderNo', render: (v: string) => <code className="text-xs text-brand-gold">{v}</code> },
            { title: '客户', dataIndex: 'customerName' },
            { title: '金额', dataIndex: 'finalAmount', render: (v: number) => <span className="text-brand-gold font-medium">¥{v?.toLocaleString()}</span> },
            { title: '状态', dataIndex: 'status', render: (v: string) => { const s = sm[v]; return <Tag color={s?.c}>{s?.t}</Tag>; } },
            { title: '时间', dataIndex: 'createdAt', render: (v: string) => <span className="text-brand-muted text-xs">{v}</span> },
            { title: '操作', render: (_: any, r: Order) => (
              <Space>
                <Button size="small" icon={<EyeOutlined />}>详情</Button>
                {r.status === 'PENDING_SHIP' && <Button size="small" type="primary" icon={<TruckOutlined />} onClick={() => handleShip(r.id)}>发货</Button>}
                {r.status === 'SHIPPED' && <Button size="small" type="primary" onClick={() => handleComplete(r.id)}>完成</Button>}
                <Button size="small" icon={<PrinterOutlined />}>打印</Button>
              </Space>
            ) },
          ]} />
      </Card>
    </div>
  );
}
