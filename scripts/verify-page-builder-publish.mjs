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
const contentTemplateContract = JSON.parse(
  await readFile(
    path.join(root, "contracts/page-builder/content-templates.contract.json"),
    "utf8",
  ),
);
const oldPublishedAt = new Date("2026-08-11T10:07:45.021Z");
let clock = new Date("2026-08-13T12:09:32.840Z").getTime();
let lockCount = 0;

const clone = (value) => structuredClone(value);
const nextUpdatedAt = () => new Date(++clock);
const image = "https://example.com/jewelry.jpg";
const validMetadata = (title = "海川珠宝正式页面") => ({
  seoTitle: title,
  seoDescription: `${title}的公开页面说明，仅用于页面搭建器发布门禁测试。`,
  ogImage: image,
  contentOwner: "品牌内容组",
  mediaRights: [{
    assetUrl: image,
    source: "发布脚本测试素材",
    authorizationId: "TEST-PUBLISH-MEDIA-1",
  }],
});
const validData = (title, marker = undefined) => ({
  content: [
    {
      type: "首屏主视觉",
      props: {
        id: "hero",
        title,
        desktopImage: image,
        mobileImage: image,
        altText: `${title}主视觉`,
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
    metadata: validMetadata("当前草稿"),
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
      metadata: validMetadata("旧版首页"),
      status: "published",
      publishedBy: 1,
      publishedAt: oldPublishedAt,
      createdAt: oldPublishedAt,
    },
  ],
};

const db = {
  siteSetting: {
    findUnique: async () => ({
      key: "site",
      value: { contactPhone: "400-111-2222" },
    }),
  },
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
  "覆盖式浅色导航要求首个可见品牌模块为首屏主视觉",
]);

const unfinishedBrandHomeResult = await service.validatePageDocument("home", {
  content: [
    {
      type: "首屏主视觉",
      props: {
        id: "brand-home-hero",
        title: "海川珠宝",
        desktopImage: "",
        mobileImage: "",
      },
    },
    {
      type: "全屏出血图",
      props: {
        id: "brand-home-works",
        title: "代表作品",
        image: "",
        mobileImage: "",
      },
    },
    {
      type: "双图海报",
      props: {
        id: "brand-home-craft",
        title: "设计与工艺",
        mainImage: "",
        detailImage: "",
      },
    },
    {
      type: "单图海报",
      props: {
        id: "brand-home-custom",
        title: "珠宝定制",
        desktopImage: "",
        mobileImage: "",
      },
    },
  ],
  root: { props: {} },
});
assert.equal(unfinishedBrandHomeResult.valid, false);
assert.ok(
  unfinishedBrandHomeResult.errors.some((error) =>
    error.includes("brand-home-hero") || error.includes("海川珠宝"),
  ),
  "首页首屏缺少最终素材时必须阻断发布",
);
assert.ok(
  unfinishedBrandHomeResult.errors.some((error) =>
    error.includes("代表作品") && error.includes("图片不能为空"),
  ),
  "首页作品区缺少最终素材时必须阻断发布",
);

const validProductsResult = await service.validatePageDocument(
  "products",
  validData("珠宝作品"),
  validMetadata("珠宝作品"),
);
assert.equal(
  validProductsResult.valid,
  true,
  `作品页允许纯品牌展陈且不要求业务功能区：${JSON.stringify(validProductsResult.errors)}`,
);

const productsWithBusinessRegion = validData("珠宝作品");
productsWithBusinessRegion.content.push({
  type: "业务功能区",
  props: {
    id: "products-business-region",
    pageKey: "products",
    title: "商品列表与筛选",
  },
});
const productsWithBusinessRegionResult = await service.validatePageDocument(
  "products",
  productsWithBusinessRegion,
  validMetadata("珠宝作品"),
);
assert.equal(productsWithBusinessRegionResult.valid, false);
assert.ok(
  productsWithBusinessRegionResult.errors.some((error) =>
    error.includes("固定业务区数量为 0"),
  ),
  `珠宝作品页必须拒绝筛选/结果业务区：${JSON.stringify(productsWithBusinessRegionResult.errors)}`,
);

const unfinishedProductsResult = await service.validatePageDocument(
  "products",
  {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "products-hero",
          title: "珠宝作品",
          desktopImage: "",
          mobileImage: "",
        },
      },
      {
        type: "单品焦点推荐",
        props: {
          id: "products-signature-reference",
          title: "代表作品",
          productCode: "",
          productId: 0,
        },
      },
    ],
    root: { props: {} },
  },
  validMetadata("珠宝作品"),
);
assert.equal(unfinishedProductsResult.valid, false);
assert.ok(
  unfinishedProductsResult.errors.some((error) =>
    error.includes("代表作品") && error.includes("商品"),
  ),
  "作品页未选择真实公开商品引用时必须阻断发布",
);

