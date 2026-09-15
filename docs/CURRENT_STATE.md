# 海川珠宝 — 当前状态

> 最后整理：2026-09-14（完成规则治理本地实现与 Node 22 验证，并区分历史、当前工作树和目标环境证据）。本文只保留当前可验证实现、当前差距、当前阻断和证据入口；精确数量、Git 指纹、migration ledger、测试结果和运行状态必须从当前代码、配置、Git 或目标环境重新取得。

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
- 当前共享 HTTP 客户端是 [httpClient.ts](../client/src/services/httpClient.ts)，商品实现已原样拆入 [productClient.ts](../client/src/services/clients/productClient.ts)，原导出入口保持不变；[api.ts](../client/src/services/api.ts)仍承载订单、客户等 API 实现及 Mock 分支，同时重导出已拆分客户端，尚未收敛为纯兼容门面。
- Mock 只由显式 `npm run dev:mock` 启用；默认开发和生产构建走真实 API。Mock 结果不构成真实联调证据。

### 身份与请求安全

- 后台员工 `User` 与前台客户 `Customer` 是两套身份域，服务端令牌必须带域标记并由对应守卫校验。
- 浏览器默认使用独立的 `HttpOnly` 会话 Cookie；写请求由共享客户端附加 `hc_csrf` 双提交值，并要求服务端通过精确 Origin 与 CSRF 校验。
- 服务端仍接受受控 Bearer access token 作为兼容入口；它不是浏览器默认持久化方案，不得把 access token 重新写入 `localStorage`。
- 角色、删除、归档和停用语义必须以服务端守卫、Service、Schema 与 `docs/PUBLIC_ACCESS_MATRIX.md` 共同核对，前端隐藏不是权限证明。

### 页面装修与模板

- 规则入口已统一到[模板设计唯一标准](page-builder/template-creation-rules.md)，覆盖创建至编辑、默认内容和版本边界；旧执行计划已删除，独立 V2 产品说明已并入总标准，编辑框架降为从属细则。这是文档治理状态，不能据此认定在建功能或真实联调完成。

- 公开页面装修唯一使用 Puck `PageDocument`；母模板唯一使用版本化 `TemplateDefinitionV2`，两者共享 Renderer/Repository 基础设施但隔离会话和写入对象。
- `contracts/page-builder/content-templates.contract.json` 当前只登记 1 个活动的 `hero` 首屏测试样例并定义页面规则；旧固定模板合同与 Renderer 已物理删除。`contracts/page-builder/template-definition.schema.json` 定义模板结构能力；2026-09-11 创建目标已改为[七步预设生成与精调](page-builder/template-creation-rules.md)，版本与默认内容边界见 [模板设计标准 9.1](page-builder/template-creation-rules.md)。合同版本须从源合同和生成物共同核对，实际模板身份、草稿和不可变版本从 `DynamicTemplate` Repository 核对。
- 编辑、保存、发布、历史载入和线上回滚的现行入口见 `docs/page-builder/README.md`；历史专项验收已移入 `docs/archived/2026-09-08-page-builder-evidence/`。
- 未保存草稿、历史页面和版本均受保护。打开、预览、规则整理或归档文档不得改写草稿、发布状态或数据库记录。

### 商品、内容与业务模块

- 商品、分类、库存、咨询、客户、订单、支付、履约、售后、通知和内容模块均有代码入口；入口存在不等于完整经营闭环或生产可用。
- 作品公开主行动由 `SalesMode` 表达；报价通道、客户资格、成交价、库存和订单快照分别遵守 `PROJECT_RULES.md` 与 `docs/DECISIONS.md` D.18–D.20，不能由 API 名称或前端按钮推断。
- 页面公开内容只接受有效已发布快照；无效、未发布或读取失败时必须安全降级，不使用开发 seed 或历史品牌长页伪装正式内容。

## 当前差距与阻断

