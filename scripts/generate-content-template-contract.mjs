import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "contracts/page-builder/content-templates.contract.json");
const outputPaths = [
  path.join(root, "client/src/page-builder/generated/contentTemplates.generated.ts"),
  path.join(root, "server/src/modules/page-modules/generated/contentTemplates.generated.ts"),
];
const checkOnly = process.argv.includes("--check");

const sourceText = await readFile(sourcePath, "utf8");
const source = JSON.parse(sourceText);

/**
 * 递归按键名稳定排序后序列化，保证同一语义合同不因对象键序或空白产生不同输出与摘要。
 */
function sortReplacer(_key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, value[k]]),
    );
  }
  return value;
}

/** 权威合同摘要由“规范序列化”后的内容确定，对空白与键序不敏感。 */
const hash = createHash("sha256").update(JSON.stringify(source, sortReplacer)).digest("hex");

const rootDevices = ["desktop", "tablet", "mobile"];

function validateUnifiedRoot(template) {
  invariant(Array.isArray(template.roles) && template.roles.length > 0, `${template.key}.roles 缺失`);
  const roleIds = template.roles.map((role) => role.id);
  invariant(new Set(roleIds).size === roleIds.length, `${template.key}.roles.id 重复`);
  const rolesById = new Map(template.roles.map((role) => [role.id, role]));
  const semantics = template.roles.map((role) => role.semantic).filter(Boolean);
  invariant(new Set(semantics).size === semantics.length, `${template.key}.roles.semantic 重复`);
  const rolesByRenderRole = new Map();
  for (const role of template.roles) {
    const group = rolesByRenderRole.get(role.role) ?? [];
    group.push(role);
    rolesByRenderRole.set(role.role, group);
  }
  for (const [renderRole, group] of rolesByRenderRole) {
    if (group.length < 2) continue;
    invariant(group.every((role) => role.semantic || Array.isArray(role.appliesTo)), `${template.key}.${renderRole} 存在无明确语义的重复角色`);
    const scoped = group.filter((role) => Array.isArray(role.appliesTo));
    const scopedDevices = scoped.flatMap((role) => role.appliesTo);
    invariant(new Set(scopedDevices).size === scopedDevices.length, `${template.key}.${renderRole} 的设备角色范围冲突`);
  }
  for (const device of rootDevices) {
    const order = template.order?.[device];
    invariant(Array.isArray(order) && order.length > 0, `${template.key}.order.${device} 缺失`);
    invariant(new Set(order).size === order.length, `${template.key}.order.${device} 不得重复 role id`);
    invariant(order.every((id) => rolesById.has(id)), `${template.key}.order.${device} 必须只引用已声明 role id`);
  }
  const actionCount = template.roles.filter((role) => role.kind === "action").length;
  invariant(actionCount <= template.contentBudget.maxCtas, `${template.key} 行动角色数超过 maxCtas`);
  for (const role of template.roles) {
    for (const device of rootDevices) {
      const defaultRatio = role.defaultRatioByViewport?.[device];
      const allowed = role.allowedRatioPresetsByViewport?.[device];
      invariant(!defaultRatio || (Array.isArray(allowed) && allowed.includes(defaultRatio)), `${template.key}.${role.id}.${device} 默认比例不在允许预设内`);
    }
  }
  for (const device of ["desktop", "mobile"]) {
    const viewport = template.preview?.[device];
    invariant(viewport && Array.isArray(viewport.zones) && viewport.zones.length > 0, `${template.key}.preview.${device} 缺失`);
    invariant(Array.isArray(viewport.order) && new Set(viewport.order).size === viewport.order.length, `${template.key}.preview.${device}.order 必须使用唯一 role id`);
    const zoneRoleIds = new Set();
    const structuralRoleIds = new Set();
    for (const zone of viewport.zones) {
      const role = rolesById.get(zone.roleId);
      invariant(role, `${template.key}.preview.${device} 区域未映射到已声明 role id：${zone.roleId}`);
      const allowedPreviewRoles = role.previewRoles ?? [role.role];
      invariant(allowedPreviewRoles.includes(zone.role), `${template.key}.preview.${device}.${zone.roleId} 渲染角色与语义角色矛盾`);
      zoneRoleIds.add(zone.roleId);
      if (!zone.overlay) structuralRoleIds.add(zone.roleId);
    }
    invariant(viewport.order.every((id) => rolesById.has(id) && zoneRoleIds.has(id)), `${template.key}.preview.${device}.order 包含无区域或未声明 role id`);
    invariant([...structuralRoleIds].every((id) => viewport.order.includes(id)), `${template.key}.preview.${device}.order 未覆盖全部非 overlay 区域`);
  }
  if (template.key === "booking") {
    invariant(!template.roles.some((role) => role.kind === "form" || role.role === "form"), "booking 禁止 form 角色");
    invariant(actionCount === 1, "booking 必须且只能声明一个行动角色");
  }
}

