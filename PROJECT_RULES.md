# 海川珠宝 — 项目技术硬规则（PROJECT_RULES）

> 本文件规定**现在必须遵守什么**（技术实现硬规则）。所有 AI（Claude、Codex、DeepSeek、智谱等）必须遵守。
> 架构决策与【待决策】事项见 `docs/DECISIONS.md`；AI 执行流程见 `WORKFLOW.md`。
> 安全、工作区、敏感信息、任务分级、交付格式等上层规则见 `AGENTS.md`、`docs/PROJECT_GUARDRAILS.md`、`docs/AI_COLLABORATION_STANDARD.md`，本文件不重复。
> 最近核对：2026-08-12（基于当前工作区代码）。

---

## 0. 职责分工与优先级（不建第二套规则）

| 文件                                                                                | 职责                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `PROJECT_RULES.md`（本文件）                                                        | 现在必须遵守的技术硬规则                         |
| `docs/DECISIONS.md`                                                                 | 已批准的架构决定及原因；过时标记；【待决策】事项 |
| `WORKFLOW.md`                                                                       | AI 应怎样工作（执行流程）                        |
| `AGENTS.md` / `docs/PROJECT_GUARDRAILS.md` / `docs/AI_COLLABORATION_STANDARD.md`    | 安全、工作区、项目边界、任务分级、交付格式       |
| `.agents/skills/critical-review/SKILL.md` + `docs/AI_COLLABORATION_STANDARD.md` §13 | 论证与事实标准、重大决策法庭审校                 |

冲突优先级：`AGENTS.md` → `docs/PROJECT_GUARDRAILS.md` → **本文件** → 当前代码/类型/配置/工作区变更（运行事实）→ 其他 `docs/*` → 单次任务需求。

---

## 1. 单一事实来源（禁止建第二套）

| 事实                | 唯一来源                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| 数据库模型          | `server/prisma/schema.prisma`                                                     |
| 后台用户 / 前台客户 | `User` 模型 / `Customer` 模型（见 §2）                                            |
| 商品唯一标识        | `Product.code`（`@unique`），对外不得用 id                                        |
| 商品图选取          | `client/src/utils/productImage.ts`（listing→primary→首张 FRONT→首张→placeholder） |
| 统一响应包装        | 后端全局 `TransformInterceptor`（`{code,data,message,timestamp}`）                |
| 响应解包            | `client/src/utils/unwrap.ts`（`unwrapResponse`/`unwrapList`）                     |
| 前端 HTTP 入口      | `client/src/services/api.ts`（按模块 `xxxApi` 命名空间）                          |
| 前台页面装修        | Puck `PageDocument` 体系（见 §7）                                                 |
| 配置加载            | `@nestjs/config` `ConfigModule.forRoot({ isGlobal: true })`                       |
| 材质码到中文        | `client/src/utils/material.ts`（`getMaterialLabel`）                              |

**禁止**为上述任一新建第二套来源（第二个 axios 实例、第二套响应包装、第二套商品图选取、第二套装修体系、第二套库存来源、第二套权限表等）。

---

## 2. User / Customer 边界（硬规则）

- **User** = 后台员工，角色 `SUPER_ADMIN | ADMIN | EDITOR | CUSTOMER_SERVICE | WAREHOUSE`。
- **Customer** = 前台客户，`phone` 唯一，`passwordHash` 可空（兼容游客）。
- 两者是**两套独立体系**，代码与文档中不得用"用户"模糊指代。
- 后台/admin 接口用 `JwtAuthGuard` + `JwtStrategy`；前台/customer 接口用 `CustomerAuthGuard` / `OptionalCustomerAuthGuard`。两域共用 `JWT_SECRET`，靠 payload `type` 字段区分——**不得移除** `type` 校验。
- **新增 Controller/方法必须显式 `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`**。`JwtAuthGuard` **不是全局 Guard**（全局只有 `ThrottlerGuard`）；漏写 = 默认**无鉴权暴露**。
- 权限只认 `@Roles` 角色白名单；**前端隐藏菜单/按钮 ≠ 服务端拒绝调用**。需要强制细粒度权限时必须同时在后端补守卫。

