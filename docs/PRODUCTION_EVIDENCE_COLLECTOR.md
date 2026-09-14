# Production Evidence Collector 安装与运行合同

> 本文只说明目标环境固定命令的安装和输入合同。它不代表当前环境已经满足生产门禁，也不提供“全通过”示例。正式证据仍以 `docs/PRODUCTION_RELEASE_RUNBOOK.md` 和签名工作流的实际结果为准。

## 1. 固定入口

`.github/workflows/production-evidence.yml` 通过 SSH 发送固定字符串 `haichuan-production-evidence-collect`。目标账号的 `authorized_keys` 必须忽略客户端命令，强制执行 root 所有的 collector：

```text
restrict,command="sudo -n /usr/local/bin/haichuan-production-evidence-collect" ssh-ed25519 <仅供 production-evidence environment 使用的公钥>
```

不要把该账号加入 `docker` 组，也不要授予交互式 shell。仅允许下面这个 root 所有入口的无参数 `sudo`，并确保 `sudo` 使用固定 `secure_path`：

```text
haichuan-evidence ALL=(root) NOPASSWD: /usr/local/bin/haichuan-production-evidence-collect
```

安装时把候选对应的仓库只读副本放在 `/opt/haichuan/release-contract`，执行根包的锁定安装以提供 `js-yaml`，并核对其 `HEAD` 与待取证 SHA 一致。collector 和配置均由 root 安装；GitHub 环境变量 `PRODUCTION_EVIDENCE_REMOTE_COLLECTOR_SHA256` 必须使用安装后文件的实际 SHA-256：

```bash
sudo install -o root -g root -m 0555 scripts/production-evidence-collector.mjs \
  /usr/local/bin/haichuan-production-evidence-collect
sha256sum /usr/local/bin/haichuan-production-evidence-collect
```

collector 不接受命令行参数、不读取调用者指定的配置路径，只读取固定的 `/etc/haichuan/production-evidence-collector.json`。请求只从标准输入读取；标准输出只产生 envelope JSON，错误只返回稳定错误码。

## 2. root 所有配置

配置文件权限必须为 `0400 root:root`，引用的 Compose、环境文件、合同目录和 receipt 目录不得被组或其他用户写入。配置只保存路径、容器名和非敏感运行合同，不复制任何密钥值：

```json
{
  "schemaVersion": 1,
  "environmentIdSha256": "<64 位环境标识哈希>",
  "contractRoot": "/opt/haichuan/release-contract",
  "composeEnvFile": "/etc/haichuan/production.env",
  "composeFiles": [
    "/opt/haichuan/release-contract/docker-compose.yml",
    "/opt/haichuan/release-contract/docker-compose.operations.yml"
  ],
  "composeProjectName": "haichuan",
  "containerNames": {
    "server": "jewelry-server",
    "client": "jewelry-client",
    "backup": "jewelry-backup"
  },
  "receiptRoot": "/var/lib/haichuan/production-evidence/receipts-current",
  "maxReceiptAgeSeconds": 600,
  "environmentContract": {
    "backupIntervalSeconds": 3600,
    "backupRpoSeconds": 86400,
    "restoreRtoSeconds": 3600,
    "backupRetentionDays": 30,
    "backupDbReadyTimeoutSeconds": 60,
    "mysqlVolumeName": "haichuan_mysql_data",
    "uploadsVolumeName": "haichuan_uploads_data",
    "privateMediaVolumeName": "haichuan_private_media_data",
    "backupHostDir": "/srv/haichuan/backups"
  }
}
```

上例中的名称和数值只是结构说明，不能复制为生产事实。安装者必须从目标 Compose 和获批 RPO/RTO 决定实际值。环境文件可含秘密，但 collector 只把路径交给 `docker compose config --images`；它不读取、复制或输出文件内容。

## 3. 每次运行前的 provider receipts

collector 直接重验以下目标机事实：

- 候选只读合同副本的 Git SHA 与 migration bundle；
- `verify-release-images.mjs --environment` 和 `--runtime`；
- Compose 展开的全部镜像都固定到 digest，且包含清单中的 server/client/operations；
- server、client、backup 三个容器运行且 healthy，并精确消费清单 digest。

数据库、首管理员、持久卷恢复、异地副本、边缘、告警和外部服务需要各自的受信执行器或提供商 API。它们必须在同一次窗口把下列 root 所有、非符号链接普通文件写入 `receiptRoot`；collector 不会替这些系统伪造成功：

- `facts.json` 与 `database-preflight-report.json`；
- `database-preflight.json`、`admin.json`、`storage.json`；
- `backup-manifest.json`、`restore-drill.json`、`write-quiesce.json`、`offsite-replication.json`；
- `edge.json`、`observability.json`、`feature-gates.json`、`rollback.json`；
- `external-email.json`、`external-sms.json`、`external-logistics.json`、`external-payment-gateway.json`、`external-wechat.json`、`external-object-storage.json`；
- 当前 Release Images artifact 中的 `release-manifest.attestation.json` 副本（只用于计算并交叉核对哈希，不会由 collector 回传覆盖 runner 文件）。

每个 receipt 必须严格使用 `docs/PRODUCTION_RELEASE_RUNBOOK.md` 的十字段 schema，并绑定同一个 environment、approval、Git SHA 和 manifest SHA。`facts.json` 只允许环境绑定、数据库状态、管理员计数/初始化结果、RPO/RTO 分段时长和六项外部服务状态。文件或 JSON key 中不得出现密码、Token、连接串、私钥、API Key、credential 或 auth 类字段；不得包含客户、订单、支付或联系人记录。

所有 facts/receipts 必须在 `maxReceiptAgeSeconds` 内，时间在未来超过 60 秒、缺文件、哈希或绑定不一致、migration 非最新、容器非 healthy、RPO/RTO 未达标、恢复点不是 `quiesced`、commerce 支付未验证，都会失败关闭且不输出可签名 evidence。

## 4. 准入、回退与当前边界

安装顺序为：固定候选合同副本 → root 配置 → provider-specific 只读取证 → 原子切换完整 receipt 目录 → 本机用同一请求 dry-run → 设置 GitHub environment 中的 collector SHA → 触发 Production Evidence Attestation。不要逐文件覆盖正在读取的 `receipts-current`。

卸载或回退只需撤销该专用公钥和 sudoers 条目，并移走固定入口；不要删除任何备份、receipt 或部署卷。collector 本身不执行 migration、备份、恢复、告警发送、外部服务调用、流量切换或回滚，它只重验运行态并收敛已经由对应受信执行器产生的最小脱敏 receipt。

当前预发布实例若仍使用 `devsync-*` 镜像、缺 migration、正式域名/告警/异地副本或真实 provider receipts，安装 collector 也只会得到失败关闭。这是正确结果，不能以放宽 freshness、删除 receipt 或手写全通过 JSON 绕过。

