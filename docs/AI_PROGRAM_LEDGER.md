# 海川珠宝全量闭环动态台账

> 最后整理：2026-09-12（同步隔离空库验证后的数据库工作包）。本文只维护仍然有效的跨阶段工作包、阻断和下一动作；不保存 Git 指纹、测试数量、migration 数量、运行容器或历史批次日志。

## 事实边界

| 事实 | 权威入口 |
| --- | --- |
| 产品与品牌方向 | `docs/PROJECT_GUARDRAILS.md` |
| 技术不变量 | `PROJECT_RULES.md` |
| 执行、验证与交付 | `WORKFLOW.md` |
| 当前实现与阻断 | `docs/CURRENT_STATE.md`，并以当前代码、配置和运行结果复核 |
| 已批准决定及原因 | `docs/DECISIONS.md` |
| 工作树与候选身份 | 实时任务状态、Git 与 `artifacts/candidate-evidence/current.json`；存在即重新生成或校验 |
| 上线、证据与回滚 | `docs/PRODUCTION_RELEASE_RUNBOOK.md` |

状态文档和本台账不授予数据库、真实数据、支付、部署、Git 或生产操作权限。历史快照只用于追溯，不能作为当前执行清单。

## 总体判定

- 整体产品状态：`WAITING_PREREQUISITES`；具体发布候选尚未形成 Go/No-Go 结论。
- 当前仓库具备可继续复核的本地工程资产；正式内容、目标环境、数据库、制品、TLS、恢复、外部投递与交易分别按对应范围取得证据。具体升级按 `docs/PRODUCTION_RELEASE_RUNBOOK.md` 和 `server/src/common/release/release-profile.ts` 的 `lead-generation` / `commerce` 选择开放能力与门禁，不要求获客候选提前完成未开放的完整交易能力，也不因此豁免共同安全、目标环境与运维验证。
- 任何局部测试、构建、Mock、隔离数据库或历史 PASS 都不能外推为整站、真实联调或生产完成。

## 当前工作包

