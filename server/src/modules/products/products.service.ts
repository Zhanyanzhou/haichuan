import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

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
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
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
        skus: { where: { isActive: true } },
        certificates: true,
        tags: true,
      },
    });
  }

  async create(data: any) {
    return this.prisma.product.create({ data });
  }

  async update(id: number, data: any) {
    return this.prisma.product.update({ where: { id }, data });
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
  async addImage(productId: number, data: { url: string; type?: string; sortOrder?: number }) {
    return this.prisma.productImage.create({
      data: { productId, url: data.url, type: (data.type || 'SIDE') as any, sortOrder: data.sortOrder ?? 0, isVideo: false },
    });
  }

  async updateImage(imageId: number, data: { type?: string; sortOrder?: number }) {
    return this.prisma.productImage.update({ where: { id: imageId }, data: data as any });
  }

  async deleteImage(imageId: number) {
    return this.prisma.productImage.delete({ where: { id: imageId } });
  }

  async setCoverImage(productId: number, imageId: number) {
    await this.prisma.productImage.updateMany({ where: { productId, type: 'FRONT' }, data: { type: 'SIDE' as any } });
    return this.prisma.productImage.update({ where: { id: imageId }, data: { type: 'FRONT' as any } });
  }
}
