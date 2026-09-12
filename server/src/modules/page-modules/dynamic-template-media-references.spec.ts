import assert from "node:assert/strict";
import test from "node:test";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  getDynamicTemplateDocumentMediaReferences,
} from "./dynamic-template-instance";
import { definitionFixture } from "./dynamic-template-test-fixture";
import type { TemplateDefinitionV2 } from "./generated/templateDefinition.generated";

function imageDefinition(): TemplateDefinitionV2 {
  const definition = definitionFixture();
  definition.nodes.node_container.childIds.push("node_image", "node_image_duplicate");
  definition.nodes.node_image = {
    nodeId: "node_image",
    type: "ImageSlot",
    name: "移动端图片",
    slotId: "slot_image",
    childIds: [],
    props: {},
    responsive: {
      desktop: { display: "none", order: 1, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 1, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  definition.nodes.node_image_duplicate = {
    nodeId: "node_image_duplicate",
    type: "ImageSlot",
    name: "重复图片",
    slotId: "slot_image_duplicate",
    childIds: [],
    props: {},
    responsive: {
      desktop: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  definition.slots.slot_image = {
    slotId: "slot_image",
    key: "mobileImage",
    type: "image",
    label: "移动端图片",
    required: false,
    editable: true,
    hideable: true,
    validation: {},
    desktopRules: {},
    mobileRules: {},
  };
  definition.slots.slot_image_duplicate = {
    ...definition.slots.slot_image,
    slotId: "slot_image_duplicate",
    key: "duplicateImage",
    label: "重复图片",
  };
  return definition;
}

function documentWithDefinition(
  definition: TemplateDefinitionV2,
  overrides: Record<string, unknown> = {},
) {
  const templateVersion = 3;
  return {
    content: [{
      type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
      props: {
        id: "puck-instance-1",
        instanceSchemaVersion: 1,
        instanceId: "instance_1",
        templateId: definition.templateId,
        templateVersion,
        contentBySlotId: {
          slot_image: { src: "/uploads/mobile-only.jpg", alt: "移动端珠宝主图" },
          slot_image_duplicate: { src: "/uploads/mobile-only.jpg", alt: "同一珠宝主图" },
        },
        layoutOverridesByNodeId: {},
        hiddenSlotIds: [],
        isVisible: true,
        ...overrides,
      },
    }],
    zones: {},
    [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
      [dynamicTemplateVersionKey(definition.templateId, templateVersion)]: {
        templateId: definition.templateId,
        version: templateVersion,
        schemaVersion: definition.schemaVersion,
        definitionChecksum: "checksum",
        definition,
      },
    },
  };
}

test("schema2 仅 Tablet 可见素材仍进入公开授权检查", () => {
  const definition = imageDefinition();
  definition.schemaVersion = 2;
  definition.nodes.node_image_duplicate.hidden = true;
  definition.nodes.node_image.responsive.desktop.display = "none";
  definition.nodes.node_image.responsive.tablet = { display: "block" };
  definition.nodes.node_image.responsive.mobile = { display: "none" };
  const references = getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition));
  assert.equal(references.length, 1);
  assert.equal(references[0].url, "/uploads/mobile-only.jpg");
});

test("schema3 背景图片从当前定义各断点收集，忽略隐藏祖先、空槽与实例隐藏", () => {
  const definition = imageDefinition();
  definition.schemaVersion = 3;
  definition.nodes.node_root.responsive.desktop.backgroundImage = "/uploads/root.jpg";
  definition.nodes.node_container.responsive.desktop.display = "none";
  definition.nodes.node_container.responsive.tablet = { display: "block", backgroundImage: "/uploads/tablet.jpg" };
  definition.nodes.node_container.responsive.mobile = { display: "none" };
  definition.nodes.node_heading.responsive.desktop.backgroundImage = "/uploads/empty-heading.jpg";
  const document = documentWithDefinition(definition);
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(document).map((item) => item.url).sort(), ["/uploads/mobile-only.jpg", "/uploads/root.jpg", "/uploads/tablet.jpg"]);
  const backgrounds = getDynamicTemplateDocumentMediaReferences(document).filter((item) => item.field.endsWith("backgroundImage"));
  assert.ok(backgrounds.every((item) => item.blockId === "puck-instance-1"));
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition, { isVisible: false })), []);
  definition.nodes.node_root.hidden = true;
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition)), []);
});

