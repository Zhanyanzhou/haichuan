# 海川珠宝 · 部署指南

> 最后更新：2026-09-06（三镜像证明、失败关闭 Compose、RPO/RTO 与生产证据合同）
>
> **执行门禁（2026-08-23）**：本文是历史部署操作参考，不表示当前项目已可上线，也不授权部署、修改 `.env`、执行 migration 或接入真实支付。操作前必须以当前 `docker-compose.yml`、`.env.example`、Prisma migration 状态和 `docs/CURRENT_STATE.md` 重新取证，并按 `AGENTS.md` 获得针对精确环境的批准。
>
> 当前正式发布、证据、告警和回滚的规范入口为 `docs/PRODUCTION_RELEASE_RUNBOOK.md`；本文中与 schema v2、双镜像、本地构建回退或缺少 operations runner 有关的历史说明均以该入口为准。

## 架构概览

```
VPS (Ubuntu 22.04)
├── Docker Compose（五服务，docker-compose.yml 为唯一事实来源）
│   ├── mysql:8.0@sha256 (仅容器网络，不对宿主机暴露；管理走 SSH 隧道/ exec)
│   ├── server@sha256    (NestJS，仅容器网络，nginx 反代 /api 与 /uploads)
│   ├── client@sha256    (Nginx 非 root：8080 仅 HTTP 跳转/ACME，8081 为可信 TLS 边缘回源与应用反代)
│   ├── backup           (复用受签名 operations digest，内置脚本与数据库客户端，定时备份 DB+媒体卷)
│   └── uptime-kuma      (固定 digest；127.0.0.1:3001，远程经 SSH 隧道访问)
└── 数据卷
    ├── mysql_data / uploads_data / private_media_data（付款凭证）
    └── ./backups（宿主机目录，建议异地同步——3-2-1 原则）
```

**TLS/HTTPS（上线前必办）**：当前 compose 仍不终结 443，证书位置与实现产品待拍板；仓库只固定不依赖该选择的回源信任边界：

- 宿主机上的 TLS 边缘代理只回源 `127.0.0.1:8081`；加入受控 Compose 网络的边缘代理只回源 `client:8081`。
- 边缘代理必须覆盖 `X-Real-IP` 为其 TCP 连接观察到的单个客户端 IP，并丢弃来访者同名头；client nginx 会覆盖其余 `Forwarded/X-Forwarded-*` 后再交给 Nest。
- 公网 `80 -> client:8080` 永远只允许 ACME HTTP-01，其余返回 308。TLS 边缘不得回源该端口，否则会形成重定向循环。
- HSTS 必须由实际 HTTPS 终结层下发，并与证书续期、CSP、健康检查和回退一起在目标环境验收。

---

## 第一步：选购 VPS

### 推荐配置（测试环境）

| 提供商       | 型号           | CPU    | 内存 | 月费 |
| ------------ | -------------- | ------ | ---- | ---- |
| Hetzner      | CX22           | 2 vCPU | 4 GB | ~€4  |
| DigitalOcean | Basic Droplet  | 2 vCPU | 4 GB | $24  |
| Vultr        | High Frequency | 2 vCPU | 4 GB | $24  |

**推荐 Hetzner CX22**，性价比最高，德国/芬兰机房对中国延迟约 200ms（测试够用）。

---

## 第二步：初始化 VPS

SSH 登录后执行：

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo apt install docker-compose-plugin -y

# 安装 Git
sudo apt install git -y

# 重新登录使 docker 组生效
exit
```

重新 SSH 后验证：

```bash
docker --version
docker compose version
```

---

## 第三步：克隆项目

```bash
# 生成 SSH Key（如没有）
ssh-keygen -t ed25519 -C "your-email@example.com"

# 添加公钥到 GitHub → Settings → SSH Keys
cat ~/.ssh/id_ed25519.pub

