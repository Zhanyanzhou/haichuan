# 客户注册与短信验证码安全修复：第二轮交付记录

> 完成时间：2026-09-15（Asia/Shanghai）
> 范围：客户手机号注册、微信新手机号建号、公开 REGISTER/LOGIN 验证码发送限额及直接相关测试。
> 结论：本地机制修复完成；未接通或验证真实短信、生产配置与历史真实账户。

## 1. 本轮解决的用户风险

修复前，公开注册是否校验手机号由 `SMS_VERIFICATION_REQUIRED` 决定，而仓库默认值允许关闭。攻击者可以抢先用尚未注册的他人手机号创建客户账户并取得客户令牌/会话。前端还会在验证码要求查询失败时隐藏验证码，进一步放大了该风险。

现在，手机号作为新客户身份时由服务端无条件要求 `REGISTER` 验证码；配置开关不能关闭这项身份校验。验证码必须匹配手机号、用途、有效期和未使用状态，并在客户与会话创建的同一个 Serializable 事务中一次性消费。微信新手机号建号也使用同一原子边界；创建失败会回滚验证码消费。

这没有把所有客户流程改成“必须手机注册”：历史客户仍可按原密码登录，已有手机号绑定微信仍走原密码证明；普通联系号码也没有被改造成身份凭据。

## 2. 开始基线与工作区保护

- 目录：`G:\网站搭建2`
- 分支：`codex/release-curation-20260814`
- HEAD：`cd27a5dd9f064165a0bcc029492391d7f80036d6`
- 上游：领先 2、落后 0
- 包版本：根、client、server 均为 `1.0.0`
- 2026-09-15 00:02:39 +08:00：96 个状态条目，其中 86 个 tracked、10 个 untracked。
- 本轮没有 checkout、stash、reset、clean、stage、commit、push、部署或生产操作。
- 可恢复副本：`.codex-tmp/sms-security-round-2-20260915-000239/before/`，仅含源码/配置副本，不含 `.env`、密钥、客户或数据库数据。该目录被忽略，暂时保留供验收后恢复。
- `server/scripts/run-real-mysql-tests.cjs` 在基线前已有第一轮修改；本轮只在现有清单中登记短信真实库测试。
- `server/src/modules/wechat-auth/wechat-auth.service.ts` 在基线前已有其他修改；本轮只改手机号格式和新号建号的验证码事务边界。
- 工作树在本轮继续出现其他任务的非短信改动；测试只使用明确记录的稳定时段，不把不同代码状态拼成同一通过结论。

## 3. 具体修复与行为对比

| 项目 | 修复前 | 修复后 |
|---|---|---|
| 公开手机号注册 | 配置为 false 时不校验短信码，仍创建账户和会话 | DTO 必填，service 无条件消费 `REGISTER` 码；无码、错码均不能建号 |
| 前端注册 | 接口失败或返回 false 时隐藏验证码 | 注册模式始终展示并提交验证码；服务端仍是最终权威 |
| 验证码绑定 | 已有 phone/hash/purpose/expiry/usedAt 校验 | 保留这些校验与 CAS，并把消费放进客户/会话创建事务 |
| 微信新手机号 | 先消费验证码，再另行创建账户；建号失败会烧码 | 消费与建号在同一 Serializable 事务，失败整体回滚 |
| 同号并发发码 | `find/count/create` 分离，多连接均可穿透 | 每手机号一条共享状态行，事务加锁、P2034 有限重试；不同号码不互锁 |
| 冷却与日额度 | 当前规则为 60 秒、服务端本地自然日 10 次，检查非原子 | 保留原规则；额度在外部发送尝试前占用，REGISTER/LOGIN 按手机号共享 |
| 升级当天历史额度 | 新计数状态可能从 0 开始 | 首次初始化从当日旧验证码记录继承 `COUNT` 和最近 `createdAt` |
| 发送失败/超时 | 公开发码留下可消费记录；超时与失败混为一类 | 记录先禁用，明确受理后才启用；拒绝/崩溃/结果不明均不可消费 |
| 重试与副作用 | 无稳定业务幂等键 | 使用短信记录 ID 形成稳定幂等键；未知结果不自动重发，不能声称外部副作用已回滚 |
| 通道不可用 | 可与关闭验证组合成直接注册 | 直接拒绝发码/注册，不降级为跳过验证 |

