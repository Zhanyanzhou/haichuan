# 海川珠宝 — 试导入执行说明（PRODUCT_IMPORT_PILOT_RUN）

> 本文件是 `docs/PRODUCT_IMPORT_PILOT_PLAN.md` 阶段 2 的**操作手册**。由**你在自己终端执行**（admin 密码留在你的环境变量，不进对话、不进 Git）。
> 跑完把指定输出贴回来，我据此写数据质量报告（`docs/PRODUCT_IMPORT_PILOT_REPORT.md`）。
> 最近核对：2026-08-12。

---

## 0. 已为你准备好的

- **止血补丁已应用**：`batch-upload.mjs`（去角度分组 + BACK 识别）、`create-products.mjs`（status=DRAFT + 批次记录 + CATEGORY_ID 环境变量）。
- **配套脚本**：`pilot-setup.mjs`（建测试分类）、`pilot-rollback.mjs`（软删除回滚）。
- **选样图片**：`to-upload-pilot/`，**46 张图 / 15 款**：
  - `ATP1079`(4 张：双龙戏珠+龙凤呈祥两套实物)、`ATP3023`(3 张：文件名角度段全误写 `_BACK_`)、其余 13 款各 3 张（三角度齐全）。

## 1. 前置（必须先满足）

1. **后端在开发库运行**（不碰生产）。新开一个 PowerShell：
   ```powershell
   cd server
   npm run build
   # 确认 .env 的 DATABASE_URL 指向【开发库】（不是生产）
   npm run start:prod
   ```
   > 注：`nest dev`（`start:dev`）本机会 hang，用 production 产物跑（记忆 `project-backend-dev-verification`）。
2. **admin 凭据**（你已知，不在仓库）：在跑试导入的会话里设置环境变量。

## 2. 执行步骤（在项目根目录 `g:\网站搭建2`）

### 步骤 ① 设置 admin 凭据
```powershell
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD='你的密码'     # 只在你本机环境，不进对话/Git
```

### 步骤 ② 建/复用 pilot-import 测试分类，拿 categoryId
```powershell
node pilot-setup.mjs
```
预期输出：`pilot-import 分类已创建，id = <N>`（或"已存在，复用"）。**记下这个 id**（也会写入 `pilot-category-id.txt`）。

### 步骤 ③ 设置 CATEGORY_ID 并上传选样图片
```powershell
$env:CATEGORY_ID='<步骤②的 id>'

node batch-upload.mjs ./to-upload-pilot
```
预期：上传 46 张图，输出 `upload-products.csv`。**可能触发 429 限流**（throttler 60/min）。
- 若部分图 FAIL(429)，重传失败的款号：
  ```powershell
  node retry-upload.mjs ./to-upload-pilot ATP1079,ATP3023
  ```
  （把 429 的款号列上；retry 间隔 3 秒）

### 步骤 ④ 创建商品（DRAFT，挂到 pilot 分类）
```powershell
node create-products.mjs upload-products.csv
```
预期：每款输出 `OK (id=X, N图)`；末尾生成 `pilot-imported-ids.json`。

### 步骤 ⑤ 观察重点（跑的时候留意）
- **ATP1079**：应分成 **2 个商品**（双龙戏珠、龙凤呈祥各 1 个）—— 这正是 D-6 多实物案例，试导入就是要暴露它给业务定。
- **ATP3023**：应合并为 **1 个商品**（三张图角度段虽都写 `_BACK_`，但去角度后聚合，type 按末尾中文打成 FRONT/BACK/SIDE）。
- **背面图**：CSV 里 `AllImages` 的 `|BACK` 条目数 = 背面图识别数。注意：`BACK` 因 Prisma enum 限制无法直接入库，`create-products.mjs` 会把 `BACK` 映射为 `DETAIL` 写入（并打印 `⚠ N 张背面图暂存为 DETAIL`）；CSV 的 `BACK` 保留意图，正式回填需 D-5 Schema 迁移。
- **状态**：所有商品应为 `DRAFT`（不是 PUBLISHED）。
- **商品名**：`getDisplayName` 从文件名截取，留意是否有残缺名。

### 步骤 ⑥ 回滚（验证完即可软删除这批试导入商品）
```powershell
node pilot-rollback.mjs
```
预期：读 `pilot-imported-ids.json`，逐个 `DELETE /api/products/:id` 软删除（`status=OFFLINE` + `deletedAt`）。`pilot-import` 分类可保留（下次试导入复用）或后台手动删。

## 3. 跑完请贴回这些（我写报告）

1. `pilot-setup.mjs` 输出（categoryId）。
2. `batch-upload.mjs` 完整输出（变体数、每款成功/失败、429 情况）。
3. `upload-products.csv` 内容（直接贴文件文本）。
4. `create-products.mjs` 完整输出（每款 OK/FAIL、productId）。
5. `pilot-imported-ids.json` 内容。
6. （可选）后台商品管理页对 pilot 分类的截图，或 `GET /api/products?categoryId=<pilot-id>` 的返回。

## 4. 我会从这些数据得出什么（报告大纲）

- **改点 1 验证**：同款是否合并（ATP3023→1 个；其余单实物款→各 1 个）。
- **改点 2 验证**：BACK 类型图片数是否正确（对照源文件背面图数量）。
- **改点 3 验证**：是否全部 DRAFT、有无 0 元上架。
- **D-6 多实物清单**：ATP1079 拆成 2 个 → 交业务定拆分规则。
- **商品名质量**：残缺名比例（哪些款名等于 code、截断、单字）。
- **`_names.json` 覆盖**：试样 15 款在 `_names.json` 的命中数。
- **429/上传失败率**：throttler 对真实批量上传的影响。
- **规范未覆盖问题**：试导入暴露的新问题。

## 5. 安全与回滚保证

- 所有试导入商品挂 `pilot-import` 分类，**不进正式分类树**。
- `pilot-rollback.mjs` 一键软删除整批。
- 图片上传到本地 `uploads/`，回滚不删图（无业务影响）。
- admin 密码只在你本机环境变量，**不进对话、不进 Git**。
- 若误连生产库：**立即停止**，用 `pilot-rollback.mjs` 回滚，并报告。

## 6. 关联

- 方案：`docs/PRODUCT_IMPORT_PILOT_PLAN.md`
- 输入规范：`docs/PRODUCT_IMPORT_SPEC.md`
- 产品决策：`docs/PRODUCT_IMPORT_DECISIONS.md`
- 字段契约：`docs/PRODUCT_DATA_CONTRACT.md`
