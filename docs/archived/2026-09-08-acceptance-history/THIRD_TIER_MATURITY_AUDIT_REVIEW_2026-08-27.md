# 第三档成熟度审查复核、选择与执行结果（2026-08-27）

> **归档于 2026-09-08：** 已完成项、旧数量和旧优先级不再作为当前事实；未决线索已在本目录 README 与现行台账中分层承接。
>
> 复核对象：第三档“测试 / 脚本 / CI / 文档 / 模板 / 前端共享层”静态交接书。
> 当前基线：`codex/release-curation-20260814`，HEAD `5c9b077`，工作区包含多个既有及并行修改。
> 本文是当前代码复核与本轮执行记录，不授予 Git、依赖、数据库、支付、部署或生产操作权限。

## 1. 执行结论

原交接书的主方向成立：部分质量资产没有进入默认执行链，前端存在独立竞态和恢复缺口。但它不能整包执行，原因包括：

- 统计口径已过时：当前共有 101 个服务端 spec，其中 91 个已跟踪、10 个未跟踪；AI 分类、Reviews、Statistics 已在工作区补有服务测试，不能继续列为“零测试”。
- `verify-batch1-safety.mjs` 并非“与当前源码一致”；本轮直接运行失败，仍依赖旧版商品编辑器源码切片，禁止在修复前接入默认测试或 CI。
- “用测试证明微信 OAuth state 不可猜测”不是可靠验收；单元测试只能验证格式、绑定、时效和验签失败，不能证明随机值在统计意义上不可预测。
- 把九个后台列表和商品详情一次性抽成通用 Hook 是架构建议，不是已证明的唯一修复。不同查询的分页、取消、错误和缓存合同尚未统一，且相关页面存在并行改动。
- 支付轮询副作用属于支付行为变更，不能混入普通共享层修复。
- 公开字段矩阵仍与当前序列化器存在冲突；当前工作区中的 `CURRENT_STATE` 已出现“已收窄”描述，但权威矩阵仍把多字段标为待确认，不能据此宣称 D-5 已完成。

本轮选择执行：质量脚本接电、测试可信度修复、三个独立前端共享层 Bug、可确定的文档漂移。其余按风险和冲突边界保留为专项批次。

## 2. 逐项复核

