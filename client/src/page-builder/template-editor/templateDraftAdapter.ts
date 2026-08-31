import type { ReactNode } from "react";
import type { PersonalContentTemplate, SystemContentTemplateCurrent } from "@/services/api";
import { puckConfig } from "../config/puckConfig";
import {
  createContentTemplateMarker,
  getContentTemplateContract,
  sanitizeContentTemplateDefaultContent,
  sanitizeContentTemplateLayoutData,
} from "../generated/contentTemplates.generated";
import { getTemplatePreviewContent } from "../preview/templatePreviewContent";
import type { LegacyTemplateSourceDraft, TemplateEditorDevice } from "./types";

type RenderableTemplateComponent = {
  render?: (props: Record<string, unknown>) => ReactNode;
  defaultProps?: Record<string, unknown>;
};

function sanitizePreviewValue(value: unknown): unknown {
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? "" : value;
  if (Array.isArray(value)) return value.map(sanitizePreviewValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, sanitizePreviewValue(nested)]),
    );
  }
  return value;
}

export function createSystemTemplateDraft(
  moduleType: string,
  current?: SystemContentTemplateCurrent | null,
): LegacyTemplateSourceDraft | null {
  const contract = getContentTemplateContract(moduleType);
  const layoutData = sanitizeContentTemplateLayoutData(
    moduleType,
    current?.moduleType === moduleType ? current.layoutData : { version: 2 },
  );
  if (!contract || !layoutData) return null;
  return {
    sourceType: "system",
    systemVersion: current?.moduleType === moduleType ? current.activeVersion : 0,
    moduleType,
    contractKey: contract.key,
    contractVersion: current?.moduleType === moduleType
      ? current.contractVersion
      : contract.version,
    name: current?.displayName?.trim() || contract.displayName,
    layoutData,
    contentDefaults: null,
  };
}

export function createPersonalTemplateDraft(
  template: PersonalContentTemplate,
): LegacyTemplateSourceDraft | null {
  const contract = getContentTemplateContract(template.moduleType);
  const layoutData = sanitizeContentTemplateLayoutData(
    template.moduleType,
    template.layoutData,
  );
  if (!contract || !layoutData) return null;
  const contentDefaults = sanitizeContentTemplateDefaultContent(
    template.moduleType,
    template.contentDefaults,
  );
  return {
    sourceType: "personal",
    personalTemplateId: template.id,
    personalRevision: template.revision,
    moduleType: template.moduleType,
    contractKey: template.contractKey,
    contractVersion: template.contractVersion,
    name: template.name,
    layoutData,
    contentDefaults: null,
    hadLegacyContentDefaults: Boolean(contentDefaults && Object.keys(contentDefaults).length > 0),
  };
}

export function createTemplateRenderProps(
  draft: LegacyTemplateSourceDraft,
  sessionId: string,
  device: TemplateEditorDevice = "desktop",
): Record<string, unknown> | null {
  const contract = getContentTemplateContract(draft.moduleType);
  const component = (
    puckConfig.components as unknown as Record<string, RenderableTemplateComponent | undefined>
  )[draft.moduleType];
  if (!contract || typeof component?.render !== "function") return null;
  return {
    ...(sanitizePreviewValue(component.defaultProps ?? {}) as Record<string, unknown>),
    ...getTemplatePreviewContent(contract.key),
    ...(draft.contentDefaults ?? {}),
    id: `template-editor:${sessionId}`,
    editMode: true,
    __editorViewport: device,
    __contentTemplate: createContentTemplateMarker(draft.moduleType),
    __instanceOverrides: draft.layoutData,
  };
}
