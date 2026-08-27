import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { BoundedListQueryDto } from './bounded-list-query.dto';
import { GoldPriceHistoryQueryDto } from '../../modules/gold-price/dto/gold-price-history-query.dto';
import { PublicProductQueryDto } from '../../modules/products/dto/public-product-query.dto';

async function transform<T>(metatype: new () => T, value: Record<string, unknown>) {
  return new ValidationPipe({ transform: true, whitelist: true }).transform(value, {
    type: 'query',
    metatype,
  });
}

test('后台分页统一拒绝非正页码与超过 100 的 pageSize', async () => {
  await assert.rejects(transform(BoundedListQueryDto, { page: '0' }));
  await assert.rejects(transform(BoundedListQueryDto, { pageSize: '101' }));
  const query = await transform(BoundedListQueryDto, { page: '2', pageSize: '100' });
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 100);
});

test('公开商品与金价历史均有服务端资源上限', async () => {
  await assert.rejects(transform(PublicProductQueryDto, { pageSize: '101' }));
  await assert.rejects(transform(PublicProductQueryDto, { page: '10001' }));
  await assert.rejects(transform(GoldPriceHistoryQueryDto, { days: '366' }));
  assert.equal((await transform(GoldPriceHistoryQueryDto, { days: '365' })).days, 365);
});
