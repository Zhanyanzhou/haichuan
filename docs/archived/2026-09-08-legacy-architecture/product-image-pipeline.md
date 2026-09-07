# 商品图片角色与列表图标准化方案

> **HC-PRODUCT-IMAGE-ROLE-AUDIT-15**
> 审计日期：2026-08-06
> **归档于 2026-09-08：** 历史方案已被现行 `Product.primaryImageId` / `listingImageId`、私有媒体裁切和商品媒体完整性实现取代。本文提出的 `ProductImage.role` 不是现行数据模型，不得据此修改 Schema、执行 migration 或恢复旧流程。

---

## 一、当前图片系统

### 1.1 数据模型

**ProductImage（Prisma）：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Int (PK) | 自增主键 |
| `productId` | Int (FK) | 关联 Product，级联删除 |
| `url` | VarChar(500) | 相对路径，如 `/uploads/2026/08/06/xxx.jpg` |
| `type` | ImageType enum | FRONT / SIDE / TOP / DETAIL / WEARING（**视角，非用途**） |
| `sortOrder` | Int | 排序，越小越靠前 |
| `isVideo` | Boolean | 是否为视频 |
| `createdAt` | DateTime | 创建时间 |

**ImageType 枚举：**
```
FRONT   — 正面（兼作"主图"标记，通过 setCoverImage 切换）
SIDE    — 侧面
TOP     — 顶部
DETAIL  — 细节
WEARING — 佩戴效果
```

**⚠️ 关键问题：`type` 字段语义混淆**
- 当前 `type` 描述的是**拍摄视角**（正面/侧面/顶部…）
- 但 `FRONT` 又被 `setCoverImage` 当作**主图标记**使用
- 没有字段区分**图片用途角色**（列表图/详情图/缩略图/原始图）

### 1.2 上传系统

**UploadController / UploadService：**

```
上传流程：
  multer (FileInterceptor)
  → UploadService.uploadFile()
  → 检查 MIME (jpeg/png/webp/gif)
  → 检查大小 (≤10MB)
  → 保存到 /uploads/YYYY/MM/DD/{uuid}.ext
  → 返回 { url: '/uploads/2026/08/06/xxx.jpg', filename, size }
```

**存储特性：**
- 本地磁盘存储（`/uploads/` 目录）
- 按日期分目录
- UUID 重命名，保留原始扩展名
- **无任何图片处理**：不缩放、不裁切、不转码、不生成缩略图
- Server 通过 `ServeStaticModule` 直接提供静态文件访问

### 1.3 图片管理 API

| 端点 | 方法 | 功能 |
|---|---|---|
| `/upload/image` | POST | 上传单张图片 |
| `/upload/images` | POST | 批量上传（最多20张） |
| `/upload/product-images` | POST | 上传商品图片（支持分类标记） |
| `/products/:id/images` | POST | 为商品添加图片记录 |
| `/products/:id/images/:imageId` | PUT | 更新图片类型/排序 |
| `/products/:id/images/:imageId` | DELETE | 删除图片记录 |
| `/products/:id/images/:imageId/cover` | PUT | 设为封面（改所有 FRONT→SIDE，目标→FRONT） |

**`setCoverImage` 实现逻辑：**
```typescript
// 1. 将该商品所有 type='FRONT' 的图片改为 'SIDE'
await prisma.productImage.updateMany({ where: { productId, type: 'FRONT' }, data: { type: 'SIDE' } });
// 2. 将目标图片设为 'FRONT'
await prisma.productImage.update({ where: { id: imageId }, data: { type: 'FRONT' } });
```

### 1.4 商品 API 返回的图片数据

**列表接口 `GET /products`：**
```typescript
include: {
  images: { orderBy: { sortOrder: 'asc' }, take: 1 }  // 只返回第一张
}
```

**详情接口 `GET /products/:id`：**
```typescript
include: {
  images: { orderBy: { sortOrder: 'asc' } }  // 返回全部
}
```

### 1.5 前端图片读取位置

| 页面/组件 | 图片读取方式 | 说明 |
|---|---|---|
| `Catalog/index.tsx` | `product.images[0]` | 列表页主图 |
| `Search/index.tsx` | `product.images[0]` | 搜索结果卡片 |
| `ProductDetail/index.tsx` | `product.images[mainImage].url` | 详情页主图+缩略图切换 |
| `ProductManage/index.tsx` | `product.images` 全量 | 后台管理列表+封面设置 |
| `useProductData.ts` | `(p.images || []).map(img => img.url)` | 统一数据映射 |

