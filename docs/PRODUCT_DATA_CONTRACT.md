# 海川珠宝 — 商品数据契约（PRODUCT_DATA_CONTRACT）

> 本文件是 4000+ 商品正式导入、后台编辑与 AI 开发**共同遵守的商品数据标准**。
> 规定每个字段的含义、类型、必填、来源、当前多写法；明确 Product / SKU / Inventory / 价格 / 分类 / 图片之间的标准关系。
> 与其他治理文件的关系：硬规则见根目录 `PROJECT_RULES.md`；双客群、三报价、客户确认与订单冻结的产品业务决定源见 `docs/DECISIONS.md` D.19；其他架构决策与【待决策】仍见 `docs/DECISIONS.md`；执行流程见 `WORKFLOW.md`。本文件只把已批准决定落实为商品字段语义和必要校验数值，不建立第二份业务决定源。
> 基础字段核对：2026-08-23；分类消费链于 2026-09-11 按当前源码修正。未重新核验本文全部字段或目标数据库状态。

## 阅读约定

- **标准**：当前代码已确认、导入/编辑必须遵守的字段语义。
- ⚠️ **冲突/多写法**：当前代码中已存在、会导致 4000+ 导入数据不一致的字段或结构（见第 12 节）。
- 🟡 **【待产品决策】**：无法从代码确认、**不得自行选择方案**的事项（见第 13 节）。

---

## 1. 销售模式与交易资格（核心）

`SalesMode` 是作品对外呈现的公开主行动模式，并参与服务端发布和当前零售门禁，不是纯展示标签，也不等于排他的报价通道。五种模式为：

| `salesMode` | 公开主行动语义 | 发布时是否要求当前零售交易事实 | 当前零售购物车/直接下单 |
| --- | --- | --- | --- |
| `DISPLAY_ONLY` | 展示咨询 | 否 | 否 |
| `SELECTION` | 选款咨询 | 否 | 否 |
| `APPOINTMENT` | 预约到店/看货 | 否 | 否 |
| `CUSTOM_INQUIRY` | 定制报价 | 否 | 否 |
| `DIRECT_PURCHASE` | 直接购买 | 是：有效 SKU、SKU 成交价、Inventory 记录、配送方式及库存策略约束 | 仅在交易开关获批开启且库存足够时允许 |

