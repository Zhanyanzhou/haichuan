import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  CONTENT_TEMPLATE_PAGE_PATHS,
  CONTENT_TEMPLATE_PAGE_METADATA,
  getPageDocumentMediaReferences,
  hasCurrentContentTemplatePublicationAttestation,
  withoutContentTemplatePublicationAttestation,
} from "../modules/page-modules/generated/contentTemplates.generated";
import {
  createPageLocaleContentHash,
  PAGE_LOCALE_SELF_REVIEW_ACTION,
  readPageLocaleRevisionMarker,
  stripPageLocaleRevisionMetadata,
} from "../modules/page-modules/page-document-localization";
import { createMediaPublicationReferenceKey } from "../modules/page-modules/media-publication-manifest";
import { evaluateMediaPublicEligibility } from "../modules/upload/media-public-eligibility";

const PAGE_KEYS = ["home", "products", "catalog", "custom", "about", "contact"] as const;
const ENGLISH_PAGE_KEYS = new Set<string>(["home", "products", "custom", "about"]);
const PRODUCT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_SETTINGS = [
  "siteName",
  "canonicalBaseUrl",
  "seoReviewReference",
  "legalEntityReviewReference",
  "privacyPolicyReviewReference",
] as const;

type PublicLocale = "zh-CN" | "en";
type ReleaseProfile = "lead-generation" | "commerce";
type SourceStage = "preproduction" | "production";
type LegalSourceHashes = {
  privacy: string;
  businessInfo: string;
};

export interface PublicSeoSnapshotDatabase {
  siteSetting: { findUnique(args: unknown): Promise<any> };
  pageDocument: { findMany(args: unknown): Promise<any[]> };
  product: { findMany(args: unknown): Promise<any[]> };
  operationLog: { findUnique(args: unknown): Promise<any> };
  user: { findUnique(args: unknown): Promise<any> };
}

export type PublicSeoSourceConfig = {
  sourceStage: SourceStage;
  expectedOrigin: string;
  sourceEnvironmentId: string;
  expectedDatabase: string;
  databaseHostHash: string;
  approvalReferenceHash: string;
  releaseProfile: ReleaseProfile;
  legalSourceHashes: LegalSourceHashes;
  legalEntityName: string;
};

export type PublicSeoPageValidator = (
  pageKey: string,
  puckData: unknown,
  metadata: unknown,
) => Promise<{ valid: boolean }>;

type SnapshotRouteInput = {
  path: string;
  canonicalPath: string;
  locale: PublicLocale;
  kind: "page" | "product" | "legal";
  alternateKey: string;
  published: true;
  indexable: true;
  contentSource: "human-reviewed" | "verified-facts";
  contentHashBefore: string;
  contentHashAfter: string;
  lastModified: string;
  siteName: string;
  title: string;
  description: string;
  shareImage: string;
  renderedBodyHtml: string;
  structuredData?: unknown;
  productCode?: string;
};

type Projection = {
  sourceHash: string;
  routes: SnapshotRouteInput[];
};

function fail(code: string): never {
  throw new Error(`PUBLIC_SEO_EXPORT_${code}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isoDate(value: unknown, code: string): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) fail(code);
  return date.toISOString().slice(0, 10);
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function normalizeOrigin(value: unknown): string {
  let parsed: URL;
  try {
    parsed = new URL(text(value));
  } catch {
    fail("ORIGIN_INVALID");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) fail("ORIGIN_INVALID");
  return parsed.origin;
}

function absolutePublicUrl(value: unknown, origin: string, code: string): string {
  const raw = text(value);
  if (!raw || /^(?:data|blob|javascript|vbscript|file):/i.test(raw)) fail(code);
  let parsed: URL;
  try {
    parsed = new URL(raw, origin);
  } catch {
    fail(code);
  }
  if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password || parsed.hash) {
    fail(code);
  }
  return parsed.href;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function semanticBody(title: string, description: string): string {
  return [
    '<main data-public-seo-projection="true">',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(description)}</p>`,
    "</main>",
  ].join("");
}