for (const template of source.templates) validateUnifiedRoot(template);

// 权威 JSON 从 schema v2 起，23 个模板均直接声明同一根构图。
// 以下仅为既有 TypeScript 消费面的只读派生形状，不能反写或形成第二份合同。
const toLegacyPreviewViewport = (template, viewport) => ({
  ...viewport,
  order: viewport.order.map((id) => template.roles.find((role) => role.id === id)?.role ?? id),
  zones: viewport.zones.map(({ roleId: _roleId, ...zone }) => zone),
});
source.previewProfiles = Object.fromEntries(source.templates.map((template) => [template.key, {
  ...template.preview,
  desktop: toLegacyPreviewViewport(template, template.preview.desktop),
  mobile: toLegacyPreviewViewport(template, template.preview.mobile),
}]));
for (const template of source.templates) {
  template.media = template.roles
    .filter((role) => role.kind === "media")
    .map((role) => ({
      key: role.id,
      required: role.required,
      desktopRatio: role.defaultRatioByViewport?.desktop,
      tabletRatio: role.defaultRatioByViewport?.tablet,
      mobileRatio: role.defaultRatioByViewport?.mobile,
    }));
  if (template.implementationStatus === "planned") {
    template.skeleton = {
      visualRole: template.visualRole,
      width: template.width,
      flow: template.flow,
      heightModeByViewport: template.heightModeByViewport,
      order: Object.fromEntries(Object.entries(template.order).map(([device, ids]) => [
        device,
        ids.map((id) => template.roles.find((role) => role.id === id)?.role ?? id),
      ])),
      slots: template.roles.map((role) => ({
        key: role.id,
        role: role.role,
        desktopRatio: role.defaultRatioByViewport?.desktop,
        tabletRatio: role.defaultRatioByViewport?.tablet,
        mobileRatio: role.defaultRatioByViewport?.mobile,
      })),
      preview: {
        tone: template.preview.desktop.tone,
        desktopZones: template.preview.desktop.zones.map(({ roleId: _roleId, ...zone }) => {
          const row = Math.min(zone.row, 8);
          return { ...zone, row, rowSpan: Math.min(zone.rowSpan, 9 - row) };
        }),
      },
    };
  }
}

const categories = new Set(["视觉展示", "图文内容", "商品展示", "导航入口", "服务信息", "活动内容"]);
const statuses = new Set(["active", "planned"]);
const viewportModes = new Set(["viewport", "ratio", "content"]);
const visualRoles = new Set(["primary-stage", "feature-stage", "support-stage"]);
const widths = new Set(["full", "standard", "wide", "editorial"]);
const flows = new Set(["bleed", "flow"]);
const copyPlacements = new Set(["overlay", "stacked", "split"]);
const skeletonRoles = new Set([
  "media", "mainMedia", "detailMedia", "copy", "action", "marker",
  "timeline", "list", "card", "quote", "form",
  // 文字槽位细分(2026-08-19):copy 聚合区可拆为三级文字槽,缩略图逐槽可见
  "eyebrow", "title", "subtitle",
]);
const previewKinds = new Set(["play", "pagination", "steps-5", "handle", "hotspot", "countdown"]);

