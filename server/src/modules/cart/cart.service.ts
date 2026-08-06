import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

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
    if (!data.userId && !data.sessionId) throw new BadRequestException('缺少用户标识');

    // Check if already in cart
    const existing = await this.prisma.cart.findFirst({
      where: {
        ...(data.userId ? { userId: data.userId } : { sessionId: data.sessionId }),
        skuId: data.skuId,
      },
    });

    if (existing) {
      return this.prisma.cart.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + data.quantity },
      });
    }

    return this.prisma.cart.create({ data });
  }

  async updateQuantity(id: number, quantity: number) {
    if (quantity <= 0) {
      return this.prisma.cart.delete({ where: { id } });
    }
    return this.prisma.cart.update({ where: { id }, data: { quantity } });
  }

  async removeItem(id: number) {
    return this.prisma.cart.delete({ where: { id } });
  }

  async clearCart(userId?: number, sessionId?: string) {
    const where: any = {};
    if (userId) where.userId = userId;
    else if (sessionId) where.sessionId = sessionId;

    return this.prisma.cart.deleteMany({ where });
  }
}
