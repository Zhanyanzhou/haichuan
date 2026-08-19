/**
 * designSystem/index.ts — Canvas Design System 汇出。
 *
 * tokens(宽度/比例/留白/排版/配色) + masters(12 母版注册表)
 * + sectionShell(DecorSection 外壳)。
 *
 * rhythm.ts(页面节奏提示引擎)已于 2026-08-18 退役:上线两周零 UI 消费。
 * 其承接方案"六页叙事配方+图层栏完成度提示"亦于同日稍后经用户决策整体退役
 * (config/pageRecipes.ts 已删,两级页面引导入口先后拆除);
 * "相邻同母版构图重复"规则随 git 历史保留,若评审需要可再提取。
 */
export * from "./tokens";
export * from "./masters";
export * from "./sectionShell";
