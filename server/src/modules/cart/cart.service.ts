import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  private requireSessionId(sessionId?: string): string {
    if (!sessionId || sessionId.length > 100) {
      throw new BadRequestException('缺少有效的会话标识');
    }
    return sessionId;
  }

  private requireQuantity(quantity: number): number {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException('商品数量必须是 1 到 99 的整数');
    }
    return quantity;
  }

  async getCart(userId?: number, sessionId?: string) {
    const where: any = {};
    if (userId) where.userId = userId;
    else if (sessionId) where.sessionId = sessionId;
    else throw new BadRequestException('缺少用户标识');

    const items = await this.prisma.cart.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, code: true, materialType: true, goldWeight: true, price: true, images: { take: 1 } } },
        sku: { select: { id: true, skuCode: true, material: true, size: true, price: true, goldWeight: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items;
  }

  async addItem(data: { userId?: number; sessionId?: string; productId: number; skuId: number; quantity: number }) {
    const sessionId = data.userId ? data.sessionId : this.requireSessionId(data.sessionId);
    const quantity = this.requireQuantity(Number(data.quantity));
    const sku = await this.prisma.productSKU.findFirst({
      where: { id: data.skuId, productId: data.productId, isActive: true, product: { status: 'PUBLISHED', deletedAt: null } },
      select: { id: true },
    });
    if (!sku) throw new NotFoundException('商品规格不存在或当前不可购买');

    // Check if already in cart
    const existing = await this.prisma.cart.findFirst({
      where: {
        ...(data.userId ? { userId: data.userId } : { sessionId }),
        skuId: data.skuId,
      },
    });

    if (existing) {
      const nextQuantity = existing.quantity + quantity;
      this.requireQuantity(nextQuantity);
      return this.prisma.cart.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity },
      });
    }

    return this.prisma.cart.create({ data: { ...data, sessionId, quantity } });
  }

  async updateQuantity(id: number, quantity: number, sessionId?: string) {
    const ownerSessionId = this.requireSessionId(sessionId);
    const item = await this.prisma.cart.findFirst({ where: { id, sessionId: ownerSessionId } });
    if (!item) throw new NotFoundException('购物车商品不存在');
    if (quantity <= 0) {
      return this.prisma.cart.delete({ where: { id: item.id } });
    }
    return this.prisma.cart.update({ where: { id: item.id }, data: { quantity: this.requireQuantity(Number(quantity)) } });
  }

  async removeItem(id: number, sessionId?: string) {
    const ownerSessionId = this.requireSessionId(sessionId);
    const item = await this.prisma.cart.findFirst({ where: { id, sessionId: ownerSessionId } });
    if (!item) throw new NotFoundException('购物车商品不存在');
    return this.prisma.cart.delete({ where: { id: item.id } });
  }

  async clearCart(userId?: number, sessionId?: string) {
    const where: any = {};
    if (userId) where.userId = userId;
    else where.sessionId = this.requireSessionId(sessionId);

    return this.prisma.cart.deleteMany({ where });
  }
}
