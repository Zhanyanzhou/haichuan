# 正式发布、证据、告警与回滚 Runbook

> 本文定义代码仓可提供的失败关闭接口，不表示任何环境已经验收或上线。执行目标库写入、部署、切流、恢复或备份删除前，仍需取得精确环境和动作的有效批准。真实域名、TLS、密钥、数据库连接串、监控端点与通知对象不得写入仓库证据。

## 1. 发布硬门禁

正式发布只接受 `.github/workflows/release-images.yml` 产出的 `release-output/`：

- workflow dispatch 只允许仓库默认分支，或 GitHub 明确标记为 protected 且位于 `refs/heads/release/` 下的发布分支；其他 ref 在查找质量门禁和推送镜像前失败；
- 同一 `gitSha` 的 `Quality Gate` 必须来自 `push` 且成功；
- server、client、operations 三镜像都必须有不可变 digest、OCI revision、migration bundle label；
- 构建/推送与签名是两个独立 job：构建 job 没有 `id-token`，签名 job 不检出仓库、不执行 `npm ci`、仓库脚本、镜像或构建产物中的可执行代码，只读取同一运行上游输出的固定 digest、质量门禁元数据和逐文件 SHA-256 绑定的 provenance/SBOM JSON；
- 三镜像各自必须有 Cosign Keyless 镜像签名、SLSA v1 provenance attestation 与 SPDX 2.3 SBOM attestation，并由 `release-images.yml` 在工作流内按精确 digest、GitHub OIDC issuer、workflow identity、source ref 与 source SHA 复核；
- `release-manifest.json` 使用 schema v5，明确记录 `releaseStage`、阶段绑定的 `imageTag`、Cosign 版本、标准 Sigstore bundle media type、签名身份、issuer、source ref、source SHA，以及每张镜像三个 bundle 的路径和 SHA-256；manifest 自身再生成 SLSA v1 provenance attestation，标准 protobuf bundle 作为 sidecar 上传；
- 签名固定使用已审定的 Cosign `v3.1.3`，不得使用长期私钥，不得关闭 Rekor、SCT 或 claims 校验；首次真实签名前必须把公共透明日志会记录证书、签名及制品/证明元数据的影响告知批准人，并把 `sigstore_public_log_acknowledged` 明确设为 `true`，否则工作流在构建和签名前失败；
- `docker-compose.yml` 没有 `build`、`latest` 或 `local` 回退，镜像或关键恢复参数缺失时必须失败。

本地代码合同验证：

```powershell
npm run test:release-supply-chain
npm run verify:release-images
```

### 1.1 PageDocument 内容发布与公开路由激活

后台把 PageDocument 标记为已发布，只会更新数据库中的已审核发布事实，不会修改正在运行的 client 镜像，也不会授予运行时进程生成 Nginx 路由或读取生产库的隐式权限。英文公开路由继续失败关闭：只有存在于该 client 镜像所绑定不可变 SEO snapshot 中的精确路径才返回 200；未发布、校验失败、未进入快照或未知的英文路径均返回英文 404。中文既有公开路由合同不因英文发布而改变。

需要让新发布、回滚或取消发布的 PageDocument 在公网生效时，必须把它作为一次新的内容制品发布处理：

