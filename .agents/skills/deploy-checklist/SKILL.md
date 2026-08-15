---
name: deploy-checklist
description: 海川珠宝部署与上线检查清单 — 执行 Docker 部署、公网发布、上线前安全核查时使用；核对 TLS、环境变量、数据库迁移、备份、健康检查与上线前必办安全项，以 docs/DEPLOYMENT.md、docs/OPERATIONS_READINESS.md、docker-compose.yml 为准
---

# 部署上线检查清单 Skill

> 仅用于部署、发布、上线、docker compose 相关任务与上线前安全检查。
> 事实以 docs/DEPLOYMENT.md、docs/OPERATIONS_READINESS.md、docker-compose.yml 为准；本清单不具执行权，高危操作（迁移、部署、删除）须经用户审批。

---

## 一、部署前核对

1. 环境变量：确认 `.env` 已按 `.env.example` 配齐必填项——MYSQL_ROOT_PASSWORD、MYSQL_PASSWORD、DATABASE_URL、JWT_SECRET（openssl rand -hex 32）、CORS_ORIGIN、BOOTSTRAP_ADMIN_PASSWORD。
2. 产品图片：`client/public/images/products/` 不在 Git 仓库，需单独上传（scp 或手动建目录）。
3. 安全红线：不读取/输出 `.env` 真实值；不提交任何密钥。

## 二、上线前必办安全项（P0/P1）

- TLS/HTTPS：当前 compose 无 443 终结；公网开放前必须补 TLS（宿主 Nginx+certbot 或容器内 443），并同步开启 HSTS、复核 CSP（client/nginx.conf）。
- 登录失败锁定：目前仅 5/min 限流，无账号锁定；公网前补齐。
- 依赖供应链扫描：CI 接入 npm audit / dependabot。
- nginx 上传限制：`client_max_body_size 110m` 已配（勿回退，否则 >1MB 上传全 413）。
- 备份防线：`backups/` 已在 .gitignore；backup 容器每日 DB+媒体备份；异地化（3-2-1）上线前评估。

## 三、启动与迁移

- 启动：`docker compose up -d`；查看 `docker compose ps` 与 `docker compose logs -f`。
- 迁移：首次启动后 `docker compose exec server npx prisma migrate deploy`。
- 生产库迁移状态未确认前，不执行破坏性迁移（批次 B drop_content_slots 等 deploy 状态需先确认）。

## 四、健康检查

- `/api/health`、`/api/ready` 双探针。
- 前台首页、后台 `/admin/login`、API 冒烟测试。

## 五、验证还债（最高优先）

- 跑 docs/VERIFICATION_RUNBOOK.md 七节；`prisma migrate status` 确认迁移；恢复演练脚本验证备份可恢复。

## 六、外部凭据（代码就绪，等真实值）

- SMTP、阿里云短信、快递100、支付宝/微信支付、微信开放平台、OSS 六类凭据，填入即激活；未配时相关功能降级（邮件转日志、支付/短信/物流不可用）。
