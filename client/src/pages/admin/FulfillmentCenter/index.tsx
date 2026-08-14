import { useCallback, useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, message, Modal, Select, Space, Table, Tag, Tooltip } from 'antd';
import { ExportOutlined, EyeOutlined, TruckOutlined } from '@ant-design/icons';
import { fulfillmentApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { Fulfillment, FulfillmentStatus, PaginatedResult } from '@/types';

// 履约状态映射（含颜色与中文标签）
const STATUS_META: Record<FulfillmentStatus, { color: string; label: string }> = {
  PENDING_PICK: { color: 'default', label: '待拣货' },
  PENDING_CHECK: { color: 'gold', label: '待复核' },
  PENDING_SHIP: { color: 'orange', label: '待发货' },
  SHIPPED: { color: 'blue', label: '已发货' },
  DELIVERED: { color: 'green', label: '已送达' },
  ABNORMAL: { color: 'red', label: '物流异常' },
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'PENDING_PICK', label: '待拣货' },
  { key: 'PENDING_CHECK', label: '待复核' },
  { key: 'PENDING_SHIP', label: '待发货' },
  { key: 'SHIPPED', label: '已发货' },
  { key: 'DELIVERED', label: '已送达' },
  { key: 'ABNORMAL', label: '物流异常' },
];

type FulfillmentListItem = Fulfillment & {
  order: { orderNo: string; customerName: string; customerPhone: string; finalAmount: number | string; status: string };
};