function legalDefinitions(legalEntityName: string) {
  return [
    {
      key: "privacy" as const,
      path: "/privacy",
      alternateKey: "legal:privacy",
      title: "隐私说明 | 海川珠宝",
      description: "海川珠宝隐私说明：收集的信息类型、用途、保存原则与您的查询、更正、删除权利。",
    },
    {
      key: "businessInfo" as const,
      path: "/business-info",
      alternateKey: "legal:business-info",
      title: "经营主体信息 | 海川珠宝",
      description: `海川珠宝网站运营主体${legalEntityName}的公开登记信息。`,
    },
  ].map((definition) => ({
    ...definition,
    renderedBodyHtml: semanticBody(definition.title, definition.description),
  }));
}

export function createPublicSeoLegalSourceFacts(input: {
  legalEntityName: string;
  legalEntitySource: string;
  privacyPageSource: string;
  businessInfoPageSource: string;
}) {
  const legalEntityName = text(input.legalEntityName);
  if (!legalEntityName || legalEntityName.length > 200) fail("LEGAL_ENTITY_NAME_INVALID");
  const definitions = legalDefinitions(legalEntityName);
  const source = (value: string) => value.replace(/\r\n/g, "\n");
  const shared = source(input.legalEntitySource);
  return {
    legalEntityName,
    hashes: {
      privacy: sha256({
        version: "public-legal-source-v1",
        legalEntity: shared,
        page: source(input.privacyPageSource),
        projection: definitions.find((definition) => definition.key === "privacy"),
      }),
      businessInfo: sha256({
        version: "public-legal-source-v1",
        legalEntity: shared,
        page: source(input.businessInfoPageSource),
        projection: definitions.find((definition) => definition.key === "businessInfo"),
      }),
    },
  };
}

function requireSignoffBinding(value: unknown, expectedHash: string, code: string) {
  const reference = text(value);
  const match = /^([^|]{3,120})\|sha256:([a-f0-9]{64})$/.exec(reference);
  if (!match) fail(`${code}_FORMAT_INVALID`);
  if (match[2] !== expectedHash) fail(`${code}_HASH_MISMATCH`);
}

function requireSettings(settingsRow: any, config: PublicSeoSourceConfig) {
  if (!settingsRow || !isRecord(settingsRow.value)) fail("SITE_SETTINGS_NOT_PERSISTED");
  const settings = settingsRow.value;
  for (const field of REQUIRED_SETTINGS) {
    if (!text(settings[field])) fail(`SITE_SETTING_${field.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase()}_MISSING`);
  }
  const origin = normalizeOrigin(settings.canonicalBaseUrl);
  if (origin !== normalizeOrigin(config.expectedOrigin)) fail("SOURCE_ORIGIN_MISMATCH");
  if (settings.defaultLocale !== "zh-CN") fail("DEFAULT_LOCALE_INVALID");
  if (!Array.isArray(settings.publishedLocales)) fail("PUBLISHED_LOCALES_INVALID");
  const locales: string[] = settings.publishedLocales.map(text);
  if (new Set(locales).size !== locales.length || !locales.includes("zh-CN") || locales.some((locale) => locale !== "zh-CN" && locale !== "en")) {
    fail("PUBLISHED_LOCALES_INVALID");
  }
  return { settings, origin, locales, version: settingsRow.version, updatedAt: settingsRow.updatedAt };
}