function invariant(condition, message) {
  if (!condition) throw new Error(`内容模板合同无效：${message}`);
}

invariant(Number.isInteger(source.contractSchemaVersion) && source.contractSchemaVersion > 0, "contractSchemaVersion 必须是正整数");
invariant(Number.isInteger(source.registryVersion) && source.registryVersion > 0, "registryVersion 必须是正整数");
invariant(Array.isArray(source.templates), "templates 必须是数组");
invariant(source.templates.length === source.expectedTemplateCount, `模板注册数应为 ${source.expectedTemplateCount}，实际为 ${source.templates.length}`);
invariant(source.previewProfiles && typeof source.previewProfiles === "object" && !Array.isArray(source.previewProfiles), "previewProfiles 必须是对象");

const unique = (field) => new Set(source.templates.map((item) => item[field])).size === source.templates.length;
invariant(unique("key"), "key 不能重复");
invariant(unique("moduleType"), "moduleType 不能重复");
invariant(unique("displayName"), "displayName 不能重复");

for (const template of source.templates) {
  invariant(typeof template.key === "string" && /^[a-z][A-Za-z0-9]*$/.test(template.key), `key 不合法：${template.key}`);
  invariant(typeof template.moduleType === "string" && template.moduleType.length > 0, `${template.key}.moduleType 不能为空`);
  invariant(typeof template.displayName === "string" && template.displayName.length > 0, `${template.key}.displayName 不能为空`);
  invariant(categories.has(template.category), `${template.key}.category 不合法`);
  invariant(statuses.has(template.implementationStatus), `${template.key}.implementationStatus 不合法`);
  const preview = source.previewProfiles[template.key];
  invariant(preview && typeof preview === "object", `${template.key}.previewProfiles 缺失`);
  invariant(typeof preview.purpose === "string" && preview.purpose.length > 0, `${template.key}.previewProfiles.purpose 缺失`);
  invariant(visualRoles.has(preview.visualRole), `${template.key}.previewProfiles.visualRole 不合法`);
  for (const device of ["desktop", "mobile"]) {
    const viewportPreview = preview[device];
    invariant(viewportPreview && typeof viewportPreview === "object", `${template.key}.previewProfiles.${device} 缺失`);
    invariant(["light", "dark"].includes(viewportPreview.tone), `${template.key}.previewProfiles.${device}.tone 不合法`);
    invariant(Array.isArray(viewportPreview.order) && viewportPreview.order.length > 0, `${template.key}.previewProfiles.${device}.order 缺失`);
    invariant(viewportPreview.order.every((role) => skeletonRoles.has(role)), `${template.key}.previewProfiles.${device}.order 包含未知角色`);
    invariant(Array.isArray(viewportPreview.zones) && viewportPreview.zones.length > 0, `${template.key}.previewProfiles.${device}.zones 缺失`);
    const rows = viewportPreview.rows ?? 8;
    invariant(Number.isInteger(rows) && rows >= 6 && rows <= 12, `${template.key}.previewProfiles.${device}.rows 不合法`);
    for (const zone of viewportPreview.zones) {
      invariant(skeletonRoles.has(zone.role), `${template.key}.previewProfiles.${device}.zones.role 不合法`);
      invariant(zone.kind === undefined || previewKinds.has(zone.kind), `${template.key}.previewProfiles.${device}.zones.kind 不合法`);
      invariant(Number.isFinite(zone.column) && Number.isFinite(zone.span) && Number.isFinite(zone.row) && Number.isFinite(zone.rowSpan), `${template.key}.previewProfiles.${device}.zones 坐标不合法`);
      invariant(zone.column >= 1 && zone.span > 0 && zone.column + zone.span <= 13 && zone.row >= 1 && zone.rowSpan > 0 && zone.row + zone.rowSpan <= rows + 1, `${template.key}.previewProfiles.${device}.zones 超出画布`);
    }
  }
  if (template.implementationStatus === "planned") {
    const skeleton = template.skeleton;
    invariant(skeleton && typeof skeleton === "object", `${template.key}.skeleton 缺失`);
    invariant(visualRoles.has(skeleton.visualRole), `${template.key}.skeleton.visualRole 不合法`);
    invariant(widths.has(skeleton.width), `${template.key}.skeleton.width 不合法`);
    invariant(flows.has(skeleton.flow), `${template.key}.skeleton.flow 不合法`);
    for (const device of ["desktop", "tablet", "mobile"]) {
      invariant(viewportModes.has(skeleton.heightModeByViewport?.[device]), `${template.key}.skeleton.heightModeByViewport.${device} 不合法`);
      invariant(Array.isArray(skeleton.order?.[device]) && skeleton.order[device].length > 0, `${template.key}.skeleton.order.${device} 缺失`);
      invariant(skeleton.order[device].every((role) => skeletonRoles.has(role)), `${template.key}.skeleton.order.${device} 包含未知角色`);
    }
    invariant(Array.isArray(skeleton.slots), `${template.key}.skeleton.slots 必须是数组`);
    for (const slot of skeleton.slots) {
      invariant(typeof slot.key === "string" && slot.key.length > 0, `${template.key}.skeleton.slots.key 不合法`);
      invariant(skeletonRoles.has(slot.role), `${template.key}.skeleton.slots.role 不合法`);
    }
    invariant(["light", "dark"].includes(skeleton.preview?.tone), `${template.key}.skeleton.preview.tone 不合法`);
    invariant(Array.isArray(skeleton.preview?.desktopZones) && skeleton.preview.desktopZones.length > 0, `${template.key}.skeleton.preview.desktopZones 缺失`);
    for (const zone of skeleton.preview.desktopZones) {
      invariant(skeletonRoles.has(zone.role), `${template.key}.skeleton.preview.desktopZones.role 不合法`);
      invariant(Number.isFinite(zone.column) && Number.isFinite(zone.span) && Number.isFinite(zone.row) && Number.isFinite(zone.rowSpan), `${template.key}.skeleton.preview.desktopZones 坐标不合法`);
      invariant(zone.column >= 1 && zone.span > 0 && zone.column + zone.span <= 13 && zone.row >= 1 && zone.rowSpan > 0 && zone.row + zone.rowSpan <= 9, `${template.key}.skeleton.preview.desktopZones 超出 12×8 画布`);
    }
  }

  invariant(Number.isInteger(template.version) && template.version > 0, `${template.key}.version 必须是正整数`);
  invariant(typeof template.master === "string" && template.master.length > 0, `${template.key}.master 不能为空`);
  invariant(visualRoles.has(template.visualRole), `${template.key}.visualRole 不合法`);
  invariant(template.visualWeight === template.visualRole, `${template.key}.visualWeight 必须与 visualRole 一致`);
  invariant(widths.has(template.width), `${template.key}.width 不合法`);
  invariant(flows.has(template.flow), `${template.key}.flow 不合法`);
  for (const device of ["desktop", "tablet", "mobile"]) {
    invariant(viewportModes.has(template.heightModeByViewport?.[device]), `${template.key}.heightModeByViewport.${device} 不合法`);
    invariant(copyPlacements.has(template.copyPlacementByViewport?.[device]), `${template.key}.copyPlacementByViewport.${device} 不合法`);
  }
  invariant(Array.isArray(template.spacingPolicy), `${template.key}.spacingPolicy 必须是数组`);
  invariant(Array.isArray(template.media), `${template.key}.media 必须是数组`);
  invariant(template.contentBudget && typeof template.contentBudget === "object", `${template.key}.contentBudget 缺失`);
  invariant(Array.isArray(template.contentBudget.requiredText), `${template.key}.requiredText 必须是数组`);
  invariant(Number.isInteger(template.contentBudget.maxCtas) && template.contentBudget.maxCtas >= 0, `${template.key}.maxCtas 不合法`);
  invariant(Array.isArray(template.allowedControls), `${template.key}.allowedControls 必须是数组`);
  invariant(typeof template.supportsLinkTarget === "boolean", `${template.key}.supportsLinkTarget 必须是布尔值`);
}

