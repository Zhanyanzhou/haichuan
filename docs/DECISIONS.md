# 海川珠宝 — 技术决策记录（DECISIONS）

> 本文件 = **已批准的架构决定及原因**（历史保留），并标注与当前代码冲突的过时条目和尚未确定的【待决策】事项。
> 现在必须遵守的硬规则见根目录 `PROJECT_RULES.md`；AI 执行流程见根目录 `WORKFLOW.md`。
> 最近核对：2026-08-12（基于当前工作区代码）。

## 阅读约定

- ✅ **已批准**：当前有效，必须遵守。
- ⚠️ **过时/待更新**：历史决策记录与当前代码不符；以代码事实为准，待项目负责人确认后修订。
- 🟡 **【待决策】**：尚未确定；任何 AI **不得自行选择方案**，必须先报告。

---

## A. 已批准且有效的决策（✅）

### A.1 状态管理用 Zustand 4（非 Redux）✅
- **决策**：前端全局状态用 Zustand 4。
- **原因**：无 Provider、无 boilerplate、selector 模式避免不必要渲染、体积小（~2KB）。
- **当前事实**：`authStore`、`shopStore` 用 `persist`；`selectionStore`、`pageMetaStore`、`appStore` 非持久。

### A.2 固定技术栈 ✅
- **决策**：前端 React 18 + TS + Vite + Ant Design 5 + Tailwind + Zustand；后端 NestJS 10 + Prisma 5 + MySQL 8 + Redis + Bull + JWT + bcrypt + Sharp。
- **原因**：围绕展示、商品管理、内容编辑、选款咨询定位选型。
- **约束**：不得自行替换/升级/降级；详细清单与禁止替代项见 `docs/PROJECT_GUARDRAILS.md` §3、`PROJECT_RULES.md` §0。

### A.3 统一响应结构 ✅
- **决策**：后端全局 `TransformInterceptor` 包成 `{code,data,message,timestamp}`；前端 `utils/unwrap.ts` 解包。
- **原因**：前后端契约统一，避免各页面重复解包逻辑。

### A.4 两套独立认证体系（User / Customer）✅
- **决策**：后台 `User` 与前台 `Customer` 是两套独立认证；**共用 `JWT_SECRET`**，靠 payload `type` 字段区分。
- **原因**：区分员工后台与前台客户/游客，复用同一套 JWT 基础设施。
- **当前事实**：后台 `JwtAuthGuard` + `JwtStrategy`（payload `{sub,username,role}`）；前台 `CustomerAuthGuard` / `OptionalCustomerAuthGuard`（payload `{sub,type:"customer"}`，过期 24h 写死）。
- **注意**：是否拆分双 secret 见 🟡 D.6。

### A.5 RBAC 用角色白名单（@Roles + RolesGuard）✅
- **决策**：后端权限只做**粗粒度角色白名单**（`@Roles(...)` + `RolesGuard`），不做细粒度权限守卫。
- **原因**：角色少、场景明确，避免过度设计。
- **影响**：前端 `permissionStore` 的细粒度权限键后端**不校验**；前端隐藏 ≠ 服务端拒绝（见 `PROJECT_RULES.md` §2、🟡 D.4）。

### A.6 装修采用 Puck PageDocument ✅
- **决策**：前台页面装修统一用 Puck `PageDocument` 体系（草稿/发布/版本回滚 + 多设备预览）。
- **原因**：所见即所得、内容与业务分离、支持模板与发布流。
- **当前事实**：`PageDocument`/`PageTemplate`/`PageDocumentRevision` + `page-modules` 后端 + `pageDocumentApi` + `HomepageConfig` 编辑器 + `PuckDocumentRenderer` + `components/blocks` + `page-builder/adapters`。
- **注意**：`HomeSection`、`HomepageBlock` 已成死代码（见 ⚠️ B.2）；`ContentSlot` 边界见 🟡 D.8。

### A.7 新增样式优先 Tailwind ✅
- **决策**：新代码优先 Tailwind 类名，仅动态计算值用行内样式；不强制重写已有代码。
- **原因**：历史组件 Tailwind / 行内样式混杂，统一未来方向即可（见 🟡 C.1）。

