# 海川珠宝 — 当前系统地图 (Current System Map)

> **归档于 2026-09-08：** 标题中的“当前”只对应 2026-08-06 快照；现行架构与状态必须从当前代码、合同和 `docs/CURRENT_STATE.md` 复核。
>
> 生成日期：2026-08-06 | 阶段：HC-PROGRAM-00
>
> ⚠️ **历史快照，已停止作为当前系统事实（2026-08-23）**：本文包含已退役的 `ContentSlot` / `PageModule`、旧 ProductList、独立 Search、静态商品数据和旧角色数量。当前实现、路由与完成度只认代码、机器合同及 `docs/CURRENT_STATE.md`；不得据此恢复旧架构、执行 migration 或宣称功能闭环。保留本文仅用于追溯，不逐项维护。

---

## 一、客户前台 (Public)

| 路由 | 页面 | 数据源 | 状态 |
|---|---|---|---|
| `/` | 首页 (Home) | PageModule API + ContentSlot API | 部分闭环 |
| `/products` | 产品列表 (ProductList) | products.ts 静态数据 | 静态数据 |
| `/products/:id` | 产品详情 (ProductDetail) | products.ts 查找 | 静态数据 |
| `/catalog` | 选款目录 (Catalog) | products.ts 静态数据 | 静态数据 |
| `/custom` | 定制 (Custom) | 纯展示 | 静态页面 |
| `/search` | 搜索 (Search) | 客户端过滤 | 静态数据 |
| `/cart` | 购物车 (Cart) | Zustand store / localStorage | 本地状态 |
| `/checkout` | 结算 (Checkout) | 本地状态 | 本地状态 |
| `/customer` | 个人中心 (CustomerCenter) | 无真实数据 | 框架存在 |
| `/about` | 关于我们 (About) | 纯展示 | 静态页面 |
| `/contact` | 联系我们 (Contact) | Inquiry API (POST) | 部分闭环 |

---

## 二、管理后台 (Admin)

### 菜单可见 (11项)

| 菜单组 | 菜单项 | 路由 | API | 数据库 | 结论 |
|---|---|---|---|---|---|
| 工作台 | 工作台 | `/admin/dashboard` | products/inquiries/page-modules | products/inquiries/page_modules | 框架通过 |
| 珠宝内容 | 珠宝作品 | `/admin/products` | products CRUD | products + images + skus | 框架通过 |
| 珠宝内容 | 分类与属性 | `/admin/categories` | categories CRUD | categories | 框架通过 |
| 珠宝内容 | 素材库 | `/admin/media` | product-images | product_images | 框架通过 |
| 网站内容 | 页面构建器 | `/admin/homepage` | page-modules + content-slots | page_modules + content_slots | 冻结区域 |
| 网站内容 | 全站信息 | `/admin/site-content` | settings GET/PUT | settings.json (文件) | **通过** |
| 客户线索 | 预约咨询 | `/admin/inquiries` | inquiries CRUD | inquiries | 框架通过 |
| 客户线索 | 选款咨询 | `/admin/selection-inquiry` | selection-inquiries CRUD | selection_inquiries + items | **通过** |
| 系统管理 | 管理员与权限 | `/admin/users` | users CRUD | users | 框架通过 |
| 系统管理 | 操作日志 | `/admin/audit-logs` | settings/logs | operation_logs | 框架通过 |
| 系统管理 | 系统设置 | `/admin/settings` | settings GET/PUT | settings.json (文件) | 框架通过 |

### 隐藏路由 (5项，不在菜单)

| 路由 | 用途 | 状态 |
|---|---|---|
| `/admin/ai-classify` | AI 分类 | 隐藏功能 |
| `/admin/gold-price` | 金价管理 | 隐藏功能 |
| `/admin/inventory` | 库存管理 | 隐藏功能 |
| `/admin/orders` | 订单管理 | 隐藏功能 |
| `/admin/login` | 登录页 | 入口 |

---

## 三、API 控制器 (19个)

