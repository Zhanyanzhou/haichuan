# 会话撤销与受控媒体访问一致性修复——第三轮交付记录

> 执行日期：2026-09-15（Asia/Shanghai）
> 结论口径：`LOCALLY_VERIFIED`，只代表当前工作树在本地合成数据与专用 MySQL 上通过；未部署，未验证生产、CDN 或真实账号。

## 1. 结论与用户风险

原审计问题在本轮开始时仍然成立：已注销的客户或员工 access token 在自然过期前，普通受保护接口已经拒绝，但受控商品媒体仍可能继续返回文件；部分仍被 `ProductImage.url` 引用的历史 `/uploads/...` 文件还可绕过对象授权匿名读取。

根因不是图片页面是否隐藏，而是媒体自定义守卫只验证了 JWT 签名、令牌类型和账号状态，没有复用普通身份入口已有的会话家族撤销、客户 `authVersion` 和员工角色检查。修复后，受控媒体同时执行两层判断：先确认本次登录会话仍有效，再确认该身份对具体商品和具体媒体有权；任何一步失败都不会返回文件内容或下载凭据。批准公开的商品图片仍可从公开商品接口正常读取。

## 2. 验证版本、环境与工作树边界

| 项目 | 本轮证据 |
| --- | --- |
| 工作目录 | `G:\网站搭建2` |
| 开始时分支 / HEAD | `codex/release-curation-20260814` / `cd27a5dd9f064165a0bcc029492391d7f80036d6` |
| 开始时工作树 | 122 个状态条目；全部保留，未提交、暂存、stash、reset、clean 或切换分支 |
| 回归时 HEAD | `b789d5184db44a343a12f175f21d9cd6c5ad4243` |
| 收尾采样 | 2026-09-15 11:37:37 +08；137 个状态条目；当前 HEAD 与 `origin/codex/release-curation-20260814` 为 0 ahead / 0 behind |
| HEAD 变化 | 2026-09-15 10:34:48 由另一个任务提交 `fix(page-builder): restore store decoration publishing`；只涉及页面装修文件，与本轮会话/媒体文件不重叠。本轮没有执行 Git 写操作 |
| Node / npm | Windows，Node.js `v22.23.2`；沿用第一轮已安装位置 `C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe` 和现有 npm CLI |
| 数据库 | Docker 内专用 MySQL，主机仅绑定 `127.0.0.1` 随机端口，库名 `haichuan_ci_real_tests`，合成账号/媒体，存储使用 `tmpfs` |
| 外部服务 | 未调用真实短信、邮件、支付、退款、物流或 AI 服务 |

统一入口启动后，本轮关键源码没有再被写入。最终证据所对应的关键 SHA-256 包括：共享会话校验 `9b608768…ad2a4e`、媒体守卫 `dc6938cd…99d76`、静态媒体网关 `d93b655c…337c7`、真实 HTTP 测试 `fd76fcd…9f4ca3`、统一 runner `f600f6a7…e26fd7`、Prisma Schema `0e0a4f7c…c2c1fa`、新增 migration `e271007c…a99b35`。测试产物和缓存没有作为源码状态依据。

为会修改的既有文件保留了可恢复副本：`G:\网站搭建2\.codex\tmp\round3-session-media-recovery-20260915-103037`。该目录受忽略规则保护，没有复制 `.env`、密钥、真实数据库或客户资料。

## 3. 撤销语义复核

| 身份 / 事件 | 当前服务端语义 |
| --- | --- |
| 客户退出 | 有 Bearer 时只撤销该 Bearer 对应的客户会话家族；没有 Bearer 时撤销客户 refresh cookie 对应家族，不扩大为所有设备退出 |
| 客户改密 / 找回密码及现有全会话安全事件 | 增加 `authVersion` 并撤销全部客户 refresh 会话；旧 access token 随后的新请求被拒绝 |
| 客户停用 | 客户状态检查失败，旧 access token 和 refresh session 均不能继续取得身份 |
| 员工退出 | 有 Bearer 时只撤销该 Bearer 对应的员工会话家族；没有 Bearer 时撤销后台 refresh cookie 对应家族 |
| 员工改密、角色或状态变更 | 现有服务会撤销该员工全部 refresh 会话；禁用账号还由账号状态检查直接拒绝 |
| 混合 Cookie 与 Bearer | Bearer 明确优先，只撤销 Bearer 指向的家族；无效、过期或错误身份域 Bearer 返回 401，不悄悄退回 Cookie，也不误清除仍合法的 Cookie 会话 |

客户与员工身份域保持分离。客户令牌校验 `authVersion`、状态和对应客户 refresh family；员工令牌校验状态和对应员工 refresh family。某一身份分支失败不会退回另一身份或匿名分支。为兼容本次改动前已经签发的 access token，缺少 `sessionFamilyId` 的旧 token 仍按原来最多约 15 分钟 TTL 过渡；新登录、注册、刷新及微信入口签发的 token 均绑定会话家族。

