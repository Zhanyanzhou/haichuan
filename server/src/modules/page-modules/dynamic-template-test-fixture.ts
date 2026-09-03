import type {
  TemplateDefinitionV2,
  DynamicTemplateResponsiveRules,
} from "./generated/templateDefinition.generated";

function rules(display: "block" | "flex" = "block"): DynamicTemplateResponsiveRules {
  return {
    display,
    ...(display === "flex" ? { direction: "column" as const } : {}),
    order: 0,
    width: "fill",
    height: { mode: "auto" },
  };
}

export function definitionFixture(): TemplateDefinitionV2 {
  return {
    schemaVersion: 1,
    templateId: "tpl_server_validation",
    name: "服务端动态模板校验",
    description: "在数据库持久化前验证服务端不信任客户端 JSON。",
    metadata: {
      category: "内容展示",
      purpose: "服务端校验回归",
      layoutType: "纵向内容",
      slotSummary: "1 个标题槽位",
      recommendedFor: ["home"],
      desktopRatio: "auto",
      mobileRatio: "auto",
      previewDesktopWidth: 1200,
      previewMobileWidth: 390,
      minViewportWidth: 320,
      maxViewportWidth: 1920,
      defaultBackgroundToken: "surface",
      tags: ["server"],
    },
    rootNodeId: "node_root",
    nodes: {
      node_root: {
        nodeId: "node_root",
        type: "Section",
        name: "模板根节点",
        childIds: ["node_container"],
        props: { semanticTag: "section" },
        responsive: { desktop: rules(), mobile: rules() },
        hidden: false,
      },
      node_container: {
        nodeId: "node_container",
        type: "Container",
        name: "内容容器",
        childIds: ["node_heading"],
        props: {},
        responsive: { desktop: rules("flex"), mobile: rules("flex") },
        hidden: false,
      },
      node_heading: {
        nodeId: "node_heading",
        type: "HeadingSlot",
        name: "主标题",
        slotId: "slot_heading",
        childIds: [],
        props: {},
        instanceEditPolicy: {
          position: true,
          size: true,
          zIndex: true,
          imageFit: false,
          imageFocus: false,
          typography: true,
          spacing: true,
          minWidthPercent: 25,
          maxWidthPercent: 150,
          maxOffsetPercent: 30,
          minFontSizePx: 12,
          maxFontSizePx: 96,
          maxSpacingPx: 120,
        },
        responsive: { desktop: rules(), mobile: rules() },
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
        validation: { maxLength: 60 },
        desktopRules: { fontRole: "display", maxLines: 2 },
        mobileRules: { fontRole: "heading", maxLines: 3 },
      },
    },
    defaultContent: {},
  };
}
