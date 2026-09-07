# 海川珠宝全量闭环动态台账

> 本文件只记录动态工作包、状态、证据与下一动作；产品、代码、运行态和验收事实仍以当前实现、`WORKFLOW.md`、`PROJECT_RULES.md` 及专项验收材料为准。

## 当前总目标

- 目标：把 2026-08-26 全量审计中的 P0、P1 与阻断性 P2 缺口推进到可验证的商业闭环和生产候选状态。
- 状态：`IN_PROGRESS / NO-GO`（Checkpoint 1–3 已形成本地候选证据；Checkpoint 4–7 仍受业务事实、审批、唯一目标环境和基础设施证据阻断）
- 基线分支：`codex/release-curation-20260814`
- 基线 HEAD：`4126441ef64c445eac7088194ef7ab8c02ff6128`
- 开始核对：2026-08-27（Asia/Shanghai）
- 集成者：当前主任务（单一执行者，无并行写入租约）

## 受保护工作区

- 分支相对上游领先 7 个提交。
- 启动时存在大量已修改、已删除和未跟踪文件；全部按用户或既有协作者资产保护。
- 禁止回退、清理、暂存、提交或覆盖未知改动；只在当前工作包的精确文件范围内追加最小修改。
- 当前 Docker 服务健康仅证明既有容器运行态，不证明它与当前源码、构建产物或候选合同一致。
- 2026-08-27 白名单运行态复核进一步确认：当前 client 容器记录的 image ID `sha256:3b186b…` 与配置名 `2-client` 均不在本机 10 个可检查镜像中；容器仍健康不代表其镜像可追溯。候选证据因此显式记录 `imageInspectable=false` 与 `SERVER_OR_CLIENT_IMAGE_NOT_LOCALLY_INSPECTABLE`，不再只笼统归为 OCI 标签不匹配。此只读核对没有读取容器或镜像环境变量。
- Windows 构建按当前 Vite 合同不清空 `client/dist`，一次低收益拆块实验撤回后仍遗留旧哈希生成物，使全目录 build SHA 在源码恢复原状后从 `bc34…` 漂移到 `5768…`。候选证据 Schema v5 已改为只哈希当前 `index.html` 的递归可达构建图；`dist/assets` 中不可达生成物只记录数量和字节并从身份哈希排除，不执行删除。完整 `client/public` 仍由独立公共资源治理哈希覆盖，不能借此隐藏动态 CMS 资产。

## 模块闭环矩阵

> 字母按目标 Master Prompt 的全链路口径判定；`F` 表示目标环境或正式业务事实不足，不能把括号中的本地工程成熟度外推成生产通过。当前没有模块达到 `A — CLOSED LOOP`。

| 模块 | 当前状态 | 已验证事实 | 当前断点 / 未验证 | 下一依赖 |
| --- | --- | --- | --- | --- |
| 候选身份、认证与 CI | `B — LOCAL CANDIDATE` | Cookie/CSRF/Origin/刷新合同、互斥 Playwright 项目、全量确定性门禁、本地工作树与构建指纹 | 工作树未冻结；运行镜像无匹配 OCI 标签；无独立验证者 | 凭据轮换批准、Git 冻结批准、正式 release workflow |
| 商品事实、目录、PDP 与 CMS | `F — UNKNOWN`（工程 `B`） | 公开序列化、销售模式筛选、SKU/库存适配、24 个内置兼容模板发布合同 | 正式商品 0；正式内容、媒体授权、联系与法务事实缺失 | 业务资料、目标环境、迁移与数据写入批准 |
| Guest/Customer Cart 与 Checkout | `C — PARTIAL` | 购物车资格/库存重验、错误态、登录合并与交易内核合同 | 加入时价格快照、结构化地址、配送/保价/税费/优惠及服务端试算未获合同批准 | P2 Schema/交易决策、正式商品与候选库 |
| Payment、Order、Inventory、Notification、Fulfillment、Refund、After-sales | `F — UNKNOWN`（工程 `B`） | 状态机、金额、并发、幂等、权限和部分可靠通知有确定性测试 | 真实商户、回调、证书、目标库、完整生命周期 Outbox、真实资金矩阵未验 | P2/P3/P5/P6 及目标环境 |
| Customer、Partner 与 Admin Operations | `F — UNKNOWN`（工程 `B`） | 客户/后台主要状态、权限和失败路径进入确定性浏览器门禁 | 合作资质合同、真实角色/数据、运营 SOP、审计与跨端追踪未在目标环境演练 | 合作材料决策、P3、P5、运营负责人 |
| UX、Trust、SEO、Analytics、Accessibility、Performance | `F — UNKNOWN`（工程 `C/B`） | 六档结构抽查、结构化数据 fail-closed、标准事件语义、包体预算 | 正式内容/CWV/INP、域名、HTTP 404、TLS、信任事实和媒体授权缺失 | 正式内容、域名、P4/P5 |
| Migration、TLS、Monitoring、Backup/Restore 与 Rollback | `F — UNKNOWN` | migration/环境/镜像静态合同、备份与恢复脚本语法、本地容器健康 | 目标环境不唯一；2 条 migration 待应用；无异地加密副本、隔离恢复、TLS 或不可变镜像 | P1/P4/P5/P7 与基础设施负责人 |