# 克隆私有仓库
git clone git@github.com:zhanxiansen-Ai/haichuan.git
cd haichuan
```

---

## 第四步：配置环境变量

```bash
# 创建 .env（参考 .env.example）
cp .env.example .env

# 编辑 .env 填入真实值
nano .env
```

**必须配置的变量：**

```bash
MYSQL_ROOT_PASSWORD=你设置的强密码
MYSQL_PASSWORD=你设置的应用密码
DATABASE_URL=mysql://jewelry_user:你设置的应用密码@mysql:3306/jewelry_db
JWT_SECRET=$(openssl rand -hex 32)   # 自动生成随机密钥
CORS_ORIGIN=https://你的正式域名
```

生产启动只接受 HTTPS CORS 来源；`http://localhost`、`http://127.0.0.1` 等明文来源仅限非生产开发环境。

**可选变量**（AI 分类、OSS 上传等暂不需要可注释掉）。

`ALLOW_DEMO_SEED`、`DEMO_ADMIN_PASSWORD` 只属于本地 Demo Seed，候选和生产环境必须保持关闭/空值。`BOOTSTRAP_ADMIN_USERNAME`、`BOOTSTRAP_ADMIN_PASSWORD`、`BOOTSTRAP_ADMIN_REAL_NAME` 只在首次管理员一次性进程中临时提供，不得写入长期运行服务的 Compose 环境，也不得长期保存在目标 `.env`。

---

## 第五步：上传产品图片

产品图片未包含在 Git 仓库中，需要单独上传：

```bash
# 在本机执行（Windows PowerShell）
scp -r "G:\网站搭建2\client\public\images\products\*" user@你的VPS_IP:~/haichuan/client/public/images/products/

# 或在 VPS 上手动创建目录后上传
mkdir -p client/public/images/products
```

---

## 备份恢复门禁

`backup.sh`、`check-backup-health.sh`、`restore.sh`、`restore-drill.sh`、`prune-backups.sh` 五个入口会在 Release Images 构建时连同 bash、数据库客户端一起固化进受签名 operations 镜像；生产 `backup` service 和所有恢复操作只消费批准的 `OPERATIONS_IMAGE_NAME@sha256:OPERATIONS_IMAGE_DIGEST`，禁止从 checkout 或宿主机 bind、复制或执行任何运维脚本。镜像内 `backup.sh` 会为同一批次发布一个 `.sql.gz`、零个或多个媒体 `.tar.gz`，最后发布 `.sha256` 清单。只有清单存在且 `sha256sum -c` 全部通过的批次才可进入恢复候选。每次尝试还会原子更新 `./backups/.health/backup-status.env`，只记录时间、结果、退出码、受控错误代码和最新清单名，不记录连接信息或密钥。宿主备份目录必须预先存在并允许镜像内非 root `node` 用户写入。

`backup` 容器健康检查会读取状态标记（不执行 `source`），要求最近一次结果为 `SUCCESS`、退出码为 0、快照起点未超过 `BACKUP_RPO_SECONDS`，并复验清单中的数据库、uploads、private-media 与快照元数据。`WARNING`、`FAILED`、制品损坏或超龄都会让容器 unhealthy；该结果只证明本机备份，异地 RPO 和恢复演练仍需独立证据。

批准 operations digest 内的 `/usr/local/bin/restore.sh` 与 `/usr/local/bin/restore-drill.sh` 是人工、一次性的恢复入口，不挂载到任何长期运行服务，也不会由 Compose 自动触发。恢复时必须启动该 digest 的隔离一次性容器：备份目录以只读方式挂载，恢复目标只允许挂载本次批准的已存在空库与空媒体目录，并且必须执行镜像内上述入口；禁止挂载或执行 checkout、宿主机或其他镜像中的恢复脚本。入口采用以下安全默认值：

