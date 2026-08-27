# 海川珠宝 — 开发工作流

> 最后更新：2026-08-23
> 本文件只提供开发命令与运行拓扑，不授予 AI 安装依赖、迁移数据库、修改环境或操作生产的权限；授权统一以根目录 `AGENTS.md` 为准。

## 环境搭建

### 前置条件

- Node.js `^20.19.0` 或 `>=22.12.0`（与当前锁定的 Vite 8.2.1 / `@vitejs/plugin-react` 6.0.5 engine 一致；Node 18 不受支持）
- Docker Desktop
- npm 9+

### 首次启动

```bash
# 1. 首次安装依赖（人工执行，或 AI 获明确批准后执行）
cd client && npm install
cd ../server && npm install
cd ..

# 2. 仅启动当前容器拓扑中的本地开发数据库
docker compose up -d mysql

# 3. 本地开发数据库迁移（仅限已确认的本地目标，并获批准后）
cd server && npx prisma migrate dev

# 4. (可选) 仅向明确的本地开发库填充 Demo 数据
# 必须在当前进程显式提供 ALLOW_DEMO_SEED=true 和 DEMO_ADMIN_PASSWORD；
# NODE_ENV=production 时脚本无条件拒绝。
$env:ALLOW_DEMO_SEED = "true"
$env:DEMO_ADMIN_PASSWORD = "仅本地使用的字母数字密码"
npx prisma db seed
Remove-Item Env:ALLOW_DEMO_SEED, Env:DEMO_ADMIN_PASSWORD

# 5. 启动真实联调环境（先构建服务端，再启动单一前端与后端）
npm run dev
```

## 服务端口

| 端口 | 服务           |
| ---- | -------------- |
| 80   | 完整 Docker 栈入口（Nginx） |
| 5173 | Vite 开发前端（`strictPort`） |
| 5174 | 显式 Mock 前端（仅 `npm run dev:mock`） |
| 3000 | 宿主机 NestJS 后端（开发唯一归属） |
| 3001 | Uptime Kuma 本机监控面板（Docker，仅绑定 `127.0.0.1`） |
| 3002 | 容器后端映射（仅验收直连） |
| 3306 | MySQL (Docker) |

## 常用命令

| 命令                     | 说明                   |
| ------------------------ | ---------------------- |
| `npm run dev`            | 构建服务端、预加载 `server/.env` 后启动 Real 前端与回环后端 |
| `npm.cmd run dev:client` | 仅启动 Real 前端（需要 3000 后端） |
| `npm run dev:server`     | 构建、预加载 `server/.env` 并启动编译后的后端 |
| `npm run dev:mock`       | 仅启动 5174 Mock 前端  |
| `npm run build`          | 生产构建               |
| `npx prisma migrate dev` | 本地开发数据库迁移（需批准） |
| `npx prisma db seed`     | 显式本地 Demo 数据；生产环境硬拒绝 |
| `npx prisma studio`      | 数据库管理界面         |
| `npx prisma generate`    | 重新生成 Prisma Client |
| `npx tsc --noEmit`       | 类型检查               |
| `npm run lint`           | 客户端 ESLint 检查     |
| `npm run typecheck`      | 前后端 TypeScript 类型检查 |
| `npm test`               | 合同、内容模板、服务端行为、公开资源与运行时所有权检查 |

## 注意事项

1. **服务端必须从 `server/` 目录启动**：`process.cwd()` 用于解析 `uploads/` 路径
2. **修改 schema.prisma 后**：先获批准，再运行 `prisma migrate dev` → `prisma generate`；仅生成或验证不等于可迁移目标数据库
3. **修改 HTTP 传输层**：检查所有领域服务、拦截器、解包与错误路径；不依赖固定消费者数量
4. **Feature Flags**：从当前代码和 `docs/CURRENT_STATE.md` 复核入口，不凭旧路径推断
5. **Demo Seed 不是生产初始化**：它会写入固定演示管理员、仓库、分类和 5 条演示商品；候选/生产首管理员必须使用 `docs/DEPLOYMENT.md` 中的一次性 CLI，正式 PageDocument 与 SiteSettings 必须通过后台维护和发布。
6. **备份容器没有 HTTP 端口**：`backup` 在 Docker 内按计划写入宿主机 `./backups`，并通过本地状态标记健康检查暴露最近一次执行结果；容器健康、后台状态、完整产物与隔离恢复演练是四层不同证据，不得用任一层替代恢复验收。

