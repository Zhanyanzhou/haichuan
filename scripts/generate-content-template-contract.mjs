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
const resizeDirections = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

const roundGeometry = (value) => Number(value.toFixed(6));

/**
 * schema v4 以归一化 defaultGeometryByViewport 为唯一默认构图来源。
 * 旧的 12 列预览网格只是渲染适配层，必须由真实几何投影生成。
 */
const projectGeometryToPreview = (template, device, geometry) => {
  const rows = geometry.rows ?? 8;
  const zones = geometry.zones.map((zone) => ({
    role: zone.role,
    column: roundGeometry(zone.rect.x * 12 + 1),
    span: roundGeometry(zone.rect.width * 12),
    row: roundGeometry(zone.rect.y * rows + 1),
    rowSpan: roundGeometry(zone.rect.height * rows),
    ...(zone.overlay ? { overlay: true } : {}),
    ...(zone.kind ? { kind: zone.kind } : {}),
    roleId: zone.roleId,
  }));
  return {
    tone: geometry.tone,
    ...(rows === 8 ? {} : { rows }),
    order: derivePreviewOrder(template, device, { zones }),
    zones,
  };
};

function validateDefaultGeometry(template) {
  invariant(
    template.defaultGeometryByViewport && typeof template.defaultGeometryByViewport === "object",
    `${template.key}.defaultGeometryByViewport 缺失`,
  );
  const rolesById = new Map(template.roles.map((role) => [role.id, role]));
  for (const device of rootDevices) {
    const geometry = template.defaultGeometryByViewport[device];
    invariant(geometry && typeof geometry === "object", `${template.key}.defaultGeometryByViewport.${device} 缺失`);
    invariant(["light", "dark"].includes(geometry.tone), `${template.key}.defaultGeometryByViewport.${device}.tone 无效`);
    invariant(Number.isFinite(geometry.frameAspectRatio) && geometry.frameAspectRatio >= 0.25 && geometry.frameAspectRatio <= 4, `${template.key}.defaultGeometryByViewport.${device}.frameAspectRatio 无效`);
    invariant(Number.isInteger(geometry.rows) && geometry.rows >= 6 && geometry.rows <= 12, `${template.key}.defaultGeometryByViewport.${device}.rows 无效`);
    const safeArea = geometry.safeArea;
    invariant(safeArea && [safeArea.x, safeArea.y, safeArea.width, safeArea.height].every(Number.isFinite), `${template.key}.defaultGeometryByViewport.${device}.safeArea 缺失`);
    invariant(safeArea.x >= 0 && safeArea.y >= 0 && safeArea.width > 0 && safeArea.height > 0 && safeArea.x + safeArea.width <= 1 && safeArea.y + safeArea.height <= 1, `${template.key}.defaultGeometryByViewport.${device}.safeArea 越界`);
    invariant(Array.isArray(geometry.zones) && geometry.zones.length > 0, `${template.key}.defaultGeometryByViewport.${device}.zones 缺失`);
    for (const zone of geometry.zones) {
      invariant(rolesById.has(zone.roleId), `${template.key}.defaultGeometryByViewport.${device}.${zone.roleId} 未声明角色`);
      invariant(typeof zone.nodeId === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(zone.nodeId), `${template.key}.defaultGeometryByViewport.${device}.${zone.roleId}.nodeId 无效`);
      const rect = zone.rect;
      invariant(rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite), `${template.key}.defaultGeometryByViewport.${device}.${zone.nodeId}.rect 缺失`);
      invariant(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001, `${template.key}.defaultGeometryByViewport.${device}.${zone.nodeId}.rect 越界`);
    }
    if (template.copyPlacementByViewport?.[device] === "stacked") {
      const overlaidFlowRoles = geometry.zones.filter((zone) => {
        const role = rolesById.get(zone.roleId);
        return zone.overlay === true && (role?.kind === "text" || role?.kind === "action");
      });
      invariant(
        overlaidFlowRoles.length === 0,
        `${template.key}.defaultGeometryByViewport.${device} 堆叠文字与行动不得声明 overlay`,
      );
    }
  }
}

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
  const publicPaths = rules.map((rule) => rule.publicPath);
  invariant(new Set(publicPaths).size === publicPaths.length, "pageRules.publicPath 不得重复");
  const templatesByKey = new Map(source.templates.map((template) => [template.key, template]));
  for (const rule of rules) {
    invariant(/^[a-z0-9-]+$/i.test(rule.pageKey), `pageRules.${rule.pageKey}.pageKey 无效`);
    const expectedPublicPath = rule.pageKey === "home" ? "/" : "/" + rule.pageKey;
    invariant(
      rule.publicPath === expectedPublicPath,
      `pageRules.${rule.pageKey}.publicPath 必须是 ${expectedPublicPath}`,
    );
    invariant(typeof rule.pageRole === "string" && rule.pageRole.length > 0, `pageRules.${rule.pageKey}.pageRole 缺失`);
    invariant(
      rule.contentPlacement === "root-only",
      `pageRules.${rule.pageKey}.contentPlacement 必须为 root-only`,
    );
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
  const reachableTemplateKeys = new Set(rules.flatMap((rule) => rule.allowedTemplateKeys));
  invariant(
    source.templates
      .filter((template) => template.implementationStatus === "active")
      .every((template) => reachableTemplateKeys.has(template.key)),
    "每个 active 模板必须至少适用于一个真实页面角色",
  );
}

