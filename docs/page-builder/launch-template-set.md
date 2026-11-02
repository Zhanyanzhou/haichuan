# 首发七母模板合同

> 生效：2026-10-08。本文把[店铺装修产品合同](store-decoration.md)第 2 节的九个区块角色和[模板设计标准](template-creation-rules.md)第 3.1 节的双端过渡，落成**首次上线要交付的七块母模板**：每一块的角色、画幅、结构骨架、槽位、双端差异、禁区和验收断言。
> 本文不新立产品规则。角色用途与禁区认 store-decoration 第 2 节；画幅、比例过渡、字号层级、圆角间距认 template-creation-rules；色值与对比度认 [UI_GUIDE](../UI_GUIDE.md)；公开条件认 [D.38](../DECISIONS.md)，**"公开必填只由页面自己的值满足"认 [D.40](../DECISIONS.md)**——D.40 已取代 D.38 中"锁定默认文案可满足公开必填"的子范围，D.38 其余条款不变。
> 规则生效不等于功能验收。本文描述的是**要交付的产物**，不是已经存在的模板目录；当前是否做到见 [CURRENT_STATE](../CURRENT_STATE.md)。

**本文的角色词汇已经进入机器。七块母版的本地定义和创建入口已经存在，已发布目录版本仍不存在；做到哪一步以 [CURRENT_STATE](../CURRENT_STATE.md) 为准。** 第 1 节的九个 `sectionRole` 自 2026-10-08 起落进机器合同与两端生成物（[template-definition.schema.json](../../contracts/page-builder/template-definition.schema.json)、`client` 与 `server` 的 `templateDefinition.generated.ts`）：创建向导第 1 步按 [presets.ts](../../client/src/page-builder/template-creation/presets.ts) 的 `SECTION_ROLES` 九个角色组织，生成器按角色取排印层级并判定 `ButtonSlot` 资格（只给 `page-hero` 与 `service-invitation`，即 M1 与 M7），产出的定义带 `metadata.sectionRole`；旧 `PURPOSES` 降级为历史配方的兼容读取。**但第 5 节的"七步创建"产出的仍只是一块合规的区块模板，不是第 3 节写好的 M1～M7**——七块母版要逐块做出来并过第 7 节验收才算交付，第 1 节那张表目前仍是产前合同而非目录事实。§6.1 的 `clamp()` 初值也还没落地。逐条差距记在 [CURRENT_STATE](../CURRENT_STATE.md) 第 41～46 行。

## 0. 权威关系与不覆盖

| 问题 | 认哪份 |
| --- | --- |
| 九个区块角色各自的用途与禁区 | `store-decoration.md` 第 2 节 |
| 画幅分组、双端过渡、预览框 | `template-creation-rules.md` 第 3.1 节 |
| 布局结构、图片组合、字号层级、圆角间距 | `template-creation-rules.md` 第 4～7 节 |
| 首发要交付哪几块、每块长什么样 | 本文 |
| 机器合同的字段、节点类型与父子规则 | `templateDefinition.generated.ts` |

本文不覆盖：机器合同 key、Schema 迁移、模板版本发布流程、页面成篇检查、SEO 与上线准备。本文不得反向改写上述任何一份，也不得被当前代码实现反向改写。

**本文只写七块模板的产前合同，不写"已经做出来了"。** 七块全部通过第 7 节验收之前，模板目录不得对外声称首发七块齐备。

## 1. 为什么是七块

store-decoration 第 2 节说"首次上线只需要 6–8 个已发布区块模板覆盖最常用角色即可开始页面装修"。本文把这句话收成确定的七个：

| # | 区块角色 | 双端过渡（`template-creation-rules.md` 第 3.1 节） | 服务的公开页 |
| --- | --- | --- | --- |
| M1 | `page-hero` 页面首屏 | 全幅主视觉 | `/`、`/products`、`/catalog`、`/custom`、`/about`、`/contact` |
| M2 | `collection-story` 系列叙事 | 左右图文 | `/`、`/products` |
| M3 | `editorial-split` 左右图文 | 左右图文 | `/`、`/products`、`/about`、`/custom`、`/contact` |
| M4 | `craft-detail` 工艺细节 | 左右图文 | `/`、`/products`、`/about`、`/custom` |
| M5 | `creation-grid` 作品网格 | 商品卡组 | `/`、`/products` |
| M6 | `maison-fact` 品牌事实 | 随内容增长的上图下文 | `/`、`/about` |
| M7 | `service-invitation` 服务邀请 | 随内容增长的上图下文 | `/`、`/custom`、`/contact` |

