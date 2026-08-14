# HC-MASTER-ACCEPTANCE-10: 端到端流程矩阵

> 最后核对：2026-08-13（基于当前代码事实）
> 代码闭环 ≠ 真实接口已验证。标注区分。

## 商品发布链

| 步骤 | 状态 | 证据 |
|---|---|---|
| 后台新增商品 | ✅ | POST /api/products，DTO 校验 |
| 草稿不公开 | ✅ | 公开接口 status=PUBLISHED 过滤 |
| 后台发布 | ✅ | 状态流转 |
| 公开目录出现 | ✅ | Catalog → /products/public |
| 搜索/筛选 | ✅ | Search → API |
| 详情可打开 | ✅ | productApi.getPublicById |
| 下架后隐藏 | ✅ | 公开接口过滤 |
| **完整闭环**: ✅ 代码层通过；真实数据需部署后人工抽查 |

## 页面发布链（Puck PageDocument）

| 步骤 | 状态 | 证据 |
|---|---|---|
| 编辑器工作台 | ⚠️ | EditorWorkbench 存在，完整模块编辑需浏览器实测 |
| 保存/发布 | ✅ | pageDocumentApi + 后端发布端点 |
| 前台渲染 | ✅ | PuckDocumentRenderer（lazy） |
| 未发布兜底 | ✅ | FallbackHome 不白屏 |
| 版本历史 | ✅ | PageDocumentRevision |
| **代码层**: ✅；可视化编辑完整度需浏览器实测 |

## 预约咨询链

| 步骤 | 状态 | 证据 |
|---|---|---|
| 前台表单 | ✅ | Contact 页，label 关联 + 隐私同意 + 必填校验 |
| 提交 | ✅ | inquiriesApi.submit → POST /inquiries（@Public + @Throttle） |
| 后端校验 | ✅ | CreateInquiryDto class-validator |
| 后台聚合 | ✅ | /api/leads + /admin/inquiries |
| 状态流转 | ✅ | PUT /api/leads/:type/:id |
| **代码层**: ✅；真实库写入属部署前人工验收项 |

## 客户选款链

| 步骤 | 状态 | 证据 |
|---|---|---|
| 加入选款 | ✅ | selectionStore（Zustand） |
| 提交选款 | ✅ | selectionInquiryApi.submit（Catalog 选款托盘） |
| 隐私同意 | ✅ | 2026-08-13 补齐 checkbox + /privacy 链接 |
| 商品快照 | ✅ | productNameSnapshot/SkuSnapshot/ImageSnapshot |
| 后端校验 | ✅ | name/phone regex + items 1-20 + @Throttle |
| 后台管理 | ✅ | /admin/selection-inquiry |
| **代码层**: ✅；真实库写入属部署前人工验收项 |

## 数据采集链（P0-C 设计决定：默认关闭）

| 步骤 | 状态 | 证据 |
|---|---|---|
| trackPageView / trackSearch 等 | 🧊 no-op | useAnalytics ANALYTICS_ENABLED=false |
| _asid 匿名标识 | 🧊 不创建 | 模块级不写 localStorage |
| /analytics/track 请求 | 🧊 不发送 | send 函数注释停用 |
| **状态**: ✅ 安全关闭；未来开启需先完成隐私偏好/授权机制 |

## 交易链（P0-B/D 安全冻结）

| 链路 | 状态 | 证据 |
|---|---|---|
| 购物车 | 🧊 | /cart 重定向咨询；CustomerCommerceGuard 503；加购按钮不渲染 |
| 结算/下单 | 🧊 | /checkout 重定向咨询；customers/checkout 503 |
| 支付 | 🧊 | 无支付网关；payment-proof 上传 503 |
| 退款售后 | ⚠️ | 后台 /admin/trade/refunds + after-sales 管理页可用；前台入口冻结 |
| 履约 | ⚠️ | 后台 /admin/trade/fulfillment 可用；无真实交易数据 |
| **状态**: 前台全链路冻结；后台管理页代码就绪，无真实交易数据 |

## 公开信息真实性链（P0-C，2026-08-13）

| 步骤 | 状态 | 证据 |
|---|---|---|
| SiteSettings 后台配置 | ⚠️ | 联系字段待运营填入真实值 |
| 公开设置接口 | ✅ | GET /settings/public（@Public，白名单字段） |
| 前台联系信息显示 | ✅ | 空值隐藏，三态，无假兜底 |
| 隐私说明可访问 | ✅ | /privacy 匿名路由 |
| **代码层**: ✅；真实联系信息待运营提供 |
