# 海川珠宝 — 当前状态

> 最后更新：2026-08-07 | 审计发现汇总

## 页面清单（30 页，全部有真实代码）

### 前台（12 页）

| 路由            | 功能                             |
| --------------- | -------------------------------- |
| `/`             | 首页                             |
| `/products`     | 产品列表                         |
| `/products/:id` | 产品详情                         |
| `/catalog`      | 选款中心（VCA 矩阵网格）         |
| `/cart`         | 购物车                           |
| `/checkout`     | 结算                             |
| `/custom`       | 定制服务                         |
| `/search`       | 搜索                             |
| `/customer`     | 用户中心                         |
| `/about`        | 关于我们                         |
| `/contact`      | 联系我们                         |
| `/preview/home` | 首页预览（iframe，页面构建器用） |

### 后台（18 页）

| 路由                       | 功能                                     |
| -------------------------- | ---------------------------------------- |
| `/admin/dashboard`         | 工作台（统计卡片 + 线索列表 + 快捷操作） |
| `/admin/products`          | 商品管理（CRUD、图片、状态流转）         |
| `/admin/categories`        | 分类管理（4 级树形）                     |
| `/admin/inventory`         | 库存管理（多仓库、安全预警）             |
| `/admin/gold-price`        | 金价管理（手动调价 + 自动采集）          |
| `/admin/media`             | 素材库（产品图片 + 页面素材）            |
| `/admin/orders`            | 订单管理（状态流转、详情弹窗）           |
| `/admin/inquiries`         | 预约咨询                                 |
| `/admin/selection-inquiry` | 选款咨询                                 |
| `/admin/leads`             | 客户线索（多源聚合）                     |
| `/admin/homepage`          | 页面构建器（可视化编辑、三栏布局）       |
| `/admin/site-content`      | 网站设置（品牌信息、SEO）                |
| `/admin/ai-classify`       | AI 智能分类（Kimi Vision API）           |
| `/admin/analytics`         | 行为分析                                 |
| `/admin/users`             | 用户管理（5 角色 RBAC）                  |
| `/admin/audit-logs`        | 操作日志                                 |
| `/admin/settings`          | 系统维护                                 |
| `/admin/login`             | 登录                                     |

## 服务端模块（21 个，全部有 controller/service/module）

products, categories, auth, users, orders, inventory, inquiries, selection-inquiry, leads, gold-price, upload, settings, homepage, page-modules, content-slots, ai-classify, analytics, marketing, notifications, statistics, cart

## 已知问题

1. **死代码** — 8 个 common/ui 组件未被引用
2. **样式分裂** — Tailwind 和 inline style 各占一半，无统一规范
3. **配置冗余** — `vite.config.ts/js/d.ts` 三个文件并存
4. **Prisma 类型绕过** — 5 个 service 中使用 `(this.prisma as any)`
5. **仓库污染** — 75 个设计截图文件提交在代码仓库
6. **两套 blocks** — 旧版 HeroBlock 等 6 个 vs 新版 HeroSection 等 4 个
7. **电商未验证** — Feature Flag 关闭的代码从未在真实环境测试
8. **0 个测试** — 全项目无单元测试、E2E 测试
9. **cwd 依赖** — 服务端必须从 `server/` 目录启动