- 目标数据库必须由获批的恢复操作预先创建，并且必须为空；禁止对当前业务库原位覆盖。
- 媒体目标目录必须预先存在且为空；禁止覆盖或合并已有媒体。
- 恢复清单只能引用同一 `BACKUP_DIR` 下的安全文件名，数据库与媒体在写入前必须通过 SHA-256、gzip/tar 和归档路径校验。
- 必须提供与目标库精确匹配的 `RESTORE_CONFIRM=RESTORE:<目标库名>`。仅恢复数据库还必须显式设置 `RESTORE_DATABASE_ONLY=true`。
- 脚本不会创建、删除或切换数据库，不会修改 Compose、数据卷、`.env` 或正在运行的服务。

生产恢复不是日常维护命令。执行前必须针对精确环境批准：备份清单、恢复目标库、空媒体目标卷、停写窗口、负责人、回退方式以及恢复成功后的流量切换。恢复容器必须使用批准的 operations digest 中已经固化的 MySQL 客户端、`bash`、`gzip`、`tar`、`sha256sum` 与恢复入口；备份目录必须只读挂载，恢复目标只允许挂载精确批准的空库和空媒体目录。脚本不得作为宿主挂载提供，数据库密码只能通过受控环境注入，禁止写入命令历史或日志。

恢复入口的环境合同如下；占位符不能直接用于生产：

```bash
DB_HOST=<目标 MySQL 主机>
DB_PORT=3306
DB_USER=<恢复专用用户>
DB_PASS=<通过受控环境注入，不回显>
DB_NAME=<已存在的空恢复库>
BACKUP_DIR=/backups
RESTORE_MANIFEST=<已核验批次>.sha256
MEDIA_TARGET_DIRS=/media/uploads:/media/private-media
RESTORE_CONFIRM=RESTORE:<与 DB_NAME 完全一致>
bash /usr/local/bin/restore.sh
```

恢复完成后必须独立核验，不得只采信脚本退出码：核对表数量、关键表行数或 checksum、`_prisma_migrations` 历史、两类媒体文件数量与哈希；再让候选服务指向恢复目标，验证 `/api/ready`、前台首页、后台登录和本次批准的核心业务路径。任何一步失败，都不得清理原库或切换流量；应保留日志、废弃本次隔离恢复目标，并从新的空库和空媒体目录重新开始。

当前仓库中的 `./backups` 仍是单机、本地、明文保留点，不构成异地灾备。正式上线前还需要落实加密异地副本、访问控制、保留策略、恢复时限（RTO）和可接受数据丢失窗口（RPO），并在目标部署环境完成一次有记录的恢复演练。

---

## 第六步：启动服务

生产操作必须显式指定基础 Compose 文件，避免 Docker Compose 自动合并仅供本地开发的 `docker-compose.override.yml`。`Release Images` 工作流只能手动触发，且只接受默认分支或 GitHub 标记为 protected 的 `release/*` 分支：在任何镜像推送前，它必须找到同一 SHA、事件为 `push`、结论为 `success` 的完整 `Quality Gate`；随后构建 server/client/operations 三镜像，验证各自签名 provenance 与 SPDX 2.3 SBOM，再生成并签名 Manifest v3。工作流存在或本地静态合同通过，都不等于远端制品已经发布。

基础 `docker-compose.yml` 不挂载微信支付证书，未接入真实支付的内容展示、选款咨询和线索收集部署无需提供证书。只有目标环境已单独批准微信支付接线时，才显式叠加 `docker-compose.wechat-pay.yml`：

```bash
export WECHAT_PLATFORM_CERT_HOST_PATH=/受控绝对路径/wechat-platform-cert.pem
export WECHAT_MCH_PRIVATE_KEY_HOST_PATH=/受控绝对路径/wechat-mch-private-key.pem
npm run verify:wechat-pay-certificate-files
docker compose --env-file <受控环境文件> \
  -f docker-compose.yml -f docker-compose.wechat-pay.yml config
```

