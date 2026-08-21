# 海川珠宝 — 技术决策记录（DECISIONS）

> 本文件 = **已批准的架构决定及原因**（历史保留），并标注与当前代码冲突的过时条目和尚未确定的【待决策】事项。
> 现在必须遵守的硬规则见根目录 `PROJECT_RULES.md`；AI 执行流程见根目录 `WORKFLOW.md`。
> 最近核对：2026-08-17（本轮核对品牌方向、鉴权/角色、店铺装修、库存与 Feature Flag 相关条目；其他历史事实仍须按当前代码逐项复核）。

## 阅读约定

- ✅ **已批准**：当前有效，必须遵守。
- ⚠️ **过时/待更新**：历史决策记录与当前代码不符；以代码事实为准，待项目负责人确认后修订。
- 🟡 **【待决策】**：尚未确定；任何 AI **不得自行选择方案**，必须先报告。

---

## A. 已批准且有效的决策（✅）

### A.1 状态管理用 Zustand 4（非 Redux）✅
- **决策**：前端全局状态用 Zustand 4。
- **原因**：无 Provider、无 boilerplate、selector 模式避免不必要渲染、体积小（~2KB）。
- **当前事实**：`authStore`、`shopStore` 用 `persist`；`selectionStore`、`pageMetaStore`、`appStore` 非持久。

### A.2 固定技术栈 ✅
- **决策**：前端 React 18 + TypeScript 5 + Vite 8 + Ant Design 5 + Tailwind CSS 3 + Zustand 4；后端 NestJS 11 + Prisma 5 + MySQL 8 + JWT + bcrypt + Sharp。当前不常驻 Redis/Bull，未来恢复缓存或队列须单独决策。
- **原因**：围绕展示、商品管理、内容编辑、选款咨询定位选型。
- **约束**：不得自行替换/升级/降级；详细清单与禁止替代项见 `docs/PROJECT_GUARDRAILS.md` §3、`PROJECT_RULES.md` §0。

### A.3 统一响应结构 ✅
- **决策**：后端全局 `TransformInterceptor` 包成 `{code,data,message,timestamp}`；前端 `utils/unwrap.ts` 解包。
- **原因**：前后端契约统一，避免各页面重复解包逻辑。

### A.4 两套独立认证体系（User / Customer）✅
- **决策**：后台 `User` 与前台 `Customer` 是两套独立认证；**共用 `JWT_SECRET`**，靠 payload `type` 字段区分。
- **原因**：区分员工后台与前台客户/游客，复用同一套 JWT 基础设施。
- **当前事实**：后台 `JwtAuthGuard` + `JwtStrategy`（payload `{sub,username,role}`）；前台 `CustomerAuthGuard` / `OptionalCustomerAuthGuard`（payload `{sub,type:"customer"}`，过期 24h 写死）。
- **注意**：是否拆分双 secret 见 🟡 D.6。

### A.5 RBAC 用角色白名单（@Roles + RolesGuard）✅
- **决策**：后端权限只做**粗粒度角色白名单**（`@Roles(...)` + `RolesGuard`），不做细粒度权限守卫。
- **原因**：角色少、场景明确，避免过度设计。
- **影响**：前端 `permissionStore` 的细粒度权限键后端**不校验**；前端隐藏 ≠ 服务端拒绝（见 `PROJECT_RULES.md` §2、🟡 D.4）。

### A.6 装修采用 Puck PageDocument ✅
- **决策**：前台页面装修统一用 Puck `PageDocument` 体系（草稿/发布/版本回滚 + 多设备预览）。
- **原因**：所见即所得、内容与业务分离、支持模板与发布流。
- **当前事实**：`PageDocument`/`PageTemplate`/`PageDocumentRevision` + `page-modules` 后端 + `pageDocumentApi` + `HomepageConfig` 编辑器 + `PuckDocumentRenderer` + `components/blocks` + `page-builder/adapters`。
- **注意**：旧首页内容块与 `ContentSlot` 已归档；当前边界见 ✅ D.8，历史错误结论见 B 节索引。

### A.7 新增样式优先 Tailwind ✅
- **决策**：新代码优先 Tailwind 类名，仅动态计算值用行内样式；不强制重写已有代码。
- **原因**：历史组件 Tailwind / 行内样式混杂，统一未来方向即可（见 🟡 C.1）。

