# 海川珠宝 — 当前状态

> 最后整理：2026-09-03 | 当前实现结论来自工作树源码、配置、机器合同、本轮统一工程门禁，以及明确隔离的临时浏览器/MySQL/Nest 验收；既有运行结果在文中按时间与证据范围单列。本轮未连接现有开发数据库、目标数据库或生产环境。本文件记录易变化事实，不构成产品方向或操作授权。

## 证据分层（必须按此阅读）

| 层级 | 可以说明什么 | 不能说明什么 |
| ---- | ------------ | ------------ |
| **A. 当前可验证实现** | 当前工作树中的路由、组件、Schema、配置、合同与测试资产确实存在 | 真实浏览器结果、目标数据库兼容、真实业务闭环或生产可用 |
| **B. 与现行方向或专项决定的实现差距** | 引用方向基线或稳定专项决定后，说明当前尚未实现、接线或验证的部分 | 在本文件重新陈述、扩展或裁决目标 |
| **C. 仅代码推断 / 待真实验证** | 根据当前调用链可预期的行为，或此前运行快照暴露的风险 | 当前进程、真实数据、浏览器、支付或生产环境已经复现 |

本文件每项结论必须落入以上一层；源码结构不得写成浏览器验收，实现差距不得反向定义项目方向，历史运行结果不得冒充本轮新鲜证据。

## A. 当前可验证实现

### 开发与实现入口（2026-08-20 核对）

- 当前工作区为 `G:\网站搭建2`，前端路径别名 `@/` 指向 `client/src/`。
- 本地开发端口所有权：宿主机后端 `3000`，Vite 前端 `5173`；容器后端仅映射 `127.0.0.1:3002`，完整容器栈通过 `:80` 访问。运行说明见 `docs/DEVELOPMENT_WORKFLOW.md`，决策原因见 `docs/DECISIONS.md` A.12。
- 前端共享传输、鉴权和错误拦截器当前位于 `client/src/services/httpClient.ts`；领域客户端逐步收敛到 `client/src/services/clients/*`，`client/src/services/api.ts` 暂作兼容门面。不得在迁移剩余消费者时建立第二套传输或鉴权事实源。
- 响应解包入口为 `client/src/utils/unwrap.ts`；商品图选取入口为 `client/src/utils/productImage.ts`；材质标签入口为 `client/src/utils/material.ts`。
- Mock 只由 Vite `mock` mode 显式开启，入口为 `npm run dev:mock`，消费点为 `client/src/services/mockData.ts`；默认开发与生产构建均走真实 API。

### 认证、状态与数据生命周期（2026-08-20 核对）

- 后台员工使用 `User`，前台客户使用 `Customer`；当前后台角色为 `SUPER_ADMIN / ADMIN / EDITOR / CUSTOMER_SERVICE / WAREHOUSE / SALES_CONSULTANT / FINANCE`。
- 两域当前共用 `JWT_SECRET` 并通过 payload `type` 区分；`JwtAuthGuard`、`RolesGuard`、`ThrottlerGuard` 当前注册为全局 Guard。是否拆分密钥仍是 `docs/DECISIONS.md` D.6 的待决事项。
- 前端全局状态当前沿用 Zustand；具体 Store、权限键和 Feature Flag 导出必须从当前代码复核。
- `Product` 当前使用 `deletedAt` 软删除；`Category` 当前以 `isActive` 停用，`deletedAt` 尚未形成有效语义。终局语义仍是 `docs/DECISIONS.md` D.5 的待决事项。
- 项目当前没有统一 Prisma 软删除 middleware/extension；涉及删除过滤时必须沿当前查询链逐项核对，不得凭此现状推断未来实现。

### 页面装修与公开路由源码（2026-08-31 核对）

