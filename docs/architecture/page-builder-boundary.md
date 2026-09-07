# 页面装修实现边界

> 2026-09-08 文档整理与局部源码复核；本轮未重跑界面、真实 API 或数据库验收。
> 本文描述页面数据与运行链路。产品模型、事实分工、示例内容、模板生命周期只维护在[专项框架](../page-builder/template-design-framework.md)；相关资料见[文档导航](../page-builder/README.md)。

## 1. 实现入口

| 职责 | 源码位置 |
| --- | --- |
| 编辑器路由与工作台 | [App.tsx](../../client/src/App.tsx)、[HomepageConfig](../../client/src/pages/admin/HomepageConfig/) |
| 页面属性 Schema | [inspector/schema](../../client/src/page-builder/inspector/schema/)；分组顺序和名称由 `SchemaInspectorPanel` 维护 |
| 母模板定义、渲染与会话 | [template-definition](../../client/src/page-builder/template-definition/)、[template-editor](../../client/src/page-builder/template-editor/) |
| 页面精确版本实例 | [dynamic-template-instance](../../client/src/page-builder/dynamic-template-instance/) |
| Puck 配置与适配 | [config](../../client/src/page-builder/config/)、[adapters](../../client/src/page-builder/adapters/) |
| 公开渲染与区块 | [runtime](../../client/src/page-builder/runtime/)、[blocks](../../client/src/components/blocks/) |
| 页面接口与最终校验 | [PageModulesController](../../server/src/modules/page-modules/page-modules.controller.ts)、[PageModulesService](../../server/src/modules/page-modules/page-modules.service.ts) |
| 母模板接口 | [DynamicTemplatesController](../../server/src/modules/page-modules/dynamic-templates.controller.ts) |
| 持久化模型 | [schema.prisma](../../server/prisma/schema.prisma) 中的 `PageDocument`、`PageDocumentRevision` 和 `DynamicTemplate` 相关模型；源码不证明目标库已迁移 |

后台入口为 `/admin/editor/:pageKey`，旧 `/admin/homepage` 重定向。可装修页面与公开路径从[页面合同](../../contracts/page-builder/content-templates.contract.json)的 `pageRules` 读取；本文不另列模板数量、比例或页面权限表。

桌面四区布局只认 [PROJECT_RULES](../../PROJECT_RULES.md) §7，交互与响应式见 [UI_GUIDE](../UI_GUIDE.md) 附录 A。旧三栏与 iframe 文档已删除，当前实现只按上述入口取证。

## 2. 页面数据与兼容读取

`PageDocument` 保存 `pageKey`、`schemaVersion`、`editorType=puck`、`puckData` 与 `metadata`；精确字段见 Prisma 和当前 DTO。正文在 `puckData.content`，正式区块只允许位于根内容，`zones` 必须为空。metadata 中 SEO、OG、内容负责人、媒体授权与公开白名单的职责不同，不可整包返回游客。

- 旧类型由 `migratePuckData` 在载入副本中适配，公开 Renderer 保留兼容分支；读取兼容不等于自动重写历史 revision。
- 兼容页面媒体使用 `desktopFocusX/Y`、`mobileFocusX/Y`，旧 `focusX/Y` 仅作回退；统一母模板的响应式规则由锁定定义解释。
- 模板身份、版本锁定、实例覆盖、系统示例和业务内容分层见[专项框架](../page-builder/template-design-framework.md)第 2–5 节，本文不重复维护。

## 3. 保存、发布与公开读取

服务端 `PageModulesService` 是预检与发布校验的共同入口：

1. 保存草稿使用乐观锁；已有页面的写入携带当前 `expectedUpdatedAt`。
2. 预检检查页面合同、结构、内容、链接、业务引用、metadata 和媒体授权；发布时再次校验。
3. 发布创建不可变 revision，写入当前 `publicationGateVersion` 验收印记并推进发布指针；公开读取按 `publishedRevisionId + documentId` 取得对应快照，再通知前台刷新。
4. 公开读取继续校验快照和验收印记；不合格时返回无正文的 `INVALID / publication-revalidation-required`，不能将“历史版本可回放”解释成永久可公开。

可见区块中的顶层、视频和集合媒体 URL 连同 `ogImage` 去重后，须在 `metadata.mediaRights[]` 中逐 URL 提供 `source` 与 `authorizationId`；隐藏区块不计入本次范围。草稿可以暂时缺项，历史文档不自动补齐。验收印记只能由服务端生成，不能由客户端保存、历史恢复、放弃草稿或方案导入写入、沿用。

公开 metadata 只返回 `seoTitle`、`seoDescription`、`ogImage`；内部主键、发布账号、编辑器版本、验收印记、负责人和授权资料不得进入公开响应。

