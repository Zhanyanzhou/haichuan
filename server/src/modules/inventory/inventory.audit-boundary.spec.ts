import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { lastValueFrom, of } from "rxjs";
import { SKIP_GENERIC_AUDIT_KEY } from "../../common/decorators/skip-generic-audit.decorator";
import { AuditLogInterceptor } from "../../common/interceptors/audit-log.interceptor";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { ProductsService } from "../products/products.service";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

test("库存调整入口跳过事务外泛化审计，避免重复的 update 日志", async () => {
  let genericAuditWrites = 0;
  const interceptor = new AuditLogInterceptor(
    {
      operationLog: {
        create: async () => {
          genericAuditWrites += 1;
        },
      },
    } as never,
    new Reflector(),
  );
  const context = {
    getType: () => "http",
    getHandler: () => InventoryController.prototype.updateStock,
    getClass: () => InventoryController,
    switchToHttp: () => ({
      getRequest: () => ({
        method: "PUT",
        path: "/api/inventory/12",
        params: { id: "12" },
        user: { id: 7 },
      }),
    }),
  };

  assert.equal(
    Reflect.getMetadata(
      SKIP_GENERIC_AUDIT_KEY,
      InventoryController.prototype.updateStock,
    ),
    true,
  );
  await lastValueFrom(
    interceptor.intercept(context as never, { handle: () => of({ id: 12 }) }),
  );
  assert.equal(genericAuditWrites, 0);
});

test("库存调整仍在业务事务内写入唯一且准确的 stock_update 日志", async () => {
  let quantity = 8;
  let transactionActive = false;
  const auditWrites: Array<Record<string, unknown>> = [];
  const transaction = {
    $queryRaw: async () => [{ id: 7 }],
    inventory: {
      findUnique: async () => ({
        id: 12,
        quantity,
        sku: { productId: 31 },
      }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; quantity: number };
        data: { quantity: number };
      }) => {
        assert.deepEqual(where, { id: 12, quantity: 8 });
        quantity = data.quantity;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ id: 12, quantity }),
    },
    operationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(transactionActive, true);
        auditWrites.push(data);
      },
    },
  };
  const prisma = {
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => {
      transactionActive = true;
      try {
        return await callback(transaction);
      } finally {
        transactionActive = false;
      }
    },
  };
  const products = {
    lockProductForTradeMutation: async (_productId: number, client: unknown) => {
      assert.equal(client, transaction);
    },
    reconcileTradeRulesInTransaction: async (
      _productId: number,
      client: unknown,
    ) => {
      assert.equal(client, transaction);
    },
    notifyTradeProductChanged: () => undefined,
  };
  const service = new InventoryService(
    prisma as unknown as PrismaService,
    products as unknown as ProductsService,
  );

  await service.updateStock(
    12,
    { type: "in", quantity: 3, expectedQuantity: 8, remark: "  盘点补录  " },
    { id: 7 },
  );

  assert.equal(auditWrites.length, 1);
  assert.deepEqual(auditWrites[0], {
    userId: 7,
    action: "stock_update",
    module: "inventory",
    targetId: 12,
    detail: JSON.stringify({
      type: "in",
      quantity: 3,
      before: 8,
      after: 11,
      remark: "盘点补录",
    }),
  });
});
