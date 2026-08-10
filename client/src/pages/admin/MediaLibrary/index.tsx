import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tabs, Table, Image, Button, Tag, message, Popconfirm, Empty, Space } from 'antd';
import { PictureOutlined, FileImageOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { productApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import AdminPageHeader from '@/components/common/AdminPageHeader';
import AdminStatusTag from '@/components/common/AdminStatusTag';
import { AdminLoadingState, AdminEmptyState, AdminErrorState } from '@/components/common/AdminDataStates';
import type { PaginatedResult } from '@/types';

export default function MediaLibrary() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [images, setImages] = useState<any[]>([]);
  const [tab, setTab] = useState('pages');

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

  useEffect(() => {
    if (tab === 'products') load();
  }, [tab]);

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
      <AdminPageHeader title="页面素材" subtitle="为首页装修准备图片与视频；商品图片请在商品模块维护" />
      <Card style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)' }}>
        <Tabs activeKey={tab} onChange={setTab} items={[
          {
            key: 'pages', label: <span><FileImageOutlined /> 页面素材</span>,
            children: (
              <div style={{ minHeight: 320, display: 'grid', placeItems: 'center' }}>
                <Empty
                  image={<FileImageOutlined style={{ fontSize: 46, color: '#B69052' }} />}
                  description={<span>页面素材将直接在首页装修中上传和引用</span>}
                >
                  <Space>
                    <Button type="primary" onClick={() => navigate('/admin/editor/home')} style={{ background: '#B69052', borderColor: '#B69052' }}>
                      进入首页装修
                    </Button>
                    <Button onClick={() => setTab('products')}>管理商品图片</Button>
                  </Space>
                </Empty>
              </div>
            ),
          },
          {
            key: 'products', label: <span><PictureOutlined /> 商品图片</span>,
            children: loading ? <AdminLoadingState /> :
              error ? <AdminErrorState message={error} onRetry={load} /> :
                images.length === 0 ? <AdminEmptyState message="暂无产品图片" /> :
                  <Table dataSource={images} rowKey="id" columns={columns} size="middle"
                    pagination={{ pageSize: 20, showTotal: t => `共 ${t} 张` }} />,
          },
        ]} />
      </Card>
    </div>
  );
}
