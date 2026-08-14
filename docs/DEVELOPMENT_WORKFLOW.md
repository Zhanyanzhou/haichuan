# 海川珠宝 — 开发工作流

> 最后更新：2026-08-13

## 环境搭建

### 前置条件

- Node.js 18+
- Docker Desktop
- npm 9+

### 首次启动

```bash
# 1. 安装依赖
cd client && npm install
cd ../server && npm install
cd ..

# 2. 仅启动本地开发所需的数据库与缓存
docker-compose up -d mysql redis

# 3. 数据库迁移
cd server && npx prisma migrate dev

# 4. (可选) 填充种子数据
npx prisma db seed

# 5. 启动开发服务器
npm run dev
```

## 服务端口

| 端口 | 服务           |
| ---- | -------------- |
| 80   | Docker 前端（Nginx） |
| 5174 | Vite 开发前端  |
| 3000 | NestJS 后端    |
| 3306 | MySQL (Docker) |
| 6379 | Redis (Docker) |

## 常用命令

| 命令                     | 说明                   |
| ------------------------ | ---------------------- |
| `npm run dev`            | 同时启动前后端         |
| `npm.cmd run dev:client` | 仅前端                 |
| `npm run dev:server`     | 仅后端                 |
| `npm run build`          | 生产构建               |
| `npx prisma migrate dev` | 数据库迁移             |
| `npx prisma db seed`     | 种子数据               |
| `npx prisma studio`      | 数据库管理界面         |
| `npx prisma generate`    | 重新生成 Prisma Client |
| `npx tsc --noEmit`       | 类型检查               |
| `npm run lint`           | 客户端 ESLint 检查     |
| `npm run typecheck`      | 前后端 TypeScript 类型检查 |
| `npm test`               | 页面构建器跨层契约检查 |

## 注意事项

1. **服务端必须从 `server/` 目录启动**：`process.cwd()` 用于解析 `uploads/` 路径
2. **修改 schema.prisma 后**：运行 `prisma migrate dev` → `prisma generate`
3. **修改 api.ts**：影响 26 个文件，需全局检查
4. **Feature Flags** 在 `client/src/store/featureFlags.ts` 管理

## Mock 模式

通过 `VITE_USE_MOCK=true` 可绕过真实 API，适用于后端未启动时的前端开发；未设置时默认调用真实 API，生产环境不得开启。

## 数据库迁移

`server/prisma/migrations/20260813090000_add_site_settings/` 新增了站点设置持久化表。代码合入后，请在**明确指定的目标环境**执行 `npx prisma migrate deploy`；不要在不明环境下执行迁移。

## 健康检查

- `GET /api/health`：进程存活探针，不访问外部依赖。
- `GET /api/ready`：数据库就绪探针；数据库不可用时返回 503。

## 端口与启动说明

- Docker 整站通过 `docker-compose up -d` 启动，前台入口为 `http://localhost/`，后台登录为 `http://localhost/admin/login`。
- 本地开发通过 `npm run dev` 启动，前台入口为 `http://localhost:5174/`，后台登录为 `http://localhost:5174/admin/login`。
- 不要同时启动整套 Docker 服务与 `npm run dev`，两者都会使用后端 `3000` 端口；本地开发只启动 `mysql redis` 两个 Docker 服务。
- PowerShell 若阻止 `npm.ps1`，请使用 `npm.cmd run dev` 或 `npm.cmd run dev:client`。
- 后端默认使用 `3000`；若该端口已被现有后端服务占用，可在启动前同时设置 `PORT` 与 `VITE_API_PROXY_TARGET`，例如 PowerShell 中：`$env:PORT='3001'; $env:VITE_API_PROXY_TARGET='http://localhost:3001'; npm.cmd run dev`。
