# 第二轮注册与短信安全修复收尾记录

> 验证时间：2026-09-15 01:15–01:40（Asia/Shanghai）
> 范围：报价真实库测试退出问题、统一 MySQL 回归、第二轮安全回归；不含新的验证码加固、生产联调或部署。

## 1. 结论

第二轮现在可以记为：**本地与专用 MySQL 的整体回归补验完成**。

- 报价测试原有业务断言并没有卡在数据库、HTTP、事务或账号注册；测试正文及显式清理已完成，但一条原始 `fetch` 的 404 Response 没有读取或取消响应体，使 Node 测试进程在统一顺序下保留连接句柄，无法产生最终 TAP 汇总并退出。
- 该测试生命周期问题已最小修复；没有修改报价业务、客户注册或短信业务实现。
- 修复后的当前清单为 15 个真实数据库文件、19 个断言，全部开始、完成并通过，0 skipped；迁移、持久化探针和专用资源清理通过，统一入口最终退出码为 `0`。
- 第二轮短信真实库 4 项和相关单元/安全 31 项仍全部通过，没有通过关闭手机号验证或跳过用例取得绿灯。

## 2. 验证版本与工作区边界

- 目录：`G:\网站搭建2`
- 分支：`codex/release-curation-20260814`
- HEAD：`cd27a5dd9f064165a0bcc029492391d7f80036d6`
- 上游：`origin/codex/release-curation-20260814`，领先 2、落后 0
- 开始状态：119 个状态条目（106 tracked、13 untracked）；结束写报告前为 120 个（106 tracked、14 untracked）。工作树始终保留，未执行 checkout、stash、reset、clean、暂存、提交或推送。
- 另一个任务在本轮早期继续修改 `EditorToolbar.tsx` 和 `editor-draft-recovery.admin.spec.ts`；它们不属于短信、报价、runner、Schema 或 migration 输入。本轮关键输入在数据库复验前后哈希一致，未把编辑器结果拼入本结论。
- 环境：Windows 11 64 位（10.0.26100），Node `v22.23.2`，npm `11.6.2`；沿用现有 Windows `node_modules`，没有安装、升级依赖或修改 lockfile。

关键最终 SHA-256：

| 输入 | SHA-256 |
|---|---|
| `server/scripts/run-real-mysql-tests.cjs` | `cba52ad6a76b36f973bd255a221ee80d55b9ebfc95115c0bb03e787027d7383e` |
| `server/src/modules/quotations/quotation-commerce.real-http.mysql.spec.ts` | `d1dc68ab4788aab372263a220432c29cd9858107e0495f7cc8ddf6521fc27618` |
| `server/src/modules/customers/customers.sms-security.mysql.spec.ts` | `1aac0e9be005435771c1e34171ed3a727462ed8a952c48731e7d39c95aa55179` |
| `server/src/modules/customers/customers.service.ts` | `f76e848c80970812dda30dc1af92ed2d439a4bbd94e94f6394882af6973e81d6` |
| `server/prisma/schema.prisma` | `be6d3a42860b545ba33b9411915b98e8c192a2fbb8ecfee13053b92eb50f620e` |
| 短信限额新增 migration | `b483b2bdb61faace3d7683934bedf940545abd9ec5df8e39bed4eddc6ed8efd4` |

可恢复副本位于 `.codex-tmp/mysql-regression-closeout-20260915-011557/before/`，只含本轮拟改的脚本/测试源码，不含 `.env`、密钥或数据。

## 3. 报价测试定位与根因证据

先单独运行报价套件时，业务测试约 7.36 秒、Node 进程约 10.12 秒完成，说明“数分钟无输出”不能直接解释成数据库死锁。旧 runner 使用 `spawnSync`，只有子进程退出后才一次性输出 stdout/stderr，所以此前看不到文件开始、内部阶段或清理状态。

增加脱敏阶段日志和每文件实时输出后，在原统一前置顺序中得到修复前证据：

