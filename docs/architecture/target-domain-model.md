# 海川珠宝 — 目标领域模型规划 (Target Domain Model)

> 生成日期：2026-08-06 | 阶段：HC-PROGRAM-00

---

## 一、当前已存在模型 (27个)

| 模型 | 域 | 完整度 |
|---|---|---|
| User | 用户与权限 | ✅ 包含角色枚举 |
| Category | 分类 | ✅ 四级自关联 |
| Product | 产品核心 | ✅ 含材质/金重/工费/宝石信息/标签 |
| ProductImage | 产品图片 | ✅ 三视图类型 |
| ProductSKU | 产品SKU | ✅ 含库存废弃字段 |
| ProductTag | 产品标签 | ✅ |
| ProductSeries | 产品系列 | ✅ |
| SeriesItem | 系列-产品关联 | ✅ |
| Certificate | 证书 | ✅ |
| GoldPrice | 金价 | ✅ |
| PriceHistory | 调价历史 | ✅ |
| Warehouse | 仓库 | ✅ |
| Inventory | 库存 | ✅ |
| Order | 订单 | ✅ |
| OrderItem | 订单明细 | ✅ |
| Cart | 购物车 | ✅ |
| Inquiry | 预约咨询 | ✅ |
| Notification | 通知 | ✅ |
| OperationLog | 操作日志 | ✅ |
| AIClassifyRecord | AI分类记录 | ✅ |
| Promotion | 营销活动 | ✅ |
| Coupon | 优惠券 | ✅ |
| HomeSection | 首页布局 | ⚠️ 可能废弃 |
| ContentSlot | 内容插槽 | ✅ 可视化编辑 |
| PageModule | 页面模块 | ✅ 构建器核心 |
| SelectionInquiry | 选款咨询 | ✅ HC-ADMIN-FRAMEWORK-01 新增 |
| SelectionInquiryItem | 选款咨询明细 | ✅ HC-ADMIN-FRAMEWORK-01 新增 |

---

## 二、建议复用模型（不新增表）

| 目标需求 | 建议方案 | 说明 |
|---|---|---|
| 客户 (Customer) | 复用 User + 扩展字段 | 当前 User 含 phone/email，可加 customer 标记 |
| 产品属性 (ProductAttribute) | 使用 Product.gemInfo + craftTechnique (JSON) | 已支持灵活 JSON 字段 |
| 产品媒体 (ProductMedia) | 复用 ProductImage，type 枚举可扩展 | 已有 FRONT/SIDE/TOP/DETAIL/WEARING |
| 产品变体 (ProductVariant) | 复用 ProductSKU | SKU 已支持材质/尺寸/金重/价格 |
| 页面版本 (PageVersion) | 可复用 PageModule 新记录 + status | 未来可加 version 字段 |
| 客户跟进 (LeadFollowUp) | 复用 Inquiry + status 流转 | Inquiry 已支持 assign/reply/status |
| 分析事件 (AnalyticsEvent) | 建议用外部服务 (如 Umami/Plausible) | 避免自建重型分析 |

---

## 三、建议新增模型（后续阶段）

| 模型 | 域 | 优先级 | 建议阶段 |
|---|---|---|---|
| SiteSetting (替换 settings.json) | 网站设置 | P1 | HC-PLATFORM-01 |
| Permission/RoleBinding | 权限 | P1 | HC-PLATFORM-02 |
| MediaAsset (统一素材) | 素材管理 | P2 | HC-CMS-03 |
| PageTemplate | 页面模板 | P2 | HC-CMS-03 |
| ModuleDefinition | 模块定义 | P2 | HC-CMS-03 |
| Address | 收货地址 | P2 | HC-ORDER-01 |
| Refund/AfterSales | 售后 | P3 | HC-ORDER-02 |
| Review | 评价 | P3 | HC-SOCIAL-01 |

---

## 四、避免重复建模的方案

1. **产品属性**: 不建 EAV 表，使用 Product 的 JSON 字段 (gemInfo / craftTechnique) 已足够
2. **客户**: 不建独立 Customer 表，User 增加 type 字段区分
3. **媒体**: 不建独立 Media 表，扩展 ProductImage 或复用 Upload 服务
4. **库存**: 不重复建表，使用现有 Inventory + ProductSKU 体系
5. **页面**: 不建独立 Page 表，PageModule 的 pageKey 字段已支持多页面

---

## 五、建议阶段路线

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **HC-PROGRAM-00** ✅ | 系统盘点、基线建立 | — |
| **HC-PLATFORM-01** | 修复阻断问题、Settings 入库、Dashboard API 修复 | HC-PROGRAM-00 |
| **HC-PLATFORM-02** | 权限体系完善、操作日志增强 | HC-PLATFORM-01 |
| **HC-DATA-01** | 产品数据导入、分类初始化 | HC-PLATFORM-01 |
| **HC-FRONT-01** | 客户前台接入真实产品 API | HC-DATA-01 |
| **HC-CMS-03** | 页面构建器增强、模板系统 | HC-PLATFORM-02 |
| **HC-SELECTION-01** | 选款咨询前台提交链路 | HC-FRONT-01 |
| **HC-ORDER-01** | 订单系统完善 | HC-DATA-01 |
| **HC-ORDER-02** | 支付/物流/售后 | HC-ORDER-01 |