1. 在后台完成保存、独立审核与发布，并确认匿名 published API 返回预期 locale、revision 和 content hash；此时直接访问尚未进入当前镜像的英文路由仍应为 404。
2. 对同一个受保护代码 SHA 手动运行 `Export Public SEO Snapshot`。受控预发布选择 `preproduction`，只从 `public-seo-preproduction` 环境中的专用只读数据库账号生成带 `sourceStage=preproduction` 的阶段证据；正式制品只能选择 `production`，并从 `public-seo-production` 生成带 `sourceStage=production` 的证据。两个阶段分别使用受保护环境配置，不得手工编辑 snapshot，也不得复用发布前的 artifact；不得跨阶段复用。
   GitHub hosted runner 只通过 SSH 本地转发访问来源数据库：两个环境分别保存 `PUBLIC_SEO_SSH_PRIVATE_KEY`、单条固定 `PUBLIC_SEO_SSH_KNOWN_HOSTS` 和只读 `PUBLIC_SEO_READ_ONLY_DATABASE_URL`，并分别配置 SSH 主机、用户、端口、固定 `SHA256:` host-key 指纹、本地高位端口及远端数据库主机/端口。数据库 URL 必须指向 runner 的 `127.0.0.1:<本地高位端口>`；SSH 远端只连接目标宿主机 `127.0.0.1:<远端高位端口>`。`PUBLIC_SEO_TUNNEL_TARGET_DATABASE_HOST_IDENTITY` 与 `PUBLIC_SEO_EXPECTED_DATABASE_HOST` 必须一致，单独绑定目标栈中的数据库身份，不得用上述两个 loopback 传输地址代替；CLI 继续以预期库名、`SELECT DATABASE()` 和 `USAGE/SELECT/SHOW VIEW` grants 复核数据库。目标栈显式叠加 `docker-compose.public-seo-tunnel.yml`，并把 `PUBLIC_SEO_SSH_REMOTE_DATABASE_PORT` 设置为未占用的高位端口；该 overlay 只生成 `127.0.0.1:<高位端口>:3306`，不得使用开发 override，也不得绑定 `0.0.0.0`。腾讯云安全组不得开放该高位端口或 3306。工作流无论成功失败都会停止隧道并清理临时私钥。
3. 记录新 artifact ID、artifact digest 与 snapshot hash，再以该 artifact ID 运行 `Release Images`，并令 `release_stage` 与 snapshot 的 `sourceStage` 完全一致。`preproduction` 只接受同阶段 SEO artifact，镜像仓库使用 `*-preproduction-{server,client,operations}`，标签使用 `preproduction-sha-<SHA>`，manifest 与 signing inputs 也记录 `releaseStage=preproduction`；`production` 保持既有 `*-{server,client,operations}` 仓库和 `sha-<SHA>` 标签，只接受 production artifact。两档复用同一套构建、Cosign 签名和证明验证链，但 artifact 名称按阶段隔离。生产证据和生产部署验证器固定要求 `releaseStage=production`，不得消费预发布 manifest、镜像或证明。
4. 按正常部署审批将新的固定 client digest 替换到目标环境；数据库发布本身不授权构建、部署或切流。替换后从真实 Nginx 回源验证目标英文路径为 200、对应中文路径不受影响、至少一个未发布英文路径和一个未知英文路径仍为 404，并核对镜像上的三个 public SEO label 与本次 artifact 一致。

取消发布和内容回滚遵循同一方向：数据库状态改变后必须重新导出快照、构建并部署新 client digest；旧 digest 会继续服务它冻结时的路由和 HTML，不能把“数据库已取消发布”误报为公网已经撤下。需要紧急下线时，应按获批的流量隔离或固定 digest 回滚流程处理，不能放宽英文 SPA fallback。

取得真实制品后，使用固定的 Cosign `v3.1.3` 先验证 manifest 和标准 bundle sidecar，再逐一验证 registry 中三镜像的普通签名、SLSA v1 provenance 与 SPDX 2.3 SBOM；identity、`owner/repo`、SHA、ref 与 digest 必须取自本次已批准清单，而不是从 manifest 或 bundle 反向复制为“预期值”：

```bash
COSIGN_IDENTITY="https://github.com/owner/repo/.github/workflows/release-images.yml@${RELEASE_SOURCE_REF}"
COSIGN_IDENTITY_ARGS=(
  --certificate-identity "$COSIGN_IDENTITY"
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
  --certificate-github-workflow-trigger workflow_dispatch
  --certificate-github-workflow-sha "$RELEASE_GIT_SHA"
  --certificate-github-workflow-repository owner/repo
  --certificate-github-workflow-ref "$RELEASE_SOURCE_REF"
)

cosign verify-blob-attestation \
  --bundle release-manifest.attestation.json \
  --type slsaprovenance1 \
  "${COSIGN_IDENTITY_ARGS[@]}" \
  release-manifest.json

SERVER_REFERENCE="${SERVER_IMAGE_NAME}@sha256:${SERVER_IMAGE_DIGEST}"
cosign verify --bundle attestations/server-image.sigstore.json \
  "${COSIGN_IDENTITY_ARGS[@]}" "$SERVER_REFERENCE"
cosign verify-attestation --bundle attestations/server-provenance.sigstore.json \
  --type slsaprovenance1 "${COSIGN_IDENTITY_ARGS[@]}" "$SERVER_REFERENCE"
cosign verify-attestation --bundle attestations/server-sbom.sigstore.json \
  --type spdxjson "${COSIGN_IDENTITY_ARGS[@]}" "$SERVER_REFERENCE"
```