### A.8 客户前台采用高级珠宝品牌级数字体验体系 ✅
- **决策日期**：2026-08-17；项目负责人明确要求以“顶级奢侈品珠宝品牌网站”为目标，形成高级、简约、奢华但克制的统一规则。
- **决策**：客户前台采用“排版驱动 + 摄影驱动 + 极简 + 艺术指导”方法，以珠宝、工艺、品牌内容和顾问服务为主角；不做通用电商商城、促销会场、批发目录、SaaS 模板或对竞品页面的复刻。
- **视觉路线**：客户前台以 Cormorant Garamond 英文展示字体、Noto Serif SC 中文标题和无衬线正文建立经典衬线、现代克制的高级珠宝表达；全站色彩采用白、冷浅灰、近黑的共享中性底盘，真实影像承载珠宝与场景色彩。在正式品牌识别系统获批前不发明第二品牌色，也不能把实现现状写成品牌历史或永久资产。
- **执行边界**：详细色彩、排印、留白、图片、组件、动效、文案、响应式、无障碍、性能和验收只认 `docs/UI_GUIDE.md`；其他治理文件只能引用，不复制具体数值。
- **可用性底线**：极简不得隐藏商品关键事实、表单错误、隐私说明和服务流程；高质量图片与动效不得牺牲性能、键盘操作、对比度或移动端体验。
- **后台边界**：管理后台继承同一中性底盘与对比度规则，但以清晰、效率、状态完整性和无障碍为先；保留低饱和功能状态色，不复制前台的大留白、展示字体、透明导航和沉浸式表达。

### A.9 内容模板采用完整构图与统一合同 ✅
- **决策日期**：2026-08-17；项目负责人批准先统一模板产品与设计规则，再继续分批实施。
- **决策**：内容模板采用完整根构图与受控编辑，不把内部媒体、文字和行动降级为任意拖动散件；模板事实由仓库级机器合同单一维护，所有编辑、预览、渲染和发布消费者从合同读取或生成。
- **当前入口**：稳定设计边界与变更流程只维护在 `docs/page-builder/template-design-framework.md`；模板清单、状态、槽位、比例、顺序、预设和内容预算只认 `contracts/page-builder/content-templates.contract.json`。
- **历史边界**：旧标准、设计卡、风格总纲、实施蓝图与静态预览均为历史证据，不再参与当前实施判断；当前数量和完成度必须从合同、代码和真实页面重新核验。

### A.10 设计知识支撑采用 design-library 素材库 ✅

- **决策日期**：2026-08-18；2026-08-20 收敛：项目模板只维护一个人读规则入口，设计理论与外部证据统一由仓库级素材库 `design-library/` 支撑，但不得在素材库另建模板规则。
- **结构调整**：`docs/CONTENT_TEMPLATE_STANDARD.md`、`docs/CONTENT_TEMPLATE_CONTRACT_DESIGN.md`、`docs/page-builder/template-composition-review.md`、`docs/page-builder/visual-audit-20260818.md` 归档至 `docs/archived/2026-08-18-template-rules/`（保留可回溯性，不物理删除）；`contracts/page-builder/content-templates.contract.json` 及配套生成/校验脚本是代码运行依赖，不归档。
- **知识分层**：`docs/UI_GUIDE.md` 仍是项目视觉唯一详细来源与约束标准；`design-library/` 只提供通用理论、量化基线与品牌实测证据（原则 01/02 → 数值 03 → 证据 04 → 能力 05），不再承载项目模板规则。luxury-visual 技能引用该库作为理论证据层，其 `knowledge/benchmark-data.md` 只保留指针；库数值与 UI_GUIDE 冲突时，以 UI_GUIDE 为准。
- **AI 调用约定**：设计任务开始时按 `design-library/README.md` 的路由读取对应文件，不全量加载；实测数据引用需保留快照日期；竞品素材只用于论证方向，不复刻版式、商标、文案或受保护素材。
- **2026-08-20 收敛**：项目负责人要求按最新标准消除多套模板内容。原 `design-library/06-jewelry-template-system.md`、风格总纲、实施蓝图、23 份设计卡和静态预览移入 `docs/archived/2026-08-20-template-rule-consolidation/`；现行只保留一份人读入口和一份机器合同。

### A.11 多智能体 MCP 矩阵收敛与 token 治理 ✅

