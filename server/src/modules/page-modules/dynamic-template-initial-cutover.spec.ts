import assert from "node:assert/strict";
import test from "node:test";
import { definitionFixture } from "./dynamic-template-test-fixture";
import {
  INITIAL_CUTOVER_REQUIRED_SOURCE_REFERENCES,
  planInitialTemplateV2Cutover,
  type InitialTemplateV2CutoverReplacement,
} from "./dynamic-template-initial-cutover";

function replacements(): InitialTemplateV2CutoverReplacement[] {
  return INITIAL_CUTOVER_REQUIRED_SOURCE_REFERENCES.map((sourceReference, index) => {
    const definition = definitionFixture();
    definition.templateId = `tpl_system_${index + 1}`;
    definition.name = `系统模板 ${index + 1}`;
    return {
      sourceReference,
      templateId: definition.templateId,
      targetVersion: 1,
      definitionChecksum: (index + 1).toString(16).padStart(64, "0"),
      definition,
    };
  });
}

function legacyBlock(overrides: Record<string, unknown> = {}) {
  return {
    type: "首屏主视觉",
    props: {
      id: "legacy-hero-1",
      heading: "页面自己的首屏标题",
      isVisible: true,
      __instanceOverrides: { version: 2 },
      __templateOrigin: { kind: "system", contractKey: "hero", version: 3 },
      ...overrides,
    },
  };
}

function document() {
  return {
    documentId: 7,
    pageKey: "home",
    status: "PUBLISHED",
    draftUpdatedAt: "2026-08-30T08:00:00.000Z",
    draftPuckData: {
      content: [legacyBlock()],
      zones: {},
      root: { props: {} },
      resolvedDynamicTemplates: { stale: { definition: "不能持久化" } },
    },
    draftMetadata: { title: "首页" },
    latestPublishedRevision: {
      id: 41,
      version: 8,
      puckData: {
        content: [legacyBlock()],
        zones: {},
        root: { props: {} },
        resolvedDynamicTemplates: { stale: { definition: "不能持久化" } },
      },
      metadata: { title: "首页" },
    },
  };
}

test("首次统一切换把旧页面草稿与正式快照转换为精确 V2 实例，并保持影响哈希稳定", () => {
  const first = planInitialTemplateV2Cutover({
    replacements: replacements(),
    documents: [document()],
    schemes: [{
      schemeId: 12,
      pageKey: "home",
      updatedAt: "2026-08-30T08:02:00.000Z",
      puckData: { content: [legacyBlock()], zones: {}, root: { props: {} } },
    }],
  });
  const second = planInitialTemplateV2Cutover({
    replacements: replacements(),
    documents: [document()],
    schemes: [{
      schemeId: 12,
      pageKey: "home",
      updatedAt: "2026-08-30T08:02:00.000Z",
      puckData: { content: [legacyBlock()], zones: {}, root: { props: {} } },
    }],
  });

  assert.equal(first.blockers.length, 0);
  assert.equal(first.requiredReplacementCount, 24);
  assert.equal(first.readyReplacementCount, 24);
  assert.equal(first.affectedDocumentCount, 1);
  assert.equal(first.affectedDraftInstanceCount, 1);
  assert.equal(first.affectedPublishedInstanceCount, 1);
  assert.equal(first.affectedSchemeCount, 1);
  assert.equal(first.affectedSchemeInstanceCount, 1);
  assert.equal(first.documents[0]?.nextDocumentStatus, "PUBLISHED");
  assert.equal(first.impactHash, second.impactHash);
  assert.match(first.impactHash, /^[a-f0-9]{64}$/);
  assert.equal(first.warnings.length, 3);

  const converted = first.documents[0]?.convertedDraftPuckData as any;
  assert.equal(converted.resolvedDynamicTemplates, undefined);
  assert.equal(converted.content[0].type, "动态模板实例");
  assert.equal(converted.content[0].props.templateId, "tpl_system_1");
  assert.equal(converted.content[0].props.templateVersion, 1);
  assert.equal(converted.content[0].props.contentBySlotId.slot_heading, "页面自己的首屏标题");
  assert.equal(converted.content[0].props.__instanceOverrides, undefined);
  assert.match(converted.content[0].props.instanceId, /^instance_[a-f0-9]{40}$/);
});

test("首次切换分别保留未发布页面草稿，不把草稿内容混入正式快照", () => {
  const dirty = document();
  dirty.status = "DRAFT";
  (dirty.draftPuckData as any).content[0].props.heading = "尚未发布的标题";
  const impact = planInitialTemplateV2Cutover({
    replacements: replacements(),
    documents: [dirty],
  });

  assert.equal(impact.blockers.length, 0);
  assert.equal(impact.preservedDraftDocumentCount, 1);
  assert.equal(impact.documents[0]?.nextDocumentStatus, "DRAFT");
  const draft = impact.documents[0]?.convertedDraftPuckData as any;
  const published = impact.documents[0]?.convertedPublishedPuckData as any;
  assert.equal(draft.content[0].props.contentBySlotId.slot_heading, "尚未发布的标题");
  assert.equal(published.content[0].props.contentBySlotId.slot_heading, "页面自己的首屏标题");
});

test("替代模板缺失或重复时失败关闭，不能静默保留旧实例", () => {
  const missing = replacements().slice(1);
  const missingImpact = planInitialTemplateV2Cutover({
    replacements: missing,
    documents: [document()],
  });
  assert.ok(missingImpact.blockers.some((item) => item.includes("缺少系统替代模板 legacy_system_hero")));
  assert.ok(missingImpact.blockers.some((item) => item.includes("统一 V2 替代模板")));
  assert.equal(missingImpact.readyReplacementCount, 23);

  const duplicate = replacements();
  duplicate.push(structuredClone(duplicate[0]!));
  const duplicateImpact = planInitialTemplateV2Cutover({
    replacements: duplicate,
    documents: [],
  });
  assert.ok(duplicateImpact.blockers.some((item) => item.includes("legacy_system_hero 存在 2 个活动候选")));
  assert.equal(duplicateImpact.readyReplacementCount, 23);
});

test("实例内容不满足 V2 槽位规则时形成 blocker，不生成可激活结论", () => {
  const candidates = replacements();
  candidates[0]!.definition.slots.slot_heading.required = true;
  const impact = planInitialTemplateV2Cutover({
    replacements: candidates,
    documents: [document()],
  });
  assert.equal(impact.blockers.length, 0);

  const invalidDocument = document();
  (invalidDocument.draftPuckData as any).content[0].props.heading = "";
  const invalid = planInitialTemplateV2Cutover({
    replacements: candidates,
    documents: [invalidDocument],
  });
  assert.ok(invalid.blockers.some((item) => item.includes("主标题为必填内容")));
});
