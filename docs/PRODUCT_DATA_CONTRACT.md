# 海川珠宝 — 商品数据契约（PRODUCT_DATA_CONTRACT）

> 本文件是 4000+ 商品正式导入、后台编辑与 AI 开发**共同遵守的商品数据标准**。
> 规定每个字段的含义、类型、必填、来源、当前多写法；明确 Product / SKU / Inventory / 价格 / 分类 / 图片之间的标准关系。
> 与其他治理文件的关系：硬规则见根目录 `PROJECT_RULES.md`；架构决策与【待决策】见 `docs/DECISIONS.md`；执行流程见 `WORKFLOW.md`。本文件不重复其内容，只聚焦商品数据。
> 最近核对：2026-08-12（基于当前工作区代码与 `server/prisma/schema.prisma`）。

## 阅读约定

- **标准**：当前代码已确认、导入/编辑必须遵守的字段语义。
- ⚠️ **冲突/多写法**：当前代码中已存在、会导致 4000+ 导入数据不一致的字段或结构（见第 12 节）。
- 🟡 **【待产品决策】**：无法从代码确认、**不得自行选择方案**的事项（见第 13 节）。

---

## 1. 两类商品的划分（核心）

代码层**没有**用 `salesMode` 强制区分"是否需要 SKU/库存"——`createSku`/`create`/`findAll`/`gold-price`/`inventory` 均不读 `salesMode`，商品可无 SKU 直接 `PUBLISHED`。因此"两类商品"目前是**业务语义约定，不是代码强制**。

| 类别                                | 对应 `salesMode`                                                | 是否需要 SKU   | 是否需要库存                              | 价格要求                        | 当前状态                                  |
| ----------------------------------- | --------------------------------------------------------------- | -------------- | ----------------------------------------- | ------------------------------- | ----------------------------------------- |
| **A 类：可销售**                    | `DIRECT_PURCHASE`                                               | 需要           | 需要（`ProductSKU.stock` 或 `Inventory`） | `price` > 0                     | � **已开放**（需登录，线下转账+凭证付款） |
| **B 类：展示 / 选款 / 询价 / 定制** | `DISPLAY_ONLY` / `SELECTION` / `APPOINTMENT` / `CUSTOM_INQUIRY` | 不强制（可无） | 不强制                                    | 可为 0（展示）/可填（选款参考） | 当前主力；现有批量导入脚本用 `SELECTION`  |

- 🟡 **4000+ 商品正式导入时属于哪一类、用哪个 `salesMode`、是否需要真实库存** —— 【待产品决策】。这是导入前必须先确定的第一件事（见第 14 节）。
- 现有 `create-products.mjs` 批量创建的是 **B 类（`SELECTION`，无 SKU、无库存、无价格、无金重）** 的"空壳商品"。

---

## 2. Product 字段标准

来源：`server/prisma/schema.prisma:79-134`、`server/src/modules/products/products.service.ts`（`mapCreateDto` / `mapUpdateDto` / `findAll` / `findById`）、`server/src/modules/products/dto/create-product.dto.ts`。