**覆盖论证：** 除选款中心外，其余五个可装修页面各自至少有两块可用模板，且没有一页必须依赖推迟的角色（配方见第 4 节）。选款中心是唯一的单块页面：store-decoration §4 规定"选款中心以固定业务区为任务主体；装修区块只做克制导语或主视觉"，一块 M1 克制变体足够——给它凑第二块模板，正是那句"不得用模块堆出第二套目录"要防的事。

多出一块也没有用——第九个角色 `editorial-media` 与 `video-story` 本轮**不做**：

- `editorial-media` 不再单独做母版（D.41）：它并入 M1 的“非首屏影像章节”变体。合同枚举在另行授权前仍保留该值，只作历史读取。
- `video-story` 推迟：它要求媒体槽位由视频承担，而文档登记的 `ManagedVideo` 块仍在等工作流接入（"首个视频模板"），在视频槽位真实可用之前做出来的只会是一块带封面图的假视频模板。

推迟不等于取消。两个角色仍留在创建推荐的九角色表里；在它们有已发布版本之前，运营在这两个角色上看到的是"暂无可用模板"，不是一个空壳。

## 2. 共同不变量

七块母模板**每一块**都必须满足下面九条。任何一条不成立，这块模板不得发布版本。

| # | 不变量 | 依据 |
| --- | --- | --- |
| A | **根是一个 `Section`，只承担一节。** 不生成页眉、页脚、主导航、搜索、购物车、结算、Cookie 同意和语言切换 | store-decoration §4 |
| B | **根只有一个直接子节点：区块主体 `Stack`。** 边距、间距、背景落在这个 Stack 上，不落在根上 | 本文件 |
| C | **结构只用六个语义节点**：`Section`、`Stack`、`Container`、`Row`、`Column`、`Grid`。分栏由 `Row`/`Column`/`Grid` 表达，**不用自由坐标表达分栏** | template-creation-rules §4 |
| D | **高度方式随内容增长。** 七块根 `Section` 一律 `auto`；仅 M1 的桌面区块主体 `Stack` 使用 16:9 画幅，其余容器保持 `auto`，且七块都不用固定像素高度 | template-creation-rules §3 |
| E | **桌面是基准，手机只覆盖改过的项。** 手机一律单列流式；不新增平板内容端点 | template-creation-rules §3.1、D.36 |
| F | **一块模板最多一个 `ButtonSlot`**，且只出现在 M1 与 M7 上；其余角色的行动槽位是 `LinkSlot`。整页出现两个及以上按钮时，发布检查提醒并要求确认（D.41） | store-decoration §4；区块模板标准 §10.3 |
| G | **不出现**价格、库存、加购、倒计时和促销会场；不出现烤进图片里的英文标题；不出现系统示例 | store-decoration §2、§4 |
| H | **色值落 UI_GUIDE §4.1 共享底盘。** 标题字重 300～500，正文 400 | UI_GUIDE、template-creation-rules §6.1 |
| I | **槽位一律 `editable: true`、`hideable: true`。** `required: true` 只给"缺了这节不成立"的项；必填只由页面自己的值满足 | D.38、D.40 |

两条推论，避免实现时再猜：

- **不变量 B 是"一块模板是一节"的机器表达。** 页面装修排序时，节与节之间的间距由页面上的一档间距负责，模板不再各自带一段同样的空白（store-decoration §4）。
- **不变量 F 是唯一一处模板层面的"仪式感"约束。** 哪一节是页面主焦点由页面决定（store-decoration §4 第 2 条），但如果七块里有五块都带主按钮，页面就必然违背"本页只有一个主要下一步"。所以按钮资格收敛到两个角色上，页面只需要保证这两个角色不同时充当主焦点。

### 2.1 机器合同已经定死的父子规则

第 3 节的骨架不是随手画的。节点能放进什么里面，由 `templateDefinition.generated.ts` 的 `DYNAMIC_TEMPLATE_NODE_REGISTRY.allowedParents` 唯一决定，改不了：