- Puck `PageDocument` 是唯一活跃装修体系，贯穿页面模块后端、编辑器、预览、公开 Renderer、区块组件和适配器。
- `contracts/page-builder/content-templates.contract.json` 当前登记 24 个内置模板和 6 条 `pageRules`；它们在现行产品模型中是起步/兼容来源，不是全部未来母模板的目录。当前合同仍为 `contractSchemaVersion=8`、`registryVersion=18`、`publicationGateVersion=3`，注册 24、活跃 24；六页的固定业务区、内容位置和导航模式继续由 `pageRules` 裁决。可新建和发布的统一母模板结构由 `template-definition.schema.json` 约束，实际模板身份、草稿和版本来自 `DynamicTemplate` Repository；本条数量只是 2026-09-03 工作树实现快照，不构成固定产品目标。
- 页面装修与模板设计复用同一顶部动作外壳、四栏框架、模板目录卡片和基础字段控件，但保持 `PageDocument` 与 `TemplateEditorSession`、页面撤销栈与模板撤销栈、页面发布与模板版本链路严格隔离。只有顶部“模板设计”页签能进入母模板工作区；页面模板卡只添加页面实例。
- 2026-08-30 浏览器回归确认：两种模式的设备切换、模式页签、撤销/重做、预览、保存、更多和发布均由共享控件渲染；1600×1000 同视口逐控件的 `x/y/width/height` 差异不超过 1px，空模板的保存、更多和发布保持独立禁用反馈。图层/模板结构与页面/模板属性的收起和展开由同一 `WorkspacePanelCollapseButton` 渲染；页面和模板分别持有状态，模式往返后各自恢复，1600px 固定栏与 1024px 响应式栏均收敛到 40px。媒体上传/链接、九宫格焦点、数字、开关和恢复默认也由共享字段组件渲染；V2 母模板焦点通过适配器写 `objectPosition`，页面实例仍写当前设备稀疏百分比覆盖，恢复默认分别删除模板节点规则或页面实例覆盖，没有合并业务状态。模式页签可用方向键切换焦点，模板搜索、目录卡片、结构树、隔离画布 iframe 与属性字段均可由键盘聚焦。该层使用本地拦截 API，证明界面调用顺序、阻断、发布重试和会话隔离，不替代真实 HTTP、真实数据库或生产验收；本轮变更后的新鲜结果以最终验证记录为准。
- 独立模板工作空间的画布拖动覆盖只在 iframe 本地预览，手势提交时才写一次模板 store；对象拖动开始会以 `preventScroll` 聚焦当前可编辑节点，使 Esc、方向键和撤销快捷键留在模板画布会话中。该行为已覆盖八方向缩放、取消恢复、桌面/移动独立构图和 Puck 历史无额外性能警告；页面工作空间不复用这条内部对象直接操作链。
- 统一 V2 已接入服务端草稿、不可变版本、稳定 `templateId/nodeId/slotId`、精确页面实例、稀疏覆盖与同源校验。模板设计“发布模板”只保存并校验独立草稿、创建不可变 `DynamicTemplateVersion`、推进模板自身 `publishedVersion` 与下一版草稿，并记录 `TEMPLATE_VERSION_PUBLISHED`；它不读取或修改 `PageDocument`、`PageDocumentRevision`、`PageScheme` 和既有页面实例。运行时 `activation-impact` / `activate` 控制器、服务、客户端调用和配置开关已删除；历史 activation migration、Prisma ledger 模型与 Gate B 纯内存规划器仅为数据库兼容审计保留，不是产品或运行能力。当前代码与隔离测试不能证明目标环境数据库或生产配置。
- 默认语言 `PageDocument` 已在代码与待执行 migration 中增加 nullable `publishedRevisionId`；页面发布创建不可变 `PageDocumentRevision` 后设置该指针，Public 与 `release-preflight` 都只按 `publishedRevisionId + documentId` 读取线上快照，不再以 `status=published + version desc` 作为权威事实；空指针、悬空或跨页面指针在发布前门禁中失败关闭。正式 `release-preflight` 还要求显式只读授权、环境身份、数据库名匹配、审批引用哈希以及仅作用于目标数据库的 `USAGE/SELECT/SHOW VIEW`，高权限或跨库账号在任何内容查询前被拒绝。历史恢复仍只复制到 Draft；独立 Rollback Publication 以当前指针为并发条件，只能切换到同一 PageDocument 的历史 Revision，并记录 `PAGE_PUBLICATION_ROLLED_BACK`。migration 尚未应用到任何已确认目标环境，backfill 只提供默认 dry-run 与双重显式 apply 门禁；在目标库完成 migration 和审核回填前，不得部署为线上权威读取。
- 母模板设计与真实装修内容已严格分层：模板目录和模板设计画布通过同一 Renderer 使用系统按槽位类型与合同生成的只读示例内容，真实呈现图片、文字、按钮和商品等对象的位置与比例；模板目录不保存独立缩略图，槽位语义边框仅在卡片选中、Hover 或键盘聚焦时显示。模板属性不提供图片/视频上传、文字正文、商品/分类/门店选择、页面/商品/外链配置或“设为新实例默认”等入口；真实装修内容全部在页面装修中写入当前 `PageDocument` 实例。新建母模板保持 `defaultContent` / `previewContent` 为空，既有定义中的两层只作历史版本兼容读取，不会因打开或保存模板而静默改写旧页面。每个 Slot 的 `emptyPolicy=use-default` 只兼容读取该精确历史版本已有默认值；新模板身份和显式清理会归一为 `hide`。模板编辑态保留系统空状态，复杂对象按真实嵌套内容而不是空对象外壳判断是否为空。复杂节点的模板布局/样式继续写入节点 `contentTemplateDesignProps`，页面实例真实内容不会反向覆盖母模板受控设计。页面装修画布仍只选中整个模板，内部对象选择与几何操作仅在母模板定义工作面开放。
- 服务端现在拒绝新建草稿携带非空 `defaultContent` / `previewContent` 或仅历史可用的 `use-default`，也拒绝普通草稿更新新增、改写两层历史内容，或从当前策略新增/恢复 `use-default`；既有 `use-default` 只能原样保留或显式改为 `hide`。带历史内容的既有草稿仍可原样保存。模板属性会显示历史内容提示，运营者可将两层内容及关联的 `use-default` 从当前未保存草稿中显式清除，并通过模板撤销恢复；直接另存、带修改另存、冲突后另存及 Mock/local 副本均强制清空并保留来源记录。正式版本发布门禁继续拒绝任何非空默认/预览内容和 `use-default`。该行为不改写既有模板版本、旧页面、个人模板记录或未保存草稿。
- 2026-09-02 页面实例属性面板已显示模板基线、页面内容覆盖和页面设计覆盖来源；`SUPER_ADMIN` 可显式把当前实例中可无损表达的宽度、间距、文字字号/对齐、图片适配与九宫格焦点等设计字段提取到当前服务端母模板草稿。提取以页面锁定正式版本和当前模板草稿做字段级三方冲突检测；偏移、图片缩放、流式节点层级和任意百分比焦点保留在页面并披露，真实内容、显隐与业务引用不进入定义。确认只切换到独立模板会话并产生可撤销的未保存修改，不自动写服务端、发布模板、升级实例或批量更新页面。当前客户端生产构建和目标 ESLint 通过；定向 Playwright 自有 API 夹具 2/2 覆盖权限、同字段冲突、确认前零模板写入、进入未保存模板会话、撤销/重做及显式保存不夹带页面内容。同文件在独立端口、单 worker 的完整回归为 16/18，剩余两条失败是当前 UI 已使用“正在预览尚未保存的修改”而测试仍断言旧文案，以及商品任务仍把补充说明放在“其他模板内容”而当前未提交测试断言要求全部首屏展开；本次未改这两项正在进行的范围。合同检查的内容模板部分通过，但动态模板服务端生成文件已有不一致；本次未重生成覆盖。尚未验证真实 NestJS、MySQL、生产权限或发布链路。
- Gate B 目标环境审计具备独立的失败关闭只读入口：执行前要求环境名、预期库名、审批引用和显式只读标记，连接后拒绝任何非 `USAGE/SELECT/SHOW VIEW` 权限；只输出 migration、规模、实例与 dry-run 聚合，不输出页面正文。它要求 24 个 `legacy_system_*` 来源各有且仅有一个 `ownerId=NULL / SYSTEM / STAFF / ACTIVE` 的 V2 草稿，再在内存中把页面草稿、最新正式快照和 PageScheme 分开转换为精确 V2 实例。个人模板 revision 与历史 activation ledger migration 仍是待审计数据库差异，但后者不再对应任何运行时 Activation 能力。该入口尚未连接任何目标环境，因此不构成真实数据库证据或执行授权。
- 2026-08-31 产品入口已收敛为一套母模板目录和 `TemplateDefinitionV2` 编辑会话：页面装修与模板设计都只请求服务端统一 `GET /page-modules/dynamic-templates/catalog`，由服务端一次聚合正式版本、超级管理员可编辑草稿及只读兼容来源；前端不再分别请求系统、个人、正式和个人草稿目录。选择既有系统或账号模板时，兼容适配在内存中直接载入统一结构树、画布和属性面板，不再展示“固定/动态”分类或要求用户执行“转换新版”。保存面板只提供“覆盖模板”和“另存为模板”；发布创建不可变版本，页面实例锁定精确版本且不自动升级。旧系统/个人 HTTP 写路由、服务方法和 DTO 已删除，旧记录仅用于兼容读取和历史重放。该代码收敛不代表目标数据库已迁移或生产已切换。
- 2026-08-31 母模板 DIY 工作面加入向后兼容的设备级 `layoutMode=flow|free` 与归一化 `placement`。只有固定高度的 `Stack` 可使用自由叠放；八向缩放、拖动、父级/中心/兄弟吸附、方向键微调和层级均限制在父画框内，手势移动只更新本地预览，松手才进入一次模板历史，取消不写历史。旧定义缺少新字段时继续按流式规则渲染，未批量重写历史草稿和正式版本。成熟模板合同的 `editableObjects` 已作为虚拟叶图层进入统一结构树，选择仍写回原 V2 节点。模板目录兼容卡改用真实 Renderer；首次读取失败只显示重试与 Mock/local-only 本机草稿，正式模式不再从客户端注册表伪造目录。
- 历史 `ContentSlot` 与旧装修体系已清退；历史材料仅作证据，不具执行力。
- 当前 `App.tsx` 的 `/products` 是品牌 PageDocument 容器，路由本身不再加载休眠的 `ProductList`；公开内容由 `PublicLayout` / `PublishedPageDecoration` 统一渲染。
- 当前公开路由只由 `PublicLayout` 持有一份 `PublishedPageDocumentResource`，首页和非首页装修器消费同一状态；发布事件、可见性刷新和错误重试会同步更新正文、SEO、索引与安全降级状态。HTTP GET 并发去重只是传输优化，不再承担状态一致性职责。
- 受控草稿预览已区分“服务端明确没有草稿”和“草稿读取失败”：前者只显示“尚无已保存草稿”的安全空状态且不挂载任何推荐结构或历史内容，后者只显示可重试错误，不把代码 seed 伪装成真实草稿。发布失败前已保存的草稿保持为未发布状态，刷新后仍可继续；版本列表、恢复版本和放弃草稿失败均保留持续的安全局部错误与原位重试入口，失败不会替换当前画布或清除草稿，恢复成功后的服务端草稿不会误报为本地未保存。“查看线上版本”现在是只读比较态：进入前保留完整内存草稿、metadata、已保存基线和未保存状态，桌面“返回编辑”与移动“继续编辑草稿”恢复同一快照；首次进入且草稿与线上完全一致时没有独立快照，返回编辑直接复用已经加载的 PageDocument 与乐观锁基线，不再用第二次后台读取把用户困在只读态。查看期间离开仍触发未保存保护，保存并离开只保存原草稿。查看线上版本和恢复历史版本都会先排空在途保存，再建立最新草稿基线或读取最新乐观锁。PageDocument 后台动作不透传内部异常正文。
- 发布就绪度继续只来自服务端预检，没有新增前端规则副本。发布按钮现在采用一次点击完成保存、预检和发布：SEO、内容完整度、内容责任和媒体授权只作为页面设置中的可选建议，不再触发二次确认或阻断发布；仅权限、危险地址、不可渲染结构、不可解析引用和版本冲突等错误会阻断。预检暂时失败时会清除上一轮过期问题、保留草稿并提供“重新校验”；查看与重试本身不发布内容。
- 动态模板的“发布模板新版本”同样改为一次点击直接创建不可变版本，不再弹出重复确认；服务端修订号校验、结构合同和并发保护保持不变，已有页面实例仍锁定原模板版本。
- `siteSettings.*` 正式业务资料 warning 现在可由有权限的管理员从发布确认直接进入唯一“店铺资料”页面；移动端存在未保存画布时仍先经过保存/放弃/继续编辑三选项。`EDITOR` 继续允许编辑与保存草稿，但发布按钮按服务端权限保持禁用，不再让无发布权限账号走到接口 403。
- JSON 装修方案导入现在与草稿加载、历史恢复共用页面能力归一化：拒绝声明为其他页面的方案，移除 `网站全局设置`、当前页面不允许的模板、全部 `zones` 区块及多余固定区，并在确认前披露移除数量。`home/about/products/custom` 不保留固定业务区；`catalog/contact` 只在 root 保留一个由当前页面定义重建的固定业务区，错 `pageKey` 和导入文案不能覆盖系统字段。导入只进入当前内存画布；内容确有变化时仍触发未保存离开保护，不会自动保存或发布。旧发布快照的 `zones` 只在公开读取副本中清空，不自动迁入根内容；本次位置门禁升级已提升 `publicationGateVersion`，旧验收印记必须人工复核后重新发布。
- `产品展示行`、`单品焦点推荐`与`佩戴灵感`只在 PageDocument 保存商品引用，公开渲染时实时读取游客商品 API；三类模块共享一条商品变更流并在事件后重新核对公开资格，失效商品不会继续从旧组件状态展示。
- 公开壳层与编辑器画布壳层分别只持有一份 `PublicSiteSettingsResource`；导航、页脚、门店信息、预约区块和联系页固定业务区共享同一快照。PageDocument 不复制电话、地址等业务资料，脱离壳层的独立预览仍只读查询同一个 SiteSettings API。
- 模板库与模板设计画布继续由同一 Renderer 消费同一份模板结构和只读示例参数；当前 24 个内置起步/兼容模板的示例媒体已统一为系统中性 SVG，不加载真实摄影栅格图，也不进入组件默认值、PageDocument、公开 Renderer 或业务数据。该数量只描述当前兼容集合，不限制新增母模板。
- 合作申请的唯一实际表单位于登录后的“我的账户”合作区块；旧 `/partner` 只做登录保护后的兼容跳转到 `/customer?section=partner`，不再维护第二份表单或状态来源。写能力由 `PARTNER_APPLICATIONS_WRITE_ENABLED` 独立控制并默认关闭；关闭时前后台保留历史只读，服务端在事务前拒绝新提交、补充和审核。
- `/search` 当前在 `App.tsx` 中只做查询参数兼容并重定向到 `/catalog`。