两个宿主路径必须存在、互不相同且各自指向普通证书/私钥文件；预检只读取文件元数据，不读取或输出证书内容。override 将它们分别只读挂载到固定容器路径 `/run/secrets/wechat-pay/platform-cert.pem` 与 `/run/secrets/wechat-pay/mch-private-key.pem`，并设置 `create_host_path: false`，因此缺少任一路径时 Compose 解析或容器创建都会失败，而不会创建可写空目录。不得把同一文件、证书目录或更宽的秘密目录挂入容器。该 override 只提供文件接线，不会开启 `PAYMENT_GATEWAY_TRANSACTIONS_ENABLED`、退款或客户交易能力；这些门禁仍须按获批环境独立验证。

生产主机禁止从工作区源码构建，也禁止以浮动 tag 部署。获得精确环境的部署与 migration 批准后，必须按以下顺序执行：

1. 记录待发布版本和当前运行版本；为数据库、`uploads_data`、`private_media_data` 建立同一发布批次的部署前备份，核对备份产物可读，并记录可恢复的回滚点。只有备份文件、保留位置和恢复步骤，不等于恢复演练已经通过。
2. 下载本次工作流产出的 `release-manifest.json` 和 `release-manifest.attestation.json`，独立核对 commit、构建参数、签名证明和负责人；确认 `qualityGate.headSha == gitSha`、`qualityGate.event == push`、`qualityGate.conclusion == success`，并打开 `qualityGate.runUrl` 复核完整工作流。根质量套件必须包含并通过 `npm run test:release-supply-chain`。最终生产证据验证器会用 manifest sidecar 和 OCI registry bundle 重新执行八项 GitHub attestation 校验；普通 JSON receipt 不能替代该过程。传入的 environment、审批引用哈希、Git SHA、migration bundle、source、repo、source ref、manifest signer、evidence signer 与 release profile 必须来自批准记录、冻结候选和审定策略，不得从 manifest、evidence 或 bundle 反向复制为 expected。完整命令见 `docs/PRODUCTION_RELEASE_RUNBOOK.md`。把每个 `manifest.<component>.image` 写入对应 `*_IMAGE_NAME`，把 digest 去掉 `sha256:` 后的 64 位十六进制写入对应 `*_IMAGE_DIGEST`；同时写入 `RELEASE_GIT_SHA`、`RELEASE_SOURCE`、`MIGRATION_BUNDLE_SHA256`。Compose 会固定拼接 `@sha256:`，没有 tag 回退。
3. 拉取并在启动前验证本地镜像摘要及 OCI 标签；任一不匹配都停止：

```bash
cd haichuan
node scripts/verify-release-images.mjs --manifest release-manifest.json
docker compose -f docker-compose.yml pull server client
docker compose -f docker-compose.yml -f docker-compose.operations.yml --profile operations pull migration-status
node scripts/verify-release-images.mjs --runtime
```

4. 若是由本 Compose 首次管理的 MySQL，先只运行 `docker compose --env-file <受控环境文件> -f docker-compose.yml up -d --no-deps --wait mysql`，并用 `docker compose --env-file <受控环境文件> -f docker-compose.yml ps mysql` 确认 healthy；此时不得提前启动 server、client、backup 或其他应用服务。外部托管数据库则用平台 ready 证据替代这一步。随后在目标数据库上核验 migration 历史和待应用清单；仓库 migration 目录不能证明目标库状态。`release-preflight` 会把 migration 文件哈希、`_prisma_migrations` ledger 和唯一遗留签认的结构合同共同纳入阻断门禁。已应用 migration 一律不可修改；`server/prisma/migration-integrity-exceptions.json` 只允许审计确认的精确三方匹配，不是通用忽略清单。
   PageDocument 发布指针批次必须先在获批的一次性 runner 中运行 `page-published-revision-backfill.js` 的默认 dry-run。该入口在建立连接前要求 `PAGE_PUBLISHED_REVISION_AUDIT_READ_ONLY_AUTHORIZED=1`、环境 ID、预期数据库名和审批引用，并校验 `DATABASE_URL` 中的数据库名；连接后拒绝除 `USAGE/SELECT/SHOW VIEW` 外的权限，输出 migration 完整性、指针列、悬空/跨页面指针与 backfill 聚合，不输出页面正文。指针 migration 尚未应用时报告 `POINTER_MIGRATION_REQUIRED`，不得为了取得候选数绕过顺序。真正回填必须另行使用只含 `SELECT/UPDATE` 的最小权限账号，同时提供 `--apply` 与 `PAGE_PUBLISHED_REVISION_BACKFILL_APPLY=1`；migration 未完整、指针列缺失、账号权限过宽、指针不变量失败或发生并发冲突时均失败关闭。dry-run 或 apply 报告都不构成 migration、部署、页面发布或流量切换授权。
