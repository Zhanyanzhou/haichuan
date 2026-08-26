/**
 * schema/modules/carousel.ts — 「轮播图(轮播)」编辑区 Schema。
 * Commerce Campaign 母版:仅电商/活动页使用;条目级双端图。
 */
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { getContractRoleQuantity } from "../../../config/blockContracts";
import { carouselPuckConfig } from "../../../adapters/carousel.puck";
import type { ModuleInspectorSchema } from "../types";

export const carouselSchema: ModuleInspectorSchema = {
  moduleType: "轮播图",
  displayName: "轮播",
  purpose: "同时展示多个系列或活动主视觉；品牌叙事页不建议使用轮播。",
  defaults: { ...carouselPuckConfig.defaultProps },
  groupTitles: { media: "轮播图片" },
  sections: [
    {
      id: "carousel-media",
      title: "图片素材",
      layer: "media",
      fields: [
        {
          key: "images",
          label: "轮播图片",
          control: "array",
          itemLabel: "图片",
          minItems: getContractRoleQuantity("carousel", "frames").min,
          maxItems: getContractRoleQuantity("carousel", "frames").max,
          itemSummary: (item) =>
            typeof item.alt === "string" && item.alt.trim()
              ? item.alt
              : "未命名图片",
          itemFields: [
            {
              key: "url",
              label: "桌面端图片",
              control: "media",
              spec: IMAGE_SPECS.carousel.image,
              required: true,
              device: "desktop",
              placeholder: "上传桌面端轮播图",
              showSpecCheck: true,
            },
            {
              key: "mobileUrl",
              label: "手机端图片",
              control: "media",
              spec: IMAGE_SPECS.carousel.mobile,
              device: "mobile",
              placeholder: "上传手机端轮播图",
              showSpecCheck: true,
            },
            { key: "alt", label: "替代文字", control: "text", required: true },
            {
              key: "linkTarget",
              label: "跳转链接",
              control: "linkTarget",
              compact: true,
            },
          ],
        },
      ],
    },
    {
      id: "carousel-advanced",
      title: "模板专属功能",
      layer: "feature",
      fields: [
        { key: "autoPlay", label: "自动播放", control: "switch" },
        { key: "showDots", label: "指示点", control: "switch" },
        { key: "showArrows", label: "左右箭头", control: "switch" },
        {
          key: "interval",
          label: "切换间隔",
          control: "segmented",
          // 值域沿用历史毫秒字符串,持久化零迁移;渲染端 Number() 兜底
          options: [
            { label: "3 秒", value: "3000" },
            { label: "4 秒", value: "4000" },
            { label: "6 秒", value: "6000" },
            { label: "8 秒", value: "8000" },
          ],
        },
      ],
    },
  ],
};
