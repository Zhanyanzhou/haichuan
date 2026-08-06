import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Table, Tag, Input, Select, Modal, Form, InputNumber, message, Popconfirm, Space, Upload, Button, Dropdown, Tooltip, Skeleton, Result } from 'antd';
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
  DRAFT:     { color: '#8A7F72', label: '草稿' },
  PUBLISHED: { color: '#52C41A', label: '已发布' },
  OFFLINE:   { color: '#FAAD14', label: '已下架' },
  ARCHIVED:  { color: '#D9D9D9', label: '已归档' },
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

/** 价格显示：0代表未设置 */
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
      title: '商品', key: 'info', width: 260, fixed: 'left',
      render: (_: any, r: Product) => (
        <div className="flex items-center gap-3">
          {r.images?.[0]?.url ? (
            <img src={getThumbnailImage(r as any)} alt="" className="w-12 h-12 object-cover border border-brand-line flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" fill="%23F5F2ED"><rect width="120" height="120"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="%23B8944E" font-size="24">◆</text></svg>'; }} />
          ) : (
            <div className="w-12 h-12 bg-brand-bg flex items-center justify-center text-brand-muted text-lg border border-brand-line flex-shrink-0">◆</div>
          )}
          <div className="min-w-0">
            <p className="font-medium text-brand-text text-sm truncate">{r.name}</p>
            <code className="text-[11px] text-brand-gold">{r.code}</code>
          </div>
        </div>
      ),
    },
    {
      title: '分类 / 材质', key: 'catMat', width: 150,
      render: (_: any, r: Product) => (
        <div className="text-xs space-y-0.5">
          <div className="text-brand-text">{r.category?.name || '-'}</div>
          <div className="text-brand-muted">{getMaterialLabel(r.materialType)}</div>
        </div>
      ),
    },
    {
      title: '商品数据', key: 'data', width: 150,
      render: (_: any, r: Product) => {
        const weightStr = formatZeroField(r.goldWeight, 0);
        const craftStr = formatZeroField(r.craftFee, 0);
        const priceStr = formatPrice(r.price);
        return (
          <div className="text-xs space-y-0.5">
            <div>金重: {weightStr === '未填写' ? <span className="text-brand-muted">{weightStr}</span> : `${weightStr}g`}</div>
            <div>工费: {craftStr === '未填写' ? <span className="text-brand-muted">{craftStr}</span> : `¥${Number(r.craftFee).toLocaleString()}`}</div>
            <div className={r.price === 0 ? 'text-brand-muted' : 'text-brand-gold font-medium'}>售价: {priceStr}</div>
          </div>
        );
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v: ProductStatus) => {
        const m = statusMeta[v] || { color: '#D9D9D9', label: v };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '更新', key: 'updated', width: 100,
      render: (_: any, r: any) => {
        if (!r.updatedAt) return '-';
        return <span className="text-xs text-brand-muted">{new Date(r.updatedAt).toLocaleDateString('zh-CN')}</span>;
      },
    },
    {
      title: '操作', key: 'ops', width: 160, fixed: 'right',
      render: (_: any, r: Product) => {
        const items: MenuProps['items'] = [];
        // 只在有权限时显示删除
        items.push({ key: 'delete', icon: <DeleteOutlined />, danger: true, label: '删除' });

        return (
          <Space size={4}>
            <Tooltip title="编辑"><button className="text-xs px-2 py-1 text-brand-text hover:text-brand-gold hover:bg-brand-bg rounded transition-colors" onClick={() => openEdit(r)}><EditOutlined /></button></Tooltip>
            <Tooltip title="前台预览">
              <a href={`/products/${r.id}`} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2 py-1 text-brand-muted hover:text-brand-gold hover:bg-brand-bg rounded transition-colors inline-block">
                <EyeOutlined />
              </a>
            </Tooltip>
            {r.status === 'DRAFT' || r.status === 'OFFLINE' ? (
              <Tooltip title="发布"><button className="text-xs px-2 py-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors" onClick={() => handlePublish(r.id)}><SendOutlined /></button></Tooltip>
            ) : r.status === 'PUBLISHED' ? (
              <Tooltip title="下架"><button className="text-xs px-2 py-1 text-orange-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors" onClick={() => handleUnpublish(r.id)}><StopOutlined /></button></Tooltip>
            ) : null}
            <Dropdown menu={{ items, onClick: ({ key }) => { if (key === 'delete') Modal.confirm({ title: `确认删除「${r.name}」？`, content: '删除后可在回收站恢复（软删除）。', okText: '确认删除', okType: 'danger', cancelText: '取消', onOk: () => handleDelete(r.id, r.name) }); } }} trigger={['click']}>
              <button className="text-xs px-1 py-1 text-brand-muted hover:text-brand-text rounded transition-colors"><MoreOutlined /></button>
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  // ═══ 渲染 ═══
  return (
    <div className="space-y-4">
      {/* ── 第一行：标题 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-brand-text">商品管理</h1>
          <p className="text-xs text-brand-muted mt-0.5">{total} 款商品</p>
        </div>
        <ScifiButton variant="gold" onClick={openCreate}><PlusOutlined /> 新增商品</ScifiButton>
      </div>

      {/* ── 第二行：状态统计 ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStatusFilter(undefined)}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${!statusFilter ? 'bg-brand-gold/10 border-brand-gold text-brand-gold font-medium' : 'border-brand-line text-brand-muted hover:border-brand-gold/50'}`}
        >
          全部 {statusCounts.all ?? total}
        </button>
        {allStatuses.filter(s => statusMeta[s]).map(s => (
          <button key={s}
            onClick={() => setStatusFilter(statusFilter === s ? undefined : s)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${statusFilter === s ? 'font-medium' : 'border-brand-line text-brand-muted hover:border-brand-gold/50'}`}
            style={statusFilter === s ? { backgroundColor: statusMeta[s].color + '18', borderColor: statusMeta[s].color, color: statusMeta[s].color } : {}}
          >
            {statusMeta[s].label} {statusCounts[s] ?? '-'}
          </button>
        ))}
      </div>

      {/* ── 第三行：搜索 + 筛选 ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Input.Search
          placeholder="搜索商品名称或编号"
          value={keyword}
          onChange={(e) => handleKeywordChange(e.target.value)}
          onSearch={() => fetchProducts(1)}
          className="w-52"
          allowClear
          size="middle"
        />
        <Select
          placeholder="分类"
          value={categoryFilter}
          onChange={(v) => setCategoryFilter(v)}
          allowClear
          showSearch
          optionFilterProp="label"
          options={categoryOptions}
          className="w-36"
          size="middle"
        />
        <Select
          placeholder="材质"
          value={materialFilter}
          onChange={(v) => setMaterialFilter(v)}
          allowClear
          options={materials.map(m => ({ value: m, label: getMaterialLabel(m) }))}
          className="w-28"
          size="middle"
        />
        {(statusFilter || categoryFilter || materialFilter || keyword) && (
          <button onClick={handleClearFilters} className="text-xs text-brand-muted hover:text-brand-gold transition-colors">
            <ClearOutlined /> 清除筛选
          </button>
        )}
        {error && (
          <button onClick={() => fetchProducts()} className="text-xs text-red-500 hover:text-red-600">
            <ReloadOutlined /> 重试
          </button>
        )}
      </div>

      {/* ── 错误提示 ── */}
      {error && !loading && (
        <Result
          status="error" title="加载失败" subTitle={error}
          extra={<Button onClick={() => fetchProducts()} icon={<ReloadOutlined />}>重试</Button>}
        />
      )}

      {/* ── 表格 ── */}
      {!error && (
        <Card className="!bg-white !border-brand-line" bodyStyle={{ padding: 0 }}>
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
              showTotal: (t) => `${t} 款`,
              size: 'default',
              onChange: (p, ps) => { setPage(p); setPageSize(ps); fetchProducts(p); },
            }}
            size="middle"
            scroll={{ x: 920 }}
            locale={{
              emptyText: keyword || statusFilter || categoryFilter || materialFilter
                ? '没有符合当前筛选条件的商品'
                : '暂无商品，点击上方"新增商品"开始添加',
            }}
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
