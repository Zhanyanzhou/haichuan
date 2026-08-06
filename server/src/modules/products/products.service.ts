import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: any) {
    const { page = 1, pageSize = 20, categoryId, status, keyword, materialType, isHot, isNew } = params;
    const where: any = {};
    if (categoryId) where.categoryId = +categoryId;
    if (status) where.status = status;
    if (materialType) where.materialType = materialType;
    if (isHot !== undefined) where.isHot = isHot === 'true';
    if (isNew !== undefined) where.isNew = isNew === 'true';
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }

    const _page = +page, _pageSize = +pageSize;
    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (_page - 1) * _pageSize,
        take: _pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 3 },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { list, total, page: _page, pageSize: _pageSize };
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

  async delete(id: number) {
    return this.prisma.product.update({
      where: { id },
      data: { status: 'OFF_SHELF' },
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
