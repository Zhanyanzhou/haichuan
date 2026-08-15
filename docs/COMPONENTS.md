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
| **ErrorBoundary**   | App.tsx        | React 错误边界          |
| **ProtectedRoute**  | App.tsx        | 认证路由守卫            |
| **ProgressBar**     | App.tsx        | 页面加载进度条          |
| **Logo**            | AdminLayout    | 品牌 Logo               |
| **FilterPanel**     | ProductList    | 商品筛选面板(2026-08-15 批次D 转正) |

## 通用组件 — 未被引用 ⚠️

| 组件         | 状态                                    |
| ------------ | --------------------------------------- |
| AdminConfirm | 未被引用                                |
| EmptyState   | 未被引用                                |
| ImageUpload  | 未被引用(HomepageConfig 内联了自有版本) |
| PageHeader   | 未被引用(被 AdminPageHeader 替代)       |

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

- `adapters/imageText.puck / splitPanel.puck`:仅作为旧类型渲染映射的 Props 类型源保留(puckPropsToModule 类型联合引用),模板库不再提供;`inspector/schema/modules/splitPanel.ts` 已墓碑化。
- ContentSlot 体系(表/类型/2 端点/useContentSlots):已删除（2026-08-15 死资产清退，墓碑文件待 git rm）。

> 注:早期文档记载的"旧版 blockComponents(blocks/index.ts,HeroBlock 等 6 个)"经核实文件已不存在,该条目撤销。

## 统计

> 分域重数(2026-08-15 全域完成,含动态 import 复核)。

| 域 | 数量 | 状态 |
| --- | --- | --- |
| blocks/ 渲染层 | 25 文件 | ✅ 全部使用中(24 业务区块 + _shared/BlockEmptyPlaceholder) |
| page-builder/adapters | 25 | 23 注册使用中;imageText/splitPanel 2 个仅作旧类型 Props 类型源(遗留) |
| page-builder/inspector/schema/modules | 22 | 21 活跃 + splitPanel.ts 墓碑(待物理删除) |
| page-builder/designSystem | 5 | ✅ tokens/masters/sectionShell/rhythm/index |
| components/common | 17 | ✅ 11 使用中(含 ProtectedRoute/AntdProvider 动态导入、FilterPanel 批次D 转正);⚠️ 6 未引用:EmptyState/PageHeader/ImageUpload/AdminConfirm/Logo/LinkSelector(LinkSelector 职责已被 page-builder LinkTargetField 取代,顶部表"使用中"记载有误已撤销) |
| components/admin | 1 | ⚠️ ImageCropper 未被引用 |
