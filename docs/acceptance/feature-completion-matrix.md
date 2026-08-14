# HC-MASTER-ACCEPTANCE-10: 功能完成度矩阵

> 最后核对：2026-08-13（基于当前代码事实）
> ✅=代码已证实  ⚠️=部分可用/待运行验证  ❌=未实现  🧊=安全冻结（代码保留）

## 商品中心

| 功能 | 状态 | 证据 |
|---|---|---|
| Product 模型 + 公开/会员/合作可见性 | ✅ | PUBLIC/MEMBER/PARTNER/INTERNAL |
| Category 模型 | ✅ | 4 级树形 |
| 公开商品列表 API | ✅ | GET /products/public，字段白名单（PUBLIC_ACCESS_MATRIX §3） |
| 公开商品详情 API | ✅ | GET /products/public/:id，不可见统一 404 |
| 会员目录 API | ✅ | GET /products/catalog，CustomerAuthGuard |
| 公开媒体端点 | ✅ | productId+imageId 联合校验，DB buffer 输出，nosniff |
| 商品管理 CRUD | ✅ | 后台 ProductManage/ProductEditor |
| 前台商品列表 | ✅ | ProductList → useProductData → 公开 API |
| 前台商品详情 | ✅ | ProductDetail → productApi.getPublicById |
| 前台选款中心 | ✅ | Catalog → useProductData → API |
| 前台搜索 | ✅ | Search → useProductData → API |
| 空状态/loading/error | ✅ | ProductList/Catalog/Search 三态完整（P0-E 核对） |

## 页面构建器（Puck PageDocument）

| 功能 | 状态 | 证据 |
|---|---|---|
| PageDocument 模型 + 版本历史 | ✅ | page_documents / page_document_revisions |
| 已发布文档前台读取 | ✅ | pageDocumentApi.getPublished（@Public） |
| Puck 渲染器 | ✅ | PuckDocumentRenderer（lazy） |
| 编辑器工作台 | ⚠️ | EditorWorkbench 存在，模块编辑完整度需浏览器实测 |
| 首页兜底 | ✅ | FallbackHome（无发布文档时不白屏） |

## 客户线索

| 功能 | 状态 | 证据 |
|---|---|---|
| Inquiry 模型 | ✅ | 含 internalNote/nextFollowUpAt |
| SelectionInquiry 模型 | ✅ | 含商品快照 |
| LeadFollowUp 模型 | ✅ | 表已创建 |
| 统一线索聚合 API | ✅ | GET /api/leads |
| 后台线索/咨询/选款管理页 | ✅ | /admin/leads、/admin/inquiries、/admin/selection-inquiry |
| 客户前台预约提交 | ✅ | inquiriesApi.submit（Contact 页，含隐私同意） |
| 客户前台选款提交 | ✅ | selectionInquiryApi.submit（Catalog 选款托盘，2026-08-13 补隐私同意） |
| 提交限流 | ✅ | inquiry + selection-inquiry 均 @Throttle 5/min |
| 真实线索数据 | ❌ | 不向真实库写测试线索，部署前人工验收 |

## 客户前台数据源（全部真实 API）

| 页面 | 数据源 | 状态 |
|---|---|---|
| 首页 | Puck PageDocument / FallbackHome | ✅ |
| 商品列表 | useProductData → /products/public | ✅ |
| 商品详情 | productApi.getPublicById | ✅ |
| 搜索 | useProductData → API | ✅ |
| 选款中心 | useProductData → API | ✅ |
| 预约咨询 | inquiriesApi | ✅ |
| 联系信息 | settingsApi.getPublicSettings | ✅ 真实来源（P0-C） |
| SEO meta | PublicLayout syncMeta + pageMetaStore | ✅ 动态（P1-C） |

## 公开信息真实性（P0-C，2026-08-13）

| 功能 | 状态 | 证据 |
|---|---|---|
| 假电话/邮箱/地址清除 | ✅ | 全仓搜索仅测试文件保留断言 |
| Contact 三态 | ✅ | loading/loaded/error + 空值过滤 |
| /privacy 页面 | ✅ | 匿名可访问，7 章节 + SiteSettings 联系区块 |
| 隐私链接（表单+页脚） | ✅ | Contact + Catalog + PublicLayout → /privacy |
| 行为分析默认关闭 | ✅ | useAnalytics no-op，无 _asid、无 /analytics/track |
| JSON-LD 仅可确认字段 | ✅ | 删除未确认域名 + 假电话 |
| robots/sitemap 无未确认域名 | ✅ | sitemap 合法空结构 |

## 交易冻结（P0-B/D）

| 功能 | 状态 | 证据 |
|---|---|---|
| 前端交易 CTA 冻结 | 🧊 | CUSTOMER_COMMERCE_ENABLED=false → 加购/付款凭证不渲染 |
| /cart /checkout 重定向 | 🧊 | → /contact?reason=commerce-unavailable |
| 后端交易写接口 503 | 🧊 | CustomerCommerceGuard 拒绝 cart/checkout/payment-proof |
| 后台交易域管理 | ✅ | /admin/trade/*（payments/fulfillment/refunds/after-sales/quotations/overview/anomalies） |
| 支付网关 | ❌ | 未对接（当前阶段不开放） |

## 测试

| 类型 | 状态 | 证据 |
|---|---|---|
| Playwright 公开访问 | ✅ | public-access.spec.ts |
| Playwright 隐私信任 | ✅ | privacy-trust.spec.ts（2026-08-13 新增） |
| Playwright 响应式 | ✅ | responsive-public.spec.ts（4 视口，含 /privacy） |
| 契约测试 | ✅ | page-builder / trade 状态机 / 并发 / 契约 |
| CI（lint+build+typecheck+契约） | ✅ | ci.yml + quality.yml |
| Playwright 纳入 CI | ❌ | 需浏览器安装，记录建议 |
