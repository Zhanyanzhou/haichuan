# 海川珠宝 · 部署指南

> 最后更新：2026-08-23（生产 Compose 与 migration 执行门禁收敛）
>
> **执行门禁（2026-08-23）**：本文是历史部署操作参考，不表示当前项目已可上线，也不授权部署、修改 `.env`、执行 migration 或接入真实支付。操作前必须以当前 `docker-compose.yml`、`.env.example`、Prisma migration 状态和 `docs/CURRENT_STATE.md` 重新取证，并按 `AGENTS.md` 获得针对精确环境的批准。

## 架构概览

```
VPS (Ubuntu 22.04)
├── Docker Compose（五服务，docker-compose.yml 为唯一事实来源）
│   ├── mysql:8.0        (仅容器网络，不对宿主机暴露；管理走 SSH 隧道/ exec)
│   ├── server (NestJS)  (仅容器网络，nginx 反代 /api 与 /uploads)
│   ├── client (Nginx)   (80 端口对外，静态资源 + 反代 + CSP/安全响应头)
│   ├── backup           (mysql:8.0 镜像复用，每日 DB+媒体卷备份至 ./backups)
│   └── uptime-kuma      (127.0.0.1:3001，存活监控，远程经 SSH 隧道访问)
└── 数据卷
    ├── mysql_data / uploads_data / private_media_data（付款凭证）
    └── ./backups（宿主机目录，建议异地同步——3-2-1 原则）
```

**TLS/HTTPS（上线前必办）**：当前 compose 无 443 终结（内网部署态）。公网上线两条路线待拍板：
① 宿主机 Nginx + certbot 终结 TLS 后反代 client:80（本文档历史方案，配置已不在仓库）；
② 在 client 容器 nginx.conf 内加 443 server 块 + 证书挂载。
无论哪种，启用后应同步开启 HSTS 并复核 CSP（见 client/nginx.conf）。

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
CORS_ORIGIN=https://你的域名（或 http://服务器IP）
BOOTSTRAP_ADMIN_PASSWORD=管理员初始密码
```

**可选变量**（AI 分类、OSS 上传等暂不需要可注释掉）。

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

## 第六步：启动服务

生产操作必须显式指定基础 Compose 文件，避免 Docker Compose 自动合并仅供本地开发的 `docker-compose.override.yml`。但启动新服务不是发布流程的第一步；获得精确环境的部署与 migration 批准后，必须按以下顺序执行：

1. 记录待发布版本和当前运行版本；为数据库、`uploads_data`、`private_media_data` 建立同一发布批次的部署前备份，核对备份产物可读，并记录可恢复的回滚点。只有备份文件、保留位置和恢复步骤，不等于恢复演练已经通过。
2. 在目标数据库上核验 migration 历史和待应用清单；仓库 migration 目录不能证明目标库状态。当前运行时镜像通过 `npm ci --omit=dev` 排除了位于 `devDependencies` 的 Prisma CLI，因此禁止执行旧命令 `docker compose exec server npx prisma migrate deploy`，也禁止依赖 `npx` 临时下载未锁定 CLI。
3. 等待独立 migration runner 的版本、锁文件、目标数据库、负责人和回退方案获得批准。runner 必须按 `server/package-lock.json` 锁定依赖，先执行 migration 状态核验；只有待应用清单与批准范围一致时，才在同一 runner 中执行获批 migration。独立 runner 尚未获批前，本指南不提供可执行的生产 migration 命令。
4. migration 成功并留存记录后，才启动新服务：

```bash
cd haichuan
docker compose -f docker-compose.yml up -d --build
```

5. 检查容器状态与启动日志：

```bash
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs --tail=200 server client
```

6. 依次验证 `/api/health`（进程存活）、`/api/ready`（数据库就绪）、前台首页、后台登录及本次批准开放的业务路径；任一失败都停止放量，并按记录的版本、数据库和媒体回滚点执行已批准的回退方案。回退应用版本不能自动逆转数据库 migration。

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

当前仓库未提供 443 终结，TLS 路线仍待批准。本任务不选择、安装或接入新的生产入口；确定宿主机终结或容器终结方案后，必须单独核验 TLS 证书续期、HSTS、CSP、反向代理和真实域名健康检查，才能开放公网。

### 域名 DNS

添加 A 记录指向 VPS IP。

### TLS 方案门禁

旧版文档中的宿主机 Certbot 命令只适用于其中一种尚未批准的路线，现不再作为可直接执行的步骤。先批准 TLS 终结位置、证书存储与续期负责人、反向代理配置和回退方式，再为该路线编写并验收精确操作命令。

### 更新 CORS_ORIGIN

```bash
# 编辑 .env 修改 CORS_ORIGIN
CORS_ORIGIN=https://你的域名

# 重启服务
docker compose -f docker-compose.yml up -d
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
4. 完成备份、回滚点和获批 migration 门禁后，执行 `docker compose -f docker-compose.yml up -d`
5. 域名备案 + CDN 加速（国内必须）
