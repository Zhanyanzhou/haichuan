/**
 * schema/modules/cardGrid.ts — 「卡片网格」系编辑区 Schema 工厂。
 *
 * 变体共享同一结构（卡片网格=品牌要点、服务承诺），只差
 * displayName / purpose / defaults —— 与 puckConfig 的 spread 复用方式对齐：
 * fields 同源，defaultProps 各自定义。
 */
import {
  CARD_GRID_CONTRACT,
  evaluateCardGridContract,
} from "../../../config/blockContracts";
import { cardGridPuckConfig } from "../../../adapters/cardGrid.puck";
import { puckConfig } from "../../../config/puckConfig";
import type { ModuleInspectorSchema } from "../types";

interface CardGridSchemaVariant {
  moduleType: "卡片网格" | "服务承诺";
  displayName: string;
  purpose: string;
  /** 缺省时取 adapter defaultProps（卡片网格）；服务承诺取 puckConfig 注册的变体 defaults */
  defaults?: Record<string, any>;
}

export function makeCardGridSchema(
  variant: CardGridSchemaVariant,
): ModuleInspectorSchema {
  const defaults =
    variant.defaults ??
    puckConfig.components[variant.moduleType]?.defaultProps ??
    cardGridPuckConfig.defaultProps;
  return {
    moduleType: variant.moduleType,
    displayName: variant.displayName,
    purpose: variant.purpose,
    evaluate: evaluateCardGridContract,
    defaults: { ...defaults },
    groupTitles: { media: "卡片列表" },
    sections: [
      {
        id: `${variant.moduleType}-content`,
        title: "内容",
        layer: "content",
        fields: [
          {
            key: "moduleName",
            label: "图层名称",
            control: "text",
            maxLength: 24,
            hint: "仅用于页面结构识别",
          },
          {
            key: "title",
            label: "标题",
            control: "text",
            required: true,
            maxLength: CARD_GRID_CONTRACT.content.limits.title,
            placeholder: "区块主标题",
          },
          {
            key: "subtitle",
            label: "副标题",
            control: "text",
            maxLength: CARD_GRID_CONTRACT.content.limits.subtitle,
            hint: "留空不显示",
          },
        ],
      },
      {
        id: `${variant.moduleType}-media`,
        title: "素材",
        layer: "media",
        fields: [
          {
            key: "cards",
            label: "卡片列表",
            control: "array",
            itemLabel: "卡片",
            defaultItem: { icon: "", title: "", body: "" },
            itemSummary: (item) =>
              typeof item.title === "string" && item.title.trim()
                ? item.title
                : "未命名卡片",
            itemFields: [
              {
                key: "icon",
                label: "图标名",
                control: "text",
                maxLength: 24,
                hint: "留空不显示图标",
              },
              {
                key: "title",
                label: "卡片标题",
                control: "text",
                required: true,
                maxLength: CARD_GRID_CONTRACT.content.limits.cardTitle,
              },
              {
                key: "body",
                label: "卡片正文",
                control: "textarea",
                rows: 2,
                maxLength: CARD_GRID_CONTRACT.content.limits.cardBody,
              },
            ],
          },
        ],
      },
      {
        id: `${variant.moduleType}-layout`,
        title: "布局",
        layer: "layout",
        fields: [
          {
            key: "layout",
            label: "列数",
            control: "segmented",
            options: [
              { label: "2 列", value: "grid-2" },
              { label: "3 列", value: "grid-3" },
              { label: "4 列", value: "grid-4" },
            ],
          },
        ],
      },
      {
        id: `${variant.moduleType}-style`,
        title: "样式",
        layer: "style",
        fields: [
          {
            key: "bgColor",
            label: "背景色",
            control: "color",
          },
        ],
      },
    ],
  };
}

/** 卡片网格（品牌要点） */
export const cardGridSchema = makeCardGridSchema({
  moduleType: "卡片网格",
  displayName: "品牌要点",
  purpose: CARD_GRID_CONTRACT.purpose,
});

/** 服务承诺（卡片网格变体：默认四项服务信息卡片） */
export const servicePromiseSchema = makeCardGridSchema({
  moduleType: "服务承诺",
  displayName: "服务承诺",
  purpose: "集中呈现保养、售后、配送与鉴定等服务信息",
  defaults: puckConfig.components["服务承诺"]?.defaultProps,
});
