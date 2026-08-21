import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  PageModulesService,
} = require("../server/dist/modules/page-modules/page-modules.service.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oldPublishedAt = new Date("2026-08-11T10:07:45.021Z");
let clock = new Date("2026-08-13T12:09:32.840Z").getTime();
let lockCount = 0;

const clone = (value) => structuredClone(value);
const nextUpdatedAt = () => new Date(++clock);
const image = "https://example.com/jewelry.jpg";
const validData = (title, marker = undefined) => ({
  content: [
    {
      type: "首屏主视觉",
      props: {
        id: "hero",
        title,
        desktopImage: image,
        ...(marker ? { __contentTemplate: marker } : {}),
      },
    },
  ],
  root: { props: {} },
  zones: {},
});

const state = {
  document: {
    id: 3,
    pageKey: "home",
    schemaVersion: 7,
    editorType: "puck",
    editorVersion: "0.22.4",
    templateId: "existing-page-template",
    templateVersion: 4,
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
      state.document?.pageKey === where.pageKey ||
      state.document?.id === where.id
        ? clone(state.document)
        : null,
    updateMany: async ({ where, data }) => {
      if (
        state.document.pageKey !== where.pageKey ||
        state.document.updatedAt.getTime() !== where.updatedAt.getTime()
      ) {
        return { count: 0 };
      }
      Object.assign(state.document, clone(data), {
        updatedAt: nextUpdatedAt(),
      });
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
      Object.assign(state.document, clone(data), {
        updatedAt: nextUpdatedAt(),
      });
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
    findMany: async ({ where }) => {
      if (where.id?.in) {
        return where.id.in
          .filter((id) => id !== 99)
          .map((id) => ({
            id,
            listingImageId: 1,
            primaryImageId: null,
            images: [],
          }));
      }
      return (where.code?.in ?? [])
        .filter((code) => code !== "NON-PUBLIC-CODE")
        .map((code) => ({
          code,
          listingImageId: 1,
          primaryImageId: null,
          images: [],
        }));
    },
  },
  category: {
    findMany: async () => [
      { id: 1, parentId: null, slug: "public-category", coverImage: image, products: [{ id: 1 }] },
      { id: 2, parentId: null, slug: "no-cover-category", coverImage: null, products: [{ id: 2 }] },
    ],
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
      props: {
        id: "hidden-story",
        title: "隐藏故事",
        image: "",
        isVisible: false,
      },
    },
  ],
  root: { props: {} },
});
assert.equal(editorOnlyResult.valid, false);
assert.deepEqual(editorOnlyResult.errors, [
  "页面至少需要 1 个可见的前台内容模块",
]);

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
assert.equal(
  invalidResult.issues.find(
    (issue) => issue.message === "第 1 个区块「品牌故事」：image 图片不能为空",
  )?.blockId,
  "story",
  "区块级发布错误必须携带稳定 blockId，编辑器不得反向解析中文文案定位",
);

const nonPublicProductResult = await service.validatePageDocument("home", {
  content: [
    {
      type: "产品展示行",
      props: { id: "product-row", title: "推荐作品", productIds: [99] },
    },
  ],
  root: { props: {} },
  zones: {},
});
assert.equal(nonPublicProductResult.valid, false);
assert.equal(
  nonPublicProductResult.issues.find((issue) =>
    issue.message.includes("商品 ID 99 未满足公开发布条件"),
  )?.blockId,
  "product-row",
  "商品公开状态错误必须定位到引用该商品的区块",
);