function assertMediaManifestCurrent(revision: any, pageKey: string, publicMetadata: Record<string, unknown>, now: Date) {
  const manifestPaths = new Set((revision.mediaAssets ?? []).map((entry: any) => text(entry.referencePath)));
  const managedReferences = getPageDocumentMediaReferences(
    revision.puckData,
    publicMetadata,
    pageKey,
    { preserveReferencePaths: true },
  ).filter((reference) =>
    /^\/uploads\/page-assets\//.test(reference.url)
    || /^\/api\/upload\/public-media\/\d+(?:[?#].*)?$/.test(reference.url),
  );
  if (managedReferences.some((reference) => !manifestPaths.has(reference.path))) {
    fail("PAGE_MEDIA_MANIFEST_INCOMPLETE");
  }
  for (const manifest of revision.mediaAssets ?? []) {
    if (manifest.referenceKey !== createMediaPublicationReferenceKey(text(manifest.referencePath))) {
      fail("PAGE_MEDIA_MANIFEST_REFERENCE_DRIFT");
    }
    const asset = manifest.asset;
    if (!asset || asset.id !== manifest.assetId || asset.lifecycleRevision !== manifest.assetLifecycleRevision) {
      fail("PAGE_MEDIA_MANIFEST_ASSET_DRIFT");
    }
    const authorization = asset.authorization;
    if (
      !authorization
      || authorization.revision !== manifest.authorizationRevision
      || authorization.publicUseEpoch !== manifest.publicUseEpoch
    ) fail("PAGE_MEDIA_MANIFEST_AUTHORIZATION_DRIFT");
    const eligibility = evaluateMediaPublicEligibility({
      assetStatus: asset.status,
      accessLevel: asset.accessLevel,
      authorization,
    }, now);
    if (!eligibility.eligible) fail("PAGE_MEDIA_NOT_PUBLIC");
  }
}

async function projectPage(
  database: PublicSeoSnapshotDatabase,
  document: any,
  localization: any,
  locale: PublicLocale,
  origin: string,
  siteName: string,
  now: Date,
): Promise<SnapshotRouteInput> {
  if (!localization || localization.reviewStatus !== "PUBLISHED") fail(`PAGE_${document.pageKey}_${locale}_NOT_PUBLISHED`);
  if (!localization.publishedRevisionId || !text(localization.publishedHash) || !localization.publishedAt) {
    fail(`PAGE_${document.pageKey}_${locale}_PUBLISHED_POINTER_MISSING`);
  }
  const revision = localization.publishedRevision;
  if (
    !revision
    || revision.id !== localization.publishedRevisionId
    || revision.documentId !== document.id
    || revision.status !== "published"
    || !revision.publishedAt
  ) fail(`PAGE_${document.pageKey}_${locale}_PUBLISHED_POINTER_INVALID`);
  if (!hasCurrentContentTemplatePublicationAttestation(revision.metadata)) {
    fail(`PAGE_${document.pageKey}_${locale}_ATTESTATION_STALE`);
  }
  const marker = readPageLocaleRevisionMarker(revision.metadata);
  if (
    !marker
    || marker.locale !== locale
    || !marker.submittedBy
    || !marker.reviewedBy
    || !marker.submittedAt
    || !marker.reviewedAt
  ) fail(`PAGE_${document.pageKey}_${locale}_REVIEW_EVIDENCE_MISSING`);
  if (marker.submittedBy === marker.reviewedBy) {
    const selfReview = marker.selfReview;
    if (
      !selfReview
      || selfReview.actor !== marker.reviewedBy
      || selfReview.actorRole !== "SUPER_ADMIN"
      || selfReview.revision !== marker.submittedAt
      || selfReview.reviewedAt !== marker.reviewedAt
    ) fail(`PAGE_${document.pageKey}_${locale}_SELF_REVIEW_EVIDENCE_INVALID`);
    const [audit, actor] = await Promise.all([
      database.operationLog.findUnique({
        where: { id: selfReview.auditLogId },
        select: { id: true, userId: true, action: true, module: true, targetId: true, detail: true },
      }),
      database.user.findUnique({
        where: { id: selfReview.actor },
        select: { role: true, status: true },
      }),
    ]);
    let detail: Record<string, unknown> | null = null;
    try {
      detail = audit && typeof audit.detail === "string"
        ? JSON.parse(audit.detail) as Record<string, unknown>
        : null;
    } catch {
      detail = null;
    }
    if (
      actor?.role !== "SUPER_ADMIN"
      || actor.status !== "ACTIVE"
      || !audit
      || audit.userId !== selfReview.actor
      || audit.action !== PAGE_LOCALE_SELF_REVIEW_ACTION
      || audit.module !== "page-builder"
      || audit.targetId !== document.id
      || detail?.schemaVersion !== 1
      || detail.event !== PAGE_LOCALE_SELF_REVIEW_ACTION
      || detail.actor !== selfReview.actor
      || detail.actorRole !== "SUPER_ADMIN"
      || detail.pageKey !== document.pageKey
      || detail.locale !== locale
      || detail.revision !== selfReview.revision
      || detail.contentHash !== marker.contentHash
      || detail.reviewedAt !== marker.reviewedAt
      || detail.result !== "succeeded"
    ) fail(`PAGE_${document.pageKey}_${locale}_SELF_REVIEW_EVIDENCE_INVALID`);
  } else if (marker.selfReview) {
    fail(`PAGE_${document.pageKey}_${locale}_SELF_REVIEW_EVIDENCE_INVALID`);
  }
  const submittedAt = timestamp(marker.submittedAt);
  const reviewedAt = timestamp(marker.reviewedAt);
  const publishedAt = new Date(revision.publishedAt).getTime();
  if (submittedAt === null || reviewedAt === null || reviewedAt < submittedAt || publishedAt < reviewedAt) {
    fail(`PAGE_${document.pageKey}_${locale}_REVIEW_TIMELINE_INVALID`);
  }
  const publicMetadata = withoutContentTemplatePublicationAttestation(revision.metadata);
  const contentHash = createPageLocaleContentHash(revision.puckData, publicMetadata);
  if (
    !SHA256_PATTERN.test(contentHash)
    || marker.contentHash !== contentHash
    || localization.publishedHash !== contentHash
  ) fail(`PAGE_${document.pageKey}_${locale}_HASH_DRIFT`);
  assertMediaManifestCurrent(revision, document.pageKey, publicMetadata, now);
  const metadata = stripPageLocaleRevisionMetadata(publicMetadata);
  const title = text(metadata.seoTitle);
  const description = text(metadata.seoDescription);
  const shareImage = absolutePublicUrl(metadata.ogImage, origin, `PAGE_${document.pageKey}_${locale}_SHARE_IMAGE_INVALID`);
  if (
    !title
    || title.length > CONTENT_TEMPLATE_PAGE_METADATA.limits.seoTitle
    || !description
    || description.length > CONTENT_TEMPLATE_PAGE_METADATA.limits.seoDescription
  ) {
    fail(`PAGE_${document.pageKey}_${locale}_SEO_INCOMPLETE`);
  }
  const basePath = CONTENT_TEMPLATE_PAGE_PATHS[document.pageKey as keyof typeof CONTENT_TEMPLATE_PAGE_PATHS];
  if (typeof basePath !== "string") fail("PAGE_ROUTE_UNSUPPORTED");
  if (locale === "en" && !ENGLISH_PAGE_KEYS.has(document.pageKey)) fail("ENGLISH_PAGE_ROUTE_UNSUPPORTED");
  const path = locale === "en" ? (basePath === "/" ? "/en" : `/en${basePath}`) : basePath;
  return {
    path,
    canonicalPath: path,
    locale,
    kind: "page",
    alternateKey: `page:${document.pageKey}`,
    published: true,
    indexable: true,
    contentSource: "human-reviewed",
    contentHashBefore: contentHash,
    contentHashAfter: contentHash,
    lastModified: isoDate(revision.publishedAt, "PAGE_PUBLISHED_AT_INVALID"),
    siteName,
    title,
    description,
    shareImage,
    renderedBodyHtml: semanticBody(title, description),
  };
}

function projectLegalRoutes(
  site: ReturnType<typeof requireSettings>,
  config: PublicSeoSourceConfig,
  shareImage: string,
): SnapshotRouteInput[] {
  requireSignoffBinding(
    site.settings.privacyPolicyReviewReference,
    config.legalSourceHashes.privacy,
    "PRIVACY_POLICY_SIGNOFF",
  );
  requireSignoffBinding(
    site.settings.legalEntityReviewReference,
    config.legalSourceHashes.businessInfo,
    "LEGAL_ENTITY_SIGNOFF",
  );
  const definitions = legalDefinitions(config.legalEntityName).map((definition) => ({
    ...definition,
    sourceHash: config.legalSourceHashes[definition.key],
  }));
  return definitions.map((definition) => {
    const contentHash = sha256({
      version: "public-legal-source-v1",
      ...definition,
      shareImage,
      settingsVersion: site.version,
    });
    return {
      path: definition.path,
      canonicalPath: definition.path,
      locale: "zh-CN",
      kind: "legal",
      alternateKey: definition.alternateKey,
      published: true,
      indexable: true,
      contentSource: "human-reviewed",
      contentHashBefore: contentHash,
      contentHashAfter: contentHash,
      lastModified: isoDate(site.updatedAt, "LEGAL_SETTINGS_UPDATED_AT_INVALID"),
      siteName: text(site.settings.siteName),
      title: definition.title,
      description: definition.description,
      shareImage,
      renderedBodyHtml: definition.renderedBodyHtml,
    };
  });
}

function productQualityHash(product: any): string {
  const snapshot = {
    version: "p0-product-quality-v1",
    code: product.code,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    detailContent: product.detailContent,
    materialType: product.materialType,
    goldWeight: product.goldWeight == null ? null : String(product.goldWeight),
    weight: product.weight == null ? null : String(product.weight),
    salesMode: product.salesMode,
    inventoryPolicy: product.inventoryPolicy,
    primaryImageId: product.primaryImage?.id ?? null,
    listingImageId: product.listingImage?.id ?? null,
    imageIds: (product.images ?? []).map((image: any) => image.id).sort((left: number, right: number) => left - right),
    skus: (product.skus ?? [])
      .filter((sku: any) => sku.isActive)
      .map((sku: any) => ({
        id: sku.id,
        price: String(sku.price),
        goldWeight: sku.goldWeight == null ? null : String(sku.goldWeight),
        inventoryRecords: (sku.inventories ?? []).length,
      })),
  };
  return sha256(snapshot);
}

function assertProductImagePublic(product: any, now: Date) {
  const image = product.primaryImage;
  if (!image || image.productId !== product.id || image.isVideo || !image.mediaAsset) {
    fail(`PRODUCT_${product.code}_PRIMARY_IMAGE_INVALID`);
  }
  const eligibility = evaluateMediaPublicEligibility({
    assetStatus: image.mediaAsset.status,
    accessLevel: image.mediaAsset.accessLevel,
    authorization: image.mediaAsset.authorization,
  }, now);
  if (!eligibility.eligible) fail(`PRODUCT_${product.code}_PRIMARY_IMAGE_NOT_PUBLIC`);
  return image;
}

function projectProduct(product: any, origin: string, siteName: string, now: Date): SnapshotRouteInput {
  if (
    product.deletedAt
    || product.status !== "PUBLISHED"
    || product.publicationQualityStatus !== "READY"
    || product.visibility !== "PUBLIC"
  ) fail("NON_PUBLIC_PRODUCT_SELECTED");
  const code = text(product.code);
  if (!PRODUCT_CODE_PATTERN.test(code) || /^\d+$/.test(code)) fail("PRODUCT_CODE_UNSTABLE");
  if (!product.category || !product.category.isActive || product.category.deletedAt) {
    fail(`PRODUCT_${code}_CATEGORY_NOT_PUBLIC`);
  }
  const currentQualityHash = productQualityHash(product);
  if (product.publicationQualityHash !== currentQualityHash) fail(`PRODUCT_${code}_QUALITY_HASH_DRIFT`);
  const image = assertProductImagePublic(product, now);
  const translations = Array.isArray(product.translations) ? product.translations : [];
  if (translations.some((translation: any) => translation.locale === "EN")) {
    fail(`PRODUCT_${code}_ENGLISH_REVIEW_EVIDENCE_UNAVAILABLE`);
  }
  const title = text(product.name);
  const description = text(product.shortDescription);
  if (!title || !description) fail(`PRODUCT_${code}_SEO_INCOMPLETE`);
  const path = `/products/${code}`;
  const shareImage = new URL(`/api/products/public/${product.id}/media/${image.id}`, origin).href;
  const publicProjection = {
    code,
    name: title,
    shortDescription: description,
    publishedAt: product.publishedAt,
    primaryImageId: image.id,
    publicationQualityHash: currentQualityHash,
  };
  const contentHash = sha256(publicProjection);
  return {
    path,
    canonicalPath: path,
    locale: "zh-CN",
    kind: "product",
    alternateKey: `product:${code.toLowerCase()}`,
    productCode: code,
    published: true,
    indexable: true,
    contentSource: "verified-facts",
    contentHashBefore: contentHash,
    contentHashAfter: contentHash,
    lastModified: isoDate(product.updatedAt ?? product.publishedAt, "PRODUCT_UPDATED_AT_INVALID"),
    siteName,
    title,
    description,
    shareImage,
    renderedBodyHtml: semanticBody(title, description),
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: title,
      description,
      sku: code,
      image: [shareImage],
      url: new URL(path, origin).href,
    },
  };
}

const PAGE_SELECT = {
  id: true,
  pageKey: true,
  localizations: {
    where: { locale: { in: ["ZH_CN", "EN"] } },
    orderBy: { locale: "asc" },
    select: {
      locale: true,
      reviewStatus: true,
      publishedRevisionId: true,
      publishedHash: true,
      publishedAt: true,
      publishedRevision: {
        select: {
          id: true,
          documentId: true,
          version: true,
          puckData: true,
          metadata: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          mediaAssets: {
            orderBy: { id: "asc" },
            select: {
              assetId: true,
              referenceKey: true,
              referencePath: true,
              assetLifecycleRevision: true,
              authorizationRevision: true,
              publicUseEpoch: true,
              asset: {
                select: {
                  id: true,
                  status: true,
                  accessLevel: true,
                  lifecycleRevision: true,
                  authorization: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PageDocumentSelect;

const PRODUCT_SELECT = {
  id: true,
  code: true,
  name: true,
  shortDescription: true,
  description: true,
  detailContent: true,
  materialType: true,
  goldWeight: true,
  weight: true,
  salesMode: true,
  inventoryPolicy: true,
  status: true,
  visibility: true,
  publicationQualityStatus: true,
  publicationQualityHash: true,
  publishedAt: true,
  deletedAt: true,
  updatedAt: true,
  category: { select: { isActive: true, deletedAt: true } },
  primaryImage: {
    select: {
      id: true,
      productId: true,
      isVideo: true,
      mediaAsset: {
        select: { id: true, status: true, accessLevel: true, authorization: true },
      },
    },
  },
  listingImage: { select: { id: true } },
  images: { where: { isVideo: false }, orderBy: { id: "asc" }, select: { id: true } },
  skus: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      isActive: true,
      price: true,
      goldWeight: true,
      inventories: { select: { quantity: true } },
    },
  },
  translations: {
    where: { locale: { in: ["ZH_CN", "EN"] } },
    orderBy: { locale: "asc" },
    select: { locale: true },
  },
} satisfies Prisma.ProductSelect;

async function readProjection(
  database: PublicSeoSnapshotDatabase,
  config: PublicSeoSourceConfig,
  validatePage: PublicSeoPageValidator,
  now: Date,
): Promise<Projection> {
  const settingsRow = await database.siteSetting.findUnique({
    where: { key: "site" },
    select: { value: true, version: true, updatedAt: true },
  });
  const site = requireSettings(settingsRow, config);
  const documents = await database.pageDocument.findMany({
    where: { pageKey: { in: [...PAGE_KEYS] } },
    select: PAGE_SELECT,
  });
  if (documents.length !== PAGE_KEYS.length || new Set(documents.map((document) => document.pageKey)).size !== PAGE_KEYS.length) {
    fail("REQUIRED_PAGE_SET_INCOMPLETE");
  }
  const documentByKey = new Map(documents.map((document) => [document.pageKey, document]));
  const routes: SnapshotRouteInput[] = [];
  for (const pageKey of PAGE_KEYS) {
    const document = documentByKey.get(pageKey);
    const chinese = document.localizations.find((entry: any) => entry.locale === "ZH_CN");
    routes.push(await projectPage(database, document, chinese, "zh-CN", site.origin, text(site.settings.siteName), now));
    const validation = await validatePage(pageKey, chinese.publishedRevision.puckData, chinese.publishedRevision.metadata);
    if (!validation.valid) fail(`PAGE_${pageKey}_zh-CN_CURRENT_VALIDATION_FAILED`);
  }

  const englishRows = documents.flatMap((document) =>
    document.localizations
      .filter((entry: any) => entry.locale === "EN")
      .map((entry: any) => ({ document, entry })),
  );
  const englishEnabled = site.locales.includes("en");
  if (englishEnabled) {
    if (englishRows.length !== ENGLISH_PAGE_KEYS.size || englishRows.some(({ document }) => !ENGLISH_PAGE_KEYS.has(document.pageKey))) {
      fail("ENGLISH_PUBLISHED_PAGE_SET_INCOMPLETE");
    }
    for (const pageKey of PAGE_KEYS.filter((key) => ENGLISH_PAGE_KEYS.has(key))) {
      const document = documentByKey.get(pageKey);
      const english = document.localizations.find((entry: any) => entry.locale === "EN");
      routes.push(await projectPage(database, document, english, "en", site.origin, text(site.settings.siteName), now));
      const validation = await validatePage(pageKey, english.publishedRevision.puckData, english.publishedRevision.metadata);
      if (!validation.valid) fail(`PAGE_${pageKey}_en_CURRENT_VALIDATION_FAILED`);
    }
  } else if (englishRows.length > 0) {
    fail("ENGLISH_CONTENT_EXISTS_BUT_LOCALE_UNPUBLISHED");
  }

  const chineseHome = routes.find((route) => route.path === "/");
  if (!chineseHome) fail("CHINESE_HOME_ROUTE_MISSING");
  routes.push(...projectLegalRoutes(site, config, chineseHome.shareImage));

  const productWhere: Prisma.ProductWhereInput = {
    deletedAt: null,
    status: "PUBLISHED",
    publicationQualityStatus: "READY",
    visibility: "PUBLIC",
    ...(config.releaseProfile === "lead-generation" ? { NOT: { salesMode: "DIRECT_PURCHASE" } } : {}),
  };
  const products = await database.product.findMany({
    where: productWhere,
    orderBy: [{ code: "asc" }, { id: "asc" }],
    select: PRODUCT_SELECT,
  });
  for (const product of products) {
    routes.push(projectProduct(product, site.origin, text(site.settings.siteName), now));
  }
  routes.sort((left, right) => left.path.localeCompare(right.path, "en"));
  const sourceHash = sha256({
    sourceStage: config.sourceStage,
    sourceEnvironmentId: config.sourceEnvironmentId,
    expectedDatabase: config.expectedDatabase,
    databaseHostHash: config.databaseHostHash,
    approvalReferenceHash: config.approvalReferenceHash,
    releaseProfile: config.releaseProfile,
    origin: site.origin,
    settingsVersion: site.version,
    settingsUpdatedAt: site.updatedAt,
    settingsPublicationFacts: {
      siteName: site.settings.siteName,
      publishedLocales: site.locales,
      seoReviewReferenceHash: sha256(site.settings.seoReviewReference),
      legalEntityReviewReferenceHash: sha256(site.settings.legalEntityReviewReference),
      privacyPolicyReviewReferenceHash: sha256(site.settings.privacyPolicyReviewReference),
    },
    selectedDatabaseFactsHash: sha256({ settingsRow, documents, products }),
    routes,
  });
  return { sourceHash, routes };
}

export async function createPublicSeoExportInput(
  database: PublicSeoSnapshotDatabase,
  config: PublicSeoSourceConfig,
  validatePage: PublicSeoPageValidator,
  now = new Date(),
) {
  if (config.sourceStage !== "preproduction" && config.sourceStage !== "production") {
    fail("SOURCE_STAGE_INVALID");
  }
  if (config.sourceEnvironmentId !== `public-seo-${config.sourceStage}`) {
    fail("SOURCE_STAGE_ENVIRONMENT_MISMATCH");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(config.sourceEnvironmentId)) {
    fail("SOURCE_ENVIRONMENT_ID_INVALID");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_$-]{0,63}$/.test(config.expectedDatabase)) {
    fail("EXPECTED_DATABASE_INVALID");
  }
  if (!SHA256_PATTERN.test(config.approvalReferenceHash)) {
    fail("APPROVAL_REFERENCE_HASH_INVALID");
  }
  if (!SHA256_PATTERN.test(config.databaseHostHash)) fail("DATABASE_HOST_HASH_INVALID");
  if (
    !SHA256_PATTERN.test(config.legalSourceHashes?.privacy)
    || !SHA256_PATTERN.test(config.legalSourceHashes?.businessInfo)
  ) fail("LEGAL_SOURCE_HASH_INVALID");
  if (!text(config.legalEntityName) || config.legalEntityName.length > 200) {
    fail("LEGAL_ENTITY_NAME_INVALID");
  }
  if (config.releaseProfile !== "lead-generation" && config.releaseProfile !== "commerce") {
    fail("RELEASE_PROFILE_INVALID");
  }
  const before = await readProjection(database, config, validatePage, now);
  const after = await readProjection(database, config, validatePage, now);
  if (before.sourceHash !== after.sourceHash) fail("SOURCE_FACTS_DRIFT");
  if (before.routes.length !== after.routes.length) fail("SOURCE_ROUTE_SET_DRIFT");
  const afterByPath = new Map(after.routes.map((route) => [route.path, route]));
  const routes = before.routes.map((route) => {
    const second = afterByPath.get(route.path);
    if (!second || second.contentHashBefore !== route.contentHashBefore) fail("SOURCE_ROUTE_HASH_DRIFT");
    return { ...route, contentHashAfter: second.contentHashBefore };
  });
  return {
    schemaVersion: 1,
    sourceStage: config.sourceStage,
    origin: normalizeOrigin(config.expectedOrigin),
    sourceSnapshotHashBefore: before.sourceHash,
    sourceSnapshotHashAfter: after.sourceHash,
    routes,
  };
}