### 静态实现差距复核（2026-08-26）

- `/__templates` 已改为仅在 `import.meta.env.DEV` 注册，生产 Nginx 同时拒绝该路径和遗留 TemplateGallery chunk；旧“生产隔离尚未实现”结论失效。
- `PublicLayout` 已按共享路由策略对账户、密码重置、购物车、结算、合作入口、受控预览和开发台架输出 `noindex, nofollow` 并移除 canonical；生产 Nginx 对后台、上述非公开旅程和预览提供 `X-Robots-Tag` 二次保护。
- `/products` 等纯品牌页已区分未发布、无效和读取失败：不会把编辑器默认 seed 或硬编码品牌长页作为公开回退；只有真实读取失败提供重试。
- 五种 `SalesMode` 的详情页主行动已按模式分流；需要顾问承接的路径携带稳定 `type/productRef`，Contact 经公开商品接口解析并由服务端按当前客户可见范围复核后关联现有 `Inquiry.productId`。真实表单提交与后台登录态联调仍未执行。
- 公开列表/详情/媒体、客户目录、推荐、分类、装修引用、咨询快照、收藏、购物车和订单创建已复用 `PUBLISHED + READY + visibility + RELEASE_PROFILE` 资格规则；影响质量的商品与媒体写入在同一事务内复核 READY。交易开关仍默认关闭，目标数据库存量 READY 事实和真实客户身份边界仍须单独验证。
- `WAREHOUSE` 已从通用订单接口与页面移除，只通过库存和履约最小投影工作；履约数据不包含金额、支付、退款、邮箱或订单内部备注，送达终态隐藏地址并脱敏手机号。该结论是当前源码候选，运行角色实测仍待隔离账号。
- 非直购商品不返回公开成交价，公开目录的价格筛选和排序也只作用于直购商品，避免通过结果集合推断咨询类作品的 SKU 价格。
- 公开商品序列化器已按访问矩阵收窄并由字段白名单合同覆盖；后续新增字段仍须先确认公开必要性并同步合同。
- 当前 24 个活跃模板已由浏览器自动遍历桌面、紧凑桌面、平板和手机视口，验证真实 Renderer 角色顺序、比例、高度、可编辑 DOM 落点与横向溢出；该证据不替代逐模板人工艺术方向和真实正式内容验收。
- Puck 保存、刷新回显、发布与公开 Renderer 已在隔离账号、隔离页面、隔离临时 MySQL/Nest 和完整后台壳中完成真实持久化验收，保存值与数据库/公开 Renderer 哈希一致；该证据没有触碰现有用户草稿，也不证明目标数据库或正式内容可发布。Hero 移动端鼠标复核进一步确认：真正无覆盖的可见媒体像素可从 `title` 切换选中 `mobileImage`，白色正文覆盖区保持文字优先；原“所有图片像素都无法直接选择”结论属于测试点位混淆，当前只补强防假绿测试，未加入错误的点击穿透。
- 公开目录的吸顶筛选观察器已改为渐进增强：浏览器缺少 `IntersectionObserver` 或构造器异常时只停用吸顶状态，不再把整个目录升级为全局错误页。桌面、390×844 移动与 reduced-motion 组合均已用浏览器夹具验证核心搜索、商品矩阵、无横向溢出且不产生写请求。
- 未知前台路径已显示可恢复的品牌 404、禁止索引且移动端无横向溢出；SPA 静态托管仍返回壳层 HTTP 200，真实 HTTP 404 需要后续预渲染或边缘路由能力。