client 与 operations 必须执行同样三项验证。每项都必须显式传入对应的 `--bundle <sidecar>`，并解析密码学验证成功后的输出，核对普通签名 subject digest、provenance subject/predicate/builder/source/ref/SHA，以及 SBOM subject 和 SPDX 2.3 内容；只验证 registry referrer 或只读取 bundle 的 `mediaType` 均不够。release artifact 中九个镜像 bundle 的实际哈希必须与 schema v5 manifest 的 descriptor 一致，manifest bundle 的 `mediaType` 以及九个镜像 bundle 的 `mediaType` 都必须是 `application/vnd.dev.sigstore.bundle.v0.3+json`。随后在已拉取三镜像的受控主机执行：

Cosign 的 `--type spdxjson` 对应 in-toto predicate type `https://spdx.dev/Document`；本项目再对 predicate 内部的 `spdxVersion: SPDX-2.3` 和 `SPDXID: SPDXRef-DOCUMENT` 做独立内容校验。不得把文档版本后缀伪写进 predicate type，或只凭 `--type` 筛选结果宣称 SBOM 版本已验证。

```powershell
node scripts/verify-release-images.mjs --manifest release-manifest.json --environment
node scripts/verify-release-images.mjs --runtime
docker compose --env-file <受控环境文件> -f docker-compose.yml config --images
```

`config --images` 输出的每一项都必须带 `@sha256:`；基础 Compose 必须出现 server/client，operations 只在显式叠加 `docker-compose.operations.yml` 时出现。

### 微信支付证书文件接口

基础 `docker-compose.yml` 有意不挂载支付证书，`readyForRealWechatPayments=false` 是支付未接线档位的正确结果，且该档位不得要求任何证书路径。真实微信支付另用 `docker-compose.wechat-pay.yml` 显式接入，不能通过修改基础 Compose 或挂载整个 secrets 目录绕过：

```bash
export WECHAT_PLATFORM_CERT_HOST_PATH=/受控绝对路径/wechat-platform-cert.pem
export WECHAT_MCH_PRIVATE_KEY_HOST_PATH=/受控绝对路径/wechat-mch-private-key.pem
npm run verify:wechat-pay-certificate-files
docker compose --env-file <受控环境文件> \
  -f docker-compose.yml -f docker-compose.wechat-pay.yml config
```

机器合同要求两个互不相同的宿主绝对文件路径、两个精确的固定容器目标、long bind、`read_only: true` 和 `create_host_path: false`。缺任一路径、相同源、目录/过宽路径、可写挂载、自动创建宿主路径或容器目标漂移均失败关闭。文件预检只检查路径和文件元数据，不读取或打印 PEM 内容；Compose `config` 也只验证解析后的静态结构。实际证书链、商户号绑定、APIv3 密钥、网络、微信回调、成功/失败/退款/对账仍必须在获批环境真实验收。

叠加 override 不会打开 `PAYMENT_GATEWAY_TRANSACTIONS_ENABLED`、`PAYMENT_GATEWAY_REFUNDS_ENABLED` 或客户交易能力。获批沙箱或受控取证启动按第 5 节在同一组 `-f` 参数下执行，凭据挂载和启动不自行授权资金操作；真实渠道测试中的付款、退款等动作须有精确测试范围授权。正式开放真实资金能力和公开放量仍须批准策略明确开放相应能力，并通过交易及外部服务门禁；未启用支付的内容/线索档位始终只使用基础 Compose。

## 2. 目标库与首管理员

