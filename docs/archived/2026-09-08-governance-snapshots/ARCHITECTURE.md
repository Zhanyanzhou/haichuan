# 海川珠宝 — 系统架构

> 最后更新：2026-09-04
>
> 页面数、store 数、模块数等易变计数不在本文件维护，以 `docs/CURRENT_STATE.md` 为准。

## 整体架构

```
浏览器
    │
    ├─ Real 本地开发：Vite Dev Server (:5173)
    │   ├─ React SPA 静态文件
    │   └─ API 代理 → /api → 127.0.0.1:3000
    │                  /uploads → 127.0.0.1:3000
    │
    ├─ 显式 Mock 开发：Vite Dev Server (:5174，不连接真实后端)
    │
    ├─ Docker 整站：Nginx (:80) → client 容器 → server:3000
    │   └─ 容器后端宿主机映射：127.0.0.1:3002（仅验收直连）
    │
    └─ NestJS Server (:3000)
        ├─ @nestjs/serve-static → /uploads 静态文件
        ├─ Prisma Client → MySQL (:3306, Docker)
        └─ /api/health（存活）与 /api/ready（数据库就绪）
```

## 前端分层

```
App.tsx (路由总表)
  ├─ PublicLayout → 前台页面
  │   ├─ pages/public/*
  │   ├─ components/blocks/* (首页内容块)
  │   └─ hooks/usePageModules, useProductData
  │
  └─ AdminLayout → 后台页面
      ├─ pages/admin/*
      ├─ components/common/*
      └─ hooks/usePageModules

共享层:
  ├─ services/api.ts       — HTTP 封装（领域客户端经 api.ts 兼容导出）
  ├─ utils/unwrap.ts       — 响应解包
  ├─ store/*               — Zustand 全局状态
  └─ types/*               — TypeScript 类型定义
```

## 后端分层

```
app.module.ts
  ├─ common/
  │   ├─ prisma/           — 数据库服务（全局）
  │   ├─ guards/           — JWT + 角色守卫（全局默认拒绝，@Public 显式放行）
  │   ├─ decorators/       — @Public, @Roles, @CurrentUser
  │   ├─ interceptors/     — 统一响应格式与敏感写操作审计
  │   ├─ filters/          — HTTP 异常过滤器
  │   └─ kimi/             — Kimi AI 服务
  │
  └─ modules/ (按业务域分目录)
      每个: *.controller.ts + *.service.ts + *.module.ts
```

## 数据流

1. 用户操作 → React 组件 → hook / Zustand store
2. hook → `services/api.ts` (axios，自动附加 JWT)
3. HTTP → Vite 代理 → NestJS Controller
4. Controller → Service → Prisma Client → MySQL
5. 响应 → TransformInterceptor 包装 → JSON
6. JSON → `utils/unwrap.ts` 解包 → React state

## 认证流程

```
POST /api/auth/login → JWT Token
    ↓
localStorage('token')
    ↓
api.ts interceptor: Authorization: Bearer <token>
    ↓
JwtAuthGuard / RolesGuard → @CurrentUser
```

## 合同生成链（页面装修）

- `contracts/page-builder/` 是权威源：`content-templates.contract.json`（内置/兼容模板与页面级合同）与 `template-definition.schema.json`（母模板结构与能力边界）。
- `npm run contracts:generate` 单向生成 client/server 两侧类型与校验器，产物头部标记“自动生成，禁止手改”并附来源 SHA-256。
- `npm run contracts:check` 校验两侧产物一致，已并入 `npm run typecheck` 与 CI（quality.yml）。

## 关键技术决策

- **Zustand** 而非 Redux：轻量、无 Provider、selector 模式
- **Feature Flags**：电商功能代码已完成，开关控制上线节奏
- **Mock 模式**：仅由 Vite `mock` mode 显式开启（`npm run dev:mock`），默认走真实 API
- **页面构建器**：iframe + postMessage 架构，编辑/预览完全隔离
- **站点设置**：以 `site_settings` 数据表为唯一持久化来源；旧 `settings.json` 只在首次初始化时导入
- **Redis 与后台队列**：已按决策移除，服务端零消费方（`scripts/verify-trade-contract.mjs` 含对应门禁断言）
