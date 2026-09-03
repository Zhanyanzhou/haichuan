import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { evaluateCoupon } from '../../common/marketing/coupon-calculation';
import {
  CouponTypeInput,
  type CreateCouponDto,
  type UpdateCouponDto,
} from './dto/coupon.dto';
import type {
  CreatePromotionDto,
  UpdatePromotionDto,
} from './dto/promotion.dto';
import { Prisma } from '@prisma/client';

const COUPON_ECONOMIC_FIELDS = [
  'name',
  'type',
  'value',
  'minAmount',
  'totalCount',
  'startTime',
  'endTime',
] as const;

type NormalizedCreateCouponInput = Omit<CreateCouponDto, 'startTime' | 'endTime'> & {
  startTime: Date;
  endTime: Date;
};

type NormalizedUpdateCouponInput = Omit<UpdateCouponDto, 'startTime' | 'endTime'> & {
  startTime?: Date;
  endTime?: Date;
};

function toPrismaJsonObject(
  value: Record<string, unknown>,
): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCouponInput(data: CreateCouponDto): NormalizedCreateCouponInput;
  private normalizeCouponInput(data: UpdateCouponDto): NormalizedUpdateCouponInput;
  private normalizeCouponInput(data: CreateCouponDto | UpdateCouponDto) {
    return {
      ...data,
      ...(data.startTime !== undefined
        ? { startTime: new Date(data.startTime) }
        : {}),
      ...(data.endTime !== undefined ? { endTime: new Date(data.endTime) } : {}),
    };
  }

  private assertCouponTerms(data: {
    type: string;
    value: unknown;
    minAmount?: unknown;
    totalCount?: unknown;
    startTime: Date | string;
    endTime: Date | string;
  }) {
    const value = Number(data.value);
    const minAmount = Number(data.minAmount ?? 0);
    const totalCount = Number(data.totalCount ?? 100);
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    if (data.type !== CouponTypeInput.FIXED && data.type !== CouponTypeInput.PERCENT) {
      throw new BadRequestException('优惠券类型只允许 fixed 或 percent');
    }
    if (!Number.isFinite(value) || value <= 0 || Math.round(value * 100) !== value * 100) {
      throw new BadRequestException('优惠券面值必须是最多两位小数的正数');
    }
    if (data.type === CouponTypeInput.PERCENT && (!Number.isInteger(value) || value > 99)) {
      throw new BadRequestException('立减比例必须是 1-99 的整数');
    }
    if (!Number.isFinite(minAmount) || minAmount < 0 || Math.round(minAmount * 100) !== minAmount * 100) {
      throw new BadRequestException('最低消费金额必须是最多两位小数的非负数');
    }
    if (!Number.isInteger(totalCount) || totalCount < 1) {
      throw new BadRequestException('发行量必须是正整数');
    }
    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      endTime.getTime() <= startTime.getTime()
    ) {
      throw new BadRequestException('优惠券结束时间必须晚于开始时间');
    }
  }

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
  async createPromotion(data: CreatePromotionDto) {
    return this.prisma.promotion.create({
      data: { ...data, rule: toPrismaJsonObject(data.rule) },
    });
  }
  async updatePromotion(id: number, data: UpdatePromotionDto) {
    const { rule, ...fields } = data;
    return this.prisma.promotion.update({
      where: { id },
      data: {
        ...fields,
        ...(rule ? { rule: toPrismaJsonObject(rule) } : {}),
      },
    });
  }
  async deletePromotion(id: number) { return this.prisma.promotion.update({ where: { id }, data: { isActive: false } }); }

  // Coupons
  // 管理端整表读取加安全上限：防止数据增长后无界查询拖垮内存与响应。
  async getCoupons() {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
  async createCoupon(data: CreateCouponDto) {
    const normalized = this.normalizeCouponInput(data);
    this.assertCouponTerms(normalized);
    return this.prisma.coupon.create({ data: normalized });
  }

  async updateCoupon(id: number, data: UpdateCouponDto) {
    const current = await this.prisma.coupon.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('优惠券不存在');

    const economicFields = COUPON_ECONOMIC_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(data, field),
    );
    if (current.usedCount > 0 && economicFields.length > 0) {
      throw new BadRequestException('已使用的优惠券只能启用或停用；如需调整规则，请创建新券');
    }
    if (Object.keys(data).length === 0) return current;

    const normalized = this.normalizeCouponInput(data);
    const merged = { ...current, ...normalized };
    this.assertCouponTerms(merged);

    if (economicFields.length === 0) {
      return this.prisma.coupon.update({
        where: { id },
        data: { isActive: normalized.isActive },
      });
    }

    const updated = await this.prisma.coupon.updateMany({
      where: { id, usedCount: 0 },
      data: normalized,
    });
    if (updated.count === 0) {
      throw new ConflictException('优惠券已被使用或规则已变化，请刷新后重试');
    }
    const result = await this.prisma.coupon.findUnique({ where: { id } });
    if (!result) throw new NotFoundException('优惠券不存在');
    return result;
  }
  async getCouponStats() {
    const [total, active, totalUsed] = await Promise.all([
      this.prisma.coupon.count(),
      this.prisma.coupon.count({ where: { isActive: true, endTime: { gte: new Date() } } }),
      this.prisma.coupon.aggregate({ _sum: { usedCount: true } }),
    ]);
    return { total, active, totalUsed: totalUsed._sum.usedCount || 0 };
  }
}