| 节点 | 只能放在 | 能有子节点 |
| --- | --- | --- |
| `Section` | —（只当根，`rootOnly`） | 是 |
| `Container` | `Section`、`Column`、`Stack`、`Grid` | 是 |
| `Grid` | `Section`、`Container`、`Column`、`Stack` | 是 |
| `Row` | `Section`、`Container`、`Column`、`Stack` | 是 |
| `Column` | `Row`、`Grid` | 是 |
| `Stack` | `Section`、`Container`、`Column`、`Grid` | 是 |
| `Spacer`、`Divider` | `Container`、`Grid`、`Row`、`Column`、`Stack` | 否 |
| 全部槽位 | `Container`、`Grid`、`Row`、`Column`、`Stack` | 否 |

四条从表里推出来的硬约束，写骨架时会直接撞上：

1. **`Section` 不能直接放槽位**——槽位的 `allowedParents` 里没有 `Section`。所以不变量 B 的"区块主体 `Stack`"不是风格选择，是没有它就没法在根下放东西。
2. **`Stack` 不能包含 `Stack`，也不能包含 `Row`。** 这是最容易踩的一条：M1 的前景层因此是 `Container`，不是 `Stack`。
3. **`Container` 和 `Stack` 不能放进 `Row`。** `Row` 的直接子节点只能是 `Column`。
4. **`Column` 只能放进 `Row` 或 `Grid`**，不能单独出现在 `Section` 或 `Stack` 下。

**机器允许的比本文允许的更宽。** 上表里 `Row`、`Grid` 都能直接挂在 `Section` 下，`Spacer`、`Divider` 能出现在五处，但本文不变量 B 要求根只有一个 `Stack` 子节点，七块骨架也不用 `Spacer`、`Divider`。所以"通过 `allowedParents` 校验"只证明**结构合法**，不证明**符合本文**——反过来，本文的骨架也绝不允许超出上表。

**槽位只用到六个。** 机器合同登记了十一种槽位（`image`、`heading`、`text`、`richText`、`button`、`link`、`badge`、`icon`、`product`、`collection`、`heroTemplate`），七块骨架只用到前六种。**`product`、`collection`、`badge`、`icon`、`heroTemplate` 一个都不用**，这是有意的：用 `product` 或 `collection` 会把一节变成目录工具（M5 的禁区），用 `badge` 会带来促销标记（不变量 G）。这条也是机器校验的，不是靠自觉。

## 3. 七块母模板

每块的阅读方式相同：**角色与过渡 → 桌面 → 手机 → 结构骨架 → 槽位 → 禁区 → 验收**。结构骨架用节点类型写，不用自由坐标；方括号里的是槽位 key。

三处本文件作出的裁决，先集中说明，避免读到时以为是笔误：

1. **"推荐画幅"落在主图外框上，不落在根高度上。** template-creation-rules 第 2 节给每个角色推荐的 3:2、4:5、16:9 是**图片外框**的比例；只要这一节含正文，根就随内容增长。M1 的桌面主舞台 `Stack` 是唯一固定画幅的区块主体——它的正文是短标题，不是长文。
2. **M5 的卡片比例用 4:5，不用 template-creation-rules 第 2 节推荐的 1:1。** 4:5 是 UI_GUIDE 的商品卡比例，被 `template-creation-rules.md` 第 3.1 节的商品卡组过渡引用为两端不变的不变量；角色推荐是初值，初值被不变量收窄。同时 M5 **不在卡片下显示品名和价格**。卡片可以链到该作品已经公开的页面；品名、价格来自业务事实的商品网格必须另立母版。它展示的是已审核作品，不是目录工具。
3. **M5 只存两端列数**（桌面 3 列、手机 2 列）。768～1439px 的栏数减少是几何适配，不另存一套内容。

### M1 · `page-hero` 页面首屏

| | |
| --- | --- |
| 双端过渡 | 全幅主视觉 |
| 推荐页面 | 六个页面都可；`/catalog` 只用克制变体 |
| 桌面主舞台 | 根 `Section` 保持 `auto`；直接子节点 `Stack` 使用 16:9 与 `layoutMode: "free"`——**七块区块主体里唯一一处固定画幅**，用于主图与文字的前后景叠加 |
| 手机主舞台 | 根 `Section` 与主体 `Stack` 都为 `auto`、`layoutMode: "flow"`；**有单独构图的竖向素材时媒体框用该素材自己的竖向比例，没有时才用 4:5**——两种情况都**文字移到图下**，不做叠加 |

