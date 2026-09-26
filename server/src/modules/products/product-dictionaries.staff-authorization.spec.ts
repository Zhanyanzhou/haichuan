import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { CategoriesController } from "../categories/categories.controller";
import { CategoriesService } from "../categories/categories.service";
import { AttributesController } from "../attributes/attributes.controller";
import { AttributesService } from "../attributes/attributes.service";
import { TagsController } from "./tags.controller";
import { ProductsService } from "./products.service";

function revokedPrisma() {
  let domainAccesses = 0;
  const deniedDomain = new Proxy({}, {
    get: () => async () => {
      domainAccesses += 1;
      throw new Error("撤权后不应访问领域数据");
    },
  });
  const transaction = {
    $queryRaw: async () => [],
    category: deniedDomain,
    attribute: deniedDomain,
    attributeValue: deniedDomain,
    tag: deniedDomain,
  };
  return {
    prisma: {
      $transaction: async (callback: (tx: unknown) => unknown) =>
        callback(transaction),
    },
    domainAccesses: () => domainAccesses,
  };
}

async function expectForbidden(work: () => Promise<unknown>) {
  await assert.rejects(work, ForbiddenException);
}

test("撤权员工在分类六条后台路径的首个领域访问前失败关闭", async () => {
  const { prisma, domainAccesses } = revokedPrisma();
  const service = new CategoriesService(prisma as never);
  const actor = { id: 41 } as never;

  await expectForbidden(() => service.findManageTree(actor));
  await expectForbidden(() => service.resolveReferences(["rings"], actor));
  await expectForbidden(() => service.create({ name: "戒指", slug: "rings" }, actor));
  await expectForbidden(() => service.reorder([{ id: 1, sortOrder: 0 }], actor));
  await expectForbidden(() => service.update(1, { name: "戒指" }, actor));
  await expectForbidden(() => service.delete(1, actor));

  assert.equal(domainAccesses(), 0);
});

test("撤权员工在属性七条后台路径的首个领域访问前失败关闭", async () => {
  const { prisma, domainAccesses } = revokedPrisma();
  const service = new AttributesService(prisma as never);
  const actor = { id: 42 } as never;

  await expectForbidden(() => service.findAll(actor));
  await expectForbidden(() => service.create({ name: "工艺", key: "craft" }, actor));
  await expectForbidden(() => service.update(1, { name: "场景" }, actor));
  await expectForbidden(() => service.remove(1, actor));
  await expectForbidden(() => service.addValue(1, { value: "古法" }, actor));
  await expectForbidden(() => service.updateValue(2, { value: "花丝" }, actor));
  await expectForbidden(() => service.removeValue(2, actor));

  assert.equal(domainAccesses(), 0);
});

test("撤权员工在标签三条后台路径的首个领域访问前失败关闭", async () => {
  const { prisma, domainAccesses } = revokedPrisma();
  const service = new ProductsService(prisma as never, {} as never, {} as never);
  const actor = { id: 43, role: "EDITOR" } as never;

  await expectForbidden(() => service.listTags(actor));
  await expectForbidden(() => service.createTag({ name: "节日赠礼" }, actor));
  await expectForbidden(() => service.updateTag(1, { name: "古法工艺" }, actor));

  assert.equal(domainAccesses(), 0);
});

