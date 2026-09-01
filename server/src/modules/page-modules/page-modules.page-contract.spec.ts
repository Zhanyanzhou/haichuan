import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
  createContentTemplatePublicationAttestation,
  getContentTemplateLinkTargetReferences,
  getPageDocumentMediaReferences,
  normalizeContentTemplatePageTarget,
} from "./content-template-contract";
import { PageModulesService } from "./page-modules.service";

function createService() {
  return new PageModulesService({} as PrismaService);
}

function makeHomeDocument() {
  return {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "page-contract-hero",
          title: "珠宝作品",
          desktopImage: "/images/hero-desktop.jpg",
          mobileImage: "/images/hero-mobile.jpg",
          altText: "模特佩戴珠宝作品",
           actionText: "",
           targetType: "none",
           productId: 0,
           linkUrl: "",
        },
      },
    ],
    root: { props: {} },
  };
}

function makeFormalMetadata() {
  return {
    seoTitle: "珠宝作品 | 海川珠宝",
    seoDescription: "浏览海川珠宝已经完成公开审核的作品内容。",
    ogImage: "/images/hero-desktop.jpg",
    contentOwner: "品牌内容组",
    mediaRights: [
      {
        assetUrl: "/images/hero-desktop.jpg",
        source: "品牌自有拍摄",
        authorizationId: "HC-OWN-2026-001",
      },
      {
        assetUrl: "/images/hero-mobile.jpg",
        source: "品牌自有拍摄",
        authorizationId: "HC-OWN-2026-002",
      },
    ],
  };
}

test("未注册页面键不能通过预检或写入草稿", async () => {
  const service = createService();
  const validation = await service.validatePageDocument(
    "unknown-page",
    makeHomeDocument(),
    {},
  );

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((message) => message.includes("未在页面合同注册")));
  await assert.rejects(
    () => service.savePageDocument("unknown-page", makeHomeDocument(), {}),
    BadRequestException,
  );
});

test("页面发布资料可留空并提示，但非法 metadata 结构仍阻断", async () => {
  const service = createService();
  const incompleteMetadata = {
    ...makeFormalMetadata(),
    seoTitle: "",
    seoDescription: "",
    ogImage: "",
    contentOwner: "",
  };
  const incompleteValidation = await service.validatePageDocument(
    "home",
    makeHomeDocument(),
    incompleteMetadata,
  );
  assert.equal(incompleteValidation.valid, true, incompleteValidation.errors.join("\n"));
  assert.deepEqual(
    incompleteValidation.issues
      .filter((issue) => issue.path.startsWith("metadata."))
      .map((issue) => ({ field: issue.field, path: issue.path, severity: issue.severity })),
    [
      { field: "seoTitle", path: "metadata.seoTitle", severity: "warning" },
      { field: "seoDescription", path: "metadata.seoDescription", severity: "warning" },
      { field: "ogImage", path: "metadata.ogImage", severity: "warning" },
      { field: "contentOwner", path: "metadata.contentOwner", severity: "warning" },
    ],
  );

  const completeValidation = await service.validatePageDocument(
    "home",
    makeHomeDocument(),
    makeFormalMetadata(),
  );
  assert.equal(completeValidation.valid, true);

  const invalidValidation = await service.validatePageDocument(
    "home",
    makeHomeDocument(),
    {
      ...makeFormalMetadata(),
      seoTitle: 123,
      seoDescription: { text: "错误结构" },
      ogImage: false,
      contentOwner: ["错误结构"],
    },
  );
  assert.equal(invalidValidation.valid, false);
  assert.ok(invalidValidation.errors.some((message) => message.includes("seoTitle 必须是字符串")));
  assert.ok(invalidValidation.errors.some((message) => message.includes("seoDescription 必须是字符串")));
  assert.ok(invalidValidation.errors.some((message) => message.includes("ogImage 必须是字符串")));
  assert.ok(invalidValidation.errors.some((message) => message.includes("contentOwner 必须是字符串")));
});

test("首屏必填图片与替代文字缺失时保持发布阻断", async () => {
  const service = createService();
  const missingImageDocument = makeHomeDocument();
  missingImageDocument.content[0].props.mobileImage = "";

  const missingImage = await service.validatePageDocument(
    "home",
    missingImageDocument,
    makeFormalMetadata(),
  );
  assert.equal(missingImage.valid, false);
  assert.ok(missingImage.issues.some(
    (issue) => issue.path === "content[0].props.mobileImage"
      && issue.severity === "error"
      && issue.message.includes("图片不能为空"),
  ));

  const missingAltDocument = makeHomeDocument();
  missingAltDocument.content[0].props.altText = "";
  const missingAlt = await service.validatePageDocument(
    "home",
    missingAltDocument,
    makeFormalMetadata(),
  );
  assert.equal(missingAlt.valid, false);
  assert.ok(missingAlt.issues.some(
    (issue) => issue.path === "content[0].props.altText"
      && issue.severity === "error"
      && issue.message.includes("内容不能为空"),
  ));
});

