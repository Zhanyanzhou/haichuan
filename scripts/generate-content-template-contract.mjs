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

const rootDevices = ["desktop", "mobile"];
const assetClasses = new Set(["product", "editorial", "craft", "service"]);
const templateWidths = ["full", "wide", "standard", "editorial"];

const derivePreviewOrder = (template, device, viewport) => {
  const previewRoleIds = new Set(viewport.zones.map((zone) => zone.roleId));
  const rolesById = new Map(template.roles.map((role) => [role.id, role]));
  return template.order[device].filter((id) =>
    rolesById.get(id)?.positioning !== "background" && previewRoleIds.has(id),
  );
};

function validateAssetPolicy(policy) {
  invariant(policy && typeof policy === "object", "assetPolicy 缺失");
  invariant(
    Array.isArray(policy.classes)
      && policy.classes.length === assetClasses.size
      && policy.classes.every((value) => assetClasses.has(value)),
    "assetPolicy.classes 必须完整声明素材分类",
  );
  invariant(
    policy.placeholder?.status === "waiting-final-asset"
      && policy.placeholder?.publishable === false,
    "assetPolicy.placeholder 必须是不可发布的等待最终素材状态",
  );
  for (const viewport of rootDevices) {
    const widths = policy.minimumWidthByViewport?.[viewport];
    invariant(widths && typeof widths === "object", `assetPolicy.minimumWidthByViewport.${viewport} 缺失`);
    for (const width of templateWidths) {
      invariant(
        Number.isInteger(widths[width]) && widths[width] >= 1000,
        `assetPolicy.minimumWidthByViewport.${viewport}.${width} 必须是有效建议宽度`,
      );
    }
  }
}

function validatePageRules(rules) {
  invariant(Array.isArray(rules) && rules.length === 6, "pageRules 必须覆盖 6 个装修页面");
  const pageKeys = rules.map((rule) => rule.pageKey);
  invariant(new Set(pageKeys).size === pageKeys.length, "pageRules.pageKey 不得重复");
  const templatesByKey = new Map(source.templates.map((template) => [template.key, template]));
  for (const rule of rules) {
    invariant(/^[a-z0-9-]+$/i.test(rule.pageKey), `pageRules.${rule.pageKey}.pageKey 无效`);
    invariant(typeof rule.pageRole === "string" && rule.pageRole.length > 0, `pageRules.${rule.pageKey}.pageRole 缺失`);
    invariant(
      Array.isArray(rule.allowedTemplateKeys)
        && rule.allowedTemplateKeys.length > 0
        && new Set(rule.allowedTemplateKeys).size === rule.allowedTemplateKeys.length,
      `pageRules.${rule.pageKey}.allowedTemplateKeys 缺失或重复`,
    );
    invariant(
      rule.allowedTemplateKeys.every((key) => templatesByKey.get(key)?.implementationStatus === "active"),
      `pageRules.${rule.pageKey} 只能引用 active 模板`,
    );
    invariant([0, 1].includes(rule.businessRegionCount), `pageRules.${rule.pageKey}.businessRegionCount 只能为 0 或 1`);
    invariant(
      rule.businessRegionCount === 1
        ? rule.businessRegionPosition === "after-first-brand-block"
        : rule.businessRegionPosition === undefined,
      `pageRules.${rule.pageKey}.businessRegionPosition 与固定业务区数量不一致`,
    );
    invariant(
      ["overlay-light", "solid"].includes(rule.headerMode?.configured)
        && rule.headerMode?.fallback === "solid",
      `pageRules.${rule.pageKey}.headerMode 无效`,
    );
    if (rule.headerMode.configured === "overlay-light") {
      invariant(
        rule.headerMode.overlayRequiresFirstTemplate === "hero"
          && rule.allowedTemplateKeys.includes("hero"),
        `pageRules.${rule.pageKey} 覆盖式导航必须要求首个 hero`,
      );
    }
  }
}

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
    invariant(
      order.every((id) => {
        const appliesTo = rolesById.get(id)?.appliesTo;
        return !Array.isArray(appliesTo) || appliesTo.includes(device);
      }),
      `${template.key}.order.${device} 引用了不适用于本端的 role id`,
    );
    invariant(
      template.roles
        .filter((role) => role.required && (!Array.isArray(role.appliesTo) || role.appliesTo.includes(device)))
        .every((role) => order.includes(role.id)),
      `${template.key}.order.${device} 未覆盖本端必需角色`,
    );
  }
  const actionCount = template.roles.filter((role) => role.kind === "action").length;
  invariant(actionCount <= template.contentBudget.maxCtas, `${template.key} 行动角色数超过 maxCtas`);
  for (const role of template.roles) {
    if (role.kind === "media") {
      invariant(assetClasses.has(role.assetClass), `${template.key}.${role.id}.assetClass 缺失或无效`);
    }
    if (role.assetClass !== undefined) {
      invariant(assetClasses.has(role.assetClass), `${template.key}.${role.id}.assetClass 无效`);
      invariant(
        rootDevices.some((device) => Boolean(role.defaultRatioByViewport?.[device])),
        `${template.key}.${role.id} 素材槽必须声明至少一个默认比例`,
      );
    }
    if (role.appliesTo !== undefined) {
      invariant(Array.isArray(role.appliesTo) && role.appliesTo.length > 0, `${template.key}.${role.id}.appliesTo 不能为空`);
      invariant(new Set(role.appliesTo).size === role.appliesTo.length, `${template.key}.${role.id}.appliesTo 不得重复`);
      invariant(role.appliesTo.every((device) => rootDevices.includes(device)), `${template.key}.${role.id}.appliesTo 包含未知设备`);
    }
    if (role.fallbackRoleId !== undefined) {
      const fallbackRole = rolesById.get(role.fallbackRoleId);
      invariant(fallbackRole, `${template.key}.${role.id}.fallbackRoleId 必须引用已声明角色`);
      invariant(role.fallbackRoleId !== role.id, `${template.key}.${role.id}.fallbackRoleId 不得引用自身`);
      invariant(fallbackRole.kind === role.kind && fallbackRole.role === role.role, `${template.key}.${role.id}.fallbackRoleId 必须保持角色种类一致`);
    }
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
    const derivedOrder = derivePreviewOrder(template, device, viewport);
    invariant(
      JSON.stringify(viewport.order) === JSON.stringify(derivedOrder),
      `${template.key}.preview.${device}.order 必须由根 order 派生；背景角色需显式标记 positioning=background`,
    );
    viewport.order = derivedOrder;
  }
  if (template.key === "booking") {
    invariant(!template.roles.some((role) => role.kind === "form" || role.role === "form"), "booking 禁止 form 角色");
    invariant(actionCount === 1, "booking 必须且只能声明一个行动角色");
  }
}

