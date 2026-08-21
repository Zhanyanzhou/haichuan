# 海川珠宝模板重设计蓝图 v2（2026-08-18）

> 工程实施蓝图：把 `design-library/06` 的方法论落成海川 23 模板 / 12 母版的具体设计配方。
> 定位：一次性工程文档，实施完成后配方沉淀进 `06` 附录与 `masters.ts` 的 rules，本蓝图归档。
> 权威层级：品牌硬规范仍以 `docs/UI_GUIDE.md` 为准；比例只取 `tokens.ts` RATIOS 七个规范比例，不新造。

---

## 0. 诊断：系统层已完备，差距全在表达层

**已有资产（不动）**：12 视觉母版（mode/宽度/bleed/比例/双焦点/红线）、TONE_PRESETS 四调（ivory/champagne/ink/brand）、WIDTHS 五档、RATIOS 七比例、留白三档乘数、契约派生比例管道、双端独立焦点、金线 CTA 基础。

**五个表达差距（本蓝图要解决的）**：

| # | 差距 | 现状 | 海报级标准 |
| --- | --- | --- | --- |
| 1 | 排印级距是网页级 | hero 40–68px / h2 28–36px，display 与 hero 档几乎重叠 | 「大更大、小更小」：display 56–104 vs caption 11px，对比 8:1 |
| 2 | 母版只有红线没有配方 | rules 全是"禁止 X" | 每版要有积极的构图/排印/留白配方 |
| 3 | 遮罩单档 | Hero 固定 0.32 底部渐变 | 三档受控（无/轻/深），随素材明度适配 |
| 4 | 编号排印未系统化 | 仅 SinglePoster 一处 22–34px | 编号是奢侈排印标配：72–140px Cormorant Light 金色，全系推广 |
| 5 | 页面无叙事配方 | 只有 padding 档位 | 五段叙事弧 + 明暗舞台交替即节奏 |

---

## 1. 设计立场（一句话）

> **编辑式珠宝屋**：像一本珠宝杂志的专题页，而不是电商楼层。
> 三个锚：**大更大、小更小**（级距即高级）；**明暗即节奏**（舞台交替如杂志翻页）；**金线即礼仪**（金色永远是细线，从不成为面积）。

---

## 2. 六大系统升级

### 2.1 排印系统（最大杠杆）

字阶 v2（改 `tokens.ts` 的 `--hc-type-*`）：

| token | 现（≥768px） | v2 | 说明 |
| --- | --- | --- | --- |
| hero | clamp(40, 5vw, 68) | **clamp(44, 5.5vw, 84)** | 首屏主标题更大 |
| display | clamp(42, 5vw, 56) | **clamp(56, 7vw, 104)** | 海报特大档，与 hero 拉开 |
| h2 | clamp(28, 3vw, 36) | **clamp(30, 3.4vw, 44)** | 章节标题 |
| h3 | clamp(22, 2.2vw, 26) | **clamp(18, 1.6vw, 22)** | 收小——服务对比 |
| body | 16px | **15px** | 可读性底线，不参与夸张 |
| caption | 13px | **11–12px + 全大写 + 0.18em 字距** | eyebrow/图注/CTA 统一小字语言 |
| **num（新增）** | 无 | **Cormorant Light, clamp(72px, 9vw, 140px), 金色, line-height 1** | 海报级编号 |

补细则：中文标题字距 `0.04em`（中文衬线需要呼吸）；英文 display 允许 `-0.01em`；display:caption 对比在海报模板达到 **8:1**；正文行长 ≤720px 不变。

### 2.2 舞台明暗（把四调变成叙事工具）

TONE_PRESETS 已有四调，升级为**用法规则**：

- feature 模板增加 `tone` 受控预设（ivory / champagne / ink / brand，四选一，默认随母版）。
- **页面叙事弧的明暗路径**：序幕 ink → 停顿 ivory → 叙事 ivory/champagne → 陈列 brand → 尾章 ink（conversion 已有"深色典藏/象牙留白"双预设，保留）。
- ink 舞台上图片直出（无图时纯色舞台 + 金线细节依旧成立）。
- 同页连续同 tone 的两个 feature 之间必须插入停顿（纯文字/通栏图）。

