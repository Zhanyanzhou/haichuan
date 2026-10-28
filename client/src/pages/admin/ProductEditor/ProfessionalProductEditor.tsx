import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileImageOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdminErrorState } from "@/components/common/AdminDataStates";
import RouteLoading from "@/components/common/RouteLoading";
import { SecureImage } from "@/components/common/SecureImage";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { categoryApi, inventoryApi, productApi, uploadApi } from "@/services/api";
import type {
  ProductSkuWriteInput,
  ProductWriteInput,
} from "@/services/api";
import { useCommerceEnabled } from "@/store/featureFlags";
import { useAuthStore } from "@/store/authStore";
import type {
  Category,
  InventoryPolicy,
  MaterialType,
  Product,
  ProductDetailBlock,
  ProductImage,
  ProductSKU,
  ProductStatus,
  SalesMode,
} from "@/types";
import { DETAIL_ONLY_IMAGE_SORT_FLOOR } from "@/utils/productImage";
import { unwrapResponse } from "@/utils/unwrap";
import { normalizeAdminReturnPath } from "@/utils/adminReturnPath";
import UnsavedChangesGuard from "../HomepageConfig/components/UnsavedChangesGuard";
import "./ProfessionalProductEditor.css";

type DetailDraft = ProductDetailBlock & { key: string; pendingMediaKey?: string };
type PendingMedia = { key: string; file: File; preview: string; purpose?: "detail" };
type MediaChoice = { key: string; label: string; src?: string; imageId?: number; pending?: boolean };
type PendingSaveVerification = { productId: number };
class EditorUserError extends Error {}

type EditorRequestError = Error & { status?: number; response?: { status?: number } };
type ProductSubmitFailure<Field extends string = string> = {
  message: string;
  field?: Field;
};

type ProductEditorGemInfo = {
  type?: string;
  carat?: number;
  clarity?: string;
  color?: string;
  cut?: string;
  quantity?: number;
  certificateAuthority?: string;
  certificateNumber?: string;
  certificateQueryUrl?: string;
  brand?: string;
  collection?: string;
  style?: string;
  occasion?: string;
  condition?: string;
};

type ProductEditorRecord = Omit<Product, "gemInfo"> & {
  gemInfo?: ProductEditorGemInfo | null;
  primaryImageId?: number | null;
  publishMode?: "IMMEDIATE" | "SCHEDULED" | "WAREHOUSE";
  scheduledPublishAt?: string | null;
};

type ProductEditorFormValues = {
  name?: string;
  code: string;
  categoryId: number;
  shortDescription?: string | null;
  description?: string | null;
  materialType: MaterialType;
  goldWeight?: number;
  craftFee?: number;
  weight?: number;
  size?: string | null;
  gemType?: string;
  gemCarat?: number;
  gemClarity?: string;
  gemColor?: string;
  gemCut?: string;
  gemQuantity?: number;
  certificateAuthority?: string;
  certificateNumber?: string;
  certificateQueryUrl?: string;
  brand?: string;
  collection?: string;
  style?: string;
  occasion?: string;
  condition?: string;
  craftTechnique?: string[];
  visibility?: Product["visibility"];
  salesMode: SalesMode;
  inventoryPolicy: InventoryPolicy;
  purchaseRegion?: Product["purchaseRegion"];
  publishMode: "IMMEDIATE" | "SCHEDULED" | "WAREHOUSE";
  scheduledPublishAt?: { toISOString: () => string } | null;
  fulfillmentType?: Product["fulfillmentType"];
  dispatchTime?: Product["dispatchTime"];
  shippingTemplateId?: number | null;
  deliveryMethods?: string[];
  requiresInsuredShipping?: boolean;
  requiresSignature?: boolean;
  includesCertificate?: boolean;
  packageType?: string | null;
  customLeadTime?: string | null;
  isHot?: boolean;
  isNew?: boolean;
  isRecommended?: boolean;
  isLimited?: boolean;
  isCustom?: boolean;
  price?: number | string | null;
  initialSkuPrice?: number | string | null;
  derivedPrice?: number | string | null;
  stockQuantity?: number | null;
};

type UploadedProductMedia = {
  mediaAssetId: number;
  storageKey: string;
  url?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileSize?: number;
};

type FormValidationError = {
  errorFields: Array<{ name?: string | number | Array<string | number>; errors?: string[] }>;
};

function isFormValidationError(error: unknown): error is FormValidationError {
  if (typeof error !== "object" || error === null) return false;
  return Array.isArray((error as { errorFields?: unknown }).errorFields);
}

function isMeaningfulProductText(value: unknown, minimumLength: number): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < minimumLength) return false;
  if (/^[\d\s\p{P}\p{S}]+$/u.test(text)) return false;
  const compact = text.replace(/\s+/g, "");
  return !/^(.)\1{3,}$/u.test(compact);
}

const JEWELRY_CLAIM_RULES: Array<[RegExp, string]> = [
  [/18\s*k\s*足金|足金\s*18\s*k/i, "纯度不能写成18K足金"],
  [/辟邪|镇宅|化太岁|赌石/, "不要写辟邪、镇宅、化太岁或赌石"],
  [/保值增值|稳赚|升值潜力|必然升值/, "不要承诺保值或升值"],
  [/杀菌|防过敏|远离过敏/, "不要写杀菌或防过敏"],
];

function jewelryClaimIssues(parts: unknown[]): string[] {
  const text = parts.filter((part): part is string => typeof part === "string").join("\n");
  if (!text.trim()) return [];
  return JEWELRY_CLAIM_RULES.filter(([pattern]) => pattern.test(text)).map(([, message]) => message);
}

function requiredFieldClass(required: boolean, empty: boolean, extra = ""): string {
  return [extra, required ? "pro-editor__must" : "", required && empty ? "is-open" : ""].filter(Boolean).join(" ");
}

function RequiredMark() {
  return <em className="pro-editor__must-mark" aria-hidden="true">必填</em>;
}

type PublishTarget =
  | "name"
  | "shortDescription"
  | "description"
  | "categoryId"
  | "code"
  | "initialSkuPrice"
  | "deliveryMethods"
  | "scheduledPublishAt"
  | "inventoryPolicy"
  | "certificateQueryUrl"
  | "product-cover"
  | "product-detail"
  | "product-skus"
  | "basic"
  | "media"
  | "sales";

type PublishGap = { label: string; target: PublishTarget };

const FORM_JUMP_FIELDS = new Set<string>([
  "name",
  "shortDescription",
  "description",
  "categoryId",
  "code",
  "initialSkuPrice",
  "deliveryMethods",
  "scheduledPublishAt",
  "inventoryPolicy",
  "certificateQueryUrl",
]);

function sectionForPublishTarget(target: PublishTarget): "basic" | "media" | "sales" {
  if (target === "product-cover" || target === "product-detail" || target === "media") return "media";
  if (
    target === "initialSkuPrice"
    || target === "deliveryMethods"
    || target === "product-skus"
    || target === "scheduledPublishAt"
    || target === "inventoryPolicy"
    || target === "sales"
  ) return "sales";
  return "basic";
}

function publishTargetForLabel(label: string, hasSavedProduct: boolean): PublishTarget {
  if (/主图|商品图片|公开展示|列表图/.test(label)) return "product-cover";
  if (/详情/.test(label)) return "product-detail";
  if (/成交价|商品价格|交易价格|有效规格|SKU|库存|一物一件/.test(label)) {
    return hasSavedProduct ? "product-skus" : "initialSkuPrice";
  }
  if (/配送/.test(label)) return "deliveryMethods";
  if (/简介/.test(label)) return "shortDescription";
  if (/说明/.test(label)) return "description";
  if (/货号/.test(label)) return "code";
  if (/分类|类目/.test(label)) return "categoryId";
  if (/定时/.test(label)) return "scheduledPublishAt";
  if (/标题|名称|促销|纯度|辟邪|保值|杀菌|防过敏/.test(label)) return "name";
  return "basic";
}

function gapsFromFormFields(errorFields: FormValidationError["errorFields"]): PublishGap[] {
  return errorFields.flatMap((field) => {
    const rawName = field.name;
    const key = String(Array.isArray(rawName) ? rawName[0] ?? "" : rawName ?? "");
    const label = field.errors?.find((item) => item.trim()) || "查看这里";
    const target = (FORM_JUMP_FIELDS.has(key) ? key : "basic") as PublishTarget;
    return [{ label, target }];
  });
}

function gapsForSubmitMessage(message: string, field: string | undefined, hasSavedProduct: boolean): PublishGap[] {
  const matched = message.match(/(?:上架前请补全|商品未达到发布条件)[:：]\s*([^。]+)/);
  if (matched) {
    return matched[1].split(/[、，]/).map((part) => part.trim()).filter(Boolean).map((label) => ({
      label,
      target: publishTargetForLabel(label, hasSavedProduct),
    }));
  }
  if (field === "shippingTemplateId") return [{ label: "销售信息", target: "sales" }];
  if (field && FORM_JUMP_FIELDS.has(field)) {
    const labels: Record<string, string> = {
      code: "货号",
      name: "商品标题",
      categoryId: "当前类目",
      shortDescription: "商品简介",
      description: "商品说明",
      scheduledPublishAt: "定时上架时间",
      certificateQueryUrl: "证书查验链接",
    };
    return [{ label: labels[field] || "查看对应位置", target: field as PublishTarget }];
  }
  if (/一物一件|有效 SKU/.test(message)) return [{ label: "规格与价格", target: "product-skus" }];
  if (/公开展示|主图/.test(message)) return [{ label: "实物主图", target: "product-cover" }];
  return [];
}

function clarifyPublicationGaps(missing: string): string {
  return missing
    .replace("已指定、可读取且授权有效的商品图片作为主图", "商品主图尚未允许网站公开展示")
    .replace("列表图如已指定，须可读取且授权有效", "列表图尚未允许网站公开展示");
}

function getProductSubmitFailure(error: unknown): ProductSubmitFailure<
  "code" | "categoryId" | "shippingTemplateId" | "scheduledPublishAt" | "name"
> {
  const requestError = error as EditorRequestError | undefined;
  const status = requestError?.status ?? requestError?.response?.status;
  const serverMessage = requestError?.message?.trim() || "";

  if (status === 409 && serverMessage.includes("商品货号")) {
    return { message: "该商品货号已存在，请更换货号后重试。", field: "code" };
  }
  if (status === 400 && serverMessage.includes("商品分类不存在")) {
    return { message: "所选商品分类不存在，请重新选择。", field: "categoryId" };
  }
  if (status === 400 && serverMessage.includes("运费模板不存在或已停用")) {
    return { message: "所选运费模板不存在或已停用，请重新选择。", field: "shippingTemplateId" };
  }
  if (status === 400 && serverMessage.includes("定时上架时间必须晚于当前时间")) {
    return { message: "定时上架时间必须晚于当前时间，请重新选择。", field: "scheduledPublishAt" };
  }
  if ((status === 400 || status === 422) && serverMessage.startsWith("发布前请补全")) {
    const missing = clarifyPublicationGaps(serverMessage.replace(/^发布前请补全[:：]?\s*/, ""));
    return { message: `商品未达到发布条件：${missing || "请按服务端提示补全资料"}。` };
  }
  if (status === 409 && serverMessage.includes("一物一件商品")) {
    return { message: `${serverMessage}。请调整有效 SKU 或库存后重试。` };
  }
  if (status === 409 && serverMessage.startsWith("已发布商品更新后不满足发布条件")) {
    return { message: `${serverMessage}。请按提示修正后重试。` };
  }
  if (status === 400 && serverMessage.includes("请填写商品名称")) {
    return { message: "请填写商品标题后重试。", field: "name" };
  }
  if (status === 400 && serverMessage.includes("请填写商品货号")) {
    return { message: "请填写商品货号后重试。", field: "code" };
  }
  if (status === 400 && serverMessage.includes("请选择") && serverMessage.includes("商品分类")) {
    return { message: "请选择有效的商品分类后重试。", field: "categoryId" };
  }
  if (status === 409 && /[\u4e00-\u9fff]/.test(serverMessage)) {
    return { message: /[。！]$/.test(serverMessage) ? serverMessage : `${serverMessage}。` };
  }
  return { message: getSafeAdminErrorMessage(error, "商品保存失败，请检查填写内容后重试。") };
}

function isAmbiguousProductWriteFailure(error: unknown): boolean {
  const requestError = error as EditorRequestError | undefined;
  const status = requestError?.status ?? requestError?.response?.status;
  return status === undefined || status >= 500;
}

