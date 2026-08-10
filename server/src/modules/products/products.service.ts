import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateProductDto, UpdateProductDto } from "./dto";
import { Prisma } from "@prisma/client";
import { EventEmitter } from "events";
import { fromEvent, map, Observable, startWith } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import { ProductMediaService } from "./product-media.service";

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
    priceMin,
    priceMax,
    weight,
    size,
    gemInfo,
    craftTechnique,
    status,
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
    priceMin: priceMin ?? 0,
    priceMax: priceMax ?? 0,
    weight: weight ?? 0,
    size: size ?? null,
    gemInfo: gemInfo ?? undefined,
    craftTechnique: craftTechnique ?? undefined,
    status: status ?? "DRAFT",
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
  if (dto.priceMin !== undefined) data.priceMin = dto.priceMin;
  if (dto.priceMax !== undefined) data.priceMax = dto.priceMax;
  if (dto.weight !== undefined) data.weight = dto.weight;
  if (dto.size !== undefined) data.size = dto.size;
  if (dto.gemInfo !== undefined) data.gemInfo = dto.gemInfo;
  if (dto.craftTechnique !== undefined)
    data.craftTechnique = dto.craftTechnique;
  if (dto.status !== undefined) data.status = dto.status;
  if (dto.salesMode !== undefined) data.salesMode = dto.salesMode;
  if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
  if (dto.isHot !== undefined) data.isHot = dto.isHot;
  if (dto.isNew !== undefined) data.isNew = dto.isNew;
  if (dto.isRecommended !== undefined) data.isRecommended = dto.isRecommended;
  if (dto.isLimited !== undefined) data.isLimited = dto.isLimited;
  if (dto.isCustom !== undefined) data.isCustom = dto.isCustom;
  if (dto.multiDiscount !== undefined) data.multiDiscount = dto.multiDiscount;

  return data;
}

@Injectable()
export class ProductsService {
  private readonly publicEvents = new EventEmitter();