---

## 3. 后端分层（硬规则）

- **Controller** 只做路由、鉴权、参数接收、委托 Service、返回业务对象。
- **Controller 禁止**：注入 `PrismaService`；写业务规则；直接读写数据库；在 Controller 内做图片处理/状态机/价格校验。
- **Service** 承担业务规则、事务、Prisma 读写；数据库读写**统一通过**构造注入的 `PrismaService`（`@Global() PrismaModule` 提供）。
- **禁止**以 `(this.prisma as any)` 作为新增功能的常规写法。

---

## 4. 输入验证（硬规则）

- 新增/修改写接口**必须**建立 DTO（`dto/*.dto.ts`）并用 `class-validator` 装饰器（`@IsString`/`@IsInt`/`@IsEnum`/`@IsNumber`/`@Min`/`@MaxLength`/`@ValidateNested` 等）。
- Controller **必须**用 `@Body() dto: XxxDto`；**禁止**新增接口用 `@Body() body: any`（会绕过全局 `ValidationPipe` 的 `whitelist:true`）。
- 全局 `ValidationPipe`：`whitelist:true, transform:true, enableImplicitConversion:true`（`main.ts`）。

---

## 5. 响应与异常（硬规则）

- 成功响应由全局 `TransformInterceptor` 自动包装；Controller 直接返回业务对象，**禁止**手写包装。
- 异常由全局 `HttpExceptionFilter` 统一（已映射 Prisma P2002/P2025/P2003/P2014）；**禁止** Controller 内 try/catch 后手写响应体。
- **禁止**在 Controller、日志、响应中输出密码、Token、客户隐私或完整第三方响应。

---

## 6. 前端实现（硬规则）

- 所有 HTTP 调用**必须**走 `services/api.ts` 的 `xxxApi`；**禁止**新建第二个 axios 实例或在组件内直接 `axios.*`。
- 响应解包**必须**走 `utils/unwrap.ts`；**禁止**在页面组件里重复 `response.data.data` 逻辑。
- 前端类型是**手写**（`client/src/types/`，非 Prisma 生成）；改 schema 时必须同步前端类型。
- **禁止**新增无类型 `any`（eslint 已关 `no-explicit-any`，不能依赖 lint 兜底）。
- 全局状态用 Zustand；**注意** `store/permissionStore.ts`、`store/featureFlags.ts` 不是 store（纯模块）。
- 异步界面必须处理 loading / empty / error 三态；危险操作（删除/发布/上下架）二次确认；重点页检查 1440/1024/768/390 断点。

---

## 7. 店铺装修（硬规则）

- 前台页面装修**唯一在用**的是 Puck `PageDocument` 体系（schema + `page-modules` 后端 + `pageDocumentApi` + `HomepageConfig` 编辑器 + `PuckDocumentRenderer` + `components/blocks` + `page-builder/adapters`）。新增装修能力**必须**沿用此体系。
- `HomeSection`、`HomepageBlock` 是**死代码**，**禁止**复活/扩展。
- `ContentSlot` 仅作为首页未装修时的 HERO fallback，**不得**扩展为通用内容体系。
- 装修边界与清理计划的细节见 `docs/DECISIONS.md` 【待决策】。

---

## 8. 软删除（硬规则）

- 项目**无** Prisma middleware / extension 统一处理软删除；查询时必须**手写** `where: { deletedAt: null }`（含关联嵌套）。
- `Product` 用 `deletedAt` 软删除。
- `Category` **实际用 `isActive` 停用**（`deletedAt` 是死字段）；新增分类逻辑按 `isActive` 处理。

---

## 9. Mock / 生产隔离（硬规则）

