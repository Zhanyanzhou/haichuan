import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CreateProductDto,
  AdminProductQueryDto,
  PublicProductQueryDto,
  ResolveProductReferencesDto,
  UpdateProductDto,
  AddProductImageDto,
} from "./dto";
import {
  InventoryPolicy,
  MaterialType,
  Prisma,
  ProductStatus,
  ProductVisibility,
  SalesMode,
} from "@prisma/client";
import { EventEmitter } from "events";
import { fromEvent, map, Observable, startWith } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import { ProductMediaService } from "./product-media.service";
import { ProductAccessService } from "./product-access.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import { createHash } from "node:crypto";

const PRODUCT_QUALITY_GATE_VERSION = "p0-product-quality-v1";
const FORBIDDEN_PUBLIC_CONTENT =
  /(?:\be2e\b|\btest\b|\bmock\b|\bseed\b|\bdemo\b|测试|样例|示例|演示|占位|待替换)/i;
const MOJIBAKE_OR_REPLACEMENT = /[\u00c0-\u00ff]|\uFFFD/;

function hasRepeatedPlaceholderText(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  return /(.)\1{3,}/u.test(compact) || /(.{2,4})\1{2,}/u.test(compact);
}

function isMeaningfulPublicText(value: unknown, minimumLength: number): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < minimumLength) return false;
  if (FORBIDDEN_PUBLIC_CONTENT.test(text) || MOJIBAKE_OR_REPLACEMENT.test(text)) return false;
  if (/^[\d\s\p{P}\p{S}]+$/u.test(text)) return false;
  return !hasRepeatedPlaceholderText(text);
}

function hasMeaningfulDetailContent(value: unknown): boolean {
  if (value == null) return false;
  const serialized = JSON.stringify(value);
  if (!serialized || serialized === "{}" || serialized === "[]") return false;
  return !FORBIDDEN_PUBLIC_CONTENT.test(serialized) && !MOJIBAKE_OR_REPLACEMENT.test(serialized);
}

function publicationQualityHash(product: any): string {
  const snapshot = {
    version: PRODUCT_QUALITY_GATE_VERSION,
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
    imageIds: (product.images || []).map((image: any) => image.id).sort((a: number, b: number) => a - b),
    skus: (product.skus || []).map((sku: any) => ({
      id: sku.id,
      price: String(sku.price),
      goldWeight: sku.goldWeight == null ? null : String(sku.goldWeight),
      inventoryRecords: sku.inventories?.length ?? 0,
    })),
  };
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

const CUSTOMER_FACING_IMAGE_SELECT = {
  id: true,
  url: true,
  storageKey: true,
  type: true,
  sortOrder: true,
  isVideo: true,
  width: true,
  height: true,
} satisfies Prisma.ProductImageSelect;

const CUSTOMER_FACING_LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  categoryId: true,
  shortDescription: true,
  materialType: true,
  goldWeight: true,
  price: true,
  weight: true,
  size: true,
  craftTechnique: true,
  salesMode: true,
  inventoryPolicy: true,
  isHot: true,
  isNew: true,
  isRecommended: true,
  isLimited: true,
  isCustom: true,
  category: { select: { id: true, name: true } },
  productAttributes: {
    select: {
      attributeValue: {
        select: {
          id: true,
          value: true,
          attribute: { select: { id: true, key: true, name: true } },
        },
      },
    },
  },
  images: {
    orderBy: { sortOrder: "asc" },
    take: 5,
    select: CUSTOMER_FACING_IMAGE_SELECT,
  },
  skus: {
    where: { isActive: true },
    select: {
      inventories: { select: { quantity: true } },
    },
  },
  primaryImage: { select: CUSTOMER_FACING_IMAGE_SELECT },
  listingImage: { select: CUSTOMER_FACING_IMAGE_SELECT },
} satisfies Prisma.ProductSelect;

const CUSTOMER_FACING_DETAIL_SELECT = {
  ...CUSTOMER_FACING_LIST_SELECT,
  description: true,
  detailContent: true,
  fulfillmentType: true,
  dispatchTime: true,
  deliveryMethods: true,
  requiresInsuredShipping: true,
  requiresSignature: true,
  includesCertificate: true,
  packageType: true,
  customLeadTime: true,
  gemInfo: true,
  craftTechnique: true,
  images: {
    orderBy: { sortOrder: "asc" },
    select: CUSTOMER_FACING_IMAGE_SELECT,
  },
  skus: {
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      material: true,
      size: true,
      goldWeight: true,
      price: true,
      isActive: true,
      inventories: { select: { quantity: true } },
    },
  },
} satisfies Prisma.ProductSelect;

const PUBLICATION_QUALITY_SELECT = {
  id: true,
  code: true,
  name: true,
  shortDescription: true,
  description: true,
  detailContent: true,
  materialType: true,
  goldWeight: true,
  weight: true,
  status: true,
  visibility: true,
  publicationQualityStatus: true,
  publicationQualityHash: true,
  category: { select: { isActive: true, deletedAt: true } },
  salesMode: true,
  inventoryPolicy: true,
  price: true,
  deliveryMethods: true,
  shippingTemplate: { select: { isActive: true } },
  primaryImage: {
    select: { id: true, url: true, storageKey: true, isVideo: true, mimeType: true },
  },
  listingImage: {
    select: { id: true, url: true, storageKey: true, isVideo: true, mimeType: true },
  },
  images: {
    where: { isVideo: false },
    select: {
      id: true,
      url: true,
      storageKey: true,
      isVideo: true,
      mimeType: true,
    },
  },
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
} satisfies Prisma.ProductSelect;

type PublicationQualitySnapshot = Prisma.ProductGetPayload<{
  select: typeof PUBLICATION_QUALITY_SELECT;
}>;

const CUSTOMER_MATERIAL_TYPES = new Set([
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
]);

const CUSTOMER_SALES_MODES = new Set([
  "DISPLAY_ONLY",
  "SELECTION",
  "APPOINTMENT",
  "DIRECT_PURCHASE",
  "CUSTOM_INQUIRY",
]);

const CUSTOMER_MATERIAL_LABELS: Record<string, string> = {
  GOLD_999: "足金999",
  GOLD_9999: "足金9999",
  AU750: "18K金",
  PT950: "铂金950",
  S925: "银925",
  DIAMOND: "镶钻",
  JADE: "玉石",
  PEARL: "珍珠",
  COLOR_GEM: "彩宝",
  OTHER: "其他",
};

function csvValues(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(
    new Set(value.split(",").map((item) => item.trim()).filter(Boolean)),
  );
}

function csvPositiveIds(value: string | undefined): number[] {
  return csvValues(value)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

function weightRanges(
  value: string | undefined,
): Array<{ min: number; max?: number }> {
  const parsed: Array<{ min: number; max?: number }> = [];
  for (const range of csvValues(value)) {
    const [minRaw, maxRaw] = range.split(":");
    const min = Number(minRaw);
    const max = maxRaw ? Number(maxRaw) : undefined;
    if (!Number.isFinite(min) || min < 0) continue;
    if (max !== undefined && (!Number.isFinite(max) || max <= min)) continue;
    parsed.push(max === undefined ? { min } : { min, max });
  }
  return parsed;
}

/** 从 DTO 提取 Prisma create 数据，过滤关系字段和系统字段 */
function mapCreateDto(dto: CreateProductDto): Prisma.ProductCreateInput {
  const {
    code,
    name,
    categoryId,
    shortDescription,
    description,
    materialType,
    goldWeight,
    craftFee,
    weight,
    size,
    gemInfo,
    craftTechnique,
    detailContent,
    status,
    visibility,
    salesMode,
    inventoryPolicy,
    purchaseRegion,
    publishMode,
    scheduledPublishAt,
    fulfillmentType,
    dispatchTime,
    shippingTemplateId,
    deliveryMethods,
    requiresInsuredShipping,
    requiresSignature,
    includesCertificate,
    packageType,
    customLeadTime,
    sortOrder,
    isHot,
    isNew,
    isRecommended,
    isLimited,
    isCustom,
    multiDiscount,
  } = dto;

  return {
    code,
    name,
    category: { connect: { id: categoryId } },
    shortDescription: shortDescription ?? null,
    description: description ?? null,
    materialType: materialType ?? "GOLD_999",
    goldWeight: goldWeight ?? 0,
    craftFee: craftFee ?? 0,
    // Product.price 是 SKU 派生缓存；创建事务会在 SKU 落库后统一重算。
    price: 0,
    weight: weight ?? 0,
    size: size ?? null,
    gemInfo: gemInfo ?? undefined,
    craftTechnique: craftTechnique ?? undefined,
    detailContent: (detailContent ?? undefined) as any,
    status: status ?? "DRAFT",
    visibility: visibility ?? "MEMBER",
    salesMode: salesMode ?? "DISPLAY_ONLY",
    inventoryPolicy: inventoryPolicy ?? "STANDARD",
    purchaseRegion: purchaseRegion ?? "MAINLAND",
    publishMode: publishMode ?? "WAREHOUSE",
    scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt) : null,
    fulfillmentType: fulfillmentType ?? "IN_STOCK",
    dispatchTime: dispatchTime ?? "WITHIN_48_HOURS",
    shippingTemplate: shippingTemplateId ? { connect: { id: shippingTemplateId } } : undefined,
    deliveryMethods: deliveryMethods ?? ["EXPRESS"],
    requiresInsuredShipping: requiresInsuredShipping ?? true,
    requiresSignature: requiresSignature ?? true,
    includesCertificate: includesCertificate ?? true,
    packageType: packageType ?? null,
    customLeadTime: customLeadTime ?? null,
    sortOrder: sortOrder ?? 0,
    isHot: isHot ?? false,
    isNew: isNew ?? false,
    isRecommended: isRecommended ?? false,
    isLimited: isLimited ?? false,
    isCustom: isCustom ?? false,
    multiDiscount: multiDiscount ?? false,
    viewCount: 0,
    salesCount: 0,
  };
}