| 工作包 | 状态 | 完成条件 | 下一动作 |
| --- | --- | --- | --- |
| `HC-CONTENT` 正式品牌与作品内容 | `WAITING_INPUT` | 正式主体、联系资料、作品、媒体权利、六页内容和 SEO 由责任人确认，并完成公开页面验收 | 按 `docs/acceptance/V1_CONTENT_PRODUCTION_INPUT_CHECKLIST.md` 收集和签认输入 |
| `HC-PAGE-BUILDER` 页面装修与模板 | `WAITING_REVALIDATION` | 按唯一模板设计标准验证创建、编辑、保存、发布、公开渲染和受保护草稿，形成明确范围的证据链 | 先读 `docs/page-builder/template-creation-rules.md`，再核对从属细则与当前实现差距；旧计划、固定批次与历史 PASS 不作为执行要求 |
| `HC-COMMERCE` 报价、订单与真实资金 | `WAITING_IMPLEMENTATION_APPROVAL_AND_ENVIRONMENT` | D.18–D.20 的业务方向已批准；未决业务细节、所需 Schema/权限变更、客户本人确认、事务转单、真实渠道和回退仍须获批并验收 | 保持危险入口安全拒绝；取得具体实现与目标环境授权后再推进，不得从现有路由或开关推断已完成 |
| `HC-OPERATIONS` 目标环境与持续运行 | `WAITING_ENVIRONMENT` | 唯一目标环境、域名/TLS、Secret、管理员、migration、监控、备份恢复、告警和不可变制品全部绑定责任人与证据 | 按 `docs/PRODUCTION_RELEASE_RUNBOOK.md` 形成目标环境证据 |
| `HC-DATABASE-INSTALL` 空库安装与迁移兼容 | `PARTIAL` | 以 `d446e09466dfaffdb5f9cdcfad4ce73f0046a9e8` 为基线的集成候选已在隔离 MySQL 8 空库完整迁移，六个真实数据库测试通过，并完成合成既有库的 51→53 升级与恢复演练；精确目标库、生产与真实回退另有对应证据 | [2026-09-12 数据库安装验证](CURRENT_STATE.md#数据库安装验证2026-09-12)记录本地隔离证据。下一步只对获批的精确目标库核对备份、migration ledger、存量数据守卫、升级与回退；生产需独立授权，不得用本地合成证据替代 |
| `HC-PRODUCTION-EVIDENCE` 生产取证接线 | `WAITING_ENVIRONMENT_BINDING` | 同一受控仓库中的审定 evidence workflow 实际采集/核验发布手册第 4 节所有适用 claim，签名结果并通过生产证据验证器；拒绝伪 receipt、错版本、错环境和未执行的检查 | 当前本地工作流仅包含质量门禁和镜像发布，尚无上述接线证据；按下方工作包落实实现、目标平台和运行授权，不以删除验证器代替补齐 |
| `HC-DOCS` 文档单一事实源 | `IN_PROGRESS` | 活跃文档的事实、职责与引用和当前实现一致，删除旧实现时同步清理旧检查入口与说明 | 已定点修正分类消费链、API 分层与响应式复制描述；继续收敛重复状态和历史执行入口，未全量复核的文档不声明完成 |

## 生产取证接线工作包

- **责任边界**：主实施任务负责工作流和证据适配实现，发布负责人提供受控仓库、目标平台、信任锚、允许操作与审批记录；实际负责人在执行前绑定，不把全部工程缺口转成业务输入。
- **依赖与顺序**：先核对目标平台可用的受信 API/执行器、签名工作流身份、隔离和最小权限，再实现取证接线。签名制品 → 部署前预检 → 获批受控启动 → 实际环境取证 → 候选 Go/No-Go，详见 [发布手册第 5 节](PRODUCTION_RELEASE_RUNBOOK.md#5-发布与回滚判定树)。
- **验收**：对同一版本/环境实际核验 runtime、Compose、数据库/管理员/开关、存储、恢复、边缘/告警、外部渠道和回退；无操作权或不能采集的 claim 明确失败。覆盖错误哈希、错误签名者、跨环境/版本证据和只有自报 JSON 的拒绝路径；本地契约检查不能替代真实签名与目标环境执行。
- **当前边界**：此处登记可执行缺口，不表示工作流已实现、远端已核验或生产已授权。数据库迁移及首发范围等其他依赖分别保留在其证据入口，不以取证工作流完成推断整体上线通过。

## 待重新核验的历史线索

下列项目来自历史审计，只防止线索在归档时丢失，不代表问题今天仍存在，也不自动成为开发任务：

- 促销是否存在实际价格消费者；若没有，应隐藏入口或明确“仅记录”。
- AI 分类确认究竟是审计记录还是业务变更命令。
- 页面素材是否仍仅依赖浏览器本地状态，以及是否需要多人运营事实源。
- Upload、Recommendations、Media Library 和 SSE 恢复合同是否仍有缺口。
- Auth、SelectionInquiry、Inventory、Orders 的真实事务、并发和失败路径覆盖。
- 支付请求的 in-flight、终态幂等、重复响应和后台失效请求保护。
- 公开字段矩阵、倒计时绝对时间与时区、模板保存/刷新/公开渲染和版本语义。

恢复任何线索前，先按当前代码和合同复现；无法复现则不进入现行计划。

## 批准与最终判定入口

- 产品和经营决定：`docs/DECISIONS.md` D.18–D.20。
- 正式内容和运营输入：`docs/acceptance/V1_CONTENT_PRODUCTION_INPUT_CHECKLIST.md`。
- 发布与生产证据：`docs/PRODUCTION_RELEASE_RUNBOOK.md`。
- 最终 Go/No-Go 必须绑定唯一环境、不可变版本或镜像 digest、维护窗口、回退点、批准人和时间；空白字段、角色名称或默认配置均不构成批准。