## 工作包

### HC-CLOSE-01 — 候选身份与自动化门禁收敛

- 状态：`CANDIDATE`（由当前执行者完成并自证，等待最终独立复审；不是生产运行态 PASS）
- 用户结果：公开、客户、后台三类测试不再混跑；浏览器测试遵循当前 Cookie 会话、CSRF 与身份域合同；工程门禁可对同一候选版本给出可复核结果。
- 允许范围：`client/playwright.config.ts`、`.github/workflows/quality.yml`、`client/tests/**`、本台账及本工作包新产生的非敏感证据文件。
- 不改范围：生产配置、真实密钥、数据库 Schema/migration、真实数据、交易开关、部署、Git 写入、用户草稿与媒体。
- 当前证据：
  - 浏览器夹具已迁移到 HttpOnly Cookie 会话与 `hc_csrf`；当前测试目录检索不到旧 `token`、`customerToken`、`jewelry-auth`、`hc_admin_csrf` 或 Bearer 登录事实。
  - `client/playwright.config.ts` 以显式清单把 58 个规格互斥分到 public 14 个、customer 5 个、admin 39 个项目，并在遗漏、重复或文件不存在时直接报错。
  - 2026-08-27 最新全量确定性 Chromium 门禁：500 项中 484 passed、16 条件性 skipped、0 failed（单 worker，10.4 分钟）。16 个跳过项依赖真实 API/存储态、特定 Mock 运行态或 analytics 构建运行态；它们不是生产环境验收证据。
  - 最新 `lint`、`typecheck`、389 项服务端测试（388 pass、1 个真实 MySQL 条件跳过）、build、内容模板、选款咨询、交易、页面发布、UI 颜色、发布静态图片合同均通过；Prisma schema 校验、备份/恢复脚本 Bash 语法、Compose 展开和环境合同也通过。关键身份、结账、支付、客户、运营和页面构建器边界已收敛到显式类型；当前 `client/src` 与 `server/src` 非测试生产源码的词法检索为 0 个 `any` / `as any`。这只证明显式类型逃逸已清零，不代表所有外部响应都已有运行时 Schema 校验。
  - 公共入口新增可达资源图预算门禁并已接入 CI：初始 JS 149.7 KiB gzip（预算 180 KiB）、初始 CSS 21.5 KiB（预算 30 KiB）、最大可达 JS 199.7 KiB（预算 220 KiB）、最大可达 CSS 31.9 KiB（预算 40 KiB）；公开入口没有预加载后台 Dashboard、EditorWorkbench 或 Puck editor。该结果证明本地构建预算，不替代正式内容和真实网络下的 CWV。
  - 新增 `scripts/generate-candidate-evidence.mjs` 与 `artifacts/candidate-evidence/current.json`，把 HEAD、全部已修改/删除/未跟踪内容、模板合同、migration bundle、三份锁文件、两端构建、公共资源树、公共资源治理审计、静态发布合同和运行容器白名单身份字段纳入同一可重复自检。工作树指纹以证据 JSON 为唯一动态记录，避免文档自引用导致漂移；当前 Client 可达构建图 SHA-256 为 `b70d4dbe8fd5f4e7c6264714b617b09155108f6bf58e03290b346e7b83b4e36e`，server build 为 `812079ee4b285cbe2412605d276833fdf7616165692c6beb6e072fcb00839d44`，migration bundle 为 `8bed207694a8a23155f5f8b84cd631f79c9882bac6b55827435fa7fdd030cd81`；同一源码连续重建后原样自检通过。
  - 修复动态审计与干净 CI 的所有权冲突：`artifacts/` 按规则不入 Git，因此 `npm test` 不再要求被忽略的本机 `current.json`。公共资源和运行时所有权脚本新增无写入 `--verify`，CI 现场重算缺失资源、导入、Client/API 匹配、Controller 可达性和 Prisma 关系不变量；本地 `--check` 仍负责对候选 JSON 做精确漂移验证。
  - 该清单明确标记 `LOCAL_WORKTREE_CANDIDATE`、`releaseEligible=false`：源码基线 HEAD 仍为 `4126441ef64c445eac7088194ef7ab8c02ff6128`，当前有 317 个 tracked 变化、38 个 untracked 文件和 7 个删除项。它能发现本地候选漂移，但不能替代经批准的 Git 冻结、GHCR digest、SBOM、provenance、签名证明和正式 `release-manifest.json`。
  - 运行态身份：既有 `jewelry-client` 容器镜像 ID `sha256:3b186b6bebacc5db242bd5034e4fd3df665f02413dcd3c13768fbead5ec3700e`，`jewelry-server` 为 `sha256:58b225d773c78c97f280f80c35cec1534c8bc99d43e7cd9727fcc93f583941f3`；容器健康，但两端镜像均没有与当前 HEAD、组件和 migration bundle 对齐的 OCI 身份标签，因此 `runtime.candidateIdentityVerified=false`，不得把它们当作当前候选运行证据。
  - 安全事件：一次本地 Docker 诊断错误地把完整容器检查结果输出到当前任务工具记录，其中包含数据库口令环境变量值。该值未复制到项目文件，也不在候选证据清单中；但必须视为已暴露。轮换本地数据库应用/备份凭据、同步受控环境并重启验证会修改环境与数据库凭据，未经明确批准未执行。
  - 环境合同警告：微信支付证书变量虽已映射，但服务端没有只读证书挂载，`readyForRealWechatPayments=false`；真实支付必须继续关闭。
  - 2026-08-27 使用官方 npm registry 对 root/client/server 三份生产依赖树重新执行审计，分别覆盖 1、239、317 个生产依赖，均为 0 个已知漏洞且退出 0。本机默认镜像 registry 不实现 npm audit endpoint，最初的 404 不能作为漏洞结论；最终证据来自显式官方 registry 的成功响应。