test("同一模板可按需重复添加且不会因页面模块数量阻断发布预检", async () => {
  const document = makeHomeDocument();
  document.content = Array.from({ length: 61 }, (_, index) => ({
    ...document.content[0],
    props: {
      ...document.content[0].props,
      id: `page-contract-hero-${index + 1}`,
    },
  }));

  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalMetadata(),
  );

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(
    result.errors.some((message) => message.includes("页面可见模块过多")),
    false,
  );
});

test("发布预检把正在完善、内容建设中和即将上线等占位文案降为提示", async () => {
  const service = createService();
  const document = makeHomeDocument();
  document.content[0].props.title = "品牌内容建设中";
  const metadata = {
    ...makeFormalMetadata(),
    seoDescription: "作品资料正在完善，请稍后再来。",
  };

  const result = await service.validatePageDocument("home", document, metadata);

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(result.issues.some(
    (issue) => issue.path === "content[0].props.title"
      && issue.message.includes("占位内容")
      && issue.severity === "warning",
  ));
  assert.ok(result.issues.some(
    (issue) => issue.path === "metadata.seoDescription"
      && issue.message.includes("占位内容")
      && issue.severity === "warning",
  ));

  document.content[0].props.title = "珠宝作品";
  metadata.seoDescription = "品牌故事即将上线";
  const launchResult = await service.validatePageDocument("home", document, metadata);
  assert.equal(launchResult.valid, true, launchResult.errors.join("\n"));
  assert.ok(launchResult.issues.some(
    (issue) => issue.path === "metadata.seoDescription"
      && issue.message.includes("占位内容")
      && issue.severity === "warning",
  ));
});

test("公开 PageDocument metadata 只返回 SEO 白名单，不泄漏内部内容责任", async () => {
  const metadata = {
    ...makeFormalMetadata(),
    internalReviewNote: "仅后台可见",
  };
  const service = new PageModulesService({
    pageDocument: {
      findUnique: async () => ({
        id: 7,
        pageKey: "home",
        status: "DRAFT",
        publishedRevisionId: 31,
      }),
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 31,
        documentId: 7,
        puckData: makeHomeDocument(),
        metadata: {
          ...metadata,
          [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]:
            createContentTemplatePublicationAttestation(),
        },
        publishedAt: new Date("2026-08-26T00:00:00.000Z"),
        createdAt: new Date("2026-08-26T00:00:00.000Z"),
        publishedBy: 1,
        version: 3,
      }),
    },
  } as unknown as PrismaService);

  const published = await service.getPublishedPageDocument("home");
  assert.deepEqual(published?.metadata, {
    seoTitle: metadata.seoTitle,
    seoDescription: metadata.seoDescription,
    ogImage: metadata.ogImage,
  });
  assert.equal("contentOwner" in (published?.metadata ?? {}), false);
  assert.equal("mediaRights" in (published?.metadata ?? {}), false);
  assert.equal("internalReviewNote" in (published?.metadata ?? {}), false);
  assert.deepEqual(Object.keys(published ?? {}).sort(), [
    "metadata",
    "pageKey",
    "publishedAt",
    "puckData",
    "status",
    "updatedAt",
    "version",
  ]);
  assert.equal("publishedBy" in (published ?? {}), false);
  assert.equal("id" in (published ?? {}), false);

  const publishedForAdmin = await service.getPublishedPageDocumentForAdmin("home");
  assert.deepEqual(publishedForAdmin?.metadata, metadata);
  assert.equal(publishedForAdmin?.publicationAttested, true);
});

