# 海川珠宝 — 技术决策记录

> 最后更新：2026-08-07

## 1. 为什么用 Zustand 而非 Redux？

**决策**：Zustand 4。

**理由**：无 Provider、无 boilerplate、selector 模式避免不必要渲染、体积小(~2KB)。

## 2. 为什么两套首页内容块体系并存？

**现状**：

- 旧版 `blockComponents`（blocks/index.ts）：HeroBlock 等 6 个
- 新版 `MODULE_MAP`（Home/index.tsx）：HeroSection 等 4 个

**原因**：旧版是早期首页块，新版是为页面构建器设计的（iframe + postMessage）。旧版未被清理。

**建议**：确认后删除未使用的旧版 blocks。

## 3. 为什么用 Feature Flags？

**决策**：统一开关控制电商功能上线节奏。

**当前**：`commerceEnabled/cartEnabled/paymentEnabled = false`。代码已完成但关闭。

**风险**：关闭的功能从未在真实环境中验证。

## 4. Tailwind vs 内联样式？

**现状**：各占一半。旧组件 Tailwind，新组件内联样式。

**原因**：不同 AI 智能体/不同时期的产物。

**建议**：新代码优先 Tailwind。不强制重写已有代码。

## 5. 为什么 `(this.prisma as any)`？

**现状**：5 个 service 文件使用类型断言。

**原因**：schema 修改后未 `prisma generate`，类型不匹配，开发者临时绕过。

**修复**：运行 `npx prisma generate`，移除所有 `as any`。

## 6. 为什么页面构建器用 iframe + postMessage？

**决策**：iframe 内嵌 `/preview/home`，postMessage 通信。

**理由**：编辑器/预览完全隔离、所见即所得、支持多设备预览。

**消息**：`SET_EDITOR_MODE`, `PATCH_MODULE`, `CANVAS_READY`, `MODULE_HOVERED`, `MODULE_SELECTED`