- **决策日期**：2026-08-19；背景：token 消耗审计发现 MCP 多处重复注册（用户级 `~/.claude.json` 与项目级并存、大小写重复项目键），以及 VS Code 侧无按需加载机制导致的全量 schema 注入开销。Claude Code 经 `ENABLE_TOOL_SEARCH=true` 按需加载工具 schema，两侧成本模型不同，收敛策略分面处理。
- **矩阵调整**：`.mcp.json`（Claude Code）拟补 chrome-devtools（历史会话实测高频使用：178 处引用、2026-08-19 当日仍在用）——**待项目负责人批准后执行**（2026-08-19 Claude 会话尝试修改 `.mcp.json` 被权限分类器按 CLAUDE.md 供应链规则拦停；批准后由集成者添加并完成启动验证）；`.vscode/mcp.json`（VS Code 智能体）收敛为 playwright、context7，移除 github/figma/tavily/chrome-devtools/prisma（figma/tavily/github 历史引用各仅 3 处，近乎未用）；`.codex/config.toml`（Codex）不变。用户级 `~/.claude.json` 删除 `G:/网站搭建2` 大小写重复键及其下 github docker MCP、删除与项目级重复的 playwright/context7/chrome-devtools 用户级注册，保留 prisma（备份 `~/.claude.json.bak-20260819`）。
- **变更记录（AI_TOOLING 第 3 节要求）**：chrome-devtools-mcp 经 `npx -y chrome-devtools-mcp@latest` 启动，与 Codex 侧 `.codex/config.toml` 同款命令；启动验证状态：**待下次 Claude Code 会话确认**；回退方式：删除 `.mcp.json` 中该条目。
- **EFFORT 同步**：`CLAUDE_CODE_EFFORT_LEVEL` max→high，除 `~/.claude/settings.json` 外已同步 cc-switch 数据库 providers（当前 claude 行）+ proxy_live_backup（备份 `cc-switch.db.bak-effort-high-20260819`），避免代理下次重生成 settings.json 时回滚；下次 cc-switch 重启或切换 provider 生效。
- **2026-08-19 追记（零操作自动护栏，脚本已实测）**：项目 `.claude/settings.json` 落地三层自动防护——① `autoCompactWindow: 200000`：上下文 200K 原生自动压缩（官方设置项，解决 `[1M]` 窗口下默认压缩阈值形同虚设的问题）；② PostToolUse/Stop hook（`.claude/hooks/token-guard.cjs`）：快照/截图每 3 次、读取/搜索第 25 次向模型注入节制提醒，会话转录 >2MB 或工具调用 >40 次时回合末建议 /clear（走 `hookSpecificOutput.additionalContext` 非阻塞路径，每会话最多 3 次，`stop_hook_active` 时静默防循环）；③ statusline（`.claude/hooks/statusline.cjs`）：状态栏常驻显示 模型·上下文%·输入token·成本估算。注入通道经官方文档核实（PostToolUse/Stop 的 exit-0 纯 stdout 不入模型上下文，必须走 additionalContext）。脚本全路径模拟测试通过（快照第 3 次触发/读取第 25 次/Stop 3MB/statusline 渲染/BOM 与异常静默兜底）；真实会话加载验证待下次启动确认。
- **2026-08-19 追记二（纪律扩散与水位口径）**：Token 纪律行为版扩散至 `AGENTS.md` 第 12 节与 `.github/copilot-instructions.md`（Codex/Copilot 无 hook/自动压缩机制，仅纪律文本可共享，自动化护栏仍为 Claude Code 专属）；水位口径统一为 200K 预算百分比——60%（120K）收尾、80%（160K）红线——statusline 显示 `XK/200K` 分档，Stop hook 从转录尾解析最近 usage 实算水位（嵌套 usage 对象须花括号配对截取），取不到时回退转录体积启发。合成与真实转录测试通过。
- **2026-08-20 追记三（DeepSeek 账单驱动的 Claude 主动预算）**：近 30 天账单为 24,515 次请求、4,914,336,365 tokens、消费 ¥649.90，平均约 200.5K tokens/请求；Pro 请求占 97.54%，Flash 抽样日输入缓存命中约 99.43%。结论是主要成本来自“高回合数 × 大上下文 × Pro 集中使用”，不是缓存整体失效。Claude 专属 `autoCompactWindow` 与状态栏主动预算由 200K 下调至 120K，80K 进入收尾区、120K 红线，运行时以 120K 作为自动压缩阈值的计算窗口。高消耗读取/截图仍由 PostToolUse 统计，Agent 回合改用无 matcher 的 PostToolBatch 每批计数，避免全工具逐次 Hook 的额外进程与并发丢计数；截图提醒最多 3 次，读取提醒第 12 次且只提醒一次。先观察 7 天；若复杂 Puck/Renderer 任务因频繁压缩出现可复现的信息丢失，则回调 Claude 主动预算至 140K。回退方式为恢复 `autoCompactWindow`、statusline 与 Stop 阈值并移除 PostToolBatch 条目。本次 JSON/Node 语法、79,999/80,000/119,999/120,000 边界、提醒上限、批次计数、回退启发和 `claude doctor` 已通过；为避免额外付费，真实新会话加载留待下一次正常启动确认。**失效说明**：本条原有“`AGENTS.md` 的跨工具 200K 绝对预算不变”已被 A.14 与当前 `AGENTS.md` 的“公共规则不设跨供应商固定 Token 数字”取代；跨工具成本纪律以阶段闭环和当前工具事实为准。