当前发布校验与界面“可选”提示存在的差异记录在 [CURRENT_STATE](../CURRENT_STATE.md) 页面装修章节；不能用界面提示替代服务端结果。前端角色能力必须与控制器一致：页面发布仅开放给 `ADMIN / SUPER_ADMIN`，`EDITOR` 的发布动作禁用。

## 4. 行动、内容位置与业务事实

- 页面型行动只使用 `pageRules[].publicPath` 生成的正式路径，可保留查询参数；未登记路径、片段、尾斜杠和商品详情不是页面目标。商品详情使用商品型目标并解析实时公开资格。Inspector、路由、预览、公开 Renderer 和服务端消费同源合同。
- 顶层、次级 CTA 和集合链接按合同解析；有文案的行动及必需条目必须有唯一合法目标。当前页面合同为 `root-only`，非空 `zones` 被草稿写入和预检拒绝；旧公开副本中的 zones 只清空、不迁入根内容，避免原先未公开内容突然曝光。
- 固定业务区只在根内容计数，按首个可见合同模块确定位置；隐藏备选和编辑器说明不参与公开顺序。
- 商品型区块仅保存稳定引用，公开 Renderer 实时读取游客商品接口；`产品展示行`、`单品焦点推荐`、`佩戴灵感` 共享商品变更流，事件后重新核对资格，失效商品不得沿用旧组件快照。
- 正式店铺名称、电话、邮箱、地址、营业时间和地图链接只来自 `SiteSettings`。公开 `PublicLayout` 与编辑器 `EditorCanvasShell` 各自持有一个 `PublicSiteSettingsResource`，供壳层和区块共享；脱离壳层的独立预览只读查询同一 API，不建立默认业务资料。

## 5. 草稿、历史版本与线上比较

### 草稿预览和错误恢复

受控 `/preview/:pageKey` 只预览服务端已保存草稿。没有草稿时显示“尚无已保存草稿”，不挂载推荐结构、发布版本或历史内容；读取失败显示可重试错误。

后台读取、保存、预检、发布、版本和放弃动作使用局部状态反馈，HTTP 层不叠加全局错误，不透传数据库错误、堆栈或内部路径。版本列表失败留在抽屉并可重试；恢复、放弃失败不替换画布或清除草稿。预检失败清除过期结论、关闭发布入口、保留草稿并允许原位重试，重试本身不保存或发布。metadata 问题定位发布设置，模块问题定位 Inspector，桌面与移动端提供等价恢复入口。

当前历史版本的本地载入只改变内存状态，显式保存才写入草稿，独立线上回滚只切换已发布指针；不要把旧“恢复版本”按钮流程套用到新界面。兼容恢复 API 仍以 `expectedUpdatedAt` 原子更新草稿并拒绝陈旧请求，不直接发布。

正式业务资料 warning 的维护目标是 `/admin/site-content`。有权限管理员可进入店铺资料；未保存画布仍经过同一 `UnsavedChangesGuard`。

### 线上版本只读比较

进入“查看线上版本”前保存完整内存正文、metadata、已保存签名、未发布与未保存状态。返回编辑、移动端继续编辑、路由离开保护及保存并离开均消费同一快照；首次草稿与线上一致而没有独立快照时，直接复用已加载文档和乐观锁基线，不额外读取后台文档。

比较期间禁止模板插入、导入、Inspector 写入、图层重排/显隐/删除、画布快捷修改及发布；修改发布设置前先安全返回草稿。在途保存完成后才能建立比较快照或读取恢复操作的最新乐观锁，避免旧回包覆盖会话。

## 6. 方案导入

JSON 方案声明的 `pageKey` 必须与当前页面一致。结构与组件检查通过后，先迁移旧格式，再使用与草稿加载、历史恢复相同的 `ensureEditorPageStructure` 归一化。

导入确认披露不适用系统区块、错页面模板、全部 zones 与重复固定区的移除数量；没有可编辑品牌内容时拒绝替换。静态品牌页不保留固定业务区；动态页只在根内容保留一个系统重建的固定区，紧随首个可见品牌模块，导入内容不能覆盖其身份、页面、说明和锁定字段。

导入只修改内存画布及历史，不自动保存或发布；有语义变化时触发未保存保护。`网站全局设置` 不属于正式页面内容，业务资料仍去 SiteSettings 维护。

## 7. 公开降级

纯品牌页只有当前合同与验收印记均有效的已发布文档才渲染正式内容；未发布、读取失败或失效时走安全降级，不恢复硬编码品牌长页。明确失效清除旧快照且不提供无效重试；临时读取失败才保留最后有效快照并允许恢复。

`catalog` 与 `contact` 的搜索、商品结果、选款清单、咨询表单和联系资料属于固定业务区，装修内容不可用时仍保留，并继续读取各自业务事实源。