### 2.3 遮罩三档（受控预设）

| 档 | 值 | 适用 |
| --- | --- | --- |
| none | 无遮罩 | 高调/浅色素材、文字在图外 |
| light | 底部渐变至 0.18 | 一般素材，文字安全区叠加 |
| deep | 底部渐变至 0.45 | 暗调海报、强调氛围 |

叠字仅限 bleed 舞台模板；安全区：文字带距底 `clamp(40px, 7vh, 88px)`，左右吃 gutter。

### 2.4 留白档位（增 grand + 气场规则）

- 现三档乘数（compact ×0.66 / normal / spacious ×1.32）**新增 grand ×1.8**，用于宣言、章节转场、hero-piece。
- 气场规则：**CTA 上方空间 = 1.5 × 段落距**（行动入口的留白即气场）。
- 图注距图 12px；编号与标题之间基线对齐（现 SinglePoster 已有 baseline 对齐，推广）。

### 2.5 金线与细节语言（奢侈排印配方）

四种金线（全部 1px，色 `var(--hc-gold)`）：
1. **CTA 底线**（已有，保留）
2. **eyebrow 前导线**：24px 短线 + 12px 间距，置于全大写英文 eyebrow 前
3. **图注上边线**：图注区顶部 40% 宽细线（rgba gold 0.35）
4. **章节分隔线**：章节之间通栏 1px rgba(gold, 0.25)，代替卡片边框

并置语言：全大写英文 eyebrow（11px / 0.18em）+ 中文小字标签并排基线对齐；编号三式（`No.01` / `01` / `§`）按模板族分配；图注语言：**图外右下、11px、muted、右对齐**——杂志图注，不做图上浮层。

### 2.6 页面叙事弧（五段配方）

```text
序幕 primary    ink 大舞台（hero / 沉浸视觉）
停顿 support    纯文字或通栏图（editorial-text / immersive-image）
叙事 feature    图文组 ×1–2（editorial-split / editorial-story，ivory 系）
陈列 commerce   商品呈现（hero-piece 打头 → grid / gallery）
尾章 support    conversion（ink，回到深色收束）
```

硬规则沿用 06 第八章 + 既有页面组合约束（每页一个 primary；同密度 feature 不连续；通栏/视频/轮播不堆叠伪首屏）。

---

## 3. 十二母版设计配方

> 每版：意图 → 桌面构图 → 排印/留白/tone → 受控预设增量。比例均取 RATIOS。

### 3.1 cinematic-hero 电影首屏（primary-stage）

意图：杂志封面式开场——一图、一词、一行动。
构图：视口舞台（100svh，下限 680）；文字带底部安全区左对齐（center 为受控备选）；**编号 No. 置于左上角 gutter 处（11px 金色全大写）**。
排印：eyebrow 金色 11px 全大写 + 前导线；title hero 档（44–84）；CTA 白字金线。
遮罩三档受控（默认 light）。tone：ink 优先。
```
No.01 — COLLECTION
┌──────────────────────────────────────────┐
│                                          │
│               主影像（裁切驱动）            │
│                                          │
│  ── ETERNAL LIGHT                        │
│  缄默的诗            （hero 44–84px）      │
│  一句克制的话…                             │
│  ── 探索系列 ──   （金线 CTA）             │
└──────────────────────────────────────────┘
```

### 3.2 immersive-image 沉浸视觉（support-stage）

意图：翻页间的全幅呼吸。21:6 / 16:9 定比，文字位四选一保留。
v2 增配：叠字版启用遮罩档；**不叠字时图注走图外右下杂志语言**。tone 随上文（转场即换气）。

### 3.3 editorial-split 编辑分栏（feature-stage）

意图：杂志对页。38/62 保留（红线已禁 50/50）。
排印 v2：**编号 num 档（72–140 金色 light）** + eyebrow 并置（基线对齐）；title display 档（56–104）；body 15px；CTA 金线。
tone：ivory 默认 / champagne 受控。留白 normal；文字列 ≤440px 不变。

