# 海川珠宝 · 项目共享说明

> 所有 Agent（客户经理、策划、开发、检查）共用此文件。

---

## 🤵 Agent 团队架构

```
用户 → 客户经理（唯一入口） → 🧠策划（出方案）
                            → 💻开发（写代码）
                            → 🔍检查（审质量）
```

- **客户经理**：协调分配，用户只跟它对话
- **策划/开发/检查**：后台专员，由客户经理调用

---

## 项目概况

**海川珠宝** — 高端珠宝电商平台，面向 C 端消费者购买 + B 端后台管理。

- 前台：首页、选款中心、商品列表/详情、购物车、结算、会员中心、定制、关于、联系
- 后台：Dashboard、商品/分类/订单/用户管理、金价管理、AI 图片分类、首页可视化配置
- 4000+ 产品款式

---

## 技术栈

### Skill 使用规范
- **design-taste-frontend Skill**：仅限客户前台视觉/布局/响应式/交互/性能/无障碍任务，管理后台只允许参考信息层级、状态完整性、色彩对比度、响应式、无障碍和性能。
- 完整规范：`.vscode/skills/taste-skill-governance.md`
- 该 Skill 不具有产品决策权和自动执行权限，任何安装/迁移命令需用户批准。

### 技术栈

| 层       | 技术                                                                       |
| -------- | -------------------------------------------------------------------------- |
| 前端     | React 18 + TypeScript + Vite + Tailwind CSS + Ant Design 5 + Framer Motion |
| 状态管理 | Zustand                                                                    |
| 后端     | NestJS 10 + Prisma ORM                                                     |
| 数据库   | PostgreSQL                                                                 |
| 部署     | Docker Compose                                                             |

---

## 目录结构

```
client/src/
├── components/
│   ├── blocks/       # 首页可配置区块
│   ├── common/       # 通用组件（Logo, ErrorBoundary, ImageUpload）
│   ├── layout/       # 布局（PublicLayout, AdminLayout）
│   └── ui/           # UI 组件（ScifiButton）
├── pages/
│   ├── public/       # 前台页面
│   └── admin/        # 后台页面
├── services/         # api.ts（API 封装）, mockData.ts（Mock 数据）
├── store/            # Zustand stores
├── utils/            # 工具函数
├── types/            # TypeScript 类型
└── data/             # 静态共享数据

server/src/
├── common/           # prisma, kimi(AI), decorators, guards, filters, interceptors
├── modules/          # 17 个业务模块
└── queue/            # Bull 消息队列
```

---

## 珠宝行业特定字段

- `materialType`: GOLD_999 / GOLD_9999 / AU750 / PT950 / S925 / DIAMOND / JADE / PEARL / GEMSTONE
- `goldWeight`: 金重（克）
- `craftFee`: 工费
- `ringSize`: 圈口尺寸

---

## 工作流规则

1. **先方案，后执行** — 改代码前必须先说明方案，等待确认
2. **例外**：用户说"直接做"可跳过；纯查询问题无需方案；Bug 已明确指出可直接修
3. 前端路径别名 `@/` = `src/`
4. 修改完代码后用 `get_errors` 检查是否有报错

---

## 当前状态

- 开发模式：Mock 数据（`USE_MOCK = true`），前端可独立运行
- 前端端口：5173-5176
- 后端端口：3000