```text
Section 页面首屏
└ Stack 主舞台                       [桌面 free + 16:9；手机 flow + auto]
  ├ ImageSlot 背景图                 [heroBackground]
  └ Container 前景                   [桌面贴下半；手机继图之下]
    ├ ImageSlot Logo                 [logo]
    ├ HeadingSlot 页面主标题          [title]
    ├ TextSlot 副标题                 [subtitle]
    └ ButtonSlot 主行动               [primaryAction]
```

前景用 `Container` 而不是 `Stack`：机器合同不允许 `Stack` 直接包含 `Stack`（第 2.1 节）。

| 槽位 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `heroBackground` | image | 是 | 语义角色 `backgroundImage`；桌面铺满画布、无圆角 |
| `logo` | image | 否 | 小幅居中，**不得成为唯一主角**（`/` 的禁区） |
| `title` | heading | 是 | 页面级标题。只有本页首个可见主舞台使用页面级标题 |
| `subtitle` | text | 否 | 一句话副标题，受 `maxLines` 约束 |
| `primaryAction` | button | 否 | 本页的主要下一步。`/catalog` 的克制变体不使用它 |

**禁区：** 不做促销倒计时；不放价格；不做第二个主按钮；不在对比度不足处叠中文字；手机不用 16:9 居中裁切成竖幅冒充竖向素材（`template-creation-rules.md` §3.1 明确禁止）。

**验收：** 桌面长中文主标题 + 副标题在 1440×900 下不裁切、不溢出（这是固定画幅唯一的风险点，必须有兜底）；手机在 390px 下文字完整落在图下且不被裁切；背景图在两种设备下都加载到真实像素（`PB-MEDIA-002`）。

### M2 · `collection-story` 系列叙事

| | |
| --- | --- |
| 双端过渡 | 左右图文 |
| 推荐页面 | `/`、`/products`。联系页不作为主视觉工厂 |
| 桌面根 | `Section`，高度 `auto`，`layoutMode: "flow"`；主图外框 3:2 |
| 手机根 | 高度 `auto`；分栏改为上图下文（**不把区块根改成竖卡**）；副图外框 4:5 |

```text
Section 系列叙事
└ Stack 区块主体
  └ Row 图文分栏                     [桌面 row；手机 column]
    ├ Column 媒体列
    │ ├ ImageSlot 主图               [collectionHero]
    │ └ ImageSlot 副图               [collectionSecondary]
    └ Column 文字列
      ├ HeadingSlot 系列名            [collectionLabel]
      ├ HeadingSlot 主标题            [title]
      ├ TextSlot 描述                 [description]
      └ LinkSlot 次级链接             [secondaryLink]
```

**禁区：** 整块不出现价格与库存；副图不得伪装成可点商品；手机不是"把桌面图缩小"——副图在手机上仍必须是完整构图，不得居中裁切成竖幅。

**验收：** 长中文系列名 + 描述撑高时根随之增长，图文两列不重叠、不丢内容（`PB-RESP-003`）；手机在 390px 下图在上、字在下、顺序与桌面阅读顺序一致（`PB-RESP-002`）。

### M3 · `editorial-split` 左右图文

| | |
| --- | --- |
| 双端过渡 | 左右图文 |
| 推荐页面 | `/`、`/products`、`/about`、`/custom`、`/contact` |
| 桌面根 | `Section`，高度 `auto`，`layoutMode: "flow"`；主图外框 3:2 |
| 手机根 | 高度 `auto`；分栏改为上图下文；主图与两张副图的外框缺省 4:5 |

```text
Section 左右图文
└ Stack 区块主体
  └ Row 图文分栏                     [桌面 row；手机 column]
    ├ Column 媒体列
    │ ├ ImageSlot 主图               [splitHero]
    │ └ Row 副图组                   [桌面 row；手机 column]
    │   ├ ImageSlot 副图 1           [splitDetailA]
    │   └ ImageSlot 副图 2           [splitDetailB]
    └ Column 文字列
      ├ HeadingSlot 主标题            [title]
      ├ TextSlot 描述                 [description]
      └ LinkSlot 次级链接             [secondaryLink]
```