- 验收：
  - [x] 浏览器测试中不存在把 localStorage/Bearer 当作现行登录事实的夹具或断言。
  - [x] public/customer/admin 三类确定性测试边界互斥且覆盖全部纳入 CI 的规格。
  - [x] Cookie、CSRF、401 刷新与身份域有对应的客户端和服务端确定性证据。
  - [x] lint、typecheck、单元/合同测试、build、三类确定性 Playwright 门禁通过。
  - [x] 分别记录源码、受保护差异、构建和既有运行态身份，不混称为同一候选。
- 下一动作：获得凭据轮换批准后先处置本地数据库口令暴露；最终复审时由独立验证者重跑关键门禁；取得唯一目标环境、真实 API 凭据与存储态后补齐 6 项真实链路规格，并从获批精确提交重新构建可追溯镜像。

### HC-CLOSE-02 — 商品、内容与公开体验闭环

- 状态：`WAITING_EXTERNAL_INPUT`（代码侧硬门禁已加强；正式业务事实和目标库写入未获授权）
- 依赖：HC-CLOSE-01 候选身份可追溯。
- 已完成的代码闭环：
  - 价格过滤或价格排序现在强制限定到 `DIRECT_PURCHASE`，不再使用询价/展示商品的不公开内部价格形成排序或筛选侧信道；服务端 9 项公开查询合同及客户端 Mock 回归通过。
  - 发布校验新增“正在完善 / 内容建设中 / 即将上线”占位文案硬拦截，并同时覆盖区块内容和 SEO metadata；页面合同 20 项通过。
  - 发布前 CLI 新增“至少一件 `PUBLISHED + PUBLIC + READY` 正式商品”和“至少一件同条件直购商品”门禁，空目录不能再被判为技术就绪；CLI 合同 6 项通过。
  - 公开商品客户端适配层已从无约束断言改为运行时收窄：只接受正整数商品/分类 ID、已知销售模式与库存策略、字符串媒体和属性值，畸形记录在进入目录状态前即被过滤；新增混合畸形响应回归后，公开目录分页合同 8/8 通过。该防线只保证异常响应 fail closed，不替代正式商品数据治理。
  - 商品列表、PDP、推荐和装修 Renderer 共用的 `/images/products/placeholder.svg` 原先没有实际文件；现已补为中性灰阶图片占位，不包含珠宝造型、品牌 Logo 或虚假商品摄影，并以真实 Chromium 800×1000 渲染复核。公共资源 CI 会校验逐文件审计与所有未解释的生产静态路径，防止该类 404 回归。