发送额度的明确语义：只要已经准备调用外部通道，就占用当日额度和 60 秒冷却；确定失败或结果不明也不自动返还。原因是外部短信可能已经发出，数据库回滚不能撤销该副作用。调用方须等冷却后显式重试，未知结果不会在后台自动重复发送。

## 4. 最小数据库变更

新增 migration：`20260915002000_add_customer_sms_rate_limits`，只创建 `customer_sms_rate_limits`：手机号主键、自然日窗口、当日计数、最近尝试时间和更新时间。

- 必要性：现有 `customer_sms_codes` 只有普通索引，无法给“尚无记录的手机号”提供稳定行锁；仅靠范围锁会在高并发下产生死锁/重试耗尽，无法保证一个合法请求成功。
- 数据影响：不修改客户、历史验证码或既有 migration；状态行在号码首次发码时建立，并从当天历史记录继承额度。
- 兼容性：旧代码会忽略新表；回退代码时该表可保留但不再生效。正式滚动发布若同时运行新旧实例，旧实例仍不认识新计数行，因此必须在后续获批部署流程中缩短混跑窗口并验证切换，本轮未部署。
- 隐私待办：状态表会保留曾请求验证码的手机号，目前没有保留/清理策略；需要在后续隐私数据生命周期任务中处理。

## 5. 修复前复现与修复后验证

### 5.1 修复前证据

在 Node 22、专用空 MySQL、6 个 Prisma 连接和 fake SMS 下，新增测试先对旧实现稳定复现：

- 同一合成号码 6 个并发请求：6 个请求通过、fake SMS 调用 6 次；预期只能 1 次。
- 已有当日 9 次记录再并发 2 次：2 次均通过，最终记录 11 条；预期只能再通过 1 次。
- 结果：新套件 1 pass / 2 fail，退出码 1。该失败用于证明竞争窗口，不是偶然延时复现。

### 5.2 修复后定向结果

| 验证 | 当前结果 |
|---|---|
| 相关单元测试 | 31/31 pass，0 skipped，退出码 0 |
| 专用 MySQL migration | 57/57 全部应用，退出码 0 |
| 短信真实库套件 | 4/4 pass，0 skipped，退出码 0 |
| 注册界面 Playwright | desktop + 390×844：2/2 pass，退出码 0；为 route Mock UI 证据 |

真实库 4 项覆盖：

1. 缺少、错误、过期、已使用、手机号不匹配、用途不匹配均拒绝；有效码可注册，随后可用密码登录。
2. 多连接同时请求同一号码，只创建一次额度、只调用一次 fake SMS。
3. 当日 9 次历史记录后只允许第 10 次；人为越过冷却后第 11 次仍因日额度拒绝；不同号码可并行；失败/结果不明只调用一次、记录保持不可消费、立即重试受冷却限制；通道不可用不建记录。
4. 微信新号创建失败时，验证码消费随事务回滚。

定向测试使用的资源：Windows Node `v22.23.2`、固定 MySQL 8 镜像 digest、回环随机端口、库名 `haichuan_ci_real_tests`、`tmpfs` 存储、合成凭据与合成号码。最终成功运行的容器为 `hc-sms-r2-4681bf781001`、端口 `63849`；结束时已按所有权标签删除。没有真实短信调用。

## 6. Node 22 普通门禁和真实 MySQL 统一入口

实际环境：Windows；Node `v22.23.2`；npm `11.6.2`。未改全局默认版本、依赖或 lockfile。

可复用命令：

```powershell
$node = 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe'
$npm = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$env:Path = 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation;' + $env:Path
& $node $npm test
& $node $npm run typecheck
& $node $npm run lint
.\server\scripts\run-real-mysql-local.ps1
```

最终普通门禁：

- `npm test`：退出码 0。服务端发现 1077 项，1058 pass、0 fail、19 skipped；根目录其余合同/脚本套件也全部通过。
- `npm run typecheck`：退出码 0，合同、server 与 client 类型检查通过。
- `npm run lint`：退出码 0。
- 19 个 ordinary-test skip 中，本轮直接相关的是新增真实库文件的 4 项；它们已由专用 MySQL 4/4、0 skipped 补证。其他 skip 不属于本轮，没有为了清零而扩范围。