5. 长期 server 镜像仍排除 Prisma CLI，禁止执行 `docker compose exec server npx prisma migrate deploy`，也禁止依赖 `npx` 临时下载。operations digest 由同一 Release Images 工作流从同一锁文件构建并签名：既作为 backup service 的不可变执行器，也通过命令覆盖承载隔离的一次性运维任务。先通过 `migration-status` 核对目标库与待执行清单；实际 `migrate deploy` 仍必须取得精确目标库、清单、负责人、窗口和回退方案批准，operations 镜像存在不构成 migration 授权。
6. migration 成功、只读 preflight 通过并留存记录后，才以已验证 digest 启动新服务；`--no-build` 是生产硬门禁。未启用微信支付证书接线时只使用基础 Compose；已获批接线时必须在 `config`、`up`、`ps` 与 `logs` 的整次操作中一致叠加同一 override：

```bash
docker compose -f docker-compose.yml up -d --no-build --pull always

# 仅限已获批微信支付接线的目标环境
docker compose --env-file <受控环境文件> \
  -f docker-compose.yml -f docker-compose.wechat-pay.yml \
  up -d --no-build --pull always
```

7. 检查容器状态与启动日志：

```bash
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs --tail=200 server client
```

8. 仅当目标库确认没有启用中的 `SUPER_ADMIN` 时，使用新镜像内置的一次性 CLI 创建首管理员。用户名和密码只通过当前 shell 临时传入；命令不会创建商品、仓库、分类、PageDocument 或 SiteSettings，已有启用超管、用户名冲突、弱密码和并发重复执行都会拒绝，成功创建与审计记录属于同一事务：

```bash
read -r -p "首管理员用户名: " BOOTSTRAP_ADMIN_USERNAME
read -r -s -p "首管理员密码: " BOOTSTRAP_ADMIN_PASSWORD
echo
export BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.operations.yml \
  --profile operations run --rm bootstrap-admin
unset BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD
```

命令退出非零时不得改用完整 Seed、SQL 手工提权或重复覆盖账号；保留脱敏错误代码，核对目标库与已有管理员状态后重新审批。初始化成功后由负责人首次登录，在「店铺资料」写入并复核正式联系方式，再通过现有页面编辑器分别保存、预检和发布 `home`、`about`、`products`、`catalog`、`custom`、`contact` 六页真实内容。

9. 正式内容完成后运行只读发布前门禁。它会先检查 migration ledger、仓库文件哈希和遗留结构签认，再检查启用超管、已知占位管理员资料、5 条已知 Demo 商品、持久化 SiteSettings、四项联系资料，以及六页 `publishedRevisionId` 精确指向的同页面 revision 的当前合同签认和服务端重新验证；空指针、悬空/跨页面指针均失败关闭，不会退回“最新 published revision”猜测。输出不包含密码、联系方式值或页面正文。

该命令必须运行在获批的一次性候选 runner 中，使用只具备目标数据库 `USAGE/SELECT/SHOW VIEW` 且不跨库的账号；禁止复用长驻 server 的读写账号，也禁止通过 `docker compose exec server` 绕过账号边界。执行前临时注入 `RELEASE_PREFLIGHT_READ_ONLY_AUTHORIZED=1`、环境 ID、预期数据库名、审批引用和只读 `DATABASE_URL`；环境名和数据库名必须与实际连接一致，审批引用只以 SHA-256 进入报告：

