# 海川珠宝 — 页面构建器边界 (Page Builder Boundary)

> 生成日期：2026-08-06 | 阶段：HC-PROGRAM-00

---

## 页面构建器概述

页面构建器是后台 `网站内容 > 页面构建器` (`/admin/homepage`) 下的可视化页面编辑工具。

---

## 技术组成

| 组件 | 位置 | 说明 |
|---|---|---|
| 管理页面 | `client/src/pages/admin/HomepageConfig/` | 后台管理界面 |
| 前端渲染块 | `client/src/components/blocks/` | HeroBlock, ProductsBlock, StoryBlock 等 |
| 后端 API | `server/src/modules/page-modules/` | PageModule CRUD |
| 后端 API | `server/src/modules/content-slots/` | ContentSlot CRUD |
| 数据库 | `page_modules` 表 | 页面模块（模块类型、内容JSON、布局/样式配置） |
| 数据库 | `content_slots` 表 | 内容插槽（图片/视频素材、标题/副标题、链接） |

---

## PageModule 数据结构

```
pageKey:     string      // "home" (页面标识)
moduleType:  string      // "singlePoster" | "doublePoster" | "heroVideo" | ...
sortOrder:   int         // 排序
isVisible:   boolean     // 可见性
status:      string      // "DRAFT" | "PUBLISHED"
content:     JSON        // { desktopImage, mobileImage, title, subtitle, ... }
layoutConfig: JSON       // { template, ratio, textPosition, ... }
styleConfig: JSON        // { focusX, focusY, bgColor, spacing, textAlign, animation }
```

---

## ContentSlot 数据结构

```
slotKey:      string     // 唯一标识
pageKey:      string     // "home"
sectionKey:   string     // 区块标识
contentType:  string     // "image" | "video"
desktopAsset: string     // 桌面端素材 URL
mobileAsset:  string     // 移动端素材 URL
title:        string     // 标题
subtitle:     string     // 副标题
linkUrl:      string     // 链接
altText:      string     // 替代文本
sortOrder:    int        // 排序
isVisible:    boolean    // 可见性
status:       string     // "DRAFT" | "PUBLISHED"
```

---

## 冻结区域边界 (HC-CMS-03 开始前)

### ✅ 允许（验证性操作）

| 操作 | 说明 |
|---|---|
| 访问 `/admin/homepage` | 验证路由正常 |
| 查看页面加载 | 验证无白屏 |
| 查看预览 iframe | 验证预览功能 |
| 检查控制台错误 | 仅记录，不修复 |
| 读取 API 响应 | 验证数据结构 |

### ❌ 禁止（冻结区域）

| 禁止操作 | 涉及文件/目录 |
|---|---|
| 修改三栏工作区布局 | `HomepageConfig/` 内布局组件 |
| 修改页面目录/模块列表 | 模块列表组件 |
| 修改预览 iframe | iframe 渲染逻辑 |
| 修改属性面板 | 属性编辑面板 |
| 修改设备切换 | 响应式预览切换 |
| 修改草稿逻辑 | draft 保存/加载 |
| 修改发布逻辑 | publish 流程 |
| 修改 Hero 块 | `HeroBlock.tsx` (已有语法错误) |
| 修改前台内容 | `components/blocks/` 渲染组件 |
| 修改 PageModule 模型 | Prisma schema 中的模型定义 |

---

## 当前已知问题 (冻结区域内)

| 问题 | 文件 | 影响 |
|---|---|---|
| JSX 语法错误: `{'>'}` | `HeroBlock.tsx:126` | `tsc --noEmit` 报错，不影响运行时 |
| 控制台 400 错误 (x2) | 页面加载时 | API 参数格式问题，不影响核心功能 |

---

## 冻结区域对外接口

以下 API 端点不受冻结限制，可在其他阶段使用：

| API | 方法 | 说明 |
|---|---|---|
| `/api/page-modules/published?pageKey=home` | GET | 前台获取已发布模块 |
| `/api/content-slots/published?pageKey=home` | GET | 前台获取已发布插槽 |
| `/api/page-modules/admin?pageKey=home` | GET | 后台获取所有模块（含草稿） |

---

## 解冻条件

HC-CMS-03 阶段开始时：
1. 产品数据已导入
2. 前台数据接入完成
3. Permissions 体系建立
4. 明确的新功能需求规格
