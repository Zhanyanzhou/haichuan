# 海川珠宝 — 页面构建器边界 (Page Builder Boundary)

> 最近更新：2026-08-23 | 本文描述当前 Puck PageDocument 边界；模板数量、结构、页面角色、比例和能力必须以机器合同及生成产物为准。

---

## 页面构建器概述

页面构建器是后台 `店铺体验 > 店铺装修`(`/admin/editor/:pageKey`,旧路径 `/admin/homepage` 已重定向)下的可视化页面编辑工具,基于 Puck 框架,支持 6 个一级页面(首页/关于海川/珠宝作品/选款中心/珠宝定制/预约咨询)的装修。

---

## 技术组成

| 层 | 位置 | 说明 |
|---|---|---|
| 设计系统 | `client/src/page-builder/designSystem/` | 当前设计令牌与母版实现；历史 `rhythm` 页面节奏引擎已退役，不得按旧文档恢复 |
| 编辑器 | `client/src/pages/admin/HomepageConfig/` | 编辑器主体(index.tsx)+ LayerRail/RevisionDrawer/PageSettingsDrawer/EditorToolbar |
| 编辑区 Schema | `client/src/page-builder/inspector/schema/` | 26 个组件(24 内容模板 + 2 系统区块)全量声明式 Schema(五层信息架构:内容→媒体→布局→样式→高级折叠),registry 统一注册 |
| Puck 适配器 | `client/src/page-builder/adapters/*.puck.tsx` | 区块注册/默认值;旧专属 Inspector 已于 2026-08 R4b 退役(git 历史可查) |
| 前台渲染块 | `client/src/components/blocks/` | 24 个活跃内容模板复用同一批真实区块组件，`editMode` 区分编辑/公开态 |
| 公开渲染器 | `client/src/page-builder/runtime/` | PuckDocumentRenderer(含旧类型兼容分支)+ PublishedPageDecoration(业务页前置视觉区) |
| 机器合同 | `contracts/page-builder/content-templates.contract.json` + 生成产物 | 模板注册、根角色、双端顺序/比例、实例能力、页面角色和发布限制的唯一事实来源 |
| 元数据 | `client/src/page-builder/config/` | 编辑页声明、兼容映射和从机器合同派生的运行配置；不得复制 `pageRules` 建第二套页面门禁 |
| 后端 API | `server/src/modules/page-modules/` | PageDocument CRUD、预检/发布、版本与服务端最终页面角色门禁 |
| 数据库 | `page_documents` / `page_document_revisions` | 整页 Puck JSON + 50 条发布历史(旧 `page_modules`、`content_slots` 表均已删除) |

---

## 模板体系(2026-08 重构)

- **页面角色门禁**：Brand/Commerce 等 mode 只作页面定位和视觉语义；模板是否允许用于某个页面、固定业务区数量和位置，由机器合同 `pageRules` 强制裁决。旧“模板全页面通用、运营自行取舍”结论已失效，不得实施。
- **公开职责**：`products` 是 `brand-showcase`，只承担品牌作品展陈；`catalog` 是 `selection-tool`，唯一承担搜索、筛选、排序、选款和销售状态，并保留一个固定业务区。`/search` 只作兼容重定向到 `/catalog`。
- **模板与母版**：当前运营模板及其母版关系以机器合同为准，不在本文复制易漂移数量或手写映射。
- **规范比例**：允许值、默认值和双端差异只从机器合同派生；旧文档中的固定比例清单不得作为新增内容依据。
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

发布流程：草稿保存（乐观锁）→ 服务端发布预检（含机器合同 `pageRules`、内容、素材、链接和业务引用）→ 正式发布时重新校验并写入 revision → SSE 通知前台刷新。版本恢复只写草稿，并必须携带当前 `expectedUpdatedAt`；服务端以原子条件更新拒绝陈旧恢复，冲突时返回 409，运营需刷新后重新选择版本。

---

## 冻结区域边界 (历史存档)

HC-CMS-03 时期的"三栏工作区/模块列表/预览 iframe/属性面板冻结"要求已随 2026-08 重构解除;当前编辑器三栏(模块库/画布/图层+Schema 面板)均为活跃开发区域。
