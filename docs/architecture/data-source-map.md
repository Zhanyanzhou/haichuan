# 海川珠宝 — 数据源地图 (Data Source Map)

> 生成日期：2026-08-06 | 阶段：HC-PROGRAM-00

---

## 数据源地图

| 功能 | 当前正式数据源 | API | 数据库 | 静态回退 | 状态 |
|---|---|---|---|---|---|
| **商品列表** | `products.ts` (静态) | `GET /api/products` (空) | `products` (空表) | sharedProducts (12条) | **静态数据** |
| **商品详情** | `products.ts` 查找 | `GET /api/products/:id` | `products` | sharedProducts find | **静态数据** |
| **分类导航** | — | `GET /api/categories/tree` (空) | `categories` (空表) | mockCategories (仅Mock) | **阻断** |
| **搜索** | 客户端 filter | 无专用搜索 API | — | 内存过滤 | **静态数据** |
| **选款目录** | `catalogData.ts` + `products.ts` | 无 | — | 硬编码 | **静态数据** |
| **首页/一级页装修** | PageDocument API | `GET /api/page-modules/:pageKey/published` | `page_documents` + `page_document_revisions` | 未发布时硬编码 FallbackHome(仅首页) | **真实闭环** |
| **首页内容槽** | ContentSlot API | `GET /api/content-slots/published` | `content_slots` | — | **遗留体系**(仅首页 HERO 兜底消费,清退待定) |
| **网站设置** | Settings API | `GET /api/settings` | `settings.json` (文件) | — | **真实闭环** |
| **预约咨询** | Inquiry API | `POST /api/inquiries` | `inquiries` | — | **真实闭环** |
| **选款咨询(后台)** | SelectionInquiry API | `GET/PUT /api/selection-inquiries` | `selection_inquiries` | — | **真实闭环** |
| **选款咨询(前台)** | ❌ 不存在 | 无公开提交端点 | — | — | **未接入** |
| **页面构建器** | PageDocument API | `/api/page-modules/admin` 等 | `page_documents` / `page_document_revisions` | — | **真实闭环** |
| **工作台** | products/inquiries/page-modules API | 3个 GET | 3个表 | — | **部分闭环** |
| **购物车** | Zustand + localStorage | — | — | — | **本地状态** |
| **结算** | Zustand | — | — | — | **本地状态** |
| **个人中心** | — | — | — | — | **空壳** |
| **金价** | GoldPrice API | `GET /api/gold-price/latest` | `gold_prices` | — | **真实闭环** |

---

## 数据流现状总结

### ✅ 真实闭环 (6项)
- 网站设置 (Settings → JSON 文件)
- 预约咨询提交 (Contact → Inquiry API → MySQL)
- 选款咨询后台管理 (SelectionInquiry API → MySQL)
- 页面构建器 (PageDocument API → `page_documents`/`page_document_revisions`)
- 金价 (GoldPrice API → MySQL)
- 认证 (Auth API → JWT + MySQL users 表)

### ⚠️ 部分闭环 (3项)
- 首页 (PageDocument API;未发布装修时显示硬编码 FallbackHome)
- 工作台 (API 调用有 400 错误)
- 首页内容槽 (API 可用，数据为空)

### 🔴 静态数据 (5项)
- 商品列表 → `products.ts`
- 商品详情 → `products.ts`
- 搜索 → 内存过滤
- 选款目录 → `catalogData.ts`
- 分类导航 → 无数据

### ⚫ 本地状态 (2项)
- 购物车 → Zustand + localStorage
- 结算 → Zustand

### ⬜ 未接入 (1项)
- 选款咨询前台提交 → 不存在公开端点

### ⬜ 空壳 (2项)
- 个人中心
- 关于我们 / 定制页 (纯静态展示)