| 字段                                                         | 含义                          | 类型                         | 必填     | 默认（create）                   | 数据来源                                 | 多写法/风险                                                                                                        |
| ------------------------------------------------------------ | ----------------------------- | ---------------------------- | -------- | -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `code`                                                       | 货号，全系统唯一标识          | VarChar(50) `@unique`        | **必填** | —                                | 业务给定（图片文件名前缀，如 `ATP3620`） | ⚠️ 导入脚本同款冲突自动加 `-2/-3` 后缀，事后靠 merge 脚本合并，易混图                                              |
| `name`                                                       | 商品名称                      | VarChar(200)                 | **必填** | —                                | 业务给定                                 | ⚠️ 现脚本从图片文件名截取得名，产生残缺名（"珐琅"、"ATP1056"）；`_names.json` 有 700+ 中文名字典但**未被代码引用** |
| `shortDescription`                                           | 简介                          | VarChar(500)                 | 可选     | `null`                           | 人工/AI 文案                             | —                                                                                                                  |
| `description`                                                | 详情正文                      | Text                         | 可选     | `null`                           | 人工/AI 文案                             | ⚠️ `findAll` 不返回（仅 `findById` 返回）                                                                          |
| `categoryId`                                                 | 所属分类（单分类）            | Int FK                       | **必填** | —                                | 分类树 id                                | ⚠️ 强校验且不自动建分类；导入前必须预建分类树；现脚本硬编码 `1`/`9`                                                |
| `materialType`                                               | 材质                          | enum `MaterialType`（10 值） | 可选     | `GOLD_999`                       | 业务给定                                 | ⚠️ 现脚本硬编码 `GOLD_999`，与真实材质可能不符                                                                     |
| `goldWeight`                                                 | 金重(g)                       | Decimal(8,2)                 | 可选     | `0`                              | 业务给定/称重                            | ⚠️ `=0` 时**不参与金价调价**；与 `weight`(总重)易混                                                                |
| `craftFee`                                                   | 工费                          | Decimal(10,2)                | 可选     | `0`                              | 业务给定                                 | 金价调价公式用到；跟随父商品同步到 SKU                                                                             |
| `price`                                                      | 当前售价（列表/卡片主展示价） | Decimal(10,2)                | 可选     | `0`                              | 金价引擎/人工                            | ⚠️ 发布门禁 `price>0` **只在 `updateStatus`**；`create` 直接接受 `PUBLISHED` 不校验 → 可能产生 0 元已上架商品      |
| `priceMin` / `priceMax`                                      | 名义价格区间                  | Decimal(10,2)                | 可选     | `0`                              | —                                        | ⚠️ **死字段**：无过滤、无编辑 UI、仅 `clone` 写、仅 `priceMin` 做展示兜底。导入不应填值                            |
| `weight`                                                     | 总重量(g)                     | Decimal(8,2)                 | 可选     | `0`                              | 称重                                     | 与 `goldWeight` 不同概念                                                                                           |
| `size`                                                       | 尺寸规格                      | VarChar(100)                 | 可选     | `null`                           | 业务给定                                 | 自由文本                                                                                                           |
| `gemInfo`                                                    | 宝石信息                      | Json                         | 可选     | `null`                           | 人工                                     | ⚠️ 后端 `any` 无校验；**形状约束只在前端**（见第 8 节）                                                            |
| `craftTechnique`                                             | 工艺技法                      | Json                         | 可选     | `null`（create）/ `[]`（编辑器） | 人工                                     | ⚠️ 后端 `any`；前端是 `string[]`；**空值两套写法**（`null` vs `[]`，见第 8 节）                                    |
| `status`                                                     | 商品状态                      | enum `ProductStatus`（4 值） | 可选     | `DRAFT`                          | 状态流转                                 | ⚠️ 现脚本直接 `PUBLISHED`（绕过发布门禁，见第 9 节）                                                               |
| `salesMode`                                                  | 销售模式                      | enum `SalesMode`（5 值）     | 可选     | `DISPLAY_ONLY`                   | 业务                                     | 后端**无业务分支**，仅元数据标签（见第 9 节）                                                                      |
| `isHot/isNew/isRecommended/isLimited/isCustom/multiDiscount` | 展示标记                      | Boolean                      | 可选     | `false`                          | 运营                                     | —                                                                                                                  |
| `sortOrder`                                                  | 排序                          | Int                          | 可选     | `0`                              | 运营                                     | `sortBy='sortOrder'` 时按其 asc                                                                                    |
| `primaryImageId`                                             | 主图指针                      | Int FK?                      | 系统     | `null`                           | `setPrimaryImage` 维护                   | ⚠️ `setPrimaryImage` 会**改写图片 type**（FRONT↔SIDE），破坏视角语义                                               |
| `listingImageId`                                             | 列表图指针（可裁切派生）      | Int FK?                      | 系统     | `null`                           | `setListingImage`/裁切维护               | 与 primary 可不同；裁切生成 1200×1200 WebP                                                                         |
| `publishedAt`                                                | 首次发布时间                  | DateTime?                    | 系统     | `null`（create 不写）            | `updateStatus`→PUBLISHED 时写            | ⚠️ `create` 即使 `status=PUBLISHED` 也不写；下架不清空（永久语义）                                                 |
| `viewCount`/`salesCount`                                     | 浏览/销量                     | Int                          | 系统     | `0`                              | 系统累计                                 | 不得编造                                                                                                           |
| `deletedAt`                                                  | 软删除标记                    | DateTime?                    | 系统     | `null`                           | `delete()` 写                            | `findAll` 默认 `where deletedAt:null`                                                                              |

