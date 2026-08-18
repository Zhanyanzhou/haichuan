/**
 * pageRecipes.ts — 六页面叙事配方(2026-08-18 P2)。
 *
 * 「按既定配方排章节」的单一来源:每页 5-8 个现有模板的推荐序列,
 * 支撑运营不自己做版式决策,只选模板/传图/填文案/按配方排章节。
 * 依据:用户 2026-08-18 需求说明书各页叙事目的 + CONTENT_TEMPLATE_STANDARD §10.2。
 *
 * 定位是引导不是门禁:模板库其余分类不清失,推荐序列置顶展示;
 * 硬门禁(每页一个首屏等)属合同 pageRules(P3 范围外)。
 * 构图评审(P0-R)后如需调整某页节奏,只改本表。
 */
import type { EditorPageKey } from "./editorPages";
import { BLOCK_META } from "./blockMeta";

export type RecipeNecessity = "required" | "recommended" | "optional";

export interface PageRecipeSection {
  /** 叙事阶段:开篇/品牌叙事/系列引导/信任建立/行动入口 等 */
  phase: string;
  /** registry 模块类型名(与 BLOCK_META key 一致) */
  moduleType: string;
  necessity: RecipeNecessity;
  /** 一句话用途,写给运营看 */
  note: string;
}

export interface PageRecipe {
  /** 页面叙事目的一句话 */
  narrative: string;
  sections: PageRecipeSection[];
}

export const PAGE_RECIPES: Record<EditorPageKey, PageRecipe> = {
  home: {
    narrative: "品牌入口与引导:一屏建立品牌印象,引向系列、主打与预约。",
    sections: [
      { phase: "开篇", moduleType: "首屏主视觉", necessity: "required", note: "全站第一品牌印象,只能有一个" },
      { phase: "品牌叙事", moduleType: "单图海报", necessity: "recommended", note: "一张主图讲一个系列或宣言" },
      { phase: "系列引导", moduleType: "分类卡片", necessity: "recommended", note: "把访客带进感兴趣的系列" },
      { phase: "主打", moduleType: "单品焦点推荐", necessity: "recommended", note: "本季最重要的一件作品" },
      { phase: "场景", moduleType: "佩戴灵感", necessity: "optional", note: "佩戴场景唤起向往" },
      { phase: "信任", moduleType: "真实评价与实拍", necessity: "optional", note: "顾客证言与实拍" },
      { phase: "行动", moduleType: "预约入口", necessity: "required", note: "页面尾章,一个明确行动" },
    ],
  },
  about: {
    narrative: "品牌世界观与信任建立:讲故事、亮价值、给证据。",
    sections: [
      { phase: "开篇", moduleType: "首屏主视觉", necessity: "required", note: "以品牌影像开场" },
      { phase: "品牌叙事", moduleType: "文字横幅", necessity: "recommended", note: "一段品牌宣言或主张" },
      { phase: "价值", moduleType: "卡片网格", necessity: "recommended", note: "三至四条品牌价值" },
      { phase: "信任", moduleType: "资质证书", necessity: "recommended", note: "权威认证的视觉证据" },
      { phase: "信任", moduleType: "真实评价与实拍", necessity: "optional", note: "顾客视角的口碑" },
      { phase: "线下", moduleType: "门店信息", necessity: "recommended", note: "实体空间的信任落点" },
      { phase: "行动", moduleType: "预约入口", necessity: "required", note: "尾章引导到店或咨询" },
    ],
  },
  products: {
    narrative: "作品与系列的展陈:页头定调,引导到完整作品列表。",
    sections: [
      { phase: "开篇", moduleType: "首屏主视觉", necessity: "required", note: "系列氛围页头" },
      { phase: "系列引导", moduleType: "双图海报", necessity: "recommended", note: "主图+细节的组合引导" },
      { phase: "主打", moduleType: "单品焦点推荐", necessity: "recommended", note: "镇店之作先行" },
      { phase: "场景", moduleType: "佩戴灵感", necessity: "optional", note: "作品上身的样子" },
      { phase: "行动", moduleType: "预约入口", necessity: "optional", note: "列表之后的线下引导" },
    ],
  },
  catalog: {
    narrative: "帮助理解、筛选和进入选择的服务页:讲清楚怎么选。",
    sections: [
      { phase: "开篇", moduleType: "首屏主视觉", necessity: "required", note: "选款服务页头" },
      { phase: "指引", moduleType: "文字横幅", necessity: "recommended", note: "一句话说明怎么选" },
      { phase: "入口", moduleType: "分类卡片", necessity: "recommended", note: "按品类快速进入" },
      { phase: "入口", moduleType: "按场景选购", necessity: "recommended", note: "按送礼/佩戴场景进入" },
      { phase: "行动", moduleType: "预约入口", necessity: "optional", note: "选不动了就来咨询" },
    ],
  },
  custom: {
    narrative: "工艺、过程与私享服务的叙事:让人看见定制的旅程。",
    sections: [
      { phase: "开篇", moduleType: "首屏主视觉", necessity: "required", note: "定制服务页头" },
      { phase: "过程", moduleType: "定制流程", necessity: "required", note: "五步旅程讲清定制过程" },
      { phase: "案例", moduleType: "改款对比", necessity: "recommended", note: "改款前后的真实案例" },
      { phase: "代表作", moduleType: "单品焦点推荐", necessity: "recommended", note: "一件定制代表作" },
      { phase: "宣言", moduleType: "文字横幅", necessity: "optional", note: "服务承诺或匠人态度" },
      { phase: "行动", moduleType: "预约入口", necessity: "required", note: "定制从预约开始" },
    ],
  },
  contact: {
    narrative: "服务尾章与行动入口:消除疑虑,给出明确的到店/咨询路径。",
    sections: [
      { phase: "开篇", moduleType: "首屏主视觉", necessity: "required", note: "服务页头" },
      { phase: "指引", moduleType: "文字横幅", necessity: "recommended", note: "服务方式与响应时间" },
      { phase: "到店", moduleType: "门店信息", necessity: "recommended", note: "地址、空间与联系方式" },
      { phase: "承诺", moduleType: "服务承诺", necessity: "optional", note: "几条服务承诺" },
    ],
  },
};

export const RECIPE_NECESSITY_LABEL: Record<RecipeNecessity, string> = {
  required: "必需",
  recommended: "推荐",
  optional: "可选",
};

/* 开发期防漂移断言:配方引用的 moduleType 必须存在于 BLOCK_META,
 * 否则模板库推荐序列会被静默过滤缺项、图层栏提示永远判定"缺章节"。 */
if (import.meta.env.DEV) {
  const knownTypes = new Set(Object.keys(BLOCK_META));
  const drift = Object.values(PAGE_RECIPES).flatMap((recipe) =>
    recipe.sections
      .filter((section) => !knownTypes.has(section.moduleType))
      .map((section) => section.moduleType),
  );
  if (drift.length > 0) {
    throw new Error(
      `[pageRecipes] 引用了 BLOCK_META 不存在的模块类型: ${[...new Set(drift)].join("、")}`,
    );
  }
}
