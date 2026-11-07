import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { computeProductPublicationQualityHash } from "./product-publication-quality-hash";

test("定制公开起价进入发布质量哈希，未启用参考价保持既有快照兼容", () => {
  const product = {
    salesMode: "CUSTOM_INQUIRY", images: [], skus: [], certificates: [],
  } as unknown as Parameters<typeof computeProductPublicationQualityHash>[0];
  const hash = (priceMin?: number | null, salesMode = "CUSTOM_INQUIRY") =>
    computeProductPublicationQualityHash({ ...product, salesMode, priceMin });
  assert.notEqual(hash(1000), hash(1800));
  assert.notEqual(hash(1000), hash(0));
  assert.equal(hash(null), hash(0));
  assert.equal(hash(undefined), hash(0));
  assert.equal(hash(1000, "DIRECT_PURCHASE"), hash(1800, "DIRECT_PURCHASE"));
});

test("定制参考起价拒绝负数、过大金额、非数值和超过两位的小数", async () => {
  for (const priceMin of [-1, 100000000, "bad", 1000.001]) {
    for (const Dto of [CreateProductDto, UpdateProductDto] as Array<new () => object>) {
      const dto = plainToInstance(Dto, { name: "定制作品", code: "HC-CUSTOM", categoryId: 1, priceMin });
      const errors = await validate(dto);
      assert.ok(errors.some((error) => error.property === "priceMin"));
    }
  }
  for (const priceMin of [null, 0, 1000, 1500.25]) {
    const dto = plainToInstance(UpdateProductDto, { priceMin });
    assert.equal((await validate(dto)).length, 0);
  }
});

const products = [
  { id: 8, salesMode: "CUSTOM_INQUIRY", price: 99999, priceMin: 1000 },
  { id: 7, salesMode: "DIRECT_PURCHASE", price: 1200, priceMin: 99999 },
  { id: 6, salesMode: "CUSTOM_INQUIRY", price: 1, priceMin: 1200 },
  { id: 5, salesMode: "DIRECT_PURCHASE", price: 1800, priceMin: 1 },
  { id: 4, salesMode: "CUSTOM_INQUIRY", price: 1, priceMin: 2000 },
];

test("公开定制只返回参考价，其他模式不泄露参考价且定制永远不能直接购买", async () => {
  const rows = [
    ...products,
    { id: 3, salesMode: "CUSTOM_INQUIRY", price: 9000, priceMin: 0 },
    { id: 2, salesMode: "DISPLAY_ONLY", price: 9000, priceMin: 1000 },
  ].map((product) => ({ ...product, skus: [{ inventories: [{ quantity: 10 }] }] }));
  const prisma = { product: { findMany: async () => rows, count: async () => rows.length } };
  const service = new ProductsService(prisma as unknown as PrismaService, {} as never, {} as never);
  const result = await service.findPublic({});
  const custom = result.list[0];
  assert.equal(custom.priceMin, 1000);
  assert.equal(custom.price, null);
  assert.equal(custom.isAvailableForPurchase, false);
  assert.equal(result.list[1].price, 1200);
  assert.equal(result.list[1].priceMin, null);
  assert.equal(result.list[5].priceMin, null);
  assert.equal(result.list[6].priceMin, null);
});

for (const direction of ["asc", "desc"] as const) {
  test(`混合公开价${direction}跨页排序保持全局顺序和稳定ID，只读取当前页完整记录`, async () => {
    const allKeys: number[] = [];
    for (const page of [1, 2, 3]) {
      const candidateTakes: number[] = [];
      const fullTakes: number[] = [];
      let snapshotReads = 0;
      const prisma = {
        product: {
          findMany: async (args: {
            where: { AND: Array<{ salesMode?: string; id?: { in: number[] } }> };
            select: { images?: unknown };
            orderBy: Array<Record<string, string>>;
            take: number;
          }) => {
            if (args.select.images) {
              fullTakes.push(args.take);
              const ids = args.where.AND.find((clause) => clause.id)?.id?.in ?? [];
              return products.filter((product) => ids.includes(product.id)).reverse();
            }
            candidateTakes.push(args.take);
            const mode = args.where.AND.find((clause) => clause.salesMode)?.salesMode;
            const field = mode === "CUSTOM_INQUIRY" ? "priceMin" : "price";
            return products.filter((product) => product.salesMode === mode)
              .sort((left, right) => (direction === "asc" ? left[field] - right[field] : right[field] - left[field]) || right.id - left.id)
              .slice(0, args.take);
          },
          count: async () => products.length,
        },
        $transaction: async (callback: (tx: unknown) => Promise<unknown>, options: { isolationLevel: string }): Promise<unknown> => {
          assert.equal(options.isolationLevel, "RepeatableRead");
          snapshotReads += 1;
          return callback(prisma);
        },
      };
      const service = new ProductsService(prisma as unknown as PrismaService, {} as never, {} as never);
      const result = await service.findPublic({ sortBy: `price_${direction}`, page, pageSize: 2 });
      assert.equal(result.total, 5);
      assert.equal(snapshotReads, 1);
      assert.deepEqual(candidateTakes, [page * 2, page * 2]);
      assert.deepEqual(fullTakes, [result.list.length]);
      allKeys.push(...result.list.map((product) => Number(product.id)));
    }
    assert.deepEqual(allKeys, direction === "asc" ? [8, 7, 6, 5, 4] : [4, 5, 7, 6, 8]);
  });
}
