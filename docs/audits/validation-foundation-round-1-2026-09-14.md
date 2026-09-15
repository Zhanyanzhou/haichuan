# 第一轮修复交付：本地验证环境与真实 MySQL 入口

> 执行日期：2026-09-14（Asia/Shanghai）
> 范围：只修复验证环境、真实 MySQL runner、测试夹具和本地测试配置；未修改业务实现、Schema、历史 migration、部署配置或正式开关。

## 1. 状态保护与环境

- 开始快照：`G:\网站搭建2`，分支 `codex/release-curation-20260814`，提交 `cd27a5dd9f064165a0bcc029492391d7f80036d6`，相对 upstream 领先 2、落后 0。
- 开始时工作树共 82 个状态条目：74 个 tracked、8 个 untracked。未切分支，未暂存、stash、reset、clean、提交或推送。
- 本轮结束前复核提交未变。开始时 82 项均保留；其中 runner 及其单测两项存在原有修改，本轮在其上继续修改，其余原有修改未纳入本轮。
- 原有版本副本与脱敏日志位于忽略目录 `.codex-tmp/validation-foundation-20260914-230544/`。未复制 `.env`、密钥、客户或真实数据库数据。原先干净的文件仍可由当前 HEAD 恢复。
- 实际验证环境：Microsoft Windows 11 专业工作站版 64 位（10.0.26100），Node.js `v22.23.2`，npm `11.6.2`。
- 依赖位置仍为根目录、`client/node_modules`、`server/node_modules` 中现有的 Windows 平台依赖；没有安装或升级依赖，没有改写三个 lockfile，也没有永久改变全局 Node。

## 2. 原来不能完整验证的原因

1. 默认 PATH 实际指向 Node `25.2.1`，而项目和 CI 基线要求 Node 22；`fnm use` 的提示与真实 PATH 结果不一致。
2. 先前 Linux 容器直接挂载了 Windows `node_modules`，导致 rolldown 等原生 binding 平台不匹配。当前改用已有 Windows Node 22，不跨系统复用原生依赖。
3. MySQL 出现监听日志只说明进程启动，不证明测试账号已能通过 TCP 登录。先前流程没有形成“认证探针成功—目标库核对—迁移—测试”的连续证据。
4. 真实库 runner 只登记了 5 个文件，另外 9 个现有候选不会进入统一入口；其中 4 个还要求各自的显式开关、数据库变量和本地端口。
5. runner 从含本地环境文件的目录运行且测试共享库状态，曾分别触发 ts-node 配置加载失败、跨文件数据干扰和前端冷启动超时；这些属于环境/夹具问题，不是业务断言失败。

## 3. 本轮修复

- 新增 `server/scripts/run-real-mysql-local.ps1`：创建名称和 label 唯一的 MySQL 8.0 容器，只绑定 `127.0.0.1` 随机端口，数据库固定为 `haichuan_ci_real_tests`，存储使用 tmpfs；凭据每次随机生成。
- 就绪检查改为测试账号的 authenticated TCP `mysqladmin ping`，随后核对数据库名、当前账号和 trigger migration 所需策略；不以端口监听代替可连接。
- 包装脚本只在 owner label 精确匹配时删除自己的容器。成功路径和故障路径均验证无新增容器泄漏。
- runner 在系统临时目录复制当前 `server/prisma`（排除 `.env`），使用当前工作树源码和当前 server 依赖，显式固定 `TS_NODE_PROJECT` / `TS_NODE_CWD`，并清除外部集成配置。
- runner 自动发现当前 `(real|mysql).*spec.ts` 候选；发现新增遗漏或失效登记会失败，不再静默漏测。
- 14 个文件逐文件串行运行，并在每个文件前重置专用库。该措施证明串行夹具隔离；本轮不宣称并行隔离已经解决。
- 4 个专用 HTTP/文件测试可接受统一 runner 已验证过的专用数据库 URL，并继续要求各自测试开关和临时本地端口。交易和真实支付开关保持关闭。
- 修复员工真实鉴权测试的工作目录定位、Playwright 首次 Vite 冷启动超时，以及咨询流程测试中两个独立通知场景同时被 worker 统计的夹具边界。未降低鉴权、业务状态或数据一致性断言。
- 末尾增加合成 `Category` 保存、按主键读回、精确删除探针。

## 4. 可复用命令与结果

完整普通门禁（必须把 Node 22 目录放在当前进程 PATH 首位，使 npm 子进程也使用 Node 22）：

```powershell
$node22 = 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe'
$npmCli = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$env:PATH = "$(Split-Path -Parent $node22);$env:PATH"
& $node22 $npmCli test
```

结果：退出码 `0`。服务端汇总 `1069 tests / 1054 pass / 0 fail / 15 skipped`；15 项是普通门禁中需显式环境的既有跳过项，不被伪装为执行。其他根门禁均退出 0。

