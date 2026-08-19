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
- **视觉路线**：当前实现以 Cormorant Garamond 英文展示字体、Noto Serif SC 中文标题、无衬线正文和品牌金 `#B8944E` 为基线，建立经典衬线、现代克制的高级珠宝表达；字体授权、品牌资产和最终识别系统仍需独立确认，不能把实现现状写成品牌历史或永久资产。
- **执行边界**：详细色彩、排印、留白、图片、组件、动效、文案、响应式、无障碍、性能和验收只认 `docs/UI_GUIDE.md`；其他治理文件只能引用，不复制具体数值。
- **可用性底线**：极简不得隐藏商品关键事实、表单错误、隐私说明和服务流程；高质量图片与动效不得牺牲性能、键盘操作、对比度或移动端体验。
- **后台边界**：管理后台以清晰、效率、状态完整性和无障碍为先，不进行全局奢侈品化改版。

### A.9 内容模板采用完整构图与统一合同 ✅
- **决策日期**：2026-08-17；项目负责人批准先统一模板产品与设计规则，再继续分批实施。
- **决策**：店铺装修保留 6 类、23 个运营内容模板；每个模板是一个完整根构图，先按用途和视觉角色设计桌面、平板、手机整体效果，再由模板特征决定素材、文字、行动、构图和专属编辑能力。
- **编辑顺序**：固定状态栏（模块名） → 图片素材 → 文字内容 → 商品关联 → 行动与关联 → 构图与设备 → 颜色与文字 → 模板专属功能 → 固定保存栏；无对应内容的分组隐藏，商品等业务模板先选择业务对象。
- **治理边界**：模板结构分为固定结构、受控预设、内容可编辑和业务对象关联；运营不得自由改变根构图，也不得在模板中复制商品、门店、活动等业务事实的第二套来源。
- **单一合同**：缩略图、Inspector、页面画布、公开 Renderer、客户端校验和服务端发布门禁必须消费同一仓库级纯机器合同；每个区块独立记录合同版本，旧草稿不得因普通保存而静默升级。
- **验收**：按完整模板而非单张图片尺寸判断视觉权重；电脑外部真实浏览器是最终视觉证据，内置浏览器只作诊断。
- **实施状态**：本条批准目标和边界，不代表 23 个模板已完成代码接入；历史设计卡与验收门禁已归档至 `docs/archived/2026-08-18-template-rules/CONTENT_TEMPLATE_STANDARD.md`（2026-08-18 归档）。

### A.10 设计知识支撑采用 design-library 素材库 ✅

- **决策日期**：2026-08-18；项目负责人批准：项目内不再维护独立的模板规则文档，设计理论与外部证据统一由仓库级素材库 `design-library/` 支撑。
- **结构调整**：`docs/CONTENT_TEMPLATE_STANDARD.md`、`docs/CONTENT_TEMPLATE_CONTRACT_DESIGN.md`、`docs/page-builder/template-composition-review.md`、`docs/page-builder/visual-audit-20260818.md` 归档至 `docs/archived/2026-08-18-template-rules/`（保留可回溯性，不物理删除）；`contracts/page-builder/content-templates.contract.json` 及配套生成/校验脚本是代码运行依赖，不归档。
- **知识分层**：`docs/UI_GUIDE.md` 仍是项目视觉唯一详细来源与约束标准；`design-library/` 提供通用理论、量化基线与品牌实测证据（原则 01/02 → 数值 03 → 证据 04 → 能力 05）；luxury-visual 技能引用该库作为理论证据层，其 `knowledge/benchmark-data.md` 改为指针文件，不再保留数据副本。库数值与 UI_GUIDE 冲突时，以 UI_GUIDE 为准。
- **AI 调用约定**：设计任务开始时按 `design-library/README.md` 的路由读取对应文件，不全量加载；实测数据引用需保留快照日期；竞品素材只用于论证方向，不复刻版式、商标、文案或受保护素材。
- **2026-08-18 追记**：用户判定 luxury-visual/templates/ 图片模板规则（8 比例骨架 + 7 类模板）错误——比例先行、缺编辑性设计——已物理删除并清理 SKILL.md 引用；替代方法论落盘 `design-library/06-jewelry-template-system.md`（角色 → 构图 → 槽位 → 比例仅作素材建议）。
- **2026-08-18 追记二**：模板设计框架规则定稿于 `docs/page-builder/template-design-framework.md`（三硬边界 + 九层必答 + 分级设计卡 + 操作流程），经法庭审校与四角色合议庭裁定；实例级版本快照为已知能力缺口，契约改动须先做改前影响盘点。

### A.11 多智能体 MCP 矩阵收敛与 token 治理 ✅