**与 M2 的区别：** M2 是"一个系列 + 一张氛围副图"，文字列更短；M3 是"一个说明 + 两张细节图"，是为了讲清工艺、人物或品牌而存在的通用分栏。两块不是彼此的复制品，也不允许其中一块被另一块取代。

**禁区：** 同 M2；此外不得在这一节放页面级标题（那是 M1 的职责）。

**验收：** 三张图在桌面同列排布且不重叠（`PB-RESP-003`）；手机三张图全部单列、按 主图 → 副图 1 → 副图 2 的顺序出现（`PB-RESP-002`）；缺任一副图时这一节仍成立、不塌陷（槽位可隐藏，`PB-MEDIA-002`）。

### M4 · `craft-detail` 工艺细节

| | |
| --- | --- |
| 双端过渡 | 左右图文 |
| 推荐页面 | `/`、`/products`、`/about`、`/custom`。**联系页不推荐** |
| 桌面根 | `Section`，高度 `auto`，`layoutMode: "flow"`；主图外框 4:5 |
| 手机根 | 高度 `auto`；分栏改为上图下文；副图条由两列改单列 |

```text
Section 工艺细节
└ Stack 区块主体
  ├ Row 图文分栏                     [桌面 row；手机 column]
  │ ├ Column 媒体列
  │ │ └ ImageSlot 主图               [craftHero]
  │ └ Column 文字列
  │   ├ HeadingSlot 步骤名            [stepLabel]
  │   ├ HeadingSlot 主标题            [title]
  │   ├ RichTextSlot 描述             [description]
  │   └ LinkSlot 次级链接             [secondaryLink]
  └ Grid 副图条                       [桌面 2 列；手机 1 列]
    ├ ImageSlot 副图 1               [craftDetailA]
    └ ImageSlot 副图 2               [craftDetailB]
```

`description` 用 `RichTextSlot`（工序是可列举的步骤，不是一段散文），这是七块里唯一一处富文本描述。

**手机副图单列的理由：** 副图是叙事细节图，不是商品卡。`template-creation-rules.md` 第 3.1 节允许商品卡在小于 768px 时两列，那是**商品卡组**过渡的规则，不适用于这一节。

**禁区：** 不得把工艺步骤写成促销卖点；不得出现"限时""最后一件"一类话术；不得用未经核验的产量、年份或认证数字。

**验收：** `RichTextSlot` 里的有序列表在两种设备下都保持可读行宽（`PB-A11Y-001`）；副图条在桌面两列、手机一列（`PB-RESP-002`），图与图之间不重叠（`PB-RESP-003`）。

### M5 · `creation-grid` 作品网格

| | |
| --- | --- |
| 双端过渡 | 商品卡组 |
| 推荐页面 | `/`、`/products` |
| 桌面根 | `Section`，高度 `auto`，`layoutMode: "flow"`；卡组 3 列 |
| 手机根 | 高度 `auto`；卡组 2 列；卡比例两端不变（4:5） |

```text
Section 作品网格
└ Stack 区块主体
  ├ HeadingSlot 主标题               [title]
  ├ TextSlot 描述                    [description]
  └ Grid 作品卡组                    [桌面 3 列；手机 2 列]
    ├ ImageSlot 作品图 1             [workA]
    ├ ImageSlot 作品图 2             [workB]
    └ ImageSlot 作品图 3             [workC]
```

首发固定三格。template-creation-rules 第 2 节允许"自定义 3～6 槽位"，那属于创建时的可选初值，不改变这块母版的三格结构。

**禁区：** 不得伪装成商品网格或目录工具（`store-decoration.md` 第 2 节）；卡片下不排品名、价格、库存；不做筛选、排序、分页。卡片可以链到该作品已经公开的页面，可访问名称用替代文本；没有公开页时不可点。品名排在图下的商品网格必须另立母版。

**将来做绑定商品的网格，必须另立一块母版**，走 UI_GUIDE 的商品卡规则（品名在图下、公开价格来自业务事实源），不得在这块模板里混用两种卡。

**验收：** 桌面三列在 1280px 与 1920px 下都成立，768～1024px 降为两列且不出现宽度塌陷的窄卡（`PB-RESP-002`，视口 `390`/`768`/`1024`/`1280`/`1440`/`1920`）；手机两列在 390px 下每张卡仍可辨认主体。

### M6 · `maison-fact` 品牌事实

