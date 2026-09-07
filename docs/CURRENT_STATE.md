# 海川珠宝 — 当前状态

> 最后整理：2026-09-08。本文只保留当前可验证实现、当前差距、当前阻断和证据入口；精确数量、Git 指纹、migration ledger、测试结果和运行状态必须从当前代码、配置、Git 或目标环境重新取得。

## 证据分层

| 层级 | 可以说明 | 不能说明 |
| --- | --- | --- |
| 当前代码与合同 | 路由、类型、Schema、配置、守卫和测试资产存在 | 真实数据库、真实账号、真实内容或生产已经通过 |
| 本轮运行证据 | 指定版本和环境下的实际结果 | 其他版本、其他数据库或未来部署仍然成立 |
| 历史证据 | 当时问题、取舍和回归线索 | 当前事实、当前批准或可重放操作步骤 |

## 当前可验证实现

### 开发与系统入口

- 根、`client/`、`server/` 是三个独立 npm 包，运行要求以各自 `package.json` 和 `docs/DEVELOPMENT_WORKFLOW.md` 为准。
- 客户端是 React/TypeScript/Vite，服务端是 NestJS/TypeScript/Prisma；数据库模型只认 `server/prisma/schema.prisma`。
- 当前共享 HTTP 客户端是 `client/src/services/httpClient.ts`，领域客户端位于 `client/src/services/clients/`；`services/api.ts` 仅作兼容门面。
- Mock 只由显式 `npm run dev:mock` 启用；默认开发和生产构建走真实 API。Mock 结果不构成真实联调证据。

### 身份与请求安全

- 后台员工 `User` 与前台客户 `Customer` 是两套身份域，服务端令牌必须带域标记并由对应守卫校验。
- 浏览器默认使用独立的 `HttpOnly` 会话 Cookie；写请求由共享客户端附加 `hc_csrf` 双提交值，并要求服务端通过精确 Origin 与 CSRF 校验。
- 服务端仍接受受控 Bearer access token 作为兼容入口；它不是浏览器默认持久化方案，不得把 access token 重新写入 `localStorage`。
- 角色、删除、归档和停用语义必须以服务端守卫、Service、Schema 与 `docs/PUBLIC_ACCESS_MATRIX.md` 共同核对，前端隐藏不是权限证明。

### 页面装修与模板

- 公开页面装修唯一使用 Puck `PageDocument`；母模板唯一使用版本化 `TemplateDefinitionV2`，两者共享 Renderer/Repository 基础设施但隔离会话和写入对象。
- `contracts/page-builder/content-templates.contract.json` 定义内置兼容集合与页面规则，`contracts/page-builder/template-definition.schema.json` 定义模板结构能力；合同版本从源合同和生成物核对，实际母模板身份、草稿和不可变正式版本从 `DynamicTemplate` Repository 核对。
- 编辑、保存、发布、历史载入和线上回滚的现行入口见 `docs/page-builder/README.md`；历史专项验收已移入 `docs/archived/2026-09-08-page-builder-evidence/`。
- 未保存草稿、历史页面和版本均受保护。打开、预览、规则整理或归档文档不得改写草稿、发布状态或数据库记录。

### 商品、内容与业务模块

- 商品、分类、库存、咨询、客户、订单、支付、履约、售后、通知和内容模块均有代码入口；入口存在不等于完整经营闭环或生产可用。
- 作品公开主行动由 `SalesMode` 表达；报价通道、客户资格、成交价、库存和订单快照分别遵守 `PROJECT_RULES.md` 与 `docs/DECISIONS.md` D.18–D.20，不能由 API 名称或前端按钮推断。
- 页面公开内容只接受有效已发布快照；无效、未发布或读取失败时必须安全降级，不使用开发 seed 或历史品牌长页伪装正式内容。

## 当前差距与阻断

| 领域 | 当前结论 | 关闭条件 |
| --- | --- | --- |
| 正式内容与品牌 | 正式主体、联系资料、作品、媒体权利、六页内容和 SEO 尚未形成完整签认证据 | 完成输入清单、页面发布和桌面/移动公开验收 |
| 页面装修 | 本地代码与历史专项证据存在，但不能继承旧模板数量、旧 PASS 或旧数据库状态 | 按当前合同在获批环境复核保存、发布、公开渲染和受保护草稿 |
| 数据库 | 仓库 migration 与任何目标数据库的实际 ledger 未在本轮核验 | 明确唯一目标库、只读审计、备份、回退和精确迁移授权 |
| 密码策略 | D.25 已批准新建与重置密码统一为 `6–18` 位且不限制常见弱口令；当前代码仍为会员 `8–64`、员工 `12–64` 并拒绝员工常见弱口令 | 由项目负责人裁决保留 D.25 或批准替代决定；认证代码变更需另行授权并验收 |
| 报价与交易 | D.18–D.20 的业务方向已批准；三报价、客户本人确认、分通道资源门禁、事务转单和完整不可变订单快照尚未形成统一真实闭环 | 补齐未决业务细节并取得 Schema/权限变更授权，再完成真实数据库、权限、失败和并发验收 |
| 外部投递 | 本地通知与 Outbox 资产不能证明 SMTP/SMS/渠道真实送达 | 获批测试对象、目标配置、送达/退信/重试和隐私证据 |
| 英文站 | 安全轨道和数据模型资产不等于正式英文内容与独立发布完成 | 内容、locale 版本语义、发布指针和公开验收闭环 |
| 生产运行 | 未在唯一目标环境核验域名、TLS、Secret、管理员、监控、恢复、制品身份和真实渠道 | 按生产 Runbook 完成证据并由责任人作 Go/No-Go |

