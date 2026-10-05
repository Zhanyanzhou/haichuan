import {
  compileDynamicTemplateRenderPlan,
  type CompileDynamicTemplateRenderPlanOptions,
} from "../template-definition/renderPlan";
import type {
  TemplateBreakpoint,
  TemplateDefinitionV2,
} from "../template-definition/generated/templateDefinition.generated";
import {
  isBrandNarrativePage,
  isCommercialSemanticRole,
} from "./publicationPromise";

export interface DynamicTemplatePublicSurface {
  omitDefaultImages: true;
  suppressedSemanticRoles: string[];
}

export interface DynamicTemplatePublicNotice {
  message: string;
}

export interface DynamicTemplatePublicVisibility {
  visible: boolean;
  summary: string;
  detail: string;
  notices: DynamicTemplatePublicNotice[];
  publicSurface: DynamicTemplatePublicSurface;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExplicitImageValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (!isRecord(value)) return false;
  return typeof value.src === "string" && value.src.trim().length > 0;
}

function hasBoundBusinessObject(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasBoundBusinessObject);
  if (!isRecord(value)) return false;
  const code = value.productCode ?? value.code ?? value.id ?? value.slug;
  if (typeof code === "string" && code.trim().length > 0) return true;
  return Object.values(value).some(hasBoundBusinessObject);
}

function contentRecord(contentBySlotId: unknown): Record<string, unknown> {
  return isRecord(contentBySlotId) ? contentBySlotId : {};
}

export function dynamicTemplateHasBoundBusinessObject(
  definition: TemplateDefinitionV2,
  contentBySlotId: unknown,
): boolean {
  const content = contentRecord(contentBySlotId);
  return Object.values(definition.slots).some((slot) => (
    (slot.type === "product" || slot.type === "collection")
    && Object.prototype.hasOwnProperty.call(content, slot.slotId)
    && hasBoundBusinessObject(content[slot.slotId])
  ));
}

export function buildDynamicTemplatePublicSurface(
  definition: TemplateDefinitionV2,
  contentBySlotId: unknown,
  pageKey?: string,
): DynamicTemplatePublicSurface {
  const suppressCommercial = isBrandNarrativePage(pageKey)
    || !dynamicTemplateHasBoundBusinessObject(definition, contentBySlotId);
  const suppressedSemanticRoles = suppressCommercial
    ? Object.values(definition.slots).flatMap((slot) => (
      isCommercialSemanticRole(slot.semanticRole) && slot.semanticRole ? [slot.semanticRole] : []
    ))
    : [];
  return {
    omitDefaultImages: true,
    suppressedSemanticRoles: [...new Set(suppressedSemanticRoles)],
  };
}

function isNodeStructurallyHidden(
  definition: TemplateDefinitionV2,
  nodeId: string,
  breakpoint: TemplateBreakpoint,
  hiddenSlotIds: ReadonlySet<string>,
): boolean {
  const seen = new Set<string>();
  const parentByNodeId = new Map<string, string>();
  for (const [parentId, parent] of Object.entries(definition.nodes)) {
    parent.childIds.forEach((childId) => parentByNodeId.set(childId, parentId));
  }
  let current: string | undefined = nodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = definition.nodes[current];
    if (!node) return true;
    if (node.hidden) return true;
    if (node.slotId && hiddenSlotIds.has(node.slotId)) return true;
    const rules = node.responsive?.[breakpoint];
    if (rules?.hidden || rules?.display === "none") return true;
    current = parentByNodeId.get(current);
  }
  return false;
}

function planHasVisibleSlot(node: { hidden: boolean; slotId?: string; children: readonly unknown[] }): boolean {
  if (!node.hidden && node.slotId) return true;
  return node.children.some((child) => planHasVisibleSlot(child as {
    hidden: boolean;
    slotId?: string;
    children: readonly unknown[];
  }));
}

