# 海川珠宝 — 当前状态

> 最后整理：2026-08-23 | 当前实现结论来自工作树源码、配置、静态契约及本轮限定的本地浏览器检查；既有运行结果在文中按时间与证据范围单列。本轮未连接目标数据库或生产环境。本文件记录易变化事实，不构成操作授权。

## 证据分层（必须按此阅读）

| 层级 | 可以说明什么 | 不能说明什么 |
| ---- | ------------ | ------------ |
| **A. 当前可验证实现** | 当前工作树中的路由、组件、Schema、配置、合同与测试资产确实存在 | 真实浏览器结果、目标数据库兼容、真实业务闭环或生产可用 |
| **B. 与现行方向或专项决定的实现差距** | 引用方向基线或稳定专项决定后，说明当前尚未实现、接线或验证的部分 | 在本文件重新陈述、扩展或裁决目标 |
| **C. 仅代码推断 / 待真实验证** | 根据当前调用链可预期的行为，或此前运行快照暴露的风险 | 当前进程、真实数据、浏览器、支付或生产环境已经复现 |

本文件每项结论必须落入以上一层；源码结构不得写成浏览器验收，实现差距不得反向定义项目方向，历史运行结果不得冒充本轮新鲜证据。

## A. 当前可验证实现

### 开发与实现入口（2026-08-20 核对）

- 当前工作区为 `G:\网站搭建2`，前端路径别名 `@/` 指向 `client/src/`。
- 本地开发端口所有权：宿主机后端 `3000`，Vite 前端 `5173`；容器后端仅映射 `127.0.0.1:3002`，完整容器栈通过 `:80` 访问。运行说明见 `docs/DEVELOPMENT_WORKFLOW.md`，决策原因见 `docs/DECISIONS.md` A.12。
- 前端共享 HTTP 客户端当前位于 `client/src/services/api.ts`；该文件同时聚合多个领域 API。长期硬约束是共享同一传输与拦截器，未来可在不建立第二客户端的前提下按领域拆分。
- 响应解包入口为 `client/src/utils/unwrap.ts`；商品图选取入口为 `client/src/utils/productImage.ts`；材质标签入口为 `client/src/utils/material.ts`。
- Mock 只由 Vite `mock` mode 显式开启，入口为 `npm run dev:mock`，消费点为 `client/src/services/mockData.ts`；默认开发与生产构建均走真实 API。

### 认证、状态与数据生命周期（2026-08-20 核对）

- 后台员工使用 `User`，前台客户使用 `Customer`；当前后台角色为 `SUPER_ADMIN / ADMIN / EDITOR / CUSTOMER_SERVICE / WAREHOUSE / SALES_CONSULTANT / FINANCE`。
- 两域当前共用 `JWT_SECRET` 并通过 payload `type` 区分；`JwtAuthGuard`、`RolesGuard`、`ThrottlerGuard` 当前注册为全局 Guard。是否拆分密钥仍是 `docs/DECISIONS.md` D.6 的待决事项。
- 前端全局状态当前沿用 Zustand；具体 Store、权限键和 Feature Flag 导出必须从当前代码复核。
- `Product` 当前使用 `deletedAt` 软删除；`Category` 当前以 `isActive` 停用，`deletedAt` 尚未形成有效语义。终局语义仍是 `docs/DECISIONS.md` D.5 的待决事项。
- 项目当前没有统一 Prisma 软删除 middleware/extension；涉及删除过滤时必须沿当前查询链逐项核对，不得凭此现状推断未来实现。

### 页面装修与公开路由源码（2026-08-23 核对）

- Puck `PageDocument` 是唯一活跃装修体系，贯穿页面模块后端、编辑器、预览、公开 Renderer、区块组件和适配器。
- 活跃模板数量、角色、比例、控件和发布限制以 `contracts/page-builder/content-templates.contract.json` 及生成产物为准，不在本文件复制易漂移数字；其中 `pageRules` 是模板可用于何种页面角色、是否必须包含固定业务区及其位置的唯一机器门禁，模板并非全页面通用。
- 历史 `ContentSlot` 与旧装修体系已清退；历史材料仅作证据，不具执行力。
- 当前 `App.tsx` 的 `/products` 是品牌 PageDocument 容器，路由本身不再加载休眠的 `ProductList`；公开内容由 `PublicLayout` / `PublishedPageDecoration` 统一渲染。
- 合作申请的唯一实际表单位于登录后的“我的账户”合作区块；旧 `/partner` 只做登录保护后的兼容跳转到 `/customer?section=partner`，不再维护第二份表单或状态来源。
- `/search` 当前在 `App.tsx` 中只做查询参数兼容并重定向到 `/catalog`。

### 已确认的静态实现差距（2026-08-23 审查）