**`findAll` 默认不返回的字段**（需 `findById`）：`description`、`gemInfo`、`craftTechnique`、`publishedAt`。导入校验/导出若需这些字段须走 `findById`。

---

## 3. ProductSKU 字段标准

来源：`schema.prisma:200-220`、`products.service.ts`（`createSku`/`updateSku`）、`dto/sku.dto.ts`。

| 字段          | 含义                                    | 类型                   | 必填     | 默认       | 来源          | 多写法/风险                                                                                                               |
| ------------- | --------------------------------------- | ---------------------- | -------- | ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `skuCode`     | SKU 编码                                | VarChar(100) `@unique` | **必填** | —          | 业务/规则生成 | 全局唯一                                                                                                                  |
| `material`    | 材质                                    | enum `MaterialType`    | 可选     | `GOLD_999` | 业务          | 可与父商品不同                                                                                                            |
| `size`        | 规格                                    | VarChar(50)            | 可选     | `null`     | 业务          | 如圈口、链长                                                                                                              |
| `goldWeight`  | 该 SKU 金重                             | Decimal(8,2)           | 可选     | `0`        | 称重          | ⚠️ `=0` 不参与金价调价                                                                                                    |
| `price`       | 该 SKU 下单价（详情页选中规格时优先取） | Decimal(10,2)          | **必填** | —          | 金价引擎/人工 | ⚠️ 与 `Product.price` 无强约束，导入须人工保证一致                                                                        |
| `stock`       | 库存数                                  | Int                    | 可选     | `0`        | 人工/导入     | 🟡 **双轨**：schema 标 `@deprecated`（应走 Inventory），但 createSku/updateSku/totalStock 仍直读写此字段（见第 4、13 节） |
| `safetyStock` | 安全库存                                | Int                    | 可选     | `5`        | 业务          | ⚠️ 与 `Inventory.safetyStock` 双写、不联动                                                                                |
| `isActive`    | 启用                                    | Boolean                | 可选     | `true`     | 运营          | `findAll` 仅统计 `isActive=true` 的 SKU                                                                                   |

---

## 4. Inventory 字段标准（多仓，当前未消费）

来源：`schema.prisma:326-362`（`Warehouse`/`Inventory`）、`inventory.service.ts`。

| 字段                              | 含义           | 类型                          | 备注                                    |
| --------------------------------- | -------------- | ----------------------------- | --------------------------------------- |
| `Inventory.skuId` + `warehouseId` | 复合唯一键     | Int+Int                       | `(skuId, warehouseId) @@unique`         |
| `quantity`                        | 该仓位库存     | Int                           | 默认 0                                  |
| `safetyStock`                     | 该仓位安全库存 | Int                           | 默认 5                                  |
| `Warehouse.type`                  | 仓库类型       | enum `SHOWROOM/FACTORY/STORE` | 🟡 默认仓库与多仓启用范围【待产品决策】 |

🟡 **库存架构双轨（最严重，与 `docs/DECISIONS.md` D.1 同源）**：

- `ProductSKU.stock` 标 `@deprecated`，但 `InventoryService` **无任何外部消费者**；`products.service`/`orders.service` 仍直读写 `ProductSKU.stock`。
- `Inventory` 表与 `ProductSKU.stock` **互不同步**。
- **导入库存前必须先决策写哪边**（见第 13、14 节）；未决策前不得自行选边。

---

## 5. Category 分类标准

来源：`schema.prisma:53-75`、`categories.service.ts`、`prisma/seed.ts`。

