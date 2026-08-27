# 第二档成熟度审查复核与修正（2026-08-27）

> 复核对象：用户提供的《海川珠宝 第二档成熟度审查 → Codex 执行交接书》。
> 当前基线：分支 `codex/release-curation-20260814`，HEAD `5c9b077`，并包含当前未提交工作树。
> 证据边界：当前代码、测试资产、治理文档和本轮确定性本地验证；未连接目标数据库、真实第三方或生产环境。

## 1. 结论

原交接书不能直接作为执行清单。它发现了 `statistics` dataset 漏过滤、促销零消费、运费模板未进入结算、AI 确认不回写商品等真实线索，但同时存在过时事实、把“有代码/有测试”写成“闭环无缺口”、错误删除候选、审批判断不完整，以及把不同 SSE 生命周期强行统一为一个 hook 的过度方案。

本轮已经修复有直接证据、无需额外产品或高风险审批的缺陷。促销、运费、AI 回写、全生命周期可靠通知、素材库事实源和文件删除仍需用户决策或专项批准，不在本轮越权实施。

## 2. 原审查中的关键问题

| 原结论/工作包 | 当前复核 | 修正裁决 |
| --- | --- | --- |
| WP-1：pageViews 趋势未按 dataset 过滤 | **成立**。`analytics.service.ts` 的写入/查询/清理消费 dataset，`statistics.service.ts` 原始趋势 SQL 未消费 | 已修复并补参数级回归 |
| WP-2：AI 分类页 4 个生产 API 零契约 | **不成立**。`client/tests/product-metadata-clients.spec.ts` 已覆盖 records、report、confirm；classify/chat 与失败态仍不完整 | 改为“已有部分契约，补失败恢复与尚未覆盖的调用” |
| WP-2：素材库只是零测试守门页 | **描述不充分**。商品媒体走后端 API，但“页面素材”列表只存 `localStorage: haichuan.page-media`，并非跨管理员、跨浏览器的运营事实源 | 测试不能把该架构缺口变成闭环；需先决定是否建立服务端媒体库事实源 |
| WP-3：attributes 仅 DTO、零行为保护 | **部分过时**。已有 `attributes.input-boundary.spec.ts` 4 条输入边界测试，但仍缺 Service CRUD/引用边界 | 不重复新增 DTO 测试；后续只补真实服务行为 |
| WP-3：reviews 功能完整、只缺测试 | **不完整**。状态筛选允许任意字符串进入 Prisma，ID 参数会把非法字符串转成 `NaN` | 已修复专用状态 DTO、正整数参数与关键行为测试 |
| WP-3：ai-classify 未配置报错不静默 | 服务确实不回退 Mock，但列表状态和确认空分类仍缺 fail-closed 保护 | 已修复并补服务级测试 |
| WP-4：促销 CRUD 零消费 | **成立**。当前只有管理端和 marketing CRUD；未发现订单/试算/商品定价消费者 | 保持决策项；接入定价命中交易高风险，不能由本审查自动授权 |
| WP-5：运费模板未进入订单计费 | **成立**。Product 可关联模板，Order 无独立运费分解，结算公式不消费模板 | 保持高风险决策项；Schema、migration 和交易公式必须专项批准 |
| WP-6：通知扩展“无审批” | **错误**。发货/退款通知会改变 Order/Fulfillment/Refund 事务与重试语义；`docs/AI_PROGRAM_LEDGER.md` 也明确把完整生命周期 Outbox 置于 P3 批准后 | 本轮不实施；需独立事务边界、幂等、偏好和外部投递方案 |
| WP-7：SSE 达上限均静默停止，并统一 hook | **部分错误**。`usePagePublishStream` 已在重试耗尽后降级 60 秒轮询；通用 product hook 与 Puck Renderer 仍有静默停止，但它们的单实例/页面级生命周期不同 | 先按消费方定义 stale 状态和恢复合同；不以“代码重复”直接强并一个 hook |
| WP-8：全站无 skip-link，public 无系统 focus | **不成立**。HEAD 已有 `PublicLayout` skip-link、`#main-content` 焦点目标，公开样式和 Renderer 也有多组 `:focus-visible` | 取消 WP-8；后续只能登记具体页面/控件缺陷，不能重复做全局基线 |
| WP-9：HomepageConfig 遗留目录可删 | **危险误判**。`EditorWorkbench` 仍直接渲染 `HomepageConfig`，Inspector、商品编辑器和大量 Playwright 夹具也复用其 store、组件和样式 | 从删除候选中移除；不得删除或迁移 |
| WP-9：Schema 注释写“migration 未执行” | **表述不稳定**。migration 是否应用取决于目标数据库，不能由 Schema 静态注释永久声明 | 已改为要求核对 migrations 与目标数据库 |
| WP-10：AI 确认后回写 Product 分类 | **事实成立、方案待决策**。当前只更新 AIClassifyRecord | 保持记录模式，直到用户明确选择回写语义、权限与审计 |