const nonPublicProductCodeResult = await service.validatePageDocument("home", {
  content: [
    {
      type: "产品展示行",
      props: {
        id: "product-code-row",
        title: "稳定编码作品",
        productCodes: ["PUBLIC-CODE", "NON-PUBLIC-CODE"],
      },
    },
  ],
  root: { props: {} },
  zones: {},
});
assert.equal(nonPublicProductCodeResult.valid, false);
const nonPublicCodeIssue = nonPublicProductCodeResult.issues.find((issue) =>
  issue.message.includes("商品 NON-PUBLIC-CODE 未满足公开发布条件"),
);
assert.deepEqual(
  {
    blockId: nonPublicCodeIssue?.blockId,
    field: nonPublicCodeIssue?.field,
    path: nonPublicCodeIssue?.path,
    index: nonPublicCodeIssue?.index,
  },
  {
    blockId: "product-code-row",
    field: "productCodes",
    path: "content[0].props.productCodes[1]",
    index: 1,
  },
  "商品 code 发布资格错误必须精确定位到区块、字段和数组项",
);

const legacyResult = await service.validatePageDocument("home", validData("历史区块"));
assert.equal(legacyResult.valid, true, "legacy-0 区块必须仍可读取和发布");
assert.ok(
  legacyResult.issues.some(
    (issue) => issue.code === "content-template-legacy" && issue.severity === "info",
  ),
  "历史区块必须明确标记为 legacy-0，而不是静默升级",
);

const mismatchedData = validData("错误印记", { key: "textBanner", version: 1 });
const mismatchResult = await service.validatePageDocument("home", mismatchedData);
assert.equal(mismatchResult.valid, false);
assert.ok(
  mismatchResult.issues.some((issue) => issue.code === "content-template-key-mismatch"),
  "区块 type 与内容模板 key 不匹配必须形成结构化 issue",
);

const unknownVersionData = validData("未知版本", { key: "hero", version: 99 });
const unknownVersionResult = await service.validatePageDocument("home", unknownVersionData);
assert.equal(unknownVersionResult.valid, false);
assert.ok(
  unknownVersionResult.issues.some((issue) => issue.code === "content-template-version-unsupported"),
  "未知内容模板版本不得猜测为当前版本",
);

const unsafeHeroData = validData("", { key: "hero", version: 2 });
unsafeHeroData.content[0].props.__instanceOverrides = {
  version: 1,
  textRoles: { copy: { enabled: true, placementPreset: "overlay" } },
};
const unsafeHeroResult = await service.validatePageDocument("home", unsafeHeroData);
assert.equal(unsafeHeroResult.valid, false, "启用图片叠字而未选择安全文字带时必须阻止发布");
assert.ok(unsafeHeroResult.issues.some((issue) => issue.path.includes("__instanceOverrides.textRoles.copy.safeBand")), "安全文字带问题必须定位到精确覆盖路径");

const unsafeHeroV2Data = validData("真实标题", { key: "hero", version: 2 });
unsafeHeroV2Data.content[0].props.__instanceOverrides = {
  version: 2,
  nodes: { title: { enabled: true, typography: { align: "center" } } },
};
const unsafeHeroV2Result = await service.validatePageDocument("home", unsafeHeroV2Data);
assert.equal(unsafeHeroV2Result.valid, false, "v2 图片叠字未选择安全文字带时必须阻止发布");
assert.ok(
  unsafeHeroV2Result.issues.some((issue) =>
    issue.path.includes("__instanceOverrides.nodes.title.typography.safeBand"),
  ),
  "v2 安全文字带问题必须定位到具体语义文字节点",
);

const emptyHeroRoleData = validData("", { key: "hero", version: 2 });
emptyHeroRoleData.content[0].props.__instanceOverrides = {
  version: 2,
  nodes: { title: { enabled: true, typography: { safeBand: "dark" } } },
};
const emptyHeroRoleResult = await service.validatePageDocument("home", emptyHeroRoleData);
assert.equal(emptyHeroRoleResult.valid, false, "启用空的语义文字角色时必须阻止发布");
assert.ok(
  emptyHeroRoleResult.issues.some((issue) => issue.path.endsWith(".props.title")),
  "空文字角色问题必须定位到实际内容字段",
);

