import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ValidationPipe } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../../common/prisma/prisma.service";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

const admin = { id: 10, role: "ADMIN" as const };

function fixture(currentCategoryId = 4) {
  const updatedAt = new Date("2026-01-01T00:00:00Z");
  const record = { id: 11, status: "DRAFT", categoryId: currentCategoryId, updatedAt, inventoryPolicy: "STANDARD" };
  const mutations: Prisma.ProductUncheckedUpdateManyInput[] = [];
  const tx = {
    $queryRaw: async () => [admin],
    category: { findUnique: async () => ({ id: 7 }) },
    productSKU: { findMany: async () => [] },
    product: {
      findFirst: async () => ({ ...record }),
      findUnique: async () => ({ ...record }),
      findUniqueOrThrow: async () => ({ ...record }),
      update: async () => ({ ...record }),
      updateMany: async ({ where, data }: Prisma.ProductUpdateManyArgs) => {
        if (where?.categoryId !== undefined && where.categoryId !== record.categoryId) {
          return { count: 0 };
        }
        mutations.push(data);
        if (typeof data.categoryId === "number") record.categoryId = data.categoryId;
        return { count: 1 };
      },
    },
  };
  const service = new ProductsService(
    { $transaction: async (work: (client: typeof tx) => unknown) => work(tx) } as unknown as PrismaService,
    { invalidate: () => undefined } as never,
    {} as never,
  );
  return { service, record, mutations };
}

test("商品改分类守卫接受整数原分类，拒绝空值、字符串、布尔和越界输入", async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } });
  const dto = (expectedCategoryId: unknown) => pipe.transform({ categoryId: 7, expectedCategoryId }, { type: "body", metatype: UpdateProductDto });
  assert.equal((await dto(4)).expectedCategoryId, 4);
  for (const value of [null, "4", true, 0, 1.5, 2147483648]) {
    await assert.rejects(() => dto(value), BadRequestException);
  }
});

test("批量确认后原分类已变更，按最新记录拒绝写入并保留原数据", async () => {
  const { service, record, mutations } = fixture(6);
  await assert.rejects(() => service.update(11, { expectedCategoryId: 4, categoryId: 7 }, admin), ConflictException);
  assert.equal(record.categoryId, 6);
  assert.equal(mutations.length, 0);
});

test("匹配时只保存目标分类，旧客户端可不提供原分类", async () => {
  const { service, record, mutations } = fixture();
  await service.update(11, { expectedCategoryId: 4, categoryId: 7 }, admin);
  assert.equal(record.categoryId, 7);
  assert.equal("expectedCategoryId" in mutations[0], false);
  await service.update(11, { categoryId: 8 }, admin);
  assert.equal(record.categoryId, 8);
  await assert.rejects(() => service.update(11, { expectedCategoryId: 8 }, admin), BadRequestException);
  assert.equal(mutations.length, 2);
});
