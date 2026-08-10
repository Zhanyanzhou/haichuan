# 海川珠宝 — 开发工作流

> 最后更新：2026-08-07

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

# 2. 启动数据库
docker-compose up -d

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
| 5173 | Vite 前端      |
| 3000 | NestJS 后端    |
| 3306 | MySQL (Docker) |
| 6379 | Redis (Docker) |

## 常用命令

| 命令                     | 说明                   |
| ------------------------ | ---------------------- |
| `npm run dev`            | 同时启动前后端         |
| `npm run dev:client`     | 仅前端                 |
| `npm run dev:server`     | 仅后端                 |
| `npm run build`          | 生产构建               |
| `npx prisma migrate dev` | 数据库迁移             |
| `npx prisma db seed`     | 种子数据               |
| `npx prisma studio`      | 数据库管理界面         |
| `npx prisma generate`    | 重新生成 Prisma Client |
| `npx tsc --noEmit`       | 类型检查               |

## 注意事项

1. **服务端必须从 `server/` 目录启动**：`process.cwd()` 用于解析 `uploads/` 路径
2. **修改 schema.prisma 后**：运行 `prisma migrate dev` → `prisma generate`
3. **修改 api.ts**：影响 26 个文件，需全局检查
4. **Feature Flags** 在 `client/src/store/featureFlags.ts` 管理

## Mock 模式

`client/src/services/api.ts` 中 `USE_MOCK = true` 可绕过真实 API。适用于后端未启动时的前端开发。