```bash
docker compose -f docker-compose.yml -f docker-compose.operations.yml \
  --profile operations run --rm release-preflight
```

只有 `technicalReady=true` 且命令退出 0 才能进入人工 Go/No-Go；在 B4 的合作协议、资质与审计闭环完成前，`PARTNER_APPLICATIONS_WRITE_ENABLED=true` 会由预检直接阻断。预检不代替联系方式真实性、运营主体、法务文案、媒体商用权利、正式域名、TLS、监控、异地备份或目标环境验收。

10. 依次验证 `/api/health`（进程存活）、`/api/ready`（数据库就绪）、前台首页、后台登录及本次批准开放的业务路径；任一失败都停止放量，并按记录的版本、数据库和媒体回滚点执行已批准的回退方案。回退应用版本不能自动逆转数据库 migration。

---

## 第七步：测试访问

```bash
# 前台
curl http://服务器IP

# 后台
curl http://服务器IP/admin/login

# API
curl http://服务器IP/api/health

# 数据库就绪；非 2xx 时不得继续上线验收
curl --fail --show-error http://服务器IP/api/ready
```

以上只验证当前访问路径，不证明 TLS、恢复演练、管理员初始化或完整业务验收已经完成。

---

## 第八步：配置域名 + HTTPS（公网生产必需，尚未验证）

当前仓库未提供 443 终结，TLS 产品、证书存储和续期负责人仍待批准。无论最终使用宿主机代理还是受控网络内的边缘代理，都必须遵守上文固定的 `8081` 私有回源与 `X-Real-IP` 覆盖合同；目标环境仍须单独核验证书续期、HSTS、CSP、反向代理和真实域名健康检查，才能开放公网。

### 域名 DNS

添加 A 记录指向 VPS IP。

### TLS 方案门禁

旧版文档中的宿主机 Certbot 命令只适用于其中一种尚未批准的路线，现不再作为可直接执行的步骤。先批准 TLS 终结位置、证书存储与续期负责人、边缘代理如何覆盖 `X-Real-IP`、反向代理配置和回退方式，再为该路线编写并验收精确操作命令。

### 更新 CORS_ORIGIN

```bash
# 编辑 .env 修改 CORS_ORIGIN
CORS_ORIGIN=https://你的域名

# 仍须使用已验证的 digest 制品；禁止因配置变化回退到现场构建
docker compose -f docker-compose.yml up -d --no-build --pull always
```

---

## 日常维护

日常发布仍须回到“第六步”从备份与回滚点开始，不能在拉取代码后直接 `up` / `restart`，也不能先启动新服务再补 migration。以下只是发布完成后的观察命令：

```bash
# 查看日志
docker compose -f docker-compose.yml logs -f server
docker compose -f docker-compose.yml logs -f client

# 核对现有备份任务日志；数据库与两类媒体必须属于同一回滚点
docker compose -f docker-compose.yml logs --tail=200 backup
```

日常更新必须遵循“备份与回滚点 → migration 状态 → 获批 migration → 新服务 → 健康与业务检查”的顺序。备份恢复演练、TLS 和首次管理员初始化均须凭目标环境的新鲜证据单独验收；本文不声明它们已完成。

---

## 国内云迁移备忘

上述流程与阿里云 ECS / 腾讯云 CVM 完全一致，迁移时只需：

1. 国内 VPS 同样装 Docker + Git
2. 克隆仓库（需确保网络可达 GitHub，否则用 Gitee 镜像）
3. 复制 `.env` 和产品图片
4. 完成发布清单、digest/OCI 标签、备份、回滚点和获批 migration 门禁后，执行 `docker compose -f docker-compose.yml up -d --no-build --pull always`
5. 域名备案 + CDN 加速（国内必须）
