import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderListQueryDto } from './dto/order-query.dto';
import { PaymentQueryDto, ReviewPaymentDto } from '../payments/dto/payment.dto';
import { RefundQueryDto } from '../refunds/dto/refund.dto';
import { FulfillmentQueryDto } from '../fulfillment/dto/fulfillment.dto';
import { AfterSalesQueryDto } from '../after-sales/dto/after-sales.dto';

async function isValid<T extends object>(type: new () => T, value: object) {
  return (await validate(plainToInstance(type, value))).length === 0;
}

test('交易列表统一限制页码、页大小、枚举和搜索词长度', async () => {
  for (const type of [
    OrderListQueryDto,
    PaymentQueryDto,
    RefundQueryDto,
    FulfillmentQueryDto,
    AfterSalesQueryDto,
  ]) {
    assert.equal(await isValid(type, { page: 10_001 }), false);
    assert.equal(await isValid(type, { pageSize: 101 }), false);
    assert.equal(await isValid(type, { keyword: 'x'.repeat(101) }), false);
  }
  assert.equal(await isValid(OrderListQueryDto, { status: 'UNKNOWN' }), false);
  assert.equal(await isValid(PaymentQueryDto, { method: 'cash' }), false);
});

test('付款审核备注受 DTO 白名单和长度边界保护', async () => {
  assert.equal(await isValid(ReviewPaymentDto, { reviewNote: '核对无误' }), true);
  assert.equal(await isValid(ReviewPaymentDto, { reviewNote: 'x'.repeat(501) }), false);
});
