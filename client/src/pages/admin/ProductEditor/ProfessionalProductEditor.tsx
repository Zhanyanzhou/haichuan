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
import { categoryApi, inventoryApi, productApi, shippingTemplateApi, uploadApi } from "@/services/api";
import { productImageAngle, productImageFingerprint, productImageRank } from "../productImageIntake";
import { craftOptions, gemOptions, getProductEntrySuggestions, type EntrySuggestion } from "./productEntrySuggestions";
import { clampProductTitle, PRODUCT_TITLE_MAX_UNITS, productTitleUnits } from "@/utils/productTitleLength";
import type {
  ProductSkuWriteInput,
  ProductWriteInput,
} from "@/services/api";
import type { EditorSkuUpdate } from "@/services/clients/productClient";
import { useCommerceEnabled } from "@/store/featureFlags";
import { useAuthStore } from "@/store/authStore";
import type {
  Category,
  Certificate,
  InventoryPolicy,
  MaterialType,
  Product,
  ProductDetailBlock,
  ProductImage,
  ProductSKU,
  ProductStatus,
  SalesMode,
  ShippingTemplate,
} from "@/types";
import type { CategoryPublicationRule } from "@/types/catalog";
import { DETAIL_ONLY_IMAGE_SORT_FLOOR } from "@/utils/productImage";
import { unwrapResponse } from "@/utils/unwrap";
import { normalizeAdminReturnPath } from "@/utils/adminReturnPath";
import UnsavedChangesGuard from "../HomepageConfig/components/UnsavedChangesGuard";
import { describeJewelry, isPreciousMetal, JEWELRY_MEASUREMENT_LABELS, readJewelryMeasurements } from "@/utils/jewelryParameters";
import { isPublishableCertificate } from "@/utils/productCertificate";
import ProductCertificateEditor from "./ProductCertificateEditor";
import "./ProfessionalProductEditor.css";

type DetailDraft = ProductDetailBlock & { key: string; pendingMediaKey?: string };
type PendingMedia = { key: string; file: File; preview: string; purpose?: "detail" };
type MediaChoice = { key: string; label: string; src?: string; imageId?: number; pending?: boolean; filename?: string; view?: ProductImage["type"] };
type PendingSaveVerification = { productId: number; continueNext?: boolean };
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
  settingMaterial?: MaterialType;
  origin?: string;
  treatment?: string;
  quantity?: number;
  certificateAuthority?: string;
  certificateNumber?: string;
  certificateQueryUrl?: string;
  brand?: string;
  collection?: string;
  style?: string;
  occasion?: string;
  condition?: string;
  materialNote?: string;
  metalColor?: string;
  measurements?: Record<string, string>;
};

type ProductEditorRecord = Omit<Product, "gemInfo"> & {
  gemInfo?: ProductEditorGemInfo | null;
  fulfillmentConfirmed?: boolean;
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
  gemSettingMaterial?: MaterialType;
  gemOrigin?: string;
  gemTreatment?: string;
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
  priceMin?: number | null;
  inventoryPolicy: InventoryPolicy;
  purchaseRegion?: Product["purchaseRegion"];
  publishMode: "IMMEDIATE" | "SCHEDULED" | "WAREHOUSE";
  scheduledPublishAt?: { toISOString: () => string } | null;
  fulfillmentType?: Product["fulfillmentType"];
  dispatchTime?: Product["dispatchTime"];
  fulfillmentConfirmed?: boolean;
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
  materialNote?: string;
  metalColor?: string;
  measurements?: Record<string, string>;
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

function isFormalProductTitle(value: unknown): value is string {
  return typeof value === "string" && !/^未命名商品(?:\s*[-－—].*)?$/u.test(value.trim()) && isMeaningfulProductText(value, 2);
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

function isCheckoutReadyFreeTemplate(template: ShippingTemplate): boolean {
  const baseFee = Number(template.baseFee);
  const remoteSurcharge = Number(template.remoteSurcharge);
  const excludedRegions = template.excludedRegions;
  const hasExcludedRegion = Array.isArray(excludedRegions)
    ? excludedRegions.length > 0
    : excludedRegions != null;
  return template.isActive
    && template.feeMode === "FREE"
    && Number.isFinite(baseFee)
    && baseFee === 0
    && Number.isFinite(remoteSurcharge)
    && remoteSurcharge === 0
    && template.freeShippingThreshold == null
    && !hasExcludedRegion;
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
  | "stockQuantity"
  | "deliveryMethods"
  | "scheduledPublishAt"
  | "inventoryPolicy"
  | "materialType"
  | "size"
  | "goldWeight"
  | "gemType"
  | "gemSettingMaterial"
  | "gemOrigin"
  | "gemTreatment"
  | "gemCarat"
  | "gemClarity"
  | "fulfillmentConfirmed"
  | "fulfillmentType"
  | "dispatchTime"
  | "customLeadTime"
  | "product-certificates"
  | "product-cover"
  | "product-detail"
  | "product-skus"
  | "basic"
  | "facts"
  | "publish"
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
  "stockQuantity",
  "deliveryMethods",
  "scheduledPublishAt",
  "inventoryPolicy",
  "materialType", "size", "goldWeight", "gemType", "gemSettingMaterial", "gemOrigin", "gemTreatment", "gemCarat", "gemClarity",
  "fulfillmentConfirmed", "fulfillmentType", "dispatchTime", "customLeadTime",
]);

function sectionForPublishTarget(target: PublishTarget): "basic" | "media" | "sales" | "facts" | "publish" {
  if (target === "product-detail" || target === "media") return "media";
  if (target === "product-cover") return "basic";
  if (["shortDescription", "description", "materialType", "size", "goldWeight", "gemType", "gemSettingMaterial", "gemOrigin", "gemTreatment", "gemCarat", "gemClarity", "product-certificates", "facts"].includes(target)) return "facts";
  if (["scheduledPublishAt", "deliveryMethods", "fulfillmentConfirmed", "fulfillmentType", "dispatchTime", "customLeadTime", "publish"].includes(target)) return "publish";
  if (
    target === "initialSkuPrice"
    || target === "stockQuantity"
    || target === "product-skus"
    || target === "inventoryPolicy"
    || target === "sales"
  ) return "sales";
  return "basic";
}

function publishTargetForLabel(label: string, hasSavedProduct: boolean): PublishTarget {
  if (/主图|商品图片|公开展示|列表图/.test(label)) return "product-cover";
  if (/详情/.test(label)) return "product-detail";
  if (/成交价|商品价格|交易价格/.test(label)) return "initialSkuPrice";
  if (/库存/.test(label)) return "stockQuantity";
  if (/SKU.*(金重|圈口|内径|链长)/.test(label)) return hasSavedProduct ? "product-skus" : /金重/.test(label) ? "goldWeight" : "size";
  if (/有效规格|SKU|一物一件/.test(label)) return hasSavedProduct ? "product-skus" : "initialSkuPrice";
  if (/配送/.test(label)) return "deliveryMethods";
  if (/备货时间/.test(label)) return "customLeadTime";
  if (/备货|发出时效/.test(label)) return "fulfillmentConfirmed";
  if (/镶托材质/.test(label)) return "gemSettingMaterial";
  if (/宝石来源/.test(label)) return "gemOrigin";
  if (/宝石处理/.test(label)) return "gemTreatment";
  if (/主石克拉/.test(label)) return "gemCarat";
  if (/主石等级/.test(label)) return "gemClarity";
  if (/材质/.test(label)) return "materialType";
  if (/主石|宝石/.test(label)) return "gemType";
  if (/证书/.test(label)) return "product-certificates";
  if (/简介/.test(label)) return "shortDescription";
  if (/说明/.test(label)) return "description";
  if (/款号/.test(label)) return "code";
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
  const matched = message.match(/(?:上架前请补全|发布前请补全|商品未达到发布条件)[:：]\s*([^。]+)/);
  if (matched) {
    return matched[1].split(/[、，]/).map((part) => part.trim()).filter(Boolean).map((label) => ({
      label,
      target: publishTargetForLabel(label, hasSavedProduct),
    }));
  }
  if (field === "shippingTemplateId") return [{ label: "销售信息", target: "sales" }];
  if (field && FORM_JUMP_FIELDS.has(field)) {
    const labels: Record<string, string> = {
      code: "款号",
      name: "商品标题",
      categoryId: "当前类目",
      shortDescription: "商品简介",
      description: "商品说明",
      scheduledPublishAt: "定时上架时间",
    };
    return [{ label: labels[field] || "查看对应位置", target: field as PublishTarget }];
  }
  if (/包邮运费模板|运费模板/.test(message)) return [{ label: "运费模板", target: "sales" }];
  if (/一物一件|有效 SKU/.test(message)) return [{ label: "规格与价格", target: "product-skus" }];
  if (/证书/.test(message)) return [{ label: "鉴定证书", target: "product-certificates" }];
  if (/公开展示|主图/.test(message)) return [{ label: "实物主图", target: "product-cover" }];
  return [];
}

function clarifyPublicationGaps(missing: string): string {
  return missing
    .replace("已指定、可读取且授权有效的商品图片作为主图", "商品主图尚未允许网站公开展示")
    .replace("列表图如已指定，须可读取且授权有效", "列表图尚未允许网站公开展示");
}

function explainScheduledFailure(reason: string): string {
  if (reason.startsWith("发布前请补全:")) return clarifyPublicationGaps(reason);
  if (/^(作品正在审核中|定时上架缺少可审计的管理员来源|一物一件商品)/.test(reason)) return reason;
  return "请检查商品资料和上架条件，再重新安排上架。";
}

function getProductSubmitFailure(error: unknown): ProductSubmitFailure<
  "code" | "categoryId" | "shippingTemplateId" | "scheduledPublishAt" | "name"
> {
  const requestError = error as EditorRequestError | undefined;
  const status = requestError?.status ?? requestError?.response?.status;
  const serverMessage = requestError?.message?.trim().replace(/货号/g, "款号") || "";

  if (status === 409 && serverMessage.includes("商品款号")) {
    return { message: "该商品款号已存在，请更换款号后重试。", field: "code" };
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
    return { message: `${clarifyPublicationGaps(serverMessage)}。请按提示修正后重试。` };
  }
  if (status === 400 && serverMessage.includes("请填写商品名称")) {
    return { message: "请填写商品标题后重试。", field: "name" };
  }
  if (status === 400 && serverMessage.includes("请填写商品款号")) {
    return { message: "请填写商品款号后重试。", field: "code" };
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
  CUSTOM_INQUIRY: "预约定制",
};

const DELIVERY_METHOD_OPTIONS = [
  { label: "物流配送", value: "EXPRESS" },
  { label: "到店自提", value: "STORE_PICKUP" },
  { label: "专人配送", value: "DEDICATED" },
] as const;

const FULFILLMENT_OPTIONS = [
  { value: "IN_STOCK", label: "现货" },
  { value: "PREORDER", label: "预订备货" },
  { value: "CUSTOM", label: "按单制作" },
];

const IMAGE_VIEW_OPTIONS: Array<{ value: ProductImage["type"]; label: string }> = [
  { value: "FRONT", label: "正面" },
  { value: "SIDE", label: "侧面" },
  { value: "TOP", label: "顶部" },
  { value: "DETAIL", label: "局部细节" },
  { value: "WEARING", label: "佩戴效果" },
];

const DETAIL_TEMPLATES = [
  ["设计理念", "设计理念\n"],
  ["材质介绍", "材质介绍\n"],
  ["宝石介绍", "宝石介绍\n"],
  ["工艺细节", "工艺细节\n"],
  ["尺寸参数", "尺寸参数\n"],
  ["鉴定证书", "鉴定证书\n"],
  ["商品包装", "商品包装\n"],
  ["保养说明", "保养说明\n"],
] as const;

const DISPATCH_OPTIONS = [
  { value: "SAME_DAY", label: "当天发出" },
  { value: "WITHIN_24_HOURS", label: "24 小时内发出" },
  { value: "WITHIN_48_HOURS", label: "48 小时内发出" },
  { value: "OVER_48_HOURS", label: "超过 48 小时发出" },
  { value: "CUSTOM", label: "按约定发出" },
];

const PRECIOUS_METALS = new Set(["GOLD_999", "GOLD_9999", "AU750", "PT950", "S925"]);

const GEM_ORIGINS = ["天然", "实验室培育", "养殖", "人工合成", "仿制"];

const CATEGORY_SIZE_FIELDS = [
  { rule: "RING_SIZE", label: "戒指圈口", example: "如：港码 14" },
  { rule: "INNER_DIAMETER", label: "内径或圈口", example: "如：内径 56 mm" },
  { rule: "CHAIN_LENGTH", label: "链长或可调范围", example: "如：40–45 cm" },
] as const;

function normalizeDeliveryMethods(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string =>
    item === "EXPRESS" || item === "STORE_PICKUP" || item === "DEDICATED");
}

type EditorStockRow = { id: number; skuId?: number; quantity: number };

function readEditorStockRows(payload: unknown, productId: number): { rows: EditorStockRow[]; total: number } {
  if (!payload || typeof payload !== "object") return { rows: [], total: 0 };
  const body = payload as { list?: unknown; total?: unknown };
  const list = Array.isArray(body.list) ? body.list : [];
  const total = Number(body.total);
  const rows = list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as {
      id?: number;
      skuId?: number;
      quantity?: number;
      productId?: number;
      sku?: { product?: { id?: number } };
    };
    if (!Number.isInteger(row.id)) return [];
    const ownerId = row.sku?.product?.id ?? row.productId;
    if (ownerId != null && ownerId !== productId) return [];
    const quantity = Number(row.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity < 0) return [];
    return [{ id: row.id as number, skuId: row.skuId, quantity }];
  });
  return { rows, total: Number.isFinite(total) ? total : rows.length };
}