### A.12 开发端口所有权：3000 永远归宿主机后端 ✅
- **决策日期**：2026-08-19；项目负责人批准结构性解耦方案并已执行验证。
- **决策**：本地开发拓扑固定为「`3000` = 宿主机后端（vite 5173 的 `/api` 代理目标，开发唯一 API 归属）」；容器 server 改映射 `127.0.0.1:3002`（仅供验收时直连对比）；完整容器栈经 `:80` 自包含访问——任何人执行 `docker compose up` 都不再影响开发 API 归属。
- **背景事故**：容器/宿主机后端曾互抢 3000。2026-08-19 上午宿主机后端上传的媒体写入 `server\uploads`/`server\private-media`，13:50 容器栈接管 3000 后，DB 记录共享但文件在宿主机目录，后台图片全部 404（媒体存储分裂症状）。当日已 docker cp 双向补齐两套存储并验证。
- **否决方案（bind mount 共享媒体目录）**：会绕开 backup 服务挂载的命名卷（备份链路对新上传失明）、造成 dev/prod 存储语义分叉、Windows bind mount 存在 IO/权限/大小写语义差异。原则：异构环境（Windows 宿主机 + Linux 容器）之间选「确定性的隔离」，不选「共享可变状态」；端口是所有权边界。
- **配套**：`docker-compose.override.yml` 已改（3000→3002，含注释）；当前端口事实与操作说明收敛到 `docs/CURRENT_STATE.md` 和 `docs/DEVELOPMENT_WORKFLOW.md`；宿主机后端运行方式沿用 `node dist/main.js`（cwd=`server/`，`nest dev` 本机 hang 约束不变）。
- **边界**：开发栈（宿主机目录）与验收栈（docker 卷）媒体仍为两份存储，跨环境做内容上传时需知晓归属；生产部署不受影响（override 仅本机生效，生产仍用命名卷）。

### A.13 ✅ public 静态资产边界与素材堆清理（2026-08-19）
- **决策**：`client/public/` 只承载 UI 资产（logo/placeholder/工艺图/editorial 品牌图/模板默认图）；商品图终局走后端媒体管道；未引用大体积素材一律移入 `.image-archive/` 隔离区（gitignore 收编、manifest 留档可回填），不得留在构建链。
- **触发**：rebuild-client 脚本首跑暴露构建上下文 2.2GB——`public/images/products` 836 个文件中 **793 个（2,024MB，95%）从未被任何代码/契约/DB 引用**；43 张活图 109.5MB 均为相机原图（单张 2.5MB+）直出给浏览器。
- **执行与实测**：793 孤儿移入隔离区（`orphan-manifest-20260819.tsv` 留档）；43 张活图备份原图后 Sharp 无损降采样 1600px（**109.5MB→2.7MB**，png 无损、仅去过度分辨率）；public 总量 2,355→110.6MB；**client 镜像 2.73GB→309MB（-89%）**；重建上下文 2.2GB→68.5MB（150 秒→5 秒）；80 首页滚动全量加载零 broken 图。
- **防复发**：`scripts/verify-public-assets.mjs` 守卫（200MB 警告/500MB 红线）挂入主 `test` 链；`.dockerignore` 收编 playwright-report/test-results；素材正确入口=商品图走 `/uploads` 媒体管道、设计素材走 design-library/。
- **引用判定纪律**：判孤儿前必须全维扫描（client/src + contracts + server 脚本 + DB `product_images` + `page_documents.puckData`）；PowerShell 5.1 读 UTF-8 无 BOM 源码会产出编码双胞胎字符串，**含中文文件名的判定必须用 ripgrep/字节比对**，当日已实际踩中（Test-Path 假阴性）。
- **待决（C-2）**：Home 静态兜底分支（`Home/index.tsx` 的 `puckData ? <PuckDocumentRenderer/> : 静态兜底` 双轨）存废——拍板后决定 43 张活图与 productFocus 硬编码数据的终局；媒体迁移基建已备（`server/scripts/migrate-product-media.ts` 支持两类来源）。
- **2026-08-19 追记三（迁移源治理修复，B 方案）**：A.13 执行隔离时未同步 `docs/IMAGE_MIGRATION.md` 第 31 条（"原图目录保持不变"），迁移源治理线断裂。修复：836 张完整原图（793 孤儿 + 43 活图原图，自 `.image-archive/`）经 SHA-256 基线 → 复制 → 逐文件复验（836/836 文件名+大小+SHA-256 全匹配）→ 删源，迁入 `server/migration-source/product-images/`（gitignore 收编）；`generate-product-image-manifest.js`、`product-media.service.ts`、`migrate-product-media.ts` 三处 legacy 指向更新；三方互证（基线 CSV、迁移后目录、新 manifest）SHA-256 集合一致。备份缺口如实记录：backup 容器不覆盖该目录，冷快照在 `backups/migration-source-snapshot-20260819/`，正式备份收编待拍板（详见 IMAGE_MIGRATION.md）。教训固化：**动任何治理文档管辖的资产前先读该文档；变更落地后必须同步更新对应治理文档**。

### A.14 ✅ AI 治理单一授权源与分层收敛（2026-08-20）

