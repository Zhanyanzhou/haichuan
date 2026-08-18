---
name: vercel-react-best-practices
description: 海川项目的 React 性能审查适配层，基于 Vercel React/Next.js 规则库。仅在有性能目标或性能证据的 React 编写、审查、重构、数据请求、渲染和包体优化任务中使用；必须先读取当前 client/package.json、tsconfig、Vite 配置与已安装依赖，排除 Next.js、React 新版本、未安装依赖及当前编译目标不支持的规则。普通文案、样式和无性能诉求的小组件修改不触发。
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# 海川 React 性能适配层

本目录保留 Vercel 的通用规则库作为参考，但项目适用性由本入口裁定。上游示例不是海川项目的默认架构、依赖或升级授权。

## 1. 强制预检

开始前读取：

- `client/package.json`：React、路由、Puck、构建工具和实际依赖。
- `client/tsconfig.json`：`target` 与 `lib`。
- `client/vite.config.*`、入口和目标组件：确认是 Vite 客户端应用还是其他渲染模式。
- 当前性能证据：浏览器 Performance、React Profiler、包分析、Web Vitals、请求瀑布或可复现卡顿。

没有性能证据时，只做低风险的明显修正，不发起大范围“最佳实践重构”。

## 2. 海川项目硬门禁

除非当前代码和依赖明确支持，否则不得应用：

- Next.js、RSC、SSR、Server Action、`next/dynamic`、`after()` 与 Next API Route 规则。
- 当前 React 主版本未提供的 `<Activity>`、`useEffectEvent`、资源提示等 API。
- SWR、`better-all`、`lru-cache` 或其他未安装依赖；安装或升级依赖必须先获批准。
- 当前 TypeScript `target/lib` 不支持的 `toSorted()` 等 API。
- 违反当前 CSP 的内联脚本或以 `suppressHydrationWarning` 掩盖真实错误的方案。
- 将 NestJS 服务端问题套用 React/Next 服务端缓存规则。

## 3. 优先采用的兼容规则

按证据选择，不全量套用：

- 独立请求并行、延迟不需要的等待、先做廉价条件判断。
- 避免无意引入大包；使用 Vite/React 可用的动态 `import()`，不使用 `next/dynamic`。
- 去重全局事件监听，滚动监听按需使用 passive，给本地存储数据加版本。
- 消除可证明的重复计算和无效渲染；优先派生状态、函数式更新、稳定依赖和必要的懒初始化。
- 长列表在验证浏览器兼容与可访问性后使用虚拟化或 `content-visibility`。
- 重复查找使用 `Map`/`Set`，但不为小数据制造抽象和缓存一致性问题。
- 不可变排序在当前编译目标不支持 `toSorted()` 时使用复制后排序。

## 4. 海川场景边界

- Puck 编辑器：先保证拖入、选择、编辑、保存、重载和前台渲染语义一致，再优化渲染；不得用 memo 掩盖状态不同步。
- 品牌前台：性能优化不得降低图片清晰度、文字可读性、键盘可用性或破坏 `docs/UI_GUIDE.md` 的品牌节奏。
- 管理后台：优先表格、筛选、表单和状态反馈的响应速度，不加载奢侈品摄影或展示型动效规则。
- 数据请求：沿用现有服务层、鉴权和错误状态；不得为减少请求绕过权限、缓存用户敏感数据或创建第二套数据来源。

## 5. 实施与验证

1. 写明性能问题、基线和目标，不把个人偏好称为优化。
2. 读取最相关的 `rules/*.md`；遇到门禁项立即停用该条，不机械照抄示例。
3. 采用最小改动，保持类型、业务状态、错误处理和可访问性。
4. 运行与改动相称的类型检查、测试和构建。
5. 用同一场景复测性能；只有构建通过而没有性能复测时，交付为「代码验证通过，性能收益未验证」。
6. 报告前后指标、功能回归、未验证项和依赖/兼容风险。

## 6. 规则库路由

只读取与已确认问题对应的规则，例如：

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
rules/rerender-derived-state-no-effect.md
```

不要把本目录内汇总文件 `AGENTS.md` 当成项目根规则；项目治理只认仓库根 `AGENTS.md`、`PROJECT_RULES.md` 与 `WORKFLOW.md`。
