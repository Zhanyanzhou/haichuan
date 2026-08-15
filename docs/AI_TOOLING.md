# 海川珠宝 — AI 工具与模型分工（AI_TOOLING）

> 本文档记录本项目使用的三个 AI 工具的模型、配置位置与分工约定。
> 它不是安全/技术硬规则（那些见 `AGENTS.md`、`PROJECT_RULES.md`、`docs/PROJECT_GUARDRAILS.md`、`docs/AI_COLLABORATION_STANDARD.md`），而是"配置现状 + 使用建议"，帮助任何 AI 快速了解配置全貌、避免重复配置或不一致。
> 最近核对：2026-08-15

## 1. 三个 AI 工具与模型

| 工具 | 底层模型 | 定位 | 工具面策略 |
| --- | --- | --- | --- |
| VS Code Copilot | DeepSeek | 编辑器内快速问答、补全、小改动 | 适中（5 个 MCP） |
| Claude Code | 智谱 GLM-5.2（ccswitch 切换） | 日常编码、轻量工具链 | 精简（2 个 MCP） |
| Codex（正版） | OpenAI | 复杂重构、多文件编辑、git/CI 执行 | 全配（3 个 MCP） |

分工原则：**按模型能力定工具面**——强模型（Codex）放开，中模型（DeepSeek）适中，弱模型（GLM）精简。GLM 的工具调用与多步 agent 能力弱于前两者，故 Claude Code 的 MCP 收敛为 2 个、子代理执行质量有限，复杂任务建议交给 Codex。

## 2. 各工具配置位置

### Copilot（DeepSeek）
- 指令：`.github/copilot-instructions.md`（Copilot 适配）+ `AGENTS.md` + `PROJECT_RULES.md` + `WORKFLOW.md`（三工具共用）
- 技能：`.agents/skills/`（4 个，唯一权威；`.github/skills/` 已废弃删除）
- MCP：`.vscode/mcp.json`（5 个：github / playwright / chrome-devtools / context7 / prisma）
- 提示词模板：`.github/prompts/`（developer / planner / project-manager / reviewer）

### Claude Code（智谱 GLM-5.2）
- 指令：`CLAUDE.md`（Claude Code 适配）+ `AGENTS.md` + `PROJECT_RULES.md` + `WORKFLOW.md`
- 技能：`.claude/skills/`（符号链接 → `.agents/skills/`，4 个，不入库、自动同步）
- 子代理：`.claude/agents/`（code-reviewer / contract-verifier / frontend-visual-reviewer，入库共享）
- MCP：`.mcp.json`（2 个：playwright / context7）
- 权限白名单：`.claude/settings.local.json`

### Codex（正版 OpenAI）
- 指令：`AGENTS.md` + `PROJECT_RULES.md` + `WORKFLOW.md`
- MCP：`.codex/config.toml`（3 个：playwright / chrome-devtools / context7）
- 说明：Codex 无独立的技能/子代理目录机制，靠 `AGENTS.md` 与 MCP；git 写操作由 Codex 执行（见交接实践）。

## 3. 配置维护约定（防止不一致）

1. **技能单一来源**：技能只维护 `.agents/skills/` 一份（入库）；`.claude/skills/` 通过符号链接指向它（不入库、自动同步）。修改或新增技能只需改 `.agents/skills/`。
2. **MCP 三处独立、格式不同、禁止互相复制**：
   - Copilot：`.vscode/mcp.json` → `{ "servers": { name: { type, command, args } } }`
   - Claude Code：`.mcp.json` → `{ "mcpServers": { name: { type, command, args } } }`
   - Codex：`.codex/config.toml` → `[mcp_servers.name]` + `command` / `args`
3. **MCP 数量按模型能力**：给弱模型（GLM）加 MCP 前先考虑工具面是否过大；强模型（Codex）可放开。

## 4. 已知坑（配置时注意）

- Windows 上 stdio MCP 需 `cmd /c` 包装（Claude Code 与 Codex 已用此格式），否则 `npx` 无法直接 spawn。
- 项目 Prisma 5.8 的 CLI 无内置 `mcp` 子命令（需 7.x），故不为任何工具配 prisma MCP；数据库 schema 查询直接读 `server/prisma/schema.prisma` 文件。
- Claude Code 供应商由 ccswitch 切换，只影响全局（`~/.claude.json` 等），不影响项目级 `.mcp.json`、`.claude/`、`.codex/`。
- 本机 PowerShell 的 PATH 无 `codex` 命令（用户另行启动），无法用 `codex mcp list` 做端到端验证。