- **用户批准**：采用“系统性收敛”方案，在保留安全、数据、生产和品牌底线的基础上减少重复审批、循环读取与易漂移事实。
- **权威边界**：`AGENTS.md` 是项目内唯一权限与审批来源；`PROJECT_RULES.md` 只保留稳定技术不变量；`WORKFLOW.md` 是唯一执行、验证与交付来源；`docs/CURRENT_STATE.md` 记录易变化事实；本文件记录已批准决策及原因。
- **风险判断**：不再用固定文件数量决定审批。以产品行为、数据、权限、外部契约、可逆性和生产影响判断；普通已授权任务不重复请求批准，高风险行为仍先方案后批准。
- **工具与技能**：工具适配、角色提示、技能和子代理不得扩大权限、追加冲突审批或自动执行 Git/删除/部署；它们只定义工作方法。
- **成本口径**：公共规则不设跨供应商固定 Token 数字；工具专属水位、缓存和自动压缩参数只记录在对应适配与当前配置中。
- **工程与品牌**：单一 HTTP 传输允许按业务域拆分 API；视觉验证按改动影响分级，全局品牌系统与 Puck 合同仍执行高等级验收。`docs/PROJECT_GUARDRAILS.md` 与 `docs/UI_GUIDE.md` 的品牌职责不变。
- **回退与重审**：若收敛后出现可复现的越权、漏测、品牌质量下降或跨工具行为分叉，先用具体任务场景取证，再恢复对应门禁；不得整体回滚用户已有治理改动。新增平台能力或审批边界变化时重新审查。

---

## B. 已失效记录索引（⚠️ 不具执行力）

以下旧结论已从正文清理，只保留索引，防止被搜索结果再次当成当前规则：

| 失效结论 | 当前依据 |
| --- | --- |
| 首页存在两套内容块体系 | 以 A.6 的 Puck PageDocument 决策和当前代码为准 |
| Prisma Client 存在固定数量的 `(this.prisma as any)` | 数量会变化；以当前搜索、类型检查和 `PROJECT_RULES.md` §3 为准 |
| 页面构建器使用旧 postMessage 消息名 | 以当前编辑器协议代码为准，文档不复制易漂移消息清单 |
| 交易开关固定为全关或全开 | 以当前代码、部署配置、实际环境和独立上线批准共同判断 |

失效记录不作为实现、上线或回退依据；需要审计轨迹时查看 Git 历史。

---

## C. 历史现状记录（保留，需结合当前事实理解）

### C.1 Tailwind vs 内联样式
- **现状**：旧组件多用 Tailwind，新组件多有行内样式（不同时期/不同 AI 产物）。
- **方向**（已确认，见 ✅ A.7）：新代码优先 Tailwind；不强制重写已有代码；仅动态计算值用行内样式。

---

## D. 专项决策台账（✅ 已决 / 🟡 待决）

> 本节保留稳定编号供代码和其他文档引用。✅ 条目已经落地，只记录边界；🟡 条目尚未拍板，任何 AI 遇到相关任务必须先报告，不得自行选择方案或写成既定事实。

### D.1 ✅ 库存已收敛单轨（2026-08-15 复核修订）
- **已落地**：`Inventory` 为唯一库存来源——`orders.service` 下单预占/核销/释放全部走 `Inventory` 表，**不再 fallback `SKU.stock`**（代码注释明确标注"Inventory 单一来源，DECISIONS D.1"）；`ProductSKU.stock` 仅作展示参考。
- **历史状态（已过时）**：曾双轨并存（`ProductSKU.stock` 直接读写 + Inventory 无消费者）。2026-08-14/15 批次完成收敛，`verify-trade-concurrency.mjs` 契约测试含"库存为唯一来源：无库存时不 fallback"断言护栏。
- **遗留**：多仓架构（Warehouse 模型）仍未启用，见 D.9。

### D.2 🟡 电商功能上线
- **现状**：仓库文档对交易开关与开放范围存在冲突，且“代码存在、默认开关、接口放行、线下凭证流程、线上支付凭据、生产上线批准”是不同事实。
- **待定**：逐能力确认公开范围、真实环境联调证据、经营与支付前置条件、回退开关和上线批准。未完成该记录前，不得用单一配置值宣称完整交易闭环已上线。

### D.3 ✅ Feature Flags 已服务端单一来源化（2026-08-15 复核修订）
- **已落地**：服务端 `GET /settings/flags` 读取 `CUSTOMER_COMMERCE_ENABLED` 环境变量作为**单一来源**；前端 `featureFlags.ts` 拉取该端点，请求失败回退 `SAFE_FLAGS`（三项全 false，安全默认关）。服务端 `CustomerCommerceGuard` 仍是最终安全边界。
- **2026-08-20 校正：** `docker-compose.yml` 与 `.env.example` 均以 `false` 为默认值；获批环境必须显式设置为 `true`，不得依赖缺失变量时的默认开放。
- **历史状态（已过时）**：曾为前端硬编码 false。

### D.4 🟡 权限粒度
- **现状**：后端只做 `@Roles` 角色白名单（粗粒度）；前端 `permissionStore` 有细粒度权限键但后端不校验。
- **待定**：是否引入后端细粒度权限守卫；前端隐藏与后端拒绝的边界如何统一。

### D.5 🟡 Category 删除语义
- **现状**：`Category.deletedAt` 是死字段；删除实际只写 `isActive:false`，读查询按 `isActive` 过滤。
- **待定**：分类采用软删除（启用 `deletedAt`）还是停用（`isActive`）；是否清理 `deletedAt` 字段。