- Mock 是**单一全局开关** `VITE_USE_MOCK`（`client/.env`）；`mockData.ts` 导出 `USE_MOCK`；默认值与生产均为 `false`。
- 每次涉及接口的任务**必须**说明当前用 Mock 还是真实接口；上线/验收前**必须**以 `VITE_USE_MOCK=false` 做真实接口联调。
- **禁止**用 Mock 返回掩盖真实接口失败；**禁止**把 Mock 持久化数据（`localStorage: haichuan.mock-*`）当生产数据；**禁止**在 `VITE_USE_MOCK=true` 下声称功能已验证。

---

## 10. 敏感信息与环境变量（硬规则）

- **不读、不输出、不记录、不提交** `.env` 真实值（只允许检查变量名/示例结构）。
- **API Key / Token / 密码只能存在于服务端环境变量**；**禁止**进入 `client/`、浏览器代码、文档、日志、截图、提交记录。
- **新增环境变量必须同步补到 `.env.example`**（属 B 类，需确认）。
- 变量名清单（完整说明见 `.env.example`）：
  - 必需：`MYSQL_ROOT_PASSWORD`、`MYSQL_PASSWORD`、`DATABASE_URL`、`JWT_SECRET`、`JWT_EXPIRES_IN`、`CORS_ORIGIN`、`BOOTSTRAP_ADMIN_PASSWORD`
  - 前端：`VITE_USE_MOCK`、`VITE_API_BASE_URL`、`VITE_API_PROXY_TARGET`、`VITE_MOCK_ADMIN_USERNAME`、`VITE_MOCK_ADMIN_PASSWORD`
  - 服务端可选：`OSS_*`、`AI_ACCESS_KEY_ID/SECRET`、`KIMI_API_KEY`、`KIMI_BASE_URL`、`KIMI_MODEL`、`GOLD_PRICE_API_URL`、`UPLOAD_DIR`、`REDIS_HOST`、`REDIS_PORT`、`PRODUCT_MEDIA_ROOT`、`NODE_ENV`、`PORT`

---

## 11. 数据库变更（硬规则）

- 修改 `schema.prisma` 或执行 Migration **属 B 类，必须先获得明确确认**，不得自行执行。
- 改 schema 正确顺序：`prisma migrate dev`（生成并执行）→ `prisma generate`（重生成 Client）→ 同步前后端类型与 DTO。
- 服务端必须从 `server/` 目录启动（`process.cwd()` 解析 `uploads/`）。
- Schema 改动后最低自检 `npx prisma validate`；Migration 仅获批后执行。
- **不得**以"AI 自动迁移"方式改生产数据库；**不得**删除或批量改真实业务数据。

---

## 12. 范围控制（硬规则）

- **一次只处理当前任务**；范围外问题只记录到"风险与待确认项"，**不得顺手重构**。
- 现有架构能满足需求**必须沿用**；认为现有架构有问题**先报告，不直接替换**。
- **禁止**为同一功能建立第二套实现。
- 高风险域（认证、权限、订单、库存、金价、客户隐私、支付、数据库、生产配置）**无论涉及多少文件或代码行，均按 B 类**处理（先方案、等待确认）。
- 接口/路由/Schema/配置/规则变更后**必须同步更新对应文档并标注核对日期**；文档与代码不一致时**报告，不自行裁决**。
- **不自行修改项目规则或架构决策**（见 `WORKFLOW.md`）。

---

## 13. 修改后必须验证（硬规则）

项目**无 jest/vitest 单测框架**，但存在契约/状态机脚本 `scripts/verify-*.mjs`
（`npm run test`、`npm run test:trade`、`npm run test:selection-inquiry` 等）。
关键域（交易、页面构建器、选款咨询）改动后**必须运行对应契约脚本**。

最低验证类型与标准见 `docs/AI_COLLABORATION_STANDARD.md` §9（单一事实来源）：

- 视觉改动**构建成功 ≠ 完成**，必须实际页面或截图验收。
- 接口改动**必须同步核对** `services/api.ts`、调用页面、后端 Controller/Service/DTO。
- 未通过必要验证只能写"已完成代码修改，待验收"；**不得谎报验证通过**。
