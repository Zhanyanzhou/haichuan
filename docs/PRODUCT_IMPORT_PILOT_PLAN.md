# 海川珠宝 — 商品导入止血与试导入方案（PRODUCT_IMPORT_PILOT_PLAN）

> [!CAUTION]
> **2026-08-12 历史试导入方案，当前已暂停，禁止按正文脚本链或批次执行。** 当前导入边界只认 `docs/PRODUCT_DATA_CONTRACT.md` 与已重新核对的实施任务；本文不是运行脚本、写库、迁移、批量改数据或 Git 操作授权。恢复导入前必须重新确认真实输入、目标数据库、字段契约、试导入范围、回退和验收，并按 `AGENTS.md` 获得对应批准。
>
> 阶段 1 方案文档。基于 `docs/PRODUCT_IMPORT_DECISIONS.md`（已落定）与 `docs/PRODUCT_IMPORT_SPEC.md`（输入规范）。
> **目标**：在 4000+ 全量导入前，先做最小止血修复 + 小批量（10-20 款）试导入，用真实数据质量报告驱动剩余业务决策（D-4/D-6/D-12）。
> **本文件是方案，不动业务代码、不写数据库、不迁 Schema**。实施（阶段 2）属 B 类，须按 `WORKFLOW.md` 获明确授权后进行。
> 最近核对：2026-08-12。

---

## 0. 核心策略

**试导入不是"导入的预演"，而是"业务决策的取证工具"。**

- 现有规范全部基于静态代码分析，缺一次真实端到端验证。
- 现有 3 个脚本有已知"制造脏数据"的 bug（项目里的 `merge-variants.ts`/`rename-codes.ts` 清理脚本即历史踩坑证据）→ **先止血再试**。
- 业务输入（D-4 分类映射、D-6 多实物、D-12 商品名）靠试导入的**真实结果**催化，比凭空填表高效。
- Schema 迁移（D-5 `BACK`）**延后**到流程验证通过后再决定，避免一次性大改。

---

## 1. 阶段 1A · 止血修复（最小补丁，非全量重写）

只修"会制造脏数据"的 3 个点，**不做** `SPEC` 里的双 CSV 全量重写（那是全量导入阶段的事）。试导入仍走现有 `batch-upload.mjs → upload-products.csv → create-products.mjs` 流程。

### 改点 1：`batch-upload.mjs` `getVariantKey`（:53-57）— 修同款拆分

**问题**：当前 `variantKey` 只去末尾中文角度词，保留中间 `_FRONT_/_BACK_/_SIDE_`，导致同款 `ATP####` 的正/背/侧被拆成 3 个商品。

**补丁草案**（去角度段；同 code 同实物归一组；同 code **多实物仍分开**，交业务定 D-6）：
```js
function getVariantKey(filename) {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const code = getProductCode(filename);
  let name = withoutExt;
  if (name.toUpperCase().startsWith(code)) name = name.substring(code.length);
  // 去英文角度段（止血核心）
  name = name.replace(/[_-]?(FRONT|BACK|SIDE|TOP|DETAIL|WEARING)[_-]?/gi, '_');
  // 去末尾中文角度词
  name = name.replace(/(正面|背面|侧面|主图|细节|顶部|佩戴|模特|上手)$/, '');
  return (name.trim().replace(/^[_-]+|[_-]+$/g, '') || code);
}
```
**效果**：`ATP103_FRONT_正面` / `ATP103_BACK_背面` / `ATP103_SIDE_侧面` 三图 → 同 variantKey → 合并为 1 个商品的 3 张图。`ATP1055_...圆石群镶...` 与 `ATP1055_...珐琅...` 因描述不同仍分开（**这正是 D-6 要业务定的**，试导入会把它列进报告）。

### 改点 2：`batch-upload.mjs` `getImageType`（:82-88）— 识别背面

**问题**：无"背面"分支，`*_BACK_*` 落 `DETAIL`，视角丢失。