- `client/src/App.tsx` 无条件注册声称仅限本地开发的 `/__templates`，且该路由位于公开布局中；生产隔离尚未实现。
- `PublicLayout` 当前只区分预览与非预览页面设置 robots，账户、密码重置、购物车和结算等路由仍会得到 `index, follow`。
- `/products` 在没有有效发布内容时会使用编辑器默认 seed 作为公开回退，尚未区分未发布、空内容和请求失败。
- 当前五种 `SalesMode` 的详情页主行动尚未完整携带作品上下文并进入对应真实流程，部分模式只是通用跳转或不可操作提示。
- 购物车加购、购物车读取和订单创建链路尚未形成统一的客户商品可见性复核；交易开关当前默认关闭，但这不能替代未来开放前的权限修复与边界测试。
- 非直购商品的响应价格会被隐藏，但当前价格筛选和排序仍可能使用其 SKU 价格，存在结果语义矛盾和价格区间推断风险。
- 公开商品序列化器当前返回的部分字段超出现行访问矩阵白名单，尚未逐项完成公开必要性确认或收窄。
- 内容模板合同当前主要通过元数据与属性表达部分顺序、高度和比例，真实 Renderer DOM、父子关系和响应式顺序尚未证明完全由合同驱动。
- 未知前台路径当前静默重定向到首页，没有可理解的 Not Found 页面或可验证的真实 HTTP 404。

### 本地公开页面实查（2026-08-23）

- 本地 `http://127.0.0.1:5173/` 在 `1920 × 1200` 桌面视口可加载公开首页；等待内容渲染后首屏为暖棕金色人像 Hero，巨大 `HAICHUAN` 字样是第一焦点。该检查只证明当前本地页面观感，不证明素材授权、真实生产内容或 Core Web Vitals 达标。
- 当前公开首页 `PageDocument id=3 / version=38` 的 Hero 具有独立桌面和移动图片，但 `title / subtitle / altText / actionText` 均为空；关键品牌名、年度系列与英文口号直接存在于图片画面中，缺少可访问、可本地化和可独立审核的实时文字层。
- 本地 `/products` 在 `1920 × 1200` 与 `390 × 844` 视口均只显示大面积空白及“寻找具体款式 / 进入选款中心”，没有真实作品、系列、材质工艺或顾问服务章节；当前公开结果不满足基线定义的编辑式作品展陈职责。
- 首页初次检查曾短暂出现内容加载状态，本轮没有测量 LCP、CLS 或完整网络瀑布；不得由截图速度推断性能已经通过。

## B. 与现行方向或专项决定的实现差距

- 公开页面职责、客户旅程和五种 `SalesMode` 的长期方向只认 `docs/PROJECT_GUARDRAILS.md` 第 2 节；当前路由结构已部分对齐，但详情行动、公开空态与错误态仍有上述缺口。
- 双客群、三报价、客户确认、资源门禁和订单冻结的业务执行合同只认 `docs/DECISIONS.md` D.19，字段与数值校验只认 `docs/PRODUCT_DATA_CONTRACT.md`；当前 Schema、API、客户管理、报价、费用、合作价格协议和订单快照尚未按该框架完成审计或实现。
- 合作申请入口已在源码中收敛到“我的账户”；真实申请、审核、客户专属双克价和合作订单的数据闭环仍未完成。
- 当前没有新鲜证据证明高级定制报价确认、合作报价转单或真实资金处理已经开放；代码路径、路由或历史测试均不能替代目标环境验收。

### CMS 整改状态

- 2026-08-23 的历史快照发现首页发布位包含外部品牌素材；当前是否仍公开、是否已按 `docs/PROJECT_GUARDRAILS.md` 第 5 节完成止损和可逆整改，尚未刷新验证。

## C. 仅代码推断或待真实验证

- `/products` 的 PageDocument 容器、`/partner` 兼容跳转和账户内合作区块已通过隔离浏览器目标测试；尚未以当前真实后台发布稿和真实客户申请数据完成联调。
- 2026-08-23 的既有本地运行证据记录：公开首页 `PageDocument id=3`、发布 `version=38` 的区块 `moduleId=homepage-block-1787107294851-6` 引用了含外部品牌 `AURÉLIA PARIS` 的上传图片。该快照尚未在本轮刷新，不能写成当前线上已复现或已修复。
- 既有本地检查记录 Vite `5173` 读取当前工作树、宿主机 `3000` 后端可能早于当前 `dist`；本轮未重新启动或核对进程，不能视为前后端同版本联调。

### 前台路由源码清单（本轮未做浏览器验收）

