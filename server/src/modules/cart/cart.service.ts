import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ProductsService } from '../products/products.service';
import {
  directPurchaseProductWhere,
  resolveCustomerProductVisibilities,
  type CustomerProductAccess,
} from '../products/product-eligibility';

type Owner = {
  userId?: number;
  sessionId?: string;
  customer?: CustomerProductAccess;
};

@Injectable()
export class CartService {
  constructor(
    private prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  /** 解析购物车归属：登录客户优先，否则使用会话标识 */
  private resolveOwner(owner: Owner): { userId: number } | { sessionId: string } {
    const userId = owner.userId;
    if (userId) return { userId };
    if (owner.sessionId && owner.sessionId.length > 0 && owner.sessionId.length <= 100) {
      return { sessionId: owner.sessionId };
    }
    throw new BadRequestException('缺少有效的会话标识');
  }

  private validSessionId(sessionId?: string): sessionId is string {
    return Boolean(sessionId && sessionId.length > 0 && sessionId.length <= 100);
  }

  /**
   * 登录客户携带原游客会话时，原子地把该会话购物车归并到客户。
   * 只认领 userId 为空的行，不会改动其他客户的购物车。
   */
  private async mergeSessionCart(userId: number, sessionId: string) {
    await this.prisma.$transaction(async (tx) => {
      const guestItems = await tx.cart.findMany({
        where: { userId: null, sessionId },
        include: {
          sku: {
            select: {
              product: { select: { inventoryPolicy: true } },
            },
          },
        },
        orderBy: { id: 'asc' },
      });
      if (guestItems.length === 0) return;

      const customerItems = await tx.cart.findMany({
        where: {
          userId,
          skuId: { in: [...new Set(guestItems.map((item) => item.skuId))] },
        },
        select: { id: true, skuId: true, quantity: true },
        orderBy: { id: 'asc' },
      });
      const customerItemBySku = new Map(
        customerItems.map((item) => [item.skuId, item]),
      );

      for (const guestItem of guestItems) {
        const maxQuantity = guestItem.sku.product.inventoryPolicy === 'SINGLE_UNIT' ? 1 : 99;
        const existing = customerItemBySku.get(guestItem.skuId);
        if (existing) {
          const quantity = Math.min(maxQuantity, existing.quantity + guestItem.quantity);
          await tx.cart.update({
            where: { id: existing.id },
            data: { quantity },
          });
          await tx.cart.deleteMany({
            where: { id: guestItem.id, userId: null, sessionId },
          });
          existing.quantity = quantity;
          continue;
        }

        const quantity = Math.min(maxQuantity, Math.max(1, guestItem.quantity));
        const claimed = await tx.cart.updateMany({
          where: { id: guestItem.id, userId: null, sessionId },
          data: { userId, sessionId: null, quantity },
        });
        if (claimed.count === 1) {
          customerItemBySku.set(guestItem.skuId, {
            id: guestItem.id,
            skuId: guestItem.skuId,
            quantity,
          });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async prepareOwner(owner: Owner) {
    const resolved = this.resolveOwner(owner);
    if ('userId' in resolved && owner.sessionId && this.validSessionId(owner.sessionId)) {
      await this.mergeSessionCart(resolved.userId, owner.sessionId);
    }
    return resolved;
  }

  private requireQuantity(quantity: number): number {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException('商品数量必须是 1 到 99 的整数');
    }
    return quantity;
  }

  async getCart(owner: Owner) {
    const where = await this.prepareOwner(owner);
    const items = await this.prisma.cart.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            materialType: true,
            goldWeight: true,
            price: true,
            inventoryPolicy: true,
            status: true,
            visibility: true,
            salesMode: true,
            deletedAt: true,
            images: { take: 1 },
          },
        },
        sku: {
          select: {
            id: true,
            productId: true,
            skuCode: true,
            material: true,
            size: true,
            price: true,
            goldWeight: true,
            isActive: true,
            inventories: { select: { quantity: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const visibleVisibilities = resolveCustomerProductVisibilities(owner.customer);
    return items.map((item) => {
      const productUnavailable =
        item.product.deletedAt !== null ||
        item.product.status !== 'PUBLISHED' ||
        !visibleVisibilities.includes(item.product.visibility) ||
        item.product.salesMode !== 'DIRECT_PURCHASE';
      const skuUnavailable =
        !item.sku.isActive || item.sku.productId !== item.productId;
      const availableStock = (item.sku.inventories ?? []).reduce(
        (sum, inventory) => sum + Math.max(0, inventory.quantity),
        0,
      );
      const quantityInvalid =
        item.quantity < 1 ||
        item.quantity > 99 ||
        (item.product.inventoryPolicy === 'SINGLE_UNIT' && item.quantity !== 1);

      const availability = productUnavailable
        ? {
            available: false,
            status: 'PRODUCT_UNAVAILABLE' as const,
            message: '商品已下架或不再支持直接购买，请移除后重新选购',
          }
        : skuUnavailable
          ? {
              available: false,
              status: 'SKU_UNAVAILABLE' as const,
              message: '所选规格已停用，请移除后重新选择规格',
            }
          : quantityInvalid
            ? {
                available: false,
                status: 'QUANTITY_INVALID' as const,
                message: '商品数量不符合当前购买规则，请调整后重试',
              }
            : availableStock <= 0
              ? {
                  available: false,
                  status: 'OUT_OF_STOCK' as const,
                  message: '所选规格暂时无库存，请移除或稍后重试',
                }
              : availableStock < item.quantity
                ? {
                    available: false,
                    status: 'INSUFFICIENT_STOCK' as const,
                    message: '库存已发生变化，请减少数量后重试',
                  }
                : {
                    available: true,
                    status: 'AVAILABLE' as const,
                    message: null,
                  };

      return {
        ...item,
        availability,
      };
    });
  }

  async addItem(data: Owner & { productId: number; skuId: number; quantity: number }) {
    const owner = await this.prepareOwner(data);
    const quantity = this.requireQuantity(Number(data.quantity));
    const run = () => this.prisma.$transaction(async (tx) => {
      const sku = await tx.productSKU.findFirst({
        where: {
          id: data.skuId,
          productId: data.productId,
          isActive: true,
          product: directPurchaseProductWhere(data.customer),
        },
        select: {
          id: true,
          product: { select: { inventoryPolicy: true } },
          inventories: { select: { quantity: true } },
        },
      });
      if (!sku) throw new BadRequestException('该商品不支持直接购买，请通过咨询/预约选购');
      if (sku.product.inventoryPolicy === 'SINGLE_UNIT') {
        await this.productsService.lockProductForTradeMutation(data.productId, tx);
        if (quantity !== 1) {
          throw new ConflictException('一物一件商品每次只能购买 1 件');
        }
      }
      const inventories = sku.product.inventoryPolicy === 'SINGLE_UNIT'
        ? await tx.inventory.findMany({
            where: { skuId: sku.id },
            select: { quantity: true },
          })
        : sku.inventories;
      const availableStock = inventories.reduce(
        (sum, inventory) => sum + Math.max(0, inventory.quantity),
        0,
      );
      const existing = await tx.cart.findFirst({
        where: { ...owner, skuId: data.skuId },
      });
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      if (sku.product.inventoryPolicy === 'SINGLE_UNIT' && nextQuantity > 1) {
        throw new ConflictException('一物一件商品在购物车中最多保留 1 件');
      }
      if (availableStock < nextQuantity) {
        throw new ConflictException('商品库存不足，请刷新后重试');
      }
      if (existing) {
        const result = await tx.cart.updateMany({
          where: { id: existing.id, quantity: { lte: 99 - quantity } },
          data: { quantity: { increment: quantity } },
        });
        if (result.count === 0) {
          throw new BadRequestException("商品数量不能超过 99");
        }
        return tx.cart.findUniqueOrThrow({ where: { id: existing.id } });
      }
      return tx.cart.create({
        data: { ...owner, productId: data.productId, skuId: data.skuId, quantity },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await run();
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034');
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new ConflictException('购物车更新冲突，请重试');
  }

  async updateQuantity(id: number, quantity: number, owner: Owner) {
    const where = await this.prepareOwner(owner);
    const item = await this.prisma.cart.findFirst({
      where: {
        id,
        ...where,
        sku: {
          isActive: true,
          product: directPurchaseProductWhere(owner.customer),
        },
      },
      include: {
        sku: {
          select: {
            inventories: { select: { quantity: true } },
            product: { select: { inventoryPolicy: true } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('购物车商品不存在');
    if (quantity <= 0) {
      return this.prisma.cart.delete({ where: { id: item.id } });
    }
    const normalized = this.requireQuantity(Number(quantity));
    if (item.sku.product.inventoryPolicy === 'SINGLE_UNIT' && normalized !== 1) {
      throw new ConflictException('一物一件商品在购物车中最多保留 1 件');
    }
    const availableStock = item.sku.inventories.reduce(
      (sum, inventory) => sum + Math.max(0, inventory.quantity),
      0,
    );
    if (availableStock < normalized) {
      throw new ConflictException('商品库存不足，请刷新后重试');
    }
    return this.prisma.cart.update({ where: { id: item.id }, data: { quantity: normalized } });
  }

  async removeItem(id: number, owner: Owner) {
    const where = await this.prepareOwner(owner);
    const item = await this.prisma.cart.findFirst({ where: { id, ...where } });
    if (!item) throw new NotFoundException('购物车商品不存在');
    return this.prisma.cart.delete({ where: { id: item.id } });
  }

  async clearCart(owner: Owner) {
    const where = await this.prepareOwner(owner);
    return this.prisma.cart.deleteMany({ where });
  }
}