完整真实 MySQL 入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File server/scripts/run-real-mysql-local.ps1
```

也可用 `-NodePath <Node 22 node.exe>` 精确指定。本机复验关键摘要：

```text
LOCAL_REAL_MYSQL_READY: Windows; node=v22.23.2; host=127.0.0.1; database=haichuan_ci_real_tests; storage=tmpfs
All migrations have been successfully applied.
Database schema is up to date!
REAL_MYSQL_PERSISTENCE_PROBE_PASS: synthetic category saved, read back and removed
REAL_MYSQL_GATE_PASS: 14 real test files, 0 skipped; migrated disposable database
LOCAL_REAL_MYSQL_CLEANUP_PASS: removed owned container ...
```

结果：退出码 `0`。当前 56 项已有 migration 均成功执行；数据库可连接，合成记录可保存、读回并删除，测试确实进入执行阶段。没有连接或修改现有 `jewelry-mysql`；清理后它仍为 `healthy`。

runner 自身单测：`node --test server/scripts/run-real-mysql-tests.spec.cjs`，`8/8 pass`，退出码 `0`。PowerShell AST 解析错误 `0`，目标 diff check 退出码 `0`。

## 5. 当前真实数据库测试纳入清单

| 测试文件 | 主要风险 | 特殊条件 / 外部服务 | 结果 |
|---|---|---|---|
| `reliable-notifications.mysql.spec.ts` | 通知原子去重、并发领取、幂等、退避、死信 | fake mailer；故意模拟 SMTP 失败，不外发 | PASS |
| `admin-auth-session.mysql.spec.ts` | 员工登录、身份域、RBAC、会话吊销、审计 | 本地临时 Nest/Vite/Chromium；合成账号 | PASS |
| `customers.identity-isolation.mysql.spec.ts` | 客户资源、双身份域、改密后的会话隔离 | 合成账号，无外部服务 | PASS |
| `leads.workflow.mysql.spec.ts` | 咨询幂等、领取 CAS、跟进、回复、失败重投审计 | fake mailer；通知场景精确隔离 | PASS |
| `dynamic-template-page-instance.real.spec.ts` | 模板版本、页面保存/发布回读、草稿与归档 | 专用库 | PASS |
| `media-publication.real.mysql.spec.ts` | 媒体授权继承/撤销/漂移、并发自审审计 | 专用库，共 2 个 test | PASS |
| `trade.real-db-concurrency.spec.ts` | 签收与退款额度行锁、审计失败回滚 | 专用库 | PASS |
| `leads.privacy-disposition.mysql.spec.ts` | 匿名化、法律保留、CAS、账户注销边界 | 专用库 | PASS |
| `selection-inquiry.mysql.spec.ts` | 并发选款咨询幂等与结果隔离 | 专用库 | PASS |
| `media-immutability.mysql.spec.ts` | 发布事实允许 INSERT、拒绝 UPDATE/DELETE | 需要 migration trigger trust | PASS |
| `order-operations.real-http.mysql.spec.ts` | 订单、付款事实、履约、售后、退款权限与状态 | 临时本地端口；支付网关关闭；无真实资金 | PASS |
| `products.governance-media.mysql.spec.ts` | 商品发布角色、媒体撤权/到期、重启恢复 | 显式测试开关，专用库 | PASS |
| `quotation-commerce.real-http.mysql.spec.ts` | 报价配置、客户确认、并发原子转单 | 仅测试实例临时开启报价转单；支付关闭 | PASS |
| `upload.real-http.mysql.spec.ts` | 媒体登记、访问、失败关闭、归档、重启持久化 | 临时目录与端口；仅合成文件 | PASS |

当前自动发现的 14 个候选全部纳入并执行，遗漏 0，未执行 0。没有以测试文件数推断整站业务覆盖率；支付、短信、邮件、物流、AI 等供应商沙箱或生产能力不属于本入口，也未调用。

## 6. 失败分类与修改边界

- 已解决的环境/测试问题：Node 版本选择、跨平台原生依赖误用、认证就绪探针、ts-node 项目定位、候选漏登、专用测试开关接线、逐文件数据隔离、Vite 冷启动、咨询通知夹具边界、PowerShell 清理引号。
- 已有业务断言失败：本轮最终执行中为 `0`。调试期出现的 503、SMTP warning/error 均是用例明确验证的关闭或失败路径，相关测试为 PASS；没有调用真实服务。
- 未验证：供应商沙箱、正式环境、生产数据和并行运行隔离。本轮没有借机修复审计报告里的业务缺陷。

本轮代码/测试文件：

- 原有修改上继续编辑：`server/scripts/run-real-mysql-tests.cjs`、`server/scripts/run-real-mysql-tests.spec.cjs`。
- 本轮新增：`server/scripts/run-real-mysql-local.ps1`、本交付记录。
- 本轮测试夹具/配置：`server/src/modules/auth/admin-auth-session.mysql.spec.ts`、`server/src/modules/leads/leads.workflow.mysql.spec.ts`、4 个专用 real-http/mysql spec、`client/tests/admin-auth-real-closure.spec.ts`。
- 未修改 package manifest、lockfile、业务实现、Schema、migration、规则或部署配置。

临时资源：本轮专用 MySQL 容器及 tmpfs 已精确清理，验证容器剩余 `0`；系统临时 runner 目录由 runner finally 清理。忽略目录中的“修改前副本”和脱敏日志按保护要求保留，可恢复、未提交。

## 7. 下一轮主推荐

优先验证并修复“短信验证码发送限额的并发原子性”。当前 `requestSmsCode` 仍是“查询 60 秒记录 → 统计当日次数 → 新建记录”的分步流程；并发请求可能同时通过查询与计数，造成冷却/日限额绕过、短信费用滥用和客户身份入口风险。它尚未进入上述 14 个真实数据库候选。下一轮应先用专用库和 fake SMS 建立并发复现，再在不外发短信的条件下修复；不要直接从静态疑点宣布线上已受影响。