| 字段        | 含义                           | 类型                   | 必填        | 备注                                                                             |
| ----------- | ------------------------------ | ---------------------- | ----------- | -------------------------------------------------------------------------------- |
| `name`      | 分类名                         | VarChar(100)           | **必填**    | —                                                                                |
| `slug`      | URL slug                       | VarChar(150) `@unique` | **必填**    | 正则 `^[a-z0-9]+(?:-[a-z0-9]+)*$`；**不自动生成，前端必须传**；全局唯一          |
| `level`     | 层级                           | Int                    | 系统        | 由 `parentId` 推导：无父=1，父1→2，父2→3                                         |
| `parentId`  | 父分类                         | Int?                   | 可选        | 自关联 `CategoryTree`                                                            |
| `isActive`  | 启用                           | Boolean                | 默认 `true` | **分类实际停用靠此字段**                                                         |
| `deletedAt` | （死字段）                     | DateTime?              | —           | ⚠️ `delete()` 只置 `isActive=false`，从不写 `deletedAt`（见 `DECISIONS.md` D.5） |
| SEO 字段    | `seoTitle/seoDesc/seoKeywords` | 可选                   | —           | —                                                                                |

**标准关系与约束**：

- `Product.categoryId` **必填、单分类、强校验**（分类不存在 → 400，不自动建分类）。
- 🟡 **服务层只支持创建 1/2/3 级**（`categories.service.ts` 校验 `parent.level ∈ [1,2]`），**第 4 级代码无法创建**（schema 注释写"1-4"）——若主数据规划 4 级，属【待产品决策】。
- 现有种子分类（`seed.ts`）：4 个一级（手镯 bracelet / 吊坠 pendant / 戒指 ring / 耳饰 earring）+ 若干二三级。
- ⚠️ **三套分类体系并存且互不对应**（必先统一）：
  1. `seed.ts` 真实分类（int id，3 级，吊坠下 6 个二类）；
  2. `client/src/data/catalogData.ts` **mock 分类**（string id 如 `'pendant'`/`'pingan-kou'`，2 级，吊坠下 15 个二类）——仅 Catalog 页客户端 filter，**不连后端**；
  3. `client/src/data/homeCampaign.ts` 硬编码 `categoryId=6/17`。
- ⚠️ **AI 分类（`ai-classify`）不回写 `Product.categoryId`**：`confirmClassification` 只更新 `AIClassifyRecord`，且记录本身不带 `productId`。AI 预测与商品正式分类当前无自动衔接。

---

## 6. ProductImage 图片标准

来源：`schema.prisma:166-196`、`products.service.ts`（`addImage`/`updateImage`/`setPrimaryImage`/`setListingImage`）、`batch-upload.mjs`、`client/src/utils/productImage.ts`。

| 字段                             | 含义                               | 类型             | 默认                             | 备注                                                                      |
| -------------------------------- | ---------------------------------- | ---------------- | -------------------------------- | ------------------------------------------------------------------------- |
| `url`                            | 图片路径                           | VarChar(500)     | —                                | 相对路径，如 `/uploads/YYYY/MM/DD/uuid.png` 或 `/images/products/xxx.png` |
| `type`                           | 拍摄视角                           | enum `ImageType` | schema `FRONT` / addImage `SIDE` | ⚠️ 见下方冲突                                                             |
| `sortOrder`                      | 排序（越小越靠前）                 | Int              | `0`                              | FRONT 优先                                                                |
| `isVideo`                        | 是否视频/帧                        | Boolean          | `false`                          | —                                                                         |
| `sourceImageId`                  | 源图指针（裁切派生）               | Int?             | `null`                           | 自关联 `SourceImage`                                                      |
| `cropData`                       | 裁切框 `{x,y,width,height}`（0-1） | Json?            | `null`                           | —                                                                         |
| `width/height/mimeType/fileSize` | 派生图元数据                       | 可选             | `null`                           | 裁切图 1200×1200 WebP                                                     |

**`ImageType` 枚举 = `FRONT / SIDE / TOP / DETAIL / WEARING`（5 值，无 `BACK`）。**

⚠️ **图片角度的核心冲突（导入必知）**：

1. **枚举缺 `BACK`**：实际图片文件命名大量使用 `*_BACK_*`（背面），但：
   - `batch-upload.mjs` 的 `getImageType` 只识别中文"正面/侧面/佩戴/模特/上手/顶部"，**无"背面"分支 → BACK 落到 `DETAIL`**；
   - `server/prisma/batch-upload-images.ts` 更粗放：**所有图硬编码 `type:'FRONT'`**；
   - `addImage`/`updateImage` 用 `as any` **透传不校验**。
   - 后果：背面视角语义完全丢失，前台无法区分正/背。
