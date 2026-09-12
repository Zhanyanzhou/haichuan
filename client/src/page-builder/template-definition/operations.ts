import {
  getDynamicTemplateNodeRegistryEntry,
  isDynamicTemplateNodeType,
  type TemplateDefinitionV2,
  type DynamicTemplateDevice,
  type DynamicTemplateNode,
  type DynamicTemplateNodeType,
  type DynamicTemplateResponsiveRules,
  type DynamicTemplateSlotDefinition,
  type DynamicTemplateSlotRules,
  type DynamicTemplatePlacement,
  type DynamicTemplateHeightRule,
} from "./generated/templateDefinition.generated";
import {
  canNestDynamicTemplateNode,
  createDynamicTemplateNode,
  createDynamicTemplateSlotDefinition,
} from "./nodeRegistry";
import {
  getDynamicTemplateStructureLockOwnerId,
  getDynamicTemplateStructureLockViolation,
  isDynamicTemplateStructureLocked,
  validateDynamicTemplateDefinition,
  getContentTemplateModuleTypeForSlotType,
} from "./validateTemplateDefinition";
import {
  getContentTemplateContract,
  getContentTemplateDefaultRect,
  sanitizeContentTemplateLayoutData,
} from "../generated/contentTemplates.generated";
import {
  isVisualRecord,
  resolveVisualNode,
  setVisualOverridePath,
  type EffectiveVisualNode,
  type VisualRect,
} from "../runtime/visualLayout";
import {
  resolveTemplateNodeRules,
  resolveTemplateSlotRules,
  resolveTemplateDefinitionForBreakpoint,
  setTemplateNodeRule,
  resetTemplateNodeRule,
  setTemplateSlotRule,
  resetTemplateSlotRule,
  type TemplateBreakpoint,
  type ResolvedTemplateDefinition,
} from "./responsive";

function removeOptionalNodeRule(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint, path: string) {
  if (definition.schemaVersion >= 2 && breakpoint !== "desktop") {
    const local = definition.nodes[nodeId].responsive[breakpoint] as Record<string, unknown> | undefined;
    if (!local || !Object.prototype.hasOwnProperty.call(local, path.split(".")[0])) return;
    resetTemplateNodeRule(definition, nodeId, breakpoint, path);
    return;
  }
  const rules = definition.nodes[nodeId].responsive[breakpoint] as unknown as Record<string, unknown>;
  const [key, member] = path.split(".");
  if (member && isVisualRecord(rules[key])) delete rules[key][member];
  else delete rules[key];
}

function removeOptionalSlotRule(definition: TemplateDefinitionV2, slotId: string, breakpoint: TemplateBreakpoint, path: string) {
  if (definition.schemaVersion >= 2 && breakpoint !== "desktop") {
    resetTemplateSlotRule(definition, slotId, breakpoint, path);
    return;
  }
  const slot = definition.slots[slotId];
  const rules = slot[breakpoint === "mobile" ? "mobileRules" : "desktopRules"] as Record<string, unknown>;
  delete rules[path];
}

function clearPositionRule(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint, path: "anchor" | "placement") {
  if (definition.schemaVersion >= 2 && breakpoint !== "desktop") setTemplateNodeRule(definition, nodeId, breakpoint, path, null);
  else removeOptionalNodeRule(definition, nodeId, breakpoint, path);
}

function applyResponsiveRuleDifferences(
  before: object,
  after: object,
  write: (path: string, value: unknown) => void,
) {
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (isDeterministicDeepEqual(left[key], right[key])) continue;
    if (["padding", "margin", "placement"].includes(key) && isVisualRecord(left[key]) && isVisualRecord(right[key])) {
      const oldGroup = left[key];
      const newGroup = right[key];
      for (const member of new Set([...Object.keys(oldGroup), ...Object.keys(newGroup)])) {
        if (!isDeterministicDeepEqual(oldGroup[member], newGroup[member])) write(`${key}.${member}`, newGroup[member]);
      }
    } else write(key, right[key]);
  }
}

/**
 * 旧字段回调只在完整只读投影的克隆上运行；最终仅回写显式改变的字段。
 * 未改变的字段保留原始覆盖来源，不能把有效值展开后整体写回 sparse 定义。
 */
export function adaptLegacyResponsiveUpdate(
  definition: TemplateDefinitionV2,
  breakpoint: TemplateBreakpoint,
  update: (projected: ResolvedTemplateDefinition) => void,
): TemplateDefinitionV2 {
  if (definition.schemaVersion === 1) {
    if (breakpoint === "tablet") throw new DynamicTemplateOperationError("LEGACY_TABLET_UNSUPPORTED", "旧模板没有平板覆盖。");
    const next = cloneDefinition(definition);
    // v1 合同仍保证 desktop/mobile 完整；不能投影成同一端后改写另一端。
    update(next as ResolvedTemplateDefinition);
    return next;
  }
  const before = resolveTemplateDefinitionForBreakpoint(definition, breakpoint);
  const after = structuredClone(before);
  update(after);
  const next = cloneDefinition(definition);
  const copyChanged = (target: object, previous: object, changed: object, skip: readonly string[]) => {
    const dest = target as Record<string, unknown>;
    const left = previous as Record<string, unknown>;
    const right = changed as Record<string, unknown>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (skip.includes(key) || isDeterministicDeepEqual(left[key], right[key])) continue;
      if (right[key] === undefined) delete dest[key];
      else dest[key] = structuredClone(right[key]);
    }
  };
  copyChanged(next, before, after, ["nodes", "slots"]);
  for (const nodeId of new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)])) {
    if (!after.nodes[nodeId]) { delete next.nodes[nodeId]; continue; }
    if (!before.nodes[nodeId]) {
      next.nodes[nodeId] = structuredClone(after.nodes[nodeId]);
      next.nodes[nodeId].responsive.mobile = {};
      delete next.nodes[nodeId].responsive.tablet;
      continue;
    }
    copyChanged(next.nodes[nodeId], before.nodes[nodeId], after.nodes[nodeId], ["responsive"]);
    for (const lane of ["desktop", "mobile"] as const) {
      applyResponsiveRuleDifferences(before.nodes[nodeId].responsive[lane], after.nodes[nodeId].responsive[lane], (path, value) => {
        if (value === undefined) removeOptionalNodeRule(next, nodeId, breakpoint, path);
        else setTemplateNodeRule(next, nodeId, breakpoint, path, value);
      });
    }
  }
  for (const slotId of new Set([...Object.keys(before.slots), ...Object.keys(after.slots)])) {
    if (!after.slots[slotId]) { delete next.slots[slotId]; continue; }
    if (!before.slots[slotId]) {
      next.slots[slotId] = structuredClone(after.slots[slotId]);
      next.slots[slotId].mobileRules = {};
      delete next.slots[slotId].tabletRules;
      continue;
    }
    copyChanged(next.slots[slotId], before.slots[slotId], after.slots[slotId], ["desktopRules", "mobileRules", "tabletRules"]);
    for (const lane of ["desktopRules", "mobileRules"] as const) {
      applyResponsiveRuleDifferences(before.slots[slotId][lane], after.slots[slotId][lane], (path, value) => {
        if (value === undefined) removeOptionalSlotRule(next, slotId, breakpoint, path);
        else setTemplateSlotRule(next, slotId, breakpoint, path, value);
      });
    }
  }
  return next;
}

type ContractRoleTypography = NonNullable<EffectiveVisualNode["typography"]>;
type ContractRoleTypographyField = keyof ContractRoleTypography;

export type ContractRoleDesignField =
  | "rect"
  | "zIndex"
  | "focus"
  | `typography.${ContractRoleTypographyField}`;

const CONTRACT_ROLE_TYPOGRAPHY_SIZE_PRESETS: Record<
  NonNullable<ContractRoleTypography["sizeLevel"]>,
  "small" | "standard" | "large"
> = {
  xs: "small",
  sm: "small",
  md: "standard",
  lg: "large",
  xl: "large",
};

const CONTRACT_ROLE_TYPOGRAPHY_COLORS: Record<string, readonly string[]> = {
  ink: ["#181A1B", "#222222"],
  mineral: ["#5F6568", "#66645F"],
  ivory: ["#FFFFFF", "#F7F8F8", "#FCFCFB", "#F8F7F4"],
};

function resolveContractRoleDefaultZIndex(
  contract: NonNullable<ReturnType<typeof getContentTemplateContract>>,
  roleId: string,
  device: DynamicTemplateDevice,
) {
  const zones = contract.defaultGeometryByViewport[device].zones;
  const direct = zones.filter((zone) => zone.nodeId === roleId);
  const matching = direct.length > 0 ? direct : zones.filter((zone) => zone.roleId === roleId);
  const values = [...new Set(matching.map((zone) => zone.overlay ? 4 : 2))];
  if (values.length <= 1) return { value: values[0] };
  return {
    value: undefined,
    reason: `“${roleId}”在${device === "desktop" ? "桌面端" : "移动端"}的重复合同区域层级不一致，不能复制单一对象层级。`,
  };
}

/** 与 Renderer/Inspector 相同的角色有效值：显式 override 优先，合同几何为回退。 */
export function getEffectiveContractRoleDesignValue(
  definition: TemplateDefinitionV2, nodeId: string, roleId: string,
  device: DynamicTemplateDevice, field: "rect",
): VisualRect | undefined;
export function getEffectiveContractRoleDesignValue(
  definition: TemplateDefinitionV2, nodeId: string, roleId: string,
  device: DynamicTemplateDevice, field: "zIndex",
): number | undefined;
export function getEffectiveContractRoleDesignValue(
  definition: TemplateDefinitionV2, nodeId: string, roleId: string,
  device: DynamicTemplateDevice, field: "focus",
): { x: number; y: number } | undefined;
export function getEffectiveContractRoleDesignValue(
  definition: TemplateDefinitionV2, nodeId: string, roleId: string,
  device: DynamicTemplateDevice, field: `typography.${ContractRoleTypographyField}`,
): string | number | undefined;
export function getEffectiveContractRoleDesignValue(
  definition: TemplateDefinitionV2, nodeId: string, roleId: string,
  device: DynamicTemplateDevice, field: ContractRoleDesignField,
): VisualRect | number | string | { x: number; y: number } | undefined;
export function getEffectiveContractRoleDesignValue(
  definition: TemplateDefinitionV2,
  nodeId: string,
  roleId: string,
  device: DynamicTemplateDevice,
  field: ContractRoleDesignField,
) {
  const node = definition.nodes[nodeId];
  const slot = node?.slotId ? definition.slots[node.slotId] : undefined;
  const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
  const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
  if (!node || !contract) return undefined;
  const explicit = resolveVisualNode({
    __instanceOverrides: node.props.contentTemplateLayoutData,
  }, roleId, device);
  if (field === "rect") {
    return explicit.rect ?? getContentTemplateDefaultRect(contract.moduleType, roleId, device);
  }
  if (field === "zIndex") {
    if (explicit.zIndex !== undefined) return explicit.zIndex;
    return resolveContractRoleDefaultZIndex(contract, roleId, device).value;
  }
  if (field === "focus") return explicit.focus ?? { x: 50, y: 50 };
  const typographyField = field.slice("typography.".length) as ContractRoleTypographyField;
  return explicit.typography?.[typographyField];
}