### 本地公开页面实查（2026-08-26）

- 当前服务端与前端均已按本工作树重新启动/加载。真实公开 API 显示 `home` version 38、`catalog` version 9、`about` version 3 是缺少当前发布验收印记的历史 revision；它们只返回 `INVALID / publication-revalidation-required`，不再下发 `puckData`。`products`、`custom`、`contact` 没有发布快照。
- 六页在 1440×900 与 390×844 共 12 个真实本地浏览器组合均返回 HTTP 200、无控制台错误、无横向溢出且旧装修模块数为 0。首页、作品、定制、关于进入安全短页；目录和联系页保留各自固定业务主内容。
- 公开 SiteSettings 当前只有站点名可用；电话、邮箱、地址、营业时间和地图链接均没有可公开正式值。联系业务表单仍可显示，但这不等于正式联系资料已经完成。
- 本轮没有测量 LCP、CLS、完整网络瀑布或 1920×1200 视觉验收；不得由上述功能与响应式证据推断性能或最终艺术方向已经通过。

## B. 与现行方向或专项决定的实现差距

- 公开页面职责、客户旅程和五种 `SalesMode` 的长期方向只认 `docs/PROJECT_GUARDRAILS.md` 第 2 节；当前路由结构已部分对齐，但详情行动、公开空态与错误态仍有上述缺口。
- 双客群、三报价、客户确认、资源门禁和订单冻结的业务执行合同只认 `docs/DECISIONS.md` D.19，字段与数值校验只认 `docs/PRODUCT_DATA_CONTRACT.md`；当前 Schema、API、客户管理、报价、费用、合作价格协议和订单快照尚未按该框架完成审计或实现。
- 合作申请入口已在源码中收敛到“我的账户”；真实申请、审核、客户专属双克价和合作订单的数据闭环仍未完成。
- 当前没有新鲜证据证明高级定制报价确认、合作报价转单或真实资金处理已经开放；代码路径、路由或历史测试均不能替代目标环境验收。

### CMS 整改状态

- 2026-08-23 的历史快照发现首页发布位包含外部品牌素材；2026-08-26 已刷新确认该 version 38 revision 缺少当前验收印记，公开接口不再下发其内容。原 revision 未被改写，素材权利和最终替换仍需内容负责人处理后重新发布。

## C. 仅代码推断或待真实验证

- `/products` 的 PageDocument 容器已通过当前真实公开 API 与双端浏览器检查，但没有正式发布稿；`/partner` 与真实客户申请数据仍不属于本轮联调范围。
- 2026-08-23 记录的首页 version 38 外部品牌素材风险已在公开面止损：当前 API 不下发该 revision 内容；这不表示素材已经取得授权、revision 已整改或页面已重新发布。
- 本轮已核对 3000/5173 监听进程、健康接口和当前合同行为，可作为本地同版本功能联调证据；仍不能替代目标环境、正式域名和生产部署验收。

### 前台路由源码清单（本轮未做浏览器验收）

