import {
  addDynamicTemplateLayoutGroup,
  addDynamicTemplateNode,
  createBlankDynamicTemplateDefinition,
  createDynamicTemplateStableId,
  validateDynamicTemplateDefinition,
  type DynamicTemplateCanvasSize,
  type TemplateDefinitionV2,
} from "../template-definition";
import type { TemplateEditorDraft } from "./types";
import {
  prepareDynamicTemplateDefinitionForNewIdentity,
} from "./dynamicTemplateEditorUtils";

const STORAGE_KEY = "haichuan.dynamic-template-drafts.v1";
const REPOSITORY_VERSION = 1;
const MAX_LOCAL_DRAFTS = 50;

export interface StoredDynamicTemplateDraft {
  localDraftId: string;
  versionNote: string;
  sourceReference?: string;
  definition: TemplateDefinitionV2;
  savedAt: string;
}

interface StoredDynamicTemplateRepository {
  repositoryVersion: typeof REPOSITORY_VERSION;
  drafts: StoredDynamicTemplateDraft[];
}

function emptyRepository(): StoredDynamicTemplateRepository {
  return { repositoryVersion: REPOSITORY_VERSION, drafts: [] };
}

function readRepository(): StoredDynamicTemplateRepository {
  if (typeof window === "undefined") return emptyRepository();
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyRepository();
    const record = parsed as Record<string, unknown>;
    if (record.repositoryVersion !== REPOSITORY_VERSION || !Array.isArray(record.drafts)) {
      return emptyRepository();
    }
    const drafts = record.drafts.flatMap((value): StoredDynamicTemplateDraft[] => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const draft = value as Record<string, unknown>;
      const validation = validateDynamicTemplateDefinition(draft.definition);
      if (typeof draft.localDraftId !== "string"
        || typeof draft.savedAt !== "string"
        || !validation.valid
        || !validation.definition) return [];
      return [{
        localDraftId: draft.localDraftId,
        savedAt: draft.savedAt,
        versionNote: typeof draft.versionNote === "string" ? draft.versionNote.slice(0, 500) : "",
        ...(typeof draft.sourceReference === "string" ? { sourceReference: draft.sourceReference } : {}),
        definition: validation.definition,
      }];
    });
    return { repositoryVersion: REPOSITORY_VERSION, drafts: drafts.slice(0, MAX_LOCAL_DRAFTS) };
  } catch {
    return emptyRepository();
  }
}

function writeRepository(repository: StoredDynamicTemplateRepository) {
  if (typeof window === "undefined") throw new Error("本地模板草稿只能在浏览器中保存");
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(repository));
}

export function createNewDynamicTemplateDraft(
  name = "未命名模板",
  canvasSize?: Pick<DynamicTemplateCanvasSize, "width" | "height">,
): TemplateEditorDraft {
  const definition = createBlankDynamicTemplateDefinition(name);
  if (canvasSize) {
    const { width, height } = canvasSize;
    if (![width, height].every((value) => Number.isInteger(value) && value >= 1 && value <= 4096)) {
      throw new Error("画布宽高必须是 1–4096 之间的整数像素值。");
    }
    definition.metadata.canvasSize = { width, height, aspectRatio: width / height };
    // 响应式预览宽度保留自己的边界；逻辑画布宽度由 canvasSize 读取。
    definition.metadata.previewDesktopWidth = Math.max(768, Math.min(2560, width));
    const root = definition.nodes[definition.rootNodeId];
    root.responsive.desktop.height = { mode: "fixed", value: { value: height, unit: "px" } };
    root.responsive.mobile.height = { mode: "auto" };
  }
  return {
    format: "dynamic",
    sourceType: "local",
    localDraftId: definition.templateId,
    versionNote: "",
    definition,
  };
}

/**
 * 所有“新增内容区域”入口共用的默认值。返回新定义，避免调用方在命令外
 * 修改草稿，也确保画布主动作、结构面板和“先建区域再加槽位”完全一致。
 */
export function addConfiguredTemplateRegion(
  source: TemplateDefinitionV2,
  parentId = source.rootNodeId,
  index?: number,
): { definition: TemplateDefinitionV2; nodeId: string } {
  const added = addDynamicTemplateNode(source, parentId, "Container", index);
  const definition = structuredClone(added.definition);
  const root = definition.nodes[definition.rootNodeId];
  const regionNumber = parentId === definition.rootNodeId
    ? Math.max(1, root?.childIds.indexOf(added.nodeId) + 1)
    : 1;
  definition.nodes[added.nodeId].name = `内容区域 ${regionNumber}`;
  for (const device of ["desktop", "mobile"] as const) {
    const rules = definition.nodes[added.nodeId].responsive[device];
    rules.gap = { value: 24, unit: "px" };
    const side = { value: device === "desktop" ? 32 : 16, unit: "px" as const };
    rules.padding = { top: side, right: side, bottom: side, left: side };
  }
  return { definition, nodeId: added.nodeId };
}

/**
 * 生成用户主动选择的双图文骨架，保留整体尺寸规则，仅图片采用 4:3。
 * 调用方必须通过一次 typed command 提交，
 * 这样确认只有一条 history，取消时则完全不调用本函数。
 */