const validCatalogFrame = {
  content: [
    {
      type: "文字横幅",
      props: {
        id: "catalog-intro",
        title: "选款中心",
        body: "按关键词、货号与真实属性查找作品。",
        targetType: "none",
        linkUrl: "",
      },
    },
    {
      type: "业务功能区",
      props: {
        id: "catalog-business-region",
        pageKey: "catalog",
        title: "选款工具与商品结果",
        locked: true,
      },
    },
  ],
  root: { props: {} },
};
const validCatalogFrameResult = await service.validatePageDocument("catalog", validCatalogFrame, validMetadata("选款中心"));
assert.equal(
  validCatalogFrameResult.valid,
  true,
  `选款中心必须允许一个紧随品牌框架的固定业务区：${JSON.stringify(validCatalogFrameResult.errors)}`,
);

const catalogWithoutBusinessRegion = clone(validCatalogFrame);
catalogWithoutBusinessRegion.content.splice(1, 1);
const catalogWithoutBusinessRegionResult = await service.validatePageDocument(
  "catalog",
  catalogWithoutBusinessRegion,
  validMetadata("选款中心"),
);
assert.equal(catalogWithoutBusinessRegionResult.valid, false);
assert.ok(
  catalogWithoutBusinessRegionResult.errors.some((error) => error.includes("固定业务区数量为 1")),
  "选款中心缺少唯一固定业务区时必须阻断发布",
);

for (const pageKey of ["custom", "about"]) {
  const unfinishedBrandPage = {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: `${pageKey}-hero`,
          title: pageKey === "custom" ? "珠宝定制" : "关于海川",
          desktopImage: "",
          mobileImage: "",
        },
      },
      {
        type: "文字横幅",
        props: {
          id: `${pageKey}-draft-copy`,
          title: "待确认内容",
          body: "等待真实资料",
        },
      },
    ],
    root: { props: {} },
  };
  const unfinishedBrandPageResult = await service.validatePageDocument(pageKey, unfinishedBrandPage, validMetadata(`${pageKey} 页面`));
  assert.equal(unfinishedBrandPageResult.valid, false);
  assert.ok(
    unfinishedBrandPageResult.errors.some((error) => error.includes("图片不能为空")),
    `${pageKey} 缺少最终主视觉素材时必须阻断发布`,
  );
  assert.ok(
    unfinishedBrandPageResult.errors.some((error) => error.includes("占位内容")),
    `${pageKey} 未确认文案必须阻断发布`,
  );
}

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

const sharedDesignData = validData("同类共享设计");
const firstSharedDesignBlock = {
  type: "文字横幅",
  props: {
    id: "same-type-first",
    title: "第一个实例内容",
    body: "内容保持独立",
    __instanceOverrides: {
      version: 2,
      frame: { aspectRatioByViewport: { desktop: 1.5 } },
    },
  },
};
const secondSharedDesignBlock = clone(firstSharedDesignBlock);
secondSharedDesignBlock.props.id = "same-type-second";
secondSharedDesignBlock.props.title = "独立内容";
secondSharedDesignBlock.props.__instanceOverrides = clone(
  firstSharedDesignBlock.props.__instanceOverrides,
);
sharedDesignData.content.push(firstSharedDesignBlock, secondSharedDesignBlock);
const sharedDesignResult = await service.validatePageDocument(
  "home",
  sharedDesignData,
  validMetadata("同类共享设计"),
);
assert.equal(
  sharedDesignResult.valid,
  true,
  `同页同类实例设计相同且内容独立时必须允许发布：${JSON.stringify(sharedDesignResult.issues)}`,
);

