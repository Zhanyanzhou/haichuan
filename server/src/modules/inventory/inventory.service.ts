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
        skip: (page - 1) * pageSize,
        take: pageSize,
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

    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const inv = await this.prisma.inventory.findUnique({ where: { id },
      include: { sku: true, warehouse: true } });
    if (!inv) throw new NotFoundException('库存记录不存在');
    return inv;
  }

  async updateStock(id: number, data: { type: 'in' | 'out' | 'adjust'; quantity: number; remark?: string }) {
    const inv = await this.prisma.inventory.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('库存记录不存在');

    let newQuantity = inv.quantity;
    if (data.type === 'in') newQuantity += data.quantity;
    else if (data.type === 'out') {
      if (inv.quantity < data.quantity) throw new BadRequestException('库存不足');
      newQuantity -= data.quantity;
    } else if (data.type === 'adjust') newQuantity = data.quantity;

    return this.prisma.inventory.update({
      where: { id },
      data: { quantity: newQuantity },
    });
  }

  async getLowStockAlerts() {
    return this.prisma.inventory.findMany({
      where: { quantity: { lte: 0 } as any },
      include: {
        sku: { select: { skuCode: true, product: { select: { name: true } } } },
        warehouse: { select: { name: true } },
      },
    });
  }

  async getSummary() {
    const [totalQuantity, warehouses, lowStockCount] = await Promise.all([
      this.prisma.inventory.aggregate({ _sum: { quantity: true } }),
      this.prisma.warehouse.count({ where: { isActive: true } }),
      this.prisma.inventory.count({ where: { quantity: { lte: 0 } as any } }),
    ]);

    return {
      totalQuantity: totalQuantity._sum.quantity || 0,
      warehouseCount: warehouses,
      lowStockCount,
    };
  }
}
