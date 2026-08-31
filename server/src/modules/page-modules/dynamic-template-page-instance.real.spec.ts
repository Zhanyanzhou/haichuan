import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
} from "./dynamic-template-instance";
import { definitionFixture } from "./dynamic-template-test-fixture";
import { DynamicTemplatesService } from "./dynamic-templates.service";
import { PageModulesService } from "./page-modules.service";

const runRealDatabase = process.env.DYNAMIC_TEMPLATE_REAL_DB_TEST === "1";
test("真实 MySQL：正式模板精确版本形成页面实例并在归档后保持可解析", {
  skip: runRealDatabase ? false : "需要显式设置 DYNAMIC_TEMPLATE_REAL_DB_TEST=1",
}, async () => {
  const prisma = new PrismaService();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateId = `tpl_stage4_${suffix}`;
  let databaseId: number | null = null;
  await prisma.$connect();
  try {
    const owner = await prisma.user.findFirst({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE" },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    assert.ok(owner, "本地数据库必须至少有一个启用的管理员用于外键验证");

    const definitionV1 = definitionFixture();
    definitionV1.templateId = templateId;
    definitionV1.name = `阶段四页面实例 ${suffix}`;
    definitionV1.metadata.recommendedFor = ["products"];
    definitionV1.defaultContent.slot_heading = "正式版本一";

    const pages = new PageModulesService(prisma);
    const templates = new DynamicTemplatesService(prisma);
    const created = await templates.create(owner.id, {
      definition: definitionV1,
      versionNote: "Stage 4 real DB v1",
    });
    databaseId = created.id;
    const publishedV1 = await templates.publish(owner.id, templateId, {
      expectedRevision: created.draft!.revision,
      versionNote: "Stage 4 real DB v1",
    });
    assert.equal(publishedV1.version, 1);

    const pageData = {
      content: [{
        type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
        props: {
          id: `block_${suffix}`,
          instanceSchemaVersion: 1,
          instanceId: `instance_${suffix}`,
          templateId,
          templateVersion: 1,
          moduleName: definitionV1.name,
          contentBySlotId: { slot_heading: "页面实例填写内容" },
          overrides: {},
          hiddenSlotIds: [],
          isVisible: true,
        },
      }],
      root: { props: {} },
      zones: {},
    };
    const ogImage = "https://example.com/stage4-template-og.jpg";
    const validationV1 = await pages.validatePageDocument("products", pageData, {
      seoTitle: "动态模板页面实例",
      seoDescription: "验证正式模板精确版本、实例内容与归档兼容。",
      ogImage,
      contentOwner: "自动化测试",
      mediaRights: [{
        assetUrl: ogImage,
        source: "自动化测试固定素材",
        authorizationId: "STAGE4-REAL-DB",
      }],
    });
    assert.equal(validationV1.valid, true, JSON.stringify(validationV1.issues));

    const definitionV2 = structuredClone(definitionV1);
    definitionV2.defaultContent.slot_heading = "正式版本二";
    definitionV2.description = "第二个不可变正式版本";
    const updated = await templates.updateDraft(owner.id, templateId, {
      expectedRevision: publishedV1.draft!.revision,
      definition: definitionV2,
      versionNote: "Stage 4 real DB v2",
    });
    const publishedV2 = await templates.publish(owner.id, templateId, {
      expectedRevision: updated!.draft!.revision,
      versionNote: "Stage 4 real DB v2",
    });
    assert.equal(publishedV2.version, 2);

    const hydrate = (pages as unknown as {
      hydrateDynamicTemplateDefinitions(value: unknown): Promise<Record<string, unknown>>;
    }).hydrateDynamicTemplateDefinitions.bind(pages);
    const hydrated = await hydrate(pageData);
    const resolved = hydrated[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY] as Record<string, {
      version: number;
      definition: { defaultContent: Record<string, unknown> };
    }>;
    const lockedV1 = resolved[dynamicTemplateVersionKey(templateId, 1)];
    assert.equal(lockedV1.version, 1);
    assert.equal(lockedV1.definition.defaultContent.slot_heading, "正式版本一");
    assert.equal(dynamicTemplateVersionKey(templateId, 2) in resolved, false);

    await templates.archive(owner.id, templateId);
    const archivedValidation = await pages.validatePageDocument("products", pageData, {
      seoTitle: "动态模板页面实例",
      seoDescription: "验证归档不会破坏已经锁定旧版本的页面。",
      ogImage,
      contentOwner: "自动化测试",
      mediaRights: [{
        assetUrl: ogImage,
        source: "自动化测试固定素材",
        authorizationId: "STAGE4-REAL-DB",
      }],
    });
    assert.equal(archivedValidation.valid, true, JSON.stringify(archivedValidation.issues));
    assert.equal((await templates.listPublished()).some((item) => item.templateId === templateId), false);
  } finally {
    if (databaseId !== null) {
      await prisma.$transaction([
        prisma.dynamicTemplateVersion.deleteMany({ where: { dynamicTemplateId: databaseId } }),
        prisma.dynamicTemplateDraft.deleteMany({ where: { dynamicTemplateId: databaseId } }),
        prisma.dynamicTemplate.deleteMany({ where: { id: databaseId } }),
      ]);
    }
    await prisma.$disconnect();
  }
});
