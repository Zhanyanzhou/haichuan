# 海川珠宝 — 页面构建器边界 (Page Builder Boundary)

> 最近更新：2026-08-31 | 本文只描述当前 Puck PageDocument 实现边界；页面装修与模板设计的共享编辑器产品规则见 `docs/page-builder/template-design-framework.md`，模板数量、结构、页面角色、比例和能力必须以机器合同及生成产物为准。

---

## 页面构建器概述

页面构建器是后台 `店铺体验 > 店铺装修`(`/admin/editor/:pageKey`,旧路径 `/admin/homepage` 已重定向)下的可视化页面编辑工具,基于 Puck 框架,支持 6 个一级页面(首页/关于海川/珠宝作品/选款中心/珠宝定制/预约咨询)的装修。

---

## 技术组成

| 层 | 位置 | 说明 |
|---|---|---|
| 设计系统 | `client/src/page-builder/designSystem/` | 当前设计令牌与母版实现；历史 `rhythm` 页面节奏引擎已退役，不得按旧文档恢复 |
| 编辑器 | `client/src/pages/admin/HomepageConfig/` | 编辑器主体(index.tsx)+ LayerRail/RevisionDrawer/PageSettingsDrawer/EditorToolbar |
| 编辑区 Schema | `client/src/page-builder/inspector/schema/` | 机器合同内容模板与 2 个系统区块使用声明式 Schema(五层信息架构:内容→媒体→布局→样式→高级折叠),registry 统一注册 |
| Puck 适配器 | `client/src/page-builder/adapters/*.puck.tsx` | 区块注册/默认值;旧专属 Inspector 已于 2026-08 R4b 退役(git 历史可查) |
| 前台渲染块 | `client/src/components/blocks/` | 机器合同登记的活跃内容模板复用同一批真实区块组件，`editMode` 区分编辑/公开态 |
| 公开渲染器 | `client/src/page-builder/runtime/` | PuckDocumentRenderer(含旧类型兼容分支)+ PublishedPageDecoration(业务页前置视觉区) |
| 机器合同 | `contracts/page-builder/content-templates.contract.json` + 生成产物 | 模板注册、根角色、双端顺序/比例、实例能力、页面角色和发布限制的唯一事实来源 |
| 元数据 | `client/src/page-builder/config/` | 编辑页声明、兼容映射和从机器合同派生的运行配置；不得复制 `pageRules` 建第二套页面门禁 |
| 后端 API | `server/src/modules/page-modules/` | PageDocument CRUD、预检/发布、版本与服务端最终页面角色门禁 |
| 数据库 | `page_documents` / `page_document_revisions` | 整页 Puck JSON + 50 条发布历史(旧 `page_modules`、`content_slots` 表均已删除) |

---

## 模板体系(2026-08 重构)

- **页面合同**：Brand/Commerce 等 mode 只作页面定位和视觉语义；全部 active 母模板在六个可装修页面通用，`recommendedFor` 只作推荐。机器合同 `pageRules` 仍强制裁决固定业务区数量和位置、根内容位置及导航模式，通用模板不得绕过这些页面级约束。
- **公开职责**：`products` 是 `brand-showcase`，只承担品牌作品展陈；`catalog` 是 `selection-tool`，唯一承担搜索、筛选、排序、选款和销售状态，并保留一个固定业务区。`/search` 只作兼容重定向到 `/catalog`。
- **模板与母版**：当前运营模板及其母版关系以机器合同为准，不在本文复制易漂移数量或手写映射。
- **规范比例**：允许值、默认值和双端差异只从机器合同派生；旧文档中的固定比例清单不得作为新增内容依据。
- **焦点**:desktopFocusX/Y + mobileFocusX/Y 双端独立(旧共享 focusX/Y 读取回退)。
- **旧类型迁移**:分割面板/图文混排/礼赠指南已从注册表移除;编辑器载入经 `utils/migratePuckData` 自动转换;公开渲染器保留旧类型分支，但历史 revision 只有重新通过当前发布门禁并取得服务端验收印记后才能再次公开。

---

## PageDocument 数据结构

```
pageKey         string   // "home" | "about" | "products" | "catalog" | "custom" | "contact"
schemaVersion   int      // 数据版本(自管)
editorType      "puck"
puckData        Json     // { content: [{ type: 中文名, props: {...} }], root, zones }；正式区块仅允许在 content，zones 只能为空
metadata        Json     // { seoTitle, seoDescription, ogImage, contentOwner, mediaRights[] }
status          "DRAFT" | "PUBLISHED"
```