### 页面装修方案落地（2026-09-08 源码复核）

目标按[功能规格](page-builder/template-design-framework.md)的九步流程验收。当前新建、发布与插入统一实例不要求加入旧 24 模板清单：新来源按 CUSTOM 保存，页面插入绑定精确版本；旧 key 允许列表与统一实例分支分开处理。证据入口为 [dynamic-templates.service.ts](../server/src/modules/page-modules/dynamic-templates.service.ts) 的 create、[editorPages.ts](../client/src/page-builder/config/editorPages.ts) 与 [HomepageConfig](../client/src/pages/admin/HomepageConfig/index.tsx)。这是源码结论，本轮未运行服务或数据库。

| 当前事实／待验点 | 对应实施与验收 |
| --- | --- |
| [createNewDynamicTemplateDraft](../client/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts)仍自动添加区域、图片、标题、正文；底层已有空白定义能力 | 默认新建改用必要根节点与添加入口；图文组合改为可选。空白草稿按基础校验保存，发布单独提示缺少区域／内容，不要求固定图文组合 |
| [PageSettingsDrawer](../client/src/pages/admin/HomepageConfig/components/PageSettingsDrawer.tsx)提示“不填写也可以直接发布”，但 [collectMetadataIssues](../server/src/modules/page-modules/page-modules.service.ts)将 recommendedForPublication 缺项生成为 error | 统一字段严重级、界面、预检及服务端结果。推荐区分质量建议与真实发布阻断；具体 SEO／责任信息／素材权利政策仍须明确裁决，本轮不通过文档改变发布门禁 |
| [DynamicTemplateInspectorPanel](../client/src/page-builder/template-editor/DynamicTemplateInspectorPanel.tsx)的 simpleSlot 分支跳过完整来源与复制区域；[copy-responsive](../client/src/page-builder/template-definition/operations.ts)当前为整组替换 | 简单图文槽位补同等来源与恢复入口；复制提供适用分组选择，未选值保留，一次历史；恢复取最近成功保存基线，无基线时不伪造默认值 |
| [DynamicTemplateUpgradePanel](../client/src/page-builder/dynamic-template-instance/DynamicTemplateUpgradePanel.tsx)把目录未返回当前身份与“没有新版本”合并为最新状态；目录只列 ACTIVE，但精确历史读取不要求 ACTIVE | 区分已核实最新、可升级、目录未提供及读取失败；保留锁定版本，只在取得证据时标明归档原因，不把目录消失当公开失效 |
| 槽位标签、必填／可编辑／可隐藏、文本限制、发布后目录刷新和升级入口已有源码；完整作者交付检查、条件输入保留、系统内容压力状态及九步实操尚未核验 | 复用既有合同和入口，对照规格补缺；升级验收包含内容映射、双端外观与开放范围变化，不重复建设已有目录或版本系统 |
| [TemplateSlotControls](../client/src/page-builder/template-editor/TemplateSlotControls.tsx)的 CustomRatioInput 在非法输入失焦时恢复旧值；[TemplateContainerControls](../client/src/page-builder/template-editor/TemplateContainerControls.tsx)已有排列、间距与留白控件 | 按规格保留可修正输入并给出就近错误；复用现有控件完成对象属性分组，核验窄属性区排布，不因文档新分组另建字段模型 |

本轮已将功能规格具体化为四区摆放、选择状态、逐步反馈、属性分组和视觉层级。已有浏览器编辑器标签页返回 `ERR_CONNECTION_REFUSED`；本轮未重新启动业务服务、操作真实草稿或完成截图走查，实际易用性与视觉结果仍待运行验证。

**本轮方案的推进顺序**：先完成空白入口与基础编辑反馈，并收敛发布规则冲突；再补齐来源／恢复／选择复制、交付检查和版本状态反馈；最后用一个不在旧清单中的专用新模板走完九步及失败恢复。局部完成按实际证据分别记录，只有必需链路全部验证后才能称主流程完成。涉及合同或发布政策的变更按 WORKFLOW 与 AGENTS 执行；本方案不授权数据库、生产发布或改写既有草稿。旧批次问题继续留在归档，不恢复旧大快照或逐模板派工清单。

## 当前证据入口

- 总体验收状态：`docs/acceptance/feature-completion-matrix.md`。
- 稳定端到端旅程：`docs/acceptance/end-to-end-flow-matrix.md`。
- 页面装修：`docs/page-builder/README.md`。
- 正式输入：`docs/acceptance/V1_CONTENT_PRODUCTION_INPUT_CHECKLIST.md`。
- 发布与恢复：`docs/PRODUCTION_RELEASE_RUNBOOK.md`。
- 动态工作包：`docs/AI_PROGRAM_LEDGER.md`。
- 本次整理前的完整状态快照：`docs/archived/2026-09-08-governance-snapshots/CURRENT_STATE.md`。

开始新任务时只读取相关入口，并用当前代码或运行结果复核；不得把归档中的旧 HEAD、端口占用、数量、测试结果或数据库状态复制回本页。