function validatePageMetadata(metadata) {
  invariant(metadata && typeof metadata === "object" && !Array.isArray(metadata), "pageMetadata 缺失");
  const publicFields = ["seoTitle", "seoDescription", "ogImage"];
  const supportedFields = [...publicFields, "contentOwner"];
  invariant(
    Array.isArray(metadata.requiredForPublication)
      && metadata.requiredForPublication.length === supportedFields.length
      && supportedFields.every((field) => metadata.requiredForPublication.includes(field))
      && new Set(metadata.requiredForPublication).size === metadata.requiredForPublication.length,
    "pageMetadata.requiredForPublication 必须完整声明三项公开 SEO 与内部 contentOwner",
  );
  invariant(
    Array.isArray(metadata.publicFields)
      && metadata.publicFields.length === publicFields.length
      && publicFields.every((field) => metadata.publicFields.includes(field))
      && new Set(metadata.publicFields).size === metadata.publicFields.length,
    "pageMetadata.publicFields 只能完整声明三项公开 SEO 字段",
  );
  invariant(
    metadata.limits && typeof metadata.limits === "object" && !Array.isArray(metadata.limits),
    "pageMetadata.limits 缺失",
  );
  invariant(
    Object.keys(metadata.limits).length === supportedFields.length
      && supportedFields.every((field) => Number.isInteger(metadata.limits[field]) && metadata.limits[field] > 0),
    "pageMetadata.limits 必须完整声明三项公开 SEO 与内部 contentOwner 的正整数上限",
  );
  invariant(
    metadata.mediaRights
      && typeof metadata.mediaRights === "object"
      && !Array.isArray(metadata.mediaRights),
    "pageMetadata.mediaRights 缺失",
  );
  invariant(
    Number.isInteger(metadata.mediaRights.maxItems)
      && metadata.mediaRights.maxItems > 0,
    "pageMetadata.mediaRights.maxItems 必须是正整数",
  );
  const mediaRightFields = ["assetUrl", "source", "authorizationId"];
  invariant(
    metadata.mediaRights.fieldLimits
      && typeof metadata.mediaRights.fieldLimits === "object"
      && !Array.isArray(metadata.mediaRights.fieldLimits)
      && Object.keys(metadata.mediaRights.fieldLimits).length === mediaRightFields.length
      && mediaRightFields.every(
        (field) => Number.isInteger(metadata.mediaRights.fieldLimits[field])
          && metadata.mediaRights.fieldLimits[field] > 0,
      ),
    "pageMetadata.mediaRights.fieldLimits 必须完整声明素材地址、来源与授权编号上限",
  );
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
    if (role.publicationAttestation !== undefined) {
      const editableObject = template.editorCapabilities?.editableObjects?.find((object) => object.roleId === role.id);
      invariant(
        editableObject?.kind === "collection" && editableObject.collectionFieldKeys?.length > 0,
        `${template.key}.${role.id}.publicationAttestation 必须绑定集合编辑对象`,
      );
      invariant(
        /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(role.publicationAttestation.fieldKey)
          && typeof role.publicationAttestation.label === "string"
          && role.publicationAttestation.label.trim().length > 0,
        `${template.key}.${role.id}.publicationAttestation 必须声明有效字段与标签`,
      );
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
for (const template of source.templates) {
  validateDefaultGeometry(template);
  template.preview = {
    purpose: template.preview.purpose,
    visualRole: template.preview.visualRole,
    desktop: projectGeometryToPreview(template, "desktop", template.defaultGeometryByViewport.desktop),
    mobile: projectGeometryToPreview(template, "mobile", template.defaultGeometryByViewport.mobile),
  };
  validateUnifiedRoot(template);
}
validatePageRules(source.pageRules);
validatePageMetadata(source.pageMetadata);

// 权威 JSON 从 schema v4 起以归一化 defaultGeometryByViewport 声明双端根构图。
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
  for (const object of template.editorCapabilities?.editableObjects ?? []) {
    if (object.kind !== "media" && object.kind !== "video") continue;
    // 媒体字段由同一 editableObjects.contentFieldKeys 只读派生：仅 media/video
    // 对象中以 image/url 结尾的字段才是可发布素材；alt、标签和播放参数不会误入。
    object.mediaFieldKeys = object.contentFieldKeys.filter((field) =>
      /(?:image|url)/i.test(field) && !/alt/i.test(field),
    );
    invariant(
      object.mediaFieldKeys.length > 0,
      `${template.key}.editableObjects.${object.roleId} 未派生出媒体字段`,
    );
  }
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
const commercialPurposes = new Set(["品牌展示", "商品销售", "活动转化", "内容传播", "信任建立"]);
const statuses = new Set(["active", "planned"]);
const viewportModes = new Set(["viewport", "ratio", "content"]);
const visualRoles = new Set(["primary-stage", "feature-stage", "support-stage"]);
const widths = new Set(["full", "standard", "wide", "editorial"]);
const flows = new Set(["bleed", "flow"]);
const copyPlacements = new Set(["overlay", "stacked", "split"]);
const primaryTasks = new Set(["media", "product", "category", "structured", "text", "action"]);
const editableObjectKinds = new Set(["media", "video", "text", "action", "product", "collection"]);
const altPolicies = new Set(["required", "derived", "decorative", "not-applicable"]);
const editableObjectCapabilities = new Set([
  "content", "layout", "layer", "visibility", "ratio", "size", "position",
  "fit", "zoom", "focus", "typography", "link", "items", "reference", "playback",
]);
const responsiveScopes = new Set(["shared", "viewport-specific"]);
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
invariant(
  Number.isInteger(source.publicationGateVersion) && source.publicationGateVersion > 0,
  "publicationGateVersion 必须是正整数",
);
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
  invariant(commercialPurposes.has(template.commercialPurpose), `${template.key}.commercialPurpose 不合法`);
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
  const editableObjects = template.editorCapabilities.editableObjects ?? [];
  invariant(Array.isArray(editableObjects) && editableObjects.length > 0, `${template.key}.editorCapabilities.editableObjects 缺失`);
  const editableRoleIds = editableObjects.map((object) => object.roleId);
  invariant(new Set(editableRoleIds).size === editableRoleIds.length, `${template.key}.editableObjects.roleId 不得重复`);
  const editableNodeIds = new Set();
  for (const object of editableObjects) {
    const role = template.roles.find((candidate) => candidate.id === object.roleId);
    invariant(editableObjectKinds.has(object.kind), `${template.key}.editableObjects.${object.roleId}.kind 不合法`);
    const nodeIds = object.nodeIds ?? [object.roleId];
    invariant(Array.isArray(nodeIds) && nodeIds.length > 0, `${template.key}.editableObjects.${object.roleId}.nodeIds 不能为空`);
    invariant(nodeIds.includes(object.roleId), `${template.key}.editableObjects.${object.roleId}.nodeIds 必须包含 roleId`);
    invariant(new Set(nodeIds).size === nodeIds.length, `${template.key}.editableObjects.${object.roleId}.nodeIds 不得重复`);
    for (const nodeId of nodeIds) {
      invariant(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(nodeId), `${template.key}.editableObjects.${object.roleId}.nodeIds 含非法节点 ${nodeId}`);
      invariant(!editableNodeIds.has(nodeId), `${template.key}.editableObjects 节点 ${nodeId} 被多个对象声明`);
      editableNodeIds.add(nodeId);
    }
    invariant(Array.isArray(object.contentFieldKeys), `${template.key}.editableObjects.${object.roleId}.contentFieldKeys 必须是数组`);
    invariant(new Set(object.contentFieldKeys).size === object.contentFieldKeys.length, `${template.key}.editableObjects.${object.roleId}.contentFieldKeys 不得重复`);
    invariant(object.contentFieldKeys.every((field) => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field)), `${template.key}.editableObjects.${object.roleId}.contentFieldKeys 含非法字段`);
    const specialFieldKeys = [
      object.altFieldKey,
      object.referenceFieldKey,
      ...(object.collectionFieldKeys ?? []),
    ].filter(Boolean);
    invariant(specialFieldKeys.every((field) => object.contentFieldKeys.includes(field)), `${template.key}.editableObjects.${object.roleId} 的特殊字段必须包含在 contentFieldKeys`);
    if (object.altPolicy !== undefined) {
      invariant(altPolicies.has(object.altPolicy), `${template.key}.editableObjects.${object.roleId}.altPolicy 不合法`);
    }
    if (object.kind === "media" || object.kind === "video") {
      invariant(Boolean(object.altPolicy), `${template.key}.editableObjects.${object.roleId} 必须明确声明 altPolicy`);
      if (object.altPolicy === "required") {
        invariant(Boolean(object.altFieldKey), `${template.key}.editableObjects.${object.roleId} 的 required altPolicy 必须绑定 altFieldKey`);
      }
      if (object.altFieldKey) {
        invariant(object.altPolicy === "required", `${template.key}.editableObjects.${object.roleId} 声明 altFieldKey 时必须使用 required altPolicy`);
      }
    }
    if (object.referenceFieldKey) {
      invariant(
        (template.editorCapabilities.referenceFields ?? []).some((reference) => reference.key === object.referenceFieldKey),
        `${template.key}.editableObjects.${object.roleId}.referenceFieldKey 未映射 referenceFields`,
      );
    }
    if (object.collectionFieldKeys !== undefined) {
      invariant(Array.isArray(object.collectionFieldKeys) && object.collectionFieldKeys.length > 0, `${template.key}.editableObjects.${object.roleId}.collectionFieldKeys 必须是非空数组`);
    }
    if (object.collectionMediaPolicies !== undefined) {
      invariant(object.kind === "collection", `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies 仅适用于 collection`);
      invariant(Array.isArray(object.collectionMediaPolicies) && object.collectionMediaPolicies.length > 0, `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies 必须是非空数组`);
      const policyKeys = new Set();
      for (const policy of object.collectionMediaPolicies) {
        invariant((object.collectionFieldKeys ?? []).includes(policy.collectionFieldKey), `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies.collectionFieldKey 未映射 collectionFieldKeys`);
        invariant(Array.isArray(policy.mediaFieldKeys) && policy.mediaFieldKeys.length > 0, `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies.mediaFieldKeys 必须是非空数组`);
        invariant(policy.mediaFieldKeys.every((field) => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field)), `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies.mediaFieldKeys 含非法字段`);
        invariant(new Set(policy.mediaFieldKeys).size === policy.mediaFieldKeys.length, `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies.mediaFieldKeys 不得重复`);
        invariant(altPolicies.has(policy.altPolicy), `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies.altPolicy 不合法`);
        if (policy.altPolicy === "required") {
          invariant(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(policy.altFieldKey ?? ""), `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies.required 必须绑定合法 altFieldKey`);
          invariant(policy.derivedAltFieldKey === undefined, `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies.required 不得声明 derivedAltFieldKey`);
        }
        if (policy.altPolicy === "derived") {
          invariant(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(policy.derivedAltFieldKey ?? ""), `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies.derived 必须绑定合法 derivedAltFieldKey`);
          invariant(policy.altFieldKey === undefined, `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies.derived 不得声明 altFieldKey`);
        }
        const policyKey = `${policy.collectionFieldKey}:${policy.mediaFieldKeys.join(",")}`;
        invariant(!policyKeys.has(policyKey), `${template.key}.editableObjects.${object.roleId}.collectionMediaPolicies 不得重复`);
        policyKeys.add(policyKey);
      }
    }
    if (object.collectionLinkPolicies !== undefined) {
      invariant(object.kind === "collection", `${template.key}.editableObjects.${object.roleId}.collectionLinkPolicies 仅适用于 collection`);
      invariant(Array.isArray(object.collectionLinkPolicies) && object.collectionLinkPolicies.length > 0, `${template.key}.editableObjects.${object.roleId}.collectionLinkPolicies 必须是非空数组`);
      invariant(object.capabilities.includes("link"), `${template.key}.editableObjects.${object.roleId}.collectionLinkPolicies 缺少 link 能力`);
      const policyKeys = new Set();
      for (const policy of object.collectionLinkPolicies) {
        invariant((object.collectionFieldKeys ?? []).includes(policy.collectionFieldKey), `${template.key}.editableObjects.${object.roleId}.collectionLinkPolicies.collectionFieldKey 未映射 collectionFieldKeys`);
        invariant(typeof policy.required === "boolean", `${template.key}.editableObjects.${object.roleId}.collectionLinkPolicies.required 必须是布尔值`);
        invariant(!policyKeys.has(policy.collectionFieldKey), `${template.key}.editableObjects.${object.roleId}.collectionLinkPolicies 不得重复`);
        policyKeys.add(policy.collectionFieldKey);
      }
    }
    if (object.kind === "action") {
      const targetTypeFields = object.contentFieldKeys.filter((field) => field === "targetType" || field.endsWith("TargetType"));
      invariant(targetTypeFields.length === 1, `${template.key}.editableObjects.${object.roleId} 必须声明唯一行动目标类型字段`);
      const targetTypeField = targetTypeFields[0];
      const prefix = targetTypeField === "targetType" ? "" : targetTypeField.slice(0, -"TargetType".length);
      const actionTextField = prefix
        ? `${prefix}Text`
        : object.contentFieldKeys.find((field) => field === "actionText" || field === "buttonText");
      invariant(Boolean(actionTextField) && object.contentFieldKeys.includes(actionTextField), `${template.key}.editableObjects.${object.roleId} 缺少行动文案字段`);
      for (const field of [
        prefix ? `${prefix}ProductCode` : "productCode",
        prefix ? `${prefix}ProductId` : "productId",
        prefix ? `${prefix}LinkUrl` : "linkUrl",
      ]) {
        invariant(object.contentFieldKeys.includes(field), `${template.key}.editableObjects.${object.roleId} 缺少行动目标字段 ${field}`);
      }
      invariant(object.capabilities.includes("link"), `${template.key}.editableObjects.${object.roleId} 缺少 link 能力`);
    }
    invariant(Array.isArray(object.capabilities), `${template.key}.editableObjects.${object.roleId}.capabilities 必须是数组`);
    invariant(new Set(object.capabilities).size === object.capabilities.length, `${template.key}.editableObjects.${object.roleId}.capabilities 不得重复`);
    invariant(object.capabilities.every((capability) => editableObjectCapabilities.has(capability)), `${template.key}.editableObjects.${object.roleId}.capabilities 含未知能力`);
    if (object.capabilityViewports !== undefined) {
      invariant(object.capabilityViewports && typeof object.capabilityViewports === "object" && !Array.isArray(object.capabilityViewports), `${template.key}.editableObjects.${object.roleId}.capabilityViewports 必须是对象`);
      for (const [capability, viewports] of Object.entries(object.capabilityViewports)) {
        invariant(object.capabilities.includes(capability), `${template.key}.editableObjects.${object.roleId}.capabilityViewports.${capability} 未声明对应能力`);
        invariant(Array.isArray(viewports) && viewports.length > 0, `${template.key}.editableObjects.${object.roleId}.capabilityViewports.${capability} 必须是非空数组`);
        invariant(new Set(viewports).size === viewports.length && viewports.every((viewport) => rootDevices.includes(viewport)), `${template.key}.editableObjects.${object.roleId}.capabilityViewports.${capability} 包含无效设备`);
      }
    }
    const constraints = object.constraints;
    invariant(constraints && typeof constraints === "object" && !Array.isArray(constraints), `${template.key}.editableObjects.${object.roleId}.constraints 缺失`);
    invariant(
      [constraints.minSize?.width, constraints.minSize?.height, constraints.maxSize?.width, constraints.maxSize?.height].every(Number.isFinite)
        && constraints.minSize.width > 0
        && constraints.minSize.height > 0
        && constraints.maxSize.width >= constraints.minSize.width
        && constraints.maxSize.height >= constraints.minSize.height
        && constraints.maxSize.width <= 1
        && constraints.maxSize.height <= 1,
      `${template.key}.editableObjects.${object.roleId}.constraints 尺寸范围无效`,
    );
    invariant(
      Array.isArray(constraints.movementAxes)
        && constraints.movementAxes.every((axis) => ["x", "y"].includes(axis)),
      `${template.key}.editableObjects.${object.roleId}.constraints.movementAxes 无效`,
    );
    invariant(
      Array.isArray(constraints.allowedResize)
        && constraints.allowedResize.every((direction) => resizeDirections.includes(direction)),
      `${template.key}.editableObjects.${object.roleId}.constraints.allowedResize 无效`,
    );
    invariant(
      Number.isInteger(constraints.layerRange?.min)
        && Number.isInteger(constraints.layerRange?.max)
        && constraints.layerRange.min >= 0
        && constraints.layerRange.max <= 20
        && constraints.layerRange.max >= constraints.layerRange.min,
      `${template.key}.editableObjects.${object.roleId}.constraints.layerRange 无效`,
    );
    for (const flag of ["allowHide", "allowAspectRatio", "allowFocus", "allowZoom", "allowTypography", "safeAreaRequired"]) {
      invariant(typeof constraints[flag] === "boolean", `${template.key}.editableObjects.${object.roleId}.constraints.${flag} 必须是布尔值`);
    }
    invariant(!constraints.allowHide || object.capabilities.includes("visibility"), `${template.key}.editableObjects.${object.roleId}.allowHide 缺少 visibility 能力`);
    invariant(!constraints.allowFocus || object.capabilities.includes("focus"), `${template.key}.editableObjects.${object.roleId}.allowFocus 缺少 focus 能力`);
    invariant(!constraints.allowZoom || object.capabilities.includes("zoom"), `${template.key}.editableObjects.${object.roleId}.allowZoom 缺少 zoom 能力`);
    invariant(!constraints.allowTypography || object.capabilities.includes("typography"), `${template.key}.editableObjects.${object.roleId}.allowTypography 缺少 typography 能力`);
    if (!role) {
      invariant(
        object.kind === "action" &&
          object.contentFieldKeys.length > 0 &&
          object.capabilities.every((capability) => ["content", "link"].includes(capability)),
        `${template.key}.editableObjects.${object.roleId} 未声明为角色时只能作为 content/link 行动字段组`,
      );
    }
    invariant(object.responsive && typeof object.responsive === "object" && !Array.isArray(object.responsive), `${template.key}.editableObjects.${object.roleId}.responsive 缺失`);
    invariant(
      Object.keys(object.responsive).length === object.capabilities.length &&
        object.capabilities.every((capability) => responsiveScopes.has(object.responsive[capability])),
      `${template.key}.editableObjects.${object.roleId}.responsive 必须逐项声明 shared 或 viewport-specific`,
    );
    if (object.fieldScopes !== undefined) {
      invariant(object.fieldScopes && typeof object.fieldScopes === "object" && !Array.isArray(object.fieldScopes), `${template.key}.editableObjects.${object.roleId}.fieldScopes 必须是对象`);
      invariant(
        Object.entries(object.fieldScopes).every(([field, scope]) => object.contentFieldKeys.includes(field) && responsiveScopes.has(scope)),
        `${template.key}.editableObjects.${object.roleId}.fieldScopes 只能覆盖已绑定字段`,
      );
    }
  }
  const policyAltFields = new Set(
    editableObjects
      .filter((object) => object.altPolicy === "required" && object.altFieldKey)
      .map((object) => object.altFieldKey),
  );
  invariant(
    template.contentBudget.requiredText.every((field) => !policyAltFields.has(field)),
    `${template.key}.contentBudget.requiredText 不得重复声明由 altPolicy 管理的替代文字`,
  );
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
    const editableObject = editableObjects.find((object) => (object.nodeIds ?? [object.roleId]).includes(slot.roleId));
    invariant(editableObject, `${template.key}.${slot.roleId} 布局槽位缺少 editableObjects 映射`);
    if (slot.fieldKey) invariant(editableObject.contentFieldKeys.includes(slot.fieldKey), `${template.key}.${slot.roleId}.fieldKey 未进入 editableObjects.contentFieldKeys`);
    const requiredCapabilities = [
      "layout", "layer",
      slot.ratioPresets?.length ? "ratio" : undefined,
      slot.sizePresets?.length ? "size" : undefined,
      slot.positionPresets?.length ? "position" : undefined,
      slot.fit?.length ? "fit" : undefined,
      slot.zoom ? "zoom" : undefined,
      slot.focusByViewport ? "focus" : undefined,
    ].filter(Boolean);
    invariant(requiredCapabilities.every((capability) => editableObject.capabilities.includes(capability)), `${template.key}.${slot.roleId} editableObjects 能力未覆盖布局槽位`);
  }
  for (const textRole of layoutOverrides.textRoles ?? []) {
    const knownTextRole =
      template.roles.some((role) =>
        role.id === textRole.roleId || role.previewRoles?.includes(textRole.roleId),
      ) ||
      Object.prototype.hasOwnProperty.call(template.contentBudget?.limits ?? {}, textRole.roleId);
    invariant(knownTextRole, `${template.key}.layoutOverrides.textRoles 引用了未知角色 ${textRole.roleId}`);
    const editableObject = editableObjects.find((object) => (object.nodeIds ?? [object.roleId]).includes(textRole.roleId));
    invariant(editableObject, `${template.key}.${textRole.roleId} 文字角色缺少 editableObjects 映射`);
    const requiredTextCapabilities = [
      "visibility",
      "typography",
      textRole.placementPresets?.length || textRole.widthPresets?.length ? "layout" : undefined,
      textRole.placementPresets?.length || textRole.widthPresets?.length ? "layer" : undefined,
    ].filter(Boolean);
    invariant(
      requiredTextCapabilities.every((capability) => editableObject.capabilities.includes(capability)),
      `${template.key}.${textRole.roleId} editableObjects 能力未覆盖文字布局`,
    );
  }
}