  constructor(
    private prisma: PrismaService,
    private productMedia: ProductMediaService,
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
          include: {
            category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 5 },
          primaryImage: true,
          listingImage: true,
          skus: { where: { isActive: true }, select: { stock: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const enrichedList = list.map((p: any) => ({
      ...p,
      completeness: this.calcCompleteness(p),
      hasPrimaryImage: p.images?.length > 0,
      imageCount: p.images?.length ?? 0,
      totalStock:
        p.skus?.reduce((sum: number, sku: any) => sum + (sku.stock || 0), 0) ??
        0,
    }));

    return { list: enrichedList, total, page: _page, pageSize: _pageSize };
    } catch (error: any) {
      // 记录完整查询上下文，便于定位 Prisma 校验异常
      console.error('[findAll] Prisma 查询失败', {
        message: error?.message,
        where: JSON.stringify(where),
        skip: (_page - 1) * _pageSize,
        take: _pageSize,
        orderBy: JSON.stringify(orderBy),
      });
      throw error;
    }
  }

  async findPublic(params: any) {
    // 直接委托 findAll，仅过滤 PUBLISHED 状态，不做图片文件存在性检查。
    // 前端 ProductList 对无图商品已有占位符兜底，确保前后台数量可对账。
    return this.findAll({ ...params, status: "PUBLISHED" });
  }

  /** 聚合统计各状态商品数量，一次查询替代多次分页请求 */
  async getCounts() {
    const baseWhere = { deletedAt: null };
    const results = await Promise.all([
      this.prisma.product.count({ where: baseWhere }),
      this.prisma.product.count({ where: { ...baseWhere, status: "PUBLISHED" } }),
      this.prisma.product.count({ where: { ...baseWhere, status: "OFFLINE" } }),
      this.prisma.product.count({ where: { ...baseWhere, status: "DRAFT" } }),
      this.prisma.product.count({ where: { ...baseWhere, status: "ARCHIVED" } }),
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
    const product = await this.findById(id);
    if (!product || product.status !== "PUBLISHED" || product.deletedAt)
      return null;

    const visible = this.withAvailableImages(product);
    return visible.images.length > 0 ? visible : null;
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
    const total = 6;
    const score = Math.round(((total - missing.length) / total) * 100);
    return { isComplete: missing.length === 0, missingFields: missing, score };
  }

  async findById(id: number) {
    // 过滤软删除记录，避免脏数据流入编辑器或其他 service
    return this.prisma.product.findFirst({
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
        tags: true,
      },
    });
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
      const product = await this.prisma.product.create({ data });
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

  async update(id: number, dto: UpdateProductDto) {
    // 检查分类是否存在
    if (dto.categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException("所选商品分类不存在，请重新选择");
      }
    }

    const data = mapUpdateDto(dto);

    try {
      const product = await this.prisma.product.update({ where: { id }, data });
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
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!product) throw new Error("Product not found");
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
  async addImage(
    productId: number,
    data: {
      url: string;
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
    const image = await this.prisma.productImage.create({
      data: {
        productId,
        url: data.url,
        type: (data.type || "SIDE") as any,
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
    this.notifyPublicChange(productId);
    return image;
  }

  async updateImage(
    imageId: number,
    data: { type?: string; sortOrder?: number },
  ) {
    const image = await this.prisma.productImage.update({
      where: { id: imageId },
      data: data as any,
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

    // 全部图片与主图字段的更新放进同一事务，避免中途失败造成 sortOrder 错乱
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.productImage.updateMany({
        where: { productId, type: "FRONT" },
        data: { type: "SIDE" },
      });
      await tx.productImage.update({
        where: { id: imageId },
        data: { type: "FRONT", sortOrder: 0 },
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
    dto: { certType: string; certNumber?: string; certImage?: string; expireDate?: string },
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
    certId: number,
    dto: { certType?: string; certNumber?: string; certImage?: string; expireDate?: string },
  ) {
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

  async deleteCertificate(certId: number) {
    const cert = await this.prisma.certificate.delete({ where: { id: certId } });
    this.notifyPublicChange(cert.productId);
    return cert;
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
      stock?: number;
      safetyStock?: number;
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
          stock: dto.stock ?? 0,
          safetyStock: dto.safetyStock ?? 5,
          isActive: dto.isActive ?? true,
        },
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
    skuId: number,
    dto: {
      skuCode?: string;
      material?: string;
      size?: string;
      goldWeight?: number;
      price?: number;
      stock?: number;
      safetyStock?: number;
      isActive?: boolean;
    },
  ) {
    const data: any = {};
    if (dto.skuCode !== undefined) data.skuCode = dto.skuCode;
    if (dto.material !== undefined) data.material = dto.material;
    if (dto.size !== undefined) data.size = dto.size;
    if (dto.goldWeight !== undefined) data.goldWeight = dto.goldWeight;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.safetyStock !== undefined) data.safetyStock = dto.safetyStock;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const sku = await this.prisma.productSKU.update({
        where: { id: skuId },
        data,
      });
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

  async deleteSku(skuId: number) {
    // 彻底删除 SKU。若已关联库存/订单（外键约束），拒绝并提示改用停用。
    const sku = await this.prisma.productSKU.findUnique({
      where: { id: skuId },
      select: { productId: true },
    });
    if (!sku) throw new NotFoundException("SKU不存在");

    try {
      await this.prisma.productSKU.delete({ where: { id: skuId } });
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
    return this.prisma.productTag.findMany({ where: { productId } });
  }

  async updateTags(productId: number, tags: string[]) {
    // 删除 + 重建放入同一事务，避免重建失败导致标签全部丢失
    await this.prisma.$transaction(async (tx) => {
      await tx.productTag.deleteMany({ where: { productId } });
      if (tags.length > 0) {
        await tx.productTag.createMany({
          data: tags.map((tag) => ({ productId, tagName: tag })),
        });
      }
    });
    this.notifyPublicChange(productId);
    return this.prisma.productTag.findMany({ where: { productId } });
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
