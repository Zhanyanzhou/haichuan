import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { calculateDynamicTemplateDefinitionChecksum } from "./dynamic-template-definition-integrity";
import { definitionFixture } from "./dynamic-template-test-fixture";
import { PageModulesService } from "./page-modules.service";
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";

function publicationFixture() {
  const definition = definitionFixture();
  definition.schemaVersion = 3;
  definition.metadata.headerCompatibility = ["overlay-light"];
  definition.nodes.node_heading.type = "ImageSlot";
  Object.assign(definition.slots.slot_heading, {
    type: "image", validation: {}, desktopRules: {}, mobileRules: {},
  });
  const props = {
    id: "visibility-block", instanceSchemaVersion: 1, instanceId: "visibility_instance",
    templateId: definition.templateId, templateVersion: 1,
    contentBySlotId: {} as Record<string, unknown>, hiddenSlotIds: [] as string[],
    overrides: {}, isVisible: true,
  };
  const data = { root: { props: {} }, zones: {}, content: [{ type: "动态模板实例", props }] };
  const prisma = {
    dynamicTemplateVersion: {
      findMany: async () => [{
        version: 1, schemaVersion: definition.schemaVersion, definition,
        definitionChecksum: calculateDynamicTemplateDefinitionChecksum(definition),
        template: { templateId: definition.templateId },
      }],
    },
    product: { findMany: async () => [] }, category: { findMany: async () => [] },
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);
  const metadata = makeFormalPageMetadata(data);
  const grant = (url: string) => metadata.mediaRights.push({
    assetUrl: url, source: "测试夹具素材", authorizationId: "VISIBILITY-TEST",
  });
  const validate = () => service.validatePageDocument("products", data, metadata);
  return { definition, props, data, service, metadata, grant, validate };
}

test("公开背景即使有授权仍拒绝外部地址与缺失上传文件", async (t) => {
  for (const url of ["https://example.invalid/background.jpg", "/uploads/__visibility-test-missing__/background.jpg"]) {
    await t.test(url, async () => {
      const fixture = publicationFixture();
      fixture.definition.nodes.node_root.responsive.desktop.backgroundImage = url;
      fixture.grant(url);
      const result = await fixture.validate();
      assert.equal(result.valid, false);
      const issue = result.issues.find((item) => item.field === "node_root.backgroundImage");
      assert.ok(issue);
      assert.equal(issue.blockId, "visibility-block");
      assert.match(issue.path, /templateDefinition\.nodes\.node_root\.backgroundImage$/);
      assert.match(issue.message, url.startsWith("https") ? /外部素材/ : /不存在|找不到|缺失/);
    });
  }
});

test("本站静态背景缺少来源记录时只提醒，补齐后消除提醒", async () => {
  const fixture = publicationFixture();
  fixture.definition.nodes.node_root.responsive.desktop.backgroundImage = "/images/formal-background.jpg";
  const advisory = await fixture.validate();
  assert.equal(advisory.valid, true);
  assert.equal(advisory.errors.length, 0);
  assert.equal(advisory.issues.length, 1);
  assert.equal(advisory.issues[0]?.severity, "warning");
  assert.match(advisory.issues[0]?.message || "", /不影响本次页面发布/);
  fixture.grant("/images/formal-background.jpg");
  assert.deepEqual(await fixture.validate(), { valid: true, errors: [], issues: [] });
});

test("仅 Tablet 可见背景仍受资源门禁，全断点隐藏后不阻断", async () => {
  const fixture = publicationFixture();
  const node = fixture.definition.nodes.node_container;
  node.responsive.desktop.display = "none";
  node.responsive.mobile = { display: "none" };
  node.responsive.tablet = { display: "block", backgroundImage: "https://example.invalid/tablet.jpg" };
  fixture.grant("https://example.invalid/tablet.jpg");
  assert.equal((await fixture.validate()).valid, false);
  node.responsive.tablet.display = "none";
  assert.equal((await fixture.validate()).valid, true);
});

test("显式隐藏或全断点不可达的可选图片不再检查 alt、资源或授权", async (t) => {
  for (const hiddenBy of ["slot", "ancestor", "all-breakpoints"] as const) {
    await t.test(hiddenBy, async () => {
      const fixture = publicationFixture();
      fixture.props.contentBySlotId.slot_heading = { src: "https://example.invalid/hidden.jpg", alt: "" };
      if (hiddenBy === "slot") fixture.props.hiddenSlotIds = ["slot_heading"];
      if (hiddenBy === "ancestor") fixture.definition.nodes.node_container.hidden = true;
      if (hiddenBy === "all-breakpoints") {
        fixture.definition.nodes.node_container.responsive.desktop.display = "none";
        fixture.definition.nodes.node_container.responsive.mobile.display = "none";
      }
      assert.deepEqual(await fixture.validate(), { valid: true, errors: [], issues: [] });
    });
  }
});

test("图片只在 Tablet 可见时仍须完整，重新隐藏 Tablet 后通过", async () => {
  const fixture = publicationFixture();
  fixture.props.contentBySlotId.slot_heading = { src: "https://example.invalid/tablet.jpg", alt: "" };
  const node = fixture.definition.nodes.node_container;
  node.responsive.desktop.display = "none";
  node.responsive.mobile.display = "none";
  node.responsive.tablet = { display: "block" };
  const result = await fixture.validate();
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(
    (issue) => issue.severity === "warning" && issue.message.includes("替代文字不能为空"),
  ));
  assert.equal(result.errors.some((message) => message.includes("替代文字不能为空")), false);
  assert.ok(result.errors.some((message) => message.includes("外部素材地址")));
  node.responsive.tablet.display = "none";
  assert.equal((await fixture.validate()).valid, true);
});

test("模板只有结构、没有页面上传图片时允许发布并给出内容提醒", async () => {
  const fixture = publicationFixture();
  fixture.definition.slots.slot_heading.required = true;

  const result = await fixture.validate();

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.ok(result.issues.some(
    (issue) => issue.severity === "warning" && issue.message.includes("为必填内容"),
  ));
});

test("隐藏不能绕过必填、不允许隐藏、编辑授权或槽位内容结构", async (t) => {
  for (const invalid of ["required", "not-hideable", "not-editable", "invalid-shape"] as const) {
    await t.test(invalid, async () => {
      const fixture = publicationFixture();
      fixture.props.hiddenSlotIds = ["slot_heading"];
      fixture.props.contentBySlotId.slot_heading = { src: "/images/formal.jpg", alt: "正式图片" };
      const slot = fixture.definition.slots.slot_heading;
      if (invalid === "required") slot.required = true;
      if (invalid === "not-hideable") slot.hideable = false;
      if (invalid === "not-editable") slot.editable = false;
      if (invalid === "invalid-shape") fixture.props.contentBySlotId.slot_heading = 123;
      const result = await fixture.validate();
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((message) => /不允许隐藏|必填|不允许在页面中修改|内容结构/.test(message)));
    });
  }
});

test("空图片节点的背景不可达，默认内容回退后恢复背景门禁", async () => {
  const fixture = publicationFixture();
  fixture.definition.nodes.node_heading.responsive.desktop.backgroundImage = "https://example.invalid/slot-background.jpg";
  assert.equal((await fixture.validate()).valid, true);
  fixture.definition.defaultContent.slot_heading = { src: "/images/formal.jpg", alt: "正式图片" };
  fixture.grant("/images/formal.jpg");
  fixture.grant("https://example.invalid/slot-background.jpg");
  assert.equal((await fixture.validate()).valid, false);
});