operations 镜像来自与 server 相同的 Node 22 锁文件和 build 产物，包含固定版本 Prisma CLI、bash、数据库客户端以及 `backup.sh`、`check-backup-health.sh`、`restore.sh`、`restore-drill.sh`、`prune-backups.sh`。五份脚本必须逐一为 root 所有、只读可执行，并在无网络、覆盖入口的检查中通过 `bash -n`；Release Images 对这一 digest 生成 provenance 与 SBOM，并把精确入口清单写入签名 manifest。基础 Compose 的 backup service 和 operations overlay 必须消费同一个已批准 digest，且禁止 bind checkout 中的可执行脚本。下列命令只是接口示例；本仓任务不执行它们：

若这是由本 Compose 首次创建并管理的 MySQL，必须先只启动 `mysql` 并等待其健康；此时禁止启动 server、client、backup 或其他应用服务：

```bash
docker compose --env-file <受控环境文件> -f docker-compose.yml \
  up -d --no-deps --wait mysql
docker compose --env-file <受控环境文件> -f docker-compose.yml ps mysql
```

只有 `mysql` 显示 healthy 后，才能运行下列一次性 operations。若目标数据库由外部平台管理，则用平台证据证明目标实例 ready，不执行上面的本地 MySQL 命令。无论哪一种，都必须先完成 migration 状态核对、获批 migration、迁移账号能力核对和只读 preflight，之后才能启动应用服务。

```bash
docker compose --env-file <受控环境文件> \
  -f docker-compose.yml -f docker-compose.operations.yml \
  --profile operations run --rm migration-status

docker compose --env-file <受控环境文件> \
  -f docker-compose.yml -f docker-compose.operations.yml \
  --profile operations run --rm release-preflight
```

`RELEASE_PREFLIGHT_DATABASE_URL` 必须属于本次目标库、仅有 `USAGE/SELECT/SHOW VIEW`，且 `RELEASE_PREFLIGHT_READ_ONLY_AUTHORIZED=1`、环境 ID、预期库名、审批引用全部到位。保存 CLI 报告的 SHA-256，不保存连接串或审批原文。

`migration-status` 只读检查不授权 `migrate deploy`。实际 migration 必须另有目标库、待执行清单、备份回滚点、执行人与窗口批准；本 runbook 不把该批准隐含在命令中。

当前 migration bundle 含 `CREATE TRIGGER`。执行前必须把以下两类独立证据绑定到同一 `MIGRATION_TARGET_ENVIRONMENT_ID`、`MIGRATION_EXPECTED_DATABASE`、精确迁移账号和审批引用，并保存证据文件的小写 SHA-256：

1. 账号能力：DBA 或托管平台导出的有效授权证明该账号对目标库具备本批次全部 DDL 权限，其中明确包含 `TRIGGER`；不得以 root、管理员账号或另一环境的成功结果替代。
2. binary log 策略：记录 `@@GLOBAL.log_bin` 与 `@@GLOBAL.log_bin_trust_function_creators`。若 `log_bin=ON`，则必须由 DBA/托管平台预先确认并按该平台受支持方式使 `log_bin_trust_function_creators=ON`，或提供经审定的等价策略；普通账号即使具备 `TRIGGER`，在 trust 保持 OFF 且没有 `SUPER` 时仍会以 MySQL 1419 阻断 `CREATE TRIGGER`。托管服务不提供 `SUPER` 或不允许该参数时，本批次 migration 阻断，不能临时提升应用账号、改历史 migration 或把本地高权限容器结果当作放行依据。

只有上述证据及 `.env.example` 中五个 `MIGRATION_*` 绑定字段完整后，才可在另行批准的窗口使用精确迁移账号执行 `prisma migrate deploy`。`20260913121000_enforce_quotation_conversion_invariants` 的 trigger 未指定显式 `DEFINER`，因此创建者账号会成为长期 definer：迁移完成后不得删除该身份；应按 DBA 审定方案锁定账号并把运行期权限收敛到触发器执行所需最小集合，同时保留可审计的身份恢复方案。删除 definer 会使相关业务写入以 MySQL 1449 失败。

若该 migration 中断，先停止且不能直接盲重跑。当前 SQL 在首个 `CREATE TRIGGER` 前只有临时 guard；本轮精确 1419 复现未产生 m55 trigger 或后置 CHECK，但 `_prisma_migrations` 已留下 unfinished。目标环境仍必须由 DBA 对照 migration SQL、ledger、实际约束与 trigger 清单确认是否存在部分应用，再按 Prisma 官方失败迁移恢复流程制定并审批处置方案，不能从本地复现外推目标库状态。

