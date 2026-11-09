# 海川珠宝 — AI 工具与协作配置（AI_TOOLING）

> 本文档记录项目级 AI 工具入口、已发现的 MCP 配置和协作职责。它不是安全或技术硬规则：安全与审批见 `AGENTS.md`，技术实现见 `PROJECT_RULES.md`，执行、验证与交付见 `WORKFLOW.md`，共享工作区协作见 `docs/AI_COLLABORATION_STANDARD.md`。
>
> 最近实际核对：2026-09-14（收敛 MCP 维护审批、固定版本回退与 Node 验证基线；既有 MCP 真实挂载仍须按当前会话重验）。2026-10-10 只补充第 0 节的给人看的操作顺序，没有重新核验 MCP。模型供应商、模型版本、API Key、用户级扩展和用户级权限不在本仓库内，本文件不把它们写成已验证事实。

## 0. 给人看的操作顺序

本节只帮助不熟悉实现的人写清一次任务。它不增加权限，也不覆盖 `AGENTS.md`、`PROJECT_RULES.md` 或 `WORKFLOW.md`。产品要做成什么样看对应合同；现在做到哪一步只看 `docs/CURRENT_STATE.md`。代码还没达到合同，不能反过来把合同改弱。

一次只交一个能看出来的结果，按这个顺序写：