test("获准员工的三类字典读取均在员工锁建立后访问领域数据", async () => {
  const events: string[] = [];
  let queryCount = 0;
  const transaction = {
    $queryRaw: async () => {
      queryCount += 1;
      if (queryCount % 2 === 0) {
        events.push("session-lock");
        return [{ id: 440 }];
      }
      events.push("staff-lock");
      return [{ id: 44, role: "EDITOR" }];
    },
    category: {
      findMany: async () => {
        events.push("category-read");
        return [];
      },
    },
    attribute: {
      findMany: async () => {
        events.push("attribute-read");
        return [];
      },
    },
    tag: {
      findMany: async () => {
        events.push("tag-read");
        return [];
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback(transaction),
  };
  const actor = {
    id: 44,
    role: "EDITOR",
    sessionFamilyId: "00000000-0000-4000-8000-000000000044",
  } as never;

  await new CategoriesService(prisma as never).findManageTree(actor);
  await new AttributesService(prisma as never).findAll(actor);
  await new ProductsService(
    prisma as never,
    {} as never,
    {} as never,
  ).listTags(actor);

  assert.deepEqual(events, [
    "staff-lock",
    "session-lock",
    "category-read",
    "staff-lock",
    "session-lock",
    "attribute-read",
    "staff-lock",
    "session-lock",
    "tag-read",
  ]);
});

test("已撤销 refresh family 在分类和属性领域访问前失败关闭", async () => {
  for (const createRequest of [
    (prisma: unknown, actor: unknown) =>
      new CategoriesService(prisma as never).findManageTree(actor as never),
    (prisma: unknown, actor: unknown) =>
      new AttributesService(prisma as never).findAll(actor as never),
  ]) {
    const events: string[] = [];
    let domainAccesses = 0;
    const transaction = {
      $queryRaw: async () => {
        if (events.length === 0) {
          events.push("staff-lock");
          return [{ id: 45 }];
        }
        events.push("session-lock");
        return [];
      },
      category: new Proxy({}, {
        get: () => async () => {
          domainAccesses += 1;
          return [];
        },
      }),
      attribute: new Proxy({}, {
        get: () => async () => {
          domainAccesses += 1;
          return [];
        },
      }),
    };
    const prisma = {
      $transaction: async (callback: (tx: unknown) => unknown) => callback(transaction),
    };
    await expectForbidden(() => createRequest(prisma, {
      id: 45,
      sessionFamilyId: "00000000-0000-4000-8000-000000000045",
    }));
    assert.deepEqual(events, ["staff-lock", "session-lock"]);
    assert.equal(domainAccesses, 0);
  }
});

test("分类 属性 标签控制器逐条传递同一个完整员工 principal", async () => {
  const principal = {
    id: 9,
    username: "editor",
    role: "EDITOR",
    status: "ACTIVE",
    sessionFamilyId: "00000000-0000-4000-8000-000000000009",
  } as never;
  const received: unknown[] = [];
  const categories = new CategoriesController({
    findManageTree: async (actor: unknown) => received.push(actor),
    resolveReferences: async (_slugs: unknown, actor: unknown) => received.push(actor),
    create: async (_body: unknown, actor: unknown) => received.push(actor),
    reorder: async (_items: unknown, actor: unknown) => received.push(actor),
    update: async (_id: unknown, _body: unknown, actor: unknown) => received.push(actor),
    delete: async (_id: unknown, actor: unknown) => received.push(actor),
  } as never);
  const attributes = new AttributesController({
    findAll: async (actor: unknown) => received.push(actor),
    create: async (_body: unknown, actor: unknown) => received.push(actor),
    update: async (_id: unknown, _body: unknown, actor: unknown) => received.push(actor),
    remove: async (_id: unknown, actor: unknown) => received.push(actor),
    addValue: async (_id: unknown, _body: unknown, actor: unknown) => received.push(actor),
    updateValue: async (_id: unknown, _body: unknown, actor: unknown) => received.push(actor),
    removeValue: async (_id: unknown, actor: unknown) => received.push(actor),
  } as never);
  const tags = new TagsController({
    listTags: async (actor: unknown) => received.push(actor),
    createTag: async (_body: unknown, actor: unknown) => received.push(actor),
    updateTag: async (_id: unknown, _body: unknown, actor: unknown) => received.push(actor),
  } as never);

  await categories.findManageTree(principal);
  await categories.resolveReferences({ slugs: ["rings"] }, principal);
  await categories.create({ name: "戒指", slug: "rings" }, principal);
  await categories.reorder({ items: [{ id: 1, sortOrder: 0 }] }, principal);
  await categories.update(1, { name: "戒指" }, principal);
  await categories.delete(1, principal);
  await attributes.findAll(principal);
  await attributes.create({ name: "工艺", key: "craft" }, principal);
  await attributes.update(1, { name: "场景" }, principal);
  await attributes.remove(1, principal);
  await attributes.addValue(1, { value: "古法" }, principal);
  await attributes.updateValue(2, { value: "花丝" }, principal);
  await attributes.removeValue(2, principal);
  await tags.list(principal);
  await tags.create({ name: "节日赠礼" }, principal);
  await tags.update(1, { name: "古法工艺" }, principal);

  assert.equal(received.length, 16);
  assert.ok(received.every((actor) => actor === principal));
});
