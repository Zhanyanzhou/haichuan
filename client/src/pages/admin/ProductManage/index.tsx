import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Table, Tag, Input, Select, Modal, Form, InputNumber, message, Popconfirm, Space, Upload, Button, Dropdown, Tooltip, Switch, Result, Segmented } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PictureOutlined, ArrowUpOutlined, ArrowDownOutlined, StarOutlined, StarFilled, EyeOutlined, MoreOutlined, ReloadOutlined, ClearOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import { productApi, categoryApi, uploadApi } from '@/services/api';
import { getMaterialLabel } from '@/utils/material';
import { getThumbnailImage } from '@/utils/productImage';
import { productPlaceholder } from '@/utils/placeholder';
import type { Product, Category, ProductStatus } from '@/types';
import ScifiButton from '@/components/ui/ScifiButton';
import { unwrapResponse } from '@/utils/unwrap';

const { TextArea } = Input;

const statusMeta: Record<ProductStatus, { color: string; label: string }> = {
  DRAFT:     { color: '#8C8C8C', label: '草稿' },
  PUBLISHED: { color: '#6BBF6B', label: '已发布' },
  OFFLINE:   { color: '#C8A87C', label: '已下架' },
  ARCHIVED:  { color: '#BFBFBF', label: '已归档' },
};

const allStatuses: ProductStatus[] = ['DRAFT', 'PUBLISHED', 'OFFLINE', 'ARCHIVED'];

const materials = ['GOLD_999', 'GOLD_9999', 'AU750', 'PT950', 'S925', 'DIAMOND', 'JADE', 'PEARL', 'COLOR_GEM'];

function generateCode(): string {
  return 'HC-' + Date.now().toString(36).toUpperCase().slice(-6);
}

/** 0值显示：数据库默认值显示为"未填写"，真实0正常显示 */
function formatZeroField(v: number | null | undefined, defaultValue: number): string {
  if (v == null || v === defaultValue) return '未填写';
  return String(v);
}

/** 价格显示：0是数据库默认值，代表未配置 */
function formatPrice(v: number | null | undefined): string {
  if (v == null || v === 0) return '咨询价格';
  return `¥${v.toLocaleString()}`;
}

