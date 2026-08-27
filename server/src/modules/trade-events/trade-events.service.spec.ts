import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TradeEventsService } from './trade-events.service';

const event = {
  orderId: 1,
  entityType: 'ORDER' as const,
  entityId: 1,
  eventType: 'ORDER_COMPLETED' as const,
  operator: { type: 'ADMIN' as const, id: 1 },
};

test('必须审计的交易事件写入失败时向上传播，让业务事务可以回滚', async () => {
  const service = new TradeEventsService({} as PrismaService);
  const tx = {
    tradeEvent: {
      create: async () => {
        throw new Error('audit unavailable');
      },
    },
  };
  await assert.rejects(() => service.record(tx as never, event), /audit unavailable/);
});

test('纯告警事件使用 best-effort 时吞掉写入失败并留下错误日志', async () => {
  const service = new TradeEventsService({} as PrismaService);
  let createAttempts = 0;
  const logged: unknown[][] = [];
  Object.assign(service, {
    logger: {
      error: (...args: unknown[]) => logged.push(args),
    },
  });
  const tx = {
    tradeEvent: {
      create: async () => {
        createAttempts += 1;
        throw new Error('audit unavailable');
      },
    },
  };
  await assert.doesNotReject(() => service.recordBestEffort(tx as never, event));
  assert.equal(createAttempts, 1);
  assert.equal(logged.length, 1);
  assert.match(String(logged[0]?.[0]), /orderId=1 type=ORDER_COMPLETED/);
  assert.match(String(logged[0]?.[1]), /audit unavailable/);
});
