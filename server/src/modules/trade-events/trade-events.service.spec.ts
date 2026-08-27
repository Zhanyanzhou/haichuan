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

test('纯告警事件可显式使用 best-effort，不掩盖原业务错误', async () => {
  const service = new TradeEventsService({} as PrismaService);
  const tx = {
    tradeEvent: {
      create: async () => {
        throw new Error('audit unavailable');
      },
    },
  };
  await service.recordBestEffort(tx as never, event);
});