const activeTemplates = source.templates.filter((item) => item.implementationStatus === "active");
const plannedTemplates = source.templates.filter((item) => item.implementationStatus === "planned");
invariant(activeTemplates.length === source.activeTemplateCount, `活跃合同数应为 ${source.activeTemplateCount}，实际为 ${activeTemplates.length}`);
invariant(plannedTemplates.length === source.expectedTemplateCount - source.activeTemplateCount, `计划合同数应为 ${source.expectedTemplateCount - source.activeTemplateCount}，实际为 ${plannedTemplates.length}`);

const union = (values) => [...new Set(values)].sort().map((value) => JSON.stringify(value)).join(" | ");
const masters = union(source.templates.map((item) => item.master));

const registry = source.templates.map(({ key, moduleType, displayName, category, implementationStatus }) => ({
  key,
  moduleType,
  displayName,
  category,
  implementationStatus,
}));
const contractMap = Object.fromEntries(source.templates.map(({ category: _category, implementationStatus: _status, skeleton: _skeleton, ...contract }) => [contract.key, contract]));
const plannedSkeletonMap = Object.fromEntries(plannedTemplates.map(({ key, moduleType, displayName, category, skeleton }) => [key, {
  key,
  moduleType,
  displayName,
  category,
  ...skeleton,
}]));
const templatePreviewMap = Object.fromEntries(source.templates.map(({ key, moduleType, displayName }) => [key, {
  key,
  moduleType,
  displayName,
  ...source.previewProfiles[key],
}]));
const registeredKeys = source.templates.map((item) => JSON.stringify(item.key)).join(" | ");
const contractVersion = Math.max(...source.templates.map((item) => item.version));

