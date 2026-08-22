# 海川珠宝 — 4000+ 商品导入规范（PRODUCT_IMPORT_SPEC）

> **状态：旧输入方案已于 2026-08-23 被当前商品合同取代，暂停执行。**
> 本文件仅保留 2026-08-12 的历史 CSV 草案，不再是导入输入标准；与 `docs/PRODUCT_DATA_CONTRACT.md` 冲突时以后者和当前 Schema/Service 为准。
> 禁止按本文旧字段模板直接写 `Product.price`，禁止无有效 SKU、SKU 成交价和 Inventory 记录的 `DIRECT_PURCHASE` 导入，禁止写 `ProductSKU.stock` 建立库存双轨。
> 新导入只能在确认**精确的本地开发数据库**并获得用户对目标库、数据范围和写入操作的明确批准后重新设计和执行；在此之前不得运行导入、migration、seed 或真实数据回填。
>
> 当前合同边界：`SalesMode` 是作品公开主行动模式，不是排他报价通道；现有零售购物车、零售结算和直接下单只允许 `DIRECT_PURCHASE`，但未来高级定制与合作蜡模可在客户本人确认有效报价后按独立状态机转单。同一设计可有独立零售、定制与合作报价。双客群和三报价业务决定只认 `docs/DECISIONS.md` D.19；商品字段与必要数值见 `docs/PRODUCT_DATA_CONTRACT.md`。
>
> 以下正文为历史草案。
>
> 本文件原定义导入输入数据契约：商品主数据与图片清单的字段模板、取值规则、校验规则。
> 基于 `docs/PRODUCT_IMPORT_DECISIONS.md` 2026-08-12 的历史决策生成。
> 商品字段的业务含义与冲突见 `docs/PRODUCT_DATA_CONTRACT.md`；本文件不重复，只规定"导入输入怎么填"。
> 本文件是规范，不动业务代码；脚本实现属 B 类，另行确认。

---

## 0. 历史前置状态（已暂停）

### 已落定决策（影响字段模板）
- D-1 商品类型 = **B 类 `SELECTION`**（展示+选款咨询，不建 SKU、不写库存）。
- D-5 图片角度 = **新增 `BACK` 枚举**（依赖 Schema 迁移，B 类，须先完成）。
- D-6 同款聚合 = **货号清单主键 + 去角度分组**。
- D-7 价格 = **一口价导 `Product.price`，不建 SKU**。
- D-8 `gemInfo` 空 = **`null`**；D-9 `craftTechnique` 空 = **`[]`**（必须数组）。
- D-10 `priceMin/priceMax` = **不填（默认 0）**。
- D-11 发布 = **导入默认 `status=DRAFT`**。
- D-2/D-3 = **不建库存、不启用多仓**。

### 仍需业务提供的输入（不阻塞本规范，但阻塞实际导入）
1. **`code → categoryId` 映射表**（D-4）—— 每个货号所属分类的权威数据。
2. **同 `CODE` 多实物拆分规则**（D-6）—— 如 ATP1055 圆石群镶 vs 珐琅 是 `ATP1055-A/-B` 还是只留一个。
3. **OSS 时间表**（D-13）—— 本地试跑再切，还是导入即 OSS。
4. **真实业务数据**：材质、金重、工费、售价（spec 提供列，数据由业务填）。
5. **商品名校对**：以 `_names.json`（700+ 条）为基础人工校对。

---

## 1. 历史导入输入：两个 CSV（不得直接执行）

取代现有"从图片文件名推断 + `upload-products.csv` 单文件"的做法，改为**两个分工明确的 CSV**：

| 文件 | 粒度 | 用途 |
| --- | --- | --- |
| `products.csv` | 每行一个货号 | 商品主数据（含分类、材质、物理、价格、Json） |
| `images.csv` | 每行一张图 | 图片清单（按货号聚合，含角度 type） |

- 两文件以 `code` 关联；`images.csv` 的 `code` 必须在 `products.csv` 中出现。
- 格式：UTF-8、CSV，含引号包裹的文本字段与 JSON 字段（见 §4）。
- 收敛现有孤立资产：`_names.json` 的中文名 → `products.csv.name`；图片文件名 → `images.csv`。

---

## 2. `products.csv` 字段模板