### D.6 🟡 JWT 双域 secret / 全局 Guard
- **现状**：admin 与 customer 共用 `JWT_SECRET` 靠 `type` 区分；`JwtAuthGuard`、`RolesGuard`、`ThrottlerGuard` 已注册为全局 Guard，接口默认要求后台身份，匿名或客户域接口通过 `@Public()` 后叠加相应客户守卫。
- **待定**：是否拆分双 secret / 双 strategy；是否为客户会话增加独立吊销、刷新与风险控制机制。

### D.7 ✅ checkout 客户认证与交易关闭语义（2026-08-20）
- **决定**：`POST /customers/checkout`、付款凭证提交与付款凭证上传均先经 `CustomerAuthGuard`；无客户令牌或无效令牌统一返回 401。认证成功后才由 `CustomerCommerceGuard` 判断交易开关，关闭时返回 503。
- **理由**：认证是交易写入的首要边界；交易关闭不能替代身份校验，也不得让游客借由开关状态绕过未登录语义。
- **边界**：这只收敛接口的认证与关闭行为，不代表交易、支付或生产上线获批；实际开放仍遵循 D.2 的环境、经营和真实联调门禁。

### D.8 ✅ Puck / ContentSlot 边界（已拍板：2026-08-15）
- **现状**：Puck `PageDocument` 是唯一在用的装修体系。
- **已决**：`ContentSlot` 全链路废弃（写侧零入口、HERO 插槽永远空、清退后公开页行为零变化）——模块/端点/schema 模型/前端消费方已删，`content_slots` 表由迁移 20260815100000 幂等 DROP；`HomeSection`/`HomepageBlock` 死代码此前已清理。

### D.9 🟡 默认仓库与多仓启用
- **现状**：`Inventory` 已是订单预占、核销和释放的唯一库存来源；模型支持 `SHOWROOM / FACTORY / STORE` 等多仓类型，但默认仓库、仓库启停和跨仓归属尚未形成完整产品决策。
- **待定**：是否启用多仓、默认仓库设定、存量库存归属、跨仓调拨与前台可售口径。

### D.12 ✅ 模板规范化批次决议（2026-08-18）
- **批次事实**：比例单一来源管道落地（imageSpecs/提示/预览/空态全由契约派生，verify-content-template-image-specs.mjs 守护）；25 组件统一声明式 Schema 面板（Puck.Fields fallback 与三套旧规格源删除）；跳转链接统一轻量一行式（旧数据双读兼容）；放弃草稿走真丢弃接口（乐观锁防并发覆盖）；六页叙事配方（pageRecipes）+ 模板库推荐序列 + 图层栏完成度提示。
- **决议 1（rhythm.ts 退役）**：页面节奏提示引擎上线两周零 UI 消费，删除；页面级引导职责由配方与完成度提示承接。
- **决议 2（母版词汇不强行映射）**：BLOCK_META.master（12 视觉母版）在 rhythm 退役后无运行时消费者，转为归档元数据；运行时构图由各区块 DecorSection master 决定，合同侧母版词汇以契约 master（23 模板专属 id）为准，两套词汇不再建映射表。
- **决议 3（implementationStatus 校正，2026-08-20）**：项目负责人已确认 23 个模板均可投入运营，故机器合同统一标为 `active`，模块库不再错误隐藏其中 18 个模板。状态只控制新建可用性，不决定公开渲染；中性结构预览与布局派生覆盖全部 23 个模板，真实表现仍由各 adapter / Renderer 承担。

