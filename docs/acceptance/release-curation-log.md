# 发布整理交付日志

> 整理日期：2026-08-14
> 整理分支：`codex/release-curation-20260814`
> 远程：`origin`（已配置的 GitHub 远程；本日志不记录任何凭据）
> 边界：本次只整理已能独立审阅并验证的源码变更；未删除、回退、移动或覆盖任何既有工作区资产，也未执行数据库命令。

## 已提交批次

### 2026-08-14 后续整理

| 提交 | 主题与文件 | 验证证据 | 推送状态 |
| --- | --- | --- | --- |
| `2c7b007` | `fix(client): 展示全局请求失败提示`。文件：`client/src/App.tsx`、`client/src/services/api.ts`、`client/src/services/requestErrorEvents.ts`、`client/src/components/common/RequestErrorNotice.tsx`。以浏览器原生事件替换 Ant Design 静态消息调用，集中展示 403、429、5xx 与业务失败提示，并提供 `role="alert"` 与自动消失行为。 | 精确暂存后已复核缓存差异并通过 `git diff --cached --check`；`npm run typecheck`、`npm run lint`、`npm run build` 均通过；Playwright 全量：55 通过、7 个因未配置真实 API 或客户令牌而跳过。 | 待本日志提交后一并常规推送至 `origin/codex/release-curation-20260814`。 |
| `ec04ef3` | `feat(settings): 持久化公开联系信息与隐私入口`。文件：公开 `SiteSetting` Schema 与 `20260813090000_add_site_settings` SQL 源码、设置服务和公开接口、`/privacy` 页面与路由、页脚隐私入口、联系页空值/加载/错误降级及隐私同意可访问性。联系信息只取实际设置，移除了伪造电话、邮箱和地址兜底。 | 缓存精确复核后 `git diff --cached --check` 通过；`npm run typecheck`、`npm run lint`、`npm run test:selection-inquiry`（20 项）、`npm run test:contracts`（26 种区块）、`npm run build` 均通过；联系/隐私 Playwright：18 通过、1 个 mock 模式场景按配置跳过。 | 待本日志提交后一并常规推送至 `origin/codex/release-curation-20260814`。 |

后续静态审查：Puck 相关改动横跨 39 个文件，约 7,847 行新增、3,013 行删除，并与 `server/src/modules/page-modules`、`server/src/app.module.ts` 和包含多业务域的 `server/prisma/schema.prisma` 相互依赖；选款咨询也依赖同一 Schema。为避免形成无法在干净提交基线构建的半成品，未继续暂存。Schema 还同时包含交易、合作商家、公开目录和页面文档结构，不能安全归为单一 migration 提交；本次未执行任何 Prisma、migration、seed 或数据库连接命令。密码重置、管理员检查、补偿迁移脚本、CSV、Docker override、VS Code 配置、预览图片仍排除，且未读取敏感脚本实现。

`ec04ef3` 所含 SQL 仅作为版本化源码提交，未执行。部署或启动包含此服务端变更的环境前，必须由数据库负责人审核表结构影响、完成备份与演练，并在隔离环境验证后决定是否执行该 migration；在 migration 未执行的环境中，不应发布该服务端设置持久化代码。

本轮对受控目录、合作商家申请与选款咨询的继续审查确认：`20260813130000_add_catalog_access_and_partner_applications` 不只是新增字段和表，还包含对既有 `products` 与 `customers` 的 `UPDATE`，会把存量商品的默认可见性处理为 `MEMBER` 并改变既有客户的访问策略。该策略必须先由业务负责人和数据库负责人共同确认（包括适用范围、备份、回滚与隔离环境验证），因此该 migration 源码及其依赖的目录/客户/合作商家/全局鉴权改动均未暂存、未提交、未执行；`test:selection-inquiry` 的静态契约通过不替代该项业务与数据库确认。

### 2026-08-14 公开交易入口冻结

`9bd3a39` `fix(public): 冻结线上交易公开入口`：仅提交 `client/src/App.tsx` 中 `/cart`、`/checkout` 的咨询页重定向，以及 `CustomerCommerceGuard` 对购物车、客户结算和付款凭证上传入口的默认拒绝。只有部署环境显式设置 `CUSTOMER_COMMERCE_ENABLED=true` 才会解除守卫；本提交不设置该变量、不部署、不开放交易。暂存复核仅包含 5 个文件、37 行净改动，`git diff --cached --check` 通过；`npm run typecheck`、`npm run lint`、`npm run test:selection-inquiry`（20 项）、`npm run test:contracts`（26 种区块）、`npm run build` 与 `git diff --check` 均通过。交易、订单、支付后台、退款、履约、报价及所有 migration 仍排除在外。

