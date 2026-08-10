import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Upload,
  message,
  Result,
} from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { categoryApi, productApi, uploadApi } from "@/services/api";
import { getMaterialLabel } from "@/utils/material";
import type { Category, Product, ProductImage, ProductStatus, Certificate, ProductSKU } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import ScifiButton from "@/components/ui/ScifiButton";
import { formatPrice } from "@/utils/format";

const { TextArea } = Input;

const materials = [
  "GOLD_999", "GOLD_9999", "AU750", "PT950", "S925",
  "DIAMOND", "JADE", "PEARL", "COLOR_GEM", "OTHER",
];
const statuses: ProductStatus[] = ["PUBLISHED", "OFFLINE", "DRAFT", "ARCHIVED"];
const statusMeta: Record<ProductStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  PUBLISHED: { label: "出售中", color: "green" },
  OFFLINE: { label: "仓库中", color: "gold" },
  ARCHIVED: { label: "回收站", color: "default" },
};

function generateCode() {
  return `HC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/* ═══════════════════════════════════════════════
   共享子组件
   ═══════════════════════════════════════════════ */

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
      <h2 style={{
        margin: 0, fontSize: 16, fontWeight: 600, color: "#1a1a1a",
        letterSpacing: "0.02em",
        fontFamily: `"Cormorant Garamond", "Noto Serif SC", serif`,
        borderLeft: "3px solid #b8944e", paddingLeft: 12,
      }}>
        {title}
      </h2>
      {hint && <span style={{ color: "#96918a", fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

function SubSectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      borderLeft: "3px solid #b8944e", paddingLeft: 10,
      fontSize: 13, fontWeight: 600, color: "#5e5a54",
      marginBottom: 14, marginTop: 22,
    }}>
      {title}
    </div>
  );
}

function CollapseHeader({
  expanded,
  onToggle,
  title,
  hint,
}: {
  expanded: boolean;
  onToggle: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 0", cursor: "pointer",
        userSelect: "none", color: "#5e5a54",
        fontSize: 13, fontWeight: 600,
        transition: "color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#1a1a1a"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#5e5a54"; }}
    >
      {expanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
      {title}
      {hint && <span style={{ fontWeight: 400, color: "#96918a", fontSize: 11 }}>{hint}</span>}
    </div>
  );
}

function UploadCell({
  image,
  label,
  onUpload,
  onSetCover,
  onRemove,
  disabled,
  uploading,
  multiple,
}: {
  image?: ProductImage;
  label: string;
  onUpload: (file: File) => Promise<boolean>;
  onSetCover?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  uploading?: boolean;
  multiple?: boolean;
}) {
  return (
    <div style={{ width: 96 }}>
      <Upload accept="image/*" showUploadList={false} beforeUpload={onUpload as any} disabled={disabled || uploading} multiple={multiple}>
        <div
          style={{
            position: "relative",
            aspectRatio: "1 / 1",
            border: image ? "1px solid #d9d9d9" : "1px dashed #cfd6df",
            borderRadius: 6, overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#fff",
            cursor: disabled || uploading ? "not-allowed" : "pointer",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!disabled && !uploading) {
              (e.currentTarget as HTMLElement).style.borderColor = "#b8944e";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px rgba(184,148,78,0.15)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = image ? "#d9d9d9" : "#cfd6df";
            (e.currentTarget as HTMLElement).style.boxShadow = "none";
          }}
        >
          {image ? (
            <img src={image.url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <Space direction="vertical" size={3} align="center" style={{ color: "#8c8c8c", fontSize: 12 }}>
              <PictureOutlined style={{ fontSize: 18 }} />
              <span>上传</span>
            </Space>
          )}
          {uploading && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(255,255,255,0.65)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Spin size="small" />
            </div>
          )}
        </div>
      </Upload>
      {image && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 12 }}>
          {onSetCover ? (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={onSetCover}>设为主图</Button>
          ) : (
            <span style={{ color: "#b8944e" }}>封面</span>
          )}
          {onRemove && (
            <Popconfirm title="确定删除？" onConfirm={onRemove}>
              <Button type="link" size="small" danger style={{ padding: 0 }} icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   主组件
   ═══════════════════════════════════════════════ */

export default function ProductEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editingId = id ? Number(id) : undefined;
  const isCreating = !editingId;
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(!isCreating);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [skus, setSkus] = useState<ProductSKU[]>([]);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<ProductSKU | null>(null);
  const [skuForm] = Form.useForm();
  const [skuSaving, setSkuSaving] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<{ value: number; label: string }[]>([]);
  const [gemExpanded, setGemExpanded] = useState(false);
  const [certExpanded, setCertExpanded] = useState(false);

  const certDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /* 导航联动 */
  const [activeSection, setActiveSection] = useState("media");
  const navItems = [
    { hash: "media", label: "商品素材" },
    { hash: "basic", label: "基本信息" },
    { hash: "pricing", label: "价格规格" },
    { hash: "publish", label: "上架设置" },
  ];

  useEffect(() => {
    const ids = navItems.map((n) => n.hash);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  /* Ctrl+S / Ctrl+Shift+S 快捷键 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!saving) {
          if (e.shiftKey) { void save(true); }
          else { void save(); }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving]);

  /* 未保存离开提醒 */
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* certDebounceRef 卸载清理 */
  useEffect(() => {
    const ref = certDebounceRef.current;
    return () => { ref.forEach((t) => clearTimeout(t)); ref.clear(); };
  }, []);

  /* 新商品：进入后显示空表单，点「提交/草稿」显式创建；子资源（图片/SKU/证书）在创建成功后开放 */

  const mainImages = useMemo(() => images.filter((i) => !i.isVideo).slice(0, 5), [images]);
  const videoImages = useMemo(() => images.filter((i) => i.isVideo), [images]);

  /* ═══ 数据加载 ═══ */

  const loadCategories = useCallback(async () => {
    try {
      const result = await categoryApi.getTree();
      const options: { value: number; label: string }[] = [];
      const walk = (nodes: Category[], prefix = "") =>
        nodes.forEach((node) => {
          const label = prefix ? `${prefix} / ${node.name}` : node.name;
          options.push({ value: node.id, label });
          if (node.children?.length) walk(node.children, label);
        });
      walk(unwrapResponse<Category[]>(result) || []);
      setCategoryOptions(options);
    } catch {
      setCategoryOptions([]);
    }
  }, []);

  const fillProduct = useCallback((item: Product) => {
    form.setFieldsValue({
      code: item.code,
      name: item.name,
      categoryId: item.categoryId,
      materialType: item.materialType,
      shortDescription: item.shortDescription,
      description: item.description,
      goldWeight: item.goldWeight,
      weight: item.weight,
      size: item.size,
      price: item.price,
      craftFee: item.craftFee,
      sortOrder: item.sortOrder || 0,
      salesMode: item.salesMode || "DISPLAY_ONLY",
      status: item.status,
      isHot: item.isHot,
      isNew: item.isNew,
      isRecommended: item.isRecommended,
      isLimited: item.isLimited,
      isCustom: item.isCustom,
      multiDiscount: item.multiDiscount ?? false,
      gemInfo_type: (item.gemInfo as any)?.type,
      gemInfo_carat: (item.gemInfo as any)?.carat,
      gemInfo_clarity: (item.gemInfo as any)?.clarity,
      gemInfo_color: (item.gemInfo as any)?.color,
      gemInfo_cut: (item.gemInfo as any)?.cut,
      gemInfo_quantity: (item.gemInfo as any)?.quantity,
      craftTechnique: item.craftTechnique || [],
    });
  }, [form]);

  const loadProduct = useCallback(async (productId: number) => {
    setLoading(true); setLoadError(null);
    try {
      const result = await productApi.getById(productId);
      const item = unwrapResponse<Product>(result);
      if (!item) throw new Error("商品不存在");
      setProduct(item);
      setImages(item.images || []);
      setTags((item.tags || []).map((t) => t.tagName));
      setCertificates(item.certificates || []);
      setSkus(item.skus || []);
      fillProduct(item);
    } catch (error: any) {
      setLoadError(error?.message || "商品加载失败");
    } finally { setLoading(false); }
  }, [fillProduct]);

  useEffect(() => {
    void loadCategories();
    if (editingId) {
      void loadProduct(editingId);
    } else {
      form.setFieldsValue({
        name: "", code: generateCode(), materialType: "GOLD_999",
        shortDescription: "", description: "", size: "",
        goldWeight: 0, weight: 0, price: 0, craftFee: 0, sortOrder: 0,
        salesMode: "DISPLAY_ONLY", status: "DRAFT",
        isHot: false, isNew: false, isRecommended: false, isLimited: false, isCustom: false,
        multiDiscount: false, craftTechnique: [],
      });
    }
  }, [editingId, form, loadCategories, loadProduct]);

  const refreshImages = async (productId: number) => {
    try {
      const result = await productApi.getById(productId);
      const item = unwrapResponse<Product>(result);
      setProduct(item); setImages(item?.images || []);
    } catch (error: any) {
      console.error("刷新图片列表失败:", error);
    }
  };

  /* ═══ 保存 ═══ */

  const save = async (asDraft = false) => {
    // 验证必填字段
    await form.validateFields(
      asDraft
        ? ["name", "code", "categoryId", "materialType"]
        : ["name", "code", "categoryId", "materialType", "price"],
    );
    // 关键：validateFields 只返回命名字段，必须用 getFieldsValue 获取全部表单值
    const values = form.getFieldsValue();
    setSaving(true);
    try {
      const payload = {
        name: values.name, categoryId: values.categoryId, materialType: values.materialType,
        shortDescription: values.shortDescription || "", description: values.description || "",
        goldWeight: values.goldWeight ?? 0, weight: values.weight ?? 0, size: values.size || "",
        price: values.price ?? 0, craftFee: values.craftFee ?? 0,
        sortOrder: values.sortOrder ?? 0,
        salesMode: values.salesMode || "DISPLAY_ONLY",
        status: asDraft ? "DRAFT" : values.status || "DRAFT",
        isHot: values.isHot ?? false, isNew: values.isNew ?? false,
        isRecommended: values.isRecommended ?? false, isLimited: values.isLimited ?? false,
        isCustom: values.isCustom ?? false, multiDiscount: values.multiDiscount ?? false,
        gemInfo:
          values.gemInfo_type || values.gemInfo_carat || values.gemInfo_clarity ||
          values.gemInfo_color || values.gemInfo_cut || values.gemInfo_quantity
            ? { type: values.gemInfo_type, carat: values.gemInfo_carat, clarity: values.gemInfo_clarity, color: values.gemInfo_color, cut: values.gemInfo_cut, quantity: values.gemInfo_quantity }
            : null,
        craftTechnique: values.craftTechnique || [],
      };
      if (editingId) {
        await productApi.update(editingId, payload);
        try {
          await productApi.updateTags(editingId, tags);
        } catch (tagError: any) {
          console.error("标签保存失败:", tagError);
          message.error("商品资料已保存，但标签保存失败，请在「上架设置」重新设置后再次保存");
        }
        await loadProduct(editingId);
        message.success(asDraft ? "草稿已保存" : "商品基础资料已保存");
        setIsDirty(false);
      } else {
        const result = await productApi.create({ ...payload, code: values.code });
        const created = unwrapResponse<Product>(result);
        try {
          if (tags.length > 0) {
            await productApi.updateTags(created.id, tags);
          }
        } catch (tagError: any) {
          console.error("标签保存失败:", tagError);
          message.error("商品已创建，但标签保存失败，请在「上架设置」重新设置后再次保存");
        }
        message.success(asDraft ? "草稿已创建" : "商品已创建");
        setIsDirty(false);
        navigate(`/admin/products/${created.id}/edit`, { replace: true });
      }
    } catch (error: any) {
      console.error("保存失败:", error);
      message.error(error?.message || "保存失败");
    } finally { setSaving(false); }
  };

  /* ═══ 图片 & 视频上传 ═══ */

  const uploadImage = async (file: File, imageType = "SIDE", isVideo = false, slotKey?: string) => {
    if (!editingId) {
      message.warning("请先填写必填信息并保存商品，即可上传图片");
      return false;
    }
    const key = slotKey || `${file.name}-${file.size}`;
    setUploading(prev => new Set(prev).add(key));
    try {
      const uploadFn = isVideo ? uploadApi.uploadVideo : uploadApi.uploadImage;
      const uploaded = unwrapResponse<{ url: string }>(await uploadFn(file));
      const sortOrder = imageType === "FRONT" ? 0 : images.length;
      await productApi.addImage(editingId, { url: uploaded.url, sortOrder, type: imageType, isVideo });
      await refreshImages(editingId);
      message.success(isVideo ? "视频已上传" : "图片已上传");
    } catch (error: any) {
      console.error("上传失败:", error);
      message.error(error?.message || "上传失败，请检查网络或文件格式");
    } finally {
      setUploading(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
    return false;
  };

  const setCover = async (imageId: number) => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    try {
      await productApi.setCoverImage(editingId, imageId);
      await refreshImages(editingId);
      message.success("已设为封面");
    } catch (error: any) {
      console.error("设置封面失败:", error);
      message.error(error?.message || "设置封面失败");
    }
  };

  const removeImage = async (imageId: number) => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    try {
      await productApi.deleteImage(editingId, imageId);
      await refreshImages(editingId);
      message.success("图片已删除");
    } catch (error: any) {
      console.error("删除图片失败:", error);
      message.error(error?.message || "删除图片失败");
    }
  };

  /* ═══ 证书操作（debounced） ═══ */

  const refreshCertificates = async () => {
    if (!editingId) { console.warn("refreshCertificates: editingId 未就绪"); return; }
    try {
      const result = await productApi.getById(editingId);
      setCertificates(unwrapResponse<Product>(result)?.certificates || []);
    } catch (error: any) {
      console.error("刷新证书列表失败:", error);
    }
  };

  const addCert = async () => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    try {
      await productApi.addCertificate(editingId, { certType: "NATIONAL", certNumber: "" });
      message.success("证书已添加");
      await refreshCertificates();
      setCertExpanded(true);
    } catch (error: any) {
      console.error("添加证书失败:", error);
      message.error(error?.message || "添加证书失败");
    }
  };

  const updateCertDebounced = (certId: number, field: string, value: any) => {
    // 乐观更新本地 state
    setCertificates((prev) =>
      prev.map((c) => (c.id === certId ? { ...c, [field]: value } : c)),
    );
    // debounce API 调用
    const key = `${certId}-${field}`;
    const existing = certDebounceRef.current.get(key);
    if (existing) clearTimeout(existing);
    certDebounceRef.current.set(key, setTimeout(async () => {
      if (!editingId) { console.warn("updateCertDebounced: editingId 未就绪"); return; }
      try { await productApi.updateCertificate(editingId, certId, { [field]: value }); }
      catch (error: any) {
        console.error("更新证书失败:", error);
        message.error(error?.message || "更新证书失败");
      }
    }, 300));
  };

  const uploadCertImage = async (certId: number, file: File) => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return false; }
    try {
      const result = await uploadApi.uploadImage(file);
      const url = unwrapResponse<{ url: string }>(result).url;
      await productApi.updateCertificate(editingId, certId, { certImage: url });
      setCertificates((prev) => prev.map((c) => (c.id === certId ? { ...c, certImage: url } : c)));
      message.success("证书图片已上传");
    } catch (error: any) {
      console.error("证书图片上传失败:", error);
      message.error(error?.message || "证书图片上传失败");
    }
    return false;
  };

  const deleteCert = async (certId: number) => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    // 清理该证书未发出的 debounce 更新，避免删除后回调命中已删 certId 触发 404
    certDebounceRef.current.forEach((timer, key) => {
      if (key.startsWith(`${certId}-`)) {
        clearTimeout(timer);
        certDebounceRef.current.delete(key);
      }
    });
    try {
      await productApi.deleteCertificate(editingId, certId);
      message.success("证书已删除");
      await refreshCertificates();
    } catch (error: any) {
      console.error("删除证书失败:", error);
      message.error(error?.message || "删除证书失败");
    }
  };

  /* ═══ SKU 操作 ═══ */

  const refreshSkus = async () => {
    if (!editingId) { console.warn("refreshSkus: editingId 未就绪"); return; }
    try {
      const result = await productApi.getById(editingId);
      setSkus(unwrapResponse<Product>(result)?.skus || []);
    } catch (error: any) {
      console.error("刷新 SKU 列表失败:", error);
    }
  };

  const openSkuModal = (sku?: ProductSKU) => {
    if (!editingId) { message.warning("请先保存商品基础信息，再管理 SKU"); return; }
    setEditingSku(sku || null);
    if (sku) {
      skuForm.setFieldsValue({
        skuCode: sku.skuCode, material: sku.material, size: sku.size,
        goldWeight: sku.goldWeight, price: sku.price,
        stock: sku.stock, safetyStock: sku.safetyStock, isActive: sku.isActive,
      });
    } else {
      skuForm.resetFields();
      skuForm.setFieldsValue({ material: "GOLD_999", price: 0, stock: 0, safetyStock: 5, isActive: true });
    }
    setSkuModalOpen(true);
  };

  const saveSku = async () => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    // 验证必填字段，再用 getFieldsValue 获取全部值
    await skuForm.validateFields(["skuCode", "price"]);
    const values = skuForm.getFieldsValue();
    setSkuSaving(true);
    try {
      if (editingSku) { await productApi.updateSku(editingId, editingSku.id, values); message.success("SKU 已更新"); }
      else { await productApi.createSku(editingId, values); message.success("SKU 已创建"); }
      setSkuModalOpen(false); setEditingSku(null);
      await refreshSkus();
    } catch (error: any) {
      console.error("保存 SKU 失败:", error);
      message.error(error?.message || "保存 SKU 失败");
    }
    finally { setSkuSaving(false); }
  };

  const toggleSkuActive = async (sku: ProductSKU) => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    try {
      await productApi.updateSku(editingId, sku.id, { isActive: !sku.isActive });
      message.success(sku.isActive ? "SKU 已停用" : "SKU 已启用");
      await refreshSkus();
    } catch (error: any) {
      console.error("切换 SKU 状态失败:", error);
      message.error(error?.message || "操作失败");
    }
  };

  const deleteSkuItem = async (skuId: number) => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    try {
      await productApi.deleteSku(editingId, skuId);
      message.success("SKU 已删除");
      await refreshSkus();
    } catch (error: any) {
      console.error("删除 SKU 失败:", error);
      message.error(error?.message || "删除 SKU 失败");
    }
  };

  const goTo = (hash: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${hash}`);
  };

  /* ═══ 加载/错误状态 ═══ */

  if (loading) return (
    <div style={{ padding: 72, textAlign: "center" }}>
      <Spin />
      <div style={{ marginTop: 12, color: "#8c8c8c" }}>正在加载商品</div>
    </div>
  );
  if (loadError) return (
    <Result status="error" title="商品加载失败" subTitle={loadError}
      extra={<Button onClick={() => editingId && void loadProduct(editingId)}>重新加载</Button>} />
  );

  /* ═══ 公共样式 ═══ */

  const sectionStyle: React.CSSProperties = {
    background: "#fff", border: "1px solid #ebe8e3", borderRadius: 8,
    padding: "24px 28px", scrollMarginTop: 80, transition: "box-shadow 0.2s",
  };

  /* ═══════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════ */

  return (
    <div style={{ minHeight: "100%", background: "#faf9f6", paddingBottom: 40 }}>
      {/* ────── Header ────── */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid #ebe8e3" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 20 }}>
          <Space size={10} style={{ flexShrink: 0 }}>
            {isDirty ? (
              <Popconfirm title="有未保存的修改，确定离开？" onConfirm={() => navigate("/admin/products")}>
                <Button type="text" icon={<ArrowLeftOutlined />} />
              </Popconfirm>
            ) : (
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/admin/products")} />
            )}
            <strong style={{
              fontFamily: `"Cormorant Garamond", serif`, fontSize: 17, fontWeight: 600,
              letterSpacing: "0.03em", color: "#1a1a1a", whiteSpace: "nowrap",
            }}>
              {isCreating ? "新增商品" : product?.name || "编辑商品"}
            </strong>
            {product && (
              <Tag color={statusMeta[product.status]?.color} style={{ marginLeft: 4 }}>
                {statusMeta[product.status]?.label}
              </Tag>
            )}
          </Space>

          <nav style={{ flex: 1, display: "flex", gap: 0, height: 56, alignItems: "stretch", justifyContent: "center" }}>
            {navItems.map((item) => {
              const isActive = activeSection === item.hash;
              return (
                <a key={item.hash} href={`#${item.hash}`} onClick={goTo(item.hash)}
                  style={{
                    display: "flex", alignItems: "center", padding: "0 14px", fontSize: 13,
                    fontWeight: isActive ? 600 : 400, color: isActive ? "#b8944e" : "#8c8c8c",
                    textDecoration: "none", borderBottom: `2px solid ${isActive ? "#b8944e" : "transparent"}`,
                    transition: "color 0.2s, border-color 0.2s",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#1a1a1a"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#8c8c8c"; }}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <Space style={{ flexShrink: 0 }}>
            {editingId && <Button href={`/products/${editingId}`} target="_blank" size="small">预览</Button>}
            <Button loading={saving} onClick={() => void save(true)} size="small">草稿</Button>
            <Button type="primary" loading={saving} onClick={() => void save()} size="small">提交</Button>
          </Space>
        </div>
      </header>

      {/* ────── 表单主体 ────── */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 24px" }}>
        <Form form={form} layout="vertical" onValuesChange={() => setIsDirty(true)}>

          {/* ════════════════════════════════════════
             #media — 商品素材
             ════════════════════════════════════════ */}
          <section id="media" style={sectionStyle}>
            <SectionTitle title="商品素材" hint="首张为封面，最多 5 张主图" />

            <SubSectionHeader title="主图" />
            <div style={{ color: "#8c8c8c", fontSize: 12, marginBottom: 12 }}>
              比例为 1:1，建议尺寸 1440×1440 及以上；首张自动作为商品封面。
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 96px)", gap: 12 }}>
              {Array.from({ length: 5 }, (_, i) => {
                const img = mainImages[i];
                // 封面判断：优先使用服务端的 primaryImageId，兼容 mock 的 type==="FRONT"
                const isPrimary = img && (
                  img.id === product?.primaryImageId ||
                  img.type === "FRONT"
                );
                return (
                  <UploadCell
                    key={img?.id || i}
                    image={img}
                    label={`主图 ${i + 1}`}
                    disabled={!editingId || uploading.size > 0}
                    uploading={uploading.has(`slot-${i}`)}
                    multiple
                    onUpload={(file) => uploadImage(file, isPrimary || i === 0 ? "FRONT" : "SIDE", false, `slot-${i}`)}
                    onSetCover={isPrimary ? undefined : img ? () => void setCover(img.id) : undefined}
                    onRemove={img ? () => void removeImage(img.id) : undefined}
                  />
                );
              })}
            </div>

            <SubSectionHeader title="视频（选填）" />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Upload
                accept="video/mp4,video/webm"
                showUploadList={false}
                beforeUpload={(file) => uploadImage(file, "SIDE", true, "video")}
                disabled={!editingId || uploading.size > 0}
              >
                <Button icon={<PlayCircleOutlined />} disabled={!editingId || uploading.size > 0}>
                  上传视频
                </Button>
              </Upload>
              {videoImages.map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <video src={v.url} controls preload="metadata"
                    style={{ width: 200, height: 112, borderRadius: 6, objectFit: "cover" }} />
                  <Popconfirm title="确定删除此视频？" onConfirm={() => removeImage(v.id)}>
                    <Button type="link" danger size="small" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              ))}
            </div>

            <SubSectionHeader title="导购文案" />
            <Form.Item name="shortDescription" label="导购标题" extra="一句话卖点，最多 30 字" style={{ maxWidth: 480 }}>
              <Input maxLength={30} showCount placeholder="例如：古法錾刻足金如意锁" />
            </Form.Item>
            <Form.Item name="description" label="商品描述" style={{ marginBottom: 0 }}>
              <TextArea rows={5} maxLength={5000} showCount placeholder="介绍工艺、材质、寓意和佩戴建议" />
            </Form.Item>
          </section>

          {/* ════════════════════════════════════════
             #basic — 基本信息
             ════════════════════════════════════════ */}
          <section id="basic" style={{ ...sectionStyle, marginTop: 24 }}>
            <SectionTitle title="基本信息" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              <Form.Item name="name" label="宝贝标题"
                rules={[{ required: true, whitespace: true, message: "请输入商品标题" }]}>
                <Input maxLength={60} showCount placeholder="品牌 + 款式 + 风格 + 材质 + 亮点" />
              </Form.Item>
              <Form.Item name="code" label="商家编码"
                rules={[{ required: true, whitespace: true, message: "请输入编码" }]}>
                <Input disabled={!isCreating} maxLength={64} />
              </Form.Item>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 20px" }}>
              <Form.Item name="categoryId" label="商品类目" rules={[{ required: true, message: "请选择" }]}>
                <Select showSearch optionFilterProp="label" options={categoryOptions} placeholder="选择类目" />
              </Form.Item>
              <Form.Item name="materialType" label="材质" rules={[{ required: true, message: "请选择" }]}>
                <Select options={materials.map((m) => ({ value: m, label: getMaterialLabel(m) }))} />
              </Form.Item>
              <Form.Item name="size" label="尺寸规格">
                <Input placeholder="直径 23mm / 圈口 14" />
              </Form.Item>
              <Form.Item name="goldWeight" label="金重（g）">
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="weight" label="总重量（g）">
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="sortOrder" label="排序权重">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </div>

            <SubSectionHeader title="工艺技法" />
            <Form.Item name="craftTechnique" style={{ marginBottom: 0 }}>
              <Select mode="tags" placeholder="输入或选择工艺技法" style={{ maxWidth: 600 }}
                options={["3D硬金","古法金","花丝","錾刻","抛光","喷砂","镶嵌","镂空","浮雕","拉丝","磨砂"]
                  .map((v) => ({ value: v, label: v }))} />
            </Form.Item>

            {/* 宝石信息 — 可折叠 */}
            <div style={{ marginTop: 20, borderTop: "1px solid #ebe8e3", paddingTop: 4 }}>
              <CollapseHeader expanded={gemExpanded} onToggle={() => setGemExpanded(!gemExpanded)}
                title="宝石信息" hint="（钻石/彩宝类商品填写）" />
              {gemExpanded && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 20px", marginTop: 8 }}>
                  <Form.Item name="gemInfo_type" label="宝石种类">
                    <Select allowClear placeholder="选择种类"
                      options={[
                        { value: "diamond", label: "钻石" }, { value: "ruby", label: "红宝石" },
                        { value: "sapphire", label: "蓝宝石" }, { value: "emerald", label: "祖母绿" },
                        { value: "jade", label: "翡翠" }, { value: "pearl", label: "珍珠" },
                        { value: "other", label: "其他" },
                      ]} />
                  </Form.Item>
                  <Form.Item name="gemInfo_carat" label="克拉数">
                    <InputNumber min={0} step={0.01} style={{ width: "100%" }} placeholder="1.00" />
                  </Form.Item>
                  <Form.Item name="gemInfo_clarity" label="净度">
                    <Select allowClear placeholder="选择净度"
                      options={["FL","IF","VVS1","VVS2","VS1","VS2","SI1","SI2"].map((v) => ({ value: v, label: v }))} />
                  </Form.Item>
                  <Form.Item name="gemInfo_color" label="颜色等级">
                    <Select allowClear placeholder="选择颜色"
                      options={["D","E","F","G","H","I","J","K"].map((v) => ({ value: v, label: v }))} />
                  </Form.Item>
                  <Form.Item name="gemInfo_cut" label="切工">
                    <Select allowClear placeholder="选择切工"
                      options={[
                        { value: "EX", label: "EX (极好)" }, { value: "VG", label: "VG (很好)" },
                        { value: "G", label: "G (好)" }, { value: "F", label: "F (一般)" },
                      ]} />
                  </Form.Item>
                  <Form.Item name="gemInfo_quantity" label="数量（粒）">
                    <InputNumber min={0} style={{ width: "100%" }} placeholder="1" />
                  </Form.Item>
                </div>
              )}
            </div>
          </section>

          {/* ════════════════════════════════════════
             #pricing — 价格与规格
             ════════════════════════════════════════ */}
          <section id="pricing" style={{ ...sectionStyle, marginTop: 24 }}>
            <SectionTitle title="价格与规格" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px", marginBottom: 6 }}>
              <Form.Item name="price" label="一口价（元）"
                rules={[{ required: true, message: "请输入价格" }]}>
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="craftFee" label="工费（元）">
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </div>

            <SubSectionHeader title={`SKU 规格（${skus.filter(s => s.isActive).length} 个在用）`} />
            <Table
              rowKey="id" dataSource={skus} pagination={false} size="middle" scroll={{ x: 900 }}
              onRow={(record: ProductSKU) => ({ style: { opacity: record.isActive ? 1 : 0.55 } })}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 SKU，单一规格可直接使用上方一口价" /> }}
              columns={[
                { title: "SKU 编码", dataIndex: "skuCode", width: 140 },
                { title: "材质", dataIndex: "material", width: 90, render: (v: string) => getMaterialLabel(v) },
                { title: "规格", dataIndex: "size", width: 100, render: (v: any) => v || "—" },
                { title: "金重(g)", dataIndex: "goldWeight", width: 90, render: (v: any) => v ?? "—" },
                { title: "价格", dataIndex: "price", width: 110, render: (v: number) => formatPrice(v) },
                { title: "库存", dataIndex: "stock", width: 70,
                  render: (v: number, sku: ProductSKU) => {
                    const isLow = v <= (sku.safetyStock || 5);
                    return <span style={{ color: isLow ? "#cf1322" : undefined, fontWeight: isLow ? 600 : undefined }}>{v}{isLow ? " ⚠" : ""}</span>;
                  } },
                { title: "状态", dataIndex: "isActive", width: 70,
                  render: (v: boolean) => <Tag color={v ? "green" : "default"}>{v ? "启用" : "停用"}</Tag> },
                { title: "操作", width: 170,
                  render: (_: unknown, sku: ProductSKU) => (
                    <Space size={4}>
                      <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openSkuModal(sku)}>编辑</Button>
                      {sku.isActive ? (
                        <Popconfirm title="确定停用该 SKU？" onConfirm={() => void toggleSkuActive(sku)}>
                          <Button type="link" size="small" style={{ padding: 0 }}>停用</Button>
                        </Popconfirm>
                      ) : (
                        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void toggleSkuActive(sku)}>启用</Button>
                      )}
                      <Popconfirm title="彻底删除该 SKU？此操作不可恢复。" onConfirm={() => deleteSkuItem(sku.id)}>
                        <Button type="link" size="small" danger style={{ padding: 0 }}>删除</Button>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <ScifiButton variant="outline" size="sm" onClick={() => openSkuModal()}>
                <PlusOutlined /> 添加 SKU
              </ScifiButton>
            </div>
          </section>

          {/* ════════════════════════════════════════
             #publish — 上架设置
             ════════════════════════════════════════ */}
          <section id="publish" style={{ ...sectionStyle, marginTop: 24 }}>
            <SectionTitle title="上架设置" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              <Form.Item name="status" label="上架状态">
                <Select options={statuses.map((s) => ({ value: s, label: statusMeta[s].label }))} />
              </Form.Item>
              <Form.Item name="salesMode" label="销售方式">
                <Select options={[
                  { value: "DISPLAY_ONLY", label: "仅展示" },
                  { value: "SELECTION", label: "选款咨询" },
                  { value: "APPOINTMENT", label: "预约到店" },
                  { value: "DIRECT_PURCHASE", label: "直接购买" },
                  { value: "CUSTOM_INQUIRY", label: "定制咨询" },
                ]} />
              </Form.Item>
            </div>

            <SubSectionHeader title="商品标识" />
            <Space wrap size={16}>
              <Form.Item name="isHot" valuePropName="checked" noStyle><Checkbox>热卖</Checkbox></Form.Item>
              <Form.Item name="isNew" valuePropName="checked" noStyle><Checkbox>新品</Checkbox></Form.Item>
              <Form.Item name="isRecommended" valuePropName="checked" noStyle><Checkbox>推荐</Checkbox></Form.Item>
              <Form.Item name="isLimited" valuePropName="checked" noStyle><Checkbox>限量</Checkbox></Form.Item>
              <Form.Item name="isCustom" valuePropName="checked" noStyle><Checkbox>支持定制</Checkbox></Form.Item>
            </Space>

            <SubSectionHeader title="商品标签" />
            <Select mode="tags" placeholder="输入或选择标签" value={tags}
              onChange={(values) => { setTags(values as string[]); setIsDirty(true); }}
              style={{ maxWidth: 520 }}
              options={["热卖","新品","推荐","限量","定制","经典","轻奢","送礼"].map((v) => ({ value: v, label: v }))} />

            <div style={{ marginTop: 20, padding: "10px 14px", border: "1px solid #ebe8e3", borderRadius: 6 }}>
              <Space align="start">
                <Form.Item name="multiDiscount" valuePropName="checked" noStyle>
                  <Checkbox disabled>启用多件优惠</Checkbox>
                </Form.Item>
                <span style={{ color: "#8c8c8c", fontSize: 12 }}>功能开发中，暂不可用（计划支持满 2 件起折、5.0–9.9 折阶梯优惠）。</span>
              </Space>
            </div>

            {/* 证书管理 — 可折叠 */}
            <div style={{ marginTop: 20, borderTop: "1px solid #ebe8e3", paddingTop: 4 }}>
              <CollapseHeader expanded={certExpanded} onToggle={() => setCertExpanded(!certExpanded)}
                title="证书管理" hint={certificates.length > 0 ? `（${certificates.length} 份）` : ""} />
              {certExpanded && (
                <>
                  {certificates.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无鉴定证书" />
                  ) : (
                    certificates.map((cert, i) => (
                      <div key={cert.id || i}
                        style={{
                          border: "1px solid #f0f0f0", borderRadius: 8, padding: 14, marginBottom: 10,
                          transition: "border-color 0.2s, box-shadow 0.2s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#d9d0bd"; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 6px rgba(0,0,0,0.04)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#f0f0f0"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <Select value={cert.certType} style={{ width: 160 }}
                            onChange={(value) => updateCertDebounced(cert.id, "certType", value)}
                            options={[
                              { value: "NATIONAL", label: "国检证书" }, { value: "PROVINCIAL", label: "省检证书" },
                              { value: "GIA", label: "GIA 证书" }, { value: "OTHER", label: "其他证书" },
                            ]} />
                          <Popconfirm title="确定删除？" onConfirm={() => deleteCert(cert.id)}>
                            <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
                          </Popconfirm>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                          <Form.Item label="证书编号" style={{ marginBottom: 0 }}>
                            <Input value={cert.certNumber}
                              onChange={(e) => updateCertDebounced(cert.id, "certNumber", e.target.value)}
                              placeholder="证书编号" />
                          </Form.Item>
                          <Form.Item label="有效期" style={{ marginBottom: 0 }}>
                            <Input
                              value={cert.expireDate ? String(cert.expireDate).slice(0, 10) : ""}
                              onChange={(e) => updateCertDebounced(cert.id, "expireDate", e.target.value || null)}
                              type="date" />
                          </Form.Item>
                          <Form.Item label="证书图片" style={{ marginBottom: 0 }}>
                            <Upload accept="image/*" showUploadList={false}
                              beforeUpload={(file) => uploadCertImage(cert.id, file)}>
                              {cert.certImage ? (
                                <img src={cert.certImage} alt="证书" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4, cursor: "pointer" }} />
                              ) : (
                                <Button size="small" icon={<PictureOutlined />}>上传</Button>
                              )}
                            </Upload>
                          </Form.Item>
                        </div>
                      </div>
                    ))
                  )}
                  <ScifiButton variant="outline" size="sm" onClick={addCert}>
                    <PlusOutlined /> 添加证书
                  </ScifiButton>
                </>
              )}
            </div>
          </section>

          {/* ═══ SKU 弹窗 ═══ */}
          <Modal
            title={editingSku ? "编辑 SKU" : "新增 SKU"}
            open={skuModalOpen}
            onCancel={() => { setSkuModalOpen(false); setEditingSku(null); }}
            onOk={saveSku} confirmLoading={skuSaving} destroyOnHidden width={560}
          >
            <Form form={skuForm} layout="vertical">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <Form.Item name="skuCode" label="SKU 编码" rules={[{ required: true, message: "请输入编码" }]}>
                  <Input maxLength={100} placeholder="HC-001-18K" />
                </Form.Item>
                <Form.Item name="material" label="材质">
                  <Select options={materials.map((m) => ({ value: m, label: getMaterialLabel(m) }))} />
                </Form.Item>
                <Form.Item name="size" label="规格"><Input maxLength={50} placeholder="圈口 14" /></Form.Item>
                <Form.Item name="goldWeight" label="金重（g）"><InputNumber min={0} step={0.01} style={{ width: "100%" }} /></Form.Item>
                <Form.Item name="price" label="价格" rules={[{ required: true, message: "请输入价格" }]}>
                  <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item name="stock" label="库存"><InputNumber min={0} step={1} precision={0} style={{ width: "100%" }} /></Form.Item>
                <Form.Item name="safetyStock" label="安全库存"><InputNumber min={0} step={1} precision={0} style={{ width: "100%" }} /></Form.Item>
                <Form.Item name="isActive" label="启用" valuePropName="checked"><Switch /></Form.Item>
              </div>
            </Form>
          </Modal>

        </Form>
      </div>
    </div>
  );
}
