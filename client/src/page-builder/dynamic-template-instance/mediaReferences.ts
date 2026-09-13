import {
  getContentTemplateMediaReferences,
  getContentTemplatePageRule,
  type ContentTemplateMediaReference,
} from "../generated/contentTemplates.generated";
import {
  compileDynamicTemplateRenderPlan,
  type DynamicTemplateRenderPlanNode,
} from "../template-definition/renderPlan";
import type {
  DynamicTemplateSlotType,
  TemplateBreakpoint,
  TemplateDefinitionV2,
} from "../template-definition/generated/templateDefinition.generated";
import { getContentTemplateModuleTypeForSlotType } from "../template-definition/validateTemplateDefinition";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getAtomicSlotMediaReferences(
  slotType: DynamicTemplateSlotType,
  value: unknown,
  slotPath: string,
  slotId: string,
  blockId?: string,
): ContentTemplateMediaReference[] {
  const references: ContentTemplateMediaReference[] = [];
  const add = (candidate: unknown, path: string) => {
    if (!nonEmptyText(candidate)) return;
    references.push({
      url: candidate.trim(),
      path,
      field: slotId,
      ...(blockId ? { blockId } : {}),
      moduleType: DYNAMIC_TEMPLATE_BLOCK_TYPE,
    });
  };

  if (slotType !== "image") return references;
  if (typeof value === "string") {
    add(value, slotPath);
  } else if (isRecord(value)) {
    add(value.src, `${slotPath}.src`);
  }
  return references;
}

function collectReachableSlotIds(
  node: DynamicTemplateRenderPlanNode,
  reachableSlotIds: Set<string>,
) {
  if (node.hidden) return;
  if (node.slotId) reachableSlotIds.add(node.slotId);
  node.children.forEach((child) => collectReachableSlotIds(child, reachableSlotIds));
}

/**
 * 客户前台只展示运营人员在页面实例中明确上传过图片的模板。
 * 母模板默认图和节点背景只负责后台设计/预览，不能让“刚加入但未填写”的模板自动公开。
 */
export function hasExplicitDynamicTemplateInstanceImage(
  definition: TemplateDefinitionV2,
  contentBySlotId: unknown,
  hiddenSlotIds: readonly string[] = [],
): boolean {
  if (!isRecord(contentBySlotId)) return false;
  const reachableSlotIds = new Set<string>();
  const breakpoints: TemplateBreakpoint[] = definition.schemaVersion >= 2
    ? ["desktop", "tablet", "mobile"]
    : ["desktop", "mobile"];

  for (const breakpoint of breakpoints) {
    const result = compileDynamicTemplateRenderPlan(definition, {
      device: breakpoint === "mobile" ? "mobile" : "desktop",
      breakpoint,
      contentBySlotId,
      hiddenSlotIds,
      showEmptySlots: false,
    });
    if (result.ok) collectReachableSlotIds(result.plan.root, reachableSlotIds);
  }

  return [...reachableSlotIds].some((slotId) => {
    if (!Object.prototype.hasOwnProperty.call(contentBySlotId, slotId)) return false;
    const slot = definition.slots[slotId];
    if (!slot) return false;
    const value = contentBySlotId[slotId];
    const moduleType = getContentTemplateModuleTypeForSlotType(slot.type);
    if (moduleType) {
      return getContentTemplateMediaReferences(
        moduleType,
        value,
        `contentBySlotId.${slotId}`,
      ).length > 0;
    }
    return getAtomicSlotMediaReferences(
      slot.type,
      value,
      `contentBySlotId.${slotId}`,
      slotId,
    ).length > 0;
  });
}

/**
 * 提取页面中模板实例实际会公开渲染的媒体。
 * 槽位类型和默认值只认随 PageDocument 注入的精确正式模板版本，不按任意属性名猜测。
 */
