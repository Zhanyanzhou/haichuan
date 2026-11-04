import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
} from "./dynamic-template-instance";
import { definitionFixture, mediaSideDefinitionFixture } from "./dynamic-template-test-fixture";
import { DynamicTemplatesService } from "./dynamic-templates.service";
import { PageModulesService } from "./page-modules.service";
const { validateTarget } = require("../../../scripts/run-real-mysql-tests.cjs");

const runRealDatabase = process.env.DYNAMIC_TEMPLATE_REAL_DB_TEST === "1";
test("真实 MySQL：模板版本、页面保存发布回读、草稿隔离与归档兼容", {
  skip: runRealDatabase ? false : "需要显式设置 DYNAMIC_TEMPLATE_REAL_DB_TEST=1",
}, async () => {
  const databaseUrl = validateTarget(process.env);
  assert.equal(process.env.DATABASE_URL, databaseUrl, "模板测试必须使用显式隔离库");
  const prisma = new PrismaService({ datasourceUrl: databaseUrl });
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateId = `tpl_stage4_${suffix}`;
  let databaseId: number | null = null;
  let ownerId: number | null = null;
  let documentId: number | null = null;
  let createdSiteSetting = false;
  await prisma.$connect();
  try {
    const owner = await prisma.user.create({
      data: {
        username: `template_ci_${suffix}`,
        password: "isolated-fixture-no-login",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    });
    ownerId = owner.id;
    assert.equal(await prisma.pageDocument.count({ where: { pageKey: "products" } }), 0);
    await prisma.siteSetting.create({
      data: {
        key: "site",
        value: {
          siteName: "隔离测试店铺",
          canonicalBaseUrl: "https://isolated.example.invalid",
          defaultLocale: "zh-CN",
          publishedLocales: ["zh-CN"],
        },
      },
    });
    createdSiteSetting = true;

    const definitionV1 = definitionFixture();
    definitionV1.schemaVersion = 3;
    definitionV1.templateId = templateId;
    definitionV1.name = `阶段四页面实例 ${suffix}`;
    definitionV1.metadata.recommendedFor = ["products"];
    definitionV1.metadata.headerCompatibility = ["overlay-light"];
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
    // 本例只有文字，不添加与版本解析无关的可选分享图和素材授权。
    const validationV1 = await pages.validatePageDocument("products", pageData, {
      seoTitle: "动态模板页面实例",
      seoDescription: "验证正式模板精确版本、实例内容与归档兼容。",
      contentOwner: "自动化测试",
    });
    assert.equal(validationV1.valid, true, JSON.stringify(validationV1.issues));
    const metadata = {
      seoTitle: "动态模板页面实例",
      seoDescription: "验证页面实例在真实数据库保存、发布与回读。",
      contentOwner: "自动化测试",
    };
    const saved = await pages.savePageDocument("products", pageData, metadata, "ci-real-mysql");
    assert.ok(saved);
    documentId = saved.id;
    assert.equal(await pages.getPublishedPageDocument("products"), null, "保存草稿不会发布");
    const publishedPage = await pages.publishPageDocument("products", owner.id, saved.updatedAt.toISOString());
    assert.ok(publishedPage.publishedRevisionId);
    const reopenedPages = new PageModulesService(prisma);
    const firstPublicRead = await reopenedPages.getPublishedPageDocument("products");
    assert.ok(firstPublicRead && "puckData" in firstPublicRead);
    assert.equal(firstPublicRead.status, "PUBLISHED");
    assert.equal(firstPublicRead.version, 1);
    assert.equal("contentOwner" in (firstPublicRead.metadata ?? {}), false, "公开回读不得泄漏后台元数据");
    const draftData = structuredClone(pageData);
    draftData.content[0].props.contentBySlotId.slot_heading = "尚未发布的页面草稿";
    await pages.savePageDocument("products", draftData, metadata, "ci-real-mysql", publishedPage.updatedAt.toISOString());
    const reopenedDraft = await reopenedPages.getPageDocument("products");
    assert.ok(JSON.stringify(reopenedDraft?.puckData).includes("尚未发布的页面草稿"));
    const publicAfterDraft = await reopenedPages.getPublishedPageDocument("products");
    assert.ok(publicAfterDraft && "puckData" in publicAfterDraft);
    assert.ok(JSON.stringify(publicAfterDraft.puckData).includes("页面实例填写内容"));
    assert.equal(JSON.stringify(publicAfterDraft.puckData).includes("尚未发布的页面草稿"), false);
    await assert.rejects(
      pages.publishPageDocument("products", owner.id, "2000-01-01T00:00:00.000Z"),
      /已被其他编辑者更新/,
    );
    assert.equal(await prisma.pageDocumentRevision.count({ where: { documentId: saved.id } }), 1);

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

    const publishedAfterTemplateUpdate = await reopenedPages.getPublishedPageDocument("products");
    assert.ok(publishedAfterTemplateUpdate && "puckData" in publishedAfterTemplateUpdate);
    const hydrated = publishedAfterTemplateUpdate.puckData as Record<string, unknown>;
    const resolved = hydrated[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY] as Record<string, {
      version: number;
      definition: { defaultContent: Record<string, unknown> };
    }>;
    const lockedV1 = resolved[dynamicTemplateVersionKey(templateId, 1)];
    assert.equal(lockedV1.version, 1);
    assert.equal(lockedV1.definition.defaultContent.slot_heading, "正式版本一");
    assert.equal(dynamicTemplateVersionKey(templateId, 2) in resolved, false);

    await templates.archive(owner.id, templateId, {
      expectedRevision: publishedV2.draft!.revision,
      expectedChecksum: publishedV2.draft!.definitionChecksum,
    });
    const archivedValidation = await pages.validatePageDocument("products", pageData, {
      seoTitle: "动态模板页面实例",
      seoDescription: "验证归档不会破坏已经锁定旧版本的页面。",
      contentOwner: "自动化测试",
    });
    assert.equal(archivedValidation.valid, true, JSON.stringify(archivedValidation.issues));
    assert.equal(
      (await templates.listPublished(owner.id)).some((item) => item.templateId === templateId),
      false,
    );
    const publishedAfterArchive = await reopenedPages.getPublishedPageDocument("products");
    assert.ok(publishedAfterArchive && "puckData" in publishedAfterArchive);
    assert.equal(publishedAfterArchive.status, "PUBLISHED");
    assert.deepEqual(publishedAfterArchive.puckData, publishedAfterTemplateUpdate.puckData);
  } finally {
    if (documentId !== null) await prisma.pageDocument.delete({ where: { id: documentId } });
    if (databaseId !== null) {
      await prisma.$transaction([
        prisma.dynamicTemplateVersion.deleteMany({ where: { dynamicTemplateId: databaseId } }),
        prisma.dynamicTemplateDraft.deleteMany({ where: { dynamicTemplateId: databaseId } }),
        prisma.dynamicTemplate.deleteMany({ where: { id: databaseId } }),
      ]);
    }
    if (createdSiteSetting) await prisma.siteSetting.delete({ where: { key: "site" } });
    if (ownerId !== null) {
      await prisma.operationLog.deleteMany({ where: { userId: ownerId } });
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  }
});

test("真实 MySQL：图片位置随页面保存发布回读，模板新版本缺少声明时不自动沿用", {
  skip: runRealDatabase ? false : "需要显式设置 DYNAMIC_TEMPLATE_REAL_DB_TEST=1",
}, async () => {
  const databaseUrl = validateTarget(process.env);
  assert.equal(process.env.DATABASE_URL, databaseUrl, "模板测试必须使用显式隔离库");
  const prisma = new PrismaService({ datasourceUrl: databaseUrl });
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateId = `tpl_media_side_${suffix}`;
  let databaseId: number | null = null;
  let ownerId: number | null = null;
  let documentId: number | null = null;
  let createdSiteSetting = false;
  await prisma.$connect();
  try {
    const owner = await prisma.user.create({
      data: {
        username: `template_side_${suffix}`,
        password: "isolated-fixture-no-login",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    });
    ownerId = owner.id;
    assert.equal(await prisma.pageDocument.count({ where: { pageKey: "products" } }), 0);
    await prisma.siteSetting.create({
      data: {
        key: "site",
        value: {
          siteName: "隔离测试店铺",
          canonicalBaseUrl: "https://isolated.example.invalid",
          defaultLocale: "zh-CN",
          publishedLocales: ["zh-CN"],
        },
      },
    });
    createdSiteSetting = true;

    const definitionV1 = mediaSideDefinitionFixture();
    definitionV1.schemaVersion = 3;
    definitionV1.templateId = templateId;
    definitionV1.name = `图片位置页面实例 ${suffix}`;
    definitionV1.metadata.recommendedFor = ["products"];
    definitionV1.metadata.headerCompatibility = ["overlay-light"];
    definitionV1.defaultContent.slot_heading = "图片位置版本一";

    const pages = new PageModulesService(prisma);
    const templates = new DynamicTemplatesService(prisma);
    const created = await templates.create(owner.id, { definition: definitionV1, versionNote: "media side v1" });
    databaseId = created.id;
    const publishedV1 = await templates.publish(owner.id, templateId, {
      expectedRevision: created.draft!.revision,
      versionNote: "media side v1",
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
          contentBySlotId: { slot_heading: "图在右的页面实例" },
          layoutOverridesByNodeId: {},
          hiddenSlotIds: [],
          isVisible: true,
          pageSettings: { mediaSide: "end" },
        },
      }],
      root: { props: {} },
      zones: {},
    };
    const metadata = {
      seoTitle: "图片位置页面实例",
      seoDescription: "验证图片位置在真实数据库保存、发布与回读。",
      contentOwner: "自动化测试",
    };
    const validation = await pages.validatePageDocument("products", pageData, metadata);
    assert.equal(validation.valid, true, JSON.stringify(validation.issues));
    const undeclared = structuredClone(pageData);
    (undeclared.content[0].props.pageSettings as Record<string, unknown>).mediaSide = "left";
    const rejected = await pages.validatePageDocument("products", undeclared, metadata);
    assert.equal(rejected.valid, false, "未声明的图片位置取值必须被服务端拒绝");

    const saved = await pages.savePageDocument("products", pageData, metadata, "ci-real-mysql");
    assert.ok(saved);
    documentId = saved.id;
    const publishedPage = await pages.publishPageDocument("products", owner.id, saved.updatedAt.toISOString());
    assert.ok(publishedPage.publishedRevisionId);
    const reopenedPages = new PageModulesService(prisma);
    const publicRead = await reopenedPages.getPublishedPageDocument("products");
    assert.ok(publicRead && "puckData" in publicRead);
    const publicBlock = (publicRead.puckData as { content: Array<{ props: Record<string, unknown> }> }).content[0];
    assert.deepEqual(publicBlock.props.pageSettings, { mediaSide: "end" });

    // 新版本仍声明图片位置：发布模板时页面草稿自动沿用新版本，并保留页面选择。
    const definitionV2 = structuredClone(definitionV1);
    definitionV2.defaultContent.slot_heading = "图片位置版本二";
    const updatedV2 = await templates.updateDraft(owner.id, templateId, {
      expectedRevision: publishedV1.draft!.revision,
      definition: definitionV2,
      versionNote: "media side v2",
    });
    const publishedV2 = await templates.publish(owner.id, templateId, {
      expectedRevision: updatedV2!.draft!.revision,
      versionNote: "media side v2",
    });
    assert.equal(publishedV2.version, 2);
    const draftAfterV2 = await reopenedPages.getPageDocument("products");
    const draftBlockV2 = (draftAfterV2?.puckData as { content: Array<{ props: Record<string, unknown> }> }).content[0];
    assert.equal(draftBlockV2.props.templateVersion, 2);
    assert.deepEqual(draftBlockV2.props.pageSettings, { mediaSide: "end" });

    // 新版本不再开放图片位置：页面选择无法沿用，模板发布不改写任何页面草稿。
    const definitionV3 = structuredClone(definitionV2);
    delete definitionV3.metadata.pageSettings;
    const updatedV3 = await templates.updateDraft(owner.id, templateId, {
      expectedRevision: publishedV2.draft!.revision,
      definition: definitionV3,
      versionNote: "media side v3 without setting",
    });
    const publishedV3 = await templates.publish(owner.id, templateId, {
      expectedRevision: updatedV3!.draft!.revision,
      versionNote: "media side v3 without setting",
    });
    assert.equal(publishedV3.version, 3);
    const draftAfterV3 = await reopenedPages.getPageDocument("products");
    const draftBlockV3 = (draftAfterV3?.puckData as { content: Array<{ props: Record<string, unknown> }> }).content[0];
    assert.equal(draftBlockV3.props.templateVersion, 2, "缺少图片位置声明的新版本不得自动沿用");
    assert.deepEqual(draftBlockV3.props.pageSettings, { mediaSide: "end" });
    const publicAfterV3 = await reopenedPages.getPublishedPageDocument("products");
    assert.ok(publicAfterV3 && "puckData" in publicAfterV3);
    const publicBlockV3 = (publicAfterV3.puckData as { content: Array<{ props: Record<string, unknown> }> }).content[0];
    assert.equal(publicBlockV3.props.templateVersion, 1);
    assert.deepEqual(publicBlockV3.props.pageSettings, { mediaSide: "end" });
  } finally {
    if (documentId !== null) await prisma.pageDocument.delete({ where: { id: documentId } });
    if (databaseId !== null) {
      await prisma.$transaction([
        prisma.dynamicTemplateVersion.deleteMany({ where: { dynamicTemplateId: databaseId } }),
        prisma.dynamicTemplateDraft.deleteMany({ where: { dynamicTemplateId: databaseId } }),
        prisma.dynamicTemplate.deleteMany({ where: { id: databaseId } }),
      ]);
    }
    if (createdSiteSetting) await prisma.siteSetting.delete({ where: { key: "site" } });
    if (ownerId !== null) {
      await prisma.operationLog.deleteMany({ where: { userId: ownerId } });
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  }
});