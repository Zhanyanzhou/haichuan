import { useState, useEffect, useCallback } from 'react';
import { Table, Select, Card, Space, Tag, Button } from 'antd';
import type { TableColumnsType } from 'antd';
import api from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import AdminPageHeader from '@/components/common/AdminPageHeader';

const EVENT_LABELS: Record<string, string> = {
  page_view: '页面浏览', view_item_list: '查看商品列表', view_item: '查看商品', product_view: '商品查看（旧）', search: '搜索',
  filter: '筛选', add_to_selection: '加入选款', remove_from_selection: '移除选款',
  submit_selection: '提交选款', submit_inquiry: '提交咨询', cta_click: 'CTA点击',
  add_to_cart: '加入购物车', remove_from_cart: '移出购物车', view_cart: '查看购物车',
  begin_checkout: '开始结算', add_payment_info: '提交支付信息', order_created: '订单已创建',
  purchase: '支付已确认', refund: '退款已完成',
};

interface AnalyticsEventRow {
  id: number;
  occurredAt: string;
  eventName: string;
  pagePath?: string | null;
  productId?: number | null;
  searchTerm?: string | null;
  source?: string | null;
  deviceType?: string | null;
  sessionId?: string | null;
}

interface AnalyticsEventPage {
  list: AnalyticsEventRow[];
  total: number;
}

export default function AnalyticsView() {
  const [list, setList] = useState<AnalyticsEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [eventName, setEventName] = useState('');
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/analytics/events', { params: { eventName: eventName || undefined, hours, pageSize: 100 } });
      const data = unwrapResponse<AnalyticsEventPage | null>(res);
      // P1-36：可选链，避免后端返回空体时 unwrapResponse 返回 null 导致整页崩溃
      setList(data?.list ?? []); setTotal(data?.total ?? 0);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [eventName, hours]);

  useEffect(() => { void fetch(); }, [fetch]);

  const columns: TableColumnsType<AnalyticsEventRow> = [
    { title: '时间', dataIndex: 'occurredAt', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    { title: '事件', dataIndex: 'eventName', width: 110, render: (n: string) => <Tag>{EVENT_LABELS[n] || n}</Tag> },
    { title: '页面', dataIndex: 'pagePath', width: 160, ellipsis: true },
    { title: '商品ID', dataIndex: 'productId', width: 70, render: (v: number) => v || '-' },
    { title: '搜索词', dataIndex: 'searchTerm', width: 120, render: (v: string) => v || '-' },
    { title: '来源', dataIndex: 'source', width: 70 },
    { title: '设备', dataIndex: 'deviceType', width: 70 },
    { title: '会话', dataIndex: 'sessionId', width: 100, ellipsis: true },
  ];

  return (
    <div>
      <AdminPageHeader title="行为事件" subtitle="开发验证 — 真实事件采集数据" />
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Select placeholder="事件类型" value={eventName || undefined} onChange={v => setEventName(v || '')} allowClear style={{ width: 150 }}>
            {Object.entries(EVENT_LABELS).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}
          </Select>
          <Select value={hours} onChange={setHours} style={{ width: 120 }}>
            <Select.Option value={1}>最近1小时</Select.Option>
            <Select.Option value={6}>最近6小时</Select.Option>
            <Select.Option value={24}>最近24小时</Select.Option>
            <Select.Option value={72}>最近3天</Select.Option>
          </Select>
          <Button onClick={fetch} type="primary">刷新数据</Button>
        </Space>
      </Card>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading}
        pagination={{ pageSize: 100, total, showTotal: (t: number) => `共 ${t} 条` }}
        scroll={{ x: 900 }} size="small"
      />
    </div>
  );
}
