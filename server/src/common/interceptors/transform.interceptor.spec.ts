import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { normalizeDecimals } from './transform.interceptor';

// Decimal 全局归一化合同：Prisma Decimal 在统一响应出口必须变成 number，
// 与客户端金额类型声明一致；其余 JSON 值原样保留。
test('顶层与嵌套的 Decimal 都归一化为 number', () => {
  const input = {
    totalAmount: new Prisma.Decimal('1999.99'),
    items: [
      { unitPrice: new Prisma.Decimal('128.00'), name: '足金手镯' },
      { unitPrice: new Prisma.Decimal('0.01'), name: '配件' },
    ],
    nested: { deep: { price: new Prisma.Decimal('99999999.99') } },
  };

  const output = normalizeDecimals(input) as typeof input & {
    items: Array<{ unitPrice: number }>;
    nested: { deep: { price: number } };
  };

  assert.equal(output.totalAmount, 1999.99);
  assert.equal(output.items[0].unitPrice, 128);
  assert.equal(output.items[1].unitPrice, 0.01);
  assert.equal(output.nested.deep.price, 99999999.99);
});

test('普通 JSON 值与 Date 原样保留', () => {
  const date = new Date('2026-09-03T00:00:00.000Z');
  const input = {
    code: 'HC-001',
    count: 3,
    active: true,
    empty: null,
    createdAt: date,
    list: [],
  };

  const output = normalizeDecimals(input);

  assert.deepEqual(output, input);
  assert.equal((output as typeof input).createdAt, date);
});

test('数组、null 与原始类型直接返回', () => {
  assert.equal(normalizeDecimals(new Prisma.Decimal('12.34')), 12.34);
  assert.equal(normalizeDecimals(42), 42);
  assert.equal(normalizeDecimals('text'), 'text');
  assert.equal(normalizeDecimals(null), null);
  assert.deepEqual(normalizeDecimals([1, 'a', null]), [1, 'a', null]);
});
