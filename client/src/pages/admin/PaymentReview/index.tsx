import { useCallback, useEffect, useState } from 'react';
import { Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { SecureImage } from '@/components/common/SecureImage';
import { paymentApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';
import type { PaginatedResult, Payment } from '@/types';

const statusMap: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '待审核' },
  PAID: { color: 'green', label: '已确认收款' },
  FAILED: { color: 'red', label: '已驳回' },
  REFUNDED: { color: 'purple', label: '已退款' },
  PARTIAL_REFUND: { color: 'purple', label: '部分退款' },
};

type PaymentListItem = Payment & {
  order: { orderNo: string; customerName: string; customerPhone: string; status: string };
  reviewer?: { id: number; realName?: string; username: string } | null;
};

function useIsAdmin(): boolean {
  try {
    const raw = localStorage.getItem('jewelry-auth');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const role = parsed?.state?.user?.role;
    return role === 'SUPER_ADMIN' || role === 'ADMIN';
  } catch {
    return false;
  }
}

export default function PaymentReview() {
  const [list, setList] = useState<PaymentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [proofPaymentId, setProofPaymentId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PaymentListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptSubmitting, setReceiptSubmitting] = useState(false);
  const [receiptForm] = Form.useForm();
  const isAdmin = useIsAdmin();

  const STATUS_TABS: Array<{ k: string; l: string }> = [
    { k: 'all', l: '全部' },
    { k: 'PENDING', l: '待审核' },
    { k: 'PAID', l: '已确认' },
    { k: 'FAILED', l: '已驳回' },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await paymentApi.getList({
        page, pageSize,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        keyword: keyword || undefined,
      });
      const data = unwrapResponse<PaginatedResult<PaymentListItem>>(res);
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

  const openDetail = async (record: PaymentListItem) => {
    setDetail(record);
    setDetailLoading(true);
    try {
      const res = await paymentApi.getById(record.id);
      const full = unwrapResponse<PaymentListItem>(res);
      if (full) setDetail(full);
    } catch { /* 保留列表数据 */ } finally {
      setDetailLoading(false);
    }
  };

  const review = (payment: PaymentListItem, approved: boolean) => {
    let reviewNote = '';
    Modal.confirm({
      title: approved ? '确认已收到线下转账？' : '驳回该付款凭证？',
      icon: null,
      content: (
        <div className="space-y-2">
          <p className="text-sm text-brand-muted">订单 {payment.order.orderNo} · 金额 ¥{Number(payment.amount).toLocaleString()}</p>
          <Input.TextArea placeholder="审核备注（可选，将记录到交易事件）" onChange={(event) => { reviewNote = event.target.value; }} rows={3} />
        </div>
      ),
      okText: approved ? '确认收款' : '确认驳回',
      okButtonProps: { danger: !approved },
      onOk: async () => {
        setReviewing(true);
        try {
          if (approved) {
            await paymentApi.approve(payment.id, reviewNote || undefined);
            message.success('已确认收款，订单进入待发货');
          } else {
            await paymentApi.reject(payment.id, reviewNote || undefined);
            message.success('付款凭证已驳回');
          }
          await load();
          if (detail?.id === payment.id) void openDetail(payment);
        } catch (e: any) {
          // 并发审核失败时后端返回明确中文错误（"该付款记录已被处理，请刷新后重试"）
          message.error(getSafeAdminErrorMessage(e, '付款凭证审核未完成，请重新加载后确认当前状态。'));
        } finally {
          setReviewing(false);
        }
      },
    });
  };

  // 手动登记收款（财务/管理员直接录入已到账收款）
  const handleCreateReceipt = async () => {
    let values: any;
    try {
      values = await receiptForm.validateFields();
    } catch {
      return;
    }
    setReceiptSubmitting(true);
    try {
      await paymentApi.createReceipt({
        orderId: Number(values.orderId),
        amount: Number(values.amount),
        method: values.method,
        type: values.type,
        paidAt: values.paidAt ? values.paidAt.format('YYYY-MM-DD HH:mm') : undefined,
        gatewayTradeNo: values.gatewayTradeNo || undefined,
        reviewNote: values.reviewNote || undefined,
      });
      message.success('收款已登记，订单金额已同步');
      setReceiptOpen(false);
      receiptForm.resetFields();
      void load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, '收款登记失败，请核对金额和付款信息后重试。'));
    } finally {
      setReceiptSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-semibold text-brand-text">付款审核</h1>
          <p className="text-sm text-brand-muted mt-1">线下转账凭证审核与收款确认（审核通过后订单自动进入待发货，库存实扣）</p>
        </div>
        <Space>
          <Input.Search
            placeholder="付款单号、订单号或手机号"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
            className="w-64"
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          {isAdmin && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { receiptForm.resetFields(); setReceiptOpen(true); }}>登记收款</Button>
          )}
        </Space>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.k}
            onClick={() => { setStatusFilter(tab.k); setPage(1); }}
            type="button"
            className={`px-4 py-2 text-sm border transition-all ${statusFilter === tab.k ? 'border-brand-gold text-brand-gold' : 'border-brand-line text-brand-muted hover:text-brand-text hover:border-brand-gold'}`}
          >
            {tab.l}
          </button>
        ))}
      </div>

      {loadError ? (
        <div className="text-center py-16">
          <p className="text-brand-muted mb-4">付款数据暂时无法加载</p>
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
          locale={{ emptyText: '暂无付款记录' }}
          columns={[
            { title: '付款单号', dataIndex: 'paymentNo', render: (value: string) => <code className="text-xs text-brand-gold">{value}</code> },
            {
              title: '订单 / 客户', render: (_: unknown, record: PaymentListItem) => (
                <div>
                  <p className="text-sm">{record.order.orderNo}</p>
                  <p className="text-xs text-brand-muted">{record.order.customerName} · {record.order.customerPhone}</p>
                </div>
              ),
            },
            { title: '金额', dataIndex: 'amount', render: (value: number | string) => <span className="text-brand-gold font-medium">¥{Number(value).toLocaleString()}</span> },
            { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={statusMap[value]?.color}>{statusMap[value]?.label || value}</Tag> },
            { title: '凭证', render: (_: unknown, record: PaymentListItem) => record.proofUrl ? <Button size="small" icon={<EyeOutlined />} onClick={() => setProofPaymentId(record.id)}>查看</Button> : <span className="text-brand-muted">未提交</span> },
            {
              title: '审核人', render: (_: unknown, record: PaymentListItem) => (
                <div className="text-xs">
                  <p>{record.reviewer?.realName || record.reviewer?.username || '—'}</p>
                  <p className="text-brand-muted">{record.reviewedAt || '—'}</p>
                </div>
              ),
            },
            {
              title: '操作', render: (_: unknown, record: PaymentListItem) => (
                isAdmin && record.status === 'PENDING' ? (
                  <Space>
                    <Button size="small" type="primary" icon={<CheckOutlined />} loading={reviewing} onClick={() => review(record, true)}>确认收款</Button>
                    <Button size="small" danger icon={<CloseOutlined />} onClick={() => review(record, false)}>驳回</Button>
                  </Space>
                ) : <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
              ),
            },
          ]}
        />
      )}

      {/* 凭证预览 */}
      <Modal open={proofPaymentId !== null} title="付款凭证" footer={null} onCancel={() => setProofPaymentId(null)}>
        {proofPaymentId !== null && <SecureImage src={`/payments/${proofPaymentId}/proof`} alt="付款凭证" className="w-full" tokenKind="staff" />}
      </Modal>

      {/* 手动登记收款（定金/尾款/全款/补款） */}
      <Modal
        title="登记收款"
        open={receiptOpen}
        onCancel={() => setReceiptOpen(false)}
        onOk={handleCreateReceipt}
        confirmLoading={receiptSubmitting}
        okText="登记收款"
        destroyOnClose
      >
        <Form form={receiptForm} layout="vertical" initialValues={{ type: 'FULL', method: 'bank_transfer' }}>
          <Form.Item name="orderId" label="订单 ID" rules={[{ required: true, message: '请输入订单 ID' }]}>
            <InputNumber min={1} className="w-full" placeholder="对应的订单 ID" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="amount" label="收款金额" rules={[{ required: true, message: '请输入金额' }]}>
              <InputNumber min={0.01} prefix="¥" className="w-full" />
            </Form.Item>
            <Form.Item name="type" label="收款类型" rules={[{ required: true }]}>
              <Select options={[
                { value: 'FULL', label: '订单全款' },
                { value: 'DEPOSIT', label: '定金' },
                { value: 'BALANCE', label: '尾款' },
                { value: 'SUPPLEMENT', label: '补款' },
              ]} />
            </Form.Item>
            <Form.Item name="method" label="收款方式">
              <Select options={[
                { value: 'bank_transfer', label: '银行转账' },
                { value: 'store', label: '门店收款' },
                { value: 'wechat', label: '微信' },
                { value: 'alipay', label: '支付宝' },
              ]} />
            </Form.Item>
            <Form.Item name="paidAt" label="到账时间（选填）">
              <DatePicker showTime className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="gatewayTradeNo" label="支付流水号（选填）"><Input maxLength={100} /></Form.Item>
          <Form.Item name="reviewNote" label="备注（选填）"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
          <p className="text-xs text-brand-muted">登记后订单已收金额自动同步；全款/尾款会推动订单进入待发货并扣减库存。</p>
        </Form>
      </Modal>

      {/* 详情抽屉 */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} width={520} title="付款详情" loading={detailLoading && !detail}>
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="付款单号"><code className="text-xs text-brand-gold">{detail.paymentNo}</code></Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={statusMap[detail.status]?.color}>{statusMap[detail.status]?.label || detail.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="订单号">{detail.order.orderNo}</Descriptions.Item>
            <Descriptions.Item label="客户">{detail.order.customerName} · {detail.order.customerPhone}</Descriptions.Item>
            <Descriptions.Item label="金额"><span className="text-brand-gold font-medium">¥{Number(detail.amount).toLocaleString()}</span></Descriptions.Item>
            <Descriptions.Item label="方式">{detail.method}</Descriptions.Item>
            <Descriptions.Item label="审核人">{detail.reviewer?.realName || detail.reviewer?.username || '—'}</Descriptions.Item>
            <Descriptions.Item label="审核时间">{detail.reviewedAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="审核备注">{detail.reviewNote || '—'}</Descriptions.Item>
            <Descriptions.Item label="收款时间">{detail.paidAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detail.createdAt}</Descriptions.Item>
            {detail.proofUrl && (
              <Descriptions.Item label="付款凭证"><SecureImage src={`/payments/${detail.id}/proof`} alt="凭证" className="max-h-48" tokenKind="staff" /></Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