**⚠️ 问题：每个组件各自实现 `images[0]`，无统一的图片选择逻辑。**

---

## 二、当前图片角色

### 2.1 现有角色映射

| 成熟电商角色 | 当前系统 | 实现方式 |
|---|---|---|
| **ORIGINAL** | ❌ 无 | 上传后无保留机制，URL 即原始文件 |
| **PRIMARY** | ⚠️ 弱支持 | 通过 `type='FRONT'` + `sortOrder` 隐式标记 |
| **LISTING** | ❌ 无 | 列表直接使用 PRIMARY 图 |
| **DETAIL** | ❌ 无 | 详情页使用全部图片，无专属详情图 |
| **THUMBNAIL** | ❌ 无 | 后台缩略图直接加载 PRIMARY 原图 |

### 2.2 当前能否复用同一张图片承担多个角色？

**能，但效果差：**
- 同一张 4000×6000 原图同时用于列表（显示 300×300）和详情（显示 800×1200）
- 列表加载浪费带宽，浏览器缩放可能模糊
- 无裁切能力——吊坠商品在 1:1 画布中占比 ~65%，戒指仅 ~60%，视觉大小不统一

### 2.3 关键判断

| 问题 | 结论 |
|---|---|
| 当前能否复用同一张图片承担多个角色？ | 能，但不推荐——无尺寸优化，无裁切 |
| 是否需要新增 role 字段？ | **是**——当前 `type` 描述视角，需新字段描述用途 |
| 是否可以使用独立 listingImageId？ | 可选（方案B），但需改 Product 表 |
| 哪种方案改动最小？ | **方案A：ProductImage 增加 `role` 字段** |
| 哪种方案以后最容易扩展？ | 方案A——每个角色可独立衍生多个版本 |

---

## 三、当前问题根因

### 必须区分的五个维度

| 维度 | 当前状态 | 根因 |
|---|---|---|
| **图片文件比例** | 原始比例各异（3:4、1:1、4:5…） | 上传无归一化处理 |
| **图片内容构图** | 吊坠占 ~65%、戒指 ~60%、手镯 ~70% | 无裁切步骤，内容占比不一致 |
| **前端容器** | Catalog 用 `aspect-ratio:1/1` + `object-fit:contain` | 容器统一但内容不统一 |
| **图片角色缺失** | 无 LISTING / THUMBNAIL / ORIGINAL 区分 | `type` 字段只描述视角 |
| **网格列数** | 2/3/4 列响应式 | 列数只影响空间，不影响内容一致性 |

### 关键结论

> **三列布局解决"观看空间"，列表图角色+裁切流程解决"视觉一致性"。二者不得混为一个问题。**

当前已通过 CSS（78% img size + object-fit:contain + 1:1 container）部分缓解了视觉大小差异，但**品类间的内容占比差异无法通过 CSS 消除**——吊坠主体细长、戒指主体方正、手镯主体环形，`contain` 模式下各自的"内容区域"填充率不同。

---

## 四、成熟电商图片体系映射

| 成熟平台角色 | 典型尺寸 | 用途 | 当前项目映射 |
|---|---|---|---|
| **Original** | 原始分辨率 | 保留原件，永不覆盖 | ❌ 无 |
| **Base Image** | 1200-2000px | 商品详情主图 | ⚠️ 复用 FRONT |
| **Listing/Small** | 400-600px, 1:1 | 分类/搜索/推荐列表 | ❌ 无 |
| **Thumbnail** | 80-150px | 后台列表/购物车缩略 | ❌ 无 |
| **Zoom** | 原始分辨率 | 详情页放大镜 | ⚠️ 复用原图 |

参考平台做法：
- **Shopify**：`original` → `large`(2048) → `medium`(1024) → `compact`(640) → `small`(320) → `thumb`(150)
- **Magento**：`Base` → `Small` → `Thumbnail`，后台可配置各角色尺寸
- **Van Cleef & Arpels**：列表页使用统一 1:1 裁切图，详情页使用 4:5 原比例图

---

## 五、建议数据模型（方案A）

### 5.1 给 ProductImage 增加 `role` 字段