const activeTemplates = source.templates.filter((item) => item.implementationStatus === "active");
const plannedTemplates = source.templates.filter((item) => item.implementationStatus === "planned");
invariant(activeTemplates.length === source.activeTemplateCount, `活跃合同数应为 ${source.activeTemplateCount}，实际为 ${activeTemplates.length}`);
invariant(plannedTemplates.length === source.expectedTemplateCount - source.activeTemplateCount, `计划合同数应为 ${source.expectedTemplateCount - source.activeTemplateCount}，实际为 ${plannedTemplates.length}`);

const union = (values) => [...new Set(values)].sort().map((value) => JSON.stringify(value)).join(" | ");
const masters = union(source.templates.map((item) => item.master));

const registry = source.templates.map(({ key, moduleType, displayName, category, commercialPurpose, implementationStatus }) => ({
  key,
  moduleType,
  displayName,
  category,
  commercialPurpose,
  implementationStatus,
}));
const contractMap = Object.fromEntries(source.templates.map(({ category: _category, implementationStatus: _status, skeleton: _skeleton, ...contract }) => [contract.key, contract]));
const pageRuleMap = Object.fromEntries(source.pageRules.map((rule) => [rule.pageKey, rule]));
const pagePathMap = Object.fromEntries(source.pageRules.map((rule) => [rule.pageKey, rule.publicPath]));
const templateSkeletonMap = Object.fromEntries(source.templates.map(({ key, moduleType, displayName, category, skeleton }) => [key, {
  key,
  moduleType,
  displayName,
  category,
  ...skeleton,
}]));
const templatePreviewMap = Object.fromEntries(source.templates.map(({ key, moduleType, displayName, commercialPurpose }) => [key, {
  key,
  moduleType,
  displayName,
  commercialPurpose,
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
export const CONTENT_TEMPLATE_CONTRACT_SCHEMA_VERSION = ${source.contractSchemaVersion};
export const CONTENT_TEMPLATE_CONTRACT_VERSION = ${contractVersion};
export const CONTENT_TEMPLATE_PUBLICATION_GATE_VERSION = ${source.publicationGateVersion};
export const CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY = "_contentPublication";

export type ContentTemplatePublicationAttestation = {
  gateVersion: number;
  contractSchemaVersion: number;
  registryVersion: number;
};

export function createContentTemplatePublicationAttestation(): ContentTemplatePublicationAttestation {
  return {
    gateVersion: CONTENT_TEMPLATE_PUBLICATION_GATE_VERSION,
    contractSchemaVersion: CONTENT_TEMPLATE_CONTRACT_SCHEMA_VERSION,
    registryVersion: CONTENT_TEMPLATE_REGISTRY_VERSION,
  };
}

export function hasCurrentContentTemplatePublicationAttestation(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const attestation = (metadata as Record<string, unknown>)[CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY];
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) return false;
  return (attestation as Record<string, unknown>).gateVersion
    === CONTENT_TEMPLATE_PUBLICATION_GATE_VERSION;
}

export function withoutContentTemplatePublicationAttestation(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(
    Object.entries(metadata as Record<string, unknown>).filter(
      ([key]) => key !== CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
    ),
  );
}

export type RegisteredContentTemplateKey = ${registeredKeys};
export type ContentTemplateKey = RegisteredContentTemplateKey;
export type ContentTemplateMaster = ${masters};
export type ContentTemplateAssetClass = "product" | "editorial" | "craft" | "service";
export type ContentTemplateCommercialPurpose =
  | "品牌展示" | "商品销售" | "活动转化" | "内容传播" | "信任建立";

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

export type ContentTemplatePageMetadataField = "seoTitle" | "seoDescription" | "ogImage" | "contentOwner";
export type ContentTemplatePublicPageMetadataField = Exclude<ContentTemplatePageMetadataField, "contentOwner">;

export type ContentTemplatePageMetadataContract = {
  requiredForPublication: readonly ContentTemplatePageMetadataField[];
  publicFields: readonly ContentTemplatePublicPageMetadataField[];
  limits: Readonly<Record<ContentTemplatePageMetadataField, number>>;
  mediaRights: {
    maxItems: number;
    fieldLimits: Readonly<Record<"assetUrl" | "source" | "authorizationId", number>>;
  };
};

export const CONTENT_TEMPLATE_PAGE_METADATA = ${JSON.stringify(source.pageMetadata, sortReplacer, 2)} as const satisfies ContentTemplatePageMetadataContract;

export type ContentTemplatePageRule = {
  pageKey: string;
  publicPath: string;
  pageRole: string;
  contentPlacement: "root-only";
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

export const CONTENT_TEMPLATE_PAGE_PATHS = ${JSON.stringify(pagePathMap, sortReplacer, 2)} as const;
export type ContentTemplatePagePath =
  (typeof CONTENT_TEMPLATE_PAGE_PATHS)[keyof typeof CONTENT_TEMPLATE_PAGE_PATHS];

export type MediaSlot = {
  key: string;
  required: boolean;
  desktopRatio?: string;
  mobileRatio?: string;
};

export type ContentTemplateEditableObjectKind =
  | "media" | "video" | "text" | "action" | "product" | "collection";

export type ContentTemplateEditableCapability =
  | "content" | "layout" | "layer" | "visibility" | "ratio"
  | "size" | "position" | "fit" | "zoom" | "focus"
  | "typography" | "link" | "items" | "reference" | "playback";

export type ContentTemplateResponsiveScope = "shared" | "viewport-specific";

export type ContentTemplateResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export type ContentTemplateEditableConstraints = {
  minSize: { width: number; height: number };
  maxSize: { width: number; height: number };
  movementAxes: readonly ("x" | "y")[];
  allowedResize: readonly ContentTemplateResizeDirection[];
  layerRange: { min: number; max: number };
  allowHide: boolean;
  allowAspectRatio: boolean;
  allowFocus: boolean;
  allowZoom: boolean;
  allowTypography: boolean;
  safeAreaRequired: boolean;
};

export type ContentTemplateEditableObject = {
  roleId: string;
  nodeIds?: readonly string[];
  kind: ContentTemplateEditableObjectKind;
  contentFieldKeys: readonly string[];
  mediaFieldKeys?: readonly string[];
  altFieldKey?: string;
  altPolicy?: "required" | "derived" | "decorative" | "not-applicable";
  collectionFieldKeys?: readonly string[];
  collectionMediaPolicies?: readonly {
    collectionFieldKey: string;
    mediaFieldKeys: readonly string[];
    altPolicy: "required" | "derived" | "decorative" | "not-applicable";
    altFieldKey?: string;
    derivedAltFieldKey?: string;
  }[];
  collectionLinkPolicies?: readonly {
    collectionFieldKey: string;
    required: boolean;
  }[];
  referenceFieldKey?: string;
  fieldScopes?: Readonly<Record<string, ContentTemplateResponsiveScope>>;
  capabilities: readonly ContentTemplateEditableCapability[];
  capabilityViewports?: Partial<Record<ContentTemplateEditableCapability, readonly ("desktop" | "mobile")[]>>;
  responsive: Partial<Record<ContentTemplateEditableCapability, ContentTemplateResponsiveScope>>;
  constraints: ContentTemplateEditableConstraints;
};

export type ContentTemplateDefaultGeometryZone = {
  nodeId: string;
  roleId: string;
  role: ContentTemplateSkeletonRole;
  rect: ContentTemplateVisualRect;
  overlay?: boolean;
  kind?: "play" | "pagination" | "steps-5" | "handle" | "hotspot" | "countdown";
};

export type ContentTemplateDefaultGeometryViewport = {
  tone: "light" | "dark";
  rows: number;
  frameAspectRatio: number;
  safeArea: ContentTemplateVisualRect;
  zones: readonly ContentTemplateDefaultGeometryZone[];
};

export type ContentTemplateContract = {
  key: ContentTemplateKey;
  moduleType: string;
  displayName: string;
  commercialPurpose: ContentTemplateCommercialPurpose;
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
    publicationAttestation?: { fieldKey: string; label: string };
    defaultRatioByViewport?: Partial<Record<"desktop" | "mobile", string>>;
    allowedRatioPresetsByViewport?: Partial<Record<"desktop" | "mobile", readonly string[]>>;
  }[];
  order: Record<"desktop" | "mobile", readonly string[]>;
  defaultGeometryByViewport: Record<"desktop" | "mobile", ContentTemplateDefaultGeometryViewport>;
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
    editableObjects: readonly ContentTemplateEditableObject[];
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
    paddingPreset?: "compact" | "standard" | "spacious";
    radiusPreset?: "square" | "soft" | "rounded";
    shadowPreset?: "none" | "soft" | "lifted";
    customColors?: {
      background?: string;
      text?: string;
      accent?: string;
    };
  };
  nodes?: Record<string, {
    enabled?: boolean;
    rectByViewport?: Partial<Record<"desktop" | "mobile", ContentTemplateVisualRect>>;
    zIndexByViewport?: Partial<Record<"desktop" | "mobile", number>>;
    ratio?: number;
    sizePreset?: string;
    positionPreset?: string;
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
      lineHeight?: number;
      letterSpacing?: number;
    };
    appearance?: {
      radiusPreset?: "square" | "soft" | "rounded";
      shadowPreset?: "none" | "soft" | "lifted";
    };
  }>;
};

export type ContentTemplateInstanceOverrides =
  | ContentTemplateInstanceOverridesV1
  | ContentTemplateInstanceOverridesV2;

export type ContentTemplateDefaultContentValue =
  | string
  | number
  | boolean
  | null
  | readonly ContentTemplateDefaultContentValue[]
  | { readonly [key: string]: ContentTemplateDefaultContentValue };

export type ContentTemplateDefaultContent = Readonly<
  Record<string, ContentTemplateDefaultContentValue>
>;

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
  commercialPurpose: ContentTemplateCommercialPurpose;
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
  content: {
    complete: boolean;
    missing: string[];
    missingCollectionAltText: Array<{
      roleId: string;
      collectionFieldKey: string;
      altFieldKey: string;
      altPolicy: "required" | "derived";
      index: number;
    }>;
  };
  collections: {
    complete: boolean;
    invalid: Array<{
      roleId: string;
      fieldKey: string;
      count: number;
      min: number;
      max: number;
    }>;
  };
  attestations: {
    complete: boolean;
    missing: Array<{
      roleId: string;
      collectionFieldKey: string;
      attestationFieldKey: string;
      label: string;
      index: number;
    }>;
  };
  publish: { complete: boolean; issues: ContentTemplateIssue[] };
};

