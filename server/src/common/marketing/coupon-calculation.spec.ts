import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCoupon, type CouponLike } from './coupon-calculation';

const now = new Date('2026-08-26T08:00:00.000Z');
const baseCoupon: CouponLike = {
  id: 1,
  type: 'fixed',
  value: 100,
  minAmount: 500,
  startTime: new Date('2026-08-25T00:00:00.000Z'),
  endTime: new Date('2026-08-27T00:00:00.000Z'),
  isActive: true,
  usedCount: 0,
  totalCount: 10,
};

test('固定金额券以元配置并按整数分抵扣且不超过订单总额', () => {
  assert.deepEqual(evaluateCoupon(baseCoupon, 120_000, now), {
    ok: true,
    discountCents: 10_000,
  });
  assert.deepEqual(
    evaluateCoupon({ ...baseCoupon, value: 2_000, minAmount: 0 }, 50_000, now),
    { ok: true, discountCents: 50_000 },
  );
});

test('百分比券当前语义是立减比例而非折后比例', () => {
  assert.deepEqual(
    evaluateCoupon({ ...baseCoupon, type: 'percent', value: 10 }, 120_000, now),
    { ok: true, discountCents: 12_000 },
  );
});

test('百分比券拒绝小数和 100 以上比例', () => {
  const decimal = evaluateCoupon(
    { ...baseCoupon, type: 'percent', value: 9.5 },
    120_000,
    now,
  );
  const excessive = evaluateCoupon(
    { ...baseCoupon, type: 'percent', value: 100 },
    120_000,
    now,
  );
  assert.equal(decimal.ok, false);
  assert.equal(excessive.ok, false);
});

test('优惠券统一拒绝未生效 已过期 已领完和未达门槛', () => {
  const unavailable = [
    { ...baseCoupon, startTime: new Date('2026-08-27T00:00:00.000Z') },
    { ...baseCoupon, endTime: now },
    { ...baseCoupon, usedCount: 10 },
    { ...baseCoupon, minAmount: 2_000 },
  ];
  for (const coupon of unavailable) {
    assert.equal(evaluateCoupon(coupon, 120_000, now).ok, false);
  }
});