### D.13 ✅ 比例调色板收敛与槽位选项机制（2026-08-19）
- **调色板 8→5**：1/1 方形、4/5 竖版、3/2 横版、16/9 宽屏、21/6 超宽。3/4、2/3、16/7 撤编；旧数据（含 video 已保存的 16:7/3:4）由渲染层按原比例兼容渲染，新建不可再选。RATIOS 设计令牌同步收敛为 5 档。
- **归一化与物性修正**：wearingInspiration 2/3→4/5；featuredProduct/productRow/carousel/hotspot 3/4→4/5；storeInfo 移动端竖裁→3/2（门店照片天然横构图）；fullBleed(平板)/limitedEvent 16/7→16/9。
- **槽位选项机制（受控自由度）**：选项唯一来源是契约 `roles[].allowedRatioPresetsByViewport`，编辑器经 `ratioField()`（shared.ts）派生 segmented 控件，渲染端经 `resolveContractAspectRatio()` 白名单校验、越界回退默认；一次选择全端校验（不在本端预设内则回退本端默认）。每槽位 ≤3 项且必须跨形态类别（竖/方/横），构图承重位（hero/通栏/轮播/热区/横幅带/旅程节点）锁定无控件。锁定=控件不出现，非置灰。
- **全量接线（11+2 模块）**：video（桌面 16:9/21:6，移动 4:5/16:9/9:16）与 productRow（4:5/1:1）先行；第二批 11 个模板已全链路接完——singlePoster/doublePoster（主图 3:2 或 16:9 + 细节图 4:5 或 1:1，两槽独立）/featuredProduct/gallery/comparison(改款对比)/lookbook(佩戴灵感)/certificates(3:2 或 16:9)/storeInfo(3:2、16:9 或移动竖版 4:5)/testimonials/categoryCards·sceneShopping(品类 1:1/4:5、场景 4:5/1:1)。渲染端统一走 `resolveContractAspectRatio` 覆盖值模式；singlePoster/doublePoster 经 `templateLayoutVars` 新增 overrides 参数逐端注入 CSS 变量；内容键名：媒体单槽 `aspectRatio`（双图海报 `mainImageRatio/detailImageRatio`），卡片与门店 `imageRatio`。随批修复：lookbook 纯氛围宽度硬编码旧 2:3 改为随所选比例动态计算；删除零消费的 `getCategoryCardsMediaAspectRatio`。
- **与 2026-08-18「8 比例骨架判废」追记的关系**：方向一致——比例从"素材骨架"降级为"槽位职能派生 + 素材建议"，本次在契约与选项机制层落地该方法论。verify-content-template-contract.mjs 的视频预设断言已同步。
- **9:16 竖屏（视频域专属，2026-08-19 追记）**：仅视频移动端预设新增 9/16，标签「竖屏」；桌面不在白名单内，选 9:16 的内容在桌面视口经白名单自动回退 16:9（横屏/宽幕仍是桌面仅有的两档，桌面上没有全屏竖版视频是设计意图）。动因：手机竖屏点全屏播放横版素材时系统 letterbox 产生大片黑边，9:16 让竖版素材在移动端画布内即贴合全屏形态。配套：VideoBlock 移动端媒体查询放开 `max-height: none !important`（inline style 优先于媒体查询，防桌面超宽屏撑高的 maxHeight 在移动端钳死 9:16）；"9 / 16" 从 LEGACY_RATIOS 转正。已实测：移动端 9:16 → 0.5625 精确命中，桌面回退 → 1.7778。

### D.14 ✅ 编辑器配方引导与冗余提示删除（2026-08-19）

- **用户决策一（模板库推荐序列）**：内容模块库置顶的"本页推荐序列"分组无用，删除；`RECIPE_NECESSITY_LABEL` 随之失去消费者。
- **用户决策二（图层栏完成度提示）**：页面导航栏上方的"缺必需章节：xxx / 建议补充：xxx"提示无用，删除。至此配方引导全链路退役：`config/pageRecipes.ts` 整文件删除（`PAGE_RECIPES` 零残留）；rhythm.ts（2026-08-18 退役）与配方两级页面引导均已不存在。
- **用户决策三（线上版本徽章）**：设备切换器右侧"正在查看线上版本"字样无用，查看线上态草稿状态徽章不再渲染（`data-mode="published"` 样式同步删除）；退出闭环由工具栏「返回编辑」按钮与禁用的发布钮承接。

### D.15 ✅ 全产品审计恢复方向（2026-08-20）
- **授权与范围**：项目负责人授权 Codex 以用户、产品、工程与高级珠宝品牌视角收敛审计中的常规方向性取舍；不扩大到生产部署、真实数据、密钥、支付开放或基础设施改造。
- **D-1 新建商品默认**：恢复 `DRAFT + MEMBER`。创建资料、图片、SKU 与定价是分步流程；未完成作品不能进入游客目录。显式 `PUBLISHED` 仍必须通过同一发布门禁。
- **D-2 公开页面商品引用**：恢复 `PUBLIC + PUBLISHED` 门禁。公开文档不混入依赖登录后才可见的商品；如未来需要会员专属页面，新增显式页面受众模型而非在公开文档中隐式降级。
- **D-3 视频桌面比例**：回退至 `16:9 + 21:6`，不接受 `4:3` 或 `21:9` 作为新内容预设。原因是 `21:6` 已属于 D.13 的五档合同并在其他模板使用，改为 `21:9` 会成为全局比例体系迁移，需另行视觉证据与决策。
- **验证与回退**：相关合同、发布和类型测试必须全绿；若双端真实浏览器显示 21:6 不适配新素材，重新以真实素材、桌面和移动端截图审议，不能直接修改断言迁就行为。

### D.16 ✅ 内容模板双端合同与中间宽度边界（2026-08-20）

- **双端事实源**：内容模板合同升级为 schema v3，只声明 `desktop` 与 `mobile` 两个端点；角色范围、素材比例、阅读顺序、预览和高度模式不得再引入 `tablet` 字段或第三份内容来源。
- **中间宽度表现**：768–1023px 可以保留纯 CSS 几何适配，用于避免网格、留白和文字排布拥挤；该区间继承 desktop 的素材、比例和阅读顺序，不构成第三个合同设备。D.13 中 `fullBleed(平板)` 的历史表述由本决议取代，当前应解释为中间宽度沿用 desktop 的 21:6 合同比例。
- **版本语义（由 D.17 新序列化修订）**：双端合同收敛本身当时不提升版本；D.17 后因新增可持久化的受控实例覆盖，23 个模板的新编辑标记提升为 `2`。无覆盖的版本 `1` 与 legacy-0 继续按原构图读取，普通保存不升级；版本 `1` 不允许携带版本 `2` 才定义的实例覆盖。
- **门禁**：生成器必须校验设备范围、顺序覆盖、角色回退和比例白名单；共享 Renderer 变更除合同、类型与发布测试外，还要检查全部活跃模板的真实浏览器 DOM、顺序与高度，并在手机、中间宽度和桌面做风险抽样视觉验收。

