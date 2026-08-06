# HC-MASTER-ACCEPTANCE-10: 待解决问题清单

> 2026-08-06 | 按优先级排序

---

## P0 — 阻止项目运行或核心业务

| # | 问题 | 影响阶段 | 证据 |
|---|---|---|---|
| P0-1 | ~~POST /api/products → 400 (ValidationPipe whitelist)~~ ✅ 已修复 (HC-PRODUCT-CONTRACT-FIX-11A) | PRODUCT-02 | 创建商品不可用 |
| P0-2 | 无客户前台选款提交流程 | CRM-04, FRONTEND-05 | 选款咨询链路全断 |
| P0-3 | 无支付网关对接 | TRANSACTION-09 | 不具备真实支付能力 |

---

## P1 — 关键链路不完整

| # | 问题 | 影响阶段 | 证据 |
|---|---|---|---|
| P1-1 | 商品列表页(ProductList)仍用 collections.ts 静态数据 | FRONTEND-05 | 前台商品展示非真实数据 |
| P1-2 | 页面构建器前端模块编辑仅支持 hero/doublePoster | CMS-03 | 8种模块类型后端已就绪, 前端未实现 |
| P1-3 | 选款提交流程无 API 对接 (Zustand only) | CRM-04 | 选款数据不入库 |
| P1-4 | 行为事件采集未接入前端页面 | ANALYTICS-06 | analytics_events=0 |
| P1-5 | 网站设置(LOGO/电话/页脚/SEO)未接入前台 | FRONTEND-05 | 多页面硬编码 |
| P1-6 | Dashboard API 部分 400 错误 | PLATFORM-01 | 工作台指标不准确 |
| P1-7 | `.git/objects` 为空, 无版本历史 | PROGRAM-00 | 无法追溯变更 |

---

## P2 — 体验与质量

| # | 问题 | 影响阶段 | 证据 |
|---|---|---|---|
| P2-1 | HeroBlock.tsx JSX 语法错误 | 全局 | tsc --noEmit 6 errors |
| P2-2 | `npx nest build` 不可用 | 全局 | 需用 tsc 替代 |
| P2-3 | `prisma generate` DLL 锁定 | 全局 | 需先停服务 |
| P2-4 | `[antd: message]` 静态方法警告 | 全局 | 控制台警告 |
| P2-5 | 产品名称快照编码问题 | CONTENT-QA-08 | 中文显示乱码 |
| P2-6 | 未做 1440/1024/768/390 四断点布局验证 | CONTENT-QA-08 | 响应式未检查 |

---

## HC-TRANSACTION-09 专项结论

| 问题 | 回答 |
|---|---|
| 是否具备真实支付能力？ | ❌ **不可以** — 无支付网关凭证 |
| 是否可以开启 paymentEnabled？ | ❌ **不可以** |
| 是否可以开放交易中心？ | ❌ **不可以** |
| 是否可以处理真实资金？ | ❌ **不可以** |
| 已完成什么？ | Payment/Refund 模型 + OrderItem 快照字段 |
| 尚缺什么？ | 支付网关对接 / 回调验证 / 交易后台 / 客户前台支付页 |
