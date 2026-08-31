import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { PageModulesController } from "./page-modules.controller";
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
      return { id: 1, revision: 1, ...args.data };
    },
    findFirst: async (args: any) => {
      calls.push({ operation: "findFirst", args });
      return null;
    },
    updateMany: async (args: any) => {
      calls.push({ operation: "updateMany", args });
      return { count: 1 };
    },
    findUnique: async (args: any) => {
      calls.push({ operation: "findUnique", args });
      return { id: args.where.id, ownerId: 17, moduleType: "首屏主视觉", revision: 2 };
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

test("旧个人模板只保留按账号读取，控制器与服务不再暴露写入口", () => {
  const controllerRoles = Reflect.getMetadata(ROLES_KEY, PageModulesController) as string[];
  assert.deepEqual(controllerRoles, ["SUPER_ADMIN", "ADMIN", "EDITOR"]);

  const prototype = PageModulesController.prototype;
  assert.equal(
    Reflect.getMetadata(ROLES_KEY, prototype.getPersonalContentTemplates),
    undefined,
  );
  assert.equal((prototype as any).createPersonalContentTemplate, undefined);
  assert.equal((prototype as any).updatePersonalContentTemplate, undefined);
  assert.equal((prototype as any).deletePersonalContentTemplate, undefined);
  assert.equal((PageModulesService.prototype as any).createPersonalContentTemplate, undefined);
  assert.equal((PageModulesService.prototype as any).updatePersonalContentTemplate, undefined);
  assert.equal((PageModulesService.prototype as any).deletePersonalContentTemplate, undefined);
});

test("个人模板只读列表始终绑定当前账号", async () => {
  const { service, calls } = createService();
  await service.getPersonalContentTemplates(23);
  assert.deepEqual(calls[0].args.where, { ownerId: 23 });
});

test("个人模板 revision 列尚未迁移时旧读取适配器返回只读基线 revision", async () => {
  let attempts = 0;
  const legacyRow = {
    id: 31,
    ownerId: 23,
    name: "历史布局",
    moduleType: "首屏主视觉",
    contractKey: "hero",
    contractVersion: 1,
    layoutData: { version: 2 },
    contentDefaults: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  const { service, calls } = createService({
    personalContentTemplate: {
      findMany: async (args: any) => {
        calls.push({ operation: "findMany", args });
        attempts += 1;
        if (attempts === 1) {
          throw new Prisma.PrismaClientKnownRequestError(
            "The column `personal_content_templates.revision` does not exist",
            {
              code: "P2022",
              clientVersion: "test",
              meta: { column: "personal_content_templates.revision" },
            },
          );
        }
        return [legacyRow];
      },
    },
  });

  const rows = await service.getPersonalContentTemplates(23);

  assert.equal(attempts, 2);
  assert.equal(calls[1]?.args.select.revision, undefined);
  assert.deepEqual(rows, [{ ...legacyRow, revision: 1 }]);
});

test("个人模板回退不吞掉其他列的 P2022", async () => {
  const unrelatedError = new Prisma.PrismaClientKnownRequestError(
    "The column `personal_content_templates.layout_data` does not exist",
    {
      code: "P2022",
      clientVersion: "test",
      meta: { column: "personal_content_templates.layout_data" },
    },
  );
  const { service } = createService({
    personalContentTemplate: {
      findMany: async () => { throw unrelatedError; },
    },
  });

  await assert.rejects(
    () => service.getPersonalContentTemplates(23),
    (error) => error === unrelatedError,
  );
});

test("个人模板读取拒绝缺失登录身份，且不会触发任何旧写操作", async () => {
  const { service, calls } = createService();
  await assert.rejects(
    () => service.getPersonalContentTemplates(undefined),
    BadRequestException,
  );
  assert.equal(
    calls.some((call) => ["create", "findFirst", "updateMany", "findUnique", "deleteMany"].includes(call.operation)),
    false,
  );
});

test("旧模板采用新版默认构图，合法双端覆盖保留且越界几何收敛到画框", () => {
  const legacyOverrides = {
    version: 2,
    nodes: {
      mobileImage: {
        rectByViewport: {
          mobile: { x: -0.2, y: 0.7, width: 1.4, height: 0.5 },
        },
        mediaView: {
          focusByViewport: { mobile: { x: 61, y: 48 } },
        },
      },
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
    { x: 0, y: 0.5, width: 0.92, height: 0.1 },
  );
  assert.deepEqual(
    sanitized?.nodes?.mobileImage?.rectByViewport?.mobile,
    { x: 0, y: 0.5, width: 1, height: 0.5 },
  );
  assert.deepEqual(
    sanitized?.nodes?.mobileImage?.mediaView?.focusByViewport?.mobile,
    { x: 61, y: 48 },
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
