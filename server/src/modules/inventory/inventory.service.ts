import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { Prisma } from "@prisma/client";
import { CreateWarehouseDto, UpdateWarehouseDto } from "./dto/warehouse.dto";

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  async findAll(params: {
    page?: number;
    pageSize?: number;
    warehouseId?: number;
    status?: string;
  }) {
    const { page = 1, pageSize = 20, warehouseId, status } = params;
    const where: Prisma.InventoryWhereInput = {};
    if (warehouseId) where.warehouseId = warehouseId;

    const [list, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        include: {
          sku: {
            select: {
              skuCode: true,
              material: true,
              product: { select: { id: true, name: true, code: true } },
            },
          },
          warehouse: { select: { id: true, name: true, type: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    return { list, total, page: +page, pageSize: +pageSize };
  }

  async findById(id: number) {
    const inv = await this.prisma.inventory.findUnique({
      where: { id },
      include: { sku: true, warehouse: true },
    });
    if (!inv) throw new NotFoundException("库存记录不存在");
    return inv;
  }

  async updateStock(
    id: number,
    data: { type: "in" | "out" | "adjust"; quantity: number; remark?: string },
    operator?: { id?: number; name?: string },
  ) {
    if (!Number.isInteger(data.quantity) || data.quantity < 0) {
      throw new BadRequestException("数量必须为非负整数");
    }

    let changedProductId: number | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({
        where: { id },
        select: { id: true, quantity: true, sku: { select: { productId: true } } },
      });
      if (!inv) throw new NotFoundException("库存记录不存在");
      const productId = inv.sku.productId;
      changedProductId = productId;
      await this.productsService.lockProductForTradeMutation(productId, tx);

      if (data.type === "in") {
        await tx.inventory.update({
          where: { id },
          data: { quantity: { increment: data.quantity } },
        });
      } else if (data.type === "out") {
        // 原子条件更新：where quantity >= 出库量，防止并发超卖
        const result = await tx.inventory.updateMany({
          where: { id, quantity: { gte: data.quantity } },
          data: { quantity: { decrement: data.quantity } },
        });
        if (result.count === 0) throw new BadRequestException("库存不足");
      } else {
        await tx.inventory.update({
          where: { id },
          data: { quantity: data.quantity },
        });
      }

      await this.productsService.reconcileTradeRulesInTransaction(productId, tx);
      const result = await tx.inventory.findUniqueOrThrow({ where: { id } });
      if (operator?.id) {
        await tx.operationLog.create({
          data: {
            userId: operator.id,
            action: "stock_update",
            module: "inventory",
            targetId: id,
            detail: JSON.stringify({
              type: data.type,
              quantity: data.quantity,
              before: inv.quantity,
              after: result.quantity,
              remark: data.remark?.trim() || null,
            }),
          },
        });
      }
      return result;
    });
    if (changedProductId !== null) {
      this.productsService.notifyTradeProductChanged(changedProductId);
    }
    return updated;
  }

  /** 聚合某商品全部 SKU 的可用库存总量(经 Inventory，统一库存真相源) */
  async getTotalByProduct(productId: number) {
    const result = await this.prisma.inventory.aggregate({
      _sum: { quantity: true },
      where: { sku: { productId } },
    });
    return result._sum.quantity ?? 0;
  }

  /* ═══ 仓库管理 ═══ */
  async listWarehouses() {
    return this.prisma.warehouse.findMany({
      orderBy: [{ isActive: "desc" }, { id: "asc" }],
      include: { _count: { select: { inventories: true } } },
    });
  }

  async createWarehouse(data: CreateWarehouseDto) {
    const name = String(data.name || "").trim();
    if (!name) throw new BadRequestException("仓库名称不能为空");
    return this.prisma.warehouse.create({
      data: {
        name,
        type: data.type || "SHOWROOM",
        address: data.address?.trim() || null,
        contact: data.contact?.trim() || null,
        phone: data.phone?.trim() || null,
      },
    });
  }

  async updateWarehouse(
    id: number,
    data: UpdateWarehouseDto,
  ) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException("仓库不存在");
    const updateData: Prisma.WarehouseUpdateInput = {};
    if (data.name !== undefined) updateData.name = String(data.name).trim();
    if (data.type !== undefined) updateData.type = data.type;
    if (data.address !== undefined) updateData.address = data.address?.trim() || null;
    if (data.contact !== undefined) updateData.contact = data.contact?.trim() || null;
    if (data.phone !== undefined) updateData.phone = data.phone?.trim() || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    return this.prisma.warehouse.update({ where: { id }, data: updateData });
  }
}
