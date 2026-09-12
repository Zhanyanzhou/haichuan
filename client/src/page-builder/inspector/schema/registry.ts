/** 当前 Puck Inspector 注册表：首屏测试模板与两个系统区块。 */
import { BLOCK_META } from "../../config/blockMeta";
import type { ModuleInspectorSchema } from "./types";
import { businessRegionSchema } from "./modules/businessRegion";
import { heroSchema } from "./modules/hero";
import { siteConfigSchema } from "./modules/siteConfig";

const MODULE_INSPECTOR_SCHEMA_SOURCE: Record<string, ModuleInspectorSchema> = {
  首屏主视觉: heroSchema,
  网站全局设置: siteConfigSchema,
  业务功能区: businessRegionSchema,
};

export const MODULE_INSPECTOR_SCHEMAS = Object.fromEntries(
  Object.entries(MODULE_INSPECTOR_SCHEMA_SOURCE).map(([moduleType, schema]) => [
    moduleType,
    { ...schema, displayName: BLOCK_META[moduleType]?.name ?? schema.displayName },
  ]),
) as Record<string, ModuleInspectorSchema>;

export function getInspectorSchema(moduleType: string): ModuleInspectorSchema | undefined {
  return MODULE_INSPECTOR_SCHEMAS[moduleType];
}