const unsafeHeroFrameData = validData("真实标题", { key: "hero", version: 2 });
unsafeHeroFrameData.content[0].props.__instanceOverrides = {
  version: 2,
  frame: { aspectRatioByViewport: { desktop: 3.2 } },
};
const unsafeHeroFrameResult = await service.validatePageDocument("home", unsafeHeroFrameData);
assert.equal(unsafeHeroFrameResult.valid, false, "超出模板边界的整体比例必须阻止发布");
assert.ok(
  unsafeHeroFrameResult.issues.some((issue) =>
    issue.path.endsWith("__instanceOverrides.frame.aspectRatioByViewport.desktop"),
  ),
  "整体比例问题必须定位到具体设备覆盖路径",
);

const unsafeHeroColorData = validData("真实标题", { key: "hero", version: 2 });
unsafeHeroColorData.content[0].props.__instanceOverrides = {
  version: 2,
  frame: { customColors: { background: "#123456" } },
};
const unsafeHeroColorResult = await service.validatePageDocument("home", unsafeHeroColorData);
assert.equal(unsafeHeroColorResult.valid, false, "实例颜色不得绕过受控品牌色板");
assert.ok(
  unsafeHeroColorResult.issues.some((issue) =>
    issue.path.endsWith("__instanceOverrides.frame.customColors.background"),
  ),
  "非法实例颜色必须定位到具体颜色键",
);

const bookingFrameData = {
  content: [{
    type: "预约入口",
    props: {
      id: "booking",
      title: "预约鉴赏",
      buttonText: "立即预约",
      linkUrl: "/contact",
      backgroundImage: image,
      __contentTemplate: { key: "booking", version: 2 },
      __instanceOverrides: {
        version: 2,
        frame: { aspectRatioByViewport: { desktop: 16 / 9, mobile: 4 / 5 } },
        nodes: {
          bgImage: {
            mediaView: {
              fit: "contain",
              zoom: 1.05,
              focusByViewport: { desktop: { x: 36, y: 64 } },
            },
          },
        },
      },
    },
  }],
  root: { props: {} },
  zones: {},
};
const bookingFrameResult = await service.validatePageDocument("home", bookingFrameData);
assert.equal(bookingFrameResult.valid, true, "Booking 应以整体框架比例和背景观看参数通过发布合同");

const invalidBookingData = clone(bookingFrameData);
invalidBookingData.content[0].props.linkUrl = "javascript:alert(1)";
invalidBookingData.content[0].props.phone = "abc";
const invalidBookingResult = await service.validatePageDocument("home", invalidBookingData);
assert.equal(invalidBookingResult.valid, false, "Booking 非法主行动与电话必须被服务端发布门禁阻止");
assert.deepEqual(
  invalidBookingResult.issues
    .filter((issue) => issue.blockId === "booking" && ["linkUrl", "phone"].includes(issue.field))
    .map((issue) => issue.field)
    .sort(),
  ["linkUrl", "phone"],
  "Booking 发布问题必须精确定位到链接和电话字段",
);

const invalidCategoryData = {
  content: [{
    type: "分类卡片",
    props: {
      id: "category-cards",
      categorySlugs: ["public-category", "no-cover-category"],
      __contentTemplate: { key: "categoryCards", version: 2 },
    },
  }],
  root: { props: {} },
  zones: {},
};
const invalidCategoryResult = await service.validatePageDocument("home", invalidCategoryData);
const invalidCategoryIssue = invalidCategoryResult.issues.find((issue) => issue.message.includes("no-cover-category"));
assert.deepEqual(
  {
    blockId: invalidCategoryIssue?.blockId,
    field: invalidCategoryIssue?.field,
    path: invalidCategoryIssue?.path,
    index: invalidCategoryIssue?.index,
  },
  {
    blockId: "category-cards",
    field: "categorySlugs",
    path: "content[0].props.categorySlugs[1]",
    index: 1,
  },
  "分类发布资格错误必须精确定位到区块、字段和数组项",
);

state.document.puckData = mismatchedData;
const revisionsBeforeRejectedPublish = state.revisions.length;
await assert.rejects(
  () => service.publishPageDocument("home", 1, state.document.updatedAt.toISOString()),
  /页面发布校验失败/,
  "服务端发布必须阻止合同印记错误",
);
assert.equal(
  state.revisions.length,
  revisionsBeforeRejectedPublish,
  "合同印记错误不得写入发布 revision",
);
state.document.puckData = validData("当前草稿");

