import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import type { ProductsService } from "../products/products.service";
import { GoldPriceController } from "./gold-price.controller";
import { GoldPriceService } from "./gold-price.service";

test("员工撤权后金价后台读取与手工写入均在领域访问前失败关闭", async () => {
  let goldPriceWrites = 0;
  let transactions = 0;
  const tx = {
    $queryRaw: async () => [],
    goldPrice: {
      create: async () => {
        goldPriceWrites += 1;
        return {};
      },
    },
  };
  const service = new GoldPriceService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as PrismaService, {} as ProductsService);
  const actor = { id: 91 };

  await assert.rejects(() => service.getAutomationStatus(actor), ForbiddenException);
  await assert.rejects(
    () => service.updateManually({ price: 888 }, actor),
    ForbiddenException,
  );

  assert.equal(transactions, 2);
  assert.equal(goldPriceWrites, 0);
});

test("当前设备登出后金价后台读取与手工写入均在领域访问前失败关闭", async () => {
  const events: string[] = [];
  let queryCount = 0;
  const tx = {
    $queryRaw: async () => {
      queryCount += 1;
      if (queryCount % 2 === 1) {
        events.push("staff-lock");
        return [{ id: 91 }];
      }
      events.push("session-lock");
      return [];
    },
    goldPrice: {
      create: async () => {
        events.push("gold-price-write");
        return {};
      },
    },
  };
  const service = new GoldPriceService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaService, {} as ProductsService);
  const actor = {
    id: 91,
    sessionFamilyId: "00000000-0000-4000-8000-000000000091",
  };

  await assert.rejects(
    () => service.getAutomationStatus(actor),
    ForbiddenException,
  );
  await assert.rejects(
    () => service.updateManually({ price: 888 }, actor),
    ForbiddenException,
  );
  assert.deepEqual(events, [
    "staff-lock",
    "session-lock",
    "staff-lock",
    "session-lock",
  ]);
});

test("金价控制器把完整员工 principal 传给两个后台入口", async () => {
  const principal = {
    id: 91,
    username: "gold-admin-91",
    realName: "金价管理员",
    role: "ADMIN",
    status: "ACTIVE",
    sessionFamilyId: "00000000-0000-4000-8000-000000000091",
  } as StaffPrincipal;
  const received: unknown[] = [];
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name, value),
  };
  const service = {
    getAutomationStatus: async (actor: unknown) => received.push(actor),
    updateManually: async (_data: unknown, actor: unknown) => received.push(actor),
  };
  const controller = new GoldPriceController(service as unknown as GoldPriceService);

  await controller.getAutomationStatus(principal, response as never);
  await controller.updateManually({ price: 888 }, principal);

  assert.equal(received.length, 2);
  assert.ok(received.every((actor) => actor === principal));
  assert.equal(headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(headers.get("Vary"), "Cookie, Authorization");
});