/** 从 DTO 提取 Prisma update 数据，仅包含前端传入的字段 */
function mapUpdateDto(dto: UpdateProductDto): Prisma.ProductUpdateInput {
  const data: Prisma.ProductUpdateInput = {
    // 任意业务内容编辑先退出正式发布质量态；已发布商品会在同一事务末尾重新校验。
    publicationQualityStatus: "QUARANTINED",
    publicationQualityHash: null,
    publicationQualityCheckedAt: null,
  };

  if (dto.name !== undefined) data.name = dto.name;
  if (dto.categoryId !== undefined) {
    data.category = { connect: { id: dto.categoryId } };
  }
  if (dto.shortDescription !== undefined)
    data.shortDescription = dto.shortDescription;
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.materialType !== undefined) data.materialType = dto.materialType;
  if (dto.goldWeight !== undefined) data.goldWeight = dto.goldWeight;
  if (dto.craftFee !== undefined) data.craftFee = dto.craftFee;
  if (dto.weight !== undefined) data.weight = dto.weight;
  if (dto.size !== undefined) data.size = dto.size;
  if (dto.gemInfo !== undefined) data.gemInfo = dto.gemInfo;
  if (dto.craftTechnique !== undefined)
    data.craftTechnique = dto.craftTechnique;
  if (dto.detailContent !== undefined) data.detailContent = dto.detailContent as any;
  if (dto.visibility !== undefined) data.visibility = dto.visibility;
  if (dto.salesMode !== undefined) data.salesMode = dto.salesMode;
  if (dto.inventoryPolicy !== undefined)
    data.inventoryPolicy = dto.inventoryPolicy;
  if (dto.purchaseRegion !== undefined) data.purchaseRegion = dto.purchaseRegion;
  if (dto.publishMode !== undefined) data.publishMode = dto.publishMode;
  if (dto.scheduledPublishAt !== undefined)
    data.scheduledPublishAt = dto.scheduledPublishAt ? new Date(dto.scheduledPublishAt) : null;
  if (dto.fulfillmentType !== undefined) data.fulfillmentType = dto.fulfillmentType;
  if (dto.dispatchTime !== undefined) data.dispatchTime = dto.dispatchTime;
  if (dto.shippingTemplateId !== undefined) {
    data.shippingTemplate = dto.shippingTemplateId
      ? { connect: { id: dto.shippingTemplateId } }
      : { disconnect: true };
  }
  if (dto.deliveryMethods !== undefined) data.deliveryMethods = dto.deliveryMethods;
  if (dto.requiresInsuredShipping !== undefined)
    data.requiresInsuredShipping = dto.requiresInsuredShipping;
  if (dto.requiresSignature !== undefined) data.requiresSignature = dto.requiresSignature;
  if (dto.includesCertificate !== undefined)
    data.includesCertificate = dto.includesCertificate;
  if (dto.packageType !== undefined) data.packageType = dto.packageType;
  if (dto.customLeadTime !== undefined) data.customLeadTime = dto.customLeadTime;
  if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
  if (dto.isHot !== undefined) data.isHot = dto.isHot;
  if (dto.isNew !== undefined) data.isNew = dto.isNew;
  if (dto.isRecommended !== undefined) data.isRecommended = dto.isRecommended;
  if (dto.isLimited !== undefined) data.isLimited = dto.isLimited;
  if (dto.isCustom !== undefined) data.isCustom = dto.isCustom;
  if (dto.multiDiscount !== undefined) data.multiDiscount = dto.multiDiscount;
  // publishedAt 不对前端开放（P1-24）：仅由 /status 端点发布时内部注入，DTO 不再透传，避免伪造/清空上架时间

  return data;
}

@Injectable()
export class ProductsService {
  private readonly publicEvents = new EventEmitter();