| 列名 | 必填 | 类型 | 取值规则 | 默认 | 来源 |
| --- | --- | --- | --- | --- | --- |
| `code` | **必填** | string | 货号，全局唯一；建议 `^[A-Za-z]+\d+$`（如 `ATP103`） | — | 业务/图片文件名前缀 |
| `name` | **必填** | string | 中文名，≤200 字；不得是货号、不得残缺 | — | `_names.json` + 人工校对 |
| `categoryId` | **必填** | int | 必须在分类树中存在（seed.ts 体系，≤3 级） | — | D-4 映射表 |
| `materialType` | 推荐 | enum | `MaterialType` 10 值（见 §4） | `GOLD_999` | 业务（**不得无依据统一 GOLD_999**） |
| `goldWeight` | 可选 | number(2dp) | ≥0，单位克；`=0` 则不参与金价调价 | `0` | 称重 |
| `craftFee` | 可选 | number(2dp) | ≥0，单位元 | `0` | 业务 |
| `price` | 可选 | number(2dp) | ≥0，单位元；B 类可 `0`（展示/询价） | `0` | 业务 |
| `weight` | 可选 | number(2dp) | ≥0，总重量克（与 goldWeight 不同） | `0` | 称重 |
| `size` | 可选 | string | ≤100 字，自由文本（如"约 25mm"、"圈口 56"） | 空 | 业务 |
| `shortDescription` | 可选 | string | ≤500 字 | 空 | 人工/AI |
| `description` | 可选 | string | 长文本 | 空 | 人工/AI |
| `gemInfo` | 可选 | JSON | `{type,carat,clarity,color,cut,quantity}` 对象字符串（见 §4）；空留空 → 导入写 `null` | `null` | 业务 |
| `craftTechnique` | 可选 | JSON | `string[]` 数组字符串（见 §4）；空留空 → 导入写 `[]` | `[]` | 业务 |
| `isHot` / `isNew` / `isRecommended` / `isLimited` / `isCustom` / `multiDiscount` | 可选 | bool | `true`/`false` | `false` | 运营 |
| `sortOrder` | 可选 | int | ≥0 | `0` | 运营 |

### 系统固定值（不由导入决定，导入脚本统一注入）
- `salesMode = SELECTION`（D-1）
- `status = DRAFT`（D-11）
- `priceMin = 0`、`priceMax = 0`（D-10，不填）
- `viewCount = 0`、`salesCount = 0`、`publishedAt = null`、`deletedAt = null`
- `primaryImageId` / `listingImageId`：导入后由系统/运营通过 `setPrimaryImage` 维护
- **不创建 SKU、不写库存**（D-2/D-3）

### 示例行
```csv
code,name,categoryId,materialType,goldWeight,craftFee,price,weight,size,shortDescription,gemInfo,craftTechnique,isHot
ATP103,平安扣涡旋鱼鳞纹吊坠,3,GOLD_999,15.20,800,12800,16.5,"约25mm","涡旋鱼鳞纹平安扣",,"[""花丝"",""錾刻""]",false
ATP1048,平安扣招财大吉吊坠,3,GOLD_999,12.50,600,10500,13.0,"约22mm",,"{""type"":""diamond"",""carat"":0.18,""color"":""F"",""cut"":""EX"",""quantity"":1}","[""镶嵌""]",true
```

---

## 3. `images.csv` 字段模板

| 列名 | 必填 | 类型 | 取值规则 | 默认 | 来源 |
| --- | --- | --- | --- | --- | --- |
| `code` | **必填** | string | 必须在 `products.csv` 出现 | — | 关联 |
| `file` | **必填** | string | 文件名或相对路径（如 `ATP103_FRONT_xxx正面.png`） | — | 图片资产 |
| `type` | **必填** | enum | `FRONT` / `BACK` / `SIDE` / `TOP` / `DETAIL` / `WEARING`（**含新 `BACK`，依赖 D-5 Schema 迁移**） | — | 业务/文件名角度段 |
| `sortOrder` | 可选 | int | ≥0；不填则按 `FRONT=0,SIDE=1,BACK=2,TOP=3,DETAIL=4,WEARING=5` 自动 | 自动 | 运营 |

### 示例
```csv
code,file,type,sortOrder
ATP103,ATP103_FRONT_ATP103平安扣正面.png,FRONT,0
ATP103,ATP103_SIDE_ATP103平安扣侧面.png,SIDE,1
ATP103,ATP103_BACK_ATP103平安扣背面.png,BACK,2
```

### 聚合规则（D-6 落定）
- 同一 `code` 的所有图片归到**同一商品**（不得因 `_FRONT_/_BACK_/_SIDE_` 拆分成多商品——现有 `batch-upload.mjs` 的 bug 必须修复）。
- 同 `CODE` 多实物：按 D-6 子决策处理（拆 `-A/-B` 或合并，待业务定）。

---

## 4. 字段取值规则（枚举与 JSON 形状）

### 4.1 `materialType` 枚举（10 值，前后端一致）
`GOLD_999`（足金999）/ `GOLD_9999`（足金9999）/ `AU750`（K金）/ `PT950`（铂金）/ `S925`（银）/ `DIAMOND`（镶钻）/ `JADE`（玉石）/ `PEARL`（珍珠）/ `COLOR_GEM`（彩宝）/ `OTHER`

### 4.2 图片 `type` 枚举（6 值，**D-5 后含 BACK**）
`FRONT`（正面）/ `BACK`（背面，**D-5 新增，待 Schema 迁移**）/ `SIDE`（侧面）/ `TOP`（顶部）/ `DETAIL`（细节）/ `WEARING`（佩戴）

> ⚠️ **2026-08-12 核实**：`as any` 只绕过 TS 检查，**Prisma 运行时拒绝写入非枚举值**——`BACK` **无法靠透传预写**。迁移前导入脚本必须把 `BACK` 映射为 `DETAIL`（sortOrder 区分）临时承载；CSV 记录 `type=BACK` 保留意图，迁移后批量回填。**正式启用 `BACK` 必须做 D-5 Schema 迁移，无法用临时方案绕过。**

