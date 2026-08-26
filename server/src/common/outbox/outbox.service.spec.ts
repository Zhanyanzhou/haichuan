import * as assert from "node:assert/strict";
import { test } from "node:test";
import { OutboxService, type OutboxWriter } from "./outbox.service";

test("Outbox 事件写入调用方提供的同一事务端口", async () => {
  let captured: unknown;
  const tx: OutboxWriter = {
    outboxEvent: {
      async create(args) {
        captured = args.data;
        return { id: 1 };
      },
    },
  };
  await new OutboxService().enqueue(tx, {
    aggregateType: "quotation",
    aggregateId: "42",
    eventType: "quotation.issued",
    payload: { version: 2 },
    deduplicationKey: "quotation:42:v2",
  });
  assert.deepEqual(captured, {
    aggregateType: "quotation",
    aggregateId: "42",
    eventType: "quotation.issued",
    payload: { version: 2 },
    deduplicationKey: "quotation:42:v2",
    occurredAt: undefined,
    availableAt: undefined,
  });
});
test("Outbox 拒绝空聚合和过长去重键", () => {
  const tx = { outboxEvent: { create: async () => ({}) } } as OutboxWriter;
  const service = new OutboxService();
  assert.throws(() =>
    service.enqueue(tx, {
      aggregateType: "",
      aggregateId: "1",
      eventType: "x",
      payload: {},
    }),
  );
  assert.throws(() =>
    service.enqueue(tx, {
      aggregateType: "order",
      aggregateId: "1",
      eventType: "created",
      payload: {},
      deduplicationKey: "x".repeat(129),
    }),
  );
});
