import {
  getDynamicTemplateNodeRegistryEntry,
  type DynamicTemplateDevice,
  type DynamicTemplateNode,
  type DynamicTemplateNodeType,
  type DynamicTemplateSlotDefinition,
  type DynamicTemplateSlotType,
  type DynamicTemplateValidationIssue,
  type TemplateDefinitionV2,
} from "../template-definition";

export type TemplateInspectorGroup = "definition" | "layout" | "rules";
export type TemplateInspectorFieldAccess = "editable" | "managed" | "read-only";
export type TemplateInspectorObjectScope = "root" | "node" | "slot" | "role";

/** 重验后按问题身份续接：保留当前，否则继续处理原列表中下一条仍存在的问题。 */
export function reconcileTemplatePublishIssueIndex(
  previous: readonly DynamicTemplateValidationIssue[],
  currentIndex: number,
  next: readonly DynamicTemplateValidationIssue[],
): number {
  const find = (candidate: DynamicTemplateValidationIssue) => next.findIndex((issue) => (
    issue.code === candidate.code && issue.path === candidate.path
  ));
  for (const candidate of previous.slice(Math.max(0, currentIndex))) {
    const index = find(candidate);
    if (index >= 0) return index;
  }
  for (const candidate of previous.slice(0, currentIndex).reverse()) {
    const index = find(candidate);
    if (index >= 0) return index;
  }
  return 0;
}

export type TemplateInspectorObjectContext =
  | { scope: "root"; node: DynamicTemplateNode }
  | { scope: "node"; node: DynamicTemplateNode }
  | { scope: "slot"; node: DynamicTemplateNode; slot: DynamicTemplateSlotDefinition }
  | { scope: "role"; node: DynamicTemplateNode; slot: DynamicTemplateSlotDefinition; roleId: string };

export interface TemplateInspectorCapability {
  field: string;
  label: string;
  group: TemplateInspectorGroup;
  access: TemplateInspectorFieldAccess;
  scopes: readonly TemplateInspectorObjectScope[];
  nodeTypes?: readonly DynamicTemplateNodeType[];
  slotTypes?: readonly DynamicTemplateSlotType[];
  reason?: string;
}

const ROOT_SCOPE = ["root"] as const;
const NODE_SCOPES = ["node", "slot"] as const;
const SLOT_SCOPE = ["slot"] as const;
const ROLE_SCOPE = ["role"] as const;

const SEMANTIC_NODE_TYPES = ["Section", "Container", "Grid", "Row", "Column", "Stack"] as const;
const TEXT_SLOT_TYPES = ["heading", "text", "richText", "button", "link", "badge"] as const;
const ACTION_SLOT_TYPES = ["button", "link"] as const;
const MEDIA_SLOT_TYPES = ["image", "video"] as const;
const ITEM_SLOT_TYPES = ["collection"] as const;

const RESPONSIVE_FIELDS = [
  "display", "direction", "order", "width", "height", "maxWidth", "minHeight", "gap",
  "padding", "margin", "alignItems", "justifyContent", "columns", "backgroundToken",
  "borderToken", "radius", "overflow", "layoutMode", "placement",
] as const;
const MEDIA_SLOT_RULE_FIELDS = ["aspectRatio", "objectFit", "objectPosition"] as const;
const TEXT_SLOT_RULE_FIELDS = [
  "fontRole", "fontSize", "fontWeight", "lineHeight", "textAlign", "maxLines", "overflow",
] as const;
const INSTANCE_POLICY_FIELDS = [
  "position", "size", "zIndex", "imageFit", "imageFocus", "typography", "spacing",
  "minWidthPercent", "maxWidthPercent", "maxOffsetPercent", "minFontSizePx",
  "maxFontSizePx", "maxSpacingPx",
] as const;

