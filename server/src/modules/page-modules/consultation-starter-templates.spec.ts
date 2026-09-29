import assert from "node:assert/strict";
import test from "node:test";
import { validateDynamicTemplateDefinition } from "./generated/validateTemplateDefinition.generated";
import { DynamicTemplatesService } from "./dynamic-templates.service";
import {
  CONSULTATION_STARTER_SPECS,
  buildConsultationStarterDefinition,
  consultationStarterDefinitions,
} from "./consultation-starter-templates";

test("咨询站起步模板定义可通过当前 Schema 校验且默认内容为空", () => {
  const definitions = consultationStarterDefinitions();
  assert.equal(definitions.length, 6);
  assert.deepEqual(
    CONSULTATION_STARTER_SPECS.map((spec) => spec.pageKey),
    ["home", "products", "catalog", "custom", "about", "contact"],
  );
  for (const definition of definitions) {
    const result = validateDynamicTemplateDefinition(definition);
    assert.equal(result.valid, true, result.issues.map((issue) => issue.message).join("；"));
    assert.deepEqual(definition.defaultContent, {});
    assert.equal("previewContent" in definition, false);
    assert.ok(definition.slots.slot_image);
    assert.equal(definition.slots.slot_image.emptyPolicy, "hide");
  }
});

test("ensureConsultationStarters 对已发布起步模板幂等，不为他人草稿抢发布", async () => {
  const published = CONSULTATION_STARTER_SPECS.map((spec, index) => ({
    templateId: spec.templateId,
    sourceReference: spec.sourceReference,
    ownerId: 9,
    publishedVersion: 1,
    draft: null,
    id: index + 1,
    status: "ACTIVE",
  }));
  const createCalls: unknown[] = [];
  const prisma = {
    $queryRaw: async () => [{ id: 17, role: "SUPER_ADMIN" }],
    dynamicTemplate: {
      findMany: async () => published,
    },
  } as any;
  prisma.$transaction = async (callback: (transaction: any) => Promise<unknown>) => (
    callback(prisma)
  );
  const service = new DynamicTemplatesService(prisma as never);
  service.create = async (...args: unknown[]) => {
    createCalls.push(args);
    throw new Error("已发布起步模板不应再次创建");
  };
  const result = await service.ensureConsultationStarters(17);
  assert.equal(createCalls.length, 0);
  assert.deepEqual(
    result.items.map((item) => item.outcome),
    CONSULTATION_STARTER_SPECS.map(() => "already-published"),
  );
});

test("ensureConsultationStarters 会为缺失起步模板创建并发布", async () => {
  const created: string[] = [];
  const published: string[] = [];
  const prisma = {
    $queryRaw: async () => [{ id: 17, role: "SUPER_ADMIN" }],
    dynamicTemplate: {
      findMany: async () => [],
      updateMany: async () => ({ count: 1 }),
    },
  } as any;
  prisma.$transaction = async (callback: (transaction: any) => Promise<unknown>) => (
    callback(prisma)
  );
  const service = new DynamicTemplatesService(prisma as never);
  service.create = async (_actor: any, input: { definition: { templateId: string } }) => {
    created.push(input.definition.templateId);
    return {
      templateId: input.definition.templateId,
      publishedVersion: 0,
      draft: { revision: 1 },
    } as never;
  };
  service.publish = async (_actor: any, templateId: string) => {
    published.push(templateId);
    return {} as never;
  };
  const result = await service.ensureConsultationStarters(17);
  assert.deepEqual(created, CONSULTATION_STARTER_SPECS.map((spec) => spec.templateId));
  assert.deepEqual(published, created);
  assert.deepEqual(
    result.items.map((item) => item.outcome),
    CONSULTATION_STARTER_SPECS.map(() => "created"),
  );
  assert.equal(buildConsultationStarterDefinition(CONSULTATION_STARTER_SPECS[0]).metadata.recommendedFor[0], "home");
});