  constructor(
    private prisma: PrismaService,
    private productMedia: ProductMediaService,
    private productAccess: ProductAccessService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledProducts() {
    const due = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        publishMode: "SCHEDULED",
        status: { in: ["DRAFT", "OFFLINE"] },
        scheduledPublishAt: { lte: new Date() },
      },
      select: { id: true },
      take: 50,
    });
    for (const item of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.lockProductForTradeMutation(item.id, tx);
          await this.syncProductStartingPrice(item.id, tx);
          await this.assertInventoryPolicy(item.id, tx);
          await this.canPublish(item.id, tx);
          await tx.product.update({
            where: { id: item.id },
            data: {
              status: "PUBLISHED",
              publishedAt: new Date(),
              publishMode: "IMMEDIATE",
              scheduledPublishAt: null,
              scheduledPublishError: null,
            },
          });
        });
        this.notifyPublicChange(item.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "定时上架校验失败";
        await this.prisma.product.update({
          where: { id: item.id },
          data: {
            publishMode: "WAREHOUSE",
            scheduledPublishAt: null,
            scheduledPublishError: message.slice(0, 500),
          },
        });
      }
    }
  }

  async findAll(params: AdminProductQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      categoryId,
      status,
      keyword,
      materialType,
      salesMode,
      isHot,
      isRecommended,
      sortBy,
      ids,
      codes,
      visibility,
    } = params;
    const where: any = { deletedAt: null };
    if (ids) {
      const idList = String(ids)
        .split(",")
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);
      if (idList.length > 0) where.id = { in: idList };
    }
    if (codes) {
      const codeList = String(codes)
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean)
        .slice(0, 50);
      if (codeList.length > 0) where.code = { in: codeList };
    }
    if (categoryId) where.categoryId = +categoryId;
    // 后台默认工作列表不包含回收站；回收站通过显式 ARCHIVED 状态单独查询。
    // 这里在服务端收敛口径，避免前端对单页数组过滤导致 total/分页与列表不一致。
    where.status = status || { not: "ARCHIVED" };
    if (materialType) where.materialType = materialType;
    if (salesMode) where.salesMode = salesMode;
    if (isHot !== undefined) where.isHot = isHot === "true";
    if (isRecommended !== undefined)
      where.isRecommended = isRecommended === "true";
    // 受控目录可见范围过滤（catalog 传入数组；admin 列表不传则显示全部）
    if (visibility) {
      where.visibility = {
        in: Array.isArray(visibility) ? visibility : [visibility],
      };
    }
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }

    const _page = +page,
      _pageSize = +pageSize;
    const orderBy: any =
      sortBy === "sortOrder"
        ? { sortOrder: "asc" }
        : sortBy === "code_asc"
          ? { code: "asc" }
          : { updatedAt: "desc" };

    try {
      const [list, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip: (_page - 1) * _pageSize,
          take: _pageSize,
          orderBy,
          select: {
            id: true,
            code: true,
            name: true,
            categoryId: true,
            shortDescription: true,
            materialType: true,
            goldWeight: true,
            craftFee: true,
            price: true,
            weight: true,
            size: true,
            status: true,
            salesMode: true,
            inventoryPolicy: true,
            sortOrder: true,
            isHot: true,
            isNew: true,
            isRecommended: true,
            isLimited: true,
            isCustom: true,
            multiDiscount: true,
            visibility: true,
            detailContent: true,
            fulfillmentType: true,
            deliveryMethods: true,
            viewCount: true,
            salesCount: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
            category: { select: { id: true, name: true } },
            images: { orderBy: { sortOrder: "asc" }, take: 5 },
            primaryImage: true,
            listingImage: true,
            skus: {
              where: { isActive: true },
              select: { id: true, price: true, inventories: { select: { quantity: true } } },
            },
          },
        }),
        this.prisma.product.count({ where }),
      ]);

      const enrichedList = list.map((p: any) => ({
        ...p,
        // 后台媒体也统一走受控媒体端点（迁移后旧 /uploads 文件删除，url 不再可用）
        images: (p.images || []).map((img: any) => ({
          ...img,
          mediaUrl: `/products/catalog/${p.id}/media/${img.id}`,
        })),
        completeness: this.calcCompleteness(p),
        hasPrimaryImage: p.images?.length > 0,
        imageCount: p.images?.length ?? 0,
        totalStock:
          p.skus?.reduce(
            (sum: number, sku: any) =>
              sum +
              (sku.inventories?.reduce(
                (s: number, inv: any) => s + (inv.quantity || 0),
                0,
              ) ?? 0),
            0,
          ) ?? 0,
      }));

      return { list: enrichedList, total, page: _page, pageSize: _pageSize };
    } catch (error: any) {
      // 记录完整查询上下文，便于定位 Prisma 校验异常
      console.error("[findAll] Prisma 查询失败", {
        message: error?.message,
        where: JSON.stringify(where),
        skip: (_page - 1) * _pageSize,
        take: _pageSize,
        orderBy: JSON.stringify(orderBy),
      });
      throw error;
    }
  }

  async resolveReferences(input: ResolveProductReferencesDto) {
    const codes = (input.codes ?? []).map((code) => code.trim()).filter(Boolean);
    const legacyIds = (input.legacyIds ?? []).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    if (codes.length === 0 && legacyIds.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: {
        OR: [
          ...(codes.length ? [{ code: { in: [...new Set(codes)] } }] : []),
          ...(legacyIds.length ? [{ id: { in: [...new Set(legacyIds)] } }] : []),
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        status: true,
        publicationQualityStatus: true,
        visibility: true,
        deletedAt: true,
        category: { select: { id: true, name: true } },
        listingImage: { select: CUSTOMER_FACING_IMAGE_SELECT },
        primaryImage: { select: CUSTOMER_FACING_IMAGE_SELECT },
        images: {
          orderBy: { sortOrder: "asc" },
          take: 5,
          select: CUSTOMER_FACING_IMAGE_SELECT,
        },
      },
    });
    const byCode = new Map(products.map((product) => [product.code, product]));
    const byId = new Map(products.map((product) => [product.id, product]));

    const mapReference = (
      product: (typeof products)[number] | undefined,
      reference: { code?: string; legacyId?: number },
    ) => {
      if (!product) {
        return {
          ...reference,
          eligible: false,
          reason: "NOT_FOUND" as const,
        };
      }
      const imageId = [
        product.listingImage,
        product.primaryImage,
        ...product.images,
      ].find((image) =>
        image ? this.productMedia.isProductMediaReadable(image) : false,
      )?.id;
      const reason = product.deletedAt
        ? "DELETED"
        : product.status === "OFFLINE"
          ? "OFFLINE"
          : product.status === "DRAFT"
            ? "DRAFT"
            : product.status === "ARCHIVED"
              ? "ARCHIVED"
              : product.visibility !== "PUBLIC"
                ? "NON_PUBLIC"
                : !imageId
                  ? "MISSING_IMAGE"
                  : "AVAILABLE";
      return {
        ...reference,
        id: product.id,
        code: product.code,
        name: product.name,
        price: product.price,
        status: product.status,
        publicationQualityStatus: product.publicationQualityStatus,
        visibility: product.visibility,
        category: product.category,
        thumbnail: imageId
          ? `/products/catalog/${product.id}/media/${imageId}?width=480`
          : "",
        eligible: reason === "AVAILABLE",
        reason,
      };
    };

    return [
      ...codes.map((code) => mapReference(byCode.get(code), { code })),
      ...legacyIds.map((legacyId) =>
        mapReference(byId.get(legacyId), { legacyId }),
      ),
    ];
  }

  /** 游客公开列表：只返回 PUBLIC + PUBLISHED，并使用独立字段白名单。 */
  async findPublic(params: PublicProductQueryDto = {}) {
    return this.findCustomerFacingList(params, ["PUBLIC"], "public");
  }

  /**
   * 解析当前客户可见的商品可见范围。
   * 合作权限仅在 accountType=PARTNER 且 partnerStatus=APPROVED 时生效；
   * SUSPENDED / REJECTED / NEEDS_SUPPLEMENT / PENDING / NONE 一律降级为 MEMBER 可见范围，
   * 因此审核暂停即便旧 JWT 未过期，也会在下一次请求立即生效。
   */
  resolveVisibleVisibilities(customer: any): ProductVisibility[] {
    const isPartner =
      customer?.accountType === "PARTNER" &&
      customer?.partnerStatus === "APPROVED";
    return isPartner ? ["PUBLIC", "MEMBER", "PARTNER"] : ["PUBLIC", "MEMBER"];
  }

  /** 会员目录：按客户可见范围过滤，并使用与游客一致的安全字段白名单。 */
  async findCatalog(params: PublicProductQueryDto, customer: any) {
    const visibilities = this.resolveVisibleVisibilities(customer);
    return this.findCustomerFacingList(params, visibilities, "catalog");
  }

  /**
   * 前台列表查询。这里不复用后台 findAll，防止后台新增字段后被对象展开意外带到前台。
   */
  private async findCustomerFacingList(
    params: PublicProductQueryDto,
    visibilities: ProductVisibility[],
    mediaScope: "public" | "catalog",
  ) {
    const page = this.toBoundedPositiveInt(params.page, 1, 1_000_000);
    const pageSize = this.toBoundedPositiveInt(params.pageSize, 20, 2_000);
    const baseWhere: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: "PUBLISHED",
      visibility: { in: visibilities },
    };
    const where: Prisma.ProductWhereInput = { ...baseWhere };
    const andFilters: Prisma.ProductWhereInput[] = [];

    if (params.ids !== undefined) {
      const idList = csvPositiveIds(params.ids);
      where.id = { in: idList };
    }
    if (typeof params.codes === "string") {
      const codes = params.codes
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean)
        .slice(0, 50);
      where.code = { in: codes };
    }

    const categoryIds = csvPositiveIds(params.categoryIds);
    if (categoryIds.length > 0) {
      where.categoryId = { in: categoryIds };
    } else if (params.categoryId) {
      where.categoryId = params.categoryId;
    }

    if (params.exactCode) where.code = params.exactCode.trim();

    const keyword =
      typeof params.keyword === "string"
        ? params.keyword.trim().slice(0, 100)
        : "";
    if (keyword) {
      const keywordMaterialTypes = Object.entries(CUSTOMER_MATERIAL_LABELS)
        .filter(([, label]) => label.toLowerCase().includes(keyword.toLowerCase()))
        .map(([type]) => type);
      const keywordFilters: Prisma.ProductWhereInput[] = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
        { category: { name: { contains: keyword } } },
      ];
      if (keywordMaterialTypes.length > 0) {
        keywordFilters.push({
          materialType: { in: keywordMaterialTypes as MaterialType[] },
        });
      }
      andFilters.push({ OR: keywordFilters });
    }

    const materialTypes = csvValues(params.materialTypes).filter((type) =>
      CUSTOMER_MATERIAL_TYPES.has(type),
    );
    if (materialTypes.length > 0) {
      where.materialType = { in: materialTypes as MaterialType[] };
    } else if (params.materialType && CUSTOMER_MATERIAL_TYPES.has(params.materialType)) {
      where.materialType = params.materialType as MaterialType;
    }
    if (
      typeof params.salesMode === "string" &&
      CUSTOMER_SALES_MODES.has(params.salesMode)
    ) {
      where.salesMode = params.salesMode as SalesMode;
    }
    if (params.isHot === "true" || params.isHot === "false")
      where.isHot = params.isHot === "true";
    if (params.isRecommended === "true" || params.isRecommended === "false") {
      where.isRecommended = params.isRecommended === "true";
    }
    // 按属性值筛选（前台属性字典多选，逗号分隔 attributeValueId）
    if (typeof params.attributeValueIds === "string") {
      const attrIds = csvPositiveIds(params.attributeValueIds);
      if (attrIds.length) {
        where.productAttributes = {
          some: { attributeValueId: { in: attrIds } },
        };
      }
    }

    const crafts = csvValues(params.craftTechniques);
    if (crafts.length > 0) {
      andFilters.push({
        OR: crafts.flatMap((craft) => [
          { craftTechnique: { array_contains: craft } },
          { craftTechnique: { string_contains: craft } },
        ]),
      });
    }

    const sizes = csvValues(params.sizes);
    if (sizes.length > 0) where.size = { in: sizes };

    const ranges = weightRanges(params.weightRanges);
    if (ranges.length > 0) {
      andFilters.push({
        OR: ranges.map(({ min, max }) => {
          const numericRange: Prisma.DecimalNullableFilter = {
            gte: min,
            ...(max === undefined ? {} : { lt: max }),
          };
          return {
            OR: [
              {
                goldWeight: {
                  ...numericRange,
                  gt: 0,
                },
              },
              {
                AND: [
                  { OR: [{ goldWeight: null }, { goldWeight: { lte: 0 } }] },
                  { weight: numericRange },
                ],
              },
            ],
          };
        }),
      });
    }

    // 价格区间过滤（元，含边界；非法输入静默忽略）。基准为 Product.price（min 活跃 SKU 价）
    const priceFilter: { gte?: number; lte?: number } = {};
    const minPrice = Number(params.minPrice);
    if (Number.isFinite(minPrice) && minPrice >= 0) priceFilter.gte = minPrice;
    const maxPrice = Number(params.maxPrice);
    if (Number.isFinite(maxPrice) && maxPrice > 0) priceFilter.lte = maxPrice;
    if (priceFilter.gte !== undefined || priceFilter.lte !== undefined) {
      where.price = priceFilter;
    }

    if (andFilters.length > 0) where.AND = andFilters;

    // 排序：运营序 / 价格 / 最近更新 / 货号；追加稳定次序，避免翻页间抖动。
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      params.sortBy === "sortOrder"
        ? [{ sortOrder: "asc" }, { updatedAt: "desc" }, { id: "desc" }]
        : params.sortBy === "price_asc"
          ? [{ price: "asc" }, { id: "desc" }]
          : params.sortBy === "price_desc"
            ? [{ price: "desc" }, { id: "desc" }]
            : params.sortBy === "code_asc"
              ? [{ code: "asc" }, { id: "asc" }]
              : [{ updatedAt: "desc" }, { id: "desc" }];

    const facetWhere: Prisma.ProductWhereInput = { ...baseWhere };
    if (categoryIds.length > 0) {
      facetWhere.categoryId = { in: categoryIds };
    } else if (params.categoryId) {
      facetWhere.categoryId = params.categoryId;
    }

    const facetsPromise =
      params.includeFacets === "true"
        ? this.prisma.product.findMany({
            where: facetWhere,
            distinct: ["size"],
            select: { size: true },
            orderBy: { size: "asc" },
          })
        : Promise.resolve([] as Array<{ size: string | null }>);
    const [list, total, facetRows] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        select: CUSTOMER_FACING_LIST_SELECT,
      }),
      this.prisma.product.count({ where }),
      facetsPromise,
    ]);

    return {
      list: list.map((product) =>
        this.toCustomerFacingProduct(product, mediaScope),
      ),
      total,
      page,
      pageSize,
      facets: {
        sizes: facetRows.map((row) => row.size).filter(Boolean),
      },
    };
  }

  private toBoundedPositiveInt(
    value: unknown,
    fallback: number,
    maximum: number,
  ): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, maximum);
  }

  /**
   * 前台商品序列化器。显式逐字段组装，禁止 storageKey、库存、统计和运营字段进入响应。
   */
  private toCustomerFacingProduct(
    product: any,
    mediaScope: "public" | "catalog",
  ): Record<string, unknown> {
    const productId = product.id;
    const mapImage = (img: any) => {
      if (!img || !this.productMedia.isProductMediaReadable(img)) return null;
      return {
        id: img.id,
        type: img.type,
        sortOrder: img.sortOrder,
        isVideo: img.isVideo,
        width: img.width ?? null,
        height: img.height ?? null,
        mediaUrl: `/products/${mediaScope}/${productId}/media/${img.id}`,
      };
    };
    const mapImageList = (imgs: any[]) =>
      (imgs || []).map(mapImage).filter((x) => x !== null);

    const canShowPrice = product.salesMode === "DIRECT_PURCHASE";
    const availableStock = (product.skus || []).reduce(
      (total: number, sku: any) =>
        total +
        (sku.inventories || []).reduce(
          (skuTotal: number, inventory: any) =>
            skuTotal + Math.max(0, Number(inventory.quantity) || 0),
          0,
        ),
      0,
    );
    const response: Record<string, unknown> = {
      id: product.id,
      code: product.code,
      name: product.name,
      categoryId: product.categoryId,
      shortDescription: product.shortDescription,
      materialType: product.materialType,
      goldWeight: product.goldWeight,
      price: canShowPrice && Number(product.price) > 0 ? product.price : null,
      weight: product.weight,
      size: product.size,
      craftTechnique: product.craftTechnique,
      salesMode: product.salesMode,
      inventoryPolicy: product.inventoryPolicy,
      isAvailableForPurchase: canShowPrice && availableStock > 0,
      isHot: product.isHot,
      isNew: product.isNew,
      isRecommended: product.isRecommended,
      isLimited: product.isLimited,
      isCustom: product.isCustom,
      category: product.category,
      attributes: (product.productAttributes || [])
        .map((pa: any) => pa.attributeValue)
        .filter((v: any) => v?.id)
        .map((v: any) => ({
          id: v.id,
          value: v.value,
          attributeKey: v.attribute?.key,
          attributeName: v.attribute?.name,
        })),
      images: mapImageList(product.images),
      primaryImage: product.primaryImage
        ? mapImage(product.primaryImage)
        : null,
      listingImage: product.listingImage
        ? mapImage(product.listingImage)
        : null,
    };

    if (Object.prototype.hasOwnProperty.call(product, "description")) {
      response.description = product.description;
      response.detailContent = product.detailContent;
      response.gemInfo = product.gemInfo;
      response.craftTechnique = product.craftTechnique;
      response.fulfillmentType = product.fulfillmentType;
      response.dispatchTime = product.dispatchTime;
      response.deliveryMethods = product.deliveryMethods;
      response.requiresInsuredShipping = product.requiresInsuredShipping;
      response.requiresSignature = product.requiresSignature;
      response.includesCertificate = product.includesCertificate;
      response.packageType = product.packageType;
      response.customLeadTime = product.customLeadTime;
      response.skus = (product.skus || []).map((sku: any) => ({
        id: sku.id,
        material: sku.material,
        size: sku.size,
        goldWeight: sku.goldWeight,
        price: canShowPrice && Number(sku.price) > 0 ? sku.price : null,
        isActive: sku.isActive,
      }));
    }

    return response;
  }

  /** 公开媒体：必须同时满足商品、图片归属以及 PUBLIC + PUBLISHED 条件。 */
  /** 动态缩放宽白名单：列表 480 / 卡片 800 / 详情 1200（防任意参数滥用与超清抓取） */
  private static readonly RESIZE_WIDTHS = new Set([480, 800, 1200]);

  /**
   * 按宽白名单生成 WebP 缩放版（动态 resize，旧图零回填即刻受益）。
   * withoutEnlargement：小图不放大；失败时回退原图，绝不因 resize 挂掉媒体服务。
   */
  private async resizeMediaBuffer(
    buffer: Buffer,
    width: string | number,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const allowed = ProductsService.RESIZE_WIDTHS.has(Number(width));
    if (!allowed) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require("sharp");
      const out = await sharp(buffer)
        .rotate()
        .resize({ width: Number(width), withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      // 缩放产物明显更小才使用（极端小图可能反而更大）
      return out.length < buffer.length
        ? { buffer: out, mimeType: "image/webp" }
        : null;
    } catch {
      return null;
    }
  }

  async servePublicMedia(
    productId: number,
    imageId: number,
    response: any,
    width?: string,
  ): Promise<void> {
    if (
      !Number.isInteger(productId) ||
      productId <= 0 ||
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      throw new NotFoundException("媒体不存在");
    }
    const image = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId,
        product: {
          deletedAt: null,
          status: "PUBLISHED",
          visibility: "PUBLIC",
        },
      },
    });
    if (!image) throw new NotFoundException("媒体不存在");

    const { buffer, mimeType } = this.productMedia.readProductImage(image);
    const resized = await this.resizeMediaBuffer(buffer, width || "");
    response.setHeader("Content-Type", resized?.mimeType ?? mimeType);
    // 宽度在 URL query 上，不同宽度的变体按完整 URL 独立缓存
    response.setHeader(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=86400",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(resized?.buffer ?? buffer);
  }

  /**
   * 受控媒体读取：客户/员工鉴权后按可见范围校验，PARTNER 商品对客户叠加水印。
   * 安全要点：productId+imageId 联合校验（禁止跨商品）；不可见统一 404 不泄露存在性；
   * 响应头 private/no-store + nosniff；customerId 从令牌派生，不接受客户端提交。
   */
  async serveCatalogMedia(
    productId: number,
    imageId: number,
    request: any,
    response: any,
    width?: string,
  ): Promise<void> {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
      include: {
        product: {
          select: { id: true, status: true, visibility: true, deletedAt: true },
        },
      },
    });
    if (!image || !image.product) {
      throw new NotFoundException("媒体不存在");
    }
    const product = image.product;

    let needsWatermark = false;
    if (request.authKind !== "staff") {
      const visibilities = this.resolveVisibleVisibilities(request.customer);
      if (
        product.deletedAt ||
        product.status !== "PUBLISHED" ||
        !visibilities.includes(product.visibility)
      ) {
        // 不可见：统一 404，不泄露商品存在性
        throw new NotFoundException("媒体不存在");
      }
      // 所有登录客户（非员工）访问受控媒体一律加水印，防止款式资料外泄
      needsWatermark = true;
      // 记录媒体浏览审计（customerId 从令牌派生，不接受客户端提交）
      await this.productAccess.recordEvent(
        request.customer.id,
        productId,
        "MEDIA_VIEW",
        "product_detail",
      );
    }

    // 读取字节（优先私有 storageKey，回退旧公开路径）
    const { buffer, mimeType, isVideo } =
      this.productMedia.readProductImage(image);

    let outBuffer: Buffer = buffer;
    let outMime = mimeType;
    if (needsWatermark && !isVideo) {
      const label = this.productMedia.maskPhone(request.customer.phone);
      const watermarked = await this.productMedia.applyPartnerWatermark(
        buffer,
        label,
      );
      outBuffer = watermarked.buffer;
      outMime = watermarked.mimeType;
    }
    // 动态缩放（水印之后，水印随图等比保留）：带宽优先于 CPU，移动端列表收益显著
    if (!isVideo && width) {
      const resized = await this.resizeMediaBuffer(outBuffer, width);
      if (resized) {
        outBuffer = resized.buffer;
        outMime = resized.mimeType;
      }
    }

    // 安全响应头（不泄露文件系统信息）
    response.setHeader("Content-Type", outMime);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(outBuffer);
  }

  /** 聚合统计各状态商品数量，一次查询替代多次分页请求 */
  async getCounts() {
    const baseWhere = { deletedAt: null };
    const activeWhere = {
      ...baseWhere,
      status: { not: "ARCHIVED" as const },
    };
    const results = await Promise.all([
      this.prisma.product.count({ where: activeWhere }),
      this.prisma.product.count({
        where: { ...baseWhere, status: "PUBLISHED" },
      }),
      this.prisma.product.count({ where: { ...baseWhere, status: "OFFLINE" } }),
      this.prisma.product.count({ where: { ...baseWhere, status: "DRAFT" } }),
      this.prisma.product.count({
        where: { ...baseWhere, status: "ARCHIVED" },
      }),
    ]);
    return {
      all: results[0],
      PUBLISHED: results[1],
      OFFLINE: results[2],
      DRAFT: results[3],
      ARCHIVED: results[4],
    };
  }

  async findPublicById(reference: string | number) {
    const value = String(reference).trim();
    if (!value) return null;
    // 游客详情：仅返回列表级字段（不含 description/gemInfo/craftTechnique/skus），
    // 防止未登录抓取工艺细节、价格与规格；完整详情需登录后走 catalog/:id。
    const publicWhere = {
      deletedAt: null,
      status: "PUBLISHED" as const,
      visibility: "PUBLIC" as const,
    };
    let product = await this.prisma.product.findFirst({
      where: {
        ...publicWhere,
        code: value,
      },
      select: CUSTOMER_FACING_LIST_SELECT,
    });
    const legacyId = Number(value);
    if (!product && Number.isInteger(legacyId) && legacyId > 0) {
      product = await this.prisma.product.findFirst({
        where: { ...publicWhere, id: legacyId },
        select: CUSTOMER_FACING_LIST_SELECT,
      });
    }
    return product ? this.toCustomerFacingProduct(product, "public") : null;
  }

  /** 会员目录详情：查询本身完成越权过滤，不再调用返回后台字段的 findById。 */
  async findCatalogById(reference: string | number, customer: any) {
    const value = String(reference).trim();
    if (!value) return null;
    const visibilities = this.resolveVisibleVisibilities(customer);
    const catalogWhere = {
      deletedAt: null,
      status: "PUBLISHED" as const,
      visibility: { in: visibilities },
    };
    let product = await this.prisma.product.findFirst({
      where: {
        ...catalogWhere,
        code: value,
      },
      select: CUSTOMER_FACING_DETAIL_SELECT,
    });
    const legacyId = Number(value);
    if (!product && Number.isInteger(legacyId) && legacyId > 0) {
      product = await this.prisma.product.findFirst({
        where: { ...catalogWhere, id: legacyId },
        select: CUSTOMER_FACING_DETAIL_SELECT,
      });
    }
    if (!product) return null;
    // 记录有效浏览（30 分钟去重 + viewCount 原子 +1）
    await this.productAccess.recordDetailView(
      customer.id,
      product.id,
      "product_detail",
    );
    return this.toCustomerFacingProduct(product, "catalog");
  }

  /**
   * 批量校验提交的商品 ID 是否对当前提交者可见（选款咨询等"提交前服务端复核"场景复用）。
   *
   * 复用项目既有可见性规则，不另造判断：
   *   - 游客（customer 为空）：仅 PUBLIC，与 findPublic 一致；
   *   - 会员 / 已审核合作商家：按 resolveVisibleVisibilities 计算（PUBLIC+MEMBER，合作商家额外含 PARTNER）；
   *   - 必须同时满足 status=PUBLISHED、deletedAt IS NULL、visibility 命中可见范围。
   *
   * 安全约束：
   *   - 仅返回【通过校验】的 ID 集合，不返回任何商品业务字段，避免向调用方泄露不可见商品信息；
   *   - 不可见（不存在 / 下架 / 软删除 / 越权）统一表现为"不在结果集中"，不区分原因；
   *   - customer 必须由调用方从已验证的令牌派生，本方法不接受客户端提交的 customerId。
   */
  async filterVisibleProductIds(
    productIds: number[],
    customer?: any,
  ): Promise<Set<number>> {
    // 委托给 resolveVisibleProductSnapshots，避免可见性查询逻辑重复；
    // 仅取 ID 集合时此方法仍可用，且与快照解析走同一条判定路径。
    const snapshots = await this.resolveVisibleProductSnapshots(
      productIds,
      customer,
    );
    return new Set<number>(snapshots.keys());
  }

  /**
   * 批量解析提交商品 ID 的服务端规范快照（名称 + 受控媒体地址）。
   *
   * 供选款咨询等"提交前服务端复核 + 快照回填"场景使用：可见性规则与
   * filterVisibleProductIds 完全一致（游客仅 PUBLIC；会员/合作商家按 resolveVisibleVisibilities），
   * 额外返回商品名称与指向自有受控媒体端点的地址，供调用方覆盖客户端传入的名称/图片快照。
   *
   * 安全约束：
   *   - 仅返回【通过可见性校验】的商品；不可见 / 不存在 / 下架 / 越权统一不在结果中；
   *   - 只返回展示所需的最小字段（name、mediaUrl），不返回内部字段或存储路径；
   *   - mediaUrl 指向自有鉴权媒体端点，不写入客户端提交的任意外链或数据 URI。
   */
  async resolveVisibleProductSnapshots(
    productIds: number[],
    customer?: any,
  ): Promise<Map<number, { name: string; mediaUrl: string | null }>> {
    const ids = (productIds || []).filter(
      (id) => Number.isInteger(id) && (id as number) > 0,
    );
    const result = new Map<number, { name: string; mediaUrl: string | null }>();
    if (ids.length === 0) return result;
    const visibilities = customer
      ? this.resolveVisibleVisibilities(customer)
      : (["PUBLIC"] as ProductVisibility[]);
    const rows = await this.prisma.product.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        status: "PUBLISHED",
        visibility: { in: visibilities },
      },
      select: {
        id: true,
        name: true,
        listingImage: { select: CUSTOMER_FACING_IMAGE_SELECT },
        primaryImage: { select: CUSTOMER_FACING_IMAGE_SELECT },
        images: {
          orderBy: { sortOrder: "asc" },
          take: 5,
          select: CUSTOMER_FACING_IMAGE_SELECT,
        },
      },
    });
    for (const row of rows) {
      const imageId = [row.listingImage, row.primaryImage, ...row.images].find(
        (image) =>
          image ? this.productMedia.isProductMediaReadable(image) : false,
      )?.id ?? null;
      result.set(row.id, {
        name: row.name,
        // 媒体地址指向自有受控端点（catalog 媒体同时接受客户与员工令牌）；
        // 无主图时不写入外链，落 null。
        // 路径须与 SecureImage 的受控媒体识别一致（src.startsWith('/products/catalog/')）：
        // SecureImage 内部会再拼接 API_BASE('/api')，故此处不带 /api 前缀，避免双前缀导致 401。
        mediaUrl:
          imageId != null
            ? `/products/catalog/${row.id}/media/${imageId}`
            : null,
      });
    }
    return result;
  }

  publicChangeStream(): Observable<MessageEvent> {
    return fromEvent(this.publicEvents, "products-changed").pipe(
      map((data) => ({ data }) as MessageEvent),
      startWith({ data: { type: "ready" } } as MessageEvent),
    );
  }

  calcCompleteness(product: any): {
    isComplete: boolean;
    missingFields: string[];
    score: number;
  } {
    const requirements: Array<[string, boolean]> = [
      ["name", Boolean(product.name?.trim?.() || product.name)],
      ["code", Boolean(product.code?.trim?.() || product.code)],
      ["categoryId", Boolean(product.categoryId)],
      ["primaryImage", Boolean(product.images?.length)],
      ["salesMode", Boolean(product.salesMode)],
      ["materialType", Boolean(product.materialType)],
      ["visibility", Boolean(product.visibility)],
      ["detailContent", Boolean(product.detailContent?.length)],
    ];
    if (product.salesMode === "DIRECT_PURCHASE") {
      const activeSkus = (product.skus || []).filter((sku: any) => sku.isActive !== false);
      requirements.push(
        ["derivedPrice", Number(product.price) > 0],
        ["activeSku", activeSkus.length > 0 && activeSkus.every((sku: any) => Number(sku.price) > 0)],
        ["inventoryRecord", activeSkus.length > 0 && activeSkus.every((sku: any) => sku.inventories?.length > 0)],
        ["deliveryMethods", Boolean(product.deliveryMethods?.length)],
      );
      if (product.inventoryPolicy === "SINGLE_UNIT") {
        const totalStock = activeSkus.reduce(
          (sum: number, sku: any) =>
            sum +
            (sku.inventories || []).reduce(
              (skuSum: number, inventory: any) =>
                skuSum + Math.max(0, Number(inventory.quantity) || 0),
              0,
            ),
          0,
        );
        requirements.push([
          "singleUnit",
          activeSkus.length === 1 && totalStock <= 1,
        ]);
      }
    }
    const missing = requirements.filter(([, complete]) => !complete).map(([field]) => field);
    const total = requirements.length;
    const score = Math.round(((total - missing.length) / total) * 100);
    return { isComplete: missing.length === 0, missingFields: missing, score };
  }

  async findById(id: number) {
    // 过滤软删除记录，避免脏数据流入编辑器或其他 service
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        primaryImage: true,
        listingImage: true,
        // 编辑器需要展示全部 SKU（含停用）以便启停切换与彻底删除；
        // 列表页 totalStock 的计算另走 findAll 的 isActive 过滤。
        skus: { orderBy: { createdAt: "asc" } },
        certificates: true,
        tags: { include: { tag: true } },
        shippingTemplate: true,
      },
    });
    if (!product) return null;
    // 后台/详情媒体统一走受控媒体端点（迁移后旧 /uploads 文件删除，url 不再可用）
    const withMedia = (img: any) =>
      img
        ? {
            ...img,
            mediaUrl: `/products/catalog/${product.id}/media/${img.id}`,
          }
        : img;
    return {
      ...product,
      tags: (product.tags || []).map((t: any) => ({
        id: t.id,
        productId: t.productId,
        tagId: t.tagId,
        tagName: t.tag?.name || "",
      })),
      images: (product.images || []).map(withMedia),
      primaryImage: withMedia(product.primaryImage),
      listingImage: withMedia(product.listingImage),
    };
  }

  async create(dto: CreateProductDto) {
    // 检查分类是否存在
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException("所选商品分类不存在，请重新选择");
    }

    if (dto.shippingTemplateId) {
      const template = await this.prisma.shippingTemplate.findFirst({
        where: { id: dto.shippingTemplateId, isActive: true },
        select: { id: true },
      });
      if (!template) throw new BadRequestException("所选运费模板不存在或已停用");
    }
    if (dto.publishMode === "SCHEDULED") {
      if (!dto.scheduledPublishAt || new Date(dto.scheduledPublishAt).getTime() <= Date.now()) {
        throw new BadRequestException("定时上架时间必须晚于当前时间");
      }
      dto.status = "DRAFT";
    } else if (dto.publishMode === "WAREHOUSE" && dto.status === "PUBLISHED") {
      dto.status = "DRAFT";
    }

    const data = mapCreateDto(dto);
    const skus = dto.skus ?? [];

    try {
      // 事务：创建商品 + SKU + Inventory。
      // 多规格：传入 skus 则不建默认 SKU，商品起价 = 启用 SKU 最低价；单规格：自动建默认 SKU（价格=一口价）。
      const product = await this.prisma.$transaction(async (tx) => {
        const wantsPublished = data.status === "PUBLISHED";
        let created = await tx.product.create({
          data: wantsPublished ? { ...data, status: "DRAFT" } : data,
        });
        const warehouseId = await this.ensureDefaultWarehouseId(tx);

        if (skus.length > 0) {
          for (const sku of skus) {
            const createdSku = await tx.productSKU.create({
              data: {
                productId: created.id,
                skuCode: sku.skuCode,
                material: (sku.material ?? "GOLD_999") as any,
                size: sku.size ?? null,
                goldWeight: sku.goldWeight ?? 0,
                price: sku.price,
                isActive: sku.isActive ?? true,
              },
            });
            await tx.inventory.create({
              data: { skuId: createdSku.id, warehouseId, quantity: 0, safetyStock: 5 },
            });
          }
        } else {
          // P1-1 闭环：默认 SKU 建立 Inventory 记录（Inventory 为单一库存来源，否则该商品无法下单）
          const defaultSku = await tx.productSKU.create({
            data: {
              productId: created.id,
              skuCode: `${created.code}-DEFAULT`,
              material: (dto.materialType ?? "GOLD_999") as any,
              size: dto.size ?? null,
              goldWeight: dto.goldWeight ?? 0,
              price: dto.price ?? 0,
              isActive: true,
            },
          });
          await tx.inventory.create({
            data: {
              skuId: defaultSku.id,
              warehouseId,
              quantity: 0,
              safetyStock: 5,
            },
          });
        }

        await this.reconcileTradeRulesInTransaction(created.id, tx);

        if (wantsPublished) {
          try {
            // 创建接口尚不接收媒体；先暂存草稿，门禁通过后才在事务内写为已发布。
            await this.canPublish(created.id, tx);
          } catch (error) {
            if (error instanceof BadRequestException) {
              throw new UnprocessableEntityException(error.message);
            }
            throw error;
          }
          created = await tx.product.update({
            where: { id: created.id },
            data: { status: "PUBLISHED" },
          });
        }
        return created;
      });
      this.notifyPublicChange(product.id);
      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          const target = (error.meta as any)?.target;
          if (Array.isArray(target) && target.includes("sku_code")) {
            throw new ConflictException("该 SKU 编码已存在，请更换编码");
          }
          throw new ConflictException("该商品货号已存在，请更换货号");
        }
      }
      throw error;
    }
  }

  /**
   * 上架门禁唯一入口。五种销售模式共用基础事实与媒体门禁；只有直接购买追加价格、
   * SKU、库存记录、配送方式与库存策略约束。0 库存不阻止展示，由购物车/结算拒绝购买。
   */
  async canPublish(
    productId: number,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const product = await db.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: PUBLICATION_QUALITY_SELECT,
    });
    if (!product) throw new NotFoundException("商品不存在或已删除");
    const assessment = this.assessPublicationQuality(product);
    if (assessment.conflicts.length > 0) {
      throw new ConflictException(assessment.conflicts.join("；"));
    }
    if (assessment.errors.length > 0) {
      throw new BadRequestException(`发布前请补全: ${assessment.errors.join("、")}`);
    }
    await db.product.update({
      where: { id: productId },
      data: {
        publicationQualityStatus: "READY",
        publicationQualityHash: assessment.qualityHash,
        publicationQualityCheckedAt: new Date(),
      },
    });
    return { status: "READY" as const, qualityHash: assessment.qualityHash };
  }

  /**
   * 只读扫描全部已发布商品，预测第二阶段启用质量隔离后的影响。
   * 分批读取避免单次查询无限膨胀；此方法不写质量状态、不发通知。
   */
  async getPublicationQualityReport() {
    const batchSize = 200;
    let cursor: number | undefined;
    const items: Array<{
      id: number;
      code: string;
      name: string;
      visibility: ProductVisibility;
      storedStatus: "QUARANTINED" | "READY";
      assessment: "READY" | "NEEDS_REMEDIATION";
      storedStateFresh: boolean;
      issues: string[];
    }> = [];
    const byVisibility: Record<ProductVisibility, number> = {
      PUBLIC: 0,
      MEMBER: 0,
      PARTNER: 0,
      INTERNAL: 0,
    };
    const byIssue: Record<string, number> = {};
    let storedReady = 0;
    let storedQuarantined = 0;
    let freshReady = 0;

    while (true) {
      const batch = await this.prisma.product.findMany({
        where: { deletedAt: null, status: "PUBLISHED" },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        select: PUBLICATION_QUALITY_SELECT,
      });
      for (const product of batch) {
        const assessment = this.assessPublicationQuality(product);
        const issues = [...assessment.errors, ...assessment.conflicts];
        const storedStateFresh =
          product.publicationQualityStatus === "READY" &&
          product.publicationQualityHash === assessment.qualityHash &&
          issues.length === 0;
        byVisibility[product.visibility] += 1;
        if (product.publicationQualityStatus === "READY") storedReady += 1;
        else storedQuarantined += 1;
        if (storedStateFresh) freshReady += 1;
        for (const issue of issues) byIssue[issue] = (byIssue[issue] ?? 0) + 1;
        items.push({
          id: product.id,
          code: product.code,
          name: product.name,
          visibility: product.visibility,
          storedStatus: product.publicationQualityStatus,
          assessment: issues.length === 0 ? "READY" : "NEEDS_REMEDIATION",
          storedStateFresh,
          issues,
        });
      }
      if (batch.length < batchSize) break;
      cursor = batch[batch.length - 1].id;
    }

    const needsRemediation = items.filter(
      (item) => item.assessment === "NEEDS_REMEDIATION",
    ).length;
    return {
      gateVersion: PRODUCT_QUALITY_GATE_VERSION,
      generatedAt: new Date(),
      scope: {
        status: "PUBLISHED" as const,
        deletedAt: null,
        writeMode: "READ_ONLY" as const,
      },
      summary: {
        total: items.length,
        readyByCurrentFacts: items.length - needsRemediation,
        needsRemediation,
        storedReady,
        storedQuarantined,
        freshReady,
        byVisibility,
        byIssue,
      },
      items,
    };
  }

  private assessPublicationQuality(product: PublicationQualitySnapshot) {
    const errors: string[] = [];
    const conflicts: string[] = [];
    const activeSkus = product.skus.filter((sku) => sku.isActive);
    if (!isMeaningfulPublicText(product.name, 2) || !product.code.trim())
      errors.push("有效且非测试/乱码的商品名称与货号");
    if (FORBIDDEN_PUBLIC_CONTENT.test(product.code) || MOJIBAKE_OR_REPLACEMENT.test(product.code))
      errors.push("正式商品货号（禁止 E2E、Mock、Seed 或乱码标记）");
    if (!isMeaningfulPublicText(product.shortDescription, 8))
      errors.push("至少 8 个有效字符的正式商品简介");
    if (!isMeaningfulPublicText(product.description, 20))
      errors.push("至少 20 个有效字符的正式商品说明");
    if (!hasMeaningfulDetailContent(product.detailContent))
      errors.push("非测试且非空的商品详情内容");
    if (!product.category.isActive || product.category.deletedAt)
      errors.push("有效且启用的商品分类");

    const hasPositiveWeight = [
      product.goldWeight,
      product.weight,
      ...activeSkus.map((sku) => sku.goldWeight),
    ].some((value) => Number(value) > 0);
    if (!hasPositiveWeight) errors.push("与材质一致且大于 0g 的商品或 SKU 重量");

    const hasReadableImage = product.images.some((image) =>
      this.productMedia.isProductMediaReadable(image),
    );
    if (!hasReadableImage) errors.push("至少一张可读取的非视频商品图片");
    if (!product.primaryImage || !this.productMedia.isProductMediaReadable(product.primaryImage))
      errors.push("已指定且可读取的详情主图");
    if (!product.listingImage || !this.productMedia.isProductMediaReadable(product.listingImage))
      errors.push("已指定且可读取的列表图");

    switch (product.salesMode) {
      case "DIRECT_PURCHASE": {
        if (activeSkus.length === 0) errors.push("至少一个有效规格 (SKU)");
        if (activeSkus.some((sku) => Number(sku.price) <= 0))
          errors.push("所有有效 SKU 均设置大于 0 的交易价格");
        if (activeSkus.some((sku) => sku.inventories.length === 0))
          errors.push("所有有效 SKU 均建立库存记录");
        if (!product.price || Number(product.price) <= 0)
          errors.push("SKU 派生最低价大于 0");
        if (!Array.isArray(product.deliveryMethods) || product.deliveryMethods.length === 0)
          errors.push("至少一种配送方式");
        if (product.shippingTemplate && !product.shippingTemplate.isActive)
          errors.push("启用中的运费模板");
        if (product.inventoryPolicy === "SINGLE_UNIT") {
          if (activeSkus.length !== 1) {
            conflicts.push("一物一件商品必须且只能有一个有效 SKU");
          }
          const totalInventory = product.skus.reduce(
            (total, sku) =>
              total + sku.inventories.reduce((sum, item) => sum + item.quantity, 0),
            0,
          );
          if (totalInventory < 0 || totalInventory > 1) {
            conflicts.push("一物一件商品库存总量只能为 0 或 1");
          }
        }
        break;
      }
      case "DISPLAY_ONLY":
      case "SELECTION":
      case "APPOINTMENT":
      case "CUSTOM_INQUIRY":
        break;
      default: {
        const exhaustive: never = product.salesMode;
        errors.push(`不支持的销售模式: ${exhaustive}`);
      }
    }
    return {
      errors,
      conflicts,
      qualityHash: publicationQualityHash({ ...product, skus: activeSkus }),
    };
  }

  /** Product.price 只由此处写入，值为有效且有价 SKU 的最低价。 */
  private async syncProductStartingPrice(
    productId: number,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const skus = await db.productSKU.findMany({
      where: { productId, isActive: true },
      select: { price: true },
    });
    const activePrices = skus
      .map((s) => Number(s.price))
      .filter((p) => Number.isFinite(p) && p > 0);
    const startingPrice =
      activePrices.length > 0 ? Math.min(...activePrices) : 0;
    await db.product.update({
      where: { id: productId },
      data: { price: startingPrice },
    });
    return startingPrice;
  }

  private async assertInventoryPolicy(
    productId: number,
    db: Prisma.TransactionClient | PrismaService,
    knownPolicy?: InventoryPolicy,
  ) {
    const policy =
      knownPolicy ??
      (
        await db.product.findUnique({
          where: { id: productId },
          select: { inventoryPolicy: true },
        })
      )?.inventoryPolicy;
    if (!policy) throw new NotFoundException("商品不存在或已删除");
    if (policy !== "SINGLE_UNIT") return;

    const [activeSkuCount, inventory] = await Promise.all([
      db.productSKU.count({ where: { productId, isActive: true } }),
      db.inventory.aggregate({
        _sum: { quantity: true },
        where: { sku: { productId } },
      }),
    ]);
    if (activeSkuCount !== 1) {
      throw new ConflictException("一物一件商品必须且只能有一个有效 SKU");
    }
    const total = inventory._sum.quantity ?? 0;
    if (total < 0 || total > 1) {
      throw new ConflictException("一物一件商品库存总量只能为 0 或 1");
    }
  }

  /** 库存与 SKU 跨表约束需要按商品串行化；只加行锁，不改商品时间戳或业务字段。 */
  async lockProductForTradeMutation(
    productId: number,
    tx: Prisma.TransactionClient,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM products WHERE id = ${productId} AND deleted_at IS NULL FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException("商品不存在或已删除");
  }

  /** SKU、价格或库存变更的事务内统一后置规则；调用方负责开启并提交事务。 */
  async reconcileTradeRulesInTransaction(
    productId: number,
    tx: Prisma.TransactionClient,
  ) {
    await this.syncProductStartingPrice(productId, tx);
    await this.assertInventoryPolicy(productId, tx);
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { status: true },
    });
    if (!product) throw new NotFoundException("商品不存在或已删除");
    if (product.status === "PUBLISHED") {
      try {
        await this.canPublish(productId, tx);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw new ConflictException(`已发布商品更新后不满足发布条件：${error.message}`);
        }
        throw error;
      }
    }
  }

  async update(id: number, dto: UpdateProductDto) {
    // 排除已软删除商品,避免改动或重新上架已删除记录
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException("商品不存在或已删除");
    // 回收站商品只读：禁止通过普通更新接口修改业务字段或直接改状态，唯一操作为恢复为草稿
    if (existing.status === "ARCHIVED") {
      throw new ConflictException("商品位于回收站，请先恢复为草稿后再编辑");
    }

    // 检查分类是否存在
    if (dto.categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException("所选商品分类不存在，请重新选择");
      }
    }

    if (dto.shippingTemplateId) {
      const template = await this.prisma.shippingTemplate.findFirst({
        where: { id: dto.shippingTemplateId, isActive: true },
        select: { id: true },
      });
      if (!template) throw new BadRequestException("所选运费模板不存在或已停用");
    }
    if (dto.publishMode === "SCHEDULED") {
      if (!dto.scheduledPublishAt || new Date(dto.scheduledPublishAt).getTime() <= Date.now()) {
        throw new BadRequestException("定时上架时间必须晚于当前时间");
      }
    }

    const data = mapUpdateDto(dto);

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        await this.lockProductForTradeMutation(id, tx);
        if (Object.keys(data).length) {
          await tx.product.update({ where: { id }, data });
        }

        // 兼容旧编辑器的一口价字段：只允许映射到唯一有效 SKU，绝不直接写 Product.price。
        if (dto.price !== undefined) {
          const activeSkus = await tx.productSKU.findMany({
            where: { productId: id, isActive: true },
            select: { id: true },
          });
          if (activeSkus.length !== 1) {
            throw new ConflictException(
              "多规格商品请在 SKU 中分别维护价格，商品价格不能直接编辑",
            );
          }
          await tx.productSKU.update({
            where: { id: activeSkus[0].id },
            data: { price: dto.price },
          });
        }

        await this.reconcileTradeRulesInTransaction(id, tx);
        return tx.product.findUniqueOrThrow({ where: { id } });
      });

      this.notifyPublicChange(product.id);
      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException("该商品货号已存在，请更换货号");
        }
        if (error.code === "P2025") {
          throw new NotFoundException("商品不存在");
        }
      }
      throw error;
    }
  }

  async updateStatus(id: number, status: ProductStatus) {
    const existing = await this.findLifecycleProduct(id);
    if (existing.status === "ARCHIVED") {
      throw new ConflictException("商品位于回收站，请先恢复为草稿后再操作");
    }
    if (status === "ARCHIVED") return this.archive(id);

    let data: Prisma.ProductUpdateInput;
    if (status === "PUBLISHED") {
      data = {
        status: "PUBLISHED",
        ...(existing.status === "PUBLISHED" ? {} : { publishedAt: new Date() }),
        publishMode: "IMMEDIATE",
        scheduledPublishAt: null,
        scheduledPublishError: null,
      };
      const product = await this.prisma.$transaction(async (tx) => {
        await this.lockProductForTradeMutation(id, tx);
        await this.syncProductStartingPrice(id, tx);
        await this.assertInventoryPolicy(id, tx);
        await this.canPublish(id, tx);
        return tx.product.update({ where: { id }, data });
      });
      this.notifyPublicChange(product.id);
      return product;
    } else if (status === "OFFLINE") {
      data = {
        status: "OFFLINE",
        publishMode: "WAREHOUSE",
        scheduledPublishAt: null,
      };
    } else {
      data = {
        status: "DRAFT",
        publishMode: "WAREHOUSE",
        scheduledPublishAt: null,
      };
    }

    const product = await this.prisma.product.update({ where: { id }, data });
    this.notifyPublicChange(product.id);
    return product;
  }
  async checkCompleteness(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { images: true, skus: { include: { inventories: true } } },
    });
    if (!product) throw new NotFoundException("商品不存在或已删除");
    return this.calcCompleteness(product);
  }
  private async findLifecycleProduct(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new NotFoundException("商品不存在或已被其他人处理");
    }
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!product) {
      throw new NotFoundException("商品不存在或已被其他人处理");
    }
    return product;
  }

  async archive(id: number) {
    const existing = await this.findLifecycleProduct(id);
    if (existing.status === "ARCHIVED") {
      throw new ConflictException("商品已在回收站，请刷新列表确认最新状态");
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    this.notifyPublicChange(product.id);
    return product;
  }

  async restore(id: number) {
    const existing = await this.findLifecycleProduct(id);
    if (existing.status !== "ARCHIVED") {
      throw new ConflictException("商品已不在回收站，请刷新列表确认最新状态");
    }
    const product = await this.prisma.product.update({
      where: { id },
      // 恢复后回到草稿态：回收站只读，唯一允许的业务操作是恢复为草稿，恢复后可编辑并重新发布。
      data: { status: "DRAFT" },
    });
    this.notifyPublicChange(product.id);
    return product;
  }

  async delete(id: number) {
    const existing = await this.findLifecycleProduct(id);
    if (existing.status !== "ARCHIVED") {
      throw new ConflictException("商品不在回收站，无法从回收站移除");
    }
    // 规则确认：回收站（ARCHIVED）只读，唯一允许的业务操作是恢复为草稿；
    // 禁止“从回收站移除/软删除”，不写 deletedAt，保留商品及关联记录用于审计。
    throw new ConflictException("回收站商品只能恢复为草稿，不能直接移除");
  }

  /* ═══ 图片管理 ═══ */
  // ImageType 枚举（schema 定义：FRONT/SIDE/TOP/DETAIL/WEARING，无 BACK）。
  // 注：是否新增 BACK 属【待产品决策】（PRODUCT_DATA_CONTRACT 13.5），未确认前不扩展。
  private readonly IMAGE_TYPES = new Set([
    "FRONT",
    "SIDE",
    "TOP",
    "DETAIL",
    "WEARING",
  ]);
  private normalizeImageType(type: string | undefined): string {
    if (!type) return "FRONT"; // 默认与 schema 一致（旧代码默认 SIDE 与 schema 冲突，已统一为 FRONT）
    const upper = String(type).toUpperCase();
    return this.IMAGE_TYPES.has(upper) ? upper : "FRONT"; // 非法值兜底 FRONT，不写入任意字符串
  }

  async addImage(
    productId: number,
    data: AddProductImageDto,
  ) {
    // 受控存储优先 storageKey（私有目录）；legacy 本机 URL 必须保留为底层读取事实。
    // 对调用方始终返回 /products/catalog/:id/media/:imageId 受控端点。
    const storageKey = data.storageKey?.trim() || undefined;
    const initialUrl =
      data.url || (storageKey ? `pending://${storageKey}` : "");
    if (!initialUrl) throw new BadRequestException("图片地址或存储键不能为空");
    if (
      !this.productMedia.isProductMediaReadable({
        storageKey,
        url: data.url,
      })
    ) {
      throw new BadRequestException("媒体文件不可读取，请重新上传");
    }
    const image = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productImage.create({
        data: {
          productId,
          url: initialUrl,
          storageKey: storageKey ?? null,
          type: this.normalizeImageType(data.type) as any,
          sortOrder: data.sortOrder ?? 0,
          isVideo: data.isVideo ?? false,
          sourceImageId: data.sourceImageId ?? null,
          cropData:
            data.cropData === undefined
              ? undefined
              : (data.cropData as Prisma.InputJsonValue),
          width: data.width ?? null,
          height: data.height ?? null,
          mimeType: data.mimeType ?? null,
          fileSize: data.fileSize ?? null,
        },
      });
      const mediaUrl = `/products/catalog/${productId}/media/${created.id}`;
      if (storageKey) {
        return tx.productImage.update({
          where: { id: created.id },
          data: { url: mediaUrl },
        });
      }
      // legacy /uploads 与 /images/products 路径是这类记录唯一的底层读取事实，
      // 数据库必须保留；仅返回值改写为受控端点，公开序列化也不会泄漏底层路径。
      return { ...created, url: mediaUrl };
    });
    this.notifyPublicChange(productId);
    return image;
  }

  async updateImage(
    productId: number,
    imageId: number,
    data: { type?: string; sortOrder?: number },
  ) {
    const img = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!img) throw new BadRequestException("图片不属于该商品");
    const updateData: any = {};
    if (data.type !== undefined)
      updateData.type = this.normalizeImageType(data.type) as any;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    const image = await this.prisma.productImage.update({
      where: { id: imageId },
      data: updateData,
    });
    this.notifyPublicChange(image.productId);
    return image;
  }

  async deleteImage(productId: number, imageId: number) {
    const image = await this.prisma.$transaction(async (tx) => {
      await this.lockProductForTradeMutation(productId, tx);
      const existing = await tx.productImage.findFirst({
        where: { id: imageId, productId },
      });
      if (!existing)
        throw new NotFoundException("商品图片不存在或不属于该商品");
      const deleted = await tx.productImage.delete({ where: { id: imageId } });
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { status: true },
      });
      if (product?.status === "PUBLISHED") {
        try {
          await this.canPublish(productId, tx);
        } catch (error) {
          if (error instanceof BadRequestException) {
            throw new ConflictException(
              `已发布商品更新后不满足发布条件：${error.message}`,
            );
          }
          throw error;
        }
      }
      return deleted;
    });
    this.notifyPublicChange(image.productId);
    return image;
  }

  /** 设置详情主图 */
  async setPrimaryImage(productId: number, imageId: number) {
    // 验证图片属于该商品
    const img = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!img) throw new BadRequestException("图片不属于该商品");
    if (img.isVideo || !this.productMedia.isProductMediaReadable(img)) {
      throw new BadRequestException("主图必须是可读取的非视频图片");
    }

    // 主图通过 primaryImageId 指针 + sortOrder 表达，不改写图片 type（保留原始视角语义 FRONT/SIDE/...）。
    // 旧实现把所有 FRONT 改 SIDE、目标改 FRONT，会破坏原始拍摄视角。
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.productImage.update({
        where: { id: imageId },
        data: { sortOrder: 0 },
      });
      const others = await tx.productImage.findMany({
        where: { productId, id: { not: imageId } },
        orderBy: { sortOrder: "asc" },
      });
      if (others.length > 0) {
        await Promise.all(
          others.map((im, i) =>
            tx.productImage.update({
              where: { id: im.id },
              data: { sortOrder: i + 1 },
            }),
          ),
        );
      }
      const product = await tx.product.update({
        where: { id: productId },
        data: { primaryImageId: imageId },
      });
      // 如果尚未设置列表图，同步设置
      if (!product.listingImageId) {
        await tx.product.update({
          where: { id: productId },
          data: { listingImageId: imageId },
        });
      }
      return {
        primaryImageId: imageId,
        listingImageId: product.listingImageId || imageId,
      };
    });

    this.notifyPublicChange(productId);
    return result;
  }

  /** 直接设置列表图（不裁切） */
  async setListingImage(productId: number, imageId: number) {
    const img = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!img) throw new BadRequestException("图片不属于该商品");
    if (img.isVideo || !this.productMedia.isProductMediaReadable(img)) {
      throw new BadRequestException("列表图必须是可读取的非视频图片");
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { listingImageId: imageId },
    });

    this.notifyPublicChange(productId);
    return { listingImageId: imageId };
  }

  /** 恢复列表图为详情主图 */
  async resetListingToPrimary(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { primaryImageId: true, primaryImage: true },
    });
    if (!product) throw new NotFoundException("商品不存在");
    if (
      !product.primaryImage ||
      product.primaryImage.isVideo ||
      !this.productMedia.isProductMediaReadable(product.primaryImage)
    ) {
      throw new BadRequestException("当前主图不可读取，无法恢复为列表图");
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { listingImageId: product.primaryImageId },
    });

    this.notifyPublicChange(productId);
    return { listingImageId: product.primaryImageId };
  }

  /* ═══ 证书管理 ═══ */
  async addCertificate(
    productId: number,
    dto: {
      certType: string;
      certNumber?: string;
      certImage?: string;
      expireDate?: string;
    },
  ) {
    const cert = await this.prisma.certificate.create({
      data: {
        productId,
        certType: dto.certType as any,
        certNumber: dto.certNumber ?? "",
        certImage: dto.certImage ?? null,
        expireDate: dto.expireDate ? new Date(dto.expireDate) : null,
      },
    });
    this.notifyPublicChange(productId);
    return cert;
  }

  async updateCertificate(
    productId: number,
    certId: number,
    dto: {
      certType?: string;
      certNumber?: string;
      certImage?: string;
      expireDate?: string;
    },
  ) {
    // P1-22：校验证书归属于 URL 声明的商品，避免跨商品越权改删
    const existing = await this.prisma.certificate.findFirst({
      where: { id: certId, productId },
    });
    if (!existing) throw new NotFoundException("证书不存在或不属于该商品");
    const data: any = {};
    if (dto.certType !== undefined) data.certType = dto.certType;
    if (dto.certNumber !== undefined) data.certNumber = dto.certNumber;
    if (dto.certImage !== undefined) data.certImage = dto.certImage;
    if (dto.expireDate !== undefined)
      data.expireDate = dto.expireDate ? new Date(dto.expireDate) : null;
    const cert = await this.prisma.certificate.update({
      where: { id: certId },
      data,
    });
    this.notifyPublicChange(cert.productId);
    return cert;
  }

  async deleteCertificate(productId: number, certId: number) {
    const cert = await this.prisma.certificate.findFirst({
      where: { id: certId, productId },
    });
    if (!cert) throw new NotFoundException("证书不存在或不属于该商品");
    await this.prisma.certificate.delete({ where: { id: certId } });
    this.notifyPublicChange(productId);
    return { id: certId };
  }

  /* ═══ SKU 管理 ═══ */
  async getSkus(productId: number) {
    return this.prisma.productSKU.findMany({
      where: { productId },
      orderBy: { createdAt: "asc" },
    });
  }

  async createSku(
    productId: number,
    dto: {
      skuCode: string;
      material?: string;
      size?: string;
      goldWeight?: number;
      price: number;
      isActive?: boolean;
    },
  ) {
    try {
      const sku = await this.prisma.$transaction(async (tx) => {
        await this.lockProductForTradeMutation(productId, tx);
        const created = await tx.productSKU.create({
          data: {
            productId,
            skuCode: dto.skuCode,
            material: (dto.material || "GOLD_999") as any,
            size: dto.size ?? null,
            goldWeight: dto.goldWeight ?? 0,
            price: dto.price,
            isActive: dto.isActive ?? true,
          },
        });
        // 新建 SKU 与 Inventory、派生价格及发布门禁在同一事务内。
        const warehouseId = await this.ensureDefaultWarehouseId(tx);
        await tx.inventory.create({
          data: { skuId: created.id, warehouseId, quantity: 0, safetyStock: 5 },
        });
        await this.reconcileTradeRulesInTransaction(productId, tx);
        return created;
      });
      this.notifyPublicChange(productId);
      return sku;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException("该SKU编码已存在，请更换编码");
        }
      }
      throw error;
    }
  }

  async updateSku(
    productId: number,
    skuId: number,
    dto: {
      skuCode?: string;
      material?: string;
      size?: string;
      goldWeight?: number;
      price?: number;
      isActive?: boolean;
    },
  ) {
    const data: any = {};
    if (dto.skuCode !== undefined) data.skuCode = dto.skuCode;
    if (dto.material !== undefined) data.material = dto.material;
    if (dto.size !== undefined) data.size = dto.size;
    if (dto.goldWeight !== undefined) data.goldWeight = dto.goldWeight;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const sku = await this.prisma.$transaction(async (tx) => {
        await this.lockProductForTradeMutation(productId, tx);
        const existing = await tx.productSKU.findFirst({
          where: { id: skuId, productId },
        });
        if (!existing)
          throw new NotFoundException("SKU不存在或不属于该商品");
        const updated = await tx.productSKU.update({
          where: { id: skuId },
          data,
        });
        await this.reconcileTradeRulesInTransaction(productId, tx);
        return updated;
      });
      this.notifyPublicChange(productId);
      return sku;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException("该SKU编码已存在，请更换编码");
        }
        if (error.code === "P2025") {
          throw new NotFoundException("SKU不存在");
        }
      }
      throw error;
    }
  }

  async deleteSku(productId: number, skuId: number) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockProductForTradeMutation(productId, tx);
        const sku = await tx.productSKU.findFirst({
          where: { id: skuId, productId },
          select: { id: true },
        });
        if (!sku) throw new NotFoundException("SKU不存在或不属于该商品");
        await tx.productSKU.delete({ where: { id: skuId } });
        await this.reconcileTradeRulesInTransaction(productId, tx);
      });
      this.notifyPublicChange(productId);
      return { id: skuId };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2003") {
          throw new BadRequestException(
            "该 SKU 已有库存或订单记录，无法删除，请改用「停用」",
          );
        }
        if (error.code === "P2025") {
          throw new NotFoundException("SKU不存在");
        }
      }
      throw error;
    }
  }

  /* ═══ 标签管理 ═══ */
  async getTags(productId: number) {
    const rows = await this.prisma.productTag.findMany({
      where: { productId },
      include: { tag: true },
      orderBy: { id: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      tagId: r.tagId,
      tagName: r.tag.name,
    }));
  }

  async updateTags(productId: number, tags: string[]) {
    // 校验单条标签长度（schema tag.name VarChar(50)，超长会触发 Prisma 500）
    for (const tag of tags) {
      if (
        typeof tag !== "string" ||
        tag.trim().length === 0 ||
        tag.length > 50
      ) {
        throw new BadRequestException("每个标签长度需在 1-50 字符之间");
      }
    }
    const names = [...new Set(tags.map((t) => t.trim()))];
    // 删除 + 重建放入同一事务；标签字典按名称 find-or-create（slug 即名称，保证幂等）
    await this.prisma.$transaction(async (tx) => {
      const tagIds: number[] = [];
      for (const name of names) {
        const existing = await tx.tag.findUnique({ where: { slug: name } });
        if (existing) {
          tagIds.push(existing.id);
        } else {
          const created = await tx.tag.create({ data: { name, slug: name } });
          tagIds.push(created.id);
        }
      }
      await tx.productTag.deleteMany({ where: { productId } });
      if (tagIds.length > 0) {
        await tx.productTag.createMany({
          data: tagIds.map((tagId) => ({ productId, tagId })),
        });
      }
    });
    this.notifyPublicChange(productId);
    return this.getTags(productId);
  }

  /* ═══ 标签字典管理 ═══ */
  async listTags() {
    return this.prisma.tag.findMany({
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      include: { _count: { select: { productTags: true } } },
    });
  }

  async createTag(data: { name: string; group?: string; sortOrder?: number }) {
    const name = String(data.name || "").trim();
    if (!name) throw new BadRequestException("标签名称不能为空");
    if (name.length > 50) throw new BadRequestException("标签名称不能超过50字符");
    const exists = await this.prisma.tag.findUnique({ where: { slug: name } });
    if (exists) throw new ConflictException("同名标签已存在");
    return this.prisma.tag.create({
      data: {
        name,
        slug: name,
        group: data.group?.trim() || null,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async updateTag(
    id: number,
    data: { name?: string; group?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException("标签不存在");
    const updateData: any = {};
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new BadRequestException("标签名称不能为空");
      if (name.length > 50) throw new BadRequestException("标签名称不能超过50字符");
      if (name !== tag.name) {
        const exists = await this.prisma.tag.findUnique({ where: { slug: name } });
        if (exists && exists.id !== id) throw new ConflictException("同名标签已存在");
        updateData.name = name;
        updateData.slug = name;
      }
    }
    if (data.group !== undefined) updateData.group = data.group?.trim() || null;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    return this.prisma.tag.update({ where: { id }, data: updateData });
  }

  /* ═══ 属性管理 ═══ */
  async getAttributes(productId: number) {
    return this.prisma.productAttributeValue.findMany({
      where: { productId },
      include: { attributeValue: { include: { attribute: true } } },
      orderBy: { id: "asc" },
    });
  }

  async setAttributes(productId: number, attributeValueIds: number[]) {
    const ids = [
      ...new Set(
        (attributeValueIds || [])
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    if (ids.length) {
      const count = await this.prisma.attributeValue.count({
        where: { id: { in: ids } },
      });
      if (count !== ids.length) {
        throw new BadRequestException("包含不存在的属性值");
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productAttributeValue.deleteMany({ where: { productId } });
      if (ids.length) {
        await tx.productAttributeValue.createMany({
          data: ids.map((attributeValueId) => ({
            productId,
            attributeValueId,
          })),
        });
      }
    });
    this.notifyPublicChange(productId);
    return this.getAttributes(productId);
  }

  /** 外部交易规则调用方在事务成功提交后广播公开商品刷新。 */
  notifyTradeProductChanged(productId: number) {
    this.notifyPublicChange(productId);
  }

  /**
   * 确保存在至少一个 active 仓库并返回其 id（P1-1 闭环：SKU 必须挂在某仓库的 Inventory 才能下单）。
   * seed 已建默认仓库；若被全部停用则自动建"默认主仓库"兜底，避免阻断下单。
   */
  private async ensureDefaultWarehouseId(
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const existing = await client.warehouse.findFirst({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await client.warehouse.create({
      data: { name: "默认主仓库", type: "STORE", isActive: true },
    });
    return created.id;
  }

  private notifyPublicChange(productId?: number): void {
    this.productMedia.invalidate();
    this.publicEvents.emit("products-changed", {
      type: "products-changed",
      productId,
      changedAt: new Date().toISOString(),
    });
  }
}