- **决策日期**：2026-08-19；背景：token 消耗审计发现 MCP 多处重复注册（用户级 `~/.claude.json` 与项目级并存、大小写重复项目键），以及 VS Code 侧无按需加载机制导致的全量 schema 注入开销。Claude Code 经 `ENABLE_TOOL_SEARCH=true` 按需加载工具 schema，两侧成本模型不同，收敛策略分面处理。
- **矩阵调整**：`.mcp.json`（Claude Code）拟补 chrome-devtools（历史会话实测高频使用：178 处引用、2026-08-19 当日仍在用）——**待项目负责人批准后执行**（2026-08-19 Claude 会话尝试修改 `.mcp.json` 被权限分类器按 CLAUDE.md 供应链规则拦停；批准后由集成者添加并完成启动验证）；`.vscode/mcp.json`（VS Code 智能体）收敛为 playwright、context7，移除 github/figma/tavily/chrome-devtools/prisma（figma/tavily/github 历史引用各仅 3 处，近乎未用）；`.codex/config.toml`（Codex）不变。用户级 `~/.claude.json` 删除 `G:/网站搭建2` 大小写重复键及其下 github docker MCP、删除与项目级重复的 playwright/context7/chrome-devtools 用户级注册，保留 prisma（备份 `~/.claude.json.bak-20260819`）。
- **变更记录（AI_TOOLING 第 3 节要求）**：chrome-devtools-mcp 经 `npx -y chrome-devtools-mcp@latest` 启动，与 Codex 侧 `.codex/config.toml` 同款命令；启动验证状态：**待下次 Claude Code 会话确认**；回退方式：删除 `.mcp.json` 中该条目。
- **EFFORT 同步**：`CLAUDE_CODE_EFFORT_LEVEL` max→high，除 `~/.claude/settings.json` 外已同步 cc-switch 数据库 providers（当前 claude 行）+ proxy_live_backup（备份 `cc-switch.db.bak-effort-high-20260819`），避免代理下次重生成 settings.json 时回滚；下次 cc-switch 重启或切换 provider 生效。
- **2026-08-19 追记（零操作自动护栏，脚本已实测）**：项目 `.claude/settings.json` 落地三层自动防护——① `autoCompactWindow: 200000`：上下文 200K 原生自动压缩（官方设置项，解决 `[1M]` 窗口下默认压缩阈值形同虚设的问题）；② PostToolUse/Stop hook（`.claude/hooks/token-guard.cjs`）：快照/截图每 3 次、读取/搜索第 25 次向模型注入节制提醒，会话转录 >2MB 或工具调用 >40 次时回合末建议 /clear（走 `hookSpecificOutput.additionalContext` 非阻塞路径，每会话最多 3 次，`stop_hook_active` 时静默防循环）；③ statusline（`.claude/hooks/statusline.cjs`）：状态栏常驻显示 模型·上下文%·输入token·成本估算。注入通道经官方文档核实（PostToolUse/Stop 的 exit-0 纯 stdout 不入模型上下文，必须走 additionalContext）。脚本全路径模拟测试通过（快照第 3 次触发/读取第 25 次/Stop 3MB/statusline 渲染/BOM 与异常静默兜底）；真实会话加载验证待下次启动确认。
- **2026-08-19 追记二（纪律扩散与水位口径）**：Token 纪律行为版扩散至 `AGENTS.md` 第 12 节与 `.github/copilot-instructions.md`（Codex/Copilot 无 hook/自动压缩机制，仅纪律文本可共享，自动化护栏仍为 Claude Code 专属）；水位口径统一为 200K 预算百分比——60%（120K）收尾、80%（160K）红线——statusline 显示 `XK/200K` 分档，Stop hook 从转录尾解析最近 usage 实算水位（嵌套 usage 对象须花括号配对截取），取不到时回退转录体积启发。合成与真实转录测试通过。

### A.12 开发端口所有权：3000 永远归宿主机后端 ✅
- **决策日期**：2026-08-19；项目负责人批准结构性解耦方案并已执行验证。
- **决策**：本地开发拓扑固定为「`3000` = 宿主机后端（vite 5173 的 `/api` 代理目标，开发唯一 API 归属）」；容器 server 改映射 `127.0.0.1:3002`（仅供验收时直连对比）；完整容器栈经 `:80` 自包含访问——任何人执行 `docker compose up` 都不再影响开发 API 归属。
- **背景事故**：容器/宿主机后端曾互抢 3000。2026-08-19 上午宿主机后端上传的媒体写入 `server\uploads`/`server\private-media`，13:50 容器栈接管 3000 后，DB 记录共享但文件在宿主机目录，后台图片全部 404（媒体存储分裂症状）。当日已 docker cp 双向补齐两套存储并验证。
- **否决方案（bind mount 共享媒体目录）**：会绕开 backup 服务挂载的命名卷（备份链路对新上传失明）、造成 dev/prod 存储语义分叉、Windows bind mount 存在 IO/权限/大小写语义差异。原则：异构环境（Windows 宿主机 + Linux 容器）之间选「确定性的隔离」，不选「共享可变状态」；端口是所有权边界。
- **配套**：`docker-compose.override.yml` 已改（3000→3002，含注释）；`AGENTS.md` §1 已加端口归属规则；宿主机后端运行方式沿用 `node dist/main.js`（cwd=`server/`，`nest dev` 本机 hang 约束不变）。
- **边界**：开发栈（宿主机目录）与验收栈（docker 卷）媒体仍为两份存储，跨环境做内容上传时需知晓归属；生产部署不受影响（override 仅本机生效，生产仍用命名卷）。

