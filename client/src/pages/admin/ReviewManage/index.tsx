import { useEffect, useState } from 'react';
import { Button, Input, Modal, Rate, Select, Space, Table, Tag, message } from 'antd';
import { reviewApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';

const STATUS_META: Record<string, { c: string; t: string }> = {
  PENDING: { c: 'gold', t: '待审核' },
  APPROVED: { c: 'green', t: '已通过' },
  REJECTED: { c: 'red', t: '已驳回' },
};

interface ReviewRow {
  id: number;
  rating: number;
  content: string;
  images?: string[] | null;
  status: string;
  reply: string | null;
  createdAt: string;
  product?: { id: number; name: string; code: string };
  customer?: { id: number; name: string | null; phone: string };
  order?: { id: number; orderNo: string };
}

export default function ReviewManage() {
  const [list, setList] = useState<ReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('PENDING');
  const [loading, setLoading] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReviewRow | null>(null);
  const [replyText, setReplyText] = useState('');
  const [handling, setHandling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await reviewApi.adminList({ page, pageSize: 20, status });
      const data = unwrapResponse<{ list: ReviewRow[]; total: number }>(res);
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  const moderate = async (id: number, next: 'APPROVED' | 'REJECTED', reply?: string) => {
    setHandling(true);
    try {
      await reviewApi.moderate(id, { status: next, reply });
      message.success(next === 'APPROVED' ? '已通过，评价将在作品页展示' : '已驳回');
      setReplyTarget(null);
      setReplyText('');
      void load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, '评价审核未完成，请重新加载后确认当前状态。'));
    } finally {
      setHandling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-semibold text-brand-text">评价管理</h1>
          <p className="text-sm text-brand-muted mt-1">先审后展：通过的评价对前台可见，可附顾问回复</p>
        </div>
        <Select
          style={{ width: 140 }}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: 'PENDING', label: '待审核' },
            { value: 'APPROVED', label: '已通过' },
            { value: 'REJECTED', label: '已驳回' },
            { value: 'all', label: '全部' },
          ]}
        />
      </div>

      <Table
        className="bg-white border border-brand-line"
        dataSource={list}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
        columns={[
          {
            title: '作品',
            width: 180,
            render: (_: unknown, r: ReviewRow) => (
              <span className="text-sm">{r.product?.name || '-'}</span>
            ),
          },
          {
            title: '客户',
            width: 130,
            render: (_: unknown, r: ReviewRow) => (
              <span className="text-sm">{r.customer?.name || r.customer?.phone || '-'}</span>
            ),
          },
          {
            title: '订单',
            width: 130,
            render: (_: unknown, r: ReviewRow) => (
              <span className="text-xs text-brand-muted">{r.order?.orderNo || '-'}</span>
            ),
          },
          {
            title: '星级',
            width: 110,
            render: (_: unknown, r: ReviewRow) => <Rate disabled value={r.rating} className="text-sm" />,
          },
          {
            title: '评价内容',
            ellipsis: true,
            render: (_: unknown, r: ReviewRow) => (
              <div>
                <p className="text-sm">{r.content}</p>
                {Array.isArray(r.images) && r.images.length > 0 ? (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {r.images.slice(0, 6).map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="晒单图"
                        className="w-10 h-10 object-cover border border-brand-line"
                      />
                    ))}
                  </div>
                ) : null}
                {r.reply ? (
                  <p className="text-xs text-brand-gold mt-1">已回复：{r.reply}</p>
                ) : null}
              </div>
            ),
          },
          {
            title: '状态',
            width: 90,
            dataIndex: 'status',
            render: (v: string) => {
              const s = STATUS_META[v];
              return <Tag color={s?.c}>{s?.t || v}</Tag>;
            },
          },
          {
            title: '时间',
            width: 110,
            render: (_: unknown, r: ReviewRow) => (
              <span className="text-xs text-brand-muted">
                {new Date(r.createdAt).toLocaleDateString('zh-CN')}
              </span>
            ),
          },
          {
            title: '操作',
            width: 180,
            render: (_: unknown, r: ReviewRow) =>
              r.status === 'PENDING' ? (
                <Space>
                  <Button size="small" type="primary" loading={handling} onClick={() => moderate(r.id, 'APPROVED')}>
                    通过
                  </Button>
                  <Button
                    size="small"
                    onClick={() => { setReplyTarget(r); setReplyText(''); }}
                  >
                    回复并审核
                  </Button>
                </Space>
              ) : (
                <Button
                  size="small"
                  onClick={() => { setReplyTarget(r); setReplyText(r.reply || ''); }}
                >
                  查看/回复
                </Button>
              ),
          },
        ]}
      />

      <Modal
        open={replyTarget !== null}
        title={`回复并审核 · ${replyTarget?.product?.name || ''}`}
        onCancel={() => setReplyTarget(null)}
        footer={null}
        destroyOnClose
      >
        <div className="space-y-4">
          <div className="bg-brand-bg p-3 text-sm">
            <Rate disabled value={replyTarget?.rating || 0} className="text-sm" />
            <p className="mt-2">{replyTarget?.content}</p>
          </div>
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="顾问回复（随评价一并展示，可不填）"
          />
          <Space>
            <Button
              type="primary"
              loading={handling}
              onClick={() => replyTarget && moderate(replyTarget.id, 'APPROVED', replyText.trim() || undefined)}
            >
              通过{replyText.trim() ? '并回复' : ''}
            </Button>
            <Button
              danger
              loading={handling}
              onClick={() => replyTarget && moderate(replyTarget.id, 'REJECTED', replyText.trim() || undefined)}
            >
              驳回
            </Button>
          </Space>
        </div>
      </Modal>
    </div>
  );
}