若只读预检证明没有启用的 `SUPER_ADMIN`，才运行一次 `bootstrap-admin`。受控环境必须同时提供 `BOOTSTRAP_ADMIN_TARGET_CLASS=production`、目标环境 ID、预期数据库名、审批引用和专用 `BOOTSTRAP_DATABASE_URL`；CLI 在连接前核对 URL 库名，连接后用 `SELECT DATABASE()` 再核对当前库，任一缺失或不匹配均在密码哈希和写入前失败关闭。新密码须符合 D.25 的 6–18 位校验，通过一次性环境注入，命令结束立即清除；输出与审计只记录环境、数据库及审批引用哈希，不记录连接串、凭据或审批原文。已有合格超管时不得重复初始化。

`synthetic-test` 仅供隔离本地 QA：目标环境 ID 和专属数据库名都必须显式包含 `synthetic`、`test`、`qa`、`isolated` 或 `rehearsal` 标识。它不会自动降级生产门禁，也不能作为生产初始化证据。

在获批的目标环境中，首管理员使用 operations 入口，不运行 Demo Seed：

```bash
read -r -p "首管理员用户名: " BOOTSTRAP_ADMIN_USERNAME
read -r -s -p "首管理员密码: " BOOTSTRAP_ADMIN_PASSWORD
echo
export BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD
docker compose --env-file <受控环境文件> \
  -f docker-compose.yml -f docker-compose.operations.yml \
  --profile operations run --rm bootstrap-admin
unset BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD
```

非零退出时停止初始化，核对脱敏错误和目标库状态，不用 Seed 或手工 SQL 覆盖账号。首次登录后通过后台维护正式 SiteSettings 和页面内容，并分别保存、预检和发布。

## 3. 持久化、RPO 与恢复演练

生产必须预先核对并显式填写 `MYSQL_VOLUME_NAME`、`UPLOADS_VOLUME_NAME`、`PRIVATE_MEDIA_VOLUME_NAME`；Compose 将其作为 external volume 使用，不会因目录或 project name 改变而静默创建空卷。`BACKUP_HOST_DIR` 必须是宿主绝对路径。

环境负责人必须确定：

- `BACKUP_INTERVAL_SECONDS <= BACKUP_RPO_SECONDS`；
- `RESTORE_RTO_SECONDS` 覆盖“开始恢复”到候选服务 `/api/ready`、管理员登录和核心 smoke 全部通过；
- `BACKUP_RETENTION_DAYS` 只定义保留目标，不授权删除；
- 异地副本必须加密并具备不可变或版本化能力，且按清单复验 checksum。

`backup.sh` 对数据库、uploads、private-media 和快照元数据形成同批清单；媒体读取期间发生变化时结果是 `WARNING`，不能作为发布回滚点。`check-backup-health.sh` 使用快照起点与 RPO 判定超龄，并复验整批摘要。`prune-backups.sh` 只输出保留期外候选及摘要，本仓不提供删除入口。

完整恢复演练使用 `restore-drill.sh`，只允许：

- `RESTORE_DRILL_AUTHORIZED=1`；
- 精确匹配 `RESTORE_DRILL_EXPECTED_DATABASE` 的已存在空库；
- `RESTORE_DRILL_TARGET_CLASS=isolated-empty`；
- 位于 `RESTORE_DRILL_ROOT` 下的两个已存在空媒体目录；
- 已有隔离环境与最小权限的外部证据哈希；
- 受清单保护且年龄不超过 RPO 的备份批次。

脚本从受清单保护的快照元数据读取恢复点，记录数据库与媒体恢复耗时、RPO/RTO 目标、表与 migration 数量及证据哈希。它明确写入 `BUSINESS_RTO_MET=UNVERIFIED`；最终 RTO 必须累加故障发现、目标准备、数据库与媒体恢复、服务 `/api/ready`/登录/smoke 和切流时间，再由生产证据验证器裁决。

### 3.1 本地隔离恢复闭环

在 Windows + Docker Desktop 上，可从仓库根目录运行：