secondSharedDesignBlock.props.__instanceOverrides.frame.aspectRatioByViewport.desktop = 1.25;
const divergentSharedDesignResult = await service.validatePageDocument(
  "home",
  sharedDesignData,
  validMetadata("同类设计不一致"),
);
assert.equal(divergentSharedDesignResult.valid, false, "同页同类实例设计不一致必须阻断发布");
assert.deepEqual(
  divergentSharedDesignResult.issues.find(
    (issue) => issue.code === "content-template-shared-design-mismatch",
  ) && {
    blockId: divergentSharedDesignResult.issues.find(
      (issue) => issue.code === "content-template-shared-design-mismatch",
    ).blockId,
    moduleType: divergentSharedDesignResult.issues.find(
      (issue) => issue.code === "content-template-shared-design-mismatch",
    ).moduleType,
    path: divergentSharedDesignResult.issues.find(
      (issue) => issue.code === "content-template-shared-design-mismatch",
    ).path,
  },
  {
    blockId: "same-type-second",
    moduleType: "文字横幅",
    path: "content[2].props.__instanceOverrides",
  },
  "同类设计不一致必须定位到模块、模板类型和覆盖路径",
);

const coveredActionData = validData("行动遮挡校验");
coveredActionData.content.push({
  type: "文字横幅",
  props: {
    id: "covered-action-banner",
    title: "查看系列",
    buttonText: "进入作品页",
    targetType: "page",
    linkUrl: "/products",
    __instanceOverrides: {
      version: 2,
      nodes: {
        action: {
          rectByViewport: { desktop: { x: 0.35, y: 0.4, width: 0.3, height: 0.12 } },
          zIndexByViewport: { desktop: 2 },
        },
        bgImage: {
          rectByViewport: { desktop: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 } },
          zIndexByViewport: { desktop: 4 },
        },
      },
    },
  },
});
const coveredActionResult = await service.validatePageDocument(
  "home",
  coveredActionData,
  validMetadata("行动遮挡校验"),
);
assert.equal(coveredActionResult.valid, false, "可确定被完全遮挡的行动对象必须阻断发布");
assert.ok(
  coveredActionResult.issues.some((issue) =>
    issue.blockId === "covered-action-banner" &&
    issue.severity === "error" &&
    issue.message.includes("完全遮挡")),
  "行动遮挡问题必须定位到具体模块并返回结构化错误",
);

