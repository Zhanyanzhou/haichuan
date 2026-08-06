import { useState, useEffect } from 'react';
import { Card, Table, Switch, Tag, Input, Modal, Form, InputNumber, Select, message, Popconfirm, Space, Upload, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PictureOutlined, ArrowUpOutlined, ArrowDownOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import { productApi, categoryApi, uploadApi } from '@/services/api';
import { getMaterialLabel } from '@/utils/material';
import { getThumbnailImage } from '@/utils/productImage';
import type { Product, Category } from '@/types';
import ScifiButton from '@/components/ui/ScifiButton';
import { unwrapResponse } from '@/utils/unwrap';

const { TextArea } = Input;

const statusMap: Record<string, { c: string; t: string }> = {
  DRAFT: { c: 'default', t: '草稿' },
  PUBLISHED: { c: 'success', t: '已发布' },
  OFFLINE: { c: 'warning', t: '已下架' },
  ARCHIVED: { c: '#999', t: '已归档' },
};

const salesModeMap: Record<string, string> = {
  DISPLAY_ONLY: '仅展示',
  SELECTION: '选款',
  APPOINTMENT: '预约',
  DIRECT_PURCHASE: '直购',
  CUSTOM_INQUIRY: '定制咨询',
};

const materials = ['GOLD_999', 'GOLD_9999', 'AU750', 'PT950', 'S925', 'DIAMOND', 'JADE', 'PEARL', 'COLOR_GEM'];

function generateCode(): string {
  return 'HC-' + Date.now().toString(36).toUpperCase().slice(-6);
}

export default function ProductManage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm();
  const [categoryOptions, setCategoryOptions] = useState<{ value: number; label: string }[]>([]);

  useEffect(() => { refresh(); loadCategories(); }, []);

  const loadCategories = async () => {
    try {
      const res = await categoryApi.getTree();
      const data = unwrapResponse<Category[]>(res);
      const opts: { value: number; label: string }[] = [];
      const walk = (nodes: any[], prefix = '') => {
        for (const n of nodes) {
          const label = prefix ? `${prefix} > ${n.name}` : n.name;
          opts.push({ value: n.id, label });
          if (n.children?.length) walk(n.children, label);
        }
      };
      walk(Array.isArray(data) ? data : []);
      setCategoryOptions(opts);
    } catch { /* fallback */ }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (keyword) params.keyword = keyword;
      const res = await productApi.getList(params);
      const data = unwrapResponse<{ list: Product[]; total: number }>(res);
      setProducts(data?.list || []);
      setTotal(data?.total || 0);
    } catch (e: any) {
      message.error('加载产品列表失败: ' + (e?.message || '请检查后端服务'));
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      status: 'DRAFT', materialType: 'GOLD_999', goldWeight: 0,
      price: 0, craftFee: 0, weight: 0, sortOrder: 0,
      salesMode: 'DISPLAY_ONLY',
      isHot: false, isRecommended: false,
    });
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setProductImages(p.images || []);
    form.setFieldsValue({
      name: p.name,
      categoryId: p.categoryId,
      materialType: p.materialType,
      goldWeight: p.goldWeight,
      price: p.price,
      craftFee: p.craftFee,
      status: p.status,
      description: p.description,
      shortDescription: p.shortDescription,
      salesMode: p.salesMode,
      sortOrder: p.sortOrder,
      weight: p.weight,
      size: p.size,
      isHot: p.isHot,
      isNew: p.isNew,
      isRecommended: p.isRecommended,
      isLimited: p.isLimited,
      isCustom: p.isCustom,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      categoryId: values.categoryId,
      materialType: values.materialType,
      goldWeight: values.goldWeight ?? 0,
      price: values.price ?? 0,
      craftFee: values.craftFee ?? 0,
      status: values.status,
      description: values.description || '',
      shortDescription: values.shortDescription || '',
      salesMode: values.salesMode || 'DISPLAY_ONLY',
      sortOrder: values.sortOrder ?? 0,
      weight: values.weight ?? 0,
      size: values.size || '',
      isHot: values.isHot ?? false,
      isNew: values.isNew ?? false,
      isRecommended: values.isRecommended ?? false,
      isLimited: values.isLimited ?? false,
      isCustom: values.isCustom ?? false,
    };
    try {
      if (editing) {
        await productApi.update(editing.id, payload);
      } else {
        // 创建时不传 images/viewCount/salesCount 等系统字段
        await productApi.create({ ...payload, code: generateCode() });
      }
      message.success(editing ? '已更新' : '已创建');
      setModalOpen(false);
      refresh();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await productApi.delete(id);
      message.success('已删除');
      refresh();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const [productImages, setProductImages] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const loadImages = async (productId: number) => {
    try {
      const res = await productApi.getById(productId);
      const p = unwrapResponse<Product>(res);
      setProductImages(p?.images || []);
    } catch { setProductImages([]); }
  };

  const handleUpload = async (file: File) => {
    if (!editing?.id) { message.warning('请先保存产品后再上传图片'); return Upload.LIST_IGNORE; }
    setUploading(true);
    try {
      const upRes = await uploadApi.uploadImage(file);
      const upData = unwrapResponse<{ url: string }>(upRes);
      const sortOrder = productImages.length;
      await productApi.addImage(editing.id, { url: upData.url, sortOrder });
      message.success('图片已上传');
      await loadImages(editing.id);
    } catch { message.error('上传失败'); }
    finally { setUploading(false); }
    return Upload.LIST_IGNORE;
  };

  const handleSetCover = async (imageId: number) => {
    if (!editing?.id) return;
    try { await productApi.setCoverImage(editing.id, imageId); await loadImages(editing.id); message.success('已设为封面'); }
    catch { message.error('设置封面失败'); }
  };

  const handleMoveImage = async (imageId: number, dir: 1 | -1) => {
    const idx = productImages.findIndex((i: any) => i.id === imageId);
    if (idx < 0 || idx + dir < 0 || idx + dir >= productImages.length) return;
    const a = productImages[idx], b = productImages[idx + dir];
    try {
      await productApi.updateImage(editing!.id, a.id, { sortOrder: b.sortOrder });
      await productApi.updateImage(editing!.id, b.id, { sortOrder: a.sortOrder });
      await loadImages(editing!.id);
    } catch { message.error('排序失败'); }
  };

  const handleDeleteImage = async (imageId: number) => {
    if (!editing?.id) return;
    try { await productApi.deleteImage(editing.id, imageId); await loadImages(editing.id); message.success('已删除'); }
    catch { message.error('删除失败'); }
  };

  const columns: ColumnsType<Product> = [
    {
      title: '产品', key: 'info', width: 260,
      render: (_: any, r: Product) => (
        <div className="flex items-center gap-3">
          {r.images?.[0]?.url ? (
            <img src={getThumbnailImage(r as any)} alt="" className="w-10 h-10 object-cover border border-brand-line" />
          ) : (
            <div className="w-10 h-10 bg-brand-bg flex items-center justify-center text-brand-gold/30 text-lg border border-brand-line">◆</div>
          )}
          <div>
            <p className="font-medium text-brand-text text-sm">{r.name}</p>
            <code className="text-[10px] text-brand-gold">{r.code}</code>
          </div>
        </div>
      ),
    },
    { title: '分类', key: 'cat', width: 90, render: (_: any, r: Product) => r.category?.name || '-' },
    { title: '材质', key: 'mat', width: 90, render: (_: any, r: Product) => getMaterialLabel(r.materialType) },
    { title: '金重(g)', dataIndex: 'goldWeight', width: 80 },
    { title: '工费', dataIndex: 'craftFee', width: 80, render: (v: number) => v ? `¥${v}` : '-' },
    {
      title: '售价', dataIndex: 'price', width: 110,
      render: (v: number) => <span className="text-brand-gold font-medium">¥{v?.toLocaleString()}</span>,
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const s = statusMap[v] || { c: 'default', t: v };
        return <Tag color={s.c}>{s.t}</Tag>;
      },
    },
    {
      title: '操作', width: 140,
      render: (_: any, r: Product) => (
        <Space>
          <button className="text-xs text-brand-gold hover:underline" onClick={() => openEdit(r)}><EditOutlined /> 编辑</button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
            <button className="text-xs text-red-500 hover:underline"><DeleteOutlined /> 删除</button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand-text">产品管理</h1>
          <p className="text-sm text-brand-muted mt-1">共 {total} 款产品</p>
        </div>
        <ScifiButton variant="gold" onClick={openCreate}><PlusOutlined /> 新增产品</ScifiButton>
      </div>

      <div className="flex gap-3">
        <Input placeholder="搜索产品名称或编码" value={keyword}
          onChange={(e) => setKeyword(e.target.value)} onPressEnter={refresh}
          className="w-56" allowClear />
      </div>

      <Card className="!bg-white !border-brand-line">
        <Table
          dataSource={products} rowKey="id" loading={loading}
          pagination={{ pageSize: 10, size: 'small' }} size="middle"
          scroll={{ x: 900 }}
          locale={{ emptyText: '暂无产品，点击"新增产品"添加' }}
          columns={columns}
        />
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={editing ? '编辑产品' : '新增产品'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        width={720}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ style: { background: '#B8944E', borderColor: '#B8944E' } }}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="name" label="产品名称" rules={[{ required: true }]}>
              <Input placeholder="例如：星云 · 雕花平安扣" />
            </Form.Item>
            <Form.Item name="categoryId" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
              <Select placeholder="选择产品分类" showSearch optionFilterProp="label" options={categoryOptions} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="产品描述">
            <TextArea rows={3} placeholder="产品描述..." />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="shortDescription" label="简介">
              <Input placeholder="简短的宣传语，用于列表和卡片展示" maxLength={500} />
            </Form.Item>
            <Form.Item name="salesMode" label="销售模式">
              <Select options={[
                { value: 'DISPLAY_ONLY', label: '仅展示' },
                { value: 'SELECTION', label: '选款' },
                { value: 'APPOINTMENT', label: '预约' },
                { value: 'CUSTOM_INQUIRY', label: '定制咨询' },
              ]} />
            </Form.Item>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="materialType" label="材质">
              <Select options={materials.map((m) => ({ value: m, label: getMaterialLabel(m) }))} />
            </Form.Item>
            <Form.Item name="goldWeight" label="金重(g)">
              <InputNumber min={0} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select options={[
                { value: 'DRAFT', label: '草稿' },
                { value: 'PUBLISHED', label: '已发布' },
                { value: 'OFFLINE', label: '已下架' },
                { value: 'ARCHIVED', label: '已归档' },
              ]} />
            </Form.Item>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="weight" label="总重量(g)">
              <InputNumber min={0} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="size" label="尺寸规格">
              <Input placeholder="如：直径2.5cm / 圈号14" />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序">
              <InputNumber min={0} className="w-full" placeholder="数字越小越靠前" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <Form.Item name="price" label="售价(¥)" rules={[{ required: true }]}>
                <InputNumber min={0} className="w-full" />
              </Form.Item>
              <Form.Item name="craftFee" label="工费(¥)">
                <InputNumber min={0} className="w-full" />
              </Form.Item>
            </div>
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-3 gap-2">
                <Form.Item name="isHot" label="热卖" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item name="isNew" label="新品" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item name="isRecommended" label="推荐" valuePropName="checked"><Switch /></Form.Item>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Form.Item name="isLimited" label="限量" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item name="isCustom" label="定制" valuePropName="checked"><Switch /></Form.Item>
              </div>
            </div>
          </div>

          {/* ═══ 产品图片管理 ═══ */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E8E7E3' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>产品图片</span>
              <Upload accept="image/*" showUploadList={false} beforeUpload={handleUpload as any}>
                <Button icon={<PictureOutlined />} loading={uploading} disabled={!editing?.id} size="small">
                  {editing?.id ? '上传图片' : '请先保存产品'}
                </Button>
              </Upload>
            </div>
            {productImages.length === 0 ? (
              <p style={{ fontSize: 12, color: '#8A7F72' }}>当前产品尚未上传图片</p>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[...productImages].sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((img: any, idx: number) => (
                  <div key={img.id} style={{ width: 88, border: img.type === 'FRONT' ? '2px solid #B8944E' : '1px solid #E8E7E3', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                    <img src={img.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', background: '#FAF9F7' }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, padding: 2, background: '#fff', borderTop: '1px solid #E8E7E3' }}>
                      <Button size="small" type="text" icon={img.type === 'FRONT' ? <StarFilled style={{ color: '#B8944E' }} /> : <StarOutlined />}
                        onClick={() => handleSetCover(img.id)} title="设为封面" />
                      <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={idx === 0}
                        onClick={() => handleMoveImage(img.id, -1)} />
                      <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={idx === productImages.length - 1}
                        onClick={() => handleMoveImage(img.id, 1)} />
                      <Popconfirm title="确认删除？" onConfirm={() => handleDeleteImage(img.id)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Form>
      </Modal>
    </div>
  );
}