export type ContentTemplateMediaRight = {
  assetUrl: string;
  source: string;
  authorizationId: string;
};

export type ContentTemplateMediaReference = {
  url: string;
  path: string;
  field: string;
  blockId?: string;
  moduleType?: string;
  index?: number;
};

export type ContentTemplateLinkTargetReference = {
  path: string;
  field: string;
  required: boolean;
  targetTypeFieldKey: string;
  productCodeFieldKey: string;
  productIdFieldKey: string;
  linkUrlFieldKey: string;
  legacyLinkFieldKey?: string;
  actionTextFieldKey?: string;
  targetType: unknown;
  productCode: unknown;
  productId: unknown;
  linkUrl: unknown;
  legacyLink?: unknown;
  actionText?: unknown;
  blockId?: string;
  moduleType: string;
  index?: number;
};

export const CONTENT_TEMPLATE_REGISTRY = ${JSON.stringify(registry, sortReplacer, 2)} as const;

/** 所有真实 Renderer 的完整 schema v5 合同；implementationStatus 不再决定可否渲染。 */
export const CONTENT_TEMPLATE_CONTRACTS = ${JSON.stringify(contractMap, sortReplacer, 2)} as const satisfies Record<ContentTemplateKey, ContentTemplateContract>;

/** 全部活跃模板的中性结构预览；不承担业务、发布或 Inspector 完整合同。 */
export const CONTENT_TEMPLATE_SKELETONS = ${JSON.stringify(templateSkeletonMap, sortReplacer, 2)} as const satisfies Record<string, ContentTemplateSkeleton>;

