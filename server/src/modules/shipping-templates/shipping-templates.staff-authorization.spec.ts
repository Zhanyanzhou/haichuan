import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HEADERS_METADATA } from "@nestjs/common/constants";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import type { ProductsService } from "../products/products.service";
import { ShippingTemplatesController } from "./shipping-templates.controller";
import { ShippingTemplatesService } from "./shipping-templates.service";

const tokenAdmin = { id: 51 };

test("员工撤权后运费模板三条私有读写路径在领域访问前失败关闭", async () => {
  let domainReads = 0;
  let domainWrites = 0;
  let notifications = 0;
  let transactions = 0;
  const read = async () => {
    domainReads += 1;
    return [];
  };
  const write = async () => {
    domainWrites += 1;
    return { count: 1 };
  };
  const tx = {
    $queryRaw: async () => [],
    shippingTemplate: {
      findMany: read,
      findUnique: read,
      updateMany: write,
      create: write,
      update: write,
    },
    product: {
      count: read,
      updateMany: write,
    },
  };
  const service = new ShippingTemplatesService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as PrismaService, {
    notifyTradeProductChanged: () => {
      notifications += 1;
    },
  } as unknown as ProductsService);

  const calls = [
    () => service.list(tokenAdmin),
    () => service.create({ name: "全国标准配送" }, tokenAdmin),
    () => service.update(7, { name: "更新配送" }, tokenAdmin),
  ];

  for (const call of calls) {
    await assert.rejects(call, ForbiddenException);
  }

  assert.equal(transactions, calls.length);
  assert.equal(domainReads, 0);
  assert.equal(domainWrites, 0);
  assert.equal(notifications, 0);
});

test("当前设备登出后运费模板三条私有读写路径均在领域访问前失败关闭", async () => {
  let domainReads = 0;
  let domainWrites = 0;
  let notifications = 0;
  let transactions = 0;
  let queryCount = 0;
  const read = async () => {
    domainReads += 1;
    return [];
  };
  const write = async () => {
    domainWrites += 1;
    return { count: 1 };
  };
  const tx = {
    $queryRaw: async () => {
      queryCount += 1;
      return queryCount % 2 === 1 ? [{ id: 51 }] : [];
    },
    shippingTemplate: {
      findMany: read,
      findUnique: read,
      updateMany: write,
      create: write,
      update: write,
    },
    product: {
      count: read,
      updateMany: write,
    },
  };
  const service = new ShippingTemplatesService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as PrismaService, {
    notifyTradeProductChanged: () => {
      notifications += 1;
    },
  } as unknown as ProductsService);
  const revokedSessionActor = {
    id: 51,
    sessionFamilyId: "shipping-session-family",
  };

  const calls = [
    () => service.list(revokedSessionActor),
    () => service.create({ name: "全国标准配送" }, revokedSessionActor),
    () => service.update(7, { name: "更新配送" }, revokedSessionActor),
  ];

  for (const call of calls) {
    await assert.rejects(call, ForbiddenException);
  }

  assert.equal(transactions, calls.length);
  assert.equal(queryCount, calls.length * 2);
  assert.equal(domainReads, 0);
  assert.equal(domainWrites, 0);
  assert.equal(notifications, 0);
});

test("运费模板控制器把完整员工 principal 传给全部私有读写入口", async () => {
  const principal = {
    id: 51,
    username: "shipping-admin-51",
    realName: "配送管理员",
    role: "ADMIN",
    status: "ACTIVE",
    sessionFamilyId: "shipping-session-family",
  } as StaffPrincipal;
  const received: unknown[] = [];
  const service = {
    list: async (actor: unknown) => received.push(actor),
    create: async (_dto: unknown, actor: unknown) => received.push(actor),
    update: async (_id: number, _dto: unknown, actor: unknown) => received.push(actor),
  };
  const controller = new ShippingTemplatesController(
    service as unknown as ShippingTemplatesService,
  );

  await controller.list(principal);
  await controller.create({} as never, principal);
  await controller.update(7, {} as never, principal);

  assert.equal(received.length, 3);
  assert.ok(received.every((actor) => actor === principal));

  const headers = Reflect.getMetadata(
    HEADERS_METADATA,
    ShippingTemplatesController.prototype.list,
  ) as Array<{ name: string; value: string }>;
  assert.ok(headers.some(
    (header) => header.name === "Cache-Control"
      && header.value === "private, no-store, max-age=0",
  ));
  assert.ok(headers.some(
    (header) => header.name === "Vary"
      && header.value === "Cookie, Authorization",
  ));
});