export function createBasicContentSkeletonDefinition(
  source: TemplateDefinitionV2,
): TemplateDefinitionV2 {
  let definition = structuredClone(source);
  const root = definition.nodes[definition.rootNodeId];
  if (!root || root.childIds.length > 0) return definition;

  const region = addConfiguredTemplateRegion(definition);
  definition = region.definition;
  const composition = addDynamicTemplateLayoutGroup(definition, region.nodeId, "horizontal");
  definition = composition.definition;
  definition.nodes[composition.nodeId].name = "双图文布局";
  definition.nodes[composition.nodeId].responsive.desktop.gap = { value: 32, unit: "px" };
  definition.nodes[composition.nodeId].responsive.mobile.direction = "column";
  definition.nodes[composition.nodeId].responsive.mobile.gap = { value: 20, unit: "px" };

  const imageGroup = addDynamicTemplateNode(definition, composition.nodeId, "Column");
  definition = imageGroup.definition;
  definition.nodes[imageGroup.nodeId].name = "图片组";
  definition.nodes[imageGroup.nodeId].responsive.desktop.direction = "row";
  definition.nodes[imageGroup.nodeId].responsive.desktop.gap = { value: 16, unit: "px" };
  definition.nodes[imageGroup.nodeId].responsive.mobile.direction = "column";
  definition.nodes[imageGroup.nodeId].responsive.mobile.gap = { value: 12, unit: "px" };

  const textGroup = addDynamicTemplateNode(definition, composition.nodeId, "Column");
  definition = textGroup.definition;
  definition.nodes[textGroup.nodeId].name = "文字组";
  definition.nodes[textGroup.nodeId].responsive.desktop.gap = { value: 16, unit: "px" };
  definition.nodes[textGroup.nodeId].responsive.mobile.gap = { value: 12, unit: "px" };

  for (const [parentId, type, label, typography] of [
    [imageGroup.nodeId, "ImageSlot", "图片槽位 1", null],
    [imageGroup.nodeId, "ImageSlot", "图片槽位 2", null],
    [textGroup.nodeId, "HeadingSlot", "标题槽位", { weight: 600, desktop: 48, mobile: 28 } as const],
    [textGroup.nodeId, "TextSlot", "正文槽位", { weight: 400, desktop: 20, mobile: 16 } as const],
  ] as const) {
    const added = addDynamicTemplateNode(definition, parentId, type);
    definition = added.definition;
    definition.nodes[added.nodeId].name = label;
    const slot = definition.slots[added.slotId!];
    slot.label = label;
    if (type === "ImageSlot") {
      slot.desktopRules.aspectRatio = "4:3";
      slot.mobileRules.aspectRatio = "4:3";
    }
    if (typography) {
      slot.desktopRules.fontWeight = typography.weight;
      slot.mobileRules.fontWeight = typography.weight;
      slot.desktopRules.fontSize = { value: typography.desktop, unit: "px" };
      slot.mobileRules.fontSize = { value: typography.mobile, unit: "px" };
    }
  }
  definition.metadata.layoutType = "双图文";
  definition.metadata.slotSummary = "2 个图片槽位、标题和正文";
  return definition;
}

export function listLocalDynamicTemplateDrafts(): StoredDynamicTemplateDraft[] {
  return readRepository().drafts.map((draft) => structuredClone(draft));
}

export function loadLocalDynamicTemplateDraft(localDraftId: string): TemplateEditorDraft | null {
  const stored = readRepository().drafts.find((draft) => draft.localDraftId === localDraftId);
  return stored ? {
    format: "dynamic",
    sourceType: "local",
    localDraftId: stored.localDraftId,
    versionNote: stored.versionNote,
    ...(stored.sourceReference ? { sourceReference: stored.sourceReference } : {}),
    definition: structuredClone(stored.definition),
  } : null;
}

export function saveLocalDynamicTemplateDraft(
  draft: TemplateEditorDraft,
): TemplateEditorDraft {
  const next = structuredClone(draft);
  const name = next.definition.name.trim();
  if (!name) throw new Error("请先填写模板名称");
  next.definition.name = name;
  const repository = readRepository();
  const createsNewIdentity = !repository.drafts.some((item) => item.localDraftId === next.localDraftId);
  if (createsNewIdentity) {
    next.definition = prepareDynamicTemplateDefinitionForNewIdentity(
      next.definition,
      next.localDraftId,
    );
  }
  const validation = validateDynamicTemplateDefinition(next.definition);
  const firstError = validation.issues.find((issue) => issue.level === "error");
  if (!validation.valid || !validation.definition) {
    throw new Error(firstError?.message ?? "模板结构校验失败");
  }
  const savedAt = new Date().toISOString();
  const stored: StoredDynamicTemplateDraft = {
    localDraftId: next.localDraftId,
    versionNote: next.versionNote.trim().slice(0, 500),
    ...(next.sourceReference ? { sourceReference: next.sourceReference } : {}),
    definition: validation.definition,
    savedAt,
  };
  repository.drafts = [
    stored,
    ...repository.drafts.filter((item) => item.localDraftId !== stored.localDraftId),
  ].slice(0, MAX_LOCAL_DRAFTS);
  writeRepository(repository);
  return {
    ...next,
    definition: structuredClone(validation.definition),
  };
}

export function exportDynamicTemplateDraftJson(draft: TemplateEditorDraft): string {
  const validation = validateDynamicTemplateDefinition(draft.definition);
  if (!validation.valid || !validation.definition) {
    throw new Error(validation.issues.find((issue) => issue.level === "error")?.message ?? "模板结构校验失败");
  }
  return JSON.stringify(validation.definition, null, 2);
}

export const DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT = "haichuan:dynamic-template-local-draft-changed";