export default function ProductManage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选状态
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatus | undefined>();
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>();
  const [materialFilter, setMaterialFilter] = useState<string | undefined>();

  // 防抖搜索
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // 模态框
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm();
  const [categoryOptions, setCategoryOptions] = useState<{ value: number; label: string }[]>([]);

  // 图片管理
  const [productImages, setProductImages] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // 状态统计
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // 页面初始加载
  useEffect(() => { loadCategories(); fetchProducts(); }, []);

  // 筛选变化时重新加载
  useEffect(() => {
    setPage(1);
    fetchProducts(1);
  }, [statusFilter, categoryFilter, materialFilter]);

  // 关键字防抖
  const handleKeywordChange = (val: string) => {
    setKeyword(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); fetchProducts(1); }, 400);
  };

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

  /** 统计各状态数量（无筛选条件下获取） */
  const fetchStatusCounts = async () => {
    try {
      const res = await productApi.getList({ page: 1, pageSize: 1 });
      const data = unwrapResponse<{ list: Product[]; total: number }>(res);
      const allTotal = data?.total ?? 0;
      // 为每种状态单独请求总数（后端 count 支持 status 筛选）
      const counts: Record<string, number> = { all: allTotal };
      for (const s of allStatuses) {
        try {
          const sRes = await productApi.getList({ page: 1, pageSize: 1, status: s });
          const sData = unwrapResponse<{ total: number }>(sRes);
          counts[s] = sData?.total ?? 0;
        } catch { counts[s] = 0; }
      }
      setStatusCounts(counts);
    } catch { /* 统计失败不影响主流程 */ }
  };

  const fetchProducts = useCallback(async (targetPage?: number) => {
    const pg = targetPage ?? page;
    setLoading(true);
    setError(null);
    try {
      const params: any = { page: pg, pageSize };
      if (keyword) params.keyword = keyword;
      if (statusFilter) params.status = statusFilter;
      if (categoryFilter) params.categoryId = categoryFilter;
      if (materialFilter) params.materialType = materialFilter;

      const res = await productApi.getList(params);
      const data = unwrapResponse<{ list: Product[]; total: number }>(res);
      setProducts(data?.list || []);
      setTotal(data?.total || 0);
      // 无筛选时更新统计
      if (!statusFilter && !categoryFilter && !materialFilter && !keyword) {
        fetchStatusCounts();
      }
    } catch (e: any) {
      const msg = e?.message || '请检查后端服务是否启动';
      setError(msg);
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, statusFilter, categoryFilter, materialFilter]);

  const handleClearFilters = () => {
    setKeyword('');
    setStatusFilter(undefined);
    setCategoryFilter(undefined);
    setMaterialFilter(undefined);
  };

  const handlePublish = async (id: number) => {
    try {
      await productApi.publish(id);
      message.success('已发布');
      fetchProducts();
    } catch (e: any) { message.error(e?.message || '发布失败'); }
  };

  const handleUnpublish = async (id: number) => {
    try {
      await productApi.unpublish(id);
      message.success('已下架');
      fetchProducts();
    } catch (e: any) { message.error(e?.message || '下架失败'); }
  };

  const handleDelete = async (id: number, name: string) => {
    try {
      await productApi.delete(id);
      message.success(`已删除: ${name}`);
      if (products.length === 1 && page > 1) {
        setPage(page - 1);
        fetchProducts(page - 1);
      } else {
        fetchProducts();
      }
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      status: 'DRAFT', materialType: 'GOLD_999', goldWeight: 0,
      price: 0, craftFee: 0, weight: 0, sortOrder: 0,
      salesMode: 'DISPLAY_ONLY', isHot: false, isRecommended: false,
    });
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setProductImages(p.images || []);
    form.setFieldsValue({
      name: p.name, categoryId: p.categoryId, materialType: p.materialType,
      goldWeight: p.goldWeight, price: p.price, craftFee: p.craftFee,
      status: p.status, description: p.description, shortDescription: p.shortDescription,
      salesMode: p.salesMode, sortOrder: p.sortOrder, weight: p.weight, size: p.size,
      isHot: p.isHot, isNew: p.isNew, isRecommended: p.isRecommended,
      isLimited: p.isLimited, isCustom: p.isCustom,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name, categoryId: values.categoryId, materialType: values.materialType,
      goldWeight: values.goldWeight ?? 0, price: values.price ?? 0,
      craftFee: values.craftFee ?? 0, status: values.status,
      description: values.description || '', shortDescription: values.shortDescription || '',
      salesMode: values.salesMode || 'DISPLAY_ONLY', sortOrder: values.sortOrder ?? 0,
      weight: values.weight ?? 0, size: values.size || '',
      isHot: values.isHot ?? false, isNew: values.isNew ?? false,
      isRecommended: values.isRecommended ?? false, isLimited: values.isLimited ?? false,
      isCustom: values.isCustom ?? false,
    };
    try {
      if (editing) { await productApi.update(editing.id, payload); }
      else { await productApi.create({ ...payload, code: generateCode() }); }
      message.success(editing ? '已更新' : '已创建');
      setModalOpen(false);
      fetchProducts();
    } catch (e: any) { message.error(e?.message || '保存失败'); }
  };

  // 图片管理函数
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
      await productApi.addImage(editing.id, { url: upData.url, sortOrder: productImages.length });
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

  // ═══ 表格列定义 ═══
  const columns: ColumnsType<Product> = [
    {
      title: '商品', key: 'info', width: 380, fixed: 'left',
      render: (_: any, r: Product) => (
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#F5F5F5] flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ borderRadius: 4 }}>
            {r.images?.[0]?.url ? (
              <img src={getThumbnailImage(r as any)} alt="" className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style=color:#B8944E;font-size:18px>◆</span>'; }} />
            ) : (
              <span style={{ color: '#D9D9D9', fontSize: 18 }}>◆</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-900 leading-snug line-clamp-2">{r.name}</p>
            <code className="text-xs text-gray-400">{r.code}</code>
          </div>
        </div>
      ),
    },
    {
      title: '分类 / 材质', key: 'catMat', width: 200,
      render: (_: any, r: Product) => (
        <div className="text-sm space-y-0.5">
          <div className="text-gray-700">{r.category?.name || '-'}</div>
          <div className="text-gray-400 text-xs">{getMaterialLabel(r.materialType)}</div>
        </div>
      ),
    },
    {
      title: '价格方式', key: 'priceMode', width: 160,
      render: (_: any, r: Product) => {
        if (r.price === 0) return <span className="text-gray-400 text-sm">未配置</span>;
        return <span className="text-gray-800 text-sm">¥{r.price.toLocaleString()}</span>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 120,
      render: (v: ProductStatus) => {
        const m = statusMeta[v] || { color: '#BFBFBF', label: v };
        return (
          <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 4,
            fontSize: 12, lineHeight: '20px',
            backgroundColor: m.color + '18', color: m.color, border: `1px solid ${m.color}40`,
          }}>
            {m.label}
          </span>
        );
      },
    },
    {
      title: '更新时间', key: 'updated', width: 130,
      render: (_: any, r: any) => {
        if (!r.updatedAt) return <span className="text-gray-300 text-xs">-</span>;
        return <span className="text-gray-400 text-xs">{new Date(r.updatedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>;
      },
    },
    {
      title: '操作', key: 'ops', width: 200, fixed: 'right',
      render: (_: any, r: Product) => {
        const menuItems: MenuProps['items'] = [];
        if (r.status === 'DRAFT' || r.status === 'OFFLINE') {
          menuItems.push({ key: 'publish', icon: <SendOutlined />, label: '发布' });
        } else if (r.status === 'PUBLISHED') {
          menuItems.push({ key: 'unpublish', icon: <StopOutlined />, label: '下架' });
        }
        menuItems.push({ type: 'divider' });
        menuItems.push({ key: 'delete', icon: <DeleteOutlined />, danger: true, label: '删除' });

        return (
          <Space size={8}>
            <Button type="link" size="small" onClick={() => openEdit(r)} style={{ padding: 0, height: 24 }}>编辑</Button>
            <Button type="link" size="small" href={`/products/${r.id}`} target="_blank" style={{ padding: 0, height: 24, color: '#8C8C8C' }}>预览</Button>
            <Dropdown
              menu={{
                items: menuItems,
                onClick: ({ key }) => {
                  if (key === 'publish') handlePublish(r.id);
                  else if (key === 'unpublish') handleUnpublish(r.id);
                  else if (key === 'delete') Modal.confirm({
                    title: `确认删除「${r.name}」？`,
                    content: '删除后为软删除，可在数据库中恢复。',
                    okText: '删除', okType: 'danger', cancelText: '取消',
                    onOk: () => handleDelete(r.id, r.name),
                  });
                },
              }}
              trigger={['click']}
            >
              <Button type="link" size="small" icon={<MoreOutlined />} style={{ padding: 0, height: 24, color: '#8C8C8C' }} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  // ═══ 渲染 ═══
  const hasFilters = !!(statusFilter || categoryFilter || materialFilter || keyword);
  const segmentedOptions = [
    { label: `全部 ${statusCounts.all ?? total}`, value: 'all' },
    ...allStatuses.filter(s => statusCounts[s] !== undefined).map(s => ({
      label: `${statusMeta[s].label} ${statusCounts[s] ?? 0}`,
      value: s,
    })),
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1600 }}>
      {/* ── 头部 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1F1F1F', margin: 0 }}>商品管理</h1>
          <p style={{ fontSize: 13, color: '#8C8C8C', margin: '4px 0 0' }}>管理商品资料、发布状态与前台展示</p>
        </div>
        <ScifiButton variant="gold" onClick={openCreate}><PlusOutlined /> 新增商品</ScifiButton>
      </div>

      {/* ── 状态切换 ── */}
      <div style={{ marginBottom: 16 }}>
        <Segmented
          size="middle"
          options={segmentedOptions}
          value={statusFilter || 'all'}
          onChange={(val) => {
            const v = val as string;
            setStatusFilter(v === 'all' ? undefined : v as ProductStatus);
          }}
          style={{ backgroundColor: '#F5F5F5' }}
        />
      </div>

      {/* ── 搜索筛选栏 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input.Search
          placeholder="搜索商品名称或编号"
          value={keyword}
          onChange={(e) => handleKeywordChange(e.target.value)}
          onSearch={() => { setPage(1); fetchProducts(1); }}
          allowClear
          style={{ width: 280 }}
        />
        <Select
          placeholder="分类"
          value={categoryFilter}
          onChange={(v) => setCategoryFilter(v)}
          allowClear
          showSearch
          optionFilterProp="label"
          options={categoryOptions}
          style={{ width: 160 }}
        />
        <Select
          placeholder="材质"
          value={materialFilter}
          onChange={(v) => setMaterialFilter(v)}
          allowClear
          options={materials.map(m => ({ value: m, label: getMaterialLabel(m) }))}
          style={{ width: 140 }}
        />
        {hasFilters && (
          <Button size="middle" onClick={handleClearFilters} icon={<ClearOutlined />}>重置</Button>
        )}
        {error && (
          <Button size="middle" onClick={() => fetchProducts()} icon={<ReloadOutlined />}>重试</Button>
        )}
      </div>

      {/* ── 错误 ── */}
      {error && !loading && (
        <Result status="error" title="加载失败" subTitle={error}
          extra={<Button onClick={() => fetchProducts()} icon={<ReloadOutlined />}>重试</Button>}
        />
      )}

      {/* ── 表格 ── */}
      {!error && (
        <Card style={{ border: '1px solid #F0F0F0', borderRadius: 8, boxShadow: 'none' }} bodyStyle={{ padding: 0 }}>
          <Table
            dataSource={products}
            rowKey="id"
            loading={loading}
            columns={columns}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (t) => `共 ${t} 件商品`,
              size: 'default',
              onChange: (p, ps) => { setPage(p); setPageSize(ps); fetchProducts(p); },
              style: { margin: '0 16px' },
            }}
            size="middle"
            scroll={{ x: 1190 }}
            locale={{
              emptyText: hasFilters ? '没有符合当前筛选条件的商品' : '暂无商品，点击"新增商品"开始添加',
            }}
            style={{ border: 'none' }}
          />
        </Card>
      )}

      {/* ═══ 新增/编辑弹窗 ═══ */}
      <Modal
        title={editing ? '编辑商品' : '新增商品'}
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
            <Form.Item name="name" label="商品名称" rules={[{ required: true }]}>
              <Input placeholder="例如：星云 · 雕花平安扣" />
            </Form.Item>
            <Form.Item name="categoryId" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
              <Select placeholder="选择商品分类" showSearch optionFilterProp="label" options={categoryOptions} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="商品描述">
            <TextArea rows={3} placeholder="商品描述..." />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="shortDescription" label="简介">
              <Input placeholder="简短的宣传语" maxLength={500} />
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
              <Select options={allStatuses.map(s => ({ value: s, label: statusMeta[s]?.label || s }))} />
            </Form.Item>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="weight" label="总重量(g)">
              <InputNumber min={0} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="size" label="尺寸规格">
              <Input placeholder="如：直径2.5cm" />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序">
              <InputNumber min={0} className="w-full" placeholder="数字越小越靠前" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <Form.Item name="price" label="售价(¥)">
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