发布流程：草稿保存（乐观锁）→ 服务端发布预检（含机器合同 `pageRules`、内容责任、SEO、素材授权、链接和业务引用）→ 正式发布时重新校验、由服务端写入当前 `publicationGateVersion` 验收印记并创建 revision → SSE 通知前台刷新。机器合同从当前可见区块的顶层、视频与集合媒体字段统一提取素材 URL，并连同 `ogImage` 要求 `metadata.mediaRights[]` 逐 URL 提供 `source` 与 `authorizationId`；相同 URL 去重，隐藏区块不计入本次发布范围。草稿可以暂时缺项，旧文档不自动迁移，但再次发布前必须补齐。验收印记属于服务端内部事实，客户端保存、历史恢复、放弃草稿和页面方案都不能写入或沿用。版本恢复只写草稿，并必须携带当前 `expectedUpdatedAt`；服务端以原子条件更新拒绝陈旧恢复，冲突时返回 409，运营需刷新后重新选择版本。公开 PageDocument 只有验收印记与当前门禁一致时才返回 Puck 数据，并只白名单返回 `seoTitle`、`seoDescription` 与 `ogImage`；旧 revision 返回不含内容的 `INVALID / publication-revalidation-required` 描述。内部文档主键、后台发布账号、编辑器版本、验收印记、`contentOwner`、`mediaRights` 与其他后台 metadata 均不得进入公开响应。

页面型行动目标只认机器合同 `pageRules[].publicPath` 生成的正式 PageDocument 路径；查询参数可保留，未登记路径、片段、尾斜杠和商品详情路径不属于页面目标。商品详情必须使用商品目标并解析真实公开商品资格。Inspector 候选、React 内容页路由、模块预览、公开 Renderer 与服务端发布门禁共同消费生成合同，不维护第二份可独立漂移的 CTA 路由表。

行动目标与内容位置门禁：顶层行动、次级 CTA 与显式集合链接政策从机器合同提取；有文案的行动和合同标记为必需的公开条目必须解析到唯一站内页面或公开商品，商品继续实时复用游客公开资格查询。六个页面角色均由 `pageRules.contentPlacement = root-only` 声明正式区块只允许位于根 `content`；当前组件树没有 Puck `DropZone` 消费者，非空 `zones` 会被草稿写入与发布预检拒绝，导入和公开旧快照只在副本中清空，不自动迁入根内容，避免把过去从未公开且顺序不明的内容突然上线。固定业务区只在 root 计数，并按首个可见合同模块确定位置，隐藏备选块与编辑器说明块不参与公开顺序。

商品型装修模块只保存稳定引用，不保存商品业务快照。`产品展示行`、`单品焦点推荐`与`佩戴灵感`在公开 Renderer 中共享一条商品目录事件流；收到变更后分别重新调用游客公开商品接口，已下架、非公开或缺少展示图的商品不得继续由旧组件状态展示。该刷新机制不改变商品资格规则，也不把 PageDocument 变成商品名称、价格、图片、库存或销售模式的第二事实源。

站点名称、门店名称、电话、邮箱、地址、营业时间和地图链接只来自 `SiteSettings`，不得写入 PageDocument 作为正式资料回退。一次公开 `PublicLayout` 由一个 `PublicSiteSettingsResource` 统一供给导航、门店信息、预约区块和联系页固定业务区；一次编辑器 `EditorCanvasShell` 也由一个资源统一供给导航、页脚和画布区块。独立模块预览可以在没有壳层 Provider 时只读查询同一 API，但不得建立另一套默认业务事实。

模板库中性样例只属于 `TEMPLATE_PREVIEW_CONTENT` 预览层，不得进入组件 `defaultProps`、推荐 PageDocument、正式草稿或业务 API。当前浏览器预览只加载 `neutral-template-preview-v1` 下不表达人物、商品、工艺、门店或品牌事实的 SVG，以及系统商品占位 SVG；不得加载真实摄影图片。正式页面媒体仍必须由内容负责人提供来源与授权记录，并通过上述发布门禁逐 URL 验证。

