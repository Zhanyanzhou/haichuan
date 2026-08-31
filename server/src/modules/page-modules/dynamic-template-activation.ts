import { createHash } from "crypto";
import type { TemplateDefinitionV2 } from "./generated/templateDefinition.generated";
import { validateDynamicTemplateInstance } from "./dynamic-template-instance";

const DYNAMIC_TEMPLATE_BLOCK_TYPE = "动态模板实例";

type JsonRecord = Record<string, unknown>;

export interface DynamicTemplateActivationRevisionSnapshot {
  id: number;
  version: number;
  puckData: unknown;
  metadata?: unknown;
}

export interface DynamicTemplateActivationDocumentSnapshot {
  documentId: number;
  pageKey: string;
  status: string;
  draftUpdatedAt: string;
  draftPuckData: unknown;
  draftMetadata?: unknown;
  latestPublishedRevision?: DynamicTemplateActivationRevisionSnapshot | null;
}

export interface DynamicTemplateActivationSchemeSnapshot {
  schemeId: number;
  pageKey: string;
  updatedAt: string;
  puckData: unknown;
}

export interface DynamicTemplateActivationOccurrence {
  source: "draft" | "published" | "scheme";
  path: string;
  instanceId: string;
  fromVersion: number;
}

export interface DynamicTemplateActivationDocumentPlan {
  documentId: number;
  pageKey: string;
  draftContentHash: string;
  publishedRevisionId: number | null;
  publishedRevisionVersion: number | null;
  publishedContentHash: string | null;
  draftMetadataHash: string;
  publishedMetadataHash: string | null;
  hadUnpublishedDraft: boolean;
  nextDocumentStatus: "DRAFT" | "PUBLISHED";
  occurrences: DynamicTemplateActivationOccurrence[];
  upgradedDraftPuckData: unknown;
  upgradedPublishedPuckData: unknown | null;
}

export interface DynamicTemplateActivationSchemePlan {
  schemeId: number;
  pageKey: string;
  updatedAt: string;
  contentHash: string;
  occurrences: DynamicTemplateActivationOccurrence[];
  upgradedPuckData: unknown;
}

export interface DynamicTemplateActivationImpact {
  templateId: string;
  fromVersion: number;
  toVersion: number;
  expectedDraftRevision: number;
  draftChecksum: string;
  impactHash: string;
  affectedDocumentCount: number;
  affectedDraftInstanceCount: number;
  affectedPublishedInstanceCount: number;
  preservedDraftDocumentCount: number;
  affectedSchemeCount: number;
  affectedSchemeInstanceCount: number;
  blockers: string[];
  warnings: string[];
  documents: DynamicTemplateActivationDocumentPlan[];
  schemes: DynamicTemplateActivationSchemePlan[];
}

export interface PlanDynamicTemplateActivationInput {
  templateId: string;
  currentPublishedVersion: number;
  targetVersion: number;
  expectedDraftRevision: number;
  draftChecksum: string;
  targetDefinition: TemplateDefinitionV2;
  definitionsByVersion: Record<number, TemplateDefinitionV2>;
  documents: DynamicTemplateActivationDocumentSnapshot[];
  schemes?: DynamicTemplateActivationSchemeSnapshot[];
  initialBlockers?: string[];
  additionalImpactState?: unknown;
}

export interface DynamicTemplateActivationRequestInput {
  templateId: string;
  expectedRevision: number;
  impactHash: string;
  versionNote?: string | null;
}

export interface DynamicTemplateActivationOutboxInput {
  templateId: string;
  fromVersion: number;
  toVersion: number;
  impactHash: string;
  requestHash: string;
  affectedPageKeys: string[];
  affectedSchemeIds: number[];
  activatedAt: string;
}

