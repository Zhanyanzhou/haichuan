/**
 * schema/registry.ts — 模块编辑区 Schema 注册表。
 *
 * 三级分派的第一级：InspectorPanel 先查本表，
 * 命中则渲染 SchemaInspectorPanel；未命中走既有专属面板 / Puck.Fields fallback。
 * P2 阶段注册表为空（全模块走原路径），自 P3「文字横幅」样板起逐个登记。
 */
import type { ModuleInspectorSchema } from "./types";
import { textBannerSchema } from "./modules/textBanner";
import { splitPanelSchema } from "./modules/splitPanel";
import { cardGridSchema, servicePromiseSchema } from "./modules/cardGrid";

export const MODULE_INSPECTOR_SCHEMAS: Record<
  string,
  ModuleInspectorSchema
> = {
  "文字横幅": textBannerSchema,
  "分割面板": splitPanelSchema,
  "卡片网格": cardGridSchema,
  "服务承诺": servicePromiseSchema,
};

export function getInspectorSchema(
  moduleType: string,
): ModuleInspectorSchema | undefined {
  return MODULE_INSPECTOR_SCHEMAS[moduleType];
}
