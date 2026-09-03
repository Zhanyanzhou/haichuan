import {
  createBlankDynamicTemplateDefinition,
  createDynamicTemplateStableId,
  validateDynamicTemplateDefinition,
  type TemplateDefinitionV2,
} from "../template-definition";
import type { TemplateEditorDraft } from "./types";

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

export function createNewDynamicTemplateDraft(name = "未命名模板"): TemplateEditorDraft {
  const definition = createBlankDynamicTemplateDefinition(name);
  return {
    format: "dynamic",
    sourceType: "local",
    localDraftId: definition.templateId,
    versionNote: "",
    definition,
  };
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
  options: { asCopy?: boolean; name?: string } = {},
): TemplateEditorDraft {
  const next = structuredClone(draft);
  const name = (options.name ?? next.definition.name).trim();
  if (!name) throw new Error("请先填写模板名称");
  next.definition.name = name;
  if (options.asCopy) {
    next.localDraftId = createDynamicTemplateStableId("tpl");
    next.definition.templateId = next.localDraftId;
  }
  const validation = validateDynamicTemplateDefinition(next.definition);
  const firstError = validation.issues.find((issue) => issue.level === "error");
  if (!validation.valid || !validation.definition) {
    throw new Error(firstError?.message ?? "模板结构校验失败");
  }
  const repository = readRepository();
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

export function importDynamicTemplateDraftJson(source: string): TemplateEditorDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("导入内容不是有效 JSON");
  }
  const validation = validateDynamicTemplateDefinition(parsed);
  if (!validation.valid || !validation.definition) {
    throw new Error(validation.issues.find((issue) => issue.level === "error")?.message ?? "模板结构校验失败");
  }
  const definition = structuredClone(validation.definition);
  definition.templateId = createDynamicTemplateStableId("tpl");
  definition.defaultContent = {};
  definition.previewContent = {};
  return {
    format: "dynamic",
    sourceType: "local",
    localDraftId: definition.templateId,
    versionNote: "",
    definition,
  };
}

export const DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT = "haichuan:dynamic-template-local-draft-changed";
