# CLAUDE.md

> Claude Code 专属适配入口。公共规则以 `AGENTS.md`、`PROJECT_RULES.md`、`WORKFLOW.md`、`docs/PROJECT_GUARDRAILS.md` 和 `docs/AI_COLLABORATION_STANDARD.md` 为准；本文件不重复项目规则。
> VS Code Copilot 专属适配见 `.github/copilot-instructions.md`。
> 项目知识文档见 `docs/` 目录。

---

## 基础

- 开始任务先遵守 `AGENTS.md`，再阅读 `PROJECT_RULES.md` 与 `WORKFLOW.md`；按任务读取 `docs/DECISIONS.md` 的相关部分和必要 `docs/`
- 不访问项目目录外文件；不得预授权或执行 Git 写入、项目外路径读取、环境/密钥操作

## 工具与模型边界

- 本文件不规定模型供应商、模型版本或 API Key；这些属于用户级配置和敏感信息，不得读取、输出或写入仓库。
- `.mcp.json` 仅描述 Claude Code 的项目级 MCP；其包版本、启动参数或服务清单的修改均属于工具供应链变更，必须先获批准。
- 可使用当前环境确实可用的技能、MCP 或子代理；名称或能力不一致时说明限制并遵循共同规则，不得假定与 Codex 或 VS Code 的工具面相同。

## Token 成本纪律

- 任务闭环即 `/clear`；同一会话出现第 3 个不相关任务即拆新会话
- 批量读文件、全仓搜索、连续快照/截图交子代理，主对话只收摘要；浏览器优先 `evaluate_script` 取值
- 预计超 5 分钟的命令后台执行（缓存 TTL≈5 分钟，过期后前缀全价重写）
- 日常用 haiku 档、复杂任务才升 sonnet/opus；用户问 token 成本时按 `.agents/skills/token-discipline/` 诊断
- 状态栏以 200K 预算显示水位（如 `140K/200K`）：≥60% 收尾当前任务、≥80% 红线开新会话；上下文到 200K 会自动压缩（`autoCompactWindow`，属正常行为不是故障）；连续快照或水位过高时 hook 会自动注入节制提醒

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
- 重大问题论证/法庭审校 → `.agents/skills/critical-review/SKILL.md` + `docs/AI_COLLABORATION_STANDARD.md` 第 13 节

> 按需读取，不要一次把所有 docs 加入上下文。

## 项目路径

- `@/` = `client/src/`
- 当前工作目录：`G:\网站搭建2`
