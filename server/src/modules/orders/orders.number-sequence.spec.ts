import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';

const service = new OrdersService(
  {} as PrismaService,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
);

for (const [maximum, expectedSuffix] of [
  [null, '0001'],
  [9998, '9999'],
  [9999n, '10000'],
  [10000n, '10001'],
] as const) {
  test(`订单日序号最大值 ${maximum ?? '空'} 后生成 ${expectedSuffix}`, async () => {
    let queryCalls = 0;
    const tx = {
      $queryRaw: async () => {
        queryCalls += 1;
        return [{ max_sequence: maximum }];
      },
    };

    const orderNo = await (service as unknown as {
      generateOrderNo: (transaction: typeof tx) => Promise<string>;
    }).generateOrderNo(tx);

    assert.match(orderNo, new RegExp(`^ORD\\d{8}${expectedSuffix}$`));
    assert.equal(queryCalls, 1);
  });
}
