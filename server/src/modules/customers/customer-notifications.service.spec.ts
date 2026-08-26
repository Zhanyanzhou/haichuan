import * as assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { CustomerNotificationsService } from "./customer-notifications.service";

test("客户通知列表始终绑定当前客户并只返回可见状态", async () => {
  const calls: any[] = [];
  const service = new CustomerNotificationsService({
    notification: {
      findMany: async (args: any) => {
        calls.push({ kind: "findMany", args });
        return [];
      },
      count: async (args: any) => {
        calls.push({ kind: "count", args });
        return 0;
      },
    },
  } as never);

  const result = await service.list(7, { page: 2, pageSize: 10 });
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  const listWhere = calls.find((call) => call.kind === "findMany").args.where;
  assert.equal(listWhere.customerId, 7);
  assert.deepEqual(listWhere.status, { in: ["AVAILABLE", "READ"] });
  assert.equal(calls.find((call) => call.kind === "findMany").args.skip, 10);
});

test("客户通知已读更新同时绑定通知与当前客户，不能读取他人通知", async () => {
  let updateWhere: any;
  const service = new CustomerNotificationsService({
    notification: {
      updateMany: async ({ where }: any) => {
        updateWhere = where;
        return { count: 0 };
      },
      findFirst: async () => null,
    },
  } as never);

  await assert.rejects(
    () => service.markRead(7, 99),
    (error: unknown) => error instanceof NotFoundException,
  );
  assert.deepEqual(updateWhere, {
    id: 99,
    customerId: 7,
    status: "AVAILABLE",
    availableAt: { lte: updateWhere.availableAt.lte },
  });
  assert.ok(updateWhere.availableAt.lte instanceof Date);
});

test("全部已读只更新当前客户已经可用的通知", async () => {
  let updateWhere: any;
  const service = new CustomerNotificationsService({
    notification: {
      updateMany: async ({ where }: any) => {
        updateWhere = where;
        return { count: 3 };
      },
    },
  } as never);

  assert.deepEqual(await service.markAllRead(8), { updated: 3 });
  assert.equal(updateWhere.customerId, 8);
  assert.equal(updateWhere.status, "AVAILABLE");
  assert.ok(updateWhere.availableAt.lte instanceof Date);
});