function getSkuSubmitFailure(error: unknown): ProductSubmitFailure<"skuCode"> {
  const requestError = error as EditorRequestError | undefined;
  const status = requestError?.status ?? requestError?.response?.status;
  const serverMessage = requestError?.message?.trim() || "";
  if (status === 409 && serverMessage.replace(/\s/g, "").includes("SKU编码已存在")) {
    return { message: "该 SKU 编码已存在，请更换编码后重试。", field: "skuCode" };
  }
  if (status === 409 && serverMessage.includes("一物一件商品")) {
    return { message: `${serverMessage}。请保留一个有效 SKU，并到库存管理确认总量为 0 或 1。` };
  }
  if (status === 409 && serverMessage.startsWith("已发布商品更新后不满足发布条件")) {
    return { message: `${serverMessage}。请按提示修正后重试。` };
  }
  return { message: getSafeAdminErrorMessage(error, "SKU 保存失败，请检查规格信息后重试。") };
}
const materials = [
  ["GOLD_999", "足金999"], ["GOLD_9999", "足金9999"], ["AU750", "18K金"],
  ["PT950", "铂金PT950"], ["S925", "S925银"], ["DIAMOND", "钻石"],
  ["JADE", "翡翠玉石"], ["PEARL", "珍珠"], ["COLOR_GEM", "彩色宝石"], ["OTHER", "其他"],
].map(([value, label]) => ({ value, label }));

const statusMeta: Record<ProductStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  PUBLISHED: { label: "已上架", color: "green" },
  OFFLINE: { label: "仓库中", color: "orange" },
  ARCHIVED: { label: "回收站", color: "red" },
};

const salesModeLabelsForPreview: Record<SalesMode, string> = {
  DISPLAY_ONLY: "仅展示",
  SELECTION: "选款咨询",
  APPOINTMENT: "预约到店",
  DIRECT_PURCHASE: "直接销售",
  CUSTOM_INQUIRY: "定制咨询",
};

const DELIVERY_METHOD_OPTIONS = [
  { label: "物流配送", value: "EXPRESS" },
  { label: "到店自提", value: "STORE_PICKUP" },
  { label: "专人配送", value: "DEDICATED" },
] as const;

function normalizeDeliveryMethods(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string =>
    item === "EXPRESS" || item === "STORE_PICKUP" || item === "DEDICATED");
}

type EditorStockRow = { id: number; quantity: number };

function readEditorStockRows(payload: unknown, productId: number): { rows: EditorStockRow[]; total: number } {
  if (!payload || typeof payload !== "object") return { rows: [], total: 0 };
  const body = payload as { list?: unknown; total?: unknown };
  const list = Array.isArray(body.list) ? body.list : [];
  const total = Number(body.total);
  const rows = list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as {
      id?: number;
      quantity?: number;
      productId?: number;
      sku?: { product?: { id?: number } };
    };
    if (!Number.isInteger(row.id)) return [];
    const ownerId = row.sku?.product?.id ?? row.productId;
    if (ownerId != null && ownerId !== productId) return [];
    const quantity = Number(row.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity < 0) return [];
    return [{ id: row.id as number, quantity }];
  });
  return { rows, total: Number.isFinite(total) ? total : rows.length };
}

async function readProductStock(productId: number) {
  const data = unwrapResponse<unknown>(await inventoryApi.getList({
    page: 1,
    pageSize: 20,
    productIds: String(productId),
  }));
  return readEditorStockRows(data, productId);
}

function moveGalleryKey(keys: string[], fromKey: string, toIndex: number): string[] | null {
  const fromIndex = keys.indexOf(fromKey);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= keys.length || fromIndex === toIndex) return null;
  const next = keys.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

const defaultValues: Partial<ProductEditorFormValues> = {
  condition: "NEW",
  visibility: "PUBLIC",
  salesMode: "DIRECT_PURCHASE",
  inventoryPolicy: "STANDARD",
  purchaseRegion: "MAINLAND",
  publishMode: "IMMEDIATE",
  fulfillmentType: "IN_STOCK",
  dispatchTime: "WITHIN_48_HOURS",
  deliveryMethods: [],
  requiresInsuredShipping: false,
  requiresSignature: false,
  includesCertificate: false,
};

const PRODUCT_FRAME_KEY = "haichuan.product-publish-frame.v1";

type ProductPublishFrame = {
  salesMode: SalesMode;
  visibility: NonNullable<ProductEditorFormValues["visibility"]>;
  publishMode: ProductEditorFormValues["publishMode"];
  inventoryPolicy: InventoryPolicy;
  materialType?: MaterialType;
  shortDescription?: string;
  description?: string;
  deliveryMethods?: string[];
};