- 五种模式发布时均需满足有效名称、货号、启用分类和至少一张可读取的非视频商品图片。
- 当前代码中，零售购物车、零售结算和直接下单只允许 `DIRECT_PURCHASE`；是否有参考价格不能改变当前边界。这只是现有零售路径的门禁，不表示未来只有 `DIRECT_PURCHASE` 才能形成订单。
- 同一设计可以独立存在标准零售、高级定制和合作蜡模报价通道；高级定制与合作蜡模在客户本人确认有效报价后按独立状态机事务转单，不通过篡改 `SalesMode` 绕过现有零售门禁。业务定义只认 `docs/DECISIONS.md` D.19。
- `DIRECT_PURCHASE` 的 0 库存商品可以发布并展示为售罄，但购物车和下单必须拒绝。
- 当前 `CUSTOMER_COMMERCE_ENABLED` 默认 `false`；代码具备交易路径不代表真实交易、支付或生产上线获批。

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
| `price`                                                      | 有效且有价 SKU 的派生最低价缓存 | Decimal(10,2)              | 系统派生 | `0`                              | `ProductsService` 由 SKU 重算            | **禁止作为 `DIRECT_PURCHASE` 成交价事实源或由导入直接写入**；成交价只认 `ProductSKU.price`                         |
| `priceMin` / `priceMax`                                      | 名义价格区间                  | Decimal(10,2)                | 可选     | `0`                              | —                                        | ⚠️ **死字段**：无过滤、无编辑 UI、仅 `clone` 写、仅 `priceMin` 做展示兜底。导入不应填值                            |
| `weight`                                                     | 总重量(g)                     | Decimal(8,2)                 | 可选     | `0`                              | 称重                                     | 与 `goldWeight` 不同概念                                                                                           |
| `size`                                                       | 尺寸规格                      | VarChar(100)                 | 可选     | `null`                           | 业务给定                                 | 自由文本                                                                                                           |
| `gemInfo`                                                    | 宝石信息                      | Json                         | 可选     | `null`                           | 人工                                     | ⚠️ 后端 `any` 无校验；**形状约束只在前端**（见第 8 节）                                                            |
| `craftTechnique`                                             | 工艺技法                      | Json                         | 可选     | `null`（create）/ `[]`（编辑器） | 人工                                     | ⚠️ 后端 `any`；前端是 `string[]`；**空值两套写法**（`null` vs `[]`，见第 8 节）                                    |
| `status`                                                     | 商品状态                      | enum `ProductStatus`（4 值） | 可选     | `DRAFT`                          | 状态流转                                 | 任何进入 `PUBLISHED` 的路径必须经过同一销售模式发布门禁                                                            |
| `salesMode`                                                  | 销售模式                      | enum `SalesMode`（5 值）     | 可选     | `DISPLAY_ONLY`                   | 业务                                     | 决定发布要求与是否允许购物车/下单，见第 1、9 节                                                                    |
| `inventoryPolicy`                                            | 库存策略                      | enum `InventoryPolicy`       | 可选     | `STANDARD`                       | 业务                                     | `STANDARD` 为普通库存；`SINGLE_UNIT` 只允许一个有效 SKU，库存总量与单次购买量不超过 1                               |
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
| `price`       | `DIRECT_PURCHASE` 唯一成交价事实源       | Decimal(10,2)          | 直购必填 | `0`        | 金价引擎/人工 | 有效直购 SKU 必须大于 0；系统据有效且有价 SKU 自动派生 `Product.price`                                                       |
| `stock`       | 遗留库存字段                            | Int                    | 禁止新增写入 | `0`     | 遗留兼容      | `@deprecated`；可售库存只认 `Inventory.quantity`，不得重新建立双轨                                                         |
| `safetyStock` | 遗留 SKU 安全库存字段                   | Int                    | 禁止作为库存事实 | `5` | 遗留兼容      | 实际仓位安全库存由 `Inventory.safetyStock` 表达                                                                             |
| `isActive`    | 启用                                    | Boolean                | 可选     | `true`     | 运营          | `findAll` 仅统计 `isActive=true` 的 SKU                                                                                   |

---

## 4. Inventory 字段标准（可售库存唯一事实源）

来源：`schema.prisma:326-362`（`Warehouse`/`Inventory`）、`inventory.service.ts`。

| 字段                              | 含义           | 类型                          | 备注                                    |
| --------------------------------- | -------------- | ----------------------------- | --------------------------------------- |
| `Inventory.skuId` + `warehouseId` | 复合唯一键     | Int+Int                       | `(skuId, warehouseId) @@unique`         |
| `quantity`                        | 该仓位库存     | Int                           | 默认 0                                  |
| `safetyStock`                     | 该仓位安全库存 | Int                           | 默认 5                                  |
| `Warehouse.type`                  | 仓库类型       | enum `SHOWROOM/FACTORY/STORE` | 🟡 默认仓库与多仓启用范围【待产品决策】 |

**库存单轨规则**：

- `Inventory.quantity` 是购物车、下单、预占、核销、释放和库存管理的唯一可售库存事实源。
- `ProductSKU.stock` 仅为遗留字段；新增功能、导入和人工维护不得写它作为库存来源。
- 对当前零售 `DIRECT_PURCHASE`，没有 Inventory 记录视为无库存。0 库存不阻止商品发布，但必须拒绝零售加购、结算和直接下单；该规则不替代高级定制或合作蜡模报价订单自身的确认与产能、材料门禁。
- `SINGLE_UNIT` 商品必须且只能有一个有效 SKU，跨仓库存总量只能为 0 或 1，购物车和订单数量上限为 1。

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
- 分类事实以目标数据库的 `Category` 记录为准；`seed.ts` 是开发初始化输入，不能代替正式分类主数据和商品映射的签认。
- [Catalog](../client/src/pages/public/Catalog/index.tsx)通过 [useProductData / useProductCategories](../client/src/hooks/useProductData.ts)读取商品与分类；分类请求进入 [categoryClient](../client/src/services/clients/categoryClient.ts)。默认开发和生产使用真实 API，显式 Mock 模式使用测试夹具。
- Catalog 对 `catalogData.ts` 的引用仅用于 `CatalogProduct` 类型。正式导入仍须核验目标分类树与每个商品的 `categoryId` 映射。
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

