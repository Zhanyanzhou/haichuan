# 海川珠宝 — 开发路线图 (Development Roadmap)

> 生成日期：2026-08-06 | 阶段：HC-PROGRAM-00

---

## 阶段概览

```
HC-PROGRAM-00 ✅ 系统盘点、基线建立 [当前]
    ↓
HC-PLATFORM-01   平台稳定性修复
    ↓
HC-PLATFORM-02   权限体系完善
    ↓
HC-DATA-01       产品数据导入
    ↓
HC-FRONT-01      客户前台数据接入
    ↓
HC-CMS-03        页面构建器增强
HC-SELECTION-01  选款咨询前台链路
HC-ORDER-01      订单系统完善
HC-ORDER-02      支付/物流/售后
```

---

## 各阶段详情

### HC-PROGRAM-00 ✅ (当前)
- 系统全量盘点
- 数据源地图
- 目标架构定稿
- 基线建立 (Git/备份)
- 架构文档

### HC-PLATFORM-01 — 平台稳定性修复
**目标**: 消除阻断问题，建立可依赖的基线

| 任务 | 说明 |
|---|---|
| Dashboard API 400 修复 | 排查 ValidationPipe 对无参数 GET 请求的影响 |
| Settings 入库 | 从 settings.json 迁移到 SiteSetting 数据库表 |
| `nest build` 修复 | 确保 npm run build 可正常工作 |
| Prisma generate 流程 | 文档化 DLL 锁定解决方案 |
| 前端错误状态区分 | "加载失败" vs "暂无数据" 不可混淆 |
| Git 仓库重建 | git init + 初始提交 |

### HC-PLATFORM-02 — 权限体系完善
**目标**: 实现角色级权限控制

| 任务 | 说明 |
|---|---|
| Permission 模型 | RBAC 权限表 |
| 角色-路由映射 | 前端 ProtectedRoute 配置 roles |
| 后端 Guard 增强 | RolesGuard 全局应用 |
| 菜单按角色显示 | AdminLayout 根据 role 过滤菜单 |

### HC-DATA-01 — 产品数据导入
**目标**: 数据库有真实产品数据

| 任务 | 说明 |
|---|---|
| 分类初始化 | 四级分类数据导入 |
| 产品批量导入 | 从 Excel/CSV 或手动录入 |
| 产品图片上传 | 三视图图片关联 |
| ProductImage 验证 | 确保图片上传和关联正常 |

### HC-FRONT-01 — 客户前台数据接入
**目标**: 前台页面使用真实 API 数据

| 任务 | 说明 |
|---|---|
| 产品列表 API 接入 | 替换 products.ts 静态数据 |
| 产品详情 API 接入 | 替换 find 查找逻辑 |
| 分类导航 API 接入 | 使用 categories/tree 真实数据 |
| 搜索功能 API 接入 | 实现后端搜索接口 |
| 购物车持久化 | 可选：服务端购物车 |

### HC-CMS-03 — 页面构建器增强
**目标**: 页面构建器功能完善

| 任务 | 说明 |
|---|---|
| 模板系统 | PageTemplate + ModuleDefinition |
| 版本管理 | PageVersion (草稿/已发布/历史) |
| 媒体素材库 | MediaAsset 统一管理 |
| 预览增强 | 设备预览/SEO 预览 |

### HC-SELECTION-01 — 选款咨询前台链路
**目标**: 客户可提交选款咨询

| 任务 | 说明 |
|---|---|
| 公开提交 API | POST /api/selection-inquiries (Public) |
| 前台选款表单 | 客户选款咨询页面 |
| 产品快照生成 | 提交时自动生成产品快照 |
| 通知集成 | 新咨询通知管理员 |

### HC-ORDER-01 — 订单系统完善
**目标**: 完整订单流程

### HC-ORDER-02 — 支付/物流/售后
**目标**: 订单全链路

---

## 当前阻断问题 (阻止 HC-PLATFORM-01)

| # | 问题 | 严重度 | 影响 |
|---|---|---|---|
| 1 | Dashboard/Products/Settings API 返回 400 | P0 | 后台核心页面功能受限 |
| 2 | Git 仓库为空 (.git/objects 丢失) | P1 | 无法版本控制 |
| 3 | `npx nest build` 不工作 | P1 | 开发体验 |
| 4 | `prisma generate` DLL 锁定 | P2 | 需要 kill 进程再生成 |
| 5 | HeroBlock.tsx JSX 语法错误 | P2 | 冻结区域，不影响功能 |