**补丁草案**：
```js
function getImageType(filename) {
  if (filename.includes('正面') || /_FRONT_/i.test(filename)) return 'FRONT';
  if (filename.includes('背面') || /_BACK_/i.test(filename)) return 'BACK';
  if (filename.includes('侧面') || /_SIDE_/i.test(filename)) return 'SIDE';
  if (filename.includes('佩戴') || filename.includes('模特') || filename.includes('上手')) return 'WEARING';
  if (filename.includes('顶部')) return 'TOP';
  return 'DETAIL';
}
```
**关于 `BACK` 未在枚举（2026-08-12 已核实，修正此前判断）**：后端 `addImage`/`updateImage` 的 `as any` **只绕过 TS 编译期检查，Prisma 运行时仍校验 enum**——`ImageType` 无 `BACK`，直接写入会抛 `PrismaClientValidationError`；旧版 `create-products.mjs` 的静默 `catch` 还会丢图且计数造假。**因此 `create-products.mjs` 已改为：把 `BACK` 映射为 `DETAIL` 写入（sortOrder 区分），CSV 的 `type=BACK` 保留真实意图供 D-5 迁移后批量回填**。**结论：保留背面语义必须做 D-5 Schema 迁移，无法靠临时承载绕过。**

### 改点 3：`create-products.mjs`（:56）— 默认 DRAFT

**问题**：当前 `status:'PUBLISHED'` + 不校验价格 → 0 元上架商品。

**补丁草案**：
```js
status: 'DRAFT',   // 原 'PUBLISHED'，止血改 DRAFT；发布统一走 updateStatus（带 price>0 门禁）
```
**止血阶段不改**：`materialType:'GOLD_999'`、`categoryId:1`（真实材质/分类是 D-7/D-4 业务数据，试样阶段不强求；`categoryId` 试导入用专门测试分类，见 §3）。

### 不在止血范围内（留待全量阶段）
- 双 CSV 重写（`SPEC` §1-2）。
- `materialType`/`categoryId` 从数据源读取。
- `gemInfo`/`craftTechnique`/`price` 等字段补全（试样商品主要验流程，这些字段空可接受，报告会统计空值率）。
- Schema 迁移（`BACK` 正式枚举）。

---

## 2. 阶段 1B · 试导入设计

### 选样策略（10-20 款，从 `_names.json` 与 `to-upload/` 选）
覆盖以下维度，确保试导入能暴露真实问题：
- **有背面图**（`*_BACK_*`）：验证改点 2（≥5 款）。
- **同款多实物**（如 `ATP1055` 圆石群镶 vs 珐琅）：验证改点 1 聚合 + 暴露 D-6（2-3 组）。
- **`_names.json` 有/无对应名**：验证商品名覆盖率与残缺名（各 ≥3 款）。
- **文件名带"残缺/特殊描述"**：验证名质量报告。
- **不同角度齐全性**（仅正面/仅正侧/正背侧齐全）：验证缺图警告。

### 试导入流程
1. 把选样图片放入 `./to-upload-pilot/`（独立目录，不混全量图）。
2. 跑止血后的 `batch-upload.mjs ./to-upload-pilot` → 生成 `upload-products-pilot.csv`。
3. 改 `create-products.mjs` 读该 CSV（或临时复制一份指向 pilot CSV），`categoryId` 指向测试分类（见 §3）。
4. 跑创建 + 关联图片，输出 `pilot-imported-ids.json`（本次商品 productId 清单，供回滚）。
5. 跑校验脚本（`SPEC` §5 的 11 条规则）+ 生成数据质量报告。

### 验收问题（试导入必须回答）
- 改点 1 是否修好了拆分？（同款 ATP#### 是否合并为 1 商品？）
- 改点 2 背面图是否正确标 `BACK`？
- 改点 3 商品是否都是 `DRAFT`、无 0 元上架？
- `_names.json` 对试样的覆盖率？残缺名比例？
- 同 code 多实物案例清单？（交给业务定 D-6）
- Json 字段形状是否被后端原样存入？（因试样这些字段多空，主要验证空值=`null`/`[]` 落库正确）

---

## 3. 可回滚机制（关键，B 类实施前必须确认）

试导入**绝不污染正式数据**，必须可一键回滚：