```powershell
pwsh -NoProfile -File scripts/run-operations-recovery-drill.ps1
```

该入口不读取 `.env`，只创建带随机 `hc-ops-rehearsal-*` 前缀的本地镜像、容器、网络和命名卷，并使用合成账号与合成数据。它会按当前 migration bundle 构建 Node 22 server/operations 镜像，执行 migration、一次性首管理员初始化、数据库与 uploads/private-media 同批备份、`check-backup-health.sh`、隔离空库与空媒体卷恢复、MySQL/服务端容器重建，以及 `/api/health`、`/api/ready`、恢复后合成管理员登录和恢复前后 SHA-256 指纹核对。登录探针只记录成功布尔值，不输出密码或 token。成功或失败都会只清理该随机前缀下的资源；最终 JSON 必须同时满足 `result=passed`、`healthReadyBeforeAndAfterServerRecreation=true`、`administratorLoginAfterRestore=true` 和 `cleanupRemaining=0`。

这个闭环只证明当前工作树在本机合成环境中的脚本、镜像和持久化路径可执行。它固定保留 `businessRtoMet=UNVERIFIED`，不能替代目标环境的真实数据库/媒体、外部不可变备份副本、管理员首次登录、核心业务 smoke、DNS/TLS/CSP、监控告警送达、切流或回滚证据，也不授权任何生产操作。

## 4. 边缘、告警与最终证据

外部 TLS/域名验收至少包括：正式域名解析、证书链和有效期、HTTP 到 HTTPS 跳转、可信代理头、HSTS、CSP。只保存证据文件哈希；私钥、DNS/API token 和真实监控端点留在受控系统。

当前 `client/nginx.conf` 的 `8080` 只提供 ACME 挑战，其余请求返回 HTTPS 跳转；TLS 边缘回源使用宿主 `127.0.0.1:8081` 或受控容器网络的 `client:8081`。边缘必须覆盖 `X-Real-IP` 为实际客户端的单个 IP，并由 HTTPS 终结层下发 HSTS。证书签发、续期和可信回源均须在目标环境验证，不以能访问 HTTP 页面替代。生产 Compose 必须显式指定 `-f docker-compose.yml`，禁止自动合并本地开发 override。

监控必须覆盖 `/api/health`、`/api/ready`、可信前台回源和 backup 容器健康。backup unhealthy 必须进入真实通知渠道，不能以“看日志”代替。验收时安全触发一次模拟告警，记录监控身份哈希、事件哈希、触发/收到/确认时间和责任人；不在仓库保存 webhook、收件人或 token。

将上述事实汇总为 schema v3 的 `production-evidence.json`。证据文件本身不能决定目标环境、目标版本、仓库、source ref 或 signer workflow；这些信任锚必须由发布负责人从已批准工单、冻结候选和审定的 workflow 独立写入 CLI 参数。所有 `path` 都必须位于同一个仓库内受控目录、必须是非符号链接普通文件，并给出小写 SHA-256。验证器会重新读取和计算每个 manifest、报告、runbook、claim receipt 与 manifest bundle 的哈希。

JSON receipt 只是一条结构化 claim，不具备独立证明力。每个 receipt 仍只允许 `schemaVersion`、`kind`、`provider`、`outcome`、`observedAt`、`environmentIdSha256`、`approvalReferenceSha256`、`releaseGitSha`、`manifestSha256`、`subjectSha256`，但最终 `production-evidence.json` 必须由审定的外部 evidence workflow 生成，并用 Cosign Keyless 形成标准 protobuf Sigstore attestation bundle；该 workflow 的 signer identity 必须与 release workflow 分离，且必须实际重执行或通过受信 API 验证 runtime/Compose/database/admin/storage/recovery/edge/observability/feature/external-service/rollback 各项，不能接受操作者上传的自报 JSON 后直接签名。暂未建立这种 workflow 或缺少任一真实检查时，不能生成可通过验收的 bundle，必须失败关闭。