export default function FulfillmentCenter() {
  const [list, setList] = useState<FulfillmentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [detail, setDetail] = useState<FulfillmentListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dispatchTarget, setDispatchTarget] = useState<FulfillmentListItem | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [abnormalTarget, setAbnormalTarget] = useState<FulfillmentListItem | null>(null);
  const [abnormalReason, setAbnormalReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dispatchForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fulfillmentApi.getList({
        page,
        pageSize,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        keyword: keyword || undefined,
      });
      const data = unwrapResponse<PaginatedResult<FulfillmentListItem>>(res);
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch {
      setLoadError(true);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (record: FulfillmentListItem) => {
    setDetail(record);
    setDetailLoading(true);
    try {
      const res = await fulfillmentApi.getById(record.id);
      const full = unwrapResponse<FulfillmentListItem>(res);
      if (full) setDetail(full);
    } catch {
      // 保留列表数据即可
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDispatch = async (values: { carrier: string; trackingNo: string; internalNote?: string }) => {
    if (!dispatchTarget) return;
    setDispatching(true);
    try {
      await fulfillmentApi.dispatch(dispatchTarget.id, values);
      message.success('发货成功，订单已进入已发货');
      setDispatchTarget(null);
      dispatchForm.resetFields();
      void load();
    } catch (e: any) {
      message.error(e?.message || '发货失败');
    } finally {
      setDispatching(false);
    }
  };

  const handleMarkDelivered = async (id: number) => {
    Modal.confirm({
      title: '确认该包裹已送达？',
      content: '标记送达后，履约单进入终态，不可再变更。',
      okText: '确认送达',
      onOk: async () => {
        try {
          await fulfillmentApi.updateStatus(id, { status: 'DELIVERED' });
          message.success('已标记送达');
          void load();
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const submitAbnormal = async () => {
    if (!abnormalTarget) return;
    if (!abnormalReason.trim()) {
      message.warning('请填写物流异常原因');
      return;
    }
    setSubmitting(true);
    try {
      await fulfillmentApi.updateStatus(abnormalTarget.id, { status: 'ABNORMAL', abnormalReason: abnormalReason.trim() });
      message.success('已标记物流异常');
      setAbnormalTarget(null);
      setAbnormalReason('');
      void load();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    // 客户端导出当前页（履约数据量通常较小；服务端订单导出走订单中心）
    const csv = ['履约单号,订单号,客户,承运商,运单号,状态,发货时间']
      .concat(
        list.map((f) =>
          `${f.fulfillmentNo},${f.order?.orderNo || ''},${f.order?.customerName || ''},${f.carrier || ''},${f.trackingNo || ''},${STATUS_META[f.status]?.label || f.status},${f.shippedAt || ''}`,
        ),
      )
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `履约报表_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('已导出当前列表');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand-text">履约中心</h1>
          <p className="text-sm text-brand-muted mt-1">拣货 · 复核 · 发货 · 物流跟踪 · 异常处理</p>
        </div>
        <Space>
          <Input.Search
            placeholder="履约单号/订单号/客户"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
            className="w-64"
            allowClear
          />
          <Button icon={<ExportOutlined />} onClick={handleExport}>导出当前列表</Button>
        </Space>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(1); }}
            className={`px-4 py-2 text-sm border transition-all ${statusFilter === tab.key ? 'border-brand-gold text-brand-gold' : 'border-brand-line text-brand-muted hover:text-brand-text hover:border-brand-gold'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <div className="text-center py-16">
          <p className="text-brand-muted mb-4">履约数据暂时无法加载</p>
          <Button type="primary" onClick={() => void load()}>重新加载</Button>
        </div>
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={list}
          size="middle"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          locale={{ emptyText: '暂无履约记录' }}
          columns={[
            { title: '履约单号', dataIndex: 'fulfillmentNo', render: (v: string) => <code className="text-xs text-brand-gold">{v}</code> },
            {
              title: '订单 / 客户', render: (_: unknown, r: FulfillmentListItem) => (
                <div>
                  <p className="text-sm">{r.order?.orderNo}</p>
                  <p className="text-xs text-brand-muted">{r.order?.customerName} · {r.order?.customerPhone}</p>
                </div>
              ),
            },
            { title: '承运商', dataIndex: 'carrier', render: (v: string) => v || '—' },
            { title: '运单号', dataIndex: 'trackingNo', render: (v: string) => v ? <code className="text-xs">{v}</code> : '—' },
            { title: '状态', dataIndex: 'status', render: (v: FulfillmentStatus) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.label || v}</Tag> },
            { title: '发货时间', dataIndex: 'shippedAt', render: (v: string) => v ? <span className="text-xs text-brand-muted">{v}</span> : '—' },
            {
              title: '操作', render: (_: unknown, r: FulfillmentListItem) => (
                <Space>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>详情</Button>
                  {['PENDING_PICK', 'PENDING_CHECK', 'PENDING_SHIP'].includes(r.status) && (
                    <Button size="small" type="primary" icon={<TruckOutlined />} onClick={() => setDispatchTarget(r)}>发货</Button>
                  )}
                  {r.status === 'SHIPPED' && (
                    <Button size="small" onClick={() => handleMarkDelivered(r.id)}>标记送达</Button>
                  )}
                  {r.status !== 'DELIVERED' && r.status !== 'ABNORMAL' && (
                    <Tooltip title="物流异常">
                      <Button size="small" danger onClick={() => setAbnormalTarget(r)}>异常</Button>
                    </Tooltip>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      {/* 详情抽屉 */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} width={560} title="履约详情" loading={detailLoading}>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="flex justify-between"><span className="text-brand-muted">履约单号</span><code className="text-brand-gold">{detail.fulfillmentNo}</code></div>
            <div className="flex justify-between"><span className="text-brand-muted">状态</span><Tag color={STATUS_META[detail.status]?.color}>{STATUS_META[detail.status]?.label}</Tag></div>
            <div className="flex justify-between"><span className="text-brand-muted">订单号</span><span>{detail.order?.orderNo}</span></div>
            <div className="flex justify-between"><span className="text-brand-muted">客户</span><span>{detail.order?.customerName} · {detail.order?.customerPhone}</span></div>
            <div className="flex justify-between"><span className="text-brand-muted">承运商</span><span>{detail.carrier || '—'}</span></div>
            <div className="flex justify-between"><span className="text-brand-muted">运单号</span><span>{detail.trackingNo || '—'}</span></div>
            <div className="flex justify-between"><span className="text-brand-muted">发货时间</span><span>{detail.shippedAt || '—'}</span></div>
            <div className="flex justify-between"><span className="text-brand-muted">送达时间</span><span>{detail.deliveredAt || '—'}</span></div>
            {detail.abnormalReason && <div className="flex justify-between"><span className="text-brand-muted">异常原因</span><span className="text-red-500">{detail.abnormalReason}</span></div>}
            <div><p className="text-brand-muted mb-1">内部备注</p><p className="bg-brand-bg p-3 rounded">{detail.internalNote || '无'}</p></div>
            {detail.creator && <div className="flex justify-between"><span className="text-brand-muted">创建人</span><span>{detail.creator.realName || detail.creator.username}</span></div>}
          </div>
        )}
      </Drawer>

      {/* 发货弹窗 */}
      <Modal
        title="登记发货"
        open={!!dispatchTarget}
        onCancel={() => { setDispatchTarget(null); dispatchForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={dispatchForm} layout="vertical" onFinish={handleDispatch}>
          <Form.Item name="carrier" label="承运商" rules={[{ required: true, message: '请填写承运商' }]}>
            <Select placeholder="选择或输入承运商" showSearch options={[
              { value: '顺丰速运', label: '顺丰速运' },
              { value: '京东物流', label: '京东物流' },
              { value: '德邦快递', label: '德邦快递' },
              { value: 'EMS', label: 'EMS' },
              { value: '其他', label: '其他' },
            ]} />
          </Form.Item>
          <Form.Item name="trackingNo" label="运单号" rules={[{ required: true, message: '请填写运单号' }]}>
            <Input placeholder="物流单号" />
          </Form.Item>
          <Form.Item name="internalNote" label="内部备注"><Input.TextArea rows={3} /></Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setDispatchTarget(null); dispatchForm.resetFields(); }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={dispatching}>确认发货</Button>
          </div>
        </Form>
      </Modal>

      {/* 物流异常弹窗 */}
      <Modal
        title="标记物流异常"
        open={!!abnormalTarget}
        onCancel={() => { setAbnormalTarget(null); setAbnormalReason(''); }}
        onOk={submitAbnormal}
        okText="确认异常"
        okButtonProps={{ danger: true }}
        confirmLoading={submitting}
      >
        <p className="text-sm text-brand-muted mb-2">请描述物流异常情况，以便后续跟进处理。</p>
        <Input.TextArea rows={3} value={abnormalReason} onChange={(e) => setAbnormalReason(e.target.value)} placeholder="例：包裹在运输途中破损，客户拒收" />
      </Modal>
    </div>
  );
}