coveredActionData.content[1].props.__instanceOverrides.nodes.bgImage.rectByViewport.desktop = {
  x: 0.58, y: 0.2, width: 0.22, height: 0.6,
};
const overlappingActionResult = await service.validatePageDocument(
  "home",
  coveredActionData,
  validMetadata("普通重叠校验"),
);
assert.equal(
  overlappingActionResult.valid,
  true,
  `普通对象重叠只能警告，不得阻断发布：${JSON.stringify(overlappingActionResult.issues)}`,
);
assert.ok(
  overlappingActionResult.issues.some((issue) =>
    issue.blockId === "covered-action-banner" && issue.severity === "warning" &&
    issue.message.includes("自定义重叠")),
  "普通重叠必须返回可定位 warning",
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

const unsafeHeroData = validData("真实标题", { key: "hero", version: 2 });
unsafeHeroData.content[0].props.__instanceOverrides = {
  version: 1,
  textRoles: { copy: { enabled: true, placementPreset: "overlay" } },
};
const unsafeHeroResult = await service.validatePageDocument("home", unsafeHeroData);
assert.equal(unsafeHeroResult.valid, true, "自由构图中的文字叠图不应仅因缺少安全文字带阻止发布");
assert.equal(unsafeHeroResult.issues.some((issue) => issue.path.includes("__instanceOverrides.textRoles.copy.safeBand")), false, "安全文字带不得继续作为结构性发布阻断");

const unsafeHeroV2Data = validData("真实标题", { key: "hero", version: 2 });
unsafeHeroV2Data.content[0].props.__instanceOverrides = {
  version: 2,
  nodes: { title: { enabled: true, typography: { align: "center" } } },
};
const unsafeHeroV2Result = await service.validatePageDocument("home", unsafeHeroV2Data);
assert.equal(unsafeHeroV2Result.valid, true, "v2 文字叠图缺少安全文字带只属于构图风险，不应阻止发布");
assert.equal(
  unsafeHeroV2Result.issues.some((issue) =>
    issue.path.includes("__instanceOverrides.nodes.title.typography.safeBand"),
  ),
  false,
  "v2 安全文字带不得继续作为结构性发布阻断",
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
  frame: { aspectRatioByViewport: { desktop: 4.2 } },
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

const requiredAltCases = [
  {
    pageKey: "home",
    type: "全屏出血图",
    props: { id: "alt-full-bleed", image, mobileImage: image, altText: "" },
    altFields: ["altText"],
  },
  {
    pageKey: "home",
    type: "单图海报",
    props: { id: "alt-single-poster", title: "正式海报", desktopImage: image, mobileImage: image, altText: "" },
    altFields: ["altText"],
  },
  {
    pageKey: "home",
    type: "双图海报",
    props: { id: "alt-double-poster", mainImage: image, detailImage: image, mainAltText: "", detailAltText: "" },
    altFields: ["detailAltText", "mainAltText"],
  },
  {
    pageKey: "custom",
    type: "改款对比",
    props: { id: "alt-comparison", title: "改款记录", beforeImage: image, afterImage: image, beforeAltText: "", afterAltText: "" },
    altFields: ["afterAltText", "beforeAltText"],
  },
  {
    pageKey: "home",
    type: "佩戴灵感",
    props: { id: "alt-wearing", image, altText: "", productCodes: ["ALT-1"] },
    altFields: ["altText"],
  },
  {
    pageKey: "home",
    type: "预约入口",
    props: { id: "alt-booking", title: "预约鉴赏", buttonText: "立即预约", linkUrl: "/contact", backgroundImage: image, altText: "" },
    altFields: ["altText"],
  },
];

for (const testCase of requiredAltCases) {
  const pageData = validData(`${testCase.type}替代文字门禁`);
  pageData.content.push({ type: testCase.type, props: testCase.props });
  const missingAltResult = await service.validatePageDocument(testCase.pageKey, pageData, validMetadata(`${testCase.type}测试页`));
  assert.equal(missingAltResult.valid, false, `${testCase.type} 配置公开媒体但缺少替代文字时必须阻止发布`);
  assert.deepEqual(
    missingAltResult.issues
      .filter((issue) => issue.blockId === testCase.props.id && testCase.altFields.includes(issue.field))
      .map((issue) => issue.field)
      .sort(),
    [...testCase.altFields].sort(),
    `${testCase.type} 替代文字问题必须定位到实际字段`,
  );

  const completeAltData = clone(pageData);
  for (const field of testCase.altFields) {
    completeAltData.content[1].props[field] = `${testCase.type}${field}正式替代文字`;
  }
  const completeAltResult = await service.validatePageDocument(testCase.pageKey, completeAltData, validMetadata(`${testCase.type}测试页`));
  assert.equal(completeAltResult.valid, true, `${testCase.type} 补齐替代文字后应通过发布门禁：${JSON.stringify(completeAltResult.errors)}`);
}

const collectionAltData = validData("集合媒体替代文字门禁");
collectionAltData.content.push(
  {
    type: "轮播图",
    props: {
      id: "alt-carousel",
      images: [
        { url: image, mobileUrl: image, alt: "首张轮播正式替代文字" },
        { url: image, alt: "" },
      ],
    },
  },
  {
    type: "作品画廊",
    props: {
      id: "alt-gallery",
      title: "正式作品画廊",
      items: [
        { image, altText: "作品一" },
        { image, altText: "" },
        { image, altText: "作品三" },
      ],
    },
  },
  {
    type: "按场景选购",
    props: {
      id: "alt-scenes",
      title: "按场景选购",
      categories: [
        { image, name: "日常佩戴", altText: "日常佩戴珠宝", targetType: "page", linkUrl: "/catalog" },
        { image, name: "重要礼赠", altText: "", targetType: "page", linkUrl: "/catalog" },
      ],
    },
  },
);
const missingCollectionAltResult = await service.validatePageDocument("home", collectionAltData, validMetadata("集合媒体测试页"));
assert.equal(missingCollectionAltResult.valid, false, "集合媒体任一公开图片缺少替代文字时必须阻止发布");
assert.deepEqual(
  missingCollectionAltResult.issues
    .filter((issue) => ["alt-carousel", "alt-gallery", "alt-scenes"].includes(issue.blockId))
    .map((issue) => ({ blockId: issue.blockId, field: issue.field, index: issue.index, path: issue.path }))
    .filter((issue) => issue.path.endsWith(".alt") || issue.path.endsWith(".altText")),
  [
    { blockId: "alt-carousel", field: "images", index: 1, path: "content[1].props.images[1].alt" },
    { blockId: "alt-gallery", field: "items", index: 1, path: "content[2].props.items[1].altText" },
    { blockId: "alt-scenes", field: "categories", index: 1, path: "content[3].props.categories[1].altText" },
  ],
  "集合媒体替代文字问题必须定位到区块、集合字段、数组下标和条目字段",
);
const completeCollectionAltData = clone(collectionAltData);
completeCollectionAltData.content[1].props.images[1].alt = "第二张轮播正式替代文字";
completeCollectionAltData.content[2].props.items[1].altText = "作品二";
completeCollectionAltData.content[3].props.categories[1].altText = "重要礼赠珠宝";
const completeCollectionAltResult = await service.validatePageDocument("home", completeCollectionAltData, validMetadata("集合媒体测试页"));
assert.equal(completeCollectionAltResult.valid, true, `集合媒体补齐替代文字后应通过发布门禁：${JSON.stringify(completeCollectionAltResult.errors)}`);

const bookingWithoutImageData = validData("预约纯色背景");
bookingWithoutImageData.content.push({
  type: "预约入口",
  props: {
    id: "booking-without-image",
    title: "预约鉴赏",
    buttonText: "立即预约",
    linkUrl: "/contact",
    backgroundImage: "",
    altText: "",
  },
});
const bookingWithoutImageResult = await service.validatePageDocument("home", bookingWithoutImageData, validMetadata("预约测试页"));
assert.equal(bookingWithoutImageResult.valid, true, "预约入口使用纯色背景时不应强制填写不存在图片的替代文字");

const bookingFrameData = {
  content: [
    validData("首页首屏").content[0],
    {
      type: "预约入口",
      props: {
        id: "booking",
        title: "预约鉴赏",
        buttonText: "立即预约",
        linkUrl: "/contact",
        backgroundImage: image,
        altText: "预约鉴赏空间背景",
        __contentTemplate: { key: "booking", version: 2 },
        __instanceOverrides: {
          version: 2,
          frame: { aspectRatioByViewport: { desktop: 16 / 9, mobile: 4 / 5 } },
          nodes: {
            bgImage: {
              zIndexByViewport: { desktop: 1, mobile: 3 },
              mediaView: {
                fit: "contain",
                zoom: 1.05,
                focusByViewport: { desktop: { x: 36, y: 64 } },
              },
            },
          },
        },
      },
    },
  ],
  root: { props: {} },
  zones: {},
};
const bookingFrameResult = await service.validatePageDocument("home", bookingFrameData);
assert.equal(bookingFrameResult.valid, true, "Booking 应以整体框架比例和背景观看参数通过发布合同");

const invalidLayerOrderData = clone(bookingFrameData);
invalidLayerOrderData.content[1].props.__instanceOverrides.nodes.bgImage.zIndexByViewport.mobile = 21;
const invalidLayerOrderResult = await service.validatePageDocument("home", invalidLayerOrderData);
assert.equal(invalidLayerOrderResult.valid, false, "节点层级超出 0–20 时必须阻止发布");
assert.ok(
  invalidLayerOrderResult.issues.some((issue) =>
    issue.path.endsWith("__instanceOverrides.nodes.bgImage.zIndexByViewport.mobile"),
  ),
  "非法节点层级必须定位到具体设备覆盖路径",
);

const invalidBookingData = clone(bookingFrameData);
invalidBookingData.content[1].props.linkUrl = "javascript:alert(1)";
invalidBookingData.content[1].props.phone = "abc";
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

const incompleteCollectionData = {
  content: [
    {
      type: "首屏主视觉",
      props: {
        id: "custom-hero",
        title: "定制服务",
        desktopImage: image,
        mobileImage: image,
        altText: "定制服务主视觉",
        __contentTemplate: { key: "hero", version: 2 },
      },
    },
    {
      type: "定制流程",
      props: {
        id: "custom-journey",
        title: "定制流程",
        steps: [{ number: "01", name: "需求沟通", desc: "确认设计方向", image }],
        __contentTemplate: { key: "journey", version: 2 },
      },
    },
    {
      type: "资质证书",
      props: {
        id: "custom-certificates",
        title: "资质说明",
        certificates: [{ imageUrl: image, name: "测试证书", desc: "仅用于发布门禁测试", verificationConfirmed: true }],
        __contentTemplate: { key: "certificates", version: 2 },
      },
    },
    {
      type: "真实评价与实拍",
      props: {
        id: "custom-testimonials",
        title: "顾客分享",
        testimonials: [{
          name: "测试顾客",
          meta: "授权门禁测试",
          content: "这是一条不涉及真实顾客的测试引语。",
          image,
          authorizationConfirmed: true,
        }],
        __contentTemplate: { key: "testimonials", version: 2 },
      },
    },
  ],
  root: { props: {} },
  zones: {},
};
const incompleteCollectionResult = await service.validatePageDocument("custom", incompleteCollectionData, validMetadata("定制测试页"));
assert.equal(incompleteCollectionResult.valid, false, "集合数量不足时必须由服务端发布门禁阻止");
assert.deepEqual(
  incompleteCollectionResult.issues
    .filter((issue) => ["steps", "certificates"].includes(issue.field))
    .map((issue) => issue.field)
    .sort(),
  ["certificates", "steps"],
  "集合数量错误必须精确定位到对应集合字段",
);

const completeCollectionData = clone(incompleteCollectionData);
completeCollectionData.content[1].props.steps = [1, 2, 3].map((number) => ({
  number: `0${number}`,
  name: `流程步骤 ${number}`,
  desc: "已核对的测试流程说明",
  image,
}));
completeCollectionData.content[2].props.certificates = [1, 2].map((number) => ({
  imageUrl: image,
  name: `测试证书 ${number}`,
  desc: "仅用于发布门禁测试",
  verificationConfirmed: true,
}));
const completeCollectionResult = await service.validatePageDocument("custom", completeCollectionData, validMetadata("定制测试页"));
assert.equal(completeCollectionResult.valid, true, "满足合同数量范围的集合应通过发布门禁");

for (const derivedCase of [
  { blockIndex: 1, itemField: "steps", itemIndex: 1, sourceField: "name", blockId: "custom-journey" },
  { blockIndex: 2, itemField: "certificates", itemIndex: 1, sourceField: "name", blockId: "custom-certificates" },
  { blockIndex: 3, itemField: "testimonials", itemIndex: 0, sourceField: "name", blockId: "custom-testimonials" },
]) {
  const missingDerivedAltData = clone(completeCollectionData);
  missingDerivedAltData.content[derivedCase.blockIndex].props[derivedCase.itemField][derivedCase.itemIndex][derivedCase.sourceField] = "";
  const missingDerivedAltResult = await service.validatePageDocument("custom", missingDerivedAltData, validMetadata("定制测试页"));
  assert.equal(missingDerivedAltResult.valid, false, `${derivedCase.blockId} 的图片替代文字派生来源缺失时必须阻止发布`);
  assert.ok(
    missingDerivedAltResult.issues.some((issue) =>
      issue.blockId === derivedCase.blockId
        && issue.field === derivedCase.itemField
        && issue.index === derivedCase.itemIndex
        && issue.path.endsWith(`${derivedCase.itemField}[${derivedCase.itemIndex}].${derivedCase.sourceField}`),
    ),
    `${derivedCase.blockId} 的派生替代文字问题必须定位到具体条目名称字段`,
  );
}

const unverifiedCertificateData = clone(completeCollectionData);
unverifiedCertificateData.content[2].props.certificates[1].verificationConfirmed = false;
const unverifiedCertificateResult = await service.validatePageDocument("custom", unverifiedCertificateData, validMetadata("定制测试页"));
assert.equal(unverifiedCertificateResult.valid, false, "未确认核验的证书条目不得发布");
assert.ok(
  unverifiedCertificateResult.issues.some((issue) =>
    issue.blockId === "custom-certificates"
      && issue.field === "certificates"
      && issue.index === 1
      && issue.path.endsWith("certificates[1].verificationConfirmed"),
  ),
  "证书核验错误必须定位到具体条目与确认字段",
);

const unauthorizedTestimonialData = clone(completeCollectionData);
unauthorizedTestimonialData.content[3].props.testimonials[0].authorizationConfirmed = false;
const unauthorizedTestimonialResult = await service.validatePageDocument("custom", unauthorizedTestimonialData, validMetadata("定制测试页"));
assert.equal(unauthorizedTestimonialResult.valid, false, "未确认书面授权的顾客评价不得发布");
assert.ok(
  unauthorizedTestimonialResult.issues.some((issue) =>
    issue.blockId === "custom-testimonials"
      && issue.field === "testimonials"
      && issue.index === 0
      && issue.path.endsWith("testimonials[0].authorizationConfirmed"),
  ),
  "顾客授权错误必须定位到具体条目与确认字段",
);

const placeholderClaimData = clone(completeCollectionData);
placeholderClaimData.content[2].props.title = "证书信息待确认";
const placeholderClaimResult = await service.validatePageDocument("custom", placeholderClaimData, validMetadata("定制测试页"));
assert.equal(placeholderClaimResult.valid, false, "带待确认标记的高风险默认文案不得发布");
assert.ok(
  placeholderClaimResult.issues.some((issue) => issue.blockId === "custom-certificates" && issue.field === "title"),
  "高风险占位文案必须定位到具体区块和字段",
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

const incompleteSeoResult = await service.validatePageDocument(
  "home",
  validData("SEO 待完善页面"),
  {},
);
assert.equal(incompleteSeoResult.valid, false, "正式页面缺少内容责任、SEO 标题、描述或分享图时必须阻止发布");
assert.deepEqual(
  incompleteSeoResult.issues
    .filter((issue) => issue.path.startsWith("metadata."))
    .map((issue) => ({ field: issue.field, path: issue.path })),
  [
    { field: "seoTitle", path: "metadata.seoTitle" },
    { field: "seoDescription", path: "metadata.seoDescription" },
    { field: "ogImage", path: "metadata.ogImage" },
    { field: "contentOwner", path: "metadata.contentOwner" },
    { field: "mediaRights", path: "metadata.mediaRights" },
  ],
  "正式内容发布问题必须定位到页面设置的具体字段",
);

state.document.puckData = validData("SEO 待完善页面");
state.document.metadata = {};
const revisionsBeforeSeoRejectedPublish = state.revisions.length;
await assert.rejects(
  () => service.publishPageDocument("home", 1, state.document.updatedAt.toISOString()),
  /页面发布校验失败/,
  "服务端发布必须阻止内容责任或 SEO 未完成的草稿",
);
assert.equal(
  state.revisions.length,
  revisionsBeforeSeoRejectedPublish,
  "SEO 未完成时不得写入发布 revision",
);
state.document.metadata = validMetadata("当前草稿");

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
assert.equal(publicBeforeSave.status, "INVALID");
assert.equal(publicBeforeSave.invalidReason, "publication-revalidation-required");
assert.equal("puckData" in publicBeforeSave, false, "旧发布快照未经当前门禁复核时不得继续公开 Puck 内容");
assert.equal(
  publicBeforeSave.updatedAt.toISOString(),
  oldPublishedAt.toISOString(),
);
const adminPublishedBeforeSave = await service.getPublishedPageDocumentForAdmin("home");
assert.equal(adminPublishedBeforeSave.puckData.content[0].props.title, "旧版首页");
assert.equal(adminPublishedBeforeSave.publicationAttested, false);

const firstClientRevision = state.document.updatedAt.toISOString();
const incompleteAltDraft = validData("替代文字待完善草稿");
incompleteAltDraft.content.push({
  type: "单图海报",
  props: {
    id: "draft-single-poster",
    title: "草稿海报",
    desktopImage: image,
    mobileImage: image,
    altText: "",
  },
});
incompleteAltDraft.content.push({
  type: "轮播图",
  props: {
    id: "draft-carousel",
    images: [
      { url: image, alt: "首张轮播正式替代文字" },
      { url: image, alt: "" },
    ],
  },
});
const savedIncompleteAltDraft = await service.savePageDocument(
  "home",
  incompleteAltDraft,
  {},
  "0.22.4",
  firstClientRevision,
);
assert.equal(
  savedIncompleteAltDraft.puckData.content[1].props.altText,
  "",
  "草稿保存必须保留尚待完善的替代文字状态，不能把发布门禁错误应用到编辑过程",
);
assert.equal(
  savedIncompleteAltDraft.puckData.content[2].props.images[1].alt,
  "",
  "集合媒体草稿也必须保留尚待完善的条目替代文字状态",
);
const incompleteAltDraftValidation = await service.validatePageDocument(
  "home",
  savedIncompleteAltDraft.puckData,
  savedIncompleteAltDraft.metadata,
);
assert.equal(incompleteAltDraftValidation.valid, false, "同一份草稿在发布前必须因替代文字缺失而被阻断");
assert.ok(
  incompleteAltDraftValidation.issues.some((issue) =>
    issue.blockId === "draft-carousel"
      && issue.path.endsWith("images[1].alt"),
  ),
  "集合媒体草稿的发布问题必须定位到具体条目替代文字",
);

const saved = await service.savePageDocument(
  "home",
  validData("新版首页", { key: "hero", version: 1 }),
  {
    ...validMetadata("新版首页"),
    contentTemplateContract: { version: 999, templates: [{ id: "hero", version: 999 }] },
    _contentPublication: { gateVersion: 999 },
  },
  "0.22.4",
  savedIncompleteAltDraft.updatedAt.toISOString(),
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
assert.equal(
  Object.hasOwn(saved.metadata, "_contentPublication"),
  false,
  "普通保存不得接受客户端伪造的发布验收印记",
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
assert.equal(publicAfterSave.status, "INVALID");
assert.equal("puckData" in publicAfterSave, false);
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
assert.equal(lockCount, 3, "每次发布尝试都必须先锁定页面文档");
assert.equal(publicAfterPublish.version, 18);
assert.equal(publicAfterPublish.puckData.content[0].props.title, "新版首页");
assert.deepEqual(
  publicAfterPublish.metadata,
  {
    seoTitle: "新版首页",
    seoDescription: "新版首页的公开页面说明，仅用于页面搭建器发布门禁测试。",
    ogImage: image,
  },
  "公开页面快照只返回 SEO 白名单，不泄漏内部内容责任",
);
assert.equal("publishedBy" in publicAfterPublish, false, "公开页面快照不得泄漏后台发布账号 ID");
assert.equal("id" in publicAfterPublish, false, "公开页面快照不得泄漏内部文档主键");
assert.equal(
  state.revisions.at(-1).metadata.contentOwner,
  "品牌内容组",
  "发布历史必须保留内部内容责任，供后台追踪与恢复",
);
assert.deepEqual(
  state.revisions.at(-1).metadata._contentPublication,
  {
    gateVersion: contentTemplateContract.publicationGateVersion,
    contractSchemaVersion: contentTemplateContract.contractSchemaVersion,
    registryVersion: contentTemplateContract.registryVersion,
  },
  "发布成功必须由服务端写入当前正式内容门禁验收印记",
);
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
