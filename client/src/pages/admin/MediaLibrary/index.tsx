import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as AntdApp, Card, Tabs, Table, Image, Button, Tag, Popconfirm, Empty, Space, Upload, Input, Select, Modal } from 'antd';
import type { TableColumnsType, UploadProps } from 'antd';
import { PictureOutlined, FileImageOutlined, DeleteOutlined, LinkOutlined, UploadOutlined } from '@ant-design/icons';
import { productApi, uploadApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';
import AdminPageHeader from '@/components/common/AdminPageHeader';
import { AdminLoadingState, AdminEmptyState, AdminErrorState } from '@/components/common/AdminDataStates';
import type { PaginatedResult } from '@/types';
import { SecureImage } from '@/components/common/SecureImage';
import {
  readPageMediaLibrary,
  writePageMediaLibrary,
  type PageMediaItem,
} from '@/page-builder/fields/pageMediaLibrary';

type ProductMediaRow = {
  id: number;
  productId: number;
  mediaUrl?: string | null;
  productName?: string | null;
  productCode?: string | null;
  type?: string | null;
  sortOrder?: number | null;
};

export default function MediaLibrary() {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [images, setImages] = useState<ProductMediaRow[]>([]);
  const [productMediaPage, setProductMediaPage] = useState(1);
  const [productMediaTotal, setProductMediaTotal] = useState(0);
  const [tab, setTab] = useState('pages');
  const [pageMedia, setPageMedia] = useState<PageMediaItem[]>([]);
  const [mediaKeyword, setMediaKeyword] = useState('');
  const [mediaType, setMediaType] = useState<'all' | 'image' | 'video'>('all');
  const [preview, setPreview] = useState<{ url: string; type: 'image' | 'video'; name: string } | null>(null);

  const filteredMedia = pageMedia.filter((m) => {
    if (mediaType !== 'all' && m.type !== mediaType) return false;
    if (mediaKeyword && !m.name.toLowerCase().includes(mediaKeyword.toLowerCase())) return false;
    return true;
  });

  // 读取已上传的页面素材（本地记录，后端无独立素材列表接口）
  useEffect(() => {
    setPageMedia(readPageMediaLibrary());
  }, []);

  const persistMedia = (list: typeof pageMedia) => {
    setPageMedia(list);
    writePageMediaLibrary(list);
  };

  const handleUpload = async (
    options: Parameters<NonNullable<UploadProps['customRequest']>>[0],
    type: 'image' | 'video',
  ) => {
    const { file, onSuccess, onError } = options;
    try {
      const res = type === 'image'
        ? await uploadApi.uploadImage(file as File)
        : await uploadApi.uploadVideo(file as File);
      const url = unwrapResponse<{ url: string }>(res)?.url;
      if (!url) throw new Error('上传失败');
      persistMedia([
        { url, type, name: (file as File).name, createdAt: new Date().toISOString() },
        ...pageMedia,
      ]);
      message.success('素材已上传');
      onSuccess?.(url);
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, '素材上传失败，请检查文件格式和网络后重试。'));
      onError?.(error instanceof Error ? error : new Error('素材上传失败'));
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      message.success('链接已复制');
    } catch {
      message.warning('复制失败，请手动复制');
    }
  };

  const removeMedia = (url: string) => {
    persistMedia(pageMedia.filter((m) => m.url !== url));
  };

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const res = await productApi.getMediaList({ page, pageSize: 50 });
      const data = unwrapResponse<PaginatedResult<ProductMediaRow>>(res);
      setImages(data?.list || []);
      setProductMediaTotal(data?.total || 0);
      setProductMediaPage(page);
    } catch (error: unknown) { setError(getSafeAdminErrorMessage(error, '商品图片加载失败，请稍后重新加载。')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'products') load();
  }, [tab, load]);

  const handleDelete = async (img: ProductMediaRow) => {
    try {
      await productApi.deleteImage(img.productId, img.id);
      message.success('商品图片已删除');
      load(productMediaPage);
    } catch (error) { message.error(getSafeAdminErrorMessage(error, '素材删除失败，请重新加载后重试。')); }
  };

  const columns: TableColumnsType<ProductMediaRow> = [
    { title: '缩略图', dataIndex: 'mediaUrl', width: 80, render: (v: string) => v ? <SecureImage src={v} tokenKind="staff" deferUntilVisible alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : <FileImageOutlined style={{ fontSize: 24, color: 'var(--adm-subtle)' }} /> },
    { title: '所属产品', render: (_, row) => <div><a href={`/admin/products`} style={{ color: 'var(--adm-action)' }}>{row.productName || '—'}</a><p style={{ fontSize: 13, lineHeight: '20px', color: 'var(--adm-text)', fontVariantNumeric: 'tabular-nums' }}>{row.productCode}</p></div> },
    { title: '类型', dataIndex: 'type', render: (v: string) => <Tag>{v || 'FRONT'}</Tag> },
    { title: '排序', dataIndex: 'sortOrder', width: 60 },
    { title: '操作', width: 100, render: (_, row) => (
      <Popconfirm title="删除这张商品图片？" description="删除后需要重新上传才能恢复。" okText="删除图片" cancelText="取消" onConfirm={() => handleDelete(row)}>
        <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除图片</Button>
      </Popconfirm>
    )},
  ];

  return (
    <div>
      <AdminPageHeader
        title="当前浏览器页面素材"
        subtitle="上传文件由服务端保存；这里仅记录当前浏览器可复用的链接，商品图片请在商品模块维护"
      />
      <Card style={{ borderRadius: 10, border: '1px solid var(--adm-line)', boxShadow: '0 6px 20px rgba(24,26,27,0.035)' }}>
        <Tabs activeKey={tab} onChange={setTab} items={[
          {
            key: 'pages', label: <span><FileImageOutlined /> 当前浏览器素材</span>,
            children: (
              <div>
                <Space style={{ marginBottom: 16 }} wrap>
                  <Upload accept="image/*" multiple showUploadList={false} customRequest={(o) => handleUpload(o, 'image')}>
                    <Button icon={<UploadOutlined />}>上传图片</Button>
                  </Upload>
                  <Upload accept="video/*" multiple showUploadList={false} customRequest={(o) => handleUpload(o, 'video')}>
                    <Button icon={<UploadOutlined />}>上传视频</Button>
                  </Upload>
                  <Button type="primary" onClick={() => navigate('/admin/editor/home')}>
                    进入首页装修
                  </Button>
                  <span style={{ color: 'var(--adm-muted)', fontSize: 12, lineHeight: '18px' }}>
                    共 {pageMedia.length} 个素材（图片 {pageMedia.filter((m) => m.type === 'image').length} · 视频 {pageMedia.filter((m) => m.type === 'video').length}）
                  </span>
                </Space>
                <Space style={{ marginBottom: 16 }}>
                  <Input.Search
                    allowClear
                    placeholder="按文件名搜索"
                    style={{ width: 240 }}
                    onChange={(e) => setMediaKeyword(e.target.value)}
                  />
                  <Select value={mediaType} onChange={setMediaType} style={{ width: 120 }}
                    options={[
                      { value: 'all', label: '全部类型' },
                      { value: 'image', label: '图片' },
                      { value: 'video', label: '视频' },
                    ]} />
                </Space>
                {filteredMedia.length === 0 ? (
                  <Empty description="当前浏览器暂无页面素材记录；上传后可复制链接在装修中使用" />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                    {filteredMedia.map((m) => (
                      <div key={m.url} style={{ border: '1px solid var(--adm-line)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                        {m.type === 'image' ? (
                          <Image src={m.url} width="100%" height={120} style={{ objectFit: 'cover', cursor: 'pointer' }} preview={false} onClick={() => setPreview(m)} />
                        ) : (
                          <video src={m.url} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block', cursor: 'pointer' }} onClick={() => setPreview(m)} />
                        )}
                        <div style={{ padding: 8 }}>
                          <p style={{ fontSize: 12, margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</p>
                          <Space size={0}>
                            <Button size="small" type="link" icon={<LinkOutlined />} onClick={() => copyUrl(m.url)}>复制链接</Button>
                            <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => removeMedia(m.url)}>删除素材</Button>
                          </Space>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'products', label: <span><PictureOutlined /> 商品图片</span>,
            children: loading ? <AdminLoadingState subject="商品图片" /> :
              error ? <AdminErrorState message={error} onRetry={load} /> :
                images.length === 0 ? <AdminEmptyState message="暂无商品图片" /> :
                  <Table dataSource={images} rowKey="id" columns={columns} size="middle"
                    pagination={{ current: productMediaPage, pageSize: 50, total: productMediaTotal, showSizeChanger: false, onChange: (page) => void load(page), showTotal: t => `共 ${t} 张` }} />,
          },
        ]} />
      </Card>

      {/* 素材预览 */}
      <Modal open={!!preview} footer={null} onCancel={() => setPreview(null)} width={720} title={preview?.name || '预览'}>
        {preview && (preview.type === 'image'
          ? <Image src={preview.url} width="100%" style={{ objectFit: 'contain' }} />
          : <video src={preview.url} controls style={{ width: '100%', maxHeight: '60vh', display: 'block' }} />
        )}
      </Modal>
    </div>
  );
}