## 4. 具体修复

### 会话一致性

- 新增共享校验 `server/src/common/security/access-session-validation.ts`，由普通客户守卫、可选客户守卫、员工 JWT strategy 和商品媒体守卫共同使用，统一检查身份域、账号状态、`authVersion`、会话家族有效期与撤销状态。
- 客户 access token 增加 `sessionFamilyId`；登录、注册、刷新和微信相关签发路径均绑定实际 refresh family。
- 客户与员工 logout 可精确撤销当前 Bearer 对应家族，并对无效、过期或错误身份域 Bearer 失败关闭。
- 商品媒体守卫恢复类/方法角色元数据校验；登录有效不再自动等价于能读取所有未公开媒体。

### 静态媒体旁路

- `/uploads` 的普通原图、`page-assets`、缩略图参数以及 `GET` / `HEAD` 都先检查路径是否仍被 `ProductImage.url` 引用；受控商品媒体不能再从静态路径匿名获取。
- `page-assets` 自身已有的公开授权与完整性检查继续保留；未把全部公开图片改成登录后访问。
- 受控接口成功响应继续使用 `private, no-store`（或现有更严格 `no-store`）策略；拒绝响应为 JSON 错误，不含受控文件字节。
- 给 `ProductImage.url` 增加索引 `product_images_url_idx`，避免每次静态请求为判定历史引用而扫描整表。新增 migration 只创建索引，不改字段、不回填数据，也没有修改历史 migration。

## 5. 真实 HTTP / MySQL 证据

修复前的定向复现观察到：撤销前媒体可读；管理员退出后普通 profile 已为 401，但同一旧 token 请求受控媒体仍为 200；对应静态 `/uploads` 历史文件也为 200。该结果证明是媒体入口撤销不一致，而不是浏览器缓存或仅清除本地存储。

最终定向真实 HTTP 测试：

```text
node --require ts-node/register --test src/modules/products/media-session-revocation.real-http.mysql.spec.ts
# tests 7, pass 7, fail 0, skipped 0；exit 0
```

已覆盖并通过：

- 客户和员工撤销前，对各自有权素材返回 200，并带 `no-store`；
- 客户当前家族退出后，旧 access token 对普通接口和受控媒体均返回 401，另一合法家族仍为 200；
- 客户改密/全会话撤销后，旧 access token 无需等待自然过期即返回 401；
- 员工当前家族撤销后旧 token 返回 401，另一家族不被误撤销；员工停用后旧 token 返回 401；
- 无权客户得到对象不可见的 404；缺少所需角色的员工得到 403；缺失、无效、过期、错误身份域凭证得到 401；
- 无效或错误身份域 Bearer 与合法 Cookie 同时出现时，logout 返回 401，合法 Cookie 家族仍可继续使用；
- 历史普通 `/uploads`、重叠 `page-assets` 的 `GET`、`HEAD` 和 `?width=480` 均返回 404，响应不含受控媒体内容；
- 已批准公开商品图片的公开接口仍返回 200。

定位测试过程中先后发现两项夹具问题：Cookie 请求缺少现有 CORS `Origin` 而返回 403；同一用例第六次员工登录触发现有 5/min 限流而返回 429。夹具随后改为发送合成同源 Origin，并复用已创建的未受影响会话，不关闭 CORS、不提高限额、不扩大超时、不修改业务断言。最终结果来自修正夹具后的单次完整执行。

## 6. Node 22 门禁和统一真实 MySQL 回归

普通门禁使用：

```powershell
$node22 = 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe'
$npmCli = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$env:PATH = "$(Split-Path -Parent $node22);$env:PATH"
& $node22 $npmCli test
& $node22 $npmCli run typecheck
& $node22 $npmCli run lint
```

结果：

| 检查 | 结果 |
| --- | --- |
| 根 `npm test` | exit 0；1083 项，1063 通过，20 显式跳过，0 失败 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| 会话/媒体针对性单元测试 | 10/10 通过；exit 0 |
| migration 清单与升级演练自测 | 5/5 通过；exit 0 |

新增索引后第一次普通门禁按旧清单期待 57 个 migration 而失败；同步当前精确迁移清单为 58 并补充尾部顺序断言后，以上完整普通门禁重新执行并通过。这属于测试合同随兼容 migration 更新，不是忽略失败。

统一入口使用：

```powershell
.\server\scripts\run-real-mysql-local.ps1 -NodePath 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe'
```

最终退出结果：`exit 0`。数据库绑定 `127.0.0.1:56655`，58 个已有 migration 全部执行；16/16 文件均开始、完成并 PASS，0 跳过；最后的合成分类记录保存、读回和删除探针通过。