```prisma
enum ImageRole {
  ORIGINAL   // 原始上传文件，永不修改/覆盖
  PRIMARY    // 主展示图，用于详情页主图区域
  LISTING    // 列表图，1:1 裁切，用于 Catalog/Search/推荐
  THUMBNAIL  // 缩略图，用于后台列表
}

model ProductImage {
  id        Int       @id @default(autoincrement())
  productId Int       @map("product_id")
  url       String    @db.VarChar(500)
  type      ImageType @default(FRONT)  // 视角：FRONT/SIDE/TOP/DETAIL/WEARING
  role      ImageRole?                  // 用途角色（新增，nullable）
  sortOrder Int       @default(0) @map("sort_order")
  isVideo   Boolean   @default(false) @map("is_video")
  createdAt DateTime  @default(now()) @map("created_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@map("product_images")
}
```

### 5.2 为什么选方案A而非方案B/C

| 方案 | 描述 | 改动量 | 扩展性 | 结论 |
|---|---|---|---|---|
| **A** | ProductImage 增加 `role` 字段 | 1 列 + 1 enum | ✅ 一张图可有多个角色 | **推荐** |
| **B** | Product 加 `primaryImageId` + `listingImageId` | 2 列 + Product 表改 | ❌ 每个产品只能有一个 listing 图 | 不推荐 |
| **C** | 新建 variant 表 | 1 新表 + 关联 | ✅ 最灵活 | 过度设计 |

**方案A 优点：**
- 只增加一个 nullable 字段，对现有没有破坏性影响
- 一张原始图可以派生出多个角色副本（LISTING、THUMBNAIL）
- 每个角色可以有多个变体（如 LISTING 图可以有 2x、3x 版本）
- 与现有 `type` 字段正交：`type`=视角，`role`=用途

**方案A 的 Migration：**
```sql
ALTER TABLE product_images
ADD COLUMN role ENUM('ORIGINAL', 'PRIMARY', 'LISTING', 'THUMBNAIL') NULL DEFAULT NULL;
```

### 5.3 数据填充策略

| 现有记录 | role 值 | 含义 |
|---|---|---|
| `type='FRONT'` 且 sortOrder 最小 | `role=PRIMARY` | 现有主图自动升级为 PRIMARY |
| 其他图片 | `role=NULL` | 视为 ORIGINAL，保留原件 |

---

## 六、后台裁切流程设计

### 6.1 列表图生成流程

```
上传原图（ORIGINAL, role=ORIGINAL）
  → 后台选择「生成列表图」
  → 打开 1:1 裁切界面
    ├─ 固定 1:1 裁切框
    ├─ 缩放滑块（0.5x ~ 2x）
    ├─ 拖动调整位置
    ├─ 预览：桌面三列 / 手机两列
    └─ 确认裁切
  → 后端：sharp 读取原图 → resize + crop → 保存为新文件
  → 数据库：INSERT 新 ProductImage(url=新文件, role=LISTING, type=FRONT)
  → 原图不覆盖
```

### 6.2 裁切所需依赖

当前项目**无**图片处理库。需要新增：

```json
// server/package.json
"sharp": "^0.33.0"   // Node.js 图片处理（resize/crop/format convert）
```

**`sharp` 是唯一推荐依赖**：高性能、零外部依赖（预编译二进制）、支持 JPEG/PNG/WebP/AVIF、API 简洁。

### 6.3 裁切 API 设计

```
POST /products/:id/images/crop
Body: {
  sourceImageId: number,   // 原始图片 ID
  width: number,           // 裁切区域宽度（基于原图坐标）
  height: number,          // 裁切区域高度
  left: number,            // 裁切区域左偏移
  top: number,             // 裁切区域上偏移
  outputSize: number,      // 输出尺寸（默认 600px 宽）
}
Response: {
  id: number,              // 新 LISTING 图片 ID
  url: string,             // 新图片 URL
}
```

### 6.4 前端裁切组件

当前项目**无**现成裁切组件。需新建：

```
client/src/components/admin/ImageCropper.tsx
```

**技术要求：**
- 不引入重型图片编辑库（如 tui-image-editor、PhotoEditorSDK）
- 使用原生 `<canvas>` + React 实现轻量裁切
- 或使用 `react-easy-crop`（仅 ~30KB，专做裁切，无额外依赖链）

---

## 七、前端图片读取规则

### 7.1 统一图片选择函数

