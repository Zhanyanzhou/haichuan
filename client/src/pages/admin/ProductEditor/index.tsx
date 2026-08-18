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
  DeleteOutlined,
  DownOutlined,
  LeftOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { aiClassifyApi, attributeApi, categoryApi, productApi, uploadApi } from "@/services/api";
import { getMaterialLabel } from "@/utils/material";
import type { Category, Product, ProductImage, ProductStatus, Certificate, ProductSKU, MaterialType } from "@/types";
import { SecureImage } from "@/components/common/SecureImage";
import { unwrapResponse } from "@/utils/unwrap";
import ScifiButton from "@/components/ui/ScifiButton";
import { formatPrice } from "@/utils/format";
import "./ProductEditor.css";

const { TextArea } = Input;

const materials = [
  "GOLD_999", "GOLD_9999", "AU750", "PT950", "S925",
  "DIAMOND", "JADE", "PEARL", "COLOR_GEM", "OTHER",
];
const statuses: ProductStatus[] = ["PUBLISHED", "OFFLINE", "DRAFT", "ARCHIVED"];
const statusMeta: Record<ProductStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  PUBLISHED: { label: "出售中", color: "success" },
  OFFLINE: { label: "仓库中", color: "warning" },
  ARCHIVED: { label: "回收站", color: "default" },
};

/** 新建模式下"先传图、后保存"的暂存媒体（未落库，保存商品时一次性关联） */
interface PendingMedia {
  key: string;
  storageKey?: string;
  url?: string;
  type: "FRONT" | "SIDE";
  isVideo: boolean;
  previewUrl: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileSize?: number;
}

/** 新建模式下暂存的 SKU（未落库，保存商品时批量创建） */
interface PendingSku {
  key: string;
  skuCode: string;
  material: MaterialType;
  size?: string;
  goldWeight?: number;
  price: number;
  isActive: boolean;
}

/** SKU 表格行：已落库 SKU 或新建模式暂存 SKU */
type SkuTableRow =
  | (ProductSKU & { key: string; pending: false })
  | (PendingSku & { key: string; pending: true });

/** 新建模式下暂存的证书（未落库，保存商品时批量创建） */
interface PendingCert {
  key: string;
  certType: "NATIONAL" | "PROVINCIAL" | "GIA" | "OTHER";
  certNumber: string;
  certImage?: string;
  expireDate?: string | null;
}

/** 证书列表行：已落库证书或新建模式暂存证书 */
type CertRow =
  | (Certificate & { key: string; pending: false })
  | (PendingCert & { key: string; pending: true });

/* ═══════════════════════════════════════════════
   共享子组件
   ═══════════════════════════════════════════════ */

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="product-editor__section-title">
      <h2>{title}</h2>
      {hint && <span>{hint}</span>}
    </div>
  );
}

function SubSectionHeader({ title }: { title: string }) {
  return (
    <div className="product-editor__subsection-title">{title}</div>
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
        userSelect: "none", color: "var(--adm-text)",
        fontSize: 13, fontWeight: 600,
        transition: "color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--adm-ink)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--adm-text)"; }}
    >
      {expanded ? <DownOutlined style={{ fontSize: 12 }} /> : <RightOutlined style={{ fontSize: 12 }} />}
      {title}
      {hint && <span style={{ fontWeight: 400, color: "var(--adm-text)", fontSize: 12, lineHeight: "18px" }}>{hint}</span>}
    </div>
  );
}

