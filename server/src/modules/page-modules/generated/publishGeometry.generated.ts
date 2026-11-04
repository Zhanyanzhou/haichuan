/** 自动生成，禁止手改。来源：client/src/page-builder/template-definition/publishGeometry.ts */
import type { TemplateDefinitionV2 } from "./templateDefinition.generated";
import {
  creationGridLeadSpanId,
  isMobileWorkUnit,
  type MobileWorkNode,
} from "./mobileWorkGrid.generated";
import {
  resolveTemplateNodeRules,
  resolveTemplateSlotRules,
  TEMPLATE_CONTENT_BREAKPOINTS,
  type TemplateContentBreakpoint,
} from "./templateResponsive.generated";
import type { DynamicTemplateValidationIssue } from "./validateTemplateDefinition.generated";

const TEXT_SLOT_TYPES = new Set(["heading", "text", "richText", "button", "link"]);

function lengthPx(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const length = value as { value?: unknown; unit?: unknown };
  if (length.unit !== "px" || typeof length.value !== "number" || !Number.isFinite(length.value)) return null;
  return length.value;
}

function deviceLabel(device: TemplateContentBreakpoint): string {
  return device === "desktop" ? "桌面" : "手机";
}

function previewWidth(definition: TemplateDefinitionV2, device: TemplateContentBreakpoint): number {
  return device === "desktop"
    ? definition.metadata.previewDesktopWidth ?? 1920
    : definition.metadata.previewMobileWidth ?? 390;
}

function toWorkNode(definition: TemplateDefinitionV2, nodeId: string): MobileWorkNode | null {
  const node = definition.nodes[nodeId];
  if (!node) return null;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  return {
    nodeId: node.nodeId,
    type: node.type,
    hidden: node.hidden,
    slot: slot ? { type: slot.type, semanticRole: slot.semanticRole } : undefined,
    children: node.childIds.flatMap((childId) => {
      const child = toWorkNode(definition, childId);
      return child ? [child] : [];
    }),
  };
}

/**
 * 发布前的几何提醒。全部是 warning：自由叠放和装饰叠放不阻断发布。
 * 不改已存定义，也不另做一套渲染。
 */
