import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class MarketingService {
  constructor(private prisma: PrismaService) {}

  // Promotions
  async getPromotions() { return this.prisma.promotion.findMany({ where: { isActive: true }, orderBy: { startTime: 'desc' } }); }
  async createPromotion(data: any) { return this.prisma.promotion.create({ data }); }
  async updatePromotion(id: number, data: any) { return this.prisma.promotion.update({ where: { id }, data }); }
  async deletePromotion(id: number) { return this.prisma.promotion.update({ where: { id }, data: { isActive: false } }); }

  // Coupons
  async getCoupons() { return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }); }
  async createCoupon(data: any) { return this.prisma.coupon.create({ data }); }
  async updateCoupon(id: number, data: any) { return this.prisma.coupon.update({ where: { id }, data }); }
  async getCouponStats() {
    const [total, active, totalUsed] = await Promise.all([
      this.prisma.coupon.count(),
      this.prisma.coupon.count({ where: { isActive: true, endTime: { gte: new Date() } } }),
      this.prisma.coupon.aggregate({ _sum: { usedCount: true } }),
    ]);
    return { total, active, totalUsed: totalUsed._sum.usedCount || 0 };
  }
}
