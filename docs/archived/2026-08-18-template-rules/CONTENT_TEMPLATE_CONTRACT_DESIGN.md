# 海川珠宝 — 内容模板统一合同技术定稿

> 状态：已批准的批次 0 临时实施说明；不代表运行时代码已经完成，也不属于长期规则权威。
> 决策对象：23 个内容模板的机器合同、区块版本、生成流程、校验、迁移和分批接入方式。
> 产品与设计依据：`docs/CONTENT_TEMPLATE_STANDARD.md`。
> 当前代码基线：2026-08-17 工作区；已有改动均视为用户资产。
> 退出条件：批次 0 验收完成后，将稳定架构结论压缩到 `docs/DECISIONS.md`，随后删除或归档本文件；不得长期与正式标准并列维护。

---

## 1. 技术结论

采用“**仓库根级 JSON 权威合同 + 生成客户端/服务端只读 TypeScript 产物**”方案。

不采用以下两种方案：

1. **客户端继续直接导入服务端源码**：破坏前后端目录边界，且会把 Nest 模块目录误当共享包。
2. **现在新增 npm 共享包/workspace**：需要改变包管理、构建、发布和 Docker 上下文，收益不足以覆盖当前迁移成本。

选定方案不新增第三方依赖，不修改数据库结构。区块合同版本保存在 Puck 区块自己的 JSON props 中，发布 revision 会自然保留该版本。

---

## 2. 已核验的当前事实

### 2.1 构建边界

- 客户端 `tsconfig.json` 只包含 `client/src`。
- 服务端 `tsconfig.json` 的 `rootDir` 是 `server/src`，只包含 `server/src/**/*`。
- 当前多个客户端文件直接导入 `server/src/modules/page-modules/content-template-contract.ts`，属于临时跨层耦合。
- 根级 TypeScript 源文件无法在不调整服务端构建边界的前提下被两端直接编译。

### 2.2 合同覆盖

- 当前合同只覆盖首屏、通栏图、单图文、双图文和纯文字 5 个模板。
- 23 个运营内容模板与 2 个系统区块共同形成 25 个 Puck 区块；两者不得混为“25 个内容模板”。
- `allowedControls` 已存在于数据中，但没有形成 Inspector 的统一控制门禁。
- `requiredText` 当前均为空；前端局部 evaluator 与服务端发布校验对必填文字的判断不完整一致。

### 2.3 版本现状

- 当前保存流程扫描文档中的区块类型，并把合同摘要写入页面 metadata。
- 当前保存还会提升页面级 `schemaVersion` 和 `templateVersion`，但这两个字段不能准确表达每个区块自己的合同版本。
- 普通保存可能把没有逐块迁移的旧内容描述成当前合同，违反“旧草稿不得静默升级”。
- `puckData` 和 `PageDocumentRevision.puckData` 已经是 JSON，能够在不改 Prisma Schema 的情况下保存区块级合同印记。

### 2.4 验证现状

- `npm run typecheck` 当前通过。
- `npm run test:contracts` 当前通过，只证明 25 个 Puck 区块在前端注册、服务端白名单和 Renderer 分派中没有缺失。
- `scripts/verify-content-template-skeletons.mjs` 当前失败；失败来自正则要求源码中显式出现字段，而实现通过对象展开继承字段。这是测试方法脆弱，不足以证明模板语义错误。

---

## 3. 权威目录与生成产物

建议目录：

```text
contracts/
└─ page-builder/
   └─ content-templates.contract.json     # 唯一可手工修改的合同值来源

scripts/
├─ generate-content-template-contract.mjs # 校验并生成两端产物
└─ verify-content-template-contract.mjs   # CI/本地只读一致性检查

client/src/page-builder/generated/
└─ contentTemplates.generated.ts          # 自动生成，禁止手改

server/src/modules/page-modules/generated/
└─ contentTemplates.generated.ts          # 自动生成，禁止手改
```

生成产物必须包含：

- “自动生成，禁止手改”文件头。
- 权威 JSON 的 SHA-256 摘要。
- 相同的合同数据、类型联合、查找函数和纯规则 evaluator。
- 稳定排序和格式，保证相同输入产生字节级相同输出。

生成产物是构建边界内的只读副本，不是第二套事实来源。任何手改会被 `contracts:check` 拒绝。

---

## 4. 权威合同结构

顶层结构：