export function getDynamicTemplateDocumentMediaReferences(
  puckData: unknown,
  pageKey?: string,
  options: { preserveReferencePaths?: boolean } = {},
): ContentTemplateMediaReference[] {
  if (!isRecord(puckData)) return [];
  const definitions = readResolvedDynamicTemplateDefinitions(
    puckData[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY],
  );
  const references: ContentTemplateMediaReference[] = [];

  const collectBlocks = (blocks: unknown, basePath: string) => {
    if (!Array.isArray(blocks)) return;
    blocks.forEach((block, blockIndex) => {
      if (!isRecord(block) || block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE || !isRecord(block.props)) {
        return;
      }
      const props = block.props;
      if (props.isVisible === false) return;
      const templateId = nonEmptyText(props.templateId) ? props.templateId.trim() : "";
      const templateVersion = typeof props.templateVersion === "number"
        ? props.templateVersion
        : Number.NaN;
      const resolved = definitions[dynamicTemplateVersionKey(templateId, templateVersion)];
      if (!resolved) return;
      const contentBySlotId = isRecord(props.contentBySlotId) ? props.contentBySlotId : {};
      const hiddenSlotIds = Array.isArray(props.hiddenSlotIds)
        ? props.hiddenSlotIds.filter((item): item is string => typeof item === "string")
        : [];
      const breakpoints: TemplateBreakpoint[] = resolved.definition.schemaVersion >= 2 ? ["desktop", "tablet", "mobile"] : ["desktop", "mobile"];
      const plans = breakpoints
        .map((breakpoint) => ({
          breakpoint,
          result: compileDynamicTemplateRenderPlan(resolved.definition, {
            device: breakpoint === "mobile" ? "mobile" : "desktop",
            breakpoint,
            contentBySlotId,
            hiddenSlotIds,
            showEmptySlots: false,
          }),
        }))
        .filter((entry) => entry.result.ok);
      if (plans.length === 0) return;
      const blockPath = `${basePath}[${blockIndex}].props`;
      const blockId = nonEmptyText(props.id) ? props.id.trim() : undefined;

      const visit = (node: DynamicTemplateRenderPlanNode, breakpoint: TemplateBreakpoint) => {
        if (node.hidden) return;
        if (nonEmptyText(node.rules.backgroundImage)) {
          references.push({
            url: node.rules.backgroundImage,
            path: options.preserveReferencePaths
              ? `${blockPath}.templateDefinition.nodes.${node.nodeId}.responsive.${breakpoint}.backgroundImage`
              : `${blockPath}.templateDefinition.nodes.${node.nodeId}.backgroundImage`,
            field: `${node.nodeId}.backgroundImage`,
            ...(blockId ? { blockId } : {}),
            moduleType: DYNAMIC_TEMPLATE_BLOCK_TYPE,
          });
        }
        if (node.slot && node.slotId) {
          const slotPath = `${blockPath}.contentBySlotId.${node.slotId}`;
          const moduleType = getContentTemplateModuleTypeForSlotType(node.slot.type);
          if (moduleType) {
            references.push(...getContentTemplateMediaReferences(
              moduleType,
              node.content,
              slotPath,
            ).map((reference) => ({
              ...reference,
              ...(blockId ? { blockId } : {}),
            })));
          } else {
            references.push(...getAtomicSlotMediaReferences(
              node.slot.type,
              node.content,
              slotPath,
              node.slotId,
              blockId,
            ));
          }
        }
        node.children.forEach((child) => visit(child, breakpoint));
      };
      plans.forEach(({ breakpoint, result }) => {
        if (result.ok) visit(result.plan.root, breakpoint);
      });
    });
  };

  collectBlocks(puckData.content, "content");
  const pageRule = pageKey ? getContentTemplatePageRule(pageKey) : undefined;
  if (pageRule?.contentPlacement !== "root-only" && isRecord(puckData.zones)) {
    Object.entries(puckData.zones).forEach(([zoneKey, blocks]) => {
      collectBlocks(blocks, `zones.${zoneKey}`);
    });
  }

  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = options.preserveReferencePaths
      ? `${reference.path}\u0000${reference.url}`
      : reference.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
