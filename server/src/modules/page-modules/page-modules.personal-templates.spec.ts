import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";
import {
  extractContentTemplateDefaultContent,
  getContentTemplateIssues,
  sanitizeContentTemplateDefaultContent,
  sanitizeContentTemplateLayoutData,
} from "./generated/contentTemplates.generated";

function createService(overrides: {
  personalContentTemplate?: Record<string, unknown>;
  product?: Record<string, unknown>;
  category?: Record<string, unknown>;
} = {}) {
  const calls: Array<{ operation: string; args: any }> = [];
  const personalContentTemplate = {
    findMany: async (args: any) => {
      calls.push({ operation: "findMany", args });
      return [];
    },
    create: async (args: any) => {
      calls.push({ operation: "create", args });
      return { id: 1, ...args.data };
    },
    findFirst: async (args: any) => {
      calls.push({ operation: "findFirst", args });
      return null;
    },
    update: async (args: any) => {
      calls.push({ operation: "update", args });
      return { id: args.where.id, ...args.data };
    },
    deleteMany: async (args: any) => {
      calls.push({ operation: "deleteMany", args });
      return { count: 0 };
    },
    ...overrides.personalContentTemplate,
  };
  const product = {
    findMany: async (args: any) => {
      calls.push({ operation: "product.findMany", args });
      const rows: Array<{ id: number; code: string }> = [];
      for (const clause of args.where.OR ?? []) {
        for (const code of clause.code?.in ?? []) rows.push({ id: rows.length + 1, code });
        for (const id of clause.id?.in ?? []) rows.push({ id, code: `ID-${id}` });
      }
      return rows;
    },
    ...overrides.product,
  };
  const category = {
    findMany: async (args: any) => {
      calls.push({ operation: "category.findMany", args });
      return (args.where.slug?.in ?? []).map((slug: string) => ({ slug }));
    },
    ...overrides.category,
  };
  const prisma = { personalContentTemplate, product, category } as unknown as PrismaService;
  return { service: new PageModulesService(prisma), calls };
}

test("个人模板只保存当前账号与合同白名单布局", async () => {
  const { service, calls } = createService();
  await service.createPersonalContentTemplate(17, {
    name: "  首屏构图 A  ",
    moduleType: "首屏主视觉",
    layoutData: {
      version: 2,
      imageUrl: "https://example.invalid/private.jpg",
      title: "不得保存的文案",
      frame: {
        aspectRatioByViewport: { desktop: 1.8, mobile: 0.8 },
        customColors: { background: "#FF0000" },
      },
      nodes: {
        desktopImage: {
          rectByViewport: {
            desktop: { x: -5, y: 0, width: 2, height: 0.6 },
          },
          mediaView: {
            fit: "cover",
            zoom: 1.2,
            focusByViewport: { desktop: { x: 40, y: 55 } },
          },
          imageUrl: "https://example.invalid/private.jpg",
        },
        title: {
          rectByViewport: {
            desktop: { x: 0, y: 0, width: 0.4, height: 0.2 },
          },
          typography: { sizeLevel: "lg", align: "center" },
          text: "不得保存的文案",
        },
        attackerDefinedNode: { enabled: true, text: "reject" },
      },
    },
  });

  const createCall = calls.find((call) => call.operation === "create");
  assert.ok(createCall);
  assert.equal(createCall.args.data.ownerId, 17);
  assert.equal(createCall.args.data.name, "首屏构图 A");
  assert.equal(createCall.args.data.contractKey, "hero");
  const serialized = JSON.stringify(createCall.args.data.layoutData);
  assert.doesNotMatch(serialized, /private\.jpg|不得保存的文案|attackerDefinedNode|customColors/);
  assert.deepEqual(
    createCall.args.data.layoutData.nodes.desktopImage.rectByViewport.desktop,
    { x: 0, y: 0, width: 1, height: 0.6 },
  );
  assert.deepEqual(
    createCall.args.data.layoutData.frame.aspectRatioByViewport,
    { desktop: 1.8, mobile: 0.8 },
  );
});

test("个人模板列表与变更始终绑定当前账号", async () => {
  const { service, calls } = createService();
  await service.getPersonalContentTemplates(23);
  assert.deepEqual(calls[0].args.where, { ownerId: 23 });

  await assert.rejects(
    () => service.updatePersonalContentTemplate(23, 99, { name: "不可越权" }),
    NotFoundException,
  );
  assert.deepEqual(calls[1].args.where, { id: 99, ownerId: 23 });

  await assert.rejects(
    () => service.deletePersonalContentTemplate(23, 99),
    NotFoundException,
  );
  assert.deepEqual(calls[2].args.where, { id: 99, ownerId: 23 });
});

