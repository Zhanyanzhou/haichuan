# 2026-09-08 验收与成熟度历史证据归档

> 本目录只保存 2026-08-06 至 2026-08-27 的历史只读证据。不得把旧 HEAD、文件数量、测试数量、端口、容器、数据库、migration、命令或完成度当作当前事实，也不得据此执行数据、部署或发布操作。

## 现行入口

- 当前实现与阻断：[`docs/CURRENT_STATE.md`](../../CURRENT_STATE.md)
- 动态工作包与闭环状态：[`docs/AI_PROGRAM_LEDGER.md`](../../AI_PROGRAM_LEDGER.md)
- 已批准决策：[`docs/DECISIONS.md`](../../DECISIONS.md)
- 生产输入清单：[`docs/acceptance/V1_CONTENT_PRODUCTION_INPUT_CHECKLIST.md`](../../acceptance/V1_CONTENT_PRODUCTION_INPUT_CHECKLIST.md)
- 部署与生产门禁：[`docs/PRODUCTION_RELEASE_RUNBOOK.md`](../../PRODUCTION_RELEASE_RUNBOOK.md)

## 原路径映射

| 原路径 | 归档文件 | 证据日期与原因 |
| --- | --- | --- |
| `docs/acceptance/open-issues.md` | [open-issues.md](open-issues.md) | 2026-08-13 问题快照，结论已漂移 |
| `docs/acceptance/master-stage-matrix.md` | [master-stage-matrix.md](master-stage-matrix.md) | 2026-08-06 阶段矩阵，不再定义当前成熟度 |
| `docs/acceptance/independent-progress-audit.md` | [independent-progress-audit.md](independent-progress-audit.md) | 2026-08-06 独立审计，不再定义当前系统事实 |
| `docs/acceptance/public-runtime-smoke-report.md` | [public-runtime-smoke-report.md](public-runtime-smoke-report.md) | 2026-08-14 本地浏览器证据，旧命令不可重放 |
| `docs/acceptance/V1_CONTENT_PRODUCTION_CURRENT_EVIDENCE_2026-08-27.md` | [V1_CONTENT_PRODUCTION_CURRENT_EVIDENCE_2026-08-27.md](V1_CONTENT_PRODUCTION_CURRENT_EVIDENCE_2026-08-27.md) | 2026-08-27 V1 只读证据快照 |
| `docs/acceptance/V1_FINAL_COMPLETION_MATRIX_2026-08-27.md` | [V1_FINAL_COMPLETION_MATRIX_2026-08-27.md](V1_FINAL_COMPLETION_MATRIX_2026-08-27.md) | 2026-08-27 V1 完成条件判定 |
| `docs/acceptance/SECOND_TIER_MATURITY_AUDIT_REVIEW_2026-08-27.md` | [SECOND_TIER_MATURITY_AUDIT_REVIEW_2026-08-27.md](SECOND_TIER_MATURITY_AUDIT_REVIEW_2026-08-27.md) | 2026-08-27 第二档复核与当轮执行记录 |
| `docs/acceptance/THIRD_TIER_MATURITY_AUDIT_REVIEW_2026-08-27.md` | [THIRD_TIER_MATURITY_AUDIT_REVIEW_2026-08-27.md](THIRD_TIER_MATURITY_AUDIT_REVIEW_2026-08-27.md) | 2026-08-27 第三档复核与当轮执行记录 |

## 未决线索如何承接

| 历史线索 | 处置 |
| --- | --- |
| 运费、结算金额分解与交易启用 | 已由 `AI_PROGRAM_LEDGER.md` 的 `HC-CLOSE-03` 承接 |
| 可靠通知的事实与注销边界 | 已由 `DECISIONS.md` D.20 与 `AI_PROGRAM_LEDGER.md` 的 `HC-CLOSE-04` 承接；具体事件范围须按当前代码复核 |
| 促销消费、AI 分类回写、页面素材事实源、公开字段矩阵、支付轮询、请求/流恢复、旧测试与脚本可见性 | 已在 `AI_PROGRAM_LEDGER.md` 的 `HC-DOC-CARRY-2026-09-08` 登记，执行前必须重新核验 |
| Upload、Recommendations、MediaLibrary、Auth、SelectionInquiry、真实事务并发、Node/CI、倒计时时区、booking 与模板版本/比例线索 | 只保留为历史复核线索；不得直接恢复为当前工作包，确需处理时先按当前代码和合同重新取证 |
| 当时未跟踪 spec 的具体数量与 Git 分组 | 仅属旧工作树证据，不迁入现行台账 |

`V1_CONTENT_PRODUCTION_INPUT_CHECKLIST.md` 已在本次整理中改为指向现行状态入口，并把本目录中的 V1 证据明确标注为历史快照。
