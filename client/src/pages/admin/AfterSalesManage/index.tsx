import { useCallback, useEffect, useState } from 'react';
import { App as AntdApp, Button, Descriptions, Drawer, Form, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { afterSalesApi, orderApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';
import { useAuthStore } from '@/store/authStore';
import type { AfterSalesCase, AfterSalesStatus, AfterSalesType, Order, PaginatedResult } from '@/types';

const STATUS_META: Record<AfterSalesStatus, { color: string; label: string }> = {
  REQUESTED: { color: 'gold', label: '已申请' },
  APPROVED: { color: 'blue', label: '已通过' },
  REJECTED: { color: 'default', label: '已驳回' },
  RETURNING: { color: 'cyan', label: '逆向物流中' },
  QC_PASSED: { color: 'green', label: '质检通过' },
  QC_FAILED: { color: 'orange', label: '质检不通过' },
  COMPLETED: { color: 'green', label: '已完成' },
  CANCELLED: { color: 'red', label: '已取消' },
};

const TYPE_META: Record<AfterSalesType, { label: string }> = {
  REFUND: { label: '退款退货' },
  EXCHANGE: { label: '换货' },
  REPAIR: { label: '维修' },
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'REQUESTED', label: '待审核' },
  { key: 'APPROVED', label: '处理中' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'REJECTED', label: '已驳回' },
];

type AfterSalesListItem = AfterSalesCase & {
  order: { orderNo: string; customerName: string; customerPhone: string; finalAmount: number | string; status: string };
};

export default function AfterSalesManage() {
  const { message, modal } = AntdApp.useApp();
  const role = useAuthStore((state) => state.user?.role);
  // 与 after-sales.controller 类级 @Roles 一致：客服可登记、审核并推进售后。
  const canManageAfterSales = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'CUSTOMER_SERVICE';

  // 登记售后：按订单号/客户搜索选定订单，自动带出客户与订单商品行，避免手填内部 ID 出错
  const [orderOptions, setOrderOptions] = useState<
    { value: number; label: string; order: Order }[]
  >([]);
  const [orderSearching, setOrderSearching] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const searchOrders = async (kw: string) => {
    if (!kw) { setOrderOptions([]); return; }
    setOrderSearching(true);
    try {
      const res = await orderApi.getList({ keyword: kw, page: 1, pageSize: 10 });
      const data = unwrapResponse<PaginatedResult<Order>>(res);
      setOrderOptions((data?.list || []).map((o) => ({
        value: o.id,
        label: `${o.orderNo} · ${o.customerName || ''} ${o.customerPhone || ''}`.trim(),
        order: o,
      })));
    } catch {
      setOrderOptions([]);
    } finally {
      setOrderSearching(false);
    }
  };

  const selectOrder = (orderId: number) => {
    const opt = orderOptions.find((o) => o.value === orderId);
    setSelectedOrder(opt?.order ?? null);
    createForm.setFieldsValue({
      orderId,
      customerId: opt?.order?.customerId ?? undefined,
      orderItemId: undefined,
    });
  };

  const clearSelectedOrder = () => {
    setSelectedOrder(null);
    setOrderOptions([]);
    createForm.setFieldsValue({ orderId: undefined, customerId: undefined, orderItemId: undefined });
  };

  const [list, setList] = useState<AfterSalesListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [detail, setDetail] = useState<AfterSalesListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm();
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await afterSalesApi.getList({
        page, pageSize,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        keyword: keyword || undefined,
      });
      const data = unwrapResponse<PaginatedResult<AfterSalesListItem>>(res);
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch {
      setLoadError(true);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, typeFilter, keyword]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (record: AfterSalesListItem) => {
    setDetail(record);
    setDetailLoading(true);
    try {
      const res = await afterSalesApi.getById(record.id);
      const full = unwrapResponse<AfterSalesListItem>(res);
      if (full) setDetail(full);
    } catch (e: unknown) {
      // 保留列表快照展示，但明确告知详情刷新失败，可关闭重开重试
      message.error(getSafeAdminErrorMessage(e, '售后详情加载失败，当前展示列表快照，请重新打开重试。'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async (values: { orderId: number; orderItemId: number; customerId: number; type: AfterSalesType; reason: string; customerNote?: string; requestedRefundAmount?: number }) => {
    setCreating(true);
    try {
      await afterSalesApi.create({
        orderId: Number(values.orderId),
        orderItemId: Number(values.orderItemId),
        customerId: Number(values.customerId),
        type: values.type,
        reason: values.reason,
        customerNote: values.customerNote,
        requestedRefundAmount: values.requestedRefundAmount ? Number(values.requestedRefundAmount) : undefined,
      });
      message.success('售后工单已创建');
      setCreateOpen(false);
      void load();
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, '售后工单创建失败，请检查必填信息后重试。'));
    } finally {
      setCreating(false);
    }
  };

  const handleReview = (record: AfterSalesListItem, action: 'APPROVED' | 'REJECTED') => {
    let adminNote = '';
    let approvedRefundAmount: number | undefined;
    modal.confirm({
      title: action === 'APPROVED' ? '审核通过该售后工单？' : '驳回该售后工单？',
      content: (
        <div className="space-y-2">
          {action === 'APPROVED' && record.type === 'REFUND' && (
            <Input placeholder="审核通过的退款金额（可选）" type="number" onChange={(e) => { approvedRefundAmount = Number(e.target.value); }} />
          )}
          <Input.TextArea placeholder="处理备注（可选）" rows={3} onChange={(e) => { adminNote = e.target.value; }} />
        </div>
      ),
      okText: action === 'APPROVED' ? '确认通过' : '确认驳回',
      okButtonProps: { danger: action === 'REJECTED' },
      onOk: async () => {
        try {
          await afterSalesApi.review(record.id, {
            action,
            adminNote: adminNote || undefined,
            approvedRefundAmount: approvedRefundAmount && approvedRefundAmount > 0 ? approvedRefundAmount : undefined,
          });
          message.success(action === 'APPROVED' ? '已审核通过' : '已驳回');
          void load();
        } catch (e: unknown) {
          message.error(getSafeAdminErrorMessage(e, '售后审核未完成，请重新加载工单后重试。'));
        }
      },
    });
  };

  const handleUpdateStatus = (record: AfterSalesListItem) => {
    let adminNote = '';
    const nextOptions: Array<{ value: string; label: string }> = [];
    if (record.status === 'APPROVED') {
      nextOptions.push({ value: 'RETURNING', label: '开始逆向物流' }, { value: 'COMPLETED', label: '直接完成' });
    } else if (record.status === 'RETURNING') {
      nextOptions.push({ value: 'QC_PASSED', label: '质检通过' }, { value: 'QC_FAILED', label: '质检不通过' }, { value: 'COMPLETED', label: '完成' });
    } else if (record.status === 'QC_PASSED' || record.status === 'QC_FAILED') {
      nextOptions.push({ value: 'COMPLETED', label: '完成' });
    }
    if (!['COMPLETED', 'REJECTED', 'CANCELLED'].includes(record.status)) {
      nextOptions.push({ value: 'CANCELLED', label: '取消工单' });
    }
    if (nextOptions.length === 0) return;
    let nextStatus = nextOptions[0].value;
    modal.confirm({
      title: '更新售后状态',
      content: (
        <div className="space-y-2">
          <Select className="w-full" defaultValue={nextStatus} onChange={(v) => { nextStatus = v; }} options={nextOptions} />
          <Input.TextArea placeholder="处理备注（可选）" rows={2} onChange={(e) => { adminNote = e.target.value; }} />
        </div>
      ),
      onOk: async () => {
        try {
          await afterSalesApi.updateStatus(record.id, { status: nextStatus, adminNote: adminNote || undefined });
          message.success('状态已更新');
          void load();
        } catch (e: unknown) {
          message.error(getSafeAdminErrorMessage(e, '售后状态更新失败，请重新加载工单后重试。'));
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-semibold text-brand-text">售后中心</h1>
          <p className="text-sm text-brand-muted mt-1">退款退货 · 换货 · 维修（售后审核通过后可在退款中心发起退款）</p>
        </div>
        <Space>
          <Input.Search
            placeholder="工单号/订单号/客户"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
            className="w-64"
            allowClear
          />
          {canManageAfterSales && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>登记售后</Button>}
        </Space>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2 flex-wrap">
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
        <Select
          className="w-36"
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setPage(1); }}
          options={[
            { value: 'all', label: '全部类型' },
            { value: 'REFUND', label: '退款退货' },
            { value: 'EXCHANGE', label: '换货' },
            { value: 'REPAIR', label: '维修' },
          ]}
        />
      </div>

      {loadError ? (
        <div className="text-center py-16">
          <p className="text-brand-muted mb-4">售后数据暂时无法加载</p>
          <Button type="primary" onClick={() => void load()}>重新加载</Button>
        </div>
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={list}
          size="middle"
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          locale={{ emptyText: '暂无售后工单' }}
          columns={[
            { title: '工单号', dataIndex: 'caseNo', render: (v: string) => <code className="text-xs text-brand-gold">{v}</code> },
            {
              title: '订单 / 客户', render: (_: unknown, r: AfterSalesListItem) => (
                <div>
                  <p className="text-sm">{r.order?.orderNo}</p>
                  <p className="text-xs text-brand-muted">{r.order?.customerName} · {r.order?.customerPhone}</p>
                </div>
              ),
            },
            { title: '类型', dataIndex: 'type', render: (v: AfterSalesType) => <Tag>{TYPE_META[v]?.label || v}</Tag> },
            { title: '原因', dataIndex: 'reason', ellipsis: true },
            {
              title: '退款额', dataIndex: 'requestedRefundAmount', render: (v: number | string | null) => v ? <span className="text-brand-gold">¥{Number(v).toLocaleString()}</span> : '—',
            },
            { title: '状态', dataIndex: 'status', render: (v: AfterSalesStatus) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.label || v}</Tag> },
            {
              title: '操作', render: (_: unknown, r: AfterSalesListItem) => (
                <Space>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>详情</Button>
                  {canManageAfterSales && r.status === 'REQUESTED' && (
                    <>
                      <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleReview(r, 'APPROVED')}>通过</Button>
                      <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleReview(r, 'REJECTED')}>驳回</Button>
                    </>
                  )}
                  {canManageAfterSales && !['COMPLETED', 'REJECTED', 'CANCELLED', 'REQUESTED'].includes(r.status) && (
                    <Button size="small" onClick={() => handleUpdateStatus(r)}>推进状态</Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      {/* 详情抽屉 */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} width={560} title="售后详情" loading={detailLoading}>
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="工单号"><code className="text-xs text-brand-gold">{detail.caseNo}</code></Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_META[detail.status]?.color}>{STATUS_META[detail.status]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="类型">{TYPE_META[detail.type]?.label}</Descriptions.Item>
            <Descriptions.Item label="订单号">{detail.order?.orderNo}</Descriptions.Item>
            <Descriptions.Item label="客户">{detail.customer?.name || detail.order?.customerName} · {detail.customer?.phone || detail.order?.customerPhone}</Descriptions.Item>
            <Descriptions.Item label="申请原因">{detail.reason}</Descriptions.Item>
            <Descriptions.Item label="客户备注">{detail.customerNote || '—'}</Descriptions.Item>
            <Descriptions.Item label="期望退款额">{detail.requestedRefundAmount ? `¥${Number(detail.requestedRefundAmount).toLocaleString()}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="审核通过退款额">{detail.approvedRefundAmount ? `¥${Number(detail.approvedRefundAmount).toLocaleString()}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="处理备注">{detail.adminNote || '—'}</Descriptions.Item>
            <Descriptions.Item label="处理人">{detail.handler?.realName || detail.handler?.username || '—'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {detail.createdAt
                ? new Date(detail.createdAt).toLocaleString('zh-CN')
                : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* 登记售后 */}
      <Modal
        title="登记售后工单"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} preserve={false}>
          {/* 提交合同保持 orderId/customerId/orderItemId 数字字段；由下方选择器自动写入 */}
          <Form.Item name="orderId" hidden rules={[{ required: true, message: '请先搜索并选择订单' }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="customerId" hidden rules={[{ required: true, message: '所选订单缺少客户信息，请重新选择' }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item label="关联订单" required>
            <Select
              showSearch
              filterOption={false}
              onSearch={searchOrders}
              loading={orderSearching}
              placeholder="搜索订单号 / 客户姓名 / 手机号"
              value={selectedOrder?.orderNo}
              onSelect={(v) => selectOrder(Number(v))}
              onClear={clearSelectedOrder}
              options={orderOptions}
              allowClear
              notFoundContent={orderSearching ? '搜索中…' : '输入关键字搜索订单'}
            />
          </Form.Item>
          {selectedOrder && (
            <p className="text-xs text-brand-muted -mt-2 mb-3">
              客户：{selectedOrder.customerName || '—'} · {selectedOrder.customerPhone || '—'}（自动关联，无需填写）
            </p>
          )}
          <Form.Item name="orderItemId" label="订单商品" rules={[{ required: true, message: '请选择订单内的商品行' }]}>
            <Select
              placeholder={selectedOrder ? '选择该订单内的商品行' : '请先选择订单'}
              disabled={!selectedOrder}
              options={(selectedOrder?.items || []).map((it) => ({
                value: it.id,
                label: [it.productNameSnapshot, it.productCodeSnapshot].filter(Boolean).join(' · '),
              }))}
            />
          </Form.Item>
          <Form.Item name="type" label="售后类型" rules={[{ required: true, message: '请选择售后类型' }]}>
            <Select options={[
              { value: 'REFUND', label: '退款退货' },
              { value: 'EXCHANGE', label: '换货' },
              { value: 'REPAIR', label: '维修' },
            ]} placeholder="选择售后类型" />
          </Form.Item>
          <Form.Item name="reason" label="售后原因" rules={[{ required: true, message: '请填写售后原因' }]}>
            <Input.TextArea rows={3} placeholder="客户申请售后的原因" />
          </Form.Item>
          <Form.Item name="requestedRefundAmount" label="期望退款额（元，可选）">
            <Input type="number" min={0} step={0.01} placeholder="仅退款退货类型需要" />
          </Form.Item>
          <Form.Item name="customerNote" label="客户备注（可选）">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={creating}>创建工单</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
