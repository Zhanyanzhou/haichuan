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

export type DynamicTemplateAdoptionObjectKind = "page-draft" | "language-draft" | "scheme";

export type DynamicTemplateAdoptionSkipCode =
  | "MISSING_INSTANCE_ID"
  | "DUPLICATE_INSTANCE_ID"
  | "INVALID_TEMPLATE_VERSION"
  | "TEMPLATE_VERSION_NEWER_THAN_TARGET"
  | "MISSING_SOURCE_DEFINITION"
  | "SLOT_NOT_LOSSLESS"
  | "NEW_REQUIRED_SLOT"
  | "HIDDEN_SLOT_INVALID"
  | "LAYOUT_OVERRIDE_INVALID"
  | "PAGE_SETTING_LOST"
  | "INSTANCE_INVALID";

export interface DynamicTemplateAdoptionSkipReason {
  code: DynamicTemplateAdoptionSkipCode;
  instanceId: string | null;
  path: string;
  slotId?: string;
  nodeId?: string;
  fromVersion?: number;
}

export interface DynamicTemplateAdoptionSkippedObject {
  kind: DynamicTemplateAdoptionObjectKind;
  objectId: number;
  pageKey: string;
  reasons: DynamicTemplateAdoptionSkipReason[];
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
  draftAdoption: "adopt" | "skip" | "absent";
  skipReasons: DynamicTemplateAdoptionSkipReason[];
  upgradedDraftPuckData: unknown;
  upgradedPublishedPuckData: unknown | null;
}