| 路由            | 当前源码与证据边界                                              |
| --------------- | ---------------------------------------------------------------- |
| `/`             | 路由挂载 `Home`；是否取得有效发布 PageDocument 属运行状态，本轮未刷新 |
| `/products`     | 品牌 PageDocument 容器，不加载搜索、筛选或休眠商品列表；真实发布内容待联调 |
| `/products/:id` | 当前源码中的统一作品详情路由；只具备部分零售价格、SKU、数量与加购逻辑，其他服务或报价行动尚未形成闭环 |
| `/catalog`      | 路由挂载 `Catalog`，源码含搜索、筛选、排序与选款；目标职责见 B 层 |
| `/cart`         | 购物车（需登录且交易开关开放；当前关闭）          |
| `/checkout`     | 结算（需登录且交易开关开放；当前关闭）            |
| `/custom`       | 定制服务                                          |
| `/search`       | 兼容重定向到 `/catalog`，并保留受支持的查询参数   |
| `/customer`     | 客户中心（登录/注册 + 个人服务）                  |
| `/about`        | 关于我们                                          |
| `/contact`      | 预约咨询（SiteSettings 真实联系信息）             |
| `/privacy`      | 隐私说明（2026-08-13 新增，匿名可访问）           |
| `/partner`      | 登录保护后的兼容跳转，统一进入 `/customer?section=partner` 的账户内申请流程 |
| `/preview/:pageKey` | PageDocument 草稿预览（页面构建器使用）       |

### 后台（含交易域子页面）

工作台、商品管理、商品编辑、分类管理、属性字典、库存、金价、素材库、订单管理、咨询管理、选款咨询、线索、客户管理（/admin/customers，只读档案+消费聚合+收藏）、评价管理、页面编辑器（editor/:pageKey）、网站设置、AI 分类、行为分析、用户管理、操作日志、系统设置、登录、合作商申请审核。上述页面和 API 接线存在不等于真实开发数据闭环已完成。

交易域子页面：`/admin/trade/payments`、`/admin/trade/fulfillment`、`/admin/trade/refunds`、`/admin/trade/after-sales`、`/admin/trade/quotations`、`/admin/trade/overview`、`/admin/trade/anomalies`。当前只确认代码、目标测试与隔离浏览器路径；尚未以已确认的本地开发数据库完成商品、SKU 价格、库存、发布、下单、收款审核、履约、退款、售后和员工禁用的连续真实数据验收。

## A. 当前可验证实现补充：服务端模块（含交易域）

products, categories, auth, users, orders, inventory, inquiries, selection-inquiry, leads, gold-price, upload, settings, page-modules, ai-classify, analytics, marketing, statistics, cart, customers, recommendations, partner-applications, fulfillment, refunds, after-sales, trade-events, reviews, attributes。

（homepage 已并入 page-modules；notifications 站内信与 content-slots 插槽已作为死资产删除。）

## C. 数据库与运行版本（待目标环境验证）

- 2026-08-30 对当前本机 `jewelry_db` 的只读 ledger 差异显示：仓库 49 个 migration、已应用 45 个、没有已应用但仓库缺失的记录；待应用依次为 `20260829120000_add_fixed_template_versioning`、`20260830110000_add_personal_content_template_revision`、`20260830111000_add_dynamic_template_activations`、`20260830130000_add_page_document_published_revision_pointer`，当前库没有 `page_documents.published_revision_id`。这只描述本机开发库，不代表目标生产库；未经针对精确目标的批准，不执行 migration、backfill 或 checksum 变更。
- P0 指针 migration 已在保留的隔离 MySQL `hc-p0-pointer-mysql-20260830` 中以原始 SQL 单独演练：列、索引、同页面外键和 `SET NULL/CASCADE` 行为存在，5 个同页面历史发布指针完成 apply 后第二次 apply 为 0，revision 与草稿业务哈希不变。该方式没有向 `_prisma_migrations` 写 ledger，只证明 SQL 与恢复基线兼容，不代替目标环境 `migrate deploy`。当前代码连接该隔离库的真实 HTTP 烟测已覆盖 Public 指针读取、`EDITOR` 回滚 403、跨页面 400、过期指针 409、`57→50→57` 回滚、结构化审计、Restore Draft 与过期 `updatedAt` 409；旧历史快照因缺少当前 attestation 均保持 `INVALID / publication-revalidation-required`。
- P0 backfill CLI 现在同时承担失败关闭的目标审计入口：连接前要求环境 ID、预期数据库名、审批引用哈希和显式只读授权；dry-run 连接后只接受 `USAGE/SELECT/SHOW VIEW`，apply 只接受同时包含 `SELECT/UPDATE` 且无更高权限的账号，并继续要求 `--apply + PAGE_PUBLISHED_REVISION_BACKFILL_APPLY=1`。同一报告复用 `checkMigrationIntegrity()`，只输出 ledger、指针列、悬空/跨页面指针和候选聚合，不读取或输出 `puckData/metadata`；pointer migration 尚未执行时只报告顺序 blocker。完全迁移且已回填的隔离恢复库真实烟测得到只读审计 0 candidate / 5 pointers / 0 cross-document、过权 dry-run 失败、最小写账号 apply 0→0 且指针 5→5，临时账号已清理。该证据仍不代替唯一目标环境审计或写入授权。
- 本机新鲜备份批次 `jewelry_db_20260830_153624.sha256` 已对数据库、uploads 和 private-media 三个产物复验 SHA-256，状态为 `SUCCESS / exit 0 / error NONE`；正式 `restore.sh` 已把数据库恢复到新的空隔离库 `jewelry_p0_restore_20260830_153624`，得到 76 张表、6 个 PageDocument、56 个 revisions 和 45 条已应用 migration，与备份时本机库聚合一致。媒体产物完成清单与 tar 校验但本轮明确选择 database-only，没有写入恢复媒体目录；该证据仍不是目标环境恢复演练或异地灾备。
- 当前运行后端可能早于工作树最新构建，因而旧 API 响应不能直接证明当前源码缺少能力；同样，源码和构建通过也不能证明运行数据库已经兼容。
- 真实游客目录当前只有 3 条不适合品牌验收的测试商品，且均为 `DISPLAY_ONLY`；没有可用于验证直购、售罄、0 库存或 `SINGLE_UNIT` 的代表性公开数据。

## C. 交易状态（既有本地运行证据与代码边界）

既有 2026-08-23 本地运行快照记录 API 返回 `commerceEnabled=false`、`cartEnabled=false`、`paymentEnabled=false`；本轮没有刷新该进程。当前源码具备受控代码路径，但没有真实交易联调或生产开放证据。