```json
{
  "contractSchemaVersion": 1,
  "registryVersion": 1,
  "pageRules": [],
  "templates": []
}
```

每个模板至少包含：

```text
key / moduleType / displayName / category
currentVersion / supportedVersions
mode / visualRole / master
composition.desktop / tablet / mobile
mediaSlots / textFields / action
controls / abilities
preview
completionRules / publishRules
```

### 4.1 合同允许保存的内容

- 运营名称、内部类型和分类。
- 品牌/商业模式、视觉角色和母版语义。
- 三端根结构、内容顺序、宽高策略和素材建议比例。
- 素材槽语义、必填状态、继承关系和数量范围。
- 文字字段、字符预算、行数预算和必填条件。
- CTA 数量、目标类型和字段依赖。
- 受控预设和模板专属能力。
- 中性缩略图区域和页面级组合规则。
- 保存、发布和兼容所需的声明式规则。

### 4.2 合同禁止保存的内容

- React 组件、Nest Service、CSS 字符串或任意可执行代码。
- 商品、库存、价格、门店、活动等真实业务数据。
- 自由颜色、自由字体、自由 HTML 和未经批准的样式常量。
- 摄影效果图、演示文案和会进入草稿的默认内容。
- 只能由数据库、媒体存储或权限系统确认的事实。

---

## 5. 区块级合同印记

每个新插入的内容模板在 props 中保存保留字段：

```json
{
  "__contentTemplate": {
    "key": "hero",
    "version": 1
  }
}
```

规则：

- `__contentTemplate` 是系统字段，不在 Inspector 中显示，运营不能直接编辑。
- `key` 必须与当前区块 `type` 映射一致。
- 新插入、复制、保存为常用方案和整页模板实例化都必须保留或正确生成印记。
- 无印记的历史区块视为 `legacy-0`，普通读取、自动保存和手动保存均不得自动写入当前版本。
- Renderer 按印记选择兼容合同；未知或不支持版本必须给出明确问题，不得猜测最新版。
- 系统区块“网站全局设置”“业务功能区”不使用内容模板印记。

不新增数据库字段。`PageDocument.schemaVersion` 继续表示页面数据结构版本，`templateId/templateVersion`继续表示整页方案关系，不再借用它们表达内容区块合同。

现有 metadata 中的 `contentTemplateContract`只作为旧摘要兼容读取，不再是权威版本来源，也不在普通保存时覆盖或提升区块版本。

---

## 6. 生命周期

### 6.1 新建与插入

1. 从生成合同取得当前模板版本。
2. 创建安全空骨架，不写入演示图片、演示文案或演示商品。
3. 写入 `__contentTemplate`。
4. Inspector 按合同显示允许的字段和能力。

所有创建入口必须统一覆盖：Puck 默认插入、常用方案、整页方案、复制区块和导入页面。

### 6.2 读取

1. 校验区块类型与合同 key。
2. 读取区块自身版本；缺失时使用 `legacy-0`兼容描述。
3. 不修改持久数据地完成 Renderer 和 Inspector 适配。
4. 仅向编辑者提示“可迁移”，不自动执行。

### 6.3 保存草稿

- 允许内容不完整，但必须满足 JSON 安全、区块 ID、系统印记结构和基本字段类型。
- 保留原区块版本。
- 上传失败时保留原素材；不得保存 File、Blob URL 或上传进度。
- 保存不得被用作迁移动作。

### 6.4 发布

发布前依次执行：

1. 页面结构与已知区块检查。
2. 区块合同版本支持检查。
3. 素材完成、内容完成和行动依赖检查。
4. 安全 URL、上传文件存在性和替代文字检查。
5. 商品、门店、活动、顾客分享等服务端业务事实检查。
6. 页面级组合规则检查，例如最多一个 `primary-stage`。
7. 权限、真实性、授权和适用模式门禁。

客户端只能提供即时反馈；服务端是最终发布门禁。

### 6.5 显式迁移

迁移必须是单独动作：

```text
选择范围
→ 生成迁移预览和字段差异
→ 用户确认
→ 创建新草稿快照
→ 写入目标版本
→ 校验
→ 保存
```

- 迁移器按 `key + fromVersion + toVersion`注册，禁止通用“补默认值即升级”。
- 迁移失败不得改变原草稿。
- 发布 revision 不原地修改；回滚后仍使用 revision 中保存的旧区块版本。
- 不能兼容的版本必须停止发布并给出可执行的迁移说明。