test("旧发布快照缺少当前验收印记时公共接口只返回安全失效状态", async () => {
  const service = new PageModulesService({
    pageDocument: {
      findUnique: async () => ({
        id: 8,
        pageKey: "home",
        status: "PUBLISHED",
        publishedRevisionId: 38,
      }),
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 38,
        documentId: 8,
        puckData: makeHomeDocument(),
        metadata: makeFormalMetadata(),
        publishedAt: new Date("2026-08-25T00:00:00.000Z"),
        createdAt: new Date("2026-08-25T00:00:00.000Z"),
        publishedBy: 1,
        version: 38,
      }),
    },
  } as unknown as PrismaService);

  const published = await service.getPublishedPageDocument("home");
  assert.deepEqual(published, {
    pageKey: "home",
    status: "INVALID",
    invalidReason: "publication-revalidation-required",
    publishedAt: new Date("2026-08-25T00:00:00.000Z"),
    updatedAt: new Date("2026-08-25T00:00:00.000Z"),
    version: 38,
  });
  assert.equal("puckData" in (published ?? {}), false);

  const admin = await service.getPublishedPageDocumentForAdmin("home");
  assert.deepEqual(admin?.metadata, makeFormalMetadata());
  assert.equal(admin?.publicationAttested, false);
});

test("页面分享图仍拒绝非 HTTP(S) 或站内绝对路径", async () => {
  const result = await createService().validatePageDocument(
    "home",
    makeHomeDocument(),
    { ...makeFormalMetadata(), ogImage: "javascript:alert(1)" },
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("ogImage 分享图地址不合法")));
});

test("当前可见素材缺少来源与授权编号时提示但不阻断发布", async () => {
  const metadata = makeFormalMetadata();
  metadata.mediaRights = metadata.mediaRights.filter(
    (item) => item.assetUrl !== "/images/hero-mobile.jpg",
  );
  const result = await createService().validatePageDocument(
    "home",
    makeHomeDocument(),
    metadata,
  );

  assert.equal(result.valid, true, result.errors.join("\n"));
  const issue = result.issues.find(
    (item) => item.field === "mediaRights" && item.message.includes("hero-mobile.jpg"),
  );
  assert.equal(issue?.path, "metadata.mediaRights");
  assert.equal(issue?.severity, "warning");
  assert.match(issue?.message || "", /缺少来源或授权编号/);
});

test("重复或不完整的素材授权记录提示但不阻断发布", async () => {
  const metadata = makeFormalMetadata();
  metadata.mediaRights.push({
    assetUrl: "/images/hero-desktop.jpg",
    source: "重复来源",
    authorizationId: "HC-DUP-001",
  });
  metadata.mediaRights.push({
    assetUrl: "/images/unused.jpg",
    source: "",
    authorizationId: "HC-EMPTY-001",
  });
  const result = await createService().validatePageDocument(
    "home",
    makeHomeDocument(),
    metadata,
  );

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(result.issues.some(
    (item) => item.path === "metadata.mediaRights[2].assetUrl"
      && item.severity === "warning"
      && item.message.includes("重复"),
  ));
  assert.ok(result.issues.some(
    (item) => item.path === "metadata.mediaRights[3].source"
      && item.severity === "warning"
      && item.message.includes("素材来源不能为空"),
  ));
});

test("隐藏区块的媒体不会扩大当前发布授权范围", async () => {
  const document: any = makeHomeDocument();
  document.content.push({
    type: "全屏出血图",
    props: {
      id: "hidden-media",
      isVisible: false,
      image: "/images/hidden-editorial.jpg",
      altText: "不公开的内部备选图",
    },
  });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalMetadata(),
  );

  assert.equal(result.valid, true);
  assert.equal(
    result.issues.some((item) => item.message.includes("hidden-editorial.jpg")),
    false,
  );
});

test("机器合同统一提取顶层、视频与集合媒体并按 URL 去重", () => {
  const references = getPageDocumentMediaReferences(
    {
      content: [
        {
          type: "视频区块",
          props: {
            id: "video-reference",
            videoUrl: "https://cdn.example.com/craft.mp4",
            posterUrl: "/images/craft-poster.jpg",
          },
        },
        {
          type: "轮播图",
          props: {
            id: "carousel-reference",
            images: [
              {
                url: "/images/craft-poster.jpg",
                mobileUrl: "/images/craft-mobile.jpg",
              },
            ],
          },
        },
      ],
      zones: {},
    },
    { ogImage: "/images/craft-poster.jpg" },
  );

  assert.deepEqual(
    references.map((item) => item.url),
    [
      "/images/craft-poster.jpg",
      "https://cdn.example.com/craft.mp4",
      "/images/craft-mobile.jpg",
    ],
  );
  assert.equal(references[0].path, "metadata.ogImage");
  assert.equal(references[1].path, "content[0].props.videoUrl");
  assert.equal(references[2].path, "content[1].props.images[0].mobileUrl");
});