验证器按固定顺序建立单向信任链：先做纯 schema、路径、bundle descriptor 哈希、RPO/RTO 与交叉绑定校验；顶层 `production-evidence.json` bundle 必须在调用 Cosign 前就是 `application/vnd.dev.sigstore.bundle.v0.3+json`，但仅有该字段的伪对象仍必须由后续密码学验证拒绝；再用独立 evidence signer identity 验证该 bundle。随后用 release signer identity 和 `release-manifest.attestation.json` 验证本地 manifest，并解析已验证 DSSE，核对 manifest digest、builder、Git SHA、source ref、quality run、schemaVersion 和三镜像 resolved dependencies；最后把清单中的九个 sidecar 分别传给 Cosign，验证 server/client/operations 的普通镜像签名、SLSA v1 provenance 与 SPDX 2.3 SBOM。所有 `cosign` 调用都使用独立 argv，不经过 shell，并强制标准 bundle、GitHub OIDC issuer、精确 workflow identity、workflow SHA、repository 与 ref；任一命令缺失、退出非零、predicate、identity 或 subject digest 不匹配，整体验收失败。manifest bundle 与九个镜像 bundle sidecar 由 `release-images.yml` 上传，OCI referrer 由同一工作流推送到 registry；普通 registry receipt 已从验收合同中移除。

外部 evidence workflow 至少必须把下列命令或受信提供商 API 的原始结果绑定到 claim 哈希；不存在对应接线时必须拒绝签名：

| claim 范围 | 必须由受信执行器实际产生的证据 |
| --- | --- |
| runtime identity | 在已拉取 digest 上执行 `node scripts/verify-release-images.mjs --runtime`；该脚本只读取 allowlist 中的 RepoDigest 与 OCI label |
| Compose contract | 执行 `node scripts/verify-release-images.mjs --manifest <path> --environment` 与 `docker compose ... config --images`，确认全部是批准的 digest |
| database / admin / feature gates | 使用已批准的 operations digest 实际执行 `migration-status`、只读 `release-preflight`；以同一目标和精确迁移账号的独立证据证明包含 `TRIGGER` 的 DDL 能力，并在 binary log 开启时证明受支持的 `log_bin_trust_function_creators` 策略；仅在需要时执行获批的一次性 `bootstrap-admin` |
| storage | 对目标 Docker/编排 API 核对三个独立持久卷、实际挂载和重建后持久性；仓库目前没有可独立替代目标平台 API 的通用命令 |
| recovery | 执行 `check-backup-health.sh`、获批的隔离 `restore-drill.sh`，并从监控/切流系统取得完整端到端 RTO 时间 |
| edge / observability | 从独立网络观察点验证 DNS/TLS/重定向/安全头；通过监控提供商 API 触发并确认一次安全告警演练 |
| external services | 对 email、sms、logistics、payment-gateway、wechat、object-storage 分别调用其受信健康/沙箱/回调验证接口；禁用或不适用必须来自批准策略 |
| rollback | 对签名 runbook 与固定前后 digest 做实际 dry-run/演练记录；不得用“文档存在”替代可执行性 |

这些外部结果的 JSON receipt 可以用于传递最小脱敏字段，但只有顶层 evidence bundle 验证通过后才是受信 claim；任何单独 receipt、截图或重新计算的 SHA-256 都不构成证明。

`--release-profile` 只接受服务端权威合同 `RELEASE_PROFILES` 中的 `lead-generation` 或 `commerce`。两个 profile 都必须逐项且唯一列出 email、sms、logistics、payment-gateway、wechat、object-storage；每项只允许 `verified`、`disabled` 或由 `release-policy` receipt 证明的 `not-applicable`。`commerce` 的 payment-gateway 必须是 `verified`，不能静默禁用；旧值 `content-only`、`transactional` 和任何大小写变体均失败关闭。

运行示例：

```powershell
npm run verify:production-evidence -- `
  --evidence <受控目录/production-evidence.json> `
  --evidence-root <仓库内受控目录> `
  --evidence-bundle <受控目录/production-evidence.attestation.json> `
  --environment-id-sha256 <从批准记录独立计算的环境标识哈希> `
  --approval-reference-sha256 <从批准记录独立计算的审批引用哈希> `
  --release-git-sha <已批准候选的 40 位 Git SHA> `
  --migration-bundle-sha256 <已批准候选的 migration bundle 哈希> `
  --release-source https://github.com/<owner>/<repo> `
  --repo <owner>/<repo> `
  --source-ref refs/heads/<受保护发布分支> `
  --manifest-signer-workflow github.com/<owner>/<repo>/.github/workflows/release-images.yml `
  --evidence-signer-workflow github.com/<owner>/<repo>/.github/workflows/<审定生产证据工作流>.yml `
  --release-profile lead-generation