function contractRoleFields(context: TemplateInspectorDesignFieldContext): TemplateInspectorDesignFieldDescriptor[] {
  const moduleType = context.slot ? getContentTemplateModuleTypeForSlotType(context.slot.type) : undefined;
  const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
  const role = contract?.editorCapabilities.editableObjects.find((candidate) => candidate.roleId === context.roleId);
  const definition = contract?.roles.find((candidate) => candidate.id === context.roleId);
  if (!role || (definition?.appliesTo?.length && !definition.appliesTo.includes(context.device))) return [];
  const fields: TemplateInspectorDesignFieldDescriptor[] = [];
  const add = (
    field: string,
    label: string,
    effectiveField: ContractRoleDesignField,
    path: string[],
    options: {
      valueScope?: TemplateInspectorValueScope;
      copyGroup?: DynamicTemplateResponsiveGroup;
      normalizeValue?: (value: unknown) => unknown;
    } = {},
  ) => fields.push({
    field,
    label,
    valueScope: options.valueScope ?? "device",
    ...(options.copyGroup === undefined && options.valueScope === "shared"
      ? {}
      : { copyGroup: options.copyGroup ?? "contract-composition-media" }),
    isApplicable: () => true,
    readValue: ({ definition: source, node, device }) => getEffectiveContractRoleDesignValue(
      source, node.nodeId, role.roleId, device, effectiveField,
    ),
    copyUnavailableReason: effectiveField === "zIndex" ? ({ definition: source, node, device }) => {
      const sourceSlot = node.slotId ? source.slots[node.slotId] : undefined;
      const sourceModuleType = sourceSlot ? getContentTemplateModuleTypeForSlotType(sourceSlot.type) : undefined;
      const sourceContract = sourceModuleType ? getContentTemplateContract(sourceModuleType) : undefined;
      if (!sourceContract) return undefined;
      const explicit = resolveVisualNode({
        __instanceOverrides: node.props.contentTemplateLayoutData,
      }, role.roleId, device);
      return explicit.zIndex === undefined
        ? resolveContractRoleDefaultZIndex(sourceContract, role.roleId, device).reason
        : undefined;
    } : undefined,
    applyValue: (target, { node }, value) => {
      const props = target.nodes[node.nodeId].props;
      // 精确修改已披露路径，不迁移或清理整份宿主构图，避免触及其他角色。
      const normalized = options.normalizeValue ? options.normalizeValue(value) : value;
      const updated = setVisualOverridePath(props.contentTemplateLayoutData, path, normalized);
      if (updated) props.contentTemplateLayoutData = updated;
      else delete props.contentTemplateLayoutData;
    },
  });
  const supports = (capability: typeof role.capabilities[number]) => role.capabilities.includes(capability)
    && (!role.capabilityViewports?.[capability] || role.capabilityViewports[capability]!.includes(context.device));
  if (supports("layout") || supports("position") || supports("size")) {
    add("role.rect", "对象位置与尺寸", "rect", ["nodes", role.roleId, "rectByViewport", context.device]);
  }
  if (supports("layer")) add("role.zIndex", "对象层级", "zIndex", ["nodes", role.roleId, "zIndexByViewport", context.device]);
  if (supports("focus")) add("role.focus", "对象图片焦点", "focus", ["nodes", role.roleId, "mediaView", "focusByViewport", context.device]);
  const textRole = contract?.editorCapabilities.layoutOverrides?.textRoles?.find(
    (candidate) => candidate.roleId === role.roleId,
  );
  if (supports("typography") && role.constraints.allowTypography && textRole) {
    const normalize = <T,>(
      predicate: (value: unknown) => value is T,
      message: string,
      transform: (value: T) => unknown = (value) => value,
    ) => (value: unknown) => {
      if (value === undefined) return undefined;
      if (!predicate(value)) throw new DynamicTemplateOperationError("FIELD_VALUE_INVALID", message);
      return transform(value);
    };
    const addTypography = (
      field: ContractRoleTypographyField,
      label: string,
      normalizeValue: (value: unknown) => unknown,
    ) => add(
      `role.typography.${field}`,
      label,
      `typography.${field}`,
      ["nodes", role.roleId, "typography", field],
      { valueScope: "shared", normalizeValue },
    );
    const allowedSizeLevels = new Set(
      (Object.entries(CONTRACT_ROLE_TYPOGRAPHY_SIZE_PRESETS) as Array<[
        NonNullable<ContractRoleTypography["sizeLevel"]>,
        "small" | "standard" | "large",
      ]>)
        .filter(([, preset]) => textRole.sizePresets?.includes(preset))
        .map(([level]) => level),
    );
    if (allowedSizeLevels.size) addTypography(
      "sizeLevel",
      "文字字号级别",
      normalize(
        (value): value is NonNullable<ContractRoleTypography["sizeLevel"]> => (
          typeof value === "string" && allowedSizeLevels.has(value as NonNullable<ContractRoleTypography["sizeLevel"]>)
        ),
        "当前文字角色不允许该字号级别。",
      ),
    );
    if (textRole.align?.length) addTypography(
      "align",
      "文字对齐",
      normalize(
        (value): value is NonNullable<ContractRoleTypography["align"]> => (
          typeof value === "string" && textRole.align!.includes(value as NonNullable<ContractRoleTypography["align"]>)
        ),
        "当前文字角色不允许该对齐方式。",
      ),
    );
    const allowedColors = new Set(
      (textRole.colorTokens ?? [])
        .flatMap((token) => CONTRACT_ROLE_TYPOGRAPHY_COLORS[token] ?? [])
        .map((value) => value.toUpperCase()),
    );
    if (allowedColors.size) addTypography(
      "color",
      "文字颜色",
      normalize(
        (value): value is string => typeof value === "string" && allowedColors.has(value.toUpperCase()),
        "当前文字角色不允许该颜色。",
        (value) => value.toUpperCase(),
      ),
    );
    addTypography(
      "lineHeight",
      "文字行距",
      normalize(
        (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 2.5,
        "文字行距必须位于 1–2.5。",
      ),
    );
    addTypography(
      "letterSpacing",
      "文字字间距",
      normalize(
        (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= -0.05 && value <= 0.5,
        "文字字间距必须位于 -0.05–0.5em。",
      ),
    );
    if (textRole.maxLines) addTypography(
      "maxLines",
      "文字最大行数",
      normalize(
        (value): value is number => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= textRole.maxLines!,
        `文字最大行数必须位于 1–${textRole.maxLines}。`,
      ),
    );
    addTypography(
      "safeBand",
      "安全文字带",
      normalize(
        (value): value is "light" | "dark" => value === "light" || value === "dark",
        "安全文字带只允许浅色或深色。",
      ),
    );
  }
  return fields;
}

export type TemplateInspectorValueScope = "shared" | "device" | "slot-device";

export interface TemplateInspectorResolverInput {
  definition: TemplateDefinitionV2;
  device: DynamicTemplateDevice;
  targetId: string;
  roleId?: string;
  parent?: DynamicTemplateNode | null;
  effectiveSlotRules?: DynamicTemplateSlotRules;
  lockOwnerId?: string | null;
}

export interface TemplateInspectorDesignFieldContext {
  definition: TemplateDefinitionV2;
  device: DynamicTemplateDevice;
  roleId?: string;
  node: DynamicTemplateNode;
  parent: DynamicTemplateNode | null;
  slot?: DynamicTemplateSlotDefinition;
  effectiveSlotRules?: DynamicTemplateSlotRules;
  lockOwnerId: string | null;
  applicableCopyGroups: readonly DynamicTemplateResponsiveGroup[];
}

export interface TemplateInspectorDesignFieldDescriptor {
  field: string;
  label: string;
  valueScope: TemplateInspectorValueScope;
  copyGroup?: DynamicTemplateResponsiveGroup;
  isApplicable: (context: TemplateInspectorDesignFieldContext) => boolean;
  readValue: (context: TemplateInspectorDesignFieldContext) => unknown;
  copyUnavailableReason?: (context: TemplateInspectorDesignFieldContext) => string | undefined;
  applyValue: (
    definition: TemplateDefinitionV2,
    context: TemplateInspectorDesignFieldContext,
    value: unknown,
  ) => void;
}

function findTemplateInspectorParent(definition: TemplateDefinitionV2, nodeId: string) {
  return Object.values(definition.nodes).find((candidate) => candidate.childIds.includes(nodeId)) ?? null;
}

function responsiveField(
  field: keyof DynamicTemplateResponsiveRules,
  label: string,
  copyGroup: DynamicTemplateResponsiveGroup,
  isApplicable: (context: TemplateInspectorDesignFieldContext) => boolean = () => true,
): TemplateInspectorDesignFieldDescriptor {
  return {
    field: `responsive.${String(field)}`,
    label,
    valueScope: "device",
    copyGroup,
    isApplicable,
    readValue: ({ definition, node, device }) => resolveTemplateNodeRules(definition, node.nodeId, device)[field],
    applyValue: (definition, { node, device }, value) => {
      if (value === undefined) removeOptionalNodeRule(definition, node.nodeId, device, String(field));
      else setTemplateNodeRule(definition, node.nodeId, device, String(field), value);
    },
  };
}

function slotRuleField(
  field: keyof DynamicTemplateSlotRules,
  label: string,
  copyGroup: DynamicTemplateResponsiveGroup,
  isApplicable: (context: TemplateInspectorDesignFieldContext) => boolean,
): TemplateInspectorDesignFieldDescriptor {
  return {
    field: `slotRules.${String(field)}`,
    label,
    valueScope: "slot-device",
    copyGroup,
    isApplicable,
    readValue: ({ effectiveSlotRules }) => effectiveSlotRules?.[field],
    applyValue: (definition, { node, device }, value) => {
      if (!node.slotId) return;
      if (value === undefined) removeOptionalSlotRule(definition, node.slotId, device, String(field));
      else setTemplateSlotRule(definition, node.slotId, device, String(field), value);
    },
  };
}

const isTextDesignField = ({ slot }: TemplateInspectorDesignFieldContext) => Boolean(
  slot && ["heading", "text", "richText", "button", "link", "badge"].includes(slot.type),
);

const isFreePositioned = ({ definition, parent, device }: TemplateInspectorDesignFieldContext) => (
  parent?.type === "Stack" && resolveTemplateNodeRules(definition, parent.nodeId, device).layoutMode === "free"
);
const canArrangeChildren = ({ definition, node, device }: TemplateInspectorDesignFieldContext) => (
  getDynamicTemplateNodeRegistryEntry(node.type).canHaveChildren && resolveTemplateNodeRules(definition, node.nodeId, device).layoutMode !== "free"
);

export const TEMPLATE_INSPECTOR_DESIGN_FIELDS: readonly TemplateInspectorDesignFieldDescriptor[] = [
  {
    field: "node.name",
    label: "节点名称",
    valueScope: "shared",
    isApplicable: () => true,
    readValue: ({ node }) => node.name,
    applyValue: (definition, { node }, value) => { definition.nodes[node.nodeId].name = String(value); },
  },
  {
    field: "slot.label",
    label: "页面字段名称",
    valueScope: "shared",
    isApplicable: ({ slot }) => Boolean(slot),
    readValue: ({ slot }) => slot?.label,
    applyValue: (definition, { node }, value) => {
      if (node.slotId) definition.slots[node.slotId].label = String(value);
    },
  },
  responsiveField("display", "显示状态", "arrangement-display"),
  responsiveField("order", "顺序", "arrangement-display"),
  responsiveField("layoutMode", "叠放模式", "arrangement-display", ({ node }) => node.type === "Stack"),
  responsiveField("direction", "排列方向", "arrangement-display", (context) => canArrangeChildren(context) && resolveTemplateNodeRules(context.definition, context.node.nodeId, context.device).display === "flex"),
  responsiveField("columns", "列宽比例", "arrangement-display", (context) => canArrangeChildren(context) && resolveTemplateNodeRules(context.definition, context.node.nodeId, context.device).display === "grid"),
  responsiveField("alignItems", "对齐方式", "arrangement-display", (context) => canArrangeChildren(context) && ["flex", "grid"].includes(resolveTemplateNodeRules(context.definition, context.node.nodeId, context.device).display)),
  responsiveField("justifyContent", "主轴分布", "arrangement-display", (context) => {
    const display = resolveTemplateNodeRules(context.definition, context.node.nodeId, context.device).display;
    return canArrangeChildren(context) && (display === "flex" || (context.definition.schemaVersion >= 2 && display === "grid"));
  }),
  responsiveField("width", "宽度", "size-position"),
  responsiveField("height", "高度", "size-position"),
  responsiveField("maxWidth", "最大宽度", "size-position"),
  responsiveField("minHeight", "最小高度", "size-position"),
  responsiveField("placement", "自由位置", "size-position", isFreePositioned),
  responsiveField("gap", "内容间距", "spacing", ({ node }) => getDynamicTemplateNodeRegistryEntry(node.type).canHaveChildren),
  responsiveField("padding", "内边距", "spacing"),
  responsiveField("margin", "外边距", "spacing"),
  responsiveField("backgroundToken", "背景", "surface"),
  responsiveField("borderToken", "边框", "surface"),
  responsiveField("radius", "圆角", "surface"),
  responsiveField("overflow", "容器溢出", "surface"),
  slotRuleField("aspectRatio", "图片比例", "image-display", ({ slot }) => slot?.type === "image"),
  slotRuleField("objectFit", "图片适配", "image-display", ({ slot }) => slot?.type === "image"),
  slotRuleField("objectPosition", "图片焦点", "image-display", ({ slot, effectiveSlotRules }) => (
    slot?.type === "image" && (effectiveSlotRules?.objectFit ?? "cover") === "cover"
  )),
  slotRuleField("fontRole", "字体角色", "typography", isTextDesignField),
  slotRuleField("fontSize", "字号", "typography", isTextDesignField),
  slotRuleField("fontWeight", "字重", "typography", isTextDesignField),
  slotRuleField("lineHeight", "行高", "typography", isTextDesignField),
  slotRuleField("textAlign", "文字对齐", "typography", isTextDesignField),
  slotRuleField("maxLines", "最大行数", "typography", isTextDesignField),
  slotRuleField("overflow", "文字溢出", "typography", isTextDesignField),
] as const;

export function resolveTemplateInspectorDesignFields(input: TemplateInspectorResolverInput) {
  const node = input.definition.nodes[input.targetId];
  if (!node) return { context: null, fields: [] } as const;
  const slot = node.slotId ? input.definition.slots[node.slotId] : undefined;
  const context: TemplateInspectorDesignFieldContext = {
    definition: input.definition,
    device: input.device,
    roleId: input.roleId,
    node,
    parent: input.parent === undefined
      ? findTemplateInspectorParent(input.definition, node.nodeId)
      : input.parent,
    slot,
    effectiveSlotRules: input.effectiveSlotRules
      ?? (slot ? resolveTemplateSlotRules(input.definition, slot.slotId, input.device) : undefined),
    lockOwnerId: input.lockOwnerId === undefined
      ? getDynamicTemplateStructureLockOwnerId(input.definition, node.nodeId)
      : input.lockOwnerId,
    applicableCopyGroups: [],
  };
  const applicableFields = (input.roleId ? contractRoleFields(context) : TEMPLATE_INSPECTOR_DESIGN_FIELDS)
    .filter((field) => field.isApplicable(context));
  context.applicableCopyGroups = [...new Set(applicableFields.flatMap((field) => field.copyGroup ? [field.copyGroup] : []))];
  return {
    context,
    fields: applicableFields.map((field) => ({
      ...field,
      value: field.readValue(context),
      applyValue: (definition: TemplateDefinitionV2, _context: TemplateInspectorDesignFieldContext, value: unknown) => {
        const current = resolveTemplateInspectorDesignFields({ definition, targetId: context.node.nodeId, device: context.device, roleId: context.roleId });
        if (current.context?.lockOwnerId || !current.fields.some((candidate) => candidate.field === field.field)) {
          throw new DynamicTemplateOperationError("FIELD_NOT_APPLICABLE", `${field.label}当前不可修改。`);
        }
        field.applyValue(definition, current.context!, value);
      },
      disabledReason: context.lockOwnerId
        ? `“${input.definition.nodes[context.lockOwnerId]?.name ?? "当前对象"}”已锁定`
        : null,
    })),
  };
}

export interface TemplateInspectorBatchTargetIdentity {
  targetId: string;
  roleId?: string;
}

export type TemplateInspectorBatchExclusionCode =
  | "ROOT_TARGET_NOT_BATCH_EDITABLE"
  | "TARGET_NOT_FOUND"
  | "TARGET_LOCKED"
  | "ROLE_NOT_APPLICABLE"
  | "FIELD_NOT_APPLICABLE"
  | "FIELD_DISABLED";

export interface TemplateInspectorBatchExclusion {
  code: TemplateInspectorBatchExclusionCode;
  message: string;
  target: TemplateInspectorBatchTargetIdentity;
  field?: string;
  lockOwnerId?: string;
}

export interface TemplateInspectorBatchTargetFieldSnapshot {
  field: string;
  label: string;
  valueScope: TemplateInspectorValueScope;
  value: unknown;
  disabledReason: string | null;
}

export interface TemplateInspectorBatchTargetPlan {
  target: TemplateInspectorBatchTargetIdentity;
  resolved: boolean;
  editable: boolean;
  nodeType?: DynamicTemplateNodeType;
  nodeName?: string;
  slotId?: string;
  lockOwnerId: string | null;
  lockOwnerName?: string;
  exclusions: readonly TemplateInspectorBatchExclusion[];
  fields: readonly TemplateInspectorBatchTargetFieldSnapshot[];
}

export type TemplateInspectorBatchValueState =
  | { kind: "same"; value: unknown }
  | { kind: "mixed" };

export interface TemplateInspectorBatchFieldPlan {
  field: string;
  label: string;
  valueScope: TemplateInspectorValueScope;
  applicableToAll: boolean;
  value: TemplateInspectorBatchValueState | null;
  exclusions: readonly TemplateInspectorBatchExclusion[];
}

export interface TemplateInspectorBatchPlan {
  templateId: string;
  device: DynamicTemplateDevice;
  targets: readonly TemplateInspectorBatchTargetIdentity[];
  primaryTarget?: TemplateInspectorBatchTargetIdentity;
  targetPlans: readonly TemplateInspectorBatchTargetPlan[];
  fields: readonly TemplateInspectorBatchFieldPlan[];
  commonFields: readonly TemplateInspectorBatchFieldPlan[];
  fingerprint: string;
}

export interface TemplateInspectorBatchResolverInput {
  definition: TemplateDefinitionV2;
  device: DynamicTemplateDevice;
  targets: readonly TemplateInspectorBatchTargetIdentity[];
  primaryTarget?: TemplateInspectorBatchTargetIdentity;
}

function sameBatchTargetIdentity(
  left: TemplateInspectorBatchTargetIdentity | undefined,
  right: TemplateInspectorBatchTargetIdentity | undefined,
) {
  return left?.targetId === right?.targetId && left?.roleId === right?.roleId;
}

function batchTargetIdentityKey(target: TemplateInspectorBatchTargetIdentity) {
  return `${target.targetId.length}:${target.targetId}|${target.roleId === undefined ? "-" : `${target.roleId.length}:${target.roleId}`}`;
}

function normalizeTemplateInspectorBatchTargets(
  targets: readonly TemplateInspectorBatchTargetIdentity[],
) {
  const seen = new Set<string>();
  const normalized: TemplateInspectorBatchTargetIdentity[] = [];
  for (const target of targets) {
    const identity = {
      targetId: target.targetId,
      ...(target.roleId !== undefined ? { roleId: target.roleId } : {}),
    };
    const key = batchTargetIdentityKey(identity);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(identity);
  }
  return normalized;
}

function isDeterministicDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => isDeterministicDeepEqual(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index]
      && isDeterministicDeepEqual(leftRecord[key], rightRecord[key])
    ));
}

function stableTemplateInspectorBatchValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number:NaN";
    if (value === Number.POSITIVE_INFINITY) return "number:Infinity";
    if (value === Number.NEGATIVE_INFINITY) return "number:-Infinity";
    if (Object.is(value, -0)) return "number:-0";
    return `number:${value}`;
  }
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return `boolean:${value}`;
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (Array.isArray(value)) {
    return `array:[${value.map(stableTemplateInspectorBatchValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `object:{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${stableTemplateInspectorBatchValue(record[key])}`
    )).join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
}

function freezeTemplateInspectorBatchPlan<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeTemplateInspectorBatchPlan(child);
    }
    Object.freeze(value);
  }
  return value;
}

function createTemplateInspectorBatchTargetPlan(
  definition: TemplateDefinitionV2,
  device: DynamicTemplateDevice,
  target: TemplateInspectorBatchTargetIdentity,
): TemplateInspectorBatchTargetPlan {
  const node = definition.nodes[target.targetId];
  if (!node) {
    const exclusion: TemplateInspectorBatchExclusion = {
      code: "TARGET_NOT_FOUND",
      message: `批量目标“${target.targetId}”不存在。`,
      target,
    };
    return {
      target, resolved: false, editable: false, lockOwnerId: null,
      exclusions: [exclusion], fields: [],
    };
  }
  if (node.nodeId === definition.rootNodeId) {
    const exclusion: TemplateInspectorBatchExclusion = {
      code: "ROOT_TARGET_NOT_BATCH_EDITABLE",
      message: `模板根“${node.name}”不能作为批量设计字段目标。`,
      target,
    };
    return {
      target, resolved: true, editable: false, nodeType: node.type, nodeName: node.name,
      ...(node.slotId ? { slotId: node.slotId } : {}),
      lockOwnerId: null, exclusions: [exclusion], fields: [],
    };
  }
  const resolved = resolveTemplateInspectorDesignFields({
    definition,
    targetId: target.targetId,
    device,
    ...(target.roleId !== undefined ? { roleId: target.roleId } : {}),
  });
  const batchFields = resolved.fields.filter((field) => Boolean(field.copyGroup));
  const lockOwnerId = resolved.context?.lockOwnerId ?? null;
  const exclusions: TemplateInspectorBatchExclusion[] = [];
  if (target.roleId !== undefined && batchFields.length === 0) {
    exclusions.push({
      code: "ROLE_NOT_APPLICABLE",
      message: `角色“${target.roleId}”在当前设备或对象上不适用。`,
      target,
    });
  }
  if (lockOwnerId) {
    exclusions.push({
      code: "TARGET_LOCKED",
      message: `“${definition.nodes[lockOwnerId]?.name ?? "当前对象"}”已锁定，目标“${node.name}”不能批量修改。`,
      target,
      lockOwnerId,
    });
  }
  return {
    target,
    resolved: target.roleId === undefined || batchFields.length > 0,
    editable: exclusions.length === 0,
    nodeType: node.type,
    nodeName: node.name,
    ...(node.slotId ? { slotId: node.slotId } : {}),
    lockOwnerId,
    ...(lockOwnerId ? { lockOwnerName: definition.nodes[lockOwnerId]?.name } : {}),
    exclusions,
    fields: batchFields.map((field) => ({
      field: field.field,
      label: field.label,
      valueScope: field.valueScope,
      value: structuredClone(field.value),
      disabledReason: field.disabledReason,
    })),
  };
}

function createTemplateInspectorBatchFingerprint(
  plan: Omit<TemplateInspectorBatchPlan, "commonFields" | "fingerprint">,
) {
  return stableTemplateInspectorBatchValue(plan);
}

/**
 * 多选只消费单对象 resolver 的实时结果；fields 保留逐字段排除原因，commonFields
 * 只包含所有规范化目标在当前设备上都可编辑的设计字段。
 */
export function createTemplateInspectorBatchPlan(
  input: TemplateInspectorBatchResolverInput,
): TemplateInspectorBatchPlan {
  const targets = normalizeTemplateInspectorBatchTargets(input.targets);
  const requestedPrimary = input.primaryTarget
    ? targets.find((target) => sameBatchTargetIdentity(target, input.primaryTarget))
    : undefined;
  const primaryTarget = requestedPrimary ?? targets[0];
  const targetPlans = targets.map((target) => (
    createTemplateInspectorBatchTargetPlan(input.definition, input.device, target)
  ));
  const fieldOrder: Array<{ field: string; label: string; valueScope: TemplateInspectorValueScope }> = [];
  const seenFields = new Set<string>();
  for (const targetPlan of targetPlans) {
    for (const field of targetPlan.fields) {
      if (seenFields.has(field.field)) continue;
      seenFields.add(field.field);
      fieldOrder.push({ field: field.field, label: field.label, valueScope: field.valueScope });
    }
  }
  const fields = fieldOrder.map((identity): TemplateInspectorBatchFieldPlan => {
    const exclusions: TemplateInspectorBatchExclusion[] = [];
    const values: unknown[] = [];
    for (const targetPlan of targetPlans) {
      if (targetPlan.exclusions.length > 0) {
        exclusions.push(...targetPlan.exclusions.map((exclusion) => ({
          ...exclusion,
          field: identity.field,
        })));
        continue;
      }
      const targetField = targetPlan.fields.find((field) => field.field === identity.field);
      if (!targetField) {
        exclusions.push({
          code: "FIELD_NOT_APPLICABLE",
          message: `“${targetPlan.nodeName ?? targetPlan.target.targetId}”不适用字段“${identity.label}”。`,
          target: targetPlan.target,
          field: identity.field,
        });
        continue;
      }
      if (targetField.disabledReason) {
        exclusions.push({
          code: "FIELD_DISABLED",
          message: `“${targetPlan.nodeName ?? targetPlan.target.targetId}”的“${identity.label}”当前不可修改：${targetField.disabledReason}。`,
          target: targetPlan.target,
          field: identity.field,
          ...(targetPlan.lockOwnerId ? { lockOwnerId: targetPlan.lockOwnerId } : {}),
        });
        continue;
      }
      values.push(targetField.value);
    }
    const applicableToAll = targets.length > 0
      && exclusions.length === 0
      && values.length === targets.length;
    const value = !applicableToAll
      ? null
      : values.slice(1).every((candidate) => isDeterministicDeepEqual(candidate, values[0]))
        ? { kind: "same" as const, value: structuredClone(values[0]) }
        : { kind: "mixed" as const };
    return { ...identity, applicableToAll, value, exclusions };
  });
  const core = {
    templateId: input.definition.templateId,
    device: input.device,
    targets,
    ...(primaryTarget ? { primaryTarget } : {}),
    targetPlans,
    fields,
  };
  const plan: TemplateInspectorBatchPlan = {
    ...core,
    commonFields: fields.filter((field) => field.applicableToAll),
    fingerprint: createTemplateInspectorBatchFingerprint(core),
  };
  return freezeTemplateInspectorBatchPlan(plan);
}

export class DynamicTemplateOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DynamicTemplateOperationError";
  }
}

export type DynamicTemplateResponsiveCommandRoleSelection =
  | {
      roleId?: string;
      sourceRoleId?: never;
      targetRoleId?: never;
    }
  | {
      roleId?: never;
      sourceRoleId: string;
      targetRoleId: string;
    };

export type DynamicTemplateDefinitionCommand =
  | {
      type: "convert-layout";
      label: string;
      nodeId: string;
      breakpoint: TemplateBreakpoint;
      layout: "vertical" | "horizontal" | "wrap" | "grid" | "free";
      columns?: number[];
      placements?: Record<string, DynamicTemplatePlacement>;
      height?: DynamicTemplateHeightRule;
    }
  | {
      type: "replace-definition";
      label: string;
      definition: TemplateDefinitionV2;
    }
  | {
      type: "update-definition";
      label: string;
      update: (definition: TemplateDefinitionV2) => void;
    }
  | {
      type: "transform-definition";
      label: string;
      transform: (definition: TemplateDefinitionV2) => TemplateDefinitionV2;
    }
  | ({
      type: "copy-responsive-groups";
      label: string;
      nodeId: string;
      sourceDevice: DynamicTemplateDevice;
      targetDevice: DynamicTemplateDevice;
      groups: readonly DynamicTemplateResponsiveGroup[];
      reviewedPlan?: DynamicTemplateResponsivePlan;
    } & DynamicTemplateResponsiveCommandRoleSelection)
  | {
      type: "restore-responsive-groups";
      label: string;
      nodeId: string;
      device: DynamicTemplateDevice;
      groups: readonly DynamicTemplateResponsiveGroup[];
      baselineDefinition: TemplateDefinitionV2;
      roleId?: string;
    }
  | {
      type: "reset-responsive-groups";
      label: string;
      nodeId: string;
      device: DynamicTemplateDevice;
      groups: readonly DynamicTemplateResponsiveGroup[];
      roleId?: string;
    }
  | {
      type: "batch-update-design-field";
      label: string;
      device: DynamicTemplateDevice;
      targets: readonly TemplateInspectorBatchTargetIdentity[];
      primaryTarget?: TemplateInspectorBatchTargetIdentity;
      field: string;
      value: unknown;
      reviewedPlan: TemplateInspectorBatchPlan;
    };

export const DYNAMIC_TEMPLATE_RESPONSIVE_GROUPS = [
  "arrangement-display",
  "size-position",
  "spacing",
  "surface",
  "image-display",
  "typography",
  "contract-composition-media",
] as const;

export type DynamicTemplateResponsiveGroup = typeof DYNAMIC_TEMPLATE_RESPONSIVE_GROUPS[number];

export const DYNAMIC_TEMPLATE_RESPONSIVE_GROUP_LABELS: Record<DynamicTemplateResponsiveGroup, string> = {
  "arrangement-display": "排列与显示",
  "size-position": "尺寸与位置",
  spacing: "间距",
  surface: "表面样式",
  "image-display": "图片显示",
  typography: "文字样式",
  "contract-composition-media": "合同对象构图与媒体",
};

/** 所有消费者都从同一个属性 resolver 获取设计组。 */
export function getDynamicTemplateApplicableResponsiveGroups(
  definition: TemplateDefinitionV2, nodeId: string, device: DynamicTemplateDevice, roleId?: string,
): DynamicTemplateResponsiveGroup[] {
  return [...(resolveTemplateInspectorDesignFields({ definition, targetId: nodeId, device, roleId }).context?.applicableCopyGroups ?? [])];
}

export interface DynamicTemplateResponsivePlan {
  templateId: string;
  nodeId: string;
  roleId?: string;
  sourceRoleId?: string;
  targetRoleId?: string;
  sourceDevice: DynamicTemplateDevice;
  targetDevice: DynamicTemplateDevice;
  groups: readonly DynamicTemplateResponsiveGroup[];
  changes: Array<{ field: string; label: string; group: DynamicTemplateResponsiveGroup; before: unknown; after: unknown }>;
  reason?: string;
}

export interface DynamicTemplateResponsiveRoleMapping {
  sourceRoleId: string;
  targetRoleId: string;
}

function resolveDynamicTemplateResponsiveRoles(
  role: string | DynamicTemplateResponsiveRoleMapping | undefined,
) {
  if (typeof role === "string") {
    return { roleId: role, sourceRoleId: role, targetRoleId: role } as const;
  }
  if (role) {
    return { sourceRoleId: role.sourceRoleId, targetRoleId: role.targetRoleId } as const;
  }
  return {} as const;
}

function getDynamicTemplateResponsiveCommandRole(
  command: Extract<DynamicTemplateDefinitionCommand, { type: "copy-responsive-groups" }>,
): string | DynamicTemplateResponsiveRoleMapping | undefined {
  const hasSourceRole = command.sourceRoleId !== undefined;
  const hasTargetRole = command.targetRoleId !== undefined;
  if (command.roleId !== undefined && (hasSourceRole || hasTargetRole)) {
    throw new DynamicTemplateOperationError(
      "AMBIGUOUS_ROLE_MAPPING",
      "不能同时使用单角色与成对角色映射，请重新检查复制范围。",
    );
  }
  if (hasSourceRole !== hasTargetRole) {
    throw new DynamicTemplateOperationError(
      "INCOMPLETE_ROLE_MAPPING",
      "成对角色复制必须同时提供源角色和目标角色。",
    );
  }
  if (hasSourceRole && hasTargetRole) {
    return { sourceRoleId: command.sourceRoleId!, targetRoleId: command.targetRoleId! };
  }
  return command.roleId;
}

/** 预览与执行共用逐字段计划；先投影 display/fit，再判断依赖字段的目标适用性。 */
export function createDynamicTemplateResponsivePlan(
  target: TemplateDefinitionV2,
  nodeId: string,
  sourceDevice: DynamicTemplateDevice,
  targetDevice: DynamicTemplateDevice,
  groups: readonly DynamicTemplateResponsiveGroup[],
  role?: string | DynamicTemplateResponsiveRoleMapping,
  source: TemplateDefinitionV2 = target,
): DynamicTemplateResponsivePlan {
  if (source.templateId !== target.templateId) throw new DynamicTemplateOperationError("BASELINE_TEMPLATE_MISMATCH", "保存基线属于另一模板，未恢复任何设置。");
  if (!source.nodes[nodeId] || source.nodes[nodeId].type !== target.nodes[nodeId]?.type) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "当前对象不在所选来源中，未恢复任何设置。");
  }
  if (!groups.length) throw new DynamicTemplateOperationError("NO_RESPONSIVE_GROUPS", "请先选择要复制或恢复的设计组。");
  if (groups.some((group) => !DYNAMIC_TEMPLATE_RESPONSIVE_GROUPS.includes(group))) throw new DynamicTemplateOperationError("UNKNOWN_RESPONSIVE_GROUP", "包含不受支持的响应式设计组。");
  const roles = resolveDynamicTemplateResponsiveRoles(role);
  const projected = structuredClone(target);
  const plan: DynamicTemplateResponsivePlan = {
    templateId: target.templateId,
    nodeId,
    ...roles,
    sourceDevice,
    targetDevice,
    groups: [...new Set(groups)],
    changes: [],
  };
  const from = resolveTemplateInspectorDesignFields({
    definition: source,
    targetId: nodeId,
    device: sourceDevice,
    ...(roles.sourceRoleId !== undefined ? { roleId: roles.sourceRoleId } : {}),
  });
  const selectedFields = from.fields.filter((field) => field.copyGroup && groups.includes(field.copyGroup));
  if (roles.sourceRoleId !== undefined && selectedFields.length === 0) {
    plan.reason = `源角色“${roles.sourceRoleId}”在${sourceDevice === "desktop" ? "桌面端" : "移动端"}不适用，未复制任何设置。`;
    return plan;
  }
  const unavailableReason = selectedFields
    .map((field) => field.copyUnavailableReason?.(from.context!))
    .find((reason): reason is string => Boolean(reason));
  if (unavailableReason) {
    plan.reason = unavailableReason;
    return plan;
  }
  const initialTarget = resolveTemplateInspectorDesignFields({
    definition: projected,
    targetId: nodeId,
    device: targetDevice,
    ...(roles.targetRoleId !== undefined ? { roleId: roles.targetRoleId } : {}),
  });
  if (roles.targetRoleId !== undefined) {
    if (initialTarget.fields.length === 0) {
      plan.reason = `目标角色“${roles.targetRoleId}”在${targetDevice === "desktop" ? "桌面端" : "移动端"}不适用，未复制任何设置。`;
      return plan;
    }
    const unavailableTargetField = selectedFields.find((field) => (
      !initialTarget.fields.some((candidate) => candidate.field === field.field)
    ));
    if (unavailableTargetField) {
      plan.reason = `目标角色“${roles.targetRoleId}”不支持“${unavailableTargetField.label}”，未复制任何设置。`;
      return plan;
    }
  }
  for (const field of selectedFields) {
    const group = field.copyGroup;
    if (!group) continue;
    const to = resolveTemplateInspectorDesignFields({
      definition: projected,
      targetId: nodeId,
      device: targetDevice,
      ...(roles.targetRoleId !== undefined ? { roleId: roles.targetRoleId } : {}),
    });
    const destination = to.fields.find((candidate) => candidate.field === field.field);
    if (!destination || isDeterministicDeepEqual(destination.value, field.value)) continue;
    plan.changes.push({ field: field.field, label: field.label, group, before: structuredClone(destination.value), after: structuredClone(field.value) });
    // 这里只投影值；执行阶段仍重新校验结构锁与适用性。
    const descriptor = (roles.targetRoleId ? contractRoleFields(to.context!) : TEMPLATE_INSPECTOR_DESIGN_FIELDS)
      .find((candidate) => candidate.field === field.field)!;
    descriptor.applyValue(projected, to.context!, field.value);
  }
  if (!plan.changes.length) plan.reason = "所选范围没有可复制的差异字段；共享属性和不适用字段不会写入。";
  return plan;
}

function applyResponsivePlan(definition: TemplateDefinitionV2, plan: DynamicTemplateResponsivePlan) {
  for (const change of plan.changes) {
    const targetRoleId = plan.targetRoleId ?? plan.roleId;
    const resolved = resolveTemplateInspectorDesignFields({
      definition,
      targetId: plan.nodeId,
      device: plan.targetDevice,
      ...(targetRoleId !== undefined ? { roleId: targetRoleId } : {}),
    });
    const field = resolved.fields.find((candidate) => candidate.field === change.field);
    if (!field || field.disabledReason) throw new DynamicTemplateOperationError("FIELD_NOT_APPLICABLE", "对象已锁定或字段不再适用，请重新检查差异。");
    field.applyValue(definition, resolved.context!, change.after);
  }
}

function applyResponsiveGroups(
  target: TemplateDefinitionV2, source: TemplateDefinitionV2, nodeId: string,
  sourceDevice: DynamicTemplateDevice, targetDevice: DynamicTemplateDevice,
  groups: readonly DynamicTemplateResponsiveGroup[], roleId?: string,
) {
  applyResponsivePlan(target, createDynamicTemplateResponsivePlan(target, nodeId, sourceDevice, targetDevice, groups, roleId, source));
}

export type DynamicTemplateCommandResult =
  | {
      ok: true;
      changed: boolean;
      code: "APPLIED" | "NO_CHANGE";
      label: string;
      message: string;
      definition: TemplateDefinitionV2;
    }
  | {
      ok: false;
      changed: false;
      code: string;
      label: string;
      message: string;
      definition?: TemplateDefinitionV2;
    };

function cloneDefinition(definition: TemplateDefinitionV2): TemplateDefinitionV2 {
  return structuredClone(definition);
}

function sameDefinition(left: TemplateDefinitionV2, right: TemplateDefinitionV2) {
  return isDeterministicDeepEqual(left, right);
}

function assertTemplateInspectorBatchPlanCurrent(
  definition: TemplateDefinitionV2,
  command: Extract<DynamicTemplateDefinitionCommand, { type: "batch-update-design-field" }>,
) {
  const reviewedCore = {
    templateId: command.reviewedPlan.templateId,
    device: command.reviewedPlan.device,
    targets: command.reviewedPlan.targets,
    ...(command.reviewedPlan.primaryTarget ? { primaryTarget: command.reviewedPlan.primaryTarget } : {}),
    targetPlans: command.reviewedPlan.targetPlans,
    fields: command.reviewedPlan.fields,
  };
  if (command.reviewedPlan.fingerprint !== createTemplateInspectorBatchFingerprint(reviewedCore)) {
    throw new DynamicTemplateOperationError("STALE_BATCH_PLAN", "批量检查计划已被修改，请重新检查共同字段。");
  }
  const currentPlan = createTemplateInspectorBatchPlan({
    definition,
    device: command.device,
    targets: command.targets,
    ...(command.primaryTarget ? { primaryTarget: command.primaryTarget } : {}),
  });
  if (
    command.reviewedPlan.templateId !== definition.templateId
    || command.reviewedPlan.device !== command.device
    || !isDeterministicDeepEqual(command.reviewedPlan.targets, currentPlan.targets)
    || !sameBatchTargetIdentity(command.reviewedPlan.primaryTarget, currentPlan.primaryTarget)
    || command.reviewedPlan.fingerprint !== currentPlan.fingerprint
  ) {
    throw new DynamicTemplateOperationError(
      "STALE_BATCH_PLAN",
      "选择、设备、锁定、字段适用条件或当前值已变化，请重新检查共同字段。",
    );
  }
  if (currentPlan.targets.length === 0) {
    throw new DynamicTemplateOperationError("EMPTY_BATCH_SELECTION", "请先选择至少一个可批量编辑的对象。");
  }
  const field = currentPlan.fields.find((candidate) => candidate.field === command.field);
  if (!field) {
    throw new DynamicTemplateOperationError("BATCH_FIELD_NOT_FOUND", "批量检查计划中没有该设计字段。");
  }
  if (!field.applicableToAll) {
    throw new DynamicTemplateOperationError(
      "BATCH_FIELD_EXCLUDED",
      field.exclusions[0]?.message ?? "至少一个批量目标不适用该设计字段。",
    );
  }
  return currentPlan;
}

function applyTemplateInspectorBatchField(
  definition: TemplateDefinitionV2,
  command: Extract<DynamicTemplateDefinitionCommand, { type: "batch-update-design-field" }>,
) {
  const plan = assertTemplateInspectorBatchPlanCurrent(definition, command);
  // 全量 preflight 只读原 definition，任何一个目标失败都不会创建可提交结果。
  for (const target of plan.targets) {
    const resolved = resolveTemplateInspectorDesignFields({
      definition,
      targetId: target.targetId,
      device: command.device,
      ...(target.roleId !== undefined ? { roleId: target.roleId } : {}),
    });
    const field = resolved.fields.find((candidate) => (
      candidate.field === command.field && Boolean(candidate.copyGroup)
    ));
    if (!resolved.context || !field || field.disabledReason) {
      throw new DynamicTemplateOperationError(
        "BATCH_FIELD_EXCLUDED",
        `目标“${target.targetId}”的字段已不可修改，请重新检查共同字段。`,
      );
    }
  }
  const next = cloneDefinition(definition);
  for (const target of plan.targets) {
    const resolved = resolveTemplateInspectorDesignFields({
      definition: next,
      targetId: target.targetId,
      device: command.device,
      ...(target.roleId !== undefined ? { roleId: target.roleId } : {}),
    });
    const field = resolved.fields.find((candidate) => (
      candidate.field === command.field && Boolean(candidate.copyGroup)
    ));
    if (!resolved.context || !field || field.disabledReason) {
      throw new DynamicTemplateOperationError(
        "BATCH_FIELD_EXCLUDED",
        `目标“${target.targetId}”的字段在应用时已不可修改。`,
      );
    }
    field.applyValue(next, resolved.context, command.value);
  }
  assertValidOperationResult(next, definition);
  return next;
}

/**
 * 模板设计的唯一命令执行入口。字段编辑、结构变换和响应式复制都先在克隆上完成，
 * 再统一检查结构锁；调用方只需根据 result 决定是否写入一次 history 事务。
 */
export function executeDynamicTemplateDefinitionCommand(
  definition: TemplateDefinitionV2,
  command: DynamicTemplateDefinitionCommand,
): DynamicTemplateCommandResult {
  if (!command || typeof command !== "object" || typeof command.label !== "string") {
    return {
      ok: false,
      changed: false,
      code: "INVALID_COMMAND",
      label: "模板操作",
      message: "没有可执行的模板设计命令。",
      definition,
    };
  }
  try {
    let next: TemplateDefinitionV2;
    if (command.type === "replace-definition") {
      next = cloneDefinition(command.definition);
    } else if (command.type === "update-definition") {
      next = cloneDefinition(definition);
      command.update(next);
    } else if (command.type === "transform-definition") {
      next = command.transform(cloneDefinition(definition));
    } else if (command.type === "convert-layout") {
      next = convertDynamicTemplateLayout(definition, command);
    } else if (command.type === "batch-update-design-field") {
      next = applyTemplateInspectorBatchField(definition, command);
    } else if (command.type === "copy-responsive-groups") {
      const lockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, command.nodeId);
      if (lockOwnerId) {
        throw new DynamicTemplateOperationError(
          "STRUCTURE_LOCKED",
          `“${definition.nodes[lockOwnerId]?.name ?? "当前对象"}”已锁定，请先解除锁定。`,
        );
      }
      const role = getDynamicTemplateResponsiveCommandRole(command);
      const plan = createDynamicTemplateResponsivePlan(
        definition,
        command.nodeId,
        command.sourceDevice,
        command.targetDevice,
        command.groups,
        role,
      );
      if (command.reviewedPlan && !isDeterministicDeepEqual(command.reviewedPlan, plan)) {
        throw new DynamicTemplateOperationError("STALE_COPY_PLAN", "来源或目标已变化，请重新检查字段差异。");
      }
      next = cloneDefinition(definition);
      applyResponsivePlan(next, plan);
      assertDynamicTemplateOperationAddsNoValidationErrors(next, definition, plan);
    } else if (command.type === "restore-responsive-groups") {
      const lockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, command.nodeId);
      if (lockOwnerId) {
        throw new DynamicTemplateOperationError(
          "STRUCTURE_LOCKED",
          `“${definition.nodes[lockOwnerId]?.name ?? "当前对象"}”已锁定，请先解除锁定。`,
        );
      }
      next = cloneDefinition(definition);
      applyResponsiveGroups(
        next,
        command.baselineDefinition,
        command.nodeId,
        command.device,
        command.device,
        command.groups,
        command.roleId,
      );
    } else if (command.type === "reset-responsive-groups") {
      const node = definition.nodes[command.nodeId];
      if (!node) throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要恢复默认值的对象不存在。");
      const defaultNode = createDynamicTemplateNode(node.type, node.name, node.slotId);
      const defaults = cloneDefinition(definition);
      defaults.nodes[command.nodeId] = { ...defaultNode, nodeId: command.nodeId, slotId: node.slotId };
      if (node.slotId) {
        const slot = definition.slots[node.slotId];
        if (!slot) throw new DynamicTemplateOperationError("SLOT_NOT_FOUND", "节点对应的槽位不存在。");
        defaults.slots[node.slotId] = {
          ...createDynamicTemplateSlotDefinition(slot.type, slot.label, slot.key),
          slotId: slot.slotId,
          key: slot.key,
        };
      }
      next = cloneDefinition(definition);
      applyResponsiveGroups(
        next,
        defaults,
        command.nodeId,
        command.device,
        command.device,
        command.groups,
        command.roleId,
      );
    } else {
      throw new DynamicTemplateOperationError("INVALID_COMMAND", "不支持的模板设计命令。");
    }

    const lockViolation = getDynamicTemplateStructureLockViolation(definition, next);
    if (lockViolation) {
      return {
        ok: false,
        changed: false,
        code: "STRUCTURE_LOCKED",
        label: command.label,
        message: lockViolation,
        definition,
      };
    }
    if (command.type === "update-definition") {
      for (const nodeId of Object.keys(definition.nodes)) {
        if (!next.nodes[nodeId]) continue;
        for (const device of ["desktop", "mobile"] as const) {
          const previous = resolveTemplateInspectorDesignFields({ definition, targetId: nodeId, device });
          const current = resolveTemplateInspectorDesignFields({ definition: next, targetId: nodeId, device });
          if (!previous.context || !current.context) continue;
          for (const field of TEMPLATE_INSPECTOR_DESIGN_FIELDS) {
            if (!field.copyGroup || field.isApplicable(current.context)) continue;
            const after = field.readValue(current.context);
            if (after !== undefined && !isDeterministicDeepEqual(after, field.readValue(previous.context))) {
              throw new DynamicTemplateOperationError("FIELD_NOT_APPLICABLE", `${field.label}在当前布局下不适用，未写入草稿。`);
            }
          }
        }
      }
    }
    assertValidOperationResult(next, definition);
    const changed = !sameDefinition(definition, next);
    return {
      ok: true,
      changed,
      code: changed ? "APPLIED" : "NO_CHANGE",
      label: command.label,
      message: changed ? `${command.label}已应用。` : `${command.label}没有产生变化。`,
      definition: next,
    };
  } catch (error) {
    return {
      ok: false,
      changed: false,
      code: error instanceof DynamicTemplateOperationError ? error.code : "COMMAND_FAILED",
      label: command.label,
      message: error instanceof Error ? error.message : `${command.label}失败。`,
      definition,
    };
  }
}

function findParentId(definition: TemplateDefinitionV2, nodeId: string): string | null {
  for (const node of Object.values(definition.nodes)) {
    if (node.childIds.includes(nodeId)) return node.nodeId;
  }
  return null;
}

export function setDynamicTemplateNodeStructureLocked(
  definition: TemplateDefinitionV2,
  nodeId: string,
  structureLocked: boolean,
): TemplateDefinitionV2 {
  if (!definition.nodes[nodeId]) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要锁定的节点不存在。");
  }
  const next = cloneDefinition(definition);
  if (structureLocked) {
    next.nodes[nodeId].authoring = { structureLocked: true };
  } else {
    delete next.nodes[nodeId].authoring;
  }
  assertValidOperationResult(next, definition);
  return next;
}

function assertDynamicTemplateStructureLocksPreserved(
  previous: TemplateDefinitionV2,
  next: TemplateDefinitionV2,
) {
  const violation = getDynamicTemplateStructureLockViolation(previous, next);
  if (violation) {
    throw new DynamicTemplateOperationError("STRUCTURE_LOCKED", violation);
  }
}

function collectSubtreeNodeIds(
  definition: TemplateDefinitionV2,
  nodeId: string,
  result = new Set<string>(),
): Set<string> {
  if (result.has(nodeId)) return result;
  result.add(nodeId);
  for (const childId of definition.nodes[nodeId]?.childIds ?? []) {
    collectSubtreeNodeIds(definition, childId, result);
  }
  return result;
}

function toSlotKeyBase(type: DynamicTemplateNodeType): string {
  const raw = type.endsWith("Slot") ? type.slice(0, -4) : type;
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

function createUniqueSlotKey(definition: TemplateDefinitionV2, type: DynamicTemplateNodeType): string {
  const base = toSlotKeyBase(type);
  const used = new Set(Object.values(definition.slots).map((slot) => slot.key));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

function updateSlotSummary(definition: TemplateDefinitionV2) {
  const counts = new Map<string, number>();
  for (const slot of Object.values(definition.slots)) {
    const label = {
      image: "图片",
      heading: "标题",
      text: "文字",
      richText: "富文本",
      button: "按钮",
      link: "链接",
      badge: "徽标",
      icon: "图标",
      product: "商品",
      collection: "集合",
      heroTemplate: "首屏主视觉",
    }[slot.type];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  definition.metadata.slotSummary = counts.size
    ? [...counts.entries()].map(([label, count]) => `${count} 个${label}槽位`).join("，")
    : "暂无内容槽位";
}

function assertValidOperationResult(
  definition: TemplateDefinitionV2,
  previous?: TemplateDefinitionV2,
) {
  if (previous) assertDynamicTemplateStructureLocksPreserved(previous, definition);
  const previousErrors = new Set(previous
    ? validateDynamicTemplateDefinition(previous).issues
      .filter((issue) => issue.level === "error")
      .map((issue) => JSON.stringify([issue.code, issue.path, issue.message]))
    : []);
  const result = validateDynamicTemplateDefinition(definition);
  const firstError = result.issues.find((issue) => issue.level === "error"
    && !previousErrors.has(JSON.stringify([issue.code, issue.path, issue.message])));
  if (firstError) {
    throw new DynamicTemplateOperationError(
      "INVALID_OPERATION_RESULT",
      `操作生成了非法模板：${firstError.message}`,
    );
  }
  const existingLayoutErrors = new Set(previous ? collectLayoutRelationshipErrors(previous).map((issue) => issue.key) : []);
  const newLayoutError = collectLayoutRelationshipErrors(definition).find((issue) => !existingLayoutErrors.has(issue.key));
  if (newLayoutError) throw new DynamicTemplateOperationError("LAYOUT_RELATIONSHIP_CONFLICT", newLayoutError.message);
}

function syncPlacementForParent(
  definition: TemplateDefinitionV2,
  nodeId: string,
  parentId: string,
  index: number,
) {
  const parent = definition.nodes[parentId];
  const child = definition.nodes[nodeId];
  if (!parent || !child) return;
  const devices: readonly TemplateBreakpoint[] = Number(definition.schemaVersion) >= 2
    ? ["desktop", "tablet", "mobile"] : ["desktop", "mobile"];
  for (const device of devices) {
    const parentIsFree = parent.type === "Stack" && resolveTemplateNodeRules(definition, parent.nodeId, device).layoutMode === "free";
    if (!parentIsFree) {
      if (resolveTemplateNodeRules(definition, child.nodeId, device).placement) {
        clearPositionRule(definition, child.nodeId, device, "placement");
      }
      continue;
    }
    if (resolveTemplateNodeRules(definition, child.nodeId, device).placement) continue;
    setTemplateNodeRule(definition, child.nodeId, device, "placement", {
      x: Math.min(0.7, 0.04 * index),
      y: Math.min(0.7, 0.04 * index),
      width: 0.5,
      height: 0.5,
      zIndex: Math.min(10, index),
    });
  }
}

export function addDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  parentId: string,
  type: DynamicTemplateNodeType,
  index?: number,
): { definition: TemplateDefinitionV2; nodeId: string; slotId?: string } {
  if (!isDynamicTemplateNodeType(type)) {
    throw new DynamicTemplateOperationError("UNKNOWN_NODE_TYPE", "节点类型未登记，无法添加到模板。");
  }
  const parent = definition.nodes[parentId];
  if (!parent) throw new DynamicTemplateOperationError("PARENT_NOT_FOUND", "目标父节点不存在。");
  if (!isDynamicTemplateNodeType(parent.type)) {
    throw new DynamicTemplateOperationError("UNKNOWN_PARENT_NODE_TYPE", "父节点类型未登记，无法添加子节点。");
  }
  if (!canNestDynamicTemplateNode(parent.type, type)) {
    throw new DynamicTemplateOperationError(
      "ILLEGAL_NESTING",
      `${getDynamicTemplateNodeRegistryEntry(type).label}不能放入${getDynamicTemplateNodeRegistryEntry(parent.type).label}。`,
    );
  }
  const next = cloneDefinition(definition);
  const registry = getDynamicTemplateNodeRegistryEntry(type);
  let slot: DynamicTemplateSlotDefinition | undefined;
  if (registry.kind === "slot" && registry.slotType) {
    slot = createDynamicTemplateSlotDefinition(
      registry.slotType,
      registry.label,
      createUniqueSlotKey(next, type),
    );
  }
  const node = createDynamicTemplateNode(type, registry.label, slot?.slotId);
  if (definition.schemaVersion >= 2) {
    node.responsive.mobile = {};
    delete node.responsive.tablet;
    if (slot) { slot.mobileRules = {}; delete slot.tabletRules; }
  }
  next.nodes[node.nodeId] = node;
  if (slot) next.slots[slot.slotId] = slot;
  const childIds = next.nodes[parentId].childIds;
  const targetIndex = index === undefined
    ? childIds.length
    : Math.max(0, Math.min(Math.trunc(index), childIds.length));
  childIds.splice(targetIndex, 0, node.nodeId);
  syncPlacementForParent(next, node.nodeId, parentId, targetIndex);
  updateSlotSummary(next);
  assertValidOperationResult(next, definition);
  return { definition: next, nodeId: node.nodeId, ...(slot ? { slotId: slot.slotId } : {}) };
}

export function getDynamicTemplateAllowedInsertionParentIds(
  definition: TemplateDefinitionV2,
  childType: DynamicTemplateNodeType,
): string[] {
  return getDynamicTemplateInsertionLandings(definition, childType)
    .filter((landing) => landing.placement === "end" && !landing.disabledReason)
    .map((landing) => landing.parentId);
}

export type DynamicTemplateStructurePlacement = "before" | "after" | "inside" | "end";

export interface DynamicTemplateStructureLanding {
  landingId: string;
  parentId: string;
  targetNodeId: string;
  index: number;
  placement: DynamicTemplateStructurePlacement;
  parentPathLabel: string;
  pathLabel: string;
  disabledReason: string | null;
}

export function getDynamicTemplateStructureNodePathLabel(definition: TemplateDefinitionV2, nodeId: string) {
  const labels: string[] = [];
  let candidateId: string | null = nodeId;
  while (candidateId && candidateId !== definition.rootNodeId) {
    const node = definition.nodes[candidateId];
    if (!node) break;
    labels.unshift(node.name);
    candidateId = findParentId(definition, candidateId);
  }
  return labels.join(" / ") || "模板根节点";
}

function getDynamicTemplateInsertionLandingDisabledReason(
  definition: TemplateDefinitionV2,
  parentId: string,
  childType: DynamicTemplateNodeType,
  index: number,
) {
  const parent = definition.nodes[parentId];
  if (!parent) return "目标不存在";
  if (!canNestDynamicTemplateNode(parent.type, childType)) return "目标不接受这种对象";
  const lockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, parentId);
  if (lockOwnerId) return `“${definition.nodes[lockOwnerId]?.name ?? "目标"}”已锁定`;
  const next = cloneDefinition(definition);
  const targetIndex = Math.max(0, Math.min(Math.trunc(index), next.nodes[parentId].childIds.length));
  next.nodes[parentId].childIds.splice(targetIndex, 0, "__dynamic_template_insertion_preview__");
  return getDynamicTemplateStructureLockViolation(definition, next);
}

export function getDynamicTemplateInsertionLandings(
  definition: TemplateDefinitionV2,
  childType: DynamicTemplateNodeType,
  anchorNodeId?: string | null,
): DynamicTemplateStructureLanding[] {
  return Object.values(definition.nodes)
    .filter((candidate) => (
      getDynamicTemplateNodeRegistryEntry(candidate.type).kind === "structure"
      && canNestDynamicTemplateNode(candidate.type, childType)
    ))
    .flatMap((parent): DynamicTemplateStructureLanding[] => {
      const parentPath = getDynamicTemplateStructureNodePathLabel(definition, parent.nodeId);
      const endIndex = parent.childIds.length;
      const landings: DynamicTemplateStructureLanding[] = [{
        landingId: `${parent.nodeId}:end`,
        parentId: parent.nodeId,
        targetNodeId: parent.nodeId,
        index: endIndex,
        placement: "end",
        parentPathLabel: parentPath,
        pathLabel: `${parentPath} / 容器末尾`,
        disabledReason: getDynamicTemplateInsertionLandingDisabledReason(
          definition,
          parent.nodeId,
          childType,
          endIndex,
        ),
      }];
      if (anchorNodeId && findParentId(definition, anchorNodeId) === parent.nodeId) {
        const anchorIndex = parent.childIds.indexOf(anchorNodeId);
        const anchorLabel = definition.nodes[anchorNodeId]?.name ?? "当前对象";
        landings.unshift(
          {
            landingId: `${parent.nodeId}:${anchorNodeId}:before`,
            parentId: parent.nodeId,
            targetNodeId: anchorNodeId,
            index: anchorIndex,
            placement: "before",
            parentPathLabel: parentPath,
            pathLabel: `${parentPath} / “${anchorLabel}”之前`,
            disabledReason: getDynamicTemplateInsertionLandingDisabledReason(
              definition,
              parent.nodeId,
              childType,
              anchorIndex,
            ),
          },
          {
            landingId: `${parent.nodeId}:${anchorNodeId}:after`,
            parentId: parent.nodeId,
            targetNodeId: anchorNodeId,
            index: anchorIndex + 1,
            placement: "after",
            parentPathLabel: parentPath,
            pathLabel: `${parentPath} / “${anchorLabel}”之后`,
            disabledReason: getDynamicTemplateInsertionLandingDisabledReason(
              definition,
              parent.nodeId,
              childType,
              anchorIndex + 1,
            ),
          },
        );
      }
      return landings;
    });
}

function findDynamicTemplateRootChildId(
  definition: TemplateDefinitionV2,
  nodeId: string | null | undefined,
): string | null {
  let candidateId = nodeId ?? null;
  const visited = new Set<string>();
  while (candidateId && !visited.has(candidateId)) {
    visited.add(candidateId);
    const parentId = findParentId(definition, candidateId);
    if (parentId === definition.rootNodeId) return candidateId;
    candidateId = parentId;
  }
  return null;
}

export function getDynamicTemplateRegionInsertionLandings(
  definition: TemplateDefinitionV2,
  selectedNodeId?: string | null,
): DynamicTemplateStructureLanding[] {
  const topLevelRegionId = findDynamicTemplateRootChildId(definition, selectedNodeId);
  return getDynamicTemplateInsertionLandings(definition, "Container", topLevelRegionId)
    .filter((landing) => landing.parentId === definition.rootNodeId);
}

export function getDynamicTemplateAllowedMoveParentIds(
  definition: TemplateDefinitionV2,
  nodeId: string,
): string[] {
  return [...new Set(getDynamicTemplateMoveLandings(definition, nodeId)
    .filter((landing) => !landing.disabledReason)
    .map((landing) => landing.parentId))];
}

function normalizeDynamicTemplateMoveIndex(
  definition: TemplateDefinitionV2,
  nodeId: string,
  parentId: string,
  index: number,
) {
  const currentParentId = findParentId(definition, nodeId);
  const currentIndex = currentParentId
    ? definition.nodes[currentParentId].childIds.indexOf(nodeId)
    : -1;
  const boundedIndex = Math.max(0, Math.min(Math.trunc(index), definition.nodes[parentId]?.childIds.length ?? 0));
  return currentParentId === parentId && currentIndex >= 0 && currentIndex < boundedIndex
    ? boundedIndex - 1
    : boundedIndex;
}

function applyDynamicTemplateMove(
  definition: TemplateDefinitionV2,
  nodeId: string,
  parentId: string,
  index: number,
) {
  const currentParentId = findParentId(definition, nodeId)!;
  const next = cloneDefinition(definition);
  next.nodes[currentParentId].childIds = next.nodes[currentParentId].childIds.filter((id) => id !== nodeId);
  const targetChildren = next.nodes[parentId].childIds;
  const targetIndex = Math.max(0, Math.min(Math.trunc(index), targetChildren.length));
  targetChildren.splice(targetIndex, 0, nodeId);
  syncPlacementForParent(next, nodeId, parentId, targetIndex);
  return next;
}

export function getDynamicTemplateMoveLandingDisabledReason(
  definition: TemplateDefinitionV2,
  nodeId: string,
  landing: DynamicTemplateStructureLanding,
): string | null {
  const node = definition.nodes[nodeId];
  const parent = definition.nodes[landing.parentId];
  if (!node || nodeId === definition.rootNodeId) return "根节点或不存在的对象不能移动";
  if (!parent) return "目标不存在";
  const currentParentId = findParentId(definition, nodeId);
  if (!currentParentId) return "对象没有可用上级";

  const sourceLockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, nodeId);
  if (sourceLockOwnerId) return `“${definition.nodes[sourceLockOwnerId]?.name ?? node.name}”已锁定`;
  if (collectSubtreeNodeIds(definition, nodeId).has(landing.parentId)) return "不能移动到自身或后代对象";
  if (!canNestDynamicTemplateNode(parent.type, node.type)) return "目标不接受这种对象";

  if (landing.placement === "before" || landing.placement === "after") {
    if (landing.targetNodeId === nodeId || !parent.childIds.includes(landing.targetNodeId)) return "参照对象已经失效";
  } else if (landing.targetNodeId !== landing.parentId) {
    return "容器落点已经失效";
  }

  const targetLockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, landing.parentId);
  if (targetLockOwnerId) return `“${definition.nodes[targetLockOwnerId]?.name ?? parent.name}”已锁定`;

  const currentIndex = definition.nodes[currentParentId].childIds.indexOf(nodeId);
  const targetIndex = normalizeDynamicTemplateMoveIndex(
    definition,
    nodeId,
    landing.parentId,
    landing.index,
  );
  if (currentParentId === landing.parentId && currentIndex === targetIndex) return "对象已在该位置";

  const next = applyDynamicTemplateMove(definition, nodeId, landing.parentId, targetIndex);
  return getDynamicTemplateStructureLockViolation(definition, next);
}

export function getDynamicTemplateMoveLandings(
  definition: TemplateDefinitionV2,
  nodeId: string,
): DynamicTemplateStructureLanding[] {
  const node = definition.nodes[nodeId];
  if (!node || nodeId === definition.rootNodeId) return [];
  return Object.values(definition.nodes)
    .filter((candidate) => getDynamicTemplateNodeRegistryEntry(candidate.type).kind === "structure")
    .flatMap((parent): DynamicTemplateStructureLanding[] => {
      const parentPath = getDynamicTemplateStructureNodePathLabel(definition, parent.nodeId);
      const siblingIds = parent.childIds.filter((childId) => childId !== nodeId);
      const landings = siblingIds.flatMap((targetNodeId): DynamicTemplateStructureLanding[] => {
        const targetName = definition.nodes[targetNodeId]?.name ?? "对象";
        const candidates: DynamicTemplateStructureLanding[] = [
          {
            landingId: `${parent.nodeId}:${targetNodeId}:before`,
            parentId: parent.nodeId,
            targetNodeId,
            index: parent.childIds.indexOf(targetNodeId),
            placement: "before",
            parentPathLabel: parentPath,
            pathLabel: `${parentPath} / “${targetName}”之前`,
            disabledReason: null,
          },
          {
            landingId: `${parent.nodeId}:${targetNodeId}:after`,
            parentId: parent.nodeId,
            targetNodeId,
            index: parent.childIds.indexOf(targetNodeId) + 1,
            placement: "after",
            parentPathLabel: parentPath,
            pathLabel: `${parentPath} / “${targetName}”之后`,
            disabledReason: null,
          },
        ];
        return candidates.map((landing) => ({
          ...landing,
          disabledReason: getDynamicTemplateMoveLandingDisabledReason(definition, nodeId, landing),
        }));
      });
      const insideLanding: DynamicTemplateStructureLanding = {
        landingId: `${parent.nodeId}:inside`,
        parentId: parent.nodeId,
        targetNodeId: parent.nodeId,
        index: parent.childIds.length,
        placement: "inside",
        parentPathLabel: parentPath,
        pathLabel: `${parentPath} / 移入容器末尾`,
        disabledReason: null,
      };
      insideLanding.disabledReason = getDynamicTemplateMoveLandingDisabledReason(definition, nodeId, insideLanding);
      landings.push(insideLanding);
      return landings;
    });
}

export function resolveDynamicTemplateMoveLanding(
  definition: TemplateDefinitionV2,
  nodeId: string,
  selector: { landingId: string } | {
    targetNodeId: string;
    placement: Exclude<DynamicTemplateStructurePlacement, "end">;
  },
): DynamicTemplateStructureLanding | null {
  return getDynamicTemplateMoveLandings(definition, nodeId).find((landing) => (
    "landingId" in selector
      ? landing.landingId === selector.landingId
      : landing.targetNodeId === selector.targetNodeId && landing.placement === selector.placement
  )) ?? null;
}

export type DynamicTemplateMoveShortcut = "up" | "down" | "indent" | "outdent";

export function resolveDynamicTemplateMoveShortcutLanding(
  definition: TemplateDefinitionV2,
  nodeId: string,
  shortcut: DynamicTemplateMoveShortcut,
): DynamicTemplateStructureLanding | null {
  const parentId = findParentId(definition, nodeId);
  if (!parentId) return null;
  const siblings = definition.nodes[parentId].childIds;
  const currentIndex = siblings.indexOf(nodeId);
  if (currentIndex < 0) return null;

  if (shortcut === "up") {
    const previousSiblingId = siblings[currentIndex - 1];
    return previousSiblingId
      ? resolveDynamicTemplateMoveLanding(definition, nodeId, {
        targetNodeId: previousSiblingId,
        placement: "before",
      })
      : null;
  }
  if (shortcut === "down") {
    const nextSiblingId = siblings[currentIndex + 1];
    return nextSiblingId
      ? resolveDynamicTemplateMoveLanding(definition, nodeId, {
        targetNodeId: nextSiblingId,
        placement: "after",
      })
      : null;
  }
  if (shortcut === "indent") {
    const previousSiblingId = siblings[currentIndex - 1];
    return previousSiblingId
      ? resolveDynamicTemplateMoveLanding(definition, nodeId, {
        targetNodeId: previousSiblingId,
        placement: "inside",
      })
      : null;
  }
  return resolveDynamicTemplateMoveLanding(definition, nodeId, {
    targetNodeId: parentId,
    placement: "after",
  });
}

export function moveDynamicTemplateNodeToLanding(
  definition: TemplateDefinitionV2,
  nodeId: string,
  landing: DynamicTemplateStructureLanding,
): TemplateDefinitionV2 {
  const currentLanding = resolveDynamicTemplateMoveLanding(definition, nodeId, { landingId: landing.landingId });
  if (!currentLanding) throw new DynamicTemplateOperationError("ILLEGAL_MOVE_TARGET", "移动落点已经失效");
  if (currentLanding.disabledReason) {
    throw new DynamicTemplateOperationError("ILLEGAL_MOVE_TARGET", currentLanding.disabledReason);
  }
  const targetIndex = normalizeDynamicTemplateMoveIndex(
    definition,
    nodeId,
    currentLanding.parentId,
    currentLanding.index,
  );
  const next = applyDynamicTemplateMove(definition, nodeId, currentLanding.parentId, targetIndex);
  assertValidOperationResult(next, definition);
  return next;
}

export type DynamicTemplateLayoutGroupKind = "vertical" | "horizontal" | "columns" | "empty";

export function getDynamicTemplateLayoutGroupNodeType(kind: DynamicTemplateLayoutGroupKind): DynamicTemplateNodeType {
  if (kind === "horizontal") return "Row";
  if (kind === "columns") return "Grid";
  return "Stack";
}

function getLayoutGroupName(kind: DynamicTemplateLayoutGroupKind) {
  return {
    vertical: "上下布局组",
    horizontal: "左右布局组",
    columns: "分列布局组",
    empty: "空布局组",
  }[kind];
}

export function addDynamicTemplateLayoutGroup(
  definition: TemplateDefinitionV2,
  parentId: string,
  kind: DynamicTemplateLayoutGroupKind,
  index?: number,
): { definition: TemplateDefinitionV2; nodeId: string } {
  const type = getDynamicTemplateLayoutGroupNodeType(kind);
  const result = addDynamicTemplateNode(definition, parentId, type, index);
  const next = cloneDefinition(result.definition);
  next.nodes[result.nodeId].name = getLayoutGroupName(kind);
  assertValidOperationResult(next, definition);
  return { definition: next, nodeId: result.nodeId };
}

export function groupDynamicTemplateNodes(
  definition: TemplateDefinitionV2,
  nodeIds: readonly string[],
  kind: Exclude<DynamicTemplateLayoutGroupKind, "empty">,
): { definition: TemplateDefinitionV2; nodeId: string } {
  const uniqueNodeIds = [...new Set(nodeIds)];
  if (uniqueNodeIds.length === 0 || uniqueNodeIds.includes(definition.rootNodeId)) {
    throw new DynamicTemplateOperationError("INVALID_GROUP_SELECTION", "请选择可组合的同级对象。");
  }
  const parentId = findParentId(definition, uniqueNodeIds[0]);
  if (!parentId || uniqueNodeIds.some((nodeId) => findParentId(definition, nodeId) !== parentId)) {
    throw new DynamicTemplateOperationError("GROUP_REQUIRES_SIBLINGS", "只能组合位于同一上级的对象。");
  }
  const siblings = definition.nodes[parentId].childIds;
  const orderedNodeIds = siblings.filter((nodeId) => uniqueNodeIds.includes(nodeId));
  const firstIndex = siblings.indexOf(orderedNodeIds[0]);
  if (
    orderedNodeIds.length !== uniqueNodeIds.length
    || orderedNodeIds.some((nodeId, offset) => siblings[firstIndex + offset] !== nodeId)
  ) {
    throw new DynamicTemplateOperationError("GROUP_REQUIRES_CONTIGUOUS_SIBLINGS", "只能组合连续排列的同级对象。");
  }
  const groupType = getDynamicTemplateLayoutGroupNodeType(kind);
  const parent = definition.nodes[parentId];
  if (!canNestDynamicTemplateNode(parent.type, groupType)) {
    throw new DynamicTemplateOperationError("ILLEGAL_NESTING", "当前上级不接受这种布局分组。");
  }
  if (orderedNodeIds.some((nodeId) => !canNestDynamicTemplateNode(groupType, definition.nodes[nodeId].type))) {
    throw new DynamicTemplateOperationError("ILLEGAL_NESTING", "所选对象不能无损放入这种布局分组。");
  }

  const next = cloneDefinition(definition);
  const group = createDynamicTemplateNode(groupType, getLayoutGroupName(kind));
  if (definition.schemaVersion >= 2) { group.responsive.mobile = {}; delete group.responsive.tablet; }
  group.childIds = [...orderedNodeIds];
  next.nodes[group.nodeId] = group;
  next.nodes[parentId].childIds.splice(firstIndex, orderedNodeIds.length, group.nodeId);
  syncPlacementForParent(next, group.nodeId, parentId, firstIndex);
  orderedNodeIds.forEach((nodeId, index) => syncPlacementForParent(next, nodeId, group.nodeId, index));
  assertValidOperationResult(next, definition);
  return { definition: next, nodeId: group.nodeId };
}

export function ungroupDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
): TemplateDefinitionV2 {
  if (nodeId === definition.rootNodeId) {
    throw new DynamicTemplateOperationError("ROOT_CANNOT_UNGROUP", "模板根节点不能解除分组。");
  }
  const node = definition.nodes[nodeId];
  const parentId = findParentId(definition, nodeId);
  if (!node || !parentId || getDynamicTemplateNodeRegistryEntry(node.type).kind !== "structure") {
    throw new DynamicTemplateOperationError("INVALID_GROUP", "要解除的布局分组不存在。");
  }
  const parent = definition.nodes[parentId];
  if (node.childIds.some((childId) => !canNestDynamicTemplateNode(parent.type, definition.nodes[childId].type))) {
    throw new DynamicTemplateOperationError("ILLEGAL_NESTING", "上级不能直接接收该分组中的对象。");
  }
  const next = cloneDefinition(definition);
  const index = next.nodes[parentId].childIds.indexOf(nodeId);
  next.nodes[parentId].childIds.splice(index, 1, ...node.childIds);
  delete next.nodes[nodeId];
  node.childIds.forEach((childId, childIndex) => (
    syncPlacementForParent(next, childId, parentId, index + childIndex)
  ));
  assertValidOperationResult(next, definition);
  return next;
}

export function getDynamicTemplateGroupDisabledReason(
  definition: TemplateDefinitionV2,
  nodeIds: readonly string[],
  kind: Exclude<DynamicTemplateLayoutGroupKind, "empty">,
): string | null {
  try {
    groupDynamicTemplateNodes(definition, nodeIds, kind);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "所选对象不能组合为布局分组";
  }
}

function assertDynamicTemplateOperationAddsNoValidationErrors(
  definition: TemplateDefinitionV2,
  previous: TemplateDefinitionV2,
  plan: DynamicTemplateResponsivePlan,
) {
  const node = previous.nodes[plan.nodeId];
  const slotRulesKey = plan.targetDevice === "desktop" ? "desktopRules" : "mobileRules";
  const validationScopes = new Set<string>();
  for (const change of plan.changes) {
    if (change.field.startsWith("responsive.")) {
      validationScopes.add(`nodes.${plan.nodeId}.responsive.${plan.targetDevice}`);
      if (plan.nodeId === previous.rootNodeId) validationScopes.add("metadata");
    } else if (change.field.startsWith("slotRules.") && node?.slotId) {
      validationScopes.add(`slots.${node.slotId}.${slotRulesKey}`);
    } else if (change.field.startsWith("role.")) {
      validationScopes.add(`nodes.${plan.nodeId}.props.contentTemplateLayoutData`);
    }
  }
  const touchesValidationScope = (path: string) => [...validationScopes].some((scope) => (
    path === ""
    || path === scope
    || path.startsWith(`${scope}.`)
    || scope.startsWith(`${path}.`)
  ));
  const canRetainUnchangedParentLayoutError = () => {
    const targetRoleId = plan.targetRoleId ?? plan.roleId;
    if (!targetRoleId || !plan.changes.some((change) => change.field.startsWith("role."))) return false;
    const nextNode = definition.nodes[plan.nodeId];
    const previousNode = previous.nodes[plan.nodeId];
    const slot = nextNode?.slotId ? definition.slots[nextNode.slotId] : undefined;
    const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
    if (!nextNode || !previousNode || !moduleType) return false;
    const nextLayout = nextNode.props.contentTemplateLayoutData;
    const previousLayout = previousNode.props.contentTemplateLayoutData;
    const nextSanitized = sanitizeContentTemplateLayoutData(moduleType, nextLayout);
    const previousSanitized = sanitizeContentTemplateLayoutData(moduleType, previousLayout);
    if (!isVisualRecord(nextLayout) || !isVisualRecord(previousLayout) || !nextSanitized || !previousSanitized) return false;
    const roleValue = (layout: unknown) => {
      if (!isVisualRecord(layout) || !isVisualRecord(layout.nodes)) return undefined;
      return layout.nodes[targetRoleId];
    };
    const withoutTargetRole = (layout: unknown) => {
      const copy = structuredClone(layout);
      if (isVisualRecord(copy) && isVisualRecord(copy.nodes)) delete copy.nodes[targetRoleId];
      return copy;
    };
    return isDeterministicDeepEqual(roleValue(nextLayout), roleValue(nextSanitized))
      && isDeterministicDeepEqual(withoutTargetRole(previousLayout), withoutTargetRole(nextLayout))
      && isDeterministicDeepEqual(withoutTargetRole(previousSanitized), withoutTargetRole(nextSanitized));
  };
  const retainedParentLayoutError = canRetainUnchangedParentLayoutError();
  const parentLayoutPath = `nodes.${plan.nodeId}.props.contentTemplateLayoutData`;
  const issueIdentity = (issue: ReturnType<typeof validateDynamicTemplateDefinition>["issues"][number]) => (
    stableTemplateInspectorBatchValue({
      code: issue.code,
      path: issue.path,
      message: issue.message,
      nodeId: issue.nodeId,
      slotId: issue.slotId,
    })
  );
  const remainingPreviousErrors = new Map<string, number>();
  for (const issue of validateDynamicTemplateDefinition(previous).issues) {
    if (issue.level !== "error") continue;
    const identity = issueIdentity(issue);
    remainingPreviousErrors.set(identity, (remainingPreviousErrors.get(identity) ?? 0) + 1);
  }
  const firstNewError = validateDynamicTemplateDefinition(definition).issues
    .filter((issue) => issue.level === "error")
    .find((issue) => {
      if (touchesValidationScope(issue.path)
        && !(retainedParentLayoutError
          && issue.code === "INVALID_CONTENT_TEMPLATE_LAYOUT"
          && issue.path === parentLayoutPath)) return true;
      const identity = issueIdentity(issue);
      const remaining = remainingPreviousErrors.get(identity) ?? 0;
      if (remaining === 0) return true;
      remainingPreviousErrors.set(identity, remaining - 1);
      return false;
    });
  if (firstNewError) {
    throw new DynamicTemplateOperationError(
      "INVALID_OPERATION_RESULT",
      `操作生成了新的非法模板状态：${firstNewError.message}`,
    );
  }
}

function hasIndependentHeight(rules: DynamicTemplateResponsiveRules) {
  return ["fixed", "min-height", "viewport", "aspect-ratio"].includes(rules.height.mode)
    || Boolean(rules.minHeight && rules.minHeight.value > 0 && rules.minHeight.unit !== "%");
}

function collectLayoutRelationshipErrors(definition: TemplateDefinitionV2) {
  if (definition.schemaVersion < 2) return [];
  const issues: Array<{ key: string; message: string }> = [];
  for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
    for (const parent of Object.values(definition.nodes)) {
      if (!parent.childIds.length || parent.hidden) continue;
      const parentRules = resolveTemplateNodeRules(definition, parent.nodeId, breakpoint);
      if (parentRules.display === "none" || parentRules.hidden) continue;
      const children = parent.childIds.flatMap((nodeId) => {
        const node = definition.nodes[nodeId];
        if (!node || node.hidden) return [];
        const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
        return rules.display === "none" || rules.hidden ? [] : [{ node, rules }];
      });
      if (!children.length) continue;
      if (parentRules.layoutMode === "free" && !hasIndependentHeight(parentRules)) {
        issues.push({ key: `${breakpoint}:${parent.nodeId}:free-height`, message: `“${parent.name}”的自由布局需要固定、最小或比例高度，请先设置容器高度。` });
      }
      const inFlowChildren = parentRules.layoutMode === "free" ? [] : children.filter(({ rules }) => !rules.anchor);
      if (children.some(({ rules }) => rules.anchor) && !inFlowChildren.length && !hasIndependentHeight(parentRules)) {
        issues.push({ key: `${breakpoint}:${parent.nodeId}:anchor-height`, message: `“${parent.name}”只有叠放对象，需要先设置容器高度。` });
      }
      for (const { node, rules } of inFlowChildren) {
        if (rules.width === "fill" && parentRules.width === "fit") {
          issues.push({ key: `${breakpoint}:${node.nodeId}:fill-width`, message: `“${node.name}”不能填满适应内容宽度的父容器，请先确定父容器宽度。` });
        }
        if (rules.height.mode === "fill" && ["auto", "fit"].includes(parentRules.height.mode) && !hasIndependentHeight(parentRules)) {
          issues.push({ key: `${breakpoint}:${node.nodeId}:fill-height`, message: `“${node.name}”不能填满随内容变化高度的父容器，请先确定父容器高度。` });
        }
      }
    }
  }
  return issues;
}

/** 布局转换只提交明确的排列意图；自由矩形必须由画布测量后显式提供。 */
export function convertDynamicTemplateLayout(
  definition: TemplateDefinitionV2,
  input: Omit<Extract<DynamicTemplateDefinitionCommand, { type: "convert-layout" }>, "type" | "label">,
): TemplateDefinitionV2 {
  const node = definition.nodes[input.nodeId];
  if (!node || !getDynamicTemplateNodeRegistryEntry(node.type).canHaveChildren) {
    throw new DynamicTemplateOperationError("LAYOUT_CONTAINER_REQUIRED", "请选择区域或布局组后调整排列方式。");
  }
  if (definition.schemaVersion === 1) throw new DynamicTemplateOperationError("LEGACY_LAYOUT_CONVERSION_UNSUPPORTED", "旧模板继续使用原有布局配置，不自动转换布局模型。");
  const next = cloneDefinition(definition);
  const previous = resolveTemplateNodeRules(definition, node.nodeId, input.breakpoint);
  if (input.layout === "free") {
    if (node.type !== "Stack") throw new DynamicTemplateOperationError("FREE_LAYOUT_REQUIRES_STACK", "自由排列只用于叠放布局组，请先选择叠放布局组。");
    if (node.childIds.some((nodeId) => !input.placements?.[nodeId])) {
      throw new DynamicTemplateOperationError("LAYOUT_GEOMETRY_REQUIRED", "请先预览全部子对象的位置，再确认自由排列。");
    }
    setTemplateNodeRule(next, node.nodeId, input.breakpoint, "layoutMode", "free");
    if (input.height) setTemplateNodeRule(next, node.nodeId, input.breakpoint, "height", input.height);
    if (!hasIndependentHeight(resolveTemplateNodeRules(next, node.nodeId, input.breakpoint))) {
      throw new DynamicTemplateOperationError("LAYOUT_HEIGHT_REQUIRED", "请为自由布局设置固定、最小或比例高度。");
    }
    for (const childId of node.childIds) {
      clearPositionRule(next, childId, input.breakpoint, "anchor");
      setTemplateNodeRule(next, childId, input.breakpoint, "placement", input.placements![childId]);
    }
  } else {
    if (previous.layoutMode === "free") {
      setTemplateNodeRule(next, node.nodeId, input.breakpoint, "layoutMode", "flow");
      for (const childId of node.childIds) clearPositionRule(next, childId, input.breakpoint, "placement");
    }
    setTemplateNodeRule(next, node.nodeId, input.breakpoint, "display", input.layout === "grid" ? "grid" : "flex");
    if (input.layout === "grid") {
      const columns = input.columns ?? [1, 1, 1];
      if (!columns.length || columns.length > 12 || columns.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new DynamicTemplateOperationError("INVALID_GRID_COLUMNS", "网格需要 1 至 12 列，每列比例必须大于零。");
      }
      setTemplateNodeRule(next, node.nodeId, input.breakpoint, "columns", columns);
    } else {
      setTemplateNodeRule(next, node.nodeId, input.breakpoint, "direction", input.layout === "vertical" ? "column" : "row");
      setTemplateNodeRule(next, node.nodeId, input.breakpoint, "wrap", input.layout === "wrap" ? "wrap" : "nowrap");
    }
  }
  assertValidOperationResult(next, definition);
  return next;
}

export function getDynamicTemplateUngroupDisabledReason(
  definition: TemplateDefinitionV2,
  nodeId: string,
): string | null {
  try {
    ungroupDynamicTemplateNode(definition, nodeId);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "当前布局分组不能解除";
  }
}

export function renameDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
  name: string,
): TemplateDefinitionV2 {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) {
    throw new DynamicTemplateOperationError("INVALID_NODE_NAME", "节点名称必须为 1–100 个字符。");
  }
  if (!definition.nodes[nodeId]) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要重命名的节点不存在。");
  }
  const next = cloneDefinition(definition);
  next.nodes[nodeId].name = trimmed;
  assertDynamicTemplateStructureLocksPreserved(definition, next);
  return next;
}

export function setDynamicTemplateNodeHidden(
  definition: TemplateDefinitionV2,
  nodeId: string,
  hidden: boolean,
): TemplateDefinitionV2 {
  if (nodeId === definition.rootNodeId) {
    throw new DynamicTemplateOperationError("ROOT_CANNOT_HIDE", "模板根节点不能隐藏。");
  }
  if (!definition.nodes[nodeId]) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要隐藏的节点不存在。");
  }
  const next = cloneDefinition(definition);
  next.nodes[nodeId].hidden = hidden;
  assertDynamicTemplateStructureLocksPreserved(definition, next);
  return next;
}

export function updateDynamicTemplateNodeRules(
  definition: TemplateDefinitionV2,
  nodeId: string,
  device: TemplateBreakpoint,
  update: (rules: DynamicTemplateResponsiveRules) => void,
): TemplateDefinitionV2 {
  if (!definition.nodes[nodeId]) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要修改的节点不存在。");
  }
  const next = cloneDefinition(definition);
  const before = resolveTemplateNodeRules(definition, nodeId, device);
  const after = structuredClone(before);
  update(after);
  applyResponsiveRuleDifferences(before, after, (path, value) => {
    if (value === undefined) removeOptionalNodeRule(next, nodeId, device, path);
    else setTemplateNodeRule(next, nodeId, device, path, value);
  });
  assertValidOperationResult(next, definition);
  return next;
}

export function moveDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
  nextParentId: string,
  index?: number,
): TemplateDefinitionV2 {
  if (nodeId === definition.rootNodeId) {
    throw new DynamicTemplateOperationError("ROOT_CANNOT_MOVE", "模板根节点不能移动。");
  }
  const node = definition.nodes[nodeId];
  const nextParent = definition.nodes[nextParentId];
  if (!node || !nextParent) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "移动节点或目标父节点不存在。");
  }
  if (collectSubtreeNodeIds(definition, nodeId).has(nextParentId)) {
    throw new DynamicTemplateOperationError("MOVE_WOULD_CREATE_CYCLE", "不能把节点移动到自己的后代节点中。");
  }
  if (!canNestDynamicTemplateNode(nextParent.type, node.type)) {
    throw new DynamicTemplateOperationError("ILLEGAL_NESTING", "目标父节点不接受此节点类型。");
  }
  const currentParentId = findParentId(definition, nodeId);
  if (!currentParentId) throw new DynamicTemplateOperationError("ORPHAN_NODE", "节点没有可用父节点。");
  const next = cloneDefinition(definition);
  next.nodes[currentParentId].childIds = next.nodes[currentParentId].childIds.filter((id) => id !== nodeId);
  const targetChildren = next.nodes[nextParentId].childIds;
  const targetIndex = index === undefined
    ? targetChildren.length
    : Math.max(0, Math.min(Math.trunc(index), targetChildren.length));
  targetChildren.splice(targetIndex, 0, nodeId);
  syncPlacementForParent(next, nodeId, nextParentId, targetIndex);
  assertValidOperationResult(next, definition);
  return next;
}

export function reorderDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
  nextIndex: number,
): TemplateDefinitionV2 {
  const parentId = findParentId(definition, nodeId);
  if (!parentId) throw new DynamicTemplateOperationError("ROOT_CANNOT_REORDER", "根节点不能进行同级排序。");
  const next = cloneDefinition(definition);
  const childIds = next.nodes[parentId].childIds;
  const currentIndex = childIds.indexOf(nodeId);
  if (currentIndex < 0) throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "排序节点不存在。");
  childIds.splice(currentIndex, 1);
  childIds.splice(Math.max(0, Math.min(Math.trunc(nextIndex), childIds.length)), 0, nodeId);
  assertDynamicTemplateStructureLocksPreserved(definition, next);
  return next;
}

export function removeDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
): TemplateDefinitionV2 {
  if (nodeId === definition.rootNodeId) {
    throw new DynamicTemplateOperationError("ROOT_CANNOT_DELETE", "模板根节点不能删除。");
  }
  const parentId = findParentId(definition, nodeId);
  if (!definition.nodes[nodeId] || !parentId) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要删除的节点不存在或没有父节点。");
  }
  const next = cloneDefinition(definition);
  const subtree = collectSubtreeNodeIds(next, nodeId);
  const requiredSlot = [...subtree].map((id) => next.nodes[id]?.slotId)
    .map((id) => id ? next.slots[id] : undefined).find((slot) => slot?.required);
  if (requiredSlot) {
    throw new DynamicTemplateOperationError("REQUIRED_SLOT_CANNOT_DELETE", `“${requiredSlot.label}”是必填槽位，不能删除该槽位或其所属区域。请先取消必填设置。`);
  }
  next.nodes[parentId].childIds = next.nodes[parentId].childIds.filter((id) => id !== nodeId);
  for (const childId of subtree) {
    const slotId = next.nodes[childId]?.slotId;
    if (slotId) {
      delete next.slots[slotId];
      delete next.defaultContent[slotId];
      if (next.previewContent) delete next.previewContent[slotId];
    }
    delete next.nodes[childId];
  }
  updateSlotSummary(next);
  assertValidOperationResult(next, definition);
  return next;
}

export function duplicateDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
): { definition: TemplateDefinitionV2; nodeId: string } {
  if (nodeId === definition.rootNodeId) {
    throw new DynamicTemplateOperationError("ROOT_CANNOT_DUPLICATE", "模板根节点不能复制。");
  }
  const parentId = findParentId(definition, nodeId);
  if (!definition.nodes[nodeId] || !parentId) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要复制的节点不存在或没有父节点。");
  }
  const lockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, nodeId);
  if (lockOwnerId) {
    throw new DynamicTemplateOperationError(
      "STRUCTURE_LOCKED",
      `“${definition.nodes[lockOwnerId].name}”已锁定，请先解除锁定。`,
    );
  }
  const next = cloneDefinition(definition);
  const sourceIds = [...collectSubtreeNodeIds(next, nodeId)];
  const nodeIdMap = new Map<string, string>();
  const slotIdMap = new Map<string, string>();

  for (const sourceId of sourceIds) {
    const sourceNode = next.nodes[sourceId];
    const clonedNode = createDynamicTemplateNode(sourceNode.type, `${sourceNode.name} 副本`);
    nodeIdMap.set(sourceId, clonedNode.nodeId);
    if (sourceNode.slotId) {
      const sourceSlot = next.slots[sourceNode.slotId];
      const clonedSlot = createDynamicTemplateSlotDefinition(
        sourceSlot.type,
        `${sourceSlot.label} 副本`,
        createUniqueSlotKey(next, sourceNode.type),
      );
      slotIdMap.set(sourceNode.slotId, clonedSlot.slotId);
      next.slots[clonedSlot.slotId] = {
        ...structuredClone(sourceSlot),
        slotId: clonedSlot.slotId,
        key: clonedSlot.key,
        label: clonedSlot.label,
      };
      if (Number(definition.schemaVersion) >= 3 && Object.prototype.hasOwnProperty.call(next.defaultContent, sourceNode.slotId)) {
        next.defaultContent[clonedSlot.slotId] = structuredClone(next.defaultContent[sourceNode.slotId]);
      }
      if (Number(definition.schemaVersion) < 3 && next.slots[clonedSlot.slotId].emptyPolicy === "use-default") {
        next.slots[clonedSlot.slotId].emptyPolicy = "hide";
      }
    }
  }

  for (const sourceId of sourceIds) {
    const sourceNode = next.nodes[sourceId];
    const clonedId = nodeIdMap.get(sourceId)!;
    next.nodes[clonedId] = {
      ...structuredClone(sourceNode),
      nodeId: clonedId,
      name: `${sourceNode.name} 副本`,
      ...(sourceNode.slotId ? { slotId: slotIdMap.get(sourceNode.slotId)! } : {}),
      childIds: sourceNode.childIds.map((childId) => nodeIdMap.get(childId)!),
    };
  }

  const clonedRootId = nodeIdMap.get(nodeId)!;
  const siblings = next.nodes[parentId].childIds;
  siblings.splice(siblings.indexOf(nodeId) + 1, 0, clonedRootId);
  updateSlotSummary(next);
  assertValidOperationResult(next, definition);
  return { definition: next, nodeId: clonedRootId };
}