test("页面分享图引用不存在的本地上传文件时阻止发布", async () => {
  const result = await createService().validatePageDocument(
    "home",
    makeHomeDocument(),
    {
      ...makeFormalMetadata(),
      ogImage: "/uploads/__r5-missing__/share-card.webp",
    },
  );

  assert.equal(result.valid, false);
  const issue = result.issues.find((item) => item.field === "ogImage");
  assert.equal(issue?.path, "metadata.ogImage");
  assert.match(issue?.message || "", /上传图片文件不存在/);
});

test("页面分享图使用外链时阻止发布并保留页面设置字段定位", async () => {
  const result = await createService().validatePageDocument(
    "home",
    makeHomeDocument(),
    {
      ...makeFormalMetadata(),
      ogImage: "https://cdn.example.com/share-card.webp",
    },
  );

  assert.equal(result.valid, false);
  const issue = result.issues.find((item) => item.field === "ogImage");
  assert.equal(issue?.severity, "error");
  assert.equal(issue?.path, "metadata.ogImage");
  assert.match(issue?.message || "", /外部素材地址/);
});

test("机器合同提取顶层、次级行动和桌面/移动集合目标", () => {
  const featured = getContentTemplateLinkTargetReferences(
    "单品焦点推荐",
    {
      id: "featured-link-contract",
      secondaryText: "预约顾问",
      secondaryTargetType: "product",
      secondaryProductCode: "HC-RING-001",
    },
    "content[0].props",
  );
  assert.equal(featured.length, 1);
  assert.equal(featured[0].actionTextFieldKey, "secondaryText");
  assert.equal(featured[0].productCodeFieldKey, "secondaryProductCode");
  assert.equal(featured[0].productCode, "HC-RING-001");

  const hotspot = getContentTemplateLinkTargetReferences(
    "热区图",
    {
      id: "hotspot-link-contract",
      hotspots: [{ targetType: "page", linkUrl: "/catalog" }],
      mobileHotspots: [{ targetType: "product", productId: 7 }],
    },
    "content[1].props",
  );
  assert.deepEqual(
    hotspot.map((item) => ({ path: item.path, field: item.field, required: item.required })),
    [
      {
        path: "content[1].props.hotspots[0]",
        field: "hotspots",
        required: true,
      },
      {
        path: "content[1].props.mobileHotspots[0]",
        field: "mobileHotspots",
        required: true,
      },
    ],
  );
});

test("可见行动文案没有去向时提示但不阻断可用版本发布", async () => {
  const document: any = makeHomeDocument();
  document.content[0].props.actionText = "探索作品";
  document.content[0].props.targetType = "none";
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalMetadata(),
  );

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(result.issues.some(
    (issue) =>
      issue.path === "content[0].props.targetType"
      && issue.message.includes("已填写行动文案")
      && issue.severity === "warning",
  ));
});

test("页面目标只接受合同登记路由并保留查询参数", () => {
  assert.equal(normalizeContentTemplatePageTarget("/"), "/");
  assert.equal(
    normalizeContentTemplatePageTarget("/catalog?category=12&sort=newest"),
    "/catalog?category=12&sort=newest",
  );
  for (const target of [
    "/not-a-route",
    "/products/HC-RING-001",
    "/privacy",
    "/catalog/",
    "/about#story",
    "//example.com/catalog",
    "https://example.com/catalog",
  ]) {
    assert.equal(normalizeContentTemplatePageTarget(target), undefined, target);
  }
});

test("未登记页面去向被服务端发布门禁拒绝，登记页面可携带查询参数", async () => {
  const document: any = makeHomeDocument();
  document.content[0].props.actionText = "探索作品";
  document.content[0].props.targetType = "page";
  document.content[0].props.linkUrl = "/not-a-route";

  const invalid = await createService().validatePageDocument(
    "home",
    document,
    makeFormalMetadata(),
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some(
    (issue) =>
      issue.path === "content[0].props.linkUrl"
      && issue.message.includes("未在公开页面合同登记"),
  ));

  document.content[0].props.linkUrl = "/catalog?category=12";
  const valid = await createService().validatePageDocument(
    "home",
    document,
    makeFormalMetadata(),
  );
  assert.equal(valid.valid, true, valid.errors.join("\n"));
});

