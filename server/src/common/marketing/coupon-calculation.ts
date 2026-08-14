/**
 * 优惠券校验与折扣试算（营销生效·交易解冻筹备）。
 * 单一公式来源：orders.service（建单核销）与 marketing.service（可用券查询）
 * 必须共用本模块，禁止各自实现（吸取"订单统计三口径"教训）。
 * 金额一律整数分计算，规避浮点误差。
 */

export interface CouponLike {
  id: number;
  /** fixed 固定面值（元）| percent 折扣率（1-99，代表百分比） */
  type: string;
  /** 兼容 Prisma.Decimal（有 toNumber）与 string/number 的宽松数值，调用方传入 Prisma Coupon 可直接结构匹配 */
  value: NumericLike;
  minAmount: NumericLike;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  usedCount: number;
  totalCount: number;
}

/** 宽松数值：string / number / Prisma.Decimal（结构上以 toNumber() 区分普通对象） */
export type NumericLike = string | number | { toNumber(): number };

export type CouponEvaluation =
  | { ok: true; discountCents: number }
  | { ok: false; reason: string };

export function evaluateCoupon(
  coupon: CouponLike,
  totalCents: number,
  now: Date = new Date(),
): CouponEvaluation {
  if (!coupon.isActive) return { ok: false, reason: '优惠券已停用' };
  if (now < new Date(coupon.startTime)) return { ok: false, reason: '优惠券未到生效时间' };
  if (now >= new Date(coupon.endTime)) return { ok: false, reason: '优惠券已过期' };
  if (coupon.usedCount >= coupon.totalCount) return { ok: false, reason: '优惠券已被领完' };
  if (totalCents <= 0) return { ok: false, reason: '订单金额无效' };

  const minAmountCents = Math.round(Number(coupon.minAmount) * 100);
  if (totalCents < minAmountCents) {
    return { ok: false, reason: `订单金额未满足券的最低使用门槛（${Number(coupon.minAmount)} 元）` };
  }

  const value = Number(coupon.value);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: '优惠券面值非法' };

  let discountCents: number;
  if (coupon.type === 'fixed') {
    // 固定面值：折扣封顶不超过订单应收
    discountCents = Math.min(Math.round(value * 100), totalCents);
  } else if (coupon.type === 'percent') {
    // 折扣率：1-99 整数百分比；折扣封顶不超过订单应收
    if (!Number.isInteger(value) || value > 99) return { ok: false, reason: '折扣率必须是 1-99 的整数' };
    discountCents = Math.min(Math.round((totalCents * value) / 100), totalCents);
  } else {
    return { ok: false, reason: `未知优惠券类型: ${coupon.type}` };
  }
  return { ok: true, discountCents };
}
