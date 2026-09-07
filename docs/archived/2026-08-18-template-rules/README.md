# 归档说明 · 模板规则文档（2026-08-18）

本目录保留 4 份历史规则与过程文档。正文中的“已批准”“定稿”“进行中”均指归档时的状态，不是现行要求。现行资料统一从[页面装修与模板设计文档导航](../../page-builder/README.md)进入。

## 归档原因

- 2026-08-18 当时将独立模板规则归档、设计知识转向 `design-library/`；该说明已由后续单一专项框架与模板框架优先决议收敛，不能解释为今天没有模板规则。`design-library/` 只提供设计知识，不能取代专项框架或 UI 规范。
- 为保留已批准决策记录与可回溯性，采用归档而非物理删除。

## 归档清单

| 原路径 | 归档文件 | 性质 |
| --- | --- | --- |
| `docs/CONTENT_TEMPLATE_STANDARD.md` | `CONTENT_TEMPLATE_STANDARD.md` | 内容模板设计与编辑标准（当时批准，现已归档） |
| `docs/CONTENT_TEMPLATE_CONTRACT_DESIGN.md` | `CONTENT_TEMPLATE_CONTRACT_DESIGN.md` | 内容模板统一合同技术定稿（历史） |
| `docs/page-builder/template-composition-review.md` | `template-composition-review.md` | 构图评审台（归档时的讨论记录） |
| `docs/page-builder/visual-audit-20260818.md` | `visual-audit-20260818.md` | 视觉横切审计 |

## 注意事项

- `contracts/page-builder/content-templates.contract.json` 及配套生成/校验脚本（`scripts/generate-content-template-contract.mjs`、`scripts/verify-content-template-*.mjs`）是代码运行依赖，**未归档、不可删除**。
- 取代关系见 [DECISIONS](../../DECISIONS.md) A.9、A.10 与 D.26；历史细节读本目录，现行模板规则读[专项框架](../../page-builder/template-design-framework.md)。
