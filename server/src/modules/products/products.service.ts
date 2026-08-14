import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateProductDto, UpdateProductDto } from "./dto";
import { Prisma, ProductVisibility } from "@prisma/client";
import { EventEmitter } from "events";
import { fromEvent, map, Observable, startWith } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import { ProductMediaService } from "./product-media.service";
import { ProductAccessService } from "./product-access.service";

const CUSTOMER_FACING_IMAGE_SELECT = {
  id: true,
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
  salesMode: true,
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
  primaryImage: { select: CUSTOMER_FACING_IMAGE_SELECT },
  listingImage: { select: CUSTOMER_FACING_IMAGE_SELECT },
} satisfies Prisma.ProductSelect;

const CUSTOMER_FACING_DETAIL_SELECT = {
  ...CUSTOMER_FACING_LIST_SELECT,
  description: true,
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
    },
  },
} satisfies Prisma.ProductSelect;

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
    price,
    weight,
    size,
    gemInfo,
    craftTechnique,
    status,
    visibility,
    salesMode,
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
    price: price ?? 0,
    weight: weight ?? 0,
    size: size ?? null,
    gemInfo: gemInfo ?? undefined,
    craftTechnique: craftTechnique ?? undefined,
    status: status ?? "DRAFT",
    visibility: visibility ?? "MEMBER",
    salesMode: salesMode ?? "DISPLAY_ONLY",
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
  const data: Prisma.ProductUpdateInput = {};

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
  if (dto.price !== undefined) data.price = dto.price;
  if (dto.weight !== undefined) data.weight = dto.weight;
  if (dto.size !== undefined) data.size = dto.size;
  if (dto.gemInfo !== undefined) data.gemInfo = dto.gemInfo;
  if (dto.craftTechnique !== undefined)
    data.craftTechnique = dto.craftTechnique;
  if (dto.status !== undefined) data.status = dto.status;
  if (dto.visibility !== undefined) data.visibility = dto.visibility;
  if (dto.salesMode !== undefined) data.salesMode = dto.salesMode;
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

  async findAll(params: any) {
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
    if (categoryId) where.categoryId = +categoryId;
    if (status) where.status = status;
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
      sortBy === "sortOrder" ? { sortOrder: "asc" } : { updatedAt: "desc" };

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
            sortOrder: true,
            isHot: true,
            isNew: true,
            isRecommended: true,
            isLimited: true,
            isCustom: true,
            multiDiscount: true,
            visibility: true,
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
              select: { id: true, inventories: { select: { quantity: true } } },
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

  /** 游客公开列表：只返回 PUBLIC + PUBLISHED，并使用独立字段白名单。 */
  async findPublic(params: Record<string, unknown> = {}) {
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
  async findCatalog(params: any, customer: any) {
    const visibilities = this.resolveVisibleVisibilities(customer);
    return this.findCustomerFacingList(params, visibilities, "catalog");
  }

  /**
   * 前台列表查询。这里不复用后台 findAll，防止后台新增字段后被对象展开意外带到前台。
   */
  private async findCustomerFacingList(
    params: Record<string, unknown>,
    visibilities: ProductVisibility[],
    mediaScope: "public" | "catalog",
  ) {
    const page = this.toBoundedPositiveInt(params.page, 1, 1_000_000);
    const pageSize = this.toBoundedPositiveInt(params.pageSize, 20, 2_000);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: "PUBLISHED",
      visibility: { in: visibilities },
    };

    if (params.ids !== undefined) {
      const idList = String(params.ids)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
      where.id = { in: idList };
    }

    const categoryId = Number(params.categoryId);
    if (Number.isInteger(categoryId) && categoryId > 0)
      where.categoryId = categoryId;

    const keyword =
      typeof params.keyword === "string"
        ? params.keyword.trim().slice(0, 100)
        : "";
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }

    if (
      typeof params.materialType === "string" &&
      CUSTOMER_MATERIAL_TYPES.has(params.materialType)
    ) {
      where.materialType = params.materialType as any;
    }
    if (
      typeof params.salesMode === "string" &&
      CUSTOMER_SALES_MODES.has(params.salesMode)
    ) {
      where.salesMode = params.salesMode as any;
    }
    if (params.isHot === "true" || params.isHot === "false")
      where.isHot = params.isHot === "true";
    if (params.isRecommended === "true" || params.isRecommended === "false") {
      where.isRecommended = params.isRecommended === "true";
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

    // 排序：sortOrder（运营定制序）/ 价格升降（选购场景）/ 默认最近更新
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      params.sortBy === "sortOrder"
        ? { sortOrder: "asc" }
        : params.sortBy === "price_asc"
          ? { price: "asc" }
          : params.sortBy === "price_desc"
            ? { price: "desc" }
            : { updatedAt: "desc" };
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        select: CUSTOMER_FACING_LIST_SELECT,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      list: list.map((product) =>
        this.toCustomerFacingProduct(product, mediaScope),
      ),
      total,
      page,
      pageSize,
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
      if (!img) return null;
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
      salesMode: product.salesMode,
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
      response.gemInfo = product.gemInfo;
      response.craftTechnique = product.craftTechnique;
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
    const results = await Promise.all([
      this.prisma.product.count({ where: baseWhere }),
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

  async findPublicById(id: number) {
    if (!Number.isInteger(id) || id <= 0) return null;
    // 游客详情：仅返回列表级字段（不含 description/gemInfo/craftTechnique/skus），
    // 防止未登录抓取工艺细节、价格与规格；完整详情需登录后走 catalog/:id。
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
        status: "PUBLISHED",
        visibility: "PUBLIC",
      },
      select: CUSTOMER_FACING_LIST_SELECT,
    });
    return product ? this.toCustomerFacingProduct(product, "public") : null;
  }

  /** 会员目录详情：查询本身完成越权过滤，不再调用返回后台字段的 findById。 */
  async findCatalogById(id: number, customer: any) {
    if (!Number.isInteger(id) || id <= 0) return null;
    const visibilities = this.resolveVisibleVisibilities(customer);
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
        status: "PUBLISHED",
        visibility: { in: visibilities },
      },
      select: CUSTOMER_FACING_DETAIL_SELECT,
    });
    if (!product) return null;
    // 记录有效浏览（30 分钟去重 + viewCount 原子 +1）
    await this.productAccess.recordDetailView(
      customer.id,
      id,
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
        primaryImage: { select: { id: true } },
      },
    });
    for (const row of rows) {
      const imageId = row.primaryImage?.id ?? null;
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
    const missing: string[] = [];
    if (!product.name) missing.push("name");
    if (!product.code) missing.push("code");
    if (!product.categoryId) missing.push("categoryId");
    if (!product.images || product.images.length === 0)
      missing.push("primaryImage");
    if (!product.salesMode) missing.push("salesMode");
    if (!product.materialType) missing.push("materialType");
    if (!product.price || Number(product.price) <= 0) missing.push("price");
    const total = 7;
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

    const data = mapCreateDto(dto);

    try {
      // 事务:创建商品 + 自动建一个默认 SKU(统一 SKU 模型,承载价格;库存经 Inventory)
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({ data });
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
        // P1-1 闭环：默认 SKU 建立 Inventory 记录（Inventory 为单一库存来源，否则该商品无法下单）
        const warehouseId = await this.ensureDefaultWarehouseId(tx);
        await tx.inventory.create({
          data: {
            skuId: defaultSku.id,
            warehouseId,
            quantity: 0,
            safetyStock: 5,
          },
        });
        return created;
      });
      this.notifyPublicChange(product.id);
      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException("该商品货号已存在，请更换货号");
        }
      }
      throw error;
    }
  }

  /** 上架门禁:起价>0 + 有主图(或任意图) + 至少 1 个有价的活跃 SKU */
  async canPublish(productId: number) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        price: true,
        primaryImageId: true,
        images: { select: { id: true }, take: 1 },
        skus: {
          where: { isActive: true, price: { gt: 0 } },
          select: { id: true },
        },
      },
    });
    if (!product) throw new NotFoundException("商品不存在或已删除");
    const errors: string[] = [];
    if (!product.price || Number(product.price) <= 0) errors.push("价格大于 0");
    if (!product.primaryImageId && product.images.length === 0)
      errors.push("至少一张商品图片");
    if (product.skus.length === 0) errors.push("至少一个有价的有效规格 (SKU)");
    if (errors.length > 0) {
      throw new BadRequestException(`发布前请补全: ${errors.join("、")}`);
    }
  }

  /** 重算并写回商品起价 = 活跃 SKU 最低价;SKU 增删改/启停后调用,保持 Product.price 为单一真相源 */
  private async syncProductStartingPrice(productId: number) {
    const skus = await this.prisma.productSKU.findMany({
      where: { productId, isActive: true },
      select: { price: true },
    });
    const activePrices = skus
      .map((s) => Number(s.price))
      .filter((p) => Number.isFinite(p) && p > 0);
    const startingPrice =
      activePrices.length > 0 ? Math.min(...activePrices) : 0;
    await this.prisma.product.update({
      where: { id: productId },
      data: { price: startingPrice },
    });
  }

  async update(id: number, dto: UpdateProductDto) {
    // 排除已软删除商品,避免改动或重新上架已删除记录
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("商品不存在或已删除");

    // 检查分类是否存在
    if (dto.categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException("所选商品分类不存在，请重新选择");
      }
    }

    // status 单独抽出:先写其余字段(价格/图片等),再走上架门禁,确保门禁读到的是最新值
    const { status: targetStatus, ...rest } = dto as any;
    const data = mapUpdateDto(rest);

    try {
      let product: any = Object.keys(data).length
        ? await this.prisma.product.update({ where: { id }, data })
        : await this.prisma.product.findUnique({ where: { id } });

      if (targetStatus !== undefined) {
        if (targetStatus === "PUBLISHED") {
          // 统一上架门禁(封堵 PUT /:id 直写 status 绕过 /status 端点)
          await this.canPublish(id);
          product = await this.prisma.product.update({
            where: { id },
            data: { status: "PUBLISHED", publishedAt: new Date() },
          });
        } else {
          product = await this.prisma.product.update({
            where: { id },
            data: { status: targetStatus },
          });
        }
      }

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
  async checkCompleteness(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { images: true },
    });
    if (!product) throw new NotFoundException("商品不存在或已删除");
    return this.calcCompleteness(product);
  }
  async delete(id: number) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: "OFFLINE" },
    });
    this.notifyPublicChange(product.id);
    return product;
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
    data: {
      url?: string;
      storageKey?: string;
      type?: string;
      sortOrder?: number;
      sourceImageId?: number;
      cropData?: any;
      width?: number;
      height?: number;
      mimeType?: string;
      fileSize?: number;
      isVideo?: boolean;
    },
  ) {
    // 受控存储：优先 storageKey（私有目录）。url 创建后回填为受控媒体端点
    // /products/catalog/:id/media/:imageId —— 统一作为订单/选款等历史快照的来源值，
    // 避免用 catalog:// 等占位符污染快照导致后台缩略图失效。
    const storageKey = data.storageKey?.trim() || undefined;
    const initialUrl =
      data.url || (storageKey ? `pending://${storageKey}` : "");
    if (!initialUrl) throw new BadRequestException("图片地址或存储键不能为空");
    const image = await this.prisma.productImage.create({
      data: {
        productId,
        url: initialUrl,
        storageKey: storageKey ?? null,
        type: this.normalizeImageType(data.type) as any,
        sortOrder: data.sortOrder ?? 0,
        isVideo: data.isVideo ?? false,
        sourceImageId: data.sourceImageId ?? null,
        cropData: data.cropData ?? undefined,
        width: data.width ?? null,
        height: data.height ?? null,
        mimeType: data.mimeType ?? null,
        fileSize: data.fileSize ?? null,
      },
    });
    // 回填 url 为受控媒体端点（imageId 创建后才已知），快照字段取此值可在 SecureImage 中渲染
    const mediaUrl = `/products/catalog/${productId}/media/${image.id}`;
    await this.prisma.productImage.update({
      where: { id: image.id },
      data: { url: mediaUrl },
    });
    image.url = mediaUrl;
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

  async deleteImage(imageId: number) {
    const image = await this.prisma.productImage.delete({
      where: { id: imageId },
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
    });
    if (!product) throw new NotFoundException("商品不存在");

    await this.prisma.product.update({
      where: { id: productId },
      data: { listingImageId: product.primaryImageId },
    });

    this.notifyPublicChange(productId);
    return { listingImageId: product.primaryImageId };
  }

  private withAvailableImages(product: any) {
    const images = (product.images || []).filter((image: any) =>
      this.productMedia.isAvailable(image.url),
    );
    const findAvailableImage = (image: any) =>
      image && images.find((item: any) => item.id === image.id) ? image : null;

    return {
      ...product,
      images,
      primaryImage: findAvailableImage(product.primaryImage),
      listingImage: findAvailableImage(product.listingImage),
    };
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
      const sku = await this.prisma.productSKU.create({
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
      // P1-1 闭环：新建 SKU 同步建立 Inventory 记录（Inventory 单一来源）
      const warehouseId = await this.ensureDefaultWarehouseId();
      await this.prisma.inventory.create({
        data: { skuId: sku.id, warehouseId, quantity: 0, safetyStock: 5 },
      });
      await this.syncProductStartingPrice(productId);
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
    // P1-22：校验 SKU 归属于 URL 声明的商品
    const existing = await this.prisma.productSKU.findFirst({
      where: { id: skuId, productId },
    });
    if (!existing) throw new NotFoundException("SKU不存在或不属于该商品");

    const data: any = {};
    if (dto.skuCode !== undefined) data.skuCode = dto.skuCode;
    if (dto.material !== undefined) data.material = dto.material;
    if (dto.size !== undefined) data.size = dto.size;
    if (dto.goldWeight !== undefined) data.goldWeight = dto.goldWeight;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const sku = await this.prisma.productSKU.update({
        where: { id: skuId },
        data,
      });
      await this.syncProductStartingPrice(sku.productId);
      this.notifyPublicChange(sku.productId);
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
    // 彻底删除 SKU。若已关联库存/订单（外键约束），拒绝并提示改用停用。
    const sku = await this.prisma.productSKU.findFirst({
      where: { id: skuId, productId },
      select: { productId: true },
    });
    if (!sku) throw new NotFoundException("SKU不存在或不属于该商品");

    try {
      await this.prisma.productSKU.delete({ where: { id: skuId } });
      await this.syncProductStartingPrice(sku.productId);
      this.notifyPublicChange(sku.productId);
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

  /**
   * 供外部模块（如 GoldPriceService 调价后）重算起价并通知前台 SSE 刷新。
   * 保持 syncProductStartingPrice / notifyPublicChange 私有，仅暴露此组合入口（P1-2）。
   */
  async refreshStartingPriceAndNotify(productId: number) {
    await this.syncProductStartingPrice(productId);
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
