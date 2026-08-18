# 归档说明 · 模板规则文档（2026-08-18）

本目录归档了 4 份「内容模板」相关的规则与过程文档。归档后不再作为活跃规则使用；设计工作改由 `design-library/` 素材库支撑。

## 归档原因

- 用户决定：项目内不再维护独立的模板规则文档，设计时直接调用 `design-library/` 素材库。
- 为保留已批准决策记录与可回溯性，采用归档而非物理删除。

## 归档清单

| 原路径 | 归档文件 | 性质 |
| --- | --- | --- |
| `docs/CONTENT_TEMPLATE_STANDARD.md` | `CONTENT_TEMPLATE_STANDARD.md` | 内容模板设计与编辑标准（已批准规则） |
| `docs/CONTENT_TEMPLATE_CONTRACT_DESIGN.md` | `CONTENT_TEMPLATE_CONTRACT_DESIGN.md` | 内容模板统一合同技术定稿 |
| `docs/page-builder/template-composition-review.md` | `template-composition-review.md` | 构图评审台（进行中拍板记录） |
| `docs/page-builder/visual-audit-20260818.md` | `visual-audit-20260818.md` | 视觉横切审计 |

## 注意事项

- `contracts/page-builder/content-templates.contract.json` 及配套生成/校验脚本（`scripts/generate-content-template-contract.mjs`、`scripts/verify-content-template-*.mjs`）是代码运行依赖，**未归档、不可删除**。
- `docs/DECISIONS.md` A.9 仍保留「内容模板」相关决策摘要；归档后如需细节，以本目录历史文档为准。