`5c639c5` `perf(home): 按需加载页面装修运行时`：仅提交 `client/src/pages/public/Home/index.tsx` 的 4 个性能 hunk。首页与预览页只在取得已发布的 Puck 数据后再动态加载渲染器，并为动态模块提供带 `role="status"` 的加载反馈；同文件中“移除失效图片”的独立 hunk 未暂存。`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 与 `git diff --cached --check` 均通过。

`f1cc82a` `fix(home): 移除失效首页媒体引用`：单独删除首页对不存在的 `/images/hero/oriental-water-bangle-v1.png` 的引用，保留既有标题、文案和咨询入口，不删除任何本地资源或真实经营内容。该 hunk 与上一批在同一未变更工作树中完成的 `typecheck`、`lint`、`build` 证据一致，提交前再次通过工作区与暂存区差异检查。

`74ca59c` `feat(puck): 完成页面装修器编辑与发布方案`：按已确认的当前实现保存页面装修器完整依赖链（61 个文件）：区块、适配器、字段与检查器、发布渲染、后台配置、服务端页面文档接口、前端并发参数、受控图片展示，以及 `PageDocumentRevision` 版本唯一约束的 migration 源码。`npm run typecheck`、`npm run lint`、`npm run test:contracts`（26 种区块）、`npm run build`、`git diff --check` 与 `git diff --cached --check` 均通过；本次仅提交 migration 源码，未执行数据库命令。已知风险保留：历史版本恢复尚未采用与保存/发布相同的乐观并发控制，应在后续修复批次处理中。

| 提交 | 主题与文件 | 暂存复核 | 验证证据 |
| --- | --- | --- | --- |
| `b21cacb` | `fix(public): 移除未确认公开元数据并改善错误可访问性`。文件：`client/index.html`、`client/public/robots.txt`、`client/public/sitemap.xml`、`client/src/components/common/ErrorBoundary.tsx`、`client/src/pages/public/About/index.tsx`。移除未确认域名、电话与不存在的分享图；公开错误恢复按钮具备原生按钮语义与可见焦点；补充固定的品牌页元信息。 | 每次精确路径暂存后均执行 `git diff --cached --check`、`--name-only`、`--stat` 和完整暂存差异复核。未包含 Puck、交易、数据库、依赖、脚本或未跟踪候选。 | 当前完整工作区：`npm run typecheck`、`npm run lint`、`npm run test:selection-inquiry`、`npm run test:contracts`、`npm run build` 均退出成功；`git diff --check` 通过。运行时烟测报告记录公开路由及联系页隐私必填提示的桌面/移动复验；未将其视为真实 API 成功路径验收。 |
| `1790823` | `fix(api): 加强公开接口的安全降级与限流`。文件：`server/src/main.ts`、`server/src/modules/inquiries/inquiries.controller.ts`、`server/src/common/filters/http-exception.filter.ts`、`server/src/common/interceptors/transform.interceptor.ts`。生产环境要求显式 CORS 来源；公开咨询写接口限流；静态资源 4xx 保持正确状态；二进制/已结束响应不再被 JSON 包装。 | 同上。提交前完整检查显示仅上述 4 个文件暂存，无任何无关路径。 | 同上。生产 CORS 实际值未读取、未输出，仍须由运维在部署窗口按正式来源配置；本次未部署。 |

上述两个功能提交以及本日志的初始提交 `c61687a` 已通过常规 fast-forward 推送至 `origin/codex/release-curation-20260814`；本次未使用强制推送或改写历史。

## 已排除的批次与原因

| 主题 | 当前范围摘要 | 不提交原因与可行动下一步 |
| --- | --- | --- |
| 公开站剩余 P0 与联系/隐私页 | `App.tsx`、`api.ts`、`Contact`、公开产品/媒体服务、`Privacy`、`SecureImage`、`ProductCard` 等。 | 与选款、目录访问、Puck、交易或 `SiteSetting` 数据库迁移混杂。`Contact`/`Privacy` 的公开设置来源依赖未审阅的 schema/migration；`App.tsx` 与产品服务端文件无法在不人工编辑补丁的前提下安全分段。下一步：先进行数据库负责人 SQL 审阅，再由开发负责人准备最小、可独立检视的 hunk。 |
| 页面装修器（Puck）默认内容与发布安全 | `client/src/page-builder/**`、区块组件、模板 SVG、`HomepageConfig`、`page-modules`、相关测试与发布审计文档。 | 发布内容审计明确记录“版本恢复缺少乐观并发控制”的代码阻断项，且后台工作台/内容授权/素材来源尚未完成验收。下一步：修复恢复并发控制、完成授权后台的桌面和移动工作台验收及内容/素材复核。 |
| 选款咨询与合作商申请 | `selection-inquiry`、`partner-applications`、`Catalog` 咨询片段、客户鉴权/可见性、后台管理页与验证脚本。 | 静态契约测试通过 20 项，但仍依赖未审阅的数据模型；成功、限流、角色和后台状态更新尚未在隔离环境联调。下一步：完成 DTO/迁移 SQL 审阅，在隔离环境运行边界路径验证，确认合作商业务规则。 |
| 交易、订单、支付实验 | 购物车、订单、支付、履约、退款、售后、报价、事件、客户中心和后台交易页面。 | 数据模型/迁移及依赖锁文件尚未独立审阅；仅可证明公开入口设计为冻结，不能把实验代码当成可发布交易能力。下一步：保持 `CUSTOMER_COMMERCE_ENABLED=false` 与服务端拒绝守卫，完成状态机/并发/权限测试及人工审阅；不得接入支付或真实数据。 |
| 数据库 schema、迁移和 seed | `server/prisma/schema.prisma`（当前约 +409/-7 行）、5 个未跟踪 migration、`seed.ts`。 | 数据结构与迁移均须数据库负责人审阅；本任务未执行 migration、seed、Prisma 或任何数据库连接。下一步：审阅 SQL 与 schema 一致性、锁表和回滚/数据影响，并单独决定源码提交与执行窗口。 |
| 依赖、配置、Docker、CI、编辑器设置 | 根/前后端 manifest 与 lock、Docker、`.vscode`、`.env.example`、CI、脚本。 | 依赖/锁文件存在大范围变更，未获独立依赖审阅；Docker/CI/编辑器设置可能改变运行或开发机行为。`.env.example` 仅允许结构审阅，未读取真实 `.env`。下一步：逐项确认依赖目的、锁文件一致性、CI 外部影响和团队适用性。 |
| 敏感或临时候选 | `upload-products.csv`、`pilot-*`、`docker-compose.override.yml`、`.vscode/launch.json`、`.vscode/tasks.json`、预览 PNG、`server/reset-admin-*.cjs`、`server/_check-admin.cjs`、`server/migrate-*.cjs`、`server/scripts/migrate-product-media.ts`。 | CSV/试运行标识/预览图/本机覆盖配置的业务用途和版本化价值未确认。密码/凭据重置脚本未读取，必须人工安全复核；补偿与迁移脚本可能影响真实数据，未读取实现、未运行、未提交。 |
| 规则与其他文档 | `AGENTS.md`、现有文档变更及未跟踪验收文档。 | `AGENTS.md` 为安全规则文件，需用户单独确认；其他文档需要责任人确认日期和证据范围。它们未与功能提交混合。 |

## 当前工作树摘要

- 保留大量已跟踪和未跟踪的用户资产，覆盖前后端、Puck、选款/合作商、交易、数据库、配置、文档和工具；未做任何清理或回退。
- 当前 `git diff --check` 通过，但 Git 仍对多份既有文本文件提示 LF 到 CRLF 的潜在工作副本转换；本次没有批量格式化或行尾转换。
- 测试/构建是在完整脏工作区上执行，证明当前组合可通过静态门禁，不替代每个后续拆分批次在最小暂存集或受控工作树中的验证。

## 仍需确认的事项

1. 由数据库负责人审阅 schema 与 5 份正式 migration 的 SQL、影响、回滚与执行窗口；本分支不执行数据库变更。
2. 由运维确认生产 `CORS_ORIGIN` 的正式来源格式并在部署环境配置；不要将实际值写入源码、日志或提交信息。
3. 由业务/法务/运营确认正式域名、联系资料、隐私主体与 Puck 已发布内容、图片/外链/模板素材的真实性和授权。
4. 由安全负责人审查密码重置、管理员检查和潜在数据迁移脚本；在结论前继续不读取实现、不运行、不提交。
5. 由项目负责人确认依赖、Docker、CI、本机覆盖、CSV、试运行文件、预览图与 VS Code 文件是否应版本化。