export function collectTemplatePublishGeometryIssues(
  definition: TemplateDefinitionV2,
): DynamicTemplateValidationIssue[] {
  const issues: DynamicTemplateValidationIssue[] = [];
  const sectionRole = definition.metadata.sectionRole;
  const warn = (issue: Omit<DynamicTemplateValidationIssue, "level">) => {
    issues.push({ level: "warning", ...issue });
  };

  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (node.hidden) continue;
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    for (const device of TEMPLATE_CONTENT_BREAKPOINTS) {
      const rules = resolveTemplateNodeRules(definition, nodeId, device);
      if (rules.display === "none" || rules.hidden) continue;
      const width = previewWidth(definition, device);
      const fixedWidth = typeof rules.width === "object" ? lengthPx(rules.width) : null;
      const minWidth = lengthPx(rules.minWidth);
      const overflowPx = Math.max(fixedWidth ?? 0, minWidth ?? 0);
      if (overflowPx > width + 1) {
        warn({
          code: "PUBLISH_GEOMETRY_HORIZONTAL_OVERFLOW",
          path: `nodes.${nodeId}.responsive.${device}.width`,
          nodeId,
          slotId: slot?.slotId,
          message: `“${node.name}”在${deviceLabel(device)}的固定宽度 ${Math.round(overflowPx)}px 超过预览宽 ${width}px，可能横向溢出。`,
        });
      }
      if (rules.layoutMode === "free") {
        warn({
          code: "PUBLISH_GEOMETRY_FREE_LAYOUT",
          path: `nodes.${nodeId}.responsive.${device}.layoutMode`,
          nodeId,
          message: `“${node.name}”在${deviceLabel(device)}使用自由叠放，不会随宽度重排。此提醒不阻断发布。`,
        });
      }
      if (rules.placement && rules.placement.zIndex > 0) {
        warn({
          code: "PUBLISH_GEOMETRY_DECORATIVE_OVERLAY",
          path: `nodes.${nodeId}.responsive.${device}.placement`,
          nodeId,
          slotId: slot?.slotId,
          message: `“${node.name}”在${deviceLabel(device)}叠在其他内容之上。此提醒不阻断发布。`,
        });
      }
      if (slot && TEXT_SLOT_TYPES.has(slot.type) && (rules.overflow === "hidden" || rules.overflow === "clip")) {
        const height = rules.height.mode === "fixed" ? lengthPx(rules.height.value) : null;
        const slotRules = resolveTemplateSlotRules(definition, slot.slotId, device);
        const fontSize = lengthPx(slotRules.fontSize);
        const lineHeight = typeof slotRules.lineHeight === "number" && slotRules.lineHeight > 0
          ? slotRules.lineHeight
          : 1.2;
        if (height !== null && fontSize !== null && height + 1 < fontSize * lineHeight) {
          warn({
            code: "PUBLISH_GEOMETRY_TEXT_CLIPPED",
            path: `nodes.${nodeId}.responsive.${device}.height`,
            nodeId,
            slotId: slot.slotId,
            message: `“${slot.label}”在${deviceLabel(device)}的固定高度装不下一行文字，会被裁掉。`,
          });
        }
      }
      if (device === "mobile" && node.type === "Grid" && rules.display === "grid") {
        const children = node.childIds.flatMap((childId) => {
          const child = toWorkNode(definition, childId);
          return child ? [child] : [];
        });
        const columnCount = rules.columns?.length ?? 0;
        const lead = creationGridLeadSpanId(children, {
          device,
          sectionRole,
          layoutMode: rules.layoutMode,
          display: rules.display,
          columnCount,
        });
        const visible = children.filter((child) => !child.hidden);
        const units = visible.filter((child) => isMobileWorkUnit(child, sectionRole));
        const orphan = !lead
          && columnCount >= 2
          && units.length >= 1
          && units.length === visible.length
          && units.length % columnCount === 1;
        if (orphan) {
          warn({
            code: "PUBLISH_GEOMETRY_ODD_WORK_ORPHAN",
            path: `nodes.${nodeId}.responsive.mobile.columns`,
            nodeId,
            message: `“${node.name}”在手机上有 ${units.length} 张作品，按 ${columnCount} 列会留下单独一张。`,
          });
        }
      }
      if (slot?.type === "image") {
        const slotRules = resolveTemplateSlotRules(definition, slot.slotId, device);
        if (!slotRules.aspectRatio && rules.height.mode === "auto") {
          warn({
            code: "PUBLISH_GEOMETRY_MISSING_IMAGE",
            path: `slots.${slot.slotId}.${device === "mobile" ? "mobileRules" : "desktopRules"}.aspectRatio`,
            nodeId,
            slotId: slot.slotId,
            message: `“${slot.label}”在${deviceLabel(device)}没有图片比例，高度也无法确定。`,
          });
        }
      }
    }
  }

  for (const slot of Object.values(definition.slots)) {
    if (slot.type !== "button" && slot.type !== "link") continue;
    const content = definition.defaultContent?.[slot.slotId];
    if (!content || typeof content !== "object") continue;
    const action = content as { targetType?: unknown; href?: unknown; linkUrl?: unknown };
    const linked = (typeof action.targetType === "string" && action.targetType !== "" && action.targetType !== "none")
      || (typeof action.href === "string" && action.href.trim().length > 0)
      || (typeof action.linkUrl === "string" && action.linkUrl.trim().length > 0);
    if (linked) continue;
    const nodeId = Object.values(definition.nodes).find((node) => node.slotId === slot.slotId)?.nodeId;
    warn({
      code: "PUBLISH_GEOMETRY_UNLINKED_ACTION",
      path: `defaultContent.${slot.slotId}`,
      nodeId,
      slotId: slot.slotId,
      message: `“${slot.label}”还没有链接目标。`,
    });
  }

  return issues;
}
