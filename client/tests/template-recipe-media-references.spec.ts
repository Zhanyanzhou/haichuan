import { expect, test } from "@playwright/test";
import {
  getDynamicTemplateDocumentMediaReferences as clientReferences,
  hasExplicitDynamicTemplateInstanceImage,
} from "../src/page-builder/dynamic-template-instance/mediaReferences";
import { createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { compileDynamicTemplateRenderPlan } from "../src/page-builder/template-definition/renderPlan";

function definitionFixture() {
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("productPromotion"), {
    name: "媒体引用测试",
    templateId: "tpl_media_reference_test",
  });
  const headingSlot = Object.values(definition.slots).find((slot) => slot.semanticRole === "title")!;
  const heading = Object.values(definition.nodes).find((node) => node.slotId === headingSlot.slotId)!;
  const container = Object.values(definition.nodes).find((node) => node.childIds.includes(heading.nodeId))!;
  const imageSlot = Object.values(definition.slots).find((slot) => slot.type === "image")!;
  const image = Object.values(definition.nodes).find((node) => node.slotId === imageSlot.slotId)!;
  const imageContainer = Object.values(definition.nodes).find((node) => node.childIds.includes(image.nodeId))!;
  const visibleSlot = Object.values(definition.slots).find((slot) => (
    slot.type === "text" && slot.slotId !== headingSlot.slotId
  ))!;
  return {
    definition,
    containerId: container.nodeId,
    headingId: heading.nodeId,
    headingSlotId: headingSlot.slotId,
    imageContainerId: imageContainer.nodeId,
    imageSlotId: imageSlot.slotId,
    rootId: definition.rootNodeId,
    visibleSlotId: visibleSlot.slotId,
  };
}

test("客户端背景引用覆盖仅 Tablet 可见、隐藏父级与空槽位", () => {
  const { definition, containerId, headingId, headingSlotId, rootId, visibleSlotId } = definitionFixture();
  definition.schemaVersion = 3;
  definition.templateRecipe = createRecommendedRecipe();
  definition.nodes[rootId].responsive.desktop.backgroundImage = "/uploads/root.jpg";
  definition.nodes[containerId].responsive.desktop.display = "none";
  definition.nodes[containerId].responsive.tablet = {
    ...definition.nodes[containerId].responsive.tablet,
    display: "block",
    backgroundImage: "/uploads/tablet.jpg",
  };
  definition.nodes[containerId].responsive.mobile = {
    ...definition.nodes[containerId].responsive.mobile,
    display: "none",
  };
  definition.nodes[headingId].responsive.desktop.backgroundImage = "/uploads/heading.jpg";
  const props = { id: "instance_preview", instanceId: "instance_preview", instanceSchemaVersion: 1, moduleName: "预览", templateId: definition.templateId, templateVersion: 1, contentBySlotId: { [visibleSlotId]: "保持模板可达" }, layoutOverridesByNodeId: {}, hiddenSlotIds: [] as string[], isVisible: true };
  const probe = compileDynamicTemplateRenderPlan(definition, {
    device: "desktop",
    breakpoint: "desktop",
    contentBySlotId: props.contentBySlotId,
    showEmptySlots: false,
  });
  expect(probe.ok, JSON.stringify(probe)).toBe(true);
  const document = { content: [{ type: "动态模板实例", props }], resolvedDynamicTemplates: { [`${definition.templateId}@1`]: { templateId: definition.templateId, version: 1, schemaVersion: 3, definitionChecksum: "a".repeat(64), definition } } };
  const urls = (collect: (input: unknown) => Array<{ url: string }>) => collect(document).map((item) => item.url).sort();
  expect(urls(clientReferences)).toEqual(["/uploads/root.jpg", "/uploads/tablet.jpg"]);
  definition.defaultContent[headingSlotId] = "标题";
  expect(urls(clientReferences)).toEqual(["/uploads/heading.jpg", "/uploads/root.jpg", "/uploads/tablet.jpg"]);
  props.hiddenSlotIds = [headingSlotId];
  expect(urls(clientReferences)).toEqual(["/uploads/root.jpg", "/uploads/tablet.jpg"]);
  definition.nodes[containerId].hidden = true;
  expect(urls(clientReferences)).toEqual(["/uploads/root.jpg"]);
  props.isVisible = false;
  expect(urls(clientReferences)).toEqual([]);
});

test("公开模板显隐只认页面实例明确填写且可达的图片", () => {
  const { definition, imageContainerId, imageSlotId } = definitionFixture();
  definition.defaultContent[imageSlotId] = {
    src: "/images/template-default.jpg",
    alt: "模板默认图",
  };

  expect(hasExplicitDynamicTemplateInstanceImage(definition, {}, [])).toBe(false);
  expect(hasExplicitDynamicTemplateInstanceImage(definition, {
    [imageSlotId]: { src: "/uploads/page-instance.jpg", alt: "页面上传图" },
  }, [])).toBe(true);
  expect(hasExplicitDynamicTemplateInstanceImage(definition, {
    [imageSlotId]: { src: "/uploads/page-instance.jpg", alt: "页面上传图" },
  }, [imageSlotId])).toBe(false);

  definition.nodes[imageContainerId].responsive.desktop.display = "none";
  definition.nodes[imageContainerId].responsive.tablet = {
    ...definition.nodes[imageContainerId].responsive.tablet,
    display: "none",
  };
  definition.nodes[imageContainerId].responsive.mobile.display = "none";
  expect(hasExplicitDynamicTemplateInstanceImage(definition, {
    [imageSlotId]: { src: "/uploads/page-instance.jpg", alt: "页面上传图" },
  }, [])).toBe(false);
});
