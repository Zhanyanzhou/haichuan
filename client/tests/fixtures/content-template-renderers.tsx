import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { createContentTemplateMarker } from "../../src/page-builder/generated/contentTemplates.generated";
import PuckDocumentRenderer, {
  type PuckDocument,
} from "../../src/page-builder/runtime/PuckDocumentRenderer";
import {
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
} from "../../src/page-builder/dynamic-template-instance";
import type { TemplateDefinitionV2 } from "../../src/page-builder/template-definition";
import "../../src/styles/globals.css";

const rendererDocument: PuckDocument = {
  content: [{
    type: "首屏主视觉",
    props: {
      id: "hero-only-renderer",
      desktopImage: "/uploads/test-hero.png",
      mobileImage: "/uploads/test-hero.png",
      altText: "首屏测试图",
      eyebrow: "HERO TEST",
      title: "首屏模板测试",
      subtitle: "仅保留这一项内置模板",
      actionText: "",
      targetType: "none",
      linkUrl: "",
      __contentTemplate: createContentTemplateMarker("首屏主视觉"),
    },
  }],
  root: { props: {} },
};

const emptyHeroDocument: PuckDocument = {
  ...rendererDocument,
  content: [{
    ...rendererDocument.content[0],
    props: {
      ...rendererDocument.content[0].props,
      id: "hero-without-image",
      desktopImage: "",
      mobileImage: "",
      title: "缺图时不应公开的标题",
    },
  }],
};

const multipleHeroDocument: PuckDocument = {
  ...rendererDocument,
  content: [
    rendererDocument.content[0],
    {
      ...rendererDocument.content[0],
      props: {
        ...rendererDocument.content[0].props,
        id: "hero-second-renderer",
        title: "第二个首屏模板",
        altText: "第二个首屏测试图",
      },
    },
  ],
};

const dynamicImageDefinition: TemplateDefinitionV2 = {
  schemaVersion: 1,
  templateId: "tpl_public_image_visibility",
  name: "公开图片显隐测试",
  metadata: {
    category: "内容展示",
    purpose: "公开图片显隐",
    layoutType: "单图",
    slotSummary: "1 个图片槽位",
    recommendedFor: ["home"],
    desktopRatio: "16:9",
    mobileRatio: "4:5",
    visualRole: "support-stage",
    headerCompatibility: ["solid"],
    tags: ["test"],
  },
  rootNodeId: "node_root",
  nodes: {
    node_root: {
      nodeId: "node_root",
      type: "Section",
      name: "模板根节点",
      childIds: ["node_container"],
      props: { semanticTag: "section" },
      responsive: {
        desktop: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
        mobile: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
      },
      hidden: false,
    },
    node_container: {
      nodeId: "node_container",
      type: "Container",
      name: "内容容器",
      childIds: ["node_image"],
      props: {},
      responsive: {
        desktop: { display: "flex", direction: "column", order: 0, width: "fill", height: { mode: "auto" } },
        mobile: { display: "flex", direction: "column", order: 0, width: "fill", height: { mode: "auto" } },
      },
      hidden: false,
    },
    node_image: {
      nodeId: "node_image",
      type: "ImageSlot",
      name: "主图",
      slotId: "slot_image",
      childIds: [],
      props: {},
      instanceEditPolicy: {
        position: true,
        size: true,
        zIndex: true,
        imageFit: true,
        imageFocus: true,
        typography: false,
        spacing: false,
        minWidthPercent: 25,
        maxWidthPercent: 150,
        maxOffsetPercent: 30,
        minFontSizePx: 12,
        maxFontSizePx: 96,
        maxSpacingPx: 120,
      },
      responsive: {
        desktop: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
        mobile: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
      },
      hidden: false,
    },
  },
  slots: {
    slot_image: {
      slotId: "slot_image",
      key: "image",
      type: "image",
      label: "主图",
      required: false,
      editable: true,
      hideable: true,
      validation: {},
      desktopRules: {},
      mobileRules: {},
    },
  },
  // 默认图只用于后台模板设计与预览，不能替代页面实例中明确上传的图片。
  defaultContent: { slot_image: { src: "/images/template-default.svg", alt: "模板默认图" } },
};

function dynamicImageDocument(withExplicitImage: boolean): PuckDocument {
  const templateVersion = 1;
  return {
    content: [{
      type: "动态模板实例",
      props: {
        id: withExplicitImage ? "dynamic-with-image" : "dynamic-without-image",
        instanceSchemaVersion: 1,
        instanceId: withExplicitImage ? "instance_with_image" : "instance_without_image",
        templateId: dynamicImageDefinition.templateId,
        templateVersion,
        moduleName: dynamicImageDefinition.name,
        contentBySlotId: withExplicitImage
          ? { slot_image: { src: "/images/uploaded-instance.svg", alt: "页面上传图" } }
          : {},
        layoutOverridesByNodeId: {},
        hiddenSlotIds: [],
        isVisible: true,
      },
    }],
    root: { props: {} },
    [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
      [dynamicTemplateVersionKey(dynamicImageDefinition.templateId, templateVersion)]: {
        templateId: dynamicImageDefinition.templateId,
        version: templateVersion,
        schemaVersion: dynamicImageDefinition.schemaVersion,
        definitionChecksum: "fixture-checksum",
        definition: dynamicImageDefinition,
      },
    },
  };
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <div data-renderer-fixture="fixed-hero">
      <PuckDocumentRenderer data={rendererDocument} />
    </div>
    <div data-renderer-fixture="fixed-hero-without-image">
      <PuckDocumentRenderer data={emptyHeroDocument} />
    </div>
    <div data-renderer-fixture="multiple-fixed-heroes">
      <PuckDocumentRenderer data={multipleHeroDocument} />
    </div>
    <div data-renderer-fixture="dynamic-without-image">
      <PuckDocumentRenderer data={dynamicImageDocument(false)} />
    </div>
    <div data-renderer-fixture="dynamic-with-image">
      <PuckDocumentRenderer data={dynamicImageDocument(true)} />
    </div>
  </MemoryRouter>,
);
