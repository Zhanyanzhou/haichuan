# 海川珠宝 — 项目概述

> 最后更新：2026-08-17 | 本文档只描述稳定项目概况；易变化状态见 `docs/CURRENT_STATE.md`

## 项目定位

海川珠宝（Haichuan Jewelry）是一个以珠宝作品、品牌内容、顾问服务和运营管理为核心的数字平台。客户前台目标是高级珠宝品牌级体验；交易能力是否公开由环境开关、实际部署、联调证据和业务批准共同决定。

## 当前阶段

**当前重点：品牌展示、作品浏览、顾问服务与受控交易能力建设**

- 前台、后台、模块和路由清单以 `docs/CURRENT_STATE.md` 与当前代码为准，本文件不复制易漂移数量。
- 展示与咨询是公开体验的稳定基础；购物车、结算和付款凭证具有受控实现路径。
- 不使用“电商代码已完成”“交易已全面开放”等概括性结论；各能力须分别说明开关、鉴权、凭据、联调和上线状态。

## 技术栈

| 层级     | 技术                                                                      |
| -------- | ------------------------------------------------------------------------- |
| 前端框架 | React 18 + TypeScript 5.3                                                 |
| 构建工具 | Vite 8（rolldown 打包）                                                   |
| CSS      | Tailwind CSS 3 + 内联样式                                                 |
| UI 库    | Ant Design 5                                                              |
| 状态管理 | Zustand 4                                                                 |
| 后端框架 | NestJS 11                                                                 |
| ORM      | Prisma 5.8                                                                |
| 数据库   | MySQL 8.0 (Docker)                                                        |
| 缓存     | 无（Redis 已移除：OR 批决策，未来启用缓存/共享限流时按 git 历史模板加回） |
| 认证     | JWT + bcrypt（admin 10 轮 / 客户 12 轮）                                  |
| 部署     | docker-compose 五服务（mysql/server/client/backup/uptime-kuma）           |

## 启动方式

```bash
docker-compose up -d                          # mysql + server + client + backup + kuma
cd server && npm install && npx prisma generate
cd ../client && npm install
# 本地开发（后端另跑）：npm run dev            # 前后端同时启动
```

- 前端 dev :5173 / 生产容器 :80 / 后端 :3000（仅容器网络） / kuma :3001（127.0.0.1）

## 目录结构

```
client/   前端 (React + Vite) — pages/ components/ store/ services/ hooks/ page-builder/
server/   后端 (NestJS + Prisma) — modules/ common/ prisma/
backups/  备份产物（gitignore，含客户数据）
docs/     项目文档
```

## Feature Flags

服务端 `CUSTOMER_COMMERCE_ENABLED` 是客户交易开关的运行时单一来源；Docker Compose 与 `.env.example` 当前均以 `false` 为安全默认，变量缺失或无效时关闭，前端读取失败时也回退全关。后台与其他新网关交易入口另受 `PAYMENT_GATEWAY_TRANSACTIONS_ENABLED` 服务端总门禁约束，该变量同样只有精确 `true` 才放行；当前只完成代码级安全接线，尚未获批真实资金验收。代码存在或页面可访问不代表交易、支付或生产上线已经获批；详见 `docs/CURRENT_STATE.md` 与 `docs/DECISIONS.md` D.2。
