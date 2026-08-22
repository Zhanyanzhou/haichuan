# 海川珠宝 — 数据与 API

> 最后更新：2026-08-23。端点和字段数量会变化，精确事实以当前控制器、DTO、Schema 与 `docs/CURRENT_STATE.md` 为准；本页只作领域导航，不作为交易开放或真实联调证明。

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
| users            | username, password, role(7种；精确枚举以 Schema 为准) |
| categories       | name, parentId(自关联4级)                           |
| products         | code, name, categoryId, materialType, salesMode, inventoryPolicy, price(派生最低价), status |
| product_skus     | productId, skuCode, price(DIRECT_PURCHASE 成交价事实) |
| product_images   | productId, url, cropData                            |
| orders           | orderNo, customerName, finalAmount, status          |
| inventories      | skuId, warehouseId, quantity, safetyStock, lastCheckAt, updatedAt；可售库存事实源 |
| inventory_reservations | orderId, inventoryId, skuId, quantity, expiresAt, releasedAt, consumedAt；订单库存预占明细 |
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
- 路由或 API 存在不代表交易开放；客户交易和真实资金门禁以 `docs/DECISIONS.md` D.2 / D.18 为准。

## 已批准报价目标（尚未形成当前 API 或数据表）

> 本节只把 `docs/DECISIONS.md` D.19 派生为数据与 API 导航；D.19 是产品业务决定源，必要数值校验见 `docs/PRODUCT_DATA_CONTRACT.md`。当前 Schema、DTO、Controller、Service 和数据库迁移尚未实现这些对象；不得把下表字段当成现有响应、数据库列或已可调用端点，也不得据此执行 migration。

### 当前代码事实

- 现有零售直购成交价读取 `ProductSKU.price`，`Product.price` 是有效且有价 SKU 的最低价派生缓存。
- 可售库存读取 Inventory；现有零售购物车、零售结算和直接下单只接受符合当前零售门禁的 `DIRECT_PURCHASE`。这不限制未来定制或合作报价确认后的独立转单路径。
- 当前已有产品、询价/选款、报价、订单和支付相关代码入口，但没有统一实现三条报价通道、蜡模克价、客户专属双克价、附加费用配置和完整订单冻结字段。

### 目标能力与数据边界

| 目标对象 | 必须表达的数据 | 约束 |
| --- | --- | --- |
| 报价通道 | 标准零售固定价 / 高级定制 / 合作商蜡模价 | 三通道相互独立；`SalesMode` 只定义公开主行动，不表达客户身份、合作资格、专属价或排他通道 |
| 高级定制报价版本 | 客户需求、版本、费用明细、币种、总额、客户确认主体、状态与时间 | 已认证客户本人确认后才能转单；后台不得代确认，修改须产生新版本 |
| 蜡模报价事实 | 蜡种、3D 文件版本、目标金重、确认蜡重、有效克价、克价来源 | 红蜡/紫蜡是 3D 文件打印的 1:1 蜡模；确认蜡重是结算重量 |
| 客户专属双克价 | 客户、紫蜡克价、红蜡克价、生效/失效、原因、设置人和审计时间 | 仅 `SUPER_ADMIN` / `ADMIN` 可设置；两种克价必须同时明确 |
| 默认蜡模克价 | 紫蜡与红蜡的系统默认克价及版本 | 无有效客户专属双克价时读取；业务口径见 D.19，精确校验数值见商品数据合同 |
| 附加费用配置 | 计费方式（固定/按克/按单）、适用客群、启停、说明、币种与以后配置的金额 | 具体项目和金额尚未配置，不得推断 |
| 分通道资源门禁 | 零售 SKU/Inventory；定制产能/材料/工艺；合作文件版本/蜡模产能/材料 | 转单前按通道复核，不能用成品零售库存代替定制/合作门禁 |
| 订单完整快照 | 客群、报价通道、确认主体/时间、币种、费用和总额；另按通道冻结 SKU/数量/单价、定制需求/报价版本或蜡种/文件版本/重量/克价来源 | 配置或资料后续变化不得改写历史订单 |

- `预计金重 ≈ 确认蜡重 × 10` 仅为内部生产参考，不得进入客户结算公式或对外保证。
- 同一设计可同时具有零售、定制和合作报价；入口不绑定 `/catalog`。作品详情、定制服务、合作商流程、顾问跟进或其他获批入口都可以发起相应流程，最终由服务端身份、报价状态和资金门禁裁决。
- 目标 API 至少需要覆盖：提交需求、后台创建/修订报价、已认证客户本人确认报价、解析报价时点有效专属价、管理专属双克价与费用配置、按通道复核资源门禁，以及在同一事务中幂等生成订单与完整快照。精确路径、DTO 和存储结构留待实施设计。
- 客户或后台发起任何外部网关收款前都必须经过服务端全局资金门禁；当前后台入口尚未接入，属于已知缺口。
- 当前客户本人确认、分通道资源门禁、事务转单和完整不可变快照均未统一实现；本节不得作为“代码已修复”的证据。