公开降级边界：`home`、`products`、`custom`、`about` 等纯品牌页只有取得满足当前页面合同且带当前服务端验收印记的已发布 PageDocument 才渲染正式品牌内容；未发布、读取失败或快照无效时只显示中性安全短页，不回退到另一套硬编码品牌长页。明确失效会清除客户端内存旧快照且不提供无效重试，临时读取失败才保留最后有效快照并允许恢复。`catalog` 与 `contact` 的搜索、商品结果、选款清单、咨询表单和联系资料属于固定业务区，装修内容不可用时仍保留，并继续实时读取各自业务事实源。

草稿预览边界：受控 `/preview/:pageKey` 只有后台草稿读取成功时才渲染该文档；服务端明确返回空文档时可以展示对应页面的推荐结构，读取失败则必须显示可重试错误，不能用推荐 seed、发布版本或历史内容伪装成草稿。PageDocument 的后台读取、保存、预检、发布、版本和放弃动作由编辑器各自的局部状态反馈，HTTP 层不得再叠加第二条全局错误；任何运营提示不得透传数据库错误、堆栈或内部路径。版本列表读取失败必须留在版本抽屉并可重新加载；版本恢复失败不得替换画布，成功后以 Puck 归一化结果建立已保存草稿基线；放弃草稿失败必须明确告知草稿仍保留，并从同一页面提供再次确认入口。上述破坏性动作只有服务端成功后才能推进画布、草稿状态和会话基线。

发布就绪状态只认服务端 `/document/validate` 返回的结构化问题，客户端不得复制 SEO、CTA、业务引用或素材授权校验规则。预检读取失败时发布入口必须保持关闭、清除上一轮已过期的问题结论、保留当前草稿，并提供原位重新检查；页面级 `metadata` 问题应直达现有发布设置，模块级问题继续在对应 Inspector 定位。桌面工具栏与移动端收纳菜单必须提供等价恢复路径，重试本身不得保存草稿或触发发布。

正式业务资料 warning 的唯一维护目标是 `/admin/site-content` 对应的 `SiteSettings`，不得把电话、地址、营业时间等复制回 PageDocument。具有店铺资料权限的管理员可从发布确认直接进入该页面；若当前画布有未保存修改，导航仍必须经过同一 `UnsavedChangesGuard`。`EDITOR` 可以编辑、预览和保存草稿，但前端发布入口必须与服务端 `ADMIN / SUPER_ADMIN` 门禁一致地保持禁用，不能先展示可发布再依赖接口 403 收尾。

装修方案导入边界：带 `pageKey` 的方案只能导入同一页面；通过 JSON 结构和已知组件检查后，必须先迁移旧格式，再调用与草稿加载、历史恢复相同的 `ensureEditorPageStructure` 页面能力归一化。导入确认必须明确告知将移除的不适用系统区块、错页面模板、全部 `zones` 区块及重复固定区；过滤后没有可编辑品牌内容时拒绝替换。静态品牌页不得保留固定业务区；动态页的固定业务区必须只在 root 出现一次、紧随首个可见品牌模块，并由当前页面定义重新建立 `id`、`pageKey`、说明和锁定状态，导入内容不能覆盖这些系统字段。导入只改变当前内存画布和历史，不自动保存或发布；有语义变化时继续进入同一个未保存离开保护。`网站全局设置` 不属于 PageDocument 正式内容，正式门店与联系资料仍只能去 `SiteSettings` 维护。

线上比较边界：“查看线上版本”只允许作为当前编辑会话内的只读比较态，不得把已发布内容伪装成可直接保存的草稿。进入前必须保留当前内存 `puckData`、metadata、已保存签名、未发布状态与未保存状态；返回编辑、移动端继续编辑、路由离开保护和保存并离开都消费同一快照。首次进入时若后台草稿与线上内容完全一致而没有独立快照，返回编辑必须直接沿用初次加载的 PageDocument、metadata 与乐观锁基线，不得为了退出只读态再请求一次后台文档。线上比较期间禁止模板插入/导入、Inspector 写入、图层重排/隐藏/删除、画布快捷修改和发布；发布设置入口可以保留，但必须先安全返回草稿再进入编辑。若存在在途保存，查看线上版本和恢复历史版本都必须先等待保存队列完成，再用最新服务端回包建立快照或读取 `expectedUpdatedAt`，避免旧回包覆盖比较态或制造虚假脏状态。

---

## 冻结区域边界 (历史存档)

HC-CMS-03 时期的"三栏工作区/模块列表/预览 iframe/属性面板冻结"要求已随 2026-08 重构解除;当前编辑器三栏(模块库/画布/图层+Schema 面板)均为活跃开发区域。
