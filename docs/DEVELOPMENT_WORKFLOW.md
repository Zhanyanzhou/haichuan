# 海川珠宝 — 开发工作流

> 最后更新：2026-08-20
> 本文件只提供开发命令与运行拓扑，不授予 AI 安装依赖、迁移数据库、修改环境或操作生产的权限；授权统一以根目录 `AGENTS.md` 为准。

## 环境搭建

### 前置条件

- Node.js 18+
- Docker Desktop
- npm 9+

### 首次启动

```bash
# 1. 首次安装依赖（人工执行，或 AI 获明确批准后执行）
cd client && npm install
cd ../server && npm install
cd ..

# 2. 仅启动本地开发所需的数据库与缓存
docker-compose up -d mysql redis

# 3. 数据库迁移（仅在已确认目标环境并获批准后）
cd server && npx prisma migrate dev

# 4. (可选) 填充种子数据
npx prisma db seed

# 5. 启动开发服务器
npm run dev
```

## 服务端口

| 端口 | 服务           |
| ---- | -------------- |
| 80   | 完整 Docker 栈入口（Nginx） |
| 5173 | Vite 开发前端（`strictPort`） |
| 3000 | 宿主机 NestJS 后端（开发唯一归属） |
| 3002 | 容器后端映射（仅验收直连） |
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
2. **修改 schema.prisma 后**：先获批准，再运行 `prisma migrate dev` → `prisma generate`；仅生成或验证不等于可迁移目标数据库
3. **修改 HTTP 传输层**：检查所有领域服务、拦截器、解包与错误路径；不依赖固定消费者数量
4. **Feature Flags**：从当前代码和 `docs/CURRENT_STATE.md` 复核入口，不凭旧路径推断

## Mock 模式

通过 `VITE_USE_MOCK=true` 可绕过真实 API，适用于后端未启动时的前端开发；未设置时默认调用真实 API，生产环境不得开启。

## 数据库迁移

只在明确指定的目标环境、已核对迁移记录并获得批准后执行 `npx prisma migrate deploy`；不要在不明环境下执行迁移。历史迁移是否已部署必须从目标数据库和部署记录核验，不能凭目录存在推断。

## 健康检查

- `GET /api/health`：进程存活探针，不访问外部依赖。
- `GET /api/ready`：数据库就绪探针；数据库不可用时返回 503。

## 端口与启动说明

- Docker 整站通过 `docker-compose up -d` 启动，前台入口为 `http://localhost/`，后台登录为 `http://localhost/admin/login`。
- 本地开发通过 `npm run dev` 启动，前台入口为 `http://localhost:5173/`，后台登录为 `http://localhost:5173/admin/login`。
- 整套 Docker 与宿主机开发可以同时存在：宿主机后端固定占用 `3000`，容器后端通过 override 映射 `127.0.0.1:3002`，完整容器栈经 `:80` 自包含访问。不得改回容器抢占宿主机 `3000`。
- PowerShell 若阻止 `npm.ps1`，请使用 `npm.cmd run dev` 或 `npm.cmd run dev:client`。
- 后端默认使用 `3000`。若该端口已被不明进程占用，先识别并停止错误实例；不要通过临时改端口掩盖 API 所有权冲突。需要改变端口拓扑时按基础设施决策处理。