2. **`type` 默认值不一致**：schema 默认 `FRONT`，`addImage` 默认 `'SIDE'`。
3. **`type` 语义双关**：既是"视角"，又被 `setPrimaryImage` 当作"主图标记"——设主图时把所有 `FRONT` 改 `SIDE`、目标改 `FRONT`，**破坏原始视角**。
4. **`addImage`/`updateImage` 不校验 type**：导入可写入任意字符串，但前台 `getListingImage` 等只认枚举值。

**图片选取规则（前端统一，`utils/productImage.ts`）**：

- `getListingImage`：`listingImage → primaryImage → 首张 FRONT → 首张 → placeholder`。
- `getPrimaryImage`：`primaryImage → 首张 FRONT → 首张 → placeholder`（**不回退 listing**）。
- ⚠️ `components/common/ProductCard.tsx:15` 与 `pages/public/ProductList/index.tsx:64` **绕过工具**直接用 `images[0]`——在 type 被打错的数据上，列表首图可能错乱。导入后须保证 `images[0]` 或 `primaryImage` 是正面图。

**命名约定（现状）**：`{CODE}_{ANGLE}_{中文描述}.png`，如 `ATP103_BACK_ATP103平安扣...吊坠背面.png`；ANGLE ∈ `FRONT/BACK/SIDE`，末尾中文含"正面/背面/侧面"。

---

## 7. 价格与金价体系

**价格字段关系（标准）**：

- `Product.price` = **列表/卡片主展示价**（`ProductList`/`ProductCard`/Puck 渲染取此，`priceMin` 仅作 `price=0` 时兜底）。
- `ProductSKU.price` = **详情页选中规格后的下单价**（`ProductDetail` 优先取 `selectedSku.price`，回退 `Product.price`）。
- 二者**无 DB 联动、无强约束**；金价引擎是唯一自动同步路径，且只在金价变动时触发。
- ⚠️ 多 SKU 商品若 `Product.price` 与各 `SKU.price` 数值不一致，会出现"列表价 ≠ 详情价"。导入须人工保证一致。

**金价调价公式（`gold-price.service.ts` `adjustProductPrices`）**：

```
newPrice = round((goldWeight × goldPrice × 1.05 + craftFee) / 10) × 10
```

- 系数 `1.05` 硬编码；`|newPrice − oldPrice| > 1` 才落库。
- 同步范围：`status ∈ (PUBLISHED, DRAFT)` 且 `goldWeight > 0` 的商品；SKU 仅同步**同商品下 `goldWeight > 0`** 的 SKU（用 SKU 自己的 `goldWeight` + 父商品 `craftFee`）。
- ⚠️ **`goldWeight=0` 的商品/SKU 不参与调价**，价格凝固。
- ⚠️ 引擎**只同步 `price`，不同步 `priceMin/priceMax`**。
- ⚠️ 调价**绕过 `ProductsService`**，不触发前台 SSE 价格更新通知。
- 🟡 AUTO 定时采集是空壳（未接行情源），见 `DECISIONS.md` D.10。

**价格字段是 Decimal**：schema `Decimal(10,2)`，前端类型用 `number`（`Number()` 转换）。当前金额不致精度溢出，但导入须统一序列化口径。

---

## 8. gemInfo / craftTechnique 的 JSON 结构

两者 schema 都是 `Json?`，后端 DTO/Service 全是 `any` **无校验**——**形状约束只在前端 `ProductEditor`**。导入必须按下列前端约定写入，否则编辑器回填与详情页展示会错位或崩溃。

### 8.1 `gemInfo`（对象或 null）

- 前端类型（`client/src/types/index.ts`）：`{ type?, carat?, clarity?, color?, cut?, quantity? }`。
- 子字段（`ProductEditor` 表单）：
  - `type`（宝石种类）：**英文小写枚举** `diamond / ruby / sapphire / emerald / jade / pearl / other`；
  - `carat`（克拉）：数字，≥0，步长 0.01；
  - `clarity`（净度）：`FL / IF / VVS1 / VVS2 / VS1 / VS2 / SI1 / SI2`；
  - `color`（颜色等级）：`D / E / F / G / H / I / J / K`；
  - `cut`（切工）：`EX / VG / G / F`；
  - `quantity`（粒数）：整数 ≥0。
