# 海川珠宝 — 当前状态

> 最后更新：2026-08-17 | 基于当前代码、配置与静态契约测试核对；未核验生产环境

## 页面清单

### 前台（13 页）

| 路由            | 功能                                              |
| --------------- | ------------------------------------------------- |
| `/`             | 首页（Puck PageDocument 渲染，FallbackHome 兜底） |
| `/products`     | 公开作品列表（游客公开接口）                      |
| `/products/:id` | 作品详情（公开/会员目录双通道）                   |
| `/catalog`      | 选款中心（矩阵网格 + 选款托盘）                   |
| `/cart`         | 购物车（需登录）                                  |
| `/checkout`     | 结算（需登录，线下转账付款）                      |
| `/custom`       | 定制服务                                          |
| `/search`       | 搜索                                              |
| `/customer`     | 客户中心（登录/注册 + 个人服务）                  |
| `/about`        | 关于我们                                          |
| `/contact`      | 预约咨询（SiteSettings 真实联系信息）             |
| `/privacy`      | 隐私说明（2026-08-13 新增，匿名可访问）           |
| `/partner`      | 合作商申请（需会员登录）                          |
| `/preview/home` | 首页预览（iframe，页面构建器用）                  |

### 后台（含交易域子页面）

工作台、商品管理、商品编辑、分类管理、属性字典、库存、金价、素材库、订单管理、咨询管理、选款咨询、线索、客户管理（/admin/customers，只读档案+消费聚合+收藏）、评价管理、页面编辑器（editor/:pageKey）、网站设置、AI 分类、行为分析、用户管理、操作日志、系统设置、登录、合作商申请审核。

交易域子页面：`/admin/trade/payments`、`/admin/trade/fulfillment`、`/admin/trade/refunds`、`/admin/trade/after-sales`、`/admin/trade/quotations`、`/admin/trade/overview`、`/admin/trade/anomalies`。

## 服务端模块（含交易域）

products, categories, auth, users, orders, inventory, inquiries, selection-inquiry, leads, gold-price, upload, settings, page-modules, ai-classify, analytics, marketing, statistics, cart, customers, recommendations, partner-applications, fulfillment, refunds, after-sales, trade-events, reviews, attributes。

（homepage 已并入 page-modules；notifications 站内信与 content-slots 插槽已作为死资产删除。）

## 当前交易状态（2026-08-17 代码级核对）

结论：交易域具备**受控开放路径**，但仓库证据不能证明生产环境已经开放或完成真实交易联调。

- `docker-compose.yml` 将 `CUSTOMER_COMMERCE_ENABLED` 的 Compose 默认值设为 `true`；这只描述使用该编排且未覆盖变量时的容器配置，不等于生产状态或上线批准。
- 后端 `CustomerCommerceGuard` 与公开 `GET /settings/flags` 只在环境变量精确为 `true` 时开放；变量缺失、拼写错误或其他值均按关闭处理。
- 前端从 `/settings/flags` 加载同一开关；加载失败回退全关。开关关闭时 `/cart`、`/checkout` 跳转咨询页，开启时才渲染需登录的购物车与结算页面。
- 线下转账、付款凭证私有存储、客户读取与后台审核链路已有代码和静态契约；2026-08-17 `npm run test:trade` 共 59 项通过，但尚未在本轮使用真实数据库、真实客户身份和实际转账完成端到端联调。
- 微信/支付宝网关存在适配代码并要求商户凭据；本轮未读取 `.env`，因此凭据是否配置、通道是否可用、回调和真实资金闭环均未核验。
- 对外只能表述为“是否提供在线交易以当前站点实际功能和经批准的服务条款为准”，不得宣称完整支付闭环已经上线。

## 测试现状

- **Playwright E2E**（`client/tests/`）：`public-access.spec.ts`（公开访问 + 交易关闭降级 + 字段白名单）、`responsive-public.spec.ts`（4 视口横向溢出）、`responsive-admin.admin.spec.ts`、`core-template-homepage.spec.ts`、`privacy-trust.spec.ts`。交易关闭测试证明降级路径存在，不证明当前部署一定关闭。
- **契约测试**（`scripts/`）：page-builder / trade 状态机 / trade 并发 / trade 契约。
- CI（`.github/workflows/`）：ci.yml（client/server lint+build）、quality.yml（lint+typecheck+contract+trade+build）。**Playwright 尚未纳入 CI**（需浏览器安装，记录为待办，不擅自改依赖）。

本轮验证：`npm run test:trade` 通过（15 项状态机 + 18 项并发/金额/幂等 + 26 项跨层静态契约）；`npm run test:selection-inquiry` 通过。以上仍不是生产、真实支付或真实数据库联调证据。

## 已知问题（2026-08-13 核对）

1. **生产交易状态未核验** — 未检查真实环境变量、商户凭据、实际部署、真实数据库和支付回调。
2. **正式域名未确认** — robots/sitemap/JSON-LD 保持空或相对路径，确认后补回。
3. **真实联系信息待填** — 后台 SiteSettings 联系字段为空时前台正确隐藏。
4. **首页 FallbackHome 静态精选** — 未关联商品库；上线后由运营发布真实 Puck 文档覆盖。
5. **CORS 默认域名** — `server/src/main.ts` CORS 默认 `haichuanjewelry.com`，属基础设施配置待统一处理。

### 已过时的历史结论（以代码事实为准）

- ~~"0 个测试"~~：已有多套 Playwright + 契约测试。
- ~~"两套 blocks 并存"~~：旧 `blockComponents` 已不存在，首页统一走 Puck PageDocument。
- ~~"5 个 service `(this.prisma as any)`"~~：固定数量结论已失效，修改时以当前搜索与类型检查为准。
- ~~"Feature Flag 全仓 0 引用"~~：`useCommerceEnabled` 已被 ProductDetail、CustomerCenter 等消费，控制交易 CTA 渲染。
