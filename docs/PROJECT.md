# 海川珠宝 — 项目概述

> 最后更新：2026-08-15 | 本文档与具体 AI 智能体无关

## 项目定位

海川珠宝（Haichuan Jewelry）是一个**高端珠宝电商平台**，当前以品牌展示与商品陈列为主，电商交易功能规划中。

## 当前阶段

**第一阶段：商品展示与品牌建设**

- 前台：13 个页面（首页、选款中心、产品列表/详情、搜索、客户中心、隐私等，详见 docs/CURRENT_STATE.md）
- 后台：23 个页面（商品 CRUD、页面构建器 23 模板、客户管理、评价、交易域七页等）
- 电商功能：代码已完成但通过 Feature Flag 关闭（购物车、结算、支付）

## 技术栈

| 层级     | 技术                      |
| -------- | ------------------------- |
| 前端框架 | React 18 + TypeScript 5.3 |
| 构建工具 | Vite 8（rolldown 打包）   |
| CSS      | Tailwind CSS 3 + 内联样式 |
| UI 库    | Ant Design 5              |
| 状态管理 | Zustand 4                 |
| 后端框架 | NestJS 10                 |
| ORM      | Prisma 5.8                |
| 数据库   | MySQL 8.0 (Docker)        |
| 缓存     | 无（Redis 已移除：OR 批决策，未来启用缓存/共享限流时按 git 历史模板加回） |
| 认证     | JWT + bcrypt（admin 10 轮 / 客户 12 轮） |
| 部署     | docker-compose 五服务（mysql/server/client/backup/uptime-kuma） |

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

电商功能全部关闭：服务端 `CUSTOMER_COMMERCE_ENABLED` 为单一来源（未配置=false），
前端经 `GET /settings/flags` 拉取（失败回退安全默认全关）。见 client/src/store/featureFlags.ts。