- `docker-compose.yml` 将 `CUSTOMER_COMMERCE_ENABLED` 的 Compose 默认值设为 `false`；仅按 D.2 完成审批的环境才可显式设为 `true`，不等于生产状态或上线批准。
- 后端 `CustomerCommerceGuard` 与公开 `GET /settings/flags` 只在环境变量精确为 `true` 时开放；变量缺失、拼写错误或其他值均按关闭处理。
- 新网关交易另由服务端 `PAYMENT_GATEWAY_TRANSACTIONS_ENABLED` 总门禁控制，缺失或非精确 `true` 时客户与后台均不能创建网关交易；门禁不阻断暂停前已创建交易的验签、金额校验和幂等回调核销。
- 前端从 `/settings/flags` 加载同一开关；加载失败回退全关。开关关闭时 `/cart`、`/checkout` 跳转咨询页，开启时才渲染需登录的购物车与结算页面。
- 线下转账、付款凭证私有存储、客户读取与后台审核链路已有代码；人工实收入口只允许银行转账/门店收款，不能把微信或支付宝字符串登记为网关到账。2026-08-25 R2-1 已补齐累计实收、超额拒绝、订单行锁与收足后唯一待拣货履约单，但尚未用已确认测试数据库完成连续联调。
- 2026-08-25 R2-2 已建立代码级客户微信主链：客户只能支付本人订单，桌面端返回 Native `code_url`、普通手机浏览器返回 H5 `h5_url`，微信内网页在 JSAPI 公众号身份前置未完成时明确拒绝；待支付重试复用原商户单号，主动查单、关单与回调共用金额/渠道/幂等核销边界。客户查询与关单不受“暂停创建新交易”门禁影响，但仍要求有效客户身份。
- 微信 APIv3 客户端现对下单、查单、关单应答和支付通知执行平台签名校验，回调解密包含 AES-GCM 完整性校验；运行配置新增商户 API 证书序列号。原 `wechatpay-node-v3` 依赖已不再被运行时代码消费，是否删除属于后续依赖清理审批项。
- 支付宝保留现有后台扫码适配器，客户旅程按已批准计划放在第二批。本轮未读取 `.env`，因此微信/支付宝凭据是否配置、通道是否可用、回调和真实资金闭环均未核验。
- 退款创建已要求幂等键，并在订单行锁内同时校验订单总可退额度和单笔原 Payment 可退额度；线下退款完成要求退款流水号，在线 Payment 禁止通过人工执行入口标记完成。2026-08-26 已接入微信 APIv3 原路退款代码路径：审核后复用同一退款单号发起，渠道受理只进入处理中，只有验签回调或主动查询确认成功才完成本地退款；后台只提供发起/查询，不提供在线退款人工完成按钮。独立退款开关默认关闭，支付宝退款、真实商户联调和渠道对账仍未完成。
- 后台员工确认报价在服务层直接拒绝；客户本人确认状态机和不可变报价快照未建立前，报价转单也在任何数据库写入前安全暂停。历史报价与已转订单关联仍可只读查看。
- 库存释放、取消与超时释放共用事务内原子释放入口；未付款 `PENDING_PAYMENT` 订单取消或支付超时会在固定锁顺序下只返还一次优惠券容量并保留 `Order.couponId` 审计归属，已付款、退款和售后不自动返券。全新临时 MySQL 多连接实测已覆盖手工取消、超时竞争、库存与优惠券幂等；仍未在现有或目标数据库执行。
- Fulfillment 首次进入 `DELIVERED` 时会在同一事务把 `Order.deliveryStatus` 同步为 `RECEIVED` 并写入 `receivedAt`，但 `Order.status` 保持 `SHIPPED`，由客户确认或自动确认另行推进 `COMPLETED`；临时 MySQL 已验证并发重复送达只形成一次持久化事实和事件。
- 后台售后创建现在强制校验订单、客户、订单商品三元关联、标准零售类型和订单资格，并对不存在、跨客户和跨订单商品返回相同安全 404；订单锁下的并发重复申请只保留一条记录。管理表单和 API 类型已同步必填 `customerId/orderItemId`，但本轮只完成类型、构建和真实 API/数据库自动验收，尚未人工点击后台表单。
- 手工和自动金价写入只创建 `GoldPrice` 事实，不再调用商品固定价改写路径；未来按重动态价仍须按 D.10 另行设计和审批。
- SiteContent 前端路由与导航已收窄到 `SUPER_ADMIN` / `ADMIN`，与服务端设置接口白名单一致；已有 PageDocument 的保存、发布、放弃草稿和历史版本恢复均强制携带 `expectedUpdatedAt` 并以原子条件拒绝陈旧请求，只有首次创建页面不要求旧版本标识。页面装修操作审计只附加白名单 `pageKey` 与可选恢复版本，不复制乐观锁、装修正文或其他请求体。
- 对外只能表述为“是否提供在线交易以当前站点实际功能和经批准的服务条款为准”，不得宣称完整支付闭环已经上线。

## A/C. 测试资产与历史运行证据

- 2026-09-03 只读排查与修复轮：根 `lint`、`typecheck:server`、`typecheck:client`、`test:contracts`、`test:trade`、`test:selection-inquiry`、`test:public-assets`、`test:runtime-ownership`、`test:release-supply-chain` 在当时工作树（HEAD `6171180` + 在制改动）退出 0；服务端全量套件以 `--test-concurrency=4` 运行为 609 测试 / 606 通过 / 0 失败 / 3 个真实库门控跳过（本机 20 核默认并发约 19 路 ts-node 会产生资源性偶发失败，降并发后稳定；CI runner 核数低，预计不受影响）。本轮新增订单状态机与商品客户资格两个行为级 server spec（`trade-state-machine.spec.ts`、扩展 `product-eligibility.spec.ts`），`verify-page-builder-contract.mjs` 移除同义反复用例；修复三处测试债：`products.publish-visibility.spec.ts` 假 prisma 补 `updateMany`（乐观并发写入演进后桩未跟上）、`demo-seed-policy.spec.ts` 与 `bootstrap-admin.spec.ts` 密码断言从旧 6-18 合同对齐到现行 8-64 / 12-64 合同；仓库新增 `.gitattributes`（EOL 归一化，status 中纯换行差异条目消失属预期）与 `.nvmrc`，`quality.yml` 的 bash -n 纳入 `check-backup-health.sh`。本轮发现的未决红灯：`contracts:check` 报 `validateTemplateDefinition.generated.ts` 与源不一致（在制模板定义改动后未重生成，须由该区域写者执行 `npm run contracts:generate`）；`test:page-builder-publish` 因作品页首屏仍为系统占位图按内容门禁拒绝；`test:ui-colors` 报 4 处非标准色。本轮未运行 build 与 Playwright，不构成完整门禁证据。
- 2026-08-30 当前工作树统一代码级验证：根 `lint`、`typecheck`、前后端生产构建与动态模板生成一致性检查均退出 0；服务端全量 530 通过、4 个需要显式真实库配置的场景跳过；Playwright 全量 564 通过、76 个被现行独立工作区取代或需要显式环境的场景跳过。浏览器测试主要使用本地拦截 API；运行期间未启动后端的非目标请求产生 `ECONNREFUSED` 诊断噪声，但没有测试失败。该证据不证明真实 HTTP、真实数据库、未知草稿、目标环境 migration、动态模板正式激活或生产发布。
- P0 当前本地工作树的精确 Git 基线、工作树指纹、migration bundle、构建哈希和运行态身份只记录在 `artifacts/candidate-evidence/current.json`，避免 tracked 状态文档自引用导致候选指纹永久漂移。候选生成器已固定 Unicode 码元排序和 `core.autocrlf=true` 的 Git clean-filter 语义；同一挂载工作树在 Windows/Node 25 与 Linux/Node 22 中，除生成时间、运行态和输出路径外的证据字段逐字一致。固定 Node 22/Dockerfile 构建的本地 server/client 镜像以工作树指纹前缀标记本地 tag，OCI 标签携带一致的 revision、组件和 migration bundle；一次性 Compose 等价网络烟测已验证 client 200、反向代理 `/api/ready` database ok 和 Public 版本 39 安全 INVALID。由于工作树未冻结，证据明确 `releaseEligible=false`；这些镜像没有远端 digest、SBOM、provenance、签名或同 SHA Quality Gate，不是正式发布制品。

