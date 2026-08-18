# 未提交改动的发布分批治理计划

> 盘点日期：2026-08-14（工作区快照，不替代提交前的再次盘点）
> 目的：在多人并发、工作区已有大量用户资产的情况下，将当前未提交改动按可独立验收的领域拆分。本文**不授权**暂存、提交、迁移、安装依赖、部署或删除文件。

## 1. 当前快照与总原则

- 当前已跟踪差异为约 150 个文件、`16,800` 行新增与 `8,337` 行删除；另有未跟踪的前端区块、服务端业务模块、迁移、测试、CI、脚本和文档。由于多人并发，实际数量在执行本计划前可能已经变化。
- 目录摘要显示，已跟踪改动主要集中在 `client/src`（76 个）与 `server/src`（44 个）；未跟踪改动主要集中在 `client/src`（36 个）、`server/src`（35 个）、`client/public`（24 个模板 SVG）、`server/prisma`（5 个）和 `client/tests`（5 个）。
- 现有验收矩阵已将公开商品、公开设置/隐私、选款咨询列为代码层已完成或待运行验证；页面装修器（Puck）仍需浏览器工作台实测；客户交易入口必须保持冻结。参见 [开放问题](open-issues.md)、[功能完成度矩阵](feature-completion-matrix.md)、[端到端流程矩阵](end-to-end-flow-matrix.md) 与 [当前状态](../CURRENT_STATE.md)。
- **不按文件名推断删除。** 本计划中的“候选”仅表示不得自动提交，绝不表示可删除。
- 每一批在实际 `git add`、`git commit` 前都需要用户明确批准；所有 Git 写入均受项目规则约束。不得用全仓格式化来解决差异噪声。

### 1.1 共享文件的拆分规则

以下文件同时含多个领域的改动，不能以“整个文件”自动归属任一批次：

| 共享文件或目录 | 处理方式 |
| --- | --- |
| `client/src/App.tsx`、`client/src/services/api.ts`、`client/src/main.tsx` | 逐段审阅；按路由、接口或初始化责任归属。必须以人工逐块暂存（interactive staging）或等价的人工审阅方式拆分。 |
| `server/src/app.module.ts`、`server/src/main.ts` | 模块注册、全局守卫/中间件可能横跨公开站、Puck、咨询与交易；逐段归类，不允许整文件猜测归属。 |
| `server/prisma/schema.prisma`、`server/prisma/seed.ts` | 作为数据库批次的唯一事实来源；应用代码批次只引用相应模型，不复制 schema 变更。 |
| `client/package.json`、`client/package-lock.json`、`server/package.json`、`server/package-lock.json`、根 `package.json` | 只放入依赖/配置批次；功能批次不得隐含带入依赖升级。 |
| `client/src/pages/public/Catalog/index.tsx`、`client/src/components/common/SecureImage.tsx`、产品/上传服务 | 前者的选款提交段归“选款咨询”，公开目录展示段归“公开站 P0”；后者按接口调用及鉴权影响逐段审阅。 |

## 2. 统一质量门与换行符治理

### 2.1 盘点结论

- 本次只读检查中，`git diff --check` 退出码为 `0`，未发现行尾空白或冲突标记。
- Git 对大量已跟踪文件发出“工作副本下次被 Git 处理时将 LF 替换为 CRLF”的警告，涉及前后端源文件、文档、配置和 CSV。
- 普通 `--numstat` 与 `--ignore-space-at-eol --numstat` 的合计差异仅为 4 行（25,137 对 25,133），因此**目前没有证据表明本次差异主要由行尾空格造成**；但 LF/CRLF 警告覆盖范围很广，仍属于潜在换行符噪声和未来误提交风险。

### 2.2 每批的前置检查

在用户批准任何 Git 写入后、每一个批次开始前执行以下只读步骤，并将结果附在该批次审阅记录中：

```powershell
git status --short
git diff --check
git -c core.safecrlf=false diff --stat
git -c core.safecrlf=false diff --ignore-space-at-eol --stat
```

若某文件仅出现换行符变化，或语义差异与换行符无法清楚区分：从该批中移出并记录为“待人工处理”；不要格式化全仓、不要批量转换行尾。对批次内实际选中的文件，还应在暂存前逐文件审阅差异，而非按目录通配符盲目暂存。

## 3. 分批计划

下表中的“范围”是审阅范围，不是可直接执行的暂存命令。`*` 表示同目录下与该领域直接相关的文件，仍需逐文件/逐段确认。

### 批次 1：已完成的公开站 P0 修复

| 项目 | 内容 |
| --- | --- |
| 目标 | 将公开商品访问、公开设置/联系信息降级、隐私入口、公开页面 loading/empty/error 状态及公开媒体安全访问作为一个可验收单元。该批不包含选款提交段、Puck 编辑器段和交易写入段。 |
| 范围 | 公开路由与布局：`client/src/pages/public/{Home,ProductList,ProductDetail,Search,Contact,About,Privacy}/**`、`client/src/components/{common/ErrorBoundary.tsx,common/SecureImage.tsx,layout/PublicLayout.tsx,common/ProductCard.tsx}`、`client/src/hooks/useProductData.ts`、`client/src/utils/productImage.ts`、公开展示相关 `client/src/config/**`、`client/public/{robots.txt,sitemap.xml}`；服务端公开商品/媒体/设置/上传/咨询预约的相关段：`server/src/modules/{products,settings,upload,inquiries}/**` 和必要的全局错误/安全响应段。`Catalog/index.tsx` 仅纳入非选款提交的公开展示段。 |
| 依赖与风险 | 依赖数据库批次中的产品、媒体与站点设置模型；正式域名、真实联系资料仍未确认，robots、sitemap 与结构化数据不得臆填。`SecureImage`、公开字段白名单、权限分支须回归验证，避免公开泄露非公开商品或媒体。 |
| 验证命令 | `npm run lint`；`npm run typecheck`；`npm run build`；`npm test`；在本地测试环境运行 `cd client; npm run test:e2e -- --project=public-chromium`。同时人工核验公开商品列表/详情、搜索、联系页、隐私页的 loading、empty、error 状态及 1440/1024/768/390 视口。 |
| 合并/提交前置条件 | 数据库变更已人工审阅且迁移顺序明确；公开 API 不返回未授权字段；真实环境不写入测试咨询；正式域名与运营联系资料保持空值安全降级，或已由业务方书面确认。 |
| 用户审批 | **需要。** Git 暂存/提交；若包含依赖变更则还需依赖审批；任何部署和真实环境验证另行审批。 |

### 批次 2：页面装修器 / Puck

| 项目 | 内容 |
| --- | --- |
| 目标 | 发布 Puck PageDocument 渲染、区块契约、编辑器配置、模板和预览资源；保持首页无已发布文档时的安全兜底。 |
| 范围 | `client/src/page-builder/**`；`client/src/components/blocks/**`；`client/public/svg/template-*.svg`；页面装修器相关的 `client/src/pages/admin/{HomepageConfig,SiteContent}/**`、首页渲染段；`server/src/modules/page-modules/**`。相应测试为 `scripts/verify-page-builder-contract.mjs`、`scripts/verify-page-builder-publish.mjs`、`client/scripts/verify-*-render.mjs`、`client/scripts/verify-*-batch.mjs`、`client/tests/core-template-homepage.spec.ts`。 |
| 依赖与风险 | 依赖批次 5 中 PageDocument/版本约束迁移。`App.tsx`、`api.ts`、`app.module.ts` 的共享段必须拆开审阅。模板 SVG 与预览图须确认来源和商用授权；编辑器“代码存在”不等于所有字段均可视化可用。 |
| 验证命令 | `npm run typecheck`；`npm run build`；`npm run test:contracts`；`node scripts/verify-page-builder-publish.mjs`；视依赖就绪情况运行 `cd client; npm run test:e2e -- core-template-homepage.spec.ts`。浏览器人工验收编辑器：新建/编辑、区块插入、图片/颜色/商品字段、保存、发布、前台渲染、发布失败提示和无发布文档兜底。 |
| 合并/提交前置条件 | PageDocument schema/migration 已通过人工 SQL 审阅；模板资源来源和体积可接受；编辑器工作台实测完成或明确标注为未验证，不能以静态检查替代。 |
| 用户审批 | **需要。** Git 暂存/提交；如需补装浏览器或依赖，另需依赖审批；迁移应用另需数据库审批。 |

