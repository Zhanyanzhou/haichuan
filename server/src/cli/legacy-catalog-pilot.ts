/**
 * 小程序公开目录的本机试导入规则。
 * 只生成草稿映射，不连接数据库，也不读取售价数字。
 * 正式的大批量导入仍要先补齐销售方式、库存和分类决定。
 */

export const PILOT_PRODUCT_CAP = 8;
export const SOURCE_MARKER_PREFIX = "旧接口#";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const MATERIAL_TYPES = [
  "GOLD_999",
  "GOLD_9999",
  "AU750",
  "PT950",
  "S925",
  "DIAMOND",
  "JADE",
  "PEARL",
  "COLOR_GEM",
  "OTHER",
] as const;

export type PilotMaterialType = (typeof MATERIAL_TYPES)[number];

export type PilotArgs = {
  apply: boolean;
  limit: number;
  categoryId: number;
};

export type SourceParam = {
  name: string;
  value: string;
};

export type SourceCategory = {
  id: number;
  name: string;
  level: number;
  parentId: number | null;
};

export type SourceProduct = {
  id: number;
  name: string;
  categoryId: number;
  hasDescription: boolean;
  mainImage: string | null;
  gallery: string[];
  details: string[];
  params: SourceParam[];
  keyParams: SourceParam[];
  specCount: number;
  hasQuotedPrice: boolean;
  hasVariantWeight: boolean;
  hasStock: boolean;
};

export type PilotProductDraft = {
  name: string;
  code: string;
  shortDescription: string;
  description: string;
  materialType: PilotMaterialType;
  craftTechnique?: string[];
  isCustom: boolean;
  includesCertificate: false;
  status: "DRAFT";
  visibility: "INTERNAL";
  salesMode: "DISPLAY_ONLY";
  publishMode: "WAREHOUSE";
  issues: string[];
};

export type PilotImageJob = {
  sourceUrl: string;
  type: "FRONT" | "SIDE" | "DETAIL";
  sortOrder: number;
};

type ImageRole = PilotImageJob["type"];

export function readPilotArgs(argv: string[]): PilotArgs {
  let apply = false;
  let limit = PILOT_PRODUCT_CAP;
  let categoryId = 114;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--limit") {
      limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--category-id") {
      categoryId = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`不能识别的参数 ${arg}`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > PILOT_PRODUCT_CAP) {
    throw new Error(`本轮试导入最多 ${PILOT_PRODUCT_CAP} 件`);
  }
  if (!Number.isInteger(categoryId) || categoryId < 1) {
    throw new Error("分类编号无效");
  }
  return { apply, limit, categoryId };
}

export function assertLocalCatalogDatabase(databaseUrl: string): { host: string; database: string } {
  const match = /^mysql:\/\/(?:[^@/?#]*@)?(\[[^\]]+\]|[^:/?#]+)(?::\d+)?\/([^?/#]+)/i.exec(databaseUrl);
  if (!match) {
    throw new Error("数据库地址无法确认为本机 MySQL，已停止导入");
  }
  const host = match[1].replace(/^\[|\]$/g, "");
  const database = decodeURIComponent(match[2]);
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`数据库不在本机（${host}），已停止导入`);
  }
  if (/prod|production/i.test(database)) {
    throw new Error(`数据库名称 ${database} 不像本地试导入库，已停止`);
  }
  return { host, database };
}

export function legacyCategorySlug(legacyId: number): string {
  if (!Number.isInteger(legacyId) || legacyId <= 0) {
    throw new Error("分类编号无效");
  }
  return `legacy-cat-${legacyId}`;
}

export function sourceMarker(legacyId: number): string {
  if (!Number.isInteger(legacyId) || legacyId <= 0) {
    throw new Error("来源商品编号无效");
  }
  return `${SOURCE_MARKER_PREFIX}${legacyId}`;
}

export function legacyProductCode(legacyId: number, rawSku: string | undefined): { code: string; issue?: string } {
  const compact = (rawSku ?? "").trim().replace(/\s+/g, "");
  if (/^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/.test(compact)) {
    return { code: compact };
  }
  if (!Number.isInteger(legacyId) || legacyId <= 0) {
    throw new Error("来源商品编号无效");
  }
  return {
    code: `LEGACY-${legacyId}`.slice(0, 50),
    issue: compact ? "货号含有不能作为本站编码的字符，已改用 LEGACY 编号" : "来源没有货号，已改用 LEGACY 编号",
  };
}

