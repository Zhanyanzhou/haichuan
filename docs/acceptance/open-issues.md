# HC-MASTER-ACCEPTANCE-10: 待解决问题清单

> 最后核对：2026-08-13（基于当前代码事实）
> 历史条目保留，标注当前状态。以代码和测试证据为准。
> ⚠️ 2026-08-23 校正：本文不是当前完成度来源；旧 ProductList、独立 Search、交易与 migration 条目须以代码、机器合同和 `docs/CURRENT_STATE.md` 的新鲜证据重验。

---

## P0 — 阻止项目运行或核心业务

| # | 问题 | 当前状态 | 证据 |
|---|---|---|---|
| P0-1 | POST /api/products → 400 (ValidationPipe whitelist) | ✅ 已修复 | HC-PRODUCT-CONTRACT-FIX-11A |
| P0-2 | 无客户前台选款提交流程 | ✅ 已解决 | [Catalog](../../client/src/pages/public/Catalog/index.tsx) 选款托盘 + selectionInquiryApi.submit |
| P0-3 | 无支付网关对接 | 🟡 保持冻结 | 当前阶段不开放交易（DECISIONS D.2）；后端 CustomerCommerceGuard 503 |

---

## P1 — 关键链路不完整

| # | 问题 | 当前状态 | 证据 |
|---|---|---|---|
| P1-1 | 商品列表页仍用静态数据 | ✅ 已修复 | ProductList 走 useProductData → 真实公开 API |
| P1-2 | 页面构建器前端模块编辑仅支持 hero/doublePoster | ⚠️ 待核实 | 需在 editor workbench 实测（本会话无浏览器） |
| P1-3 | 选款提交流程无 API 对接 | ✅ 已解决 | [selection-inquiry.service.ts](../../server/src/modules/selection-inquiry/selection-inquiry.service.ts) 入库 + 前端 submit |
| P1-4 | 行为事件采集未接入前端页面 | ✅ **已关闭（设计决定）** | P0-C：分析默认关闭 no-op，不创建 _asid、不发送 /analytics/track |
| P1-5 | 网站设置未接入前台 | ✅ 已解决 | PublicLayout/Contact/StorefrontNavigation 均走 settingsApi.getPublicSettings |
| P1-6 | Dashboard API 部分 400 错误 | ⚠️ 待核实 | 需后端运行实测 |
| P1-7 | .git/objects 为空 | ✅ 已解决 | git log 有完整提交历史 |

---

## P2 — 体验与质量

| # | 问题 | 当前状态 | 证据 |
|---|---|---|---|
| P2-1 | HeroBlock.tsx JSX 语法错误 | ✅ 已过时 | blocks 已统一为 Puck 体系，旧 HeroBlock 不存在（DECISIONS B.1） |
| P2-2 | npx nest build 不可用 | ⚠️ 待本机核实 | 需用户本机执行 `cd server && npm run build` |
| P2-3 | prisma generate DLL 锁定 | ⚠️ 环境项 | Windows 文件锁，停服务后重试 |
| P2-4 | [antd: message] 静态方法警告 | ⚠️ 低优先级 | 不影响功能 |
| P2-5 | 产品名称快照编码问题 | ⚠️ 待核实 | 需真实数据测试 |
| P2-6 | 未做 1440/1024/768/390 断点验证 | 🟡 部分覆盖 | responsive-public.spec.ts 已测 4 视口横向溢出（1440/960/720/360）；完整视觉验收需浏览器 |

---

## 2026-08-13 新增待办

| # | 问题 | 状态 | 说明 |
|---|---|---|---|
| NEW-1 | Playwright 尚未纳入 CI | 🟡 记录建议 | 需浏览器安装，属流水线变更，不擅自改依赖 |
| NEW-2 | 正式域名未确认 | 🟡 阻塞 | robots/sitemap/JSON-LD 域名相关内容保持空，确认后补回 |
| NEW-3 | 真实联系信息待填 | 🟡 阻塞 | 后台 SiteSettings 需填真实电话/邮箱/地址 |
| NEW-4 | 本会话无 Shell 工具 | 🟡 阻塞 | build/lint/typecheck/playwright 待用户本机执行 |
| NEW-5 | CORS 默认域名 | 🟡 待统一 | server/src/main.ts CORS 默认 haichuanjewelry.com，基础设施配置 |

---

## HC-TRANSACTION-09 专项结论

| 问题 | 回答 |
|---|---|
| 是否具备真实支付能力？ | ❌ **不可以** — 无支付网关凭证 |
| 是否可以开启 paymentEnabled？ | ❌ **不可以** |
| 是否可以开放交易中心？ | ❌ **不可以** |
| 是否可以处理真实资金？ | ❌ **不可以** |
| 已完成什么？ | Payment/Refund 模型 + OrderItem 快照字段 + 后台交易域管理页（payments/fulfillment/refunds/after-sales） |
| 尚缺什么？ | 支付网关对接 / 回调验证 / 客户前台支付页（当前安全冻结） |