- 当前本机候选库只读证据（不是已确认的目标生产环境）：
  - migration：仓库 41、已应用 39，待应用 `20260825110000_add_personal_content_template_content_defaults` 与 `20260825215500_add_release_foundation_schema`；未经数据库迁移审批未执行。
  - 公开商品 0、正式直购商品 0、分类根节点 5；交易、购物车、支付开关均为关闭。分类存在不能替代可售商品闭环。
  - 店铺资料缺少 `contactPhone`、`contactEmail`、`contactAddress`、`businessHours`；不得由 AI 编造。
  - `home` v39 与 `custom` v1 含“正在完善”占位文案，按新门禁重新验证失败；`catalog` v9 缺当前发布签认；`contact` 无已发布 revision。`about` v4 与 `products` v1 当前重新验证通过但仍带兼容性 `content-template-legacy` 信息。
- 当前阻断：需业务所有者提供并签认首发商品/SKU/库存/配送/价格、正式品牌与法务文案、联系方式、媒体来源和授权编号；需明确唯一目标环境，并分别批准目标库 migration 与真实数据写入。未经批准不创建、覆盖或批量修改真实业务数据。
- 下一动作：外部事实到位后通过现有后台逐项录入、预检、发布并执行媒体巡检与桌面/移动真实浏览器验收；在等待期间继续处理独立的购物车、结账和交易代码缺口。

### HC-CLOSE-03 — 购物车、结账与交易闭环

- 状态：`WAITING_APPROVAL`（安全读取闭环已完成；订单金额、地址与配送合同需交易/Schema 批准）
- 依赖：目标环境、正式商品事实和高风险业务变更授权。
- 已完成的代码闭环：
  - 购物车读取逐行重新核对商品发布/可见性/直购资格、SKU 启用与归属、数量规则和 Inventory 当前库存，并返回 `AVAILABLE / PRODUCT_UNAVAILABLE / SKU_UNAVAILABLE / OUT_OF_STOCK / INSUFFICIENT_STOCK / QUANTITY_INVALID`。
  - 购物车与结账 UI 对未知或不可用状态 fail closed，显示可处理原因并阻止继续结账；变更数量成功后重新读取服务端事实，不在本地伪造新状态。
  - Cart、PDP、Checkout 与支付对话框的客户端错误/响应边界已改用显式类型和 `unknown` 失败路径；公开受控商品媒体端点有明确 `mediaUrl` 类型，不再依靠页面内 `as any` 读取。Cart 与 PDP 当前非测试源码的 `any`/`as any` 检索均为 0。
  - 证据：购物车服务合同 7/7、相关客户侧 Chromium 33/33；本轮目录/PDP/购物车/支付/售后组合 Chromium 首次 61/62（空白文档启动抖动），失败项单独复跑 1/1、同一完整组合原样复跑 62/62；最新 lint、typecheck 通过。该复跑证明当前确定性行为，但不替代正式商品与目标环境交易证据。
- 仍需批准的交易设计：
  - 为 Cart 增加加入时 `unitPriceSnapshot`（以及必要的货币/时间字段），读取时才能可靠区分价格上涨、下降与未变化；该项修改 Prisma Schema/migration。
  - Checkout 改为服务端校验当前客户拥有的结构化 `addressId`，把收件人/手机/省市区/详细地址写成不可变订单快照；需决定是否保留自由文本兼容期。
  - 建立服务端结算试算与不可变金额分解，明确商品小计、优惠、配送、税费、调整与应付金额；配送模板/保价规则如何计费及哪些地区可送达必须由业务签认。
  - 客户优惠券选择、结算试算与下单原子重验虽然已有部分内核，公开入口和最终金额展示仍需按批准合同接线。