export interface DynamicTemplateActivationSchemePlan {
  schemeId: number;
  pageKey: string;
  updatedAt: string;
  contentHash: string;
  occurrences: DynamicTemplateActivationOccurrence[];
  adoption: "adopt" | "skip";
  skipReasons: DynamicTemplateAdoptionSkipReason[];
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
  skipped: DynamicTemplateAdoptionSkippedObject[];
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
  objectKind?: "page-draft" | "language-draft";
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
  puckData: unknown;
  templateId: string;
  targetVersion: number;
  targetDefinition: TemplateDefinitionV2;
  definitionsByVersion: Record<number, TemplateDefinitionV2>;
}): {
  puckData: unknown;
  occurrences: DynamicTemplateActivationOccurrence[];
  reasons: DynamicTemplateAdoptionSkipReason[];
} {
  const upgraded = cloneJson(input.puckData);
  const occurrences: DynamicTemplateActivationOccurrence[] = [];
  const reasons: DynamicTemplateAdoptionSkipReason[] = [];
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
      const instanceReasons: DynamicTemplateAdoptionSkipReason[] = [];
      const push = (
        code: DynamicTemplateAdoptionSkipCode,
        detail: { slotId?: string; nodeId?: string; path?: string } = {},
      ) => {
        instanceReasons.push({
          code,
          instanceId: instanceId || null,
          path: detail.path ?? path,
          ...(detail.slotId ? { slotId: detail.slotId } : {}),
          ...(detail.nodeId ? { nodeId: detail.nodeId } : {}),
          ...(Number.isInteger(fromVersion) && fromVersion > 0 ? { fromVersion } : {}),
        });
      };
      if (!instanceId) push("MISSING_INSTANCE_ID");
      else if (instanceIds.has(instanceId)) push("DUPLICATE_INSTANCE_ID");
      else instanceIds.add(instanceId);
      if (!Number.isInteger(fromVersion) || fromVersion <= 0) {
        push("INVALID_TEMPLATE_VERSION");
        reasons.push(...instanceReasons);
        return;
      }
      if (fromVersion === input.targetVersion) {
        reasons.push(...instanceReasons);
        return;
      }
      if (fromVersion > input.targetVersion) {
        push("TEMPLATE_VERSION_NEWER_THAN_TARGET");
        reasons.push(...instanceReasons);
        return;
      }
      const currentDefinition = input.definitionsByVersion[fromVersion];
      if (!currentDefinition || currentDefinition.templateId !== input.templateId) {
        push("MISSING_SOURCE_DEFINITION");
        reasons.push(...instanceReasons);
        return;
      }

      const content = isRecord(props.contentBySlotId) ? props.contentBySlotId : {};
      for (const slotId of Object.keys(content).sort()) {
        const currentSlot = currentDefinition.slots[slotId];
        const targetSlot = input.targetDefinition.slots[slotId];
        if (!currentSlot || !targetSlot || currentSlot.type !== targetSlot.type || !targetSlot.editable) {
          push("SLOT_NOT_LOSSLESS", { slotId });
        }
      }
      for (const [slotId, targetSlot] of Object.entries(input.targetDefinition.slots)) {
        if (!currentDefinition.slots[slotId] && targetSlot.required) {
          push("NEW_REQUIRED_SLOT", { slotId });
        }
      }

      const hidden = Array.isArray(props.hiddenSlotIds)
        ? props.hiddenSlotIds.filter((value): value is string => typeof value === "string")
        : [];
      for (const slotId of hidden) {
        const slot = input.targetDefinition.slots[slotId];
        if (!slot?.hideable || slot.required) {
          push("HIDDEN_SLOT_INVALID", { slotId });
        }
      }

      const layoutOverrides = isRecord(props.layoutOverridesByNodeId)
        ? props.layoutOverridesByNodeId
        : {};
      for (const nodeId of Object.keys(layoutOverrides).sort()) {
        const node = input.targetDefinition.nodes[nodeId];
        const slot = node?.slotId ? input.targetDefinition.slots[node.slotId] : undefined;
        if (!node || !slot?.editable) {
          push("LAYOUT_OVERRIDE_INVALID", { nodeId });
        }
      }

      // 页面已选的图片位置不能被静默丢弃。目标版本不再开放时，这一整份对象保持旧版（D.47）。
      const pageSettings = isRecord(props.pageSettings) ? props.pageSettings : undefined;
      const mediaSideLost = pageSettings?.mediaSide !== undefined
        && !input.targetDefinition.metadata.pageSettings?.mediaSide;
      if (mediaSideLost) push("PAGE_SETTING_LOST");

      const nextProps = {
        ...props,
        templateVersion: input.targetVersion,
        moduleName: input.targetDefinition.name,
        contentBySlotId: cloneJson(content),
        hiddenSlotIds: cloneJson(hidden),
        layoutOverridesByNodeId: cloneJson(layoutOverrides),
        ...(pageSettings ? { pageSettings: cloneJson(pageSettings) } : {}),
      };
      const validation = validateDynamicTemplateInstance(nextProps, input.targetDefinition);
      const issues = mediaSideLost
        ? validation.issues.filter((issue) => issue.pathSuffix !== ".pageSettings.mediaSide")
        : validation.issues;
      for (const issue of issues) {
        push("INSTANCE_INVALID", { path: `${path}${issue.pathSuffix}` });
      }
      if (instanceReasons.length > 0) {
        reasons.push(...instanceReasons);
        return;
      }
      rawBlock.props = nextProps;
    });
  }
  if (reasons.length > 0) {
    return { puckData: cloneJson(input.puckData), occurrences, reasons };
  }
  return { puckData: upgraded, occurrences, reasons };
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
      puckData: document.draftPuckData,
      templateId: input.templateId,
      targetVersion: input.targetVersion,
      targetDefinition: input.targetDefinition,
      definitionsByVersion: input.definitionsByVersion,
    });
    const published = document.latestPublishedRevision
      ? planSnapshot({
          source: "published",
          puckData: document.latestPublishedRevision.puckData,
          templateId: input.templateId,
          targetVersion: input.targetVersion,
          targetDefinition: input.targetDefinition,
          definitionsByVersion: input.definitionsByVersion,
        })
      : null;
    const occurrences = [...draft.occurrences, ...(published?.occurrences ?? [])];
    if (occurrences.length === 0) continue;
    if (!published) warnings.push(`${document.pageKey} 没有已发布版本，仅升级当前草稿`);
    const draftAdoption = draft.occurrences.length === 0
      ? "absent"
      : draft.reasons.length > 0 ? "skip" : "adopt";
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
      draftAdoption,
      skipReasons: draft.reasons,
      upgradedDraftPuckData: draft.puckData,
      upgradedPublishedPuckData: published?.puckData ?? null,
    });
  }

  const schemes: DynamicTemplateActivationSchemePlan[] = [];
  for (const scheme of [...(input.schemes ?? [])].sort((left, right) => left.schemeId - right.schemeId)) {
    const planned = planSnapshot({
      source: "scheme",
      puckData: scheme.puckData,
      templateId: input.templateId,
      targetVersion: input.targetVersion,
      targetDefinition: input.targetDefinition,
      definitionsByVersion: input.definitionsByVersion,
    });
    if (planned.occurrences.length === 0) continue;
    schemes.push({
      schemeId: scheme.schemeId,
      pageKey: scheme.pageKey,
      updatedAt: scheme.updatedAt,
      contentHash: hashJson(scheme.puckData),
      occurrences: planned.occurrences,
      adoption: planned.reasons.length > 0 ? "skip" : "adopt",
      skipReasons: planned.reasons,
      upgradedPuckData: planned.puckData,
    });
  }

  const documentKind = input.objectKind ?? "page-draft";
  const skipped: DynamicTemplateAdoptionSkippedObject[] = [
    ...documents.filter((document) => document.draftAdoption === "skip").map((document) => ({
      kind: documentKind,
      objectId: document.documentId,
      pageKey: document.pageKey,
      reasons: document.skipReasons,
    })),
    ...schemes.filter((scheme) => scheme.adoption === "skip").map((scheme) => ({
      kind: "scheme" as const,
      objectId: scheme.schemeId,
      pageKey: scheme.pageKey,
      reasons: scheme.skipReasons,
    })),
  ];

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
      draftAdoption: document.draftAdoption,
      skipReasons: document.skipReasons,
      occurrences: document.occurrences,
    })),
    schemes: schemes.map((scheme) => ({
      schemeId: scheme.schemeId,
      pageKey: scheme.pageKey,
      updatedAt: scheme.updatedAt,
      contentHash: scheme.contentHash,
      adoption: scheme.adoption,
      skipReasons: scheme.skipReasons,
      occurrences: scheme.occurrences,
    })),
    skipped,
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
    skipped,
    documents,
    schemes,
  };
}
