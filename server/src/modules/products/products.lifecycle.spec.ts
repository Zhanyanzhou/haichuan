import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException, ExecutionContext, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

type LifecycleRecord = {
  id: number;
  status: "DRAFT" | "PUBLISHED" | "OFFLINE" | "ARCHIVED";
  deletedAt: Date | null;
};

type ProductWhere = {
  id?: number;
  deletedAt?: null;
  status?: LifecycleRecord["status"] | { not: LifecycleRecord["status"] };
};

function matches(record: LifecycleRecord, where: ProductWhere): boolean {
  if (where.id !== undefined && record.id !== where.id) return false;
  if (where.deletedAt === null && record.deletedAt !== null) return false;
  if (typeof where.status === "string" && record.status !== where.status) return false;
  if (
    where.status &&
    typeof where.status === "object" &&
    record.status === where.status.not
  ) {
    return false;
  }
  return true;
}

function createService(initial: LifecycleRecord[]) {
  const records = initial.map((record) => ({ ...record }));
  const observedFindManyWhere: ProductWhere[] = [];
  const observedCountWhere: ProductWhere[] = [];
  const prisma = {
    product: {
      findMany: async ({ where }: { where: ProductWhere }) => {
        observedFindManyWhere.push(where);
        return [];
      },
      count: async ({ where }: { where: ProductWhere }) => {
        observedCountWhere.push(where);
        return records.filter((record) => matches(record, where)).length;
      },
      findFirst: async ({ where }: { where: ProductWhere }) =>
        records.find((record) => matches(record, where)) || null,
      update: async ({
        where,
        data,
      }: {
        where: { id: number };
        data: Partial<LifecycleRecord>;
      }) => {
        const record = records.find((item) => item.id === where.id);
        if (!record) throw new Error("测试数据不存在");
        Object.assign(record, data);
        return { ...record };
      },
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { invalidate: () => undefined } as never,
    {} as never,
  );
  return { service, records, observedFindManyWhere, observedCountWhere };
}

test("后台默认商品列表排除回收站，显式 ARCHIVED 只查询回收站", async () => {
  const { service, observedFindManyWhere } = createService([
    { id: 1, status: "DRAFT", deletedAt: null },
    { id: 2, status: "ARCHIVED", deletedAt: null },
    { id: 3, status: "OFFLINE", deletedAt: new Date() },
  ]);

  const defaultResult = await service.findAll({ page: 1, pageSize: 20 });
  assert.equal(defaultResult.total, 1);
  assert.deepEqual(observedFindManyWhere[0], {
    deletedAt: null,
    status: { not: "ARCHIVED" },
  });

  const archivedResult = await service.findAll({
    page: 1,
    pageSize: 20,
    status: "ARCHIVED",
  });
  assert.equal(archivedResult.total, 1);
  assert.deepEqual(observedFindManyWhere[1], {
    deletedAt: null,
    status: "ARCHIVED",
  });
});

test("商品数量统计的 all 排除回收站和已软删除记录", async () => {
  const { service, observedCountWhere } = createService([
    { id: 1, status: "PUBLISHED", deletedAt: null },
    { id: 2, status: "OFFLINE", deletedAt: null },
    { id: 3, status: "ARCHIVED", deletedAt: null },
    { id: 4, status: "DRAFT", deletedAt: new Date() },
  ]);

  const counts = await service.getCounts();
  assert.equal(counts.all, 2);
  assert.equal(counts.ARCHIVED, 1);
  assert.deepEqual(observedCountWhere[0], {
    deletedAt: null,
    status: { not: "ARCHIVED" },
  });
});

test("归档、恢复与回收站只读形成受状态约束的闭环", async () => {
  const { service, records } = createService([
    { id: 1, status: "DRAFT", deletedAt: null },
  ]);

  await service.archive(1);
  assert.equal(records[0].status, "ARCHIVED");
  await assert.rejects(() => service.archive(1), ConflictException);

  await service.restore(1);
  assert.equal(records[0].status, "DRAFT");
  await assert.rejects(() => service.restore(1), ConflictException);

  await service.archive(1);
  // 回收站只读：delete 被拒绝，deletedAt 不被写入
  await assert.rejects(() => service.delete(1), ConflictException);
  assert.equal(records[0].status, "ARCHIVED");
  assert.equal(records[0].deletedAt, null);
});

test("不存在商品与错误状态分别返回 NotFound 和 Conflict", async () => {
  const { service } = createService([
    { id: 1, status: "DRAFT", deletedAt: null },
  ]);

  await assert.rejects(() => service.restore(99), NotFoundException);
  await assert.rejects(() => service.delete(1), ConflictException);
});

test("回收站商品不能通过状态接口绕过恢复操作", async () => {
  const { service } = createService([
    { id: 1, status: "ARCHIVED", deletedAt: null },
  ]);

  await assert.rejects(
    () => service.updateStatus(1, "OFFLINE"),
    ConflictException,
  );
});

test("商品生命周期端点保留后台角色守卫，非商品角色被拒绝", () => {
  const roles = Reflect.getMetadata(ROLES_KEY, ProductsController) as string[];
  assert.deepEqual(roles, ["SUPER_ADMIN", "ADMIN", "EDITOR"]);

  const guard = new RolesGuard(new Reflector());
  const context = {
    getHandler: () => ProductsController.prototype.delete,
    getClass: () => ProductsController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { role: "WAREHOUSE" } }),
    }),
  } as unknown as ExecutionContext;
  assert.equal(guard.canActivate(context), false);
});
