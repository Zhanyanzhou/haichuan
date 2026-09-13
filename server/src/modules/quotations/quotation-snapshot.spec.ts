import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import {
  computeFinalQuoteAmounts,
  hashBusinessSnapshot,
  resolveWaxRate,
  roundMoney,
  roundWeight,
} from './quotation-snapshot';

test('合作蜡价优先使用完整客户协议并保留协议来源', () => {
  const result = resolveWaxRate('PURPLE', {
    id: 9,
    redWaxRate: new Prisma.Decimal('29.00'),
    purpleWaxRate: new Prisma.Decimal('23.50'),
  });
  assert.equal(result.rate.toFixed(2), '23.50');
  assert.equal(result.source, 'CUSTOMER_AGREEMENT');
  assert.equal(result.agreementId, 9);
});

test('没有有效客户协议时使用 D.19 红 25 紫 20 的版本化默认价', () => {
  assert.equal(resolveWaxRate('RED').rate.toFixed(2), '25.00');
  assert.equal(resolveWaxRate('PURPLE').rate.toFixed(2), '20.00');
  assert.equal(resolveWaxRate('RED').source, 'SYSTEM_DEFAULT_D19_V1');
});

test('金额逐行 ROUND_HALF_UP 到两位且重量固定三位', () => {
  assert.equal(roundMoney(new Prisma.Decimal('1.005')).toFixed(2), '1.01');
  assert.equal(roundWeight(new Prisma.Decimal('1.2345')).toFixed(3), '1.235');
});

test('交易快照哈希不受对象键顺序影响且内容变化必然改变', () => {
  const left = { schemaVersion: 2, amounts: { totalAmount: '10.00' }, channel: 'CUSTOM' };
  const reordered = { channel: 'CUSTOM', amounts: { totalAmount: '10.00' }, schemaVersion: 2 };
  const changed = { channel: 'CUSTOM', amounts: { totalAmount: '11.00' }, schemaVersion: 2 };
  assert.equal(hashBusinessSnapshot(left), hashBusinessSnapshot(reordered));
  assert.notEqual(hashBusinessSnapshot(left), hashBusinessSnapshot(changed));
});

test('CUSTOM 的最终报价行不再重复扣减草稿原价差额', () => {
  const amounts = computeFinalQuoteAmounts(['80.00'], []);
  assert.equal(amounts.subtotalAmount.toFixed(2), '80.00');
  assert.equal(amounts.discountAmount.toFixed(2), '0.00');
  assert.equal(amounts.totalAmount.toFixed(2), '80.00');
});

test('最终报价允许高于草稿原价且费用只加一次', () => {
  const amounts = computeFinalQuoteAmounts(['120.00'], ['5.25', '1.00']);
  assert.equal(amounts.discountAmount.toFixed(2), '0.00');
  assert.equal(amounts.feeAmount.toFixed(2), '6.25');
  assert.equal(amounts.totalAmount.toFixed(2), '126.25');
});

test('PARTNER 成交额只取蜡重克价形成的版本行，不受草稿展示价影响', () => {
  const confirmedWaxLine = new Prisma.Decimal('3.200').mul('25.00');
  const amounts = computeFinalQuoteAmounts([confirmedWaxLine], ['2.50']);
  assert.equal(amounts.subtotalAmount.toFixed(2), '80.00');
  assert.equal(amounts.discountAmount.toFixed(2), '0.00');
  assert.equal(amounts.totalAmount.toFixed(2), '82.50');
});