export function resolveDynamicTemplatePublicVisibility(input: {
  definition: TemplateDefinitionV2;
  contentBySlotId: unknown;
  hiddenSlotIds?: readonly string[];
  breakpoint: TemplateBreakpoint;
  pageKey?: string;
}): DynamicTemplatePublicVisibility {
  const hiddenSlotIds = new Set(input.hiddenSlotIds ?? []);
  const content = contentRecord(input.contentBySlotId);
  const publicSurface = buildDynamicTemplatePublicSurface(
    input.definition,
    content,
    input.pageKey,
  );
  const notices: DynamicTemplatePublicNotice[] = [];
  const bound = dynamicTemplateHasBoundBusinessObject(input.definition, content);
  const narrative = isBrandNarrativePage(input.pageKey);

  for (const slot of Object.values(input.definition.slots)) {
    if (!isCommercialSemanticRole(slot.semanticRole)) continue;
    const nodeId = Object.values(input.definition.nodes).find((node) => node.slotId === slot.slotId)?.nodeId;
    if (nodeId && isNodeStructurallyHidden(input.definition, nodeId, input.breakpoint, hiddenSlotIds)) continue;
    if (narrative) {
      notices.push({
        message: `“${slot.label}”在品牌叙事页不会公开。价格、原价、折扣和优惠只在选款中心绑定商品后展示。`,
      });
    } else if (!bound) {
      notices.push({
        message: slot.required
          ? `“${slot.label}”必须先绑定商品。模板里的价格文字不能公开。`
          : `“${slot.label}”尚未绑定商品，公开页面不会展示该价格。`,
      });
    }
  }

  const requiredImageGap = Object.values(input.definition.slots).find((slot) => {
    if (slot.type !== "image" || !slot.required) return false;
    const node = Object.values(input.definition.nodes).find((candidate) => candidate.slotId === slot.slotId);
    if (!node || isNodeStructurallyHidden(input.definition, node.nodeId, input.breakpoint, hiddenSlotIds)) {
      return false;
    }
    const hasPageValue = Object.prototype.hasOwnProperty.call(content, slot.slotId);
    return !hasPageValue || !hasExplicitImageValue(content[slot.slotId]);
  });
  if (requiredImageGap) {
    return {
      visible: false,
      summary: "前台不会显示",
      detail: `“${requiredImageGap.label}”是这个区块成立的前提，当前设备还没有页面图片。模板默认图不会代替。`,
      notices,
      publicSurface,
    };
  }

  for (const slot of Object.values(input.definition.slots)) {
    if (slot.type !== "image" || slot.required) continue;
    const node = Object.values(input.definition.nodes).find((candidate) => candidate.slotId === slot.slotId);
    if (!node || isNodeStructurallyHidden(input.definition, node.nodeId, input.breakpoint, hiddenSlotIds)) continue;
    const hasPageValue = Object.prototype.hasOwnProperty.call(content, slot.slotId);
    if (hasPageValue && hasExplicitImageValue(content[slot.slotId])) continue;
    notices.push({
      message: `“${slot.label}”没有页面图片，公开时会收起图片区并保留有效文字。`,
    });
  }

  const compiled = compileDynamicTemplateRenderPlan(input.definition, {
    device: input.breakpoint === "mobile" ? "mobile" : "desktop",
    breakpoint: input.breakpoint,
    contentBySlotId: content,
    hiddenSlotIds: [...hiddenSlotIds],
    showEmptySlots: false,
    publicSurface,
  } satisfies CompileDynamicTemplateRenderPlanOptions);
  const visible = compiled.ok && planHasVisibleSlot(compiled.plan.root);
  if (!visible) {
    return {
      visible: false,
      summary: "前台不会显示",
      detail: "当前设备没有可公开的文字、按钮或页面图片。模板默认图和系统示例不会显示。",
      notices,
      publicSurface,
    };
  }
  return {
    visible: true,
    summary: "可以公开",
    detail: notices[0]?.message
      ?? "保存只保留草稿。点击页面“发布”后，前台才会显示或更新。",
    notices,
    publicSurface,
  };
}

export function isDynamicTemplateInstancePubliclyVisible(input: {
  definition: TemplateDefinitionV2;
  contentBySlotId: unknown;
  hiddenSlotIds?: readonly string[];
  breakpoint?: TemplateBreakpoint;
  pageKey?: string;
}): boolean {
  const breakpoints: TemplateBreakpoint[] = input.breakpoint
    ? [input.breakpoint]
    : ["desktop", "mobile"];
  return breakpoints.some((breakpoint) => resolveDynamicTemplatePublicVisibility({
    ...input,
    breakpoint,
  }).visible);
}