### 批次 3：选款咨询与合作商申请

| 项目 | 内容 |
| --- | --- |
| 目标 | 发布匿名/登录场景下的选款咨询提交、隐私同意、商品快照、限流与后台管理；合作商申请因共享访问控制与流程一并评审，但不与交易支付混合。 |
| 范围 | `client/src/pages/public/{Catalog,Contact,PartnerApplication}/**` 中咨询/申请段；`client/src/pages/admin/{SelectionInquiry,InquiryManage,LeadManage,PartnerApplications}/**`；`server/src/modules/{selection-inquiry,partner-applications,inquiries}/**`；必要的客户认证/权限与接口段；`scripts/verify-selection-inquiry-{security,validation}.mjs`。 |
| 依赖与风险 | 依赖批次 5 的选款、线索、合作商申请及目录访问模型。`Catalog` 与 `api.ts` 是共享文件，必须与批次 1 分段。此批涉及个人联系信息：测试使用脱敏/模拟数据，禁止读取、展示、批量处理或向真实数据库写入客户信息。 |
| 验证命令 | `npm run typecheck`；`npm run build`；`npm run test:selection-inquiry`；`node scripts/verify-selection-inquiry-validation.mjs`；在隔离测试环境人工验证：必填字段、隐私未同意、1–20 项边界、非法手机号、限流、成功提交、后台列表与状态更新。 |
| 合并/提交前置条件 | DTO/服务端校验与前台提示一致；限流和鉴权失败有可理解反馈；不需要真实用户、订单或线索数据；合作商申请的角色/审核规则已由业务负责人确认。 |
| 用户审批 | **需要。** Git 暂存/提交；若要执行迁移、连接真实服务或写入任何业务数据，必须另行明确批准。 |

### 批次 4：交易 / 订单 / 支付试验（当前公开冻结）

| 项目 | 内容 |
| --- | --- |
| 目标 | 保留并验收后台交易域的试验性模型、订单管理、履约、退款、售后、报价、异常订单与事件能力，同时证明公开客户交易仍被安全冻结。**本批不是开通支付或公开下单的授权。** |
| 范围 | `client/src/pages/admin/{OrderManage,PaymentReview,FulfillmentCenter,RefundManage,AfterSalesManage,QuotationManage,TradeOverview,AnomalyOrders}/**`；`client/src/pages/public/{Checkout,CustomerCenter}/**`；`client/src/components/common/CustomerProtectedRoute.tsx`；`client/src/store/featureFlags.ts`；`server/src/common/guards/customer-commerce.guard.ts`；`server/src/modules/{cart,orders,payments,fulfillment,refunds,after-sales,quotations,trade-events}/**`；交易相关客户 DTO 与接口段；`scripts/verify-trade-{state-machine,concurrency,contract}.mjs`。 |
| 依赖与风险 | 严格依赖批次 5 的交易 schema/migration，以及批次 6 的依赖锁文件。现有验收文档规定 `CUSTOMER_COMMERCE_ENABLED=false`、`/cart` 与 `/checkout` 转向咨询、客户交易写接口由守卫返回 503；任何相反变化均为阻断性问题。不得接入支付网关、支付凭证、真实资金、真实订单或客户数据。 |
| 验证命令 | `npm run typecheck`；`npm run build`；`npm run test:trade`；在隔离测试环境验证订单状态机、并发冲突、权限拒绝，以及公开客户侧 cart/checkout/payment 写操作保持 503 或安全转向。后台页面仅用模拟/脱敏数据进行视觉和权限回归。 |
| 合并/提交前置条件 | 自动化交易契约测试通过；负责人确认冻结开关与服务端守卫均未解除；无支付网关凭证、回调、真实资金流或生产订单数据；对状态机和审计事件有人工代码审阅。 |
| 用户审批 | **需要。** Git 暂存/提交；任何迁移应用、真实环境联调、开关调整、支付集成或部署均需单独书面批准。 |

### 批次 5：数据库 schema 与 migration

| 项目 | 内容 |
| --- | --- |
| 目标 | 独立审阅数据模型与历史演进，确保页面文档、站点设置、目录访问/合作商申请、交易中心与版本唯一性均有可追溯迁移。 |
| 范围 | `server/prisma/schema.prisma`、`server/prisma/seed.ts`、`server/prisma/migrations/20260813090000_add_site_settings/migration.sql`、`20260813120000_add_trade_domain/migration.sql`、`20260813130000_add_catalog_access_and_partner_applications/migration.sql`、`20260813140000_add_trade_center/migration.sql`、`20260813150000_unique_page_document_revision_version/migration.sql`。产品媒体迁移脚本和其余 `server/migrate-*.cjs`、`server/scripts/migrate-product-media.ts` 必须作为独立“人工审阅候选”，除非其目标、幂等性、回滚和数据影响逐项获得确认。 |
| 依赖与风险 | 此批是批次 1–4 的数据库前置。迁移可能影响真实业务数据、锁表、索引和历史记录；seed 也可能写数据。不得通过“看起来是补偿脚本”推断安全性。 |
| 验证命令 | 先只做静态审阅：迁移命名与顺序、schema 与 SQL 一致性、外键/唯一约束、向后兼容、可回滚性和是否写历史数据。经用户明确批准且在隔离数据库中，才可运行 `cd server; npx prisma validate --schema prisma/schema.prisma`，并由数据库负责人决定后续迁移演练命令。**本任务不执行任何数据库命令。** |
| 合并/提交前置条件 | 每份 SQL 由数据库负责人审阅；列出精确执行目标、备份/回滚方案、预计锁与数据影响；确认 production 与测试数据库隔离；种子和补偿脚本不随迁移自动运行。 |
| 用户审批 | **需要。** Git 暂存/提交；schema/migration、seed、任何数据库连接或数据变更都需要额外明确批准。 |

### 批次 6：配置、依赖、Docker、脚本与文档

