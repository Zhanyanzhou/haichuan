# 店铺装修真实闭环审计矩阵（2026-08-30）

> **历史验收（2026-08-30）**：下文“当前”“已完成”“PASS”均限定为当轮基线、授权和证据层，不证明今天仍通过，也不定义长期模板数量或产品范围。本次文档整理未复跑这些测试；现行入口见[文档导航](../../page-builder/README.md)。
>
> 当前基线：`f754c3bdfd3aa3c171ac0ea968e4d800b77d536b`，分支 `codex/release-curation-20260814`。工作树含大量既有 staged、unstaged 和 untracked 修改，均视为用户资产。
>
> 受保护状态：既有浏览器中的来源不明未保存草稿未刷新、未导航、未保存、未丢弃、未发布。没有执行 Git 写入、文件删除、依赖变更、生产发布或动态模板正式激活。经用户明确批准，只对唯一命名、可抛弃的本地 MySQL 卷应用了当前已有的 48 个 migration；该卷在测试后已删除，未连接或修改既有 `jewelry-mysql`、真实数据或生产环境。

## 1. 状态与证据层级

状态只使用：

- `PASS`：当前证据层内已取得直接运行证据。
- `PARTIAL`：部分证据已通过，但完整真实闭环仍缺少证据。
- `FAIL`：当前新鲜运行证据确认功能错误。
- `BLOCKED`：缺少环境或需要额外授权。
- `NOT_RUN`：明确不在本次授权或外部依赖边界内执行；不会被包装为 `PASS`。
- `NOT_APPLICABLE`：当前合同或活跃注册表明确不适用。

证据层级：

| 标识 | 含义 | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| `CONTRACT` | 当前机器合同、注册表、生成物和静态核验 | 页面/模板清单、注册、允许关系、数据结构、双端生成一致 | 浏览器可操作、真实持久化 |
| `UI-MOCK` | 真实 React + Chromium，拦截自有 API 形成确定性状态 | 入口、控件交互、PageDocument 写入、视觉、响应式、错误反馈 | 真实 NestJS/MySQL 持久化 |
| `SERVICE` | NestJS 服务层与仓储边界测试 | DTO、权限、校验、事务语义、快照隔离、冲突处理 | 当前实际运行数据库和浏览器链路 |
| `REAL-API` | 真实 React + NestJS + 隔离 MySQL + UI 登录和写入 | 保存、刷新、发布、公开 Renderer 的真实技术闭环 | 生产、正式内容或第三方服务 |

当前 `REAL-API` 层为 `PASS`：在用户明确授权后，以 `hc-store-closure-20260830-04` 唯一前缀创建一次性 MySQL、NestJS 和 Nginx 环境，完成 48 个 migration、临时 `SUPER_ADMIN`、真实 UI 登录、同源 `/api` 写入、刷新回显、预览、发布、匿名公开读取、桌面/移动 Renderer 以及发布后新草稿隔离。最终 Playwright `1 passed (4.8s)`、脚本退出码 0、`cleanup_remaining=0`。

证据边界：`products + textBanner` 是 `REAL-API` 的直接代表链路；其余页面、模板和 Inspector 字段的页面/模板特异行为由穷举 `CONTRACT + UI-MOCK + SERVICE` 证明，而 PageDocument 持久化、发布快照和公开读取是同一参数化共享链路。本文凡写“共享链路 PASS”都表示这种组合证据，不冒充每个 `6 × 24` 组合都分别连接过 MySQL。

## 2. 页面矩阵

当前机器合同共 6 个页面。每一行都进入确定性浏览器、公开 Renderer 和权限/失败态矩阵；`products` 另有直接真实 API 证据，其余页面消费相同 PageDocument API 与公开 Renderer 入口，按上述共享链路口径收口。

