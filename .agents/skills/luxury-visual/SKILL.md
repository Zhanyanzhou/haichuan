---
name: luxury-visual
description: 奢侈品视觉设计体系 — 当任务涉及前台页面设计、海报、banner、详情页、图片生成提示词、颜色/字体/留白/构图调整时使用。用「排版驱动 + 摄影驱动 + 极简 + 艺术指导」方法论和实测品牌视觉基线替代"高级/好看"等模糊描述，产出前按验收清单逐项自检。禁止用于管理后台的全局改版。
user-invocable: true
argument-hint: 要设计或优化的视觉任务（页面 / 海报 / 图片 / banner / 详情页）
---

# 奢侈品视觉设计体系（Luxury Visual System）

> 依据：2026-08-15 对 6 家顶级珠宝品牌官网（梵克雅宝 VCA、卡地亚 Cartier、布契拉提 Buccellati、格拉夫 Graff、海瑞温斯顿 Harry Winston、宝格丽 Bvlgari）与 2 家设计平台（Awwwards Luxury、SiteInspire）的实测调研。
> 本 Skill 提供可执行方法论与硬性基线，不具产品决策权；标注「待确认」的项需用户拍板，不得擅自更改品牌色 / 字体 / Logo。
> 知识来源分层：`rules/`、`knowledge/benchmark-data.md` 为实测数据；`knowledge/design-principles.md` 为公认方法论（有出处）；`process/diagnosis.md` 的清单为项目演绎（已标注非权威原文）。

---

## 一、核心方法论（一句话）

> **排版驱动（Typographic） + 摄影驱动（Photographic） + 极简（Minimal） + 艺术指导（Art Direction）**

这四个词来自 SiteInspire 分类体系（Typographic 2,084、Art Direction 1,903、Minimal 744、Photography 463），
与 6 家珠宝官网实测规律互相印证。**数值只是方法论的落地结果，不是源头。**

---

## 二、体系导航（本体系已拆分为五层，按需读取）

> 详细规则、模板、知识库、流程已拆分到子目录。**不要一次全部加载**，按任务读取对应文件。

| 层 | 目录 | 内容 | 何时读取 |
| --- | --- | --- | --- |
| 流程 | `process/` | 视觉诊断清单 + 设计决策链 + 强制看图 | **任何视觉任务第一步必读** |
| 规则 | `rules/` | 排印色彩 / 版式图片 / 文案禁忌 | 任何视觉任务必读 |
| 模板 | `templates/` | 比例骨架框架 + 7 类模板（产品图 / Hero / 节日 / 模特 / 系列 / 社媒 / 详情头图） | 明确对应某类图片时读对应模板；定比例先读 `ratio-framework.md` |
| 知识库 | `knowledge/` | 品牌实测数据 / AI 提示词库 / 设计原则 | 需要证据、提示词或方法论依据时读 |

### process/（1 份，任何视觉任务第一步必读）
- `diagnosis.md` — 视觉诊断清单 + 设计决策链 + 强制看图动作

### rules/（3 份，必读）
- `typography-color.md` — 字体排印与色彩硬性规则
- `layout-imagery.md` — 版式构图与图片规则
- `copywriting-forbidden.md` — 文案规则与禁忌清单

### templates/（8 份，按需读取）
| 文件 | 模板 | 文件 | 模板 |
| --- | --- | --- | --- |
| `ratio-framework.md` | 多比例骨架框架（8 比例，先读） | `collection-banner.md` | 系列 / 专题封面 |
| `product-image.md` | 纯产品图 | `social-card.md` | 社媒卡片 |
| `hero-poster.md` | 品牌 Hero 海报 | `detail-header.md` | 详情页头图 |
| `festival-poster.md` | 节日营销海报 | | |
| `model-editorial.md` | 模特佩戴氛围图 | | |

### knowledge/（3 份，按需读取）
- `benchmark-data.md` — 6 家品牌实测数据 + 设计平台分类体系
- `prompt-library.md` — AI 图像生成提示词库 + 术语对照表
- `design-principles.md` — 有出处的设计原则（Dieter Rams / 双钻模型 / Paul Rand 等）

---

## 三、使用流程（设计师决策链）

> 骨架来自 `process/diagnosis.md`（双钻模型演绎）。**顺序不可乱。**

0. **先看图（强制）**：截图 / 打开真实图像；无图则明说「无图，以下为假设」。
1. **诊断**：读取 `process/diagnosis.md`，按 7 项诊断清单逐项判断「合格 / 不合格」。
2. **定位**：难看在哪一层（图本身 / 图文关系 / 层级 / 字体 / 色彩）。
3. **读规则**：读取 `rules/` 三份，获取硬性约束。
4. **读模板**：读取 `templates/` 对应文件，照版式 / 构图 / 文字执行。
5. **生成图片**：需要 AI 出图时，读取 `knowledge/prompt-library.md` 套用提示词。
6. **检验**：按模板「验收点」+ 检验三问（眯眼 / 换尺寸 / 删减）逐项自检。

---

## 四、待确认的品牌决策点（需用户拍板，未确认前不擅改）

1. **底色**：保留现有暖白 `#FBF9F6`，还是改为实测主流的纯白 `#FFF`？
2. **风格路线**：走「经典衬线路线」（VCA / HW / Buccellati），
   还是「现代极细路线」（Bvlgari / Cartier）？—— 海川字体选型（Cormorant + 思源宋体）指向经典衬线路线。
3. **Cormorant 定位**：只做英文标题 / 品牌名，中文标题配思源宋体，是否照此执行？

---

## 规则优先级（冲突时）

1. 本轮明确的产品目标
2. 用户对「待确认项」的拍板
3. `docs/UI_GUIDE.md` 中的品牌规范
4. 本体系的实测基线与通用建议