```text
REAL_MYSQL_STAGE quotation-commerce restart-persistence-verified elapsed_ms=6223
REAL_MYSQL_STAGE quotation-commerce cleanup-completed elapsed_ms=6252
ok 1 - 真实 Nest HTTP + MySQL：三报价配置、客户本人确认与原子转单闭环
REAL_MYSQL_FILE_TIMEOUT: 14/15 ...; elapsed_ms=120533;
  last_stage=quotation-commerce cleanup-completed; child_cleanup=PASS
```

这排除了数据库初始化、合成账号、HTTP 请求、报价事务、两次 Nest 启停和 Prisma 显式断开仍在等待。检查测试夹具后发现，其他请求都通过 `response.json()` 或 `arrayBuffer()` 消费了响应，唯独跨客户下载的原始 404 Response 只断言状态码，没有消费 body。它是断言结束后仍能持有 HTTP 连接的生命周期缺口。

最小修复是在该拒绝路径断言后执行 `await foreignDesignDownload.arrayBuffer()`。同一统一顺序复验时，报价测试在 `cleanup-completed` 后立即产生完整 TAP 汇总，文件于 9.392 秒完成，并继续运行第 15 个文件。修复前后只改变这条响应的释放行为，形成了同顺序的失败/通过对照。未进一步依赖 Undici 私有 API 标注内部句柄类名；已确认的外部触发条件是未消费的原始 Response。

报价夹具通过 Prisma 直接创建合成客户，再走密码登录；它不依赖“无码公开注册”，也没有因第二轮强制验证码而失效。这个合法的专用数据夹具只证明报价链路，不作为完整手机号注册流程的证据。

## 4. 超时与清理边界

`run-real-mysql-tests.cjs` 现在对每个文件：

- 启动时输出序号、文件和 `timeout_ms`，结束时输出 PASS/FAIL、用时；子进程日志实时、脱敏转发。
- 使用 120 秒有限上限。当前最慢文件为后台身份真实库测试 22.709 秒，报价修复后为 9.392 秒；上限提供约 5 倍于当前最慢值的余量，不是靠无限扩大等待掩盖问题。
- 超时记录文件、用时、最后阶段，使总体结果非零；Windows 只按本入口创建的精确子 PID 执行进程树终止。
- runner 自测以 100 ms 合成超时证明 `REAL_MYSQL_TEST_TIMEOUT` 会 reject；被测子进程树清理成功，同时创建的无关同级 Node 进程仍以状态 0 自行结束。结果 9/9 pass、0 skipped、退出码 0。
- 首次统一复现的超时子进程清理为 PASS，专用容器 `hc-validation-mysql-5e919973b280` 按所有权标签删除；修复后容器 `hc-validation-mysql-304bbd2f96d8` 同样删除。结束时没有 `hc-validation-mysql-*` 残留；既有 `jewelry-*` 容器未操作。
- 系统临时目录仍有一个 00:41 创建的既存 `haichuan-real-mysql-kIlbKg` 目录，早于本轮 01:15 基线；因无法归属本轮而保留未动。本轮 runner 创建的运行目录均走各自 `finally`，未报告清理失败。

## 5. 当前统一 MySQL 逐文件结果

命令：

```powershell
.\server\scripts\run-real-mysql-local.ps1 `
  -NodePath 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe'