test("schema3 已隐藏或显式清空的槽位背景不收集，默认值回退和 URL 去重与渲染一致", () => {
  const definition = imageDefinition(); definition.schemaVersion = 3;
  definition.nodes.node_image_duplicate.hidden = true;
  definition.nodes.node_image.responsive.desktop = { ...definition.nodes.node_image.responsive.desktop, display: "block", backgroundImage: "/uploads/shared.jpg" };
  definition.nodes.node_image.responsive.mobile = {};
  definition.defaultContent.slot_image = { src: "/uploads/shared.jpg", alt: "默认图片" };
  const current = documentWithDefinition(definition, { contentBySlotId: {} });
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(current).map((item) => item.url), ["/uploads/shared.jpg"]);
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition, { hiddenSlotIds: ["slot_image"], contentBySlotId: {} })), []);
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition, { contentBySlotId: { slot_image: { src: "", alt: "" } } })), []);
  definition.slots.slot_image.emptyPolicy = "use-default";
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition, { contentBySlotId: { slot_image: null } })).map((item) => item.url), ["/uploads/shared.jpg"]);
  delete definition.nodes.node_image.responsive.desktop.backgroundImage;
  for (const cleared of [null, "", { src: "", alt: "" }]) {
    assert.deepEqual(getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition, { contentBySlotId: { slot_image: cleared } })).map((item) => item.url), ["/uploads/shared.jpg"]);
  }
  definition.slots.slot_image.emptyPolicy = "hide";
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition, { contentBySlotId: { slot_image: null } })), []);
});

test("schema2 继承隐藏和祖先隐藏不会误收集公开素材", () => {
  const definition = imageDefinition();
  definition.schemaVersion = 2;
  definition.nodes.node_image_duplicate.hidden = true;
  definition.nodes.node_image.responsive.desktop.hidden = true;
  definition.nodes.node_image.responsive.tablet = {};
  definition.nodes.node_image.responsive.mobile = {};
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition)), []);
  definition.nodes.node_image.responsive.tablet = { hidden: false, display: "block" };
  definition.nodes.node_container.responsive.desktop.hidden = true;
  assert.deepEqual(getDynamicTemplateDocumentMediaReferences(documentWithDefinition(definition)), []);
});

test("动态模板媒体收集按桌面与移动端公开可达性取并集并按 URL 去重", () => {
  const definition = imageDefinition();
  const references = getDynamicTemplateDocumentMediaReferences(
    documentWithDefinition(definition),
  );

  assert.equal(references.length, 1);
  assert.equal(references[0]?.url, "/uploads/mobile-only.jpg");
  assert.equal(references[0]?.field, "slot_image");
});

test("隐藏实例、隐藏槽位和不可达祖先不会扩大公开素材授权范围", async (t) => {
  await t.test("实例隐藏", () => {
    const definition = imageDefinition();
    assert.deepEqual(getDynamicTemplateDocumentMediaReferences(
      documentWithDefinition(definition, { isVisible: false }),
    ), []);
  });

  await t.test("槽位隐藏", () => {
    const definition = imageDefinition();
    assert.deepEqual(getDynamicTemplateDocumentMediaReferences(
      documentWithDefinition(definition, {
        hiddenSlotIds: ["slot_image", "slot_image_duplicate"],
      }),
    ), []);
  });

  await t.test("祖先全局隐藏", () => {
    const definition = imageDefinition();
    definition.nodes.node_container.hidden = true;
    assert.deepEqual(getDynamicTemplateDocumentMediaReferences(
      documentWithDefinition(definition),
    ), []);
  });

  await t.test("桌面和移动端都隐藏", () => {
    const definition = imageDefinition();
    definition.nodes.node_image.responsive.mobile.display = "none";
    definition.nodes.node_image_duplicate.responsive.desktop.display = "none";
    definition.nodes.node_image_duplicate.responsive.mobile.display = "none";
    assert.deepEqual(getDynamicTemplateDocumentMediaReferences(
      documentWithDefinition(definition),
    ), []);
  });
});
