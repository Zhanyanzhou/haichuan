import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { Prisma } from '@prisma/client';

/** 从 DTO 提取 Prisma create 数据，过滤关系字段和系统字段 */
function mapCreateDto(dto: CreateProductDto): Prisma.ProductCreateInput {
  const {
    code, name, categoryId,
    shortDescription, description,
    materialType, goldWeight, craftFee,
    price, priceMin, priceMax, weight, size,
    gemInfo, craftTechnique,
    status, salesMode, sortOrder,
    isHot, isNew, isRecommended, isLimited, isCustom,
  } = dto;

  return {
    code,
    name,
    category: { connect: { id: categoryId } },
    shortDescription: shortDescription ?? null,
    description: description ?? null,
    materialType: materialType ?? 'GOLD_999',
    goldWeight: goldWeight ?? 0,
    craftFee: craftFee ?? 0,
    price: price ?? 0,
    priceMin: priceMin ?? 0,
    priceMax: priceMax ?? 0,
    weight: weight ?? 0,
    size: size ?? null,
    gemInfo: gemInfo ?? undefined,
    craftTechnique: craftTechnique ?? undefined,
    status: status ?? 'DRAFT',
    salesMode: salesMode ?? 'DISPLAY_ONLY',
    sortOrder: sortOrder ?? 0,
    isHot: isHot ?? false,
    isNew: isNew ?? false,
    isRecommended: isRecommended ?? false,
    isLimited: isLimited ?? false,
    isCustom: isCustom ?? false,
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
  if (dto.shortDescription !== undefined) data.shortDescription = dto.shortDescription;
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
  if (dto.craftTechnique !== undefined) data.craftTechnique = dto.craftTechnique;
  if (dto.status !== undefined) data.status = dto.status;
  if (dto.salesMode !== undefined) data.salesMode = dto.salesMode;
  if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
  if (dto.isHot !== undefined) data.isHot = dto.isHot;
  if (dto.isNew !== undefined) data.isNew = dto.isNew;
  if (dto.isRecommended !== undefined) data.isRecommended = dto.isRecommended;
  if (dto.isLimited !== undefined) data.isLimited = dto.isLimited;
  if (dto.isCustom !== undefined) data.isCustom = dto.isCustom;

  return data;
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: any) {
    const { page = 1, pageSize = 20, categoryId, status, keyword, materialType, salesMode, isHot, isRecommended, sortBy } = params;
    const where: any = { deletedAt: null };
    if (categoryId) where.categoryId = +categoryId;
    if (status) where.status = status;
    if (materialType) where.materialType = materialType;
    if (salesMode) where.salesMode = salesMode;
    if (isHot !== undefined) where.isHot = isHot === 'true';
    if (isRecommended !== undefined) where.isRecommended = isRecommended === 'true';
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }

    const _page = +page, _pageSize = +pageSize;
    const orderBy: any = sortBy === 'sortOrder' ? { sortOrder: 'asc' } : { updatedAt: 'desc' };
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (_page - 1) * _pageSize,
        take: _pageSize,
        orderBy,
        include: {
          category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 5 },
          primaryImage: true,
          listingImage: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const enrichedList = list.map((p: any) => ({
      ...p,
      completeness: this.calcCompleteness(p),
      hasPrimaryImage: p.images?.length > 0,
      imageCount: p.images?.length ?? 0,
    }));

    return { list: enrichedList, total, page: _page, pageSize: _pageSize };
  }

  calcCompleteness(product: any): { isComplete: boolean; missingFields: string[]; score: number } {
    const missing: string[] = [];
    if (!product.name) missing.push('name');
    if (!product.code) missing.push('code');
    if (!product.categoryId) missing.push('categoryId');
    if (!product.images || product.images.length === 0) missing.push('primaryImage');
    if (!product.salesMode) missing.push('salesMode');
    if (!product.materialType) missing.push('materialType');
    const total = 6;
    const score = Math.round(((total - missing.length) / total) * 100);
    return { isComplete: missing.length === 0, missingFields: missing, score };
  }

  async findById(id: number) {
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        primaryImage: true,
        listingImage: true,
        skus: { where: { isActive: true } },
        certificates: true,
        tags: true,
      },
    });
  }

  async create(dto: CreateProductDto) {
    // 检查分类是否存在
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) {
      throw new BadRequestException('所选商品分类不存在，请重新选择');
    }

    const data = mapCreateDto(dto);

    try {
      return await this.prisma.product.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('该商品货号已存在，请更换货号');
        }
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateProductDto) {
    // 检查商品是否存在
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('商品不存在');
    }

    // 检查分类是否存在
    if (dto.categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) {
        throw new BadRequestException('所选商品分类不存在，请重新选择');
      }
    }

    const data = mapUpdateDto(dto);

    try {
      return await this.prisma.product.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('该商品货号已存在，请更换货号');
        }
        if (error.code === 'P2025') {
          throw new NotFoundException('商品不存在');
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
    if (!product) throw new Error('Product not found');
    return this.calcCompleteness(product);
  }
  async delete(id: number) {
    return this.prisma.product.update({
      where: { id },
      data: { status: 'OFFLINE' },
    });
  }

  /* ═══ 图片管理 ═══ */
  async addImage(productId: number, data: { url: string; type?: string; sortOrder?: number; sourceImageId?: number; cropData?: any; width?: number; height?: number; mimeType?: string; fileSize?: number }) {
    return this.prisma.productImage.create({
      data: {
        productId,
        url: data.url,
        type: (data.type || 'SIDE') as any,
        sortOrder: data.sortOrder ?? 0,
        isVideo: false,
        sourceImageId: data.sourceImageId ?? null,
        cropData: data.cropData ?? undefined,
        width: data.width ?? null,
        height: data.height ?? null,
        mimeType: data.mimeType ?? null,
        fileSize: data.fileSize ?? null,
      },
    });
  }

  async updateImage(imageId: number, data: { type?: string; sortOrder?: number }) {
    return this.prisma.productImage.update({ where: { id: imageId }, data: data as any });
  }

  async deleteImage(imageId: number) {
    return this.prisma.productImage.delete({ where: { id: imageId } });
  }

  /** 设置详情主图 */
  async setPrimaryImage(productId: number, imageId: number) {
    // 验证图片属于该商品
    const img = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!img) throw new BadRequestException('图片不属于该商品');
    
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { primaryImageId: imageId },
    });
    
    // 如果尚未设置列表图，同步设置
    if (!product.listingImageId) {
      await this.prisma.product.update({
        where: { id: productId },
        data: { listingImageId: imageId },
      });
    }
    
    return { primaryImageId: imageId, listingImageId: product.listingImageId || imageId };
  }

  /** 直接设置列表图（不裁切） */
  async setListingImage(productId: number, imageId: number) {
    const img = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!img) throw new BadRequestException('图片不属于该商品');
    
    await this.prisma.product.update({
      where: { id: productId },
      data: { listingImageId: imageId },
    });
    
    return { listingImageId: imageId };
  }

  /** 恢复列表图为详情主图 */
  async resetListingToPrimary(productId: number) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('商品不存在');
    
    await this.prisma.product.update({
      where: { id: productId },
      data: { listingImageId: product.primaryImageId },
    });
    
    return { listingImageId: product.primaryImageId };
  }
}
