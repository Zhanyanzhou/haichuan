import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: { page?: number; pageSize?: number; warehouseId?: number; status?: string }) {
    const { page = 1, pageSize = 20, warehouseId, status } = params;
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;

    const [list, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          sku: {
            select: { skuCode: true, material: true, product: { select: { id: true, name: true, code: true } } },
          },
          warehouse: { select: { id: true, name: true, type: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    return { list, total, page: +page, pageSize: +pageSize };
  }

  async findById(id: number) {
    const inv = await this.prisma.inventory.findUnique({ where: { id },
      include: { sku: true, warehouse: true } });
    if (!inv) throw new NotFoundException('库存记录不存在');
    return inv;
  }

  async updateStock(id: number, data: { type: 'in' | 'out' | 'adjust'; quantity: number; remark?: string }) {
    if (!Number.isInteger(data.quantity) || data.quantity < 0) {
      throw new BadRequestException('数量必须为非负整数');
    }

    const inv = await this.prisma.inventory.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('库存记录不存在');

    if (data.type === 'in') {
      return this.prisma.inventory.update({
        where: { id },
        data: { quantity: { increment: data.quantity } },
      });
    }

    if (data.type === 'out') {
      // 原子条件更新：where quantity >= 出库量，防止并发超卖
      const result = await this.prisma.inventory.updateMany({
        where: { id, quantity: { gte: data.quantity } },
        data: { quantity: { decrement: data.quantity } },
      });
      if (result.count === 0) throw new BadRequestException('库存不足');
      return this.prisma.inventory.findUniqueOrThrow({ where: { id } });
    }

    // adjust：直接设置为指定值（入口已校验非负）
    return this.prisma.inventory.update({
      where: { id },
      data: { quantity: data.quantity },
    });
  }

  /** 聚合某商品全部 SKU 的可用库存总量(经 Inventory，统一库存真相源) */
  async getTotalByProduct(productId: number) {
    const result = await this.prisma.inventory.aggregate({
      _sum: { quantity: true },
      where: { sku: { productId } },
    });
    return result._sum.quantity ?? 0;
  }
}