| # | 真实数据库测试文件 | 结果 |
| --- | --- | --- |
| 1 | `reliable-notifications.mysql.spec.ts` | PASS |
| 2 | `admin-auth-session.mysql.spec.ts` | PASS |
| 3 | `customers.identity-isolation.mysql.spec.ts` | PASS |
| 4 | `customers.sms-security.mysql.spec.ts` | PASS（第二轮安全回归仍通过） |
| 5 | `leads.workflow.mysql.spec.ts` | PASS |
| 6 | `dynamic-template-page-instance.real.spec.ts` | PASS |
| 7 | `media-publication.real.mysql.spec.ts` | PASS |
| 8 | `trade.real-db-concurrency.spec.ts` | PASS |
| 9 | `leads.privacy-disposition.mysql.spec.ts` | PASS |
| 10 | `selection-inquiry.mysql.spec.ts` | PASS |
| 11 | `media-immutability.mysql.spec.ts` | PASS |
| 12 | `order-operations.real-http.mysql.spec.ts` | PASS |
| 13 | `products.governance-media.mysql.spec.ts` | PASS |
| 14 | `media-session-revocation.real-http.mysql.spec.ts` | PASS |
| 15 | `quotation-commerce.real-http.mysql.spec.ts` | PASS |
| 16 | `upload.real-http.mysql.spec.ts` | PASS |

普通门禁中的 20 个显式跳过包含需显式 `RUN_REAL_MYSQL_TESTS=1` 的真实数据库外层套件；它们不是 20 个测试文件，也不能直接换算为业务覆盖率。与本轮直接相关的新媒体撤销套件在普通门禁中按条件跳过，但已被统一入口实际执行为 7 个断言；第二轮短信套件也在统一入口实际执行为 4 个断言。统一入口内为 0 跳过。其余跳过项沿用第二轮已登记的真实库条件映射，本轮没有把全仓跳过项清零或扩建测试架构。

## 7. 修改归属、临时资源与差异复核

本轮新增：

- `server/src/common/security/access-session-validation.ts`
- `server/src/modules/products/media-session-revocation.real-http.mysql.spec.ts`
- `server/prisma/migrations/20260915113500_add_product_image_url_index/migration.sql`

本轮修改集中在：会话 principal 类型与 refresh family 精确撤销；员工/客户守卫和 logout；客户及微信 access token 签发；商品媒体守卫；公开 uploads 网关与历史引用查询；对应单元/真实 HTTP 测试；真实 MySQL runner；migration 清单自测；Prisma Schema。`customers.service.ts`、`schema.prisma`、真实库 runner、上传网关/服务和数据库演练脚本等文件在本轮开始前已有第二轮或其他未提交修改，本轮只叠加目标符号，没有覆盖其余内容。大量页面装修、交易、短信及发布文件属于原有或其他任务修改，本轮未清理、回退或归入本轮成果。

最终差异复核确认：没有缩短断言、跳过失败测试、关闭角色/CORS/限流、公开私有目录或放宽对象权限；未升级依赖、未改 lockfile、未改历史 migration、未部署。一次非本轮页面装修提交发生在共享工作区，文件不重叠，但因此本轮报告同时保留开始 HEAD 与实际回归 HEAD，不能把整个脏工作树宣称为本轮单独产物。

每次真实库运行只创建带 `com.haichuan.validation-run` 归属标签的专用容器，结束后按精确容器名清理。最终 `docker ps -a --filter label=com.haichuan.validation-run` 无残留；临时媒体目录由测试清理，数据库使用 tmpfs，无持久卷。既有 `jewelry-*` 容器、业务库和生产资源未访问或修改。

## 8. 未验证范围与状态

- 生产/预发布尚未部署本修复，真实域名、Nginx/CDN/浏览器边缘缓存和正式账号撤销行为未验证。
- 无法撤回用户在授权有效时已经下载或正在传输的文件；本轮验收针对撤销之后发起的新请求。
- 兼容窗口内，升级前签发且没有 `sessionFamilyId` 的 access token 不具备按家族即时撤销能力，只能依赖 `authVersion`、账号停用或原 15 分钟左右 TTL。上线时应记录部署时间并在一个旧 token TTL 后再完成过渡复核；本轮未强制所有用户登出。
- 新索引仅在可丢弃空库执行；在目标库运行 migration 前仍需按正式变更流程评估表规模、建索引锁/负载、备份和回退，不得用本地结果代替生产授权。
- 本轮没有开始验证码抗猜测、HMAC、后台登录锁定或其他安全模块修复。

原审计项“已撤销令牌仍能在短时间内读取受控商品媒体”现标记为：**本地已验证修复（`LOCALLY_VERIFIED`），等待目标环境部署与缓存/过渡窗口复核**。第三轮到此停止，不包含提交、推送、部署或下一轮安全加固。
