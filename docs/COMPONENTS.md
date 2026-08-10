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

## 首页内容块 (blocks/)

### 两套体系并存

**旧版 blockComponents** (`blocks/index.ts`) — 均未直接引用：
HeroBlock, CategoriesBlock, StoryBlock, ProductsBlock, CraftBlock, ContactBlock

**新版 MODULE_MAP** (`Home/index.tsx`) — 实际使用中：
HeroSection, SinglePosterSection, DoublePosterSection, ImageTextBlock

### 辅助

| RevealOnScroll | 滚动显隐动画 |

## 统计

| 状态                     | 数量   |
| ------------------------ | ------ |
| ✅ 使用中                | 17     |
| ⚠️ 未被引用              | 8      |
| ⚠️ 旧版 blocks(仅注册表) | 6      |
| ⚠️ admin 组件未引用      | 1      |
| **合计**                 | **32** |
