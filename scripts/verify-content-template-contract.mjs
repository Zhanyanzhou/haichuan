import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const [text, client, server, previewSource, blockMetaSource] = await Promise.all([
  read("contracts/page-builder/content-templates.contract.json"),
  read("client/src/page-builder/generated/contentTemplates.generated.ts"),
  read("server/src/modules/page-modules/generated/contentTemplates.generated.ts"),
  read("client/src/page-builder/preview/ContentTemplateSkeletonPreview.tsx"),
  read("client/src/page-builder/config/blockMeta.ts"),
]);
const contract = JSON.parse(text);
const byKey = Object.fromEntries(contract.templates.map((template) => [template.key, template]));
const categories = ["视觉展示", "图文内容", "商品展示", "导航入口", "服务信息", "活动内容"];
const commercialPurposes = ["品牌展示", "商品销售", "活动转化", "内容传播", "信任建立"];
const devices = ["desktop", "mobile"];

assert.equal(contract.contractSchemaVersion, 5, "必须使用含商业目的的归一化双端几何合同 schema v5");
assert.equal(
  contract.templates.length,
  contract.expectedTemplateCount,
  "运营模板注册数必须与机器合同 expectedTemplateCount 一致",
);
assert.equal(
  contract.templates.filter((template) => template.implementationStatus === "active").length,
  contract.activeTemplateCount,
  "active 模板数必须与机器合同 activeTemplateCount 一致",
);
assert.deepEqual(
  [...new Set(contract.templates.map((template) => template.category))].sort(),
  [...categories].sort(),
  "机器合同必须覆盖六类运营模板，不得在验证脚本复制各类数量",
);
const reachableTemplateKeys = new Set(contract.pageRules.flatMap((rule) => rule.allowedTemplateKeys));
assert.deepEqual(
  [...new Set(contract.pageRules.map((rule) => rule.contentPlacement))],
  ["root-only"],
  "六个装修页面只能把正式内容放在公开 Renderer 实际消费的根 content",
);
assert.deepEqual(
  contract.pageMetadata,
  {
    requiredForPublication: ["seoTitle", "seoDescription", "ogImage", "contentOwner"],
    publicFields: ["seoTitle", "seoDescription", "ogImage"],
    limits: { seoTitle: 60, seoDescription: 160, ogImage: 2048, contentOwner: 80 },
    mediaRights: {
      maxItems: 120,
      fieldLimits: { assetUrl: 2048, source: 120, authorizationId: 120 },
    },
  },
  "六个装修页面必须共享一份正式内容责任、公开 SEO 与素材授权发布合同",
);
assert.match(client, /getPageDocumentMediaReferences/, "客户端生成产物必须提供 PageDocument 媒体引用提取器");
assert.match(server, /getPageDocumentMediaReferences/, "服务端生成产物必须提供 PageDocument 媒体引用提取器");
const getGeometryOrder = (template, device) => {
  const roleIds = new Set(template.defaultGeometryByViewport[device].zones.map((zone) => zone.roleId));
  const rolesById = new Map(template.roles.map((role) => [role.id, role]));
  return template.order[device].filter((id) => rolesById.get(id)?.positioning !== "background" && roleIds.has(id));
};
assert.deepEqual(
  contract.templates
    .filter((template) => template.implementationStatus === "active" && !reachableTemplateKeys.has(template.key))
    .map((template) => template.key),
  [],
  "每个 active 模板必须至少适用于一个真实页面角色",
);