| 页面 | 公开路径 | 页面角色 | 允许模板数 | 固定业务区 | Header 规则 | 桌面/移动 | `CONTRACT` | `UI-MOCK` | `REAL-API` | 总状态 |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| 店铺首页 `home` | `/` | `brand-home` | 18 | 0 | 首模板为 `hero` 时 `overlay-light`，否则 `solid` | PASS | PASS | PASS | PASS（共享链路） | PASS |
| 关于海川 `about` | `/about` | `brand-story` | 13 | 0 | 首模板为 `hero` 时 `overlay-light`，否则 `solid` | PASS | PASS | PASS | PASS（共享链路） | PASS |
| 珠宝作品 `products` | `/products` | `brand-showcase` | 17 | 0 | `solid` | PASS | PASS | PASS | PASS（直接） | PASS |
| 选款中心 `catalog` | `/catalog` | `selection-tool` | 4 | 1，首个品牌模块之后 | `solid` | PASS | PASS | PASS | PASS（共享链路） | PASS |
| 珠宝定制 `custom` | `/custom` | `brand-service` | 16 | 0 | 首模板为 `hero` 时 `overlay-light`，否则 `solid` | PASS | PASS | PASS | PASS（共享链路） | PASS |
| 预约咨询 `contact` | `/contact` | `conversion-support` | 5 | 1，首个品牌模块之后 | `solid` | PASS | PASS | PASS | PASS（共享链路） | PASS |

总组合数：`6 × 24 = 144`；允许 73，禁止 71。禁止组合已由页面角色矩阵验证不会出现在可添加列表，旧发布快照中不合法模块也会被公开 Renderer 过滤。

## 3. 活跃模板矩阵

以下 24 行来自当前 `content-templates.contract.json`，没有使用历史硬编码数量。`UI-MOCK` 覆盖根结构、角色顺序、空素材、桌面/移动、无横向溢出以及画布/预览/公开 Renderer 的同源解释；`textBanner` 完成直接真实发布，其余模板复用无模板分支的 PageDocument 持久化/快照链，模板特异渲染由双端 Chromium 穷举证明。