export function legacyImageUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.includes("\\") || value.includes("..")) return null;
  let path = value;
  if (value.startsWith("https://haichuanzhubao.com/public/uploads/")) {
    path = value.slice("https://haichuanzhubao.com/public".length);
  } else if (value.startsWith("http://") || value.startsWith("https://")) {
    return null;
  }
  if (!path.startsWith("/uploads/") || path.includes("?") || path.includes("#") || path.includes("//")) {
    return null;
  }
  return `https://haichuanzhubao.com/public${path}`;
}

export function mapMaterial(params: SourceParam[], keyParams: SourceParam[]): { materialType: PilotMaterialType; issue?: string } {
  const text = [...params, ...keyParams]
    .filter((item) => /成色|材质/.test(item.name))
    .map((item) => item.value)
    .join(" ");
  if (!text.trim()) {
    return { materialType: "OTHER", issue: "来源没有成色，材质记为其他" };
  }
  if (/9999|足金9999/.test(text)) return { materialType: "GOLD_9999" };
  if (/足金999(?!9)|足金|黄金/.test(text)) return { materialType: "GOLD_999" };
  if (/AU750|18\s*K|K金/i.test(text)) return { materialType: "AU750" };
  if (/PT950|铂金/i.test(text)) return { materialType: "PT950" };
  if (/S925|银/i.test(text)) return { materialType: "S925" };
  if (/钻/.test(text)) return { materialType: "DIAMOND" };
  if (/翡翠|玉/.test(text)) return { materialType: "JADE" };
  if (/珍珠/.test(text)) return { materialType: "PEARL" };
  if (/彩宝|宝石/.test(text)) return { materialType: "COLOR_GEM" };
  return { materialType: "OTHER", issue: "来源成色对不上本站材质，已记为其他" };
}