- 当前标准零售 `ProductSKU.price` = **现有 `DIRECT_PURCHASE` 成交价事实源**；标准零售订单快照和金额计算必须读取所选 SKU 的价格。该规则不把高级定制报价或合作商蜡模克价塞入 SKU，也不代表三条报价通道已经实现。
- `Product.price` = **有效且有价 SKU 的最低价派生缓存**，供列表、卡片和未选择规格时展示；不得由导入或业务调用方直接维护。
- 创建、SKU 变更、库存策略变更和发布前检查在事务内统一重算 `Product.price`。旧编辑器的一口价输入只允许映射到唯一有效 SKU，多规格商品必须逐 SKU 维护价格。
- 没有大于 0 的有效 SKU 价格时，派生值为 0；这会阻止 `DIRECT_PURCHASE` 发布，但不阻止四种非直购模式按各自门禁发布。

**当前金价事实边界**：

- 手工录入和自动采集只写入 `GoldPrice` 行情事实，不调用 `ProductSKU.price` 或 `Product.price` 的改写路径。
- 代码库中可能保留未被写入口调用的旧私有计算函数；它不是可执行经营政策，也不得重新接线为标准零售固定价更新来源。
- `docs/DECISIONS.md` D.10 已明确：标准零售固定价不得被金价采集或定时任务自动改写。
- 🟡 是否启用按重动态价及其适用商品、行情来源、公式、人工覆盖、价格版本、订单快照、异常和回退均未决定；启用前必须另立价格策略并按价格/交易高风险变更审批。

**价格字段是 Decimal**：schema `Decimal(10,2)`，前端类型用 `number`（`Number()` 转换）。当前金额不致精度溢出，但导入须统一序列化口径。

### 7.1 当前代码事实：现有零售直购

- 当前 `ProductSKU.price` 只承担现有零售 `DIRECT_PURCHASE` 的成交价事实；`Product.price` 仍只承担有效且有价 SKU 的最低价派生缓存。
- 当前 Inventory 仍是可售库存事实源；现有购物车、下单、预占和核销规则不因未来报价目标而改变。
- 当前 Schema、DTO、Service 和订单快照尚未表达下述三条统一报价通道、蜡模结算、客户专属双克价或可配置附加费用。以下内容是**已批准目标**，不是已落地事实，也不构成 migration 或真实资金授权。

### 7.2 已批准目标：三条独立报价通道

> 本节是 `docs/DECISIONS.md` D.19 的数据字段派生，不是新的业务决定源。

| 报价通道 | 目标业务流程 | 价格或结算事实 |
| --- | --- | --- |
| 标准零售固定价 | 客户查看已发布作品和有效 SKU，在交易获批开放后按零售流程确认 | 继续读取 `ProductSKU.price`；订单冻结所选 SKU、数量与成交价 |
| 高级定制 | 客户提交需求 → 后台形成带版本的正式报价 → 客户确认 → 才能进入付款 | 读取已确认报价版本的金额与费用明细，不从 `Product.price` 推导 |
| 合作商蜡模价 | 已确认合作客户基于 3D 文件、蜡种与确认蜡重形成报价 → 客户确认 → 才能进入付款 | 读取有效客户专属双克价；无有效专属价时读取默认蜡模克价 |

- `SalesMode` 只描述作品当前的公开主行动模式（展示咨询、选款、预约、标准直购或定制报价），**不等于排他的报价通道，也不承载客户身份、合作资格或专属价格**。
- 同一设计可以同时存在标准零售、高级定制和合作商蜡模报价；各通道使用独立、可审计的报价上下文，不能互相覆盖价格事实。
- 报价入口不绑定单一路由，尤其不能把 `/catalog` 写成唯一购买或报价入口。入口可来自作品详情、定制服务、合作商工作流、顾问跟进或其他获批页面；服务端身份、报价状态和资金门禁才是最终边界。

### 7.3 已批准目标：合作商蜡模计价

