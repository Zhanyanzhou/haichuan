# 海川珠宝 — 高端珠宝臻品平台

> 高端珠宝品牌展示与管理平台 | React + NestJS + MySQL

## 🚀 快速开始

### 环境要求

- Node.js 18+
- MySQL 8.0
- Redis 7
- Docker (可选)

### 安装与运行

```bash
# 1. 安装根目录依赖
npm install

# 2. 安装服务端依赖
cd server && npm install

# 3. 安装前端依赖
cd ../client && npm install

# 4. 启动数据库 (Docker)
cd ..
docker-compose up -d

# 5. 数据库迁移 + 初始化
cd server
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed

# 6. 启动开发服务
cd ..
npm run dev
```

### 访问地址

- 前台首页: http://localhost:5173
- 后台管理: http://localhost:5173/admin/login
- API 接口: http://localhost:3000/api
- 数据库管理: http://localhost:5555 (Prisma Studio)

### 默认账号

- 用户名: `admin`
- 密码: 初始化时通过 `BOOTSTRAP_ADMIN_PASSWORD` 环境变量提供
- 角色: 超级管理员

## 📁 项目结构

```
jewelry-platform/
├── client/          # React 前端 (Vite + TypeScript + Ant Design + Tailwind)
│   ├── src/
│   │   ├── pages/       # 页面 (public/前台 + admin/后台)
│   │   ├── components/  # 组件 (ui/基础 + layout/布局)
│   │   ├── store/       # 状态管理 (Zustand)
│   │   ├── services/    # API 封装
│   │   ├── styles/      # 全局样式 (科幻主题)
│   │   └── types/       # TypeScript 类型
├── server/          # NestJS 后端
│   ├── src/
│   │   ├── modules/     # 业务模块 (21个，详见 docs/MODULES.md)
│   │   ├── common/      # 公共 (守卫/拦截器/装饰器)
│   │   └── queue/       # 消息队列
│   └── prisma/          # 数据库模型 & 种子
└── docker-compose.yml
```

## 🎨 技术栈

| 层级   | 技术                                                       |
| ------ | ---------------------------------------------------------- |
| 前端   | React 18 + TypeScript + Vite + Ant Design 5 + Tailwind CSS |
| 动效   | Framer Motion                                              |
| 后端   | NestJS 10 + Prisma 5 + Passport JWT                        |
| 数据库 | MySQL 8.0 + Redis 7                                        |
| AI     | 阿里云视觉智能 API                                         |
| 存储   | 阿里云 OSS                                                 |

## 📋 功能清单

### 前台

- ✅ 科幻风格首页 (3D粒子 + 动态Hero + 分类导航)
- ✅ 热门产品展示
- ✅ 公司品牌介绍
- ✅ 产品分类浏览
- ⬜ 产品详情 (三视图 + 视频)
- ⬜ 购物车 & 在线下单
- ⬜ 客户中心
- ⬜ 产品对比

### 后台

- ✅ 仪表盘
- ✅ 商品管理
- ✅ 分类管理（四级树结构）
- ✅ AI 智能分类
- ✅ 金价管理
- ✅ 库存管理
- ✅ 订单管理
- ✅ 用户权限管理（5 角色 RBAC）
- ✅ 首页可视化配置（页面构建器）
- ✅ 营销活动 & 优惠券
- ✅ 客服工作台（咨询/选款/线索）
- ✅ 数据统计分析
- ✅ 消息通知系统

> 完整功能清单见 `docs/CURRENT_STATE.md`