- **空值约定**：编辑器"未填"写 `null`（任一子字段有值才写对象）。⚠️ 导入若写中文 `type:"钻石"` 或写数组/其他结构，后端照单全收但编辑器 Select 匹配不到。

### 8.2 `craftTechnique`（字符串数组）

- 前端类型：`string[]`；编辑器为 `Select mode="tags"`。
- 预设值：`3D硬金 / 古法金 / 花丝 / 錾刻 / 抛光 / 喷砂 / 镶嵌 / 镂空 / 浮雕 / 拉丝 / 磨砂`（可自由输入其他）。
- **空值约定**：编辑器"未填"写 `[]`（永远数组）。
- ⚠️ 导入若写字符串（`"花丝,錾刻"`）或对象（`{techniques:[...]}`），`ProductDetail` 的 `.map` 会**运行时崩溃**。
- ⚠️ **`gemInfo` 空写 `null`、`craftTechnique` 空写 `[]`**——同一"未填"两种表示，导入须选一种并坚持（🟡 统一为哪种【待产品决策】）。

---

## 9. 商品状态与销售模式语义

### 9.1 `ProductStatus` 流转

- 枚举：`DRAFT / PUBLISHED / OFFLINE / ARCHIVED`。
- **发布（→PUBLISHED）**：唯一硬性条件 `Number(price) > 0`，同时写 `publishedAt = now()`。⚠️ 此门禁**只在 `PUT /:id/status`（`updateStatus`）路径生效**；`POST /products`（create）和 `PUT /:id`（update）**直接接受 `status:'PUBLISHED'` 且不校验价格、不写 `publishedAt`**。
- **下架/归档**：`updateStatus` 只改 `status`，**不清空 `publishedAt`**（`publishedAt` 是"首次发布"永久语义）。
- **软删除 `delete()`**：`status → OFFLINE` + `deletedAt → now()`，列表默认过滤。

### 9.2 `SalesMode` 语义

- 枚举：`DISPLAY_ONLY / SELECTION / APPOINTMENT / DIRECT_PURCHASE / CUSTOM_INQUIRY`。
- ⚠️ 后端**没有任何业务逻辑根据 `salesMode` 分支**（不决定是否需要 SKU/库存/价格/下单）；仅用于写入、`findAll` 过滤、完整性检查（判"有没有"）。
- 前端：`DIRECT_PURCHASE` 受 `featureFlags.commerceEnabled`（默认 `false`）控制——**当前任何模式都不能直接下单**；其余 4 种在前台仅作展示/筛选标签（`useProductData` 映射成 `scene`）。
- **`salesMode` 与"是否需要 SKU/库存"无代码耦合**：商品可无 SKU 直接 `PUBLISHED`（现有批量导入即如此）。

---

## 10. 标准关系图

```
Category (1–4级树, isActive 停用)
  │  N—1
Product ─────────────────────────────────
  │ 1                                     │ 1—1 (指针, 可空)
  │ N                                     ├── primaryImage  → ProductImage
  │ (ProductSKU)                          └── listingImage  → ProductImage (可裁切派生)
  │                                         │ 1—N
ProductSKU ────────────────────────────────┴── ProductImage (type: FRONT/SIDE/TOP/DETAIL/WEARING)
  │ 1—N                                          (url 本地 /uploads, OSS 未启用)
  │
Inventory (skuId+warehouseId 唯一) → Warehouse (SHOWROOM/FACTORY/STORE)
  ⚠️ ProductSKU.stock 与 Inventory 双轨并存、互不同步【待决策】

价格：
  Product.price   = 列表/卡片展示价
  ProductSKU.price = 详情选中规格下单价
  金价引擎（goldWeight>0 者）是唯一自动同步路径
```

---

## 11. 现有批量导入流程与缺口

**两段式流程（根目录脚本）**：