### A.13 ✅ public 静态资产边界与素材堆清理（2026-08-19）
- **决策**：`client/public/` 只承载 UI 资产（logo/placeholder/工艺图/editorial 品牌图/模板默认图）；商品图终局走后端媒体管道；未引用大体积素材一律移入 `.image-archive/` 隔离区（gitignore 收编、manifest 留档可回填），不得留在构建链。
- **触发**：rebuild-client 脚本首跑暴露构建上下文 2.2GB——`public/images/products` 836 个文件中 **793 个（2,024MB，95%）从未被任何代码/契约/DB 引用**；43 张活图 109.5MB 均为相机原图（单张 2.5MB+）直出给浏览器。
- **执行与实测**：793 孤儿移入隔离区（`orphan-manifest-20260819.tsv` 留档）；43 张活图备份原图后 Sharp 无损降采样 1600px（**109.5MB→2.7MB**，png 无损、仅去过度分辨率）；public 总量 2,355→110.6MB；**client 镜像 2.73GB→309MB（-89%）**；重建上下文 2.2GB→68.5MB（150 秒→5 秒）；80 首页滚动全量加载零 broken 图。
- **防复发**：`scripts/verify-public-assets.mjs` 守卫（200MB 警告/500MB 红线）挂入主 `test` 链；`.dockerignore` 收编 playwright-report/test-results；素材正确入口=商品图走 `/uploads` 媒体管道、设计素材走 design-library/。
- **引用判定纪律**：判孤儿前必须全维扫描（client/src + contracts + server 脚本 + DB `product_images` + `page_documents.puckData`）；PowerShell 5.1 读 UTF-8 无 BOM 源码会产出编码双胞胎字符串，**含中文文件名的判定必须用 ripgrep/字节比对**，当日已实际踩中（Test-Path 假阴性）。
- **待决（C-2）**：Home 静态兜底分支（`Home/index.tsx` 的 `puckData ? <PuckDocumentRenderer/> : 静态兜底` 双轨）存废——拍板后决定 43 张活图与 productFocus 硬编码数据的终局；媒体迁移基建已备（`server/scripts/migrate-product-media.ts` 支持两类来源）。
- **2026-08-19 追记三（迁移源治理修复，B 方案）**：A.13 执行隔离时未同步 `docs/IMAGE_MIGRATION.md` 第 31 条（"原图目录保持不变"），迁移源治理线断裂。修复：836 张完整原图（793 孤儿 + 43 活图原图，自 `.image-archive/`）经 SHA-256 基线 → 复制 → 逐文件复验（836/836 文件名+大小+SHA-256 全匹配）→ 删源，迁入 `server/migration-source/product-images/`（gitignore 收编）；`generate-product-image-manifest.js`、`product-media.service.ts`、`migrate-product-media.ts` 三处 legacy 指向更新；三方互证（基线 CSV、迁移后目录、新 manifest）SHA-256 集合一致。备份缺口如实记录：backup 容器不覆盖该目录，冷快照在 `backups/migration-source-snapshot-20260819/`，正式备份收编待拍板（详见 IMAGE_MIGRATION.md）。教训固化：**动任何治理文档管辖的资产前先读该文档；变更落地后必须同步更新对应治理文档**。

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

### D.7 🟡 checkout 认证与游客下单
- **现状**：`POST /customers/checkout`（`@Public`）是真实公开下单入口，upsert 无密码 `Customer`；`POST /orders` 注释"公开"但实际继承类级 admin-only。
- **待定**：公开下单入口是否整合/统一；`Order.userId`（死字段）与 `Cart.userId`（实存 `Customer.id`）的语义/命名是否修正。

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
- **决议 3（implementationStatus 语义澄清，不改动）**：该字段零逻辑消费（仅生成产物数据）；"planned" 的准确语义是「受控能力门禁（allowedControls 执行，P3 范围）未实施」，而非「渲染未真实化」——渲染真实性由 PLANNED_TEMPLATE_LAYOUTS 的 isSkeleton:false 保证。待 P3 实施门禁时随批次重估。
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
- 项目边界 / 任务分级 / 交付格式：`docs/PROJECT_GUARDRAILS.md`、`docs/AI_COLLABORATION_STANDARD.md`