for (const template of contract.templates) {
  assert.ok(commercialPurposes.includes(template.commercialPurpose), `${template.key}: 必须声明合法商业目的`);
  const roleIds = template.roles.map((role) => role.id);
  const rolesById = new Map(template.roles.map((role) => [role.id, role]));
  const semantics = template.roles.map((role) => role.semantic).filter(Boolean);
  assert.equal(new Set(roleIds).size, roleIds.length, `${template.key}: role id 不得重复`);
  assert.equal(new Set(semantics).size, semantics.length, `${template.key}: 语义角色不得重复或矛盾`);
  const rolesByRenderRole = Object.groupBy(template.roles, (role) => role.role);
  for (const [renderRole, group] of Object.entries(rolesByRenderRole)) {
    if (group.length < 2) continue;
    assert.ok(group.every((role) => role.semantic || Array.isArray(role.appliesTo)), `${template.key}.${renderRole}: 重复渲染角色必须具有独立语义或设备范围`);
    const scopedDevices = group.filter((role) => Array.isArray(role.appliesTo)).flatMap((role) => role.appliesTo);
    assert.equal(new Set(scopedDevices).size, scopedDevices.length, `${template.key}.${renderRole}: 设备范围发生冲突`);
  }
  for (const device of devices) {
    const order = template.order[device];
    assert.ok(order.length, `${template.key}.${device}: 根顺序缺失`);
    assert.equal(new Set(order).size, order.length, `${template.key}.${device}: 根顺序不得重复 role id`);
    assert.deepEqual(order.filter((id) => !rolesById.has(id)), [], `${template.key}.${device}: 根顺序只能引用已声明 role id`);
  }
  for (const role of template.roles) {
    assert.ok(devices.some((device) => template.order[device].includes(role.id)), `${template.key}.${role.id}: 角色未进入任何根顺序`);
    if (role.publicationAttestation) {
      const editableObject = template.editorCapabilities.editableObjects.find((object) => object.roleId === role.id);
      assert.equal(editableObject?.kind, "collection", `${template.key}.${role.id}: 发布确认必须绑定集合编辑对象`);
      assert.ok(editableObject?.collectionFieldKeys?.length, `${template.key}.${role.id}: 发布确认缺少集合字段`);
      assert.match(role.publicationAttestation.fieldKey, /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, `${template.key}.${role.id}: 发布确认字段无效`);
      assert.ok(role.publicationAttestation.label?.trim(), `${template.key}.${role.id}: 发布确认标签缺失`);
    }
    for (const device of devices) {
      const defaultRatio = role.defaultRatioByViewport?.[device];
      const allowed = role.allowedRatioPresetsByViewport?.[device];
      if (defaultRatio) assert.ok(allowed?.includes(defaultRatio), `${template.key}.${role.id}.${device}: 默认比例不在允许预设内`);
    }
  }
  const actionCount = template.roles.filter((role) => role.kind === "action").length;
  assert.ok(actionCount <= template.contentBudget.maxCtas, `${template.key}: 行动角色数超过 maxCtas`);
  assert.ok(template.editorCapabilities?.primaryTask, `${template.key}: 属性面板主要运营任务缺失`);
  const editableObjects = template.editorCapabilities.editableObjects ?? [];
  assert.ok(editableObjects.length > 0, `${template.key}: 必须显式声明可编辑对象`);
  const editableByNodeId = new Map();
  for (const object of editableObjects) {
    const nodeIds = object.nodeIds ?? [object.roleId];
    assert.ok(nodeIds.includes(object.roleId), `${template.key}.${object.roleId}: nodeIds 必须包含语义对象 id`);
    for (const nodeId of nodeIds) {
      assert.equal(editableByNodeId.has(nodeId), false, `${template.key}.${nodeId}: 节点只能绑定一个可编辑对象`);
      editableByNodeId.set(nodeId, object);
    }
    assert.deepEqual(
      Object.keys(object.responsive).sort(),
      [...object.capabilities].sort(),
      `${template.key}.${object.roleId}: 每项能力必须声明 shared 或 viewport-specific`,
    );
    for (const [fieldKey, scope] of Object.entries(object.fieldScopes ?? {})) {
      assert.ok(object.contentFieldKeys.includes(fieldKey), `${template.key}.${object.roleId}.${fieldKey}: 字段响应策略必须绑定内容字段`);
      assert.ok(["shared", "viewport-specific"].includes(scope), `${template.key}.${object.roleId}.${fieldKey}: 字段响应策略不合法`);
    }
    assert.ok(object.constraints, `${template.key}.${object.roleId}: 缺少直接操作约束`);
    assert.ok(object.constraints.minSize.width > 0 && object.constraints.minSize.height > 0, `${template.key}.${object.roleId}: 最小尺寸无效`);
    assert.ok(object.constraints.maxSize.width <= 1 && object.constraints.maxSize.height <= 1, `${template.key}.${object.roleId}: 最大尺寸越界`);
    assert.ok(object.constraints.allowedResize.every((direction) => ["n", "ne", "e", "se", "s", "sw", "w", "nw"].includes(direction)), `${template.key}.${object.roleId}: 缩放方向无效`);
    if (["media", "video"].includes(object.kind)) {
      assert.ok(object.altPolicy, `${template.key}.${object.roleId}: 媒体对象必须明确声明替代文字策略`);
      if (object.altPolicy === "required") {
        assert.ok(object.altFieldKey, `${template.key}.${object.roleId}: required 替代文字策略必须绑定字段`);
        assert.ok(!template.contentBudget.requiredText.includes(object.altFieldKey), `${template.key}.${object.roleId}: 替代文字必填只应由 altPolicy 派生，不得在 requiredText 重复声明`);
      }
      if (object.altFieldKey) assert.equal(object.altPolicy, "required", `${template.key}.${object.roleId}: 显式替代文字字段必须进入发布必填策略`);
    }
    for (const policy of object.collectionMediaPolicies ?? []) {
      assert.equal(object.kind, "collection", `${template.key}.${object.roleId}: 条目媒体策略只能用于 collection`);
      assert.ok(object.collectionFieldKeys?.includes(policy.collectionFieldKey), `${template.key}.${object.roleId}: 条目媒体策略必须映射 collectionFieldKeys`);
      assert.ok(Array.isArray(policy.mediaFieldKeys) && policy.mediaFieldKeys.length > 0, `${template.key}.${object.roleId}: 条目媒体策略必须声明媒体字段`);
      if (policy.altPolicy === "required") {
        assert.ok(policy.altFieldKey, `${template.key}.${object.roleId}: required 条目媒体策略必须绑定替代文字字段`);
        assert.equal(policy.derivedAltFieldKey, undefined, `${template.key}.${object.roleId}: required 条目媒体策略不得声明派生字段`);
      }
      if (policy.altPolicy === "derived") {
        assert.ok(policy.derivedAltFieldKey, `${template.key}.${object.roleId}: derived 条目媒体策略必须绑定派生字段`);
        assert.equal(policy.altFieldKey, undefined, `${template.key}.${object.roleId}: derived 条目媒体策略不得声明独立替代文字字段`);
      }
    }
  }
  for (const reference of template.editorCapabilities.referenceFields ?? []) {
    assert.ok(["product", "category"].includes(reference.kind), `${template.key}.${reference.key}: 引用类型不合法`);
    assert.ok(reference.min >= 0 && reference.max >= reference.min, `${template.key}.${reference.key}: 引用数量边界不合法`);
  }
  for (const slot of template.editorCapabilities.layoutOverrides?.slots ?? []) {
    assert.ok(roleIds.includes(slot.roleId), `${template.key}.${slot.roleId}: 实例图片槽位必须引用模板既有角色`);
    assert.ok((slot.ratioPresets ?? []).length <= 6, `${template.key}.${slot.roleId}: 比例预设必须保持受控`);
    assert.ok(!slot.zoom || (slot.zoom.min >= 1 && slot.zoom.max <= 3), `${template.key}.${slot.roleId}: zoom 必须处于受控非破坏范围`);
    assert.ok(editableByNodeId.has(slot.roleId), `${template.key}.${slot.roleId}: 图片槽位必须绑定可编辑对象`);
  }
  for (const textRole of template.editorCapabilities.layoutOverrides?.textRoles ?? []) {
    assert.ok(editableByNodeId.has(textRole.roleId), `${template.key}.${textRole.roleId}: 文字槽位必须绑定聚合或独立可编辑对象`);
  }
  for (const device of ["desktop", "mobile"]) {
    const viewport = template.defaultGeometryByViewport[device];
    const zoneRoleIds = new Set();
    const structuralRoleIds = new Set();
    assert.ok(viewport.frameAspectRatio >= 0.25 && viewport.frameAspectRatio <= 4, `${template.key}.${device}: 画布比例无效`);
    assert.ok(viewport.safeArea.x >= 0 && viewport.safeArea.y >= 0 && viewport.safeArea.x + viewport.safeArea.width <= 1 && viewport.safeArea.y + viewport.safeArea.height <= 1, `${template.key}.${device}: 安全区越界`);
    for (const zone of viewport.zones) {
      const role = rolesById.get(zone.roleId);
      assert.ok(role, `${template.key}.defaultGeometryByViewport.${device}: 区域 ${zone.roleId} 未映射到已声明角色`);
      assert.ok((role.previewRoles ?? [role.role]).includes(zone.role), `${template.key}.defaultGeometryByViewport.${device}.${zone.roleId}: 渲染角色与语义角色矛盾`);
      assert.ok(zone.rect.x >= 0 && zone.rect.y >= 0 && zone.rect.width > 0 && zone.rect.height > 0 && zone.rect.x + zone.rect.width <= 1.000001 && zone.rect.y + zone.rect.height <= 1.000001, `${template.key}.${device}.${zone.nodeId}: 归一化几何越界`);
      const editableObject = editableByNodeId.get(zone.nodeId);
      if (editableObject?.capabilities.includes("layout")) {
        const { constraints } = editableObject;
        assert.ok(zone.rect.width >= constraints.minSize.width && zone.rect.height >= constraints.minSize.height, `${template.key}.${device}.${zone.nodeId}: 默认槽位小于合同最小尺寸`);
        assert.ok(zone.rect.width <= constraints.maxSize.width && zone.rect.height <= constraints.maxSize.height, `${template.key}.${device}.${zone.nodeId}: 默认槽位超过合同最大尺寸`);
        if (constraints.safeAreaRequired) {
          const safe = viewport.safeArea;
          assert.ok(zone.rect.x >= safe.x - 0.000001 && zone.rect.y >= safe.y - 0.000001 && zone.rect.x + zone.rect.width <= safe.x + safe.width + 0.000001 && zone.rect.y + zone.rect.height <= safe.y + safe.height + 0.000001, `${template.key}.${device}.${zone.nodeId}: 默认槽位越出安全区`);
        }
      }
      zoneRoleIds.add(zone.roleId);
      if (!zone.overlay) structuralRoleIds.add(zone.roleId);
    }
    if (template.heightModeByViewport[device] !== "viewport") {
      for (const role of template.roles.filter((candidate) => candidate.kind === "media")) {
        const ratioPreset = role.defaultRatioByViewport?.[device];
        const zone = viewport.zones.find((candidate) => candidate.nodeId === role.id);
        if (!ratioPreset || !zone) continue;
        const [ratioWidth, ratioHeight] = ratioPreset.split("/").map(Number);
        const expectedRatio = ratioWidth / ratioHeight;
        const actualRatio = viewport.frameAspectRatio * zone.rect.width / zone.rect.height;
        assert.ok(Math.abs(actualRatio - expectedRatio) <= 0.06, `${template.key}.${device}.${role.id}: 默认几何比例 ${actualRatio.toFixed(3)} 与媒体合同 ${ratioPreset} 不一致`);
      }
    }
    const geometryOrder = getGeometryOrder(template, device);
    assert.deepEqual(geometryOrder.filter((id) => !rolesById.has(id) || !zoneRoleIds.has(id)), [], `${template.key}.${device}: 几何顺序包含无区域或未声明 role id`);
    assert.deepEqual([...structuralRoleIds].filter((id) => !geometryOrder.includes(id)), [], `${template.key}.${device}: 几何顺序未覆盖全部非 overlay 区域`);
  }
}

