import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import { ProductsService } from "../products/products.service";
import { Prisma } from "@prisma/client";
import { CreateWarehouseDto, UpdateWarehouseDto } from "./dto/warehouse.dto";

type InventoryActor = Pick<StaffPrincipal, "id" | "sessionFamilyId">;

type LockedInventoryActor = {
  id: number;
};

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  private async lockAuthorizedInventoryActor(
    transaction: Prisma.TransactionClient,
    actor: InventoryActor,
    mode: "read" | "write",
  ): Promise<LockedInventoryActor> {
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException("当前员工已停用或无权访问库存与仓库");
    }
    const locked = mode === "read"
      ? await transaction.$queryRaw<LockedInventoryActor[]>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE') FOR SHARE`,
        )
      : await transaction.$queryRaw<LockedInventoryActor[]>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE') FOR UPDATE`,
        );
    if (locked.length !== 1) {
      throw new ForbiddenException("当前员工已停用或无权访问库存与仓库");
    }
    if (actor.sessionFamilyId) {
      const sessions = mode === "read"
        ? await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
          )
        : await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
          );
      if (sessions.length !== 1) {
        throw new ForbiddenException("当前员工会话已失效，不能访问库存与仓库");
      }
    }
    return locked[0];
  }

  async findAll(params: {
    page?: number;
    pageSize?: number;
    warehouseId?: number;
    status?: string;
  }, actor: InventoryActor) {
    const { page = 1, pageSize = 20, warehouseId, status } = params;
    const where: Prisma.InventoryWhereInput = {};
    if (warehouseId) where.warehouseId = warehouseId;

    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedInventoryActor(tx, actor, "read");
      const [list, total] = await Promise.all([
        tx.inventory.findMany({
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
        tx.inventory.count({ where }),
      ]);

      return { list, total, page: +page, pageSize: +pageSize };
    });
  }

  async findById(id: number, actor: InventoryActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedInventoryActor(tx, actor, "read");
      const inv = await tx.inventory.findUnique({
        where: { id },
        include: { sku: true, warehouse: true },
      });
      if (!inv) throw new NotFoundException("库存记录不存在");
      return inv;
    });
  }

  async updateStock(
    id: number,
    data: {
      type: "in" | "out" | "adjust";
      quantity: number;
      expectedQuantity: number;
      remark?: string;
    },
    actor: InventoryActor,
  ) {
    if (!Number.isSafeInteger(data.quantity) || data.quantity < 0) {
      throw new BadRequestException("数量必须为非负整数");
    }
    if (
      !Number.isSafeInteger(data.expectedQuantity)
      || data.expectedQuantity < 0
    ) {
      throw new BadRequestException("库存调整必须提供非负整数的调整前数量");
    }
    if (data.type !== "adjust" && data.quantity === 0) {
      throw new BadRequestException("入库或出库数量必须大于 0");
    }
    if (data.type === "out" && data.expectedQuantity < data.quantity) {
      throw new BadRequestException("库存不足");
    }
    const targetQuantity = data.type === "in"
      ? data.expectedQuantity + data.quantity
      : data.type === "out"
        ? data.expectedQuantity - data.quantity
        : data.quantity;
    if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0) {
      throw new BadRequestException("调整后的库存数量超出安全范围");
    }

    let changedProductId: number | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedActor = await this.lockAuthorizedInventoryActor(tx, actor, "write");
      const inv = await tx.inventory.findUnique({
        where: { id },
        select: { id: true, sku: { select: { productId: true } } },
      });
      if (!inv) throw new NotFoundException("库存记录不存在");
      const productId = inv.sku.productId;
      changedProductId = productId;
      await this.productsService.lockProductForTradeMutation(productId, tx);

      const changed = await tx.inventory.updateMany({
        where: { id, quantity: data.expectedQuantity },
        data: { quantity: targetQuantity },
      });
      if (changed.count === 0) {
        throw new ConflictException("库存已发生变化，请重新加载后再调整");
      }

      const result = await tx.inventory.findUniqueOrThrow({ where: { id } });
      if (targetQuantity === data.expectedQuantity) {
        changedProductId = null;
        return result;
      }
      await this.productsService.reconcileTradeRulesInTransaction(productId, tx);
      await tx.operationLog.create({
        data: {
          userId: lockedActor.id,
          action: "stock_update",
          module: "inventory",
          targetId: id,
          detail: JSON.stringify({
            type: data.type,
            quantity: data.quantity,
            before: data.expectedQuantity,
            after: result.quantity,
            remark: data.remark?.trim() || null,
          }),
        },
      });
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
  async listWarehouses(actor: InventoryActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedInventoryActor(tx, actor, "read");
      return tx.warehouse.findMany({
        orderBy: [{ isActive: "desc" }, { id: "asc" }],
        include: { _count: { select: { inventories: true } } },
      });
    });
  }

  async createWarehouse(data: CreateWarehouseDto, actor: InventoryActor) {
    const name = String(data.name || "").trim();
    if (!name) throw new BadRequestException("仓库名称不能为空");
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedInventoryActor(tx, actor, "write");
      // Schema 未对 name 建唯一约束（迁移前），先在服务层拒绝重名，避免库存归属出现同名歧义
      const duplicate = await tx.warehouse.findFirst({
        where: { name },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException("同名仓库已存在，请更换名称");
      return tx.warehouse.create({
        data: {
          name,
          type: data.type || "SHOWROOM",
          address: data.address?.trim() || null,
          contact: data.contact?.trim() || null,
          phone: data.phone?.trim() || null,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateWarehouse(
    id: number,
    data: UpdateWarehouseDto,
    actor: InventoryActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedInventoryActor(tx, actor, "write");
      await tx.$queryRaw(Prisma.sql`SELECT id FROM warehouses WHERE id = ${id} FOR UPDATE`);
      const warehouse = await tx.warehouse.findUnique({ where: { id } });
      if (!warehouse) throw new NotFoundException("仓库不存在");
      const updateData: Prisma.WarehouseUpdateInput = {};
      if (data.name !== undefined) {
        const name = String(data.name).trim();
        if (name && name !== warehouse.name) {
          const duplicate = await tx.warehouse.findFirst({
            where: { name },
            select: { id: true },
          });
          if (duplicate && duplicate.id !== id) {
            throw new ConflictException("同名仓库已存在，请更换名称");
          }
        }
        updateData.name = name;
      }
      if (data.type !== undefined) updateData.type = data.type;
      if (data.address !== undefined) updateData.address = data.address?.trim() || null;
      if (data.contact !== undefined) updateData.contact = data.contact?.trim() || null;
      if (data.phone !== undefined) updateData.phone = data.phone?.trim() || null;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      return tx.warehouse.update({ where: { id }, data: updateData });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