/** 所有活跃模板的中性结构预览源；缩略图与总览不得另建坐标台账。 */
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

export function getContentTemplateDefaultGeometry(
  moduleType: string,
  viewport: "desktop" | "mobile",
) {
  return getContentTemplateContract(moduleType)?.defaultGeometryByViewport[viewport];
}

export function getContentTemplateDefaultRect(
  moduleType: string,
  nodeId: string,
  viewport: "desktop" | "mobile",
): ContentTemplateVisualRect | undefined {
  const geometry = getContentTemplateDefaultGeometry(moduleType, viewport);
  const contract = getContentTemplateContract(moduleType);
  const editableObject = findContentTemplateEditableObject(contract, nodeId);
  const directMatches = geometry?.zones.filter((zone) => zone.nodeId === nodeId) ?? [];
  if (directMatches.length === 1) return directMatches[0].rect;
  const roleMatches = geometry?.zones.filter(
    (zone) => zone.roleId === editableObject?.roleId,
  ) ?? [];
  return roleMatches.length === 1 ? roleMatches[0].rect : undefined;
}

const PERSONAL_TEMPLATE_COLOR_TOKENS = new Set([
  "#181A1B", "#5F6568", "#DDE1E2", "#F7F8F8", "#FFFFFF",
]);
const SURFACE_COLOR_PRESETS = new Set(["canvas", "mist", "inkSurface"]);
const SURFACE_PADDING_PRESETS = new Set(["compact", "standard", "spacious"]);
const SURFACE_RADIUS_PRESETS = new Set(["square", "soft", "rounded"]);
const SURFACE_SHADOW_PRESETS = new Set(["none", "soft", "lifted"]);
const INVALID_DEFAULT_CONTENT = Symbol("invalid-default-content");
const DEFAULT_CONTENT_MAX_DEPTH = 6;
const DEFAULT_CONTENT_MAX_OBJECT_KEYS = 32;
const DEFAULT_CONTENT_MAX_STRING_LENGTH = 4096;
const DEFAULT_CONTENT_MAX_SERIALIZED_LENGTH = 128 * 1024;

function isSafeDefaultContentUrl(fieldKey: string, value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  const assetField = /(?:image|poster|videoUrl)$/i.test(fieldKey);
  const linkField = /(?:linkUrl|mapUrl|link|url)$/i.test(fieldKey);
  if (!assetField && !linkField) return true;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return true;
  const lower = normalized.toLowerCase();
  return lower.startsWith("https://") || lower.startsWith("http://");
}

function sanitizeDefaultContentValue(
  value: unknown,
  fieldKey: string,
  options: { depth: number; maxStringLength: number; maxItems: number },
): ContentTemplateDefaultContentValue | typeof INVALID_DEFAULT_CONTENT {
  if (value === null) return null;
  if (typeof value === "string") {
    if (value.length > options.maxStringLength || !isSafeDefaultContentUrl(fieldKey, value)) {
      return INVALID_DEFAULT_CONTENT;
    }
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : INVALID_DEFAULT_CONTENT;
  if (typeof value === "boolean") return value;
  if (options.depth >= DEFAULT_CONTENT_MAX_DEPTH) return INVALID_DEFAULT_CONTENT;
  if (Array.isArray(value)) {
    if (value.length > options.maxItems) return INVALID_DEFAULT_CONTENT;
    const result: ContentTemplateDefaultContentValue[] = [];
    for (const item of value) {
      const sanitized = sanitizeDefaultContentValue(item, fieldKey, {
        ...options,
        depth: options.depth + 1,
        maxStringLength: DEFAULT_CONTENT_MAX_STRING_LENGTH,
      });
      if (sanitized === INVALID_DEFAULT_CONTENT) return INVALID_DEFAULT_CONTENT;
      result.push(sanitized);
    }
    return result;
  }
  if (!isRecord(value)) return INVALID_DEFAULT_CONTENT;
  const entries = Object.entries(value);
  if (entries.length > DEFAULT_CONTENT_MAX_OBJECT_KEYS) return INVALID_DEFAULT_CONTENT;
  const result: Record<string, ContentTemplateDefaultContentValue> = {};
  for (const [key, child] of entries) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) ||
      key === "constructor" || key === "prototype" || key === "__proto__"
    ) {
      return INVALID_DEFAULT_CONTENT;
    }
    const sanitized = sanitizeDefaultContentValue(child, key, {
      ...options,
      depth: options.depth + 1,
      maxStringLength: DEFAULT_CONTENT_MAX_STRING_LENGTH,
    });
    if (sanitized === INVALID_DEFAULT_CONTENT) return INVALID_DEFAULT_CONTENT;
    result[key] = sanitized;
  }
  return result;
}

/**
 * 账号私有模板默认内容的合同白名单入口。
 * 这里只处理 JSON 形状、数量、长度与 URL 协议；资源和商品是否属于当前账号，
 * 必须由写入服务结合 ownerId 与数据库再次校验。
 */
export function sanitizeContentTemplateDefaultContent(
  moduleType: string,
  rawContent: unknown,
): ContentTemplateDefaultContent | undefined {
  const contract = getContentTemplateContract(moduleType);
  if (!contract || !isRecord(rawContent)) return undefined;
  const editableObjects = contract.editorCapabilities.editableObjects;
  const allowedFields = new Set(editableObjects.flatMap((object) => object.contentFieldKeys));
  const result: Record<string, ContentTemplateDefaultContentValue> = {};
  for (const fieldKey of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(rawContent, fieldKey)) continue;
    const editableObject = editableObjects.find((object) => object.contentFieldKeys.includes(fieldKey));
    const reference = contract.editorCapabilities.referenceFields?.find(
      (candidate) => candidate.key === fieldKey || candidate.legacyKey === fieldKey,
    );
    const quantity = editableObject
      ? contract.roles.find((role) => role.id === editableObject.roleId)?.quantity
      : undefined;
    const sanitized = sanitizeDefaultContentValue(rawContent[fieldKey], fieldKey, {
      depth: 0,
      maxStringLength: contract.contentBudget.limits[fieldKey] ?? DEFAULT_CONTENT_MAX_STRING_LENGTH,
      maxItems: reference?.max ?? quantity?.max ?? 24,
    });
    if (sanitized !== INVALID_DEFAULT_CONTENT) result[fieldKey] = sanitized;
  }
  if (JSON.stringify(result).length > DEFAULT_CONTENT_MAX_SERIALIZED_LENGTH) return undefined;
  return result;
}

export function extractContentTemplateDefaultContent(
  moduleType: string,
  props: unknown,
) {
  return sanitizeContentTemplateDefaultContent(moduleType, props);
}

function sanitizePersonalTemplateRect(
  raw: unknown,
  constraints: ContentTemplateEditableConstraints,
  safeArea: ContentTemplateVisualRect,
) {
  if (!isRecord(raw)) return undefined;
  const values = [raw.x, raw.y, raw.width, raw.height].map(Number);
  if (!values.every(Number.isFinite)) return undefined;
  let [x, y, width, height] = values;
  width = Math.min(constraints.maxSize.width, Math.max(constraints.minSize.width, width));
  height = Math.min(constraints.maxSize.height, Math.max(constraints.minSize.height, height));
  const bounds = constraints.safeAreaRequired
    ? safeArea
    : { x: 0, y: 0, width: 1, height: 1 };
  width = Math.min(width, bounds.width);
  height = Math.min(height, bounds.height);
  x = Math.min(bounds.x + bounds.width - width, Math.max(bounds.x, x));
  y = Math.min(bounds.y + bounds.height - height, Math.max(bounds.y, y));
  return { x, y, width, height };
}

/**
 * 账号私有模板的唯一白名单清洗入口。返回值只含布局与受控视觉属性，
 * 不会复制图片、文案、链接、商品、门店或其他业务事实。
 */
