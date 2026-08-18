import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const [text, client, server, previewSource] = await Promise.all([
  read("contracts/page-builder/content-templates.contract.json"),
  read("client/src/page-builder/generated/contentTemplates.generated.ts"),
  read("server/src/modules/page-modules/generated/contentTemplates.generated.ts"),
  read("client/src/page-builder/preview/ContentTemplateSkeletonPreview.tsx"),
]);
const contract = JSON.parse(text);
const byKey = Object.fromEntries(contract.templates.map((template) => [template.key, template]));
const categories = ["视觉展示", "图文内容", "商品展示", "导航入口", "服务信息", "活动内容"];
const devices = ["desktop", "tablet", "mobile"];

assert.equal(contract.contractSchemaVersion, 2, "必须使用统一根构图合同 schema v2");
assert.equal(contract.templates.length, 23, "必须保留 23 个运营模板");
assert.deepEqual(categories.map((category) => contract.templates.filter((template) => template.category === category).length), [4, 5, 4, 3, 6, 1], "六类数量必须保持 4/5/4/3/6/1");

for (const template of contract.templates) {
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
    for (const device of devices) {
      const defaultRatio = role.defaultRatioByViewport?.[device];
      const allowed = role.allowedRatioPresetsByViewport?.[device];
      if (defaultRatio) assert.ok(allowed?.includes(defaultRatio), `${template.key}.${role.id}.${device}: 默认比例不在允许预设内`);
    }
  }
  const actionCount = template.roles.filter((role) => role.kind === "action").length;
  assert.ok(actionCount <= template.contentBudget.maxCtas, `${template.key}: 行动角色数超过 maxCtas`);
  for (const device of ["desktop", "mobile"]) {
    const viewport = template.preview[device];
    const zoneRoleIds = new Set();
    const structuralRoleIds = new Set();
    assert.equal(new Set(viewport.order).size, viewport.order.length, `${template.key}.preview.${device}: 预览顺序不得重复 role id`);
    for (const zone of viewport.zones) {
      const role = rolesById.get(zone.roleId);
      assert.ok(role, `${template.key}.preview.${device}: 区域 ${zone.roleId} 未映射到已声明角色`);
      assert.ok((role.previewRoles ?? [role.role]).includes(zone.role), `${template.key}.preview.${device}.${zone.roleId}: 渲染角色与语义角色矛盾`);
      zoneRoleIds.add(zone.roleId);
      if (!zone.overlay) structuralRoleIds.add(zone.roleId);
    }
    assert.deepEqual(viewport.order.filter((id) => !rolesById.has(id) || !zoneRoleIds.has(id)), [], `${template.key}.preview.${device}: 预览顺序包含无区域或未声明 role id`);
    assert.deepEqual([...structuralRoleIds].filter((id) => !viewport.order.includes(id)), [], `${template.key}.preview.${device}: 预览顺序未覆盖全部非 overlay 区域`);
  }
}

const cover = byKey.video.roles.find((role) => role.id === "coverImage");
assert.equal(cover.defaultRatioByViewport.desktop, "16 / 9", "视频桌面默认比例必须为 16:9");
assert.deepEqual(cover.allowedRatioPresetsByViewport.desktop, ["16 / 9", "16 / 7", "3 / 4"], "视频桌面比例预设不正确");
assert.equal(byKey.productRow.presetValues.columns.defaultByViewport.desktop, 3, "商品列表桌面默认必须为三列");
assert.ok(byKey.hotspot.roles.some((role) => role.id === "hotspots" && role.parentRole === "sceneImage" && role.positioning === "relative-to-media"), "热点必须从属于媒体槽");
assert.deepEqual(byKey.testimonials.roles.map((role) => role.id).sort(), ["attribution", "authorizedPhoto", "mainQuote"].sort(), "顾客分享只能保留授权实拍、主引语和署名角色");
assert.deepEqual(byKey.testimonials.preview.desktop.order, ["authorizedPhoto", "mainQuote", "attribution"], "顾客分享预览顺序必须与批准结构一致");
// 2026-08-18 构图评审修订:预约入口补可选氛围背景(bgImage,不承载内容/行动,
// 仍维持一个主行动与禁 form 的尾章语义)
assert.deepEqual(byKey.booking.roles.map((role) => role.id).sort(), ["bgImage", "copy", "primaryAction", "secondaryContact"].sort(), "预约入口只能保留可选背景、文案、一个主行动和可选联系方式");
assert.equal(byKey.booking.roles.filter((role) => role.kind === "action").length, 1, "预约入口必须且只能有一个行动角色");
assert.equal(byKey.booking.roles.some((role) => role.kind === "form" || role.role === "form"), false, "预约入口禁止 form 角色");
assert.equal(byKey.booking.roles.find((role) => role.id === "bgImage")?.required, false, "预约入口背景必须是可选角色");
for (const device of ["desktop", "mobile"]) assert.deepEqual(byKey.booking.preview[device].order, ["copy", "primaryAction", "secondaryContact"], `预约入口 ${device} 预览顺序不一致(背景不进结构预览)`);

const sortReplacer = (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]]))
    : value;
const hash = createHash("sha256").update(JSON.stringify(contract, sortReplacer)).digest("hex");
for (const generated of [client, server]) assert.ok(generated.includes(`SHA-256：${hash}`) && generated.includes("CONTENT_TEMPLATE_CONTRACTS"), "生成产物必须与权威合同摘要一致");
assert.doesNotMatch(previewSource, /<img\b|https?:\/\//, "中性预览不得引入外部图片");
console.log("内容模板统一合同验证通过：23 个根顺序、语义角色、预览映射和 CTA 门禁一致。");
