# 海川珠宝 — 系统架构

> 最后更新：2026-08-13

## 整体架构

```
浏览器
    │
    ├─ 本地开发：Vite Dev Server (:5174)
    │   ├─ React SPA 静态文件
    │   └─ API 代理 → /api → localhost:3000
    │                  /uploads → localhost:3000
    │
    ├─ Docker 整站：Nginx (:80) → client 容器 → server:3000
    │
    └─ NestJS Server (:3000)
        ├─ @nestjs/serve-static → /uploads 静态文件
        ├─ Prisma Client → MySQL (:3306, Docker)
        ├─ Bull Queue → Redis (:6379, Docker)
        └─ /api/health（存活）与 /api/ready（数据库就绪）
```

## 前端分层

```
App.tsx (路由总表)
  ├─ PublicLayout → 前台 12 页面
  │   ├─ pages/public/*
  │   ├─ components/blocks/* (首页内容块)
  │   └─ hooks/usePageModules, useProductData
  │
  └─ AdminLayout → 后台 18 页面
      ├─ pages/admin/*
      ├─ components/common/*
      └─ hooks/usePageModules, useContentSlots

共享层:
  ├─ services/api.ts       — HTTP 封装 (26 文件依赖)
  ├─ utils/unwrap.ts       — 响应解包 (25 文件依赖)
  ├─ store/*               — Zustand 全局状态 (6 个 store)
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
  └─ modules/ (21 个)
      每个: *.controller.ts + *.service.ts + *.module.ts

队列: queue/queue.module.ts (Bull)
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

## 关键技术决策

- **Zustand** 而非 Redux：轻量、无 Provider、selector 模式
- **Feature Flags**：电商功能代码已完成，开关控制上线节奏
- **Mock 模式**：由 `VITE_USE_MOCK=true` 显式开启，默认走真实 API
- **页面构建器**：iframe + postMessage 架构，编辑/预览完全隔离
- **站点设置**：以 `site_settings` 数据表为唯一持久化来源；旧 `settings.json` 只在首次初始化时导入