const cover = byKey.video.roles.find((role) => role.id === "coverImage");
// 2026-08-19 比例调色板收敛:8→5(1/1、4/5、3/2、16/9、21/6);视频横屏仅保留已批准的常规与超宽两档。
assert.equal(cover.defaultRatioByViewport.desktop, "16 / 9", "视频桌面默认比例必须为 16:9");
assert.deepEqual(cover.allowedRatioPresetsByViewport.desktop, ["16 / 9", "21 / 6"], "视频桌面比例预设不正确");
// 2026-08-19 移动端补 9:16 全屏竖版(手机竖屏素材的物理形态),桌面保持横屏两档;平板按桌面档回落渲染
assert.deepEqual(cover.allowedRatioPresetsByViewport.mobile, ["4 / 5", "16 / 9", "9 / 16"], "视频移动端比例预设不正确");
assert.deepEqual(byKey.video.allowedControls, ["videoWidth"], "视频宽度必须由合同显式声明；背景色仍是共享样式能力");
assert.equal(byKey.productRow.presetValues.columns.defaultByViewport.desktop, 3, "商品列表桌面默认必须为三列");
assert.ok(byKey.hotspot.roles.some((role) => role.id === "hotspots" && role.parentRole === "sceneImage" && role.positioning === "relative-to-media"), "热点必须从属于媒体槽");
assert.deepEqual(byKey.testimonials.roles.map((role) => role.id).sort(), ["attribution", "authorizedPhoto", "mainQuote"].sort(), "顾客分享只能保留授权实拍、主引语和署名角色");
assert.deepEqual(getGeometryOrder(byKey.testimonials, "desktop"), ["authorizedPhoto", "mainQuote", "attribution"], "顾客分享几何顺序必须与批准结构一致");
// 2026-08-18 构图评审修订:预约入口补可选氛围背景(bgImage,不承载内容/行动,
// 仍维持一个主行动与禁 form 的尾章语义)
assert.deepEqual(byKey.booking.roles.map((role) => role.id).sort(), ["bgImage", "copy", "primaryAction", "secondaryContact"].sort(), "预约入口只能保留可选背景、文案、一个主行动和可选联系方式");
assert.equal(byKey.booking.roles.filter((role) => role.kind === "action").length, 1, "预约入口必须且只能有一个行动角色");
assert.equal(byKey.booking.roles.some((role) => role.kind === "form" || role.role === "form"), false, "预约入口禁止 form 角色");
assert.equal(byKey.booking.roles.find((role) => role.id === "bgImage")?.required, false, "预约入口背景必须是可选角色");
for (const device of ["desktop", "mobile"]) assert.deepEqual(getGeometryOrder(byKey.booking, device), ["copy", "primaryAction", "secondaryContact"], `预约入口 ${device} 几何顺序不一致(背景不进结构预览)`);
assert.deepEqual(byKey.productRow.editorCapabilities.referenceFields, [{ kind: "product", key: "productCodes", legacyKey: "productIds", min: 2, max: 8 }], "商品列表必须保存稳定 code 并双读旧 numeric id");
assert.deepEqual(byKey.categoryCards.editorCapabilities.referenceFields, [{ kind: "category", key: "categorySlugs", legacyKey: "categories", min: 2, max: 4 }], "分类卡必须保存真实 Category.slug");
assert.deepEqual(
  byKey.hero.contentBudget.requiredText,
  ["title"],
  "公开 Hero 的普通必填文案只保留真实 DOM 标题，替代文字由媒体 altPolicy 管理",
);
assert.equal(
  byKey.hero.editorCapabilities.editableObjects.find((object) => object.roleId === "desktopImage")?.altPolicy,
  "required",
  "公开 Hero 图片替代文字必须由媒体对象发布策略强制要求",
);
assert.deepEqual(
  byKey.carousel.editorCapabilities.editableObjects.find((object) => object.roleId === "frames")?.collectionMediaPolicies,
  [{ collectionFieldKey: "images", mediaFieldKeys: ["url", "mobileUrl"], altPolicy: "required", altFieldKey: "alt" }],
  "轮播图必须逐项填写替代文字，桌面图与手机图共用同一语义",
);
assert.deepEqual(
  byKey.gallery.editorCapabilities.editableObjects.find((object) => object.roleId === "works")?.collectionMediaPolicies,
  [{ collectionFieldKey: "items", mediaFieldKeys: ["image"], altPolicy: "required", altFieldKey: "altText" }],
  "作品画廊必须逐项填写替代文字",
);
assert.deepEqual(
  byKey.sceneShopping.editorCapabilities.editableObjects.find((object) => object.roleId === "scenes")?.collectionMediaPolicies,
  [{ collectionFieldKey: "categories", mediaFieldKeys: ["image"], altPolicy: "required", altFieldKey: "altText" }],
  "手工场景入口必须逐项填写替代文字",
);
for (const [templateKey, roleId, collectionFieldKey, mediaFieldKey, derivedAltFieldKey] of [
  ["journey", "steps", "steps", "image", "name"],
  ["categoryCards", "categories", "categories", "image", "name"],
  ["certificates", "certificates", "certificates", "imageUrl", "name"],
  ["testimonials", "authorizedPhoto", "testimonials", "image", "name"],
]) {
  assert.deepEqual(
    byKey[templateKey].editorCapabilities.editableObjects.find((object) => object.roleId === roleId)?.collectionMediaPolicies,
    [{ collectionFieldKey, mediaFieldKeys: [mediaFieldKey], altPolicy: "derived", derivedAltFieldKey }],
    `${templateKey}: 条目图片必须从同一条目业务名称派生替代文字`,
  );
}
assert.equal(
  byKey.hero.roles.find((role) => role.id === "mobileImage")?.required,
  true,
  "公开 Hero 必须提供独立移动端素材，不能只依赖桌面裁切",
);
assert.deepEqual(
  byKey.hero.editorCapabilities.layoutOverrides.textRoles.map((role) => role.roleId),
  ["eyebrow", "title", "subtitle", "actionText"],
  "Hero 必须以语义文字角色开放实例编辑，不能退回笼统 copy 开关",
);
assert.ok(byKey.hero.editorCapabilities.layoutOverrides.textRoles.every((role) => role.requiresSafeBand), "Hero 图片叠字必须为每个语义角色声明实色安全文字带门禁");
const heroCopy = byKey.hero.editorCapabilities.editableObjects.find((object) => object.roleId === "copy");
assert.deepEqual(heroCopy.nodeIds, ["copy", "eyebrow", "title", "subtitle"], "Hero 聚合 copy 必须显式绑定全部文字子节点");
assert.deepEqual(heroCopy.contentFieldKeys, ["eyebrow", "title", "subtitle"], "Hero copy 内容字段必须来自同一对象合同");
const heroMedia = byKey.hero.editorCapabilities.editableObjects.find((object) => object.roleId === "desktopImage");
assert.equal(heroMedia.fieldScopes.altText, "shared", "图片 Alt 必须保持跨设备共享");
assert.equal(heroMedia.fieldScopes.desktopImage, "viewport-specific", "桌面图片素材必须显式声明设备策略");
assert.equal(byKey.video.editorCapabilities.editableObjects.find((object) => object.roleId === "coverImage")?.kind, "video", "视频对象类型不得退化为普通 media 推断");
assert.ok(byKey.video.editorCapabilities.editableObjects.find((object) => object.roleId === "coverImage")?.capabilities.includes("playback"), "视频必须显式声明 playback 能力");
assert.equal(byKey.featuredProduct.editorCapabilities.editableObjects.find((object) => object.roleId === "product")?.referenceFieldKey, "productCode", "单品对象必须绑定稳定商品引用字段");
assert.deepEqual(byKey.carousel.editorCapabilities.editableObjects.find((object) => object.roleId === "frames")?.collectionFieldKeys, ["images"], "集合字段 API 必须统一使用 collectionFieldKeys 复数");
assert.deepEqual(byKey.comparison.editorCapabilities.editableObjects.find((object) => object.roleId === "action")?.nodeIds, ["action", "actionText"], "无独立画布角色的行动字段必须作为 content-only 虚拟对象显式绑定");

