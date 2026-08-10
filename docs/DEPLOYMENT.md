# 海川珠宝 · 部署指南

> 最后更新：2026-08-10

## 架构概览

```
VPS (Ubuntu 22.04)
├── Nginx (端口 80/443 → client 容器)
├── Docker Compose
│   ├── mysql:8.0      (端口 3306)
│   ├── redis:7-alpine  (端口 6379)
│   ├── server (NestJS) (端口 3000)
│   └── client (Nginx)  (端口 80)
└── 数据卷
    ├── mysql_data
    ├── redis_data
    └── uploads_data
```

---

## 第一步：选购 VPS

### 推荐配置（测试环境）

| 提供商 | 型号 | CPU | 内存 | 月费 |
|--------|------|-----|------|------|
| Hetzner | CX22 | 2 vCPU | 4 GB | ~€4 |
| DigitalOcean | Basic Droplet | 2 vCPU | 4 GB | $24 |
| Vultr | High Frequency | 2 vCPU | 4 GB | $24 |

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

```bash
cd haichuan
docker compose up -d
```

查看状态：

```bash
docker compose ps
docker compose logs -f
```

首次启动后运行数据库迁移：

```bash
docker compose exec server npx prisma migrate deploy
```

---

## 第七步：测试访问

```bash
# 前台
curl http://服务器IP

# 后台
curl http://服务器IP/admin/login

# API
curl http://服务器IP/api/health
```

---

## 第八步：配置域名 + HTTPS（可选）

### 域名 DNS

添加 A 记录指向 VPS IP。

### 安装 Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d 你的域名
```

### 更新 CORS_ORIGIN

```bash
# 编辑 .env 修改 CORS_ORIGIN
CORS_ORIGIN=https://你的域名

# 重启服务
docker compose up -d
```

---

## 日常维护

```bash
# 更新代码
git pull
docker compose up -d --build

# 查看日志
docker compose logs -f server
docker compose logs -f client

# 重启服务
docker compose restart

# 备份数据库
docker compose exec mysql mysqldump -u root -p jewelry_db > backup.sql
```

---

## 国内云迁移备忘

上述流程与阿里云 ECS / 腾讯云 CVM 完全一致，迁移时只需：

1. 国内 VPS 同样装 Docker + Git
2. 克隆仓库（需确保网络可达 GitHub，否则用 Gitee 镜像）
3. 复制 `.env` 和产品图片
4. `docker compose up -d`
5. 域名备案 + CDN 加速（国内必须）