- 当前安全事实：订单创建会按当前 SKU 价格和库存重新核对，并保存 OrderItem 名称/货号/图片/SKU/单价/小计快照；这不能替代创建前的客户可见结算试算，也不能识别购物车加入后的价格变化。

### HC-CLOSE-04 — 客户、后台、合作方与运营闭环

- 状态：`CANDIDATE / WAITING_APPROVAL_AND_EXTERNAL`
- 已形成的本地候选证据：
  - 客户账户会话、资料、地址、心愿单、咨询、订单、通知、评价、售后，以及对应后台运营入口已纳入当前确定性浏览器门禁；最新全量 Chromium 结果为 484 passed、16 条件性 skipped、0 failed。
  - 客户中心重复 `main` 地标已移除；在 `1920×1200`、`1440×900`、`1024×768`、`768×1024`、`390×844`、`375×812` 六档视口复核为单一 `main`、单一 H1、无横向溢出。
  - 交易与运营关键页面的 Ant Design 静态消息调用已改为应用上下文；分类、属性、员工、标签和仓库弹窗表单的挂载顺序已稳定，线索人员下拉不再使用废弃回调。相关公开目录、权限、库存、员工、属性、分类、线索、标签、AI 分类、评价和仓库定向 Chromium 回归 26/26 通过，未再输出这批已定位警告。
  - 通用 API 响应解包器的输入和默认泛型已由 `any` 收窄为 `unknown`，并在读取双层 `data` 或分页 `list` 前执行运行时对象/数组判断；类型门禁因此暴露并补齐 AI 分类与合作申请分页响应类型。最新 lint、全量 typecheck 通过，解包边界合同 Chromium 3/3、AI 分类请求合同 Chromium 2/2 通过；该改动保持原有解包语义，不等同于所有业务接口都已具备运行时 Schema 校验。
  - `api.ts` 的注册、合作申请、商品、购物车、支付、履约、退款、售后及 PageDocument 等入口已用与现有服务端 DTO 对齐的输入、查询与响应类型替换显式 `any`；合作方客户与员工控制器请求也已接入守卫确认后的 `CustomerRequest` / `StaffRequest`。当前 `api.ts` 以及全部 `client/src`、`server/src` 非测试生产源码的词法检索均为 0 个 `any` / `as any`；合作申请输入与状态完整性合同 13/13 通过。动态 JSON、Puck 文档和外部响应仍通过 `unknown`、项目类型及运行时守卫进入系统，未把词法清零误报为完整 Schema 验证。
  - 页面编辑器媒体字段的消息与删除确认同样已迁移到应用上下文；编辑器视觉与交互验收 25/25 通过，内容模板合同 24/24、22 个 Inspector Schema 自检和页面构建器保存/校验/发布/公开快照专项门禁通过。PageDocument/发布/草稿恢复组合最初在 10-worker 下连续两次因同一 SPA 切页用例的准备时序得到 84/85，而单 worker 为 85/85；根因是测试在 650ms 防抖初始校验完成前清空记录，不是旧内容写入新 `pageKey`。测试改为等待初始发布资格完成后，失败用例 10 路并发重复 10/10、完整 10-worker 组合 85/85 通过，切页后的零写入与零旧页校验断言保持不变。测试仍按设计记录 Puck 全量 `set` 的性能警告，当前只在需要完整对象历史恢复的 Undo/Redo 路径出现，未把它误报为已消除。
  - 退款、履约与售后控制器的员工身份边界已统一为守卫确认后的 `StaffPrincipal`，不再允许缺失员工 ID 静默进入操作审计；这三个服务端目录当前非测试源码的 `any`/`as any` 检索均为 0。退款、履约、售后状态与一致性合同 37/37 通过，未改变既有角色和状态机规则。
  - 推荐接口的客户身份、商品查询选择集和序列化结果已改为由 Prisma 选择集推导的精确类型，商品 ID 由控制器整数管道校验；推荐服务与客户端相关目录当前非测试源码的 `any`/`as any` 检索为 0，推荐客户端合同 2/2 通过。
  - 合作方申请状态完整性已有服务端合同；现有可靠通知闭环只覆盖订单创建与支付确认，不把普通异步通知误称为强一致交易事实。
