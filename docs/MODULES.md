# 海川珠宝 — 服务端模块手册

> 最后更新：2026-08-07 | 21 个模块

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
| **cart**              | `/api/cart`              | 购物车(userId/sessionId 双模式)                |
| **inquiries**         | `/api/inquiries`         | 咨询提交(Public)、列表查询、分配/回复          |
| **selection-inquiry** | `/api/selection-inquiry` | 选款咨询、状态流转                             |
| **leads**             | `/api/leads`             | 统一线索管理(聚合 inquiry+selection)、跟进记录 |

## 内容管理

| 模块              | 路由                 | 核心功能                                    |
| ----------------- | -------------------- | ------------------------------------------- |
| **homepage**      | `/api/homepage`      | 首页配置(旧版)                              |
| **page-modules**  | `/api/page-modules`  | 页面构建器(9 种类型)、草稿/发布、排序、复制 |
| **content-slots** | `/api/content-slots` | 内容槽位(已发布/草稿/管理)                  |
| **settings**      | `/api/settings`      | 系统设置(文件+数据库双存储)                 |
| **marketing**     | `/api/marketing`     | 促销+优惠券管理                             |

## 工具与系统

| 模块              | 路由                 | 核心功能                            |
| ----------------- | -------------------- | ----------------------------------- |
| **auth**          | `/api/auth`          | JWT 登录、bcrypt                    |
| **users**         | `/api/users`         | 用户 CRUD、5 角色 RBAC              |
| **ai-classify**   | `/api/ai-classify`   | AI 图片分类(Kimi Vision)、单张/批量 |
| **analytics**     | `/api/analytics`     | 行为事件追踪                        |
| **statistics**    | `/api/statistics`    | Dashboard 统计                      |
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

## 已知问题

- 5 个模块 service 中使用 `(this.prisma as any)` 绕过类型检查
- 需运行 `npx prisma generate` 生成正确类型