```

`--evidence-signer-workflow` 是信任策略输入，不得从 evidence 或 bundle 内容反向复制；它必须属于同一受控仓库且不能是 `release-images.yml`。验证器会拒绝未达 RPO/RTO、缺失媒体/异地副本/管理员/TLS/告警 claim、缺少 provider receipt、profile 与功能门禁不一致，以及规范化字段名中出现 password、secret、token、数据库连接串、私钥、API key、credential 或 auth。所有 evidence、descriptor 和 receipt 对象都拒绝未知字段。仓库不提供“全 true”样例，也不提供只签名上传 JSON 的伪 evidence workflow；真实 GitHub/registry/生产验收在相应受信 workflow 和环境接线完成前保持未验证。

## 5. 发布与回滚判定树

首次上线与升级均区分“受控部署取证”和“公开放量”。按以下顺序推进，目标环境证据不作为其自身采集动作的前置条件：

1. **冻结候选与生成制品**：先按第 1 节完成同一 SHA 的质量门禁、镜像构建、签名 manifest 与证明验证。manifest 是目标环境取证的输入，不等待 PRODUCTION_READY 才生成。
2. **部署前预检与授权核对**：确认批准的环境、开放能力、固定 digest、配置、受控网络、数据库迁移方案、适用备份和回退点，以及取证步骤和责任人。已有授权精确覆盖的动作直接执行；未覆盖的部署、写库、外部发送和放量动作需取得相应批准。空库首次初始化与既有数据升级分别说明恢复方案，不假造部署前备份或数据迁移成功。
3. **受控部署，尚未放量**：在批准窗口按第 2 节执行适用的数据库与管理员步骤，再启动已验证的固定 digest。通过已批准的隔离网络、访问限制或维护入口限制访问，既有线上流量仍按升级方案处理；无可靠隔离条件时停止受影响部署。命令使用 `--no-build`，不使用浮动 tag，不自动开启真实资金或第三方发送。新环境缺少运行证据不禁止获批的取证启动，但不能因此开放公众流量。
4. **环境和业务验收**：在该候选的受控运行环境采集第 3、4 节要求的持久化、恢复、边缘、告警、外部渠道和回退证据，完成批准业务范围的真实旅程。生成并验证受信 production evidence；失败时保持不放量，按授权修复并重验受影响证据，不改写 PASS 或绕过签名验证。
5. **Go/No-Go 与公开放量**：同一候选的代码、正式内容和目标环境证据全部成立后，由发布负责人绑定环境、版本、开放能力、时间和批准记录作出判定。只有 Go 且对应放量动作已获批准，才按计划切流；较小发布档位不代表总体产品目标已完成。
6. **上线后验收与观察**：逐项验证 `/api/health`、`/api/ready`、前台、后台登录和批准业务路径，并确认告警接收与回退可用。检查严格遵守批准的账号、数据和操作范围；任一步失败就停止继续放量并按下列回滚顺序处理。

回滚顺序：

1. 隔离流量并记录故障起点、当前/上一版 manifest 与三个 digest。
2. 若本次没有 migration，或已有证据证明上一版兼容当前 schema，切回上一版固定 digest，仍使用 `--no-build`，再做完整验收。
3. 若已执行 migration 且缺少向后兼容证据，禁止自动降级数据库或盲目启动旧镜像；优先前向修复。
4. 只有数据损坏或 schema 无法前向修复时，才从已验证批次恢复到新的隔离空库和空媒体目录；完成一致性、RPO/RTO、服务与业务验收后再切流。
5. 永不原位覆盖生产库/媒体，不自动逆转 migration，不删除原库、原卷或备份。

事故记录至少保存：原因、审批引用哈希、前后 manifest/digest、migration ledger 检查点、备份清单哈希、开始/完成时间、数据库恢复秒数、服务恢复秒数和最终验证结果。