1. 说结果：谁在哪个页面上应该看到什么。
2. 说边界：不要新建第二套页面模型；不要改公共 Schema、不要写真实数据库、不要发布，除非这次明确允许。
3. 说对照：先读 `AGENTS.md`、`WORKFLOW.md` 和这次相关文档，并保护未提交修改。
4. 说验收：涉及客户前台视觉、交互或响应式的改动，必须在浏览器里核对受影响的真实桌面和手机页面。按 [WORKFLOW 第 5 节](../WORKFLOW.md#5-风险分级验证) 补做相关代码、合同和状态检查。项目完成证据用 Node 22。
5. 看回报：分开看改了什么、验证通过了什么、没验证什么。构建通过不等于页面已发布。

可直接粘贴：

```text
在 G:\海川珠宝官方网站开发 现有项目上做这件事，不要重建，不要第二套 CMS 或 Renderer。
先读 AGENTS.md、WORKFLOW.md 和这次相关的 docs/page-builder 文档。
保护未提交修改。不要 reset、clean、提交、推送、写真实数据库或发布。
目标：<一句话用户结果>。
不要改公共 Schema，除非我这次明确允许。
用 Node 22 做与改动相称的检查，并在浏览器里看受影响的桌面和手机页面。
用简体中文汇报：实际改动、验证结果、未验证的数据库和发布边界。
```

日常顺序是：先让 AI 对照现状说明目标与影响；已经明确授权的普通实现直接推进并按需在浏览器里验收，检查与评审默认只读。只有触及 `AGENTS.md` 的审批边界或真实信息缺口时才集中确认，不为已授权实现重复设置批准步骤。只在想保留这批改动时再说“提交”；数据库和发布操作仍分别核对授权。

## 1. 共同治理，不按模型强弱分权

本项目可以使用 Codex、Claude Code 与 VS Code 智能体（包括经智谱或 DeepSeek 路由的模型）。无论当前模型或供应商如何变化，以下规则只有一套：

1. 所有工具遵守 `AGENTS.md`，并按当前任务相关范围读取 `PROJECT_RULES.md`、`WORKFLOW.md` 和协作标准；工具专属文件只做适配，不复制或覆盖共同规则，也不要求每次全量加载全部治理文档。
2. 权限按任务角色和用户授权决定，不按模型品牌或推定能力决定。读取、建议、实现、验证、Git 写入和生产操作的边界以共同规则为准。
3. 协作写入、并发准入、逻辑重叠与 worktree 隔离统一以 `AGENTS.md` 和 `docs/AI_COLLABORATION_STANDARD.md` 为准；本文件只记录各工具能否实际提供所需任务或代理能力，不复制协作细则。
4. AI 输出均须区分已核验事实与建议。一个工具生成的结论不能替代另一个工具的代码、构建、测试或实际页面验证。

建议的角色分工：

| 角色 | 允许的工作 | 不允许的工作 |
| --- | --- | --- |
| 研究/评审者 | 只读取证据、提出方案、审查差异和测试建议 | 在未获授权时写文件、改配置、执行 Git 写入 |
| 实现者 | 只修改用户已授权范围；共享工作区时再认领文件，并完成相称验证 | 与其他智能体并发修改同一逻辑区域、扩大任务范围 |
| 验证者 | 复核 diff、类型、构建、测试、失败路径和界面结果 | 将未执行的验证写成已通过 |
| 集成者 | 按 `AGENTS.md` 的当前有效授权和项目门禁执行精确暂存、本地提交或其他已分别授权的集成动作 | 以工具身份自行取得权限、把本地提交授权扩展为 push 或发布 |

## 2. 项目级入口

| 入口 | 适配文件 | 项目级 MCP 配置 | 已发现 MCP | 说明 |
| --- | --- | --- | --- | --- |
| Codex（OpenAI） | `AGENTS.md` | `.codex/config.toml` | playwright、chrome-devtools、context7 | Codex 的项目指令以 `AGENTS.md` 为入口；按 `WORKFLOW.md` 最小启动，只读取任务相关规则。店铺装修与模板的双端、分节和预览不在本文件或 `.codex/` 复述，从 `AGENTS.md` 进入 `docs/page-builder/store-decoration.md` 第 4 节和 `template-creation-rules.md` 第 3.1 节。 |
| Cursor | `AGENTS.md`、`.cursor/rules/project-context.mdc` | `.cursor/mcp.json` | context7、playwright、chrome-devtools（独立协议调用通过；Cursor 挂载另验） | 2026-11-04 在 3.24.18 的 Customize 当前工作区技能页确认发现 17 项项目技能，含 `taste-skill`、`luxury-visual`、`figma-design-to-code`、`playwright-testing`；继续共用 `.agents/skills/`，不复制技能。该界面证明可发现，不证明任意会话已触发；新路由的真实执行效果须在后续任务中核验，运行中的会话不自动视为已加载。 |
| Claude Code | `CLAUDE.md` | `.mcp.json` | playwright、context7 | `.claude/agents/` 有审查代理；仅在当前会话确实提供该能力时使用。chrome-devtools 原经用户级 `~/.claude.json` 挂载（历史会话高频使用），2026-08-19 用户级清理后**项目级挂载待批准**（见 DECISIONS A.11）。 |
| VS Code 智能体 | `.github/copilot-instructions.md` | `.vscode/mcp.json` | playwright、context7 | 是否加载该指令、实际模型和可用 MCP 取决于用户安装的扩展与当前会话，需以运行界面为准。2026-08-19 起 github/figma/tavily/chrome-devtools/prisma 移除（VS Code 会话全量注入 MCP schema，多服务器是上下文开销大头；figma/tavily/github 历史引用各仅 3 处，近乎未用）；恢复须按第 3 节流程批准。 |

`.agents/skills/` 是项目内技能内容的唯一维护位置；如某工具通过链接或扩展加载它，只能视为该工具的适配机制，不改变共同规则。

`.codex/skills/` 下的各技能目录是指向 `../../.agents/skills/<名称>` 的符号链接并被 Git 跟踪，作为 Codex 的加载适配，不产生第二份技能内容。该适配依赖检出环境支持符号链接：Windows 需开启开发者模式（或启用 `core.symlinks` 后重新检出）；在符号链接退化为普通文本文件的克隆上，用 `cmd /c mklink /D <链接名> ..\..\.agents\skills\<名称>` 重建即可，不改动 `.agents/skills/` 本体。

### Codex 指令与 Skill 加载事实

- Codex 在新任务开始时按目录层级建立一次 `AGENTS.md` 指令链；修改治理文件后，当前任务可做静态核对，但最终加载效果必须在新的 Codex 任务中验证。技能内的长参考使用 `REFERENCE.md`，不进入这条指令链。`.worktrees/`、`.tmp/` 和 `.agents/worktrees/` 里的 `AGENTS.md`、`CLAUDE.md` 由根目录 `.gitignore` 与 `.cursorignore` 排除，避免每个本地检出再注入一份。
- 项目 Skill 通过 `.agents/skills/<名称>/SKILL.md` 渐进加载。隐式触发主要依赖 frontmatter 的 `description`，因此描述必须短、可区分，并同时说明适用任务与不适用边界。
- `critical-review` 是显式法庭模式 Skill：其 `SKILL.md` 的 `description` 已声明仅限用户显式触发，禁止隐式调用；只有用户明确说“法庭模式”“开庭审校”或显式调用 `$critical-review` 时，才按 `AGENTS.md` 与 `WORKFLOW.md` 读取并执行。高风险事项未触发法庭模式时仍按普通授权和验证门禁处理。
- 同名 Skill 不会自动合并。项目不得保留两个都可被发现、名称相同但正文独立漂移的 Skill；停用旧实现时保留可追溯材料，但移除其可发现的 `SKILL.md` 入口。
- 修改 Skill 后，至少用应触发和不应触发的代表提示核对描述边界，并执行可用的结构校验；当前任务中的静态检查不能替代新任务里的真实发现与触发验证。

## 3. MCP 供应链规则

各客户端的 MCP 配置入口独立，按对应格式适配，禁止机械复制：

- VS Code：`.vscode/mcp.json`，`servers` 格式；
- Claude Code：`.mcp.json`，`mcpServers` 格式；
- Codex：`.codex/config.toml`，`mcp_servers` 格式。
- Cursor：`.cursor/mcp.json`，`mcpServers` 格式；服务器命令与能力仍需在 Cursor 中单独验证。

配置当前使用 `npx -y` 并锁定精确包版本。版本锁定只减少隐式漂移，不代表已被每个工具成功验证。

解析与挂载是两个验证层级：配置文件能被 CLI 解析并列出服务器，不等于新会话已真实挂载并可调用工具。每次 MCP 变更后须在新会话完成真实挂载与工具调用验证；验证完成前，相关记录必须保留“待新会话验证”标注，不得把解析结果写成已挂载。

在用户明确要求维护 MCP 时，既有服务器使用同一注册表/仓库来源、保持相同认证方式、数据域和权限的 patch/minor 固定版本更新可由 AI 直接实施和验证。新增或删除 MCP、major 更新、改来源/命令/参数、引入认证或凭据、付费服务、外部写入、新数据域或权限扩大仍须先获批准。所有变更记录都应写明：

- 精确包版本、注册表与 Node.js 兼容性；
- 可由哪些工具调用、可访问哪些数据与外部服务；
- 实际启动验证结果与日期；
- 失败时的回退版本或禁用方式。

### 2026-08-30 MCP 版本锁定记录

- `@playwright/mcp@0.0.79`：Codex、Claude Code 与 VS Code 配置共用；要求 Node.js `>=18`。
- `chrome-devtools-mcp@1.8.0`：仅 Codex 项目配置使用；要求 Node.js `^20.19.0 || ^22.12.0 || >=23`。
- `@upstash/context7-mcp@4.0.4`：Codex、Claude Code 与 VS Code 配置共用；要求 Node.js `>=20.18.1`。
- 版本、仓库来源、引擎约束与包完整性从 `https://registry.npmjs.org` 只读核对；曾用 Node.js `25.2.1` 做过本机 CLI 辅助验证。项目完成与发布仍以各包 `engines`、CI 和发布配置规定的 Node 22 为权威基线，本机其他版本不能替代。
- 已验证三个精确版本均可由 `npx -y` 下载并返回自身版本和 CLI 帮助；两个 JSON 配置解析通过，Codex CLI 能解析 TOML 并将三项列为 `enabled`。当前会话不会热加载修改后的项目 MCP，真实浏览器工具调用仍须在新会话中验证。
- 回退时恢复变更前已核验的精确固定版本，或在对应工具配置中禁用单一 MCP；不得回退到 `@latest` 或无版本后缀重新引入隐式漂移。回退不修改应用依赖、锁文件或业务代码。

`.vscode/mcp.json` 的 Prisma 配置（曾与项目文档存在版本冲突）已于 2026-08-19 移除；数据库结构一律以直接阅读 `server/prisma/schema.prisma` 为准。

### 2026-11-04 Cursor 接入记录

- 用户先授权为 Cursor 接入 Context7、核对内置浏览器；同日随后明确同意安装 Playwright MCP、只读查询 GitHub 的适用工具，并进一步明确同意安装 Chrome DevTools MCP 以检查性能、网络及控制台。
- `.cursor/mcp.json` 使用 Windows 的 `cmd.exe /d /c npx.cmd -y @upstash/context7-mcp@4.0.4`，显式包装 `.cmd` 启动，沿用其他客户端已锁定的精确版本，不改应用依赖或 lockfile。npm 注册表核对来源为 `github.com/upstash/context7`，Node 要求 `>=20.18.1`；本次验证运行于 Node `22.23.2`。
- 可访问的数据域为 Context7 的库文档服务。仅用公开 React 问题测试，未配置新凭据；本次未触发登录。未来若需要认证、付费或扩大数据域，仍按现有授权边界处理。
- CLI 帮助、MCP 初始化、工具列表及 `resolve-library-id`、`query-docs` 两次真实调用均通过。该独立协议验证不等于 Cursor 当前运行中的 Agent 已调用；客户端发现及挂载结果另记，不重启或打断正在运行的其他任务。
- 内置浏览器已只读打开本地首页；其手机视口和 Agent 工具调用尚未验收。用户明确要求先完成配置、界面验证稍后进行，因此保留当前窗口和模板草稿，不再操作 UI。三个 MCP 的 Cursor 界面挂载及新会话工具调用均待验证，不能用独立协议调用替代。
- Playwright 同样通过 `cmd.exe /d /c npx.cmd` 启动，使用同一官方 npm 来源的 `@playwright/mcp@0.0.79`，Node 要求 `>=18`，注册表仓库为 `github.com/microsoft/playwright-mcp`。使用已安装 Edge（`--browser msedge`）、内存隔离会话（`--isolated`）与无界面模式（`--headless`），不连接用户现有 Edge 标签、登录态或草稿；输出目录为工作区下 `.codex-tmp/cursor-playwright`。未增加 Cookie 导入、权限授予、文件系统放宽或自动批准参数。
- Node `22.23.2` 下，从 Cursor 配置读取命令启动：MCP 初始化、24 项工具发现、本地首页导航、`browser_resize`、只读尺寸查询、截图和关闭浏览器均通过。实测视口为 `1440×900` 与 `390×844`，截图已查看；验证记录在 `.codex-tmp/cursor-playwright/verification.json`。这只证明桌面/手机宽度的工具能力，不证明触屏/UA 仿真、真机、模板视觉合格或保存发布链路通过。
- Chrome DevTools 使用 `cmd.exe /d /c npx.cmd -y chrome-devtools-mcp@1.12.0`，GitHub 官方稳定发布与 npm 来源均已核对，Node 要求 `^20.19.0 || ^22.12.0 || >=23`。启用 `--headless --isolated`，自动发现本机 Chrome，不使用 `autoConnect`、现有调试端口、用户数据目录或登录态。关闭使用统计（`--no-usage-statistics`）和性能网址向 CrUX 外发（`--no-performance-crux`），启用敏感网络头脱敏（`--redactNetworkHeaders`），文件工具工作目录配置为 `.codex-tmp/cursor-devtools`。
- Node `22.23.2` 下，按该配置的原始命令启动：版本 `1.12.0`、32 项工具发现、本地首页导航、只读页面查询、控制台读取、网络列表、截图及自动停止的性能 Trace 录制均通过。性能工具仅重载本次独立创建的公开首页。截图和约 6.9 MB 的压缩 Trace 位于 `.codex-tmp/cursor-devtools/`，摘要为 `verification.json`；这是开发环境的独立 MCP 能力验证，不是 Cursor Agent 已调用、网站性能合格、生产监测或完整业务验收。
- GitHub 选型中的 Chrome DevTools MCP 已按用户后续授权接入；GitHub MCP 仍留待 Cursor 的 PR/CI 集成需求。`@axe-core/playwright` 已在项目依赖和多项测试中使用，复用现有检查，不重复安装；泛用设计 Skill 不直接覆盖现有品牌与 UI 规范。
- 回退时可在 Cursor 的 Customize 中分别禁用 `context7`、`playwright` 或 `chrome-devtools`；尚无此前 Cursor 版本，不以 `@latest` 作为回退，不改其他客户端的 MCP 或应用依赖锁文件。

## 4. 用户级配置与数据边界

以下内容不纳入仓库，也不应写进项目文档、MCP 配置或日志：模型路由、智谱/DeepSeek/API Key、访问令牌、用户级 VS Code 设置、用户级 Claude 切换器设置和本地权限白名单。

如需核验用户级配置，必须获得项目负责人对精确路径和只读/写入范围的单独授权。无论供应商为何，客户姓名、电话、地址、邮箱、咨询正文、订单、支付和真实业务导出数据均不得为无关任务发送给外部模型。

## 5. 使用与维护

1. 开始任务：检查工作区和授权；仅在真实多人或多智能体协作时说明角色、认领范围与潜在写入冲突，并识别是否触及配置、密钥、依赖、Git 或生产环境。
2. 完成任务：以真实命令输出、页面核对或审查证据交付；模型回答本身不是验证。
3. 变更工具配置：先记录拟议范围和风险；由获授权的集成者修改相应配置并完成隔离验证后，再更新本文件中的已验证事实；未验证项明确标为待确认。
4. 更换模型或供应商：无需改动共同规则；只在对应工具适配文件和用户级配置中处理其可用能力与数据边界。