- 未闭环：合作方资质/许可/材料上传缺少获批的数据合同与媒体治理；订单全生命周期可靠通知扩展会改变事务与重试语义，需 P3 批准；仍缺目标环境真实角色、真实接口、审计日志和运营演练证据。
- 下一动作：按决策包批准 P3 及合作方材料范围后实施；在唯一目标环境完成最小权限、失败路径、审计追踪和运营手册演练。

### HC-CLOSE-05 — UX、SEO、性能、无障碍与生产就绪

- 状态：`LOCAL_CANDIDATE / WAITING_EXTERNAL_AND_INFRA_APPROVAL`
- 依赖：正式内容、唯一目标环境、域名/TLS/渠道/恢复演练授权。
- 已形成的本地候选证据：
  - 公开布局、商品详情与联系页的 canonical/noindex、Organization/Product/Breadcrumb/FAQ 结构化数据改为只使用当前可验证事实；无域名或页面无效时 fail closed，不生成伪 canonical。
  - 分析事件覆盖商品列表、搜索、加购、移除、购物车、结账、支付信息、购买和退款；`purchase` 只在服务端订单为 `PAID` 后触发，`refund` 只在退款 `COMPLETED` 后触发，并按业务 ID 做会话内幂等。
  - 六档视口、六条代表路由共 36 个组合完成结构检查：无横向溢出、单一 H1、控件有标签，受保护/未发布/404 页面正确 noindex。当前 Vite 源码预览因宿主机 3000 端口后端未启动而安全返回 502，因此该证据只证明结构与失败态，不证明真实业务链路。
  - 审计记录的匿名客户中心移动标题问题已用当前源码在 `390×844`、`375×812` 复现：H1 被拆成四行并挤压首屏账户入口。局部移动端排印修正后，同一文案稳定为两行，登录/注册入口回到首屏核心区域；未改字体、品牌色、文案、认证或表单。Cart 与 Checkout 的加载、失败和空态已补齐页面级 H1、`status` / `alert` 语义，390px 下保持单一主标题、交互元素不越界。定向交易语义 3/3、完整公开响应式规格 62/62 通过，前后截图保存在 `artifacts/visual-audit-20260827/`。该证据关闭这些局部视觉/语义缺口，不外推为正式内容下的全站 WCAG 验收。
  - 本地生产预览 Lighthouse：空内容首页桌面/移动 a11y 95、Best Practices 96、SEO 63；隐私页移动 a11y 96、Best Practices 96、SEO 100。首页 LCP 255ms、CLS 0.09，但无 CrUX、无正式内容、未测 INP，不能作为生产性能结论。
  - 最新服务端与客户端生产构建通过；包体门禁复测为公开首屏 JS 149.7/180.0 KiB gzip、CSS 21.5/30.0 KiB，最大可达 EditorWorkbench JS 199.7/220.0 KiB、CSS 31.9/40.0 KiB。构建仍报告 EditorWorkbench 原始体积超过 Vite 通用 500 KB 提示；它不进入公开首屏预加载。以生产构建静态 import 闭包复测，进入编辑器相对公开初始闭包约增加 545,530 bytes gzip；把发布版本和页面设置抽屉延后加载的实测只降到 539,738 bytes（约 1.1%），却增加首次操作请求与维护状态，因此该尝试已撤回，不以拆块数量冒充性能闭环。编辑器首次真实网络加载与交互性能仍须在候选环境单独验收。
- 公共资源树与 JS/CSS 包体分开治理：`client/public` 当前 101 个文件、67.06 MiB、34 个文件超过 1 MiB，资源树 SHA-256 为 `7441cfdf228052d6d49eec7b51e45a3a2578c4791cc1d3211c18facf98053e1a`。`artifacts/public-asset-audit/current.json` 对每个文件记录哈希、大小和静态引用；当前生产源码静态引用 6 个、测试专用引用 11 个、无静态引用 84 个、字节级重复 0 组、未解释缺失路径 0 个。无静态引用不能排除 CMS/数据库动态引用，权属与商用授权仍 UNKNOWN；未经逐项确认，不删除、覆盖、移动或批量转码。
- 未闭环：正式域名与 sitemap/canonical、未知 SPA 路由真实 HTTP 404、TLS/HSTS、微信证书只读挂载、字体授权与本地化、67.1 MB 受保护媒体治理、正式内容下的真实 CWV、目标环境备份恢复和可追溯镜像。
- 下一动作：取得 P1、P4、P5 与正式业务内容后，在隔离候选环境完成 TLS、恢复演练、真实浏览器、无障碍、SEO、性能和安全验收；未经批准不改基础设施、核心字体或受保护媒体。

