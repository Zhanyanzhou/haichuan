import assert from "node:assert/strict";
import test from "node:test";
import { definitionFixture } from "./dynamic-template-test-fixture";
import {
  classifyDynamicTemplateActivationIdempotency,
  createDynamicTemplateActivationOutboxEvent,
  createDynamicTemplateActivationRequestHash,
  planDynamicTemplateActivation,
} from "./dynamic-template-activation";

const dynamicTemplateTestDefinition = definitionFixture();

function instance(version = 1, overrides: Record<string, unknown> = {}) {
  return {
    type: "动态模板实例",
    props: {
      id: "block-1",
      instanceSchemaVersion: 1,
      instanceId: "instance-1",
      templateId: dynamicTemplateTestDefinition.templateId,
      templateVersion: version,
      moduleName: dynamicTemplateTestDefinition.name,
      contentBySlotId: { slot_heading: "页面自己的标题" },
      layoutOverridesByNodeId: {},
      hiddenSlotIds: [],
      isVisible: true,
      ...overrides,
    },
  };
}

function document(blocks = [instance()]) {
  return {
    documentId: 7,
    pageKey: "home",
    status: "PUBLISHED",
    draftUpdatedAt: "2026-08-29T08:00:00.000Z",
    draftPuckData: { content: blocks, zones: {}, root: { props: {} } },
    draftMetadata: { title: "首页" },
    latestPublishedRevision: {
      id: 41,
      version: 8,
      puckData: { content: [instance()], zones: {}, root: { props: {} } },
      metadata: { title: "首页" },
    },
  };
}

function scheme(blocks = [instance()]) {
  return {
    schemeId: 12,
    pageKey: "home",
    updatedAt: "2026-08-29T08:02:00.000Z",
    puckData: { content: blocks, zones: {}, root: { props: {} } },
  };
}

function plan(options: {
  current?: typeof dynamicTemplateTestDefinition;
  target?: typeof dynamicTemplateTestDefinition;
  documents?: ReturnType<typeof document>[];
  schemes?: ReturnType<typeof scheme>[];
} = {}) {
  const current = structuredClone(options.current ?? dynamicTemplateTestDefinition);
  const target = structuredClone(options.target ?? dynamicTemplateTestDefinition);
  target.name = "正式模板 v2";
  return planDynamicTemplateActivation({
    templateId: target.templateId,
    currentPublishedVersion: 1,
    targetVersion: 2,
    expectedDraftRevision: 3,
    draftChecksum: "a".repeat(64),
    targetDefinition: target,
    definitionsByVersion: { 1: current },
    documents: options.documents ?? [document()],
    schemes: options.schemes ?? [],
  });
}

test("全局激活预检分别升级草稿与最新发布快照，并生成稳定影响哈希", () => {
  const first = plan();
  const second = plan();
  assert.equal(first.blockers.length, 0);
  assert.equal(first.affectedDocumentCount, 1);
  assert.equal(first.affectedDraftInstanceCount, 1);
  assert.equal(first.affectedPublishedInstanceCount, 1);
  assert.equal(first.preservedDraftDocumentCount, 0);
  assert.equal(first.documents[0]?.hadUnpublishedDraft, false);
  assert.equal(first.documents[0]?.nextDocumentStatus, "PUBLISHED");
  assert.match(first.impactHash, /^[a-f0-9]{64}$/);
  assert.equal(first.impactHash, second.impactHash);
  const draft = first.documents[0].upgradedDraftPuckData as any;
  const published = first.documents[0].upgradedPublishedPuckData as any;
  assert.equal(draft.content[0].props.templateVersion, 2);
  assert.equal(published.content[0].props.templateVersion, 2);
  assert.equal(draft.content[0].props.contentBySlotId.slot_heading, "页面自己的标题");
});

test("模板升级保留现有未发布草稿，正文或 metadata 差异都不能恢复为线上状态", () => {
  const dirtyContent = document();
  dirtyContent.status = "DRAFT";
  (dirtyContent.draftPuckData as any).content[0].props.contentBySlotId.slot_heading = "尚未发布的标题";
  const contentPlan = plan({ documents: [dirtyContent] });
  assert.equal(contentPlan.preservedDraftDocumentCount, 1);
  assert.equal(contentPlan.documents[0]?.hadUnpublishedDraft, true);
  assert.equal(contentPlan.documents[0]?.nextDocumentStatus, "DRAFT");

  const dirtyMetadata = document();
  dirtyMetadata.status = "DRAFT";
  dirtyMetadata.draftMetadata = { title: "尚未发布的 SEO 标题" };
  const metadataPlan = plan({ documents: [dirtyMetadata] });
  assert.equal(metadataPlan.documents[0]?.nextDocumentStatus, "DRAFT");
  assert.notEqual(metadataPlan.impactHash, plan().impactHash);
});

test("页面基线变化会改变 impactHash，陈旧确认不能复用", () => {
  const before = plan();
  const changedDocument = document();
  (changedDocument.draftPuckData as any).content[0].props.contentBySlotId.slot_heading = "并发保存后的标题";
  changedDocument.draftUpdatedAt = "2026-08-29T08:01:00.000Z";
  const after = plan({ documents: [changedDocument] });
  assert.notEqual(before.impactHash, after.impactHash);
  assert.equal(after.documents[0]?.nextDocumentStatus, "DRAFT");
  assert.ok(after.warnings.some((message) => message.includes("标记为 PUBLISHED")));
});

