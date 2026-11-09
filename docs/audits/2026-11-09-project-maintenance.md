# 2026-11-09 工程与工作区整理

本次承接目录、AI 工作上下文、模板实现及验证链路的独立审计。以下为本地整改记录，不是整站视觉验收、真实业务联调或上线证明。执行环境为 Windows、Node.js 22.23.2；没有提交、推送或部署。

## 已实施

| 问题 | 处理结果 | 当前入口 |
| --- | --- | --- |
| 静态接线日志被误解为构图一致 | 成功日志限定为静态注册与合同字段，不声称 DOM、几何、视觉一致 | `scripts/verify-content-template-skeletons.mjs` |
| 图片质量测试不进入常规门禁 | 三份根目录图片 TS 测试及媒体选择器单测接入根 `npm test` 与质量 CI | `npm run test:image-quality` |
| Storybook 状态检查游离于 CI | 两类模板、两端共 16 个故事；双端索引、长文、缺图、15:1 图片、解码、标题、焦点及 axe 检查接入 public CI 分区 | `npm run test:storybook:state` |
| 截图生成被当成认可 | 比较、候选生成分开；缺基线比较必须失败；CI 禁止候选生成；基线按平台与项目隔离且不再被 Git 忽略 | [视觉检查说明](../../client/.storybook/visual/README.md) |
| Renderer 同时承担根布局测量 | 四组布局测量 effect 提取到专用 hook；保持渲染、编辑与数据语义，不改变两条在用渲染链 | `useTemplateLayoutMeasurements.ts` |
| 编辑器样式反复覆盖 | 删除 105 条冗余声明（含 93 条顶层完全等值重复），净减少 124 行；保留其余规则与媒体查询顺序，并按实际宿主与断点检查最终 computed style | `client/src/pages/admin/HomepageConfig/editor.css` |
| 未接线的退役 UI 干扰维护 | 移除 `NewTemplateRecipeModal`、`LaunchMasterPickerModal`、`CanvasInsertButton`、`RestoreDefaultButton` 四个 TSX 与前两者 CSS，共 733 行；保留生成器、旧数据兼容和有产品登记的 `ManagedVideo` | D.53 / D.54 与当前引用检查 |
| 旧画廊被误当完整模板台架 | 标明仅旧 Hero 调试用途，链接现有编辑工作区 | `/__templates`（仅开发） |
| 文档权威入口漂移 | 修正 UI、架构、组件、设计库四处入口；framework 仅作从属操作与交接细则 | [页面装修导航](../page-builder/README.md) |
| 当前状态混入大量历史流水 | 9 月历史记录原文归档，当前状态页约缩减 50%；保留原锚点和未验证边界 | [历史验证记录](../archived/2026-11-09-maintenance/september-verification-history.md) |
| 退役测试混入活跃大文件 | 三个无条件跳过的历史双语测试完整归档；活跃测试正文未改 | [退役测试原文](../archived/2026-11-09-maintenance/retired-bilingual-page-tests.md) |
| 响应式复制测试夹具失效 | 普通网格和锁定网格各有三个真实子项，恢复可复制差异；保留原有预览、取消、撤销、锁定保护强断言 | `client/tests/fixtures/template-native-responsive.tsx` |
| 工作副本、旧日志干扰默认检索 | `.ignore` 与 `.cursorignore` 排除历史工作副本、日志和恢复资产；需要查历史时按明确路径读取 | 根目录检索配置 |

## 工作区资产与恢复

- 31 个根目录旧诊断文件移至 `.codex-tmp/maintenance-20261109/root-diagnostics/`。
- 137 个旧工具输出移至 `.codex-tmp/maintenance-20261109/old-tool-output/`；保留近期浏览器记录。
- 4 张没有可核实认可记录的旧 Storybook 截图移至 `.codex-tmp/maintenance-20261109/legacy-storybook-baselines/`。
- 三批均保留 manifest，并逐文件核验移动前后 SHA-256。归档是可恢复整理，不代表释放这些文件占用的空间。恢复前应先确认原路径不存在，禁止覆盖后来产生的同名文件。
- 6 个附加 Git 工作区保留原状，检查时差异条数分别为 25、1、1、1、1、9；路径与差异清单记录于 `.codex-tmp/maintenance-20261109/worktrees-preserved.json`。
- `backups`、`_local_backups`、页面草稿快照、设计素材、生成图和其他未提交业务修改均保留。
- 旧 `skill-creator` 的归档及旧入口移除被自动审批拒绝，返回信息仅为 `blocked by policy`，没有执行。它原本已无 `SKILL.md` 发现入口，仍按其 README 保持退役状态。

## 本地验证

| 验证 | 结果与范围 |
| --- | --- |
| `npm run contracts:check` | 通过，两端生成合同一致 |
| `npm run test:decision-governance` | 7 项通过，结构化决策检查通过 |
| `npm run test:content-templates` | 通过；仍有一条既存 Inspector section 整洁性软警告 |
| `npm run test:runtime-ownership` | 通过，客户端与服务端未解析 import 均为 0；静态可达性不等于业务联调 |
| `npm run test:admin-ui-standards` | 2 项测试及规范检查通过 |
| `npm run test:image-quality` | 20 项通过、0 跳过 |
| `npm run test:storybook:state` | 桌面与手机共 6 项通过、0 跳过 |
| 模板响应式合同、配方 Renderer、native responsive 浏览器测试 | 最终 57 项通过；最初两个失败已定位为原有夹具问题并修复 |
| 退役测试分离 | 13 个活跃声明正文保持一致，Playwright 展开收集 15 项；不执行真实数据库写入 |
| 样式对照 | 页面模式、模板属性面板及独立/页头宿主多档宽度的关键节点全部 computed CSS 属性前后一致 |
| 新 hook 与 Renderer 目标 ESLint | 无错误；新 hook 无警告，保留原 Renderer 的 `facts` effect 依赖警告 |
| `npm run build:client` | 类型检查和生产构建通过；保留既有大 chunk 提示 |
| 视觉基线比较负向检查 | 缺认可基线时失败且不自动生成正式基线；CI 候选生成被拒绝 |
| 引用与差异检查 | 相对文档文件链接、退役原文保全、目标 `git diff --check` 通过 |

本轮没有运行云端 CI、全量后端测试、真实数据库/发布流程或生产验证。

## 尚不能宣称完成的部分

1. **整页艺术质量与共享像素基线尚未验收。** 四张新候选采用灰色技术夹具，主任务已查看，不能作为品牌摄影或首页/系列页/详情页的设计认可。正式基线目前为空，因此 `npm run test:visual` 不会通过。CI 已执行双端状态检查，像素比较尚未成为已建立基线的 CI 门禁。
2. **复杂编辑器的全部维护债务没有一次性消失。** 本次清理已确认冗余与分离测量职责，没有大范围重写 Renderer、删除在用兼容层或改变响应式产品策略。文件总行数不能替代行为与设计质量判断。
3. **旧工作区与恢复资产不是已批准丢弃的数据。** 本次通过检索隔离和清单降低干扰，未清空数 GiB 的备份、工作树和草稿。

后续真正的视觉认可应以指定版本、真实内容的整页桌面与手机画面为对象；不能通过更新截图、放宽断言或重新命名检查来替代。
