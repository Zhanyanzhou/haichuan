import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PageModulesService } = require(
  "../server/dist/modules/page-modules/page-modules.service.js",
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oldPublishedAt = new Date("2026-08-11T10:07:45.021Z");
let clock = new Date("2026-08-13T12:09:32.840Z").getTime();
let lockCount = 0;

const clone = (value) => structuredClone(value);
const nextUpdatedAt = () => new Date(++clock);
const image = "https://example.com/jewelry.jpg";
const validData = (title) => ({
  content: [
    {
      type: "首屏主视觉",
      props: { id: "hero", title, desktopImage: image },
    },
  ],
  root: { props: {} },
  zones: {},
});

const state = {
  document: {
    id: 3,
    pageKey: "home",
    schemaVersion: 1,
    editorType: "puck",
    editorVersion: "0.22.4",
    templateId: null,
    templateVersion: null,
    puckData: validData("当前草稿"),
    metadata: {},
    status: "DRAFT",
    publishedAt: oldPublishedAt,
    publishedBy: 1,
    createdAt: new Date("2026-08-10T05:59:14.237Z"),
    updatedAt: new Date(clock),
  },
  revisions: [
    {
      id: 17,
      documentId: 3,
      version: 17,
      puckData: validData("旧版首页"),
      metadata: {},
      status: "published",
      publishedBy: 1,
      publishedAt: oldPublishedAt,
      createdAt: oldPublishedAt,
    },
  ],
};

const db = {
  pageDocument: {
    findUnique: async ({ where }) =>
      state.document?.pageKey === where.pageKey || state.document?.id === where.id
        ? clone(state.document)
        : null,
    updateMany: async ({ where, data }) => {
      if (
        state.document.pageKey !== where.pageKey ||
        state.document.updatedAt.getTime() !== where.updatedAt.getTime()
      ) {
        return { count: 0 };
      }
      Object.assign(state.document, clone(data), { updatedAt: nextUpdatedAt() });
      return { count: 1 };
    },
    create: async ({ data }) => {
      state.document = {
        ...clone(data),
        id: 3,
        status: "DRAFT",
        createdAt: nextUpdatedAt(),
        updatedAt: nextUpdatedAt(),
      };
      return clone(state.document);
    },
    update: async ({ data }) => {
      Object.assign(state.document, clone(data), { updatedAt: nextUpdatedAt() });
      return clone(state.document);
    },
  },
  pageDocumentRevision: {
    findFirst: async ({ where }) => {
      const matching = state.revisions
        .filter(
          (revision) =>
            revision.documentId === where.documentId &&
            (!where.status || revision.status === where.status),
        )
        .sort((a, b) => b.version - a.version);
      return matching[0] ? clone(matching[0]) : null;
    },
    create: async ({ data }) => {
      const revision = {
        id: state.revisions.length + 17,
        ...clone(data),
        createdAt: data.publishedAt ?? nextUpdatedAt(),
      };
      state.revisions.push(revision);
      return clone(revision);
    },
    deleteMany: async ({ where }) => {
      const before = state.revisions.length;
      state.revisions = state.revisions.filter(
        (revision) =>
          revision.documentId !== where.documentId ||
          revision.version >= where.version.lt,
      );
      return { count: before - state.revisions.length };
    },
    findMany: async () => clone(state.revisions),
  },
  product: {
    findMany: async ({ where }) =>
      where.id.in.map((id) => ({ id })),
  },
  $queryRaw: async () => {
    lockCount += 1;
    return [{ id: state.document.id }];
  },
  $transaction: async (callback) => callback(db),
};

const service = new PageModulesService(db);

const emptyResult = await service.validatePageDocument("home", {
  content: [],
  root: { props: {} },
});
assert.equal(emptyResult.valid, false);
assert.ok(emptyResult.errors.includes("页面至少需要 1 个可见的前台内容模块"));

const editorOnlyResult = await service.validatePageDocument("home", {
  content: [
    { type: "网站全局设置", props: { id: "settings" } },
    {
      type: "全屏出血图",
      props: { id: "hidden-story", title: "隐藏故事", image: "", isVisible: false },
    },
  ],
  root: { props: {} },
});
assert.equal(editorOnlyResult.valid, false);
assert.deepEqual(editorOnlyResult.errors, ["页面至少需要 1 个可见的前台内容模块"]);

const invalidResult = await service.validatePageDocument("home", {
  content: [
    {
      type: "全屏出血图",
      props: { id: "story", title: "品牌故事", image: "" },
    },
  ],
  root: { props: {} },
});
assert.equal(invalidResult.valid, false);
assert.ok(
  invalidResult.errors.includes("第 1 个区块「品牌故事」：image 图片不能为空"),
);

const publicBeforeSave = await service.getPublishedPageDocument("home");
assert.equal(publicBeforeSave.version, 17);
assert.equal(publicBeforeSave.puckData.content[0].props.title, "旧版首页");
assert.equal(publicBeforeSave.updatedAt.toISOString(), oldPublishedAt.toISOString());

const saved = await service.savePageDocument(
  "home",
  validData("新版首页"),
  { seoTitle: "新版首页" },
  "0.22.4",
  state.document.updatedAt.toISOString(),
);
assert.equal(saved.status, "DRAFT");

const publicAfterSave = await service.getPublishedPageDocument("home");
assert.equal(publicAfterSave.version, 17);
assert.equal(publicAfterSave.puckData.content[0].props.title, "旧版首页");
assert.equal(publicAfterSave.updatedAt.toISOString(), oldPublishedAt.toISOString());

await service.publishPageDocument(
  "home",
  1,
  state.document.updatedAt.toISOString(),
);
const publicAfterPublish = await service.getPublishedPageDocument("home");
assert.equal(lockCount, 1, "发布前必须锁定页面文档");
assert.equal(publicAfterPublish.version, 18);
assert.equal(publicAfterPublish.puckData.content[0].props.title, "新版首页");
assert.equal(
  publicAfterPublish.updatedAt.toISOString(),
  publicAfterPublish.publishedAt.toISOString(),
);

const [schema, migration] = await Promise.all([
  readFile(path.join(root, "server/prisma/schema.prisma"), "utf8"),
  readFile(
    path.join(
      root,
      "server/prisma/migrations/20260813150000_unique_page_document_revision_version/migration.sql",
    ),
    "utf8",
  ),
]);
assert.match(schema, /@@unique\(\[documentId, version\]\)/);
assert.match(migration, /CREATE UNIQUE INDEX/);

console.log("页面构建器保存、校验、发布与公开快照闭环通过。");