```typescript
// client/src/utils/productImage.ts

import type { ProductImage } from '@/types';

/**
 * 按角色获取商品图片 URL
 * 统一读取顺序：LISTING → PRIMARY → 第一张 FRONT → placeholder
 */
export function getProductImage(
  images: ProductImage[],
  role: 'LISTING' | 'PRIMARY' | 'THUMBNAIL'
): string {
  // 1. 精确角色匹配
  const byRole = images.find(img => img.role === role);
  if (byRole) return byRole.url;

  // 2. 列表图回退：PRIMARY → 第一张 FRONT
  if (role === 'LISTING' || role === 'THUMBNAIL') {
    const primary = images.find(img => img.role === 'PRIMARY' || img.type === 'FRONT');
    if (primary) return primary.url;
  }

  // 3. 兜底：第一张有 URL 的图片
  const first = images.find(img => img.url);
  if (first) return first.url;

  // 4. 占位图
  return '/images/products/placeholder.svg';
}

/**
 * 获取列表图（用于 Catalog / Search / 推荐）
 */
export function getListingImage(images: ProductImage[]): string {
  return getProductImage(images, 'LISTING');
}

/**
 * 获取详情主图（用于 ProductDetail）
 */
export function getPrimaryImage(images: ProductImage[]): string {
  return getProductImage(images, 'PRIMARY');
}

/**
 * 获取缩略图（用于后台列表）
 */
export function getThumbnailImage(images: ProductImage[]): string {
  return getProductImage(images, 'THUMBNAIL');
}
```

### 7.2 各页面统一迁移

| 页面 | 当前 | 迁移后 |
|---|---|---|
| `Catalog/index.tsx` | `product.images[0]` | `getListingImage(product.images)` |
| `Search/index.tsx` | `product.images[0]` | `getListingImage(product.images)` |
| `ProductDetail/index.tsx` | `product.images[mainImage].url` | `getPrimaryImage(product.images)` |
| `ProductManage/index.tsx` | `r.images[0].url` | `getThumbnailImage(r.images)` |
| `useProductData.ts` | `(p.images||[]).map(img=>img.url)` | 附加 `listingImage` computed 字段 |

### 7.3 列表 API 改造

当前列表接口只 `take: 1`（第一张图），改造后应返回所有带 `role` 标记的图片：

```typescript
// products.service.ts findAll()
include: {
  images: {
    where: {
      OR: [
        { role: 'LISTING' },
        { role: 'PRIMARY' },
        { type: 'FRONT' },
      ]
    },
    orderBy: { sortOrder: 'asc' },
    take: 3,  // 最多返回3张（LISTING + PRIMARY + 备用）
  },
}
```

---

## 八、网格结论

### 8.1 保留当前设计

| 断点 | 列数 | 图片 | 分割线 |
|---|---|---|---|
| ≥1080px | 3 列 | 1:1 LISTING 图 | 1px #E8E7E3 matrix |
| 768-1080px | 2 列 | 1:1 LISTING 图 | 1px #E8E7E3 matrix |
| <768px | 2 列 | 1:1 LISTING 图 | 1px #E8E7E3 matrix |

### 8.2 责任分离

| 问题 | 解决方案 | 负责层 |
|---|---|---|
| 商品观看空间 | 3 列桌面 / 2 列平板+手机 | CSS Grid 布局 |
| 图片视觉一致性 | 统一 1:1 LISTING 图 + 裁切流程 | 后端 sharp + role 字段 |
| 图片加载性能 | LISTING 图限制 600px 宽 | 后端裁切输出尺寸 |

---

## 九、需要修改的文件清单

### 数据库

| 文件 | 操作 | 说明 |
|---|---|---|
| `server/prisma/schema.prisma` | 修改 | 新增 `ImageRole` enum + `role` 字段 |
| Migration | 生成 | `ALTER TABLE product_images ADD COLUMN role ENUM(...)` |

### 后端

| 文件 | 操作 | 说明 |
|---|---|---|
| `server/package.json` | 新增依赖 | `sharp` |
| `server/src/modules/products/products.service.ts` | 修改 | 1) `findAll` include 改为按 role 筛选; 2) 新增 `cropImage` 方法 |
| `server/src/modules/products/products.controller.ts` | 修改 | 新增 `POST /:id/images/crop` 端点 |
| `server/src/modules/upload/upload.service.ts` | 扩展 | 新增 `cropAndSave` 方法（调 sharp） |