const generated = `/**
 * 自动生成，禁止手改。
 * 来源：contracts/page-builder/content-templates.contract.json
 * SHA-256：${hash}
 */

export const CONTENT_TEMPLATE_REGISTRY_VERSION = ${source.registryVersion};
export const CONTENT_TEMPLATE_CONTRACT_VERSION = ${contractVersion};

export type RegisteredContentTemplateKey = ${registeredKeys};
export type ContentTemplateKey = RegisteredContentTemplateKey;
export type ContentTemplateMaster = ${masters};

export type MediaSlot = {
  key: string;
  required: boolean;
  desktopRatio?: string;
  tabletRatio?: string;
  mobileRatio?: string;
};

export type ContentTemplateContract = {
  key: ContentTemplateKey;
  moduleType: string;
  displayName: string;
  version: number;
  master: ContentTemplateMaster;
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  visualWeight: "primary-stage" | "feature-stage" | "support-stage";
  heightModeByViewport: Record<"desktop" | "tablet" | "mobile", "viewport" | "ratio" | "content">;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
  copyPlacementByViewport: Record<"desktop" | "tablet" | "mobile", "overlay" | "stacked" | "split">;
  spacingPolicy: readonly ("compact" | "normal" | "spacious" | "grand")[];
  media: readonly MediaSlot[];
  roles: readonly {
    id: string;
    role: ContentTemplateSkeletonRole;
    kind: string;
    required: boolean;
    semantic?: string;
    previewRoles?: readonly ContentTemplateSkeletonRole[];
    appliesTo?: readonly ("desktop" | "tablet" | "mobile")[];
    fallbackRoleId?: string;
    parentRole?: string;
    positioning?: string;
    proof?: string;
    relation?: string;
    emphasis?: string;
    quantity?: { default: number; min: number; max: number };
    defaultRatioByViewport?: Partial<Record<"desktop" | "tablet" | "mobile", string>>;
    allowedRatioPresetsByViewport?: Partial<Record<"desktop" | "tablet" | "mobile", readonly string[]>>;
  }[];
  order: Record<"desktop" | "tablet" | "mobile", readonly string[]>;
  preview: {
    purpose: string;
    visualRole: "primary-stage" | "feature-stage" | "support-stage";
    desktop: ContentTemplateRootPreviewViewport;
    mobile: ContentTemplateRootPreviewViewport;
  };
  presets: readonly string[];
  presetValues?: unknown;
  contentBudget: {
    limits: Readonly<Record<string, number>>;
    requiredText: readonly string[];
    maxCtas: number;
  };
  allowedControls: readonly string[];
  supportsLinkTarget: boolean;
  desktopCopyRatio?: number;
  desktopMediaRatio?: number;
  tabletCopyRatio?: number;
  tabletMediaRatio?: number;
};

export type ContentTemplateMarker = {
  key: ContentTemplateKey;
  version: number;
};

export type ContentTemplateSkeletonRole =
  | "media" | "mainMedia" | "detailMedia" | "copy" | "action" | "marker"
  | "timeline" | "list" | "card" | "quote" | "form"
  | "eyebrow" | "title" | "subtitle";

export type ContentTemplateSkeletonZone = {
  role: ContentTemplateSkeletonRole;
  column: number;
  span: number;
  row: number;
  rowSpan: number;
  overlay?: boolean;
  kind?: "play" | "pagination" | "steps-5" | "handle" | "hotspot" | "countdown";
};

export type ContentTemplateRootPreviewViewport = {
  tone: "light" | "dark";
  rows?: number;
  order: readonly string[];
  zones: readonly (ContentTemplateSkeletonZone & { roleId: string })[];
};

export type ContentTemplateSkeleton = {
  key: RegisteredContentTemplateKey;
  moduleType: string;
  displayName: string;
  category: string;
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  heightModeByViewport: Record<"desktop" | "tablet" | "mobile", "viewport" | "ratio" | "content">;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
  slots: readonly { key: string; role: ContentTemplateSkeletonRole; desktopRatio?: string; tabletRatio?: string; mobileRatio?: string }[];
  order: Record<"desktop" | "tablet" | "mobile", readonly ContentTemplateSkeletonRole[]>;
  preview: { tone: "light" | "dark"; desktopZones: readonly ContentTemplateSkeletonZone[] };
};

export type ContentTemplatePreviewZone = ContentTemplateSkeletonZone & {
  kind?: "play" | "pagination" | "steps-5" | "handle" | "hotspot" | "countdown";
};

export type ContentTemplatePreviewViewport = {
  tone: "light" | "dark";
  rows?: number;
  order: readonly ContentTemplateSkeletonRole[];
  zones: readonly ContentTemplatePreviewZone[];
};

export type ContentTemplatePreview = {
  key: RegisteredContentTemplateKey;
  moduleType: string;
  displayName: string;
  purpose: string;
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  desktop: ContentTemplatePreviewViewport;
  mobile: ContentTemplatePreviewViewport;
};

export type ContentTemplateIssueSeverity = "error" | "warning" | "info";

export type ContentTemplateIssue = {
  code:
    | "content-template-legacy"
    | "content-template-marker-invalid"
    | "content-template-key-mismatch"
    | "content-template-version-unsupported"
    | "page-validation";
  severity: ContentTemplateIssueSeverity;
  layer: "contract" | "page";
  blockId?: string;
  moduleType?: string;
  path: string;
  message: string;
};

export type ContentTemplateCompletion = {
  material: { complete: boolean; missing: string[] };
  content: { complete: boolean; missing: string[] };
  publish: { complete: boolean; issues: ContentTemplateIssue[] };
};

export const CONTENT_TEMPLATE_REGISTRY = ${JSON.stringify(registry, sortReplacer, 2)} as const;

/** 23 个真实 Renderer 的完整 schema v2 合同；implementationStatus 不再决定可否渲染。 */
export const CONTENT_TEMPLATE_CONTRACTS = ${JSON.stringify(contractMap, sortReplacer, 2)} as const satisfies Record<ContentTemplateKey, ContentTemplateContract>;

/** 仅表达 planned 模板的可见基础框架；不承担业务、发布或 Inspector 完整合同。 */
export const CONTENT_TEMPLATE_SKELETONS = ${JSON.stringify(plannedSkeletonMap, sortReplacer, 2)} as const satisfies Record<string, ContentTemplateSkeleton>;

/** 所有 23 个模板的中性结构预览源；缩略图与总览不得另建坐标台账。 */
export const CONTENT_TEMPLATE_PREVIEWS = ${JSON.stringify(templatePreviewMap, sortReplacer, 2)} as const satisfies Record<RegisteredContentTemplateKey, ContentTemplatePreview>;

export const CONTENT_TEMPLATE_PREVIEW_BY_MODULE_TYPE = Object.fromEntries(
  Object.values(CONTENT_TEMPLATE_PREVIEWS).map((preview) => [preview.moduleType, preview]),
) as Record<string, ContentTemplatePreview | undefined>;

export function getContentTemplatePreview(moduleType: string) {
  return CONTENT_TEMPLATE_PREVIEW_BY_MODULE_TYPE[moduleType];
}

export const CONTENT_TEMPLATE_SKELETON_BY_MODULE_TYPE = Object.fromEntries(
  Object.values(CONTENT_TEMPLATE_SKELETONS).map((skeleton) => [skeleton.moduleType, skeleton]),
) as Record<string, ContentTemplateSkeleton | undefined>;

export function getContentTemplateSkeleton(moduleType: string) {
  return CONTENT_TEMPLATE_SKELETON_BY_MODULE_TYPE[moduleType];
}

export const CONTENT_TEMPLATE_BY_MODULE_TYPE = Object.fromEntries(
  Object.values(CONTENT_TEMPLATE_CONTRACTS).map((contract) => [contract.moduleType, contract]),
) as Record<string, ContentTemplateContract | undefined>;

export function getContentTemplateContract(moduleType: string) {
  return CONTENT_TEMPLATE_BY_MODULE_TYPE[moduleType];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getCompatibilityRoleValue(
  moduleType: string,
  roleId: string,
  values: Record<string, unknown>,
): unknown {
  const directValue = values[roleId];
  if (hasNonEmptyText(directValue)) return directValue;

  switch (moduleType + ":" + roleId) {
    case "视频区块:coverImage":
      return values.posterUrl;
    case "改款对比:before":
      return values.beforeImage;
    case "改款对比:after":
      return values.afterImage;
    case "佩戴灵感:wearingImage":
    case "热区图:sceneImage":
    case "门店信息:store":
      return values.image;
    case "限时活动:event":
      return values.eventImage;
    case "真实评价与实拍:authorizedPhoto": {
      const testimonials = values.testimonials;
      const first = Array.isArray(testimonials) ? testimonials[0] : undefined;
      return isRecord(first) ? first.image : undefined;
    }
    default:
      return directValue;
  }
}

export function createContentTemplateMarker(
  moduleType: string,
): ContentTemplateMarker | undefined {
  const contract = getContentTemplateContract(moduleType);
  return contract ? { key: contract.key, version: contract.version } : undefined;
}

export function getContentTemplateIssues(input: {
  moduleType?: unknown;
  props?: unknown;
  blockId?: unknown;
  path?: string;
}): ContentTemplateIssue[] {
  const moduleType = typeof input.moduleType === "string" ? input.moduleType : "";
  const contract = getContentTemplateContract(moduleType);
  if (!contract) return [];

  const props = isRecord(input.props) ? input.props : {};
  const blockId = typeof input.blockId === "string" && input.blockId.trim()
    ? input.blockId
    : typeof props.id === "string" && props.id.trim()
      ? props.id
      : undefined;
  const path = input.path || "props.__contentTemplate";
  const marker = props.__contentTemplate;
  const base = { layer: "contract" as const, blockId, moduleType, path };

  if (marker === undefined) {
    return [{
      ...base,
      code: "content-template-legacy",
      severity: "info",
      message: "历史区块未携带内容模板版本印记，按 legacy-0 兼容读取；普通保存不会自动升级。",
    }];
  }
  if (!isRecord(marker)) {
    return [{
      ...base,
      code: "content-template-marker-invalid",
      severity: "error",
      message: "内容模板版本印记格式无效，无法确定兼容合同。",
    }];
  }
  const markerKey = marker.key;
  const markerVersion = marker.version;
  if (typeof markerKey !== "string" || !Number.isInteger(markerVersion) || typeof markerVersion !== "number" || markerVersion <= 0) {
    return [{
      ...base,
      code: "content-template-marker-invalid",
      severity: "error",
      message: "内容模板版本印记格式无效，无法确定兼容合同。",
    }];
  }
  if (markerKey !== contract.key) {
    return [{
      ...base,
      code: "content-template-key-mismatch",
      severity: "error",
      message: "区块类型与内容模板版本印记不匹配，无法使用当前模板合同渲染。",
    }];
  }
  if (markerVersion !== contract.version) {
    return [{
      ...base,
      code: "content-template-version-unsupported",
      severity: "error",
      message: "内容模板版本暂不受支持，无法猜测为当前版本。",
    }];
  }
  return [];
}

export function getContentTemplateCompletion(
  moduleType: string,
  props: unknown,
): ContentTemplateCompletion | undefined {
  const contract = getContentTemplateContract(moduleType);
  if (!contract) return undefined;
  const values = isRecord(props) ? props : {};
  const missingMedia = contract.media
    .filter((slot) =>
      slot.required &&
      !hasNonEmptyText(getCompatibilityRoleValue(moduleType, slot.key, values)))
    .map((slot) => slot.key);
  const missingText = contract.contentBudget.requiredText
    .filter((key) => !hasNonEmptyText(values[key]));
  const issues = getContentTemplateIssues({ moduleType, props: values });
  return {
    material: { complete: missingMedia.length === 0, missing: missingMedia },
    content: { complete: missingText.length === 0, missing: missingText },
    publish: {
      complete: !issues.some((issue) => issue.severity === "error"),
      issues,
    },
  };
}
`;