### D.17 ✅ 属性面板成熟化与受控实例覆盖（2026-08-20）

- **产品边界**：模板组件库、图层面板、画布、属性面板四区名称、职责与整体框架保持不变；本轮优化属性面板内部功能、信息架构和必要的端到端接线。画布在本阶段只预览结果，直接拖拽、自由加层或自由设计器不在范围内。
- **母模板与实例**：母模板继续定义身份、语义角色、槽位数量、默认构图、阅读顺序、行动上限和默认响应式结构。机器合同可以按模板声明受控实例覆盖；覆盖值只存当前 `PageDocument`，不得改变母模板、其他页面或全局设计令牌。旧文档未保存覆盖值时按现有默认渲染，并允许恢复默认。
- **允许的自由度**：根据模板特点，可开放整体画面比例/高度、图片槽位比例与安全区内的位置/尺寸关系、双图主次，以及文字角色的启用、位置、宽度、字号、对齐和颜色。预设优先，连续值有明确边界、响应式回退、溢出与对比度保护；不开放任意 HTML/CSS、无界坐标、任意新增图层或根画布散件化。
- **面板组织**：按模板主要任务决定首屏，不机械规定全部模板图片优先。媒体模板先媒体，商品模板先带缩略图和状态的真实商品选择，门店/预约/服务模板先结构化业务对象，文字主导模板先文字；现有画面焦点/裁切/缩放能力及适用的文字、颜色能力保留并补齐。
- **完成定义**：入口、异步状态、编辑状态、`PageDocument`、草稿保存、刷新回显、画布预览、发布校验和公开 Renderer 必须一致；只存在入口或表面控件不算完成。商品等业务对象引用真实事实源，文档不复制价格、库存或状态；选择器需覆盖搜索、筛选/分页、请求失效、去重、数量边界、排序、已选项解析和不可用原因。
- **实施顺序**：先补齐现有功能的真实闭环、保存一致性和错误恢复，再实施新增实例布局自由度；避免在能力仍为空壳时先堆叠复杂布局控件。属性面板是产品范围而非文件范围，必要合同、适配器、服务端门禁和 Renderer 接线可纳入同批，但不授权改造无关模块。
- **引用与素材事实**：新商品引用保存稳定 `Product.code`，旧 numeric id 双读且普通保存不迁移；`CategoryCards` 新引用保存唯一 `Category.slug`，旧手写卡片继续双读。名称、价格、图片、状态、分类封面和公开资格只从业务事实源解析。当前“素材”范围只包括当前 `PageDocument` 已引用素材和本次编辑会话成功上传素材，不包装成跨页面共享资产库。
- **实例覆盖与发布门禁**：区块只在运营人员明确修改实例构图后稀疏写入可选 `__instanceOverrides.version=1`；字段恢复删除或恢复单字段，布局恢复只清理布局覆盖，不清除媒体、文案、链接和业务引用。图片叠字无法可靠证明对比度时，合同声明的实色 `safeBand` 是发布必需条件；服务端按当前商品/分类事实最终裁决，并返回稳定 `blockId/field/path/index/code`。
- **与旧阶段的关系**：此前 P0/P1/P2/P3、审计清单和单次计划只约束当时任务，不再限制本决议已批准目标；`AGENTS.md` 审批、安全与权限、Puck 单一事实源、真实业务数据、品牌、响应式、无障碍和发布门禁继续有效。实际实施仍须按当前代码提出分批计划并获得执行授权，不因本决议自动开始改代码或发布。

### D.10 🟡 金价 AUTO 采集
- **现状**：`@Cron` `fetchAndUpdateGoldPrice` 是空壳（只打 warn），未接行情源；调价系数 `1.05` 硬编码；调价绕过 `ProductsService`（不触发前台 SSE）。
- **待定**：是否接入自动行情源、调价系数参数化、SSE 通知补齐。

### D.11 🟡 .env 校验与变量声明
- **现状**：`ConfigModule` 未配 `validationSchema`；`REDIS_HOST/PORT`、`PRODUCT_MEDIA_ROOT` 代码在用但未在 `.env.example` 声明。
- **待定**：是否引入 Joi 校验 schema。

---

## E. 关联

- 现在必须遵守什么：根目录 `PROJECT_RULES.md`
- AI 应怎样工作：根目录 `WORKFLOW.md`
- 安全 / 工作区底线：`AGENTS.md`
- 项目与品牌边界：`docs/PROJECT_GUARDRAILS.md`；共享工作区协作：`docs/AI_COLLABORATION_STANDARD.md`