```

固定 MySQL 8 镜像 digest、回环随机端口 `62092`、数据库 `haichuan_ci_real_tests`、合成凭据、`tmpfs` 存储。57/57 migration 执行成功，Schema status 为最新；没有连接 `jewelry-mysql` 或真实业务库，没有调用真实短信、邮件、支付、退款、物流或 AI 服务。

| # | 文件 | 断言 | 结果 | 文件用时 |
|---:|---|---:|---|---:|
| 1 | `reliable-notifications.mysql.spec.ts` | 1 | PASS | 3.068s |
| 2 | `admin-auth-session.mysql.spec.ts` | 1 | PASS | 22.709s |
| 3 | `customers.identity-isolation.mysql.spec.ts` | 1 | PASS | 5.704s |
| 4 | `customers.sms-security.mysql.spec.ts` | 4 | PASS | 5.676s |
| 5 | `leads.workflow.mysql.spec.ts` | 1 | PASS | 4.054s |
| 6 | `dynamic-template-page-instance.real.spec.ts` | 1 | PASS | 3.171s |
| 7 | `media-publication.real.mysql.spec.ts` | 2 | PASS | 3.049s |
| 8 | `trade.real-db-concurrency.spec.ts` | 1 | PASS | 3.228s |
| 9 | `leads.privacy-disposition.mysql.spec.ts` | 1 | PASS | 3.878s |
| 10 | `selection-inquiry.mysql.spec.ts` | 1 | PASS | 2.982s |
| 11 | `media-immutability.mysql.spec.ts` | 1 | PASS | 1.646s |
| 12 | `order-operations.real-http.mysql.spec.ts` | 1 | PASS | 8.872s |
| 13 | `products.governance-media.mysql.spec.ts` | 1 | PASS | 3.906s |
| 14 | `quotation-commerce.real-http.mysql.spec.ts` | 1 | PASS | 9.392s |
| 15 | `upload.real-http.mysql.spec.ts` | 1 | PASS | 4.911s |

最终摘要：`REAL_MYSQL_GATE_PASS: 15 real test files, 0 skipped`；合成 Category 保存、读回、删除探针 PASS；统一入口退出码 `0`。

## 6. 第二轮安全与普通 Node 22 回归

- 第二轮相关单元/安全定向测试：31/31 pass、0 skipped，退出码 `0`。覆盖 SMS fail-closed/provider、手机号注册与微信新号验真、注册/session 原子边界、日志脱敏和微信绑定安全。
- 短信真实库：4/4 pass、0 skipped；有效码正常注册登录、异常/跨用途/复用拒绝、多连接冷却与每日额度、fake SMS 调用次数、发送失败/结果不明、微信新号事务回滚均重新执行。
- 最终 `npm test`：退出码 `0`；服务端 1077 tests、1058 pass、0 fail、19 skipped；根目录其余合同/脚本门禁全部完成。
- 最终 `npm run typecheck`：退出码 `0`；合同、server、client 全部通过。
- 最终 `npm run lint`：退出码 `0`。
- 目标 `git diff --check`：退出码 `0`。

19 个普通门禁 skip 不是新增失败，均因没有显式一次性数据库配置而安全跳过；本次全部在专用 MySQL 入口实际执行：通知 1、后台身份 1、客户身份隔离 1、**短信安全 4**、线索流程 1、线索隐私 1、订单运营 1、交易并发 1、动态模板 1、媒体发布 2、商品治理 1、报价 1、选款咨询 1、媒体不可变 1、媒体 HTTP 1，共 19 项。没有与本轮相关却仍缺少执行证据的普通 skip。

## 7. 本轮文件归属与未验证范围

本轮新增修改：

- `server/scripts/run-real-mysql-tests.cjs`：在第一轮/第二轮既有 runner 基础上增加逐文件实时状态、有限超时、最后阶段和精确子进程树清理。
- `server/scripts/run-real-mysql-tests.spec.cjs`：清单数量改为动态发现，并新增超时非零与清理边界自测。
- `server/src/modules/quotations/quotation-commerce.real-http.mysql.spec.ts`：增加脱敏阶段日志，并消费原始 404 Response 以释放测试连接。
- 本记录。

第二轮短信相关修改保持原样，清单见 `customer-registration-sms-security-round-2-2026-09-15.md`；本轮未修改其中的业务、DTO、配置、Schema 或 migration。第一轮本地包装脚本 `run-real-mysql-local.ps1` 也未在本轮修改。其余工作树修改均视为既有或其他任务资产，本轮未清理、回退或提交。

本轮没有新增 migration、依赖或正式配置影响。没有真实短信渠道或正式环境证据，所以结论仍限于本地 fake SMS、当前代码和专用 MySQL；不能外推为正式短信送达、生产多实例或线上发布已验证。验证码抗猜测、存储 HMAC 等下一轮事项没有启动。