---

## B. 过时/待更新的记录（⚠️ 历史保留，与当前代码不符）

### B.1 ⚠️ 过时：两套首页内容块体系并存
- **原记录**（旧版 §2）：旧版 `blockComponents`（`blocks/index.ts`，HeroBlock 等 6 个）与新版 `MODULE_MAP`（`Home/index.tsx`，HeroSection 等 4 个）并存。
- **当前事实**：`client/src/components/blocks/index.ts` **不存在**；全仓搜不到 `MODULE_MAP` / `blockComponents`。首页通过 `PuckDocumentRenderer` 渲染 `PageDocument`（见 ✅ A.6）。
- **处置**：此条已失效，以 A.6 为准；待项目负责人确认后清理本条。

### B.2 ⚠️ 过时：`(this.prisma as any)` 5 处
- **原记录**（旧版 §5）：5 个 service 用 `(this.prisma as any)` 绕过 Prisma 类型（schema 改后未 `prisma generate`）。
- **当前事实**：实际 **0 处** PrismaClient 绕过；残留约 12 处 `as any` 是 DTO 字符串→Prisma 枚举/Json 的**类型窄化**，非 `prisma generate` 缺失。
- **处置**：此条已失效；新增 DTO 字段应直接声明为对应枚举类型以避免断言（见 `PROJECT_RULES.md` §3）。

### B.3 ⚠️ 部分过时：页面构建器 iframe + postMessage
- **原记录**（旧版 §6）：iframe 内嵌 `/preview/home`，postMessage 消息为 `SET_EDITOR_MODE / PATCH_MODULE / CANVAS_READY / MODULE_HOVERED / MODULE_SELECTED`。
- **当前事实**：仍是 **iframe + postMessage** 架构（编辑/预览隔离），但消息协议已变为 `homepage-editor:focus-block`、`homepage-editor:canvas-height` 等；首页渲染改为直接读 `PageDocument`。
- **处置**：架构决策仍有效（iframe 隔离）；消息协议描述已过时，待更新。

### B.4 ⚠️ 待更新：Feature Flags 控制电商上线
- **原记录**（旧版 §3）：`commerceEnabled/cartEnabled/paymentEnabled = false`，"代码已完成但关闭"。
- **当前事实**：`client/src/store/featureFlags.ts` 中 `CUSTOMER_COMMERCE_ENABLED` 硬编码为 `false`，并由 `MyAccountDashboard`、`ProductDetail` 两处消费（隐藏交易 CTA）。服务端 `CustomerCommerceGuard`（读 `CUSTOMER_COMMERCE_ENABLED` 环境变量，默认关闭）是最终安全边界；前端开关仅同步隐藏入口，不作为安全依赖。
- **处置**：前端开关已接线但硬编码为关；环境变量驱动的正式上线开关仍待定，见 🟡 D.3。

---

## C. 历史现状记录（保留，需结合当前事实理解）

### C.1 Tailwind vs 内联样式
- **现状**：旧组件多用 Tailwind，新组件多有行内样式（不同时期/不同 AI 产物）。
- **方向**（已确认，见 ✅ A.7）：新代码优先 Tailwind；不强制重写已有代码；仅动态计算值用行内样式。

---

## D. 【待决策】事项（🟡 不得自行选方案）

> 以下为审查中发现但尚未由项目负责人拍板的事项。任何 AI 遇到相关任务**必须先报告**，不得自行选择方案或写成既定事实。

### D.1 🟡 库存架构迁移（最严重）
- **现状**：`ProductSKU.stock` 标 `@deprecated`（注释称应统一走 `InventoryService`），但 `InventoryService` **无外部消费者**；`products.service`、`orders.service` 仍**直接读写 `ProductSKU.stock`**；订单预占在无 `Inventory` 行时回退 `SKU.stock`。双轨并存、无迁移路径。
- **待定**：未来以 `SKU.stock` 还是 `Inventory`（多仓）为单一来源？迁移路径？
- **约束**：未定前，新增库存读写**必须报告**，不得自行选其一。