| | |
| --- | --- |
| 双端过渡 | 随内容增长的上图下文 |
| 推荐页面 | `/about`、`/` |
| 桌面根 | `Section`，高度 `auto`，`layoutMode: "flow"`；主图受控宽度，不铺满画布 |
| 手机根 | 高度 `auto`；事实条目由两列改单列；主图满宽 |

```text
Section 品牌事实
└ Stack 区块主体
  ├ ImageSlot 主图                   [factHero]
  ├ HeadingSlot 品牌名称              [brandName]
  ├ HeadingSlot 主标题                [title]
  ├ Grid 事实条目                     [桌面 2 列；手机 1 列]
  │ ├ TextSlot 事实 1                 [factA]
  │ ├ TextSlot 事实 2                 [factB]
  │ └ TextSlot 事实 3                 [factC]
  ├ LinkSlot 次级链接                 [secondaryLink]
  └ ImageSlot Logo                   [logo]
```

主图不铺满画布，是因为这一节的主角是**可核验的事实**，不是影像；铺满 1440×960 会把事实条目压到首屏之外。

**禁区：** 不得自我夸饰而无作品支点（`/about` 的禁区）；事实条目必须是可核验的品牌或工坊事实，不得写未经核验的产量、年份、认证或排名；不得做成促销会场。

**验收：** 三条事实在两种设备下都完整可读；品牌名称与主标题的层级在 390px 下仍分得开（`PB-VISUAL-001`）；长事实文案撑高时根随之增长，Logo 不被挤出。

### M7 · `service-invitation` 服务邀请

| | |
| --- | --- |
| 双端过渡 | 随内容增长的上图下文 |
| 推荐页面 | `/contact`、`/custom`、`/` |
| 桌面根 | `Section`，高度 `auto`，`layoutMode: "flow"`；主图外框 16:9 |
| 手机根 | 高度 `auto`；时间与地点由两列改单列 |

```text
Section 服务邀请
└ Stack 区块主体
  ├ ImageSlot 主图                   [invitationHero]
  ├ HeadingSlot 主标题                [title]
  ├ Grid 时间与地点                   [桌面 2 列；手机 1 列]
  │ ├ TextSlot 时间                   [time]
  │ └ TextSlot 地点                   [location]
  ├ ButtonSlot 主行动                 [primaryAction]
  └ ImageSlot Logo                   [logo]
```

**与 M6 的关系：** 两块共用同一种构图（随内容增长的上图下文），差别在槽位与禁区。这是有意的——`template-creation-rules.md` 第 3.1 节把这两个角色归到同一种过渡，就不该在母版层再分叉出两种构图。

**禁区：** 不得做成促销倒计时（`store-decoration.md` 第 2 节）；时间与地点必须是**真实可提供的**服务事实，不是占位；不得出现第二套预约入口。

**验收：** 主行动在两种设备下都可点、有可读标签、焦点可见（`PB-A11Y-001`）；时间与地点在手机上按时间 → 地点的顺序出现（`PB-RESP-002`）；主图缺图时这一节仍成立、不塌陷（`PB-MEDIA-002`）。

## 4. 六个页面的成篇配方

七块模板解决"一节长什么样"，成篇由页面决定。下面是六个可装修页面的起始配方，供运营与模板设计者对齐，不构成页面准入。

| 页面 | 起始配方（按顺序） | 主焦点 | 主要行动落点 |
| --- | --- | --- | --- |
| `/` 首页 | M1 → M2 → M4 → M5 | M1 | M1 |
| `/products` 作品展陈 | M1（克制） → M2 → M5 | M2 | M1 |
| `/catalog` 选款中心 | M1（克制变体，不铺满第一屏、无主行动） | 固定业务区 | 固定业务区 |
| `/custom` 定制 | M3 → M4 → M7 | M3 | M7 |
| `/about` 关于 | M3 → M4 → M6 | M3 | M3 的次级链接 |
| `/contact` 联系 | M7 → M3 | M7 | M7 |

配方遵守 store-decoration 第 4 节：相邻两节不重复同一个全幅构图，后面的节不重复主焦点的那一句主要行动，整页一套影像语言。选款中心的主焦点是固定业务区，装修区块只做克制导语。

## 5. 谁做这七块，依据什么

**作者角色：模板设计者**——同时具备视觉判断与前端结构能力的人，是唯一有权发布母模板版本的角色。日常页面装修由运营完成，不需要走七步创建（store-decoration §1）。

