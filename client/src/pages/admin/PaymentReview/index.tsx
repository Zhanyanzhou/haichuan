import { useEffect, useState } from 'react';
import { Button, Image, Input, Modal, Space, Table, Tag, message } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import { paymentApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';

type Payment = {
  id: number;
  paymentNo: string;
  amount: number | string;
  status: string;
  proofUrl?: string | null;
  createdAt: string;
  order: { orderNo: string; customerName: string; customerPhone: string; status: string };
};

const statusMap: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '待审核' },
  PAID: { color: 'green', label: '已确认收款' },
  FAILED: { color: 'red', label: '已驳回' },
  REFUNDED: { color: 'purple', label: '已退款' },
  PARTIAL_REFUND: { color: 'purple', label: '部分退款' },
};

export default function PaymentReview() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [proof, setProof] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = unwrapResponse<{ list: Payment[] }>(await paymentApi.getList({ pageSize: 100, keyword: keyword || undefined }));
      setPayments(result?.list || []);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const review = (payment: Payment, approved: boolean) => {
    let reviewNote = '';
    Modal.confirm({
      title: approved ? '确认已收到线下转账？' : '驳回该付款凭证？',
      content: <Input.TextArea placeholder="审核备注（可选）" onChange={(event) => { reviewNote = event.target.value; }} />,
      okText: approved ? '确认收款' : '确认驳回',
      okButtonProps: { danger: !approved },
      onOk: async () => {
        await (approved ? paymentApi.approve(payment.id, reviewNote) : paymentApi.reject(payment.id, reviewNote));
        message.success(approved ? '已确认收款，订单进入待发货' : '付款凭证已驳回');
        await load();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-2xl font-display font-semibold text-brand-text">付款审核</h1><p className="text-sm text-brand-muted mt-1">线下转账凭证审核与收款确认</p></div>
        <Space><Input placeholder="付款单号、订单号或手机号" value={keyword} onChange={(event) => setKeyword(event.target.value)} onPressEnter={load} /><Button onClick={load}>查询</Button></Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={payments}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '付款单号', dataIndex: 'paymentNo', render: (value: string) => <code className="text-xs text-brand-gold">{value}</code> },
          { title: '订单 / 客户', render: (_: unknown, record: Payment) => <div><p>{record.order.orderNo}</p><p className="text-xs text-brand-muted">{record.order.customerName} · {record.order.customerPhone}</p></div> },
          { title: '金额', dataIndex: 'amount', render: (value: number | string) => <span className="text-brand-gold font-medium">¥{Number(value).toLocaleString()}</span> },
          { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={statusMap[value]?.color}>{statusMap[value]?.label || value}</Tag> },
          { title: '凭证', render: (_: unknown, record: Payment) => record.proofUrl ? <Button size="small" icon={<EyeOutlined />} onClick={() => setProof(record.proofUrl || null)}>查看</Button> : <span className="text-brand-muted">未提交</span> },
          { title: '操作', render: (_: unknown, record: Payment) => record.status === 'PENDING' ? <Space><Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => review(record, true)}>确认收款</Button><Button size="small" danger icon={<CloseOutlined />} onClick={() => review(record, false)}>驳回</Button></Space> : '-' },
        ]}
      />
      <Modal open={!!proof} title="付款凭证" footer={null} onCancel={() => setProof(null)}><Image src={proof || ''} alt="付款凭证" className="w-full" /></Modal>
    </div>
  );
}