export function sanitizeContentTemplateLayoutData(
  moduleType: string,
  rawLayoutData: unknown,
): ContentTemplateInstanceOverridesV2 | undefined {
  const contract = getContentTemplateContract(moduleType);
  if (!contract || !isRecord(rawLayoutData) || rawLayoutData.version !== 2) return undefined;
  const result: ContentTemplateInstanceOverridesV2 = { version: 2 };
  const rawFrame = isRecord(rawLayoutData.frame) ? rawLayoutData.frame : {};
  const frame: NonNullable<ContentTemplateInstanceOverridesV2["frame"]> = {};
  const layoutCapabilities = contract.editorCapabilities.layoutOverrides ?? {};
  if (typeof rawFrame.heightPreset === "string" && layoutCapabilities.framePresets?.includes(rawFrame.heightPreset)) {
    frame.heightPreset = rawFrame.heightPreset;
  }
  if (typeof rawFrame.compositionPreset === "string" && layoutCapabilities.compositionPresets?.includes(rawFrame.compositionPreset)) {
    frame.compositionPreset = rawFrame.compositionPreset;
  }
  if (typeof rawFrame.colorPreset === "string" && SURFACE_COLOR_PRESETS.has(rawFrame.colorPreset)) {
    frame.colorPreset = rawFrame.colorPreset;
  }
  if (contract.flow === "flow") {
    if (typeof rawFrame.paddingPreset === "string" && SURFACE_PADDING_PRESETS.has(rawFrame.paddingPreset)) {
      frame.paddingPreset = rawFrame.paddingPreset as NonNullable<typeof frame.paddingPreset>;
    }
    if (typeof rawFrame.radiusPreset === "string" && SURFACE_RADIUS_PRESETS.has(rawFrame.radiusPreset)) {
      frame.radiusPreset = rawFrame.radiusPreset as NonNullable<typeof frame.radiusPreset>;
    }
    if (typeof rawFrame.shadowPreset === "string" && SURFACE_SHADOW_PRESETS.has(rawFrame.shadowPreset)) {
      frame.shadowPreset = rawFrame.shadowPreset as NonNullable<typeof frame.shadowPreset>;
    }
  }
  const rawRatios = isRecord(rawFrame.aspectRatioByViewport) ? rawFrame.aspectRatioByViewport : {};
  const ratioRange = layoutCapabilities.frameRatioRange ?? { min: 0.25, max: 4, step: 0.01 };
  const aspectRatioByViewport: Partial<Record<"desktop" | "mobile", number>> = {};
  for (const viewport of ["desktop", "mobile"] as const) {
    const ratio = Number(rawRatios[viewport]);
    if (Number.isFinite(ratio) && ratio >= ratioRange.min && ratio <= ratioRange.max) {
      aspectRatioByViewport[viewport] = ratio;
    }
  }
  if (Object.keys(aspectRatioByViewport).length) frame.aspectRatioByViewport = aspectRatioByViewport;
  if (Object.keys(frame).length) result.frame = frame;

  const rawNodes = isRecord(rawLayoutData.nodes) ? rawLayoutData.nodes : {};
  const nodes: NonNullable<ContentTemplateInstanceOverridesV2["nodes"]> = {};
  for (const editableObject of contract.editorCapabilities.editableObjects) {
    for (const nodeId of editableObject.nodeIds ?? [editableObject.roleId]) {
      const rawNode = rawNodes[nodeId];
      if (!isRecord(rawNode)) continue;
      const node: NonNullable<ContentTemplateInstanceOverridesV2["nodes"]>[string] = {};
      const constraints = editableObject.constraints;
      const supportsOnViewport = (
        capability: ContentTemplateEditableCapability,
        viewport: "desktop" | "mobile",
      ) => {
        if (!contentTemplateObjectHasCapability(editableObject, capability)) return false;
        const allowedViewports = editableObject.capabilityViewports?.[capability];
        return !allowedViewports || allowedViewports.includes(viewport);
      };
      if (constraints.allowHide && typeof rawNode.enabled === "boolean") node.enabled = rawNode.enabled;
      if (contentTemplateObjectHasCapability(editableObject, "layout") && isRecord(rawNode.rectByViewport)) {
        const rectByViewport: Partial<Record<"desktop" | "mobile", ContentTemplateVisualRect>> = {};
        for (const viewport of ["desktop", "mobile"] as const) {
          if (!supportsOnViewport("layout", viewport)) continue;
          const safeArea = contract.defaultGeometryByViewport[viewport].safeArea;
          const rect = sanitizePersonalTemplateRect(rawNode.rectByViewport[viewport], constraints, safeArea);
          if (rect) rectByViewport[viewport] = rect;
        }
        if (Object.keys(rectByViewport).length) node.rectByViewport = rectByViewport;
      }
      if (contentTemplateObjectHasCapability(editableObject, "layer") && isRecord(rawNode.zIndexByViewport)) {
        const zIndexByViewport: Partial<Record<"desktop" | "mobile", number>> = {};
        for (const viewport of ["desktop", "mobile"] as const) {
          if (!supportsOnViewport("layer", viewport)) continue;
          const zIndex = Number(rawNode.zIndexByViewport[viewport]);
          if (Number.isInteger(zIndex) && zIndex >= constraints.layerRange.min && zIndex <= constraints.layerRange.max) {
            zIndexByViewport[viewport] = zIndex;
          }
        }
        if (Object.keys(zIndexByViewport).length) node.zIndexByViewport = zIndexByViewport;
      }
      const ratio = Number(rawNode.ratio);
      if (constraints.allowAspectRatio && Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4) node.ratio = ratio;
      const slot = layoutCapabilities.slots?.find((candidate) => candidate.roleId === nodeId);
      if (slot?.sizePresets?.includes(String(rawNode.sizePreset))) node.sizePreset = String(rawNode.sizePreset);
      if (slot?.positionPresets?.includes(String(rawNode.positionPreset))) node.positionPreset = String(rawNode.positionPreset);
      if (isRecord(rawNode.mediaView) && slot) {
        const mediaView: NonNullable<typeof node.mediaView> = {};
        if (slot.fit?.includes(rawNode.mediaView.fit as "cover" | "contain")) mediaView.fit = rawNode.mediaView.fit as "cover" | "contain";
        const zoom = Number(rawNode.mediaView.zoom);
        if (constraints.allowZoom && slot.zoom && Number.isFinite(zoom) && zoom >= slot.zoom.min && zoom <= slot.zoom.max) mediaView.zoom = zoom;
        if (constraints.allowFocus && slot.focusByViewport && isRecord(rawNode.mediaView.focusByViewport)) {
          const focusByViewport: Partial<Record<"desktop" | "mobile", { x: number; y: number }>> = {};
          for (const viewport of ["desktop", "mobile"] as const) {
            const rawFocus = rawNode.mediaView.focusByViewport[viewport];
            if (!isRecord(rawFocus)) continue;
            const x = Number(rawFocus.x);
            const y = Number(rawFocus.y);
            if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) focusByViewport[viewport] = { x, y };
          }
          if (Object.keys(focusByViewport).length) mediaView.focusByViewport = focusByViewport;
        }
        if (Object.keys(mediaView).length) node.mediaView = mediaView;
      }
      if (constraints.allowTypography && isRecord(rawNode.typography)) {
        const textRole = layoutCapabilities.textRoles?.find((candidate) => candidate.roleId === nodeId);
        const typography: NonNullable<typeof node.typography> = {};
        if (["xs", "sm", "md", "lg", "xl"].includes(String(rawNode.typography.sizeLevel))) typography.sizeLevel = rawNode.typography.sizeLevel as NonNullable<typeof typography.sizeLevel>;
        if (textRole?.align?.includes(rawNode.typography.align as "left" | "center" | "right")) typography.align = rawNode.typography.align as "left" | "center" | "right";
        if (typeof rawNode.typography.color === "string" && PERSONAL_TEMPLATE_COLOR_TOKENS.has(rawNode.typography.color.toUpperCase())) typography.color = rawNode.typography.color.toUpperCase();
        const maxLines = Number(rawNode.typography.maxLines);
        if (Number.isInteger(maxLines) && maxLines >= 1 && maxLines <= (textRole?.maxLines ?? 6)) typography.maxLines = maxLines;
        if (["none", "light", "dark"].includes(String(rawNode.typography.safeBand))) typography.safeBand = rawNode.typography.safeBand as "none" | "light" | "dark";
        if (Object.keys(typography).length) node.typography = typography;
      }
      if (["media", "video", "product", "collection"].includes(editableObject.kind) && isRecord(rawNode.appearance)) {
        const appearance: NonNullable<typeof node.appearance> = {};
        if (typeof rawNode.appearance.radiusPreset === "string" && SURFACE_RADIUS_PRESETS.has(rawNode.appearance.radiusPreset)) {
          appearance.radiusPreset = rawNode.appearance.radiusPreset as NonNullable<typeof appearance.radiusPreset>;
        }
        if (typeof rawNode.appearance.shadowPreset === "string" && SURFACE_SHADOW_PRESETS.has(rawNode.appearance.shadowPreset)) {
          appearance.shadowPreset = rawNode.appearance.shadowPreset as NonNullable<typeof appearance.shadowPreset>;
        }
        if (Object.keys(appearance).length) node.appearance = appearance;
      }
      if (Object.keys(node).length) nodes[nodeId] = node;
    }
  }
  if (Object.keys(nodes).length) result.nodes = nodes;
  return result;
}

export function extractContentTemplateLayoutData(
  moduleType: string,
  props: unknown,
) {
  if (!isRecord(props)) return undefined;
  return sanitizeContentTemplateLayoutData(
    moduleType,
    props.__instanceOverrides ?? { version: 2 },
  );
}

export function findContentTemplateEditableObject(
  contract: ContentTemplateContract | undefined,
  nodeId: string,
): ContentTemplateEditableObject | undefined {
  if (!contract || !nodeId) return undefined;
  return contract.editorCapabilities.editableObjects.find((object) =>
    (object.nodeIds ?? [object.roleId]).includes(nodeId),
  );
}

export function getContentTemplateEditableObject(
  moduleType: string,
  nodeId: string,
): ContentTemplateEditableObject | undefined {
  return findContentTemplateEditableObject(getContentTemplateContract(moduleType), nodeId);
}

export function getContentTemplateEditableFieldKeys(
  moduleType: string,
  nodeId: string,
): readonly string[] {
  return getContentTemplateEditableObject(moduleType, nodeId)?.contentFieldKeys ?? [];
}

export function contentTemplateObjectHasCapability(
  object: ContentTemplateEditableObject | undefined,
  capability: ContentTemplateEditableCapability,
) {
  return Boolean(object?.capabilities.includes(capability));
}

export function getContentTemplatePageRule(pageKey: string) {
  return (CONTENT_TEMPLATE_PAGE_RULES as Record<string, ContentTemplatePageRule | undefined>)[pageKey];
}