| 路由            | 当前源码与证据边界                                              |
| --------------- | ---------------------------------------------------------------- |
| `/`             | 路由挂载 `Home`；是否取得有效发布 PageDocument 属运行状态，本轮未刷新 |
| `/products`     | 品牌 PageDocument 容器，不加载搜索、筛选或休眠商品列表；真实发布内容待联调 |
| `/products/:id` | 当前源码中的统一作品详情路由；只具备部分零售价格、SKU、数量与加购逻辑，其他服务或报价行动尚未形成闭环 |
| `/catalog`      | 路由挂载 `Catalog`，源码含搜索、筛选、排序与选款；目标职责见 B 层 |
| `/cart`         | 购物车（需登录且交易开关开放；当前关闭）          |
| `/checkout`     | 结算（需登录且交易开关开放；当前关闭）            |
| `/custom`       | 定制服务                                          |
| `/search`       | 兼容重定向到 `/catalog`，并保留受支持的查询参数   |
| `/customer`     | 客户中心（登录/注册 + 个人服务）                  |
| `/about`        | 关于我们                                          |
| `/contact`      | 预约咨询（SiteSettings 真实联系信息）             |
| `/privacy`      | 隐私说明（2026-08-13 新增，匿名可访问）           |
| `/partner`      | 登录保护后的兼容跳转，统一进入 `/customer?section=partner` 的账户内申请流程 |
| `/preview/:pageKey` | PageDocument 草稿预览（页面构建器使用）       |

### 后台（含交易域子页面）

工作台、商品管理、商品编辑、分类管理、属性字典、库存、金价、素材库、订单管理、咨询管理、选款咨询、线索、客户管理（/admin/customers，只读档案+消费聚合+收藏）、评价管理、页面编辑器（editor/:pageKey）、网站设置、AI 分类、行为分析、用户管理、操作日志、系统设置、登录、合作商申请审核。上述页面和 API 接线存在不等于真实开发数据闭环已完成。

交易域子页面：`/admin/trade/payments`、`/admin/trade/fulfillment`、`/admin/trade/refunds`、`/admin/trade/after-sales`、`/admin/trade/quotations`、`/admin/trade/overview`、`/admin/trade/anomalies`。当前只确认代码、目标测试与隔离浏览器路径；尚未以已确认的本地开发数据库完成商品、SKU 价格、库存、发布、下单、收款审核、履约、退款、售后和员工禁用的连续真实数据验收。

## A. 当前可验证实现补充：服务端模块（含交易域）

products, categories, auth, users, orders, inventory, inquiries, selection-inquiry, leads, gold-price, upload, settings, page-modules, ai-classify, analytics, marketing, statistics, cart, customers, recommendations, partner-applications, fulfillment, refunds, after-sales, trade-events, reviews, attributes。

（homepage 已并入 page-modules；notifications 站内信与 content-slots 插槽已作为死资产删除。）

## C. 数据库与运行版本（待目标环境验证）

- `server/prisma/migrations/20260822120000_add_inventory_policy/` 已生成但尚未确认执行；目标数据库和 `_prisma_migrations` 状态未确认。未经用户确认本地开发库目标前，不执行 migration 或真实数据回填。
- 当前运行后端可能早于工作树最新构建，因而旧 API 响应不能直接证明当前源码缺少能力；同样，源码和构建通过也不能证明运行数据库已经兼容。
- 真实游客目录当前只有 3 条不适合品牌验收的测试商品，且均为 `DISPLAY_ONLY`；没有可用于验证直购、售罄、0 库存或 `SINGLE_UNIT` 的代表性公开数据。

## C. 交易状态（既有本地运行证据与代码边界）

既有 2026-08-23 本地运行快照记录 API 返回 `commerceEnabled=false`、`cartEnabled=false`、`paymentEnabled=false`；本轮没有刷新该进程。当前源码具备受控代码路径，但没有真实交易联调或生产开放证据。