| 控制器 | 路由前缀 | 公开端点 | 需认证 |
|---|---|---|---|
| AuthController | `/api/auth` | login, register | profile |
| UsersController | `/api/users` | — | 全部 |
| CategoriesController | `/api/categories` | tree | CRUD |
| ProductsController | `/api/products` | GET | CRUD |
| UploadController | `/api/upload` | — | 全部 |
| GoldPriceController | `/api/gold-price` | latest, history | manual |
| InventoryController | `/api/inventory` | — | 全部 |
| OrdersController | `/api/orders` | — | 全部 |
| CartController | `/api/cart` | — | 全部 |
| InquiriesController | `/api/inquiries` | POST (提交) | GET/assign/reply |
| NotificationsController | `/api/notifications` | — | 全部 |
| AiClassifyController | `/api/ai-classify` | — | 全部 |
| MarketingController | `/api/marketing` | — | 全部 |
| StatisticsController | `/api/statistics` | — | 全部 |
| HomepageController | `/api/homepage` | config (GET) | admin/CRUD |
| ContentSlotsController | `/api/content-slots` | published | admin/CRUD |
| PageModulesController | `/api/page-modules` | published | admin/CRUD |
| SettingsController | `/api/settings` | — | 全部 |
| SelectionInquiryController | `/api/selection-inquiries` | — | 全部 |

---

## 四、Prisma 模型 (27个)

| 域 | 模型 | 表名 |
|---|---|---|
| 用户 | User | users |
| 分类 | Category | categories |
| 产品 | Product, ProductImage, ProductSKU, ProductTag, ProductSeries, SeriesItem, Certificate | products, product_images, product_skus, product_tags, product_series, series_items, certificates |
| 金价 | GoldPrice, PriceHistory | gold_prices, price_history |
| 库存 | Warehouse, Inventory | warehouses, inventories |
| 订单 | Order, OrderItem | orders, order_items |
| 购物车 | Cart | carts |
| 咨询 | Inquiry, SelectionInquiry, SelectionInquiryItem | inquiries, selection_inquiries, selection_inquiry_items |
| 通知 | Notification | notifications |
| 审计 | OperationLog | operation_logs |
| AI | AIClassifyRecord | ai_classify_records |
| 营销 | Promotion, Coupon | promotions, coupons |
| 页面 | HomeSection, ContentSlot, PageModule | home_sections, content_slots, page_modules |

---

## 五、认证与权限

```
前端: ProtectedRoute (检查 isLoggedIn + 可选 roles[])
       ↓
       useAuthStore (token → localStorage)
       
后端: JwtAuthGuard (Bearer Token 验证)
       ↓
       @Public() 装饰器跳过
       ↓
       Role 枚举: SUPER_ADMIN / ADMIN / EDITOR / CUSTOMER_SERVICE / WAREHOUSE
       
当前实际状态:
  - 前端: 仅检查 isLoggedIn，所有路由均未配置 roles 参数
  - 后端: JwtAuthGuard 在部分控制器使用，非全局
  - 角色: 数据库有 Role 字段，前端未做角色级菜单/路由隔离
```

---

## 六、构建脚本

| 层级 | 命令 | 状态 |
|---|---|---|
| Server 编译 | `tsc --project tsconfig.json` | ✅ (nest build 不可用) |
| Server 启动 | `node dist/main.js` | ✅ |
| Client 类型检查 | `tsc --noEmit` | ⚠️ HeroBlock.tsx 预存错误 |
| Client 构建 | `tsc -b && vite build` | 未执行 |
| Prisma 验证 | `prisma validate` | ✅ |
| Prisma 迁移 | `prisma migrate dev` | ✅ |
| Prisma Client | `prisma generate` | ⚠️ DLL 锁定问题 |

---

## 七、静态数据文件

| 文件 | 内容 | 使用方 |
|---|---|---|
| `client/src/data/products.ts` | 12个硬编码产品 | ProductList, Catalog, ProductDetail, Search |
| `client/src/data/homeCampaign.ts` | 首页活动配置 | Home |
| `client/src/data/collections.ts` | 系列/集合数据 | Home, Catalog |
| `client/src/data/catalogData.ts` | 选款目录数据 | Catalog |
| `client/src/services/mockData.ts` | 完整 Mock 数据集 | 仅显式 Vite `mock` mode |