---

## 7. 受控能力类型

合同只允许以下明确能力族，新增能力族需要单独设计审查：

| 能力 | 用途 |
| --- | --- |
| `itemCount` | 受控项目数量 |
| `columnPreset` | 商品或入口列数 |
| `ordering` | 项目顺序 |
| `productSelection` | 单个或多个商品关联 |
| `mediaCollection` | 多素材集合 |
| `hotspotEditor` | 响应式热区 |
| `comparisonControl` | 前后对比分割 |
| `playbackControl` | 视频或轮播播放 |
| `schedule` | 真实活动起止时间 |
| `locationData` | 门店选择与展示 |
| `testimonialProof` | 顾客分享真实性和授权状态 |

Inspector 使用能力注册表把能力映射到控件。没有能力声明就不显示控件；不允许以字符串“其他”或“高级设置”绕开能力边界。

---

## 8. 校验结果合同

统一问题结构：

```ts
type ContentTemplateIssue = {
  code: string;
  severity: "error" | "warning" | "info";
  layer: "material" | "content" | "publish";
  blockId?: string;
  moduleType?: string;
  path?: string;
  message: string;
};
```

兼容阶段服务端响应同时保留：

```text
valid     # 是否存在 error
errors    # 旧客户端使用的字符串数组
issues    # 新 Inspector 和状态栏使用的结构化问题
```

纯数据规则由两端相同的生成 evaluator 执行；数据库引用、文件存在性、权限、真实性和授权只能由服务端追加验证。客户端不得因为本地无错误就宣称“可发布”。

---

## 9. 客户端边界

客户端负责：

- 从生成合同读取运营名称、分类、视觉角色、三端骨架和预览区域。
- 生成中性缩略图，不加载摄影示例或业务图片。
- Inspector 分组、字段条件、受控选项和即时完成度。
- 画布、聚焦模式和 Renderer 按同一合同解释顺序与比例。
- 显示服务端发布问题并准确定位区块和字段。

客户端仍保留 React 组件、CSS、媒体选择器和各模板 Renderer；这些实现消费合同，但不进入合同 JSON。

`blockMeta.ts`、`imageSpecs.ts`、`blockContracts.ts` 和 `contentTemplateLayouts.tsx` 中能由合同生成或查找的数据必须逐步移除重复。运行时映射无法纯数据化的部分保留为适配器，并由一致性测试约束。

---

## 10. 服务端边界

服务端负责：

- 校验区块印记、版本、字段、数量、依赖和页面级规则。
- 校验媒体 URL 安全性和上传文件是否真实存在。
- 校验商品、门店、活动等关联对象的存在、公开状态和适用范围。
- 发布时返回结构化问题，事务内阻止错误内容进入 revision。
- 保持旧 revision 可读取和回滚，不静默改写历史。

当前 `content-template-contract.ts` 在迁移阶段可变为生成产物的兼容 re-export；它不得继续保存手工合同值。客户端必须停止从该服务端路径导入。

---

## 11. 生成与 CI 门禁

建议根脚本：

```json
{
  "contracts:generate": "node scripts/generate-content-template-contract.mjs",
  "contracts:check": "node scripts/generate-content-template-contract.mjs --check",
  "test:content-templates": "node scripts/verify-content-template-contract.mjs"
}
```

门禁要求：

- 合同 JSON 结构错误、模板 key/type/name 重复、模板数量不是 23 时失败。
- 受控能力、设备、视觉角色和字段类型出现未知值时失败。
- 生成文件摘要与权威 JSON 不一致时失败。
- 23 个内容模板与 Puck 注册、BLOCK_META、Inspector schema、Renderer 分派不一致时失败。
- 缩略图测试直接读取合同数据和渲染结果，不再用正则依赖 TypeScript 对象的字段书写顺序。
- `npm run test:contracts`仍负责 25 个 Puck 区块注册闭环；内容模板测试单独证明其中 23 个模板的语义合同。

`contracts:check`必须进入根 `typecheck`或 CI 质量流程，但生成动作不能在普通构建中悄悄改工作区；开发者需要显式运行 generate 并提交生成产物。

---

## 12. 分批实施

### 批次 0：合同基础与测试可信度

