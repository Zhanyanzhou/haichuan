# 海川珠宝 — 电商扩展领域模型设计

> HC-COMMERCE-07 | 2026-08-06
>
> ⚠️ **历史规划，已被当前业务契约取代（2026-08-23）**：本页的阶段模型、`Product.price`“售价”和“不接真实网关”等描述不再是现行规则。当前只认 `docs/PRODUCT_DATA_CONTRACT.md`、`docs/DECISIONS.md` D.2 / D.18、Prisma Schema 与服务端实现；本文不得用于新增字段、迁移、导入或交易解冻。

---

## 一、当前已就绪

| 能力 | 状态 |
|---|---|
| Product.salesMode | ✅ SalesMode 枚举 (5 值) |
| Product.price | ⚠️ 历史描述；当前为有效 SKU 最低价派生缓存 |
| Product.goldWeight | ✅ 金重 |
| ProductSKU | ✅ 多规格 |
| ProductImage | ✅ 三视图 |
| Certificate | ✅ 证书模型 |
| Feature Flags | ✅ 前后端统一开关 |

---

## 二、价格模式规划

```prisma
enum PriceMode {
  FIXED_PRICE          // 固定价格
  WEIGHT_BASED         // 按克重计价
  REFERENCE_GOLD_PRICE // 参考金价浮动
  DEPOSIT              // 定金模式
  INQUIRY_ONLY         // 仅咨询报价
}
```

**建议**: 作为 Product 的 JSON 扩展字段 (`pricing: { mode, depositAmount, referenceGoldPrice }`)，不急于建独立枚举。

---

## 三、目标模型

### 3.1 当前已有（可复用）

| 模型 | 用途 | 电商关联 |
|---|---|---|
| ProductSKU | 多规格 | → ProductVariant |
| Inventory | 库存 | ✅ 已就绪 |
| Warehouse | 仓库/门店 | 扩展 storeType |
| Certificate | 证书 | 关联到 OrderItem |
| Order | 订单 | ✅ 已定义 |
| OrderItem | 订单明细 | ✅ |
| Cart | 购物车 | ✅ |

### 3.2 需新增（分阶段）

| 阶段 | 模型 | 关键字段 | 优先级 |
|---|---|---|---|
| **Phase 1** | — | 复用现有 Order/OrderItem/Cart | P1 |
| **Phase 2** | Payment | orderId, amount, method, status, paidAt | P1 |
| | Refund | orderId, amount, reason, status | P2 |
| **Phase 3** | Fulfillment | orderId, trackingNo, carrier, status | P2 |
| | AfterSales | orderId, type, reason, status | P3 |

---

## 四、珠宝行业专属字段规划

> 不得一次创建大量无使用代码。按阶段添加。

| 阶段 | 字段 | 模型 | 说明 |
|---|---|---|---|
| **当前** | goldWeight | Product | ✅ 已存在 |
| | craftFee | Product | ✅ 已存在 |
| | gemInfo | Product (JSON) | ✅ 已存在 |
| | certNumber/certType | Certificate | ✅ 已存在 |
| **Phase 1** | actualWeight | OrderItem | 实际出货克重 |
| | actualSize | OrderItem | 实际尺寸（手寸调整） |
| **Phase 2** | storeId | Inventory | 所在门店 |
| | physicalStatus | Inventory | 实物状态（在库/借出/维修） |
| | advisorId | Order | 顾问 |
| **Phase 3** | depositAmount | Payment | 定金 |
| | balanceAmount | Payment | 尾款 |
| | productionStatus | OrderItem | 制作状态 |
| | qcStatus | OrderItem | 质检状态 |

---

## 五、Feature Flag 开关

| Flag | 默认值 | 关闭时行为 |
|---|---|---|
| commerceEnabled | **false** | 隐藏交易入口/购买按钮/API |
| cartEnabled | **false** | 隐藏购物车 |
| paymentEnabled | **false** | 隐藏支付功能 |
| analyticsDashboardEnabled | **false** | 隐藏数据中心菜单 |

API: `GET /api/settings/flags` — 前端动态读取

---

## 六、数据隔离原则

1. **DIRECT_PURCHASE 模式**: 仅当 `commerceEnabled=true` 时对客户开放
2. **价格**: `INQUIRY_ONLY` 模式下隐藏所有价格数字
3. **订单**: 不创建演示/测试订单污染数据
4. **支付**: 不接入真实支付网关
5. **过渡**: 未来 Phase 1 打开 commerceEnabled 时不需改动 Product 表
