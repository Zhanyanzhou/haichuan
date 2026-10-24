# 店铺装修文档导航

店铺装修先读[产品合同](store-decoration.md)：六个公开页要完成什么、模板如何被选用、内容从哪一层来、整页怎样才算成篇。需要新建或改造母模板时，再读[模板设计标准](template-creation-rules.md)；首次上线要做哪七块、每块长什么样，读[首发七母模板合同](launch-template-set.md)。其他材料按下表补充读取，不构成并列产品标准。规则生效不等于代码已经符合，状态见 [CURRENT_STATE](../CURRENT_STATE.md)。

模板按**三层**治理：第一层全站不变量（色值落点、标题字重 300～500、单页一套影像语言、桌面/手机两套内容端点）认 [UI_GUIDE](../UI_GUIDE.md) 与 [PROJECT_GUARDRAILS](../PROJECT_GUARDRAILS.md)；第二层区块角色的用途、槽位与禁区认[区块模板标准](section-template-standard.md)，页面准入仍认[产品合同第 2 节](store-decoration.md#2-先落实页面目的再谈模板类型)；第三层只引用令牌，认区块模板标准第 2.3 节。模板设计只能改变第三层。`editorial-media` 已并入 `page-hero`，`page-intro` 已批准但合同落地前不能创建。

| 问题 | 文档 |
| --- | --- |
| 店铺装修的页面职责、选用、内容分层与发页验收 | [店铺装修产品合同](store-decoration.md) |
| 三层治理模型、九个区块角色的用途与页面准入 | [店铺装修产品合同第 2 节](store-decoration.md#2-先落实页面目的再谈模板类型) |
| 模板设计的创建、预设、生成、精调与模板侧验收 | [模板设计标准](template-creation-rules.md) |
| 桌面到手机的比例过渡、目录与页面预览图 | [模板设计标准第 3.1 节](template-creation-rules.md#31-双端呈现与预览图) |
| 首次上线交付哪七块母模板、每块的结构骨架与槽位 | [首发七母模板合同](launch-template-set.md) |
| 一节模板在整页中该出现什么、不能出现什么 | [店铺装修产品合同第 4 节](store-decoration.md) |
| 两种模式、四区任务、编辑与页面交接操作 | [从属编辑与交接细则](template-design-framework.md) |
| 源码入口、接口、预览、导入与公开读取 | [实现边界](../architecture/page-builder-boundary.md) |
| 当前能力、差距与待复验问题 | [CURRENT_STATE](../CURRENT_STATE.md) 的页面装修章节 |
| 模板设计、页面装修与版本升级的稳定验收旅程 | [端到端旅程矩阵](../acceptance/end-to-end-flow-matrix.md) |
| 操作历史内容、检查发布与版本恢复 | [已发布内容操作清单](../acceptance/puck-published-content-audit.md) |
| 四区硬规则、交互与验证标准 | [PROJECT_RULES](../../PROJECT_RULES.md) §7、[UI_GUIDE](../UI_GUIDE.md) 附录 A、[WORKFLOW](../../WORKFLOW.md)第 5 节 |

## 研究记录（不是产品规则）

竞品官网的像素、文件名与换片位置只作观察方法和对照基线，**不构成海川的断点、画幅、字号、字重、底色或验收阈值**，也不得被引用为产品理由。要判断海川该怎么做，只读[产品合同](store-decoration.md)、[模板设计标准](template-creation-rules.md)和 [UI_GUIDE](../UI_GUIDE.md)。

| 研究记录 | 内容 |
| --- | --- |
| [奢侈品官网模板观察（2026-10）](../research/luxury-template-observations-2026-10.md) | 三家奢侈品牌官方站点的首屏换片与列数按宽度实测，以及“这些观察不构成什么”的边界 |
| [区块模板标准官方资料（2026-10）](../research/template-standard-official-sources-2026-10.md) | Shopify、Puck、WCAG 2.2、web.dev、Material 3 等官方规则与数值，逐条标注可借鉴与不照搬 |
| [模板规则审查报告（2026-10）](../research/template-standard-review-2026-10.md) | 现行模板规则的九类问题、依据与改法，附合同与代码差距清单 |

[区块模板标准](section-template-standard.md)自 D.41 起生效：它规定每个区块角色的规格、第三层取值、响应式几何和验收。创建向导的操作步骤仍认[模板设计标准](template-creation-rules.md)；两者冲突时以区块模板标准为准。合同与代码尚未按该标准收紧，差距见 [CURRENT_STATE](../CURRENT_STATE.md)。

## 历史证据

历史专项审计、数据库准备、草稿恢复和阶段验收统一从[页面装修历史证据索引](../archived/2026-09-08-page-builder-evidence/README.md)进入。旧固定模板的规则归档与设计卡已经删除；历史基线、数量、PASS 和命令不定义当前状态。

过期模板计划与旧执行入口已清除；有效编辑细节归入产品合同、模板设计标准及从属细则，历史运行证据只作追溯，不再维护可执行的旧模板要求。
