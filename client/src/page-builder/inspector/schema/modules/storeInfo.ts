/**
 * schema/modules/storeInfo.ts — 「门店信息」编辑区 Schema。
 * Editorial Split 母版(信息变体):3:2 门店空间图 + 极简到访信息。
 */
import { IMAGE_SPECS, ratioLabelOf } from "../../../config/imageSpecs";
import { storeInfoPuckConfig } from "../../../adapters/storeInfo.puck";
import { ADVANCED_BG_COLOR_FIELD, bgColorPresetField, moduleNameField, ratioField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

/** 槽位比例选项(契约派生):门店空间横构图,移动端可选竖版近景 */
const storeInfoRatioControl = ratioField("storeInfo", "store", { key: "imageRatio", label: "门店图比例" });

export const storeInfoSchema: ModuleInspectorSchema = {
  moduleType: "门店信息",
  displayName: "门店信息",
  purpose: "门店空间、地址、营业时间与联系方式。",
  defaults: { ...storeInfoPuckConfig.defaultProps },
  sections: [
    {
      id: "store-info-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("门店信息"),
        {
          key: "useSiteSettings",
          label: "使用站点统一门店信息",
          control: "switch",
          hint: "开启后读取「站点内容」中的名称、地址、营业时间和电话，避免多页重复维护。",
        },
        {
          key: "storeName",
          label: "门店名称",
          control: "text",
          required: true,
          maxLength: 24,
          placeholder: "如 海川珠宝",
          visibleWhen: (ctx) => ctx.props.useSiteSettings === false,
        },
        { key: "address", label: "地址", control: "text", visibleWhen: (ctx) => ctx.props.useSiteSettings === false },
        { key: "hours", label: "营业时间", control: "text", visibleWhen: (ctx) => ctx.props.useSiteSettings === false },
      ],
    },
    {
      id: "store-info-contact",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        { key: "phone", label: "联系电话", control: "text", visibleWhen: (ctx) => ctx.props.useSiteSettings === false },
        {
          key: "mapUrl",
          label: "地图链接（可选）",
          control: "text",
          hint: "高德/百度地图分享链接",
        },
      ],
    },
    {
      id: "store-info-media",
      title: "媒体",
      layer: "media",
      description: `门店空间图 ${ratioLabelOf(IMAGE_SPECS.storeInfo.image)}；手机转为 ${ratioLabelOf(IMAGE_SPECS.storeInfo.mobile)}`,
      fields: [
        {
          key: "image",
          label: "门店空间图",
          control: "media",
          spec: IMAGE_SPECS.storeInfo.image,
          placeholder: "上传门店空间图",
          showSpecCheck: true,
        },
      ],
    },
    ...(storeInfoRatioControl ? [{
      id: "store-info-layout",
      title: "布局",
      layer: "layout" as const,
      fields: [storeInfoRatioControl],
    }] : []),
    {
      id: "store-info-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField(), ADVANCED_BG_COLOR_FIELD],
    },
  ],
};