function UploadCell({
  image,
  label,
  onUpload,
  onSetCover,
  onRemove,
  onMoveLeft,
  onMoveRight,
  disabled,
  uploading,
  multiple,
}: {
  image?: { url?: string; mediaUrl?: string };
  label: string;
  onUpload: (file: File) => Promise<boolean>;
  onSetCover?: () => void;
  onRemove?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  disabled?: boolean;
  uploading?: boolean;
  multiple?: boolean;
}) {
  return (
    <div className="product-editor__upload-cell">
      <Upload accept="image/*" showUploadList={false} beforeUpload={onUpload as any} disabled={disabled || uploading} multiple={multiple}>
        <div className={`product-editor__upload-tile${image ? " is-filled" : ""}${disabled || uploading ? " is-disabled" : ""}`}>
          {image ? (
            <SecureImage src={(image as any).mediaUrl || image.url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} tokenKind="staff" />
          ) : (
            <Space direction="vertical" size={5} align="center">
              <PictureOutlined />
              <span>上传图片</span>
            </Space>
          )}
          {uploading && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(255,255,255,0.65)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Spin size="small" aria-label="正在处理图片" />
            </div>
          )}
        </div>
      </Upload>
      {image && (
        <div style={{ marginTop: 5, fontSize: 12 }}>
          <div style={{ textAlign: "center", marginBottom: 2 }}>
            {onSetCover ? (
              <Button type="link" size="small" style={{ padding: "0 8px", minHeight: 32, fontSize: 12 }} onClick={onSetCover}>设为主图</Button>
            ) : (
              <span style={{ color: "var(--adm-action)", fontWeight: 500 }}>封面</span>
            )}
          </div>
          {(onMoveLeft || onMoveRight || onRemove) && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              {onMoveLeft && (
                <Button type="text" size="small" icon={<LeftOutlined />} style={{ width: 32, minWidth: 32, height: 32 }} onClick={onMoveLeft} disabled={disabled} title="左移图片" aria-label="左移图片" />
              )}
              {onMoveRight && (
                <Button type="text" size="small" icon={<RightOutlined />} style={{ width: 32, minWidth: 32, height: 32 }} onClick={onMoveRight} disabled={disabled} title="右移图片" aria-label="右移图片" />
              )}
              {onRemove && (
                <Popconfirm title="删除这张图片？" description="删除后需要重新上传才能恢复。" okText="删除图片" cancelText="取消" onConfirm={onRemove}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ width: 32, minWidth: 32, height: 32 }} title="删除图片" aria-label="删除图片" />
                </Popconfirm>
              )}
            </div>
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
  // 路由 /admin/products/new 进入新建模式；id 为纯数字才是编辑
  const editingId = id && id !== "new" && /^\d+$/.test(id) ? Number(id) : undefined;
  const isCreating = !editingId;
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(!isCreating);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  // 新建模式下暂存的媒体（图片/视频先传，保存商品时统一关联）
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const pendingMediaRef = useRef<PendingMedia[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  // 新建模式下暂存的证书（先设置后保存）
  const [pendingCerts, setPendingCerts] = useState<PendingCert[]>([]);
  const [attributeValueIds, setAttributeValueIds] = useState<number[]>([]);
  const [attributeGroups, setAttributeGroups] = useState<
    { id: number; name: string; values: { id: number; value: string }[] }[]
  >([]);
  const [skus, setSkus] = useState<ProductSKU[]>([]);
  // 新建模式下暂存的 SKU（先设置后保存）
  const [pendingSkus, setPendingSkus] = useState<PendingSku[]>([]);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<ProductSKU | null>(null);
  const [skuForm] = Form.useForm();
  const [skuSaving, setSkuSaving] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<{ value: number; label: string }[]>([]);
  const [gemExpanded, setGemExpanded] = useState(false);
  const [certExpanded, setCertExpanded] = useState(false);

  const certDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const redirectedRef = useRef(false);
  const saveRef = useRef<((asDraft?: boolean) => Promise<void>) | null>(null);

  /* 导航联动 */
  const [activeSection, setActiveSection] = useState("media");
  const navItems = useMemo(() => [
    { hash: "media", label: "图文描述" },
    { hash: "basic", label: "基本信息" },
    { hash: "pricing", label: "销售信息" },
    { hash: "publish", label: "上架设置" },
  ], []);

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
  }, [navItems]);

  /* Ctrl+S / Ctrl+Shift+S 快捷键 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!saving) {
          if (e.shiftKey) { void saveRef.current?.(true); }
          else { void saveRef.current?.(); }
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

  /* 暂存媒体同步 + 卸载回收本地预览 URL */
  useEffect(() => { pendingMediaRef.current = pendingMedia; }, [pendingMedia]);
  useEffect(() => () => {
    pendingMediaRef.current.forEach((m) => { if (m.previewUrl) URL.revokeObjectURL(m.previewUrl); });
  }, []);

  /* 新商品：进入后显示空表单，点「提交/草稿」显式创建；子资源（图片/SKU/证书）在创建成功后开放 */

  const mainImages = useMemo(() => images.filter((i) => !i.isVideo).slice(0, 5), [images]);
  const videoImages = useMemo(() => images.filter((i) => i.isVideo), [images]);
  const pendingMainMedia = useMemo(() => pendingMedia.filter((m) => !m.isVideo), [pendingMedia]);
  const pendingVideoMedia = useMemo(() => pendingMedia.filter((m) => m.isVideo), [pendingMedia]);

  // SKU 展示行：已落库 SKU + 新建模式暂存 SKU（统一渲染）
  const skuRows = useMemo<SkuTableRow[]>(() => {
    const saved: SkuTableRow[] = skus.map((s) => ({ ...s, key: `saved-${s.id}`, pending: false }));
    const pending: SkuTableRow[] = pendingSkus.map((s) => ({ ...s, key: `pending-${s.key}`, pending: true }));
    return [...saved, ...pending];
  }, [skus, pendingSkus]);

  // 证书展示行：已落库证书 + 新建模式暂存证书
  const certRows = useMemo<CertRow[]>(() => {
    const saved: CertRow[] = certificates.map((c) => ({ ...c, key: `cert-${c.id}`, pending: false }));
    const pending: CertRow[] = pendingCerts.map((c) => ({ ...c, key: c.key, pending: true }));
    return [...saved, ...pending];
  }, [certificates, pendingCerts]);

  /* ═══ 数据加载 ═══ */

  const loadCategories = useCallback(async () => {
    try {
      // 管理端分类树：返回全部分类（含无公开商品的分类）。
      // 不能用公开树 /categories/tree——它只返回"有公开商品"的分类，商品清空后会变成空数组。
      const result = await categoryApi.getManageTree();
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
      visibility: (item as any).visibility || "MEMBER",
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
      // 商品属性值（attributeValueIds）
      try {
        const attrRes = await productApi.getAttributes(productId);
        const attrList = unwrapResponse<any[]>(attrRes) || [];
        setAttributeValueIds(attrList.map((a) => a.attributeValueId));
      } catch {
        setAttributeValueIds([]);
      }
    } catch (error: any) {
      setLoadError(getSafeAdminErrorMessage(error, "商品资料加载失败，请返回商品列表后重试。"));
    } finally { setLoading(false); }
  }, [fillProduct]);

  const loadAttributeOptions = useCallback(async () => {
    try {
      const result = await attributeApi.getAll();
      const list = unwrapResponse<any[]>(result) || [];
      setAttributeGroups(
        list.map((a) => ({
          id: a.id,
          name: a.name,
          values: (a.values || []).map((v: any) => ({ id: v.id, value: v.value })),
        })),
      );
    } catch {
      // 属性选项加载失败不影响商品编辑
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    void loadAttributeOptions();
    if (editingId) {
      void loadProduct(editingId);
    }
    // 新建模式（/admin/products/new）：editingId 为空，不加载商品，显示空表单；
    // 用户显式点「保存草稿/创建商品」才落库，避免产生未命名草稿。
  }, [editingId, form, loadCategories, loadAttributeOptions, loadProduct, navigate]);

  const refreshImages = async (productId: number) => {
    try {
      const result = await productApi.getById(productId);
      const item = unwrapResponse<Product>(result);
      setProduct(item); setImages(item?.images || []);
    } catch (error: any) {
      console.error("刷新图片列表失败:", error);
    }
  };

  /* ═══ AI 生成商品描述 ═══ */
  const handleGenerateDescription = async () => {
    const values = form.getFieldsValue();
    const name = String(values.name || "").trim();
    if (!name) { message.warning("请先填写商品标题"); return; }
    const category = categoryOptions.find((c) => c.value === values.categoryId)?.label || "珠宝首饰";
    const material = getMaterialLabel(values.materialType) || "足金";
    setGeneratingDesc(true);
    try {
      const res = await aiClassifyApi.generateDescription({
        productName: name,
        category,
        material,
      });
      const data = unwrapResponse<any>(res);
      const content = typeof data === "string" ? data : data?.content || data?.text || "";
      if (content) {
        form.setFieldsValue({ description: content });
        setIsDirty(true);
        message.success("已生成描述，可继续修改");
      } else {
        message.warning("AI 未返回内容，请重试");
      }
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, "描述生成失败，请确认 AI 服务可用后重试。"));
    } finally {
      setGeneratingDesc(false);
    }
  };

  /* ═══ 保存 ═══ */

  // 自动生成货号（唯一标识，用户可手动改）
  const generateCode = () => {
    const ts = Date.now().toString(36).toUpperCase().slice(-8);
    form.setFieldsValue({ code: `HC-${ts}` });
    setIsDirty(true);
  };

  const save = async (asDraft = false) => {
    // 验证必填字段
    await form.validateFields(
      asDraft
        ? ["name", "code", "categoryId", "materialType"]
        : ["name", "code", "categoryId", "materialType", "price"],
    );
    // 关键：validateFields 只返回命名字段，必须用 getFieldsValue 获取全部表单值
    const values = form.getFieldsValue();
    // 发布前预校验(与后端 canPublish 同口径:价/图/SKU,避免填完一堆信息提交后才收 400)
    if (!asDraft && values.status === "PUBLISHED") {
      const problems: string[] = [];
      // 价格条件：编辑模式看已有 SKU，新建模式看暂存 SKU；两者都无则回退到「起价」字段
      const pricedSkuExists = editingId
        ? skus.some((s) => s.isActive && Number(s.price) > 0)
        : pendingSkus.some((s) => s.isActive && s.price > 0);
      if (!pricedSkuExists && !(Number(values.price) > 0)) problems.push("价格大于 0");
      if (!images.length && !pendingMainMedia.length) problems.push("至少一张商品图片");
      if (problems.length) {
        if (!pricedSkuExists && !(Number(values.price) > 0)) form.setFields([{ name: "price", errors: ["请填写大于 0 的起价，或添加有价格的 SKU"] }]);
        message.warning(`发布前请补全: ${problems.join("、")}`);
        return;
      }
    }
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
        visibility: values.visibility || "MEMBER",
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
        let tagsFailed = false;
        try {
          await productApi.updateTags(editingId, tags);
        } catch (tagError: any) {
          tagsFailed = true;
          console.error("标签保存失败:", tagError);
        }
        try {
          await productApi.setAttributes(editingId, attributeValueIds);
        } catch (attrError: any) {
          console.error("属性保存失败:", attrError);
        }
        await loadProduct(editingId);
        if (tagsFailed) {
          // 商品资料已存（不回滚），但标签未存：保持 dirty 提示重试，不弹 success 以免误判已全存
          message.warning("商品资料已保存，但标签保存失败（单条≤50字），请重新保存");
          setIsDirty(true);
        } else {
          message.success(asDraft ? "草稿已保存" : "商品基础资料已保存");
          setIsDirty(false);
        }
      } else {
        const result = await productApi.create({ ...payload, code: values.code, skus: pendingSkus.map(({ key, ...sku }) => sku) });
        const created = unwrapResponse<Product>(result);
        // 电商逻辑：图片/视频可先传后存，创建商品后一次性关联暂存媒体
        if (pendingMedia.length > 0) {
          const mediaResults = await Promise.allSettled(
            pendingMedia.map((m, i) =>
              m.isVideo
                ? productApi.addImage(created.id, { url: m.url!, sortOrder: i, type: m.type, isVideo: true })
                : productApi.addImage(created.id, {
                    storageKey: m.storageKey!,
                    width: m.width, height: m.height, mimeType: m.mimeType, fileSize: m.fileSize,
                    sortOrder: i, type: m.type, isVideo: false,
                  }),
            ),
          );
          const failedMedia = mediaResults.filter((r) => r.status === "rejected").length;
          pendingMedia.forEach((m) => { if (m.previewUrl) URL.revokeObjectURL(m.previewUrl); });
          setPendingMedia([]);
          if (failedMedia > 0) {
            message.warning(`商品已创建，但 ${failedMedia} 个媒体保存失败，请进入编辑页后重新上传`);
          }
        }
        // 电商逻辑：证书先设置后保存，创建商品后批量关联暂存证书
        if (pendingCerts.length > 0) {
          const certResults = await Promise.allSettled(
            pendingCerts.map((c) => productApi.addCertificate(created.id, {
              certType: c.certType, certNumber: c.certNumber,
              certImage: c.certImage, expireDate: c.expireDate || undefined,
            })),
          );
          const failedCerts = certResults.filter((r) => r.status === "rejected").length;
          setPendingCerts([]);
          if (failedCerts > 0) {
            message.warning(`商品已创建，但 ${failedCerts} 份证书保存失败，请进入编辑页后重新添加`);
          }
        }
        try {
          if (tags.length > 0) {
            await productApi.updateTags(created.id, tags);
          }
        } catch (tagError: any) {
          console.error("标签保存失败:", tagError);
          message.error("商品已创建，但标签保存失败，请在「上架设置」重新设置后再次保存");
        }
        try {
          if (attributeValueIds.length > 0) {
            await productApi.setAttributes(created.id, attributeValueIds);
          }
        } catch (attrError: any) {
          console.error("属性保存失败:", attrError);
        }
        message.success(asDraft ? "草稿已创建" : "商品已创建");
        setIsDirty(false);
        setPendingSkus([]);
        navigate(`/admin/products/${created.id}/edit`, { replace: true });
      }
    } catch (error: any) {
      console.error("保存失败:", error);
      message.error(getSafeAdminErrorMessage(error, "商品保存失败，请检查必填信息后重试。"));
    } finally { setSaving(false); }
  };
  saveRef.current = save;

  /* ═══ 图片 & 视频上传 ═══ */

  const uploadImage = async (file: File, imageType = "SIDE", isVideo = false, slotKey?: string) => {
    // 格式校验（不只依赖 accept=image/*）
    const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!isVideo && !allowedImageTypes.includes(file.type)) {
      message.error("仅支持 JPG / PNG / WebP 格式");
      return false;
    }
    // 主图数量校验（视频数量已在 beforeUpload 校验）
    if (!isVideo && mainImages.length + pendingMainMedia.length >= 5) {
      message.warning("主图最多 5 张，请先删除不需要的");
      return false;
    }
    // 图片大小校验（视频大小已在 beforeUpload 校验）
    if (!isVideo) {
      const limitMB = 5;
      if (file.size / 1024 / 1024 > limitMB) {
        message.error(`图片不能超过 ${limitMB}MB`);
        return false;
      }
    }
    const key = slotKey || `${file.name}-${file.size}`;
    setUploading(prev => new Set(prev).add(key));
    try {
      const sortOrder = imageType === "FRONT" ? 0 : images.length;
      // 电商逻辑：新建模式下媒体先传后存，保存商品时再统一关联；编辑模式即时落库
      if (isVideo) {
        const uploaded = unwrapResponse<{ url: string }>(await uploadApi.uploadVideo(file));
        if (editingId) {
          await productApi.addImage(editingId, { url: uploaded.url, sortOrder, type: imageType, isVideo: true });
          await refreshImages(editingId);
        } else {
          setPendingMedia(prev => [...prev, {
            key: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            url: uploaded.url,
            type: imageType === "FRONT" ? "FRONT" : "SIDE",
            isVideo: true,
            previewUrl: URL.createObjectURL(file),
          }]);
        }
      } else {
        // 受控产品库：商品图片写入私有存储，返回 storageKey（非公开 url）
        const uploadedList = unwrapResponse<any[]>(await uploadApi.uploadProductImage(file));
        const uploaded = uploadedList?.[0];
        if (!uploaded?.storageKey) throw new Error("图片上传失败");
        if (editingId) {
          await productApi.addImage(editingId, {
            storageKey: uploaded.storageKey,
            width: uploaded.width,
            height: uploaded.height,
            mimeType: uploaded.mimeType,
            fileSize: uploaded.fileSize,
            sortOrder,
            type: imageType,
            isVideo: false,
          });
          await refreshImages(editingId);
        } else {
          setPendingMedia(prev => [...prev, {
            key: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            storageKey: uploaded.storageKey,
            type: imageType === "FRONT" ? "FRONT" : "SIDE",
            isVideo: false,
            previewUrl: URL.createObjectURL(file),
            width: uploaded.width,
            height: uploaded.height,
            mimeType: uploaded.mimeType,
            fileSize: uploaded.fileSize,
          }]);
        }
      }
      message.success(isVideo ? "视频已上传" : "图片已上传");
    } catch (error: any) {
      console.error("上传失败:", error);
      message.error(getSafeAdminErrorMessage(error, "媒体上传失败，请检查网络和文件格式后重试。"));
    } finally {
      setUploading(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
    return false;
  };

  // 删除暂存媒体（未落库，直接回收本地预览 URL）
  const removePendingMedia = (key: string) => {
    setPendingMedia(prev => {
      const target = prev.find((m) => m.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((m) => m.key !== key);
    });
  };

  // 交换两张主图的 sortOrder（用于调序）；后端 updateImage 白名单含 sortOrder
  const swapImageOrder = async (a: ProductImage, b: ProductImage) => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    if (a.sortOrder === b.sortOrder) return;
    const swapKey = `swap-${a.id}-${b.id}`;
    setUploading(prev => new Set(prev).add(swapKey));
    try {
      await productApi.updateImage(editingId, a.id, { sortOrder: b.sortOrder });
      await productApi.updateImage(editingId, b.id, { sortOrder: a.sortOrder });
      await refreshImages(editingId);
      message.success("顺序已更新");
    } catch (error: any) {
      console.error("调整顺序失败:", error);
      message.error(getSafeAdminErrorMessage(error, "媒体顺序更新失败，请重新加载后重试。"));
    } finally {
      setUploading(prev => { const next = new Set(prev); next.delete(swapKey); return next; });
    }
  };

  const setCover = async (imageId: number) => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    try {
      await productApi.setCoverImage(editingId, imageId);
      await refreshImages(editingId);
      message.success("已设为封面");
    } catch (error: any) {
      console.error("设置封面失败:", error);
      message.error(getSafeAdminErrorMessage(error, "封面设置失败，请重新加载后重试。"));
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
      message.error(getSafeAdminErrorMessage(error, "图片删除失败，请重新加载后重试。"));
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
    if (!editingId) {
      // 新建模式：暂存本地，保存商品时批量创建
      setPendingCerts(prev => [...prev, {
        key: `cert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        certType: "NATIONAL", certNumber: "",
      }]);
      message.success("证书已添加（保存商品后生效）");
      setCertExpanded(true);
      return;
    }
    try {
      await productApi.addCertificate(editingId, { certType: "NATIONAL", certNumber: "" });
      message.success("证书已添加");
      await refreshCertificates();
      setCertExpanded(true);
    } catch (error: any) {
      console.error("添加证书失败:", error);
      message.error(getSafeAdminErrorMessage(error, "证书添加失败，请检查填写内容后重试。"));
    }
  };

  // 新建模式暂存证书的本地操作
  const updatePendingCert = (key: string, field: string, value: any) => {
    setPendingCerts(prev => prev.map(c => c.key === key ? { ...c, [field]: value } : c));
  };
  const removePendingCert = (key: string) => {
    setPendingCerts(prev => prev.filter(c => c.key !== key));
  };
  const uploadPendingCertImage = async (key: string, file: File) => {
    try {
      const result = await uploadApi.uploadImage(file);
      const url = unwrapResponse<{ url: string }>(result).url;
      setPendingCerts(prev => prev.map(c => c.key === key ? { ...c, certImage: url } : c));
      message.success("证书图片已上传");
    } catch (error: any) {
      console.error("证书图片上传失败:", error);
      message.error(getSafeAdminErrorMessage(error, "证书图片上传失败，请检查文件格式和网络后重试。"));
    }
    return false;
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
        // 失败时从后端重新拉取，覆盖本地乐观更新，保证 UI 与后端一致（用户看到的=实际存的）
        await refreshCertificates();
        console.error("更新证书失败:", error);
        message.error(getSafeAdminErrorMessage(error, "证书更新失败，页面已还原为已保存内容。"));
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
      message.error(getSafeAdminErrorMessage(error, "证书图片上传失败，请检查文件格式和网络后重试。"));
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
      message.error(getSafeAdminErrorMessage(error, "证书删除失败，请重新加载后重试。"));
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
    // 新建模式只支持「添加 SKU」；编辑已落库 SKU 仅在编辑模式可用
    if (sku && !editingId) return;
    setEditingSku(sku || null);
    if (sku) {
      skuForm.setFieldsValue({
        skuCode: sku.skuCode, material: sku.material, size: sku.size,
        goldWeight: sku.goldWeight, price: sku.price, isActive: sku.isActive,
      });
    } else {
      skuForm.resetFields();
      skuForm.setFieldsValue({ material: "GOLD_999", price: 0, isActive: true });
    }
    setSkuModalOpen(true);
  };

  const saveSku = async () => {
    // 验证必填字段，再用 getFieldsValue 获取全部值
    await skuForm.validateFields(["skuCode", "price"]);
    const values = skuForm.getFieldsValue();
    setSkuSaving(true);
    try {
      if (!editingId) {
        // 新建模式：暂存本地，保存商品时批量创建
        setPendingSkus(prev => [...prev, {
          key: `sku-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          skuCode: String(values.skuCode).trim(),
          material: values.material || "GOLD_999",
          size: values.size || undefined,
          goldWeight: values.goldWeight ?? 0,
          price: Number(values.price) || 0,
          isActive: values.isActive ?? true,
        }]);
        message.success("SKU 已添加（保存商品后生效）");
      } else if (editingSku) {
        await productApi.updateSku(editingId, editingSku.id, values);
        message.success("SKU 已更新");
      } else {
        await productApi.createSku(editingId, values);
        message.success("SKU 已创建");
      }
      setSkuModalOpen(false); setEditingSku(null);
      if (editingId) await refreshSkus();
    } catch (error: any) {
      console.error("保存 SKU 失败:", error);
      message.error(getSafeAdminErrorMessage(error, "SKU 保存失败，请检查规格信息后重试。"));
    }
    finally { setSkuSaving(false); }
  };

  // 删除暂存 SKU（未落库）
  const removePendingSku = (rowKey: string) => {
    const key = rowKey.startsWith("pending-") ? rowKey.slice("pending-".length) : rowKey;
    setPendingSkus(prev => prev.filter(s => s.key !== key));
  };

  const toggleSkuActive = async (sku: ProductSKU) => {
    if (!editingId) { message.warning("请等待编辑器初始化完成"); return; }
    try {
      await productApi.updateSku(editingId, sku.id, { isActive: !sku.isActive });
      message.success(sku.isActive ? "SKU 已停用" : "SKU 已启用");
      await refreshSkus();
    } catch (error: any) {
      console.error("切换 SKU 状态失败:", error);
      message.error(getSafeAdminErrorMessage(error, "SKU 状态更新失败，请重新加载后重试。"));
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
      message.error(getSafeAdminErrorMessage(error, "SKU 删除失败，请重新加载后确认当前状态。"));
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
      <Spin aria-label="正在加载商品资料" />
      <div style={{ marginTop: 12, color: "var(--adm-text)" }}>正在加载商品资料…</div>
    </div>
  );
  if (loadError) return (
    <Result status="error" title="商品加载失败" subTitle={loadError}
      extra={<Button onClick={() => editingId && void loadProduct(editingId)}>重新加载</Button>} />
  );

  /* 归档商品只读：仅允许从商品管理页「恢复草稿」后编辑 */
  if (product?.status === "ARCHIVED") return (
    <Result
      status="info"
      title="商品位于回收站"
      subTitle="请先恢复为草稿后编辑"
      extra={
        <Button type="primary" onClick={() => navigate("/admin/products", { replace: true })}>
          返回商品列表
        </Button>
      }
    />
  );

  /* ═══════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════ */

  return (
    <div className="product-editor">
      {/* ────── Header ────── */}
      <header className="product-editor__header">
        <div className="product-editor__header-inner">
          <nav className="product-editor__tabs">
            {navItems.map((item) => {
              const isActive = activeSection === item.hash;
              return (
                <a key={item.hash} href={`#${item.hash}`} onClick={goTo(item.hash)}
                  className={`product-editor__tab${isActive ? " is-active" : ""}`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <Space className="product-editor__header-actions">
            {editingId && <Button href={`/products/${editingId}`} target="_blank" size="small">预览</Button>}
          </Space>
        </div>
      </header>

      {/* ────── 表单主体 ────── */}
      <main className="product-editor__workspace">
        <Form className="product-editor__form" form={form} layout="vertical"
          initialValues={{ status: "DRAFT", salesMode: "DISPLAY_ONLY", visibility: "MEMBER", materialType: "GOLD_999" }}
          onValuesChange={() => setIsDirty(true)}>

          {/* ════════════════════════════════════════
             #media — 商品素材
             ════════════════════════════════════════ */}
          <section id="media" className="product-editor__card">
            <SectionTitle title="图文描述" hint="首张为封面，最多 5 张主图" />

            <SubSectionHeader title="基础素材" />
            <div className="product-editor__field-row">
              <div className="product-editor__field-label">1:1 主图 <em>*</em></div>
              <div className="product-editor__field-content">
                <div className="product-editor__field-tip">比例为 1:1，建议尺寸 1440×1440 及以上；首张自动作为商品封面。</div>
                <div className="product-editor__image-grid">
                  {mainImages.map((img, i) => {
                    // 封面判断：优先使用服务端的 primaryImageId，兼容 mock 的 type==="FRONT"
                    const isPrimary =
                      img.id === product?.primaryImageId || img.type === "FRONT";
                    return (
                      <UploadCell
                        key={`saved-${img.id}`}
                        image={img}
                        label={`主图 ${i + 1}`}
                        disabled={uploading.size > 0}
                        uploading={uploading.has(`slot-${img.id}`)}
                        multiple
                        onUpload={(file) => uploadImage(file, isPrimary || i === 0 ? "FRONT" : "SIDE", false, `slot-${img.id}`)}
                        onSetCover={isPrimary ? undefined : () => void setCover(img.id)}
                        onMoveLeft={i > 0 ? () => void swapImageOrder(img, mainImages[i - 1]!) : undefined}
                        onMoveRight={i < mainImages.length - 1 ? () => void swapImageOrder(img, mainImages[i + 1]!) : undefined}
                        onRemove={() => void removeImage(img.id)}
                      />
                    );
                  })}
                  {pendingMainMedia.map((pm, i) => (
                    <UploadCell
                      key={`pending-${pm.key}`}
                      image={{ url: pm.previewUrl }}
                      label={`主图 ${mainImages.length + i + 1}`}
                      disabled={uploading.size > 0}
                      uploading={uploading.has(pm.key)}
                      multiple
                      onUpload={(file) => uploadImage(file, mainImages.length + i === 0 ? "FRONT" : "SIDE", false, pm.key)}
                      onRemove={() => removePendingMedia(pm.key)}
                    />
                  ))}
                  {mainImages.length + pendingMainMedia.length < 5 && (
                    <UploadCell
                      key="add-main-slot"
                      image={undefined}
                      label={`主图 ${mainImages.length + pendingMainMedia.length + 1}`}
                      disabled={uploading.size > 0}
                      uploading={uploading.has("add-main-slot")}
                      multiple
                      onUpload={(file) => uploadImage(file, mainImages.length + pendingMainMedia.length === 0 ? "FRONT" : "SIDE", false, "add-main-slot")}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="product-editor__field-row">
              <div className="product-editor__field-label">商品视频 <span>（选填）</span></div>
              <div className="product-editor__field-content">
                <div className="product-editor__field-tip">支持 MP4、WebM 格式，最多上传 3 个视频，单个文件不超过 100MB。</div>
                <div className="product-editor__video-list">
                  <Upload
                    accept="video/mp4,video/webm"
                    showUploadList={false}
                    beforeUpload={(file) => {
                      // 数量 + 大小校验：避免大视频在 120s 超时失败、或视频无限堆积
                      if (videoImages.length + pendingVideoMedia.length >= 3) {
                        message.warning("最多上传 3 个视频，请先删除不需要的");
                        return Upload.LIST_IGNORE;
                      }
                      const limitMB = 100;
                      const sizeMB = file.size / 1024 / 1024;
                      if (sizeMB > limitMB) {
                        message.error(`视频不能超过 ${limitMB}MB（当前 ${sizeMB.toFixed(1)}MB），请压缩后再上传`);
                        return Upload.LIST_IGNORE;
                      }
                      return uploadImage(file, "SIDE", true, "video");
                    }}
                    disabled={uploading.size > 0}
                  >
                    <Button icon={<PlayCircleOutlined />} disabled={uploading.size > 0}>
                      上传视频
                    </Button>
                  </Upload>
                  {videoImages.map((v) => (
                    <div key={v.id} className="product-editor__video-item">
                      <video src={v.url} controls preload="metadata" />
                      <Popconfirm title="删除这个视频？" description="删除后需要重新上传才能恢复。" okText="删除视频" cancelText="取消" onConfirm={() => removeImage(v.id)}>
                        <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除视频</Button>
                      </Popconfirm>
                    </div>
                  ))}
                  {pendingVideoMedia.map((pm) => (
                    <div key={pm.key} className="product-editor__video-item">
                      <video src={pm.previewUrl} controls preload="metadata" />
                      <Popconfirm title="删除这个视频？" description="删除后需要重新上传才能恢复。" okText="删除视频" cancelText="取消" onConfirm={() => removePendingMedia(pm.key)}>
                        <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除视频</Button>
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <SubSectionHeader title="商品卖点" />
            <div className="product-editor__field-row">
              <div className="product-editor__field-label">一句话卖点</div>
              <div className="product-editor__field-content product-editor__field-content--narrow">
                <Form.Item name="shortDescription" noStyle>
                  <Input maxLength={30} showCount placeholder="例如：古法錾刻足金如意锁" />
                </Form.Item>
                <div className="product-editor__field-tip">用于快速概括商品特点，最多 30 个字。</div>
              </div>
            </div>
            <div className="product-editor__field-row product-editor__field-row--last">
              <div className="product-editor__field-label">商品描述</div>
              <div className="product-editor__field-content">
                <Form.Item name="description" noStyle>
                  <TextArea rows={5} maxLength={5000} showCount placeholder="介绍工艺、材质、寓意和佩戴建议" />
                </Form.Item>
                <div style={{ marginTop: 8 }}>
                  <Button size="small" loading={generatingDesc} onClick={handleGenerateDescription}>
                    AI 生成描述
                  </Button>
                  <span style={{ color: "var(--adm-text)", fontSize: 12, lineHeight: "18px", marginLeft: 8 }}>基于商品标题、类目与材质自动生成</span>
                </div>
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════════
             #basic — 基本信息
             ════════════════════════════════════════ */}
          <section id="basic" className="product-editor__card">
            <SectionTitle title="基本信息" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              <Form.Item name="name" label="商品标题"
                rules={[{ required: true, whitespace: true, message: "请输入商品标题" }]}>
                <Input maxLength={60} showCount placeholder="品牌 + 款式 + 风格 + 材质 + 亮点" />
              </Form.Item>
              <Form.Item name="code" label="商家编码"
                rules={[{ required: true, whitespace: true, message: "请输入编码" }]}>
                <Input disabled={!isCreating} maxLength={64}
                  suffix={isCreating ? <Button type="link" size="small" style={{ padding: 0 }} onClick={generateCode}>自动生成</Button> : undefined} />
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
          <section id="pricing" className="product-editor__card">
            <SectionTitle title="价格与规格" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px", marginBottom: 6 }}>
              <Form.Item name="price" label="起价（元）" tooltip="单规格即售价；多规格时由各 SKU 最低价自动计算"
                rules={[{ required: true, message: "请输入起价" }]}>
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="craftFee" label="工费（元）">
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </div>

            <SubSectionHeader title={`SKU 规格（${skuRows.filter(s => s.isActive).length} 个在用）`} />
            <Table
              rowKey="key" dataSource={skuRows} pagination={false} size="middle" scroll={{ x: 900 }}
              onRow={(record: SkuTableRow) => ({ style: { opacity: record.isActive ? 1 : 0.55 } })}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={isCreating ? "暂无 SKU：可点「添加 SKU」配置规格与价格；留空则保存时自动创建默认规格" : "暂无 SKU，请添加规格"} /> }}
              columns={[
                { title: "SKU 编码", dataIndex: "skuCode", width: 140 },
                { title: "材质", dataIndex: "material", width: 90, render: (v: string) => getMaterialLabel(v) },
                { title: "规格", dataIndex: "size", width: 100, render: (v: any) => v || "—" },
                { title: "金重(g)", dataIndex: "goldWeight", width: 90, render: (v: any) => v ?? "—" },
                { title: "价格", dataIndex: "price", width: 110, render: (v: number) => formatPrice(v) },
                { title: "状态", dataIndex: "isActive", width: 70,
                  render: (v: boolean) => <Tag color={v ? "green" : "default"}>{v ? "启用" : "停用"}</Tag> },
                { title: "操作", width: 170,
                  render: (_: unknown, row: SkuTableRow) => (
                    row.pending ? (
                      <Popconfirm title="删除这个暂存 SKU？" description="保存商品前可重新添加。" okText="删除" cancelText="取消" onConfirm={() => removePendingSku(row.key)}>
                        <Button type="link" size="small" danger style={{ padding: 0 }}>删除</Button>
                      </Popconfirm>
                    ) : (
                      <Space size={4}>
                        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openSkuModal(row)}>编辑</Button>
                        {row.isActive ? (
                          <Popconfirm title="停用这个 SKU？" description="停用后该规格将不可用于新业务。" okText="停用 SKU" cancelText="取消" onConfirm={() => void toggleSkuActive(row)}>
                            <Button type="link" size="small" style={{ padding: 0 }}>停用</Button>
                          </Popconfirm>
                        ) : (
                          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void toggleSkuActive(row)}>启用</Button>
                        )}
                        <Popconfirm title="永久删除这个 SKU？" description="删除后不可恢复，请确认该规格不再使用。" okText="永久删除 SKU" cancelText="取消" onConfirm={() => deleteSkuItem(row.id)}>
                          <Button type="link" size="small" danger style={{ padding: 0 }}>永久删除</Button>
                        </Popconfirm>
                      </Space>
                    )
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
          <section id="publish" className="product-editor__card">
            <SectionTitle title="上架设置" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              <Form.Item name="status" label="上架状态">
                <Select options={statuses.map((s) => ({ value: s, label: statusMeta[s].label }))} />
              </Form.Item>
              <Form.Item
                name="visibility"
                label="可见范围"
                tooltip="INTERNAL 不会出现在任何前台目录或推荐中；PARTNER 仅审核通过的合作商家可见"
              >
                <Select
                  options={[
                    { value: "PUBLIC", label: "公开宣传款" },
                    { value: "MEMBER", label: "登录会员可见（默认）" },
                    { value: "PARTNER", label: "合作商家专属" },
                    { value: "INTERNAL", label: "内部不可见（前台永不展示）" },
                  ]}
                />
              </Form.Item>
              <Form.Item name="salesMode" label="销售方式"
                tooltip="仅「直接购买」支持前台加购下单；其余方式将引导客户到对应咨询入口（选款/预约/定制）"
                extra={<span style={{ color: "var(--adm-muted)", fontSize: 12 }}>仅「直接购买」可直接下单，其余引导咨询</span>}>
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

            <SubSectionHeader title="商品属性" />
            {attributeGroups.length > 0 ? (
              attributeGroups.map((group) => (
                <div key={group.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: "var(--adm-text)", marginBottom: 6 }}>{group.name}</div>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder={`选择${group.name}`}
                    value={attributeValueIds.filter((id) => group.values.some((v) => v.id === id))}
                    onChange={(selected: number[]) => {
                      const others = attributeValueIds.filter((id) => !group.values.some((v) => v.id === id));
                      setAttributeValueIds([...others, ...selected]);
                      setIsDirty(true);
                    }}
                    style={{ width: "100%", maxWidth: 520 }}
                    options={group.values.map((v) => ({ value: v.id, label: v.value }))}
                  />
                </div>
              ))
            ) : (
              <div style={{ color: "var(--adm-muted)", fontSize: 12 }}>
                暂无属性字典，请先在「属性字典」页面维护筛选维度。
              </div>
            )}

            <div style={{ marginTop: 20, padding: "10px 14px", border: "1px solid #ebe8e3", borderRadius: 6 }}>
              <Space align="start">
                <Form.Item name="multiDiscount" valuePropName="checked" noStyle>
                  <Checkbox disabled>启用多件优惠</Checkbox>
                </Form.Item>
                <span style={{ color: "var(--adm-muted)", fontSize: 12 }}>功能开发中，暂不可用（计划支持满 2 件起折、5.0–9.9 折阶梯优惠）。</span>
              </Space>
            </div>

            {/* 证书管理 — 可折叠 */}
            <div style={{ marginTop: 20, borderTop: "1px solid #ebe8e3", paddingTop: 4 }}>
              <CollapseHeader expanded={certExpanded} onToggle={() => setCertExpanded(!certExpanded)}
                title="证书管理" hint={certRows.length > 0 ? `（${certRows.length} 份）` : ""} />
              {certExpanded && (
                <>
                  {certRows.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无鉴定证书" />
                  ) : (
                    certRows.map((cert) => (
                      <div key={cert.key}
                        style={{
                          border: "1px solid #f0f0f0", borderRadius: 8, padding: 14, marginBottom: 10,
                          transition: "border-color 0.2s, box-shadow 0.2s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#d9d0bd"; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 6px rgba(0,0,0,0.04)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#f0f0f0"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <Select value={cert.certType} style={{ width: 160 }}
                            onChange={(value) => cert.pending ? updatePendingCert(cert.key, "certType", value) : updateCertDebounced(cert.id, "certType", value)}
                            options={[
                              { value: "NATIONAL", label: "国检证书" }, { value: "PROVINCIAL", label: "省检证书" },
                              { value: "GIA", label: "GIA 证书" }, { value: "OTHER", label: "其他证书" },
                            ]} />
                          <Popconfirm title="删除这份证书？" description="删除后需要重新添加证书信息。" okText="删除证书" cancelText="取消"
                            onConfirm={() => cert.pending ? removePendingCert(cert.key) : deleteCert(cert.id)}>
                            <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除证书</Button>
                          </Popconfirm>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                          <Form.Item label="证书编号" style={{ marginBottom: 0 }}>
                            <Input value={cert.certNumber}
                              onChange={(e) => cert.pending ? updatePendingCert(cert.key, "certNumber", e.target.value) : updateCertDebounced(cert.id, "certNumber", e.target.value)}
                              placeholder="证书编号" />
                          </Form.Item>
                          <Form.Item label="有效期" style={{ marginBottom: 0 }}>
                            <Input
                              value={cert.expireDate ? String(cert.expireDate).slice(0, 10) : ""}
                              onChange={(e) => cert.pending ? updatePendingCert(cert.key, "expireDate", e.target.value || null) : updateCertDebounced(cert.id, "expireDate", e.target.value || null)}
                              type="date" />
                          </Form.Item>
                          <Form.Item label="证书图片" style={{ marginBottom: 0 }}>
                            <Upload accept="image/*" showUploadList={false}
                              beforeUpload={(file) => cert.pending ? uploadPendingCertImage(cert.key, file) : uploadCertImage(cert.id, file)}>
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
            title={editingSku ? "编辑 SKU" : "新建 SKU"}
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
                {/* 库存已统一到「库存管理」(Inventory) 模块,SKU 不再承载库存字段 */}
                <Form.Item name="isActive" label="启用" valuePropName="checked"><Switch /></Form.Item>
              </div>
            </Form>
          </Modal>

        </Form>
      </main>
      <footer className="product-editor__footer">
        <div className="product-editor__footer-inner">
          <Button loading={saving} onClick={() => void save(true)}>保存草稿</Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            提交商品信息
          </Button>
          <span className={`product-editor__save-state${isDirty ? " is-dirty" : ""}`}>
            {isDirty ? "有未保存的修改" : "已保存"}
          </span>
        </div>
      </footer>
    </div>
  );
}