test("按场景选购条目缺少公开去向时提示但不阻断", async () => {
  const document: any = makeHomeDocument();
  document.content.push({
    type: "按场景选购",
    props: {
      id: "scene-shopping-links",
      categories: [
        {
          name: "日常佩戴",
          image: "/images/scene-daily.jpg",
          altText: "日常佩戴珠宝",
          targetType: "none",
        },
        {
          name: "重要时刻",
          image: "/images/scene-event.jpg",
          altText: "重要时刻珠宝",
          targetType: "page",
          linkUrl: "/catalog",
        },
      ],
    },
  });
  const metadata = makeFormalMetadata();
  metadata.mediaRights.push(
    {
      assetUrl: "/images/scene-daily.jpg",
      source: "品牌自有拍摄",
      authorizationId: "HC-OWN-2026-003",
    },
    {
      assetUrl: "/images/scene-event.jpg",
      source: "品牌自有拍摄",
      authorizationId: "HC-OWN-2026-004",
    },
  );

  const result = await createService().validatePageDocument("home", document, metadata);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(result.issues.some(
    (issue) =>
      issue.path === "content[1].props.categories[0].targetType"
      && issue.field === "categories"
      && issue.index === 0
      && issue.message.includes("必须设置有效去向")
      && issue.severity === "warning",
  ));

  document.content[1].props.categories[0].targetType = undefined;
  document.content[1].props.categories[0].link = "/products";
  const legacyResult = await createService().validatePageDocument(
    "home",
    document,
    metadata,
  );
  assert.equal(legacyResult.valid, true, legacyResult.errors.join("\n"));
});

test("次级 CTA 的商品目标也必须满足游客公开商品资格", async () => {
  const service = new PageModulesService({
    product: {
      findMany: async () => [{
        id: 1,
        code: "HC-PUBLIC-001",
        listingImageId: 11,
        primaryImageId: null,
        images: [],
      }],
    },
  } as unknown as PrismaService);
  const document: any = makeHomeDocument();
  document.content.push({
    type: "单品焦点推荐",
    props: {
      id: "featured-secondary-product",
      productCode: "HC-PUBLIC-001",
      primaryText: "查看作品",
      secondaryText: "查看另一件作品",
      secondaryTargetType: "product",
      secondaryProductCode: "HC-NOT-PUBLIC",
    },
  });

  const result = await service.validatePageDocument(
    "home",
    document,
    makeFormalMetadata(),
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(
    (issue) =>
      issue.path === "content[1].props.secondaryProductCode"
      && issue.message.includes("未满足公开发布条件"),
  ));
});

function makeCatalogDocument() {
  return {
    content: [
      {
        type: "全屏出血图",
        props: {
          id: "catalog-hidden-backup",
          isVisible: false,
          image: "/images/catalog-hidden.jpg",
          altText: "隐藏备选",
        },
      },
      {
        type: "全屏出血图",
        props: {
          id: "catalog-brand-stage",
          image: "/images/hero-desktop.jpg",
          altText: "选款中心",
          buttonText: "",
          targetType: "none",
        },
      },
      {
        type: "业务功能区",
        props: {
          id: "catalog-business-region",
          pageKey: "catalog",
          locked: true,
        },
      },
    ],
    zones: {},
    root: { props: {} },
  };
}

test("固定业务区按首个可见品牌模块定位，隐藏备选块不改变语义顺序", async () => {
  const result = await createService().validatePageDocument(
    "catalog",
    makeCatalogDocument(),
    makeFormalMetadata(),
  );
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("zones 中的固定业务区不能绕过页面角色数量与根内容位置规则", async () => {
  const document: any = makeCatalogDocument();
  document.zones.sidebar = [
    {
      type: "业务功能区",
      props: {
        id: "catalog-business-region-zone-copy",
        pageKey: "catalog",
        locked: true,
      },
    },
  ];
  const result = await createService().validatePageDocument(
    "catalog",
    document,
    makeFormalMetadata(),
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("当前为 2")));
  assert.ok(result.errors.some((message) => message.includes("不能放入插槽 zones")));
});

test("普通 zones 内容不能被计为可发布内容或绕过公开 Renderer 的根内容位置", async () => {
  const document: any = makeHomeDocument();
  document.zones = {
    sidebar: [
      {
        type: "文字横幅",
        props: {
          id: "unreachable-zone-banner",
          title: "预检通过但公开页不可见的内容",
          body: "当前公开 Renderer 没有对应 DropZone 消费者。",
        },
      },
    ],
  };

  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalMetadata(),
  );

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(
    (issue) =>
      issue.path === 'zones["sidebar"]'
      && issue.message.includes("只能位于页面根内容"),
  ));
  await assert.rejects(
    () => createService().savePageDocument("home", document, {}),
    (error: unknown) =>
      error instanceof BadRequestException
      && error.message.includes("只能位于根内容 content"),
  );
});