### HC-CLOSE-05A — P1/P2 核心模块可维护性

- 状态：`WAITING_ARCHITECTURE_SCOPE_APPROVAL`（不阻塞已验证的本地功能，但 P1 尚未关闭）
- 当前事实：`HomepageConfig/index.tsx` 4826 行、`client/src/services/api.ts` 2185 行、products/page-modules/orders 三个服务分别 2745/2644/2803 行，合计约 13,203 行。它们不是同一种问题：前两者混合 UI/Mock/领域客户端，后三者混合查询、序列化、媒体、发布、交易、库存或运营职责。
- 不采用的伪闭环：仅移动类型、改文件名、加 barrel 或把同一大函数搬到新文件，不会降低事实源、调用链或回归风险；当前 356 个受保护工作树变化尚未冻结时做全量机械拆分还会扩大审查面。
- 推荐批次：
  1. `api.ts` 按 auth/product/customer/trade/page-document/marketing 建立领域客户端文件，原入口只做兼容 re-export，Mock 与真实请求仍使用当前单一配置；
  2. HomepageConfig 先提取无持久化副作用的模板库/预览/Inspector 组件，Puck 数据、草稿、保存和发布控制器保持单一所有者；
  3. products 拆公开查询/序列化、媒体、生命周期与 SKU 边界；page-modules 拆个人模板、文档验证/持久化、方案；orders 拆库存预占、结算、查询、履约协调；每批保持现有模块、DTO、事务与外部 API 不变。
- 审批原因：这会形成新的内部文件和服务边界并大规模迁移现有代码，命中架构与范围审批；订单/库存尤其不能靠“行为不变”口号绕过高风险审查。
- 验收：每批先冻结调用图与公共导出，再通过 lint/typecheck、对应服务合同/并发测试、受影响 Playwright 和全量 build；发现事务、权限、序列化或 Puck 草稿语义变化即回退该批。Git 写入、文件删除和旧入口移除仍另行批准。
- 法律助理意见：倾向在当前候选先冻结并取得 `P-ARCH` 分批范围批准后实施，置信度高；不建议现在一次性拆五个核心文件，也不建议以表面行数下降冒充 P1 关闭。

### HC-CLOSE-05B — 运行时所有权与断开项治理

- 状态：`PARTIAL_RESOLVED / WAITING_REMAINING_DISPOSITION`（店铺装修零消费者文件已按 2026-08-31 当前授权清理；公开旧页与候选 API 仍等待各自精确处置）
- 已形成的证据：
  - `scripts/audit-runtime-ownership.mjs` 从 `client/src/main.tsx`、`server/src/main.ts` 和全部 `client/tests` 夹具建立静态 import 图，并生成 `artifacts/runtime-ownership-audit/current.json`；稳定检查忽略 `generatedAt`，当前无未解析 Client/Server import。
  - 359 个 Client 源文件中 356 个生产可达；75 个页面文件只有旧 `About`、`Custom` 两页生产不可达，另 1 个不可达源文件是必须保留的环境声明 `vite-env.d.ts`。当前 `/about`、`/custom` 路由由 `PublicLayout` PageDocument Renderer 所有，旧页没有生产或测试 importer，但仍需先迁移唯一内容并获得精确删除批准。
  - 2026-08-31 已重新生成并核对消费图：`InspectorQuickActions.tsx`、`previewGeometry.ts` 及同批确认无消费者的固定模板旧工作区组件、旧 Inspector 辅助组件和 `blockTemplateStore.ts` 已删除；死导出与对应 CSS 同步清理。`VisualEditorToolbar.tsx` 仍是 Playwright 夹具资产，`vite-env.d.ts` 仍是环境声明，二者明确保留。
  - 37 个 Controller 全部由 Server 入口可达。249 个 Client 静态 API 调用全部匹配；277 个 Server 路由中 28 个没有直接静态 Client 调用，脚本当前将其中 14 个标记为仍需消费者复核；静态图不能单独授权 API 退役。
  - 76 个 Prisma 模型中 19 个没有直接 delegate 调用，但全部仍有 Schema 关系；不存在同时无 delegate 使用且无 Schema 关系的模型，不提出 Schema 删除。