- `docker-compose.yml` 将 `CUSTOMER_COMMERCE_ENABLED` 的 Compose 默认值设为 `false`；仅按 D.2 完成审批的环境才可显式设为 `true`，不等于生产状态或上线批准。
- 后端 `CustomerCommerceGuard` 与公开 `GET /settings/flags` 只在环境变量精确为 `true` 时开放；变量缺失、拼写错误或其他值均按关闭处理。
- 新网关交易另由服务端 `PAYMENT_GATEWAY_TRANSACTIONS_ENABLED` 总门禁控制，缺失或非精确 `true` 时客户与后台均不能创建网关交易；门禁不阻断暂停前已创建交易的验签、金额校验和幂等回调核销。
- 前端从 `/settings/flags` 加载同一开关；加载失败回退全关。开关关闭时 `/cart`、`/checkout` 跳转咨询页，开启时才渲染需登录的购物车与结算页面。
- 线下转账、付款凭证私有存储、客户读取与后台审核链路已有代码和静态契约；2026-08-17 `npm run test:trade` 共 59 项通过，但尚未在本轮使用真实数据库、真实客户身份和实际转账完成端到端联调。
- 微信/支付宝网关存在适配代码并要求商户凭据；本轮未读取 `.env`，因此凭据是否配置、通道是否可用、回调和真实资金闭环均未核验。
- 后台员工确认报价在服务层直接拒绝；客户本人确认状态机和不可变报价快照未建立前，报价转单也在任何数据库写入前安全暂停。历史报价与已转订单关联仍可只读查看。
- 库存释放、取消与超时释放共用事务内原子释放入口；代码级并发测试证明重复请求只恢复一次，切换为 `SINGLE_UNIT` 后最多恢复 1。真实 MySQL 多连接并发尚未验证。
- 手工和自动金价写入只创建 `GoldPrice` 事实，不再调用商品固定价改写路径；未来按重动态价仍须按 D.10 另行设计和审批。
- SiteContent 前端路由与导航已收窄到 `SUPER_ADMIN` / `ADMIN`，与服务端设置接口白名单一致；页面历史版本恢复已要求 `expectedUpdatedAt` 并以原子条件更新拒绝陈旧请求。
- 对外只能表述为“是否提供在线交易以当前站点实际功能和经批准的服务条款为准”，不得宣称完整支付闭环已经上线。

## A/C. 测试资产与历史运行证据

- **Playwright E2E**（`client/tests/`）：`public-access.spec.ts`（公开访问 + 交易关闭降级 + 字段白名单）、`responsive-public.spec.ts`（4 视口横向溢出）、`responsive-admin.admin.spec.ts`、`core-template-homepage.spec.ts`、`privacy-trust.spec.ts`。交易关闭测试证明降级路径存在，不证明当前部署一定关闭。
- **契约测试**（`scripts/`）：page-builder / trade 状态机 / trade 并发 / trade 契约。
- CI（`.github/workflows/`）：ci.yml 包含 client/server lint+build；quality.yml 包含 lint、typecheck、contract、trade、build，并定义 `e2e-public` 安装 Chromium 后运行 `public-chromium`。CI 配置存在不等于本轮 CI 已实际执行或通过。

2026-08-23 新鲜代码级验证包括：服务端构建；库存释放、资金门禁、报价暂停、金价事实和版本恢复 16 项目标测试；SiteContent 权限与版本恢复 10 项浏览器测试；客户端生产构建与目标 lint。以上结果仍不是生产、真实支付或真实数据库联调证据。

## C. 已知问题与待新鲜验证项

1. **首页外部品牌素材风险待刷新** — 既有 `id=3/version=38` 运行快照记录上述区块含 `AURÉLIA PARIS`；已批准 CMS 可逆替换，但本轮未核对当前公开版本或执行整改。
2. **数据库迁移状态未确认** — `InventoryPolicy` migration 已生成但未执行；数据库目标确认前不得迁移或回填。
3. **开发前后端版本可能错位** — Vite 使用当前源码，宿主机后端可能仍运行旧 `dist`。
4. **后台真实经营闭环未完成** — 页面、API、单元/隔离测试不能代替已确认本地开发库的跨模块数据验收。
5. **生产交易状态未核验** — 未检查真实环境变量、商户凭据、实际部署、真实数据库和支付回调。
6. **正式域名未确认** — robots/sitemap/JSON-LD 保持空或相对路径，确认后补回。
7. **真实联系信息待填** — 后台 SiteSettings 联系字段为空时前台正确隐藏。
8. **FallbackHome 仅是兼容兜底** — 静态内容未关联商品库，不能作为 CMS 发布、内容真实性或视觉验收通过证据。
9. **CORS 默认域名** — `server/src/main.ts` CORS 默认 `haichuanjewelry.com`，属基础设施配置待统一处理。
10. **统一交易详情尚不完整** — `client/src/pages/public/ProductDetail/index.tsx` 当前只覆盖部分 `DIRECT_PURCHASE` 零售价格、SKU、数量和加购/登录购买；已批准的高级定制报价确认、合作商专属红蜡/紫蜡克价、附加费用和订单快照均尚未实现或浏览器验收。
11. **报价确认与转单安全暂停** — 当前后台员工不能代客户确认，转单在客户本人确认状态机、不可变报价快照和所需 Schema 获批实现前返回安全拒绝；这不是完整经营闭环。

### 已过时的历史结论（以代码事实为准）

- ~~"0 个测试"~~：已有多套 Playwright + 契约测试。
- ~~"两套 blocks 并存"~~：旧 `blockComponents` 已不存在，首页统一走 Puck PageDocument。
- ~~"5 个 service `(this.prisma as any)`"~~：固定数量结论已失效，修改时以当前搜索与类型检查为准。
- ~~"Feature Flag 全仓 0 引用"~~：`useCommerceEnabled` 已被 ProductDetail、CustomerCenter 等消费，控制交易 CTA 渲染。
