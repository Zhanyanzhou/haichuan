import {
  CRAFT_DETAILS_CONTRACT,
  evaluateCraftDetailsContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { craftDetailsPuckConfig } from "../../../adapters/craftDetails.puck";
import {
  ADVANCED_BG_COLOR_FIELD,
  bgColorPresetField,
  moduleNameField,
  ratioField,
} from "../shared";
import type { ModuleInspectorSchema } from "../types";

const ratioControls = [
  ratioField("craftDetails", "leadImage", { key: "leadImageRatio", label: "主图比例" }),
  ratioField("craftDetails", "detailImageOne", { key: "detailOneRatio", label: "细节图一比例" }),
  ratioField("craftDetails", "detailImageTwo", { key: "detailTwoRatio", label: "细节图二比例" }),
].flatMap((control) => (control ? [control] : []));

export const craftDetailsSchema: ModuleInspectorSchema = {
  moduleType: "工艺细节",
  displayName: "工艺细节",
  purpose: CRAFT_DETAILS_CONTRACT.purpose,
  evaluate: evaluateCraftDetailsContract,
  defaults: { ...craftDetailsPuckConfig.defaultProps },
  groupTitles: { media: "工艺图片" },
  sections: [
    {
      id: "craft-details-media",
      title: "媒体",
      layer: "media",
      description: "主图建立一个视觉焦点，两张细节图补充材质与制作观察；三张图均需填写事实性替代文字。",
      fields: [
        { key: "leadImage", label: "工艺主图", control: "media", spec: IMAGE_SPECS.craftDetails.lead, required: true, focusKeys: { x: "leadFocusX", y: "leadFocusY" }, placeholder: "上传横向主图", showSpecCheck: true },
        { key: "leadAltText", label: "主图替代文字", control: "text", required: true, maxLength: CRAFT_DETAILS_CONTRACT.content.limits.leadAltText },
        { key: "detailImageOne", label: "细节图一", control: "media", spec: IMAGE_SPECS.craftDetails.detailOne, required: true, focusKeys: { x: "detailOneFocusX", y: "detailOneFocusY" }, placeholder: "上传细节图", showSpecCheck: true },
        { key: "detailOneAltText", label: "细节图一替代文字", control: "text", required: true, maxLength: CRAFT_DETAILS_CONTRACT.content.limits.detailOneAltText },
        { key: "detailImageTwo", label: "细节图二", control: "media", spec: IMAGE_SPECS.craftDetails.detailTwo, required: true, focusKeys: { x: "detailTwoFocusX", y: "detailTwoFocusY" }, placeholder: "上传细节图", showSpecCheck: true },
        { key: "detailTwoAltText", label: "细节图二替代文字", control: "text", required: true, maxLength: CRAFT_DETAILS_CONTRACT.content.limits.detailTwoAltText },
      ],
    },
    {
      id: "craft-details-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("工艺细节"),
        { key: "eyebrow", label: "章节标签", control: "text", maxLength: CRAFT_DETAILS_CONTRACT.content.limits.eyebrow, hint: "如 CRAFT STUDY，留空不显示" },
        { key: "title", label: "标题", control: "text", required: true, maxLength: CRAFT_DETAILS_CONTRACT.content.limits.title, placeholder: "如 结构与光" },
        { key: "body", label: "说明", control: "textarea", rows: 3, maxLength: CRAFT_DETAILS_CONTRACT.content.limits.body, hint: "只填写已经核验的材质、结构或工艺事实" },
      ],
    },
    ...(ratioControls.length > 0 ? [{ id: "craft-details-layout", title: "布局", layer: "layout" as const, fields: ratioControls }] : []),
    {
      id: "craft-details-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField(), ADVANCED_BG_COLOR_FIELD],
    },
  ],
};