test("页面方案独立升级并进入影响哈希与计数", () => {
  const first = plan({ schemes: [scheme()] });
  assert.equal(first.affectedSchemeCount, 1);
  assert.equal(first.affectedSchemeInstanceCount, 1);
  assert.equal(first.schemes[0]?.occurrences[0]?.source, "scheme");
  assert.equal(
    (first.schemes[0]?.upgradedPuckData as any).content[0].props.templateVersion,
    2,
  );

  const changedScheme = scheme();
  (changedScheme.puckData as any).content[0].props.contentBySlotId.slot_heading = "方案并发修改";
  changedScheme.updatedAt = "2026-08-29T08:03:00.000Z";
  const changed = plan({ schemes: [changedScheme] });
  assert.notEqual(first.impactHash, changed.impactHash);
});

test("页面方案中的失效覆盖同样阻断整批激活", () => {
  const target = structuredClone(dynamicTemplateTestDefinition);
  delete target.nodes.node_heading;
  target.nodes.node_container.childIds = [];
  const result = plan({
    target,
    documents: [],
    schemes: [scheme([instance(1, {
      layoutOverridesByNodeId: { node_heading: { desktop: { offsetXPercent: 2 } } },
    })])],
  });
  assert.equal(result.affectedDocumentCount, 0);
  assert.equal(result.affectedSchemeCount, 1);
  assert.ok(result.blockers.some((message) => message.includes("scheme#12") && message.includes("构图覆盖")));
});

test("内容、隐藏状态或构图覆盖失效时产生 blocker，不静默丢弃页面值", () => {
  const target = structuredClone(dynamicTemplateTestDefinition);
  delete target.slots.slot_heading;
  delete target.defaultContent.slot_heading;
  delete target.nodes.node_heading;
  target.nodes.node_container.childIds = [];
  const impacted = document([instance(1, {
    hiddenSlotIds: ["slot_heading"],
    layoutOverridesByNodeId: { node_heading: { desktop: { offsetXPercent: 2 } } },
  })]);
  const result = plan({ target, documents: [impacted] });
  assert.ok(result.blockers.some((message) => message.includes("无法无损映射")));
  assert.ok(result.blockers.some((message) => message.includes("隐藏槽位")));
  assert.ok(result.blockers.some((message) => message.includes("构图覆盖")));
});

test("缺少原精确模板版本或重复 instanceId 时整页预检阻断", () => {
  const duplicated = document([instance(), instance()]);
  const missing = planDynamicTemplateActivation({
    templateId: dynamicTemplateTestDefinition.templateId,
    currentPublishedVersion: 1,
    targetVersion: 2,
    expectedDraftRevision: 1,
    draftChecksum: "b".repeat(64),
    targetDefinition: dynamicTemplateTestDefinition,
    definitionsByVersion: {},
    documents: [duplicated],
  });
  assert.ok(missing.blockers.some((message) => message.includes("缺少原精确模板版本")));
  assert.ok(missing.blockers.some((message) => message.includes("重复 instanceId")));
});

test("规范化 requestHash 支持同键重放并拒绝同键不同请求", () => {
  const base = {
    templateId: dynamicTemplateTestDefinition.templateId,
    expectedRevision: 3,
    impactHash: "A".repeat(64),
    versionNote: "  发布首版  ",
  };
  const first = createDynamicTemplateActivationRequestHash(base);
  const normalized = createDynamicTemplateActivationRequestHash({
    ...base,
    impactHash: "a".repeat(64),
    versionNote: "发布首版",
  });
  const changed = createDynamicTemplateActivationRequestHash({
    ...base,
    versionNote: "调整版本说明",
  });

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, normalized);
  assert.equal(classifyDynamicTemplateActivationIdempotency(first, normalized), "replay");
  assert.equal(classifyDynamicTemplateActivationIdempotency(first, changed), "conflict");
  assert.throws(
    () => createDynamicTemplateActivationRequestHash({ ...base, impactHash: "invalid" }),
    TypeError,
  );
});

test("模板激活 outbox 事件稳定去重且不携带页面正文", () => {
  const base = {
    templateId: dynamicTemplateTestDefinition.templateId,
    fromVersion: 1,
    toVersion: 2,
    impactHash: "a".repeat(64),
    requestHash: "b".repeat(64),
    affectedPageKeys: ["products", "home", "home"],
    affectedSchemeIds: [12, 3, 12],
    activatedAt: "2026-08-29T12:00:00+08:00",
  };
  const first = createDynamicTemplateActivationOutboxEvent(base);
  const reordered = createDynamicTemplateActivationOutboxEvent({
    ...base,
    affectedPageKeys: ["home", "products"],
    affectedSchemeIds: [3, 12],
  });

  assert.equal(first.aggregateType, "DynamicTemplate");
  assert.equal(first.eventType, "page.template-activated");
  assert.equal(first.aggregateId.length, 64);
  assert.ok(first.deduplicationKey.length <= 128);
  assert.equal(first.deduplicationKey, reordered.deduplicationKey);
  assert.deepEqual(first.payload.affectedPageKeys, ["home", "products"]);
  assert.deepEqual(first.payload.affectedSchemeIds, [3, 12]);
  assert.equal(first.payload.activatedAt, "2026-08-29T04:00:00.000Z");
  assert.deepEqual(Object.keys(first.payload).sort(), [
    "activatedAt",
    "affectedPageKeys",
    "affectedSchemeIds",
    "fromVersion",
    "impactHash",
    "requestHash",
    "templateId",
    "toVersion",
  ]);
  assert.notEqual(
    first.deduplicationKey,
    createDynamicTemplateActivationOutboxEvent({ ...base, fromVersion: 2, toVersion: 3 }).deduplicationKey,
  );
  assert.throws(
    () => createDynamicTemplateActivationOutboxEvent({
      ...base,
      affectedPageKeys: ["x".repeat(51)],
    }),
    TypeError,
  );
});
