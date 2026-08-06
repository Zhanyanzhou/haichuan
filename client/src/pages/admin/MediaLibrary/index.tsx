import { useState, useEffect } from 'react';
import { Card, Tabs, Table, Image, Button, Tag, message, Popconfirm } from 'antd';
import { PictureOutlined, FileImageOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { productApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import AdminPageHeader from '@/components/common/AdminPageHeader';
import AdminStatusTag from '@/components/common/AdminStatusTag';
import { AdminLoadingState, AdminEmptyState, AdminErrorState } from '@/components/common/AdminDataStates';
import type { PaginatedResult } from '@/types';

export default function MediaLibrary() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [images, setImages] = useState<any[]>([]);
  const [tab, setTab] = useState('products');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await productApi.getList({ page: 1, pageSize: 200 });
      const data = unwrapResponse<PaginatedResult<any>>(res);
      const allImages: any[] = [];
      (data?.list || []).forEach((p: any) => {
        (p.images || []).forEach((img: any) => {
          allImages.push({ ...img, productName: p.name, productId: p.id, productCode: p.code });
        });
      });
      setImages(allImages);
    } catch (e: any) { setError(e.message || '加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (img: any) => {
    try {
      await productApi.deleteImage(img.productId, img.id);
      message.success('已删除');
      load();
    } catch { message.error('删除失败'); }
  };

  const columns = [
    { title: '缩略图', dataIndex: 'url', width: 80, render: (v: string) => v ? <Image src={v} width={48} height={48} style={{ objectFit: 'cover', borderRadius: 4 }} /> : <FileImageOutlined style={{ fontSize: 24, color: '#ccc' }} /> },
    { title: '所属产品', render: (_: any, r: any) => <div><a href={`/admin/products`} style={{ color: '#B69052' }}>{r.productName || '—'}</a><p style={{ fontSize: 11, color: '#96928A' }}>{r.productCode}</p></div> },
    { title: '类型', dataIndex: 'type', render: (v: string) => <Tag>{v || 'FRONT'}</Tag> },
    { title: '排序', dataIndex: 'sortOrder', width: 60 },
    { title: '操作', width: 100, render: (_: any, r: any) => (
      <Popconfirm title="确定删除此图片？" onConfirm={() => handleDelete(r)}>
        <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
      </Popconfirm>
    )},
  ];

  return (
    <div>
      <AdminPageHeader title="素材库" subtitle="管理产品图片和页面素材" />
      <Card style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)' }}>
        <Tabs activeKey={tab} onChange={setTab} items={[
          {
            key: 'products', label: <span><PictureOutlined /> 产品图片</span>,
            children: loading ? <AdminLoadingState /> :
              error ? <AdminErrorState message={error} onRetry={load} /> :
                images.length === 0 ? <AdminEmptyState message="暂无产品图片" /> :
                  <Table dataSource={images} rowKey="id" columns={columns} size="middle"
                    pagination={{ pageSize: 20, showTotal: t => `共 ${t} 张` }} />,
          },
          {
            key: 'pages', label: <span><FileImageOutlined /> 页面素材</span>,
            children: <AdminEmptyState message="页面素材功能即将上线" />,
          },
        ]} />
      </Card>
    </div>
  );
}
