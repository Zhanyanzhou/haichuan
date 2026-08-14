import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Tag, Input, Select, Button, Drawer, Descriptions, message, Space, Card } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { selectionInquiryApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import AdminPageHeader from '@/components/common/AdminPageHeader';
import AdminStatusTag from '@/components/common/AdminStatusTag';
import { AdminLoadingState, AdminEmptyState, AdminErrorState } from '@/components/common/AdminDataStates';
import { SecureImage } from '@/components/common/SecureImage';

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '待处理' },
  PROCESSING: { color: 'blue', label: '处理中' },
  REPLIED: { color: 'green', label: '已回复' },
  CLOSED: { color: '#999', label: '已关闭' },
};

export default function SelectionInquiryManage() {
  const [searchParams] = useSearchParams();
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailError, setDetailError] = useState(false);
  const requestedStatus = searchParams.get('status') || '';

  useEffect(() => {
    setStatus(Object.prototype.hasOwnProperty.call(STATUS_MAP, requestedStatus) ? requestedStatus : '');
    setPage(1);
  }, [requestedStatus]);

  const pageSize = 15;

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await selectionInquiryApi.getList({ status: status || undefined, keyword: keyword || undefined, page, pageSize });
      const data = unwrapResponse<any>(res);
      setList(data.list ?? []);
      setTotal(data.total ?? 0);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [keyword, page, pageSize, status]);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const openDetail = async (id: number) => {
    setDrawerId(id);
    setDetailError(false);
    setDetail(null);
    try {
      const res = await selectionInquiryApi.getDetail(id);
      setDetail(unwrapResponse<any>(res));
    } catch {
      // P1-39：详情加载失败标记错误态，避免抽屉永久 loading
      setDetailError(true);
    }
  };

  const handleStatus = async (id: number, newStatus: string) => {
    try {
      await selectionInquiryApi.update(id, { status: newStatus });
      message.success('状态已更新');
      fetchList();
      if (drawerId === id) openDetail(id);
    } catch { message.error('更新失败'); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '客户', dataIndex: 'customerName', width: 100 },
    { title: '电话', dataIndex: 'phone', width: 130 },
    { title: '微信', dataIndex: 'wechat', width: 100, render: (v: string) => v || '-' },
    { title: '选款数量', width: 80, render: (_: any, r: any) => r.items?.length ?? 0 },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (s: string) => <AdminStatusTag status={s} mapping={STATUS_MAP} />,
    },
    { title: '提交时间', dataIndex: 'createdAt', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    {
      title: '操作', width: 80,
      render: (_: any, r: any) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>查看</Button>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader title="选款咨询" subtitle="管理客户选款咨询与需求跟进" />

      <Card style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)', marginBottom: 16 }}>
        <Space wrap>
          <Input placeholder="客户姓名/电话" prefix={<SearchOutlined />} value={keyword} onChange={e => setKeyword(e.target.value)}
            onPressEnter={fetchList} style={{ width: 220 }} allowClear />
          <Select placeholder="状态筛选" value={status || undefined} onChange={v => { setStatus(v || ''); setPage(1); }}
            allowClear style={{ width: 140 }}>
            {Object.entries(STATUS_MAP).map(([k, v]) => <Select.Option key={k} value={k}>{v.label}</Select.Option>)}
          </Select>
          <Button type="primary" onClick={fetchList} style={{ background: '#B69052', borderColor: '#B69052' }}>搜索</Button>
        </Space>
      </Card>

      {error ? <AdminErrorState onRetry={fetchList} /> : (
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading}
          pagination={{ current: page, pageSize, total, onChange: setPage, showTotal: (t: number) => `共 ${t} 条` }}
          locale={{ emptyText: <AdminEmptyState description="暂无选款咨询" /> }}
          scroll={{ x: 900 }}
        />
      )}

      <Drawer title={`选款咨询 #${drawerId}`} open={drawerId !== null} onClose={() => { setDrawerId(null); setDetail(null); }}
        width={600}>
        {detail ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="客户">{detail.customerName}</Descriptions.Item>
              <Descriptions.Item label="电话">{detail.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{detail.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="微信">{detail.wechat || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <AdminStatusTag status={detail.status} mapping={STATUS_MAP} />
              </Descriptions.Item>
              <Descriptions.Item label="处理人">{detail.handler?.username ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="留言">{detail.message || '-'}</Descriptions.Item>
              <Descriptions.Item label="提交时间">{detail.createdAt ? new Date(detail.createdAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            </Descriptions>

            <h4 style={{ marginTop: 24, marginBottom: 12 }}>选款列表（{detail.items?.length ?? 0}）</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(detail.items ?? []).map((item: any) => (
                <Card key={item.id} size="small" style={{ border: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {item.productImageSnapshot && (
                      <SecureImage src={item.productImageSnapshot} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} tokenKind="staff" />
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.productNameSnapshot}</div>
                      <div style={{ color: '#999', fontSize: 12 }}>{item.productSkuSnapshot || ''}</div>
                    </div>
                  </div>
                </Card>
              ))}
              {(!detail.items || detail.items.length === 0) && <AdminEmptyState description="暂无选款" />}
            </div>

            <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
              {detail.status === 'PENDING' && (
                <Button onClick={() => handleStatus(detail.id, 'PROCESSING')} type="primary" style={{ background: '#1677ff', borderColor: '#1677ff' }}>标记处理中</Button>
              )}
              {detail.status === 'PROCESSING' && (
                <Button onClick={() => handleStatus(detail.id, 'REPLIED')} type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}>标记已回复</Button>
              )}
              {detail.status !== 'CLOSED' && (
                <Button onClick={() => handleStatus(detail.id, 'CLOSED')} danger>关闭咨询</Button>
              )}
              {detail.status === 'CLOSED' && (
                <Button onClick={() => handleStatus(detail.id, 'PENDING')}>重新打开</Button>
              )}
            </div>
          </>
        ) : detailError ? (
          <AdminErrorState onRetry={() => { if (drawerId) void openDetail(drawerId); }} />
        ) : (
          <AdminLoadingState />
        )}
      </Drawer>
    </div>
  );
}
