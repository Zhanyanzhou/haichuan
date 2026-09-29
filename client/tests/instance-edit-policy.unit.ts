import { expect, test } from "@playwright/test";
import {
  getEffectiveDynamicTemplateInstanceEditPolicy,
  isLayoutOverrideCapabilityEnabled,
} from "../src/page-builder/template-definition/instanceEditPolicy";
import { isTemplateInspectorInternalIdentityField } from "../src/page-builder/template-editor/templateInspectorCapabilities";
import type {
  DynamicTemplateNode,
  DynamicTemplateSlotDefinition,
} from "../src/page-builder/template-definition/generated/templateDefinition.generated";

function headingNode(policy?: DynamicTemplateNode["instanceEditPolicy"]): DynamicTemplateNode {
  return {
    nodeId: "node_heading",
    type: "HeadingSlot",
    name: "主标题",
    slotId: "slot_heading",
    childIds: [],
    props: {},
    hidden: false,
    responsive: {
      desktop: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
    },
    instanceEditPolicy: policy,
  };
}

function headingSlot(): DynamicTemplateSlotDefinition {
  return {
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
  };
}

function buttonSlot(): DynamicTemplateSlotDefinition {
  return {
    ...headingSlot(),
    slotId: "slot_cta",
    key: "cta",
    type: "button",
    label: "按钮",
  };
}

test("结构节点与未开放槽位没有构图策略", () => {
  const container: DynamicTemplateNode = {
    nodeId: "node_container",
    type: "Container",
    name: "容器",
    childIds: [],
    props: {},
    hidden: false,
    responsive: {
      desktop: { display: "flex", order: 0, width: "fill", height: { mode: "auto" } },
      mobile: { display: "flex", order: 0, width: "fill", height: { mode: "auto" } },
    },
  };
  expect(getEffectiveDynamicTemplateInstanceEditPolicy(container, headingSlot())).toBeNull();
  expect(getEffectiveDynamicTemplateInstanceEditPolicy(headingNode(), {
    ...headingSlot(),
    editable: false,
  })).toBeNull();
});

test("字号与间距只对文字槽生效，图片适配只对图片槽生效", () => {
  const policy = getEffectiveDynamicTemplateInstanceEditPolicy(headingNode({
    typography: true,
    spacing: true,
    imageFit: true,
    imageFocus: true,
  }), headingSlot());
  expect(policy).toBeTruthy();
  expect(isLayoutOverrideCapabilityEnabled(policy!, headingSlot(), "fontSizePx")).toBe(true);
  expect(isLayoutOverrideCapabilityEnabled(policy!, headingSlot(), "objectFit")).toBe(false);
  expect(isLayoutOverrideCapabilityEnabled(policy!, buttonSlot(), "fontSizePx")).toBe(false);
  expect(isLayoutOverrideCapabilityEnabled(policy!, buttonSlot(), "marginTopPx")).toBe(false);
});

test("日常属性入口不把内部标识当表单字段", () => {
  expect(isTemplateInspectorInternalIdentityField("nodeId")).toBe(true);
  expect(isTemplateInspectorInternalIdentityField("slot.slotId")).toBe(true);
  expect(isTemplateInspectorInternalIdentityField("schemaVersion")).toBe(true);
  expect(isTemplateInspectorInternalIdentityField("node.name")).toBe(false);
});