export interface DynamicTemplateActivationOutboxEvent {
  aggregateType: "DynamicTemplate";
  aggregateId: string;
  eventType: "page.template-activated";
  deduplicationKey: string;
  payload: {
    templateId: string;
    fromVersion: number;
    toVersion: number;
    impactHash: string;
    requestHash: string;
    affectedPageKeys: string[];
    affectedSchemeIds: number[];
    activatedAt: string;
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return String(value);
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function createDynamicTemplateActivationRequestHash(
  input: DynamicTemplateActivationRequestInput,
): string {
  const templateId = input.templateId.trim();
  if (!templateId) throw new TypeError("激活请求 templateId 不能为空");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision <= 0) {
    throw new TypeError("激活请求 expectedRevision 无效");
  }
  if (!/^[a-f0-9]{64}$/i.test(input.impactHash)) {
    throw new TypeError("激活请求 impactHash 无效");
  }
  const versionNote = input.versionNote?.trim() || null;
  return hashJson({
    templateId,
    expectedRevision: input.expectedRevision,
    impactHash: input.impactHash.toLowerCase(),
    versionNote,
  });
}

export function classifyDynamicTemplateActivationIdempotency(
  existingRequestHash: string,
  incomingRequestHash: string,
): "replay" | "conflict" {
  if (!/^[a-f0-9]{64}$/i.test(existingRequestHash)
    || !/^[a-f0-9]{64}$/i.test(incomingRequestHash)) {
    throw new TypeError("激活请求 requestHash 无效");
  }
  return existingRequestHash.toLowerCase() === incomingRequestHash.toLowerCase()
    ? "replay"
    : "conflict";
}

export function createDynamicTemplateActivationOutboxEvent(
  input: DynamicTemplateActivationOutboxInput,
): DynamicTemplateActivationOutboxEvent {
  const templateId = input.templateId.trim();
  if (!templateId || templateId.length > 128) throw new TypeError("激活事件 templateId 无效");
  if (!Number.isInteger(input.fromVersion) || input.fromVersion < 0) {
    throw new TypeError("激活事件 fromVersion 无效");
  }
  if (!Number.isInteger(input.toVersion) || input.toVersion !== input.fromVersion + 1) {
    throw new TypeError("激活事件 toVersion 必须严格等于 fromVersion 加一");
  }
  for (const [label, value] of [["impactHash", input.impactHash], ["requestHash", input.requestHash]] as const) {
    if (!/^[a-f0-9]{64}$/i.test(value)) throw new TypeError(`激活事件 ${label} 无效`);
  }
  const activatedAt = new Date(input.activatedAt);
  if (Number.isNaN(activatedAt.getTime())) throw new TypeError("激活事件 activatedAt 无效");
  const affectedPageKeys = [...new Set(input.affectedPageKeys.map((value) => value.trim()))]
    .filter(Boolean)
    .sort();
  if (affectedPageKeys.some((value) => value.length > 50)) {
    throw new TypeError("激活事件 pageKey 无效");
  }
  const affectedSchemeIds = [...new Set(input.affectedSchemeIds)].sort((left, right) => left - right);
  if (affectedSchemeIds.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new TypeError("激活事件 schemeId 无效");
  }
  const aggregateId = hashJson({ templateId });
  const deduplicationKey = `template-activated:${hashJson({ templateId, toVersion: input.toVersion })}`;
  return {
    aggregateType: "DynamicTemplate",
    aggregateId,
    eventType: "page.template-activated",
    deduplicationKey,
    payload: {
      templateId,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      impactHash: input.impactHash.toLowerCase(),
      requestHash: input.requestHash.toLowerCase(),
      affectedPageKeys,
      affectedSchemeIds,
      activatedAt: activatedAt.toISOString(),
    },
  };
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function collectBlockArrays(puckData: unknown): Array<{ path: string; blocks: unknown[] }> {
  if (!isRecord(puckData)) return [];
  const arrays: Array<{ path: string; blocks: unknown[] }> = [];
  if (Array.isArray(puckData.content)) arrays.push({ path: "content", blocks: puckData.content });
  if (isRecord(puckData.zones)) {
    for (const zoneKey of Object.keys(puckData.zones).sort()) {
      const blocks = puckData.zones[zoneKey];
      if (Array.isArray(blocks)) arrays.push({ path: `zones.${zoneKey}`, blocks });
    }
  }
  return arrays;
}

function planSnapshot(input: {
  source: DynamicTemplateActivationOccurrence["source"];
  contextLabel: string;
  puckData: unknown;
  templateId: string;
  targetVersion: number;
  targetDefinition: TemplateDefinitionV2;
  definitionsByVersion: Record<number, TemplateDefinitionV2>;
  blockers: string[];
}): { puckData: unknown; occurrences: DynamicTemplateActivationOccurrence[] } {
  const upgraded = cloneJson(input.puckData);
  const occurrences: DynamicTemplateActivationOccurrence[] = [];
  const instanceIds = new Set<string>();
  for (const array of collectBlockArrays(upgraded)) {
    array.blocks.forEach((rawBlock, index) => {
      if (!isRecord(rawBlock) || rawBlock.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE || !isRecord(rawBlock.props)) return;
      const props = rawBlock.props;
      if (props.templateId !== input.templateId) return;
      const path = `${array.path}[${index}]`;
      const instanceId = typeof props.instanceId === "string" ? props.instanceId : "";
      const fromVersion = Number(props.templateVersion);
      occurrences.push({ source: input.source, path, instanceId, fromVersion });
      const prefix = `${input.contextLabel} ${path}`;
      if (!instanceId) {
        input.blockers.push(`${prefix} 缺少稳定 instanceId`);
      } else if (instanceIds.has(instanceId)) {
        input.blockers.push(`${prefix} 存在重复 instanceId ${instanceId}`);
      } else {
        instanceIds.add(instanceId);
      }
      if (!Number.isInteger(fromVersion) || fromVersion <= 0) {
        input.blockers.push(`${prefix} 的模板版本无效`);
        return;
      }
      if (fromVersion === input.targetVersion) return;
      if (fromVersion > input.targetVersion) {
        input.blockers.push(`${prefix} 引用的 v${fromVersion} 高于本次目标 v${input.targetVersion}`);
        return;
      }
      const currentDefinition = input.definitionsByVersion[fromVersion];
      if (!currentDefinition || currentDefinition.templateId !== input.templateId) {
        input.blockers.push(`${prefix} 缺少原精确模板版本 v${fromVersion}`);
        return;
      }

      const content = isRecord(props.contentBySlotId) ? props.contentBySlotId : {};
      for (const slotId of Object.keys(content).sort()) {
        const currentSlot = currentDefinition.slots[slotId];
        const targetSlot = input.targetDefinition.slots[slotId];
        if (!currentSlot || !targetSlot || currentSlot.type !== targetSlot.type || !targetSlot.editable) {
          input.blockers.push(`${prefix} 的槽位 ${slotId} 无法无损映射`);
        }
      }
      for (const [slotId, targetSlot] of Object.entries(input.targetDefinition.slots)) {
        if (!currentDefinition.slots[slotId] && targetSlot.required) {
          input.blockers.push(`${prefix} 的新增必填槽位 ${slotId} 必须由页面实例填写`);
        }
      }

      const hidden = Array.isArray(props.hiddenSlotIds)
        ? props.hiddenSlotIds.filter((value): value is string => typeof value === "string")
        : [];
      for (const slotId of hidden) {
        const slot = input.targetDefinition.slots[slotId];
        if (!slot?.hideable || slot.required) {
          input.blockers.push(`${prefix} 的隐藏槽位 ${slotId} 在目标版本失效`);
        }
      }

      const layoutOverrides = isRecord(props.layoutOverridesByNodeId)
        ? props.layoutOverridesByNodeId
        : {};
      for (const nodeId of Object.keys(layoutOverrides).sort()) {
        const node = input.targetDefinition.nodes[nodeId];
        const slot = node?.slotId ? input.targetDefinition.slots[node.slotId] : undefined;
        if (!node || !slot?.editable) {
          input.blockers.push(`${prefix} 的构图覆盖 ${nodeId} 在目标版本失效`);
        }
      }

      const nextProps = {
        ...props,
        templateVersion: input.targetVersion,
        moduleName: input.targetDefinition.name,
        contentBySlotId: cloneJson(content),
        hiddenSlotIds: cloneJson(hidden),
        layoutOverridesByNodeId: cloneJson(layoutOverrides),
      };
      const validation = validateDynamicTemplateInstance(nextProps, input.targetDefinition);
      if (validation.issues.length > 0) {
        for (const issue of validation.issues) {
          input.blockers.push(`${prefix}${issue.pathSuffix}：${issue.message}`);
        }
        return;
      }
      rawBlock.props = nextProps;
    });
  }
  return { puckData: upgraded, occurrences };
}

export function planDynamicTemplateActivation(
  input: PlanDynamicTemplateActivationInput,
): DynamicTemplateActivationImpact {
  const blockers: string[] = [...(input.initialBlockers ?? [])];
  const warnings: string[] = [];
  if (input.targetDefinition.templateId !== input.templateId) {
    blockers.push("目标草稿 templateId 与激活模板不一致");
  }
  if (!Number.isInteger(input.targetVersion)
    || input.targetVersion !== input.currentPublishedVersion + 1) {
    blockers.push("目标版本必须严格等于当前正式版本加一");
  }
  if (!Number.isInteger(input.expectedDraftRevision) || input.expectedDraftRevision <= 0) {
    blockers.push("草稿 revision 无效");
  }
  if (!/^[a-f0-9]{64}$/i.test(input.draftChecksum)) {
    blockers.push("草稿 checksum 无效");
  }

  const documents: DynamicTemplateActivationDocumentPlan[] = [];
  for (const document of [...input.documents].sort((left, right) => left.documentId - right.documentId)) {
    const draftContentHash = hashJson(document.draftPuckData);
    const draftMetadataHash = hashJson(document.draftMetadata);
    const publishedContentHash = document.latestPublishedRevision
      ? hashJson(document.latestPublishedRevision.puckData)
      : null;
    const publishedMetadataHash = document.latestPublishedRevision
      ? hashJson(document.latestPublishedRevision.metadata)
      : null;
    const draftMatchesPublished = Boolean(
      document.latestPublishedRevision
      && draftContentHash === publishedContentHash
      && draftMetadataHash === publishedMetadataHash,
    );
    const hadUnpublishedDraft = document.status !== "PUBLISHED" || !draftMatchesPublished;
    if (
      document.status === "PUBLISHED"
      && document.latestPublishedRevision
      && !draftMatchesPublished
    ) {
      warnings.push(`${document.pageKey} 标记为 PUBLISHED 但草稿基线与最新公开版本不同，升级后保留为 DRAFT`);
    }
    const draft = planSnapshot({
      source: "draft",
      contextLabel: `${document.pageKey} draft`,
      puckData: document.draftPuckData,
      templateId: input.templateId,
      targetVersion: input.targetVersion,
      targetDefinition: input.targetDefinition,
      definitionsByVersion: input.definitionsByVersion,
      blockers,
    });
    const published = document.latestPublishedRevision
      ? planSnapshot({
          source: "published",
          contextLabel: `${document.pageKey} published`,
          puckData: document.latestPublishedRevision.puckData,
          templateId: input.templateId,
          targetVersion: input.targetVersion,
          targetDefinition: input.targetDefinition,
          definitionsByVersion: input.definitionsByVersion,
          blockers,
        })
      : null;
    const occurrences = [...draft.occurrences, ...(published?.occurrences ?? [])];
    if (occurrences.length === 0) continue;
    if (!published) warnings.push(`${document.pageKey} 没有已发布版本，仅升级当前草稿`);
    documents.push({
      documentId: document.documentId,
      pageKey: document.pageKey,
      draftContentHash,
      publishedRevisionId: document.latestPublishedRevision?.id ?? null,
      publishedRevisionVersion: document.latestPublishedRevision?.version ?? null,
      publishedContentHash,
      draftMetadataHash,
      publishedMetadataHash,
      hadUnpublishedDraft,
      nextDocumentStatus: hadUnpublishedDraft ? "DRAFT" : "PUBLISHED",
      occurrences,
      upgradedDraftPuckData: draft.puckData,
      upgradedPublishedPuckData: published?.puckData ?? null,
    });
  }

  const schemes: DynamicTemplateActivationSchemePlan[] = [];
  for (const scheme of [...(input.schemes ?? [])].sort((left, right) => left.schemeId - right.schemeId)) {
    const planned = planSnapshot({
      source: "scheme",
      contextLabel: `${scheme.pageKey} scheme#${scheme.schemeId}`,
      puckData: scheme.puckData,
      templateId: input.templateId,
      targetVersion: input.targetVersion,
      targetDefinition: input.targetDefinition,
      definitionsByVersion: input.definitionsByVersion,
      blockers,
    });
    if (planned.occurrences.length === 0) continue;
    schemes.push({
      schemeId: scheme.schemeId,
      pageKey: scheme.pageKey,
      updatedAt: scheme.updatedAt,
      contentHash: hashJson(scheme.puckData),
      occurrences: planned.occurrences,
      upgradedPuckData: planned.puckData,
    });
  }

  const hashPayload = {
    templateId: input.templateId,
    fromVersion: input.currentPublishedVersion,
    toVersion: input.targetVersion,
    expectedDraftRevision: input.expectedDraftRevision,
    draftChecksum: input.draftChecksum.toLowerCase(),
    documents: documents.map((document) => ({
      documentId: document.documentId,
      pageKey: document.pageKey,
      status: input.documents.find((item) => item.documentId === document.documentId)?.status,
      draftUpdatedAt: input.documents.find((item) => item.documentId === document.documentId)?.draftUpdatedAt,
      draftContentHash: document.draftContentHash,
      draftMetadataHash: document.draftMetadataHash,
      publishedRevisionId: document.publishedRevisionId,
      publishedRevisionVersion: document.publishedRevisionVersion,
      publishedContentHash: document.publishedContentHash,
      publishedMetadataHash: document.publishedMetadataHash,
      hadUnpublishedDraft: document.hadUnpublishedDraft,
      nextDocumentStatus: document.nextDocumentStatus,
      occurrences: document.occurrences,
    })),
    schemes: schemes.map((scheme) => ({
      schemeId: scheme.schemeId,
      pageKey: scheme.pageKey,
      updatedAt: scheme.updatedAt,
      contentHash: scheme.contentHash,
      occurrences: scheme.occurrences,
    })),
    blockers: [...blockers].sort(),
    additionalImpactState: input.additionalImpactState,
  };
  return {
    templateId: input.templateId,
    fromVersion: input.currentPublishedVersion,
    toVersion: input.targetVersion,
    expectedDraftRevision: input.expectedDraftRevision,
    draftChecksum: input.draftChecksum.toLowerCase(),
    impactHash: hashJson(hashPayload),
    affectedDocumentCount: documents.length,
    affectedDraftInstanceCount: documents.reduce(
      (total, document) => total + document.occurrences.filter((item) => item.source === "draft").length,
      0,
    ),
    affectedPublishedInstanceCount: documents.reduce(
      (total, document) => total + document.occurrences.filter((item) => item.source === "published").length,
      0,
    ),
    preservedDraftDocumentCount: documents.filter((document) => document.hadUnpublishedDraft).length,
    affectedSchemeCount: schemes.length,
    affectedSchemeInstanceCount: schemes.reduce(
      (total, scheme) => total + scheme.occurrences.length,
      0,
    ),
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    documents,
    schemes,
  };
}
