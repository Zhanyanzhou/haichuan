---
name: figma-design-to-code
description: "**MANDATORY prerequisite** — you MUST invoke this skill BEFORE calling the `get_design_context` Figma MCP tool. You MUST trigger this skill whenever the user wants to implement, build, port, or code up a Figma design as code. Example prompts (not exhaustive) are 'implement this Figma design', 'build this screen from Figma', 'turn this Figma into code', 'design to code'. This skill provides critical instructions and steps to the agent on how to correctly implement Figma designs in code and must NOT be skipped."
---

# 将 Figma 设计实现为代码（Design → Code）

> 方向：从 Figma **读取**设计（read-FROM-Figma），用 `get_design_context` 拉取设计上下文，再适配到目标项目技术栈。
> 反向（从代码在 Figma 里建设计）用 `figma-generate-design`，不属于本技能。
> 调用 `get_design_context` 时，必须在 `skillNames` 参数中以逗号分隔带上 `figma-design-to-code`；若本技能通过 MCP 资源加载，则前缀 `resource:`（即 `resource:figma-design-to-code`）。该参数仅用于日志统计，不影响执行。

## 方向与范围

- 设计转代码（实现 / 翻译 / 移植 Figma 节点为代码）必须使用本技能。
- 禁止用本技能向 Figma 写入内容。

## 工作流

### 1. 先调用 get_design_context

- 写任何代码前，必须先对目标节点调用 `get_design_context`。它是主工具：一次调用返回参考代码、截图和上下文提示。
- 不得用 `get_metadata` 或 `get_screenshot` 替代；它们只用于定位（选节点）或校验，不能代替 `get_design_context`。

### 2. 把输出当作参考，而非最终代码

- 返回的代码是 React + Tailwind，并带提示；必须视为**参考**，而非直接粘贴。
- 必须适配目标项目的语言、框架、组件库、样式体系与约定，与周边代码保持一致。

### 3. 复用项目已有资产

- 写新代码前，先检查目标项目里是否有匹配设计意图的现有组件、布局模式和设计 token。
- 必须复用项目现有组件与 token，而不是从零再造等价物。

### 4. 按优先级采纳响应提示

按以下顺序采纳（靠前的覆盖靠后的）：

1. **Code Connect 片段** → 直接使用映射到的代码库组件。
2. **组件文档链接** → 按其用法与规范执行。
3. **设计注解** → 遵循设计师备注或约束。
4. **设计 token（CSS 变量）** → 映射到项目 token 体系。
5. **原始 hex / 绝对定位** → 结构松散；以截图为意图依据。

### 5. 忠实还原图片与图标

- 图片/图标以 `<img>` 返回，`src` 是远程资源 URL（`https://.../api/mcp/asset/...`）。
- 渲染每个导出的图标/图片资源；不要手写或内联 `<svg>/<path>`，不要自创图标文件，不要丢弃图标或留占位——没有真实矢量数据时手绘必然错误。
- 资源来源：URL 可直接当 `src` 渲染，但约 7 天过期；要提交的代码需下载并提交真实资源字节，或把动态内容图接到项目数据源（API / CDN / props）。绝不用自己手写的文件。
- 仅当项目已有图标组件的字形明显匹配时才复用（仅名字匹配不够）；否则用导出资源。
- 明确尺寸：固定尺寸容器（图标通常正方形，如 `size-[24px]`、`overflow-clip`），宽高都设；叶子 `<img>` 填充容器（`100%` 或固定 px）——绝不用 `auto`，否则会撑到原始尺寸。

## 错误恢复

- `get_design_context` 报错时，先停下读错误信息再重试。
- 设计 URL 无 `node-id`（仅文件 URL）时，向用户索要节点级 URL——不得猜测或传空 `nodeId`。
- 超时则对更小的节点或选区重试。
- 当 `get_design_context` 仍能提供上下文时，不得仅凭截图静默降级为手写整屏。

## 海川项目适配

- 目标技术栈：React 18 + TypeScript + Tailwind CSS 3 + Ant Design 5 + zustand + framer-motion；后台页面编辑器用 Puck（`@puckeditor/core`）。
- 视觉规范：前台页面同时加载 `.agents/skills/luxury-visual/SKILL.md`（奢侈珠宝视觉基线）与 `.agents/skills/taste-skill/SKILL.md`（前台视觉审查）；管理后台仅参考信息层级 / 对比度 / 响应式 / 无障碍。
- 路径别名：`@/` = `client/src/`。
- 遵守 `AGENTS.md` 全部规则；不确定时先询问，不猜测。
