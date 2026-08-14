# 海川珠宝 — 服务端模块手册

> 最后更新：2026-08-13

## 商品中心

| 模块           | 路由              | 核心功能                                  |
| -------------- | ----------------- | ----------------------------------------- |
| **products**   | `/api/products`   | CRUD、图片管理、状态流转、主图/列表图设置 |
| **categories** | `/api/categories` | 4 级树形分类、软删除、SEO 字段            |
| **inventory**  | `/api/inventory`  | 多仓库库存、安全预警、库存调整            |
| **gold-price** | `/api/gold-price` | 手动调价、自动采集(定时任务 Cron)         |
| **upload**     | `/api/upload`     | 图片上传、Sharp 裁剪压缩、日期目录存储    |

## 订单与客户

| 模块                  | 路由                     | 核心功能                                       |
| --------------------- | ------------------------ | ---------------------------------------------- |
| **orders**            | `/api/orders`            | 订单状态机(合法转换校验)、发货/完成            |
| **cart**              | `/api/cart`              | 购物车(userId/sessionId 双模式) 🧊交易冻结 503 |
| **customers**         | `/api/customers`         | 前台客户注册/登录/me 资料/地址；checkout 🧊交易冻结 503 |
| **inquiries**         | `/api/inquiries`         | 咨询提交(Public)、列表查询、分配/回复          |
| **selection-inquiry** | `/api/selection-inquiry` | 选款咨询、状态流转                             |
| **leads**             | `/api/leads`             | 统一线索管理(聚合 inquiry+selection)、跟进记录 |
| **recommendations**   | `/api/recommendations`   | 热门/为你推荐（CustomerAuthGuard）             |
| **partner-applications** | `/api/partner-applications` | 合作商申请与审核                            |

## 交易域（后台管理页可用，前台交易入口冻结）

| 模块              | 路由                          | 核心功能                                       |
| ----------------- | ----------------------------- | ---------------------------------------------- |
| **fulfillment**   | `/api/fulfillment`            | 履约/发货管理                                  |
| **refunds**       | `/api/refunds`                | 退款管理                                       |
| **after-sales**   | `/api/after-sales`            | 售后管理                                       |
| **trade-events**  | （内部）                      | 交易领域事件                                   |

> 前台购物车/结算/支付/付款凭证由 `CustomerCommerceGuard` 统一拒绝（503），后台 `/admin/trade/*` 管理页对历史数据保持可用。

## 内容管理

| 模块              | 路由                 | 核心功能                                    |
| ----------------- | -------------------- | ------------------------------------------- |
| **homepage**      | `/api/homepage`      | 首页配置(旧版)                              |
| **page-modules**  | `/api/page-modules`  | 页面构建器（20 种区块）、草稿/发布、版本快照、SSE 通知 |
| **content-slots** | `/api/content-slots` | 内容槽位(已发布/草稿/管理)                  |
| **settings**      | `/api/settings`      | 系统设置（`site_settings` 数据表持久化；旧 JSON 仅首次导入） |
| **marketing**     | `/api/marketing`     | 促销+优惠券管理                             |

## 工具与系统

| 模块              | 路由                 | 核心功能                            |
| ----------------- | -------------------- | ----------------------------------- |
| **auth**          | `/api/auth`          | JWT 登录、bcrypt                    |
| **users**         | `/api/users`         | 用户 CRUD、5 角色 RBAC              |
| **ai-classify**   | `/api/ai-classify`   | AI 图片分类(Kimi Vision)、单张/批量 |
| **analytics**     | `/api/analytics`     | 行为事件追踪                        |
| **statistics**    | `/api/statistics`    | Dashboard 统计、经营趋势(订单/成交/咨询/浏览按日聚合) |
| **notifications** | `/api/notifications` | 用户通知                            |

## 通用基础设施

| 组件                 | 路径                   | 说明           |
| -------------------- | ---------------------- | -------------- |
| PrismaService        | `common/prisma/`       | 全局数据库连接 |
| JwtAuthGuard         | `common/guards/`       | JWT 认证       |
| RolesGuard           | `common/guards/`       | 角色权限       |
| @Public()            | `common/decorators/`   | 跳过认证       |
| @Roles()             | `common/decorators/`   | 角色限制       |
| TransformInterceptor | `common/interceptors/` | 统一响应格式   |
| KimiService          | `common/kimi/`         | AI 服务        |
| HealthController     | `common/health/`       | `/api/health` 与 `/api/ready` 容器探针 |
| AuditLogInterceptor  | `common/interceptors/` | 已认证写操作审计（敏感字段脱敏） |

## 已知问题

- 本地 Prisma 引擎 DLL 被开发服务占用时，`prisma generate` 可能失败；停止占用服务后重新生成即可
- 页面构建器前后端区块类型由 `npm run test:contracts` 校验，变更任一侧时必须同步更新另一侧
