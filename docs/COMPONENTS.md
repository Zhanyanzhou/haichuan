# 海川珠宝 — 组件手册

> 最后更新：2026-08-07

## 布局组件 (layout/)

| 组件             | 使用者       | 说明                     |
| ---------------- | ------------ | ------------------------ |
| **PublicLayout** | 前台所有页面 | 页眉+页脚+内容区         |
| **AdminLayout**  | 后台所有页面 | 侧边栏(18项)+顶栏+内容区 |

## 通用组件 (common/) — 使用中

| 组件                | 引用者         | 说明                    |
| ------------------- | -------------- | ----------------------- |
| **AdminPageHeader** | 6 个后台页面   | 统一标题栏              |
| **AdminDataStates** | 5 个后台页面   | 加载/空数据/错误状态    |
| **AdminStatusTag**  | 2 个页面       | 状态标签                |
| **LinkSelector**    | HomepageConfig | 链接选择器(预设+自定义) |
| **ErrorBoundary**   | App.tsx        | React 错误边界          |
| **ProtectedRoute**  | App.tsx        | 认证路由守卫            |
| **ProgressBar**     | App.tsx        | 页面加载进度条          |
| **Logo**            | AdminLayout    | 品牌 Logo               |

## 通用组件 — 未被引用 ⚠️

| 组件         | 状态                                    |
| ------------ | --------------------------------------- |
| AdminConfirm | 未被引用                                |
| EmptyState   | 未被引用                                |
| FilterPanel  | 未被引用                                |
| ImageUpload  | 未被引用(HomepageConfig 内联了自有版本) |
| PageHeader   | 未被引用(被 AdminPageHeader 替代)       |
| ProductCard  | 未被引用                                |

## UI 组件 (ui/)

| 组件               | 引用者                                    |
| ------------------ | ----------------------------------------- |
| **ScifiButton** ✅ | CategoryManage, ProductManage, UserManage |
| **SafeImage** ✅   | ProductCard                               |
| GlowCard ⚠️        | 未被引用                                  |
| ParticleBg ⚠️      | 未被引用                                  |

## 管理端组件 (admin/)

| 组件            | 状态     |
| --------------- | -------- |
| ImageCropper ⚠️ | 未被引用 |

## 页面装修区块 (blocks/ 与 page-builder/)

### 单套渲染层 + 声明式编辑体系(2026-08 重构后)

- **渲染层唯一**:`blocks/` 下 23 个区块组件(含新建 AsymmetricGalleryBlock 作品画廊),`editMode` prop 区分编辑画布与公开页;admin 适配器与公开渲染器(PuckDocumentRenderer)共用同一批组件。
- **编辑区**:22 个模块全部由 `page-builder/inspector/schema/modules/` 声明式 Schema 驱动(五层信息架构:内容→媒体→布局→样式→高级折叠),registry 全量注册;旧 10 个专属 Inspector 已于 R4b 退役(git 历史可查)。
- **设计系统**:`page-builder/designSystem/`(tokens 8 规范比例/4 档宽度/双模式节奏、12 母版 masters、DecorSection 外壳、rhythm 页面节奏引擎)。
- **旧类型兼容**:分割面板/图文混排/礼赠指南已从注册表移除;编辑器经 `migratePuckData` 自动转换,公开渲染器保留旧类型分支,已发布历史版本永久可渲染。

### 双轨页面(尚未合流)

`pages/public/About` 与 `pages/public/Custom` 为硬编码高水准 Brand 页;装修内容经 PublicLayout 的 PublishedPageDecoration 作为页面前置视觉区叠加。两轨合流为后续独立议题。

### 遗留待清退

- 旧版 blockComponents(`blocks/index.ts` 注册表):HeroBlock 等 6 个,未直接引用。
- `adapters/imageText.puck / splitPanel.puck` 与 `inspector/schema/modules/splitPanel.ts`:仅服务旧类型兼容渲染,模板库不再提供。
- ContentSlot 体系(表/类型/2 端点):清退需 DB 迁移确认。

## 统计

> 下表为装修体系重构前的旧统计;blocks/ 已从 17+6 变为 23 个单套渲染层组件(见上节),全量数字待下轮重数后更新。

| 状态                     | 数量   |
| ------------------------ | ------ |
| ✅ 使用中                | 17     |
| ⚠️ 未被引用              | 8      |
| ⚠️ 旧版 blocks(仅注册表) | 6      |
| ⚠️ admin 组件未引用      | 1      |
| **合计**                 | **32** |