if (checkOnly) {
  const stale = [];
  const generatedLf = generated.replace(/\r\n/g, "\n");
  for (const outputPath of outputPaths) {
    let current = "";
    try {
      current = await readFile(outputPath, "utf8");
    } catch {
      stale.push(`${path.relative(root, outputPath)}（缺失）`);
      continue;
    }
    const normalized = current.replace(/\r\n/g, "\n");
    if (normalized !== generatedLf) {
      const embedded = normalized.match(/SHA-256：([0-9a-f]{64})/)?.[1];
      const suffix = embedded && embedded !== hash
        ? `（内置 SHA ${embedded.slice(0, 12)} ≠ 权威 ${hash.slice(0, 12)}）`
        : "";
      stale.push(`${path.relative(root, outputPath)}${suffix}`);
    }
  }
  invariant(stale.length === 0, `生成产物缺失或已漂移：${stale.join("、")}`);
  console.log(`内容模板合同一致：注册 ${source.templates.length} 个，活跃 ${activeTemplates.length} 个，权威 SHA-256 ${hash.slice(0, 12)}（客户端/服务端产物一致）。`);
} else {
  for (const outputPath of outputPaths) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, generated, "utf8");
  }
  console.log(`内容模板合同已生成：注册 ${source.templates.length} 个，活跃 ${activeTemplates.length} 个。`);
}