- **Playwright E2E**（`client/tests/`）：`public-access.spec.ts`（公开访问 + 交易关闭降级 + 字段白名单）、`responsive-public.spec.ts`（4 视口横向溢出）、`responsive-admin.admin.spec.ts`、`core-template-homepage.spec.ts`、`privacy-trust.spec.ts`。交易关闭测试证明降级路径存在，不证明当前部署一定关闭。
- **契约测试**（`scripts/`）：page-builder / trade 状态机 / trade 并发 / trade 契约。
- CI（`.github/workflows/`）：ci.yml 包含 client/server lint+build；quality.yml 包含 lint、typecheck、contract、trade、build，并定义 `e2e-deterministic` 安装 Chromium 后运行 public/customer/admin 三个 project。CI 配置存在不等于本轮 CI 已实际执行或通过。

2026-08-23 新鲜代码级验证包括：服务端构建；库存释放、资金门禁、报价暂停、金价事实和版本恢复 16 项目标测试；SiteContent 权限与版本恢复 10 项浏览器测试；客户端生产构建与目标 lint。以上结果仍不是生产、真实支付或真实数据库联调证据。

2026-08-25 R2-1 新鲜代码级验证包括：`npm --prefix server test` 166 项通过，`npm run test:trade` 60 项通过，服务端与客户端生产构建通过；`trade-safety-ui.spec.ts` 与 `admin-auth-store-capabilities.spec.ts` 在 development 模式、隔离 API 夹具下共 7 项通过。它们证明状态机、金额、幂等、角色和确定性后台 UI，不证明真实 MySQL 多连接并发、真实商户支付、原路退款、渠道对账或生产可用。

2026-08-26 R2-2 新鲜代码级验证包括：微信 APIv3 与客户支付目标测试 18 项通过，`npm run test:trade` 60 项通过，服务端与客户端生产构建通过，支付相关客户端目标 ESLint 通过；`trade-safety-ui.spec.ts` 在 development 模式、隔离自有 API 与第三方收银台边界下 4 项通过，覆盖桌面 Native 二维码、390×844 手机 H5 跳转、人工收款渠道限制和在线退款无人工完成入口。先前两个门店模块测试桩失败已由并行任务修复并单独 3/3 复核，最新服务端全量测试为 190/190。上述证据不证明真实商户签名、真实 H5/回调域名、JSAPI 身份、真实扣款、原路退款、渠道对账或生产可用。

2026-08-26 R2-3 新鲜代码级验证包括：微信退款客户端、门禁、状态核销、回调控制器与既有退款一致性共 19 项目标场景通过；服务端全量测试 205/205、`npm run test:trade` 60/60、前后端生产构建和退款相关客户端目标 ESLint 通过；`trade-safety-ui.spec.ts` 在 development 模式、隔离自有 API 与第三方退款边界下 4/4 通过，确认在线支付退款只有“发起原路退款/查询退款状态”而没有人工完成入口。该证据不证明真实微信退款、真实回调到达、真实 MySQL 多连接并发、支付宝退款、渠道账单对账或生产可用；退款开关仍默认关闭，容器环境变量接线也尚未获批。

2026-08-26 R2-4 第一批新鲜代码级验证包括：售后退款联动、客户订单安全状态与既有退款核销 15/15，服务端全量测试 211/211、`npm run test:trade` 60/60、前后端生产构建与客户中心目标 ESLint 通过；`trade-safety-ui.spec.ts` 在隔离 API 数据下 6/6 通过，新增覆盖桌面和 390×844 手机客户订单卡的履约、售后、退款摘要及可展开处理记录。关联退款现在必须属于同订单、退款类、已审核售后且不超过审核额度，达到额度后同事务闭合售后；客户接口不返回付款凭证路径、后台备注、操作者或渠道原始数据。这仍不证明真实数据库持久化、真实客户售后申请、Notification/Outbox 消费、短信/邮件投递或生产可用。

2026-08-26 R2-4 客户自助售后方案 A 已在不改 Schema、数据库、环境变量和依赖的边界内完成代码级与确定性 UI 验证。客户本人只能为自己的 `SPOT` 订单商品申请；待发货仅退款，已发货/已完成支持退款、换货和维修，待付款/已取消拒绝；客户不能提交金额、客户 ID、证据或后台字段，退款金额由后台审核核定。同一订单商品的活动售后在订单行锁内互斥，客户只能撤销本人 `REQUESTED` 申请。新鲜验证为客户服务目标测试 6/6、完整售后 spec 10/10、交易合同 63/63、前后端生产构建、目标 ESLint，以及交易浏览器文件 10/10；新增方案 A 桌面和 390×844 手机路径 2/2，覆盖提交字段、加载禁用、4xx 错误、重试、成功刷新、撤销与无横向溢出。该批次当时服务端全量为 207/219，12 项失败来自验证期间发生的页面构建器发布合同更新；这一历史失败状态已经由下方最新统一门禁取代。浏览器使用隔离自有 API，服务测试使用内存事务端口，因此该批证据本身不证明真实认证 HTTP、真实 MySQL 行锁/持久化、通知投递或生产可用。