const sortReplacer = (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]]))
    : value;
const hash = createHash("sha256").update(JSON.stringify(contract, sortReplacer)).digest("hex");
for (const generated of [client, server]) {
  assert.ok(generated.includes(`SHA-256：${hash}`) && generated.includes("CONTENT_TEMPLATE_CONTRACTS"), "生成产物必须与权威合同摘要一致");
  assert.ok(generated.includes("export type ContentTemplateEditableObject ="), "客户端与服务端必须共享可编辑对象类型");
  assert.ok(generated.includes("export function findContentTemplateEditableObject("), "客户端与服务端必须共享安全对象查询 helper");
  assert.ok(generated.includes("sizePreset?: string;") && generated.includes("positionPreset?: string;"), "V2 必须声明并校验尺寸/位置预设");
  assert.ok(generated.includes("export type ContentTemplateCommercialPurpose =") && generated.includes('"commercialPurpose"'), "客户端与服务端必须共享商业目的合同");
}
for (const generated of [client, server]) {
  assert.match(generated, /CONTENT_TEMPLATE_PAGE_METADATA/, "客户端与服务端生成产物必须包含正式 SEO 合同");
}
assert.doesNotMatch(blockMetaSource, /category:\s*"(?:品牌展示|商品销售|活动转化|内容传播|信任建立)"/, "BLOCK_META 商业分类必须从机器合同派生，不得手写第二份事实");
assert.doesNotMatch(previewSource, /<img\b|https?:\/\//, "中性预览不得引入外部图片");
console.log(`内容模板统一合同验证通过：${contract.templates.length} 个模板的商业目的、双端归一化几何、直接操作约束、语义角色和 CTA 门禁一致。`);
