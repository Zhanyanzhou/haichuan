# 海川珠宝 · Copilot 适配

> VS Code 的支持该格式的智能体可读取本文件。公共规则以 `AGENTS.md`、`PROJECT_RULES.md`、`WORKFLOW.md`、`docs/PROJECT_GUARDRAILS.md` 和 `docs/AI_COLLABORATION_STANDARD.md` 为准；本文件仅定义 VS Code 适配。

---

## 语言

- 始终使用简体中文回答
- 代码保持英文规范，代码注释使用中文
- 英文技术术语格式：中文名称（English Name），禁止只输出英文

---

## 行为

- 严格遵守 `AGENTS.md` 全部规则
- 开始任务先阅读 `PROJECT_RULES.md` 与 `WORKFLOW.md`，再按任务读取 `docs/DECISIONS.md` 的相关部分和必要 `docs/`
- 先用简洁方案说明范围、影响文件和预期结果；用户明确要求实现且任务属于已授权的小范围修改时可直接实施
- 只读检查和已确认的验证命令无需逐项等待确认；高风险操作遵循 `AGENTS.md` 与协作标准的审批边界

## Token 成本纪律

- 任务闭环即开新会话（New Chat），不携带已完成的历史继续；同一会话第 3 个不相关任务即拆分
- 读取与引用精准化：目标文件、目标行段，不做全仓式检索或整文件读取
- 长命令后台执行或拆会话（提示缓存 TTL≈5 分钟）
- 上下文水位以 200K token 为预算：60% 起收尾、80% 红线开新会话；无水位显示时按任务闭环即清执行

## 工具与模型边界

- 本文件不假定当前 VS Code 智能体使用 GitHub Copilot、DeepSeek 或其他供应商；模型路由、扩展配置和 API Key 均属于用户级敏感配置，不得写入仓库。
- 仅使用当前会话真实提供的工具、技能和 MCP；若无法确认本智能体是否加载本文件、是否支持 MCP 或某项技能，必须说明限制，不得虚构可用能力。
- `.vscode/mcp.json` 的 MCP 包、版本、命令或启动参数属于工具供应链配置，修改前必须获得明确批准。

---

## 按任务读取 docs

| 任务类型          | 读取文件                       |
| ----------------- | ------------------------------ |
| 项目概况/技术栈   | `docs/PROJECT.md`              |
| 了解当前实现状态  | `docs/CURRENT_STATE.md`        |
| 系统架构/数据流   | `docs/ARCHITECTURE.md`         |
| 服务端模块        | `docs/MODULES.md`              |
| 公共组件          | `docs/COMPONENTS.md`           |
| API/数据库        | `docs/DATA_AND_API.md`         |
| 设计/样式         | `docs/UI_GUIDE.md`             |
| 技术决策          | `docs/DECISIONS.md`            |
| 开发流程          | `docs/DEVELOPMENT_WORKFLOW.md` |
| AI 工具与模型分工 | `docs/AI_TOOLING.md`           |
| 重大问题论证/法庭审校 | `critical-review` 技能 + `AI_COLLABORATION_STANDARD.md` 第 13 节 |

> 按需读取，不要一次把所有 docs 加入上下文。

---

## Skill 使用

- 编码类任务（编写、新增、重构、修复、审查代码或选择依赖库）→ `.agents/skills/ponytail/SKILL.md`
- 视觉/布局/响应式/交互任务 → `.agents/skills/taste-skill/SKILL.md`
- 管理后台只参考 Skill 中的信息层级、色彩对比度、响应式和无障碍部分
- 禁止对整个项目做全局视觉大改
- Skill 参考 `docs/UI_GUIDE.md` 的品牌规范

---

## 路径别名

- `@/` = `client/src/`