## 3. 本轮已实施的修复

### 3.1 Analytics dataset 单一口径

- 新增 `analytics-dataset.ts` 作为 dataset 解析的单一入口。
- Analytics 写入、后台列表和保留清理改用同一入口。
- Statistics 的 pageViews 趋势 SQL 增加参数化 `dataset = ...` 条件。
- 生产环境未安全配置为 `PRODUCTION` 时，趋势查询 fail closed，不读取混合分析表。

### 3.2 Reviews 输入与公开输出保护

- 后台筛选只接受 `all / PENDING / APPROVED / REJECTED`。
- 公开商品 ID 与审核记录 ID 使用 `ParseIntPipe`，非法值不再进入 Prisma。
- 新增订单归属/完成状态/商品包含、公开仅 APPROVED、客户昵称脱敏等行为回归。

### 3.3 AI 分类 fail-closed

- 列表状态改为专用枚举查询 DTO。
- 人工分类 ID 必须为正整数，记录 ID 使用 `ParseIntPipe`。
- 确认时既没有人工分类也没有预测分类会返回明确 400，不写入伪 confirmed。
- 仍然只更新 AIClassifyRecord，不回写 Product 分类。

### 3.4 后台守门页错误恢复

- 合作申请加载失败会清除旧结果、显示持久错误与“重新加载”，空态区分初始空和筛选空。
- 合作申请表格在 390px 使用容器内横向滚动，不让整页横向滚动。
- AI 记录/报告失败不再伪装成 `0 / N/A`；两者分别显示可重试错误。
- AI KPI 使用服务端总量和 `autoConfirmRate`，不再把当前分页记录误当全量统计。
- 素材库与合作申请反馈改用 Ant Design 应用上下文，避免静态 message 主题告警。

### 3.5 注释与暂停边界

- Schema 注释不再静态声称 migration 未执行。
- `QUOTATION_CONVERTED` 明确标注为安全暂停常量；未删除，也未恢复转单。

## 4. 仍需决策或专项批准

1. **促销**：推荐先隐藏入口或明确标注“仅记录、不影响价格”；接入定价必须另行批准交易规则、金额公式、并发与回退。
2. **运费**：推荐在交易启用前统一设计商品小计、优惠、运费、税费/调整和应付金额的不可变分解；该项需要 Schema、migration 与交易审批。
3. **AI 回写商品分类**：需决定 AI 确认是“审计记录”还是“商品变更命令”；若回写，必须校验目标分类、商品范围、并发和操作审计。
4. **可靠通知扩展**：发货、退款、售后事件要先批准事务原子性、幂等键、客户偏好、未知投递结果和重投责任，不接受“无 Schema 所以无审批”的判断。
5. **页面素材事实源**：当前本地列表不是多人运营事实源。若要成熟媒体库，需要决定服务端模型/API、权限、引用检查、删除语义和迁移；不能靠新增 Playwright 固化 localStorage。
6. **删除项**：`HomepageConfig` 不再是候选；其他任何文件删除仍按 `AGENTS.md` 逐项批准。

## 5. 后续可执行但未在本轮冒充完成的验证

- Upload、Recommendations 的模块级服务测试仍可补，但现有产品媒体完整性、访问可见性与客户端合同已提供部分邻接证据；应按未覆盖行为补，不按模块名机械各写一份。
- MediaLibrary 仍缺上传成功/失败的确定性 UI 回归，但在素材事实源决定前，该测试只能证明单浏览器 localStorage 行为。
- SSE 需要先为商品数据、PageDocument 和 Puck 单实例流分别定义“陈旧、降级、手动重试、轮询恢复”可观察合同，再决定是否共享底层重连器。
- 本轮本地 Mock/确定性测试不证明目标数据库、Kimi、SMTP、真实客户/员工角色或生产环境已通过。
