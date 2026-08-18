/**
 * schema/modules/storeInfo.ts — 「门店信息」编辑区 Schema。
 * Editorial Split 母版(信息变体):3:2 门店空间图 + 极简到访信息。
 */
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { storeInfoPuckConfig } from "../../../adapters/storeInfo.puck";
import { bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

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
          key: "storeName",
          label: "门店名称",
          control: "text",
          required: true,
          maxLength: 24,
          placeholder: "如 海川珠宝",
        },
        { key: "address", label: "地址", control: "text" },
        { key: "hours", label: "营业时间", control: "text" },
      ],
    },
    {
      id: "store-info-contact",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        { key: "phone", label: "联系电话", control: "text" },
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
      description: "门店空间图 3:2；手机转为 4:5",
      fields: [
        {
          key: "image",
          label: "门店空间图",
          control: "media",
          spec: IMAGE_SPECS.storeInfo.image,
          placeholder: "上传门店空间图（3:2）",
          showSpecCheck: true,
        },
      ],
    },
    {
      id: "store-info-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