test("个人模板拒绝缺失登录身份与非合同模块", async () => {
  const { service } = createService();
  await assert.rejects(
    () => service.getPersonalContentTemplates(undefined),
    BadRequestException,
  );
  await assert.rejects(
    () => service.createPersonalContentTemplate(1, {
      name: "非法模块",
      moduleType: "网站全局设置",
      layoutData: { version: 2 },
    }),
    BadRequestException,
  );
});

test("个人模板可显式保存合同默认内容，但只保留稳定引用与展示配置", async () => {
  const { service, calls } = createService();
  await service.createPersonalContentTemplate(17, {
    name: "单品默认内容",
    moduleType: "单品焦点推荐",
    layoutData: { version: 2 },
    contentDefaults: {
      productCode: " HC-001 ",
      title: "光影系列",
      summary: "默认系列说明",
      showPrice: true,
      price: 999999,
      inventory: 8,
      customerName: "不得保存",
    },
  });

  const productCall = calls.find((call) => call.operation === "product.findMany");
  assert.deepEqual(productCall?.args.where.OR, [{ code: { in: ["HC-001"] } }]);
  const createCall = calls.find((call) => call.operation === "create");
  assert.deepEqual(createCall?.args.data.contentDefaults, {
    productCode: "HC-001",
    title: "光影系列",
    summary: "默认系列说明",
    showPrice: true,
  });
  assert.doesNotMatch(
    JSON.stringify(createCall?.args.data.contentDefaults),
    /999999|inventory|customerName|不得保存/,
  );
});

test("默认内容剥离门店、客户评价、活动权益等业务事实", async () => {
  const { service, calls } = createService();
  await service.createPersonalContentTemplate(19, {
    name: "门店构图",
    moduleType: "门店信息",
    layoutData: { version: 2 },
    contentDefaults: {
      image: "/images/store-placeholder.jpg",
      storeName: "某门店",
      address: "不得保存的地址",
      hours: "09:00-18:00",
      phone: "13800000000",
      mapUrl: "https://maps.example.com/store",
    },
  });

  const createCall = calls.find((call) => call.operation === "create");
  assert.deepEqual(createCall?.args.data.contentDefaults, {
    image: "/images/store-placeholder.jpg",
  });
});

test("个人模板拒绝不存在的商品引用，并允许显式清空默认内容", async () => {
  const invalid = createService({ product: { findMany: async () => [] } });
  await assert.rejects(
    () => invalid.service.createPersonalContentTemplate(17, {
      name: "失效商品",
      moduleType: "单品焦点推荐",
      layoutData: { version: 2 },
      contentDefaults: { productCode: "MISSING", title: "失效" },
    }),
    BadRequestException,
  );

  const clear = createService({
    personalContentTemplate: {
      findFirst: async () => ({ id: 6, ownerId: 17, moduleType: "首屏主视觉" }),
    },
  });
  await clear.service.updatePersonalContentTemplate(17, 6, { contentDefaults: null });
  const updateCall = clear.calls.find((call) => call.operation === "update");
  assert.equal(updateCall?.args.data.contentDefaults, Prisma.DbNull);
});

test("分类默认内容只保存当前有效 slug，不复制旧卡片快照", async () => {
  const { service, calls } = createService();
  await service.createPersonalContentTemplate(21, {
    name: "分类入口",
    moduleType: "分类卡片",
    layoutData: { version: 2 },
    contentDefaults: {
      categorySlugs: [" rings ", "necklaces"],
      categories: [
        { slug: "rings", name: "不得复制的分类名", image: "/images/rings.jpg" },
      ],
      title: "按品类探索",
    },
  });

  const categoryCall = calls.find((call) => call.operation === "category.findMany");
  assert.deepEqual(categoryCall?.args.where, {
    slug: { in: ["rings", "necklaces"] },
    deletedAt: null,
    isActive: true,
  });
  const createCall = calls.find((call) => call.operation === "create");
  assert.deepEqual(createCall?.args.data.contentDefaults, {
    categorySlugs: ["rings", "necklaces"],
    title: "按品类探索",
  });
});

test("默认内容拒绝不存在的本地上传素材", async () => {
  const { service } = createService();
  await assert.rejects(
    () => service.createPersonalContentTemplate(17, {
      name: "失效素材",
      moduleType: "首屏主视觉",
      layoutData: { version: 2 },
      contentDefaults: {
        desktopImage: "/uploads/not-existing-personal-template-image.jpg",
        title: "不会落库",
      },
    }),
    BadRequestException,
  );
});

