# 页面装修文档导航

日常工作从[功能规格](template-design-framework.md)开始，只按当前问题补充阅读：

| 问题 | 文档 |
| --- | --- |
| 两种模式、四区任务、编辑与版本行为 | [页面装修与模板设计](template-design-framework.md) |
| 源码入口、接口、预览、导入与公开读取 | [实现边界](../architecture/page-builder-boundary.md) |
| 当前能力、差距与待复验问题 | [CURRENT_STATE](../CURRENT_STATE.md) 的页面装修章节 |
| 操作历史内容、检查发布与版本恢复 | [已发布内容操作清单](../acceptance/puck-published-content-audit.md) |
| 四区硬规则、交互与验证标准 | [PROJECT_RULES](../../PROJECT_RULES.md) §7、[UI_GUIDE](../UI_GUIDE.md) 附录 A、[WORKFLOW](../../WORKFLOW.md)第 5 节 |

## 数据库只读审计入口

统一母模板数据库 Gate B 只读审计入口为 `npm run audit:template-v2-gate-b:readonly`。运行前必须在 `server/` 的受控进程环境中显式提供：

- `TEMPLATE_V2_GATE_B_READ_ONLY_AUTHORIZED=1`
- `TEMPLATE_V2_GATE_B_ENVIRONMENT_ID`
- `TEMPLATE_V2_GATE_B_EXPECTED_DATABASE`
- `TEMPLATE_V2_GATE_B_APPROVAL_REFERENCE`
- 指向同一预期库的 `DATABASE_URL`

该入口必须先核对实际数据库名、migration ledger、必需表、模板 checksum 和页面精确引用；数据库账号只允许 `USAGE`、`SELECT`、`SHOW VIEW`，出现其他权限即失败。审计会只读读取必要的页面与版本正文并在内存中完成引用检查，但只输出计数、摘要、blocker 与 warning，不输出页面正文，也不执行 migration、写入、激活、发布或部署。精确实现以当前 CLI 与包脚本为准；环境和只读访问仍需单独授权。

## 历史证据

历史专项审计、数据库准备、草稿恢复和阶段验收统一从[页面装修历史证据索引](../archived/2026-09-08-page-builder-evidence/README.md)进入。更早的设计来源见[8 月 18 日归档](../archived/2026-08-18-template-rules/README.md)和[8 月 20 日归档](../archived/2026-08-20-template-rule-consolidation/README.md)。历史基线、数量、PASS 和命令不定义当前状态。

2026-09-08 已删除被替代的近期计划、旧 WYSIWYG 架构、阶段 3A 文档和失效执行入口；有效设计取舍进入功能规格，仍有取证价值的原文保存在归档。