validateAssetPolicy(source.assetPolicy);
for (const template of source.templates) validateUnifiedRoot(template);
validatePageRules(source.pageRules);

// 权威 JSON 从 schema v3 起(桌面+移动双端),23 个模板均直接声明同一根构图。
// 以下仅为既有 TypeScript 消费面的只读派生形状，不能反写或形成第二份合同。
const toLegacyPreviewViewport = (template, device, viewport) => ({
  ...viewport,
  order: derivePreviewOrder(template, device, viewport).map((id) => template.roles.find((role) => role.id === id)?.role ?? id),
  zones: viewport.zones.map(({ roleId: _roleId, ...zone }) => zone),
});
source.previewProfiles = Object.fromEntries(source.templates.map((template) => [template.key, {
  ...template.preview,
  desktop: toLegacyPreviewViewport(template, "desktop", template.preview.desktop),
  mobile: toLegacyPreviewViewport(template, "mobile", template.preview.mobile),
}]));
for (const template of source.templates) {
  template.media = template.roles
    .filter((role) => role.kind === "media")
    .map((role) => ({
      key: role.id,
      required: role.required,
      desktopRatio: role.defaultRatioByViewport?.desktop,
      mobileRatio: role.defaultRatioByViewport?.mobile,
    }));
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

const categories = new Set(["视觉展示", "图文内容", "商品展示", "导航入口", "服务信息", "活动内容"]);
const statuses = new Set(["active", "planned"]);
const viewportModes = new Set(["viewport", "ratio", "content"]);
const visualRoles = new Set(["primary-stage", "feature-stage", "support-stage"]);
const widths = new Set(["full", "standard", "wide", "editorial"]);
const flows = new Set(["bleed", "flow"]);
const copyPlacements = new Set(["overlay", "stacked", "split"]);
const primaryTasks = new Set(["media", "product", "category", "structured", "text", "action"]);
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
  const skeleton = template.skeleton;
  invariant(skeleton && typeof skeleton === "object", `${template.key}.skeleton 缺失`);
  invariant(visualRoles.has(skeleton.visualRole), `${template.key}.skeleton.visualRole 不合法`);
  invariant(widths.has(skeleton.width), `${template.key}.skeleton.width 不合法`);
  invariant(flows.has(skeleton.flow), `${template.key}.skeleton.flow 不合法`);
  for (const device of ["desktop", "mobile"]) {
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

  invariant(Number.isInteger(template.version) && template.version > 0, `${template.key}.version 必须是正整数`);
  invariant(typeof template.master === "string" && template.master.length > 0, `${template.key}.master 不能为空`);
  invariant(visualRoles.has(template.visualRole), `${template.key}.visualRole 不合法`);
  invariant(template.visualWeight === template.visualRole, `${template.key}.visualWeight 必须与 visualRole 一致`);
  invariant(widths.has(template.width), `${template.key}.width 不合法`);
  invariant(flows.has(template.flow), `${template.key}.flow 不合法`);
  for (const device of ["desktop", "mobile"]) {
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
  invariant(template.editorCapabilities && typeof template.editorCapabilities === "object", `${template.key}.editorCapabilities 缺失`);
  invariant(primaryTasks.has(template.editorCapabilities.primaryTask), `${template.key}.editorCapabilities.primaryTask 不合法`);
  const referenceFields = template.editorCapabilities.referenceFields ?? [];
  invariant(Array.isArray(referenceFields), `${template.key}.editorCapabilities.referenceFields 必须是数组`);
  for (const reference of referenceFields) {
    invariant(["product", "category"].includes(reference.kind), `${template.key}.referenceFields.kind 不合法`);
    invariant(typeof reference.key === "string" && reference.key.length > 0, `${template.key}.referenceFields.key 缺失`);
    invariant(Number.isInteger(reference.min) && Number.isInteger(reference.max) && reference.min >= 0 && reference.max >= reference.min, `${template.key}.${reference.key} 数量边界不合法`);
  }
  const layoutOverrides = template.editorCapabilities.layoutOverrides ?? {};
  invariant(layoutOverrides && typeof layoutOverrides === "object" && !Array.isArray(layoutOverrides), `${template.key}.layoutOverrides 必须是对象`);
  if (layoutOverrides.frameRatioRange) {
    const range = layoutOverrides.frameRatioRange;
    invariant(
      Number.isFinite(range.min) && Number.isFinite(range.max) && Number.isFinite(range.step) &&
        range.min >= 0.25 && range.max <= 4 && range.max >= range.min && range.step > 0,
      `${template.key}.layoutOverrides.frameRatioRange 范围不合法`,
    );
    for (const preset of layoutOverrides.frameRatioPresets ?? []) {
      const [width, height] = String(preset).split("/").map(Number);
      const ratio = width / height;
      invariant(Number.isFinite(ratio) && ratio >= range.min && ratio <= range.max, `${template.key}.frameRatioPresets 含越界比例 ${preset}`);
    }
  }
  for (const slot of layoutOverrides.slots ?? []) {
    invariant(template.roles.some((role) => role.id === slot.roleId), `${template.key}.layoutOverrides.slots 引用了未知角色 ${slot.roleId}`);
    invariant(!slot.fieldKey || /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(slot.fieldKey), `${template.key}.${slot.roleId}.fieldKey 不合法`);
    invariant(!slot.zoom || (Number.isFinite(slot.zoom.min) && Number.isFinite(slot.zoom.max) && slot.zoom.min >= 1 && slot.zoom.max >= slot.zoom.min), `${template.key}.${slot.roleId}.zoom 范围不合法`);
  }
  for (const textRole of layoutOverrides.textRoles ?? []) {
    const knownTextRole =
      template.roles.some((role) =>
        role.id === textRole.roleId || role.previewRoles?.includes(textRole.roleId),
      ) ||
      Object.prototype.hasOwnProperty.call(template.contentBudget?.limits ?? {}, textRole.roleId);
    invariant(knownTextRole, `${template.key}.layoutOverrides.textRoles 引用了未知角色 ${textRole.roleId}`);
  }
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
const pageRuleMap = Object.fromEntries(source.pageRules.map((rule) => [rule.pageKey, rule]));
const templateSkeletonMap = Object.fromEntries(source.templates.map(({ key, moduleType, displayName, category, skeleton }) => [key, {
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
export type ContentTemplateAssetClass = "product" | "editorial" | "craft" | "service";

export type ContentTemplateAssetPolicy = {
  classes: readonly ContentTemplateAssetClass[];
  placeholder: {
    status: "waiting-final-asset";
    label: string;
    badge: string;
    publishable: false;
  };
  minimumWidthByViewport: Record<
    "desktop" | "mobile",
    Record<"full" | "wide" | "standard" | "editorial", number>
  >;
};

export const CONTENT_TEMPLATE_ASSET_POLICY = ${JSON.stringify(source.assetPolicy, sortReplacer, 2)} as const satisfies ContentTemplateAssetPolicy;

export type ContentTemplatePageRule = {
  pageKey: string;
  pageRole: string;
  allowedTemplateKeys: readonly ContentTemplateKey[];
  businessRegionCount: 0 | 1;
  businessRegionPosition?: "after-first-brand-block";
  headerMode: {
    configured: "overlay-light" | "solid";
    overlayRequiresFirstTemplate?: "hero";
    fallback: "solid";
  };
};

export const CONTENT_TEMPLATE_PAGE_RULES = ${JSON.stringify(pageRuleMap, sortReplacer, 2)} as const satisfies Record<string, ContentTemplatePageRule>;

export type MediaSlot = {
  key: string;
  required: boolean;
  desktopRatio?: string;
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
  heightModeByViewport: Record<"desktop" | "mobile", "viewport" | "ratio" | "content">;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
  copyPlacementByViewport: Record<"desktop" | "mobile", "overlay" | "stacked" | "split">;
  spacingPolicy: readonly ("compact" | "normal" | "spacious" | "grand")[];
  media: readonly MediaSlot[];
  roles: readonly {
    id: string;
    role: ContentTemplateSkeletonRole;
    kind: string;
    required: boolean;
    assetClass?: ContentTemplateAssetClass;
    semantic?: string;
    previewRoles?: readonly ContentTemplateSkeletonRole[];
    appliesTo?: readonly ("desktop" | "mobile")[];
    fallbackRoleId?: string;
    parentRole?: string;
    positioning?: string;
    proof?: string;
    relation?: string;
    emphasis?: string;
    quantity?: { default: number; min: number; max: number };
    defaultRatioByViewport?: Partial<Record<"desktop" | "mobile", string>>;
    allowedRatioPresetsByViewport?: Partial<Record<"desktop" | "mobile", readonly string[]>>;
  }[];
  order: Record<"desktop" | "mobile", readonly string[]>;
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
  editorCapabilities: {
    primaryTask: "media" | "product" | "category" | "structured" | "text" | "action";
    referenceFields?: readonly {
      kind: "product" | "category";
      key: string;
      legacyKey?: string;
      min: number;
      max: number;
    }[];
    layoutOverrides?: {
      framePresets?: readonly string[];
      frameRatioPresets?: readonly string[];
      frameRatioRange?: { min: number; max: number; step: number };
      compositionPresets?: readonly string[];
      slots?: readonly {
        roleId: string;
        fieldKey?: string;
        ratioPresets?: readonly string[];
        sizePresets?: readonly string[];
        positionPresets?: readonly string[];
        fit?: readonly ("cover" | "contain")[];
        zoom?: { min: number; max: number; step: number };
        focusByViewport?: boolean;
      }[];
      textRoles?: readonly {
        roleId: string;
        placementPresets?: readonly string[];
        widthPresets?: readonly string[];
        sizePresets?: readonly string[];
        align?: readonly ("left" | "center" | "right")[];
        colorTokens?: readonly string[];
        requiresSafeBand?: boolean;
        maxLines?: number;
      }[];
    };
  };
  desktopCopyRatio?: number;
  desktopMediaRatio?: number;
};

export type ContentTemplateMarker = {
  key: ContentTemplateKey;
  version: number;
};

export type ContentTemplateInstanceOverridesV1 = {
  version: 1;
  layout?: {
    framePreset?: string;
    compositionPreset?: string;
  };
  slots?: Record<string, {
    ratioPreset?: string;
    sizePreset?: string;
    positionPreset?: string;
    fit?: "cover" | "contain";
    zoom?: number;
    focusByViewport?: Partial<Record<"desktop" | "mobile", { x: number; y: number }>>;
  }>;
  textRoles?: Record<string, {
    enabled?: boolean;
    placementPreset?: string;
    widthPreset?: string;
    sizePreset?: string;
    align?: "left" | "center" | "right";
    colorToken?: string;
    safeBand?: "light" | "dark";
  }>;
};

export type ContentTemplateVisualRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ContentTemplateInstanceOverridesV2 = {
  version: 2;
  frame?: {
    aspectRatio?: number;
    aspectRatioByViewport?: Partial<Record<"desktop" | "mobile", number>>;
    heightPreset?: string;
    compositionPreset?: string;
    colorPreset?: string;
    customColors?: {
      background?: string;
      text?: string;
      accent?: string;
    };
  };
  nodes?: Record<string, {
    enabled?: boolean;
    rectByViewport?: Partial<Record<"desktop" | "mobile", ContentTemplateVisualRect>>;
    ratio?: number;
    mediaView?: {
      fit?: "cover" | "contain";
      zoom?: number;
      focusByViewport?: Partial<Record<"desktop" | "mobile", { x: number; y: number }>>;
    };
    typography?: {
      sizeLevel?: "xs" | "sm" | "md" | "lg" | "xl";
      align?: "left" | "center" | "right";
      color?: string;
      maxLines?: number;
      safeBand?: "none" | "light" | "dark";
    };
  }>;
};

export type ContentTemplateInstanceOverrides =
  | ContentTemplateInstanceOverridesV1
  | ContentTemplateInstanceOverridesV2;

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
  heightModeByViewport: Record<"desktop" | "mobile", "viewport" | "ratio" | "content">;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
  slots: readonly { key: string; role: ContentTemplateSkeletonRole; desktopRatio?: string; mobileRatio?: string }[];
  order: Record<"desktop" | "mobile", readonly ContentTemplateSkeletonRole[]>;
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
    | "page-validation"
    | \`page-validation-\${string}\`;
  severity: ContentTemplateIssueSeverity;
  layer: "contract" | "page";
  blockId?: string;
  moduleType?: string;
  field?: string;
  index?: number;
  path: string;
  message: string;
};

export type ContentTemplateCompletion = {
  material: { complete: boolean; missing: string[] };
  content: { complete: boolean; missing: string[] };
  publish: { complete: boolean; issues: ContentTemplateIssue[] };
};

export const CONTENT_TEMPLATE_REGISTRY = ${JSON.stringify(registry, sortReplacer, 2)} as const;

/** 23 个真实 Renderer 的完整 schema v3 合同；implementationStatus 不再决定可否渲染。 */
export const CONTENT_TEMPLATE_CONTRACTS = ${JSON.stringify(contractMap, sortReplacer, 2)} as const satisfies Record<ContentTemplateKey, ContentTemplateContract>;

/** 全部 23 个模板的中性结构预览；不承担业务、发布或 Inspector 完整合同。 */
export const CONTENT_TEMPLATE_SKELETONS = ${JSON.stringify(templateSkeletonMap, sortReplacer, 2)} as const satisfies Record<string, ContentTemplateSkeleton>;

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

export function getContentTemplatePageRule(pageKey: string) {
  return (CONTENT_TEMPLATE_PAGE_RULES as Record<string, ContentTemplatePageRule | undefined>)[pageKey];
}

export function isContentTemplateAllowedForPage(pageKey: string, moduleType: string) {
  const rule = getContentTemplatePageRule(pageKey);
  const contract = getContentTemplateContract(moduleType);
  return Boolean(
    rule
      && contract
      && (rule.allowedTemplateKeys as readonly ContentTemplateKey[]).includes(contract.key),
  );
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

function getInstanceOverrideIssues(input: {
  contract: ContentTemplateContract;
  props: Record<string, unknown>;
  blockId?: string;
  moduleType: string;
  basePath?: string;
}): ContentTemplateIssue[] {
  const overrides = input.props.__instanceOverrides;
  if (overrides === undefined) return [];
  const basePath = input.basePath ?? "props.__instanceOverrides";
  const issue = (message: string, path = basePath, field?: string): ContentTemplateIssue => ({
    code: "page-validation",
    severity: "error",
    layer: "contract",
    blockId: input.blockId,
    moduleType: input.moduleType,
    field,
    path,
    message,
  });
  if (!isRecord(overrides)) {
    return [issue("实例覆盖格式或版本无效，无法安全应用。")];
  }
  if (overrides.version === 2) {
    const issues: ContentTemplateIssue[] = [];
    const finiteInRange = (value: unknown, min: number, max: number) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= min && numeric <= max;
    };
    const brandInstanceColors = new Set([
      "#181A1B", "#5F6568", "#DDE1E2", "#F7F8F8", "#FFFFFF",
      "#222222", "#66645F", "#E4E3DF", "#F8F7F4", "#FCFCFB",
    ]);
    const isSafeColor = (value: unknown) =>
      typeof value === "string" && brandInstanceColors.has(value.toUpperCase());
    const frame = isRecord(overrides.frame) ? overrides.frame : undefined;
    const frameCapabilities = input.contract.editorCapabilities.layoutOverrides ?? {};
    const frameRatioRange = frameCapabilities.frameRatioRange;
    const ratioMin = frameRatioRange?.min ?? 0.25;
    const ratioMax = frameRatioRange?.max ?? 4;
    if (frame?.aspectRatio !== undefined && (!frameRatioRange || !finiteInRange(frame.aspectRatio, ratioMin, ratioMax))) {
      issues.push(issue("当前模板未开放整体比例，或比例超出 " + ratioMin + "–" + ratioMax + " 的安全范围。", basePath + ".frame.aspectRatio", "aspectRatio"));
    }
    if (frame?.aspectRatioByViewport !== undefined) {
      if (!isRecord(frame.aspectRatioByViewport)) {
        issues.push(issue("响应式画面比例格式无效。", basePath + ".frame.aspectRatioByViewport", "aspectRatioByViewport"));
      } else {
        for (const [viewport, ratio] of Object.entries(frame.aspectRatioByViewport)) {
          const ratioPath = basePath + ".frame.aspectRatioByViewport." + viewport;
          if (!frameRatioRange || !["desktop", "mobile"].includes(viewport) || !finiteInRange(ratio, ratioMin, ratioMax)) {
            issues.push(issue("当前模板的设备画面比例必须位于 " + ratioMin + "–" + ratioMax + " 的允许范围。", ratioPath, "aspectRatioByViewport"));
          }
        }
      }
    }
    if (frame?.heightPreset !== undefined && !frameCapabilities.framePresets?.includes(String(frame.heightPreset))) {
      issues.push(issue("当前模板不允许该整体高度预设。", basePath + ".frame.heightPreset", "heightPreset"));
    }
    if (frame?.compositionPreset !== undefined && !frameCapabilities.compositionPresets?.includes(String(frame.compositionPreset))) {
      issues.push(issue("当前模板不允许该构图预设。", basePath + ".frame.compositionPreset", "compositionPreset"));
    }
    if (frame?.customColors !== undefined) {
      if (!isRecord(frame.customColors)) {
        issues.push(issue("实例配色格式无效。", basePath + ".frame.customColors", "customColors"));
      } else {
        for (const colorKey of ["background", "text", "accent"] as const) {
          const color = frame.customColors[colorKey];
          if (color !== undefined && !isSafeColor(color)) {
            issues.push(issue("实例颜色只允许使用受控品牌色板。", basePath + ".frame.customColors." + colorKey, colorKey));
          }
        }
      }
    }
    const nodes = isRecord(overrides.nodes) ? overrides.nodes : {};
    for (const [nodeId, rawNode] of Object.entries(nodes)) {
      const path = basePath + ".nodes." + nodeId;
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(nodeId) || !isRecord(rawNode)) {
        issues.push(issue("可视化节点标识或格式无效。", path, nodeId));
        continue;
      }
      const slotCapability = frameCapabilities.slots?.find((slot) => slot.roleId === nodeId);
      const textCapability = frameCapabilities.textRoles?.find((role) => role.roleId === nodeId);
      if (!slotCapability && !textCapability) {
        issues.push(issue("当前模板未声明该可视化节点的实例编辑能力。", path, nodeId));
        continue;
      }
      if (rawNode.enabled !== undefined && !textCapability) {
        issues.push(issue("当前节点不允许启用或隐藏文字角色。", path + ".enabled", nodeId));
      }
      if (rawNode.ratio !== undefined && !finiteInRange(rawNode.ratio, 0.25, 4)) {
        issues.push(issue("节点比例必须位于 0.25–4 的安全范围。", path + ".ratio", nodeId));
      }
      if (rawNode.ratio !== undefined && !slotCapability) {
        issues.push(issue("当前节点不允许图片槽位比例覆盖。", path + ".ratio", nodeId));
      }
      if (rawNode.ratio !== undefined && slotCapability?.ratioPresets?.length) {
        const numericRatio = Number(rawNode.ratio);
        const allowedRatios = slotCapability.ratioPresets.map((preset) => {
          const [width, height] = String(preset).split("/").map(Number);
          return width / height;
        });
        if (!allowedRatios.some((allowedRatio) => Math.abs(allowedRatio - numericRatio) < 0.001)) {
          issues.push(issue("当前模板不允许该图片槽位比例。", path + ".ratio", nodeId));
        }
      }
      if (rawNode.rectByViewport !== undefined) {
        if (!isRecord(rawNode.rectByViewport)) {
          issues.push(issue("节点响应式位置格式无效。", path + ".rectByViewport", nodeId));
        } else {
          for (const [viewport, rawRect] of Object.entries(rawNode.rectByViewport)) {
            const rectPath = path + ".rectByViewport." + viewport;
            if (!["desktop", "mobile"].includes(viewport) || !isRecord(rawRect)) {
              issues.push(issue("节点设备位置格式无效。", rectPath, nodeId));
              continue;
            }
            const x = Number(rawRect.x);
            const y = Number(rawRect.y);
            const width = Number(rawRect.width);
            const height = Number(rawRect.height);
            if (![x, y, width, height].every((value) => Number.isFinite(value)) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.0001 || y + height > 1.0001) {
              issues.push(issue("节点必须完整位于画面 0–1 的归一化范围内。", rectPath, nodeId));
            }
          }
        }
      }
      if (rawNode.mediaView !== undefined) {
        if (!slotCapability) {
          issues.push(issue("当前节点不允许图片观看窗覆盖。", path + ".mediaView", nodeId));
        } else if (!isRecord(rawNode.mediaView)) {
          issues.push(issue("图片观看窗格式无效。", path + ".mediaView", nodeId));
        } else {
          const mediaView = rawNode.mediaView;
          if (mediaView.fit !== undefined && !slotCapability.fit?.some((fit) => fit === String(mediaView.fit))) {
            issues.push(issue("图片适配方式无效。", path + ".mediaView.fit", nodeId));
          }
          if (
            mediaView.zoom !== undefined &&
            (!slotCapability.zoom || !finiteInRange(mediaView.zoom, slotCapability.zoom.min, slotCapability.zoom.max))
          ) {
            issues.push(issue("图片缩放超出当前模板槽位允许范围。", path + ".mediaView.zoom", nodeId));
          }
          const focusByViewport = mediaView.focusByViewport;
          if (focusByViewport !== undefined) {
            if (!isRecord(focusByViewport)) {
              issues.push(issue("图片焦点格式无效。", path + ".mediaView.focusByViewport", nodeId));
            } else {
              for (const [viewport, rawFocus] of Object.entries(focusByViewport)) {
                const focusPath = path + ".mediaView.focusByViewport." + viewport;
                if (!slotCapability.focusByViewport || !["desktop", "mobile"].includes(viewport) || !isRecord(rawFocus) || !finiteInRange(rawFocus.x, 0, 100) || !finiteInRange(rawFocus.y, 0, 100)) {
                  issues.push(issue("图片焦点必须位于 0–100 的归一化范围。", focusPath, nodeId));
                }
              }
            }
          }
        }
      }
      if (rawNode.typography !== undefined) {
        if (!textCapability) {
          issues.push(issue("当前节点不允许文字排版覆盖。", path + ".typography", nodeId));
        } else if (!isRecord(rawNode.typography)) {
          issues.push(issue("文字布局格式无效。", path + ".typography", nodeId));
        } else {
          const typography = rawNode.typography;
          const sizeLevelToPreset: Record<string, string> = { xs: "small", sm: "small", md: "standard", lg: "large", xl: "large" };
          if (
            typography.sizeLevel !== undefined &&
            !textCapability.sizePresets?.includes(sizeLevelToPreset[String(typography.sizeLevel)])
          ) {
            issues.push(issue("字号级别无效。", path + ".typography.sizeLevel", nodeId));
          }
          if (typography.align !== undefined && !textCapability.align?.some((align) => align === String(typography.align))) {
            issues.push(issue("文字对齐方式无效。", path + ".typography.align", nodeId));
          }
          const tokenColors: Record<string, string[]> = {
            ink: ["#181A1B", "#222222"],
            mineral: ["#5F6568", "#66645F"],
            ivory: ["#FFFFFF", "#F7F8F8", "#FCFCFB", "#F8F7F4"],
          };
          const allowedColors = (textCapability.colorTokens ?? []).flatMap((token) => tokenColors[token] ?? []);
          if (
            typography.color !== undefined &&
            (!isSafeColor(typography.color) || !allowedColors.some((color) => color.toLowerCase() === String(typography.color).toLowerCase()))
          ) {
            issues.push(issue("当前模板不允许该文字颜色。", path + ".typography.color", nodeId));
          }
          if (
            typography.maxLines !== undefined &&
            (!Number.isInteger(Number(typography.maxLines)) || !finiteInRange(typography.maxLines, 1, textCapability.maxLines ?? 12))
          ) {
            issues.push(issue("文字最大行数超出当前角色允许范围。", path + ".typography.maxLines", nodeId));
          }
          if (typography.safeBand !== undefined && !["none", "light", "dark"].includes(String(typography.safeBand))) {
            issues.push(issue("安全文字带值无效。", path + ".typography.safeBand", nodeId));
          }
        }
      }
      const textValue = input.props[nodeId];
      const roleHasContent = typeof textValue === "string" && textValue.trim().length > 0;
      const roleVisible = rawNode.enabled === true || (rawNode.enabled !== false && roleHasContent);
      const roleHasVisualOverride = rawNode.enabled !== undefined || rawNode.rectByViewport !== undefined || rawNode.typography !== undefined;
      if (rawNode.enabled === true && textCapability && !roleHasContent) {
        const contentPath = basePath.endsWith(".__instanceOverrides")
          ? basePath.slice(0, -".__instanceOverrides".length) + "." + nodeId
          : "props." + nodeId;
        issues.push(issue("已启用的文字角色必须填写内容。", contentPath, nodeId));
      }
      if (roleVisible && roleHasVisualOverride && textCapability?.requiresSafeBand) {
        const typography = isRecord(rawNode.typography) ? rawNode.typography : {};
        if (typography.safeBand !== "light" && typography.safeBand !== "dark") {
          issues.push(issue(
            "图片叠字需选择浅色或深色安全文字带后才能发布。",
            path + ".typography.safeBand",
            nodeId,
          ));
        }
      }
    }
    return issues;
  }
  if (overrides.version !== 1) {
    return [issue("实例覆盖格式或版本无效，无法安全应用。")];
  }
  const capabilities = input.contract.editorCapabilities.layoutOverrides ?? {};
  const issues: ContentTemplateIssue[] = [];
  const layout = isRecord(overrides.layout) ? overrides.layout : undefined;
  if (layout) {
    const framePreset = layout.framePreset;
    if (framePreset !== undefined && !capabilities.framePresets?.includes(String(framePreset))) {
      issues.push(issue("当前模板不允许该整体画面预设。", basePath + ".layout.framePreset", "framePreset"));
    }
    const compositionPreset = layout.compositionPreset;
    if (compositionPreset !== undefined && !capabilities.compositionPresets?.includes(String(compositionPreset))) {
      issues.push(issue("当前模板不允许该构图预设。", basePath + ".layout.compositionPreset", "compositionPreset"));
    }
  }
  const slots = isRecord(overrides.slots) ? overrides.slots : {};
  for (const [roleId, value] of Object.entries(slots)) {
    const capability = capabilities.slots?.find((slot) => slot.roleId === roleId);
    const path = basePath + ".slots." + roleId;
    if (!capability || !isRecord(value)) {
      issues.push(issue("当前模板不允许该图片槽位覆盖。", path, roleId));
      continue;
    }
    const checks: Array<[unknown, readonly string[] | undefined, string, string]> = [
      [value.ratioPreset, capability.ratioPresets, "ratioPreset", "图片槽位比例"],
      [value.sizePreset, capability.sizePresets, "sizePreset", "图片槽位尺寸"],
      [value.positionPreset, capability.positionPresets, "positionPreset", "图片槽位位置"],
      [value.fit, capability.fit, "fit", "图片适配方式"],
    ];
    for (const [selected, allowed, key, label] of checks) {
      if (selected !== undefined && !allowed?.includes(String(selected))) {
        issues.push(issue("当前模板不允许该" + label + "。", path + "." + key, roleId));
      }
    }
    if (value.zoom !== undefined) {
      const zoom = Number(value.zoom);
      if (!capability.zoom || !Number.isFinite(zoom) || zoom < capability.zoom.min || zoom > capability.zoom.max) {
        issues.push(issue("图片缩放超出当前模板允许范围。", path + ".zoom", roleId));
      }
    }
    if (value.focusByViewport !== undefined) {
      if (!capability.focusByViewport || !isRecord(value.focusByViewport)) {
        issues.push(issue("当前模板不允许该设备焦点覆盖。", path + ".focusByViewport", roleId));
      } else {
        for (const [viewport, focus] of Object.entries(value.focusByViewport)) {
          if (!["desktop", "mobile"].includes(viewport) || !isRecord(focus)) {
            issues.push(issue("设备焦点格式无效。", path + ".focusByViewport." + viewport, roleId));
            continue;
          }
          const x = Number(focus.x);
          const y = Number(focus.y);
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
            issues.push(issue("设备焦点必须位于 0–100 的归一化范围。", path + ".focusByViewport." + viewport, roleId));
          }
        }
      }
    }
  }
  const textRoles = isRecord(overrides.textRoles) ? overrides.textRoles : {};
  for (const [roleId, value] of Object.entries(textRoles)) {
    const capability = capabilities.textRoles?.find((role) => role.roleId === roleId) ??
      (input.contract.key === "hero" && roleId === "copy"
        ? {
            roleId: "copy",
            placementPresets: ["overlay"],
            widthPresets: ["narrow", "standard", "wide"],
            sizePresets: ["small", "standard", "large"],
            align: ["left", "center", "right"],
            colorTokens: ["ink", "ivory"],
            requiresSafeBand: true,
            maxLines: 4,
          }
        : undefined);
    const path = basePath + ".textRoles." + roleId;
    if (!capability || !isRecord(value)) {
      issues.push(issue("当前模板不允许该文字角色覆盖。", path, roleId));
      continue;
    }
    const checks: Array<[unknown, readonly string[] | undefined, string, string]> = [
      [value.placementPreset, capability.placementPresets, "placementPreset", "文字位置"],
      [value.widthPreset, capability.widthPresets, "widthPreset", "文字宽度"],
      [value.sizePreset, capability.sizePresets, "sizePreset", "字号级别"],
      [value.align, capability.align, "align", "文字对齐"],
      [value.colorToken, capability.colorTokens, "colorToken", "文字颜色"],
    ];
    for (const [selected, allowed, key, label] of checks) {
      if (selected !== undefined && !allowed?.includes(String(selected))) {
        issues.push(issue("当前模板不允许该" + label + "。", path + "." + key, roleId));
      }
    }
    if (value.enabled === true && capability.requiresSafeBand && value.safeBand !== "light" && value.safeBand !== "dark") {
      issues.push(issue("图片叠字需选择浅色或深色安全文字带后才能发布。", path + ".safeBand", roleId));
    }
  }
  return issues;
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
  const overrideIssues = getInstanceOverrideIssues({
    contract,
    props,
    blockId,
    moduleType,
    basePath: path.endsWith(".__contentTemplate")
      ? path.slice(0, -".__contentTemplate".length) + ".__instanceOverrides"
      : "props.__instanceOverrides",
  });

  if (marker === undefined) {
    if (props.__instanceOverrides !== undefined) {
      return [{
        ...base,
        code: "content-template-marker-invalid",
        severity: "error",
        message: "实例覆盖缺少当前内容模板版本印记，不能按旧合同猜测渲染。",
      }, ...overrideIssues];
    }
    return [{
      ...base,
      code: "content-template-legacy",
      severity: "info",
      message: "历史区块未携带内容模板版本印记，按 legacy-0 兼容读取；普通保存不会自动升级。",
    }, ...overrideIssues];
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
    if (markerVersion === 1 && contract.version === 2 && props.__instanceOverrides === undefined) {
      return [{
        ...base,
        code: "content-template-legacy",
        severity: "info",
        message: "内容模板版本 1 按原构图兼容读取；普通保存不会自动升级到实例覆盖合同。",
      }];
    }
    return [{
      ...base,
      code: "content-template-version-unsupported",
      severity: "error",
      message: "内容模板版本暂不受支持，无法猜测为当前版本。",
    }];
  }
  return overrideIssues;
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