下表描述整体产品的差距，不直接作为每次升级的全量阻断清单。具体候选按[发布手册](PRODUCTION_RELEASE_RUNBOOK.md)和 [RELEASE_PROFILES](../server/src/common/release/release-profile.ts)选择 `lead-generation` 或 `commerce`，逐项核验本次开放能力、共同安全与运维门禁；英文公开站已按 D.35 退役，不再作为候选能力。发布范围明确不代表目标环境或生产验收已经通过。

| 领域 | 当前结论 | 关闭条件 |
| --- | --- | --- |
| 正式内容与品牌 | 正式主体、联系资料、作品、媒体权利、六页内容和 SEO 尚未形成完整签认证据 | 完成输入清单、页面发布和桌面/移动公开验收 |
| 页面装修 | 本地代码与历史专项证据存在，但不能继承旧模板数量、旧 PASS 或旧数据库状态 | 按当前合同在获批环境复核保存、发布、公开渲染和受保护草稿 |
| 数据库 | 以 `d446e09466dfaffdb5f9cdcfad4ce73f0046a9e8` 为基线的集成候选于 2026-09-12 在 Node 22.23.2 与独立 MySQL 8 空测试库执行 53 个迁移全部成功，六个真实 MySQL 持久化、并发、模板、客户、线索与选款测试全部通过；合成既有库的 51→53 升级、失败阻断与备份恢复演练也通过。任何精确目标库（含生产库）的 migration ledger、存量数据升级与真实回退仍未核验 | 上线前按获批目标库核对备份、migration ledger、数据守卫与既有数据升级，并完成真实回退验收；不得用本地隔离或合成证据替代目标库与生产证据 |
| 密码策略 | 2026-09-11 用户重新确认业务账号新密码统一 `6–18` 位；前后端共享政策已同步，保留现行员工弱口令拒绝和旧密码登录兼容，见下方本地验收 | 本地输入/服务桩与浏览器夹具已验证；真实 API、数据库持久化与生产账号未在本轮验证，不据此改变其他上线阻断 |
| 报价与交易 | D.32 已把中国大陆中文桌面/手机网站列为下一交易目标，但 D.2 继续暂停 `commerce`、客户交易和支付网关；三报价、客户本人确认、分通道资源门禁、事务转单和完整不可变订单快照尚未形成统一真实闭环 | 在现有授权内完成本地实现与验证；涉及破坏性 Schema、权限扩大、真实渠道、资金或目标环境时取得精确批准，再完成真实数据库、权限、失败、并发、退款和对账验收 |
| 外部投递 | 本地通知与 Outbox 资产不能证明 SMTP/SMS/渠道真实送达 | 获批测试对象、目标配置、送达/退信/重试和隐私证据 |
| 英文站 | D.35 已退役公开英文路由、切换、编辑发布和 SEO 输出；历史数据结构仅保留兼容与审计 | 发布候选验证 `/en` 只跳转中文、公开接口拒绝 `locale=en`，且中文首访不请求英文事实 |
| 生产运行 | 未在唯一目标环境核验域名、TLS、Secret、管理员、监控、恢复、制品身份和真实渠道 | 按生产 Runbook 完成证据并由责任人作 Go/No-Go |

### 页面装修与模板设计（2026-09-08 主流程源码复核；2026-09-10 合同范围更新）

目标行为与分轨验收见[功能规格](page-builder/template-design-framework.md)和[模板创建规则](page-builder/template-creation-rules.md)。2026-09-11 规则整理阶段已确定：新建改为七步选择、实时方案预览、确认生成、画布/属性精调；区分单一整体设置与可重复区域/图片/文字，列表包含独立模板复制。页面实例仍绑定精确模板版本，持久化目录与未保存会话分开。代码内仅保留 `hero` 首屏测试样例；它不是普通动态模板目录项，页面装修组件库只展示 Repository 中符合条件的已发布模板。不恢复旧固定模板，也不自动清理数据库记录。2026-09-12 已移除页面只能有一个首屏主舞台的数量限制：同一页面可添加、复制、升级和发布多个 `primary-stage`，公开 Renderer 按页面顺序保留全部有图实例，只有第一个承担页面级标题与首图加载优先语义。2026-09-11 后续创建增量已补齐推荐、图片形态与比例、内容角色、风格数值、Logo 去重及生成质量检查；以下本地证据不等于真实接口或生产验收。