export function extractSourceList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  for (const key of ["list", "products", "items"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

export function parseSourceCategory(data: unknown): SourceCategory {
  const record = asRecord(data);
  const id = Number(record?.id);
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  const level = Number(record?.level);
  const parentRaw = record?.parent_id ?? record?.parentId;
  const parentNumber = parentRaw === null || parentRaw === undefined ? 0 : Number(parentRaw);
  if (!Number.isInteger(id) || id <= 0 || !name || !Number.isInteger(level) || level < 1) {
    throw new Error("分类数据不完整");
  }
  return {
    id,
    name,
    level,
    parentId: Number.isInteger(parentNumber) && parentNumber > 0 ? parentNumber : null,
  };
}

export function parseSourceProduct(data: unknown): SourceProduct {
  const record = asRecord(data);
  const id = Number(record?.id);
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  const categoryId = Number(record?.category_id ?? record?.categoryId);
  if (!Number.isInteger(id) || id <= 0 || !name || !Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error("商品数据不完整");
  }
  const params = readParams(record?.params);
  const keyParams = readParams(record?.key_params ?? record?.keyParams);
  const specs = Array.isArray(record?.specs) ? record.specs : [];
  const fixedPrice = record?.fixed_price ?? record?.fixedPrice;
  return {
    id,
    name,
    categoryId,
    hasDescription: typeof record?.description === "string" && record.description.trim().length > 0,
    mainImage: typeof record?.main_image === "string" ? record.main_image : null,
    gallery: readImageList(record?.main_images ?? record?.images),
    details: readImageList(record?.detail_images ?? record?.detailImages),
    params,
    keyParams,
    specCount: specs.length,
    hasQuotedPrice: hasPositiveAmount(fixedPrice) || specs.some((item) => hasPositiveAmount(asRecord(item)?.price)),
    hasVariantWeight: specs.some((item) => hasPositiveAmount(asRecord(item)?.weight ?? asRecord(item)?.gold_weight)),
    hasStock: hasPositiveAmount(record?.stock),
  };
}

export function buildPilotProductDraft(product: SourceProduct, categoryPath: string): PilotProductDraft {
  const sku = findParam(product.keyParams, "货号") ?? findParam(product.params, "货号");
  const code = legacyProductCode(product.id, sku);
  const material = mapMaterial(product.params, product.keyParams);
  const craft = findParam(product.keyParams, "工艺") ?? findParam(product.params, "工艺");
  const service = findParam(product.params, "增值服务") ?? findParam(product.keyParams, "增值服务");
  const certificate = findParam(product.params, "鉴定证书") ?? findParam(product.keyParams, "鉴定证书");
  const issues = [
    code.issue,
    material.issue,
    product.hasQuotedPrice ? `来源有 ${product.specCount || 1} 档报价，未写入成交价` : "来源没有可用报价，成交价保持为 0",
    product.hasVariantWeight ? "来源规格带克重，未写入金重" : undefined,
    product.hasStock ? "来源库存未写入可售库存" : "来源没有库存事实，可售库存保持为 0",
    certificate?.includes("不附") ? "来源写明不附证书，已按不附证书保存" : "没有证书文件，已按不附证书保存",
    service?.includes("定制") ? "来源写了定制，已标记可定制，但没有定制规则" : undefined,
    product.hasDescription ? "来源文案未写入，避免把未核对内容带进商品介绍" : "来源没有商品介绍",
    "发货时效、保价和签收没有来源依据，系统会留下未确认的默认值",
  ].filter((issue): issue is string => Boolean(issue));

  const name = product.name.slice(0, 200);
  if (product.name.length > 200) issues.push("商品名称超过 200 字，已截断");

  return {
    name,
    code: code.code,
    shortDescription: sourceMarker(product.id),
    description: [
      "从小程序公开接口导入的后台草稿。",
      `来源编号：${product.id}`,
      `来源分类：${categoryPath}`,
      "来源标价、库存和证书没有写入。规格报价需要核对后才能作为成交价。",
    ].join("\n"),
    materialType: material.materialType,
    craftTechnique: craft ? [craft.slice(0, 50)] : undefined,
    isCustom: Boolean(service?.includes("定制")),
    includesCertificate: false,
    status: "DRAFT",
    visibility: "INTERNAL",
    salesMode: "DISPLAY_ONLY",
    publishMode: "WAREHOUSE",
    issues,
  };
}

export function planPilotImages(product: Pick<SourceProduct, "mainImage" | "gallery" | "details">): { jobs: PilotImageJob[]; issues: string[] } {
  const issues: string[] = [];
  const jobs: PilotImageJob[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null, type: ImageRole, sortOrder: number) => {
    if (jobs.filter((job) => job.type === type).length >= (type === "FRONT" ? 1 : type === "SIDE" ? 3 : 2)) return;
    if (!raw) {
      if (type === "FRONT") issues.push("来源没有主图");
      return;
    }
    const sourceUrl = legacyImageUrl(raw);
    if (!sourceUrl) {
      issues.push(type === "FRONT" ? "主图地址不安全，已跳过" : "有图片地址不安全，已跳过");
      return;
    }
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);
    jobs.push({ sourceUrl, type, sortOrder });
  };

  push(product.mainImage, "FRONT", 0);
  product.gallery.forEach((url, index) => push(url, "SIDE", index + 1));
  product.details.forEach((url, index) => push(url, "DETAIL", 1000 + index));
  if (jobs.length === 0) issues.push("没有可保存的图片");
  return { jobs, issues: unique(issues) };
}

function findParam(params: SourceParam[], name: string): string | undefined {
  const value = params.find((item) => item.name === name)?.value.trim();
  return value ? value : undefined;
}

function readParams(value: unknown): SourceParam[] {
  if (!Array.isArray(value)) return [];
  const params: SourceParam[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const named = typeof record?.name === "string" ? record.name.trim() : "";
    const keyed = typeof record?.key === "string" ? record.key.trim() : "";
    const name = named || keyed;
    const raw = record?.value;
    const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
    if (name) params.push({ name, value: text });
  }
  return params;
}

function readImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      urls.push(item);
      continue;
    }
    const record = asRecord(item);
    const url = record?.url ?? record?.image ?? record?.src;
    if (typeof url === "string") urls.push(url);
  }
  return urls;
}

function hasPositiveAmount(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value !== "string" || !value.trim()) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
