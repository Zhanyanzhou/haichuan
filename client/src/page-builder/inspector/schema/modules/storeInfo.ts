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
  purpose: "门店空间与统一到访信息；业务事实由「店铺资料」维护。",
  defaults: { ...storeInfoPuckConfig.defaultProps },
  sections: [
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
    {
      id: "store-info-content",
      title: "内容",
      layer: "content",
      description: "门店名称、地址、营业时间、电话和地图链接统一在「店铺资料」维护，此处不保存副本。",
      fields: [
        moduleNameField("门店信息"),
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