2026-09-11 的规则补充将模板设计明确为“创建基础模板 → 按对象微调 → 检查并保存”，七步仅属于第一阶段。第二阶段的功能清单、快捷值与精确输入、作用范围、恢复及保存检查已统一到[总标准第 9.2～9.4 节](page-builder/template-creation-rules.md#92-第二阶段微调功能清单)；[第 9.5 节](page-builder/template-creation-rules.md#95-功能区域默认呈现就近操作与返回路径)进一步定义四区默认内容、属性顺序、局部添加、异常状态和返回路径。该日期对应批次只更新了规则及验收，未修改功能代码、也未运行新增区域交互与微调场景；它不是当前工作树的范围声明。下列历史本地证据仍只证明各自覆盖范围，不能外推为新清单全部通过。

| 当前代码事实 | 与现行规格的差距／待验点 |
| --- | --- |
| [HomepageConfig](../client/src/pages/admin/HomepageConfig/index.tsx)使用同一工作台入口，但页面与模板分别使用自己的控制器、工具栏、dirty 状态和发布动作；当前实现以 1440px 为停靠/覆盖层边界，宽屏侧栏采用最小可用宽度，画布消费剩余空间 | 已在 Mock Chrome 中覆盖 1200、1366、1440、1600、1920px 的模式切换和计算宽度；仍需结合真实运营内容复核长树、焦点、滚动和溢出，代码与自动化存在不等于真实运营体验已验收 |
| [TemplateEditorLibrary](../client/src/page-builder/template-editor/TemplateEditorLibrary.tsx)在模板模式显示新建、搜索、草稿、已发布和回收站，在页面模式提供发布模板的点击/拖入；[DynamicTemplateStructurePanel](../client/src/page-builder/template-editor/DynamicTemplateStructurePanel.tsx)承载区域和槽位工具 | 现有“第一区管理模板、第二结构区添加节点”的分工符合现行规格，应作为保留基线；仍需验证空、加载失败、无权和草稿不可插入状态 |
| [创建向导](../client/src/page-builder/template-creation/NewTemplateRecipeModal.tsx)、[预设](../client/src/page-builder/template-creation/presets.ts)和[生成器](../client/src/page-builder/template-creation/generateTemplateFromRecipe.ts)按唯一标准补齐选项与明确数值；新配方使用 presetVersion 2，继续读取版本 1；主副图、单内容卡片和全幅覆盖有独立几何，空间不足保留输入并阻止创建，内部布局高度跟随画布 | 2026-09-11 本地 41 项目标检查通过：19 项生成器（含十布局 × 八画幅 × 图片组合）＋8 项向导＋9 项 Renderer＋4 项编辑保存链路＋1 项媒体引用。实际浏览器覆盖 1600px 创建、390px 向导、1920px/390px 十布局边界与异常覆盖；保存、重开和失败态使用自有 API Mock。两端类型检查和 contracts:check 通过；未做真实数据库、发布或生产验证，不据此宣称全部模板功能验收完成 |
| [DynamicTemplateInspectorPanel](../client/src/page-builder/template-editor/DynamicTemplateInspectorPanel.tsx)区分设计和页面开放范围；根属性显示名称、视觉职责和整体设计，目录资料按需展开；只读字段表单共用页面描述符，展示顺序、必填、可编辑及可手动隐藏规则 | 2026-09-11 本轮核对；240px 属性区、字段定位零写入及规则事务有确定性 UI 覆盖，实际运营可理解性仍需实操验证 |
| [DynamicTemplateToolbox](../client/src/page-builder/template-editor/DynamicTemplateToolbox.tsx)按明确父级和前后位置添加；常用布局与空白画布共用 [templateLayoutStarters](../client/src/page-builder/template-editor/templateLayoutStarters.ts)，生成具名分组和字段，一次撤销还原 | 2026-09-11 本轮核对；已覆盖四种布局的合法结构、失效/锁定目标、1200px/1600px 入口及卡片三端实际排列；不支持的嵌套明确禁用 |
| 画布普通选择常显对象尺寸；间距通过操作栏显式进入，四边留白和同级间距在该状态显示名称、数值、单位与方向，并支持拖动、方向键和精确输入；列分隔线显示相邻列比例，尺寸柄在悬停或聚焦时说明调整轴与固定尺寸影响 | 2026-09-11 本轮核对；隔离画布验证 50%/100% 缩放、Esc 取消、单次撤销、非法输入保护和 28px 列线命中，主路由覆盖 1200px/1600px/1920px；尚未替代真实运营人员实操验收 |
| [TemplateContainerControls](../client/src/page-builder/template-editor/TemplateContainerControls.tsx)已有横/纵/分列与间距；[operations](../client/src/page-builder/template-definition/operations.ts)和 [DynamicTemplateToolbox](../client/src/page-builder/template-editor/DynamicTemplateToolbox.tsx)现会在 `Row` 内把纵向组解析为合法 `Column`，不再因固定生成 `Stack` 形成建组死路 | 2026-09-12 已用真实编辑器组件从空白模板建立单区域“图片组 + 标题/正文/按钮文字组”，经结构菜单把标题跨组移动并保留 nodeId/slotId；桌面左右、手机上下均保持图片组在文字组前，1200/1600 工作台无横向溢出，保存请求与重载回读保留结构和顺序。当前证明的是同一语义顺序在双端按不同排列呈现；不把独立的逐端子项顺序外推为已支持 |
| [TemplateEditorToolbar](../client/src/page-builder/template-editor/TemplateEditorToolbar.tsx)与制作引导共用首次发布检查入口；[TemplateWorkspaceController](../client/src/page-builder/template-editor/TemplateWorkspaceController.tsx)维护明确确认、冻结快照、部分成功和不确定响应；保存草稿与发布检查分离 | 2026-09-11 本轮核对；目标状态机与自有 API 夹具验证首次检查零写入、明确确认和同一快照约束；真实服务端发布及页面消费仍需独立联调 |
| [operations](../client/src/page-builder/template-definition/operations.ts)继续以 `REQUIRED_SLOT_CANNOT_DELETE` 阻止旁路删除必填槽位及其所属容器；[DynamicTemplateStructurePanel](../client/src/page-builder/template-editor/DynamicTemplateStructurePanel.tsx)对槽位自身提供“取消必填并删除”的明确原子确认，对包含必填槽位的容器拒绝删除后按状态定位必填设置或结构锁定来源 | 2026-09-12 确定性真实组件路径已验证取消确认零提交、原子删除单步撤销、字段上下文与锁定来源定位；随后一次性 `hc-store-closure-20260912-39` 环境以真实 MySQL、53 个 migration、NestJS、生产 React/Nginx 和 Chrome 验证：必填后代阻断容器删除、定位并取消必填、保存前零模板写入、删除后一次撤销恢复同一 nodeId/slotId/父级顺序且 required 保持 false，并经真实 POST、重载重开和 GET draft 回读；结束 `cleanup_remaining=0`。固定业务角色、上级锁和服务端门禁仍不得由该入口绕过 |
| 模板预览已有默认、空内容、长文本和缺图场景；槽位标签、必填/可编辑/可隐藏、文本限制、发布后目录刷新及页面升级入口已有源码 | 2026-09-12 目标浏览器测试已证明系统试排内容只留在当前会话，驱动画布与压力预览但不进入模板历史、模板保存/发布请求或公开 Renderer；创建确认预览也保持零写入。完整模板交付检查与页面实际可用性仍须按具体候选和目标接口分别核对 |
| [DynamicTemplateInspectorPanel](../client/src/page-builder/template-editor/DynamicTemplateInspectorPanel.tsx)已有布局值来源、适用设计组选择、逐字段复制预览和保存基线恢复；2026-09-12 修正旧 Schema 使用当前断点投影计算计划、误把桌面/手机真实差异判为空的问题，复制与来源判断改读会话原始定义 | 确定性真实组件测试已覆盖未选值保留、取消零提交、确认一步历史并可撤销、按保存基线恢复及本地保存重开；随后一次性 `hc-store-closure-20260912-39` 环境以真实 MySQL、53 个 migration、NestJS、生产 React/Nginx 和 Chrome 验证 Schema 1 定义经服务端 Repository 创建与读取、仅复制“图片显示”组、真实 PATCH 保存、revision 2 API 回读和页面重载重开，移动端图片比例/适配/焦点已复制而未选尺寸仍保留 82%；结束 `cleanup_remaining=0`。Schema 3 原生分组复制另有既有目标测试；该证据不等于目标环境或生产上线 |
| [DynamicTemplateUpgradePanel](../client/src/page-builder/dynamic-template-instance/DynamicTemplateUpgradePanel.tsx)区分已核实最新、可升级、目录未提供和读取失败；目录只列 ACTIVE，但精确历史读取不要求 ACTIVE | 2026-09-12 确定性真实编辑器页面 + Playwright 自有 API 夹具验证四类状态、失败后重试发现 v2、确认升级零写入、显式保存一次页面请求及重载回读 v2，完整目标文件 57 项通过；随后一次性 `hc-store-closure-20260912-37` 环境以 53 个真实 migration、MySQL 8、NestJS、生产 React/Nginx 和 Chrome 完成 7/7 闭环，覆盖 v1/v2 精确版本、取消升级零写入、升级后真实保存/重载/API 回读、发布快照及双端公开 Renderer，结束 `cleanup_remaining=0`。该证据不等于目标环境或生产上线 |
| “发布页面”是客户前台更新的唯一入口，保存草稿与母模板发布均不推进 `publishedRevisionId`；缺图、缺文案、替代文字、占位内容和 SEO 完整度只提醒，页面实例未明确上传当前可达图片时公开 Renderer 隐藏整个模板。整站资料和逐素材来源记录不冻结页面发布，危险地址、未纳管外链、缺失文件、结构、引用、权限、精确版本与乐观锁仍失败关闭 | 2026-09-12 本地服务端构建与 59 项目标回归、客户端构建、44 项发布按钮回归（另 1 项按环境跳过）、2 项公开 Renderer 及 2 项图片显隐规则夹具通过，合同检查一致；本机后端重启后健康检查 200。真实数据库写入、当前 5173 编辑会话和生产未在本轮验证，素材入库一次登记与继承仍未实现 |
| [TemplateSlotControls](../client/src/page-builder/template-editor/TemplateSlotControls.tsx)的 `CustomRatioInput` 保留无效待修正文案并就近报错；有效 Enter/失焦提交一次，Escape 取消，非法失焦不改定义；[TemplateWorkspace.css](../client/src/page-builder/template-editor/TemplateWorkspace.css)把错误固定在输入列 | 2026-09-12 已在 240px 属性区真实组件夹具验证非法/合法 Enter、失焦、Escape、零历史写入、错误不溢出及键盘路径。该控件只服务旧 Schema 属性面板；Schema 3 继续使用原生设计控件，不另建字段模型 |

现行规格已更新为七步预设生成、实时方案预览、单一设置/重复添加与自由精调，并保留页面装修、版本交接和交互验收。此前常用布局和画布间距/尺寸提示的本地或夹具证据只覆盖当时范围，不能外推为新创建流程通过；规则整理本身不证明实现完成。创建与所述编辑链路已有本地目标证据；全部精调能力、真实运营实操、保存/发布联调和公开页面消费仍须分别取得证据，生产不在本轮范围。

### 决策与变更治理（2026-09-14）

- `docs/DECISIONS.md` 的 D.2、D.14、D.28–D.34 已登记稳定状态；D.32–D.34 还在各自章节内登记机器可读的适用范围、启用条件、替代关系和验证入口。`npm run test:decision-governance` 验证这些结构元数据、所属章节、重复标记和 D.14 的唯一退役标识，不匹配精确中文句式、源码形状、文件路径或用户名；能力是否实现仍由目标测试、真实界面、接口和环境证据判断。
- D.32 的中文交易版是 `TARGET`，当前 `commerce` 与真实资金仍为 `PAUSED`。D.33 的单人 `SUPER_ADMIN` 显式自审已实现独立确认、实时角色复核、精确提交 revision、内容哈希、更新时间冲突保护、专用审计及发布/回滚/SEO 再验证；普通 `ADMIN/EDITOR` 不能使用例外。D.34 的 baseline 保留私有 SBOM、BuildKit provenance、内容寻址 manifest 与同 SHA 完整质量证明；Cosign/SLSA 签名、独立生产证据和公共透明日志只在 `high` 档运行。
- `.github/CODEOWNERS` 仅用于提出建议复核。文件存在不证明远端启用了 Code Owner 强制审核或 Quality Gate，也不把仓库管理员配置变成本轮规则治理的人工前置条件；如候选需要强制治理，再用远端实际设置取证。
- 当前工作树包含 56 个 migration 目录；下方 53 个 migration 和 51→53 演练是 2026-09-12 指定候选的历史运行证据，不可外推到当前新增 migration、任一目标库或生产。
- 2026-09-14 本轮在 Node `22.12.0` 下完成本地规则治理验证：根 `npm test`、lint、前后端 typecheck 与前后端生产构建均退出 0；服务端测试为 1060 通过、15 项因未提供各自显式真实库变量而跳过，发布供应链目标套件 155 项通过。另以一次性回环 MySQL 8 空库应用当前 56 个 migration 并执行已登记六类真实数据库测试，6/6 通过；页面自审/SEO 服务端目标测试 26 项和 Mock Chrome 自审、发布、响应式及 390×844 长中文/焦点目标场景 5 项通过。客户端构建仍报告 `EditorWorkbench` 大于 500 kB 的非阻断警告。以上都是当前本地工作树证据，不是远端 Quality Gate、目标数据库、生产 evidence 或上线证明。

## 数据库安装验证（2026-09-12）

- 候选与环境：集成候选基线 `d446e09466dfaffdb5f9cdcfad4ce73f0046a9e8`；Node.js `22.23.2`；一次性 MySQL 8 镜像摘要 `sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`；空库 `haichuan_ci_real_tests`，仅绑定本机回环随机端口，与业务容器和数据卷隔离。
- 原问题为 [交易成熟度 CHECK](../server/prisma/migrations/20260906160000_close_trade_maturity_invariants/migration.sql) 引用仍受 `ON UPDATE CASCADE` 外键控制的列，MySQL 8 返回 P3018 / 3823。修复未改写该历史迁移，而是新增排序在其之前的 [前向准备迁移](../server/prisma/migrations/20260906150000_prepare_payment_plan_check_constraints/migration.sql)，先删除并以 `ON UPDATE RESTRICT` 重建两条来源外键；Schema 同步显式声明 `onUpdate: Restrict`。
- 在不含 `.env`、依赖独立安装并独立生成 Prisma Client 的副本中设置 `REAL_MYSQL_TEST_ISOLATED=1` 与显式测试库 URL，运行 `server/scripts/run-real-mysql-tests.cjs`：53 个迁移全部成功，`prisma migrate status` 报告最新；隐私处置、交易并发、模板版本/页面保存发布回读三项真实 MySQL 测试通过，0 失败、0 跳过。
- 在同一基线的集成工作树中以显式隔离 URL 覆盖本地配置，再次对一次性空库执行 53 个 migration，并串行运行上述三项以及客户身份隔离、线索工作流、选款咨询幂等三项真实 MySQL 测试：共六项通过，0 失败、0 跳过；测试容器随后按精确名称删除。
- `server/scripts/database-upgrade-rehearsal.mjs` 在 tmpfs MySQL 8 中验证合成既有库的 51→53 健康升级、数据保留与备份恢复，并验证非法支付计划、空白/重复邮箱、SKU 重复/索引漂移及 migration checksum 篡改均在预期边界失败关闭；容器和临时目录均已删除。该演练不覆盖目标库数据量、并发写入、锁等待、生产时长或真实回退时长。
- 数据库实查确认 `payment_plans_order_id_fkey` 与 `payment_plans_quotation_version_id_fkey` 的更新和删除动作均为 `RESTRICT`，`payment_plans_source_check`、`payment_plans_total_amount_check` 与 `customers_email_key` 均已落库。客户资料迁移在首个持久 DDL 前以临时表 CHECK 拒绝空白邮箱和 `LOWER(TRIM(email))` 后的重复值，不自动合并或覆盖存量资料。
- 上述结果只证明该集成候选在一次性空测试库的安装、六个已登记真实测试及合成既有库演练；任何精确目标库（含生产库）的 migration ledger、备份、存量数据、升级和真实回退，以及域名、外部服务与公开流量均未核验，不能据此宣布目标库迁移、生产迁移或上线完成。

## 密码长度统一验证（2026-09-11）

- 范围：会员注册/重置、员工注册/新建/改密、微信新会员设置密码、首管理员与 Demo 初始化输入统一 `6–18` 位。前端由 [accountPasswordPolicy](../client/src/config/accountPasswordPolicy.ts) 消费，服务端由 [staff-password-policy](../server/src/modules/users/staff-password-policy.ts) 及其 DTO/服务/CLI 消费；既有登录、绑定和注销确认继续校验历史凭据，不迁移或重置既有哈希。D.25 已按本次明确授权更新。
- Node.js `22.23.2` 下，主任务在 `server/` 执行 `node --test -r ts-node/register src/modules/users/staff-password-policy.spec.ts src/modules/customers/customer-password-policy.spec.ts src/cli/bootstrap-admin.spec.ts src/cli/demo-seed-policy.spec.ts src/modules/auth/auth.service.spec.ts`：22 项通过、0 失败、0 跳过。覆盖 5/6/18/19 位、员工弱口令拒绝、真实 bcrypt 比较、旧长密码登录/绑定和初始化安全拒绝；数据库、短信与会话存储使用服务桩，不是真实数据库联调。
- 同轮代码子任务在服务端运行 `tsc --noEmit --incremental false`、客户端运行 `tsc --noEmit --project tsconfig.json --incremental false`，均退出 0。
- 主任务运行 Playwright：`public-access.spec.ts` 的会员注册桌面/手机及两项密码重置共 4 项，在隔离 `5177` Mock 应用模式通过；`admin-auth-store-capabilities.spec.ts` 的员工新建/重置长度与编辑 payload 场景在隔离 `5176` development 前端 + route Mock 通过。后台场景初次使用内建 Mock 模式时被 Demo 员工数据绕过夹具，失败于列表加载；改用正确模式后原断言通过，没有放宽测试。
- 此证据仅证明当前本地实现与上述测试范围。未执行真实账号创建、改密、外部发送、数据库迁移或生产部署；用户开发端口 `5173` 未被本轮测试使用。

## 当前证据入口

- 总体验收状态：`docs/acceptance/feature-completion-matrix.md`。
- 稳定端到端旅程：`docs/acceptance/end-to-end-flow-matrix.md`。
- 页面装修：`docs/page-builder/README.md`。
- 正式输入：`docs/acceptance/V1_CONTENT_PRODUCTION_INPUT_CHECKLIST.md`。
- 发布与恢复：`docs/PRODUCTION_RELEASE_RUNBOOK.md`。
- 动态工作包：`docs/AI_PROGRAM_LEDGER.md`。
- 本次整理前的完整状态快照：`docs/archived/2026-09-08-governance-snapshots/CURRENT_STATE.md`。

开始新任务时只读取相关入口，并用当前代码或运行结果复核；不得把归档中的旧 HEAD、端口占用、数量、测试结果或数据库状态复制回本页。
