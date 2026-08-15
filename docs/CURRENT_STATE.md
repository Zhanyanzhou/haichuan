# 海川珠宝 — 当前状态

> 最后更新：2026-08-13 | 基于当前代码事实核对

## 页面清单

### 前台（13 页）

| 路由            | 功能                             |
| --------------- | -------------------------------- |
| `/`             | 首页（Puck PageDocument 渲染，FallbackHome 兜底） |
| `/products`     | 公开作品列表（游客公开接口）     |
| `/products/:id` | 作品详情（公开/会员目录双通道）  |
| `/catalog`      | 选款中心（矩阵网格 + 选款托盘）  |
| `/cart`         | **重定向** → `/contact?reason=commerce-unavailable`（交易冻结） |
| `/checkout`     | **重定向** → `/contact?reason=commerce-unavailable`（交易冻结） |
| `/custom`       | 定制服务                         |
| `/search`       | 搜索                             |
| `/customer`     | 客户中心（登录/注册 + 个人服务） |
| `/about`        | 关于我们                         |
| `/contact`      | 预约咨询（SiteSettings 真实联系信息） |
| `/privacy`      | 隐私说明（2026-08-13 新增，匿名可访问） |
| `/partner`      | 合作商申请（需会员登录）         |
| `/preview/home` | 首页预览（iframe，页面构建器用） |

### 后台（含交易域子页面）

工作台、商品管理、商品编辑、分类管理、属性字典、库存、金价、素材库、订单管理、咨询管理、选款咨询、线索、客户管理（/admin/customers，只读档案+消费聚合+收藏）、评价管理、页面编辑器（editor/:pageKey）、网站设置、AI 分类、行为分析、用户管理、操作日志、系统设置、登录、合作商申请审核。

交易域子页面：`/admin/trade/payments`、`/admin/trade/fulfillment`、`/admin/trade/refunds`、`/admin/trade/after-sales`、`/admin/trade/quotations`、`/admin/trade/overview`、`/admin/trade/anomalies`。

## 服务端模块（含交易域）

products, categories, auth, users, orders, inventory, inquiries, selection-inquiry, leads, gold-price, upload, settings, page-modules, ai-classify, analytics, marketing, statistics, cart, customers, recommendations, partner-applications, fulfillment, refunds, after-sales, trade-events, reviews, attributes。

（homepage 已并入 page-modules；notifications 站内信与 content-slots 插槽已作为死资产删除。）

## 当前交易冻结状态（P0-B/D）

- 前端 `CUSTOMER_COMMERCE_ENABLED=false`（[featureFlags.ts](../client/src/store/featureFlags.ts)）：加购按钮、付款凭证入口恒不渲染。
- 后端 `CustomerCommerceGuard` 拒绝 cart/checkout/payment-proof 写接口，统一返回 503。
- `/cart`、`/checkout` 路由重定向至顾问咨询页。
- 代码保留（安全冻结），未删除，未来开启需单独完成支付/退款/审计验收。

## 测试现状

- **Playwright E2E**（`client/tests/`）：`public-access.spec.ts`（公开访问 + 交易冻结 + 字段白名单）、`responsive-public.spec.ts`（4 视口横向溢出）、`responsive-admin.admin.spec.ts`、`core-template-homepage.spec.ts`、`privacy-trust.spec.ts`（2026-08-13 新增，P0-C 隐私与信任）。
- **契约测试**（`scripts/`）：page-builder / trade 状态机 / trade 并发 / trade 契约。
- CI（`.github/workflows/`）：ci.yml（client/server lint+build）、quality.yml（lint+typecheck+contract+trade+build）。**Playwright 尚未纳入 CI**（需浏览器安装，记录为待办，不擅自改依赖）。

## 已知问题（2026-08-13 核对）

1. **本会话无 Shell 工具** — build/lint/typecheck/playwright 需用户本机执行验证。
2. **正式域名未确认** — robots/sitemap/JSON-LD 保持空或相对路径，确认后补回。
3. **真实联系信息待填** — 后台 SiteSettings 联系字段为空时前台正确隐藏。
4. **首页 FallbackHome 静态精选** — 未关联商品库；上线后由运营发布真实 Puck 文档覆盖。
5. **CORS 默认域名** — `server/src/main.ts` CORS 默认 `haichuanjewelry.com`，属基础设施配置待统一处理。

### 已过时的历史结论（以代码事实为准）

- ~~"0 个测试"~~：已有多套 Playwright + 契约测试。
- ~~"两套 blocks 并存"~~：旧 `blockComponents` 已不存在，首页统一走 Puck PageDocument。
- ~~"5 个 service `(this.prisma as any)`"~~：PrismaClient 绕过实际 0 处（见 DECISIONS B.2）。
- ~~"Feature Flag 全仓 0 引用"~~：`isCustomerCommerceEnabled` 已被 ProductDetail、CustomerCenter 等消费，控制交易 CTA 渲染。
