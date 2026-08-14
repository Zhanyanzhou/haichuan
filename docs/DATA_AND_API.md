# 海川珠宝 — 数据与 API

> 最后更新：2026-08-13

## API 端点

### 认证

| 方法 | 路径              | 认证   | 说明           |
| ---- | ----------------- | ------ | -------------- |
| POST | `/api/auth/login` | Public | 登录，返回 JWT |

### 核心业务

| 方法                | 路径                               | 说明                       |
| ------------------- | ---------------------------------- | -------------------------- |
| GET                 | `/api/products`                    | 产品列表(分页、筛选、搜索) |
| GET/POST/PUT/DELETE | `/api/products[/:id]`              | 产品 CRUD                  |
| PUT                 | `/api/products/:id/images/primary` | 设置主图                   |
| PUT                 | `/api/products/:id/images/listing` | 设置列表图                 |
| GET/POST/PUT/DELETE | `/api/categories[/:id]`            | 分类 CRUD                  |
| GET/POST/PUT        | `/api/orders[/:id]`                | 订单管理                   |
| GET/PUT             | `/api/inventory[/:id]`             | 库存管理                   |
| GET/POST            | `/api/gold-price`                  | 金价管理                   |

### 页面构建器

| 方法   | 路径                              | 说明             |
| ------ | --------------------------------- | ---------------- |
| GET    | `/api/page-modules/published`     | 已发布模块(前台) |
| GET    | `/api/page-modules/admin`         | 全部模块(后台)   |
| PUT    | `/api/page-modules/draft`         | 保存草稿         |
| PUT    | `/api/page-modules/reorder`       | 排序             |
| PUT    | `/api/page-modules/:id/toggle`    | 可见性           |
| POST   | `/api/page-modules/:id/duplicate` | 复制             |
| DELETE | `/api/page-modules/:id`           | 删除             |
| PUT    | `/api/page-modules/publish`       | 发布             |
| GET    | `/api/health`                     | 进程存活探针     |
| GET    | `/api/ready`                      | 数据库就绪探针   |

### 其他模块（摘要）

| 模块    | 主要端点                                            |
| ------- | --------------------------------------------------- |
| 用户    | `GET/POST/PUT/DELETE /api/users`                    |
| 咨询    | `GET /api/inquiries`, `POST /api/inquiries`(Public) |
| 选款    | `GET /api/selection-inquiry`                        |
| 线索    | `GET /api/leads`                                    |
| AI 分类 | `POST /api/ai-classify/single\|batch`               |
| 分析    | `GET /api/analytics/events`                         |
| 统计    | `GET /api/statistics/dashboard`、`GET /api/statistics/trend` |
| 上传    | `POST /api/upload/image`                            |
| 设置    | `GET/PUT /api/settings`                             |

## 统一响应格式

```json
{
  "code": 200,
  "data": { ... },
  "message": "success",
  "timestamp": "2026-08-07T..."
}
```

前端 `utils/unwrap.ts` 解包。

## 数据库核心表

| 表               | 关键字段                                            |
| ---------------- | --------------------------------------------------- |
| users            | username, password, role(5种)                       |
| categories       | name, parentId(自关联4级)                           |
| products         | code, name, categoryId, materialType, price, status |
| product_images   | productId, url, cropData                            |
| orders           | orderNo, customerName, finalAmount, status          |
| inventory        | productId, sku, stock, safetyStock, warehouse       |
| gold_prices      | price, source(手动/自动)                            |
| inquiries        | customerName, phone, message, status                |
| page_documents / page_document_revisions | pageKey, Puck JSON, 发布快照、版本历史 |
| site_settings    | key, value(Json), version, updatedBy                |
| operation_logs   | userId, action, detail                              |
| analytics_events | eventType, sessionId, payload(Json)                 |

## 调用约定

- 认证：`Authorization: Bearer <jwt_token>`
- 分页：`?page=1&pageSize=20`
- Mock 模式：仅在构建变量 `VITE_USE_MOCK=true` 时启用；生产环境必须保持未设置或 `false`
