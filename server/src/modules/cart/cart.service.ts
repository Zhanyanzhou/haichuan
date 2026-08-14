import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

type Owner = { userId?: number; sessionId?: string };

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

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
    const sku = await this.prisma.productSKU.findFirst({
      where: {
        id: data.skuId,
        productId: data.productId,
        isActive: true,
        product: { status: 'PUBLISHED', deletedAt: null, salesMode: 'DIRECT_PURCHASE' },
      },
      select: { id: true },
    });
    if (!sku) throw new BadRequestException('该商品不支持直接购买，请通过咨询/预约选购');

    const existing = await this.prisma.cart.findFirst({
      where: { ...owner, skuId: data.skuId },
    });

    if (existing) {
      // 原子条件更新:仅当 increment 后不超过 99 才执行,避免并发读-写覆盖与超限
      const result = await this.prisma.cart.updateMany({
        where: { id: existing.id, quantity: { lte: 99 - quantity } },
        data: { quantity: { increment: quantity } },
      });
      if (result.count === 0) {
        throw new BadRequestException("商品数量不能超过 99");
      }
      return this.prisma.cart.findUniqueOrThrow({ where: { id: existing.id } });
    }

    return this.prisma.cart.create({ data: { ...owner, productId: data.productId, skuId: data.skuId, quantity } });
  }

  async updateQuantity(id: number, quantity: number, owner: Owner) {
    const where = this.resolveOwner(owner);
    const item = await this.prisma.cart.findFirst({ where: { id, ...where } });
    if (!item) throw new NotFoundException('购物车商品不存在');
    if (quantity <= 0) {
      return this.prisma.cart.delete({ where: { id: item.id } });
    }
    return this.prisma.cart.update({ where: { id: item.id }, data: { quantity: this.requireQuantity(Number(quantity)) } });
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