1. `batch-upload.mjs`：扫描 `./to-upload` 图片 → 正则 `[A-Za-z]+\d+` 提款号 → 按款号+描述分组 → 中文关键词判 type → 上传 `POST /api/upload/image`（本地 `uploads/`）→ 输出 `upload-products.csv`（`ProductCode,ProductName,ImageCount,CoverImage,AllImages`，`AllImages` 格式 `url|type;...`）。
2. `create-products.mjs`：读该 CSV → 创建商品（**仅 6 字段**：`name, code, categoryId:1, materialType:'GOLD_999', status:'PUBLISHED', salesMode:'SELECTION'`）→ 关联图片（FRONT 优先）。同款冲突加 `-2/-3` 后缀。
3. `retry-upload.mjs`：429 限流重传图片。

**数据源**：**图片文件名**（无结构化商品主数据）。`_names.json`（700+ 条款号→中文名）、`_skuInfo.json` 是**未被任何代码引用的孤立资产**。

**字段缺口（现有脚本完全不导入）**：

- 物理参数：`goldWeight` / `weight` / `craftFee` / `size`
- 价格：`price`（默认 0，且直接 `PUBLISHED`）
- 内容：`shortDescription` / `description`
- Json：`gemInfo` / `craftTechnique`
- 关系：**SKU**（无）、**库存**（无）、**真实分类**（硬编码 `1`/`9`）
- 证书：`Certificate`（无）

**结论**：4000+ 商品若直接用现有脚本导入，得到的是**全部分类=1、全部 GOLD_999、全部 SELECTION、无价格/金重/SKU/库存/宝石/工艺/描述、背面图被误标、且同款可能被拆成多个商品**的空壳数据。

---

## 12. 4000+ 导入会导致数据不一致的字段/结构（清单）

1. **库存双轨**：`ProductSKU.stock` vs `Inventory` 互不同步；导入写错一边 → 后台库存页与下单库存不一致。
2. **同款拆分**：`batch-upload.mjs` 的 `variantKey` 保留 `_BACK_/_FRONT_/_SIDE_`，同款 ATP 被拆成 3 个变体商品（事后靠 `merge-variants.ts`/`rename-codes.ts` 清理，风险高、易跨商品混图）。
3. **同 CODE 多实物**：如 `ATP1055` 有多个不同描述 → `-N` 后缀 → 合并 → 不同实物图片混入同一商品。
4. **背面图 type 丢失**：枚举无 `BACK`；BACK → `DETAIL`（或脚本硬编码 `FRONT`），视角语义丢失。
5. **type 默认值不一致**：schema `FRONT` vs `addImage` `SIDE`。
6. **type 语义双关**：`setPrimaryImage` 设主图时改写 `FRONT↔SIDE`，破坏原始视角。
7. **分类三套并存**：seed.ts 真实 / catalogData.ts mock / homeCampaign 硬编码，id/slug 互不对应 → 前台筛选与后台编辑错位。
8. **categoryId 硬编码**：脚本用 `1`/`9`，4000+ 全堆 1-2 个分类。
9. **AI 分类不回写**：`confirmClassification` 不改 `Product.categoryId`，记录不带 `productId`。
10. **发布门禁缺口**：`create` 直接 `PUBLISHED` 不校验 `price`、不写 `publishedAt` → 0 元已上架商品，`publishedAt` 永久 NULL。
11. **priceMin/priceMax 死字段**：导入填值无业务效果，反而误导展示兜底。
12. **goldWeight=0 不调价**：未填金重的商品/SKU 价格凝固。
13. **gemInfo 形状**：后端不校验，导入写中文/数组/对象 → 编辑器回填错位。
14. **craftTechnique 形状**：导入非 `string[]` → 详情页 `.map` 崩溃；空值 `null` vs `[]` 不统一。
15. **商品名质量**：现脚本从文件名截取得名，产生残缺名（"珐琅"、"ATP1056"）；`_names.json` 字典未被引用。
16. **存储本地化、无 CDN/缩略图**：4000×3×~3MB ≈ 30-40GB PNG，`OSS` 依赖在但**无业务代码 import**；列表页直拉原图。
17. **图片文件缺失静默 404**：`findPublicById` 按本地文件存在性过滤，部分图未传成功（429 频发）→ 详情 404，与后台计数对不上。
18. **ProductCard 绕过图片工具**：`images[0]` 在 type 打错数据上首图错乱。
19. **safetyStock 双写**：`ProductSKU.safetyStock` 与 `Inventory.safetyStock` 不联动。
20. **Decimal→number 精度**：大金额理论风险。