const publicBeforeSave = await service.getPublishedPageDocument("home");
assert.equal(publicBeforeSave.version, 17);
assert.equal(publicBeforeSave.puckData.content[0].props.title, "旧版首页");
assert.equal(
  publicBeforeSave.updatedAt.toISOString(),
  oldPublishedAt.toISOString(),
);

const firstClientRevision = state.document.updatedAt.toISOString();
const saved = await service.savePageDocument(
  "home",
  validData("新版首页", { key: "hero", version: 1 }),
  {
    seoTitle: "新版首页",
    contentTemplateContract: { version: 999, templates: [{ id: "hero", version: 999 }] },
  },
  "0.22.4",
  firstClientRevision,
);
assert.equal(saved.status, "DRAFT");
assert.deepEqual(saved.puckData.content[0].props.__contentTemplate, {
  key: "hero",
  version: 1,
});
assert.equal(saved.schemaVersion, 7, "区块合同不得提升页面 schemaVersion");
assert.equal(saved.templateId, "existing-page-template", "区块合同不得改写整页模板 ID");
assert.equal(saved.templateVersion, 4, "区块合同不得提升整页模板版本");
assert.equal(
  Object.hasOwn(saved.metadata, "contentTemplateContract"),
  false,
  "普通保存不得重新写入旧页面级合同摘要",
);

await assert.rejects(
  () => service.savePageDocument(
    "home",
    validData("第二个浏览器的过期修改", { key: "hero", version: 1 }),
    {},
    "0.22.4",
    firstClientRevision,
  ),
  /其他编辑者更新/,
  "第二个浏览器携带旧 updatedAt 保存时必须返回冲突且保留服务端新版本",
);
assert.equal(
  state.document.puckData.content[0].props.title,
  "新版首页",
  "409 冲突不得覆盖第一个浏览器已保存的草稿",
);

const publicAfterSave = await service.getPublishedPageDocument("home");
assert.equal(publicAfterSave.version, 17);
assert.equal(publicAfterSave.puckData.content[0].props.title, "旧版首页");
assert.equal(
  publicAfterSave.updatedAt.toISOString(),
  oldPublishedAt.toISOString(),
);

const publicEvents = [];
const publicEventSubscription = service.publicChangeStream().subscribe((event) => {
  publicEvents.push(event.data);
});
await service.publishPageDocument(
  "home",
  1,
  state.document.updatedAt.toISOString(),
);
const publicAfterPublish = await service.getPublishedPageDocument("home");
assert.equal(lockCount, 2, "每次发布尝试都必须先锁定页面文档");
assert.equal(publicAfterPublish.version, 18);
assert.equal(publicAfterPublish.puckData.content[0].props.title, "新版首页");
assert.equal(
  publicAfterPublish.updatedAt.toISOString(),
  publicAfterPublish.publishedAt.toISOString(),
);
assert.deepEqual(
  publicEvents.find((event) => event.type === "page-document-published"),
  {
    type: "page-document-published",
    pageKey: "home",
    version: 18,
    changedAt: publicEvents.find((event) => event.type === "page-document-published").changedAt,
  },
  "发布成功后必须广播页面与版本，前台才能实时重新读取发布快照",
);
publicEventSubscription.unsubscribe();

const untouchedLegacy = validData("兼容旧草稿");
const legacySaved = await service.savePageDocument(
  "home",
  untouchedLegacy,
  {},
  "0.22.4",
  state.document.updatedAt.toISOString(),
);
assert.equal(Object.hasOwn(legacySaved.puckData.content[0].props, "__instanceOverrides"), false, "未触碰实例布局的普通保存不得序列化覆盖字段");
assert.equal(Object.hasOwn(legacySaved.puckData.content[0].props, "__contentTemplate"), false, "旧草稿普通保存不得静默补写模板印记或升级版本");

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
