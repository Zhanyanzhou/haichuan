import type {
  DynamicTemplateDevice,
  DynamicTemplateNode,
  DynamicTemplateResponsiveOverride,
  DynamicTemplateResponsiveRules,
  DynamicTemplateSlotRules,
  TemplateBreakpoint,
  TemplateDefinitionV2,
} from "./generated/templateDefinition.generated";

export type { TemplateBreakpoint } from "./generated/templateDefinition.generated";

const MEMBER_GROUPS = new Set(["padding", "margin", "placement"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);
const clone = <T,>(value: T): T => structuredClone(value);

/** 只合并合同指定的成员组；长度、height、anchor 等保持原子语义。校验器也复用。 */
export function mergeTemplateResponsiveRecord(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base, ...override };
  for (const key of MEMBER_GROUPS) {
    if (!Object.prototype.hasOwnProperty.call(override, key) || !isRecord(override[key])) continue;
    const initial = isRecord(base[key]) ? base[key] : key === "padding" || key === "margin"
      ? Object.fromEntries(["top", "right", "bottom", "left"].map((side) => [side, { value: 0, unit: "px" }]))
      : {};
    result[key] = { ...initial, ...override[key] };
  }
  // 显式退出定位与恢复继承是不同操作；null 不进入有效渲染规则。
  for (const key of ["anchor", "placement"]) if (override[key] === null) delete result[key];
  return result;
}

export function resolveTemplateBreakpoint(
  definition: Pick<TemplateDefinitionV2, "schemaVersion" | "metadata">,
  width: number,
): TemplateBreakpoint {
  if (!Number.isFinite(width) || width <= 0) throw new Error("画布宽度必须是正数。");
  if (definition.schemaVersion === 1) {
    const boundary = Math.min(1024, Math.max(480, Math.round(definition.metadata.mobileBreakpoint ?? 767)));
    return width <= boundary ? "mobile" : "desktop";
  }
  return width <= 767 ? "mobile" : width < 1024 ? "tablet" : "desktop";
}

export function resolveTemplateNodeRules(
  definition: TemplateDefinitionV2,
  nodeId: string,
  breakpoint: TemplateBreakpoint,
): DynamicTemplateResponsiveRules {
  const node = definition.nodes[nodeId];
  if (!node) throw new Error("当前对象不存在。");
  if (definition.schemaVersion === 1) {
    // v1 的完整性由版本化 validator 保证，不从 Desktop 合并旧 Mobile。
    return clone(node.responsive[breakpoint === "mobile" ? "mobile" : "desktop"]) as DynamicTemplateResponsiveRules;
  }
  let rules = node.responsive.desktop as unknown as Record<string, unknown>;
  if (breakpoint !== "desktop") {
    rules = mergeTemplateResponsiveRecord(rules, node.responsive.tablet ?? {});
  }
  if (breakpoint === "mobile") rules = mergeTemplateResponsiveRecord(rules, node.responsive.mobile);
  return clone(rules) as unknown as DynamicTemplateResponsiveRules;
}

export function resolveTemplateSlotRules(
  definition: TemplateDefinitionV2,
  slotId: string,
  breakpoint: TemplateBreakpoint,
): DynamicTemplateSlotRules {
  const slot = definition.slots[slotId];
  if (!slot) throw new Error("当前内容字段不存在。");
  if (definition.schemaVersion === 1) return clone(breakpoint === "mobile" ? slot.mobileRules : slot.desktopRules);
  return clone({
    ...slot.desktopRules,
    ...(breakpoint !== "desktop" ? slot.tabletRules : {}),
    ...(breakpoint === "mobile" ? slot.mobileRules : {}),
  });
}

export type ResolvedTemplateDefinition = Omit<TemplateDefinitionV2, "nodes"> & {
  nodes: Record<string, Omit<DynamicTemplateNode, "responsive"> & {
    responsive: Record<DynamicTemplateDevice, DynamicTemplateResponsiveRules>;
  }>;
};

/**
 * 给旧只读消费者的完整投影；两个旧设备槽位均表示当前断点的有效结果。
 * 不得作为编辑会话文档或 Repository 保存参数，否则会丢失继承意图。
 */
export function resolveTemplateDefinitionForBreakpoint(
  definition: TemplateDefinitionV2,
  breakpoint: TemplateBreakpoint,
): ResolvedTemplateDefinition {
  const projected = clone(definition);
  for (const node of Object.values(projected.nodes)) {
    const rules = resolveTemplateNodeRules(definition, node.nodeId, breakpoint);
    node.responsive = { desktop: rules, mobile: clone(rules) };
  }
  for (const slot of Object.values(projected.slots)) {
    const rules = resolveTemplateSlotRules(definition, slot.slotId, breakpoint);
    slot.desktopRules = rules;
    slot.mobileRules = clone(rules);
    delete slot.tabletRules;
  }
  return projected as ResolvedTemplateDefinition;
}

function checkedPath(path: string | readonly string[]): string[] {
  const parts = typeof path === "string" ? path.split(".") : [...path];
  if (!path || parts.length > 3 || parts.some((part) => !part || FORBIDDEN_KEYS.has(part))) {
    throw new Error("属性路径无效。");
  }
  return parts;
}

function localNodeRules(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint) {
  if (definition.schemaVersion === 1 && breakpoint === "tablet") throw new Error("旧模板没有平板覆盖；请使用原有桌面或移动规则。");
  const node = definition.nodes[nodeId];
  if (!node) throw new Error("当前对象不存在。");
  if (breakpoint === "tablet") node.responsive.tablet ??= {};
  return node.responsive[breakpoint]! as unknown as Record<string, unknown>;
}

