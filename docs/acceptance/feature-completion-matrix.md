# HC-MASTER-ACCEPTANCE-10: 功能完成度矩阵

> 按模块/功能逐项标注实际状态。✅=已证实 ❌=未证实 ⚠️=部分可用

## 商品中心

| 功能 | 状态 | 证据 |
|---|---|---|
| Product 模型 | ✅ | 4条数据, PUBLISHED/OFFLINE |
| Category 模型 | ✅ | 4条分类 |
| 商品列表API (GET) | ✅ | 200, 可分页/搜索 |
| 商品详情API (GET) | ✅ | 200 |
| 商品创建API (POST) | ❌ | 400 (whitelist) |
| 商品状态流转API | ✅ | DRAFT→PUBLISHED→OFFLINE 验证通过 |
| 完整性检查API | ✅ | 返回 score + missingFields |
| 后台商品列表页 | ⚠️ | 页面可用, 状态枚举已更新 |
| 后台商品编辑 | ⚠️ | 编辑弹窗可用, 新字段未完全适配 |
| 商品图片上传 | ⚠️ | 有 API, 有页面元素 |
| 前台商品列表 | ⚠️ | ProductList 仍用 collections.ts |
| 前台商品详情 | ✅ | productApi.getById |
| 前台选款中心 | ⚠️ | useProductData→API, 已移除静态回退 |
| 前台搜索 | ⚠️ | useProductData→API, 筛选静态 |

## 页面构建器

| 功能 | 状态 | 证据 |
|---|---|---|
| PageModule 模型 | ✅ | 含 publishedContent/version |
| PageModuleVersion 模型 | ✅ | 表已创建 |
| 模块类型注册 (8种) | ✅ | GET /api/page-modules/types → 200 |
| 版本历史 API | ✅ | GET /versions |
| 版本恢复 API | ✅ | PUT /restore |
| 发布+快照 API | ✅ | PUT /publish |
| 前台已发布读取 | ✅ | GET /published → 200 (0条) |
| 三栏工作区 | ⚠️ | 冻结, 未测试 |
| 模块编辑 | ❌ | 仅 hero/doublePoster |
| 模块预览 | ❌ | 未验证 |
| 设备切换 | ❌ | 未验证 |
| 商品推荐模块 | ❌ | 模型有, 前端无 |

## 客户线索

| 功能 | 状态 | 证据 |
|---|---|---|
| Inquiry 模型 | ✅ | 含 internalNote/nextFollowUpAt |
| SelectionInquiry 模型 | ✅ | 含 internalNote/nextFollowUpAt |
| LeadFollowUp 模型 | ✅ | 表已创建 |
| 统一线索聚合 API | ✅ | GET /api/leads → 200 |
| 统一线索详情 API | ✅ | GET /api/leads/:type/:id |
| 线索状态更新 API | ✅ | PUT /api/leads/:type/:id |
| 跟进记录 API | ✅ | POST/GET follow-up |
| 后台统一线索页 | ⚠️ | /admin/leads 页面框架 |
| 客户前台预约提交 | ✅ | inquiriesApi (Contact页) |
| 客户前台选款提交 | ❌ | Zustand only, 无 API 提交 |
| 真实线索数据 | ❌ | inquiries=0, selection_inquiries=0 |

## 客户前台数据源

| 页面 | 实际数据源 | 状态 |
|---|---|---|
| 首页 | usePublishedModules/Slots | ✅ 真实API |
| 商品列表 | collections.ts | ❌ 静态数据 |
| 商品详情 | productApi.getById | ✅ 真实API |
| 搜索 | useProductData→API | ✅ 真实API |
| 选款中心 | useProductData→API | ✅ 真实API |
| 预约咨询 | inquiriesApi | ✅ 真实API |
| LOGO/电话/页脚 | 硬编码 | ❌ 未接入Settings API |
| SEO | 硬编码 | ❌ 未接入 |

## 行为事件采集

| 功能 | 状态 | 证据 |
|---|---|---|
| AnalyticsEvent 模型 | ✅ | 表已创建 |
| track API | ✅ | POST /api/analytics/track |
| events API | ✅ | GET /api/analytics/events |
| 前端 Hook | ✅ | useAnalytics.ts 存在 |
| 前端实际调用 | ❌ | 0条事件, 未接入页面 |
| 防重复 | ⚠️ | 代码有节流, 未验证 |
| 失败不阻塞 | ✅ | fire-and-forget |

## 电商交易

| 功能 | 状态 | 证据 |
|---|---|---|
| Payment 模型 | ✅ | 表已创建 |
| Refund 模型 | ✅ | 表已创建 |
| OrderItem 快照字段 | ✅ | 模型已更新 |
| Feature Flags | ✅ | 4个开关, 全部 false |
| 购物车 | ❌ | Cart API 存在但无前端 |
| 订单创建 | ❌ | 无流程 |
| 支付网关 | ❌ | 无对接 |
| 交易后台 | ❌ | 无页面 |
