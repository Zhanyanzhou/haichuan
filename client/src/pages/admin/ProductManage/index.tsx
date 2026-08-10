import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Key } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Radio,
  Result,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { categoryApi, productApi, uploadApi } from "@/services/api";
import { getMaterialLabel } from "@/utils/material";
import { getThumbnailImage } from "@/utils/productImage";
import { productPlaceholder } from "@/utils/placeholder";
import { USE_MOCK } from "@/services/mockData";
import type { Category, Product, ProductStatus } from "@/types";
import ScifiButton from "@/components/ui/ScifiButton";
import { unwrapResponse } from "@/utils/unwrap";

const { TextArea } = Input;

const statusMeta: Record<ProductStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  PUBLISHED: { label: "出售中", color: "green" },
  OFFLINE: { label: "仓库中", color: "gold" },
  ARCHIVED: { label: "回收站", color: "default" },
};

const statuses: ProductStatus[] = ["PUBLISHED", "OFFLINE", "DRAFT", "ARCHIVED"];
const materials = ["GOLD_999", "GOLD_9999", "AU750", "PT950", "S925", "DIAMOND", "JADE", "PEARL", "COLOR_GEM"];

function makeCode() {
  return `HC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function formatPrice(price?: number) {
  return price && price > 0 ? `¥ ${Number(price).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : "待定价";
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
}

function getStatusMeta(status: string | undefined) {
  if (status === "APPROVED") return statusMeta.PUBLISHED;
  return statusMeta[status as ProductStatus] || { label: status || "未知状态", color: "default" };
}

function isPublished(status: string | undefined) {
  return status === "PUBLISHED" || status === "APPROVED";
}

function apiStatus(status: ProductStatus) {
  if (!USE_MOCK) return status;
  if (status === "PUBLISHED") return "APPROVED";
  if (status === "DRAFT") return "PENDING";
  return status;
}

export default function ProductManage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeStatus, setActiveStatus] = useState<ProductStatus | undefined>();
  const [titleKeyword, setTitleKeyword] = useState("");
  const [codeKeyword, setCodeKeyword] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [categoryOptions, setCategoryOptions] = useState<{ value: number; label: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const [form] = Form.useForm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [editorTab, setEditorTab] = useState("description");
  const [saving, setSaving] = useState(false);
  const [productImages, setProductImages] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const keyword = titleKeyword || codeKeyword;
  const hasFilters = Boolean(titleKeyword || codeKeyword || categoryId || activeStatus);

  const loadCategories = useCallback(async () => {
    try {
      const response = await categoryApi.getTree();
      const options: { value: number; label: string }[] = [];
      const walk = (nodes: Category[], parentLabel = "") => {
        nodes.forEach((node) => {
          const label = parentLabel ? `${parentLabel} / ${node.name}` : node.name;
          options.push({ value: node.id, label });
          if (node.children?.length) walk(node.children, label);
        });
      };
      walk(unwrapResponse<Category[]>(response) || []);
      setCategoryOptions(options);
    } catch {
      setCategoryOptions([]);
    }
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const responses = await Promise.all([
        productApi.getList({ page: 1, pageSize: 1 }),
        ...statuses.map((status) => productApi.getList({ page: 1, pageSize: 1, status: apiStatus(status) })),
      ]);
      const next: Record<string, number> = { all: unwrapResponse<any>(responses[0])?.total ?? 0 };
      statuses.forEach((status, index) => {
        next[status] = unwrapResponse<any>(responses[index + 1])?.total ?? 0;
      });
      setCounts(next);
    } catch {
      setCounts({});
    }
  }, []);

  const loadProducts = useCallback(async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page: targetPage, pageSize };
      if (activeStatus) params.status = apiStatus(activeStatus);
      if (categoryId) params.categoryId = categoryId;
      if (keyword) params.keyword = keyword;
      const response = await productApi.getList(params);
      const data = unwrapResponse<{ list: Product[]; total: number }>(response);
      setProducts(data?.list || []);
      setTotal(data?.total || 0);
    } catch (requestError: any) {
      setError(requestError?.message || "商品数据加载失败，请检查服务后重试。");
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeStatus, categoryId, keyword, page, pageSize]);

  useEffect(() => {
    void loadCategories();
    void loadCounts();
  }, [loadCategories, loadCounts]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const resetFilters = () => {
    setTitleKeyword("");
    setCodeKeyword("");
    setCategoryId(undefined);
    setActiveStatus(undefined);
    setPage(1);
  };

  const search = () => {
    setPage(1);
    void loadProducts(1);
  };

  const debounceSearch = (nextValue: string, setter: (value: string) => void) => {
    setter(nextValue);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
    }, 450);
  };

  const changeStatus = async (id: number, status: ProductStatus) => {
    try {
      await productApi.updateStatus(id, status);
      message.success(status === "PUBLISHED" ? "商品已上架" : status === "OFFLINE" ? "商品已移入仓库" : "商品状态已更新");
      await Promise.all([loadProducts(), loadCounts()]);
    } catch (requestError: any) {
      message.error(requestError?.message || "状态更新失败");
    }
  };

  const deleteProduct = async (product: Product) => {
    try {
      await productApi.delete(product.id);
      message.success(`已将「${product.name}」移入回收站`);
      setSelectedIds((ids) => ids.filter((id) => id !== product.id));
      await Promise.all([loadProducts(products.length === 1 && page > 1 ? page - 1 : page), loadCounts()]);
    } catch (requestError: any) {
      message.error(requestError?.message || "删除失败");
    }
  };

  const changeSelectedStatus = async (status: ProductStatus) => {
    if (!selectedIds.length) return;
    try {
      await Promise.all(selectedIds.map((id) => productApi.updateStatus(Number(id), status)));
      message.success(`已处理 ${selectedIds.length} 件商品`);
      setSelectedIds([]);
      await Promise.all([loadProducts(), loadCounts()]);
    } catch (requestError: any) {
      message.error(requestError?.message || "批量操作失败，请稍后重试");
    }
  };

  const loadImages = async (productId: number) => {
    try {
      const response = await productApi.getById(productId);
      setProductImages(unwrapResponse<Product>(response)?.images || []);
    } catch {
      setProductImages([]);
    }
  };

  const openCreate = () => {
    navigate("/admin/products/new");
    return;
    setEditing(null);
    setEditorTab("description");
    setProductImages([]);
    form.resetFields();
    form.setFieldsValue({
      code: makeCode(),
      materialType: "GOLD_999",
      goldWeight: 0,
      weight: 0,
      price: 0,
      craftFee: 0,
      sortOrder: 0,
      salesMode: "DISPLAY_ONLY",
      status: "DRAFT",
      shippingTime: "48小时内发货",
      isHot: false,
      isNew: false,
      isRecommended: false,
      isLimited: false,
      isCustom: false,
    });
    setEditorOpen(true);
  };

  const openEdit = (product: Product) => {
    navigate(`/admin/products/${product.id}/edit`);
    return;
    setEditing(product);
    setEditorTab("description");
    setProductImages(product.images || []);
    form.resetFields();
    form.setFieldsValue({
      code: product.code,
      name: product.name,
      categoryId: product.categoryId,
      materialType: product.materialType,
      goldWeight: product.goldWeight,
      weight: product.weight,
      price: product.price,
      craftFee: product.craftFee,
      sortOrder: product.sortOrder || 0,
      size: product.size,
      description: product.description,
      shortDescription: product.shortDescription,
      salesMode: product.salesMode || "DISPLAY_ONLY",
      status: product.status,
      isHot: product.isHot,
      isNew: product.isNew,
      isRecommended: product.isRecommended,
      isLimited: product.isLimited,
      isCustom: product.isCustom,
      shippingTime: "48小时内发货",
      logisticsEnabled: true,
    });
    setEditorOpen(true);
    void loadImages(product.id);
  };

  const saveProduct = async () => {
    const values = await form.validateFields(["name", "code", "categoryId"]);
    setSaving(true);
    try {
      const payload = {
        name: values.name,
        categoryId: values.categoryId,
        materialType: values.materialType,
        shortDescription: values.shortDescription || "",
        description: values.description || "",
        goldWeight: values.goldWeight ?? 0,
        weight: values.weight ?? 0,
        size: values.size || "",
        price: values.price ?? 0,
        craftFee: values.craftFee ?? 0,
        sortOrder: values.sortOrder ?? 0,
        salesMode: values.salesMode || "DISPLAY_ONLY",
        status: values.status || "DRAFT",
        isHot: values.isHot ?? false,
        isNew: values.isNew ?? false,
        isRecommended: values.isRecommended ?? false,
        isLimited: values.isLimited ?? false,
        isCustom: values.isCustom ?? false,
      };
      if (editing) {
        await productApi.update(editing.id, payload);
        message.success("商品已更新");
      } else {
        const response = await productApi.create({ ...payload, code: values.code });
        const created = unwrapResponse<Product>(response);
        setEditing(created);
        if (created?.id) await loadImages(created.id);
        message.success("商品已创建，现在可以上传商品图片");
      }
      await Promise.all([loadProducts(), loadCounts()]);
    } catch (requestError: any) {
      message.error(requestError?.message || "保存失败，请检查必填信息");
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!editing?.id) {
      message.warning("请先保存基础信息后再上传图片");
      return Upload.LIST_IGNORE;
    }
    setUploading(true);
    try {
      const uploaded = unwrapResponse<{ url: string }>(await uploadApi.uploadImage(file));
      await productApi.addImage(editing.id, { url: uploaded.url, sortOrder: productImages.length });
      await loadImages(editing.id);
      message.success("图片已上传");
    } catch {
      message.error("图片上传失败");
    } finally {
      setUploading(false);
    }
    return Upload.LIST_IGNORE;
  };

  const setCover = async (imageId: number) => {
    if (!editing?.id) return;
    await productApi.setCoverImage(editing.id, imageId);
    await loadImages(editing.id);
  };

  const removeImage = async (imageId: number) => {
    if (!editing?.id) return;
    await productApi.deleteImage(editing.id, imageId);
    await loadImages(editing.id);
  };

  const columns = useMemo(() => [
    {
      title: "商品名称",
      key: "product",
      width: 380,
      render: (_: unknown, product: Product) => {
        const image = getThumbnailImage(product as any);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src={image || productPlaceholder(product.id, product.name)}
              alt=""
              style={{ width: 58, height: 58, borderRadius: 4, objectFit: "cover", background: "#f5f5f5" }}
              onError={(event) => { event.currentTarget.src = productPlaceholder(product.id, product.name); }}
            />
            <div style={{ minWidth: 0 }}>
              <button type="button" onClick={() => openEdit(product)} style={{ border: 0, padding: 0, background: "transparent", color: "#262626", fontWeight: 500, textAlign: "left", cursor: "pointer" }}>
                {product.name}
              </button>
              <div style={{ marginTop: 5, color: "#8c8c8c", fontSize: 12 }}>货号：{product.code}</div>
              <div style={{ marginTop: 3, color: "#8c8c8c", fontSize: 12 }}>{product.category?.name || "未分类"} · {getMaterialLabel(product.materialType)}</div>
            </div>
          </div>
        );
      },
    },
    { title: "价格", key: "price", width: 135, render: (_: unknown, product: Product) => <span style={{ color: product.price ? "#c2410c" : "#8c8c8c" }}>{formatPrice(product.price)}</span> },
    { title: "库存", key: "stock", width: 100, render: () => "—" },
    { title: "累计销量", key: "sales", width: 120, render: (_: unknown, product: Product) => product.salesCount || 0 },
    { title: "浏览量", key: "views", width: 105, render: (_: unknown, product: Product) => product.viewCount || 0 },
    { title: "创建时间", key: "created", width: 175, render: (_: unknown, product: Product) => formatDate(product.createdAt) },
    { title: "状态", key: "status", width: 105, render: (_: unknown, product: Product) => { const meta = getStatusMeta(product.status); return <Tag color={meta.color}>{meta.label}</Tag>; } },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      width: 170,
      render: (_: unknown, product: Product) => (
        <Space size={10} wrap>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openEdit(product)}>编辑商品</Button>
          {!isPublished(product.status) && product.status !== "ARCHIVED" ? (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void changeStatus(product.id, "PUBLISHED")}>上架</Button>
          ) : isPublished(product.status) ? (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void changeStatus(product.id, "OFFLINE")}>下架</Button>
          ) : null}
          <Dropdown menu={{ items: [{ key: "archive", label: <span onClick={() => void changeStatus(product.id, "ARCHIVED")}>移入回收站</span> }, { key: "delete", danger: true, label: <span onClick={() => void deleteProduct(product)}>删除</span> }] }}>
            <Button type="link" size="small" style={{ padding: 0 }}>更多 <DownOutlined /></Button>
          </Dropdown>
        </Space>
      ),
    },
  ], [openEdit, products, page]);

  const tabs = [
    { key: "all", label: `全部 (${counts.all ?? total})` },
    ...statuses.map((status) => ({ key: status, label: `${statusMeta[status].label} (${counts[status] ?? 0})` })),
  ];

  return (
    <div style={{ padding: "18px 26px 48px", maxWidth: 1800 }}>
      <div style={{ display: "flex", gap: 28, height: 45, alignItems: "flex-start", borderBottom: "1px solid #e8e8e8", marginBottom: 20 }}>
        {tabs.map((tab) => {
          const selected = (activeStatus || "all") === tab.key;
          return <button key={tab.key} type="button" onClick={() => { setActiveStatus(tab.key === "all" ? undefined : tab.key as ProductStatus); setPage(1); }} style={{ height: 45, padding: "0 2px", border: 0, borderBottom: selected ? "2px solid #1677ff" : "2px solid transparent", background: "transparent", color: selected ? "#1677ff" : "#595959", cursor: "pointer", fontSize: 14 }}>{tab.label}</button>;
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr) minmax(160px, 1fr) minmax(180px, 1fr) auto auto", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <Input placeholder="商品标题" value={titleKeyword} allowClear onChange={(event) => debounceSearch(event.target.value, setTitleKeyword)} onPressEnter={search} />
        <Input placeholder="商品ID、货号" value={codeKeyword} allowClear onChange={(event) => debounceSearch(event.target.value, setCodeKeyword)} onPressEnter={search} />
        <Input placeholder="商家编码" disabled />
        <Select placeholder="店铺分类" value={categoryId} onChange={(value) => { setCategoryId(value); setPage(1); }} allowClear showSearch optionFilterProp="label" options={categoryOptions} />
        <Button type="primary" onClick={search}>搜索</Button>
        <Button onClick={resetFilters}>重置</Button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <Space wrap>
          <ScifiButton variant="gold" onClick={openCreate}><PlusOutlined /> 新增商品</ScifiButton>
          <Button icon={<PictureOutlined />} disabled={!selectedIds.length}>商品装修</Button>
          <Button disabled={!selectedIds.length}>SKU 管理</Button>
          <Button disabled={!selectedIds.length} onClick={() => void changeSelectedStatus("OFFLINE")}>批量下架</Button>
          <Dropdown menu={{ items: [{ key: "published", label: "批量上架", onClick: () => void changeSelectedStatus("PUBLISHED") }, { key: "archived", label: "移入回收站", danger: true, onClick: () => void changeSelectedStatus("ARCHIVED") }] }}>
            <Button disabled={!selectedIds.length}>更多批量操作 <DownOutlined /></Button>
          </Dropdown>
          {selectedIds.length > 0 && <span style={{ color: "#595959", fontSize: 13 }}>已选 {selectedIds.length} 件</span>}
        </Space>
        <span style={{ color: "#595959", fontSize: 13 }}>共 {total} 件商品</span>
      </div>

      {error ? (
        <Result status="error" title="商品加载失败" subTitle={error} extra={<Button icon={<ReloadOutlined />} onClick={() => void loadProducts()}>重新加载</Button>} />
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={products}
          columns={columns}
          pagination={false}
          scroll={{ x: 1300 }}
          rowSelection={{ selectedRowKeys: selectedIds, onChange: setSelectedIds }}
          locale={{ emptyText: hasFilters ? "没有符合当前筛选条件的商品" : "暂无商品，点击“新增商品”开始添加" }}
          style={{ background: "#fff" }}
        />
      )}

      {!error && total > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 18 }}>
          <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger showQuickJumper showTotal={(value) => `共 ${value} 件商品`} onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); }} />
        </div>
      )}

      <Modal
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        footer={null}
        width={1120}
        centered
        styles={{ body: { maxHeight: "78vh", overflowY: "auto", padding: 0 } }}
        title={editing ? `编辑商品 · ${editing.name}` : "新增商品"}
      >
        <Form form={form} layout="vertical" style={{ padding: "0 26px 24px" }}>
          <Tabs activeKey={editorTab} onChange={setEditorTab} items={[
            { key: "description", label: "图文描述", children: (
              <div style={{ padding: "14px 0" }}>
                <h3 style={{ margin: "0 0 18px", fontSize: 16 }}>商品图文</h3>
                <Alert type="info" showIcon message="主图建议使用 1:1 图片，第一张图片会作为商品封面。" style={{ marginBottom: 18 }} />
                <Upload accept="image/*" showUploadList={false} beforeUpload={uploadImage as any} disabled={!editing?.id}>
                  <Button icon={<UploadOutlined />} loading={uploading}>上传商品图片</Button>
                </Upload>
                {!editing?.id && <div style={{ color: "#8c8c8c", fontSize: 12, marginTop: 8 }}>请先完成基础信息并保存，系统生成商品后即可上传图片。</div>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 12, marginTop: 18 }}>
                  {productImages.map((image) => (
                    <div key={image.id} style={{ border: image.type === "FRONT" ? "2px solid #1677ff" : "1px solid #e8e8e8", borderRadius: 6, overflow: "hidden" }}>
                      <img src={image.url} alt="商品图片" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                      <div style={{ padding: 7, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <Button size="small" type="link" onClick={() => void setCover(image.id)}>{image.type === "FRONT" ? "主图" : "设为主图"}</Button>
                        <Popconfirm title="确定删除此图片？" onConfirm={() => void removeImage(image.id)}><Button size="small" type="link" danger>删除</Button></Popconfirm>
                      </div>
                    </div>
                  ))}
                </div>
                {editing?.id && productImages.length === 0 && <div style={{ padding: "36px 0", textAlign: "center", color: "#8c8c8c" }}>尚未上传商品图片</div>}
                <Form.Item name="description" label="商品详情描述" style={{ marginTop: 24 }}>
                  <TextArea rows={6} placeholder="介绍商品的工艺、材质、寓意和佩戴建议" maxLength={5000} showCount />
                </Form.Item>
              </div>
            ) },
            { key: "basic", label: "基础信息", children: (
              <div style={{ padding: "14px 0" }}>
                <h3 style={{ margin: "0 0 18px", fontSize: 16 }}>基础信息</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                  <Form.Item name="name" label="商品标题" rules={[{ required: true, whitespace: true, message: "请输入商品标题" }]}><Input maxLength={200} showCount placeholder="例如：足金古法平安扣吊坠" /></Form.Item>
                  <Form.Item name="code" label="商家编码 / 货号" rules={[{ required: true, whitespace: true, message: "请输入货号" }]}><Input disabled={Boolean(editing)} maxLength={50} /></Form.Item>
                  <Form.Item name="categoryId" label="商品类目" rules={[{ required: true, message: "请选择商品类目" }]}><Select showSearch optionFilterProp="label" options={categoryOptions} placeholder="选择三级商品类目" /></Form.Item>
                  <Form.Item name="materialType" label="材质"><Select options={materials.map((material) => ({ value: material, label: getMaterialLabel(material) }))} /></Form.Item>
                  <Form.Item name="shortDescription" label="导购标题 / 一句话卖点"><Input maxLength={500} showCount placeholder="例如：古法鎏金，寓意平安圆满" /></Form.Item>
                  <Form.Item name="size" label="尺寸规格"><Input placeholder="例如：直径 23mm / 圈口 14" /></Form.Item>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 16px" }}>
                  <Form.Item name="goldWeight" label="金重（g）"><InputNumber min={0} step={0.01} style={{ width: "100%" }} /></Form.Item>
                  <Form.Item name="weight" label="总重量（g）"><InputNumber min={0} step={0.01} style={{ width: "100%" }} /></Form.Item>
                  <Form.Item name="sortOrder" label="排序权重"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
                </div>
              </div>
            ) },
            { key: "sales", label: "销售信息", children: (
              <div style={{ padding: "14px 0" }}>
                <h3 style={{ margin: "0 0 18px", fontSize: 16 }}>销售信息</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 16px" }}>
                  <Form.Item name="price" label="一口价（元）"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item>
                  <Form.Item name="craftFee" label="工费（元）"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item>
                  <Form.Item name="status" label="上架状态"><Select options={statuses.map((status) => ({ value: status, label: statusMeta[status].label }))} /></Form.Item>
                </div>
                <Form.Item name="salesMode" label="销售方式"><Radio.Group options={[{ value: "DISPLAY_ONLY", label: "仅展示" }, { value: "SELECTION", label: "选款咨询" }, { value: "APPOINTMENT", label: "预约到店" }, { value: "CUSTOM_INQUIRY", label: "定制咨询" }]} /></Form.Item>
                <div style={{ padding: "16px", background: "#fafafa", borderRadius: 6 }}>
                  <div style={{ fontWeight: 500, marginBottom: 12 }}>商品标签</div>
                  <Space size="large" wrap>
                    <Form.Item name="isHot" valuePropName="checked" noStyle><Checkbox>热卖</Checkbox></Form.Item>
                    <Form.Item name="isNew" valuePropName="checked" noStyle><Checkbox>新品</Checkbox></Form.Item>
                    <Form.Item name="isRecommended" valuePropName="checked" noStyle><Checkbox>推荐</Checkbox></Form.Item>
                    <Form.Item name="isLimited" valuePropName="checked" noStyle><Checkbox>限量</Checkbox></Form.Item>
                    <Form.Item name="isCustom" valuePropName="checked" noStyle><Checkbox>支持定制</Checkbox></Form.Item>
                  </Space>
                </div>
              </div>
            ) },
            { key: "logistics", label: "物流服务", children: (
              <div style={{ padding: "14px 0" }}>
                <h3 style={{ margin: "0 0 18px", fontSize: 16 }}>物流服务</h3>
                <Alert type="info" showIcon message="物流规则当前由店铺统一配置；本页展示商品适用规则，不会新增数据库字段。" style={{ marginBottom: 20 }} />
                <Form.Item name="shippingTime" label="发货时效"><Radio.Group options={["24小时内发货", "48小时内发货", "72小时内发货"].map((value) => ({ value, label: value }))} /></Form.Item>
                <Form.Item name="logisticsEnabled" label="提取方式" valuePropName="checked"><Switch checkedChildren="使用物流配送" unCheckedChildren="到店自提" /></Form.Item>
                <div style={{ padding: 16, background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 6, color: "#595959", lineHeight: 1.8 }}>
                  <div><strong>运费模板：</strong>使用店铺默认模板</div>
                  <div><strong>售后服务：</strong>珠宝类商品支持到店验货与售后咨询</div>
                  <div><strong>区域限售：</strong>跟随店铺统一配送范围</div>
                </div>
              </div>
            ) },
          ]} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #f0f0f0", paddingTop: 18 }}>
            <Button onClick={() => setEditorOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void saveProduct()}>保存商品信息</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