- 安全裁决：`POST /payments/:orderId/channel` 保持无 UI 的安全暂停，等待 P6；`DELETE /products/:id` 当前只返回禁止删除冲突，保留兼容拒绝；发布质量报告是只读运营接口。其余 6 条候选端点需要外部消费者和 API 版本窗口确认，不能仅凭静态图删除。
- 精确处置与授权入口：`docs/plans/2026-08-27-runtime-ownership-disposition.md` 与决策包 `P-ORPHAN-FILE / P-ORPHAN-PUCK / P-ORPHAN-API`。
- 下一动作：店铺装修清理需保持消费图、typecheck、合同和真实浏览器路径通过；其余公开旧页与候选 API 继续等待精确批准。当前清理不授权改 Schema、运行 migration、删除公开旧页或退役 API。

### HC-CLOSE-06 — 最终复审与 Go/No-Go

- 状态：`NO-GO / WAITING_PREREQUISITES`
- 停止条件：无开放 P0；P1 全部关闭或有用户批准的延期；阻断性 P2 关闭；真实环境证据、恢复证据、桌面/移动体验与最终评分达到总目标要求。
- 当前判定：当前工作区已达到可复核的本地工程候选，但尚不是生产候选。正式业务事实、交易/Schema 决策、可靠通知、唯一目标环境、迁移、TLS、恢复演练、外部渠道、真实支付和不可变发布身份均未同时成立。
- 最终签认必须绑定唯一目标环境、不可变版本或镜像 digest、维护窗口、回退点、业务/技术/运维批准人与时间；空白字段、角色名称或 Compose 默认值均不构成批准。
- 首发能力必须逐项记录“开放 / 关闭 / 延后”，至少覆盖品牌与内容、选款咨询、客户账户、购物车与结算、支付与退款、外部通知、物流和英文站；任何一项不得从代码存在或默认开关推断。
- 证据责任必须覆盖域名/DNS/TLS/CORS/CSP、Secret 来源与轮换、首管理员、监控告警、备份恢复、migration、正式商品与六页内容、SiteSettings、SEO、媒体商用权利，以及真实交易渠道；缺少责任人或目标环境证据时保持 No-Go。
- 决策入口：`docs/plans/2026-08-27-goal-mode-closure-decision-packet.md` 中的 P1–P7。P1–P5 是进入候选环境闭环所需的最短审批链；P6 仅在假渠道全通过后单独批准真实外部渠道/小额资金验证；P7 只能在全部证据齐备后作生产 Go/No-Go。

### HC-DOC-CARRY-2026-09-08 — 历史审查未决线索承接

- 状态：`WAITING_REVALIDATION_OR_APPROVAL`。本节只防止历史文档删除后丢失未决线索，不把 2026-08-27 的旧代码、数量、优先级或方案恢复成当前事实；执行前必须按当前代码、合同和业务决定重新核验。
- **促销消费**：历史审查发现营销促销只有管理 CRUD、没有进入价格或结算消费者。重新核验后应选择隐藏/标注“仅记录”或形成获批的交易金额合同，不能直接接入定价。
- **AI 分类回写**：需决定“确认”只形成审计记录，还是成为商品分类变更命令；若回写，必须定义目标分类、商品范围、并发、权限与操作审计。
- **页面素材事实源**：历史实现把页面素材列表保存在单浏览器 `localStorage`，不能作为跨管理员运营事实源。若仍成立，需决定服务端模型/API、权限、引用检查、删除语义和迁移。
- **公开字段矩阵**：公开序列化器与字段矩阵曾存在冲突；应逐字段核对实际消费者与隐私风险，先更新权威矩阵和合同，再收窄公开 DTO。
- **支付轮询生命周期**：涉及 in-flight 防重、终态幂等、超时、重复响应和父级回调稳定性，属于支付专项；未获支付行为批准不得作为普通前端修补实施。
- **请求与流恢复**：商品数据、PageDocument、单实例 Renderer 流及后台列表的 stale、取消、降级、手动重试和轮询恢复合同需按当前消费方重新核验，不预设强行统一 Hook。
- **测试与脚本可见性**：历史未跟踪 spec 数量、孤儿脚本和 CI/Node 结论均属于旧工作树快照；后续只按当前 Git 状态、脚本运行结果和所有权形成独立批次，不沿用旧数量。