| ID | 当前判断 | 本轮处理 |
| --- | --- | --- |
| AUD-021 | **成立但数量过时**：当前 10 个服务端 spec 未跟踪，CI checkout 仍不可见 | 不执行 `git add/commit`；列为独立 Git 审批项 |
| AUD-022 | **成立**：best-effort 用例只有“不抛异常”隐式断言 | 已改为显式断言写入尝试、吞错和错误日志 |
| AUD-023 | **部分成立**：Auth、SelectionInquiry 仍缺行为测试；AI/Reviews/Statistics 的零测试描述已过时 | 保留为后续两个独立服务测试批次 |
| AUD-024 | **成立**：Mock 自己恢复 quantity，再断言自己恢复的值 | 已移除自证回滚，改验门禁抛错、无补偿写入、无成功通知；真实事务回滚仍需数据库测试证明 |
| AUD-025 | **成立** | 已修 Fulfillment 条件 Mock 并新增 `count:0` 并发抢占分支；Orders harness 尚未改，标记部分完成 |
| AUD-026 | **标题不可自动证明** | 不增加伪“不可猜测性”断言；保留现有格式/长度/来源隔离检查 |
| AUD-027 | **成立**：商品编辑器 Mock 回归未进当前 CI | 暂不改正在并行修改的 `quality.yml`；本轮已在显式 Mock 模式实跑 4 项 |
| AUD-028 | **成立且属于证据边界** | 建议设发布前手动隔离后端 + 一次性库门禁，不冒充逐 PR 联调 |
| AUD-029 | **部分错误**：8 个脚本不应同样接线；`verify-batch1-safety` 当前失败，若干脚本依赖旧 `dist` 或已有行为 spec，媒体审计还需要运行接口 | 仅把当前通过且职责独立的隐私同意静态合同接入 `test:contracts`；其他脚本保留专项处理 |
| AUD-030 | **成立** | 已把四个内容模板检查接入根 `npm test` |
| AUD-031 | **成立** | 已把文档改为 `e2e-deterministic` + public/customer/admin 三 project |
| AUD-032 | **成立**：Node 20/22 与无 engines 并存 | 推荐统一 Node 22，但须同时修改 CI、两个镜像和 engines 后验证；本轮不拆开改 |
| AUD-033 | **事实成立，优先级偏高** | concurrency/permissions/timeout 值得做；push 过滤与 pre-commit 属成本/团队策略，且 workflow 当前有并行修改，本轮不写 |
| AUD-034 | **部分成立** | 已移除商品编辑器两处固定等待；分类引用改为等待真实请求取消；隐私分析三处仍在并行改动文件中，未混入 |
| AUD-035 | **工程偏好，不是缺陷** | 不增加 pre-commit；避免让本地提交钩子重复 CI 成本 |
| AUD-036 | **高可信成立** | 支付副作用幂等和 in-flight 守卫应一起修；命中支付审批，本轮不执行 |
| AUD-037 | **竞态模式成立，统一 Hook 方案未被证明** | 不对九页批量重构；先定义请求失效合同并避开第二档正在修改的页面 |
| AUD-038 | **成立** | 已限制只有菜单打开时 Esc 才关闭并归还焦点，补关闭态焦点回归 |
| AUD-039 | **成立** | 已保存并清理内层隐藏 timer，补连续路由切换回归 |
| AUD-040 | **成立但低价值**：文件零引用且枚举漂移 | 不给死类型“补齐后继续闲置”；删除文件需要审批，暂保留候选 |
| AUD-041 | **高可信推断**，与 AUD-036 同一支付轮询生命周期 | 合并进入支付专项，不做局部补丁 |
| AUD-042 | **风险成立，具体行为待产品合同** | 选择“保存绝对 ISO 时间；运营端按 Asia/Shanghai 编辑；访客看到同一绝对时刻”，优于依赖服务器本地时区；模板合同变更待批准 |
| AUD-043 | **成立** | 已验证 JSON 解析结果必须为字符串数组，并补损坏存储恢复回归 |
| AUD-044 | **仍未收敛** | 不能按旧矩阵盲删字段，也不能用状态文档覆盖矩阵；需逐字段产品/安全决策 |
| AUD-045 | **成立** | 已同步 `npm test` 实际链路、Uptime Kuma 3001 与 backup 无 HTTP 探针事实 |
| AUD-046 | **成立** | 已把模板文档中间宽度同步为 CSS 的 768–1199px |
| AUD-047 | **成立** | 已移除历史正文中与校正行冲突的 G-5 待办行 |
| AUD-048 | **成立** | 本轮只保证现有四脚本进入默认链；未把正则检查冒充渲染行为验证 |
| AUD-049 | **类型风险成立，功能缺失未证实** | 先做 booking 保存/刷新/公开渲染实测，再决定类型修补，不在本轮猜测 |
| AUD-050 | **合同语义待澄清** | 不单独提升版本；先定义模板印记版本与实例覆盖版本的权威关系 |
| AUD-051 | **成立**：仍有两条显式比例白名单 | 后续把缺口收进机器合同；会影响模板合同与全量 Renderer 验收，本轮不扩张 |

## 3. 本轮修改

### 3.1 默认质量链

- 根 `npm test` 现在运行 `test:content-templates`，覆盖合同生成一致性、模板合同、骨架、图片规格和 Inspector Schema。
- `test:contracts` 增加隐私同意合同检查。
- 没有接入当前失败的 `verify-batch1-safety`，也没有把需服务端构建、真实接口或人工运行条件的脚本伪装成静态合同。

这些本地修改只有在后续获得 Git 审批并进入版本控制后，CI checkout 才能消费；本轮没有执行 Git 写入。

### 3.2 测试可信度

