# CLAUDE.md

> Claude Code 专属适配入口。权限只认 `AGENTS.md`，执行流程只认 `WORKFLOW.md`；本文件不复制公共规则。
> 最近核对：2026-08-30（同步本地 Git worktree 工作区边界）。

---

## 执行入口

- 按 `AGENTS.md` 与 `WORKFLOW.md` 最小启动；只读取当前任务需要的技术规则与文档。
- 常规检出目录为 `G:\网站搭建2`；平台提供本项目的本地 Git worktree 时，以当前工作目录和 Git 顶层目录为准。路径别名 `@/` = `client/src/`；项目外路径、Git 写入、环境和密钥操作仍按 `AGENTS.md` 审批。

## 工具与模型边界

- 本文件不规定模型供应商、模型版本或 API Key；这些属于用户级配置和敏感信息，不得读取、输出或写入仓库。
- `.mcp.json` 仅描述 Claude Code 的项目级 MCP；其包版本、启动参数或服务清单的修改均属于工具供应链变更，必须先获批准。
- 只使用当前环境实际提供且本任务需要的技能、MCP 或子代理；不得假定与 Codex 或 VS Code 的工具面相同。

## Token 成本纪律

- 项目 `.claude/settings.json` 的 `autoCompactWindow: 120000`、状态栏和 Token Hook 只适用于 Claude Code：80K 进入阶段收尾区，120K 作为新开会话红线，并作为运行时计算自动压缩阈值的窗口；这些数值不是跨工具规则。
- 历史观测的约 5 分钟缓存时长属于当前 Claude/代理链路经验，不是跨供应商承诺；长命令优先后台运行，并以实际 cache/usage 记录判断成本。
- 浏览器优先精确脚本和局部查询；大读取、日志、快照和截图写入项目产物文件，只向主会话返回摘要与异常。
- 模型路由以当前用户级配置、任务成功率和账单为准，不在仓库硬编码供应商档位映射。
- 用户询问成本或用量异常时，使用 `.agents/skills/token-discipline/SKILL.md`，先查 billing、usage、cache 和工具调用再归因。