- 红蜡、紫蜡均指由已确认 3D 文件打印出的 **1:1 蜡模**；蜡种是报价与订单快照的一部分。
- 3D 文件确认后锁定的蜡重是蜡模报价的**结算重量**。文件版本或几何发生变化必须形成新版本并重新确认蜡重，不能静默沿用旧重量。
- `预计金重 ≈ 确认蜡重 × 10` 只用于内部生产估算；不得作为蜡模结算重量、客户应付金额或保证金重的依据。
- 默认合作价：紫蜡 `20 CNY/蜡克`，红蜡 `25 CNY/蜡克`。
- 每个客户可由 `SUPER_ADMIN` 或 `ADMIN` 设置一组明确的专属双克价：紫蜡克价和红蜡克价必须同时给出，并记录生效时间、失效时间、原因及审计信息。
- 计价时先读取该客户在报价时点有效的专属双克价；没有有效专属价时回退默认价。失效、未生效或不完整的专属配置不得部分覆盖默认价。
- 基础蜡模金额目标公式为 `确认蜡重 × 报价时有效蜡种克价`；最终总额还要叠加当次有效的附加费用。

### 7.4 已批准目标：附加费用与订单冻结

- 附加费用是可配置目标能力，计费方式至少覆盖固定金额、按克和按单，并表达适用客群、启停状态和客户可理解的说明。
- 具体费用项目和金额以后由业务配置；本文件不预设加工、文件处理、加急或其他项目的金额，也不把示例值写成经营承诺。
- 高级定制和合作蜡模报价只能由已认证客户本人确认；后台人员可以创建或修订报价，但不得代替客户确认。报价变化必须新建版本并由客户重新确认。
- 报价确认与转单必须在服务端事务内复核确认主体、报价版本、客户资格、分通道库存/产能/材料门禁和金额，并以幂等键防止重复订单；失败不得留下部分订单或重复订单。
- 所有订单都必须冻结客群、报价通道、确认主体与时间、币种、费用明细和总额。零售订单另冻结所选 SKU、数量与成交单价；定制订单另冻结需求与报价版本；合作订单另冻结蜡种、3D 文件版本、目标金重、确认蜡重、实际生效克价及来源。
- 订单快照形成后，默认克价、客户专属价、费用配置、商品资料或报价上下文的后续修改不得改写历史订单。
- 当前 Schema、API 与订单模型尚未完整实现客户本人确认、分通道门禁、事务转单和上述完整快照；本节只定义目标合同，不表示代码已修复。

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
- **发布（→PUBLISHED）**：创建、立即发布、定时发布和状态接口都必须经过统一 `canPublish` 门禁；首次发布写 `publishedAt`，重复校验不得重写首次发布时间。
- **已发布商品变更**：SKU、价格、库存策略或库存变更后必须在同一事务内复核门禁；不再满足门禁时拒绝该次变更，不能留下无效的已发布状态。
- **下架/归档**：`updateStatus` 只改 `status`，**不清空 `publishedAt`**（`publishedAt` 是"首次发布"永久语义）。
- **软删除 `delete()`**：`status → OFFLINE` + `deletedAt → now()`，列表默认过滤。

### 9.2 `SalesMode` 语义

- 枚举：`DISPLAY_ONLY / SELECTION / APPOINTMENT / DIRECT_PURCHASE / CUSTOM_INQUIRY`。
- 它定义作品公开主行动与对应发布门禁，不等于排他的报价通道；客户身份、合作资格和专属价不进入 `SalesMode`。
- `DISPLAY_ONLY / SELECTION / APPOINTMENT / CUSTOM_INQUIRY` 共用内容与媒体门禁，不要求交易 SKU、成交价或库存。
- `DIRECT_PURCHASE` 额外要求至少一个有效 SKU、全部有效 SKU 价格大于 0、每个有效 SKU 有 Inventory 记录、至少一种配送方式，并满足 `InventoryPolicy`。
- 当前零售代码只有 `DIRECT_PURCHASE` 能进入购物车、零售结算和直接下单；其他四种模式即使存在 SKU 或参考价也不能绕过零售门禁。未来高级定制和合作商报价由客户本人确认后按独立状态机事务转单，不受“只有 `DIRECT_PURCHASE` 才能形成订单”的错误限制。
- 对当前零售 `DIRECT_PURCHASE`，0 库存不属于发布阻断项；发布后应表现为售罄，购物车、零售结算和直接下单按 Inventory 实际库存拒绝。高级定制与合作蜡模报价订单不复用该成品库存判断。
- 前端交易入口和服务端客户写接口还受 `CUSTOMER_COMMERCE_ENABLED` 控制，默认关闭。开关、路由、代码和凭据存在均不等于真实资金或生产上线获批。

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
  = 可售库存唯一事实源；ProductSKU.stock 仅遗留兼容，不得新增写入