| 维度 | 机制 |
| --- | --- |
| **数据库环境** | 必须在**开发库**跑（`.env` 的 `DATABASE_URL` 指向 dev），**禁止**连生产库 |
| **试导入分类** | 新建一个临时分类"【试导入】"（slug=`pilot-import`）；试导入商品 `categoryId` 全指它；**不进正式分类树** |
| **商品标识** | 试导入脚本输出 `pilot-imported-ids.json`（productId 清单）+ 给这批商品 `code` 在日志中登记 |
| **回滚** | 提供 `pilot-rollback.mjs`：读 `pilot-imported-ids.json` → 对每个 productId 调 `delete()`（软删除：`status=OFFLINE`+`deletedAt`）→ 可选删除测试分类 |
| **图片** | 试导入图片上传到本地 `uploads/`，**回滚不删图**（无业务影响，只是磁盘占用） |
| **不迁 Schema** | 整个试导入**不碰 `schema.prisma`**；`BACK` 用 `as any` 透传预写 |

回滚后状态：试导入商品全部软删除（列表过滤不可见），正式分类树零影响，仅本地 `uploads/` 多出试样图片（可手动清理）。

---

## 4. 数据质量报告（试导入产出）

报告 `docs/PRODUCT_IMPORT_PILOT_REPORT.md`（试导入后生成），至少含：

1. **基础计数**：试导入商品数、图片数、按角度（FRONT/BACK/SIDE/...）分布。
2. **聚合正确性**：同款 ATP#### 是否合并为 1 商品（改点 1 验证）；列出仍被拆分的异常案例。
3. **背面图识别**：`BACK` 类型图片数（改点 2 验证）；仍误标 `DETAIL` 的案例。
4. **状态正确性**：是否全部 `DRAFT`（改点 3 验证）；有无 0 元上架。
5. **`_names.json` 覆盖率**：试样中 code 有中文名的比例；**残缺名清单**（纯数字、单字、等于 code 等）。
6. **同 code 多实物清单**：交给业务定 D-6（拆 `-A/-B` 还是合并）。
7. **缺分类映射清单**：哪些 code 没有真实分类数据 → 驱动 D-4 映射表生成。
8. **空值率**：`price/goldWeight/materialType` 等空值比例 → 驱动业务补数据。
9. **Json 形状**：`gemInfo`/`craftTechnique` 空值是否正确落 `null`/`[]`（试样多空，验证落库逻辑）。
10. **规范未覆盖问题**：试导入暴露的、`PRODUCT_DATA_CONTRACT.md`/`SPEC` 未预见到的问题。

---

## 5. 风险与约束

- **不迁 Schema**：`BACK` 预写依赖后端 `as any` 透传；试导入期间前端 `ImageType` 类型无 `BACK`（不影响数据，影响前端类型显示——试样阶段可接受）。
- **不碰生产**：试导入只在开发库；`pilot-import` 分类与正式分类树隔离。
- **可回滚**：所有试导入商品可批量软删除。
- **不走完整 `SPEC`**：试导入字段不全（材质/价格/Json 多空），**不等于**全量导入验证通过；全量导入前仍需业务数据齐备。
- **admin 凭据**：试导入脚本需 `ADMIN_USERNAME`/`ADMIN_PASSWORD`（参见 `create-products.mjs` 既有读环境变量方式）；据记忆 `project-backend-dev-verification`，admin 密码不在仓库，需用户提供。

---

## 6. 实施授权后的步骤清单（B 类，待你批准）

> 以下均需你明确授权后执行；当前只产出本方案文档。

1. **改 3 处脚本**（§1 改点 1/2/3）+ 新增 `pilot-rollback.mjs`（§3）。
2. **建测试分类** `【试导入】`（slug=`pilot-import`）。
3. **选样 10-20 款**，图片放入 `./to-upload-pilot/`。
4. **跑试导入**（开发库），输出 `pilot-imported-ids.json`。
5. **跑校验 + 写数据质量报告**（`docs/PRODUCT_IMPORT_PILOT_REPORT.md`）。
6. **基于报告**，请你/业务拍板 D-4（分类映射）、D-6（多实物）、D-12（商品名），并决定：
   - `BACK` 是否值得做 Schema 迁移（D-5）。
   - 是否进入全量导入准备（业务数据齐备 + 双 CSV 重写）。

---

## 7. 关联

- 输入规范：`docs/PRODUCT_IMPORT_SPEC.md`
- 产品决策：`docs/PRODUCT_IMPORT_DECISIONS.md`
- 字段契约：`docs/PRODUCT_DATA_CONTRACT.md`
- 硬规则/流程：根目录 `PROJECT_RULES.md`、`WORKFLOW.md`
