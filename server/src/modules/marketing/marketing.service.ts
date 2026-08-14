import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { evaluateCoupon } from '../../common/marketing/coupon-calculation';

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 建单可用券查询（营销生效）：按订单金额试算每张券的折扣，
   * 试算公式与建单核销共用 common/marketing/coupon-calculation（单一公式来源）。
   */
  async listUsableCoupons(amountCents: number) {
    const cents = Math.max(Math.round(amountCents) || 0, 0);
    const now = new Date();
    const candidates = await this.prisma.coupon.findMany({
      where: {
        isActive: true,
        startTime: { lte: now },
        endTime: { gt: now },
        usedCount: { lt: this.prisma.coupon.fields.totalCount },
      },
      orderBy: { minAmount: 'desc' },
    });
    return candidates
      .map((coupon) => {
        // Prisma Coupon 结构性满足 CouponLike（Decimal 经 NumericLike 兼容），无需断言
        const evaluation = evaluateCoupon(coupon, cents, now);
        return {
          id: coupon.id,
          name: coupon.name,
          type: coupon.type,
          value: coupon.value,
          minAmount: coupon.minAmount,
          endTime: coupon.endTime,
          remaining: coupon.totalCount - coupon.usedCount,
          usable: evaluation.ok,
          reason: evaluation.ok ? null : evaluation.reason,
          // 该券对本单的预估折扣（分→元，两位小数）
          estimatedDiscount: evaluation.ok ? evaluation.discountCents / 100 : 0,
        };
      })
      .filter((item) => item.usable || cents === 0);
  }

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
