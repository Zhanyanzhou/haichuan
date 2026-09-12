import { CONTENT_TEMPLATE_BY_MODULE_TYPE } from "../generated/contentTemplates.generated";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
  type ResolvedDynamicTemplateDefinitionMap,
} from "../dynamic-template-instance/types";

interface PageBlockLike {
  type?: string;
  props?: Record<string, unknown>;
}

function asPageBlock(value: unknown): PageBlockLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as PageBlockLike;
}

function getDocumentResolvedDefinitions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const document = value as Record<string, unknown>;
  return readResolvedDynamicTemplateDefinitions(
    document[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY],
  );
}

function getPageDocumentBlocks(document: Record<string, unknown>) {
  const content = Array.isArray(document.content) ? document.content : [];
  const zoneBlocks = document.zones && typeof document.zones === "object" && !Array.isArray(document.zones)
    ? Object.values(document.zones as Record<string, unknown>).flatMap((blocks) => (
        Array.isArray(blocks) ? blocks : []
      ))
    : [];
  return [...content, ...zoneBlocks];
}

/** 固定模板与动态母模板共用的主舞台角色判定，用于标题、加载优先级和导航兼容。 */
export function isVisiblePrimaryStageBlock(
  value: unknown,
  resolvedDefinitions: ResolvedDynamicTemplateDefinitionMap,
) {
  const block = asPageBlock(value);
  if (!block || block.props?.isVisible === false) return false;
  if (CONTENT_TEMPLATE_BY_MODULE_TYPE[block.type ?? ""]?.visualRole === "primary-stage") {
    return true;
  }
  if (block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE) return false;

  const templateId = typeof block.props?.templateId === "string"
    ? block.props.templateId
    : "";
  const templateVersion = Number(block.props?.templateVersion);
  const resolved = resolvedDefinitions[
    dynamicTemplateVersionKey(templateId, templateVersion)
  ];
  return resolved?.definition.metadata.visualRole === "primary-stage";
}

export function isVisiblePrimaryStageBlockInDocument(value: unknown, document: unknown) {
  return isVisiblePrimaryStageBlock(value, getDocumentResolvedDefinitions(document));
}

export function hasVisiblePrimaryStage(
  documentValue: unknown,
  resolvedDefinitionsOverride?: ResolvedDynamicTemplateDefinitionMap,
) {
  if (!documentValue || typeof documentValue !== "object" || Array.isArray(documentValue)) {
    return false;
  }
  const document = documentValue as Record<string, unknown>;
  const resolvedDefinitions = {
    ...getDocumentResolvedDefinitions(document),
    ...(resolvedDefinitionsOverride ?? {}),
  };
  return getPageDocumentBlocks(document).some((block) => (
    isVisiblePrimaryStageBlock(block, resolvedDefinitions)
  ));
}
