import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { createContentTemplateMarker } from "../../src/page-builder/generated/contentTemplates.generated";
import PuckDocumentRenderer, {
  type PuckBlock,
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

const unsupportedHeroDocument: PuckDocument = {
  ...rendererDocument,
  content: [{
    ...rendererDocument.content[0],
    props: {
      ...rendererDocument.content[0].props,
      id: "hero-unsupported-contract",
      title: "合同错误时不应公开的标题",
      __contentTemplate: { key: "wrong-key", version: 1 },
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
    slotSummary: "1 个标题槽位、1 个图片槽位",
    recommendedFor: ["home"],
    desktopRatio: "16:9",
    mobileRatio: "4:5",
    visualRole: "primary-stage",
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
      childIds: ["node_heading", "node_image"],
      props: {},
      responsive: {
        desktop: { display: "flex", direction: "column", order: 0, width: "fill", height: { mode: "auto" } },
        mobile: { display: "flex", direction: "column", order: 0, width: "fill", height: { mode: "auto" } },
      },
      hidden: false,
    },
    node_heading: {
      nodeId: "node_heading",
      type: "HeadingSlot",
      name: "主标题",
      slotId: "slot_heading",
      childIds: [],
      props: {},
      responsive: {
        desktop: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
        mobile: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
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
    slot_heading: {
      slotId: "slot_heading",
      key: "heading",
      type: "heading",
      label: "主标题",
      required: false,
      editable: true,
      hideable: true,
      validation: {},
      desktopRules: {},
      mobileRules: {},
    },
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
  defaultContent: {
    slot_heading: "模板默认标题",
    slot_image: { src: "/images/template-default.svg", alt: "模板默认图" },
  },
};

const desktopOnlyDynamicImageDefinition: TemplateDefinitionV2 = {
  ...dynamicImageDefinition,
  templateId: "tpl_desktop_only_primary",
  name: "仅桌面可达首屏",
  nodes: {
    ...dynamicImageDefinition.nodes,
    node_image: {
      ...dynamicImageDefinition.nodes.node_image,
      responsive: {
        ...dynamicImageDefinition.nodes.node_image.responsive,
        mobile: {
          ...dynamicImageDefinition.nodes.node_image.responsive.mobile,
          display: "none",
        },
      },
    },
  },
};

const mobileHiddenHeadingDefinition: TemplateDefinitionV2 = {
  ...dynamicImageDefinition,
  templateId: "tpl_mobile_hidden_heading_primary",
  name: "手机隐藏标题首屏",
  nodes: {
    ...dynamicImageDefinition.nodes,
    node_heading: {
      ...dynamicImageDefinition.nodes.node_heading,
      responsive: {
        ...dynamicImageDefinition.nodes.node_heading.responsive,
        mobile: {
          ...dynamicImageDefinition.nodes.node_heading.responsive.mobile,
          display: "none",
        },
      },
    },
  },
};

function dynamicPrimaryBlock(
  definition: TemplateDefinitionV2,
  instanceId: string,
  title: string,
  imageUrl?: string,
  altText?: string,
): PuckBlock {
  const templateVersion = 1;
  return {
    type: "动态模板实例",
    props: {
      id: `block_${instanceId}`,
      instanceSchemaVersion: 1,
      instanceId,
      templateId: definition.templateId,
      templateVersion,
      moduleName: definition.name,
      contentBySlotId: {
        slot_heading: title,
        ...(imageUrl ? { slot_image: { src: imageUrl, alt: altText ?? `${title}图片` } } : {}),
      },
      layoutOverridesByNodeId: {},
      hiddenSlotIds: [],
      isVisible: true,
    },
  };
}

function dynamicPrimaryDocument(
  content: PuckBlock[],
  definitions: readonly TemplateDefinitionV2[],
): PuckDocument {
  const templateVersion = 1;
  return {
    content,
    root: { props: {} },
    [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: Object.fromEntries(definitions.map((definition) => ([
      dynamicTemplateVersionKey(definition.templateId, templateVersion),
      {
        templateId: definition.templateId,
        version: templateVersion,
        schemaVersion: definition.schemaVersion,
        definitionChecksum: `fixture-checksum-${definition.templateId}`,
        definition,
      },
    ]))),
  };
}

function dynamicImageDocument(withExplicitImage: boolean): PuckDocument {
  return dynamicPrimaryDocument([
    dynamicPrimaryBlock(
      dynamicImageDefinition,
      withExplicitImage ? "instance_with_image" : "instance_without_image",
      withExplicitImage ? "有页面图片的动态首屏" : "无页面图片的动态首屏",
      withExplicitImage ? "/images/uploaded-instance.svg" : undefined,
      withExplicitImage ? "页面上传图" : undefined,
    ),
  ], [dynamicImageDefinition]);
}

const hiddenDynamicBeforeVisibleDynamicDocument = dynamicPrimaryDocument([
  dynamicPrimaryBlock(dynamicImageDefinition, "instance_hidden_dynamic", "无图动态首屏"),
  dynamicPrimaryBlock(
    dynamicImageDefinition,
    "instance_visible_after_hidden",
    "无图动态首屏后的可见首屏",
    "/images/visible-after-hidden.svg",
  ),
], [dynamicImageDefinition]);

const desktopOnlyBeforeMobileVisibleDocument = dynamicPrimaryDocument([
  dynamicPrimaryBlock(
    desktopOnlyDynamicImageDefinition,
    "instance_desktop_only",
    "仅桌面可见首屏",
    "/images/desktop-only.svg",
  ),
  dynamicPrimaryBlock(
    dynamicImageDefinition,
    "instance_mobile_visible",
    "手机实际可见首屏",
    "/images/mobile-visible.svg",
  ),
], [desktopOnlyDynamicImageDefinition, dynamicImageDefinition]);

const mobileHiddenHeadingBeforeVisibleHeadingDocument = dynamicPrimaryDocument([
  dynamicPrimaryBlock(
    mobileHiddenHeadingDefinition,
    "instance_mobile_hidden_heading",
    "手机隐藏的首屏标题",
    "/images/mobile-hidden-heading.svg",
  ),
  dynamicPrimaryBlock(
    dynamicImageDefinition,
    "instance_mobile_visible_heading",
    "手机实际页面标题",
    "/images/mobile-visible-heading.svg",
  ),
], [mobileHiddenHeadingDefinition, dynamicImageDefinition]);

const emptyFixedBeforeVisibleDynamicDocument = dynamicPrimaryDocument([
  emptyHeroDocument.content![0],
  dynamicPrimaryBlock(
    dynamicImageDefinition,
    "instance_visible_after_fixed",
    "无图固定首屏后的可见首屏",
    "/images/visible-after-fixed.svg",
  ),
], [dynamicImageDefinition]);

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
    <div data-renderer-fixture="hidden-dynamic-before-visible-dynamic">
      <PuckDocumentRenderer data={hiddenDynamicBeforeVisibleDynamicDocument} />
    </div>
    <div data-renderer-fixture="desktop-only-before-mobile-visible">
      <PuckDocumentRenderer data={desktopOnlyBeforeMobileVisibleDocument} />
    </div>
    <div data-renderer-fixture="mobile-hidden-heading-before-visible-heading">
      <PuckDocumentRenderer data={mobileHiddenHeadingBeforeVisibleHeadingDocument} />
    </div>
    <div data-renderer-fixture="empty-fixed-before-visible-dynamic">
      <PuckDocumentRenderer data={emptyFixedBeforeVisibleDynamicDocument} />
    </div>
    <div data-renderer-fixture="unsupported-public">
      <PuckDocumentRenderer data={unsupportedHeroDocument} />
    </div>
    <div data-renderer-fixture="unsupported-preview">
      <PuckDocumentRenderer data={unsupportedHeroDocument} mode="preview" />
    </div>
  </MemoryRouter>,
);
