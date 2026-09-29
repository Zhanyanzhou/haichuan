import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { lastValueFrom, of } from "rxjs";
import { SKIP_GENERIC_AUDIT_KEY } from "../../common/decorators/skip-generic-audit.decorator";
import { AuditLogInterceptor } from "../../common/interceptors/audit-log.interceptor";
import type { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

async function runAuditBoundary(
  handler: unknown,
  method: "POST" | "PUT",
  path: string,
  canonicalAction: string,
) {
  const actions: string[] = [];
  const interceptor = new AuditLogInterceptor(
    {
      operationLog: {
        create: async ({ data }: { data: { action: string } }) => {
          actions.push(data.action);
        },
      },
    } as never,
    new Reflector(),
  );
  const context = {
    getType: () => "http",
    getHandler: () => handler,
    getClass: () => ProductsController,
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        path,
        params: { id: "42" },
        user: { id: 7 },
      }),
    }),
  };

  await lastValueFrom(
    interceptor.intercept(context as never, {
      handle: () => {
        // 代表 ProductsService 在同一业务事务中写入的规范语义日志。
        actions.push(canonicalAction);
        return of({ id: 42 });
      },
    }),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  return actions;
}

test("商品状态入口已有规范事务审计时不再追加泛化 update 日志", async () => {
  const actions = await runAuditBoundary(
    ProductsController.prototype.updateStatus,
    "PUT",
    "/api/products/42/status",
    "product.publish",
  );

  assert.deepEqual(actions, ["product.publish"]);
  assert.equal(
    Reflect.getMetadata(
      SKIP_GENERIC_AUDIT_KEY,
      ProductsController.prototype.updateStatus,
    ),
    true,
  );
});

test("独立归档入口已有 product.archive 时不再追加泛化 update 日志", async () => {
  const actions = await runAuditBoundary(
    ProductsController.prototype.archive,
    "PUT",
    "/api/products/42/archive",
    "product.archive",
  );

  assert.deepEqual(actions, ["product.archive"]);
  assert.equal(
    Reflect.getMetadata(
      SKIP_GENERIC_AUDIT_KEY,
      ProductsController.prototype.archive,
    ),
    true,
  );
});

test("提交审核入口已有 product.review.submit 时不再追加泛化 create 日志", async () => {
  const actions = await runAuditBoundary(
    ProductsController.prototype.submitForReview,
    "POST",
    "/api/products/42/submit-review",
    "product.review.submit",
  );

  assert.deepEqual(actions, ["product.review.submit"]);
  assert.equal(
    Reflect.getMetadata(
      SKIP_GENERIC_AUDIT_KEY,
      ProductsController.prototype.submitForReview,
    ),
    true,
  );
});

function createProductAuditHarness() {
  let transactionActive = false;
  const audits: Array<{ action: string; transactionActive: boolean }> = [];
  const transaction = {
    $queryRaw: async () => [{ id: 42 }],
    product: {
      findFirst: async () => ({
        id: 42,
        status: "DRAFT",
        updatedAt: new Date("2026-09-20T08:00:00.000Z"),
      }),
      update: async () => ({ id: 42, status: "ARCHIVED" }),
    },
    operationLog: {
      findFirst: async () => null,
      create: async ({ data }: { data: { action: string } }) => {
        audits.push({ action: data.action, transactionActive });
        return { id: audits.length };
      },
    },
  };
  const prisma = {
    product: transaction.product,
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => {
      transactionActive = true;
      try {
        return await callback(transaction);
      } finally {
        transactionActive = false;
      }
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { invalidate: () => undefined } as never,
    { emit: () => undefined } as never,
  );
  return { service, audits };
}

test("归档和提交审核的规范动作仍由 ProductsService 在业务事务内写入", async () => {
  const archived = createProductAuditHarness();
  await archived.service.archive(42, { id: 7, role: "ADMIN" });
  assert.deepEqual(archived.audits, [{
    action: "product.archive",
    transactionActive: true,
  }]);

  const submitted = createProductAuditHarness();
  await submitted.service.submitForReview(42, { id: 9, role: "EDITOR" });
  assert.deepEqual(submitted.audits, [{
    action: "product.review.submit",
    transactionActive: true,
  }]);
});