模板设计者的交付动作：七步创建或直接改机器合同 → 四区精调 → 保存模板草稿 → 独立发布模板版本 → 回到页面装修验证一条真实页面。

**设计依据的读取顺序：**

1. 本文与 `template-creation-rules.md`——项目约束，优先级最高。
2. [design-library/](../../design-library/README.md)——通用理论与证据层。
   - `01-editorial-layout.md`、`02-luxury-principles.md`：编排方法与奢侈品判断。
   - `03-quantitative-baselines.md`：数值基线，用来校准留白、字距、比例。
   - `04-case-studies.md`：基准案例，用来横向比较。
   - 该库 README 明确："本库提供理论与证据，不提供项目约束：用于具体项目时，该项目自身的设计规范优先于本库数值。" 本项目的 `luxury-visual` 技能已把该库引用为理论与证据层（见 [DECISIONS](../DECISIONS.md) A.10）。
3. 机器合同 `templateDefinition.generated.ts`——具体字段、节点类型与父子规则以它为准，不靠记忆或散文。

**数值冲突时的裁决顺序：** UI_GUIDE → template-creation-rules → design-library。

## 6. 与在途工作、机器合同的关系

**本文的前提是两处在途文档修订**（2026-10-08 尚未提交）：

- `store-decoration.md` 第 2 节的**九个 `sectionRole` 表**与"三层治理"小节——本文第 1 节的七块直接取自这张表；
- `template-creation-rules.md` 按 D.40 的收束（标题字重 300～500、创建类型收束为九个区块角色、竞品像素测量迁出为研究记录）。

**提交顺序：先提交文档修订批，再提交本文。** 本文不得先于它所依赖的九角色表进入历史。

**结构骨架的合法性已对机器合同验过。** 本文七棵骨架（第 3 节）的每一条父子边都通过 `DYNAMIC_TEMPLATE_NODE_REGISTRY` 的 `allowedParents` 校验，校验时的 Schema 身份是：

| 项 | 值 |
| --- | --- |
| `DYNAMIC_TEMPLATE_SCHEMA_VERSION` | 3 |
| `TEMPLATE_DEFINITION_MODEL_VERSION` | 2 |
| `DYNAMIC_TEMPLATE_SCHEMA_HASH` | `a1917c5eb28c0e039ca161c23695c018cc8b76572c901d3bcdba74165aae4527` |

**Schema 哈希变了，本文的骨架就要重新验一遍。** 哈希只告诉你"机器合同变了"，不告诉你**哪一条边断了**。要后者，跑骨架校验：

```text
cd client && npx playwright test tests/launch-template-set.contract.spec.ts --project=admin-chromium
```

那份 spec 的 `MASTERS` 是本文第 3 节骨架的机器副本，逐边对照注册表，并在失败时打印具体断掉的父子路径。**改本文的骨架必须同步改它，反之亦然**——两者是同一份合同的两个面，不是两份文档。

**它校验的是父子边，不是角色词汇的准入规则。** 2026-10-08 起 `MASTERS` 里的 `role` 与机器合同的 `sectionRole` 已是同一套词汇，但 spec 里"按钮只落在 M1、M7 两棵树"那条断言，证明的仍是**这七棵树自己**的性质，不是系统层面的准入规则；系统层面的按钮资格由 `typographyScale.ts` 的 `allowsButtonSlot` 表达，两者目前恰好一致，改一处必须同时改另一处。也不要把它读成"七块母版已经做出来了"——它只校验骨架，母版本身见第 7 节。

**不变量 F 的生成器冲突已修，§6.1 的 clamp 缺口仍在。** [generateTemplateFromRecipe.ts](../../client/src/page-builder/template-creation/generateTemplateFromRecipe.ts) 已于 2026-10-08 改到合规：字号与字重从 [typographyScale.ts](../../client/src/page-builder/template-creation/typographyScale.ts) 的 `TEMPLATE_TYPE_SCALE` 按语义层级取值，不再有 `Math.round(shortSide * …)` 那套"按画布短边百分比另算一套主标题算法"，也就不会再产出字重 `700`；`cta` 只在 `allowsButtonSlot(sectionRole)` 为真的角色（`page-hero`、`service-invitation`）产出 `ButtonSlot`，同一配方里其余的 `cta` 降级为 `LinkSlot`，与不变量 F 的"按钮资格只给 M1、M7"一致。**仍未做的是 §6.1 要求的 `clamp(下限, 推荐值, 上限)` 初值**——目录内检索 `clamp` 零命中。根因不在生成器而在合同：`length` 目前只支持单值 `{value, unit}`，落 clamp 要先扩机器合同，属需单独授权的实现任务。字号改为固定层级后小画布不再自动获得小字号，放不下时生成器按容纳校验如实报错，不靠裁切或缩小文字通过。

