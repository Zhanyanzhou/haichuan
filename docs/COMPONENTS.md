# 海川珠宝 — 组件手册

> 最后更新：2026-08-26。组件存在不代表公开路由仍消费它；公开页面职责只认 `docs/PROJECT_GUARDRAILS.md`，当前路由与组件消费事实见 `docs/CURRENT_STATE.md` 和代码，模板页面角色门禁只认机器合同。

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
| **ErrorBoundary**   | App.tsx        | React 错误边界          |
| **ProtectedRoute**  | App.tsx        | 认证路由守卫            |
| **ProgressBar**     | App.tsx        | 页面加载进度条          |

> `AdminStatusTag.tsx` 与 `FilterPanel.tsx` 当前均为删除差异且全仓零消费者；状态标签由 Ant Design `Tag` 配合后台全局语义样式承接，目录筛选由 `/catalog` 自有组件承接。2026-08-26 已批准并确认保留这两项删除差异，可从 HEAD 精确恢复。

## UI 组件 (ui/)

| 组件               | 引用者                                    |
| ------------------ | ----------------------------------------- |
| **ScifiButton** ✅ | CategoryManage, ProductManage, UserManage |
| GlowCard ⚠️        | 未被引用                                  |
| ParticleBg ⚠️      | 未被引用                                  |

## 页面装修区块 (blocks/ 与 page-builder/)

### 单套渲染层 + 声明式编辑体系(2026-08 重构后)

- **渲染层唯一**:机器合同登记的全部活跃内容模板统一复用 `blocks/` 下的真实渲染组件，`editMode` prop 区分编辑画布与公开页；admin 适配器与公开渲染器(PuckDocumentRenderer)共用同一批组件。
- **编辑区**:机器合同内容模板与网站全局设置/业务功能区由 `page-builder/inspector/schema/modules/` 声明式 Schema 驱动(七任务分区:图片素材→文字内容→商品关联→行动关联→构图与设备→颜色与文字→模板专属功能),registry 全量注册;旧 10 个专属 Inspector(R4b)与 Puck.Fields fallback(P1-2,2026-08-18)均已退役,git 历史可查。
- **设计系统**：精确比例、模板、角色和页面门禁只认当前机器合同；全局五档比例之外，3:4 仅限合同明确声明的受控槽位。历史 rhythm 引擎与旧比例清单不得作为当前实现依据。
- **旧类型兼容**:分割面板/图文混排/礼赠指南已从注册表移除;编辑器经 `migratePuckData` 自动转换,公开渲染器保留旧类型分支,已发布历史版本永久可渲染。

### 公开品牌页单轨与休眠源码

公开品牌内容只走 Puck `PageDocument` 与统一 Renderer；`/products` 是品牌内容容器，`/catalog` 承担作品发现与筛选。`pages/public/About`、`pages/public/Custom` 的历史硬编码实现当前没有运行时消费者，其中 `Custom` 仍含受保护的用户差异；两者不得恢复为平行公开路由。待正式内容完成映射并通过 PageDocument 保存、发布和公开回显后，再按精确审批裁决这些休眠源码。

旧 `pages/admin/ProductEditor/index.tsx` 与 `pages/public/ProductList/index.tsx` 同样为全仓零消费者的删除差异，分别由 `ProfessionalProductEditor.tsx` 与 `/products` PageDocument + `/catalog` 接替；2026-08-26 已批准并确认保留这两项删除差异，可从 HEAD 精确恢复。该裁决不包含 About、Custom 或 Puck 演进区文件。

### 遗留待清退

- `adapters/imageText.puck / splitPanel.puck`:仅作为旧类型渲染映射的 Props 类型源保留(puckPropsToModule 类型联合引用),模板库不再提供;`inspector/schema/modules/splitPanel.ts` 已墓碑化。
- ContentSlot 体系（表、类型、端点与 `useContentSlots`）已从当前工作树清退；页面内容统一由 PageDocument 承载，不保留待执行的“墓碑清理”任务。

> 注:早期文档记载的"旧版 blockComponents(blocks/index.ts,HeroBlock 等 6 个)"经核实文件已不存在,该条目撤销。

## 统计

> 分域重数(2026-08-15 全域完成,含动态 import 复核)。

| 域 | 数量 | 状态 |
| --- | --- | --- |
| blocks/ 渲染层 | 以当前目录核对 | ✅ 机器合同活跃模板复用真实区块；另有 `_shared/BlockEmptyPlaceholder` |
| page-builder/adapters | 以当前注册表核对 | 合同模板正常注册；imageText/splitPanel 仅作旧类型 Props 类型源(遗留) |
| page-builder/inspector/schema/modules | 以当前 registry 核对 | ✅ 合同模板与系统区块均由声明式 Schema 注册；变体不另算模板数量 |
| page-builder/designSystem | 3 | ✅ tokens/masters/sectionShell |
| components/common | 9 | 当前目录 9 个源文件；`AdminStatusTag`、`FilterPanel` 两个零消费者删除差异已确认保留 |
| components/admin | 0 | 2026-08-21 批次 A1 删除 ImageCropper 后目录清空 |
