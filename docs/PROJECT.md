# 海川珠宝 — 项目概述

> 最后更新：2026-08-07 | 本文档与具体 AI 智能体无关

## 项目定位

海川珠宝（Haichuan Jewelry）是一个**高端珠宝电商平台**，当前以品牌展示与商品陈列为主，电商交易功能规划中。

## 当前阶段

**第一阶段：商品展示与品牌建设**

- 前台：12 个页面（首页、选款中心、产品列表/详情、品牌故事等）
- 后台：18 个页面（商品 CRUD、页面构建器、客户管理、AI 分类等）
- 电商功能：代码已完成但通过 Feature Flag 关闭（购物车、结算、支付）

## 技术栈

| 层级     | 技术                      |
| -------- | ------------------------- |
| 前端框架 | React 18 + TypeScript 5.3 |
| 构建工具 | Vite 5                    |
| CSS      | Tailwind CSS 3 + 内联样式 |
| UI 库    | Ant Design 5              |
| 状态管理 | Zustand 4                 |
| 后端框架 | NestJS 10                 |
| ORM      | Prisma 5.8                |
| 数据库   | MySQL 8.0 (Docker)        |
| 缓存     | Redis 7 (Docker)          |
| 认证     | JWT + bcrypt              |

## 启动方式

```bash
docker-compose up -d                          # MySQL + Redis
cd client && npm install && cd ../server && npm install
cd server && npx prisma migrate dev            # 数据库迁移
npm run dev                                     # 前后端同时启动
```

- 前端 :5173 / 后端 :3000 / 数据库 :3306 / Redis :6379

## 目录结构

```
client/   前端 (React + Vite) — pages/ components/ store/ services/ hooks/
server/   后端 (NestJS + Prisma) — modules/ common/ prisma/
uploads/  文件上传存储
docs/     项目文档
```

## Feature Flags

电商功能全部关闭：`commerceEnabled/cartEnabled/paymentEnabled = false`
配置位置：`client/src/store/featureFlags.ts`