---

## 13. 【待产品决策】事项（不得自行选方案）

> 以下无法从代码确认；导入前必须由产品负责人拍板。任何 AI 不得自行选择方案或写成既定事实。

- 🟡 **13.1 商品类型**：4000+ 商品属于 A 类（可销售，需 SKU+库存）还是 B 类（展示/选款/询价）？统一用哪个 `salesMode`？
- 🟡 **13.2 库存写哪边**：导入库存写 `ProductSKU.stock` 还是 `Inventory`（多仓）？（与 `DECISIONS.md` D.1 同源）
- 🟡 **13.3 默认仓库/多仓**：是否启用多仓？默认仓库设定？（与 `DECISIONS.md` D.9 同源）
- 🟡 **13.4 分类主数据**：统一用 seed.ts 体系还是另定？是否需要 4 级（服务层当前只支持 3 级）？4000+ 商品的真实分类映射表谁来定？（与 `DECISIONS.md` D.5 相关）
- 🟡 **13.5 图片角度方案**：`ImageType` 是否新增 `BACK`？还是 BACK 统一归 `DETAIL`/用 `sortOrder`+约定区分？现有背面图如何回填？
- 🟡 **13.6 gemInfo 空值约定**：`null` vs 不写 vs `{}`？
- 🟡 **13.7 craftTechnique 空值约定**：`[]` vs `null`？预设词表是否封闭？
- 🟡 **13.8 priceMin/priceMax 去留**：保留（并补过滤/UI）还是废弃？
- 🟡 **13.9 发布门禁是否收口**：`create`/`update` 是否也强制 `price>0` 才能设 `PUBLISHED`？
- 🟡 **13.10 价格一致策略**：多 SKU 时 `Product.price` 与 `SKU.price` 的关系规则（如 Product.price = min(SKU.price)？）。
- 🟡 **13.11 同款拆分处理**：导入时如何避免同款被拆成多商品（改 `variantKey` 逻辑 or 预先按 CODE 聚合）？
- 🟡 **13.12 商品名来源**：用 `_names.json` 字典、文件名、还是另提供主数据表？
- 🟡 **13.13 图片存储**：是否启用 OSS/CDN + 缩略图？本地存储容量与列表性能如何解决？
- 🟡 **13.14 调价系数**：`1.05` 是否参数化？AUTO 行情源是否接入？（与 `DECISIONS.md` D.10 同源）
- 🟡 **13.15 AI 分类衔接**：是否让 `confirmClassification` 回写 `Product.categoryId`、记录带 `productId`？

---

## 14. 正式导入前必须先确定的内容（检查清单）

按优先级，以下未确定前**不得开始 4000+ 正式导入**：

1. **商品类型与 salesMode**（13.1）——决定后续是否需要 SKU/库存/价格。
2. **库存写入策略**（13.2 / 13.3）——决定导入是否建 SKU/Inventory、写哪边。
3. **分类主数据与映射表**（13.4）——预建分类树 + 每个商品 code → categoryId 的权威映射；统一三套分类体系。
4. **图片角度方案**（13.5）——决定背面图如何入库与展示。
5. **同款聚合策略**（13.11）——避免 `ATP####` 被拆成多商品、避免不同实物混入。
6. **价格数据源**（13.10 / 13.14）——金重、工费、售价从哪来；多 SKU 价格规则。
7. **Json 字段形状与空值约定**（13.6 / 13.7）——gemInfo/craftTechnique 的导入格式。
8. **商品名与内容来源**（13.12）——名称/简介/描述/宝石/工艺的主数据表。
9. **图片存储与性能**（13.13）——OSS/CDN/缩略图，否则列表页不可用。
10. **发布策略**（13.9）——导入后默认 `DRAFT` 还是 `PUBLISHED`；0 元商品如何拦截。

> 本文件只定义商品数据标准。具体导入实现、Schema 调整、脚本重写均属 B 类任务，须按 `WORKFLOW.md` 先出方案并获确认后再实施。**本轮不执行商品导入。**
