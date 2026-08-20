import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PublicProductQueryDto } from "./dto";
import { ProductsService } from "./products.service";

interface FindManyCall {
  where: Record<string, unknown>;
  skip?: number;
  take?: number;
  orderBy?: unknown;
  distinct?: unknown;
}

function createService() {
  const findManyCalls: FindManyCall[] = [];
  let countWhere: Record<string, unknown> | undefined;
  const prisma = {
    product: {
      findMany: async (args: FindManyCall) => {
        findManyCalls.push(args);
        return [];
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        countWhere = where;
        return 0;
      },
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
  );
  return { service, findManyCalls, getCountWhere: () => countWhere };
}

test("公开目录：商品 ids 与分类 categoryIds 分别进入正确字段并真实分页", async () => {
  const { service, findManyCalls, getCountWhere } = createService();
  const result = await service.findPublic({
    ids: "101,102",
    categoryIds: "7,8,9",
    page: 3,
    pageSize: 32,
    sortBy: "code_asc",
  });

  const listCall = findManyCalls[0];
  assert.deepEqual(listCall.where.id, { in: [101, 102] });
  assert.deepEqual(listCall.where.categoryId, { in: [7, 8, 9] });
  assert.equal(listCall.skip, 64);
  assert.equal(listCall.take, 32);
  assert.deepEqual(listCall.orderBy, [{ code: "asc" }, { id: "asc" }]);
  assert.deepEqual(getCountWhere(), listCall.where);
  assert.equal(result.page, 3);
  assert.equal(result.pageSize, 32);
});

test("公开目录：工艺兼容 JSON 数组/字符串，尺寸与多段重量均在服务端过滤", async () => {
  const { service, findManyCalls } = createService();
  await service.findPublic({
    materialTypes: "GOLD_999,AU750",
    craftTechniques: "古法金,錾刻",
    sizes: "圈号13,圈号14",
    weightRanges: "0:5,10:20,50:",
  });

  const where = findManyCalls[0].where;
  assert.deepEqual(where.materialType, { in: ["GOLD_999", "AU750"] });
  assert.deepEqual(where.size, { in: ["圈号13", "圈号14"] });
  const serialized = JSON.stringify(where.AND);
  assert.match(serialized, /array_contains.*古法金/);
  assert.match(serialized, /string_contains.*古法金/);
  assert.match(serialized, /array_contains.*錾刻/);
  assert.match(serialized, /"goldWeight"/);
  assert.match(serialized, /"weight"/);
  assert.match(serialized, /"lt":5/);
  assert.match(serialized, /"gte":50/);
});

test("公开目录：Facet 只继承公开性与分类边界，不被当前材质筛选截断", async () => {
  const { service, findManyCalls } = createService();
  await service.findPublic({
    categoryIds: "7,8",
    materialTypes: "GOLD_999",
    includeFacets: "true",
  });

  assert.equal(findManyCalls.length, 2);
  const facetCall = findManyCalls.find((call) => call.distinct !== undefined);
  assert.ok(facetCall);
  assert.deepEqual(facetCall.where.categoryId, { in: [7, 8] });
  assert.equal(facetCall.where.materialType, undefined);
  assert.deepEqual(facetCall.where.visibility, { in: ["PUBLIC"] });
  assert.equal(facetCall.where.status, "PUBLISHED");
});

test("公开目录查询 DTO：非法分页、ID 列表、材质与重量区间均拒绝", async () => {
  const dto = plainToInstance(PublicProductQueryDto, {
    page: "0",
    pageSize: "2001",
    ids: "1,not-an-id",
    materialTypes: "GOLD_999,UNKNOWN",
    weightRanges: "bad-range",
  });
  const errors = await validate(dto);
  const fields = new Set(errors.map((error) => error.property));
  assert.deepEqual(
    fields,
    new Set(["page", "pageSize", "ids", "materialTypes", "weightRanges"]),
  );
});