test("旧模板采用新版默认构图，合法覆盖保留且新版非法几何阻断并安全回退", () => {
  const legacyOverrides = {
    version: 2,
    nodes: {
      title: {
        rectByViewport: {
          desktop: { x: -1, y: 0.5, width: 2, height: 0.1 },
          mobile: { x: 0.2, y: 0.62, width: 0.6, height: 0.12 },
        },
      },
    },
  };
  const issues = getContentTemplateIssues({
    moduleType: "首屏主视觉",
    props: {
      id: "legacy-hero",
      __contentTemplate: { key: "hero", version: 2 },
      __instanceOverrides: legacyOverrides,
    },
  });
  assert.ok(issues.some((issue) => issue.code === "content-template-legacy"));
  assert.ok(issues.some((issue) =>
    issue.severity === "error" && issue.path.includes("rectByViewport.desktop")
  ));

  const sanitized = sanitizeContentTemplateLayoutData("首屏主视觉", legacyOverrides);
  assert.deepEqual(
    sanitized?.nodes?.title?.rectByViewport?.mobile,
    { x: 0.2, y: 0.62, width: 0.6, height: 0.12 },
  );
  assert.deepEqual(
    sanitized?.nodes?.title?.rectByViewport?.desktop,
    { x: 0.035, y: 0.5, width: 0.92, height: 0.1 },
  );
});

test("账号私有模板只保留合同允许的模块表面与对象外观预设", () => {
  const sanitized = sanitizeContentTemplateLayoutData("单品焦点推荐", {
    version: 2,
    frame: {
      colorPreset: "mist",
      paddingPreset: "spacious",
      radiusPreset: "rounded",
      shadowPreset: "lifted",
      arbitraryCss: "display:none",
    },
    nodes: {
      product: {
        appearance: {
          radiusPreset: "soft",
          shadowPreset: "lifted",
          arbitraryCss: "position:fixed",
        },
      },
    },
  });

  assert.deepEqual(sanitized?.frame, {
    colorPreset: "mist",
    paddingPreset: "spacious",
    radiusPreset: "rounded",
    shadowPreset: "lifted",
  });
  assert.deepEqual(sanitized?.nodes?.product?.appearance, {
    radiusPreset: "soft",
    shadowPreset: "lifted",
  });
});

test("默认槽位内容只提取合同声明字段并遵守文本、数量和 URL 边界", () => {
  const defaults = extractContentTemplateDefaultContent("首屏主视觉", {
    id: "not-content",
    desktopImage: "/uploads/hero.jpg",
    mobileImage: "https://cdn.example.com/hero-mobile.jpg",
    altText: "珠宝主视觉",
    eyebrow: "COLLECTION",
    title: "光影系列",
    subtitle: "克制留白中的珠宝光泽",
    actionText: "查看系列",
    targetType: "page",
    productId: 0,
    linkUrl: "/catalog",
    __instanceOverrides: { version: 2 },
  });

  assert.deepEqual(defaults, {
    desktopImage: "/uploads/hero.jpg",
    altText: "珠宝主视觉",
    mobileImage: "https://cdn.example.com/hero-mobile.jpg",
    eyebrow: "COLLECTION",
    title: "光影系列",
    subtitle: "克制留白中的珠宝光泽",
    actionText: "查看系列",
    targetType: "page",
    productId: 0,
    linkUrl: "/catalog",
  });

  assert.deepEqual(sanitizeContentTemplateDefaultContent("首屏主视觉", {
    title: "超".repeat(25),
    desktopImage: "data:text/html,<script>alert(1)</script>",
    linkUrl: "javascript:alert(1)",
    actionText: "安全文案",
    unknownField: "不得保存",
  }), { actionText: "安全文案" });

  assert.deepEqual(sanitizeContentTemplateDefaultContent("产品展示行", {
    productCodes: Array.from({ length: 9 }, (_, index) => `HC-${index + 1}`),
    title: "商品系列",
  }), { title: "商品系列" });
});

test("结构化默认内容拒绝危险嵌套 URL、原型键和超出合同数量的集合", () => {
  const unsafeItem = JSON.parse('{"title":"危险项","linkUrl":"javascript:alert(1)","__proto__":{"polluted":true}}');
  assert.deepEqual(sanitizeContentTemplateDefaultContent("作品画廊", {
    title: "作品画廊",
    items: [unsafeItem],
  }), { title: "作品画廊" });

  assert.deepEqual(sanitizeContentTemplateDefaultContent("作品画廊", {
    items: Array.from({ length: 8 }, (_, index) => ({
      image: `/uploads/work-${index + 1}.jpg`,
      title: `作品 ${index + 1}`,
    })),
  }), {});
});