function readProductPublishFrame(): ProductPublishFrame | null {
  try {
    const raw = localStorage.getItem(PRODUCT_FRAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProductPublishFrame>;
    if (!parsed || parsed.salesMode == null || parsed.visibility == null || parsed.publishMode == null || parsed.inventoryPolicy == null) return null;
    return {
      salesMode: parsed.salesMode,
      visibility: parsed.visibility,
      publishMode: parsed.publishMode,
      inventoryPolicy: parsed.inventoryPolicy,
      materialType: parsed.materialType || undefined,
      shortDescription: typeof parsed.shortDescription === "string" ? parsed.shortDescription : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      deliveryMethods: normalizeDeliveryMethods(parsed.deliveryMethods),
    };
  } catch {
    return null;
  }
}

function frameToFormValues(frame: ProductPublishFrame): Partial<ProductEditorFormValues> {
  return {
    salesMode: frame.salesMode,
    visibility: frame.visibility,
    publishMode: frame.publishMode,
    inventoryPolicy: frame.inventoryPolicy,
    ...(frame.materialType ? { materialType: frame.materialType } : {}),
    ...(frame.shortDescription ? { shortDescription: frame.shortDescription } : {}),
    ...(frame.description ? { description: frame.description } : {}),
    ...(frame.deliveryMethods && frame.deliveryMethods.length > 0 ? { deliveryMethods: frame.deliveryMethods } : {}),
  };
}

function sharedSkuPrice(items: ProductSKU[]): number | undefined {
  const prices = items
    .filter((sku) => sku.isActive !== false)
    .map((sku) => Number(sku.price))
    .filter((price) => price > 0);
  const unique = [...new Set(prices)];
  return unique.length === 1 ? unique[0] : undefined;
}

function flattenCategories(nodes: Category[], prefix = ""): { value: number; label: string }[] {
  return (nodes || []).flatMap((node) => {
    const label = `${prefix}${node.name}`;
    return [{ value: node.id, label }, ...flattenCategories(node.children || [], `${label} / `)];
  });
}

export default function ProfessionalProductEditor() {
  const { message: messageApi, modal } = AntdApp.useApp();
  const { id } = useParams();
  const parsedEditingId = Number(id);
  const editingId = id && Number.isInteger(parsedEditingId) && parsedEditingId > 0 ? parsedEditingId : null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedReturnPath = searchParams.get("returnTo");
  const returnPath = normalizeAdminReturnPath(requestedReturnPath) || "/admin/products";
  const returnPathQuery = requestedReturnPath
    ? `?returnTo=${encodeURIComponent(returnPath)}`
    : "";
  const commerceEnabled = useCommerceEnabled();
  const role = useAuthStore((state) => state.user?.role);
  const canGovernPublic = role === "SUPER_ADMIN" || role === "ADMIN";
  const [form] = Form.useForm<ProductEditorFormValues>();
  const [active, setActive] = useState("basic");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [publishGaps, setPublishGaps] = useState<PublishGap[]>([]);
  const [pendingSaveVerification, setPendingSaveVerification] = useState<PendingSaveVerification | null>(null);
  const [saveVerificationLoading, setSaveVerificationLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string>();
  const [currentStatus, setCurrentStatus] = useState<ProductStatus>("DRAFT");
  const [currentReviewStatus, setCurrentReviewStatus] = useState<"DRAFT" | "IN_REVIEW">("DRAFT");
  const [categories, setCategories] = useState<{ value: number; label: string }[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [primaryImageId, setPrimaryImageId] = useState<number | null>(null);
  const [mediaActionId, setMediaActionId] = useState<number | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [detail, setDetail] = useState<DetailDraft[]>([]);
  const [detailPickerOpen, setDetailPickerOpen] = useState(false);
  const [previewPane, setPreviewPane] = useState<"photos" | "detail" | "copy">("detail");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<Partial<ProductEditorFormValues>>({});
  const [skuForm] = Form.useForm<ProductSkuWriteInput>();
  const [skus, setSkus] = useState<ProductSKU[]>([]);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<ProductSKU | null>(null);
  const [skuSaving, setSkuSaving] = useState(false);
  const [skuActionId, setSkuActionId] = useState<number | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const savingRef = useRef(false);
  const pendingMediaRef = useRef<PendingMedia[]>([]);
  const mediaAssetIdsByImage = useRef(new Map<number, number>());
  const uploadSelectionRef = useRef<File[] | null>(null);
  const detailUploadSelectionRef = useRef<File[] | null>(null);
  const [authorizingImages, setAuthorizingImages] = useState(false);
  const activeEditorRef = useRef(true);
  const [currentProductId, setCurrentProductId] = useState<number | null>(editingId);
  const [publishFrame, setPublishFrame] = useState<ProductPublishFrame | null>(() => readProductPublishFrame());
  const [galleryOrder, setGalleryOrder] = useState<string[]>([]);
  const [draggingGalleryKey, setDraggingGalleryKey] = useState<string | null>(null);
  const draggingGalleryKeyRef = useRef<string | null>(null);
  const [galleryDropKey, setGalleryDropKey] = useState<string | null>(null);
  const [stockRowCount, setStockRowCount] = useState(0);
  const [stockHint, setStockHint] = useState<string>();

  const galleryImages = useMemo(
    () => images.filter((item) => !item.isVideo && (item.sortOrder ?? 0) < DETAIL_ONLY_IMAGE_SORT_FLOOR),
    [images],
  );
  const naturalGalleryKeys = useMemo(() => [
    ...galleryImages.map((item) => `saved-${item.id}`),
    ...pendingMedia.filter((item) => item.purpose !== "detail").map((item) => item.key),
  ], [galleryImages, pendingMedia]);
  const orderedGalleryKeys = useMemo(() => {
    const known = new Set(naturalGalleryKeys);
    const kept = galleryOrder.filter((key) => known.has(key));
    return [...kept, ...naturalGalleryKeys.filter((key) => !kept.includes(key))];
  }, [galleryOrder, naturalGalleryKeys]);
  const mediaChoices = useMemo<MediaChoice[]>(() => {
    const byKey = new Map<string, MediaChoice>();
    for (const item of galleryImages) {
      byKey.set(`saved-${item.id}`, {
        key: `saved-${item.id}`,
        imageId: item.id,
        label: `已上传图片 #${item.id}`,
        src: item.mediaUrl || item.url,
      });
    }
    pendingMedia.filter((item) => item.purpose !== "detail").forEach((item, index) => {
      byKey.set(item.key, {
        key: item.key,
        label: `待上传图片 ${index + 1}`,
        src: item.preview,
        pending: true,
      });
    });
    return orderedGalleryKeys.flatMap((key) => {
      const choice = byKey.get(key);
      return choice ? [choice] : [];
    });
  }, [galleryImages, orderedGalleryKeys, pendingMedia]);
  const mediaSrcByKey = useMemo(() => {
    const sources = new Map<string, string>();
    for (const image of images) {
      if (!image.isVideo && (image.mediaUrl || image.url)) sources.set(`saved-${image.id}`, image.mediaUrl || image.url);
    }
    for (const item of pendingMedia) sources.set(item.key, item.preview);
    return sources;
  }, [images, pendingMedia]);
  const selectedCategoryId = Form.useWatch("categoryId", form);
  const selectedPublishMode = Form.useWatch("publishMode", form) || "IMMEDIATE";
  const selectedSalesMode = (Form.useWatch("salesMode", form) || "DIRECT_PURCHASE") as SalesMode;
  const selectedInventoryPolicy = (Form.useWatch("inventoryPolicy", form) || "STANDARD") as InventoryPolicy;
  const isReviewLocked = currentReviewStatus === "IN_REVIEW";
  const isRoleReadOnly = isReviewLocked || (!canGovernPublic && currentStatus !== "DRAFT");
  const selectedCategoryLabel = categories.find((item) => item.value === selectedCategoryId)?.label;
  const watchedName = Form.useWatch("name", form);
  const watchedCode = Form.useWatch("code", form);
  const watchedDescription = Form.useWatch("description", form);
  const watchedVisibility = Form.useWatch("visibility", form) || "PUBLIC";
  const watchedPrice = Form.useWatch("initialSkuPrice", form);
  const identityReady = isMeaningfulProductText(watchedName, 2)
    && typeof watchedCode === "string"
    && watchedCode.trim().length > 0
    && Boolean(selectedCategoryId);
  const coverReady = primaryImageId != null || galleryImages.length > 0 || pendingMedia.some((item) => item.purpose !== "detail");
  const titleEmpty = !isMeaningfulProductText(watchedName, 2);
  const codeEmpty = typeof watchedCode !== "string" || watchedCode.trim().length === 0;
  const categoryEmpty = !selectedCategoryId;
  const photoRequired = watchedVisibility !== "INTERNAL";
  const priceRequired = selectedSalesMode === "DIRECT_PURCHASE";
  const priceEmpty = priceRequired && !(Number(watchedPrice) > 0 || skus.some((sku) => sku.isActive !== false && Number(sku.price) > 0));
  const publishSteps = [
    { title: "1 写下作品", state: identityReady ? "done" : "wait", detail: identityReady ? "标题、货号和类目已填写" : "先写标题、货号，并选择类目" },
    { title: "2 核对事实", state: "note", detail: "材质、克重、宝石和证书知道再写，不编造" },
    { title: "3 放上主图", state: coverReady ? "done" : "wait", detail: coverReady ? "已有这件作品的照片" : "公开前上传实物照片，不要拼图或写促销" },
    { title: "4 选择公开", state: "note", detail: selectedSalesMode === "DIRECT_PURCHASE" ? "直接销售填写一个成交价，然后选择可见范围和上架时间" : "咨询、预约或定制不填写价格" },
  ];

  const applyCanonicalProduct = useCallback((product: ProductEditorRecord) => {
    const loadedStatus = (product.status || "DRAFT") as ProductStatus;
    setCurrentStatus(loadedStatus);
    setCurrentReviewStatus(product.reviewStatus || "DRAFT");
    const loadedImages = product.images || [];
    setGalleryOrder([]);
    setImages(loadedImages);
    for (const image of loadedImages) {
      const mediaAssetId = (image as ProductImage & { mediaAssetId?: number | null }).mediaAssetId;
      if (image.id && mediaAssetId) mediaAssetIdsByImage.current.set(image.id, mediaAssetId);
    }
    setPrimaryImageId(product.primaryImageId ?? product.primaryImage?.id ?? null);
    setSkus(product.skus || []);
    setDetail((product.detailContent || []).map((block: ProductDetailBlock, index: number) => ({
      ...block,
      key: `detail-${index}-${Date.now()}`,
    })));
    // 保存后的权威 GET 可能规范化或清空字段；先重置，避免缺失字段沿用提交前的本地值。
    form.resetFields();
    form.setFieldsValue({
      ...defaultValues,
      ...product,
      derivedPrice: product.price,
      initialSkuPrice: sharedSkuPrice(product.skus || []),
      price: undefined,
      publishMode: loadedStatus === "PUBLISHED" ? "IMMEDIATE" : product.publishMode || "WAREHOUSE",
      scheduledPublishAt: product.scheduledPublishAt ? dayjs(product.scheduledPublishAt) : null,
      gemType: product.gemInfo?.type,
      gemCarat: product.gemInfo?.carat,
      gemClarity: product.gemInfo?.clarity,
      gemColor: product.gemInfo?.color,
      gemCut: product.gemInfo?.cut,
      gemQuantity: product.gemInfo?.quantity,
      certificateAuthority: product.gemInfo?.certificateAuthority,
      certificateNumber: product.gemInfo?.certificateNumber,
      certificateQueryUrl: product.gemInfo?.certificateQueryUrl,
      brand: product.gemInfo?.brand,
      collection: product.gemInfo?.collection,
      style: product.gemInfo?.style,
      occasion: product.gemInfo?.occasion,
      condition: "NEW",
      craftTechnique: Array.isArray(product.craftTechnique) ? product.craftTechnique : [],
    });
  }, [form]);

  const dismissSubmitError = () => {
    setSubmitError(undefined);
    setPublishGaps([]);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(undefined);
    dismissSubmitError();
    setCurrentProductId(editingId);
    setCurrentStatus("DRAFT");
    setCurrentReviewStatus("DRAFT");
    setPrimaryImageId(null);
    setSkus([]);
    setSavedAt(undefined);

    if (id && !editingId) {
      setLoadError("商品地址无效。请返回商品列表后重新进入编辑页面。");
      setLoading(false);
      return () => { mounted = false; };
    }

    const productRequest = editingId ? productApi.getById(editingId) : Promise.resolve(null);
    Promise.all([categoryApi.getManageTree(), productRequest])
      .then(async ([categoryRes, productRes]) => {
        if (!mounted) return;
        setCategories(flattenCategories(unwrapResponse<Category[]>(categoryRes)));
        if (productRes) {
          const product = unwrapResponse<ProductEditorRecord>(productRes);
          applyCanonicalProduct(product);
          const canStock = role === "SUPER_ADMIN" || role === "ADMIN" || role === "WAREHOUSE";
          const loadedActiveSkus = (product.skus || []).filter((sku) => sku.isActive !== false).length;
          if (canStock && product.salesMode === "DIRECT_PURCHASE" && loadedActiveSkus <= 1) {
            try {
              const stock = await readProductStock(product.id);
              if (!mounted) return;
              setStockRowCount(stock.total > stock.rows.length ? stock.total : stock.rows.length);
              if (stock.rows.length === 1 && stock.total <= 1) form.setFieldValue("stockQuantity", stock.rows[0].quantity);
            } catch {
              if (!mounted) return;
              setStockHint("暂时读不到现有库存。保存时会再读一次。");
            }
          } else {
            setStockRowCount(loadedActiveSkus > 1 ? loadedActiveSkus : 0);
          }
        } else {
          const frame = readProductPublishFrame();
          if (frame) form.setFieldsValue(frameToFormValues(frame));
        }
        if (!mounted) return;
        setDirty(false);
        setLoading(false);
      }).catch((error) => {
        if (!mounted) return;
        setLoadError(getSafeAdminErrorMessage(error, editingId
          ? "商品信息加载失败。请重新加载后重试。"
          : "商品编辑所需的类目加载失败。请重新加载后重试。"));
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [applyCanonicalProduct, editingId, form, id, loadAttempt, role]);

  useEffect(() => {
    pendingMediaRef.current = pendingMedia;
  }, [pendingMedia]);

  useEffect(() => {
    activeEditorRef.current = true;
    return () => {
      activeEditorRef.current = false;
    };
  }, []);

  useEffect(() => () => {
    pendingMediaRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
  }, []);

  useEffect(() => {
    if (!dirty || saving) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, saving]);

  const markDirty = () => setDirty(true);
  const addPendingMedia = (_file: File, fileList: File[]) => {
    if (uploadSelectionRef.current === fileList) return Upload.LIST_IGNORE;
    uploadSelectionRef.current = fileList;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const galleryPending = pendingMedia.filter((item) => item.purpose !== "detail").length;
    const room = 9 - galleryImages.length - galleryPending;
    if (room <= 0) {
      messageApi.warning("最多上传 9 张，请先移除不需要的图片");
      return Upload.LIST_IGNORE;
    }
    const accepted: PendingMedia[] = [];
    let skippedType = 0;
    let skippedSize = 0;
    let skippedDuplicate = 0;
    fileList.forEach((candidate, index) => {
      if (accepted.length >= room) return;
      if (!allowedTypes.includes(candidate.type)) {
        skippedType += 1;
        return;
      }
      if (candidate.size / 1024 / 1024 > 10) {
        skippedSize += 1;
        return;
      }
      const sameFile = (item: { file: File }) => item.file.name === candidate.name && item.file.size === candidate.size && item.file.lastModified === candidate.lastModified;
      if (pendingMedia.some(sameFile) || accepted.some(sameFile)) {
        skippedDuplicate += 1;
        return;
      }
      accepted.push({
        key: `pending-${candidate.lastModified}-${candidate.size}-${index}-${candidate.name}`,
        file: candidate,
        preview: URL.createObjectURL(candidate),
      });
    });
    if (accepted.length > 0) {
      setPendingMedia((prev) => [...prev, ...accepted]);
      markDirty();
    }
    const overflow = fileList.length - skippedType - skippedSize - skippedDuplicate - accepted.length;
    if (skippedType > 0) messageApi.error("有图片不是 JPG、PNG、WebP 或 GIF，已跳过");
    if (skippedSize > 0) messageApi.error("有图片超过 10MB，已跳过");
    if (skippedDuplicate > 0) messageApi.warning("重复的图片已跳过");
    if (overflow > 0) messageApi.warning(`一次最多还能加 ${room} 张，多出的 ${overflow} 张没有加入`);
    return Upload.LIST_IGNORE;
  };

  const addDetailMedia = (_file: File, fileList: File[]) => {
    if (detailUploadSelectionRef.current === fileList) return Upload.LIST_IGNORE;
    detailUploadSelectionRef.current = fileList;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const room = 20 - detail.filter((block) => block.type === "IMAGE").length;
    if (room <= 0) {
      messageApi.warning("详情图最多 20 张，请先删掉不需要的");
      return Upload.LIST_IGNORE;
    }
    const accepted: PendingMedia[] = [];
    let skippedType = 0;
    let skippedSize = 0;
    let skippedDuplicate = 0;
    fileList.forEach((candidate, index) => {
      if (accepted.length >= room) return;
      if (!allowedTypes.includes(candidate.type)) {
        skippedType += 1;
        return;
      }
      if (candidate.size / 1024 / 1024 > 10) {
        skippedSize += 1;
        return;
      }
      const sameFile = (item: { file: File }) => item.file.name === candidate.name && item.file.size === candidate.size && item.file.lastModified === candidate.lastModified;
      if (pendingMedia.some(sameFile) || accepted.some(sameFile)) {
        skippedDuplicate += 1;
        return;
      }
      accepted.push({
        key: `detail-${candidate.lastModified}-${candidate.size}-${index}-${candidate.name}`,
        file: candidate,
        preview: URL.createObjectURL(candidate),
        purpose: "detail",
      });
    });
    if (accepted.length > 0) {
      setPendingMedia((prev) => [...prev, ...accepted]);
      setDetail((prev) => [
        ...prev,
        ...accepted.map((item) => ({ key: `block-${item.key}`, type: "IMAGE" as const, pendingMediaKey: item.key })),
      ]);
      setPreviewPane("detail");
      markDirty();
    }
    const overflow = fileList.length - skippedType - skippedSize - skippedDuplicate - accepted.length;
    if (skippedType > 0) messageApi.error("有图片不是 JPG、PNG、WebP 或 GIF，已跳过");
    if (skippedSize > 0) messageApi.error("有图片超过 10MB，已跳过");
    if (skippedDuplicate > 0) messageApi.warning("重复的图片已跳过");
    if (overflow > 0) messageApi.warning(`详情图最多还能加 ${room} 张，多出的 ${overflow} 张没有加入`);
    return Upload.LIST_IGNORE;
  };

  const addGalleryImageToDetail = (choice: MediaChoice) => {
    if (detail.filter((block) => block.type === "IMAGE").length >= 20) {
      messageApi.warning("详情图最多 20 张，请先删掉不需要的");
      return;
    }
    setDetail((prev) => [...prev, {
      key: `detail-pick-${choice.key}-${Date.now()}`,
      type: "IMAGE",
      imageId: choice.imageId,
      pendingMediaKey: choice.pending ? choice.key : undefined,
    }]);
    setDetailPickerOpen(false);
    setPreviewPane("detail");
    markDirty();
  };

  const removePendingMedia = (key: string) => {
    setPendingMedia((prev) => {
      const target = prev.find((item) => item.key === key);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((item) => item.key !== key);
    });
    setDetail((prev) => prev.map((block) => block.pendingMediaKey === key
      ? { ...block, pendingMediaKey: undefined, imageId: undefined }
      : block));
    markDirty();
  };

  const uploadPending = async (productId: number) => {
    const idMap = new Map<string, number>();
    const mediaToUpload = [...pendingMedia];
    let assignedCoverId: number | null = null;
    const shouldAssignCover = primaryImageId == null && galleryImages.length === 0;
    let gallerySort = galleryImages.length;
    let detailSort = DETAIL_ONLY_IMAGE_SORT_FLOOR + images.filter((item) => !item.isVideo && (item.sortOrder ?? 0) >= DETAIL_ONLY_IMAGE_SORT_FLOOR).length;
    for (let index = 0; index < mediaToUpload.length; index += 1) {
      const media = mediaToUpload[index];
      const isDetail = media.purpose === "detail";
      const visualIndex = orderedGalleryKeys.indexOf(media.key);
      const uploaded = unwrapResponse<UploadedProductMedia[]>(await uploadApi.uploadProductImage(media.file))[0];
      if (!uploaded?.storageKey || !uploaded.mediaAssetId) throw new EditorUserError("图片上传失败，请重新选择图片后重试");
      const created = unwrapResponse<ProductImage>(await productApi.addImage(productId, {
        mediaAssetId: uploaded.mediaAssetId,
        storageKey: uploaded.storageKey,
        url: uploaded.url,
        type: isDetail ? "DETAIL" : gallerySort === 0 ? "FRONT" : "SIDE",
        sortOrder: isDetail ? detailSort : visualIndex >= 0 ? visualIndex : gallerySort,
        width: uploaded.width,
        height: uploaded.height,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
      }));
      if (!created?.id) throw new EditorUserError("图片关联失败，请重新加载后重试");
      if (uploaded.mediaAssetId) mediaAssetIdsByImage.current.set(created.id, uploaded.mediaAssetId);
      if (!isDetail && shouldAssignCover && assignedCoverId == null && !created.isVideo) {
        await productApi.setCoverImage(productId, created.id);
        setPrimaryImageId(created.id);
        assignedCoverId = created.id;
      }
      if (isDetail) detailSort += 1;
      else gallerySort += 1;
      idMap.set(media.key, created.id);
      setPendingMedia((prev) => prev.filter((item) => item.key !== media.key));
      setImages((prev) => [...prev, created]);
      setDetail((prev) => prev.map((block) => block.pendingMediaKey === media.key
        ? { ...block, pendingMediaKey: undefined, imageId: created.id }
        : block));
      URL.revokeObjectURL(media.preview);
    }
    return { idMap, assignedCoverId };
  };

  const confirmProductImagesPublic = async () => {
    const assetIds = [...new Set(mediaAssetIdsByImage.current.values())];
    if (assetIds.length === 0) {
      messageApi.warning("没有可确认的图片，请先上传作品图片");
      return;
    }
    setAuthorizingImages(true);
    try {
      for (const assetId of assetIds) {
        await uploadApi.authorizeMediaPublicUse(assetId, true);
      }
      dismissSubmitError();
      messageApi.success("已记录这些图片可以在网站公开展示。请再次点击上架。");
    } catch (error) {
      messageApi.error(getSafeAdminErrorMessage(error, "图片公开确认未完成，请稍后重试"));
    } finally {
      setAuthorizingImages(false);
    }
  };

  const buildContentPayload = (values: ProductEditorFormValues): ProductWriteInput => ({
    name: values.name?.trim() || `未命名商品-${values.code}`,
    code: values.code,
    categoryId: values.categoryId,
    shortDescription: values.shortDescription || null,
    description: values.description || null,
    materialType: values.materialType || "OTHER",
    goldWeight: values.goldWeight ?? 0,
    craftFee: values.craftFee ?? 0,
    weight: values.weight ?? 0,
    size: values.size || null,
    gemInfo: {
      type: values.gemType, carat: values.gemCarat, clarity: values.gemClarity,
      color: values.gemColor, cut: values.gemCut, quantity: values.gemQuantity,
      brand: values.brand, collection: values.collection, style: values.style, occasion: values.occasion,
      condition: "NEW",
      certificateAuthority: values.certificateAuthority,
      certificateNumber: values.certificateNumber,
      certificateQueryUrl: values.certificateQueryUrl,
    },
    craftTechnique: values.craftTechnique || [],
    visibility: values.visibility,
    salesMode: values.salesMode,
    inventoryPolicy: values.inventoryPolicy,
    purchaseRegion: values.purchaseRegion,
    fulfillmentType: values.fulfillmentType,
    dispatchTime: values.dispatchTime,
    shippingTemplateId: values.deliveryMethods?.includes("EXPRESS") ? values.shippingTemplateId || null : null,
    deliveryMethods: normalizeDeliveryMethods(values.deliveryMethods),
    requiresInsuredShipping: values.requiresInsuredShipping,
    requiresSignature: values.requiresSignature,
    includesCertificate: values.includesCertificate,
    packageType: values.packageType || null,
    customLeadTime: values.dispatchTime === "CUSTOM"
      ? values.customLeadTime?.trim() || null
      : null,
    isHot: values.isHot || false,
    isNew: values.isNew || false,
    isRecommended: values.isRecommended || false,
    isLimited: values.isLimited || false,
    isCustom: values.isCustom || false,
  });

  const refreshProduct = async (productId: number) => {
    const refreshed = unwrapResponse<ProductEditorRecord>(await productApi.getById(productId));
    if (refreshed.id !== productId) {
      throw new Error("product-save-readback-identity-mismatch");
    }
    if (activeEditorRef.current) applyCanonicalProduct(refreshed);
    return refreshed;
  };

  const retrySaveVerification = async () => {
    const pending = pendingSaveVerification;
    if (!pending || saveVerificationLoading) return;
    try {
      setSaveVerificationLoading(true);
      await refreshProduct(pending.productId);
      if (!activeEditorRef.current) return;
      setPendingSaveVerification(null);
      dismissSubmitError();
      setDirty(false);
      setSavedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      messageApi.success("商品保存结果已确认");
      if (!editingId) {
        navigate(`/admin/products/${pending.productId}/edit${returnPathQuery}`, {
          replace: true,
        });
      }
    } catch {
      if (!activeEditorRef.current) return;
      messageApi.warning("仍无法读取商品最新状态；请稍后继续重试，系统不会重复写入");
    } finally {
      if (activeEditorRef.current) setSaveVerificationLoading(false);
    }
  };

  const confirmDeleteImage = (imageId: number) => {
    if (!currentProductId || mediaActionId !== null) return;
    if (dirty) {
      messageApi.warning("请先保存当前修改，再删除已上传图片");
      return;
    }
    if (detail.some((block) => block.imageId === imageId)) {
      messageApi.warning("这张图片正在商品详情中使用，请先移除对应详情模块并保存");
      return;
    }
    modal.confirm({
      title: "确认删除这张商品图片？",
      content: primaryImageId === imageId
        ? "这是当前主图。删除后，剩下的第一张图片会成为主图。"
        : "删除后无法在当前商品中继续使用这张图片。",
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          setMediaActionId(imageId);
          await productApi.deleteImage(currentProductId, imageId);
          const refreshed = await refreshProduct(currentProductId);
          const nextCover = (refreshed.images || []).find((item) => !item.isVideo);
          if (!refreshed.primaryImageId && nextCover?.id) {
            await productApi.setCoverImage(currentProductId, nextCover.id);
            await refreshProduct(currentProductId);
          }
          messageApi.success("商品图片已删除");
        } catch (error) {
          messageApi.error(getSafeAdminErrorMessage(error, "商品图片删除失败，请重新加载后重试。"));
          throw error;
        } finally {
          setMediaActionId(null);
        }
      },
    });
  };

  const jumpToPublishTarget = (target: PublishTarget) => {
    setActive(sectionForPublishTarget(target));
    window.setTimeout(() => {
      const mark = (node: Element | null | undefined) => {
        const item = node?.closest(".ant-form-item, .pro-editor__row-label, .pro-editor__detail-head, .pro-editor__sku-panel") || node;
        if (!item) return;
        item.classList.add("pro-editor__jump-target");
        window.setTimeout(() => item.classList.remove("pro-editor__jump-target"), 1600);
      };
      if (FORM_JUMP_FIELDS.has(target)) {
        form.scrollToField(target, { behavior: "smooth", block: "center" });
        window.setTimeout(() => {
          const instance = form.getFieldInstance(target) as { focus?: () => void } | undefined;
          instance?.focus?.();
          mark(document.getElementById(`product-editor-main_${target}`));
        }, 250);
        return;
      }
      const anchor = document.getElementById(target);
      anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
      mark(anchor);
    }, 30);
  };

  const applySharedPrice = async (productId: number, values: ProductEditorFormValues) => {
    if (values.salesMode !== "DIRECT_PURCHASE") return;
    const typedPrice = Number(values.initialSkuPrice);
    if (!Number.isFinite(typedPrice) || typedPrice <= 0) return;
    const active = skus.filter((sku) => sku.isActive !== false);
    const unpriced = active.filter((sku) => !(Number(sku.price) > 0));
    for (const sku of unpriced) {
      await productApi.updateSku(productId, sku.id, {
        skuCode: sku.skuCode,
        material: sku.material,
        size: sku.size || undefined,
        goldWeight: sku.goldWeight ?? 0,
        price: typedPrice,
        isActive: true,
      });
    }
    if (active.length === 0) {
      await productApi.createSku(productId, {
        skuCode: `${values.code}-DEFAULT`,
        material: values.materialType || "OTHER",
        size: values.size || undefined,
        goldWeight: values.goldWeight ?? 0,
        price: typedPrice,
        isActive: true,
      });
    }
  };

  const savePublishFrame = () => {
    const values = form.getFieldsValue(true);
    const frame: ProductPublishFrame = {
      salesMode: values.salesMode || "DIRECT_PURCHASE",
      visibility: values.visibility || "PUBLIC",
      publishMode: values.publishMode || "IMMEDIATE",
      inventoryPolicy: values.inventoryPolicy || "STANDARD",
      materialType: values.materialType || undefined,
      shortDescription: typeof values.shortDescription === "string" ? values.shortDescription.trim() : "",
      description: typeof values.description === "string" ? values.description.trim() : "",
      deliveryMethods: normalizeDeliveryMethods(values.deliveryMethods),
    };
    try {
      localStorage.setItem(PRODUCT_FRAME_KEY, JSON.stringify(frame));
    } catch {
      messageApi.error("当前浏览器不能保存上架框架");
      return;
    }
    setPublishFrame(frame);
    messageApi.success("已存成上架框架。下一件新商品会带上这些设置");
  };

  const clearPublishFrame = () => {
    try {
      localStorage.removeItem(PRODUCT_FRAME_KEY);
    } catch {
      messageApi.error("当前浏览器不能清除上架框架");
      return;
    }
    setPublishFrame(null);
    messageApi.success("已恢复最初默认。下一件新商品不再沿用已存设置");
  };

  const moveGalleryItem = (fromKey: string, toIndex: number) => {
    if (saving || isRoleReadOnly) return;
    const next = moveGalleryKey(orderedGalleryKeys, fromKey, toIndex);
    if (!next) return;
    setGalleryOrder(next);
    setPendingMedia((prev) => {
      const pendingByKey = new Map(prev.filter((item) => item.purpose !== "detail").map((item) => [item.key, item]));
      const orderedPending = next.flatMap((key) => {
        const item = pendingByKey.get(key);
        return item ? [item] : [];
      });
      return [...orderedPending, ...prev.filter((item) => item.purpose === "detail")];
    });
    markDirty();
  };

  const persistGalleryOrder = async (productId: number, idMap: Map<string, number>, assignedCoverId: number | null) => {
    const resolved = orderedGalleryKeys.flatMap((key) => {
      if (key.startsWith("saved-")) {
        const imageId = Number(key.slice("saved-".length));
        return Number.isInteger(imageId) && imageId > 0 ? [imageId] : [];
      }
      const createdId = idMap.get(key);
      return createdId ? [createdId] : [];
    });
    if (resolved.length === 0) return;
    const sortById = new Map(galleryImages.map((image) => [image.id, image.sortOrder ?? 0]));
    const createdIds = new Set(idMap.values());
    for (let index = 0; index < resolved.length; index += 1) {
      const imageId = resolved[index];
      if (createdIds.has(imageId)) continue;
      if (sortById.get(imageId) === index) continue;
      await productApi.updateImage(productId, imageId, { sortOrder: index });
    }
    const firstId = resolved[0];
    if (firstId && firstId !== primaryImageId && firstId !== assignedCoverId) {
      await productApi.setCoverImage(productId, firstId);
      setPrimaryImageId(firstId);
    }
    setGalleryOrder([]);
  };

  const applyEditorStock = async (productId: number, values: ProductEditorFormValues) => {
    const canStock = role === "SUPER_ADMIN" || role === "ADMIN" || role === "WAREHOUSE";
    if (!canStock || values.salesMode !== "DIRECT_PURCHASE") return;
    const raw = values.stockQuantity;
    if (raw === undefined || raw === null) return;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new EditorUserError("可售数量须为大于或等于 0 的整数");
    }
    if ((values.inventoryPolicy || "STANDARD") === "SINGLE_UNIT" && quantity > 1) {
      throw new EditorUserError("一物一件的可售数量只能是 0 或 1");
    }
    const active = skus.filter((sku) => sku.isActive !== false).length;
    if (active > 1) return;
    let stock: { rows: EditorStockRow[]; total: number };
    try {
      stock = await readProductStock(productId);
    } catch (error) {
      throw new EditorUserError(getSafeAdminErrorMessage(error, "商品资料已保存，但可售数量没有写入。请到库存管理重试。"));
    }
    if (stock.rows.length !== 1 || stock.total > 1) {
      if (stock.rows.length === 0 && stock.total === 0) {
        throw new EditorUserError("商品资料已保存，但还没有读到库存记录。请到库存管理填写可售数量。");
      }
      return;
    }
    if (stock.rows[0].quantity === quantity) return;
    try {
      await inventoryApi.update(stock.rows[0].id, {
        type: "adjust",
        quantity,
        expectedQuantity: stock.rows[0].quantity,
        remark: "商品编辑页填写可售数量",
      });
    } catch (error) {
      const status = (error as EditorRequestError).status ?? (error as EditorRequestError).response?.status;
      if (status === 409) {
        throw new EditorUserError("商品资料已保存，但可售数量已在别处变化。请重新加载后再填写。");
      }
      throw new EditorUserError(getSafeAdminErrorMessage(error, "商品资料已保存，但可售数量没有写入。请到库存管理重试。"));
    }
  };

  const save = async (intent: "draft" | "primary" = "draft") => {
    if (savingRef.current) return false;
    if (pendingSaveVerification) {
      messageApi.warning("请先重新读取并确认上一次保存结果；系统不会重复写入");
      return false;
    }
    if (isRoleReadOnly) {
      messageApi.warning(isReviewLocked
        ? "作品正在审核中；管理员须先通过上架或退回修改"
        : "编辑角色只能维护草稿；该作品须由管理员处理");
      return false;
    }
    savingRef.current = true;
    let productId = currentProductId;
    const startedWithoutProductId = !productId;
    const publishMode = form.getFieldValue("publishMode");
    const requiresFullValidation = currentStatus === "PUBLISHED"
      || (intent === "primary" && (publishMode === "IMMEDIATE" || publishMode === "SCHEDULED"));
    try {
      dismissSubmitError();
      let formGaps: PublishGap[] = [];
      try {
        await form.validateFields(requiresFullValidation ? undefined : ["code", "categoryId"]);
      } catch (error) {
        if (!isFormValidationError(error)) throw error;
        formGaps = gapsFromFormFields(error.errorFields);
      }
      const values = form.getFieldsValue(true);
      const enforcingPublishCopy = intent === "primary"
        && currentStatus !== "PUBLISHED"
        && (values.publishMode === "IMMEDIATE" || values.publishMode === "SCHEDULED");
      if (!enforcingPublishCopy && formGaps.length > 0) {
        setPublishGaps(formGaps);
        setSubmitError("点一下即可跳到还没填的位置。");
        messageApi.warning(requiresFullValidation ? "请检查并修正标红字段" : "保存草稿至少需要选择类目并填写货号");
        jumpToPublishTarget(formGaps[0].target);
        return false;
      }
      if (enforcingPublishCopy) {
        const fieldErrors: Array<{ name: "name" | "shortDescription" | "description" | "code"; errors: string[] }> = [];
        const gaps: PublishGap[] = [...formGaps];
        const seen = new Set(gaps.map((gap) => `${gap.target}:${gap.label}`));
        const addGap = (label: string, target: PublishTarget) => {
          const key = `${target}:${label}`;
          if (seen.has(key)) return;
          seen.add(key);
          gaps.push({ label, target });
        };
        if (!isMeaningfulProductText(values.name, 2)) {
          fieldErrors.push({ name: "name", errors: ["请填写商品标题；整段不能只有数字或同一个字"] });
          addGap("商品标题", "name");
        }
        const code = typeof values.code === "string" ? values.code.trim() : "";
        if (!code) {
          fieldErrors.push({ name: "code", errors: ["请输入货号"] });
          addGap("货号", "code");
        }
        const detailTexts = detail.filter((block) => block.type === "TEXT" && block.text?.trim());
        if (typeof values.name === "string" && /秒杀|限时折扣|满减/.test(values.name)) {
          fieldErrors.push({ name: "name", errors: ["标题不要写秒杀、限时折扣或满减"] });
          addGap("标题中的促销词", "name");
        }
        const claimIssues = jewelryClaimIssues([
          values.name,
          values.shortDescription,
          values.description,
          ...detailTexts.map((block) => block.text),
        ]);
        if (claimIssues.length > 0) {
          fieldErrors.push({ name: "name", errors: claimIssues });
          for (const issue of claimIssues) {
            const rule = JEWELRY_CLAIM_RULES.find(([, message]) => message === issue);
            const pattern = rule?.[0];
            const target: PublishTarget = !pattern
              ? "name"
              : typeof values.description === "string" && pattern.test(values.description)
                ? "description"
                : typeof values.shortDescription === "string" && pattern.test(values.shortDescription)
                  ? "shortDescription"
                  : detailTexts.some((block) => pattern.test(block.text || ""))
                    ? "product-detail"
                    : "name";
            addGap(issue, target);
          }
        }
        if (values.visibility === "PUBLIC" && !primaryImageId && galleryImages.length === 0 && !pendingMedia.some((item) => item.purpose !== "detail")) {
          addGap("这件作品的实物主图", "product-cover");
        }
        if (values.salesMode === "DIRECT_PURCHASE") {
          const typedPrice = Number(values.initialSkuPrice);
          const hasTypedPrice = Number.isFinite(typedPrice) && typedPrice > 0;
          const hasSkuPrice = skus.some((sku) => sku.isActive !== false && Number(sku.price) > 0);
          if (!hasTypedPrice && !hasSkuPrice) addGap("一个大于 0 的成交价", currentProductId ? "product-skus" : "initialSkuPrice");
        }
        if (fieldErrors.length > 0 || gaps.length > 0) {
          if (fieldErrors.length > 0) form.setFields(fieldErrors);
          setPublishGaps(gaps);
          setSubmitError("上架前还有这些地方需要修改。点一下即可跳到对应位置。");
          messageApi.warning("请检查并修正标红字段");
          jumpToPublishTarget(gaps[0].target);
          return false;
        }
      }
      setSaving(true);
      const contentPayload = buildContentPayload(values);
      if (!productId) {
        const hasInitialSkuPrice = values.initialSkuPrice !== undefined
          && values.initialSkuPrice !== null
          && values.initialSkuPrice !== "";
        const created = unwrapResponse<ProductEditorRecord>(await productApi.create({
          ...contentPayload,
          ...(hasInitialSkuPrice ? {
            skus: [{
              skuCode: `${values.code}-DEFAULT`,
              material: values.materialType || "OTHER",
              size: values.size || undefined,
              goldWeight: values.goldWeight ?? 0,
              price: Number(values.initialSkuPrice),
              isActive: true,
            }],
          } : {}),
          status: "DRAFT",
          publishMode: "WAREHOUSE",
          scheduledPublishAt: null,
        }));
        productId = created.id;
        setCurrentProductId(productId);
        // 先把地址替换为已创建草稿，后续上传或更新失败时刷新/重试也不会再次创建商品。
        window.history.replaceState(window.history.state, "", `/admin/products/${productId}/edit`);
      }
      if (!productId) throw new EditorUserError("商品创建失败，未返回商品标识");
      if (currentStatus === "ARCHIVED") {
        await productApi.restore(productId);
        setCurrentStatus("DRAFT");
      }
      const { idMap, assignedCoverId } = await uploadPending(productId);
      await persistGalleryOrder(productId, idMap, assignedCoverId);
      const detailContent = detail.map(({ key: _key, pendingMediaKey, ...block }) => ({
        ...block,
        imageId: pendingMediaKey ? idMap.get(pendingMediaKey) : block.imageId,
      })).filter((block) => block.type === "TEXT" ? Boolean(block.text?.trim()) : Boolean(block.imageId));
      const { code: _code, ...updatePayload } = { ...contentPayload, detailContent };
      await productApi.update(productId, updatePayload);
      if (!startedWithoutProductId) await applySharedPrice(productId, values);
      await applyEditorStock(productId, values);
      const publishingPublic = intent === "primary"
        && (values.publishMode === "IMMEDIATE" || values.publishMode === "SCHEDULED")
        && values.visibility === "PUBLIC";
      if (publishingPublic && role === "SUPER_ADMIN") {
        const assetIds = [...new Set(mediaAssetIdsByImage.current.values())];
        for (const assetId of assetIds) {
          await uploadApi.authorizeMediaPublicUse(assetId, true);
        }
      }
      if (!canGovernPublic && intent === "primary") {
        await productApi.submitForReview(productId);
      } else if (currentStatus === "PUBLISHED") {
        // 对已上架商品重新执行发布门禁，但不改变其业务状态。
        await productApi.updateStatus(productId, "PUBLISHED");
      } else if (intent === "primary" && values.publishMode === "IMMEDIATE") {
        await productApi.updateStatus(productId, "PUBLISHED");
      } else if (intent === "primary" && values.publishMode === "SCHEDULED") {
        await productApi.update(productId, {
          publishMode: "SCHEDULED",
          scheduledPublishAt: values.scheduledPublishAt.toISOString(),
        });
      } else if (intent === "primary" && values.publishMode === "WAREHOUSE" && currentStatus !== "OFFLINE") {
        await productApi.updateStatus(productId, "OFFLINE");
      }
      setPendingMedia([]);
      let refreshed: ProductEditorRecord;
      try {
        refreshed = await refreshProduct(productId);
      } catch {
        if (activeEditorRef.current) {
          setPendingSaveVerification({ productId });
          dismissSubmitError();
          messageApi.warning("商品已写入，最新状态待确认；请重新读取保存结果");
        }
        return false;
      }
      if (!activeEditorRef.current) return false;
      if ((role === "SUPER_ADMIN" || role === "ADMIN" || role === "WAREHOUSE") && values.salesMode === "DIRECT_PURCHASE") {
        try {
          const stock = await readProductStock(productId);
          if (activeEditorRef.current) {
            setStockRowCount(stock.total > stock.rows.length ? stock.total : stock.rows.length);
            if (stock.rows.length === 1 && stock.total <= 1) form.setFieldValue("stockQuantity", stock.rows[0].quantity);
            setStockHint(undefined);
          }
        } catch {
          if (activeEditorRef.current) setStockHint("暂时读不到现有库存。保存时会再读一次。");
        }
      }
      if (!activeEditorRef.current) return false;
      setDirty(false);
      setSavedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      const successMessage = !canGovernPublic && intent === "primary"
        ? "商品草稿已保存并提交审核"
        : intent === "draft"
        ? currentStatus === "PUBLISHED" ? "已保存商品更改" : "草稿已保存"
        : refreshed.status === "PUBLISHED"
          ? currentStatus === "PUBLISHED" ? "已保存商品更改" : "商品已上架"
          : values.publishMode === "SCHEDULED"
          ? "已保存定时上架计划"
          : "商品已保存至仓库";
      messageApi.success(successMessage);
      if (!editingId) {
        navigate(`/admin/products/${productId}/edit${returnPathQuery}`, {
          replace: true,
        });
      }
      return true;
    } catch (error: unknown) {
      if (isFormValidationError(error)) {
        const gaps = gapsFromFormFields(error.errorFields);
        setPublishGaps(gaps);
        setSubmitError("点一下即可跳到还没填的位置。");
        messageApi.warning(requiresFullValidation ? "请检查并修正标红字段" : "保存草稿至少需要选择类目并填写货号");
        if (gaps[0]) jumpToPublishTarget(gaps[0].target);
        return false;
      }
      if (error instanceof EditorUserError) {
        messageApi.warning(error.message);
        return false;
      }
      if (startedWithoutProductId && !productId && isAmbiguousProductWriteFailure(error)) {
        const message = "商品创建结果待确认；当前货号和内容已保留。请再次点击保存，服务端只会恢复完全相同的创建意图，不会重复创建。";
        setSubmitError(message);
        messageApi.warning(message);
        return false;
      }
      const failure = getProductSubmitFailure(error);
      if (failure.field) form.setFields([{ name: failure.field, errors: [failure.message] }]);
      const gaps = gapsForSubmitMessage(failure.message, failure.field, Boolean(currentProductId));
      setPublishGaps(gaps);
      setSubmitError(failure.message);
      messageApi.error(failure.message);
      if (gaps[0]) jumpToPublishTarget(gaps[0].target);
      return false;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };
  saveRef.current = () => save("draft");

  const refreshSkus = async () => {
    if (!currentProductId) return;
    const result = unwrapResponse<ProductEditorRecord>(await productApi.getById(currentProductId));
    setSkus(result.skus || []);
    form.setFieldValue("derivedPrice", result.price);
  };

  const openSkuModal = (sku?: ProductSKU) => {
    setEditingSku(sku || null);
    if (sku) {
      skuForm.setFieldsValue({
        skuCode: sku.skuCode,
        material: sku.material,
        size: sku.size,
        goldWeight: sku.goldWeight,
        price: sku.price,
        isActive: sku.isActive,
      });
    } else {
      skuForm.resetFields();
      skuForm.setFieldsValue({ material: "GOLD_999", price: 0, isActive: true });
    }
    setSkuModalOpen(true);
  };

  const saveSku = async () => {
    if (!currentProductId || skuSaving) return;
    try {
      const values = await skuForm.validateFields();
      setSkuSaving(true);
      if (editingSku) await productApi.updateSku(currentProductId, editingSku.id, values);
      else await productApi.createSku(currentProductId, values);
      await refreshSkus();
      setSkuModalOpen(false);
      setEditingSku(null);
      messageApi.success(editingSku ? "SKU 已更新" : "SKU 已创建");
    } catch (error: unknown) {
      if (!isFormValidationError(error)) {
        const failure = getSkuSubmitFailure(error);
        if (failure.field) skuForm.setFields([{ name: failure.field, errors: [failure.message] }]);
        messageApi.error(failure.message);
      }
    } finally {
      setSkuSaving(false);
    }
  };

  const toggleSkuActive = async (sku: ProductSKU) => {
    if (!currentProductId || skuActionId !== null) return;
    try {
      setSkuActionId(sku.id);
      await productApi.updateSku(currentProductId, sku.id, { isActive: !sku.isActive });
      await refreshSkus();
      messageApi.success(sku.isActive ? "SKU 已停用" : "SKU 已启用");
    } catch (error) {
      messageApi.error(getSafeAdminErrorMessage(error, "SKU 状态更新失败，请重新加载后重试。"));
    } finally {
      setSkuActionId(null);
    }
  };

  const approveReviewedProduct = async () => {
    if (!currentProductId || savingRef.current || !canGovernPublic || !isReviewLocked) return;
    savingRef.current = true;
    setSaving(true);
    try {
      dismissSubmitError();
      await productApi.updateStatus(currentProductId, "PUBLISHED");
      await refreshProduct(currentProductId);
      setDirty(false);
      setSavedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      messageApi.success("审核版本已通过并上架");
    } catch (error: unknown) {
      const failure = getProductSubmitFailure(error);
      const gaps = gapsForSubmitMessage(failure.message, failure.field, true);
      setPublishGaps(gaps);
      setSubmitError(failure.message);
      messageApi.error(failure.message);
      if (gaps[0]) jumpToPublishTarget(gaps[0].target);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const returnReviewedProduct = async () => {
    if (!currentProductId || savingRef.current || !canGovernPublic || !isReviewLocked) return;
    savingRef.current = true;
    setSaving(true);
    try {
      dismissSubmitError();
      await productApi.updateStatus(currentProductId, "DRAFT");
      await refreshProduct(currentProductId);
      setDirty(false);
      setSavedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      messageApi.success("作品已退回草稿，可继续修改后重新提交");
    } catch (error: unknown) {
      const failure = getProductSubmitFailure(error);
      const gaps = gapsForSubmitMessage(failure.message, failure.field, true);
      setPublishGaps(gaps);
      setSubmitError(failure.message);
      messageApi.error(failure.message);
      if (gaps[0]) jumpToPublishTarget(gaps[0].target);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const confirmOffline = () => {
    if (!currentProductId) return;
    if (dirty) {
      messageApi.warning("请先保存当前修改，再执行下架操作");
      return;
    }
    modal.confirm({
      title: "确认下架这个商品？",
      content: "下架后商品将进入仓库，不再对客户展示；商品资料和 SKU 会保留。",
      okText: "确认下架",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await productApi.updateStatus(currentProductId, "OFFLINE");
          await refreshProduct(currentProductId);
          messageApi.success("商品已下架并移入仓库");
        } catch (error) {
          messageApi.error(getSafeAdminErrorMessage(error, "商品下架失败，请刷新后重试。"));
          throw error;
        }
      },
    });
  };

  const addTextBlock = () => {
    setDetail((prev) => [...prev, { key: `text-${Date.now()}`, type: "TEXT", text: "" }]);
    setPreviewPane("detail");
    markDirty();
  };
  const removeDetailBlock = (blockKey: string) => {
    const block = detail.find((item) => item.key === blockKey);
    setDetail((prev) => prev.filter((item) => item.key !== blockKey));
    if (block?.pendingMediaKey && pendingMedia.some((item) => item.key === block.pendingMediaKey && item.purpose === "detail")) {
      const stillUsed = detail.some((item) => item.key !== blockKey && item.pendingMediaKey === block.pendingMediaKey);
      if (!stillUsed) {
        setPendingMedia((prev) => {
          const target = prev.find((item) => item.key === block.pendingMediaKey);
          if (target) URL.revokeObjectURL(target.preview);
          return prev.filter((item) => item.key !== block.pendingMediaKey);
        });
      }
    }
    markDirty();
  };
  const moveBlock = (index: number, direction: -1 | 1) => {
    setDetail((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    markDirty();
  };

  const tabs = [
    ["basic", "基础信息"], ["media", "图文描述"], ["sales", "销售信息"],
  ];
  const primaryActionLabel = isReviewLocked && canGovernPublic
    ? "通过并上架"
    : !canGovernPublic
    ? currentStatus === "DRAFT" ? "保存并提交审核" : "仅管理员可处理"
    : currentStatus === "PUBLISHED"
    ? "保存更改"
    : selectedPublishMode === "IMMEDIATE"
      ? currentStatus === "OFFLINE" ? "重新上架" : "上架商品"
      : selectedPublishMode === "SCHEDULED"
        ? "保存定时计划"
        : currentStatus === "OFFLINE" ? "保存更改" : "保存到仓库";
  const savedStatusText = saving
    ? "正在保存…"
    : dirty
      ? "有未保存的修改"
      : savedAt
        ? `最后保存于 ${savedAt}`
        : currentProductId
          ? `当前状态：${statusMeta[currentStatus].label}`
          : "尚未保存";
  const activeSkuCount = skus.filter((sku) => sku.isActive).length;
  // derivedPrice 由服务端按有效 SKU 派生，不对应可编辑控件；preserve 让 Form 仍能监听该只读字段。
  const derivedPrice = Number(Form.useWatch("derivedPrice", { form, preserve: true }) || 0);
  const inventoryPolicyMessage = selectedInventoryPolicy === "SINGLE_UNIT"
    ? "一物一件：必须且只能保留 1 个有效 SKU；库存总量只能为 0 或 1；每次购买数量上限为 1。"
    : "一件作品填一个成交价即可。有圈口、尺寸等不同规格时，再添加 SKU。";
  const salesModeMessage = selectedSalesMode === "DIRECT_PURCHASE"
    ? `${!commerceEnabled ? "支付未开放，公开页面只显示价格，不提供加购或付款。" : ""}直接销售需要一个大于 0 的成交价。`
    : "当前销售方式发布时不要求交易价格、SKU 或正库存。公开前再放上这件作品的照片。";
  const showCommerceFacts = selectedSalesMode === "DIRECT_PURCHASE";
  const canWriteStock = role === "SUPER_ADMIN" || role === "ADMIN" || role === "WAREHOUSE";
  const stockSplit = activeSkuCount > 1 || stockRowCount > 1;
  const stockExtra = !canWriteStock
    ? "当前账号不能修改库存。请让管理员在库存管理填写可售数量。"
    : stockSplit
      ? "有多条库存时，不能在这里用一个数字改全部。"
      : stockHint || "这是现在可卖的件数。不填就保持原数量；新商品不填时是 0。一物一件只能填 0 或 1。";
  const visibilityOptions = [
    { value: "PUBLIC", label: "全部人可见" },
    { value: "INTERNAL", label: "仅内部可见" },
    ...(watchedVisibility === "MEMBER" ? [{ value: "MEMBER", label: "登录会员可见" }] : []),
    ...(watchedVisibility === "PARTNER" ? [{ value: "PARTNER", label: "合作商家专属" }] : []),
  ];

  if (loading) {
    return <RouteLoading scope="admin-content" label="正在加载商品信息…" />;
  }
  if (loadError) return <div className="pro-editor__load-error"><AdminErrorState subject="商品信息" message={loadError} onRetry={() => setLoadAttempt((value) => value + 1)} /></div>;

  return (
    <div className="pro-editor">
      <h1 className="pro-editor__sr-only">{editingId ? "编辑商品" : "新建商品"}</h1>
      <div className="pro-editor__body">
        <aside className="pro-editor__guide" aria-label="上架标准">
          <div className="pro-editor__guide-card">
            <strong>上架框架</strong>
            <p>新建商品会带上这些默认，不用每次重填。标题、货号、照片和成交价仍按每一件填写。</p>
            <p>必填：标题、货号、类目、一张作品照片。直接销售再填一次成交价。</p>
            <p>简介、说明、克重、材质和详情都可以不填。配送方式在「销售信息」，不选也可以上架。</p>
            <p>{publishFrame
              ? `已存框架：${salesModeLabelsForPreview[publishFrame.salesMode] || "直接销售"}，${publishFrame.visibility === "PUBLIC" ? "全部人可见" : "沿用已存的可见范围"}。${publishFrame.materialType ? `材质沿用${materials.find((item) => item.value === publishFrame.materialType)?.label || "已存材质"}。` : "材质不预填。"}${publishFrame.shortDescription ? "简介沿用已存文字。" : "简介不预填。"}${publishFrame.description ? "说明沿用已存文字。" : "说明不预填。"}`
              : "当前默认：直接销售，全部人可见，立刻上架。材质、简介和说明不预填。"}</p>
            <p>成交价只填一次。还没有价格的规格会沿用，已经标价的规格保持不变。</p>
            <div className="pro-editor__guide-actions">
              <button type="button" onClick={savePublishFrame}>把当前设置存成框架</button>
              {publishFrame ? <button type="button" onClick={clearPublishFrame}>恢复最初默认</button> : null}
            </div>
          </div>
          {submitError ? <Alert className="pro-editor__submit-error" type="error" showIcon message="商品保存未完成" description={<div><span>{submitError}</span>{publishGaps.length > 0 ? <ul className="pro-editor__gap-list">{publishGaps.map((gap) => <li key={`${gap.target}:${gap.label}`}><button type="button" onClick={() => jumpToPublishTarget(gap.target)}>{gap.label}</button></li>)}</ul> : null}</div>} closable onClose={() => dismissSubmitError()} action={role === "SUPER_ADMIN" && submitError.includes("公开展示") ? <Button size="small" loading={authorizingImages} onClick={() => void confirmProductImagesPublic()}>确认这些图片可在网站公开展示</Button> : undefined} /> : null}
        </aside>
        <div className="pro-editor__main">
      <header className="pro-editor__tabs">
        <div className="pro-editor__tabs-main">
          <Button
            type="text"
            className="pro-editor__back"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(returnPath)}
          >
            返回商品列表
          </Button>
          <nav aria-label="商品编辑步骤">{tabs.map(([key, label]) => <button key={key} aria-current={active === key ? "step" : undefined} className={active === key ? "is-active" : ""} onClick={() => { setActive(key); document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{label}</button>)}</nav>
        </div>
      </header>

      {isReviewLocked ? <Alert type="info" showIcon message={canGovernPublic ? "这是编辑提交的审核版本，内容、SKU、图片、标签、属性与证书均已冻结；请直接通过上架或退回修改。" : "作品已提交审核，审核完成或管理员退回前不可继续修改。"} /> : isRoleReadOnly ? <Alert type="info" showIcon message="当前作品为已发布或已下架状态，编辑角色仅可查看；修改、下架与归档请交由管理员处理。" /> : null}
      {pendingSaveVerification && <Alert
        type="warning"
        showIcon
        message="商品已写入，最新状态待确认"
        description={<Space direction="vertical" size={8}>
          <span>保存写入和状态动作已经完成，但暂时无法读取服务端权威结果。当前内容已保留；系统不会重复保存或重新执行发布动作。</span>
          <Button type="link" loading={saveVerificationLoading} onClick={() => void retrySaveVerification()}>重新读取保存结果</Button>
        </Space>}
      />}
      <Form name="product-editor-main" form={form} initialValues={defaultValues} layout="vertical" requiredMark={(label) => label} disabled={saving || isRoleReadOnly || Boolean(pendingSaveVerification)} onValuesChange={() => { markDirty(); dismissSubmitError(); }} className="pro-editor__form">
        <ol className="pro-editor__flow" aria-label="发布步骤">
          {publishSteps.map((step) => <li key={step.title} data-state={step.state}><b>{step.title}</b><span>{step.detail}</span></li>)}
        </ol>
        <div className={`pro-editor__category${categoryEmpty ? " is-open" : ""}`}><strong>当前类目 <i>*</i></strong><span>{selectedCategoryLabel || "珠宝 / 请选择具体类目"}</span><Tag color={statusMeta[currentStatus].color}>{statusMeta[currentStatus].label}</Tag><button type="button" onClick={() => { setActive("basic"); document.getElementById("basic")?.scrollIntoView({ behavior: "smooth" }); }}>切换类目</button></div>

        <section id="basic" className="pro-editor__card">
          <div className="pro-editor__title-row"><h2>基础信息</h2></div>
          <Form.Item name="name" label={<span>商品标题<RequiredMark /></span>} className={requiredFieldClass(true, titleEmpty, "pro-editor__horizontal-field")} extra="例如「18K金红宝石戒指」。" rules={[{ max: 60, message: "商品标题不能超过 60 个字符" }]}><Input maxLength={60} showCount placeholder="如：18K金红宝石戒指" /></Form.Item>
          <Form.Item
            name="shortDescription"
            label="商品简介"
            className="pro-editor__horizontal-field"
            extra="选填，不写也可以上架。"
            rules={[{ max: 500, message: "商品简介不能超过 500 个字符" }]}
          >
            <Input maxLength={500} showCount placeholder="概括材质、设计和佩戴特点" />
          </Form.Item>
          <Form.Item
            name="description"
            label="商品说明"
            className="pro-editor__horizontal-field"
            extra="选填，不写也可以上架。"
            rules={[{ max: 5000, message: "商品说明不能超过 5000 个字符" }]}
          >
            <Input.TextArea rows={4} maxLength={5000} showCount placeholder="介绍材质、设计、工艺与佩戴建议" />
          </Form.Item>
          <Form.Item name="categoryId" label={<span>当前类目<RequiredMark /></span>} className={requiredFieldClass(true, categoryEmpty, "pro-editor__horizontal-field")} rules={[{ required: true, message: "请选择珠宝类目" }]}><Select showSearch optionFilterProp="label" options={categories} placeholder="请选择珠宝类目" /></Form.Item>
          <Form.Item name="goldWeight" label="金重（g）" className="pro-editor__horizontal-field pro-editor__money-field" extra="选填。知道克重后再填写。"><InputNumber min={0} precision={2} suffix="g" /></Form.Item>
          <Form.Item name="weight" label="总重（g）" className="pro-editor__horizontal-field pro-editor__money-field" extra="选填。"><InputNumber min={0} precision={2} suffix="g" /></Form.Item>
          <div className="pro-editor__attribute-banner"><b>作品资料</b><span>材质、尺寸、工艺、宝石和证书都是选填</span></div>
          <div className="pro-editor__attributes">
            <Form.Item name="code" label={<span>货号<RequiredMark /></span>} className={requiredFieldClass(true, codeEmpty)} rules={[{ required: true, message: "请输入货号" }]}><Input disabled={Boolean(currentProductId)} maxLength={50} /></Form.Item>
            <Form.Item name="materialType" label="主要材质"><Select allowClear options={materials} placeholder="选填，不确定就留空" /></Form.Item>
            <Form.Item name="size" label="尺寸/圈口"><Input placeholder="如：圈口 14" /></Form.Item>
            <Form.Item name="craftTechnique" label="制作工艺"><Select mode="multiple" options={["古法","花丝","錾刻","抛光","喷砂","镶嵌","珐琅","拉丝"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="gemType" label="主石种类"><Select allowClear options={["钻石","红宝石","蓝宝石","祖母绿","翡翠","珍珠","彩色宝石","无主石"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="gemCarat" label="主石重量（ct）"><InputNumber min={0} precision={3} /></Form.Item>
            <Form.Item name="gemQuantity" label="宝石数量"><InputNumber min={0} precision={0} /></Form.Item>
            <Form.Item name="gemColor" label="颜色等级"><Input placeholder="如：D / vivid red" /></Form.Item>
            <Form.Item name="gemClarity" label="净度"><Input placeholder="如：VS1" /></Form.Item>
            <Form.Item name="gemCut" label="切工"><Select allowClear options={["EX","VG","G","F","不适用"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="certificateAuthority" label="证书机构"><Input placeholder="如：GIA / NGTC" /></Form.Item>
            <Form.Item name="certificateNumber" label="证书编号"><Input maxLength={100} /></Form.Item>
            <Form.Item name="certificateQueryUrl" label="证书查验链接" rules={[{ validator: async (_rule, value) => { if (!value || /^https?:\/\//i.test(String(value).trim())) return; throw new Error("请输入以 http:// 或 https:// 开头的链接"); } }]}><Input placeholder="https://" /></Form.Item>
          </div>
        </section>

        <section id="media" className="pro-editor__card">
          <h2>图文描述</h2>
          <div className="pro-editor__row-label" id="product-cover"><strong>实物主图{photoRequired ? <RequiredMark /> : null}</strong><span>拖拽图片，或使用前移、后移调整顺序。第一张会成为主图。最多 9 张，单张 10MB 以内。</span></div>
          <div className={`pro-editor__uploads${photoRequired && !coverReady ? " is-open" : ""}`}>
            {mediaChoices.map((item, index) => {
              const isCover = item.key === orderedGalleryKeys[0];
              return <div
                className={`pro-editor__upload-card${galleryDropKey === item.key ? " is-drop-target" : ""}`}
                key={item.key}
                onDragOver={(event) => {
                  if (!draggingGalleryKey || saving || isRoleReadOnly) return;
                  event.preventDefault();
                  if (galleryDropKey !== item.key) setGalleryDropKey(item.key);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromKey = event.dataTransfer.getData("text/plain") || draggingGalleryKeyRef.current;
                  draggingGalleryKeyRef.current = null;
                  setDraggingGalleryKey(null);
                  setGalleryDropKey(null);
                  if (fromKey) moveGalleryItem(fromKey, index);
                }}
              >
                <div
                  className={`pro-editor__upload-item${draggingGalleryKey === item.key ? " is-dragging" : ""}`}
                  draggable={!saving && !isRoleReadOnly}
                  aria-label={`拖拽调整${item.label}的顺序`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", item.key);
                    event.dataTransfer.effectAllowed = "move";
                    draggingGalleryKeyRef.current = item.key;
                    setDraggingGalleryKey(item.key);
                  }}
                  onDragEnd={() => {
                    draggingGalleryKeyRef.current = null;
                    setDraggingGalleryKey(null);
                    setGalleryDropKey(null);
                  }}
                >
                  <SecureImage className="pro-editor__upload-photo" src={item.src} alt={item.label} tokenKind="staff" style={{ width: "100%", height: "100%", objectFit: "contain", aspectRatio: "1 / 1" }} />
                  {isCover ? <em className="pro-editor__cover-badge">主图</em> : null}
                </div>
                <div className="pro-editor__upload-actions">
                  <Button type="link" size="small" aria-label={`前移${item.label}`} disabled={index === 0 || saving || isRoleReadOnly} onClick={() => moveGalleryItem(item.key, index - 1)}>前移</Button>
                  <Button type="link" size="small" aria-label={`后移${item.label}`} disabled={index === mediaChoices.length - 1 || saving || isRoleReadOnly} onClick={() => moveGalleryItem(item.key, index + 1)}>后移</Button>
                  {"pending" in item && item.pending ? <button type="button" className="pro-editor__upload-text" onClick={() => removePendingMedia(item.key)} aria-label={`移除${item.label}`}>删除</button> : null}
                  {item.imageId ? <Button type="link" size="small" danger disabled={mediaActionId !== null} onClick={() => confirmDeleteImage(item.imageId!)}>删除</Button> : null}
                </div>
              </div>;
            })}
            {mediaChoices.length < 9 ? <Upload multiple accept="image/jpeg,image/png,image/webp,image/gif" showUploadList={false} disabled={saving} beforeUpload={addPendingMedia}><button type="button" disabled={saving} aria-label={`上传图片，可一次多选，当前还可上传 ${9 - mediaChoices.length} 张`} className="pro-editor__upload"><FileImageOutlined /><span>上传图片</span></button></Upload> : null}
          </div>
          <div className="pro-editor__detail-head" id="product-detail"><div><strong>商品详情</strong><span>选填。详情图和上面的主图分开，不会占用那 9 张。</span></div><Space>
            <Upload multiple accept="image/jpeg,image/png,image/webp,image/gif" showUploadList={false} disabled={saving} beforeUpload={addDetailMedia}><button type="button" className="pro-editor__detail-add" disabled={saving} aria-label="上传详情图，可一次多选">上传详情图</button></Upload>
            <Button onClick={() => setDetailPickerOpen((open) => !open)}>从主图选用</Button>
            <Button onClick={addTextBlock}>添加文字</Button>
          </Space></div>
          <div className="pro-editor__detail-tip">可以一次选择多张详情图。文字写工艺、尺寸或佩戴说明。顾客打开商品页后，按这里的顺序往下看。</div>
          {detailPickerOpen ? <div className="pro-editor__detail-picker">{mediaChoices.length === 0 ? <span>还没有主图。可以先在上面上传，或直接上传详情图。</span> : mediaChoices.map((item) => <button type="button" key={item.key} onClick={() => addGalleryImageToDetail(item)}><SecureImage src={item.src} alt={item.label} tokenKind="staff" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></button>)}</div> : null}
          <div className="pro-editor__detail-grid">
            <div className="pro-editor__blocks">
              {detail.length === 0 && <div className="pro-editor__empty">还没有详情。上传详情图，或写一段说明。</div>}
              {detail.map((block, index) => <div className="pro-editor__block" key={block.key}>
                <div className="pro-editor__block-tools"><Tag>{block.type === "TEXT" ? "文字" : "图片"}</Tag><Button aria-label={`上移${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveBlock(index, -1)} /><Button aria-label={`下移${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" icon={<ArrowDownOutlined />} disabled={index === detail.length - 1} onClick={() => moveBlock(index, 1)} /><Button aria-label={`删除${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" danger icon={<DeleteOutlined />} onClick={() => removeDetailBlock(block.key)} /></div>
                {block.type === "TEXT" ? <Input.TextArea rows={4} value={block.text} aria-label="详情文字" placeholder="写工艺、尺寸或佩戴说明" onChange={(event) => { setDetail((prev) => prev.map((item) => item.key === block.key ? { ...item, text: event.target.value } : item)); markDirty(); }} /> : <div className="pro-editor__block-visual">{mediaSrcByKey.get(block.pendingMediaKey || `saved-${block.imageId || ""}`) ? <SecureImage className="pro-editor__block-photo" src={mediaSrcByKey.get(block.pendingMediaKey || `saved-${block.imageId || ""}`)} alt={block.alt || "商品详情"} tokenKind="staff" style={{ width: "100%", maxHeight: 280, objectFit: "contain" }} /> : <span>这张详情图暂时显示不了，请删除后重新上传。</span>}</div>}
              </div>)}
            </div>
            <div className="pro-editor__preview">
              <div className="pro-editor__phone-tabs" role="tablist" aria-label="商品页预览">
                <button type="button" role="tab" aria-selected={previewPane === "photos"} className={previewPane === "photos" ? "is-active" : ""} onClick={() => setPreviewPane("photos")}>图片</button>
                <button type="button" role="tab" aria-selected={previewPane === "detail"} className={previewPane === "detail" ? "is-active" : ""} onClick={() => setPreviewPane("detail")}>详情</button>
                <button type="button" role="tab" aria-selected={previewPane === "copy"} className={previewPane === "copy" ? "is-active" : ""} onClick={() => setPreviewPane("copy")}>说明</button>
              </div>
              {previewPane === "photos" ? (mediaChoices.length === 0 ? <div className="pro-editor__preview-empty"><FileImageOutlined /><span>主图会显示在这里</span></div> : mediaChoices.map((item) => <SecureImage key={item.key} src={item.src} alt={item.label} tokenKind="staff" />)) : null}
              {previewPane === "detail" ? (detail.length === 0 ? <div className="pro-editor__preview-empty"><FileImageOutlined /><span>详情内容将在这里预览</span></div> : detail.map((block) => block.type === "TEXT" ? <p key={block.key}>{block.text || "文字内容"}</p> : <SecureImage key={block.key} src={mediaSrcByKey.get(block.pendingMediaKey || `saved-${block.imageId || ""}`)} alt={block.alt || "商品详情"} tokenKind="staff" />)) : null}
              {previewPane === "copy" ? <p>{typeof watchedDescription === "string" && watchedDescription.trim() ? watchedDescription : "还没有商品说明"}</p> : null}
            </div>
          </div>
        </section>

        <section id="sales" className="pro-editor__card">
          <div className="pro-editor__title-row"><h2>销售信息</h2></div>
          <div className="pro-editor__sales-grid">
            <Form.Item name="salesMode" label="销售方式" extra={showCommerceFacts && !commerceEnabled ? "支付未开放，顾客可以看到价格，但不能在网站付款。" : "选择顾客看到这件作品后的下一步。"}><Radio.Group><Radio value="DIRECT_PURCHASE">直接销售</Radio><Radio value="DISPLAY_ONLY">仅展示</Radio><Radio value="SELECTION">选款咨询</Radio><Radio value="APPOINTMENT">预约到店</Radio><Radio value="CUSTOM_INQUIRY">定制咨询</Radio></Radio.Group></Form.Item>
            {showCommerceFacts ? <>
              <Form.Item label="当前最低价" className="pro-editor__money-field" extra="有多个规格时，页面显示其中的最低价。"><div className="pro-editor__derived-price">{currentProductId ? (derivedPrice > 0 ? `¥ ${derivedPrice.toFixed(2)}` : "—") : "保存商品后显示"}</div></Form.Item>
              <Form.Item name="initialSkuPrice" label={<span>成交价{priceRequired ? <RequiredMark /> : null}</span>} className={requiredFieldClass(priceRequired, priceEmpty, "pro-editor__money-field")} extra="填一次即可。还没有价格的规格会用这个价格，已经标价的规格保持不变。"><InputNumber min={0} precision={2} suffix="元" /></Form.Item>
              <Form.Item
                name="stockQuantity"
                label="可售数量"
                className="pro-editor__money-field"
                extra={stockSplit && currentProductId && canWriteStock ? <span>{stockExtra} <Link to={`/admin/inventory?productIds=${currentProductId}`}>打开库存管理</Link></span> : stockExtra}
                rules={[{ validator: async (_rule, value) => {
                  if (value === undefined || value === null || value === "") return;
                  const quantity = Number(value);
                  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("可售数量须为大于或等于 0 的整数");
                  if (selectedInventoryPolicy === "SINGLE_UNIT" && quantity > 1) throw new Error("一物一件的可售数量只能是 0 或 1");
                } }]}
              >
                <InputNumber min={0} max={selectedInventoryPolicy === "SINGLE_UNIT" ? 1 : undefined} precision={0} suffix="件" disabled={!canWriteStock || stockSplit} />
              </Form.Item>
              <Form.Item label="库存策略"><Form.Item name="inventoryPolicy" noStyle><Radio.Group><Radio value="STANDARD">标准库存</Radio><Radio value="SINGLE_UNIT">一物一件</Radio></Radio.Group></Form.Item><span className="pro-editor__hint">{inventoryPolicyMessage}</span></Form.Item>
              <Alert className="pro-editor__inventory-alert" type="info" showIcon message={salesModeMessage} />
              {selectedInventoryPolicy === "SINGLE_UNIT" && currentProductId && activeSkuCount !== 1 ? <Alert className="pro-editor__inventory-alert" type="error" showIcon message={`当前有 ${activeSkuCount} 个有效 SKU；一物一件必须且只能保留 1 个。保存时以服务端 409 校验结果为准。`} /> : null}
            </> : <Alert className="pro-editor__inventory-alert" type="info" showIcon message={salesModeMessage} />}
            <Form.Item name="publishMode" label={canGovernPublic ? "上架时间" : "发布流程"}><Radio.Group disabled={!canGovernPublic}><Radio value="IMMEDIATE">立刻上架</Radio><Radio value="SCHEDULED">定时上架</Radio><Radio value="WAREHOUSE">提交审核前保留草稿</Radio></Radio.Group></Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.publishMode !== next.publishMode || prev.scheduledPublishAt !== next.scheduledPublishAt}>{({ getFieldValue }) => getFieldValue("publishMode") === "SCHEDULED" ? <Form.Item name="scheduledPublishAt" label={<span>定时上架时间<RequiredMark /></span>} className={requiredFieldClass(true, !getFieldValue("scheduledPublishAt"))} rules={[{ required: true }]}><DatePicker showTime disabledDate={(date) => date.isBefore(dayjs(), "day")} /></Form.Item> : null}</Form.Item>
            <Form.Item name="visibility" label="可见范围" extra="上架后只出现在选款中心。首页、作品展陈和其他页面不会列出这件商品。"><Select options={visibilityOptions} /></Form.Item>
            <Form.Item name="deliveryMethods" label="配送方式" extra="选填。不选也可以上架。选中后，顾客打开商品页能看到对应方式。"><Checkbox.Group options={[...DELIVERY_METHOD_OPTIONS]} /></Form.Item>
          </div>
          {showCommerceFacts ? <div className="pro-editor__sku-panel" id="product-skus">
            <div className="pro-editor__title-row">
              <div><h3>规格与价格</h3><span>{currentProductId ? `${activeSkuCount} 个有效规格。没单独标价的会用上面的成交价。` : "只有一种规格时，上面的成交价就够了。"}</span></div>
              <Button icon={<PlusOutlined />} disabled={!currentProductId || skuActionId !== null || (selectedInventoryPolicy === "SINGLE_UNIT" && activeSkuCount >= 1)} onClick={() => openSkuModal()}>添加 SKU</Button>
            </div>
            <Table<ProductSKU>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={skus}
              locale={{ emptyText: currentProductId ? "暂无 SKU" : "保存草稿后可管理 SKU" }}
              columns={[
                { title: "SKU 编码", dataIndex: "skuCode" },
                { title: "材质", dataIndex: "material", render: (value: MaterialType) => materials.find((item) => item.value === value)?.label || value },
                { title: "规格", dataIndex: "size", render: (value?: string) => value || "—" },
                { title: "金重(g)", dataIndex: "goldWeight", render: (value?: number) => value ?? "—" },
                { title: "直购成交价", dataIndex: "price", render: (value: number) => Number(value) > 0 ? `¥ ${Number(value).toFixed(2)}` : "—" },
                { title: "状态", dataIndex: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
                { title: "操作", render: (_value: unknown, sku: ProductSKU) => <Space size={4}><Button type="link" size="small" disabled={skuActionId !== null} onClick={() => openSkuModal(sku)}>编辑</Button><Button type="link" size="small" loading={skuActionId === sku.id} disabled={skuActionId !== null && skuActionId !== sku.id} onClick={() => void toggleSkuActive(sku)}>{sku.isActive ? "停用" : "启用"}</Button></Space> },
              ]}
              scroll={{ x: 760 }}
            />
          </div> : null}
        </section>
      </Form>
        </div>
      </div>

      <footer className="pro-editor__footer"><div>{isReviewLocked && canGovernPublic ? <><Button type="primary" loading={saving} disabled={Boolean(pendingSaveVerification)} onClick={() => void approveReviewedProduct()}>{primaryActionLabel}</Button><Button disabled={saving || Boolean(pendingSaveVerification)} onClick={() => void returnReviewedProduct()}>退回修改</Button></> : !isRoleReadOnly ? <Button type="primary" loading={saving} disabled={Boolean(pendingSaveVerification)} onClick={() => void save("primary")}>{primaryActionLabel}</Button> : null}{!isReviewLocked && canGovernPublic && currentStatus === "PUBLISHED" ? <Button danger disabled={saving || Boolean(pendingSaveVerification)} onClick={confirmOffline}>下架</Button> : !isReviewLocked && !isRoleReadOnly && (currentStatus !== "OFFLINE" || selectedPublishMode !== "WAREHOUSE") ? <Button icon={<SaveOutlined />} loading={saving} disabled={Boolean(pendingSaveVerification)} onClick={() => void save("draft")}>{currentStatus === "OFFLINE" ? "保存内容" : "保存草稿"}</Button> : null}<Button icon={<EyeOutlined />} disabled={saving} onClick={() => { setPreviewValues(form.getFieldsValue(true)); setPreviewOpen(true); }}>预览</Button><span role="status" aria-live="polite" className={dirty ? "is-dirty" : ""}>{savedStatusText}</span></div></footer>

      <Modal rootClassName="pro-editor-modal" title="商品预览" width={760} open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null}>
        <div className="pro-editor__preview-dialog">
          <div className="pro-editor__preview-hero">
            {mediaChoices[0]?.src ? <SecureImage src={mediaChoices[0].src} alt={previewValues.name || "商品主图"} tokenKind="staff" /> : <div className="pro-editor__preview-placeholder"><FileImageOutlined /><span>尚未上传主图</span></div>}
            <div><Tag>{selectedCategoryLabel || "珠宝"}</Tag><h3>{previewValues.name || "未命名商品"}</h3><strong>{previewValues.salesMode === "DIRECT_PURCHASE" ? (Number(previewValues.derivedPrice || previewValues.initialSkuPrice) > 0 ? `¥ ${Number(previewValues.derivedPrice || previewValues.initialSkuPrice).toFixed(2)}` : "价格待配置") : (salesModeLabelsForPreview[previewValues.salesMode as SalesMode] || "非直购商品")}</strong><p>{previewValues.brand || previewValues.materialType || "商品信息待完善"}</p></div>
          </div>
          <div className="pro-editor__preview-detail">
            <h4>商品详情</h4>
            {detail.length === 0 && <div className="pro-editor__preview-dialog-empty">尚未添加详情内容</div>}
            {detail.map((block) => block.type === "TEXT" ? <p key={block.key}>{block.text || "文字内容待完善"}</p> : <SecureImage key={block.key} src={mediaSrcByKey.get(block.pendingMediaKey || `saved-${block.imageId || ""}`)} alt={block.alt || "商品详情图片"} tokenKind="staff" />)}
          </div>
        </div>
      </Modal>
      <Modal rootClassName="pro-editor-modal" title={editingSku ? "编辑 SKU" : "新建 SKU"} open={skuModalOpen} forceRender confirmLoading={skuSaving} onCancel={() => { setSkuModalOpen(false); setEditingSku(null); }} onOk={() => void saveSku()} okText="保存 SKU" cancelText="取消">
        <Form name="product-sku-form" form={skuForm} layout="vertical">
          <div className="pro-editor__sku-form-grid">
            <Form.Item name="skuCode" label="SKU 编码" rules={[{ required: true, message: "请输入 SKU 编码" }]}><Input maxLength={100} placeholder="HC-001-18K" /></Form.Item>
            <Form.Item name="material" label="材质" rules={[{ required: true, message: "请选择材质" }]}><Select options={materials} /></Form.Item>
            <Form.Item name="size" label="规格"><Input maxLength={50} placeholder="如：圈口 14" /></Form.Item>
            <Form.Item name="goldWeight" label="金重（g）"><InputNumber min={0} precision={2} /></Form.Item>
            <Form.Item name="price" label="价格" rules={[{ required: true, message: "请输入价格" }]}><InputNumber min={0} precision={2} suffix="元" /></Form.Item>
            <Form.Item name="isActive" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
          </div>
          <Alert type="info" showIcon message="只有一种规格时，用上面的可售数量。多个规格的数量请到库存管理分别填写。" />
        </Form>
      </Modal>
      <UnsavedChangesGuard hasUnsavedChanges={dirty} disabled={saving} subject="商品信息" rootClassName="pro-editor-unsaved-modal" onSaveAndLeave={() => saveRef.current()} />
    </div>
  );
}