2026-08-26 R2-5A 已完成不改 Schema 的在线主链收敛：后台导航与页面改为“支付记录”，银行转账/门店收款降级为次级“异常补录”；待确认微信付款显示“等待渠道确认”且不再出现人工确认或驳回入口，微信退款继续只显示发起原路退款/查询渠道状态。在线与线下共用的事务方法由误导性的 `approveOfflinePayment` 改为中性 `confirmPaymentSettlement`，服务端继续要求在线 Payment 必须携带验签渠道事实才能核销。新鲜验证为服务端全量 212/212、交易合同 60/60、前后端生产构建、相关 ESLint 和 `trade-safety-ui.spec.ts` 隔离 UI 8/8；覆盖桌面与 390×844 手机异常补录、在线付款无人工确认、客户 Native/H5 支付和在线退款无人工完成。该证据不代表真实商户、真实账单、数据库 migration、渠道对账或生产上线通过。

2026-08-26 加入 EN-A 与可靠通知第一批后的新鲜统一门禁为服务端 346/346、交易合同历史证据 63/63、完整根测试、前后端 typecheck、客户端 lint、前后端生产构建、环境合同、24 个内容模板合同，以及 `/en`/客户通知浏览器合同 2/2 均退出 0；可靠通知与客户范围定向测试为 11/11。邮件降级/异常不记录收件地址、主题或提供商原始错误，短信降级/拒绝/异常不记录完整手机号或提供商原始文本。环境合同当前为 server runtime/Compose 50=50、client build 3、`.env.example` key 52、errors 0、warnings 1；唯一警告说明微信支付证书路径虽已映射但 server 没有证书只读挂载，因此 `readyForRealWechatPayments=false`。另有历史的一次性临时 MySQL/Nest 与正式 migration 空库 SQL 链证据；这些均不等于真实商户、正式内容、目标数据库或生产环境通过。

职责拆分代表性浏览器回归使用确定性自有 API 夹具：Catalog、商品编辑、分类、客户档案与后台壳在 development mode 为 50 通过/4 按模式跳过，显式 mock mode 补跑 9/9；后台售后登记桌面与 390×844 两条合同 2/2，确认前端提交订单、客户和订单商品三元关联且移动端无横向溢出。测试端口均已释放；未设夹具的 SiteSettings 请求只验证安全降级，不得把这些结果写成真实后端联调。

## C. 已知问题与待新鲜验证项

1. **首页外部品牌素材已在公开面止损，内容仍待整改** — `id=3/version=38` 历史 revision 已被当前发布验收门判定失效且不再下发；原内容、权利证据、替换素材和重新发布仍未完成。
2. **目标数据库 migration 状态未确认** — 正式 migration 与共享合同测试已对齐，但任何非临时数据库是否已应用仍未知；数据库目标确认前不得迁移、改 checksum 或回填。
3. **开发前后端本轮已对齐，后续仍可能漂移** — 2026-08-26 已重新构建/启动并验证 3000/5173；继续开发或重启后必须重新核对，不能永久沿用本轮结论。
4. **后台完整经营闭环未完成** — Puck 与三项零售一致性已有临时真实数据库证据，但仍不能代替已确认目标数据库上的商品、内容、订单、履约、售后和员工权限连续验收。
5. **生产交易状态未核验** — 未检查真实环境变量、商户凭据、实际部署、真实数据库和支付回调。
6. **正式域名未确认** — robots/sitemap/JSON-LD 保持空或相对路径，确认后补回。
7. **真实联系信息待填** — 后台 SiteSettings 联系字段为空时前台正确隐藏。
8. **首页不再保留代码品牌长页** — 正式品牌内容只接受已发布 PageDocument；未发布、无效或读取失败时仅显示中性安全短页。
9. **正式域名与 TLS 未确认** — 生产 `CORS_ORIGIN` 已改为显式必填并通过环境合同；仍需在目标环境确认正式域名、TLS、回调域与公开 SEO URL。
10. **统一交易详情尚不完整** — `client/src/pages/public/ProductDetail/index.tsx` 当前只覆盖部分 `DIRECT_PURCHASE` 零售价格、SKU、数量和加购/登录购买；已批准的高级定制报价确认、合作商专属红蜡/紫蜡克价、附加费用和订单快照均尚未实现或浏览器验收。
11. **报价确认与转单安全暂停** — 当前后台员工不能代客户确认，转单在客户本人确认状态机、不可变报价快照和所需 Schema 获批实现前返回安全拒绝；这不是完整经营闭环。
12. **客户通知只有第一批本地候选，不能外推为真实送达闭环** — 认证客户的订单创建和每笔支付确认已在业务事务内原子写 Notification/NotificationDelivery/OutboxEvent，客户 API 绑定本人，Worker 具备抢占、租约、有限重试和保守的未知结果处理；外部投递默认关闭。目标库 migration、真实 MySQL 抢占、授权测试收件人、SMTP 配置、送达/退信，以及发货、退款、售后、咨询等后续事件仍未闭合；旧直接邮件路径尚未统一迁移。
13. **英文站只有 EN-A 安全轨道，正式英文内容尚未实现** — `/en` 及其子路由当前由外层门禁返回不可用页面，不请求中文业务事实；公开 API 与 SSE 显式携带 locale，服务端 `en` 在访问事实源前返回 unavailable，Nginx 候选配置为初始响应添加 `noindex, nofollow`。虽然候选 Schema 已有 PageDocumentLocalization/ProductTranslation/CategoryTranslation/SeoSnapshot，但 PageDocumentRevision 没有 locale/contentHash，publishedRevisionId 无法可靠证明同语言不可变修订；该设计必须在目标库状态明确后、migration 执行前处理。不能用机器翻译、自动回退或空页伪装完成。
14. **发布基础已有本机隔离证据，但尚未完成目标环境闭环** — 仓库已具备受控 `restore.sh`、一次性首管理员 CLI、备份状态标记/容器健康检查，以及发布前同 SHA Quality Gate 证明和 Manifest v2 合同。`backup.sh` 已增加自身的 MySQL 就绪等待，隔离竞态演练证明数据库延迟恢复后可继续备份、超时会写 `DB_DUMP_FAILED`；本机新鲜数据库备份已恢复到独立空库。运行中的旧 `jewelry-backup` 容器仍没有挂载当前健康检查脚本，须在明确的本机基础设施变更窗口重建后才能让 Docker health 反映新合同。尚未在 GitHub 远端生成制品，也未在唯一目标环境执行 migration、空媒体恢复、候选切换或浏览器验收；备份仍默认同宿主机、明文、7 天保留且媒体归档非跨数据库原子，微信支付证书只读挂载和 TLS/443 仍未实施。