校验只证明**结构合法**，不证明：模板可生成、四区可精调、双端几何正确、页面可发布。这些属于第 7 节。

**七份定义自 2026-10-08 起有创建入口，它同样不证明第 7 节的内容。** 模板设计器的模板库底部提供「从首发母版开始」（定义与派生在 [launchTemplateSet.ts](../../client/src/page-builder/template-creation/launchTemplateSet.ts)，选择面板 `LaunchMasterPickerModal.tsx` 只负责挑选）：选中一块后进入模板设计器，得到一份只换 `templateId`、结构与内容逐字节相同的新草稿。入口验收：

```text
cd client && npx playwright test tests/template-launch-master-entry.admin.spec.ts --project=admin-chromium
```

它证明的是"定义能被编辑器接受、能派生、未保存前不产生任何服务端写入"，**不**证明模板可生成、四区可精调、双端几何正确、页面可发布——那些仍属第 7 节。母版与起步草稿都不会自动进入模板目录。

## 7. 验收

七块模板的验收按图分两层：**每块自己的**，和**七块加起来**的。两层都要在真实浏览器上做，不能只用类型检查或单元测试代替。

### 7.1 每块都要过

沿用 `template-creation-rules.md` 第 11 节的验收 ID，不新立一套：

| ID | 每块必须证明的结果 |
| --- | --- |
| `PB-TPL-002` | 创建后能生成、能保存草稿、能发布独立版本；旧版本不被改写 |
| `PB-RESP-002` | 在 `390`、`768`、`1024`、`1280`、`1440`、`1920` 六个视口下，本节阅读顺序、图文关系、栏数符合本文第 3 节；过渡是本文指定的那一种，不串用；**手机不得出现零高度或负坐标** |
| `PB-RESP-003` | 相关元素对齐、间距统一、内容边距随画布计算；极端横竖比例、多图、多字段组合下不丢内容，**超长中文与超长英文都不裁切必要内容** |
| `PB-MEDIA-002` | 主图在两种设备下都加载到真实像素；缺图时不塌陷、不留无法解释的大空白 |
| `PB-A11Y-001` | 标题层级、图片替代文本、键盘可达与焦点可见；长文换行，不靠过度缩小或隐藏通过 |
| `PB-FAIL-001` | 槽位隐藏、删空、锁定与恢复后上下文合法；生成、保存、发布失败可恢复且不丢源草稿 |
| `PB-VISUAL-001` | 色值落 UI_GUIDE §4.1；标题字重 300～500；圆角与间距取 `template-creation-rules.md` 第 7.3 节的档位 |

### 7.2 七块加起来还要过

| 验收项 | 必须证明的结果 |
| --- | --- |
| 角色互不冒充 | 七块各自的禁区（第 2 节不变量 G 与第 3 节各块）无一被违反；没有两块被做成同一块的复制品 |
| 行动唯一 | 在六个页面的真实配方下，每页只有一个主要行动，且落在第 4 节指定的落点 |
| 相邻节不重复 | 同页相邻两节不出现同一全幅构图、不重复同一句主要行动 |
| 手机竖幅只给首屏 | 全幅竖向媒体框只出现在本页第一个可见的全幅主视觉上（store-decoration §4） |
| 推进不分叉 | 七个角色与 `template-creation-rules.md` 第 3.1 节三种过渡的对应关系，与本文第 1 节的表逐行一致 |

### 7.3 不做完不算完

七块模板全部通过 7.1 与 7.2 之前：

- 模板目录不得对外声称首发七块齐备；
- 页面成篇检查里的"模板够用"一项不得自动为真；
- 文档、界面文案与对外沟通中，不得把本文的规则描述成已执行的功能（`CURRENT_STATE.md` 才是当前状态的唯一出处）。