### D.2 🟡 电商功能上线
- **现状**：订单/支付/购物车/退款代码完整，但**从未在真实环境验证**；项目当前不开放真实支付/退款/资金结算。
- **待定**：何时、以何种方式联调与上线。

### D.3 🟡 Feature Flags 是否环境变量化
- **现状**：`featureFlags.ts` 的 `CUSTOMER_COMMERCE_ENABLED` 已被 `MyAccountDashboard`、`ProductDetail` 消费，但硬编码为 `false`；服务端 `CustomerCommerceGuard` 读 `CUSTOMER_COMMERCE_ENABLED` 环境变量（默认关闭）。
- **待定**：前端开关是否也从环境变量读取以与服务端联动；还是保持前端硬编码关、仅靠服务端守卫控制上线。

### D.4 🟡 权限粒度
- **现状**：后端只做 `@Roles` 角色白名单（粗粒度）；前端 `permissionStore` 有细粒度权限键但后端不校验。
- **待定**：是否引入后端细粒度权限守卫；前端隐藏与后端拒绝的边界如何统一。

### D.5 🟡 Category 删除语义
- **现状**：`Category.deletedAt` 是死字段；删除实际只写 `isActive:false`，读查询按 `isActive` 过滤。
- **待定**：分类采用软删除（启用 `deletedAt`）还是停用（`isActive`）；是否清理 `deletedAt` 字段。

### D.6 🟡 JWT 双域 secret / 全局 Guard
- **现状**：admin 与 customer 共用 `JWT_SECRET` 靠 `type` 区分；`JwtAuthGuard` **非全局**（opt-in，漏写则无鉴权暴露）。
- **待定**：是否拆分双 secret / 双 strategy；是否把 `JwtAuthGuard` 注册为全局 Guard + `@Public` 白名单。

### D.7 🟡 checkout 认证与游客下单
- **现状**：`POST /customers/checkout`（`@Public`）是真实公开下单入口，upsert 无密码 `Customer`；`POST /orders` 注释"公开"但实际继承类级 admin-only。
- **待定**：公开下单入口是否整合/统一；`Order.userId`（死字段）与 `Cart.userId`（实存 `Customer.id`）的语义/命名是否修正。

### D.8 🟡 Puck / ContentSlot 边界
- **现状**：Puck `PageDocument` 是唯一在用的装修体系；`ContentSlot` 仅作为首页未装修时的 HERO fallback；`HomeSection`/`HomepageBlock` 是死代码。
- **待定**：`ContentSlot` 保留/扩展/废弃；死代码是否清理。

### D.9 🟡 默认仓库与多仓启用
- **现状**：`Inventory` 模型支持多仓（`Warehouse: SHOWROOM/FACTORY/STORE`），但库存实际主要落在 `ProductSKU.stock`，未确认默认仓库与多仓启用范围。
- **待定**：是否启用多仓、默认仓库设定、库存读写在多仓下的归属。

### D.10 🟡 金价 AUTO 采集
- **现状**：`@Cron` `fetchAndUpdateGoldPrice` 是空壳（只打 warn），未接行情源；调价系数 `1.05` 硬编码；调价绕过 `ProductsService`（不触发前台 SSE）。
- **待定**：是否接入自动行情源、调价系数参数化、SSE 通知补齐。

### D.11 🟡 .env 校验与变量声明
- **现状**：`ConfigModule` 未配 `validationSchema`；`REDIS_HOST/PORT`、`PRODUCT_MEDIA_ROOT` 代码在用但未在 `.env.example` 声明。
- **待定**：是否引入 Joi 校验 schema。

---

## E. 关联

- 现在必须遵守什么：根目录 `PROJECT_RULES.md`
- AI 应怎样工作：根目录 `WORKFLOW.md`
- 安全 / 工作区底线：`AGENTS.md`
- 项目边界 / 任务分级 / 交付格式：`docs/PROJECT_GUARDRAILS.md`、`docs/AI_COLLABORATION_STANDARD.md`
