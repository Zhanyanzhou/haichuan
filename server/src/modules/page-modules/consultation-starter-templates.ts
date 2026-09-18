import type { TemplateDefinitionV2 } from "./generated/templateDefinition.generated";
import { definitionFixture } from "./dynamic-template-test-fixture";

export const CONSULTATION_STARTER_SOURCE_PREFIX = "consultation-starter:";

export type ConsultationStarterPageKey =
  | "home"
  | "products"
  | "catalog"
  | "custom"
  | "about"
  | "contact";

export type ConsultationStarterSpec = {
  pageKey: ConsultationStarterPageKey;
  templateId: string;
  sourceReference: string;
  name: string;
  purpose: string;
  visualRole: NonNullable<TemplateDefinitionV2["metadata"]["visualRole"]>;
};

export const CONSULTATION_STARTER_SPECS: readonly ConsultationStarterSpec[] = [
  {
    pageKey: "home",
    templateId: "hc_consult_home",
    sourceReference: `${CONSULTATION_STARTER_SOURCE_PREFIX}home`,
    name: "咨询首页图文",
    purpose: "首页主视觉与一句品牌介绍",
    visualRole: "primary-stage",
  },
  {
    pageKey: "products",
    templateId: "hc_consult_products",
    sourceReference: `${CONSULTATION_STARTER_SOURCE_PREFIX}products`,
    name: "咨询作品图文",
    purpose: "作品页介绍一张代表作",
    visualRole: "feature-stage",
  },
  {
    pageKey: "catalog",
    templateId: "hc_consult_catalog",
    sourceReference: `${CONSULTATION_STARTER_SOURCE_PREFIX}catalog`,
    name: "咨询目录图文",
    purpose: "目录页导览入口",
    visualRole: "feature-stage",
  },
  {
    pageKey: "custom",
    templateId: "hc_consult_custom",
    sourceReference: `${CONSULTATION_STARTER_SOURCE_PREFIX}custom`,
    name: "咨询定制图文",
    purpose: "定制页说明可预约沟通",
    visualRole: "feature-stage",
  },
  {
    pageKey: "about",
    templateId: "hc_consult_about",
    sourceReference: `${CONSULTATION_STARTER_SOURCE_PREFIX}about`,
    name: "咨询品牌图文",
    purpose: "关于页品牌介绍",
    visualRole: "support-stage",
  },
  {
    pageKey: "contact",
    templateId: "hc_consult_contact",
    sourceReference: `${CONSULTATION_STARTER_SOURCE_PREFIX}contact`,
    name: "咨询联系图文",
    purpose: "联系页预约入口",
    visualRole: "support-stage",
  },
] as const;

function rules(display: "block" | "flex" = "block"): TemplateDefinitionV2["nodes"][string]["responsive"]["desktop"] {
  return {
    display,
    ...(display === "flex" ? { direction: "column" as const } : {}),
    order: 0,
    width: "fill",
    height: { mode: "auto" },
  };
}

export function buildConsultationStarterDefinition(spec: ConsultationStarterSpec): TemplateDefinitionV2 {
  const base = definitionFixture();
  return {
    ...base,
    templateId: spec.templateId,
    name: spec.name,
    description: "咨询站页面装修起步模板：结构与槽位已就绪，默认内容为空，由页面填写图片和文案。",
    metadata: {
      ...base.metadata,
      category: "咨询内容",
      purpose: spec.purpose,
      layoutType: "图文纵向",
      slotSummary: "图片、标题、正文",
      recommendedFor: [spec.pageKey],
      tags: ["consultation-starter", spec.pageKey],
      visualRole: spec.visualRole,
    },
    nodes: {
      node_root: {
        ...base.nodes.node_root,
        childIds: ["node_container"],
      },
      node_container: {
        ...base.nodes.node_container,
        childIds: ["node_image", "node_heading", "node_body"],
        responsive: { desktop: rules("flex"), mobile: rules("flex") },
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
          spacing: true,
          minWidthPercent: 25,
          maxWidthPercent: 150,
          maxOffsetPercent: 30,
          minFontSizePx: 12,
          maxFontSizePx: 96,
          maxSpacingPx: 120,
        },
        responsive: {
          desktop: { ...rules(), order: 1 },
          mobile: { ...rules(), order: 1 },
        },
        hidden: false,
      },
      node_heading: {
        ...base.nodes.node_heading,
        responsive: {
          desktop: { ...rules(), order: 2 },
          mobile: { ...rules(), order: 2 },
        },
      },
      node_body: {
        nodeId: "node_body",
        type: "TextSlot",
        name: "正文",
        slotId: "slot_body",
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
        responsive: {
          desktop: { ...rules(), order: 3 },
          mobile: { ...rules(), order: 3 },
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
        emptyPolicy: "hide",
        validation: {},
        desktopRules: {},
        mobileRules: {},
      },
      slot_heading: {
        ...base.slots.slot_heading,
        emptyPolicy: "hide",
      },
      slot_body: {
        slotId: "slot_body",
        key: "body",
        type: "text",
        label: "正文",
        required: false,
        editable: true,
        hideable: true,
        emptyPolicy: "hide",
        validation: { maxLength: 240 },
        desktopRules: { fontRole: "body", maxLines: 6 },
        mobileRules: { fontRole: "body", maxLines: 8 },
      },
    },
    defaultContent: {},
  };
}

export function consultationStarterDefinitions(): TemplateDefinitionV2[] {
  return CONSULTATION_STARTER_SPECS.map(buildConsultationStarterDefinition);
}
