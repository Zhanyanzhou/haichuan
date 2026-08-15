# CLAUDE.md

> Claude Code 专属适配入口。公共规则以 `AGENTS.md`、`docs/PROJECT_GUARDRAILS.md` 和 `docs/AI_COLLABORATION_STANDARD.md` 为准；本文件不重复项目规则。
> VS Code Copilot 专属适配见 `.github/copilot-instructions.md`。
> 项目知识文档见 `docs/` 目录。

---

## 基础

- 依次遵守 `AGENTS.md`、`docs/PROJECT_GUARDRAILS.md`、`docs/AI_COLLABORATION_STANDARD.md`
- 不确定时先询问，不猜测
- 当前相关代码、类型、配置和工作区变更优先于可能过期的项目事实文档；发现冲突时报告，不得自行裁决
- 不访问项目目录外文件；不得预授权或执行 Git 写入、项目外路径读取、环境/密钥操作

## 按任务读取 docs

- 项目概况/技术栈 → `docs/PROJECT.md`
- 当前实现状态 → `docs/CURRENT_STATE.md`
- 系统架构 → `docs/ARCHITECTURE.md`
- 服务端模块 → `docs/MODULES.md`
- 公共组件 → `docs/COMPONENTS.md`
- API/数据库 → `docs/DATA_AND_API.md`
- 设计/样式 → `docs/UI_GUIDE.md`
- 技术决策 → `docs/DECISIONS.md`
- 开发流程 → `docs/DEVELOPMENT_WORKFLOW.md`
- AI 工具与模型分工 → `docs/AI_TOOLING.md`

> 按需读取，不要一次把所有 docs 加入上下文。

## 项目路径

- `@/` = `client/src/`
- 当前工作目录：`G:\网站搭建2`