- TradeEvents best-effort 明确验证一次写入尝试、错误被吞和日志留下。
- Inventory 门禁测试不再由 Mock 自己模拟事务回滚；当前只证明服务层不做补偿写入、不发送成功通知。
- Fulfillment happy-path Mock 按真实 `where` 状态集合返回 count，并新增并发抢占 `count:0` 时不更新订单的测试。
- 商品编辑器固定等待改为等待真实控件可见。
- 分类引用延迟用例改为等待请求开始及 AbortController 取消，不再猜测 450ms。

### 3.3 前端共享层

- 关闭状态菜单不再吞掉全站 Esc 或劫持输入焦点。
- 路由进度条清理外层和内层 timer，连续导航不会被上一轮 timer 提前隐藏。
- 搜索历史只接受字符串数组；损坏 JSON、对象、混合类型和空字符串安全回到受限列表。

### 3.4 文档事实

- CI 名称与三个 Playwright project 已同步。
- `npm test` 的合同、模板、服务端、公开资源和运行时所有权链已同步。
- Uptime Kuma 3001 和 backup 容器的非 HTTP 验证边界已补充。
- 模板中间宽度已同步为 768–1199px。
- 历史待办中 G-5 的冲突行已移除。

## 4. 专业选择

### D-5：公开字段矩阵

不采用“默认把序列化器砍到旧矩阵”的机械方案。推荐建立显式列表/详情公开 DTO：

1. 逐字段证明公开页面或客户动作确实消费；
2. 价格、库存、内部策略、ID 和履约字段分别做推断风险评估；
3. 必须公开的先更新矩阵和合同，再保留序列化；
4. 无消费者或泄露内部策略的字段从序列化器收窄；
5. 用字段级契约同时锁定代码与矩阵。

这会改变公开接口，需产品与安全专项批准及真实接口兼容验证。

### D-6：孤儿脚本

- 接入默认链：当前通过、无运行环境副作用且职责独立的隐私合同；四个模板脚本统一通过 `test:content-templates` 接入。
- 重写或淘汰：`verify-batch1-safety`，因为当前已经失败且依赖源码正则切片。
- 由行为 spec 替代：线索状态、金价状态、Analytics guardrail 等已有或正在形成服务级测试的检查。
- 保持手动/发布前巡检：后台 UI 标准与公开商品媒体审计；后者需要明确接口环境，不能进入纯静态合同。

### D-7：倒计时时间

推荐保存带时区/UTC 的绝对 ISO-8601 时间，后台按 `Asia/Shanghai` 输入和回显，公开端展示同一绝对时刻并按页面语言解释。不得依赖服务器进程本地时区，也不得继续接受无时区自由文本。该项需模板合同、编辑器、发布校验、Renderer 和旧内容兼容一起实施。

## 5. 后续独立批次

1. **Git 可见性批次**：核对 10 个未跟踪 spec 和已修改 spec 的所有权、差异与测试证据，用户批准后才能精确暂存/提交。
2. **支付轮询批次**：in-flight、终态幂等、60 秒上限、父组件 callback 稳定性及失败/重复响应测试；命中支付审批。
3. **后台请求失效批次**：先定义统一合同，再选择局部 request token、AbortController 或共享 Hook；不得在第二档页面仍变动时批量改写。
4. **CI/Node 批次**：统一 Node 22、engines、Docker、workflow permissions/concurrency/timeout 和 Mock 商品编辑器 job；需要当前 workflow 改动先稳定。
5. **Auth / SelectionInquiry 行为测试**：登录失败、密码与 JWT 失败边界；选款咨询输入、权限、幂等和事务行为。
6. **模板合同增强**：adapter defaultProps/contentFieldKeys、appointment、倒计时和比例来源；按共享合同变更执行 24 模板浏览器验收。

## 6. 证据边界

- Playwright 的公开端三项回归运行在 development 前端，但本机 3000 后端未启动；这些用例只证明被测前端焦点、存储和 timer 行为，不是 Real API 联调。
- 商品编辑器 4 项运行在显式 Mock 模式，只证明隔离 UI 编辑流程。
- 分类引用 2 项使用自有 API 夹具，证明失败恢复与请求取消，不证明真实后端。
- 未运行 GitHub 托管 CI、真实后端联调、目标数据库、真实支付、部署或生产检查。

