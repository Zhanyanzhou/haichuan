# 海川珠宝 — 页面构建器边界 (Page Builder Boundary)

> 最近更新:2026-08-15 | 维护说明:本文档描述装修系统重构(12 母版/双模式/Canvas Design System)后的真实架构。

---

## 页面构建器概述

页面构建器是后台 `店铺体验 > 店铺装修`(`/admin/editor/:pageKey`,旧路径 `/admin/homepage` 已重定向)下的可视化页面编辑工具,基于 Puck 框架,支持 6 个一级页面(首页/关于海川/珠宝作品/选款中心/珠宝定制/预约咨询)的装修。

---

## 技术组成

| 层 | 位置 | 说明 |
|---|---|---|
| 设计系统 | `client/src/page-builder/designSystem/` | tokens(宽度/比例/节奏/排版/配色)、masters(12 母版注册表)、DecorSection 外壳、rhythm 页面节奏引擎 |
| 编辑器 | `client/src/pages/admin/HomepageConfig/` | 编辑器主体(index.tsx)+ LayerRail/RevisionDrawer/PageSettingsDrawer/EditorToolbar |
| 编辑区 Schema | `client/src/page-builder/inspector/schema/` | 23 模块全量声明式 Schema(五层信息架构:内容→媒体→布局→样式→高级折叠),registry 统一注册 |
| Puck 适配器 | `client/src/page-builder/adapters/*.puck.tsx` | 区块注册/默认值;旧专属 Inspector 已于 2026-08 R4b 退役(git 历史可查) |
| 前台渲染块 | `client/src/components/blocks/` | 23 个区块组件(含作品画廊),`editMode` 区分编辑/公开态 |
| 公开渲染器 | `client/src/page-builder/runtime/` | PuckDocumentRenderer(含旧类型兼容分支)+ PublishedPageDecoration(业务页前置视觉区) |
| 元数据 | `client/src/page-builder/config/` | blockMeta(mode/master 挂靠)、blockContracts(比例/文案上限/完成度)、editorPages(页面 mode)、imageSpecs(上传规格目录) |
| 后端 API | `server/src/modules/page-modules/` | PageDocument CRUD + 发布校验(含 Brand 页禁 Commerce Campaign 组件) |
| 数据库 | `page_documents` / `page_document_revisions` | 整页 Puck JSON + 50 条发布历史(旧 `page_modules`、`content_slots` 表均已删除) |

---

## 模板体系(2026-08 重构)

- **双模式(Brand/Commerce)**:页面与母版保留 mode 元数据,用于节奏参考与视觉语言归档;**不做强制限制**(2026-08-15 用户决策:模板全页面通用,运营自行取舍)。
- **12 母版**:Brand 9(Cinematic Hero / Immersive Image / Editorial Split / Editorial Story / Asymmetric Gallery / Editorial Text / Hero Piece / Journey / Conversion)+ Commerce 3(Commerce Grid / Entry / Campaign);23 个运营语义命名模板挂靠其上(含作品画廊与改款前后)。
- **规范比例**:21:9 / 21:6 / 16:7 / 16:9 / 3:2 / 4:5 / 3:4 / 1:1(RATIOS 单一来源);模板契约定义各自双端比例,运营不可自选。
- **焦点**:desktopFocusX/Y + mobileFocusX/Y 双端独立(旧共享 focusX/Y 读取回退)。
- **旧类型迁移**:分割面板/图文混排/礼赠指南已从注册表移除;编辑器载入经 `utils/migratePuckData` 自动转换;公开渲染器保留旧类型分支,已发布历史版本永久可渲染。

---

## PageDocument 数据结构

```
pageKey         string   // "home" | "about" | "products" | "catalog" | "custom" | "contact"
schemaVersion   int      // 数据版本(自管)
editorType      "puck"
puckData        Json     // { content: [{ type: 中文名, props: {...} }], root, zones }
metadata        Json     // { seoTitle, seoDescription, ... }
status          "DRAFT" | "PUBLISHED"
```

发布流程:草稿(2s 静默自动保存+乐观锁)→ 发布校验(必填图/文本上限/URL 安全/上传文件存在/占位文案拦截/商品可见性/品牌页模式拦截)→ 写入 revision(保留 50 条)→ SSE 通知前台热更新。

---

## 冻结区域边界 (历史存档)

HC-CMS-03 时期的"三栏工作区/模块列表/预览 iframe/属性面板冻结"要求已随 2026-08 重构解除;当前编辑器三栏(模块库/画布/图层+Schema 面板)均为活跃开发区域。
