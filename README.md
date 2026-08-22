# 海川珠宝 — 高级珠宝品牌数字平台

> 面向成熟高级珠宝品牌的公开体验、客户服务与内容经营平台。前台以品牌叙事、作品展陈、选款、预约、零售与高级定制服务为核心；后台承载内容、商品、客户与经营流程。项目仍处于开发阶段，实际能力与风险以 `docs/CURRENT_STATE.md` 为准。

## 安全启动边界

本 README 只提供项目导航，不授予任何环境或数据操作权限。开始工作前必须先阅读 `AGENTS.md` 与 `WORKFLOW.md`，检查当前工作树，并以当前代码、配置和新鲜验证为准。

- 读取代码、`git status`、`git diff` 和已批准的开发检查可直接进行。
- 安装或升级依赖、修改 `package.json`、运行 Prisma migration 或 seed、启动或变更 Docker/数据库、修改环境变量、初始化管理员，以及任何部署或生产操作，都必须按 `AGENTS.md` 的对应审批要求执行。
- 文档中的历史命令、端口、账号或完成状态不是授权，也不能替代对当前 `package.json`、`docker-compose.yml`、`.env.example`、迁移目录和运行进程的核验。
- 不读取 `.env` 真值，不输出密钥、密码、客户、订单或支付敏感信息。

## 开发入口

在依赖和本地环境已经由用户确认准备完成的前提下，从仓库根目录查看当前状态和已定义脚本：

```powershell
git status --short
npm run
```

开发、测试、端口与数据状态请分别查阅：

- `docs/CURRENT_STATE.md`：当前可验证实现、已批准目标与待真实验证项；
- `docs/DEVELOPMENT_WORKFLOW.md`：当前开发运行方式；
- `docs/VERIFICATION_RUNBOOK.md`：历史验证证据边界；实际检查须从当前脚本重新选择；
- `docs/PUBLIC_ACCESS_MATRIX.md`：身份、行动与字段访问边界。

## 项目结构

```
jewelry-platform/
├── client/          # React 前端 (Vite + TypeScript + Ant Design + Tailwind)
│   ├── src/
│   │   ├── pages/       # 页面 (public/前台 + admin/后台)
│   │   ├── components/  # 组件 (ui/基础 + layout/布局)
│   │   ├── store/       # 状态管理 (Zustand)
│   │   ├── services/    # API 封装
│   │   ├── styles/      # 全局样式与品牌体验基础
│   │   └── types/       # TypeScript 类型
├── server/          # NestJS 后端
│   ├── src/
│   │   ├── modules/     # 业务模块（当前清单见 docs/CURRENT_STATE.md）
│   │   ├── common/      # 公共 (守卫/拦截器/装饰器)
│   │   └── queue/       # 消息队列
│   └── prisma/          # 数据模型、迁移与开发数据脚本（操作需审批）
└── docker-compose.yml
```

## 技术与功能事实

前端、服务端、数据库、第三方服务、模块数量、页面状态和交易能力都可能随开发变化；本 README 不复制固定版本、固定数量或“已完成”清单。请以当前依赖清单、源码、配置、`docs/CURRENT_STATE.md` 和新鲜验证结果为准。代码路径存在不等于真实数据、浏览器体验、支付或生产能力已经可用。