/**
 * Inspector 的 schema 能力表。它只按根、节点类型和槽位类型分派，不依赖模板名称或目录清单。
 * `managed` 表示只能通过结构/画布/兼容清理命令修改，不能暴露原始 JSON 输入。
 */
export const TEMPLATE_INSPECTOR_CAPABILITIES: readonly TemplateInspectorCapability[] = [
  { field: "schemaVersion", label: "Schema 版本", group: "definition", access: "read-only", scopes: ROOT_SCOPE, reason: "由合同版本固定，不能在 Inspector 中改写。" },
  { field: "templateId", label: "模板标识", group: "definition", access: "read-only", scopes: ROOT_SCOPE, reason: "模板身份只由新建或另存为流程生成。" },
  { field: "name", label: "模板名称", group: "definition", access: "editable", scopes: ROOT_SCOPE },
  { field: "description", label: "模板说明", group: "definition", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.category", label: "分类", group: "definition", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.purpose", label: "用途", group: "definition", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.layoutType", label: "构图类型", group: "definition", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.slotSummary", label: "槽位摘要", group: "rules", access: "managed", scopes: ROOT_SCOPE, reason: "由结构命令根据当前槽位自动汇总。" },
  { field: "metadata.recommendedFor", label: "推荐页面", group: "rules", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.desktopRatio", label: "桌面兼容比例", group: "layout", access: "managed", scopes: ROOT_SCOPE, reason: "由根节点桌面高度规则派生。" },
  { field: "metadata.mobileRatio", label: "移动兼容比例", group: "layout", access: "managed", scopes: ROOT_SCOPE, reason: "由根节点移动高度规则派生。" },
  { field: "metadata.previewDesktopWidth", label: "桌面设计宽度", group: "layout", access: "managed", scopes: ROOT_SCOPE, reason: "由模板画布尺寸控件维护。" },
  { field: "metadata.previewMobileWidth", label: "移动设计宽度", group: "layout", access: "managed", scopes: ROOT_SCOPE, reason: "由模板画布尺寸控件维护。" },
  { field: "metadata.mobileBreakpoint", label: "移动断点", group: "rules", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.minViewportWidth", label: "最小适用宽度", group: "rules", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.maxViewportWidth", label: "最大适用宽度", group: "rules", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.defaultBackgroundToken", label: "默认背景", group: "layout", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.visualRole", label: "页面视觉职责", group: "definition", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.headerCompatibility", label: "导航兼容模式", group: "rules", access: "editable", scopes: ROOT_SCOPE },
  { field: "metadata.tags", label: "标签", group: "rules", access: "editable", scopes: ROOT_SCOPE },
  { field: "rootNodeId", label: "根节点标识", group: "definition", access: "read-only", scopes: ROOT_SCOPE, reason: "根节点由结构模型维护。" },
  { field: "nodes", label: "节点集合", group: "definition", access: "managed", scopes: ROOT_SCOPE, reason: "通过结构命令维护，禁止直接编辑原始映射。" },
  { field: "slots", label: "槽位集合", group: "definition", access: "managed", scopes: ROOT_SCOPE, reason: "请在结构工具中选择父节点与槽位类型。" },
  { field: "defaultContent", label: "历史默认内容", group: "rules", access: "read-only", scopes: ROOT_SCOPE, reason: "只兼容读取；只能用显式兼容清理命令移除。" },
  { field: "previewContent", label: "历史预览内容", group: "rules", access: "read-only", scopes: ROOT_SCOPE, reason: "系统预览在内存生成；旧值只能显式清理。" },
  { field: "nodeId", label: "节点标识", group: "definition", access: "read-only", scopes: NODE_SCOPES, reason: "由结构命令生成并保持稳定。" },
  { field: "type", label: "节点类型", group: "definition", access: "read-only", scopes: NODE_SCOPES, reason: "改变类型会破坏嵌套和槽位合同；请新建正确类型节点。" },
  { field: "node.name", label: "节点名称", group: "definition", access: "editable", scopes: NODE_SCOPES },
  { field: "slotId", label: "节点槽位引用", group: "definition", access: "managed", scopes: SLOT_SCOPE, reason: "由槽位节点结构命令成对维护。" },
  { field: "childIds", label: "子节点顺序", group: "definition", access: "managed", scopes: NODE_SCOPES, reason: "通过移动、排序、复制和删除命令维护。" },
  { field: "props.semanticTag", label: "语义标签", group: "definition", access: "editable", scopes: ["root", ...NODE_SCOPES], nodeTypes: SEMANTIC_NODE_TYPES },
  { field: "props.dividerStyle", label: "分隔线样式", group: "layout", access: "editable", scopes: NODE_SCOPES, nodeTypes: ["Divider"] },
  { field: "props.spacerSize", label: "留白高度", group: "layout", access: "editable", scopes: NODE_SCOPES, nodeTypes: ["Spacer"] },
  { field: "props.contentTemplateLayoutData", label: "合同对象构图", group: "layout", access: "managed", scopes: ["slot", ...ROLE_SCOPE], reason: "由合同角色画布控件和宿主 Overlay 写入，禁止原始 JSON 编辑。" },
  { field: "props.contentTemplateDesignProps", label: "合同设计属性", group: "layout", access: "managed", scopes: SLOT_SCOPE, reason: "由对应槽位类型的受控设计字段写入。" },
  { field: "authoring.structureLocked", label: "结构锁定", group: "rules", access: "editable", scopes: NODE_SCOPES },
  ...INSTANCE_POLICY_FIELDS.map((field) => ({
    field: `instanceEditPolicy.${field}`,
    label: `页面实例权限 ${field}`,
    group: "rules" as const,
    access: "editable" as const,
    scopes: SLOT_SCOPE,
  })),
  ...RESPONSIVE_FIELDS.map((field) => ({
    field: `responsive.*.${field}`,
    label: `响应式 ${field}`,
    group: "layout" as const,
    access: "editable" as const,
    scopes: NODE_SCOPES,
  })),
  { field: "hidden", label: "模板中隐藏", group: "definition", access: "editable", scopes: NODE_SCOPES },
  { field: "slot.slotId", label: "槽位标识", group: "definition", access: "read-only", scopes: SLOT_SCOPE, reason: "由结构命令生成并保持稳定。" },
  { field: "slot.key", label: "槽位键", group: "definition", access: "read-only", scopes: SLOT_SCOPE, reason: "页面实例按稳定键关联内容，不能在 Inspector 中改名。" },
  { field: "slot.type", label: "槽位类型", group: "definition", access: "read-only", scopes: SLOT_SCOPE, reason: "内容类型由槽位节点类型决定。" },
  { field: "slot.label", label: "槽位名称", group: "definition", access: "editable", scopes: SLOT_SCOPE },
  { field: "slot.required", label: "页面必须填写", group: "rules", access: "editable", scopes: SLOT_SCOPE },
  { field: "slot.editable", label: "页面可编辑内容", group: "rules", access: "editable", scopes: SLOT_SCOPE },
  { field: "slot.hideable", label: "页面可隐藏", group: "rules", access: "editable", scopes: SLOT_SCOPE },
  { field: "slot.emptyPolicy", label: "空内容策略", group: "rules", access: "read-only", scopes: SLOT_SCOPE, reason: "新模板固定为空则隐藏；历史 use-default 只能显式清理。" },
  { field: "slot.validation", label: "槽位校验规则", group: "rules", access: "managed", scopes: SLOT_SCOPE, reason: "请在下方各项校验字段中修正，不支持原始对象编辑。" },
  { field: "slot.validation.minLength", label: "最小字数", group: "rules", access: "editable", scopes: SLOT_SCOPE, slotTypes: TEXT_SLOT_TYPES },
  { field: "slot.validation.maxLength", label: "最大字数", group: "rules", access: "editable", scopes: SLOT_SCOPE, slotTypes: TEXT_SLOT_TYPES },
  { field: "slot.validation.minItems", label: "最少项目数", group: "rules", access: "editable", scopes: SLOT_SCOPE, slotTypes: ITEM_SLOT_TYPES },
  { field: "slot.validation.maxItems", label: "最多项目数", group: "rules", access: "editable", scopes: SLOT_SCOPE, slotTypes: ITEM_SLOT_TYPES },
  { field: "slot.validation.recommendedWidth", label: "建议素材宽", group: "rules", access: "editable", scopes: SLOT_SCOPE, slotTypes: MEDIA_SLOT_TYPES },
  { field: "slot.validation.recommendedHeight", label: "建议素材高", group: "rules", access: "editable", scopes: SLOT_SCOPE, slotTypes: MEDIA_SLOT_TYPES },
  { field: "slot.validation.allowedProtocols", label: "允许跳转类型", group: "rules", access: "editable", scopes: SLOT_SCOPE, slotTypes: ACTION_SLOT_TYPES },
  ...MEDIA_SLOT_RULE_FIELDS.map((field) => ({
    field: `slot.*Rules.${field}`,
    label: `槽位响应式样式 ${field}`,
    group: "layout" as const,
    access: "editable" as const,
    scopes: SLOT_SCOPE,
    slotTypes: ["image"] as const,
  })),
  ...TEXT_SLOT_RULE_FIELDS.map((field) => ({
    field: `slot.*Rules.${field}`,
    label: `槽位响应式样式 ${field}`,
    group: "layout" as const,
    access: "editable" as const,
    scopes: SLOT_SCOPE,
    slotTypes: TEXT_SLOT_TYPES,
  })),
] as const;

export function getTemplateInspectorCapabilities(
  context: TemplateInspectorObjectContext,
) {
  return TEMPLATE_INSPECTOR_CAPABILITIES.filter((capability) => {
    if (!capability.scopes.includes(context.scope)) return false;
    if (capability.nodeTypes && !capability.nodeTypes.includes(context.node.type)) return false;
    const slot = context.scope === "slot" || context.scope === "role" ? context.slot : undefined;
    if (capability.slotTypes && (!slot || !capability.slotTypes.includes(slot.type))) return false;
    if (capability.field.startsWith("props.contentTemplate")) {
      return getDynamicTemplateNodeRegistryEntry(context.node.type).kind === "slot";
    }
    return true;
  });
}

export function hasTemplateInspectorCapability(
  capabilities: readonly TemplateInspectorCapability[],
  field: string,
) {
  return capabilities.some((capability) => capability.field === field);
}

/** 分组提示直接消费能力表、当前定义和保存基线，不保留平行字段状态。 */
export function getTemplateInspectorGroupSummary(
  definition: TemplateDefinitionV2,
  baseline: TemplateDefinitionV2 | undefined,
  context: TemplateInspectorObjectContext,
  issues: readonly DynamicTemplateValidationIssue[],
) {
  const summary = {
    definition: { changed: 0, errors: 0 },
    layout: { changed: 0, errors: 0 },
    rules: { changed: 0, errors: 0 },
  };
  const readField = (source: TemplateDefinitionV2 | undefined, field: string) => {
    if (!source) return undefined;
    const node = source.nodes[context.node.nodeId];
    if (context.scope === "role" && field === "props.contentTemplateLayoutData") {
      const data = node?.props.contentTemplateLayoutData as { nodes?: Record<string, unknown> } | undefined;
      return data?.nodes?.[context.roleId];
    }
    const slot = node?.slotId ? source.slots[node.slotId] : undefined;
    const root = field.startsWith("slot.") ? slot
      : field.startsWith("props.") || context.scope !== "root" ? node : source;
    const path = field.startsWith("slot.") || field.startsWith("node.") ? field.slice(5) : field;
    const readPath = (value: unknown, parts: string[]): unknown => {
      if (!parts.length) return value;
      if (!value || typeof value !== "object") return undefined;
      const [part, ...rest] = parts;
      const record = value as Record<string, unknown>;
      if (part === "*" || part === "*Rules") {
        return ["desktop", "mobile"].map((device) => readPath(record[part === "*" ? device : `${device}Rules`], rest));
      }
      return readPath(record[part], rest);
    };
    return readPath(root, path.split("."));
  };
  const capabilities = getTemplateInspectorCapabilities(context);
  for (const capability of capabilities) {
    if (capability.access === "read-only") continue;
    if (capabilities.some((candidate) => candidate.field.startsWith(`${capability.field}.`))) continue;
    if (JSON.stringify(readField(definition, capability.field)) !== JSON.stringify(readField(baseline, capability.field))) {
      summary[capability.group].changed += 1;
    }
  }
  for (const issue of issues) {
    if (issue.level !== "error") continue;
    const target = resolveTemplateInspectorIssueTarget(definition, issue);
    if (target.objectId === context.node.nodeId) summary[target.group].errors += 1;
  }
  return summary;
}

const RESPONSIVE_VALUE_LABELS: Record<string, string> = {
  display: "显示方式", direction: "排列方向", order: "显示顺序", width: "宽度", height: "高度",
  maxWidth: "最大宽度", minHeight: "最小高度", gap: "间距", padding: "内边距", margin: "外边距",
  alignItems: "交叉轴对齐", justifyContent: "主轴对齐", columns: "列比例", backgroundToken: "背景",
  borderToken: "边框", radius: "圆角", overflow: "溢出", layoutMode: "布局方式", placement: "自由位置",
  aspectRatio: "素材比例", objectFit: "素材适配", objectPosition: "素材焦点", fontRole: "字体角色",
  fontSize: "字号", fontWeight: "字重", lineHeight: "行高", textAlign: "文本对齐", maxLines: "最大行数",
  top: "上", right: "右", bottom: "下", left: "左", x: "横向", y: "纵向", zIndex: "层级",
};

function responsiveValueLabel(value: unknown): string {
  if (value === undefined || value === null) return "未设置";
  if (Array.isArray(value)) return value.map(responsiveValueLabel).join(" : ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "number" && typeof record.unit === "string") return `${record.value}${record.unit}`;
    return Object.entries(record).map(([key, entry]) => `${RESPONSIVE_VALUE_LABELS[key] ?? key} ${responsiveValueLabel(entry)}`).join("，");
  }
  return String(value);
}

export function getTemplateResponsiveCopyChanges(
  definition: TemplateDefinitionV2,
  nodeId: string,
  sourceDevice: DynamicTemplateDevice,
  targetDevice: DynamicTemplateDevice,
) {
  const node = definition.nodes[nodeId];
  if (!node) return [];
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const pairs = [{ label: "布局", before: node.responsive[targetDevice], after: node.responsive[sourceDevice] },
    ...(slot ? [{ label: "槽位样式", before: slot[targetDevice === "desktop" ? "desktopRules" : "mobileRules"], after: slot[sourceDevice === "desktop" ? "desktopRules" : "mobileRules"] }] : [])];
  return pairs.flatMap(({ label, before, after }) => {
    const oldValues = before as Record<string, unknown>;
    const newValues = after as Record<string, unknown>;
    return [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
      .filter((key) => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key]))
      .map((key) => ({ field: `${label} · ${RESPONSIVE_VALUE_LABELS[key] ?? key}`, before: responsiveValueLabel(oldValues[key]), after: responsiveValueLabel(newValues[key]) }));
  });
}

export type TemplateResponsiveSource = "shared" | "device-override";

export function getTemplateResponsiveSource(
  definition: TemplateDefinitionV2,
  nodeId: string,
  device: DynamicTemplateDevice,
): TemplateResponsiveSource {
  const node = definition.nodes[nodeId];
  if (!node) return "shared";
  const otherDevice = device === "desktop" ? "mobile" : "desktop";
  const nodeMatches = JSON.stringify(node.responsive[device]) === JSON.stringify(node.responsive[otherDevice]);
  if (!node.slotId) return nodeMatches ? "shared" : "device-override";
  const slot = definition.slots[node.slotId];
  if (!slot) return nodeMatches ? "shared" : "device-override";
  const currentRules = device === "desktop" ? slot.desktopRules : slot.mobileRules;
  const otherRules = device === "desktop" ? slot.mobileRules : slot.desktopRules;
  return nodeMatches && JSON.stringify(currentRules) === JSON.stringify(otherRules)
    ? "shared"
    : "device-override";
}

export interface TemplateInspectorIssueTarget {
  objectId: string;
  group: TemplateInspectorGroup;
  field: string;
  device?: DynamicTemplateDevice;
  destination: "inspector-field" | "structure-region" | "structure-slot" | "unavailable";
  access: TemplateInspectorFieldAccess;
  reason?: string;
}

const ROOT_FIELDS = new Set(TEMPLATE_INSPECTOR_CAPABILITIES
  .filter((capability) => capability.scopes.includes("root"))
  .map((capability) => capability.field));

function canonicalFieldForIssuePath(path: string): string | null {
  if (path === "metadata.description") return "description";
  if (ROOT_FIELDS.has(path)) return path;
  if (path.startsWith("defaultContent.")) return "defaultContent";
  if (path.startsWith("previewContent.")) return "previewContent";

  const nodeMatch = path.match(/^nodes\.([^.]+)(?:\.(.+))?$/);
  if (nodeMatch) {
    const nodePath = nodeMatch[2];
    if (!nodePath) return "nodeId";
    if (nodePath === "name") return "node.name";
    if (["nodeId", "type", "slotId", "childIds", "hidden"].includes(nodePath)) return nodePath;
    if (nodePath === "authoring" || nodePath.startsWith("authoring.")) return "authoring.structureLocked";
    if (nodePath === "instanceEditPolicy") return "instanceEditPolicy.position";
    if (nodePath.startsWith("instanceEditPolicy.")) {
      const policyField = `instanceEditPolicy.${nodePath.split(".")[1]}`;
      return TEMPLATE_INSPECTOR_CAPABILITIES.some((capability) => capability.field === policyField)
        ? policyField
        : null;
    }
    if (nodePath === "props") return "type";
    if (nodePath.startsWith("props.contentTemplateLayoutData")) return "props.contentTemplateLayoutData";
    if (nodePath.startsWith("props.contentTemplateDesignProps")) return "props.contentTemplateDesignProps";
    if (nodePath.startsWith("props.")) {
      const propField = `props.${nodePath.split(".")[1]}`;
      return TEMPLATE_INSPECTOR_CAPABILITIES.some((capability) => capability.field === propField)
        ? propField
        : null;
    }
    const responsiveMatch = nodePath.match(/^responsive\.(desktop|mobile)(?:\.(.+))?$/);
    if (responsiveMatch) {
      if (!responsiveMatch[2]) return "responsive.*.display";
      const responsiveField = responsiveMatch[2].split(".")[0];
      const field = `responsive.*.${responsiveField}`;
      return TEMPLATE_INSPECTOR_CAPABILITIES.some((capability) => capability.field === field)
        ? field
        : null;
    }
    return null;
  }

  const slotMatch = path.match(/^slots\.([^.]+)(?:\.(.+))?$/);
  if (slotMatch) {
    const slotPath = slotMatch[2];
    if (!slotPath) return "slot.slotId";
    if (["slotId", "key", "type", "label", "required", "editable", "hideable", "emptyPolicy"].includes(slotPath)) {
      return `slot.${slotPath}`;
    }
    if (slotPath === "validation") return "slot.validation";
    if (slotPath.startsWith("validation.")) return `slot.validation.${slotPath.split(".")[1]}`;
    const ruleMatch = slotPath.match(/^(desktopRules|mobileRules)(?:\.(.+))?$/);
    if (ruleMatch) {
      const ruleField = ruleMatch[2]?.split(".")[0] ?? "aspectRatio";
      return `slot.*Rules.${ruleField}`;
    }
  }
  return null;
}

function contextForObject(
  definition: TemplateDefinitionV2,
  objectId: string,
): TemplateInspectorObjectContext {
  const node = definition.nodes[objectId] ?? definition.nodes[definition.rootNodeId];
  if (node.nodeId === definition.rootNodeId) return { scope: "root", node };
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  return slot ? { scope: "slot", node, slot } : { scope: "node", node };
}

/** 将校验器的 path/nodeId/slotId 归一为 Inspector 可执行的 object + group + field 协议。 */
export function resolveTemplateInspectorIssueTarget(
  definition: TemplateDefinitionV2,
  issue: DynamicTemplateValidationIssue,
): TemplateInspectorIssueTarget {
  if (issue.code === "PUBLISH_REQUIRES_REGION") {
    return {
      objectId: definition.rootNodeId,
      group: "definition",
      field: "structure.create.region",
      destination: "structure-region",
      access: "managed",
      reason: "需要在结构工具中由用户创建区域并决定后续层级。",
    };
  }
  if (issue.code === "PUBLISH_REQUIRES_SLOT") {
    return {
      objectId: definition.rootNodeId,
      group: "definition",
      field: "structure.create.slot",
      destination: "structure-slot",
      access: "managed",
      reason: "需要在结构工具中由用户选择父节点和内容槽位类型。",
    };
  }
  const nodeIdBySlotId = new Map(Object.values(definition.nodes).flatMap((node) => (
    node.slotId ? [[node.slotId, node.nodeId] as const] : []
  )));
  const rootOwnedPath = issue.path === "description"
    || issue.path === "metadata.description"
    || issue.path.startsWith("metadata")
    || issue.path === "schemaVersion"
    || issue.path === "templateId"
    || issue.path === "name"
    || issue.path === "rootNodeId"
    || issue.path === "nodes"
    || issue.path === "slots"
    || issue.path.startsWith("defaultContent")
    || issue.path.startsWith("previewContent");
  const objectId = rootOwnedPath
    ? definition.rootNodeId
    : issue.nodeId
    ?? (issue.slotId ? nodeIdBySlotId.get(issue.slotId) : undefined)
    ?? definition.rootNodeId;
  const responsiveMatch = issue.path.match(/\.responsive\.(desktop|mobile)\./);
  const slotRulesMatch = issue.path.match(/\.(desktopRules|mobileRules)\./);
  const device = responsiveMatch?.[1] === "desktop" || responsiveMatch?.[1] === "mobile"
    ? responsiveMatch[1]
    : slotRulesMatch?.[1] === "desktopRules"
      ? "desktop"
      : slotRulesMatch?.[1] === "mobileRules"
        ? "mobile"
        : undefined;
  const field = canonicalFieldForIssuePath(issue.path);
  const context = contextForObject(definition, objectId);
  const capability = field
    ? getTemplateInspectorCapabilities(context).find((candidate) => candidate.field === field)
    : undefined;
  if (!field || !capability) {
    return {
      objectId,
      group: "definition",
      field: "unavailable",
      ...(device ? { device } : {}),
      destination: "unavailable",
      access: "managed",
      reason: `当前问题路径 ${issue.path || "(definition)"} 没有可安全直接编辑的 Inspector 字段。`,
    };
  }
  return {
    objectId,
    group: capability.group,
    field,
    ...(device ? { device } : {}),
    destination: "inspector-field",
    access: capability.access,
    ...(capability.reason ? { reason: capability.reason } : {}),
  };
}