### 3.4 editorial-story 编辑叙事（feature-stage）

意图：成品与细节的非对称对话。主图 2/3 + 细节 1/3 下移错位 12%（保留，这是好设计）。
v2 增配：细节图下方图注（图外右下）；主图可受控**出血到容器边（bleed 变体）**增强画册感；tone ivory。

### 3.5 asymmetric-gallery 非对称画廊（feature-stage）

意图：作品本身即主角。大图→双图→大图节奏保留；禁止均分（红线保留）。
v2 增配：每图图注编号化（`Fig.01` 11px muted）；画廊章节头允许 num 编号 + display 标题；tone brand/ivory；间距统一 24。

### 3.6 editorial-text 编辑文字（support-stage）

意图：宣言页——全站最大留白处。
v2 增配：**grand 档（×1.8）默认**；标题 display 档；首行可加金色首字母/前导线；正文 ≤80 字红线保留；tone ivory/champagne。

### 3.7 hero-piece 代表作品（feature-stage）

意图：一件作品的仪式。对称居中 + 四周大留白保留。
v2 增配：grand 留白档；**编号 No. 置于作品上方居中（num 档缩小版 48–72）**；Brand 模式隐藏价格保留；tone ivory / ink 受控。

### 3.8 journey 叙事旅程（feature-stage）

意图：01–05 大字叙事（已符合方向）。
v2 增配：编号升到 num 档（72–140 金 light）；中英文并置基线对齐；禁止步骤圆/连线（红线保留）；tone ivory。

### 3.9 conversion 转化尾章（support-stage）

意图：深色收束。21:6 背景 / 纯色舞台；"深色典藏 / 象牙留白"双预设保留。
v2 增配：标题 h2 档即可（尾章不需要与序幕比大）；CTA 金线加强为 **金线框按钮**（1px 边框 + 透明底，唯一允许的框形 CTA）；遮罩档随背景图。

### 3.10 commerce-grid 商品网格（commerce）

意图：选款效率，排印只对齐不夸张。4:5 固定、列数规则保留。
v2 增配：caption 11px 统一商品名/材质；价格用 tabular-nums；tone brand；**不加金线于商品卡**（金线是品牌叙事语言，不进商品陈列）。

### 3.11 commerce-entry 入口卡组（commerce）

意图：导航卡。1:1 / 4:5 保留，≤6 卡，底部叠字保留。
v2 增配：叠字加轻遮罩（light 档）；hover 时标题下金线浮现（240ms）；caption 11px。

### 3.12 commerce-campaign 活动导购（commerce）

意图：强导购，仅 Commerce 页。比例与门禁保留。
v2 增配：倒计时用 num 档缩小（48–72）；活动视觉遮罩三档受控。

---

## 4. 实施批次（每批：改 → build → 五宽度截图回审）

| 批 | 内容 | 影响面 |
| --- | --- | --- |
| B1 | `tokens.ts` 字阶 v2 + grand 档；`contentTemplateLayouts.tsx` LAYOUT_CSS：caption/图注/金线四式/遮罩三档变量 | 全站立即升级，风险低（token 层） |
| B2 | 海报四将：hero（遮罩档/编号角标/tone）、singlePoster（num 编号/display 档/tone）、doublePoster（图注/bleed 变体）、fullBleed（遮罩/图注） | 海报感主战场 |
| B3 | 叙事组：editorial-split/story/gallery/journey/hero-piece/text（num 推广、grand 档、图注语言） | 品牌叙事页 |
| B4 | commerce 三版 + conversion（金线框 CTA、tabular-nums、hover 金线） | 商业页对齐 |
| B5 | 页面叙事弧校验：组合规则接入发布门禁 + 母版 rules 回填 `masters.ts` | 收口 |

## 5. 归属与沉淀

- 实施完成后：母版配方回填 `masters.ts` rules；通用配方（排印/金线/图注语言）增补进 `design-library/06` 附录；本蓝图移入 `docs/archived/`。
- 不新造比例（RATIOS 七个为准）、不改 contracts 槽位结构（本蓝图全部是表达层，不动合同字段）。
