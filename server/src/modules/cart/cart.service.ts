import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ProductsService } from '../products/products.service';

type Owner = { userId?: number; sessionId?: string };

@Injectable()
export class CartService {
  constructor(
    private prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  /** 解析购物车归属：登录客户优先，否则使用会话标识 */
  private resolveOwner(owner: Owner) {
    if (owner.userId) return { userId: owner.userId };
    if (owner.sessionId && owner.sessionId.length > 0 && owner.sessionId.length <= 100) {
      return { sessionId: owner.sessionId };
    }
    throw new BadRequestException('缺少有效的会话标识');
  }

  private requireQuantity(quantity: number): number {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException('商品数量必须是 1 到 99 的整数');
    }
    return quantity;
  }

  async getCart(owner: Owner) {
    const where = this.resolveOwner(owner);
    return this.prisma.cart.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, code: true, materialType: true, goldWeight: true, price: true, images: { take: 1 } } },
        sku: { select: { id: true, skuCode: true, material: true, size: true, price: true, goldWeight: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addItem(data: Owner & { productId: number; skuId: number; quantity: number }) {
    const owner = this.resolveOwner(data);
    const quantity = this.requireQuantity(Number(data.quantity));
    return this.prisma.$transaction(async (tx) => {
      const sku = await tx.productSKU.findFirst({
        where: {
          id: data.skuId,
          productId: data.productId,
          isActive: true,
          product: { status: 'PUBLISHED', deletedAt: null, salesMode: 'DIRECT_PURCHASE' },
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async updateQuantity(id: number, quantity: number, owner: Owner) {
    const where = this.resolveOwner(owner);
    const item = await this.prisma.cart.findFirst({
      where: { id, ...where },
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
    const where = this.resolveOwner(owner);
    const item = await this.prisma.cart.findFirst({ where: { id, ...where } });
    if (!item) throw new NotFoundException('购物车商品不存在');
    return this.prisma.cart.delete({ where: { id: item.id } });
  }

  async clearCart(owner: Owner) {
    const where = this.resolveOwner(owner);
    return this.prisma.cart.deleteMany({ where });
  }
}