const CONTENT_TEMPLATE_PAGE_PATH_SET = new Set<string>(
  Object.values(CONTENT_TEMPLATE_PAGE_PATHS),
);

/**
 * 页面型 CTA 只允许跳转到 PageDocument 正式公开路由。
 * 查询参数用于携带筛选或上下文；片段和尾斜杠没有稳定合同，因此拒绝。
 */
export function normalizeContentTemplatePageTarget(value: unknown): string | undefined {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("#")
  ) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, "https://haichuan.invalid");
  } catch {
    return undefined;
  }

  if (!CONTENT_TEMPLATE_PAGE_PATH_SET.has(parsed.pathname)) return undefined;
  return parsed.pathname + parsed.search;
}

export function isContentTemplatePageTarget(value: unknown): value is string {
  return normalizeContentTemplatePageTarget(value) !== undefined;
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
    case "预约入口:bgImage":
      return values.backgroundImage;
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

function getQuantifiedCollectionValue(
  contract: ContentTemplateContract,
  roleId: string,
  values: Record<string, unknown>,
): { fieldKey: string; value: unknown[] } | undefined {
  const editableObject = contract.editorCapabilities.editableObjects.find(
    (object) => object.roleId === roleId,
  );
  if (!editableObject) return undefined;
  const reference = contract.editorCapabilities.referenceFields?.find(
    (item) => item.key === editableObject.referenceFieldKey,
  );
  const candidateKeys = [
    editableObject.referenceFieldKey,
    reference?.legacyKey,
    ...(editableObject.collectionFieldKeys ?? []),
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);
  const populatedKey = candidateKeys.find(
    (key) => Array.isArray(values[key]) && (values[key] as unknown[]).length > 0,
  );
  const arrayKey = populatedKey ?? candidateKeys.find((key) => Array.isArray(values[key]));
  return arrayKey ? { fieldKey: arrayKey, value: values[arrayKey] as unknown[] } : undefined;
}

/**
 * 从机器合同声明的媒体字段提取单个可见区块所引用的素材。
 * 不按属性名猜测，也不递归扫描任意字符串，避免把 alt、链接或业务字段误当素材。
 */
export function getContentTemplateMediaReferences(
  moduleType: string,
  props: unknown,
  basePath = "props",
): ContentTemplateMediaReference[] {
  const contract = getContentTemplateContract(moduleType);
  if (!contract || !isRecord(props) || props.isVisible === false) return [];
  const blockId = hasNonEmptyText(props.id) ? props.id.trim() : undefined;
  const references: ContentTemplateMediaReference[] = [];
  const append = (value: unknown, field: string, path: string, index?: number) => {
    if (!hasNonEmptyText(value)) return;
    references.push({
      url: value.trim(),
      path,
      field,
      ...(blockId ? { blockId } : {}),
      moduleType,
      ...(index === undefined ? {} : { index }),
    });
  };

  for (const object of contract.editorCapabilities.editableObjects) {
    for (const field of object.mediaFieldKeys ?? []) {
      append(props[field], field, basePath + "." + field);
    }
    for (const policy of object.collectionMediaPolicies ?? []) {
      const collection = props[policy.collectionFieldKey];
      if (!Array.isArray(collection)) continue;
      collection.forEach((item, index) => {
        if (!isRecord(item)) return;
        for (const field of policy.mediaFieldKeys) {
          append(
            item[field],
            field,
            basePath + "." + policy.collectionFieldKey + "[" + index + "]." + field,
            index,
          );
        }
      });
    }
  }

  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = reference.path + "\\u0000" + reference.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 从机器合同提取公开 Renderer 会消费的行动目标。
 * 顶层行动字段由 action editableObject 派生；集合条目只处理显式声明的
 * collectionLinkPolicies，避免按属性名递归猜测业务去向。
 */
export function getContentTemplateLinkTargetReferences(
  moduleType: string,
  props: unknown,
  basePath = "props",
): ContentTemplateLinkTargetReference[] {
  const contract = getContentTemplateContract(moduleType);
  if (!contract || !isRecord(props) || props.isVisible === false) return [];
  const blockId = hasNonEmptyText(props.id) ? props.id.trim() : undefined;
  const references: ContentTemplateLinkTargetReference[] = [];
  const append = (
    values: Record<string, unknown>,
    path: string,
    field: string,
    required: boolean,
    prefix = "",
    actionTextFieldKey?: string,
    legacyLinkFieldKey?: string,
    index?: number,
  ) => {
    const targetTypeFieldKey = prefix ? prefix + "TargetType" : "targetType";
    const productCodeFieldKey = prefix ? prefix + "ProductCode" : "productCode";
    const productIdFieldKey = prefix ? prefix + "ProductId" : "productId";
    const linkUrlFieldKey = prefix ? prefix + "LinkUrl" : "linkUrl";
    references.push({
      path,
      field,
      required,
      targetTypeFieldKey,
      productCodeFieldKey,
      productIdFieldKey,
      linkUrlFieldKey,
      ...(legacyLinkFieldKey ? { legacyLinkFieldKey } : {}),
      ...(actionTextFieldKey ? { actionTextFieldKey } : {}),
      targetType: values[targetTypeFieldKey],
      productCode: values[productCodeFieldKey],
      productId: values[productIdFieldKey],
      linkUrl: values[linkUrlFieldKey],
      ...(legacyLinkFieldKey ? { legacyLink: values[legacyLinkFieldKey] } : {}),
      ...(actionTextFieldKey ? { actionText: values[actionTextFieldKey] } : {}),
      ...(blockId ? { blockId } : {}),
      moduleType,
      ...(index === undefined ? {} : { index }),
    });
  };

  for (const object of contract.editorCapabilities.editableObjects) {
    if (object.kind === "action") {
      const targetTypeFieldKey = object.contentFieldKeys.find(
        (field) => field === "targetType" || field.endsWith("TargetType"),
      );
      if (targetTypeFieldKey) {
        const prefix = targetTypeFieldKey === "targetType"
          ? ""
          : targetTypeFieldKey.slice(0, -"TargetType".length);
        const actionTextFieldKey = prefix
          ? prefix + "Text"
          : object.contentFieldKeys.find(
              (field) => field === "actionText" || field === "buttonText",
            );
        if (actionTextFieldKey) {
          append(
            props,
            basePath,
            actionTextFieldKey,
            hasNonEmptyText(props[actionTextFieldKey]),
            prefix,
            actionTextFieldKey,
          );
        }
      }
    }
    for (const policy of object.collectionLinkPolicies ?? []) {
      const collection = props[policy.collectionFieldKey];
      if (!Array.isArray(collection)) continue;
      collection.forEach((item, index) => {
        append(
          isRecord(item) ? item : {},
          basePath + "." + policy.collectionFieldKey + "[" + index + "]",
          policy.collectionFieldKey,
          policy.required,
          "",
          undefined,
          "link",
          index,
        );
      });
    }
  }

  return references;
}

/** 当前 PageDocument 会进入公开页面的唯一素材 URL 集合（含 ogImage）。 */
export function getPageDocumentMediaReferences(
  puckData: unknown,
  metadata?: unknown,
  pageKey?: string,
): ContentTemplateMediaReference[] {
  const references: ContentTemplateMediaReference[] = [];
  if (isRecord(metadata) && hasNonEmptyText(metadata.ogImage)) {
    references.push({
      url: metadata.ogImage.trim(),
      path: "metadata.ogImage",
      field: "ogImage",
    });
  }
  if (isRecord(puckData)) {
    const collectBlocks = (blocks: unknown, basePath: string) => {
      if (!Array.isArray(blocks)) return;
      blocks.forEach((block, index) => {
        if (!isRecord(block) || typeof block.type !== "string") return;
        references.push(
          ...getContentTemplateMediaReferences(
            block.type,
            block.props,
            basePath + "[" + index + "].props",
          ),
        );
      });
    };
    collectBlocks(puckData.content, "content");
    const pageRule = pageKey ? getContentTemplatePageRule(pageKey) : undefined;
    if (pageRule?.contentPlacement !== "root-only" && isRecord(puckData.zones)) {
      for (const [zoneKey, blocks] of Object.entries(puckData.zones)) {
        collectBlocks(blocks, "zones." + zoneKey);
      }
    }
  }

  const seenUrls = new Set<string>();
  return references.filter((reference) => {
    if (seenUrls.has(reference.url)) return false;
    seenUrls.add(reference.url);
    return true;
  });
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
  const issue = (
    message: string,
    path = basePath,
    field?: string,
    severity: ContentTemplateIssue["severity"] =
      isRecord(overrides) && (overrides as Record<string, unknown>).version === 2
        ? "error"
        : "warning",
  ): ContentTemplateIssue => ({
    code: "page-validation",
    severity,
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
      const editableObject = findContentTemplateEditableObject(input.contract, nodeId);
      if (!editableObject || (!slotCapability && !textCapability)) {
        issues.push(issue("当前模板未声明该可视化节点的实例编辑能力。", path, nodeId));
        continue;
      }
      const hasCapability = (capability: ContentTemplateEditableCapability) =>
        editableObject.capabilities.includes(capability);
      if (rawNode.enabled !== undefined && !hasCapability("visibility")) {
        issues.push(issue("当前节点不允许启用或隐藏。", path + ".enabled", nodeId));
      }
      if (rawNode.ratio !== undefined && !finiteInRange(rawNode.ratio, 0.25, 4)) {
        issues.push(issue("节点比例必须位于 0.25–4 的安全范围。", path + ".ratio", nodeId));
      }
      if (rawNode.ratio !== undefined && (!slotCapability || !hasCapability("ratio"))) {
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
      if (rawNode.sizePreset !== undefined && (!slotCapability?.sizePresets?.includes(String(rawNode.sizePreset)) || !hasCapability("size"))) {
        issues.push(issue("当前节点不允许该尺寸预设。", path + ".sizePreset", nodeId));
      }
      if (rawNode.positionPreset !== undefined && (!slotCapability?.positionPresets?.includes(String(rawNode.positionPreset)) || !hasCapability("position"))) {
        issues.push(issue("当前节点不允许该位置预设。", path + ".positionPreset", nodeId));
      }
      if (rawNode.rectByViewport !== undefined) {
        if (!hasCapability("layout")) {
          issues.push(issue("当前节点不允许响应式位置覆盖。", path + ".rectByViewport", nodeId));
        }
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
            } else {
              const constraints = editableObject.constraints;
              const safeArea = input.contract.defaultGeometryByViewport[viewport as "desktop" | "mobile"].safeArea;
              const bounds = constraints.safeAreaRequired ? safeArea : { x: 0, y: 0, width: 1, height: 1 };
              if (
                width < constraints.minSize.width || height < constraints.minSize.height ||
                width > constraints.maxSize.width || height > constraints.maxSize.height ||
                x < bounds.x || y < bounds.y || x + width > bounds.x + bounds.width + 0.0001 || y + height > bounds.y + bounds.height + 0.0001
              ) {
                issues.push(issue("节点位置或尺寸超出新版安全区，渲染时将自动使用安全回退值。", rectPath, nodeId));
              }
            }
          }
        }
      }
      if (rawNode.zIndexByViewport !== undefined) {
        if (!hasCapability("layer")) {
          issues.push(issue("当前节点不允许响应式层级覆盖。", path + ".zIndexByViewport", nodeId));
        }
        if (!isRecord(rawNode.zIndexByViewport)) {
          issues.push(issue("节点响应式层级格式无效。", path + ".zIndexByViewport", nodeId));
        } else {
          for (const [viewport, rawZIndex] of Object.entries(rawNode.zIndexByViewport)) {
            const zIndexPath = path + ".zIndexByViewport." + viewport;
            const zIndex = Number(rawZIndex);
            if (
              !["desktop", "mobile"].includes(viewport) ||
              !Number.isInteger(zIndex) ||
              zIndex < 0 ||
              zIndex > 20
            ) {
              issues.push(issue("节点层级必须是 0–20 的整数。", zIndexPath, nodeId));
            }
          }
        }
      }
      if (rawNode.mediaView !== undefined) {
        if (!slotCapability || !["fit", "zoom", "focus"].some((capability) => hasCapability(capability as ContentTemplateEditableCapability))) {
          issues.push(issue("当前节点不允许图片观看窗覆盖。", path + ".mediaView", nodeId));
        } else if (!isRecord(rawNode.mediaView)) {
          issues.push(issue("图片观看窗格式无效。", path + ".mediaView", nodeId));
        } else {
          const mediaView = rawNode.mediaView;
          if (mediaView.fit !== undefined && (!hasCapability("fit") || !slotCapability.fit?.some((fit) => fit === String(mediaView.fit)))) {
            issues.push(issue("图片适配方式无效。", path + ".mediaView.fit", nodeId));
          }
          if (
            mediaView.zoom !== undefined &&
            (!hasCapability("zoom") || !slotCapability.zoom || !finiteInRange(mediaView.zoom, slotCapability.zoom.min, slotCapability.zoom.max))
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
                if (!hasCapability("focus") || !slotCapability.focusByViewport || !["desktop", "mobile"].includes(viewport) || !isRecord(rawFocus) || !finiteInRange(rawFocus.x, 0, 100) || !finiteInRange(rawFocus.y, 0, 100)) {
                  issues.push(issue("图片焦点必须位于 0–100 的归一化范围。", focusPath, nodeId));
                }
              }
            }
          }
        }
      }
      if (rawNode.typography !== undefined) {
        if (!textCapability || !hasCapability("typography")) {
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
            issues.push(issue("安全文字带值无效。", path + ".typography.safeBand", nodeId, "error"));
          }
          if (
            typography.lineHeight !== undefined &&
            !finiteInRange(typography.lineHeight, 1, 2.5)
          ) {
            issues.push(issue("文字行距必须位于 1–2.5 的安全范围。", path + ".typography.lineHeight", nodeId));
          }
          if (
            typography.letterSpacing !== undefined &&
            !finiteInRange(typography.letterSpacing, -0.05, 0.5)
          ) {
            issues.push(issue("文字字间距必须位于 -0.05–0.5em 的安全范围。", path + ".typography.letterSpacing", nodeId));
          }
        }
      }
      const nodeContentFieldKeys = editableObject.contentFieldKeys.includes(nodeId)
        ? [nodeId]
        : editableObject.contentFieldKeys;
      const roleHasContent = nodeContentFieldKeys.some((fieldKey) => {
        const textValue = input.props[fieldKey];
        return typeof textValue === "string" && textValue.trim().length > 0;
      });
      const roleVisible = rawNode.enabled === true || (rawNode.enabled !== false && roleHasContent);
      const roleHasVisualOverride = rawNode.enabled !== undefined || rawNode.rectByViewport !== undefined || rawNode.typography !== undefined;
      if (rawNode.enabled === true && textCapability && !roleHasContent) {
        const contentFieldKey = nodeContentFieldKeys[0] ?? nodeId;
        const contentPath = basePath.endsWith(".__instanceOverrides")
          ? basePath.slice(0, -".__instanceOverrides".length) + "." + contentFieldKey
          : "props." + contentFieldKey;
        issues.push(issue("已启用的文字角色必须填写内容。", contentPath, nodeId, "error"));
      }
      if (roleVisible && roleHasVisualOverride && textCapability?.requiresSafeBand) {
        const typography = isRecord(rawNode.typography) ? rawNode.typography : {};
        if (typography.safeBand !== "light" && typography.safeBand !== "dark") {
          issues.push(issue(
            "图片叠字需选择浅色或深色安全文字带后才能发布。",
            path + ".typography.safeBand",
            nodeId,
            "error",
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
      issues.push(issue("图片叠字需选择浅色或深色安全文字带后才能发布。", path + ".safeBand", roleId, "error"));
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
        code: "content-template-legacy",
        severity: "warning",
        message: "历史实例未携带版本印记；已按当前合同保留合法覆盖并安全回退不合法部分。",
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
    if (markerVersion < contract.version && markerVersion >= 1) {
      return [{
        ...base,
        code: "content-template-legacy",
        severity: "info",
        message: "历史模板已自动采用新版默认构图；合法实例覆盖继续保留，不合法部分使用安全回退。",
      }, ...overrideIssues];
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
  const missingRequiredAltText = contract.editorCapabilities.editableObjects.flatMap((object) => {
    if (object.altPolicy !== "required" || !object.altFieldKey) return [];
    const mediaValue = getCompatibilityRoleValue(moduleType, object.roleId, values);
    return hasNonEmptyText(mediaValue) && !hasNonEmptyText(values[object.altFieldKey])
      ? [object.altFieldKey]
      : [];
  });
  const missingText = [...new Set([
    ...contract.contentBudget.requiredText.filter((key) => !hasNonEmptyText(values[key])),
    ...missingRequiredAltText,
  ])];
  const missingCollectionAltText = contract.editorCapabilities.editableObjects.flatMap((object) =>
    (object.collectionMediaPolicies ?? []).flatMap((policy) => {
      const altPolicy = policy.altPolicy;
      if (altPolicy !== "required" && altPolicy !== "derived") return [];
      const collection = values[policy.collectionFieldKey];
      if (!Array.isArray(collection)) return [];
      const altFieldKey = altPolicy === "required"
        ? policy.altFieldKey
        : policy.derivedAltFieldKey;
      if (!altFieldKey) return [];
      return collection.flatMap((item, index) => {
        if (!isRecord(item)) return [];
        const hasMedia = policy.mediaFieldKeys.some((field) => hasNonEmptyText(item[field]));
        return hasMedia && !hasNonEmptyText(item[altFieldKey])
          ? [{
              roleId: object.roleId,
              collectionFieldKey: policy.collectionFieldKey,
              altFieldKey,
              altPolicy,
              index,
            }]
          : [];
      });
    }),
  );
  const invalidCollections = contract.roles.flatMap((role) => {
    if (!role.quantity) return [];
    const collection = getQuantifiedCollectionValue(contract, role.id, values);
    const count = collection?.value.length ?? 0;
    return count < role.quantity.min || count > role.quantity.max
      ? [{
          roleId: role.id,
          fieldKey: collection?.fieldKey ?? role.id,
          count,
          min: role.quantity.min,
          max: role.quantity.max,
        }]
      : [];
  });
  const missingAttestations = contract.roles.flatMap((role) => {
    const attestation = role.publicationAttestation;
    if (!attestation) return [];
    const collection = getQuantifiedCollectionValue(contract, role.id, values);
    if (!collection) return [];
    return collection.value.flatMap((item, index) =>
      !isRecord(item) || item[attestation.fieldKey] !== true
        ? [{
            roleId: role.id,
            collectionFieldKey: collection.fieldKey,
            attestationFieldKey: attestation.fieldKey,
            label: attestation.label,
            index,
          }]
        : [],
    );
  });
  const issues = getContentTemplateIssues({ moduleType, props: values });
  return {
    material: { complete: missingMedia.length === 0, missing: missingMedia },
    content: {
      complete: missingText.length === 0 && missingCollectionAltText.length === 0,
      missing: missingText,
      missingCollectionAltText,
    },
    collections: { complete: invalidCollections.length === 0, invalid: invalidCollections },
    attestations: { complete: missingAttestations.length === 0, missing: missingAttestations },
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