function writePath(
  target: Record<string, unknown>,
  effective: Record<string, unknown>,
  path: string | readonly string[],
  value: unknown,
  memberSparse = true,
) {
  const parts = checkedPath(path);
  if (value === undefined) throw new Error("请使用恢复继承删除覆盖，不得保存 undefined。");
  const [key, member, leaf] = parts;
  if (parts.length === 1) { target[key] = clone(value); return; }
  const inherited = effective[key] ?? (key === "padding" || key === "margin"
    ? Object.fromEntries(["top", "right", "bottom", "left"].map((side) => [side, { value: 0, unit: "px" }]))
    : undefined);
  if (!isRecord(inherited)) throw new Error("当前属性不支持成员编辑。");
  const group = MEMBER_GROUPS.has(key);
  const next = group && memberSparse ? { ...(isRecord(target[key]) ? target[key] : {}) } : clone(inherited);
  if (leaf) {
    if (!isRecord(inherited[member])) throw new Error("当前属性成员不支持数值编辑。");
    next[member] = { ...clone(inherited[member]), [leaf]: clone(value) };
  } else next[member] = clone(value);
  target[key] = next;
}

/** 仅在命令持有的草稿副本中调用；命令提交前仍须完整验证。 */
export function setTemplateNodeRule(
  definition: TemplateDefinitionV2,
  nodeId: string,
  breakpoint: TemplateBreakpoint,
  path: string | readonly string[],
  value: unknown,
): void {
  const effective = resolveTemplateNodeRules(definition, nodeId, breakpoint);
  writePath(localNodeRules(definition, nodeId, breakpoint), effective as unknown as Record<string, unknown>, path, value, definition.schemaVersion >= 2 && breakpoint !== "desktop");
}

export function resetTemplateNodeRule(
  definition: TemplateDefinitionV2,
  nodeId: string,
  breakpoint: TemplateBreakpoint,
  path: string | readonly string[],
): void {
  if (definition.schemaVersion < 2 || breakpoint === "desktop") throw new Error("只有次断点覆盖可以恢复继承。");
  const parts = checkedPath(path);
  const node = definition.nodes[nodeId];
  if (!node) throw new Error("当前对象不存在。");
  const target = node.responsive[breakpoint] as Record<string, unknown> | undefined;
  if (!target) return;
  const [key, member] = parts;
  if (parts.length > 1 && MEMBER_GROUPS.has(key) && isRecord(target[key])) {
    // 长度是原子值，恢复 padding.top.value 等价于恢复 padding.top。
    delete target[key][member];
    if (Object.keys(target[key]).length === 0) delete target[key];
  } else delete target[key];
}

function localSlotRules(definition: TemplateDefinitionV2, slotId: string, breakpoint: TemplateBreakpoint) {
  if (definition.schemaVersion === 1 && breakpoint === "tablet") throw new Error("旧模板没有平板覆盖。");
  const slot = definition.slots[slotId];
  if (!slot) throw new Error("当前内容字段不存在。");
  if (breakpoint === "tablet") slot.tabletRules ??= {};
  return (breakpoint === "desktop" ? slot.desktopRules : breakpoint === "mobile" ? slot.mobileRules : slot.tabletRules!) as Record<string, unknown>;
}

export function setTemplateSlotRule(
  definition: TemplateDefinitionV2, slotId: string, breakpoint: TemplateBreakpoint, path: string | readonly string[], value: unknown,
): void {
  writePath(localSlotRules(definition, slotId, breakpoint), resolveTemplateSlotRules(definition, slotId, breakpoint) as Record<string, unknown>, path, value);
}

export function resetTemplateSlotRule(
  definition: TemplateDefinitionV2, slotId: string, breakpoint: TemplateBreakpoint, path: string | readonly string[],
): void {
  if (definition.schemaVersion < 2 || breakpoint === "desktop") throw new Error("只有次断点覆盖可以恢复继承。");
  const slot = definition.slots[slotId];
  if (!slot) throw new Error("当前内容字段不存在。");
  const target = breakpoint === "tablet" ? slot.tabletRules : slot.mobileRules;
  const [key] = checkedPath(path);
  if (target) delete (target as Record<string, unknown>)[key];
}

export function getTemplateNodeRuleSource(
  definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint, path: string | readonly string[],
): TemplateBreakpoint | "system" {
  const node = definition.nodes[nodeId];
  if (!node) return "system";
  const parts = checkedPath(path);
  const sources: TemplateBreakpoint[] = definition.schemaVersion === 1
    ? [breakpoint === "mobile" ? "mobile" : "desktop"]
    : breakpoint === "mobile" ? ["mobile", "tablet", "desktop"] : breakpoint === "tablet" ? ["tablet", "desktop"] : ["desktop"];
  for (const source of sources) {
    const rule = node.responsive[source] as DynamicTemplateResponsiveOverride | undefined;
    if (!rule || !Object.prototype.hasOwnProperty.call(rule, parts[0])) continue;
    if (MEMBER_GROUPS.has(parts[0]) && parts.length > 1) {
      const group = (rule as Record<string, unknown>)[parts[0]];
      if (group === null) return source;
      if (!isRecord(group) || !Object.prototype.hasOwnProperty.call(group, parts[1])) continue;
    }
    return source;
  }
  return "system";
}
