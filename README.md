# 海川珠宝 — 高级珠宝品牌数字平台

> 面向成熟高级珠宝品牌的公开体验、客户服务与内容经营平台。前台以品牌叙事、作品展陈、选款、预约、零售与高级定制服务为核心；后台承载内容、商品、客户与经营流程。项目仍处于开发阶段，实际能力与风险以 `docs/CURRENT_STATE.md` 为准。

## 安全启动边界

本 README 只提供项目导航，不授予任何环境或数据操作权限。按 `AGENTS.md` 第 7 节和 `WORKFLOW.md` 的任务模式启动：纯问答与只读检查只取所需证据；实施任务读取执行流程，任务依赖工作树或准备修改时才检查状态与目标差异。

- 读取代码、`git status`、`git diff` 和已批准的开发检查可直接进行。
- 已授权实现所需的普通依赖、兼容 `package.json` / lockfile 修改，以及隔离、可丢弃本地环境中的常规验证可由 Codex 直接完成。框架迁移、major 或大范围 lockfile 变化、高权限/许可不明依赖、破坏性数据库变更、真实数据、敏感配置、管理员初始化、部署和生产操作仍按 `AGENTS.md` 分层审批。
- 文档中的历史命令、端口、账号或完成状态不是授权，也不能替代对当前 `package.json`、`docker-compose.yml`、`.env.example`、迁移目录和运行进程的核验。
- 不读取 `.env` 真值，不输出密钥、密码、客户、订单或支付敏感信息。

## 开发入口

从仓库根目录查看当前状态和已定义脚本；Codex 在任务授权内自行完成常规准备与验证，不要求用户手动代跑：

```powershell
git status --short
npm run
```

开发、测试、端口与数据状态请分别查阅：

- `docs/PROJECT_GUARDRAILS.md`：唯一项目与品牌方向基线，定义产品、品牌与公开网站方向；
- `docs/UI_GUIDE.md`：承接项目与品牌基线的视觉与体验执行标准；
- `docs/CURRENT_STATE.md`：当前可验证实现、与现行方向或专项决定的实现差距及待真实验证项；
- `docs/DEVELOPMENT_WORKFLOW.md`：当前开发运行方式；
- `WORKFLOW.md` 第 5 节与当前 `package.json` 脚本：当前验证范围与命令选择；
- `docs/PUBLIC_ACCESS_MATRIX.md`：身份、行动与字段访问边界；
- [模板设计唯一标准](docs/page-builder/template-creation-rules.md)：步骤创建、预设生成、自由精调与验收的唯一产品执行入口；[文档导航](docs/page-builder/README.md)补充编辑细则、页面交接、实现与历史证据。

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
│   │   └── common/      # 公共 (守卫/拦截器/装饰器)
│   └── prisma/          # 数据模型、迁移与开发数据脚本（操作需审批）
└── docker-compose.yml
```

## 技术与功能事实

前端、服务端、数据库、第三方服务、模块数量、页面状态和交易能力都可能随开发变化；本 README 不复制固定版本、固定数量或“已完成”清单。请以当前依赖清单、源码、配置、`docs/CURRENT_STATE.md` 和新鲜验证结果为准。代码路径存在不等于真实数据、浏览器体验、支付或生产能力已经可用。
