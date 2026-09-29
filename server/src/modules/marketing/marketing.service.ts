import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  CustomerPrincipal,
  StaffPrincipal,
} from '../../common/security/authenticated-principal';
import { evaluateCoupon } from '../../common/marketing/coupon-calculation';
import { lockActiveCustomerForRead } from '../customers/customer-write-gate';
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

type MarketingActor = Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>;

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

  private async lockAuthorizedActor(
    transaction: Prisma.TransactionClient,
    actor: MarketingActor,
    mode: 'read' | 'write' = 'write',
  ): Promise<void> {
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException('当前员工已停用或无权访问营销管理');
    }
    const locked = mode === 'read'
      ? await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR SHARE`,
        )
      : await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR UPDATE`,
        );
    if (locked.length !== 1) {
      throw new ForbiddenException('当前员工已停用或无权访问营销管理');
    }
    if (!actor.sessionFamilyId) return;
    const sessions = mode === 'read'
      ? await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
        )
      : await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
        );
    if (sessions.length !== 1) {
      throw new ForbiddenException('当前员工会话已失效，不能访问营销管理');
    }
  }

  private async lockPromotion(
    transaction: Prisma.TransactionClient,
    promotionId: number,
  ): Promise<void> {
    const locked = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM promotions WHERE id = ${promotionId} FOR UPDATE`,
    );
    if (locked.length !== 1) {
      throw new NotFoundException('促销活动不存在');
    }
  }

  private async lockCoupon(
    transaction: Prisma.TransactionClient,
    couponId: number,
  ): Promise<void> {
    const locked = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM coupons WHERE id = ${couponId} FOR UPDATE`,
    );
    if (locked.length !== 1) {
      throw new NotFoundException('优惠券不存在');
    }
  }

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
  private async listUsableCouponsInTransaction(
    transaction: Prisma.TransactionClient,
    amountCents: number,
  ) {
    const cents = Math.max(Math.round(amountCents) || 0, 0);
    const now = new Date();
    const candidates = await transaction.coupon.findMany({
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

  async listUsableCoupons(
    amountCents: number,
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, customer);
      return this.listUsableCouponsInTransaction(transaction, amountCents);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listUsableCouponsForStaff(
    amountCents: number,
    actor: MarketingActor,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedActor(transaction, actor, 'read');
      return this.listUsableCouponsInTransaction(transaction, amountCents);
    });
  }

  // Promotions
  async getPromotions(actor: MarketingActor) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedActor(transaction, actor, 'read');
      return transaction.promotion.findMany({
        where: { isActive: true },
        orderBy: { startTime: 'desc' },
      });
    });
  }

  async createPromotion(data: CreatePromotionDto, actor: MarketingActor) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedActor(transaction, actor);
      return transaction.promotion.create({
        data: { ...data, rule: toPrismaJsonObject(data.rule) },
      });
    });
  }

  async updatePromotion(
    id: number,
    data: UpdatePromotionDto,
    actor: MarketingActor,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedActor(transaction, actor);
      await this.lockPromotion(transaction, id);
      const { rule, ...fields } = data;
      return transaction.promotion.update({
        where: { id },
        data: {
          ...fields,
          ...(rule ? { rule: toPrismaJsonObject(rule) } : {}),
        },
      });
    });
  }

  async deletePromotion(id: number, actor: MarketingActor) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedActor(transaction, actor);
      await this.lockPromotion(transaction, id);
      return transaction.promotion.update({
        where: { id },
        data: { isActive: false },
      });
    });
  }

  // Coupons
  // 管理端整表读取加安全上限：防止数据增长后无界查询拖垮内存与响应。
  async getCoupons(actor: MarketingActor) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedActor(transaction, actor, 'read');
      return transaction.coupon.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
    });
  }

  async createCoupon(data: CreateCouponDto, actor: MarketingActor) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedActor(transaction, actor);
      const normalized = this.normalizeCouponInput(data);
      this.assertCouponTerms(normalized);
      return transaction.coupon.create({ data: normalized });
    });
  }

  async updateCoupon(
    id: number,
    data: UpdateCouponDto,
    actor: MarketingActor,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedActor(transaction, actor);
      await this.lockCoupon(transaction, id);
      const current = await transaction.coupon.findUnique({ where: { id } });
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
        return transaction.coupon.update({
          where: { id },
          data: { isActive: normalized.isActive },
        });
      }

      const updated = await transaction.coupon.updateMany({
        where: { id, usedCount: 0 },
        data: normalized,
      });
      if (updated.count === 0) {
        throw new ConflictException('优惠券已被使用或规则已变化，请刷新后重试');
      }
      const result = await transaction.coupon.findUnique({ where: { id } });
      if (!result) throw new NotFoundException('优惠券不存在');
      return result;
    });
  }

  async getCouponStats(actor: MarketingActor) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedActor(transaction, actor, 'read');
      const [total, active, totalUsed] = await Promise.all([
        transaction.coupon.count(),
        transaction.coupon.count({
          where: { isActive: true, endTime: { gte: new Date() } },
        }),
        transaction.coupon.aggregate({ _sum: { usedCount: true } }),
      ]);
      return { total, active, totalUsed: totalUsed._sum.usedCount || 0 };
    });
  }
}