## Mock 模式

Mock 只能通过 `npm run dev:mock` 显式启动，固定使用 `http://127.0.0.1:5174`，适用于后端未启动时的纯界面开发。页面会显示 Mock 标识；其结果只能证明 UI 冒烟，不能证明鉴权、草稿、发布或真实接口联调。默认 `npm run dev` 与 `npm run dev:client` 均为 Real 模式，生产构建不会启用 Mock。

## 数据库迁移

`npx prisma migrate dev` 只用于已确认且获批准的本地开发数据库，不得用于生产。生产 migration 必须先建立数据库与媒体回滚点，再由获批的独立 migration runner 按 `server/package-lock.json` 锁定依赖，核验目标库 migration 状态和待应用清单，最后执行批准范围内的 migration。

当前运行时镜像通过 `npm ci --omit=dev` 排除了位于 `devDependencies` 的 Prisma CLI。禁止使用 `docker compose exec server npx prisma migrate deploy`：该顺序会在新服务启动后才迁移，并可能由 `npx` 临时下载未锁定 CLI。独立 runner 尚未获批前，不得以旧命令执行生产 migration；完整生产顺序见 `docs/DEPLOYMENT.md`“第六步”。

## 健康检查

- `GET /api/health`：进程存活探针，不访问外部依赖。
- `GET /api/ready`：数据库就绪探针；数据库不可用时返回 503。
- Real 本地启动后同时核验 `http://127.0.0.1:3000/api/ready` 与经前端代理的 `http://127.0.0.1:5173/api/ready`；两者都成功才说明接线就绪。

## 端口与启动说明

- 本地 Docker 整站通过 `docker compose up -d` 启动，会自动合并仅供本地开发的 `docker-compose.override.yml`；前台入口为 `http://localhost/`，后台登录为 `http://localhost/admin/login`。生产必须按 `docs/DEPLOYMENT.md` 显式使用 `docker compose -f docker-compose.yml ...`，不得自动合并该 override。
- 本地 Real 开发通过 `npm run dev` 启动，前台入口为 `http://127.0.0.1:5173/`，后台登录为 `http://127.0.0.1:5173/admin/login`。不要使用 `localhost` 或 IPv6 地址切换运行模式。
- 宿主机后端运行当前编译产物，不提供后端热更新；修改服务端代码后需停止当前进程并重新执行 `npm run dev` 或 `npm run dev:server`。
- 本地编译产物在模块导入阶段即校验 `JWT_SECRET`，因此开发命令使用 Node `--env-file=.env` 在导入前加载现有 `server/.env`；不得把真实值写入脚本、日志或仓库。
- `server/scripts/start-local.cjs` 只为宿主机开发固定 `127.0.0.1:3000`；Docker/生产继续使用 `server/package.json` 的 `start:prod`，不复用本地绑定。
- 整套 Docker 与宿主机开发可以同时存在：宿主机后端固定占用 `3000`，容器后端通过 override 映射 `127.0.0.1:3002`，完整容器栈经 `:80` 自包含访问。不得改回容器抢占宿主机 `3000`。
- PowerShell 若阻止 `npm.ps1`，请使用 `npm.cmd run dev` 或 `npm.cmd run dev:client`。
- 后端默认使用 `3000`。若该端口已被不明进程占用，先识别并停止错误实例；不要通过临时改端口掩盖 API 所有权冲突。需要改变端口拓扑时按基础设施决策处理。