当前真实 MySQL 统一入口共登记 15 个文件：11 个 shared（通知、后台身份、客户身份隔离、**本轮短信安全**、线索、动态页面、媒体发布、交易并发、隐私处置、选款咨询、媒体不可变）和 4 个 isolated（订单操作、商品治理、报价商业闭环、媒体 HTTP）。新增短信文件确实位于 `sharedTestFiles`，不是只存在但入口不执行。

统一入口在候选快照上确认连接、迁移并实际执行到本轮短信套件 4/4 通过；随后既有 `quotation-commerce.real-http.mysql.spec.ts` 连续数分钟无输出且没有套件级超时。本次由本任务启动的精确进程被中止，退出码 1，专用容器 `hc-validation-mysql-78ccdf034c73` 随后按精确名称清理。由于修复后没有再次重复同一种挂起运行，本轮不能声明“15 个文件统一入口全通过”；这是测试入口剩余可靠性问题，不是短信业务断言失败，也没有通过排除报价测试、扩大超时或标记 skip 掩盖。

## 7. 本轮变更文件

业务与配置：

- `.env.example`
- `client/src/pages/public/CustomerCenter/AccountExperience.tsx`
- `server/src/common/sms/sms.module.ts`
- `server/src/common/sms/sms.service.ts`
- `server/src/modules/customers/customers.service.ts`
- `server/src/modules/customers/dto/customer-auth.dto.ts`
- `server/src/modules/wechat-auth/wechat-auth.service.ts`
- `server/src/modules/wechat-auth/dto/bind-wechat.dto.ts`
- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260915002000_add_customer_sms_rate_limits/migration.sql`（新增）

测试与入口：

- `client/tests/public-access.spec.ts`
- `server/src/common/privacy/notification-log-privacy.spec.ts`
- `server/src/common/sms/sms.provider.spec.ts`
- `server/src/modules/customers/customer-password-policy.spec.ts`
- `server/src/modules/customers/customers.session-registration.spec.ts`
- `server/src/modules/customers/customers.sms-security.mysql.spec.ts`（新增）
- `server/scripts/run-real-mysql-tests.cjs`（在第一轮修改基础上仅登记新文件）
- `server/scripts/database-upgrade-rehearsal.mjs`
- `server/scripts/database-upgrade-rehearsal.test.mjs`

没有依赖、lockfile、历史 migration、正式部署配置或长期规则改动。最终 `git diff --check` 退出码 0；扫描未发现本轮新增 skip、关闭校验或 `registerRequired:false` 绕过。

## 8. 未验证范围与后续建议

- 没有真实短信账号，因此只声明本地 fake SMS、数据库和接口机制成立，不声明阿里云短信已接通或正式送达。
- 没有用真实 10 秒定时器和 SDK 模拟“超时后晚到受理”；源码会保持记录禁用且不自动重发，但仍需供应商沙箱验证。
- 没有读取或修改真实客户。现有 Schema 没有 `phoneVerifiedAt`，无法区分历史直注册账号是否曾证明手机号归属。建议保留原密码登录兼容；在高信任操作前是否补验、是否新增验证状态须单独业务决策，不能批量标记已验证。
- 验证码仍为可离线枚举的 `SHA-256(phone:六位码)`，没有错误尝试次数上限，新码也不主动废止同用途旧码。这是审计遗留风险，不影响本轮关闭“无码注册”和并发超发的结论。
- 没有生产域名、真实短信配置、滚动发布或多主机目标环境证据；生产可用性仍未验证。

推荐下一轮优先处理：**验证码抗猜测与存储加固**。依据是当前六位码在有效期内缺少数据库级失败尝试上限，且数据库只读泄露后可离线枚举。建议统一增加原子尝试次数/锁定策略，并评估使用独立 HMAC pepper；新增真实 secret 与生产配置需另行授权。

## 9. 原审计问题映射

- “公开注册可能抢占他人手机号身份”：本地代码、单元、真实 MySQL 正反路径已修复并验证。
- “短信验证码发送限额先查后写、并发可穿透”：已稳定复现；公开 REGISTER/LOGIN 发码已改为 MySQL 共享状态行和事务锁，并由多连接测试验证。
- “短信渠道缺失时身份入口可能降级”：已改为 fail closed；正式渠道是否可用仍未验证。
- 其他安全审计项未在本轮改动，也没有被标记为已解决。
