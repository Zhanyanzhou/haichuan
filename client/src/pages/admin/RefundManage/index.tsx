import { useCallback, useEffect, useState } from 'react';
import { Button, Descriptions, Drawer, Form, Input, InputNumber, message, Modal, Space, Table, Tag } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { refundApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';
import { useAuthStore } from '@/store/authStore';
import type { PaginatedResult, Refund, RefundStatus } from '@/types';

const STATUS_META: Record<RefundStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '待审核' },
  APPROVED: { color: 'blue', label: '审核通过待执行' },
  PROCESSING: { color: 'cyan', label: '执行中' },
  COMPLETED: { color: 'green', label: '已完成' },
  REJECTED: { color: 'default', label: '已拒绝' },
  FAILED: { color: 'red', label: '执行失败' },
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待审核' },
  { key: 'APPROVED', label: '待执行' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'REJECTED', label: '已拒绝' },
];

type RefundListItem = Refund & {
  order: { orderNo: string; customerName: string; customerPhone: string; finalAmount: number | string; status: string };
};

export default function RefundManage() {
  // 仅 ADMIN 可执行写操作；前端按角色隐藏按钮（后端 @Roles 是最终边界）
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const [list, setList] = useState<RefundListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<RefundListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm();
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await refundApi.getList({
        page, pageSize,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        keyword: keyword || undefined,
      });
      const data = unwrapResponse<PaginatedResult<RefundListItem>>(res);
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch {
      setLoadError(true);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, keyword]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (record: RefundListItem) => {
    setDetail(record);
    setDetailLoading(true);
    try {
      const res = await refundApi.getById(record.id);
      const full = unwrapResponse<RefundListItem>(res);
      if (full) setDetail(full);
    } catch { /* 保留列表数据 */ } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async (values: { orderId: number; amount: number; reason: string }) => {
    setCreating(true);
    try {
      await refundApi.create({
        orderId: Number(values.orderId),
        amount: Number(values.amount),
        reason: values.reason,
        // 幂等键：同一笔订单+金额+时间窗口内去重
        idempotencyKey: `refund-${values.orderId}-${values.amount}-${Date.now()}`,
      });
      message.success('退款申请已创建');
      setCreateOpen(false);
      createForm.resetFields();
      void load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, '退款申请创建失败，请检查订单和退款信息后重试。'));
    } finally {
      setCreating(false);
    }
  };

  const handleReview = (record: RefundListItem, action: 'APPROVED' | 'REJECTED') => {
    let reviewNote = '';
    Modal.confirm({
      title: action === 'APPROVED' ? '审核通过该退款？' : '拒绝该退款？',
      content: <Input.TextArea placeholder="审核备注（可选）" onChange={(e) => { reviewNote = e.target.value; }} rows={3} />,
      okText: action === 'APPROVED' ? '确认通过' : '确认拒绝',
      okButtonProps: { danger: action === 'REJECTED' },
      onOk: async () => {
        try {
          await refundApi.review(record.id, { action, reviewNote: reviewNote || undefined });
          message.success(action === 'APPROVED' ? '已审核通过' : '已拒绝');
          void load();
        } catch (e: any) {
          message.error(getSafeAdminErrorMessage(e, '退款审核未完成，请重新加载后确认当前状态。'));
        }
      },
    });
  };

  const handleExecute = (record: RefundListItem, action: 'COMPLETED' | 'FAILED') => {
    let gatewayRefundNo = '';
    Modal.confirm({
      title: action === 'COMPLETED' ? '确认退款已完成？' : '标记退款执行失败？',
      content: (
        <div>
          <p className="text-sm text-brand-muted mb-2">{action === 'COMPLETED' ? '请填写银行/第三方退款流水号（可选），确认资金已退回客户。' : '执行失败后可重新执行。'}</p>
          <Input placeholder="退款流水号（可选）" onChange={(e) => { gatewayRefundNo = e.target.value; }} />
        </div>
      ),
      okText: action === 'COMPLETED' ? '确认完成' : '标记失败',
      okButtonProps: { danger: action === 'FAILED' },
      onOk: async () => {
        try {
          await refundApi.execute(record.id, { action, gatewayRefundNo: gatewayRefundNo || undefined });
          message.success(action === 'COMPLETED' ? '退款已完成' : '已标记失败');
          void load();
        } catch (e: any) {
          message.error(getSafeAdminErrorMessage(e, '退款执行状态更新失败，请重新加载后重试。'));
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-semibold text-brand-text">退款中心</h1>
          <p className="text-sm text-brand-muted mt-1">退款申请 · 审核 · 人工执行（累计退款不超过已收款）</p>
        </div>
        <Space>
          <Input.Search
            placeholder="退款单号/订单号/客户"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
            className="w-64"
            allowClear
          />
          {isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>发起退款</Button>}
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
          <p className="text-brand-muted mb-4">退款数据暂时无法加载</p>
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
          locale={{ emptyText: '暂无退款记录' }}
          columns={[
            { title: '退款单号', dataIndex: 'refundNo', render: (v: string) => <code className="text-xs text-brand-gold">{v}</code> },
            {
              title: '订单 / 客户', render: (_: unknown, r: RefundListItem) => (
                <div>
                  <p className="text-sm">{r.order?.orderNo}</p>
                  <p className="text-xs text-brand-muted">{r.order?.customerName} · {r.order?.customerPhone}</p>
                </div>
              ),
            },
            { title: '退款金额', dataIndex: 'amount', render: (v: number | string) => <span className="text-brand-gold font-medium">¥{Number(v).toLocaleString()}</span> },
            { title: '原因', dataIndex: 'reason', ellipsis: true, render: (v: string) => v || '—' },
            { title: '状态', dataIndex: 'status', render: (v: RefundStatus) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.label || v}</Tag> },
            {
              title: '操作', render: (_: unknown, r: RefundListItem) => (
                <Space>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>详情</Button>
                  {isAdmin && r.status === 'PENDING' && (
                    <>
                      <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleReview(r, 'APPROVED')}>通过</Button>
                      <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleReview(r, 'REJECTED')}>拒绝</Button>
                    </>
                  )}
                  {isAdmin && (r.status === 'APPROVED' || r.status === 'PROCESSING') && (
                    <>
                      <Button size="small" type="primary" onClick={() => handleExecute(r, 'COMPLETED')}>完成</Button>
                      <Button size="small" danger onClick={() => handleExecute(r, 'FAILED')}>失败</Button>
                    </>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      {/* 详情抽屉 */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} width={560} title="退款详情" loading={detailLoading}>
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="退款单号"><code className="text-xs text-brand-gold">{detail.refundNo}</code></Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_META[detail.status]?.color}>{STATUS_META[detail.status]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="订单号">{detail.order?.orderNo}</Descriptions.Item>
            <Descriptions.Item label="客户">{detail.order?.customerName} · {detail.order?.customerPhone}</Descriptions.Item>
            <Descriptions.Item label="退款金额"><span className="text-brand-gold font-medium">¥{Number(detail.amount).toLocaleString()}</span></Descriptions.Item>
            <Descriptions.Item label="退款原因">{detail.reason || '—'}</Descriptions.Item>
            <Descriptions.Item label="审核备注">{detail.reviewNote || '—'}</Descriptions.Item>
            <Descriptions.Item label="审核人">{detail.reviewer?.realName || detail.reviewer?.username || '—'}</Descriptions.Item>
            <Descriptions.Item label="审核时间">{detail.reviewedAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="执行人">{detail.processor?.realName || detail.processor?.username || '—'}</Descriptions.Item>
            <Descriptions.Item label="完成时间">{detail.completedAt || detail.processedAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="网关流水号">{detail.gatewayRefundNo || '—'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detail.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* 发起退款 */}
      <Modal
        title="发起退款"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="orderId" label="订单 ID" rules={[{ required: true, message: '请输入订单 ID' }]}>
            <InputNumber className="w-full" placeholder="请输入订单 ID（数字）" min={1} />
          </Form.Item>
          <Form.Item name="amount" label="退款金额（元）" rules={[
            { required: true, message: '请输入退款金额' },
            { type: 'number', min: 0.01, message: '退款金额必须大于 0' },
          ]}>
            <InputNumber className="w-full" placeholder="退款金额" min={0.01} step={0.01} precision={2} />
          </Form.Item>
          <Form.Item name="reason" label="退款原因" rules={[{ required: true, message: '请填写退款原因' }]}>
            <Input.TextArea rows={3} placeholder="退款原因（将记录到交易事件）" />
          </Form.Item>
          <div className="text-xs text-brand-muted mb-3">系统将校验：累计退款不超过该订单已确认收款金额。重复提交同一笔将自动去重。</div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setCreateOpen(false); createForm.resetFields(); }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={creating}>提交申请</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