价格：
  ProductSKU.price = DIRECT_PURCHASE 成交价事实源
  Product.price    = 有效且有价 SKU 的最低价派生缓存
```

---

## 11. 历史批量导入流程与缺口（已暂停，不得执行）

> 下列流程仅保留为历史问题证据。对应脚本已归档或处于清理状态，旧方案已被当前合同取代；不得据此直接运行、恢复或生成正式导入。

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

1. **历史库存双轨已收敛**：新增写入只认 `Inventory`；遗留 `ProductSKU.stock` 不得被导入重新启用。
2. **同款拆分**：`batch-upload.mjs` 的 `variantKey` 保留 `_BACK_/_FRONT_/_SIDE_`，同款 ATP 被拆成 3 个变体商品（事后靠 `merge-variants.ts`/`rename-codes.ts` 清理，风险高、易跨商品混图）。
3. **同 CODE 多实物**：如 `ATP1055` 有多个不同描述 → `-N` 后缀 → 合并 → 不同实物图片混入同一商品。
4. **背面图 type 丢失**：枚举无 `BACK`；BACK → `DETAIL`（或脚本硬编码 `FRONT`），视角语义丢失。
5. **type 默认值不一致**：schema `FRONT` vs `addImage` `SIDE`。
6. **type 语义双关**：`setPrimaryImage` 设主图时改写 `FRONT↔SIDE`，破坏原始视角。
7. **分类映射需按目标库核验**：当前 Catalog 使用商品与分类 API；正式导入必须映射到目标 `Category` 记录，不能沿用测试夹具或历史硬编码 ID。
8. **categoryId 硬编码**：脚本用 `1`/`9`，4000+ 全堆 1-2 个分类。
9. **AI 分类不回写**：`confirmClassification` 不改 `Product.categoryId`，记录不带 `productId`。
10. **历史发布门禁缺口已收敛**：所有进入 `PUBLISHED` 的路径必须经过统一、按 `SalesMode` 分支的门禁；旧脚本仍不得执行。
11. **priceMin/priceMax 死字段**：导入填值无业务效果，反而误导展示兜底。
12. **goldWeight=0 不调价**：未填金重的商品/SKU 价格凝固。
13. **gemInfo 形状**：后端不校验，导入写中文/数组/对象 → 编辑器回填错位。
14. **craftTechnique 形状**：导入非 `string[]` → 详情页 `.map` 崩溃；空值 `null` vs `[]` 不统一。
15. **商品名质量**：现脚本从文件名截取得名，产生残缺名（"珐琅"、"ATP1056"）；`_names.json` 字典未被引用。
16. **存储本地化、无 CDN/缩略图**：4000×3×~3MB ≈ 30-40GB PNG，`OSS` 依赖在但**无业务代码 import**；列表页直拉原图。
17. **图片文件缺失静默 404**：`findPublicById` 按本地文件存在性过滤，部分图未传成功（429 频发）→ 详情 404，与后台计数对不上。
18. **ProductCard 绕过图片工具**：`images[0]` 在 type 打错数据上首图错乱。
19. **遗留 safetyStock 字段**：新增库存安全阈值只认 `Inventory.safetyStock`，不得由导入双写 `ProductSKU.safetyStock`。
20. **Decimal→number 精度**：大金额理论风险。

---

## 13. 已批准交易事实与剩余待决事项

以下事项已经批准，不得再作为待选项：

- 五种 `SalesMode` 及其发布/交易语义按第 1、9 节执行。
- `InventoryPolicy` 只允许 `STANDARD / SINGLE_UNIT`；Inventory 是可售库存唯一事实源。
- `ProductSKU.price` 是 `DIRECT_PURCHASE` 成交价事实源，`Product.price` 是有效且有价 SKU 的最低价派生缓存。
- 当前零售 `DIRECT_PURCHASE` 的 0 库存商品可发布但不可加购、结算或直接下单；现有零售购物车和直接下单路径只允许 `DIRECT_PURCHASE`。未来高级定制与合作蜡模报价确认后的订单属于独立状态机。

以下导入输入仍无法从代码确认，必须由产品负责人逐项拍板；任何 AI 不得自行选择方案或写成既定事实：

- 🟡 **13.1 导入销售模式分配**：每条商品由谁确定具体 `salesMode`；未提供可靠交易事实的记录不得标为 `DIRECT_PURCHASE`。
- 🟡 **13.2 库存输入**：需要直购的商品如何提供 SKU、仓库和初始 `Inventory.quantity`；禁止写 `ProductSKU.stock`。
- 🟡 **13.3 默认仓库/多仓**：是否启用多仓？默认仓库设定？（与 `DECISIONS.md` D.9 同源）
- 🟡 **13.4 分类主数据**：统一用 seed.ts 体系还是另定？是否需要 4 级（服务层当前只支持 3 级）？4000+ 商品的真实分类映射表谁来定？（与 `DECISIONS.md` D.5 相关）
- 🟡 **13.5 图片角度方案**：`ImageType` 是否新增 `BACK`？还是 BACK 统一归 `DETAIL`/用 `sortOrder`+约定区分？现有背面图如何回填？
- 🟡 **13.6 gemInfo 空值约定**：`null` vs 不写 vs `{}`？
- 🟡 **13.7 craftTechnique 空值约定**：`[]` vs `null`？预设词表是否封闭？
- 🟡 **13.8 priceMin/priceMax 去留**：保留（并补过滤/UI）还是废弃？
- ✅ **13.9 发布门禁已收口**：任何进入 `PUBLISHED` 的路径均执行按 `SalesMode` 分支的统一门禁。
- ✅ **13.10 价格关系已确定**：SKU 维护成交价，Product 自动派生有效且有价 SKU 的最低价。
- 🟡 **13.11 同款拆分处理**：导入时如何避免同款被拆成多商品（改 `variantKey` 逻辑 or 预先按 CODE 聚合）？
- 🟡 **13.12 商品名来源**：用 `_names.json` 字典、文件名、还是另提供主数据表？
- 🟡 **13.13 图片存储**：是否启用 OSS/CDN + 缩略图？本地存储容量与列表性能如何解决？
- 🟡 **13.14 按重动态价政策**：是否启用仍待决；启用前须按 `DECISIONS.md` D.10 独立确定适用商品、行情、公式、人工覆盖、价格版本、订单快照和回退。标准零售固定价不得由金价任务自动改写。
- 🟡 **13.15 AI 分类衔接**：是否让 `confirmClassification` 回写 `Product.categoryId`、记录带 `productId`？

---

## 14. 正式导入前必须先确定的内容（检查清单）

按优先级，以下未确定前**不得开始 4000+ 正式导入**：

1. **每条商品的 salesMode**（13.1）——决定是否必须提供直购 SKU、成交价与 Inventory；模式语义本身不再待决。
2. **SKU、Inventory 与仓库输入**（13.2 / 13.3）——可售库存固定写 Inventory；只需确定是否导入直购商品及其精确仓库数据。
3. **分类主数据与映射表**（13.4）——确认目标分类树 + 每个商品 code → categoryId 的权威映射，逐项核验分类存在性与归属。
4. **图片角度方案**（13.5）——决定背面图如何入库与展示。
5. **同款聚合策略**（13.11）——避免 `ATP####` 被拆成多商品、避免不同实物混入。
6. **SKU 价格数据源**（13.10 / 13.14）——直购 SKU 的成交价、金重和工费从哪里获得；Product 最低价由系统派生。
7. **Json 字段形状与空值约定**（13.6 / 13.7）——gemInfo/craftTechnique 的导入格式。
8. **商品名与内容来源**（13.12）——名称/简介/描述/宝石/工艺的主数据表。
9. **图片存储与性能**（13.13）——OSS/CDN/缩略图，否则列表页不可用。
10. **发布批次与验收**——导入固定从 `DRAFT` 开始；发布按销售模式门禁，0 库存直购商品可发布但必须显示售罄且不可购买。

> 本文件只定义商品数据标准。任何新导入设计或执行前，必须先确认精确的本地开发数据库目标并获得用户对该目标和数据写入范围的明确批准。未确认前不得执行导入、migration、seed 或真实数据回填。**本轮不执行商品导入。**