| 模板 | 显示名 | 主要任务 | 允许页面 | `CONTRACT` | 双端 Chromium | 真实发布 | 总状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hero` | 首屏 | media | home, products, custom, about, contact | PASS | PASS | PASS（共享链路） | PASS |
| `fullBleed` | 通栏图 | media | 全部 6 页 | PASS | PASS | PASS（共享链路） | PASS |
| `video` | 视频 | media | home, products, custom, about | PASS | PASS | PASS（共享链路） | PASS |
| `carousel` | 轮播 | media | home, products | PASS | PASS | PASS（共享链路） | PASS |
| `singlePoster` | 单图文 | media | 全部 6 页 | PASS | PASS | PASS（共享链路） | PASS |
| `doublePoster` | 双图文 | media | home, products, custom, about | PASS | PASS | PASS（共享链路） | PASS |
| `textBanner` | 纯文字 | text | 全部 6 页 | PASS | PASS | PASS（直接） | PASS |
| `journey` | 内容流程 | structured | home, custom, about | PASS | PASS | PASS（共享链路） | PASS |
| `comparison` | 前后对比 | media | custom | PASS | PASS | PASS（共享链路） | PASS |
| `featuredProduct` | 单品展示 | product | home, products | PASS | PASS | PASS（共享链路） | PASS |
| `productRow` | 商品列表 | product | home, products | PASS | PASS | PASS（共享链路） | PASS |
| `gallery` | 作品画廊 | media | home, products, custom | PASS | PASS | PASS（共享链路） | PASS |
| `wearingInspiration` | 佩戴展示 | product | home, products | PASS | PASS | PASS（共享链路） | PASS |
| `categoryCards` | 品类入口 | category | home, products | PASS | PASS | PASS（共享链路） | PASS |
| `sceneShopping` | 场景入口 | structured | home, products | PASS | PASS | PASS（共享链路） | PASS |
| `hotspot` | 图片热区 | media | products, custom | PASS | PASS | PASS（共享链路） | PASS |
| `brandPoints` | 品牌要点 | structured | home, custom, about | PASS | PASS | PASS（共享链路） | PASS |
| `servicePromises` | 服务承诺 | structured | custom, about | PASS | PASS | PASS（共享链路） | PASS |
| `certificates` | 证书展示 | media | custom, about | PASS | PASS | PASS（共享链路） | PASS |
| `storeInfo` | 门店信息 | media | about, contact | PASS | PASS | PASS（共享链路） | PASS |
| `testimonials` | 顾客分享 | structured | custom | PASS | PASS | PASS（共享链路） | PASS |
| `booking` | 预约入口 | action | home, products, catalog, custom, about | PASS | PASS | PASS（共享链路） | PASS |
| `limitedEvent` | 限时活动 | media | home, products | PASS | PASS | PASS（共享链路） | PASS |
| `craftDetails` | 工艺细节 | media | home, products, custom, about | PASS | PASS | PASS（共享链路） | PASS |

全量截图证据位于：

- `client/test-results/content-template-preview-fullsize/`：48 张，24 模板 × 桌面/移动。
- `client/test-results/content-template-previews/all-desktop.png`。
- `client/test-results/content-template-previews/all-mobile.png`。

## 4. Inspector 注册与控件矩阵

当前共扫描 24 个 `.ts/.tsx` Schema 源文件、26 个注册项，其中 24 个内容模块、2 个系统模块（`businessRegion`、`siteConfig`）。当前 Renderer 支持 15 种控件，活跃 Schema 使用 14 种；`select` 仅保留兼容分发，当前活跃 Schema 未注册可见字段。

| 控件/字段族 | 当前可见 | 交互证据 | 数据/边界证据 | 真实保存/公开 | 总状态 |
| --- | --- | --- | --- | --- | --- |
| `text` | 是 | 标题编辑后立即写回 | 空值与长度由 Schema/发布门禁覆盖 | PASS（直接） | PASS |
| `textarea` | 是 | 视频说明等多行内容写回 | 合法空值、长文本和公开无画面说明 | PASS（共享链路） | PASS |
| `segmented` | 是 | 视频宽度等分段按钮写回 | 当前枚举外值不进入文档 | PASS（共享链路） | PASS |
| `number` | 是 | 数字输入、步长及边距写回 | min/max/step 与非法值 | PASS（共享链路） | PASS |
| `switch` | 是 | 开关即时同步 | 布尔值与恢复默认 | PASS（共享链路） | PASS |
| `select` | 否 | 兼容 fixture 已验证分发 | 当前活跃注册数为 0 | NOT_APPLICABLE | NOT_APPLICABLE |
| `color` | 是 | 色板 radio 写回 | 只允许当前令牌/选项 | PASS（共享链路） | PASS |
| `media` | 是 | 打开、更换、清除、焦点、裁切 | 加载、空、失败、重试、缺失素材 | PASS（共享链路） | PASS |
| `video` | 是 | 来源、封面、说明、替换与清除 | 失败、重试、公开无画面说明 | PASS（共享链路） | PASS |
| `linkTarget` | 是 | 无链接、商品、分类、站内、HTTPS 外链互斥 | 旧字段清理、非法 URL/路径阻断 | PASS（共享链路） | PASS |
| `productReferences` | 是 | 搜索、分页、选择、排序、移除 | 竞态取消、下架、缺图、解析失败、稳定引用 | PASS（共享链路） | PASS |
| `categoryReferences` | 是 | 加载、选择、排序、移除 | 失败重试、停用、缺封面、过期响应 | PASS（共享链路） | PASS |
| `preset` | 是 | 预设按钮写回 | 仅当前预设值 | PASS（共享链路） | PASS |
| `custom` | 是 | 店铺资料等专用编辑入口 | 专用组件自行校验 | PASS（共享链路） | PASS |
| `array` | 是 | 项选择、添加、删除、排序 | min/max、按钮禁用、实例隔离 | PASS（共享链路） | PASS |

字段证据来源：

- `scripts/verify-inspector-schema.mjs`：24 个源文件、26 个注册项、14/15 活跃/支持控件、0 hard、0 warning。
- `client/tests/array-field.spec.ts`：基础字段、兼容 select、数组 min/max 和键盘语义。
- `client/tests/product-references-field.spec.ts`：商品分页、竞态、无效引用、稳定 code 与 390px 对话框。
- `client/tests/category-references-field.spec.ts`：分类失败重试、停用、缺封面、过期响应和排序。
- `client/tests/visual-editor-hero.spec.ts`、`visual-editor-double-poster.spec.ts`、`booking-editor.spec.ts`：媒体、焦点、构图、层级、恢复默认和稀疏实例覆盖。
- `client/tests/page-publish-validation.admin.spec.ts`：客户端与服务端发布前阻断语义。

## 5. 可见入口与操作归属矩阵

该表按用户可见功能面归属按钮、输入、菜单、快捷键和对话框。单个动态列表行中的重复按钮由同一参数化行为覆盖。

| ID | 工作区/入口 | 可见操作 | 写入或读取路径 | `UI-MOCK` | `SERVICE` | `REAL-API` | 总状态 | 主要证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WS-01 | 后台导航/页面工作区 | 进入装修、兼容入口、页面切换 | `editorPages` + 路由 | PASS | PASS | PASS（直接） | PASS | `page-document-runtime-sync.spec.ts` + 真实 UI |
| WS-02 | 页面状态 | 加载、错误、重试、无草稿、已有草稿 | 页面草稿查询 | PASS | PASS | PASS（共享链路） | PASS | `editor-draft-recovery.admin.spec.ts` |
| WS-03 | 模板库 | 搜索、分类、筛选、空结果、折叠/展开 | 当前机器合同 | PASS | PASS | PASS（直接添加入口） | PASS | `page-document-runtime-sync.spec.ts` + 真实 UI |
| WS-04 | 模板库/画布 | 点击添加、拖拽添加、允许/禁止关系 | `PageDocument.content` | PASS | PASS | PASS（直接拖入） | PASS | `puck-visual-editor.spec.ts`、角色矩阵测试、真实 UI |
| WS-05 | 多实例 | 同模板多实例、默认值和实例隔离 | 模块 `props` | PASS | PASS | PASS（共享链路） | PASS | 模板内部编辑参数化测试 |
| WS-06 | 图层/画布/Inspector | 三方选择同步、晚挂载选择操作组 | 当前模块 ID/对象 ID | PASS | NOT_APPLICABLE | PASS（直接） | PASS | `page-document-runtime-sync.spec.ts` + 真实 Inspector |
| WS-07 | 模块操作组 | 上移、下移、删除、确认对话框 | `PageDocument.content` 顺序 | PASS | PASS | NOT_APPLICABLE | PASS | `page-document-runtime-sync.spec.ts` |
| WS-08 | 编辑工具栏 | 撤销、重做 | 页面编辑会话历史 | PASS | NOT_APPLICABLE | NOT_APPLICABLE | PASS | `page-document-runtime-sync.spec.ts` |
| WS-09 | 视口/画布 | 桌面、移动、适应、缩放、滚动 | 视口状态/实例覆盖 | PASS | NOT_APPLICABLE | PASS（1440/1200/390） | PASS | Renderer、视觉编辑器与真实截图 |
| WS-10 | 面板 | 左侧库、右侧 Inspector 展开/收起 | 本地工作区状态 | PASS | NOT_APPLICABLE | NOT_APPLICABLE | PASS | Inspector 折叠状态测试 |
| WS-11 | 保存 | 保存当前装修草稿、成功、失败、重试 | 草稿 PageDocument | PASS | PASS | PASS（直接） | PASS | 草稿恢复/离开保护测试 + 真实 MySQL |
| WS-12 | 离开保护 | 页面切换、关闭/导航前提示 | 脏状态 | PASS | NOT_APPLICABLE | NOT_APPLICABLE | PASS | `editor-leave-guard.admin.spec.ts` |
| WS-13 | 当前画布预览 | 进入、退出、双端、长页和 CTA | 当前内存 PageDocument | PASS | NOT_APPLICABLE | PASS（直接 1920×1200） | PASS | `page-document-runtime-sync.spec.ts` + 真实 UI |
| WS-14 | 草稿预览 | 加载、失败、重试，不回退示例种子 | 已保存草稿 | PASS | PASS | PASS（共享读取链） | PASS | 草稿预览失败恢复测试 + 真实刷新回显 |
| WS-15 | 发布 | 确认、校验、进行中、成功、失败、安全重试 | 发布 revision/快照 | PASS | PASS | PASS（直接） | PASS | 发布校验与真实闭环 spec |
| WS-16 | 权限 | 未登录、EDITOR、ADMIN、SUPER_ADMIN | Auth capability | PASS | PASS | PASS（临时 SUPER_ADMIN 直接；其余角色分层） | PASS | `admin-auth-store-capabilities.spec.ts` |
| WS-17 | 并发 | 409、`expectedUpdatedAt`、保留用户内容 | 乐观锁 | PASS | PASS | PASS（真实请求携带版本） | PASS | `page-revision-optimistic-lock.spec.ts` |
| WS-18 | revision | 恢复、丢弃语义、历史快照不改写 | revision 指针 | PASS | PASS | NOT_APPLICABLE（未执行破坏性丢弃） | PASS | 服务目标测试；真实丢弃未执行 |
| WS-19 | 公开读取 | 加载、未发布、无效文档、失败、重试、撤销资格 | published snapshot | PASS | PASS | PASS（匿名直接） | PASS | `page-document-runtime-sync.spec.ts` + 真实匿名 API |
| WS-20 | 草稿隔离 | 发布后继续编辑不泄漏到公开页面 | draft 与 published snapshot | PASS | PASS | PASS（直接） | PASS | 服务快照隐私测试 + 真实多请求时序 |
| MED-01 | 素材选择 | 打开、加载、空、失败、重试、选择、更换、清除 | 稳定素材引用/URL | PASS | PASS | PASS（共享 PageDocument） | PASS | Inspector/媒体 fixture |
| MED-02 | 素材上传 | 上传入口、失败反馈、返回素材选择 | 媒体 API | PASS（Mock） | PARTIAL | NOT_RUN（未调用真实外部存储） | PARTIAL | Mock 不冒充真实外部存储；不阻断本地 PageDocument 闭环 |
| OBJ-01 | 商品对象 | 搜索、分页、选择、去重、排序、无效引用 | 稳定商品 code | PASS | PASS | PASS（共享 PageDocument） | PASS | 商品引用字段测试 |
| OBJ-02 | 分类对象 | 加载、选择、排序、停用和缺图 | 稳定分类 ID/code | PASS | PASS | PASS（共享 PageDocument） | PASS | 分类引用字段测试 |
| OBJ-03 | 门店/预约/服务/活动 | 专用结构化字段、固定业务区、失败降级 | 结构化引用/实例配置 | PASS | PASS | PASS（共享 PageDocument） | PASS | booking、businessRegion、发布校验测试 |
| LINK-01 | 行动链接 | 无、商品、分类、站内页、HTTPS 外链 | 互斥 link target | PASS | PASS | PASS（共享 PageDocument） | PASS | link target 与公开 Renderer 测试 |
| TPL-01 | 顶部模板设计 | 进入独立模板工作区，不由模板卡误触发 | TemplateEditorSession | PASS | PASS | NOT_APPLICABLE | PASS | `template-internal-editor.spec.ts` |
| TPL-02 | 模板目录 | 加载、空、失败、重试、旧固定模板只读 | 模板目录 | PASS | PASS | NOT_APPLICABLE | PASS | 模板内部编辑测试 |
| TPL-03 | V2 结构编辑 | 选择、新增、改名、排序、换父级、复制、隐藏、删除 | 模板草稿节点树 | PASS | PASS | NOT_APPLICABLE | PASS | `dynamic-template-foundation.spec.ts` |
| TPL-04 | V2 视觉编辑 | 双端几何、拖动、缩放、键盘、层级、焦点、文字、间距 | 模板草稿几何 | PASS | PASS | NOT_APPLICABLE | PASS | 动态模板与视觉编辑器测试 |
| TPL-05 | 模板草稿 | 保存、恢复、另存副本、导入导出、撤销与预览隔离 | TemplateEditorSession | PASS | PASS | NOT_APPLICABLE | PASS | 动态模板基础测试 |
| TPL-06 | 版本升级 | 兼容槽位迁移、不兼容整笔中止、旧页面不改写 | 精确模板版本 | PASS | PASS | NOT_APPLICABLE | PASS | 版本来源和升级测试 |
| TPL-07 | 激活 | 只读预检、失败关闭 | 动态模板激活记录 | PASS（只读） | PASS（隔离） | NOT_RUN（正式激活明确禁止） | PASS（授权内） | 未执行正式激活 |

## 6. 端到端链路矩阵

| 链路 | 当前直接证据 | 缺失证据 | 状态 |
| --- | --- | --- | --- |
| 编辑 → PageDocument | Chromium 中控件写入正确实例和路径 | 无 | PASS（UI-MOCK） |
| PageDocument → 保存草稿 | 请求载荷、成功/失败/重试、服务 DTO、真实 MySQL 写入 | 无 | PASS（分层 + REAL-API） |
| 保存 → 刷新回显 | 确定性 UI 恢复、服务语义、真实页面刷新后 Inspector 与画布回显 | 无 | PASS（分层 + REAL-API） |
| 当前画布 → 当前预览 | 同一内存文档、桌面/移动解释一致 | 无 | PASS（UI-MOCK） |
| 草稿 → 独立预览 | 读取失败不伪装为空草稿，可重试；真实保存后刷新读取同一草稿 | 独立预览路由未单独对真实 API 截图 | PASS（分层，共享读取链） |
| 草稿 → 发布校验 | 客户端/服务端非法引用与合同版本门禁；真实 UI 校验后发布 | 无 | PASS（分层 + REAL-API） |
| 发布 → published snapshot | 服务层事务、版本/哈希/revision 语义；真实 MySQL 快照版本递增 | 无 | PASS（分层 + REAL-API） |
| published snapshot → 公开 Renderer | Chromium 覆盖 6 页、24 模板和失败 fallback；真实匿名 API 与 `/products` | 无 | PASS（分层 + REAL-API） |
| 发布后新草稿 → 公开隔离 | 服务快照测试 + 真实发布后再保存草稿并匿名重载 | 无 | PASS（分层 + REAL-API） |
| 权限/冲突/无效引用 | UI 失败态 + 服务层权限、409、引用校验 + 临时真实 SUPER_ADMIN | 其余角色未创建真实账号，证据来自确定性 UI/SERVICE | PASS（分层） |

## 7. 本轮命令、退出码与证据

| 命令 | 结果 | 层级 |
| --- | --- | --- |
| `npm test` | 退出码 0；完整服务测试 530 passed、4 个真实数据库 skip | CONTRACT + SERVICE |
| `npm run typecheck` | 退出码 0 | CONTRACT |
| `npm run build` | 退出码 0；`templateCatalogGrouping` 约 590.45 kB 的非阻断体积警告 | 构建 |
| `npm run test:content-templates` | 退出码 0 | CONTRACT |
| `npm run test:page-builder-publish` | 退出码 0 | CONTRACT + SERVICE |
| `cd client && npx playwright test tests/editor-visual-redesign-acceptance.spec.ts tests/array-field.spec.ts tests/category-references-field.spec.ts tests/product-references-field.spec.ts tests/booking-editor.spec.ts tests/visual-editor-hero.spec.ts tests/visual-editor-double-poster.spec.ts tests/puck-visual-editor.spec.ts --workers=2` | 退出码 0；34 passed、13 个显式历史能力 skip | UI-MOCK |
| `cd client && npx playwright test tests/editor-draft-recovery.admin.spec.ts tests/editor-leave-guard.admin.spec.ts tests/page-publish-validation.admin.spec.ts tests/page-revision-optimistic-lock.spec.ts tests/admin-auth-store-capabilities.spec.ts tests/page-builder-real-closure.spec.ts --workers=2` | 退出码 0；61 passed、1 个真实环境 skip | UI-MOCK；REAL-API 未运行 |
| `cd server && node --test -r ts-node/register "src/modules/page-modules/**/*.spec.ts"` | 退出码 0；117 passed、2 个真实 MySQL skip | SERVICE |
| `cd client && npx playwright test tests/content-template-previews.spec.ts tests/content-template-renderers.spec.ts tests/content-template-skeletons.spec.ts tests/page-document-runtime-sync.spec.ts --workers=2 --grep-invert "全部模板保留 1920、1200、960、768 与 390 五档截图证据"` | 退出码 0；77 passed | UI-MOCK |
| `cd client && npx tsc --noEmit -p tsconfig.json` | 退出码 0 | CONTRACT |
| `.\scripts\run-store-decoration-real-closure-qa.ps1`（`hc-store-closure-20260830-04`） | 退出码 0；Node 22 server build/final image 与 client image 构建通过；48/48 migration；API health/ready、Web root/proxy 均 200；Playwright 1 passed (4.8s)；`REAL_CLOSURE_RESULT=PASS`；`cleanup_remaining=0` | REAL-API |

第一次 `npm test` 曾因契约核验器只识别 `PuckDocumentRenderer` 直接 `case`、遗漏 `MatureContentTemplateRenderer` 的 10 个间接分发模板而失败。修复核验器调用链后已重新运行到退出码 0；没有删除能力或降低断言。

一次性环境排障过程同样保留为失败证据，没有隐藏：

- `hc-store-closure-20260830-01`：MySQL 本身可用，但编排误等不存在的 Docker health 字段；失败后 `cleanup_remaining=0`。
- `hc-store-closure-20260830-02`：最终运行镜像在 `NODE_ENV=test` 下缺少 dev-only `pino-pretty`；改由同一 Dockerfile 的 Node 22 build 阶段运行测试态服务，仍保留 final image 构建验证；失败后 `cleanup_remaining=0`。
- `hc-store-closure-20260830-03`：API、Nginx 和 UI 登录均成功，但测试页面脚本跨端口直连 3101 被生产 CSP `connect-src 'self'` 正确拦截；改为真实用户路径 `/api` 同源代理，Node 侧匿名请求仍直连 3101；失败后 `cleanup_remaining=0`。
- `hc-store-closure-20260830-04`：完整通过并清理。`-01` 至 `-04` 的容器、卷、网络、镜像随后逐前缀复核均为 0；3101/5175 监听数均为 0。
- 曾误执行 `cd client && npm run typecheck`，因 `client/package.json` 没有该脚本而退出码 1；这是命令名错误，不是代码失败。随后执行声明等价检查 `npx tsc --noEmit -p tsconfig.json`，退出码 0。

浏览器视口包括：`1920×1200`、`1440×900`、`1200×900`、`960`、`768×1024`、`390×844`、Inspector `1280×720` 与 `1600×1000`，另有 `320px / 200%` reflow 检查。

本轮 `REAL-API` 直接视口：编辑器 `1440×900`，当前画布预览 `1920×1200`，公开桌面 `1200×900`，公开移动 `390×844`。新鲜截图：

- `client/test-results/page-builder-real-closure--1b87f-保存、刷新、预览、发布，并保持未发布草稿与公开快照隔离-admin-chromium/page-builder-public-1200x900.png`
- `client/test-results/page-builder-real-closure--1b87f-保存、刷新、预览、发布，并保持未发布草稿与公开快照隔离-admin-chromium/page-builder-public-390x844.png`

两张截图已人工检查：桌面与移动均保持清晰主焦点、正常头尾、单列移动重排，无横向溢出、裁切或控件越界；视觉判断只覆盖该真实 `products + textBanner` 发布实例，不代替 24 模板的 48 张参数化双端截图。

## 8. 当前通过、失败与阻塞

### PASS（限定证据层）

- 6 页面、24 活跃模板、144 允许/禁止组合均进入当前矩阵。
- 24 个 Schema 源文件、26 个注册项和 15 个受支持控件完成结构核对；14 个活跃控件具备浏览器交互证据。
- 画布、预览和公开 Renderer 的确定性数据解释、根结构、顺序、空素材和响应式检查通过。
- 草稿失败恢复、离开保护、权限、发布校验、409、无效引用、公开快照隔离在 UI-MOCK/SERVICE 层通过。
- 当前确认的普通 P1 缺口已修复并重新验证：晚挂载画布选择操作组、Inspector 折叠状态、漂移的 Playwright 断言、`.tsx` Inspector 扫描、成熟 Renderer 间接分发核验，以及真实闭环编排的测试依赖层/CSP 路径。
- 一次性真实 MySQL 环境完成 48 个当前 migration、临时 `SUPER_ADMIN`、真实 UI 登录、拖入 `textBanner`、Inspector 编辑、保存、刷新回显、当前画布预览、发布、匿名公开 API、桌面/移动公开 Renderer 和发布后新草稿不泄漏。
- Mock 与真实证据已分栏：`UI-MOCK` 不冒充 NestJS/MySQL；`REAL-API` 也不外推为生产、正式内容或外部存储验证。
- Node 22 已通过项目固定 Docker 基础镜像完成 server build/final image 与 client production build，消除了宿主 PATH 为 Node 25 的运行版本证据缺口。
- 所有一次性资源已精确删除；现有 `jewelry-server/client/backup/uptime-kuma/mysql` 仍保持原有 3 天运行状态，健康容器继续 healthy。

### FAIL

- 当前新鲜复验中没有仍然失败的普通 P0/P1 项。
- 排障中的三次失败均已列在第 7 节，最终症状均已用更强证据重新运行到通过；没有降低断言、删除能力或放宽 CSP。

### BLOCKED / NOT_RUN（不阻断本轮授权内目标）

1. `MED-02` 真实外部存储上传未执行；本轮只有 Mock 交互和服务边界证据，明确保持 `PARTIAL/NOT_RUN`，没有冒充真实联调。它不影响本轮使用固定、可追溯 QA 素材对 PageDocument 与 Renderer 的闭环验证。
2. 正式动态模板激活、生产发布、生产 migration、真实客户数据、支付/通知/分析第三方服务均未获批且明确未执行；只读预检、隔离服务测试和一次性数据库 migration 不等于这些正式动作。
3. 未发布来源不明草稿仍保持原样且未处理；本轮真实草稿仅存在于已删除的一次性数据库中。

## 9. 一次性真实环境记录与安全复跑

本轮批准并成功执行的边界：

- 唯一前缀：`hc-store-closure-20260830-04`；
- API：`http://127.0.0.1:3101/api`；浏览器：`http://127.0.0.1:5175`；
- 仅在进程内生成 MySQL/JWT/QA 账号秘密，不写文件、不输出实际值；
- 所有交易、合作方写入、动态模板激活、分析、通知、支付和退款开关显式为 `false`；
- 只清理该前缀的容器、网络、卷和镜像，不运行 `compose down`、prune 或任何广域清理；
- 最终 `cleanup_remaining=0`，3101/5175 无监听。

