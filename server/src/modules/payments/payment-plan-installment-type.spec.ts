import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInstallmentPaymentType } from './payment-plan-installment-type';

const base = {
  finalCents: 10_000,
  depositCents: 3_000,
  balanceCents: 7_000,
  installmentCount: 2,
};

test('付款角色覆盖两期、100% 定金和零定金全款合同', () => {
  assert.equal(resolveInstallmentPaymentType({
    ...base,
    sequence: 1,
    label: '定金',
    amountCents: 3_000,
  }), 'DEPOSIT');
  assert.equal(resolveInstallmentPaymentType({
    ...base,
    sequence: 2,
    label: '尾款',
    amountCents: 7_000,
  }), 'BALANCE');
  assert.equal(resolveInstallmentPaymentType({
    ...base,
    depositCents: 10_000,
    balanceCents: 0,
    installmentCount: 1,
    sequence: 1,
    label: '定金',
    amountCents: 10_000,
  }), 'DEPOSIT');
  assert.equal(resolveInstallmentPaymentType({
    ...base,
    depositCents: 0,
    balanceCents: 10_000,
    installmentCount: 1,
    sequence: 1,
    label: '全款',
    amountCents: 10_000,
  }), 'FULL');
});

test('冻结拆分、顺序、标签、金额或期数漂移时失败关闭', () => {
  for (const input of [
    { ...base, finalCents: 9_999, sequence: 1, label: '定金', amountCents: 3_000 },
    { ...base, sequence: 1, label: '全款', amountCents: 3_000 },
    { ...base, sequence: 1, label: '定金', amountCents: 2_999 },
    { ...base, installmentCount: 1, sequence: 1, label: '定金', amountCents: 3_000 },
    { ...base, sequence: 3, label: '尾款', amountCents: 7_000 },
  ]) {
    assert.equal(resolveInstallmentPaymentType(input), null);
  }
});