### 前端

| 文件 | 操作 | 说明 |
|---|---|---|
| `client/package.json` | 新增依赖 | `react-easy-crop` |
| `client/src/utils/productImage.ts` | **新建** | 统一图片选择函数 |
| `client/src/components/admin/ImageCropper.tsx` | **新建** | 裁切组件 |
| `client/src/hooks/useProductData.ts` | 修改 | 使用 `getListingImage` |
| `client/src/pages/public/Catalog/index.tsx` | 修改 | `images[0]` → `getListingImage` |
| `client/src/pages/public/Search/index.tsx` | 修改 | `images[0]` → `getListingImage` |
| `client/src/pages/public/ProductDetail/index.tsx` | 修改 | 使用 `getPrimaryImage` |
| `client/src/pages/admin/ProductManage/index.tsx` | 修改 | 使用 `getThumbnailImage` + 裁切入口 |

---

## 十、预计开发风险

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| Migration 对现网数据影响 | **低** | `role` 为 nullable，现有记录保持 NULL，向下兼容 |
| sharp 二进制兼容性 | **低** | sharp 预编译跨平台（Windows/Linux/macOS），已验证 |
| 前端裁切组件 UX 复杂度 | **中** | 使用 `react-easy-crop` 开箱即用，仅暴露必要参数 |
| 裁切后文件清理 | **中** | ORIGINAL 永不删除；LISTING 重新生成时覆盖旧文件 |
| 图片 URL 变更对 SEO 影响 | **低** | 列表 API 改为返回 LISTING 图 URL，不影响现有索引 |

---

## 十一、推荐下一任务

**HC-PRODUCT-IMAGE-ROLE-IMPLEMENT-16**

核心实施步骤：
1. Prisma schema 增加 `ImageRole` enum + `role` 字段 → migration
2. 安装 `sharp`（server）+ `react-easy-crop`（client）
3. 新建 `client/src/utils/productImage.ts` 统一图片选择
4. 改造 Catalog / Search / ProductDetail / ProductManage 图片读取
5. 新建 `ImageCropper` 组件 + `POST /products/:id/images/crop` 端点
6. 列表 API 返回 LISTING 图优先

---

## 附录 A：当前图片数据流全景

```
┌──────────────┐
│  上传文件     │  multer FileInterceptor
│  (前端选择)   │
└──────┬───────┘
       ▼
┌──────────────┐
│  文件保存     │  /uploads/YYYY/MM/DD/{uuid}.ext
│  (原始原样)   │  无缩放、无裁切、无转码
└──────┬───────┘
       ▼
┌──────────────┐
│  数据库记录   │  ProductImage { url, type, sortOrder }
│  (视角标记)   │  type ∈ {FRONT, SIDE, TOP, DETAIL, WEARING}
└──────┬───────┘
       ▼
┌──────────────┐
│  设置主图     │  setCoverImage: 全部FRONT→SIDE, 目标→FRONT
│  (隐式标记)   │  ← 用 type 做角色代理
└──────┬───────┘
       ▼
┌──────────────┐
│  商品 API     │  列表: images.take(1) → 第一张 FRONT
│  (返回图片)   │  详情: images 全部
└──────┬───────┘
       ▼
┌──────────────┐
│  列表显示     │  Catalog/Search: images[0]
│  (前端直接取) │  ProductDetail: images[mainImage]
└──────────────┘
```

## 附录 B：改造后图片数据流

```
┌──────────────┐
│  上传文件     │
└──────┬───────┘
       ▼
┌──────────────┐
│  保存原始文件  │  ProductImage { url, type='FRONT', role='ORIGINAL' }
└──────┬───────┘
       ▼
┌──────────────┐
│  裁切列表图    │  sharp: 原图 → 1:1 crop → resize 600px
│               │  ProductImage { url=new, role='LISTING' }
└──────┬───────┘
       ▼
┌──────────────┐
│  商品 API     │  列表: 按 role=LISTING 优先返回
│               │  详情: 按 role=PRIMARY 优先返回
└──────┬───────┘
       ▼
┌──────────────┐
│  统一选择函数  │  getListingImage() / getPrimaryImage()
│               │  回退链: LISTING → PRIMARY → FRONT → placeholder
└──────────────┘
```