| 项目 | 内容 |
| --- | --- |
| 目标 | 单独审阅运行时与开发工具边界，使功能批次不夹带依赖升级、容器改动、CI 行为改变或文档结论。 |
| 范围 | 根/前后端 `package.json` 与锁文件、`docker-compose.yml`、`client/nginx.conf`、`client/vite.config.ts`、`client/index.html`、`.gitignore`、`client/.gitignore`、`.github/workflows/{ci,quality}.yml`、`.vscode/{settings,extensions,launch,tasks}.json`、`README.md`、`design-qa.md`、`docs/**`、`scripts/**` 与 `client/scripts/**`。`.env.example` 只能审阅变量名、注释和是否存在占位符，绝不读取或复制任何实际 `.env` 值。`AGENTS.md` 属安全规则文件，必须从本批拆出并由用户人工确认后才可纳入任何提交。 |
| 依赖与风险 | `package-lock.json` 变化必须与 manifest 精确一致；安装、升级或删除依赖均需审批。Docker/CI 变化会改变构建、测试和部署行为；不要在自动化中暴露环境变量、令牌或数据库连接信息。`docker-compose.override.yml` 见第 4 节，默认不在本批。 |
| 验证命令 | 不安装依赖前，仅审阅 manifest/lock 一致性、CI 命令与根脚本是否存在、文档链接是否有效。依赖已就绪且用户批准后，执行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`，以及相应领域脚本；检查 CI YAML 与 Docker/NGINX 配置的语法和引用时不得输出或读取密钥。 |
| 合并/提交前置条件 | 依赖清单获得用户批准；CI 不引入未经授权的部署、外部写入或真实数据库操作；文档日期、结论和路径与当前代码相符；安全规则文件获得单独确认。 |
| 用户审批 | **需要。** Git 暂存/提交；依赖变更、Docker/部署配置、CI 外部访问以及任何环境文件均按项目规则另行审批。 |

## 4. 不应自动提交或必须人工处理的候选文件

这些项目保持原位，既不删除也不重命名，直到负责人明确决定。对密码重置脚本仅作安全复核标记，本文不展示其实现。

| 候选范围 | 当前观察 | 必需人工决定/复核 |
| --- | --- | --- |
| `pilot-category-id.txt`、`pilot-run-all.mjs`、`server/_check-pilot.cjs` | 看起来与导入试运行有关，且包含运行产生的标识/检查逻辑的可能性。 | 确认是否为可复现、无真实数据的开发工具；若保留，补充用途、输入/输出、幂等性和数据保护说明；否则由用户决定后续处置。 |
| `upload-products.csv` | 已跟踪且有改动；CSV 可能承载商品或业务数据。 | 内容、来源、脱敏性、授权和是否应作为样例数据必须人工确认；不得将其作为“可删文件”处理。 |
| `server/reset-admin-credentials.cjs`、`server/reset-admin-password.cjs` | 密码/凭证重置脚本。 | **需人工安全复核。** 确认不会内置凭证、不会打印敏感信息、访问控制与审计充分；未通过前不提交、不运行。 |
| `server/_check-admin.cjs` | 管理员检查脚本，可能涉及认证或环境配置。 | 需人工安全复核与用途确认；不得在本文或提交说明中复制其认证实现/参数。 |
| `server/migrate-check.cjs`、`server/migrate-ensure-*.cjs`、`server/migrate-stock-to-inventory.cjs`、`server/migrate-sync-starting-price.cjs`、`server/scripts/migrate-product-media.ts` | 可能读取或修改业务数据的补偿/迁移脚本。 | 数据库负责人应明确每个脚本目标、查询范围、幂等性、事务/回滚、dry-run 能力和执行环境；未批准前不提交到发布链路、不执行。 |
| `docker-compose.override.yml`、`.vscode/launch.json`、`.vscode/tasks.json` | 常见开发机覆盖配置，可能包含本机路径、端口、环境依赖或个人工作流。 | 团队决定其是否应版本化；审阅后如确需提交，应确认无本机专用/敏感配置。 |
| `template-preview-contact-sheet.png` | 预览拼图类二进制资产。 | 确认是否是产品交付需要的受权源文件、体积是否可接受、是否应以可再生方式生成；不能仅凭文件名判断删除。 |
| `.env.example`、`server/settings.json` | 配置文件；前者不是实际 `.env`，后者可能含运行时配置。 | 仅允许审阅结构、键名、默认值与敏感项占位；严禁读取、输出或提交真实密钥。若任何值疑似密钥，应立即移出本次提交并由用户处理。 |
| `AGENTS.md` | 项目安全与协作规则文件，当前已修改。 | 不与业务功能搭售；按规则必须由用户明确确认安全规则变更后，才可单独纳入提交。 |

## 5. 推荐的审阅、提交与部署顺序

以下顺序以“降低耦合、保留可回退点”为目标。提交只是源码历史操作；实际数据库应用、依赖安装和部署分别受额外审批控制。

1. **先决策候选文件与换行符门禁**：重新盘点、确认不混入候选文件、记录换行符差异；不要自动清理。
2. **配置/依赖最小基线（批次 6 的 manifest 与锁文件子集）**：只在依赖变更被批准且 lock 与 manifest 对应时处理，为后续构建提供确定环境。
3. **schema 与正式 migration（批次 5）**：先完成人工 SQL 审阅并提交源码；数据库实际应用必须另开已批准的变更窗口。
4. **公开站 P0（批次 1）**：完成公开访问、隐私与安全降级的回归后提交。
5. **Puck（批次 2）**：在迁移前置已明确、编辑器浏览器验收后提交。
6. **选款咨询（批次 3）**：仅在个人信息保护、限流和后台闭环验收后提交。
7. **交易试验且保持冻结（批次 4）**：最后单独提交；验收重点是“不开放”而非支付成功。
8. **剩余 CI、Docker、编辑器配置和文档（批次 6 的其余子集）**：最后核对脚本、CI 和文档引用；不得随此步骤部署。

如果某一提交不能在其依赖的已提交源码上通过静态检查，优先将共享**代码段**移到正确的前置批次，而不是把无关文件整包合并。提交后仍应通过干净 worktree 或受控分支验证各提交的可构建性。

## 6. 需要用户明确决策的事项

1. 是否批准任何 Git 暂存和提交，以及各批次最终文件清单（多人并发下，提交前必须重新确认）。
2. 是否批准 manifest/lock 文件中的依赖变化、必要的依赖安装和 Playwright 浏览器安装。
3. 是否批准 schema/migration、seed 或任一补偿脚本的审阅范围、测试数据库和后续执行窗口；当前没有批准执行。
4. 是否保留导入试运行文件、CSV、预览图、开发机覆盖配置和 VS Code 文件，并确认其数据/授权/团队适用性。
5. 是否批准密码重置与管理员检查脚本；在安全负责人复核前，它们不得纳入发布批次。
6. 是否确认正式域名、运营联系资料与隐私/合规主体；未确认时必须保留当前的空值/安全降级策略。
7. 是否继续保持 `CUSTOMER_COMMERCE_ENABLED=false` 和服务端交易守卫；若要开放交易，必须另立支付网关、回调验证、资金与退款审计验收任务，不能由本计划解除。

## 7. 本计划自身的交付检查

本文件创建/更新后应只读执行以下检查：

```powershell
git diff --check -- docs/acceptance/release-batch-plan.md
Test-Path docs/acceptance/open-issues.md
Test-Path docs/acceptance/feature-completion-matrix.md
Test-Path docs/acceptance/end-to-end-flow-matrix.md
Test-Path docs/CURRENT_STATE.md
```

文档中的路径链接均指向上述现有验收/状态文档或工作区内已盘点的范围；文件集合仍须在实际提交前重新核对 `git status --short`，以避免并发改动被误带入。

## 8. 第一批公开站 P0：提交前安全暂存清单（2026-08-14 快照）

> 本节是对“批次 1”的细化，不改变第 3 节的批次边界。它基于当前未暂存差异；多人并发期间，人工开始暂存前必须重新执行 `git status --short` 和本节第 8.5 节的门禁。本文**没有执行**任何 Git 暂存、提交或推送操作。

### 8.1 结论

**结论：C — 当前仍不宜暂存/提交。**

最小阻断原因如下：

1. 指定的 `npm run build` 已连续运行两次，均到达 Vite “4209 个模块已转换”，但命令输出未提供最终成功/失败退出标记；在取得明确退出结果前，不能将构建视为通过。
2. 公开站 P0 文件与选款咨询、受控目录/合作商家、Puck、后台权限及交易试验存在大量同文件混杂；尤其是 `App.tsx`、`api.ts`、`Catalog/index.tsx`、`ProductDetail/index.tsx`、`products.controller.ts` 与 `products.service.ts`。不能使用整文件或目录通配符暂存。
3. 联系信息的服务端事实来源已从文件迁移到 `SiteSetting` 数据模型，依赖尚未人工审阅的 schema/migration；公开端虽有错误/空值降级，但该依赖不能悄然并入 P0 提交。
4. 生产 CORS 改为必须显式提供已确认的 `CORS_ORIGIN`；正式域名/生产来源尚未确认。此项不应阻碍代码审阅，但会阻碍把该提交当作可直接部署的版本。
5. Puck 已新增独立的已发布内容审计文档，默认模板内容和已发布内容的业务/合规复核尚未完成；它们必须与公开站代码修复分离，不能被“首页兜底”或路由变更顺带提交。
6. 实际 Git 写入本身仍需要用户明确批准；未跟踪测试/工具文件也须逐一确认来源和范围。

因此，下一步不是执行 `git add`，而是先消除上述最小阻断项；完成后，第一批最多也只能按第 8.3 节进行 **hunk 级人工暂存**，而非整目录暂存。

### 8.2 纳入与排除边界

| 主题 | 第一批处理决定 | 原因与门禁 |
| --- | --- | --- |
| 公开商品、公开媒体、图片失败降级 | 有条件纳入 | 仅纳入游客 `PUBLIC + PUBLISHED` 的字段白名单、受控公开媒体和 UI 降级；会员/合作商目录、水印、库存/SKU/后台商品操作必须分离。 |
| 联系页承诺与公开联系信息 | 有条件纳入 | 纳入去除虚构联系信息、服务承诺降级、loading/empty/error、隐私链接及咨询表单可访问性；服务端 `SiteSetting` 迁移和真实运营资料不纳入。 |
| SEO 门禁 | 有条件纳入 | 纳入移除未确认域名、假电话及不存在的分享图，及公开页面元信息；robots/sitemap 保持合法空结构，直至业务确认正式域名。 |
| CORS 门禁 | 有条件纳入 | `server/src/main.ts` 的生产 fail-fast 可作为安全修复候选；必须先由运维确认生产 `CORS_ORIGIN` 的精确来源格式，且不能读取或记录实际环境值。 |
| 公开交易冻结 | 只纳入最小公开入口保护 | `App.tsx` 中 `/cart`、`/checkout` 到咨询页的安全转向可作为 P0 hunk；客户下单、支付、订单、退款、后台交易页和开关实现仍属于批次 4。 |
| 已完成的选款咨询 | 排除 | `Catalog` 里的隐私同意、提交、商品快照和服务端可见性复核属于批次 3；不能因同页共用图片组件而带入。 |
| Puck 默认内容 | 排除 | 默认模板、区块、模板 SVG、首页 Puck 渲染及其内容真实性审计属于批次 2；默认内容不等于已发布内容。 |
| Puck 发布可见性 | 排除 | `page-modules`、发布校验、版本/并发控制、已发布内容审计和相应 migration 属于批次 2/5；必须由授权人员在后台进行内容审核，不能由源码提交替代。 |
| 正式域名、真实联系资料、实际发布页内容 | 排除且阻断部署 | 均需要业务/法务/运营确认；本任务不读取真实设置、数据库或生产页面数据。 |

### 8.3 当前候选文件逐项清单

“整文件”仅表示从当前差异观察该文件没有其他主题的代码段；它仍要在用户授权后重新审阅。标为“hunk”的项目不得用 `git add <文件>` 整体暂存。标为“排除”的项目不能进入第一批。

| 文件 | 当前改动意图 | 混杂风险 | 第一批处理 |
| --- | --- | --- | --- |
| `client/index.html` | 移除不存在的分享图、未确认域名/电话的结构化数据。 | 仅 SEO 门禁。 | **整文件候选**；正式域名未确认时保留当前安全降级。 |
| `client/public/robots.txt` | 移除未确认域名的 Sitemap 声明。 | 仅 SEO 门禁。 | **整文件候选**。 |
| `client/public/sitemap.xml` | 移除未确认域名的 URL，保留合法空结构。 | 仅 SEO 门禁。 | **整文件候选**。 |
| `client/src/components/common/ErrorBoundary.tsx` | 使公开错误页使用原生按钮及可见焦点样式。 | 无领域业务混杂。 | **整文件候选**。 |
| `client/src/components/common/SecureImage.tsx`（未跟踪） | 统一受控媒体/普通图片的加载、失败和占位降级。 | 被公开页、目录和潜在 Puck 区块共同使用。 | **整文件候选，但需人工确认其不携带目录鉴权或 Puck 专属行为**；否则移至共享组件批次。 |
| `client/src/components/common/ProductCard.tsx` | 改用 `SecureImage`，优先受控 `mediaUrl`。 | 价格字段语义也随产品/交易模型演进。 | **hunk**：只考虑图片来源与组件替换；价格逻辑须与产品模型审阅同步。 |
| `client/src/components/layout/PublicLayout.tsx` | 公开 robots meta 和页脚隐私入口。 | 仅公开布局。 | **整文件候选**。 |
| `client/src/pages/public/Privacy/index.tsx`（未跟踪） | 新增匿名可访问的隐私说明及公开设置的安全显示。 | 依赖 `settingsApi`，不应带入真实运营信息。 | **整文件候选**，前提是先确认路由和 API hunk 都已纳入、页面未写死真实信息。 |
| `client/src/pages/public/About/index.tsx` | 补充固定、非误导性的页面元信息。 | 仅 SEO。 | **整文件候选**。 |
| `client/src/pages/public/Contact/index.tsx` | 去除假联系信息和确定性服务承诺；增加公开设置 loading/empty/error、咨询措辞降级、隐私链接、表单 label 与交易冻结提示。 | 与公开咨询表单相邻，但不含选款提交逻辑。 | **整文件候选**；依赖设置接口/migration 未完成，故当前仍不可暂存。 |
| `client/src/pages/public/Search/index.tsx` | 受控图片降级与搜索页元信息。 | 依赖共享 `SecureImage` 与商品图片工具。 | **整文件候选**，待共享组件和产品图片 hunk 复核后再决定。 |
| `client/src/pages/public/Home/index.tsx` | 移除不存在的礼赠图片；同时把 Puck 渲染改为 lazy/Suspense 并新增 Puck loading。 | 首页 Puck 默认/发布内容与公开站兜底混杂。 | **hunk**：仅缺失静态图片的安全降级可讨论；所有 `PuckDocumentRenderer`、`Suspense`、Puck loading/预览改动均**排除**。 |
| `client/src/pages/public/ProductList/index.tsx` | 受控媒体 URL、图片降级、页面元信息；另有 SSE 自动重连和渐进渲染。 | 依赖未跟踪的 `useReconnectingEventSource.ts`，后两项是性能/实时性主题。 | **hunk**：仅图片/元信息可评估；SSE、IntersectionObserver 和其新 hook **排除**。若导入无法干净拆开，则整文件留待后续批次。 |
| `client/src/pages/public/Catalog/index.tsx` | 公开卡片/快速预览使用受控图片；另有选款隐私同意、表单可访问性、选款元信息。 | 选款咨询批次与公开展示紧密混杂。 | **hunk**：仅 `ProductCard`/`QuickView` 的图片降级可评估；`SelectionTray`、隐私同意、选款页 meta 全部**排除**。 |
| `client/src/pages/public/ProductDetail/index.tsx` | 受控媒体、公开详情元信息；同时引入金价、SKU 起价、SSE、交易开关与加购逻辑。 | 同时跨产品、实时更新和交易冻结。 | **hunk**：最多纳入公开图片/字段安全段；金价、SKU 价格、SSE、交易开关/加购全部**排除**。当前不具备安全自动拆分条件。 |
| `client/src/pages/public/Checkout/index.tsx`、`client/src/pages/public/CustomerCenter/**` | 客户交易/账户流。 | 交易冻结与客户域。 | **排除**，属于批次 4。 |
| `client/src/pages/public/PartnerApplication/**`（未跟踪） | 合作商申请。 | 客户身份与目录访问控制。 | **排除**，属于批次 3。 |
| `client/src/pages/public/Custom/index.tsx` | 页面装修/文案和素材调整。 | 与 P0 安全修复无直接证据。 | **排除**，待内容与设计批次审阅。 |
| `client/src/App.tsx` | 新增隐私路由、公开交易转向、按需 Ant Design；同时新增交易路由、后台权限、合作商路由。 | 同一相邻路由 hunk 混入多领域。 | **hunk 且需人工编辑补丁**：只允许 `/privacy` 路由及最小 `/cart`、`/checkout` 安全转向；不得带入后台、合作商、Ant Design 架构和交易管理路由。 |
| `client/src/main.tsx`、`client/src/components/common/AntdProvider.tsx`（未跟踪） | 全局 Ant Design Provider 拆分。 | 性能/应用架构，影响所有后台/前台。 | **排除**，不属于 P0 安全最小集。 |
| `client/src/config/navigationConfig.ts` | 新增交易中心、合作申请后台导航。 | 交易/合作商域。 | **排除**。 |
| `client/src/hooks/useProductData.ts`、`client/src/hooks/useReconnectingEventSource.ts`（未跟踪） | 受控 URL 与自动重连 SSE。 | 后者是新增实时基础设施，且消费会员/合作商目录流。 | **hunk**：可审阅 `mediaUrl` 映射；SSE URL 与重连逻辑**排除**。若 import 无法拆离，则整体延后。 |
| `client/src/utils/productImage.ts` | 公共商品图片工具优先 `mediaUrl`。 | 供公开、目录、后台共用。 | **整文件候选**，但须与服务端公开媒体 hunk 一起评审。 |
| `client/src/services/api.ts` | 请求错误规范化、公开/受控目录切换、产品媒体、设置空值、上传、交易 API、Puck 乐观锁。 | 公开、选款、交易、Puck、上传高度混杂。 | **hunk 且需人工编辑补丁**：只允许公开设置 mock 空值与公开游客商品必要段；客户目录、交易 API、上传、Puck 发布、合作商 API 全部**排除**。 |
| `client/src/styles/globals.css`、`client/src/styles/adminLuxury.css` | 全局/后台视觉样式。 | 无法从目录名证明仅服务 P0。 | **排除**，除非人工定位到隐私/错误态所需且可独立的 hunk。 |
| `client/tests/privacy-trust.spec.ts`（未跟踪） | 隐私、无假信息、公开信任边界测试。 | 依赖 Playwright 配置与本地测试条件。 | **整文件候选**，但当前未运行 Playwright，不能声称 E2E 已通过。 |
| `client/tests/responsive-public.spec.ts`（未跟踪） | 公共页不同视口横向溢出测试。 | 可能覆盖首页/Puck 等页面。 | **hunk**：仅确认覆盖 P0 页面的断言；其余页面留在对应批次。 |
| `client/tests/public-access.spec.ts`（未跟踪） | 公开访问字段、受控目录和交易冻结回归。 | 同时覆盖 P0、选款/目录与交易冻结。 | **hunk**：只纳入游客公开字段、公开媒体和 `/cart`/`/checkout` 冻结断言；客户目录/交易实验断言排除。 |
| `client/playwright.config.ts`（未跟踪） | Playwright 测试运行配置。 | 通用测试基础设施，不是 P0 业务代码。 | **排除到批次 6**；若 P0 测试必须依赖它，先由负责人确认其无环境/部署副作用。 |
| `docs/acceptance/release-batch-plan.md` | 本分批与暂存审计记录。 | 文档治理，不是产品功能。 | **排除到批次 6 或单独文档提交**；不与 P0 功能代码混合。 |
| `docs/acceptance/puck-published-content-audit.md`（未跟踪）与 `client/src/page-builder/**`、`client/src/components/blocks/**` | Puck 默认内容、发布审计、区块和模板。 | 页面装修器与内容合规。 | **排除**，属于批次 2；Puck 内容审计未完成是部署阻断项。 |
| `server/src/main.ts` | 生产 CORS 显式来源校验与 trust proxy 限流识别。 | trust proxy 是全站基础设施，但改动不含交易业务。 | **整文件候选**；上线前必须由运维确认正式来源配置，且不输出实际值。 |
| `server/src/modules/inquiries/inquiries.controller.ts` | 公开咨询提交限流。 | 只影响公开咨询入口。 | **整文件候选**，与 `main.ts` trust proxy 一起验证。 |
| `server/src/common/filters/http-exception.filter.ts` | 公开静态资源缺失返回正确 4xx，而非误报 500。 | 通用异常处理。 | **整文件候选**。 |
| `server/src/common/interceptors/transform.interceptor.ts` | 受控媒体二进制响应不被 JSON 包装。 | 对所有手动响应端点生效。 | **整文件候选**，但必须与公开媒体端点一起做接口回归。 |
| `server/src/modules/products/product-media.service.ts` | 私有/旧媒体读取、防路径穿越、公开媒体及合作商水印能力。 | 同时含公开媒体、合作商水印和私有迁移兼容。 | **hunk**：公开媒体读取与路径安全可审阅；合作商水印、私有迁移和目录专属逻辑**排除**。 |
| `server/src/modules/products/products.controller.ts` | 公开商品字段说明、公开媒体端点；同时新增客户目录端点及后台 SKU/证书修复。 | 公开、客户目录、后台商品混杂。 | **hunk**：只允许公开 `public/:productId/media/:imageId` 和公开产品端点；catalog、SKU、证书、裁切改动**排除**。 |
| `server/src/modules/products/products.service.ts` | 公开商品白名单/媒体访问；同时实现会员/合作商可见性、选款快照、库存/SKU 起价与后台商品逻辑。 | 本批最重混杂文件，且超过千行变动。 | **hunk 且当前不可安全自动拆分**：只可在双人代码审阅后挑出游客 `PUBLIC + PUBLISHED` 白名单、`findPublic*` 与公开媒体访问；其余全部排除。 |
| `server/src/modules/products/products.module.ts`、`server/src/modules/products/customer-or-staff.guard.ts`（未跟踪）、`server/src/modules/products/product-access.service.ts`（未跟踪） | 客户/员工目录鉴权与可见性接线。 | 客户目录/合作商访问控制。 | **排除**，属于批次 3；公开媒体若需要额外模块接线，应先抽出最小独立变更。 |
| `server/src/modules/products/dto/{create-product,sku,update-product}.ts` | 商品/SKU DTO 和价格/可见性语义变更。 | 后台商品与交易模型。 | **排除**。 |
| `server/src/modules/upload/**` | 私有商品上传、裁切、存储键和迁移兼容。 | 上传基础设施/后台商品，不是公开站最小修复。 | **排除**；由产品媒体/迁移专题单独审阅。 |
| `server/src/modules/settings/{settings.controller,settings.service}.ts` | 公开设置接口异步化，并把旧 JSON 设置迁移到数据库。 | 依赖 `SiteSetting` schema/migration，且存在首次写入。 | **排除**，属于批次 5；联系页保持前端错误/空值降级，不能以此绕过 migration 审批。 |
| `server/src/app.module.ts` | 接线页面、客户、交易、合作商、健康检查等多个模块。 | 多领域模块注册。 | **排除**，需按领域拆分后再审阅。 |
| `server/prisma/schema.prisma`、`server/prisma/migrations/**`、`server/prisma/seed.ts`、`server/migrate-*.cjs`、`server/scripts/migrate-product-media.ts` | 数据模型、迁移、补偿/种子工具。 | 数据库结构与潜在真实数据影响。 | **排除**，属于批次 5；本任务不执行数据库命令。 |

### 8.4 拟执行但未执行的 Git 操作说明

以下命令仅供获得用户明确授权、完成第 8.1 节阻断项后，由人工执行。它们**未在本任务中执行**。禁止使用 `git add .`、`git add -A`、目录通配符或一次性暂存共享文件。

```powershell
# 0. 先重新确认并发工作区；只读
git status --short
git -c core.safecrlf=false diff --check

# 1. 仅对已被再次人工确认的整文件候选逐个暂存；示例而非已授权清单
git add client/index.html
git add client/public/robots.txt
git add client/public/sitemap.xml
git add client/src/components/common/ErrorBoundary.tsx
git add client/src/components/layout/PublicLayout.tsx
git add client/src/pages/public/About/index.tsx

# 2. 共享文件必须逐块检查；必要时用 e 手工编辑暂存补丁，删除所有非 P0 行。
git add -p -- client/src/App.tsx
git add -p -- client/src/pages/public/Catalog/index.tsx
git add -p -- client/src/pages/public/Home/index.tsx
git add -p -- client/src/pages/public/ProductDetail/index.tsx
git add -p -- client/src/pages/public/ProductList/index.tsx
git add -p -- client/src/services/api.ts
git add -p -- server/src/modules/products/product-media.service.ts
git add -p -- server/src/modules/products/products.controller.ts
git add -p -- server/src/modules/products/products.service.ts

# 3. 暂存后只读核验，确认没有交易、Puck、选款、迁移或候选文件误入。
git diff --cached --check
git diff --cached --name-only
git diff --cached --stat
git diff --cached -- client/src/App.tsx client/src/services/api.ts server/src/modules/products/products.service.ts
```

对于 `App.tsx`、`api.ts`、`products.service.ts` 这类连续 hunk，如 `git add -p` 无法分割到只剩目标行，应停止暂存该文件并让开发负责人准备最小补丁；不得把相邻领域代码“顺带”加入。

### 8.5 本轮验证记录（只读）

| 命令 | 当前结果 | 对第一批的含义 |
| --- | --- | --- |
| `npm run typecheck` | 通过（server 与 client TypeScript 均完成）。 | 通过的是当前全部混杂工作区，不等于拆分后的 P0 暂存集独立通过。 |
| `npm run test:selection-inquiry` | 通过，静态契约 20 项。 | 证明选款可见性复核当前存在；该功能仍排除在第一批外。 |
| `npm run test:contracts` | 通过，页面构建器契约覆盖 26 种区块。 | 仅说明 Puck 契约当前可解析；不证明默认或已发布内容已完成业务/合规审核，Puck 仍排除。 |
| `npm run lint` | 通过。 | 通过的是当前全前端工作区，不替代 P0 hunk 审阅。 |
| `npm run build` | 连续两次均完成 server build 并在 client Vite 输出“4209 个模块已转换”后结束采集，未获得最终退出标记。 | **未通过也未能证实通过；作为构建证据不充分，阻断暂存/提交决策。** |
| `git -c core.safecrlf=false diff --check` | 通过，退出码 0。 | 未发现行尾空白/冲突标记；不消除既有 LF→CRLF 警告和语义混杂风险。 |

本轮开始后可见并发状态变化包括新增未跟踪的 `docs/acceptance/puck-published-content-audit.md`；因此上述测试和清单只代表命令执行时的完整脏工作区，不能代替后续人工暂存后的 `--cached` 复验。

## 9. 未跟踪与敏感候选文件：一次性提交决策清单（2026-08-14 快照）

> 当前 `git ls-files --others --exclude-standard` 返回 144 个未跟踪路径。本节只根据路径、文件类型、大小、现有 `.gitignore`、已知批次边界及项目规则作出**提交治理建议**；不读取真实 `.env`、密码重置脚本实现、数据库或真实业务数据。
> “建议忽略”表示应由用户决定是否新增/调整 `.gitignore`，**不是**本任务删除文件或修改忽略规则的授权。

### 9.1 决策类别

| 类别 | 含义 |
| --- | --- |
| 应纳入版本库 | 可复现的源码、测试、迁移定义、CI 或团队文档；仍按其功能批次审阅，不代表进入 P0。 |
| 应由 `.gitignore` 排除 | 本机状态、可再生输出、临时标记或含业务数据的运行产物；须先由用户确认，再单独修改忽略规则。 |
| 必须人工安全复核 | 可能处理凭据、权限、数据库、外部执行或部署的文件；复核完成前不运行、不提交。 |
| 必须人工确认业务用途 | 文档、素材、模板、样例数据或功能模块的产品范围/授权无法仅从路径确认。 |
| 不能仅靠静态判断 | 路径和元数据不足以判断应提交还是忽略；保持原样等待用户决定。 |

### 9.2 全量未跟踪路径的决策表

以下每行覆盖表中所列的所有精确文件或目录模式；计数合计为当前 144 个未跟踪路径。目录模式只用于记录范围，绝不表示可以使用目录通配符暂存。

| ID | 当前未跟踪文件/目录（计数） | 推荐类别 | 一次性决定与最小安全处理 | 对第一批 P0 hunk 的影响 |
| --- | --- | --- | --- |
| U01 | `.github/workflows/ci.yml`、`.github/workflows/quality.yml`（2） | 必须人工安全复核 | 确认仅运行批准的检查、没有部署/外部写入、没有输出环境变量或令牌后，作为 CI 批次纳入版本库。 | 不减少 P0 代码混杂；可在后续证明质量门。 |
| U02 | `.vscode/extensions.json`（1） | 应纳入版本库 | 若内容只是团队推荐扩展，可随工具配置批次纳入。 | 无关。 |
| U03 | `.vscode/launch.json`、`.vscode/tasks.json`（2） | 不能仅靠静态判断 | 先确认是否包含本机路径、端口、环境参数、数据库/部署任务或个人工作流；团队决定版本化或忽略。 | 无关，且不得与 P0 同批。 |
| U04 | `client/.gitignore`（1） | 应纳入版本库 | 当前仅覆盖 Playwright 报告、结果和认证状态等可再生产物；人工确认其不会忽略源码/测试后，纳入工具批次。 | 间接减少测试输出误入工作区，不解决 P0 hunk 混杂。 |
| U05 | `client/playwright.config.ts`（1） | 必须人工安全复核 | 确认测试服务器、目标地址、报告目录和环境读取不触发部署/真实环境写入后，作为测试基础设施纳入。 | 支撑 P0 浏览器测试，但不改变 P0 源码混杂。 |
| U06 | `client/public/svg/template-*.svg`（24） | 必须人工确认业务用途 | Puck 模板预览资源；确认每个图标与模板注册匹配、来源/商用授权可追溯、无需携带业务承诺后，随 Puck 批次纳入。 | 通过明确排除，防止 Puck 资源误入 P0；不减少同文件 hunk 混杂。 |
| U07 | `client/scripts/verify-core-module-batch.mjs`、`verify-full-bleed-render.mjs`、`verify-product-row-render.mjs`、`verify-visual-poster-batch.mjs`（4） | 必须人工确认业务用途 | 确认脚本只做静态/本地验证且不写真实服务后，随 Puck 测试批次纳入。 | 无关。 |
| U08 | `client/src/components/blocks/{AppointmentBlock,CertificateBlock,CustomProcessBlock,FeaturedProductBlock,LimitedOfferBlock,LookbookBlock,StoreInfoBlock,TestimonialBlock}.tsx`（8） | 必须人工确认业务用途 | 为新增 Puck 区块源码；确认默认文案、服务/证书/限时/评价等业务承诺和素材授权后，随 Puck 批次纳入。 | 排除 Puck 默认内容，避免误入 P0。 |
| U09 | `client/src/page-builder/adapters/{appointment,certificate,customProcess,featuredProduct,limitedOffer,lookbook,storeInfo,testimonial}.puck.tsx`、`config/blockContracts.ts`、`inspector/{FocusPicker,ImageStatus,InspectorSection,LinkTargetField}.tsx`、`utils/linkTarget.ts`（14） | 应纳入版本库，但须人工确认业务用途 | 均为 Puck 实现/契约；与 U06/U08 一起核对注册、模板与发布校验后，随批次 2 纳入。 | 仅通过明确排除降低误暂存风险。 |
| U10 | `client/src/components/common/SecureImage.tsx`（1） | 应纳入版本库 | 受控媒体/图片失败降级的共享组件；在公开媒体接口和静态测试完成代码审阅后，作为 P0 的明确依赖纳入。 | **可减少** ProductCard、Search、Catalog、Privacy 等 P0 hunk 的“未跟踪 import”风险，但不消除服务端产品文件的混杂。 |
| U11 | `client/src/components/common/AntdProvider.tsx`、`CustomerProtectedRoute.tsx`、`client/src/config/adminRouteAccess.ts`、`client/src/hooks/useReconnectingEventSource.ts`（4） | 应纳入版本库，按功能批次 | 分别属于应用加载架构、客户认证、后台授权、SSE 重连；需随平台/交易/客户域审阅，不与 P0 安全最小集混入。 | 明确排除；其中 SSE hook 是 ProductList hunk 无法干净拆分的原因之一。 |
| U12 | `client/src/pages/admin/{AfterSalesManage,AnomalyOrders,FulfillmentCenter,PartnerApplications,QuotationManage,RefundManage,TradeOverview}/index.tsx`（7） | 必须人工确认业务用途 | 后台交易中心/合作商页面；确认业务流程、角色和数据权限后，分别随交易或选款/合作商批次纳入。 | 无关。 |
| U13 | `client/src/pages/public/PartnerApplication/index.tsx`（1） | 必须人工确认业务用途 | 合作商申请客户入口；确认客户认证、隐私与审核流程后随批次 3 纳入。 | 无关。 |
| U14 | `client/src/pages/public/Privacy/index.tsx`（1） | 应纳入版本库 | 匿名隐私说明和公开设置安全降级；确认无真实联系信息硬编码后，作为 P0 候选纳入。 | **可减少** `App.tsx` 隐私路由与 Contact 隐私链接的未跟踪依赖风险；仍需人工拆分 `App.tsx`。 |
| U15 | `client/tests/{core-template-homepage,privacy-trust,public-access,responsive-admin.admin,responsive-public}.spec.ts`（5） | 应纳入版本库，按测试范围拆分 | 先与 U05 一起确认均在隔离/本地环境运行；Puck、后台交易、公开访问的断言应按批次拆分，不能因同一测试文件整包进入 P0。 | `privacy-trust` 可直接支撑 P0；`public-access`/`responsive-public` 仅能 hunk 级纳入；其余无关。 |
| U16 | `docker-compose.override.yml`（1） | 不能仅靠静态判断 | Docker 默认会自动合并 override；先确认是否只适用于开发机、是否含本机路径/端口/环境变量。若本机专用，建议由 `.gitignore` 排除；若团队通用，需人工安全复核后纳入配置批次。 | 无关；不得与 P0 同批。 |
| U17 | `docs/{AUTONOMOUS_EXECUTION_REPORT,PENDING_WORK,PUBLIC_ACCESS_MATRIX}.md`、`docs/acceptance/{public-runtime-smoke-report,puck-published-content-audit,release-batch-plan}.md`（6） | 必须人工确认业务用途 | 文档是版本化候选，但验收结论、运行报告和 Puck 内容审计须由责任人确认其证据范围与日期；本计划文件可随文档治理批次纳入。过时的模板能力矩阵已由 `docs/CONTENT_TEMPLATE_STANDARD.md` 取代（该文件已于 2026-08-18 归档至 `docs/archived/`），不再作为候选。 | `PUBLIC_ACCESS_MATRIX`/运行烟测记录可辅助 P0 审阅；Puck 审计明确阻止 Puck 内容混入，但均不解决源文件 hunk。 |
| U18 | `pilot-category-id.txt`、`pilot-run-all.mjs`（2） | `pilot-category-id.txt`：应由 `.gitignore` 排除；`pilot-run-all.mjs`：必须人工确认业务用途 | 前者是极小的试运行标记，默认不应入库；后者仅在确认其为可复现、无真实数据/外部写入的开发工具后才纳入，否则同样建议忽略。不得删除任何一项。 | 排除试运行状态可降低误暂存，不影响 P0 内容混杂。 |
| U19 | `scripts/{verify-page-builder-contract,verify-page-builder-publish,verify-selection-inquiry-security,verify-selection-inquiry-validation,verify-trade-concurrency,verify-trade-contract,verify-trade-state-machine}.mjs`（7） | 应纳入版本库，但须人工安全复核 | 验证脚本应与各批次同步纳入；确认不连接真实数据库、不泄露令牌、不写真实业务数据。 | 选款/Puck/交易脚本均不进入 P0；只避免把测试工具误暂存。 |
| U20 | `server/_check-admin.cjs`、`server/_check-pilot.cjs`（2） | 必须人工安全复核 | 确认权限边界、环境读取和输出内容；未复核前不运行、不提交。 | 无关。 |
| U21 | `server/reset-admin-credentials.cjs`、`server/reset-admin-password.cjs`（2） | **必须人工安全复核** | **检查是否含硬编码凭据与权限控制。** 未通过复核前不运行、不提交；本文不读取或转述其实现。 | 无关。 |
| U22 | `server/migrate-check.cjs`、`server/migrate-ensure-default-sku.cjs`、`server/migrate-ensure-inventory.cjs`、`server/migrate-stock-to-inventory.cjs`、`server/migrate-sync-starting-price.cjs`、`server/scripts/migrate-product-media.ts`（6） | 必须人工安全复核 | 逐项确认目标数据库、读取/写入范围、幂等性、事务、回滚和 dry-run；迁移负责人批准前不运行、不提交到发布链路。 | 无关；明确排除可减少误暂存。 |
| U23 | `server/prisma/migrations/{20260813090000_add_site_settings,20260813120000_add_trade_domain,20260813130000_add_catalog_access_and_partner_applications,20260813140000_add_trade_center,20260813150000_unique_page_document_revision_version}/migration.sql`（5） | 应纳入版本库，但须人工安全复核 | 正式 migration 定义应版本化；先完成 SQL/schema 一致性、锁表/回滚/数据影响审阅，后续是否执行迁移需单独授权。 | `add_site_settings` 是 Contact/Privacy 服务端事实来源的依赖；在其审阅完成前，P0 不应带入设置服务变更。 |
| U24 | `server/src/common/guards/customer-commerce.guard.ts`、`common/health/health.controller.ts`、`common/interceptors/audit-log.interceptor.ts`（3） | 应纳入版本库，按安全/交易批次 | 冻结守卫、健康检查、审计日志均为可复现源码；确认路由、角色、日志脱敏和部署影响后纳入相应批次。 | 交易守卫不是 P0 源码最小集；健康/审计也不解决 P0 hunk。 |
| U25 | `server/src/modules/customers/dto/{checkout,customer-address}.dto.ts`、`orders/dto/create-order.dto.ts`、`fulfillment/**`（7） | 必须人工确认业务用途 | 客户交易、地址和履约模型；确认数据最小化、权限与业务状态机后随批次 4 纳入。 | 无关。 |
| U26 | `server/src/modules/{after-sales,quotations,refunds,trade-events}/**`（15） | 必须人工确认业务用途 | 后台交易试验能力；确认不会开放支付/资金操作、包含必要审计和角色控制后随批次 4 纳入。 | 无关。 |
| U27 | `server/src/modules/partner-applications/**`（5） | 必须人工确认业务用途 | 合作商申请、审核和个人信息处理；确认业务流程、最小化字段、角色权限和人工验收后随批次 3 纳入。 | 无关。 |
| U28 | `server/src/modules/products/{customer-or-staff.guard,product-access.service}.ts`、`server/src/modules/recommendations/**`（5） | 应纳入版本库，按客户目录批次 | 登录客户/合作商目录访问与推荐实现；需进行鉴权、公开字段与数据最小化审阅后随批次 3 纳入。 | 明确排除可减少 `products.service.ts` 目录可见性 hunk 误入 P0，但不拆解该已跟踪文件。 |
| U29 | `template-preview-contact-sheet.png`（1，约 154 KiB） | 不能仅靠静态判断 | 可能是可再生预览或交付素材；确认生成来源、版权/授权、是否需要在仓库保留以及是否可用脚本再生。未确认前不提交、不删除。 | 无关。 |

### 9.3 已跟踪但同样需要业务决策的非代码候选

| 路径 | 当前状态 | 决策 | 最小安全处理 | 对 P0 的影响 |
| --- | --- | --- | --- | --- |
| `upload-products.csv` | 已跟踪且已修改，不属于上述 144 个未跟踪路径。 | 必须人工确认业务用途，且不能仅靠静态判断。 | 不读取内容；由业务负责人确认是否为脱敏样例、来源/授权、是否含真实商品或业务数据。确认前不纳入任何提交、不删除。 | 与第一批 P0 无关；移出拟暂存范围可避免业务数据误入。 |
| `.env.example` | 已跟踪且已修改。 | 必须人工安全复核。 | 仅可审阅变量名、注释、占位符；不得读取或输出实际 `.env` 值。 | 无关；不得混入 P0。 |
| `server/settings.json` | 已跟踪且已修改。 | 不能仅靠静态判断。 | 可能含运行时设置；只允许安全负责人审阅结构和脱敏默认值，疑似密钥或真实资料立即移出提交候选。 | Contact/Privacy 在逻辑上依赖设置，但该文件不应替代正式 migration/运营确认。 |

### 9.4 现有忽略规则与构建产物处理

根 `.gitignore` 已覆盖 `node_modules/`、`dist/`、`uploads/`、`coverage/`、`*.log`、`*.tsbuildinfo`、`test-results/`、若干本地导入暂存和设计 QA 产物；`client/.gitignore` 覆盖 Playwright report、test results 和认证状态。它们属于构建、测试或本机状态，应保持不被 Git 纳入。

当前未跟踪列表中没有被上述规则排除的典型 `dist`/`node_modules`/测试报告目录；不要为了“清理工作区”删除任何被忽略文件，也不要在本任务中修改 `.gitignore`。`docker-compose.override.yml`、`pilot-category-id.txt` 和 `template-preview-contact-sheet.png` 是否也应忽略，必须按 U16/U18/U29 的人工决定处理。

### 9.5 用户可一次性批准/拒绝的决策包

用户可对下列决策包分别选择“批准纳入”“拒绝纳入并保持原样”“批准后续改为忽略”（后者仍需要另一个获批的 `.gitignore` 变更）。这避免后续逐文件反复确认。

| 决策包 | 覆盖 ID | 请求一次性决定 | 默认建议 |
| --- | --- | --- | --- |
| D1：P0 共享依赖与公开测试 | U10、U14、U15 中 `privacy-trust` 及经 hunk 审阅后的公开断言 | 是否允许作为 P0 候选继续进行人工代码/测试审阅？ | 批准继续审阅；不等于立即暂存。 |
| D2：Puck 源码、模板与测试 | U06–U09、U15 中 Puck 测试、U17 中 Puck 审计 | 是否确认它们属于 Puck 交付物，并授权独立批次审阅？ | 批准独立审阅，明确排除 P0。 |
| D3：交易、客户目录与合作商源码 | U11–U13、U24–U28 | 是否确认这些功能应保留并进入各自的冻结/咨询批次？ | 批准按批次保留；公开交易继续冻结。 |
| D4：CI、测试与团队工具 | U01–U05、U19 | 是否允许安全负责人审阅后将其纳入版本库？ | 批准安全复核后纳入；不允许自动部署或真实数据操作。 |
| D5：本机/可再生候选 | U03、U16、U18 的 `pilot-category-id.txt`、U29 | 是否将本机配置、pilot 标记、预览图确定为版本化交付物或后续忽略对象？ | 默认不纳入，待确认后再改 `.gitignore`；保持文件原样。 |
| D6：高风险脚本与 migration | U20–U23、U21 尤其是密码重置脚本 | 是否指派安全/数据库负责人完成审阅，并在结论前保持不运行、不提交？ | 批准“先复核、后决定”；不批准执行。 |
| D7：文档与数据候选 | U17、`upload-products.csv`、`.env.example`、`server/settings.json` | 是否确认文档证据范围，以及 CSV/配置是否适合版本库？ | 文档经责任人确认后纳入；CSV/配置默认不纳入，先做最小化与安全复核。 |

### 9.6 进入人工 P0 hunk 暂存前所需的最少用户决定

在不处理 Puck、交易或数据库发布的前提下，至少需要：

1. 批准 D1，使 `SecureImage.tsx`、`Privacy/index.tsx` 及明确的公开测试成为可审阅候选，而不是未跟踪依赖。
2. 批准 D2/D3 的“保留但排除 P0”决定，防止 Puck、选款、客户目录和交易未跟踪源码被误带入第一批。
3. 批准 D5 的“保持本机/试运行/预览候选不纳入”决定，避免 Docker override、pilot 标记和预览图污染暂存区。
4. 批准 D6 的“暂不运行、不提交高风险脚本和 migration”决定；这不解决 Contact 的 schema 依赖，但能排除危险的非代码混杂。
5. 在此前提下，仍需满足第 8.1 节的 P0 内容阻断项：CORS 正式来源由运维确认、`SiteSetting` migration 另行审阅、`App.tsx`/`api.ts`/产品服务端文件可被人工拆成最小 hunk，以及用户对实际 Git 暂存命令的明确授权。

生产构建验收以独立生产构建任务记录的 **`npm run build` 退出码 0** 为准；第 8.5 节此前未捕获最终退出标记的运行记录不应再被解释为当前构建失败。