如需再次运行，必须先改为新的唯一 `qaPrefix` 并重新确认同等授权，然后执行：

```powershell
.\scripts\run-store-decoration-real-closure-qa.ps1
```

脚本内部只在精确环境变量和端口边界满足时运行 `client/tests/page-builder-real-closure.spec.ts`；结束时无论成功或失败都会进入精确 `finally` 清理。不得把该命令改成连接现有 `jewelry-*` 容器或生产数据库。

## 10. 完成标准逐项裁决

| # | 完成标准 | 新鲜证据 | 结论 |
| ---: | --- | --- | --- |
| 1 | 所有当前可装修页面进入矩阵 | 6 页、路径、角色、允许模板、固定业务区和 Header 规则 | PASS |
| 2 | 所有活跃模板进入矩阵 | 24/24；机器合同复核 0 缺失、0 重复 | PASS |
| 3 | 所有可见控件和 Inspector 注册字段有交互证据 | 24 Schema 文件、26 注册、14 活跃控件；34 passed + 参数化字段测试 | PASS |
| 4 | 编辑、PageDocument、保存、刷新、预览、发布、公开 Renderer 一致 | 分层矩阵 + `REAL-API` 直接代表链 | PASS |
| 5 | 桌面与移动验证 | 24×2 模板截图；真实公开 1200×900 与 390×844；编辑/预览视口另行覆盖 | PASS |
| 6 | Mock 与真实接口明确分开 | 第 1、5、7 节分层；外部存储明确 NOT_RUN | PASS |
| 7 | P0、P1 全部修复并复验 | 当前无仍失败普通 P0/P1；修复清单与新鲜回归见第 7、8 节 | PASS |
| 8 | 未发布草稿不泄漏公开页面 | 发布后保存“仅存在于未发布草稿”，匿名 API/页面仍只显示已发布标题 | PASS（REAL-API） |
| 9 | 角色权限、失败状态、冲突、无效引用 | 61 passed UI 组 + 117 passed page-module service 组 + 临时真实 SUPER_ADMIN | PASS（分层） |
| 10 | 交付通过/失败/阻塞、命令、退出码、视口、证据路径 | 本文第 2–9 节 | PASS |

裁决：在不处理受保护草稿、不连接现有/生产数据库、不执行 Git 写入、依赖变更、正式激活或生产发布的授权边界内，店铺装修长期目标具备完成所需的新鲜证据。外部存储真实上传和正式动态模板激活继续作为明确 `NOT_RUN` 边界，不应被本结论误读为已联调或已发布。
