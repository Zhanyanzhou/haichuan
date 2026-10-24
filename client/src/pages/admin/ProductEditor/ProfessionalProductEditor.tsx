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
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Upload,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdminErrorState } from "@/components/common/AdminDataStates";
import { SecureImage } from "@/components/common/SecureImage";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { categoryApi, productApi, uploadApi } from "@/services/api";
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
import { unwrapResponse } from "@/utils/unwrap";
import { normalizeAdminReturnPath } from "@/utils/adminReturnPath";
import UnsavedChangesGuard from "../HomepageConfig/components/UnsavedChangesGuard";
import "./ProfessionalProductEditor.css";

type DetailDraft = ProductDetailBlock & { key: string; pendingMediaKey?: string };
type PendingMedia = { key: string; file: File; preview: string };
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
  errorFields: Array<{ name?: string | number | Array<string | number> }>;
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
  const [authorizingImages, setAuthorizingImages] = useState(false);
  const activeEditorRef = useRef(true);
  const [currentProductId, setCurrentProductId] = useState<number | null>(editingId);

  const mediaChoices = useMemo<MediaChoice[]>(() => [
    ...images.filter((item) => !item.isVideo).map((item) => ({
      key: `saved-${item.id}`,
      imageId: item.id,
      label: `已上传图片 #${item.id}`,
      src: item.mediaUrl || item.url,
    })),
    ...pendingMedia.map((item, index) => ({ key: item.key, label: `待上传图片 ${index + 1}`, src: item.preview, pending: true })),
  ], [images, pendingMedia]);
  const selectedCategoryId = Form.useWatch("categoryId", form);
  const selectedPublishMode = Form.useWatch("publishMode", form) || "IMMEDIATE";
  const selectedSalesMode = (Form.useWatch("salesMode", form) || "DIRECT_PURCHASE") as SalesMode;
  const selectedInventoryPolicy = (Form.useWatch("inventoryPolicy", form) || "STANDARD") as InventoryPolicy;
  const isReviewLocked = currentReviewStatus === "IN_REVIEW";
  const isRoleReadOnly = isReviewLocked || (!canGovernPublic && currentStatus !== "DRAFT");
  const selectedCategoryLabel = categories.find((item) => item.value === selectedCategoryId)?.label;
  const watchedName = Form.useWatch("name", form);
  const watchedCode = Form.useWatch("code", form);
  const identityReady = isMeaningfulProductText(watchedName, 2)
    && typeof watchedCode === "string"
    && watchedCode.trim().length > 0
    && Boolean(selectedCategoryId);
  const coverReady = primaryImageId != null || pendingMedia.length > 0;
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
      initialSkuPrice: undefined,
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

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(undefined);
    setSubmitError(undefined);
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
      .then(([categoryRes, productRes]) => {
        if (!mounted) return;
        setCategories(flattenCategories(unwrapResponse<Category[]>(categoryRes)));
        if (productRes) {
          const product = unwrapResponse<ProductEditorRecord>(productRes);
          applyCanonicalProduct(product);
        }
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
  }, [applyCanonicalProduct, editingId, form, id, loadAttempt]);

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
    const room = 9 - images.length - pendingMedia.length;
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
    let shouldAssignCover = primaryImageId == null;
    for (let index = 0; index < mediaToUpload.length; index += 1) {
      const media = mediaToUpload[index];
      const uploaded = unwrapResponse<UploadedProductMedia[]>(await uploadApi.uploadProductImage(media.file))[0];
      if (!uploaded?.storageKey || !uploaded.mediaAssetId) throw new EditorUserError("图片上传失败，请重新选择图片后重试");
      const created = unwrapResponse<ProductImage>(await productApi.addImage(productId, {
        mediaAssetId: uploaded.mediaAssetId,
        storageKey: uploaded.storageKey,
        url: uploaded.url,
        type: index === 0 && images.length === 0 ? "FRONT" : "DETAIL",
        sortOrder: images.length + index,
        width: uploaded.width,
        height: uploaded.height,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
      }));
      if (!created?.id) throw new EditorUserError("图片关联失败，请重新加载后重试");
      if (uploaded.mediaAssetId) mediaAssetIdsByImage.current.set(created.id, uploaded.mediaAssetId);
      if (shouldAssignCover && !created.isVideo) {
        await productApi.setCoverImage(productId, created.id);
        setPrimaryImageId(created.id);
        shouldAssignCover = false;
      }
      idMap.set(media.key, created.id);
      setPendingMedia((prev) => prev.filter((item) => item.key !== media.key));
      setImages((prev) => [...prev, created]);
      setDetail((prev) => prev.map((block) => block.pendingMediaKey === media.key
        ? { ...block, pendingMediaKey: undefined, imageId: created.id }
        : block));
      URL.revokeObjectURL(media.preview);
    }
    return idMap;
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
      setSubmitError(undefined);
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
    deliveryMethods: values.deliveryMethods || [],
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
      setSubmitError(undefined);
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

  const setPrimaryImage = async (imageId: number) => {
    if (!currentProductId || mediaActionId !== null) return;
    if (dirty) {
      messageApi.warning("请先保存当前修改，再设置商品主图");
      return;
    }
    try {
      setMediaActionId(imageId);
      await productApi.setCoverImage(currentProductId, imageId);
      await refreshProduct(currentProductId);
      messageApi.success("商品主图已更新");
    } catch (error) {
      messageApi.error(getSafeAdminErrorMessage(error, "商品主图更新失败，请重新加载后重试。"));
    } finally {
      setMediaActionId(null);
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
        ? "这是当前商品主图。删除后请重新选择主图，避免影响商品展示。"
        : "删除后无法在当前商品中继续使用这张图片。",
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          setMediaActionId(imageId);
          await productApi.deleteImage(currentProductId, imageId);
          await refreshProduct(currentProductId);
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
      setSubmitError(undefined);
      await form.validateFields(requiresFullValidation ? undefined : ["code", "categoryId"]);
      const values = form.getFieldsValue(true);
      const enforcingPublishCopy = intent === "primary"
        && currentStatus !== "PUBLISHED"
        && (values.publishMode === "IMMEDIATE" || values.publishMode === "SCHEDULED");
      if (enforcingPublishCopy) {
        const fieldErrors: Array<{ name: "name" | "shortDescription" | "description" | "code"; errors: string[] }> = [];
        const gaps: string[] = [];
        if (!isMeaningfulProductText(values.name, 2)) {
          fieldErrors.push({ name: "name", errors: ["请填写商品标题；整段不能只有数字或同一个字"] });
          gaps.push("商品标题");
        }
        const code = typeof values.code === "string" ? values.code.trim() : "";
        if (!code) {
          fieldErrors.push({ name: "code", errors: ["请输入货号"] });
          gaps.push("货号");
        }
        if (typeof values.shortDescription === "string" && values.shortDescription.trim() && !isMeaningfulProductText(values.shortDescription, 1)) {
          fieldErrors.push({ name: "shortDescription", errors: ["简介不能整段只有数字或同一个字"] });
          gaps.push("商品简介");
        }
        if (typeof values.description === "string" && values.description.trim() && !isMeaningfulProductText(values.description, 1)) {
          fieldErrors.push({ name: "description", errors: ["说明不能整段只有数字或同一个字"] });
          gaps.push("商品说明");
        }
        const detailTexts = detail.filter((block) => block.type === "TEXT" && block.text?.trim());
        if (detailTexts.some((block) => !isMeaningfulProductText(block.text, 1))) {
          gaps.push("商品详情");
        }
        if (typeof values.name === "string" && /秒杀|限时折扣|满减/.test(values.name)) {
          fieldErrors.push({ name: "name", errors: ["标题不要写秒杀、限时折扣或满减"] });
          gaps.push("标题中的促销词");
        }
        const claimIssues = jewelryClaimIssues([
          values.name,
          values.shortDescription,
          values.description,
          ...detailTexts.map((block) => block.text),
        ]);
        if (claimIssues.length > 0) {
          fieldErrors.push({ name: "name", errors: claimIssues });
          gaps.push(...claimIssues);
        }
        if (values.visibility === "PUBLIC" && !primaryImageId && pendingMedia.length === 0) {
          gaps.push("这件作品的实物主图");
        }
        if (values.salesMode === "DIRECT_PURCHASE") {
          const typedPrice = Number(values.initialSkuPrice);
          const hasTypedPrice = Number.isFinite(typedPrice) && typedPrice > 0;
          const hasSkuPrice = skus.some((sku) => sku.isActive !== false && Number(sku.price) > 0);
          if (!hasTypedPrice && !hasSkuPrice) gaps.push("一个大于 0 的成交价");
        }
        if (fieldErrors.length > 0 || gaps.length > 0) {
          if (fieldErrors.length > 0) form.setFields(fieldErrors);
          setSubmitError(`上架前请补全：${gaps.join("、")}。`);
          messageApi.warning("请检查并修正标红字段");
          form.scrollToField(fieldErrors[0]?.name || "name", { behavior: "smooth", block: "center" });
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
      const idMap = await uploadPending(productId);
      const detailContent = detail.map(({ key: _key, pendingMediaKey, ...block }) => ({
        ...block,
        imageId: pendingMediaKey ? idMap.get(pendingMediaKey) : block.imageId,
      })).filter((block) => block.type === "TEXT" ? Boolean(block.text?.trim()) : Boolean(block.imageId));
      const { code: _code, ...updatePayload } = { ...contentPayload, detailContent };
      await productApi.update(productId, updatePayload);
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
          setSubmitError(undefined);
          messageApi.warning("商品已写入，最新状态待确认；请重新读取保存结果");
        }
        return false;
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
        const firstField = error.errorFields[0]?.name;
        messageApi.warning(requiresFullValidation ? "请检查并修正标红字段" : "保存草稿至少需要选择类目并填写货号");
        if (firstField) {
          form.scrollToField(firstField, { behavior: "smooth", block: "center" });
          window.setTimeout(() => form.getFieldInstance(firstField)?.focus?.(), 0);
        }
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
      setSubmitError(failure.message);
      messageApi.error(failure.message);
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
      setSubmitError(undefined);
      await productApi.updateStatus(currentProductId, "PUBLISHED");
      await refreshProduct(currentProductId);
      setDirty(false);
      setSavedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      messageApi.success("审核版本已通过并上架");
    } catch (error: unknown) {
      const failure = getProductSubmitFailure(error);
      setSubmitError(failure.message);
      messageApi.error(failure.message);
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
      setSubmitError(undefined);
      await productApi.updateStatus(currentProductId, "DRAFT");
      await refreshProduct(currentProductId);
      setDirty(false);
      setSavedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      messageApi.success("作品已退回草稿，可继续修改后重新提交");
    } catch (error: unknown) {
      const failure = getProductSubmitFailure(error);
      setSubmitError(failure.message);
      messageApi.error(failure.message);
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
    markDirty();
  };
  const addImageBlock = () => {
    setDetail((prev) => [...prev, { key: `image-${Date.now()}`, type: "IMAGE" }]);
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
  const watchedVisibility = Form.useWatch("visibility", form);
  const visibilityOptions = [
    { value: "PUBLIC", label: "全部人可见" },
    { value: "INTERNAL", label: "仅内部可见" },
    ...(watchedVisibility === "MEMBER" ? [{ value: "MEMBER", label: "登录会员可见" }] : []),
    ...(watchedVisibility === "PARTNER" ? [{ value: "PARTNER", label: "合作商家专属" }] : []),
  ];

  if (loading) {
    return (
      <div className="pro-editor__loading" role="status" aria-live="polite">
        <Spin />
        <span>正在加载商品信息…</span>
      </div>
    );
  }
  if (loadError) return <div className="pro-editor__load-error"><AdminErrorState subject="商品信息" message={loadError} onRetry={() => setLoadAttempt((value) => value + 1)} /></div>;

  return (
    <div className="pro-editor">
      <h1 className="pro-editor__sr-only">{editingId ? "编辑商品" : "新建商品"}</h1>
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
      <Form name="product-editor-main" form={form} initialValues={defaultValues} layout="vertical" disabled={saving || isRoleReadOnly || Boolean(pendingSaveVerification)} onValuesChange={() => { markDirty(); setSubmitError(undefined); }} className="pro-editor__form">
        <ol className="pro-editor__flow" aria-label="发布步骤">
          {publishSteps.map((step) => <li key={step.title} data-state={step.state}><b>{step.title}</b><span>{step.detail}</span></li>)}
        </ol>
        {submitError && <Alert className="pro-editor__submit-error" type="error" showIcon message="商品保存未完成" description={submitError} closable onClose={() => setSubmitError(undefined)} action={role === "SUPER_ADMIN" && submitError.includes("公开展示") ? <Button size="small" loading={authorizingImages} onClick={() => void confirmProductImagesPublic()}>确认这些图片可在网站公开展示</Button> : undefined} />}
        <div className="pro-editor__category"><strong>当前类目 <i>*</i></strong><span>{selectedCategoryLabel || "珠宝 / 请选择具体类目"}</span><Tag color={statusMeta[currentStatus].color}>{statusMeta[currentStatus].label}</Tag><button type="button" onClick={() => { setActive("basic"); document.getElementById("basic")?.scrollIntoView({ behavior: "smooth" }); }}>切换类目</button></div>

        <section id="basic" className="pro-editor__card">
          <div className="pro-editor__title-row"><h2>基础信息</h2></div>
          <Form.Item name="name" label="商品标题" className="pro-editor__horizontal-field" extra="上架前填写。例如「18K金红宝石戒指」。" rules={[{ max: 60, message: "商品标题不能超过 60 个字符" }]}><Input maxLength={60} showCount placeholder="如：18K金红宝石戒指" /></Form.Item>
          <Form.Item
            name="shortDescription"
            label="商品简介"
            className="pro-editor__horizontal-field"
            extra="选填。"
            rules={[{ max: 500, message: "商品简介不能超过 500 个字符" }]}
          >
            <Input maxLength={500} showCount placeholder="概括材质、设计和佩戴特点" />
          </Form.Item>
          <Form.Item
            name="description"
            label="商品说明"
            className="pro-editor__horizontal-field"
            extra="选填。"
            rules={[{ max: 5000, message: "商品说明不能超过 5000 个字符" }]}
          >
            <Input.TextArea rows={4} maxLength={5000} showCount placeholder="介绍材质、设计、工艺与佩戴建议" />
          </Form.Item>
          <Form.Item name="categoryId" label="当前类目" className="pro-editor__horizontal-field" rules={[{ required: true, message: "请选择珠宝类目" }]}><Select showSearch optionFilterProp="label" options={categories} placeholder="请选择珠宝类目" /></Form.Item>
          <Form.Item name="goldWeight" label="金重（g）" className="pro-editor__horizontal-field pro-editor__money-field" extra="选填。知道克重后再填写。"><InputNumber min={0} precision={2} suffix="g" /></Form.Item>
          <Form.Item name="weight" label="总重（g）" className="pro-editor__horizontal-field pro-editor__money-field"><InputNumber min={0} precision={2} suffix="g" /></Form.Item>
          <div className="pro-editor__attribute-banner"><b>作品资料</b><span>材质、尺寸、工艺、宝石和证书都是选填</span></div>
          <div className="pro-editor__attributes">
            <Form.Item name="code" label="货号" rules={[{ required: true, message: "请输入货号" }]}><Input disabled={Boolean(currentProductId)} maxLength={50} /></Form.Item>
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
          <div className="pro-editor__row-label"><strong>实物主图</strong><span>可以一次多选。公开上架前放这件作品的照片。不要拼图或促销字。最多 9 张，单张 10MB 以内。</span></div>
          <div className="pro-editor__uploads">
            {mediaChoices.map((item) => <div className="pro-editor__upload-item" key={item.key}>
              <SecureImage src={item.src} alt={item.label} tokenKind="staff" />
              <span>{item.imageId === primaryImageId ? "当前主图" : item.label}</span>
              {"pending" in item && item.pending && <button type="button" className="pro-editor__upload-remove" aria-label={`移除${item.label}`} onClick={() => removePendingMedia(item.key)}><DeleteOutlined /></button>}
              {item.imageId && <div className="pro-editor__upload-actions">
                <Button type="link" size="small" disabled={item.imageId === primaryImageId || mediaActionId !== null} loading={mediaActionId === item.imageId} onClick={() => void setPrimaryImage(item.imageId!)}>{item.imageId === primaryImageId ? "已设主图" : "设为主图"}</Button>
                <Button type="link" size="small" danger disabled={mediaActionId !== null} onClick={() => confirmDeleteImage(item.imageId!)}>删除</Button>
              </div>}
            </div>)}
            {Array.from({ length: Math.max(0, 9 - mediaChoices.length) }).map((_, index) => <Upload key={`empty-upload-${index}`} multiple accept="image/jpeg,image/png,image/webp,image/gif" showUploadList={false} disabled={saving} beforeUpload={addPendingMedia}><button type="button" disabled={saving} aria-label={`上传图片，可一次多选，当前还可上传 ${9 - mediaChoices.length} 张`} className="pro-editor__upload"><FileImageOutlined /><span>上传图片</span></button></Upload>)}
          </div>
          <div className="pro-editor__detail-head"><div><strong>商品详情</strong><span>选填。有工艺或佩戴说明时再添加</span></div><Space><Button onClick={addImageBlock}>添加图片</Button><Button onClick={addTextBlock}>添加文字</Button></Space></div>
          <div className="pro-editor__detail-tip">文字与图片按添加顺序展示，手机端会自动适配。</div>
          <div className="pro-editor__detail-grid">
            <aside><b>添加</b><Button icon={<FileImageOutlined />} onClick={addImageBlock}>图片</Button><Button onClick={addTextBlock}>文字</Button></aside>
            <div className="pro-editor__blocks">
              {detail.length === 0 && <div className="pro-editor__empty">尚未添加详情模块</div>}
              {detail.map((block, index) => <div className="pro-editor__block" key={block.key}>
                <div className="pro-editor__block-tools"><Tag>{block.type === "TEXT" ? "文字" : "图片"}</Tag><Button aria-label={`上移${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveBlock(index, -1)} /><Button aria-label={`下移${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" icon={<ArrowDownOutlined />} disabled={index === detail.length - 1} onClick={() => moveBlock(index, 1)} /><Button aria-label={`删除${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" danger icon={<DeleteOutlined />} onClick={() => { setDetail((prev) => prev.filter((item) => item.key !== block.key)); markDirty(); }} /></div>
                {block.type === "TEXT" ? <Input.TextArea rows={4} value={block.text} placeholder="输入商品工艺、设计寓意或佩戴说明" onChange={(event) => { setDetail((prev) => prev.map((item) => item.key === block.key ? { ...item, text: event.target.value } : item)); markDirty(); }} /> : <Select value={block.imageId ? `saved-${block.imageId}` : block.pendingMediaKey} placeholder="选择已上传的商品图片" options={mediaChoices.map((item) => ({ value: item.key, label: item.label }))} onChange={(value) => { const saved = value.startsWith("saved-"); setDetail((prev) => prev.map((item) => item.key === block.key ? { ...item, imageId: saved ? Number(value.replace("saved-", "")) : undefined, pendingMediaKey: saved ? undefined : value } : item)); markDirty(); }} />}
              </div>)}
            </div>
            <div className="pro-editor__preview"><div className="pro-editor__phone-tabs"><span>图片</span><b>详情</b><span>说明</span></div>{detail.length === 0 ? <div className="pro-editor__preview-empty"><FileImageOutlined /><span>详情内容将在这里预览</span></div> : detail.map((block) => block.type === "TEXT" ? <p key={block.key}>{block.text || "文字内容"}</p> : <SecureImage key={block.key} src={mediaChoices.find((item) => item.key === (block.pendingMediaKey || `saved-${block.imageId}`))?.src} alt={block.alt || "商品详情"} tokenKind="staff" />)}</div>
          </div>
        </section>

        <section id="sales" className="pro-editor__card">
          <div className="pro-editor__title-row"><h2>销售信息</h2></div>
          <div className="pro-editor__sales-grid">
            <Form.Item name="salesMode" label="销售方式" extra={showCommerceFacts && !commerceEnabled ? "支付未开放，顾客可以看到价格，但不能在网站付款。" : "选择顾客看到这件作品后的下一步。"}><Radio.Group><Radio value="DIRECT_PURCHASE">直接销售</Radio><Radio value="DISPLAY_ONLY">仅展示</Radio><Radio value="SELECTION">选款咨询</Radio><Radio value="APPOINTMENT">预约到店</Radio><Radio value="CUSTOM_INQUIRY">定制咨询</Radio></Radio.Group></Form.Item>
            {showCommerceFacts ? <>
              <Form.Item label="当前最低价" className="pro-editor__money-field" extra="有多个规格时，页面显示其中的最低价。"><div className="pro-editor__derived-price">{currentProductId ? (derivedPrice > 0 ? `¥ ${derivedPrice.toFixed(2)}` : "—") : "保存商品后显示"}</div></Form.Item>
              {!currentProductId ? <Form.Item name="initialSkuPrice" label="成交价" className="pro-editor__money-field" extra="顾客看到的价格。有不同规格时，保存后再在下方逐个填写。"><InputNumber min={0} precision={2} suffix="元" /></Form.Item> : null}
              <Form.Item label="库存策略"><Form.Item name="inventoryPolicy" noStyle><Radio.Group><Radio value="STANDARD">标准库存</Radio><Radio value="SINGLE_UNIT">一物一件</Radio></Radio.Group></Form.Item><span className="pro-editor__hint">{inventoryPolicyMessage}</span></Form.Item>
              <Alert className="pro-editor__inventory-alert" type="info" showIcon message={salesModeMessage} />
              {selectedInventoryPolicy === "SINGLE_UNIT" && currentProductId && activeSkuCount !== 1 ? <Alert className="pro-editor__inventory-alert" type="error" showIcon message={`当前有 ${activeSkuCount} 个有效 SKU；一物一件必须且只能保留 1 个。保存时以服务端 409 校验结果为准。`} /> : null}
            </> : <Alert className="pro-editor__inventory-alert" type="info" showIcon message={salesModeMessage} />}
            <Form.Item name="publishMode" label={canGovernPublic ? "上架时间" : "发布流程"}><Radio.Group disabled={!canGovernPublic}><Radio value="IMMEDIATE">立刻上架</Radio><Radio value="SCHEDULED">定时上架</Radio><Radio value="WAREHOUSE">提交审核前保留草稿</Radio></Radio.Group></Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.publishMode !== next.publishMode}>{({ getFieldValue }) => getFieldValue("publishMode") === "SCHEDULED" ? <Form.Item name="scheduledPublishAt" label="定时上架时间" rules={[{ required: true }]}><DatePicker showTime disabledDate={(date) => date.isBefore(dayjs(), "day")} /></Form.Item> : null}</Form.Item>
            <Form.Item name="visibility" label="可见范围"><Select options={visibilityOptions} /></Form.Item>
          </div>
          {showCommerceFacts ? <div className="pro-editor__sku-panel">
            <div className="pro-editor__title-row">
              <div><h3>规格与价格</h3><span>{currentProductId ? `${activeSkuCount} 个有效规格。每种规格填写自己的成交价。` : "只有一种规格时，上面的成交价就够了。"}</span></div>
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
            {detail.map((block) => block.type === "TEXT" ? <p key={block.key}>{block.text || "文字内容待完善"}</p> : <SecureImage key={block.key} src={mediaChoices.find((item) => item.key === (block.pendingMediaKey || `saved-${block.imageId}`))?.src} alt={block.alt || "商品详情图片"} tokenKind="staff" />)}
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
          <Alert type="info" showIcon message="SKU 库存不在这里直接修改，请到库存管理维护实际可售数量。" />
        </Form>
      </Modal>
      <UnsavedChangesGuard hasUnsavedChanges={dirty} disabled={saving} subject="商品信息" rootClassName="pro-editor-unsaved-modal" onSaveAndLeave={() => saveRef.current()} />
    </div>
  );
}