### 4.3 `gemInfo` JSON 形状（D-8：空 = `null`）
```json
{ "type": "diamond", "carat": 0.18, "clarity": "VS1", "color": "F", "cut": "EX", "quantity": 1 }
```
- `type`：英文小写枚举 `diamond / ruby / sapphire / emerald / jade / pearl / other`（**不得写中文**）。
- `carat`：数字 ≥0。
- `clarity`：`FL / IF / VVS1 / VVS2 / VS1 / VS2 / SI1 / SI2`。
- `color`：`D / E / F / G / H / I / J / K`。
- `cut`：`EX / VG / G / F`。
- `quantity`：整数 ≥0。
- **CSV 中**：写成 JSON 对象字符串（双引号转义）；空值留空 → 导入写 `null`。

### 4.4 `craftTechnique` JSON 形状（D-9：空 = `[]`，必须数组）
```json
["花丝", "錾刻", "镶嵌"]
```
- 预设词：`3D硬金 / 古法金 / 花丝 / 錾刻 / 抛光 / 喷砂 / 镶嵌 / 镂空 / 浮雕 / 拉丝 / 磨砂`（可补充其他）。
- **CSV 中**：写成 JSON 数组字符串（双引号转义）；空值留空 → 导入写 `[]`。
- ⚠️ **不得写字符串**（如 `"花丝,錾刻"`）或对象——会使前台 `ProductDetail` 的 `.map` 崩溃。

---

## 5. 历史导入前校验规则（已被当前合同取代）

校验失败的行**不得导入**，输出错误报告而非静默跳过：

1. **`code`**：非空、全局唯一、符合 `^[A-Za-z]+\d+$`（警告级，不符合不拒但提示）。
2. **`name`**：非空、≤200 字、不得等于 `code`、不得是已知残缺模式（纯数字、单字如"珐琅"——警告级）。
3. **`categoryId`**：必须在分类树中存在；不存在则整行拒入（**不自动建分类**）。
4. **`materialType`**：在 10 值枚举内（空可，默认 `GOLD_999`）。
5. **数值字段**：`goldWeight/craftFee/price/weight` ≥0；`sortOrder` ≥0 整数。
6. **`gemInfo`**：非空时必须是合法 JSON 对象，`type` 在枚举内（后端不校验，**导入侧必须校验**）。
7. **`craftTechnique`**：非空时必须是合法 JSON **数组**；元素为字符串。
8. **`images.csv.code`**：必须存在于 `products.csv`。
9. **`images.csv.type`**：在 6 值枚举内（D-5 迁移前限制为 5 值，无 `BACK`）。
10. **同 `code` 图片聚合**：按 `code` 归并到同一商品；报告每个商品的图片角度齐全性（缺 FRONT 警告）。
11. **发布门禁**：导入一律 `status=DRAFT`（D-11）；`price=0` 的商品即便后续发布也会被 `updateStatus` 的 `price>0` 门禁拦截。

---

## 6. 与现有脚本的差异（说明待改点，本轮不改代码）

> 脚本重写属 B 类，按 `WORKFLOW.md` 另行确认后实施。此处只记录差异，不展开方案。

- **`batch-upload.mjs`**：
  - `getVariantKey`（:53-57）分组时须去掉 `_FRONT_/_BACK_/_SIDE_/_TOP_` 角度段，避免同款拆分（D-6）。
  - `getImageType`（:82-88）须加"背面 → `BACK`"分支（D-5）。
  - 输出从单文件 `upload-products.csv` 改为 `products.csv` + `images.csv` 双文件。
- **`create-products.mjs`**：
  - 读双 CSV（替代单 CSV 正则解析）。
  - 字段从 6 个扩到完整字段集（§2）。
  - `categoryId` 从硬编码 `1` 改为读映射（D-4）。
  - `status` 从 `PUBLISHED` 改为 `DRAFT`（D-11）。
  - `materialType` 从硬编码 `GOLD_999` 改为读 CSV（§4.1）。
  - `gemInfo`/`craftTechnique` 按形状校验后写入（§4.3/4.4）。
- **Schema 迁移**（D-5）：`ImageType` 枚举新增 `BACK` 值；属 B 类需确认。

---

## 7. 首轮导入启动前仍需业务提供的清单

1. **`code → categoryId` 映射表**（D-4）。
2. **同 `CODE` 多实物拆分规则**（D-6）。
3. **真实业务数据**：`materialType / goldWeight / craftFee / price / weight / size`。
4. **`_names.json` 人工校对结果**（商品名，D-12）。
5. **`gemInfo` / `craftTechnique` / `shortDescription` / `description`**（可选，可后补）。
6. **OSS 决策与时间表**（D-13）。

> 本文件不是当前输入规范。新方案须从 `docs/PRODUCT_DATA_CONTRACT.md`、当前 Schema/Service 和已确认的本地开发数据库状态重新设计，并单独获得写入批准。
