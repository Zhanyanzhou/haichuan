import { expect, test } from "@playwright/test";
import { DYNAMIC_TEMPLATE_BLOCK_TYPE } from "../src/page-builder/dynamic-template-instance/types";
import { DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY } from "../src/page-builder/dynamic-template-instance/types";
import { getPublishedPageReadiness } from "../src/page-builder/runtime/publishedPageReadiness";
import { createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";

function dynamicHomeDocument(options: {
  includeResolved: boolean;
  includeImage: boolean;
}) {
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("productPromotion"), {
    name: "公开就绪测试",
    templateId: "tpl_public_readiness",
  });
  const imageSlot = Object.values(definition.slots).find((slot) => slot.type === "image");
  expect(imageSlot, "推荐用途应包含图片槽").toBeTruthy();
  const contentBySlotId = options.includeImage && imageSlot
    ? { [imageSlot.slotId]: { src: "/uploads/page-assets/explicit.jpg", alt: "页面主图" } }
    : {};
  const block = {
    type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
    props: {
      id: "instance_readiness",
      instanceSchemaVersion: 1,
      instanceId: "instance_readiness",
      templateId: definition.templateId,
      templateVersion: 1,
      contentBySlotId,
      hiddenSlotIds: [],
      isVisible: true,
    },
  };
  return {
    content: [block],
    zones: {},
    ...(options.includeResolved ? {
      [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
        [`${definition.templateId}@1`]: {
          templateId: definition.templateId,
          version: 1,
          schemaVersion: definition.schemaVersion,
          definitionChecksum: "a".repeat(64),
          definition,
        },
      },
    } : {}),
  };
}

test("无图动态实例不把已发布页判为可公开品牌内容", () => {
  const withoutImage = getPublishedPageReadiness("home", dynamicHomeDocument({
    includeResolved: true,
    includeImage: false,
  }));
  expect(withoutImage?.ready).toBe(false);

  const withoutResolved = getPublishedPageReadiness("home", dynamicHomeDocument({
    includeResolved: false,
    includeImage: true,
  }));
  expect(withoutResolved?.ready).toBe(false);
});

test("有显式页面图片的动态实例计入公开就绪", () => {
  const withImage = getPublishedPageReadiness("home", dynamicHomeDocument({
    includeResolved: true,
    includeImage: true,
  }));
  expect(withImage?.ready).toBe(true);
});