async function readProductStock(productId: number, page = 1) {
  const data = unwrapResponse<unknown>(await inventoryApi.getList({
    page,
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
  salesMode: "CUSTOM_INQUIRY",
  priceMin: 1000,
  inventoryPolicy: "STANDARD",
  purchaseRegion: "MAINLAND",
  publishMode: "IMMEDIATE",
  fulfillmentConfirmed: false,
  deliveryMethods: [],
  requiresInsuredShipping: false,
  requiresSignature: false,
  includesCertificate: false,
};

const PRODUCT_FRAME_KEY = "haichuan.product-publish-frame.v1";
/** 实物主图在编辑器中默认展示并接受的张数。已保存的更多主图仍全部显示，只是不能再添加。 */
const PRODUCT_COVER_LIMIT = 5;

type ProductPublishFrame = {
  salesMode: SalesMode;
  priceMin?: number | null;
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
      priceMin: parsed.priceMin === null ? null
        : typeof parsed.priceMin === "number" && Number.isFinite(parsed.priceMin) && parsed.priceMin > 0
          ? parsed.priceMin : undefined,
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

const FRAME_VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: "全部人可见",
  INTERNAL: "仅内部可见",
  MEMBER: "登录会员可见",
  PARTNER: "合作商家专属",
};

const FRAME_PUBLISH_LABELS: Record<string, string> = {
  IMMEDIATE: "立刻上架",
  SCHEDULED: "定时上架",
  WAREHOUSE: "先保留草稿",
};

function publishFrameRows(frame: ProductPublishFrame | null): Array<[string, string]> {
  const mode = frame?.salesMode || "CUSTOM_INQUIRY";
  const price = mode !== "CUSTOM_INQUIRY"
    ? null
    : !frame
      ? "¥1,000 起"
      : frame.priceMin === null
        ? "不公开"
        : Number(frame.priceMin) > 0
          ? `¥${Number(frame.priceMin).toLocaleString()} 起`
          : "¥1,000 起";
  return [
    ["销售方式", salesModeLabelsForPreview[mode] || "预约定制"],
    ["可见范围", FRAME_VISIBILITY_LABELS[frame?.visibility || "PUBLIC"] || "全部人可见"],
    ["上架时间", FRAME_PUBLISH_LABELS[frame?.publishMode || "IMMEDIATE"] || "立刻上架"],
    ...(price ? [["参考起价", price] as [string, string]] : []),
    ["材质", frame?.materialType ? (materials.find((item) => item.value === frame.materialType)?.label || "已存材质") : "不预填"],
    ["简介", frame?.shortDescription ? "沿用已存文字" : "不预填"],
    ["说明", frame?.description ? "沿用已存文字" : "不预填"],
  ];
}

function frameToFormValues(frame: ProductPublishFrame): Partial<ProductEditorFormValues> {
  return {
    salesMode: frame.salesMode,
    ...(frame.priceMin !== undefined ? { priceMin: frame.priceMin } : {}),
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

type ProductCategoryOption = { value: number; label: string; rules: CategoryPublicationRule[]; disabled: boolean };

function flattenCategories(nodes: Category[], prefix = ""): ProductCategoryOption[] {
  return (nodes || []).flatMap((node) => {
    const label = `${prefix}${node.name}`;
    const rules = node.publicationRules || [];
    const disabled = node.isActive === false || rules.includes("GROUP_ONLY");
    const optionLabel = rules.includes("GROUP_ONLY") ? `${label}（仅分组）` : label;
    return [{ value: node.id, label: optionLabel, rules, disabled }, ...flattenCategories(node.children || [], `${label} / `)];
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
  const [scheduledPublishError, setScheduledPublishError] = useState<string | null>(null);
  const [currentReviewStatus, setCurrentReviewStatus] = useState<"DRAFT" | "IN_REVIEW">("DRAFT");
  const [categories, setCategories] = useState<ProductCategoryOption[]>([]);
  const [shippingTemplates, setShippingTemplates] = useState<ShippingTemplate[]>([]);
  const [shippingTemplatesError, setShippingTemplatesError] = useState(false);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [primaryImageId, setPrimaryImageId] = useState<number | null>(null);
  const [mediaActionId, setMediaActionId] = useState<number | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [checkingImages, setCheckingImages] = useState(false);
  const checkingImagesRef = useRef(false);
  const [checkingSuggestedCode, setCheckingSuggestedCode] = useState(false);
  const checkingSuggestedCodeRef = useRef(false);
  const entryTouched = useRef(new Set<string>());
  const [entryApplied, setEntryApplied] = useState<EntrySuggestion[]>([]);
  const [detail, setDetail] = useState<DetailDraft[]>([]);
  const [detailPickerOpen, setDetailPickerOpen] = useState(false);
  const [previewPane, setPreviewPane] = useState<"photos" | "detail" | "copy">("detail");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "phone">("desktop");
  const [checkOpen, setCheckOpen] = useState(false);
  const [forceGem, setForceGem] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<Partial<ProductEditorFormValues>>({});
  const [previewSkuId, setPreviewSkuId] = useState<number | null>(null);
  const [previewStock, setPreviewStock] = useState<Map<number, boolean> | null>();
  const [skuForm] = Form.useForm<Pick<ProductSkuWriteInput, "skuCode" | "imageId" | "material" | "size" | "color" | "goldWeight" | "price" | "isActive">>();
  const [skus, setSkus] = useState<ProductSKU[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certificateBusy, setCertificateBusy] = useState(false);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<ProductSKU | null>(null);
  const [skuSaving, setSkuSaving] = useState(false);
  const [skuActionId, setSkuActionId] = useState<number | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const savingRef = useRef(false);
  const pendingMediaRef = useRef<PendingMedia[]>([]);
  const nextGalleryImageKey = useRef(0);
  const mediaAssetIdsByImage = useRef(new Map<number, number>());
  const uploadSelectionRef = useRef<File[] | null>(null);
  const detailUploadSelectionRef = useRef<File[] | null>(null);
  const [authorizingImages, setAuthorizingImages] = useState(false);
  const activeEditorRef = useRef(true);
  const suppressDirtyRef = useRef(false);
  const [currentProductId, setCurrentProductId] = useState<number | null>(editingId);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [correctingCode, setCorrectingCode] = useState(false);
  const [publishFrame, setPublishFrame] = useState<ProductPublishFrame | null>(() => readProductPublishFrame());
  const [galleryOrder, setGalleryOrder] = useState<string[]>([]);
  const [draggingGalleryKey, setDraggingGalleryKey] = useState<string | null>(null);
  const draggingGalleryKeyRef = useRef<string | null>(null);
  const [galleryDropKey, setGalleryDropKey] = useState<string | null>(null);
  const [pendingViews, setPendingViews] = useState<Record<string, ProductImage["type"]>>({});
  const [draggingDetailKey, setDraggingDetailKey] = useState<string | null>(null);
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
        view: item.type,
      });
    }
    pendingMedia.filter((item) => item.purpose !== "detail").forEach((item, index) => {
      byKey.set(item.key, {
        key: item.key,
        label: `待上传图片 ${index + 1}`,
        filename: item.file.name,
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
  const selectedSalesMode = (Form.useWatch("salesMode", form) || "CUSTOM_INQUIRY") as SalesMode;
  const checkoutReadyTemplates = shippingTemplates.filter(isCheckoutReadyFreeTemplate);

  useEffect(() => {
    if (selectedSalesMode !== "DIRECT_PURCHASE") return;
    let mounted = true;
    setShippingTemplatesError(false);
    shippingTemplateApi.list()
      .then((response) => {
        if (!mounted) return;
        const payload = unwrapResponse<ShippingTemplate[] | { list?: ShippingTemplate[] }>(response);
        const templates = Array.isArray(payload) ? payload : payload?.list ?? [];
        setShippingTemplates(templates);
      })
      .catch(() => {
        if (mounted) setShippingTemplatesError(true);
      });
    return () => {
      mounted = false;
    };
  }, [selectedSalesMode]);
  const selectedInventoryPolicy = (Form.useWatch("inventoryPolicy", form) || "STANDARD") as InventoryPolicy;
  const isReviewLocked = currentReviewStatus === "IN_REVIEW";
  const isRoleReadOnly = isReviewLocked || (!canGovernPublic && currentStatus !== "DRAFT");
  const selectedCategory = categories.find((item) => item.value === selectedCategoryId);
  const selectedCategoryLabel = selectedCategory?.label;
  const categoryRules = selectedCategory?.rules ?? [];
  const categorySizeField = CATEGORY_SIZE_FIELDS.find(({ rule }) => categoryRules.includes(rule));
  const directPublication = selectedSalesMode === "DIRECT_PURCHASE";
  const requiresSize = directPublication && Boolean(categorySizeField);
  const requiresPreciousMetal = directPublication && categoryRules.includes("PRECIOUS_METAL");
  const requiresGoldWeight = directPublication && categoryRules.includes("GOLD_WEIGHT");
  const requiresGem = directPublication && categoryRules.includes("GEMSTONE");
  const requiresGemDisclosure = directPublication && categoryRules.includes("GEM_DISCLOSURE");
  const requiresGemCarat = directPublication && categoryRules.includes("GEM_CARAT");
  const requiresGemGrading = directPublication && categoryRules.includes("GEM_GRADING");
  const includesCertificate = Form.useWatch("includesCertificate", form);
  const requiresCertificate = Boolean(includesCertificate) || categoryRules.includes("CERTIFICATE");
  const watchedDispatchTime = Form.useWatch("dispatchTime", form);
  const watchedName = Form.useWatch("name", form);
  const watchedCode = Form.useWatch("code", form);
  const watchedEntry = Form.useWatch((values) => ({
    categoryId: values.categoryId, code: values.code, materialType: values.materialType,
    gemType: values.gemType, craftTechnique: values.craftTechnique, size: values.size,
  }), form);
  const entryImageNames = pendingMedia.filter((item) => item.purpose !== "detail").map(({ file }) => file.name);
  const entrySource = JSON.stringify([watchedName || "", entryImageNames]);
  const entrySourceRef = useRef(entrySource);
  entrySourceRef.current = entrySource;
  const entrySuggestions = !currentProductId && !editingId && !isRoleReadOnly
    ? getProductEntrySuggestions(watchedName || "", entryImageNames, categories).filter(({ field }) =>
      !entryTouched.current.has(field) && !watchedEntry?.[field],
    )
    : [];
  const watchedDescription = Form.useWatch("description", form);
  const watchedVisibility = Form.useWatch("visibility", form) || "PUBLIC";
  const watchedPrice = Form.useWatch("initialSkuPrice", form);
  const coverReady = primaryImageId != null || galleryImages.length > 0 || pendingMedia.some((item) => item.purpose !== "detail");
  const titleEmpty = !isFormalProductTitle(watchedName);
  const codeEmpty = typeof watchedCode !== "string" || watchedCode.trim().length === 0;
  const categoryEmpty = !selectedCategoryId;
  const photoRequired = watchedVisibility !== "INTERNAL";
  const priceRequired = selectedSalesMode === "DIRECT_PURCHASE";
  const priceEmpty = priceRequired && !(Number(watchedPrice) > 0 || skus.some((sku) => sku.isActive !== false && Number(sku.price) > 0));
  const publishReminders: PublishGap[] = [
    ...(titleEmpty ? [{ label: "商品标题", target: "name" as const }] : []),
    ...(codeEmpty ? [{ label: "款号", target: "code" as const }] : []),
    ...(categoryEmpty ? [{ label: "当前类目", target: "categoryId" as const }] : []),
    ...(photoRequired && !coverReady ? [{ label: "主图", target: "product-cover" as const }] : []),
  ];
  const checklistValues = Form.useWatch((values) => ({
    materialType: values.materialType,
    gemType: values.gemType,
    gemOrigin: values.gemOrigin,
    gemTreatment: values.gemTreatment,
    gemCarat: values.gemCarat,
    gemClarity: values.gemClarity,
    gemCut: values.gemCut,
    gemColor: values.gemColor,
    gemSettingMaterial: values.gemSettingMaterial,
    gemQuantity: values.gemQuantity,
    size: values.size,
    goldWeight: values.goldWeight,
    shippingTemplateId: values.shippingTemplateId,
    deliveryMethods: values.deliveryMethods,
    fulfillmentType: values.fulfillmentType,
    fulfillmentConfirmed: values.fulfillmentConfirmed,
    dispatchTime: values.dispatchTime,
    customLeadTime: values.customLeadTime,
    scheduledPublishAt: values.scheduledPublishAt,
    measurements: values.measurements,
    materialNote: values.materialNote,
  }), form);
  const jewelryProfile = describeJewelry({
    categoryLabel: selectedCategoryLabel,
    rules: categoryRules,
    materialType: checklistValues?.materialType,
    gemType: checklistValues?.gemType,
  });
  const gemAlreadyFilled = Boolean(
    checklistValues?.gemType
    || checklistValues?.gemOrigin
    || checklistValues?.gemTreatment
    || checklistValues?.gemSettingMaterial
    || checklistValues?.gemColor
    || checklistValues?.gemClarity
    || checklistValues?.gemCut
    || Number(checklistValues?.gemCarat) > 0
    || Number(checklistValues?.gemQuantity) > 0,
  );
  const showGemFields = jewelryProfile.showGem || gemAlreadyFilled || forceGem;
  const showDiamondGrading = jewelryProfile.showDiamondGrading || Boolean(checklistValues?.gemClarity || checklistValues?.gemCut);
  const savedMeasurements = readJewelryMeasurements(checklistValues?.measurements);
  const visibleMeasurements = [
    ...jewelryProfile.measurements,
    ...Object.keys(savedMeasurements)
      .filter((key) => !jewelryProfile.measurements.some((field) => field.key === key))
      .map((key) => ({ key, label: JEWELRY_MEASUREMENT_LABELS[key], placeholder: "" })),
  ];

  const applyCanonicalProduct = useCallback((product: ProductEditorRecord) => {
    const loadedStatus = (product.status || "DRAFT") as ProductStatus;
    setCurrentStatus(loadedStatus);
    setScheduledPublishError(product.scheduledPublishError ?? null);
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
    setCertificates(product.certificates || []);
    setDetail((product.detailContent || []).map((block: ProductDetailBlock, index: number) => ({
      ...block,
      key: `detail-${index}-${Date.now()}`,
    })));
    // 保存后的权威 GET 可能规范化或清空字段；先重置，避免缺失字段沿用提交前的本地值。
    form.resetFields();
    const loadedSkus = product.skus || [];
    const activeLoaded = loadedSkus.filter((sku) => sku.isActive !== false);
    const soleSkuGold = activeLoaded.length === 1 && loadedSkus.length === 1
      ? Number(activeLoaded[0].goldWeight) || 0
      : 0;
    const productGold = Number(product.goldWeight);
    const goldWeight = soleSkuGold > 0 && product.salesMode === "DIRECT_PURCHASE"
      ? soleSkuGold
      : productGold > 0 ? productGold : soleSkuGold;
    form.setFieldsValue({
      ...defaultValues,
      ...product,
      goldWeight,
      size: activeLoaded.length === 1 && loadedSkus.length === 1 ? activeLoaded[0].size || product.size : product.size,
      derivedPrice: product.price,
      priceMin: Number(product.priceMin) > 0 ? Number(product.priceMin) : null,
      initialSkuPrice: sharedSkuPrice(product.skus || []),
      price: undefined,
      publishMode: loadedStatus === "PUBLISHED" ? "IMMEDIATE" : product.publishMode || "WAREHOUSE",
      scheduledPublishAt: product.scheduledPublishAt ? dayjs(product.scheduledPublishAt) : null,
      gemType: product.gemInfo?.type,
      gemCarat: product.gemInfo?.carat,
      gemClarity: product.gemInfo?.clarity,
      gemColor: product.gemInfo?.color,
      gemCut: product.gemInfo?.cut,
      gemSettingMaterial: product.gemInfo?.settingMaterial,
      gemOrigin: product.gemInfo?.origin,
      gemTreatment: product.gemInfo?.treatment,
      gemQuantity: product.gemInfo?.quantity,
      certificateAuthority: product.gemInfo?.certificateAuthority,
      certificateNumber: product.gemInfo?.certificateNumber,
      certificateQueryUrl: product.gemInfo?.certificateQueryUrl,
      brand: product.gemInfo?.brand,
      collection: product.gemInfo?.collection,
      style: product.gemInfo?.style,
      occasion: product.gemInfo?.occasion,
      materialNote: product.gemInfo?.materialNote,
      metalColor: product.gemInfo?.metalColor,
      measurements: readJewelryMeasurements(product.gemInfo?.measurements),
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
    setScheduledPublishError(null);
    setCurrentReviewStatus("DRAFT");
    setPrimaryImageId(null);
    setSkus([]);
    setCertificates([]);
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

  const markDirty = () => {
    if (suppressDirtyRef.current) return;
    setDirty(true);
  };
  const applyEntrySuggestions = async (suggestions: EntrySuggestion[]) => {
    if (savingRef.current || checkingSuggestedCodeRef.current) return;
    const source = entrySource;
    const code = suggestions.find((item) => item.field === "code");
    let codeAvailable = false;
    if (code) {
      checkingSuggestedCodeRef.current = true;
      setCheckingSuggestedCode(true);
      try {
        const conflicts = unwrapResponse<unknown[]>(await productApi.checkImportCodes([String(code.value)]));
        codeAvailable = conflicts.length === 0;
        if (activeEditorRef.current && entrySourceRef.current === source && !codeAvailable) {
          messageApi.warning("建议款号已被使用，请核对后填写其他款号");
        }
      } catch {
        if (activeEditorRef.current && entrySourceRef.current === source) messageApi.warning("暂时无法核对建议款号，可重试或手动填写");
      } finally {
        checkingSuggestedCodeRef.current = false;
        if (activeEditorRef.current) setCheckingSuggestedCode(false);
      }
    }
    if (!activeEditorRef.current || entrySourceRef.current !== source || savingRef.current
      || (form.getFieldValue("name") || "") !== (watchedName || "")) return;
    const applicable = suggestions.filter(({ field }) =>
      !entryTouched.current.has(field) && !form.getFieldValue(field) && (field !== "code" || codeAvailable),
    );
    if (!applicable.length) return;
    for (const { field, value } of applicable) form.setFieldValue(field, value);
    setEntryApplied((previous) => [...previous, ...applicable]);
    markDirty();
    dismissSubmitError();
  };

  const dismissEntrySuggestion = (suggestion: EntrySuggestion, undo = false) => {
    entryTouched.current.add(suggestion.field);
    setEntryApplied((previous) => previous.filter(({ field }) => field !== suggestion.field));
    if (undo) {
      form.setFieldValue(suggestion.field, undefined);
      markDirty();
      dismissSubmitError();
    }
  };

  const addPendingMedia = async (_file: File, fileList: File[]) => {
    if (uploadSelectionRef.current === fileList) return Upload.LIST_IGNORE;
    uploadSelectionRef.current = fileList;
    if (checkingImagesRef.current || savingRef.current) return Upload.LIST_IGNORE;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const galleryPending = pendingMedia.filter((item) => item.purpose !== "detail").length;
    const room = PRODUCT_COVER_LIMIT - galleryImages.length - galleryPending;
    if (room <= 0) {
      messageApi.warning("最多上传 5 张，请先移除不需要的图片");
      return Upload.LIST_IGNORE;
    }
    const accepted: PendingMedia[] = [];
    let skippedType = 0;
    let skippedSize = 0;
    let skippedDuplicate = 0;
    const ranked = [...fileList].sort((a, b) => productImageRank(productImageAngle(a.name)) - productImageRank(productImageAngle(b.name)));
    checkingImagesRef.current = true;
    setCheckingImages(true);
    try {
      const hash = (file: File) => productImageFingerprint(file).catch(() => undefined);
      const known = new Set(await Promise.all(pendingMediaRef.current.map(({ file }) => hash(file))));
      for (const candidate of ranked) {
        if (accepted.length >= room) break;
        if (!allowedTypes.includes(candidate.type)) {
          skippedType += 1;
          continue;
        }
        if (candidate.size / 1024 / 1024 > 10) {
          skippedSize += 1;
          continue;
        }
        const sameFile = (item: { file: File }) => item.file.name === candidate.name && item.file.size === candidate.size && item.file.lastModified === candidate.lastModified;
        const fingerprint = await hash(candidate);
        if (!activeEditorRef.current) break;
        if ((fingerprint && known.has(fingerprint)) || (!fingerprint && (pendingMediaRef.current.some(sameFile) || accepted.some(sameFile)))) {
          skippedDuplicate += 1;
          continue;
        }
        if (fingerprint) known.add(fingerprint);
        accepted.push({
          key: `pending-${nextGalleryImageKey.current++}`,
          file: candidate,
          preview: URL.createObjectURL(candidate),
        });
      }
    } finally {
      checkingImagesRef.current = false;
      if (activeEditorRef.current) setCheckingImages(false);
    }
    if (!activeEditorRef.current) {
      accepted.forEach((item) => URL.revokeObjectURL(item.preview));
      return Upload.LIST_IGNORE;
    }
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
    if (checkingImagesRef.current || savingRef.current) return Upload.LIST_IGNORE;
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
        type: isDetail ? "DETAIL" : pendingViews[media.key] || (visualIndex === 0 ? "FRONT" : "SIDE"),
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
      settingMaterial: values.gemSettingMaterial, origin: values.gemOrigin,
      treatment: values.gemTreatment?.trim(),
      brand: values.brand?.trim() || undefined,
      collection: values.collection?.trim() || undefined,
      style: values.style?.trim() || undefined,
      occasion: values.occasion,
      materialNote: values.materialNote?.trim() || undefined,
      metalColor: values.metalColor?.trim() || undefined,
      ...(Object.keys(readJewelryMeasurements(values.measurements)).length > 0
        ? { measurements: readJewelryMeasurements(values.measurements) }
        : {}),
      condition: "NEW",
      certificateAuthority: values.certificateAuthority,
      certificateNumber: values.certificateNumber,
      certificateQueryUrl: values.certificateQueryUrl,
    },
    craftTechnique: values.craftTechnique || [],
    visibility: values.visibility,
    salesMode: values.salesMode,
    ...(values.salesMode === "CUSTOM_INQUIRY" ? { priceMin: values.priceMin ?? null } : {}),
    inventoryPolicy: values.inventoryPolicy,
    purchaseRegion: values.purchaseRegion,
    fulfillmentType: values.fulfillmentType,
    dispatchTime: values.dispatchTime,
    fulfillmentConfirmed: values.salesMode === "DIRECT_PURCHASE" && values.fulfillmentConfirmed === true
      && Boolean(values.fulfillmentType && values.dispatchTime && normalizeDeliveryMethods(values.deliveryMethods).length),
    // 非直接销售也保留已保存的运费模板，避免保存时把原模板清掉。服务端仍可按销售方式规范化。
    shippingTemplateId: values.shippingTemplateId || null,
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

  const refreshProduct = async (productId: number, options?: { apply?: boolean }) => {
    const refreshed = unwrapResponse<ProductEditorRecord>(await productApi.getById(productId));
    if (refreshed.id !== productId) {
      throw new Error("product-save-readback-identity-mismatch");
    }
    if (activeEditorRef.current && options?.apply !== false) applyCanonicalProduct(refreshed);
    return refreshed;
  };

  const submitCorrectCode = async () => {
    if (!currentProductId || correctingCode) return;
    const next = codeDraft.trim();
    if (!next) {
      messageApi.warning("请填写款号");
      return;
    }
    if (next.length > 50) {
      messageApi.warning("款号不能超过50个字符");
      return;
    }
    if (next === String(form.getFieldValue("code") ?? "").trim()) {
      messageApi.warning("款号没有变化");
      return;
    }
    setCorrectingCode(true);
    try {
      const conflicts = unwrapResponse<Array<{ id?: number }>>(await productApi.checkImportCodes([next]));
      if (conflicts.some((item) => item.id !== currentProductId)) {
        messageApi.error("这个款号已经有商品使用，请换一个");
        return;
      }
      unwrapResponse(await productApi.correctCode(currentProductId, next));
      setCorrectOpen(false);
      await refreshProduct(currentProductId);
      messageApi.success("款号已更正");
    } catch (error) {
      messageApi.error(getSafeAdminErrorMessage(error, "款号更正失败，请稍后重试"));
    } finally {
      setCorrectingCode(false);
    }
  };

  const resetForNextProduct = () => {
    entryTouched.current.clear();
    setEntryApplied([]);
    pendingMediaRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    pendingMediaRef.current = [];
    mediaAssetIdsByImage.current.clear();
    setPendingMedia([]);
    setImages([]);
    setPrimaryImageId(null);
    setDetail([]);
    setSkus([]);
    setCertificates([]);
    setGalleryOrder([]);
    setDraggingGalleryKey(null);
    draggingGalleryKeyRef.current = null;
    setGalleryDropKey(null);
    setStockRowCount(0);
    setStockHint(undefined);
    setCurrentProductId(null);
    setCurrentStatus("DRAFT");
    setScheduledPublishError(null);
    setCurrentReviewStatus("DRAFT");
    setSavedAt(undefined);
    setPreviewOpen(false);
    setPreviewValues({});
    setActive("basic");
    dismissSubmitError();
    setPendingSaveVerification(null);
    const frame = readProductPublishFrame();
    setPublishFrame(frame);
    suppressDirtyRef.current = true;
    form.resetFields();
    if (frame) form.setFieldsValue(frameToFormValues(frame));
    suppressDirtyRef.current = false;
    setDirty(false);
    const nextUrl = `/admin/products/new${returnPathQuery}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
    document.querySelector(".admin-main")?.scrollTo({ top: 0 });
  };

  const retrySaveVerification = async () => {
    const pending = pendingSaveVerification;
    if (!pending || saveVerificationLoading) return;
    try {
      setSaveVerificationLoading(true);
      await refreshProduct(pending.productId, { apply: !pending.continueNext });
      if (!activeEditorRef.current) return;
      dismissSubmitError();
      if (pending.continueNext) {
        resetForNextProduct();
        messageApi.success("商品保存结果已确认。可以继续填写下一件");
        return;
      }
      setPendingSaveVerification(null);
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

  const buildSkuChanges = (values: ProductEditorFormValues): Pick<ProductWriteInput, "editorSkuUpdates" | "editorDefaultSku"> => {
    if (values.salesMode !== "DIRECT_PURCHASE") return {};
    const typedPrice = Number(values.initialSkuPrice);
    const priceReady = Number.isFinite(typedPrice) && typedPrice > 0;
    const active = skus.filter((sku) => sku.isActive !== false);
    const sole = active.length === 1 && skus.length === 1 ? active[0] : null;
    if (sole) {
      const currentPrice = Number(sole.price);
      const currentGold = Number(sole.goldWeight ?? 0);
      const productGold = Number(values.goldWeight ?? 0);
      const nextGold = Number.isFinite(productGold) ? productGold : currentGold;
      const nextSize = values.size?.trim() || "";
      const same = (left: number, right: number) => Number.isFinite(left) && Number.isFinite(right) && left.toFixed(2) === right.toFixed(2);
      const fields: Omit<EditorSkuUpdate, "id"> = {};
      if (priceReady && !same(currentPrice, typedPrice)) {
        fields.price = typedPrice;
        fields.expectedPrice = currentPrice;
      }
      if (!same(currentGold, nextGold)) fields.goldWeight = nextGold;
      if (nextSize !== (sole.size || "")) fields.size = nextSize;
      if (sole.material === "OTHER" && values.materialType && values.materialType !== "OTHER") {
        fields.material = values.materialType;
      }
      return Object.keys(fields).length ? { editorSkuUpdates: [{ id: sole.id, ...fields }] } : {};
    }
    if (!priceReady) return {};
    if (active.length === 0) {
      return {
        editorDefaultSku: {
          skuCode: `${values.code}-DEFAULT`,
          material: values.materialType || "OTHER",
          size: values.size || undefined,
          goldWeight: values.goldWeight ?? 0,
          price: typedPrice,
        },
      };
    }
    const updates = active.filter((sku) => Number(sku.price) === 0)
      .map((sku) => ({ id: sku.id, price: typedPrice, expectedPrice: 0 }));
    return updates.length ? { editorSkuUpdates: updates } : {};
  };

  const savePublishFrame = () => {
    const values = form.getFieldsValue(true);
    const frame: ProductPublishFrame = {
      salesMode: values.salesMode || "CUSTOM_INQUIRY",
      ...(values.salesMode === "CUSTOM_INQUIRY" ? { priceMin: values.priceMin ?? null } : {}),
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

  const setGalleryView = async (choice: MediaChoice, view: ProductImage["type"]) => {
    if (saving || isRoleReadOnly) return;
    if (!choice.imageId) {
      setPendingViews((prev) => ({ ...prev, [choice.key]: view }));
      return;
    }
    if (!currentProductId) return;
    try {
      await productApi.updateImage(currentProductId, choice.imageId, { type: view });
      setImages((prev) => prev.map((image) => image.id === choice.imageId ? { ...image, type: view } : image));
    } catch (error) {
      messageApi.error(getSafeAdminErrorMessage(error, "图片角度保存失败，请重试。"));
    }
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
    if (checkingImagesRef.current || checkingSuggestedCodeRef.current) {
      messageApi.info("请等图片或款号检查完成后再保存");
      return false;
    }
    if (certificateBusy) {
      messageApi.info("请等证书操作完成后再保存商品");
      return false;
    }
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
        messageApi.warning(requiresFullValidation ? "请检查并修正标红字段" : "保存草稿至少需要选择类目并填写款号");
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
        if (values.publishMode === "SCHEDULED" && values.scheduledPublishAt
          && Date.parse(values.scheduledPublishAt.toISOString()) <= Date.now()) {
          addGap("定时上架时间必须晚于当前时间", "scheduledPublishAt");
        }
        if (!isFormalProductTitle(values.name)) {
          fieldErrors.push({ name: "name", errors: ["请填写正式商品标题，替换未命名占位标题"] });
          addGap("商品标题", "name");
        }
        const code = typeof values.code === "string" ? values.code.trim() : "";
        if (!code) {
          fieldErrors.push({ name: "code", errors: ["请输入款号"] });
          addGap("款号", "code");
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
        if (values.visibility !== "INTERNAL" && !primaryImageId && galleryImages.length === 0 && !pendingMedia.some((item) => item.purpose !== "detail")) {
          addGap("这件作品的实物主图", "product-cover");
        }
        if (selectedCategory?.disabled) addGap("选择允许上架的具体类目", "categoryId");
        if (values.visibility !== "INTERNAL" && requiresCertificate && !certificates.some(isPublishableCertificate)) {
          addGap(currentProductId ? "添加有效鉴定证书" : "先保存草稿，再添加鉴定证书", "product-certificates");
        }
        if (values.salesMode === "DIRECT_PURCHASE") {
          const typedPrice = Number(values.initialSkuPrice);
          const hasTypedPrice = Number.isFinite(typedPrice) && typedPrice > 0;
          const activeSkus = skus.filter((sku) => sku.isActive !== false);
          const hasSkuPrice = activeSkus.some((sku) => Number(sku.price) > 0);
          if (!hasTypedPrice && !hasSkuPrice) addGap("一个大于 0 的成交价", "initialSkuPrice");
          if (!values.materialType || values.materialType === "OTHER") addGap("主要材质", "materialType");
          if (requiresPreciousMetal && !PRECIOUS_METALS.has(values.materialType)) addGap("贵金属材质和纯度", "materialType");
          if (requiresGem && (!values.gemType?.trim() || values.gemType === "无主石")) addGap("主石种类", "gemType");
          if (requiresGem && !values.gemSettingMaterial && !PRECIOUS_METALS.has(values.materialType)) addGap("镶托材质", "gemSettingMaterial");
          if (requiresGemDisclosure && !GEM_ORIGINS.includes(values.gemOrigin || "")) addGap("宝石来源", "gemOrigin");
          if (requiresGemDisclosure && !values.gemTreatment?.trim()) addGap("宝石处理说明", "gemTreatment");
          if (requiresGemCarat && !(Number(values.gemCarat) > 0)) addGap("主石克拉", "gemCarat");
          if (requiresGemGrading && !values.gemClarity?.trim()) addGap("主石等级（净度）", "gemClarity");
          if (!normalizeDeliveryMethods(values.deliveryMethods).length) addGap("至少一种配送方式", "deliveryMethods");
          if (!values.fulfillmentType) addGap("备货状态", "fulfillmentType");
          if (!values.dispatchTime) addGap("发出时效", "dispatchTime");
          if (values.dispatchTime === "CUSTOM" && !values.customLeadTime?.trim()) addGap("按约定发出的备货时间", "customLeadTime");
          if (!values.fulfillmentConfirmed) addGap("确认备货状态和发出时效", "fulfillmentConfirmed");
          const editBySku = activeSkus.length > 0 && skus.length > 1;
          if (requiresSize && (editBySku ? activeSkus.some((sku) => !sku.size?.trim()) : !values.size?.trim())) {
            addGap(categorySizeField?.label || "规格尺寸", editBySku ? "product-skus" : "size");
          }
          if (requiresGoldWeight && (editBySku ? activeSkus.some((sku) => !(Number(sku.goldWeight) > 0)) : !(Number(values.goldWeight) > 0))) {
            addGap("实际净金重", editBySku ? "product-skus" : "goldWeight");
          }
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
        const hasInitialSkuPrice = values.salesMode === "DIRECT_PURCHASE" && values.initialSkuPrice !== undefined
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
        // 写入尚未确认前，先把地址换成已创建草稿。中途刷新或重试会打开这一件，不会再创建一件。
        // 新建商品上架确认成功后会回到空白新建页；保存草稿仍留在这一件上。
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
      await productApi.update(productId, {
        ...updatePayload,
        ...(!startedWithoutProductId ? buildSkuChanges(values) : {}),
      });
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
      } else if (currentStatus !== "PUBLISHED" && intent === "primary" && values.publishMode === "IMMEDIATE") {
        await productApi.updateStatus(productId, "PUBLISHED");
      } else if (currentStatus !== "PUBLISHED" && intent === "primary" && values.publishMode === "SCHEDULED") {
        await productApi.update(productId, {
          publishMode: "SCHEDULED",
          scheduledPublishAt: values.scheduledPublishAt.toISOString(),
        });
      } else if (currentStatus !== "PUBLISHED" && currentStatus !== "OFFLINE" && intent === "primary" && values.publishMode === "WAREHOUSE") {
        await productApi.updateStatus(productId, "OFFLINE");
      }
      setPendingMedia([]);
      const continueNext = startedWithoutProductId && intent === "primary";
      let refreshed: ProductEditorRecord;
      try {
        refreshed = await refreshProduct(productId, { apply: !continueNext });
      } catch {
        if (activeEditorRef.current) {
          setPendingSaveVerification({
            productId,
            continueNext: startedWithoutProductId && intent === "primary",
          });
          dismissSubmitError();
          messageApi.warning("商品已写入，最新状态待确认；请重新读取保存结果");
        }
        return false;
      }
      if (!activeEditorRef.current) return false;
      if (!continueNext && (role === "SUPER_ADMIN" || role === "ADMIN" || role === "WAREHOUSE") && values.salesMode === "DIRECT_PURCHASE") {
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
      const successMessage = !canGovernPublic && intent === "primary"
        ? "商品草稿已保存并提交审核"
        : intent === "draft"
        ? currentStatus === "PUBLISHED" ? "已保存商品更改" : "草稿已保存"
        : refreshed.status === "PUBLISHED"
          ? currentStatus === "PUBLISHED" ? "已保存商品更改" : "商品已上架"
          : values.publishMode === "SCHEDULED"
          ? "已保存定时上架计划"
          : "商品已保存至仓库";
      if (continueNext) {
        resetForNextProduct();
        messageApi.success(`${successMessage}。可以继续填写下一件`);
      } else {
        setDirty(false);
        setSavedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
        messageApi.success(successMessage);
        if (!editingId) {
          navigate(`/admin/products/${productId}/edit${returnPathQuery}`, {
            replace: true,
          });
        }
      }
      return true;
    } catch (error: unknown) {
      if (isFormValidationError(error)) {
        const gaps = gapsFromFormFields(error.errorFields);
        setPublishGaps(gaps);
        setSubmitError("点一下即可跳到还没填的位置。");
        messageApi.warning(requiresFullValidation ? "请检查并修正标红字段" : "保存草稿至少需要选择类目并填写款号");
        if (gaps[0]) jumpToPublishTarget(gaps[0].target);
        return false;
      }
      if (error instanceof EditorUserError) {
        messageApi.warning(error.message);
        return false;
      }
      if (startedWithoutProductId && !productId && isAmbiguousProductWriteFailure(error)) {
        const message = "商品创建结果待确认；当前款号和内容已保留。请再次点击保存，服务端只会恢复完全相同的创建意图，不会重复创建。";
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
        color: sku.color,
        goldWeight: sku.goldWeight,
        price: sku.price,
        isActive: sku.isActive,
        imageId: sku.imageId ?? null,
      });
    } else {
      skuForm.resetFields();
      skuForm.setFieldsValue({ material: form.getFieldValue("materialType"), price: 0, isActive: true });
    }
    setSkuModalOpen(true);
  };

  const saveSku = async () => {
    if (!currentProductId || skuSaving) return;
    try {
      const values = await skuForm.validateFields();
      setSkuSaving(true);
      const data = { ...values, imageId: values.imageId ?? null };
      if (editingSku) await productApi.updateSku(currentProductId, editingSku.id, data);
      else await productApi.createSku(currentProductId, data);
      await refreshSkus();
      if (editingSku && skus.length === 1) {
        form.setFieldsValue({ size: values.size ?? null, goldWeight: values.goldWeight ?? 0, initialSkuPrice: values.price });
      }
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

  const addTextBlock = (seed = "") => {
    setDetail((prev) => [...prev, { key: `text-${Date.now()}`, type: "TEXT", text: seed }]);
    setPreviewPane("detail");
    markDirty();
  };
  const moveDetailBlock = (fromKey: string, toIndex: number) => {
    setDetail((prev) => {
      const fromIndex = prev.findIndex((item) => item.key === fromKey);
      if (fromIndex < 0 || toIndex < 0 || toIndex >= prev.length || fromIndex === toIndex) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
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

  const directDeliveryReady = !directPublication
    || (normalizeDeliveryMethods(checklistValues?.deliveryMethods).length > 0
      && Boolean(checklistValues?.fulfillmentType)
      && Boolean(checklistValues?.dispatchTime)
      && (checklistValues?.dispatchTime !== "CUSTOM" || Boolean(checklistValues?.customLeadTime?.trim()))
      && checklistValues?.fulfillmentConfirmed === true);
  const jewelryReady = (!requiresSize || Boolean(checklistValues?.size?.trim()) || skus.length > 1)
    && (!requiresGoldWeight || Number(checklistValues?.goldWeight) > 0 || skus.length > 1)
    && (!requiresGem || (Boolean(checklistValues?.gemType?.trim()) && checklistValues?.gemType !== "无主石"))
    && (!requiresGemDisclosure || (GEM_ORIGINS.includes(checklistValues?.gemOrigin || "") && Boolean(checklistValues?.gemTreatment?.trim())))
    && (!requiresGemCarat || Number(checklistValues?.gemCarat) > 0)
    && (!requiresGemGrading || Boolean(checklistValues?.gemClarity?.trim()))
    && (!requiresPreciousMetal || isPreciousMetal(checklistValues?.materialType));
  const salesReady = !directPublication || (!priceEmpty && Boolean(checklistValues?.shippingTemplateId));
  const publishReady = selectedPublishMode !== "SCHEDULED" || Boolean(checklistValues?.scheduledPublishAt);
  const moduleStatus: Record<string, "done" | "open" | "optional"> = {
    basic: !titleEmpty && !codeEmpty && !categoryEmpty && (!photoRequired || coverReady) ? "done" : "open",
    sales: salesReady ? "done" : "open",
    facts: jewelryReady ? "done" : "open",
    publish: publishReady && directDeliveryReady ? "done" : "open",
    media: detail.length > 0 ? "done" : "optional",
  };
  const moduleStatusText = { done: "完成", open: "待补", optional: "选填" };
  const tabs: Array<[string, string]> = [
    ["basic", "基础信息"],
    ["sales", "销售与库存"],
    ["facts", "珠宝参数"],
    ["media", "图文详情"],
    ["publish", "发布与配送"],
  ];
  const checklistItems: Array<PublishGap & { done: boolean; optional?: boolean }> = [
    { label: "商品标题", target: "name", done: !titleEmpty },
    { label: "款号", target: "code", done: !codeEmpty },
    { label: "类目", target: "categoryId", done: !categoryEmpty },
    { label: "主图", target: "product-cover", done: !photoRequired || coverReady },
    { label: "成交价", target: "initialSkuPrice", done: !priceEmpty, optional: !priceRequired },
    { label: "运费模板", target: "sales", done: Boolean(checklistValues?.shippingTemplateId), optional: !directPublication },
    { label: "主石种类", target: "gemType", done: Boolean(checklistValues?.gemType?.trim()) && checklistValues?.gemType !== "无主石", optional: !requiresGem },
    { label: "配送与备货", target: "deliveryMethods", done: directDeliveryReady, optional: !directPublication },
    { label: "图文详情", target: "product-detail", done: detail.length > 0, optional: true },
  ];
  const requiredChecks = checklistItems.filter((item) => !item.optional);
  const completedChecks = requiredChecks.filter((item) => item.done).length;
  const openChecks = checklistItems.filter((item) => !item.optional && !item.done);
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
    ? `${!commerceEnabled ? "支付未开放。公开页面可以显示价格，但不能加入购物车或在线付款。" : ""}直接销售需要一个大于 0 的成交价，并绑定可用于结算的包邮模板。库存以库存管理中的实际数量为准，不能超过可售数量成交。`
    : selectedSalesMode === "CUSTOM_INQUIRY"
      ? "参考起价只用于公开展示，不是成交价或定金。顾客先预约定制，最终金额在确认方案后报价，不要求成品库存。"
      : selectedSalesMode === "DISPLAY_ONLY"
        ? "仅展示不提供购买、库存或运费。当前销售方式发布时不要求交易价格、SKU 或正库存。公开前再放上这件作品的照片。"
        : selectedSalesMode === "SELECTION"
          ? "顾客通过现有选款咨询联系顾问。当前销售方式发布时不要求交易价格、SKU 或正库存。"
          : "顾客可以携带这件作品预约到店。门店和时段使用现有预约服务。当前销售方式发布时不要求交易价格、SKU 或正库存。";
  const showCommerceFacts = selectedSalesMode === "DIRECT_PURCHASE";
  const canWriteStock = role === "SUPER_ADMIN" || role === "ADMIN" || role === "WAREHOUSE";
  const previewSkus = previewValues.salesMode === "DIRECT_PURCHASE" ? skus.filter((sku) => sku.isActive) : [];
  const previewSku = previewSkus.find((sku) => sku.id === previewSkuId);
  const previewImage = mediaChoices.find((item) => previewSku?.imageId != null && item.imageId === previewSku.imageId)
    ?? mediaChoices[0];
  const previewPrice = Number(previewSku ? previewSku.price : previewValues.derivedPrice || previewValues.initialSkuPrice);
  const previewStockStatus = previewSku && previewStock?.get(previewSku.id);

  useEffect(() => {
    if (!previewOpen || previewValues.salesMode !== "DIRECT_PURCHASE" || !currentProductId || !canWriteStock) return;
    let cancelled = false;
    void (async () => {
      try {
        const available = new Map<number, boolean>();
        for (let page = 1; !cancelled; page += 1) {
          const { rows, total } = await readProductStock(currentProductId, page);
          for (const row of rows) {
            if (row.skuId != null) {
              available.set(row.skuId, available.get(row.skuId) === true || row.quantity > 0);
            }
          }
          if (page * 20 >= total) break;
        }
        if (!cancelled) setPreviewStock(available);
      } catch {
        if (!cancelled) setPreviewStock(null);
      }
    })();
    return () => { cancelled = true; };
  }, [previewOpen, previewValues.salesMode, currentProductId, canWriteStock]);
  const stockSplit = activeSkuCount > 1 || stockRowCount > 1;
  const stockExtra = !canWriteStock
    ? "当前账号不能修改库存。请让管理员在库存管理填写可售数量。"
    : stockSplit
      ? "有多条库存时，不能在这里用一个数字改全部。"
      : stockHint || "这是现在可卖的件数。不填就保持原数量；新商品不填时是 0。一物一件只能填 0 或 1。";
  const activePrices = skus
    .filter((sku) => sku.isActive !== false)
    .map((sku) => Number(sku.price))
    .filter((price) => price > 0);
  const showLowestPrice = activeSkuCount > 1 && new Set(activePrices).size > 1;
  const showSkuTable = skus.length > 1;
  const priceExtra = skus.length > 1
    ? "还没有单独标价的规格用这个价格。各规格自己的价格以规格表为准。"
    : "这是顾客看到的价格。保存后写到这件商品上。";
  const skuSummary = !currentProductId
    ? "只有一种规格时，上面的成交价就够了。"
    : skus.length > 1
      ? `${activeSkuCount} 个有效规格。没单独标价的会用上面的成交价。`
      : "现在只有一种规格，上面的成交价就是顾客看到的价格。";
  const activeGoldValues = skus
    .filter((sku) => sku.isActive !== false)
    .map((sku) => Number(sku.goldWeight))
    .filter((value) => value > 0);
  const skuGoldDiffers = activeSkuCount > 1 && new Set(activeGoldValues.map((value) => value.toFixed(2))).size > 1;
  const goldExtra = skuGoldDiffers
    ? "各规格金重不同，以规格表里的金重为准。"
    : "按克计价和前台金重都用这个数。一种规格只填这里。";
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
        <aside className="pro-editor__rail" aria-label="商品模块">
          <nav className="pro-editor__module-nav" aria-label="商品编辑步骤">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-current={active === key ? "true" : undefined}
                aria-label={label}
                className={active === key ? "is-active" : ""}
                onClick={() => { setActive(key); setCheckOpen(false); document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              >
                <span>{label}</span>
                <em className={moduleStatus[key] === "open" ? "is-open" : ""}>{moduleStatusText[moduleStatus[key]]}</em>
              </button>
            ))}
          </nav>
          <div className="pro-editor__guide-card">
            <strong>上架框架</strong>
            <p>新建商品沿用这些默认。标题、款号和照片仍按每一件填写。</p>
            <dl>
              {publishFrameRows(publishFrame).map(([term, detail]) => (
                <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>
              ))}
            </dl>
            <div className="pro-editor__guide-actions">
              <button type="button" onClick={savePublishFrame}>把当前设置存成框架</button>
              {publishFrame ? <button type="button" onClick={clearPublishFrame}>恢复最初默认</button> : null}
            </div>
          </div>
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
        </div>
        <button type="button" className="pro-editor__check-toggle" aria-expanded={checkOpen} onClick={() => setCheckOpen((open) => !open)}>
          {openChecks.length > 0 ? `上架还缺 ${openChecks.length} 项` : "上架条件已齐"}
        </button>
      </header>

      {(isReviewLocked || isRoleReadOnly || scheduledPublishError || pendingSaveVerification || submitError) ? (
        <div className="pro-editor__notices">
          {isReviewLocked ? <Alert type="info" showIcon message={canGovernPublic ? "这是编辑提交的审核版本，内容、SKU、图片、标签、属性与证书均已冻结；请直接通过上架或退回修改。" : "作品已提交审核，审核完成或管理员退回前不可继续修改。"} /> : isRoleReadOnly ? <Alert type="info" showIcon message="当前作品为已发布或已下架状态，编辑角色仅可查看；修改、下架与归档请交由管理员处理。" /> : null}
          {scheduledPublishError && <Alert type="warning" showIcon message="定时上架未完成" description={explainScheduledFailure(scheduledPublishError)} />}
          {pendingSaveVerification && <Alert
            type="warning"
            showIcon
            message="商品已写入，最新状态待确认"
            description={<Space direction="vertical" size={8}>
              <span>保存写入和状态动作已经完成，但暂时无法读取服务端权威结果。当前内容已保留；系统不会重复保存或重新执行发布动作。</span>
              <Button type="link" loading={saveVerificationLoading} onClick={() => void retrySaveVerification()}>重新读取保存结果</Button>
            </Space>}
          />}
          {submitError ? <Alert className="pro-editor__submit-error" type="error" showIcon message="商品保存未完成" description={<div><span>{submitError}</span>{publishGaps.length > 0 ? <ul className="pro-editor__gap-list">{publishGaps.map((gap) => <li key={`${gap.target}:${gap.label}`}><button type="button" onClick={() => jumpToPublishTarget(gap.target)}>{gap.label}</button></li>)}</ul> : null}</div>} closable onClose={() => dismissSubmitError()} action={role === "SUPER_ADMIN" && submitError.includes("公开展示") ? <Button size="small" loading={authorizingImages} onClick={() => void confirmProductImagesPublic()}>确认这些图片可在网站公开展示</Button> : undefined} /> : null}
        </div>
      ) : null}
      <Form name="product-editor-main" form={form} initialValues={defaultValues} layout="vertical" requiredMark={(label) => label} disabled={saving || isRoleReadOnly || Boolean(pendingSaveVerification)} onValuesChange={(changed: Partial<ProductEditorFormValues>) => {
        const fields = Object.keys(changed);
        if (fields.some((field) => ["salesMode", "fulfillmentType", "dispatchTime", "customLeadTime", "deliveryMethods"].includes(field))) {
          form.setFieldValue("fulfillmentConfirmed", false);
        }
        fields.forEach((field) => entryTouched.current.add(field));
        setEntryApplied((previous) => previous.filter(({ field }) => !fields.includes(field)));
        markDirty();
        dismissSubmitError();
        if (fields.includes("categoryId")) {
          const current = form.getFieldsValue(true);
          const filled = [
            current.size,
            current.goldWeight,
            current.gemType,
            current.materialNote,
            current.metalColor,
            ...Object.values(current.measurements || {}),
          ].some((item) => typeof item === "number" ? item > 0 : typeof item === "string" && item.trim());
          if (filled) messageApi.info("类目已更换。已填的尺寸、重量和宝石资料会保留；当前类目用不到的项目会先收起，前台也不会展示空项。");
        }
      }} className="pro-editor__form">
        <div className="pro-editor__identity">
          <Tag color={statusMeta[currentStatus].color}>{statusMeta[currentStatus].label}</Tag>
          <span className="pro-editor__identity-category">{selectedCategoryLabel || "尚未选择类目"}</span>
          <span>{salesModeLabelsForPreview[selectedSalesMode]}</span>
          <button type="button" onClick={() => jumpToPublishTarget("categoryId")}>修改类目</button>
        </div>

        <section id="basic" className="pro-editor__card">
          <header className="pro-editor__card-head"><h2>基础信息</h2></header>
          <div className="pro-editor__group">
          <div className="pro-editor__group-head"><h3>商品身份</h3></div>
          <Form.Item
            name="name"
            label={<span>商品标题<RequiredMark /></span>}
            className={requiredFieldClass(true, titleEmpty, "pro-editor__horizontal-field")}
            extra="例如「18K金红宝石戒指」。一个汉字计 2 个字符，字母和数字计 1 个，合计不超过 60。"
            rules={[{
              validator: async (_, value: unknown) => {
                if (typeof value === "string" && productTitleUnits(value) > PRODUCT_TITLE_MAX_UNITS) {
                  throw new Error("商品标题不能超过 60 个字符，一个汉字计 2 个字符");
                }
              },
            }]}
          >
            <Input
              count={{
                max: PRODUCT_TITLE_MAX_UNITS,
                strategy: productTitleUnits,
                show: true,
                exceedFormatter: (value, config) => clampProductTitle(value, config.max),
              }}
              placeholder="如：18K金红宝石戒指"
            />
          </Form.Item>
          <Form.Item
            name="code"
            label={<span>款号<RequiredMark /></span>}
            className={requiredFieldClass(true, codeEmpty, "pro-editor__horizontal-field")}
            extra={currentProductId ? (
              <span className="pro-editor__code-extra">
                已保存的款号从这里更正。订单仍保留下单时的款号，旧的商品地址仍会打开这件商品。
                <Button
                  htmlType="button"
                  disabled={saving || isRoleReadOnly || correctingCode}
                  onClick={() => {
                    setCodeDraft("");
                    setCorrectOpen(true);
                  }}
                >
                  更正款号
                </Button>
              </span>
            ) : undefined}
            rules={[{ required: true, message: "请输入款号" }]}
          >
            <Input disabled={Boolean(currentProductId)} maxLength={50} />
          </Form.Item>
          <Form.Item name="categoryId" label={<span>当前类目<RequiredMark /></span>} className={requiredFieldClass(true, categoryEmpty, "pro-editor__horizontal-field")} rules={[{ required: true, message: "请选择珠宝类目" }]}><Select showSearch optionFilterProp="label" options={categories} placeholder="请选择珠宝类目" /></Form.Item>
          </div>
          {!currentProductId && !editingId && (
            <div className="pro-editor__group">
            <div className="pro-editor__entry-assist">
              <Button onClick={() => jumpToPublishTarget("product-cover")}>前往上传商品图片</Button>
              {(entrySuggestions.length > 0 || entryApplied.length > 0) && (
                <section aria-label="填写建议" className="pro-editor__entry-suggestions">
                  <Space wrap>
                    <strong>填写建议</strong>
                    {entrySuggestions.length > 1 && <Button size="small" loading={checkingSuggestedCode} onClick={() => void applyEntrySuggestions(entrySuggestions)}>采用全部建议</Button>}
                  </Space>
                  <ul>
                    {[...entrySuggestions, ...entryApplied].map((suggestion) => {
                      const applied = entryApplied.includes(suggestion);
                      return <li key={suggestion.field}>
                        <span>{suggestion.label} {applied ? "已填入" : "未填写 →"} {suggestion.display} · 来自{suggestion.source}{applied ? " · 未保存" : ""}</span>
                        <Space wrap>
                          {!applied && <Button size="small" disabled={checkingSuggestedCode} onClick={() => void applyEntrySuggestions([suggestion])}>采用{suggestion.label}</Button>}
                          <Button size="small" disabled={checkingSuggestedCode} onClick={() => dismissEntrySuggestion(suggestion, applied)}>{applied ? "撤销" : "跳过"}{suggestion.label}</Button>
                        </Space>
                      </li>;
                    })}
                  </ul>
                </section>
              )}
            </div>
            </div>
          )}
          <div className="pro-editor__cover pro-editor__group">
          <div className="pro-editor__row-label" id="product-cover"><strong>实物主图{photoRequired ? <RequiredMark /> : null}</strong><span>拖拽图片，或使用前移、后移调整顺序。第一张会成为主图。建议使用 1:1 图片。最多 5 张，单张 10MB 以内。</span></div>
          <div className={`pro-editor__uploads${photoRequired && !coverReady ? " is-open" : ""}`}>
            {mediaChoices.map((item, index) => {
              const isCover = item.key === orderedGalleryKeys[0];
              return <div
                className={`pro-editor__upload-card${galleryDropKey === item.key ? " is-drop-target" : ""}`}
                key={item.key}
                title={item.filename}
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
                <label className="pro-editor__view-label">
                  <span>角度</span>
                  <select
                    aria-label={`${item.label}的拍摄角度`}
                    value={(item.imageId ? item.view : pendingViews[item.key]) || (isCover ? "FRONT" : "SIDE")}
                    disabled={saving || isRoleReadOnly}
                    onChange={(event) => void setGalleryView(item, event.target.value as ProductImage["type"])}
                  >
                    {IMAGE_VIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div className="pro-editor__upload-actions">
                  <Button type="link" size="small" aria-label={`前移${item.label}`} disabled={index === 0 || saving || isRoleReadOnly} onClick={() => moveGalleryItem(item.key, index - 1)}>前移</Button>
                  <Button type="link" size="small" aria-label={`后移${item.label}`} disabled={index === mediaChoices.length - 1 || saving || isRoleReadOnly} onClick={() => moveGalleryItem(item.key, index + 1)}>后移</Button>
                  {"pending" in item && item.pending ? <button type="button" className="pro-editor__upload-text" onClick={() => removePendingMedia(item.key)} aria-label={`移除${item.label}`}>删除</button> : null}
                  {item.imageId ? <Button type="link" size="small" danger disabled={mediaActionId !== null} onClick={() => confirmDeleteImage(item.imageId!)}>删除</Button> : null}
                </div>
              </div>;
            })}
            {Array.from({ length: Math.max(0, PRODUCT_COVER_LIMIT - mediaChoices.length) }, (_, index) => (
              <Upload key={`cover-upload-${index}`} multiple accept="image/jpeg,image/png,image/webp,image/gif" showUploadList={false} disabled={saving || checkingImages} beforeUpload={addPendingMedia}>
                <button type="button" disabled={saving || checkingImages} aria-label={`上传图片，可一次多选，当前还可上传 ${PRODUCT_COVER_LIMIT - mediaChoices.length} 张`} className="pro-editor__upload"><FileImageOutlined /><span>{checkingImages ? "正在检查图片…" : "上传图片"}</span></button>
              </Upload>
            ))}
          </div>
          </div>
        </section>

        <section id="sales" className="pro-editor__card">
          <header className="pro-editor__card-head"><h2>销售与库存</h2></header>
          <div className="pro-editor__group">
            <div className="pro-editor__group-head"><h3>销售方式</h3></div>
            <div className="pro-editor__sales-grid">
              <Form.Item name="salesMode" label={<span>销售方式<RequiredMark /></span>} extra={showCommerceFacts && !commerceEnabled ? "支付未开放，顾客可以看到价格，但不能在网站付款。" : "选择顾客看到这件作品后的下一步。"}><Radio.Group><Radio value="DIRECT_PURCHASE">直接销售</Radio><Radio value="DISPLAY_ONLY">仅展示</Radio><Radio value="SELECTION">选款咨询</Radio><Radio value="APPOINTMENT">预约到店</Radio><Radio value="CUSTOM_INQUIRY">预约定制</Radio></Radio.Group></Form.Item>
              {selectedSalesMode === "CUSTOM_INQUIRY" ? (
                <Form.Item name="priceMin" label="定制参考起价" className="pro-editor__money-field" extra="前台显示为“¥1,000 起”等参考起价；最终金额在确认定制方案后报价，不是定金。留空则不公开起价。" rules={[{ type: "number", min: 0.01, max: 9_999_999, message: "参考起价须大于 0，且不超过 9,999,999 元" }]}>
                  <InputNumber min={0.01} max={9_999_999} precision={2} suffix="元起" />
                </Form.Item>
              ) : null}
              {showCommerceFacts ? null : <Alert className="pro-editor__inventory-alert" type="info" showIcon message={salesModeMessage} />}
            </div>
          </div>
          {showCommerceFacts ? (
            <div className="pro-editor__group">
              <div className="pro-editor__group-head"><h3>价格与库存</h3></div>
              <div className="pro-editor__sales-grid">
                {showLowestPrice ? <Form.Item label="当前最低价" className="pro-editor__money-field" extra="有多个规格时，页面显示其中的最低价。"><div className="pro-editor__derived-price">{currentProductId ? (derivedPrice > 0 ? `¥ ${derivedPrice.toFixed(2)}` : "—") : "保存商品后显示"}</div></Form.Item> : null}
                <Form.Item name="initialSkuPrice" label={<span>成交价{priceRequired ? <RequiredMark /> : null}</span>} className={requiredFieldClass(priceRequired, priceEmpty, "pro-editor__money-field")} extra={priceExtra}><InputNumber min={0} precision={2} suffix="元" /></Form.Item>
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
              </div>
            </div>
          ) : null}
          {showCommerceFacts ? (
            <div className="pro-editor__group">
              <div className="pro-editor__group-head"><h3>运费</h3></div>
              <div className="pro-editor__sales-grid">
                <Form.Item
                  name="shippingTemplateId"
                  label={<span>运费模板<RequiredMark /></span>}
                  extra={shippingTemplatesError
                    ? "运费模板暂时读取失败。请稍后重试；没有可用于结算的包邮模板时，直接销售不能上架。"
                    : checkoutReadyTemplates.length > 0
                      ? "线上结算只接受启用中的包邮模板：基础运费和偏远附加都是 0，没有满额门槛，也没有排除区域。"
                      : "还没有可用于结算的包邮模板。请先由管理员准备一张包邮模板，再发布直接销售商品。"}
                >
                  <Select
                    allowClear
                    placeholder="选择包邮模板"
                    options={checkoutReadyTemplates.map((template) => ({
                      value: template.id,
                      label: template.name,
                    }))}
                    notFoundContent="没有可用于结算的包邮模板"
                  />
                </Form.Item>
              </div>
            </div>
          ) : null}
          {showCommerceFacts ? <div className="pro-editor__sku-panel" id="product-skus">
            <div className="pro-editor__title-row">
              <div><h3>规格与价格</h3><span>{skuSummary}</span></div>
              <Space>
                {skus.length === 1 ? <Button type="link" disabled={skuActionId !== null} onClick={() => openSkuModal(skus[0])}>编辑这一规格</Button> : null}
                <Button icon={<PlusOutlined />} disabled={!currentProductId || skuActionId !== null || (selectedInventoryPolicy === "SINGLE_UNIT" && activeSkuCount >= 1)} onClick={() => openSkuModal()}>添加 SKU</Button>
              </Space>
            </div>
            {showSkuTable ? <Table<ProductSKU>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={skus}
              locale={{ emptyText: currentProductId ? "暂无 SKU" : "保存草稿后可管理 SKU" }}
              columns={[
                { title: "SKU 编码", dataIndex: "skuCode" },
                { title: "材质", dataIndex: "material", render: (value: MaterialType) => materials.find((item) => item.value === value)?.label || value },
                { title: "规格", dataIndex: "size", render: (value?: string) => value || "—" },
                { title: "颜色", dataIndex: "color", render: (value?: string) => value || "—" },
                { title: "金重(g)", dataIndex: "goldWeight", render: (value?: number) => value ?? "—" },
                { title: "直购成交价", dataIndex: "price", render: (value: number) => Number(value) > 0 ? `¥ ${Number(value).toFixed(2)}` : "—" },
                { title: "状态", dataIndex: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
                { title: "操作", render: (_value: unknown, sku: ProductSKU) => <Space size={4}><Button type="link" size="small" disabled={skuActionId !== null} onClick={() => openSkuModal(sku)}>编辑</Button><Button type="link" size="small" loading={skuActionId === sku.id} disabled={skuActionId !== null && skuActionId !== sku.id} onClick={() => void toggleSkuActive(sku)}>{sku.isActive ? "停用" : "启用"}</Button></Space> },
              ]}
              scroll={{ x: 840 }}
            /> : null}
          </div> : null}
        </section>
        <section id="facts" className="pro-editor__card">
          <header className="pro-editor__card-head"><h2>珠宝参数</h2><span>按当前类目显示。用不到的参数不出现，已填写的旧资料会保留。</span></header>
          <div className="pro-editor__group">
            <div className="pro-editor__group-head"><h3>对外文字</h3></div>
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
          </div>
          <div className="pro-editor__group">
            <div className="pro-editor__group-head"><h3>重量</h3></div>
          <Form.Item name="goldWeight" label={<span>金重（g）{requiresGoldWeight && !showSkuTable ? <RequiredMark /> : null}</span>} className="pro-editor__horizontal-field pro-editor__money-field" extra={requiresGoldWeight && showSkuTable ? "请在有效 SKU 中填写每个规格的实际净金重。" : goldExtra}><InputNumber min={0} precision={2} suffix="g" /></Form.Item>
          <Form.Item name="weight" label="成品总重（g）" className="pro-editor__horizontal-field pro-editor__money-field" extra="含主石和配件。和贵金属净重相同或没有区别时留空，前台不会再显示一遍。"><InputNumber min={0} precision={2} suffix="g" /></Form.Item>
          </div>
          <div className="pro-editor__group">
            <div className="pro-editor__group-head"><h3>作品资料</h3><span>按当前类目和销售方式核对必填项</span></div>
          <div className="pro-editor__attributes">
            <Form.Item name="materialType" label={<span>{requiresPreciousMetal ? "主要材质与纯度" : "主要材质"}{directPublication ? <RequiredMark /> : null}</span>} extra={checklistValues?.materialType === "OTHER" ? "直接销售上架不能使用「其他」作为成交材质。请改选具体材质，或改用仅展示、咨询或定制。" : undefined}><Select allowClear virtual={false} listHeight={360} options={materials} placeholder="选择经核实的材质" /></Form.Item>
            {checklistValues?.materialType === "OTHER" || Boolean(checklistValues?.materialNote?.trim()) ? (
              <Form.Item name="materialNote" label="具体材质" extra="只写已经核实的材质名称。前台在主要材质为「其他」时显示这句话。"><Input maxLength={80} placeholder="如：和田玉籽料" /></Form.Item>
            ) : null}
            <Form.Item name="metalColor" label="金属颜色" extra="选填。例如黄色、玫瑰金、白色。留空时前台不显示。"><Input maxLength={40} placeholder="如：黄色" /></Form.Item>
            <Form.Item name="size" label={<span>{categorySizeField?.label || "尺寸/圈口"}{requiresSize && !showSkuTable ? <RequiredMark /> : null}</span>} extra={requiresSize && showSkuTable ? "请在有效 SKU 中填写每个规格的尺寸。" : undefined}><Input maxLength={directPublication && !showSkuTable ? 50 : 100} placeholder={categorySizeField?.example || "如：圈口 14"} /></Form.Item>
            <Form.Item name="craftTechnique" label="制作工艺"><Select mode="multiple" options={craftOptions.map((value) => ({ value }))} /></Form.Item>
            {visibleMeasurements.map((field) => (
              <Form.Item key={field.key} name={["measurements", field.key]} label={field.label} extra="选填。留空时前台不显示。">
                <Input maxLength={80} placeholder={field.placeholder || undefined} />
              </Form.Item>
            ))}
            {showGemFields ? <>
              <Form.Item name="gemType" label={<span>主石种类{requiresGem ? <RequiredMark /> : null}</span>}><Select allowClear options={gemOptions.map((value) => ({ value }))} /></Form.Item>
              <Form.Item name="gemSettingMaterial" label={<span>镶托材质{requiresGem && !PRECIOUS_METALS.has(watchedEntry?.materialType || "") ? <RequiredMark /> : null}</span>} extra={requiresGem ? "主要材质为贵金属且与镶托相同时可沿用。" : "选填。"}><Select allowClear options={materials.filter(({ value }) => PRECIOUS_METALS.has(value))} /></Form.Item>
              <Form.Item name="gemOrigin" label={<span>宝石来源{requiresGemDisclosure ? <RequiredMark /> : null}</span>}><Select allowClear options={GEM_ORIGINS.map((value) => ({ value }))} /></Form.Item>
              <Form.Item name="gemTreatment" label={<span>宝石处理说明{requiresGemDisclosure ? <RequiredMark /> : null}</span>}><Input maxLength={100} placeholder="如：未经处理，或写明已知处理方式" /></Form.Item>
              <Form.Item name="gemCarat" label={<span>主石重量（ct）{requiresGemCarat ? <RequiredMark /> : null}</span>} extra={jewelryProfile.showPearlNotes ? "珍珠直径写在上面的珍珠直径。这里只填克拉重量。" : undefined}><InputNumber min={0} precision={3} /></Form.Item>
              <Form.Item name="gemQuantity" label={jewelryProfile.showPearlNotes ? "珍珠数量" : "宝石数量"}><InputNumber min={0} precision={0} /></Form.Item>
              <Form.Item name="gemColor" label={showDiamondGrading ? "颜色等级" : jewelryProfile.showJadeNotes ? "颜色" : jewelryProfile.showPearlNotes ? "体色" : "颜色"}><Input placeholder={showDiamondGrading ? "如：D" : "如：正阳绿"} /></Form.Item>
              {showDiamondGrading || checklistValues?.gemClarity ? <Form.Item name="gemClarity" label={<span>净度等级{requiresGemGrading ? <RequiredMark /> : null}</span>}><Input placeholder="如：VS1" /></Form.Item> : null}
              {showDiamondGrading || checklistValues?.gemCut ? <Form.Item name="gemCut" label="切工"><Select allowClear options={["EX","VG","G","F","不适用"].map((value) => ({ value }))} /></Form.Item> : null}
            </> : <p className="pro-editor__span-3 pro-editor__hint">当前类目不使用宝石分级。钻石净度、切工不会出现在素金、翡翠或珍珠上。<button type="button" onClick={() => setForceGem(true)}>这件作品有主石</button></p>}
          </div>
          </div>
          <div className="pro-editor__group pro-editor__group--plain">
          <Form.Item name="includesCertificate" valuePropName="checked">
            <Checkbox>这件商品随附鉴定证书</Checkbox>
          </Form.Item>
          <ProductCertificateEditor
            key={currentProductId ?? "new"}
            productId={currentProductId}
            certificates={certificates}
            disabled={saving || isRoleReadOnly || Boolean(pendingSaveVerification)}
            required={requiresCertificate && watchedVisibility !== "INTERNAL"}
            published={currentStatus === "PUBLISHED"}
            onChange={(updated) => {
              setCertificates(updated);
              if (currentStatus === "PUBLISHED") markDirty();
              dismissSubmitError();
            }}
            onBusyChange={setCertificateBusy}
          />
          </div>
        </section>

        <section id="publish" className="pro-editor__card">
          <header className="pro-editor__card-head"><h2>发布与配送</h2></header>
          <div className="pro-editor__group">
            <div className="pro-editor__group-head"><h3>上架与可见范围</h3></div>
          <div className="pro-editor__sales-grid">
            <Form.Item name="publishMode" label={canGovernPublic ? "上架时间" : "发布流程"}><Radio.Group disabled={!canGovernPublic}><Radio value="IMMEDIATE">立刻上架</Radio><Radio value="SCHEDULED">定时上架</Radio><Radio value="WAREHOUSE">提交审核前保留草稿</Radio></Radio.Group></Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.publishMode !== next.publishMode || prev.scheduledPublishAt !== next.scheduledPublishAt}>{({ getFieldValue }) => getFieldValue("publishMode") === "SCHEDULED" ? <Form.Item name="scheduledPublishAt" label={<span>定时上架时间<RequiredMark /></span>} className={requiredFieldClass(true, !getFieldValue("scheduledPublishAt"))} rules={[{ required: true }]}><DatePicker showTime disabledDate={(date) => date.isBefore(dayjs(), "day")} /></Form.Item> : null}</Form.Item>
            <Form.Item name="visibility" label={<span>可见范围<RequiredMark /></span>} rules={[{ required: true, message: "请选择可见范围" }]} extra="上架后只出现在选款中心。首页、作品展陈和其他页面不会列出这件商品。"><Select options={visibilityOptions} /></Form.Item>
          </div>
          </div>
          <div className="pro-editor__group">
            <div className="pro-editor__group-head"><h3>交付</h3></div>
          <div className="pro-editor__sales-grid">
            <Form.Item name="deliveryMethods" label={<span>配送方式{directPublication ? <RequiredMark /> : null}</span>} extra={directPublication ? "请选择顾客实际可以使用的方式。物流、到店自提和专人配送都使用现有履约能力。" : "选填。非直接销售不要求配送。"}><Checkbox.Group options={[...DELIVERY_METHOD_OPTIONS]} /></Form.Item>
            <Form.Item name="packageType" label="包装说明" extra="选填。只写实际提供的包装，留空时前台不显示。"><Input maxLength={100} placeholder="如：锦盒" /></Form.Item>
            {directPublication && <>
              <Form.Item name="requiresInsuredShipping" valuePropName="checked" extra="只在实际安排保价运输时勾选。这里不填写保额，前台也只说明需要保价。"><Checkbox>需要保价运输</Checkbox></Form.Item>
              <Form.Item name="requiresSignature" valuePropName="checked" extra="只在实际要求签收确认时勾选。"><Checkbox>需要签收确认</Checkbox></Form.Item>
              <Form.Item name="fulfillmentType" label={<span>备货状态<RequiredMark /></span>}><Select placeholder="选择备货状态" options={FULFILLMENT_OPTIONS} /></Form.Item>
              <Form.Item name="dispatchTime" label={<span>发出时效<RequiredMark /></span>}><Select placeholder="选择发出时效" options={DISPATCH_OPTIONS} /></Form.Item>
              {watchedDispatchTime === "CUSTOM" && <Form.Item name="customLeadTime" label={<span>约定备货时间<RequiredMark /></span>}><Input maxLength={100} placeholder="如：订单确认后 7 至 10 个工作日" /></Form.Item>}
              <Form.Item name="fulfillmentConfirmed" valuePropName="checked">
                <Checkbox>已核对配送方式、备货状态和发出时效</Checkbox>
              </Form.Item>
            </>}
          </div>
          </div>
        </section>

        <section id="media" className="pro-editor__card">
          <header className="pro-editor__card-head"><h2>图文详情</h2></header>
          <div className="pro-editor__detail-head" id="product-detail"><div><strong>商品详情</strong><span>选填。详情图和基础信息里的主图分开，不会占用这 5 张主图。保存后按这个顺序出现在商品详情页。</span></div><Space wrap>
            <Upload multiple accept="image/jpeg,image/png,image/webp,image/gif" showUploadList={false} disabled={saving || checkingImages} beforeUpload={addDetailMedia}><button type="button" className="pro-editor__detail-add" disabled={saving || checkingImages} aria-label="上传详情图，可一次多选">上传详情图</button></Upload>
            <Button onClick={() => setDetailPickerOpen((open) => !open)}>从主图选用</Button>
            <Button onClick={() => addTextBlock()}>添加文字</Button>
          </Space></div>
          <div className="pro-editor__detail-templates" aria-label="详情内容模板">
            {DETAIL_TEMPLATES.map(([label, seed]) => (
              <button key={label} type="button" onClick={() => addTextBlock(seed)}>{label}</button>
            ))}
          </div>
          <div className="pro-editor__detail-tip">可以一次选择多张详情图。文字写工艺、尺寸或佩戴说明。顾客打开商品页后，按这里的顺序往下看。</div>
          {detailPickerOpen ? <div className="pro-editor__detail-picker">{mediaChoices.length === 0 ? <span>还没有主图。可以先在基础信息上传，或直接上传详情图。</span> : mediaChoices.map((item) => <button type="button" key={item.key} onClick={() => addGalleryImageToDetail(item)}><SecureImage src={item.src} alt={item.label} tokenKind="staff" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></button>)}</div> : null}
          <div className="pro-editor__detail-grid">
            <div className="pro-editor__blocks">
              {detail.length === 0 && <div className="pro-editor__empty">还没有详情。上传详情图，或写一段说明。</div>}
              {detail.map((block, index) => <div
                className={`pro-editor__block${draggingDetailKey === block.key ? " is-dragging" : ""}`}
                key={block.key}
                onDragOver={(event) => {
                  if (!draggingDetailKey) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromKey = event.dataTransfer.getData("text/plain") || draggingDetailKey;
                  setDraggingDetailKey(null);
                  if (fromKey) moveDetailBlock(fromKey, index);
                }}
              >
                <div className="pro-editor__block-tools"><Tag>{block.type === "TEXT" ? "文字" : "图片"}</Tag><button type="button" className="pro-editor__drag" draggable={!saving && !isRoleReadOnly} aria-label={`拖拽调整${block.type === "TEXT" ? "文字" : "图片"}模块顺序`} onDragStart={(event) => { event.dataTransfer.setData("text/plain", block.key); event.dataTransfer.effectAllowed = "move"; setDraggingDetailKey(block.key); }} onDragEnd={() => setDraggingDetailKey(null)}>拖动</button><Button aria-label={`上移${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveBlock(index, -1)} /><Button aria-label={`下移${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" icon={<ArrowDownOutlined />} disabled={index === detail.length - 1} onClick={() => moveBlock(index, 1)} /><Button aria-label={`删除${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" danger icon={<DeleteOutlined />} onClick={() => removeDetailBlock(block.key)} /></div>
                {block.type === "TEXT" ? <Input.TextArea rows={4} value={block.text} aria-label="详情文字" placeholder="写工艺、尺寸或佩戴说明" onChange={(event) => { setDetail((prev) => prev.map((item) => item.key === block.key ? { ...item, text: event.target.value } : item)); markDirty(); }} /> : <div className="pro-editor__block-visual">{mediaSrcByKey.get(block.pendingMediaKey || `saved-${block.imageId || ""}`) ? <SecureImage className="pro-editor__block-photo" src={mediaSrcByKey.get(block.pendingMediaKey || `saved-${block.imageId || ""}`)} alt={block.alt || "商品详情"} tokenKind="staff" style={{ width: "100%", maxHeight: 280, objectFit: "contain" }} /> : <span>这张详情图暂时显示不了，请删除后重新上传。</span>}</div>}
              </div>)}
            </div>
            <div className={`pro-editor__preview${previewDevice === "phone" ? " is-phone" : " is-desktop"}`}>
              <div className="pro-editor__phone-tabs" role="tablist" aria-label="预览宽度">
                <button type="button" aria-pressed={previewDevice === "desktop"} className={previewDevice === "desktop" ? "is-active" : ""} onClick={() => setPreviewDevice("desktop")}>桌面</button>
                <button type="button" aria-pressed={previewDevice === "phone"} className={previewDevice === "phone" ? "is-active" : ""} onClick={() => setPreviewDevice("phone")}>手机</button>
              </div>
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

      </Form>
        </div>
        <aside className={`pro-editor__check${checkOpen ? " is-open" : ""}`} aria-label="商品检查">
          <div className="pro-editor__guide-card">
            <strong>发布检查</strong>
            <p>{requiredChecks.length === 0 ? "保存草稿只需要类目和款号。" : `必填已完成 ${completedChecks}/${requiredChecks.length}。草稿不会因为选填项未写而被拦住。`}</p>
            <ul className="pro-editor__gap-list">
              {checklistItems.map((item) => (
                <li key={item.label}>
                  <button type="button" onClick={() => jumpToPublishTarget(item.target)}>{item.done ? "已完成" : item.optional ? "选填" : "待补"} · {item.label}</button>
                </li>
              ))}
            </ul>
            <div className="pro-editor__guide-actions">
              <button type="button" onClick={() => { setPreviewValues(form.getFieldsValue(true)); setPreviewOpen(true); }}>查看填写结果</button>
            </div>
            <p>{commerceEnabled ? "支付已开放。直接销售在价格、库存和包邮模板齐备后可以购买。" : "支付未开放。直接销售只会展示价格，不能加购或付款。"}</p>
          </div>
        </aside>
      </div>

      <footer className="pro-editor__footer"><div><div className="pro-editor__footer-actions">{isReviewLocked && canGovernPublic ? <><Button type="primary" loading={saving} disabled={Boolean(pendingSaveVerification)} onClick={() => void approveReviewedProduct()}>{primaryActionLabel}</Button><Button disabled={saving || Boolean(pendingSaveVerification)} onClick={() => void returnReviewedProduct()}>退回修改</Button></> : !isRoleReadOnly ? <Button type="primary" loading={saving} aria-label={primaryActionLabel} aria-busy={saving || checkingImages || checkingSuggestedCode} disabled={saving || certificateBusy || checkingImages || checkingSuggestedCode || Boolean(pendingSaveVerification)} onClick={() => void save("primary")}>{primaryActionLabel}</Button> : null}{!isReviewLocked && canGovernPublic && currentStatus === "PUBLISHED" ? <Button danger disabled={saving || certificateBusy || Boolean(pendingSaveVerification)} onClick={confirmOffline}>下架</Button> : !isReviewLocked && !isRoleReadOnly && (currentStatus !== "OFFLINE" || selectedPublishMode !== "WAREHOUSE") ? <Button icon={<SaveOutlined />} loading={saving} disabled={certificateBusy || checkingImages || checkingSuggestedCode || Boolean(pendingSaveVerification)} onClick={() => void save("draft")}>{currentStatus === "OFFLINE" ? "保存内容" : "保存草稿"}</Button> : null}<Button icon={<EyeOutlined />} disabled={saving} onClick={() => { setPreviewValues(form.getFieldsValue(true)); setPreviewOpen(true); }}>预览</Button></div><span role="status" aria-live="polite" className={dirty ? "is-dirty" : ""}>{savedStatusText}</span></div></footer>

      <Modal
        rootClassName="pro-editor-modal"
        title="更正款号"
        open={correctOpen}
        okText="确认更正"
        cancelText="取消"
        confirmLoading={correctingCode}
        onOk={() => void submitCorrectCode()}
        onCancel={() => {
          if (!correctingCode) setCorrectOpen(false);
        }}
      >
        <p>公开地址会改成新款号。原来的地址仍会打开这件商品。已经下过的订单继续使用下单时的款号。</p>
        <Input
          maxLength={50}
          value={codeDraft}
          placeholder="填写正确的款号"
          onChange={(event) => setCodeDraft(event.target.value)}
          onPressEnter={() => void submitCorrectCode()}
        />
      </Modal>

      <Modal rootClassName="pro-editor-modal" title="商品预览" width={760} open={previewOpen} onCancel={() => {
        setPreviewOpen(false);
        setPreviewSkuId(null);
        setPreviewStock(undefined);
      }} footer={null}>
        <div className="pro-editor__preview-dialog">
          <div className="pro-editor__preview-hero">
            {previewImage?.src ? <SecureImage key={previewImage.key} src={previewImage.src} alt={previewSku?.size || previewValues.name || "商品主图"} tokenKind="staff" /> : <div className="pro-editor__preview-placeholder"><FileImageOutlined /><span>尚未上传主图</span></div>}
            <div>
              <Tag>{selectedCategoryLabel || "珠宝"}</Tag><h3>{previewValues.name || "未命名商品"}</h3>
              <strong aria-live="polite">{previewValues.salesMode === "DIRECT_PURCHASE" ? (previewPrice > 0 ? `¥ ${previewPrice.toFixed(2)}` : "价格待配置") : previewValues.salesMode === "CUSTOM_INQUIRY" && Number(previewValues.priceMin) > 0 ? `¥ ${Number(previewValues.priceMin).toLocaleString()} 起` : (salesModeLabelsForPreview[previewValues.salesMode as SalesMode] || "非直购商品")}</strong>
              <p>{previewValues.brand || previewValues.materialType || "商品信息待完善"}</p>
              {previewSkus.length > 0 ? (
                <fieldset className="pro-editor__preview-specs">
                  <legend>选择预览规格</legend>
                  <Radio.Group value={previewSkuId} onChange={(event) => setPreviewSkuId(event.target.value)}>
                    {previewSkus.map((sku) => <Radio key={sku.id} value={sku.id}>{[sku.color?.trim(), sku.size?.trim()].filter(Boolean).join(" · ") || sku.skuCode}</Radio>)}
                  </Radio.Group>
                  <p role="status">{!previewSku ? "选择规格后查看库存状态" :
                    previewStockStatus === true ? "有货" :
                    previewStockStatus === false ? "已售罄" :
                    canWriteStock && previewStock === undefined ? "正在读取库存" : "库存待确认"}</p>
                </fieldset>
              ) : null}
            </div>
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
            <Form.Item name="size" label={<span>{categorySizeField?.label || "规格"}{requiresSize ? <RequiredMark /> : null}</span>}><Input maxLength={50} placeholder={categorySizeField?.example || "如：圈口 14"} /></Form.Item>
            <Form.Item name="color" label="颜色"><Input maxLength={50} placeholder="如：玫瑰金、白色" /></Form.Item>
            <Form.Item name="goldWeight" label={<span>金重（g）{requiresGoldWeight ? <RequiredMark /> : null}</span>}><InputNumber min={0} precision={2} /></Form.Item>
            <Form.Item name="price" label="价格" rules={[{ required: true, message: "请输入价格" }]}><InputNumber min={0} precision={2} suffix="元" /></Form.Item>
            <Form.Item name="isActive" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
          </div>
          <Form.Item name="imageId" label="规格图片" extra="从已上传的图集选择。客户选中此规格时，主图会切换到这张图片。">
            <Select
              allowClear
              placeholder="沿用作品图集"
              options={mediaChoices.flatMap((item) => item.imageId && item.src ? [{
                value: item.imageId,
                label: (
                  <Space>
                    <SecureImage src={item.src} alt="" tokenKind="staff" style={{ width: 28, height: 28, objectFit: "contain" }} />
                    {item.label}
                  </Space>
                ),
              }] : [])}
            />
          </Form.Item>
          <Alert type="info" showIcon message="只有一种规格时，用上面的可售数量。多个规格的数量请到库存管理分别填写。" />
        </Form>
      </Modal>
      <UnsavedChangesGuard hasUnsavedChanges={dirty} disabled={saving} subject="商品信息" rootClassName="pro-editor-unsaved-modal" onSaveAndLeave={() => saveRef.current()} />
    </div>
  );
}