## 7. Git 可见性批次预审

已逐一检查 10 个未跟踪服务端 spec 的导入、被测行为、当前依赖差异和重复覆盖。结论是不应把 10 个文件一次性加入 Git；它们实际分为以下四组：

### 7.1 可作为首个低风险整文件批次

AI 分类与评价测试连同其生产边界修改可以整文件进入同一批次，不依赖 Schema、migration 或第一项目的线索隐私实现：

- `server/src/modules/ai-classify/ai-classify.controller.ts`
- `server/src/modules/ai-classify/ai-classify.service.ts`
- `server/src/modules/ai-classify/dto/ai-classify.dto.ts`
- `server/src/modules/ai-classify/ai-classify.service.spec.ts`
- `server/src/modules/reviews/reviews.controller.ts`
- `server/src/modules/reviews/dto/review.dto.ts`
- `server/src/modules/reviews/reviews.service.spec.ts`

评价测试原先没有证明订单查询包含客户归属，也没有覆盖未完成订单；公开评价也只检查了列表筛选，没有检查总数和平均分筛选。本轮已经补齐这些断言。AI + Reviews 定向结果为 6/6 通过。

以上仅是精确暂存候选，本轮没有执行 `git add`、`git commit` 或 `git push`。

### 7.2 可以拆分，但必须按 hunk 暂存

- 客户咨询分页：可纳入新 DTO、controller、分页 spec，以及 `customers.service.ts` 中仅 `getInquiries` 的修改。该 service 同时包含账户注销和隐私匿名化修改，禁止整文件暂存。
- Analytics / Statistics：可纳入共享 dataset helper、AnalyticsService 的 helper 复用、StatisticsService 的 `pageViews` dataset 过滤和对应 spec。StatisticsService 同时包含失败通知和隐私留存运营指标，顶部 import 与方法差异需要制作并验证精确 cached patch，禁止整文件暂存。

这两组只有在获准 Git 写入后，才能基于索引态重新执行 typecheck、build 和对应测试，当前工作区通过不能替代“所选 hunk 单独可构建”的证明。

### 7.3 必须随第一项目整体收敛的高风险批次

以下 6 个 spec 直接依赖账户注销、线索终态、法律保留、通知重投、隐私处置、Prisma Schema 和两条新增 migration，不能作为第三档测试资产单独入库：

- `server/src/modules/customers/customers.account-closure-privacy.spec.ts`
- `server/src/modules/leads/leads.migration-contract.spec.ts`
- `server/src/modules/leads/leads.notification-operations.spec.ts`
- `server/src/modules/leads/leads.privacy-disposition.mysql.spec.ts`
- `server/src/modules/leads/leads.privacy-disposition.spec.ts`
- `server/src/modules/leads/leads.status-integrity.spec.ts`

它们还关联 `customers.service.ts`、`leads.service.ts`、`lead-privacy-disposition.ts`、通知常量/worker、CLI、DTO/controller/module、`server/prisma/schema.prisma`、`20260827170000_add_lead_privacy_disposition` 和 `20260827180000_add_lead_closure_reason_and_reopened_activity`。其中包含隐私、权限和数据库迁移语义，必须由第一项目完成业务与迁移审查后再形成独立审批批次。

### 7.4 定向验证与未覆盖项

- 在子进程中显式清空 `PRIVACY_TEST_DATABASE_URL` 后运行全部 10 个 spec：33 项中 32 通过、1 项按设计跳过、0 失败。
- 跳过项是真实 MySQL 隐私处置测试；本轮没有连接或写入任何数据库。
- 该 MySQL spec 使用固定测试标识并且自身不清理数据，只适合由外层创建并销毁的一次性数据库。把它接入任何 CI 或人工门禁前，必须证明目标库是可丢弃实例并在 job 结束后销毁；否则存在重复运行唯一键冲突和误写非一次性库的风险。
- 当前结果只证明未跟踪文件在现有混合工作区中可运行，不证明任一拟定 Git 批次在干净 checkout、GitHub CI、真实 MySQL 或目标环境中成立。
