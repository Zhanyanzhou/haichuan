import type { ContentTemplateInstanceOverridesV2 } from "../generated/contentTemplates.generated";
import type { TemplateDefinitionV2 } from "../template-definition";

export type EditorWorkspaceMode = "page" | "template";
type TemplateDraftSourceType = "system" | "personal";
export type TemplateEditorDevice = "desktop" | "mobile";
export type TemplateEditorContentLayer = "default" | "preview";
export type TemplateSaveStatus =
  | "idle"
  | "saving"
  | "success"
  | "error"
  | "conflict"
  | "publish-error"
  | "publish-success";
export type DynamicTemplatePreviewScenario = "default" | "empty" | "long-text" | "missing-image";

/** 旧系统/个人模板的只读适配输入；不得进入模板编辑会话。 */
export interface LegacyTemplateSourceDraft {
  sourceType: TemplateDraftSourceType;
  personalTemplateId?: number;
  personalRevision?: number;
  systemVersion?: number;
  moduleType: string;
  contractKey: string;
  contractVersion: number;
  name: string;
  layoutData: ContentTemplateInstanceOverridesV2;
  contentDefaults: Record<string, unknown> | null;
  /** 旧记录是否曾携带真实默认内容；仅用于在用户主动覆盖时给出清除提示。 */
  hadLegacyContentDefaults?: boolean;
}

export interface TemplateEditorDraft {
  format: "dynamic";
  sourceType: "local" | "persisted";
  localDraftId: string;
  versionNote: string;
  sourceReference?: string;
  /**
   * 旧草稿被读取时，客户端已按当前根尺寸合同做了无损归一化。
   * 即使操作者没有继续修改，发布前也必须先把该归一化草稿写回服务端。
   */
  requiresContractNormalization?: boolean;
  definition: TemplateDefinitionV2;
  remote?: {
    databaseId: number;
    revision: number;
    publishedVersion: number;
    baseVersion: number | null;
    sourceType: "SYSTEM" | "CUSTOM";
    status: "ACTIVE" | "ARCHIVED";
    canDelete: boolean;
    deleteBlockers: Array<{ code: string; message: string }>;
  };
}
