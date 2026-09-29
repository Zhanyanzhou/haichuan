import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

const admin = { id: 7, role: "ADMIN" as const };
const QUALITY_INVALIDATION = {
  where: { id: 5, publicationQualityStatus: "READY" },
  data: {
    publicationQualityStatus: "QUARANTINED",
    publicationQualityHash: null,
    publicationQualityCheckedAt: null,
  },
};

function createService(options: {
  certificateExists?: boolean;
  rejectQualityInvalidation?: boolean;
} = {}) {
  const events: string[] = [];
  const qualityUpdates: unknown[] = [];
  const notifications: unknown[] = [];
  const certificate = {
    id: 9,
    productId: 5,
    certType: "GIA",
    certNumber: "GIA-0009",
    certImage: null,
    expireDate: null,
  };
  const prisma: any = {
    product: {
      findFirst: async () => ({ id: 5, status: "PUBLISHED" }),
      updateMany: async (input: unknown) => {
        events.push("quality:invalidate");
        qualityUpdates.push(input);
        if (options.rejectQualityInvalidation) {
          throw new Error("quality invalidation failed");
        }
        return { count: 1 };
      },
    },
    certificate: {
      create: async () => {
        events.push("certificate:create");
        return certificate;
      },
      findFirst: async () => {
        events.push("certificate:find");
        return options.certificateExists === false ? null : certificate;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("certificate:update");
        return { ...certificate, ...data };
      },
      delete: async () => {
        events.push("certificate:delete");
        return certificate;
      },
    },
    $queryRaw: async () => {
      events.push("product:lock");
      return [{ id: 5, role: "ADMIN" }];
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      events.push("transaction:start");
      try {
        const result = await callback(prisma);
        events.push("transaction:commit");
        return result;
      } catch (error) {
        events.push("transaction:rollback");
        throw error;
      }
    },
  };
  const service = new ProductsService(
    prisma as PrismaService,
    { invalidate: () => notifications.push("cache") } as never,
    { emit: (...args: unknown[]) => notifications.push(args) } as never,
  );
  return { service, events, qualityUpdates, notifications };
}

test("证书新增、公开字段修改和删除均在同一事务内隔离 READY 并清除旧质量快照", async () => {
  for (const [name, mutate, certificateEvent] of [
    [
      "create",
      (service: ProductsService) => service.addCertificate(
        5,
        { certType: "GIA", certNumber: "GIA-0009" } as never,
        admin as never,
      ),
      "certificate:create",
    ],
    [
      "update",
      (service: ProductsService) => service.updateCertificate(
        5,
        9,
        { certNumber: "GIA-0010" } as never,
        admin as never,
      ),
      "certificate:update",
    ],
    [
      "delete",
      (service: ProductsService) => service.deleteCertificate(5, 9, admin as never),
      "certificate:delete",
    ],
  ] as const) {
    const context = createService();
    await mutate(context.service);

    assert.deepEqual(context.qualityUpdates, [QUALITY_INVALIDATION], name);
    assert.ok(
      context.events.indexOf(certificateEvent) <
        context.events.indexOf("quality:invalidate"),
      `${name}: 先写证书事实，再在事务内隔离发布质量`,
    );
    assert.ok(
      context.events.indexOf("quality:invalidate") <
        context.events.indexOf("transaction:commit"),
      `${name}: 不得在事务提交后才隔离`,
    );
  }
});

test("只修改非公开证书图片或重复提交相同公开事实时不撤销 READY", async () => {
  const { service, qualityUpdates } = createService();

  await service.updateCertificate(
    5,
    9,
    { certImage: "/internal/certificate/9" } as never,
    admin as never,
  );
  await service.updateCertificate(
    5,
    9,
    { certType: "GIA", certNumber: "GIA-0009", expireDate: null } as never,
    admin as never,
  );

  assert.deepEqual(qualityUpdates, []);
});

test("证书不属于 URL 商品时拒绝写入且不改变发布质量状态", async () => {
  const { service, events, qualityUpdates } = createService({
    certificateExists: false,
  });

  await assert.rejects(
    () => service.updateCertificate(
      5,
      9,
      { certNumber: "CROSS-PRODUCT" } as never,
      admin as never,
    ),
    NotFoundException,
  );

  assert.equal(events.includes("certificate:update"), false);
  assert.deepEqual(qualityUpdates, []);
  assert.equal(events.at(-1), "transaction:rollback");
});

test("发布质量隔离写入失败时证书事务失败且不广播公开刷新", async () => {
  const { service, events, notifications } = createService({
    rejectQualityInvalidation: true,
  });

  await assert.rejects(
    () => service.addCertificate(
      5,
      { certType: "GIA", certNumber: "GIA-0009" } as never,
      admin as never,
    ),
    /quality invalidation failed/,
  );

  assert.equal(events.at(-1), "transaction:rollback");
  assert.deepEqual(notifications, []);
});
