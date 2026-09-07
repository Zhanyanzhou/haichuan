# 海川珠宝全量闭环动态台账

> 最后整理：2026-09-08。本文只维护仍然有效的跨阶段工作包、阻断和下一动作；不保存 Git 指纹、测试数量、migration 数量、运行容器或历史批次日志。

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

- 状态：`NO-GO / WAITING_PREREQUISITES`。
- 当前仓库具备可继续复核的本地工程资产，但没有同时取得正式内容、唯一目标环境、目标数据库、不可变发布制品、TLS、恢复演练、外部投递和真实交易证据。
- 任何局部测试、构建、Mock、隔离数据库或历史 PASS 都不能外推为整站、真实联调或生产完成。

## 当前工作包

| 工作包 | 状态 | 完成条件 | 下一动作 |
| --- | --- | --- | --- |
| `HC-CONTENT` 正式品牌与作品内容 | `WAITING_INPUT` | 正式主体、联系资料、作品、媒体权利、六页内容和 SEO 由责任人确认，并完成公开页面验收 | 按 `docs/acceptance/V1_CONTENT_PRODUCTION_INPUT_CHECKLIST.md` 收集和签认输入 |
| `HC-PAGE-BUILDER` 页面装修与模板 | `WAITING_REVALIDATION` | 当前合同、编辑、保存、发布、公开渲染和受保护草稿在获批环境形成同一证据链 | 从 `docs/page-builder/README.md` 进入，按当前机器合同和新鲜 Gate 复核 |
| `HC-COMMERCE` 报价、订单与真实资金 | `WAITING_IMPLEMENTATION_APPROVAL_AND_ENVIRONMENT` | D.18–D.20 的业务方向已批准；未决业务细节、所需 Schema/权限变更、客户本人确认、事务转单、真实渠道和回退仍须获批并验收 | 保持危险入口安全拒绝；取得具体实现与目标环境授权后再推进，不得从现有路由或开关推断已完成 |
| `HC-OPERATIONS` 目标环境与持续运行 | `WAITING_ENVIRONMENT` | 唯一目标环境、域名/TLS、Secret、管理员、migration、监控、备份恢复、告警和不可变制品全部绑定责任人与证据 | 按 `docs/PRODUCTION_RELEASE_RUNBOOK.md` 形成目标环境证据 |
| `HC-DOCS` 文档单一事实源 | `COMPLETE` | 活跃文档不再重复维护易变数量、旧运行事实或失效执行指令；引用和职责检查通过 | 后续只在新事实或决定出现时更新对应现行入口；历史原文继续留在归档 |

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