- 新建权威 JSON、生成脚本、两端生成产物和检查脚本。
- 把现有 5 模板合同迁入权威 JSON，不改变视觉行为。
- 修复骨架测试的源码正则脆弱性。
- 客户端停止直接导入服务端源码。
- 验收：类型检查、合同检查、25 区块注册检查、5 模板语义检查全部通过。

### 批次 1：区块版本与发布纵切

- 为新插入的首批 5 模板写入区块级印记。
- 保存不迁移；读取支持 `legacy-0`；发布识别版本。
- 接通结构化 issues、Inspector 完成度和服务端最终门禁。
- 移除页面级合同摘要的权威地位，不修改数据库结构。

### 批次 2：23 模板合同覆盖

- 将另外 18 个模板逐一加入权威合同。
- 同源生成缩略图、Inspector 能力和发布规则。
- 首先完成骨架、比例、顺序和空默认值；视觉细节按模板族分批。

### 批次 3：模板专属能力

- 商品列数与选择、画廊、热区、前后对比、视频、活动、门店和顾客证据。
- 每个能力同时覆盖空、加载、失败、权限和发布路径。

### 批次 4：迁移与全量验收

- 建立明确的 `legacy-0 → v1`迁移器和预览。
- 使用外部真实浏览器完成 1920/1440/1024/768/390 验收。
- 验证旧草稿、常用方案、整页方案、发布 revision 和版本回滚。

每一批独立验收，不把“23 个合同条目存在”写成“23 个公开模板视觉全部完成”。

---

## 13. 失败模式与回退

| 失败模式 | 防护 | 回退 |
| --- | --- | --- |
| 生成产物漂移 | SHA-256 + `contracts:check` | 重新从权威 JSON 生成 |
| 新合同破坏构建 | 批次 0 不改运行行为 | 恢复旧 re-export，权威 JSON保留 |
| 旧草稿被错误升级 | 无印记视为 `legacy-0`，保存不迁移 | 使用原草稿或 revision |
| 迁移器部分写入 | 预览后单次草稿写入，失败不提交 | 保留迁移前草稿 |
| 客户端与服务端结果不一致 | 同生成数据/evaluator + 一致性测试 | 服务端结果为最终门禁 |
| 新校验误阻断发布 | issue code、版本和区块定位 | 回退合同版本或修复规则，不绕过服务端 |
| 缩略图与公开页面不一致 | 同源 composition/preview + 外部浏览器验收 | 阻止该批次通过 |

不通过删除验证、隐藏错误或强行提升版本来回退。

---

## 14. 法庭审校摘要

### 原告主张

采用根级 JSON + 两端生成产物，可以在不改变现有前后端构建边界、不增加依赖和不迁移数据库的前提下，建立真正可执行的单一合同。

### 被告抗辩

1. 生成两份文件看起来仍像双轨，可能发生漂移。
2. JSON 可能无法承载复杂模板逻辑。
3. 区块 props 增加系统字段可能影响旧草稿和复制流程。
4. 一次接入 23 个模板范围过大。
5. 当前测试通过情况不足以证明合同架构正确。

### 质证结论

- 生成产物由摘要和 `--check`约束，只有根级 JSON 可手改，因此不是两个权威来源。
- JSON只承载声明式合同；React/CSS和数据库验证继续由各层适配器执行，不把任意代码塞进合同。
- Puck 数据本身是 JSON props；使用保留字段无需数据库 migration，但必须验证所有创建/复制/方案入口。
- 采用 5 模板纵切后扩展 18 模板，避免一次性重写 23 个 Renderer。
- 当前类型检查和25区块注册通过，但骨架测试存在源码正则假失败，证明必须先提升测试可信度。

### 法律助理意见（专业建议，不代替用户授权）

建议批准本方案，置信度高。它与当前 React/Vite + NestJS 双构建边界、Puck JSON存储、revision 回滚和“单一事实来源”规则最匹配，且不需要依赖变更或数据库迁移。

批准后只先实施“批次 0：合同基础与测试可信度”。批次 0 验收通过后，再单独进入区块版本与发布纵切；不得把本次批准解释为一次性改完 23 个模板。

重新开庭条件：生成方案需要新增共享包或依赖、必须修改 Prisma Schema、Puck 无法稳定保留系统字段、旧草稿无法以 `legacy-0`兼容读取，或服务端发布接口必须发生破坏性变更。
