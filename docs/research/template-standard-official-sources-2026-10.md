# 区块模板标准官方资料研究记录（2026-10）

> 核对日期：2026-10-11 至 2026-10-12（北京时间）。
> **本文件是研究记录，不是产品规则。** 官方平台的数值是该平台自己的约束。被 [D.41](../DECISIONS.md) 采纳的部分写在[区块模板标准](../page-builder/section-template-standard.md)里才生效。供应商功能不等于海川已经实现。
> 本记录服务于[模板规则审查报告](template-standard-review-2026-10.md)与草案，每条附官方 URL，并标出“可借鉴”与“不照搬”。

---

## 1. Shopify Online Store 2.0：模板、区块、预设与设置

### 1.1 结构与数量

| 规则 | 数值 | 来源 |
| --- | --- | --- |
| 一个 JSON 模板最多渲染的 section 数 | 25 | [JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates) |
| 每个 section 最多 block 数（可用 `max_blocks` 调低） | 50 | [Section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema) |
| 同一 section 在一页出现次数 `limit` | 只能设 1 或 2；默认不限 | 同上 |
| 没有 `presets` 的 section 不能在编辑器中添加 | — | [JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates) |
| theme block 最多嵌套深度（不含 section） | 8 层 | [Theme blocks schema](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/schema) |
| 静态 block：可隐藏、可改设置，**不能拖动、删除、复制**，不计入 `max_blocks` | — | [Static blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks) |
| `enabled_on` / `disabled_on`：只能二选一，按模板类型或区块组限制可用位置 | — | [Section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema) |
| 不要依赖 block id 字面值，id 动态生成 | — | 同上 |

**预设（presets）是变体的载体。** 官方示例中，同一个 Testimonials section 用多个 preset 分别提供“单条 / 轮播 / 网格”，而不是新建三个 section。有 preset 的 section 不应静态渲染；静态渲染的用 `default`。

- **可借鉴**：变体 = 同一区块角色的命名预设；准入（`enabled_on`）与每页上限（`limit`）由区块自己声明；结构性子元素可被锁定为“静态”。
- **不照搬**：Shopify 编辑模板会立即影响所有使用它的页面；海川保留“页面锁定精确模板版本 + 显式升级”（D.38）。也不复制 Liquid 文件模型。

### 1.2 设置（settings）

| 规则 | 来源 |
| --- | --- |
| 每个设置必须有 `label`；`range`、`font_picker` 的 `default` 必填 | [Input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings) |
| `visible_if` 条件显示设置；条件不能读取运行时或数据源解析值 | [Settings](https://shopify.dev/docs/storefronts/themes/architecture/settings) |
| 没有自动默认值的设置可能为空字符串，渲染必须判空；资源型设置可能指向已删除或隐藏的资源 | 同上 |
| `range` 越界会被夹到边界，非整步取最近一步 | [Input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings) |
| `image_picker` 支持 alt 与焦点（focal point），输出 `object-position` | 同上 |

- **可借鉴**：所有可开放字段都有标签与默认值；条件显示代替一次展示全部参数；渲染端对空值和失效引用失败安全。
- **不照搬**：range 静默夹取。海川现行规则要求非法输入保留并就近报错（template-creation-rules §9.3），继续保留。

### 1.3 主题商店要求（硬门槛）

来源：[Theme Store requirements](https://shopify.dev/docs/storefronts/themes/store/requirements)

| 类别 | 要求 |
| --- | --- |
| 性能与无障碍 | 首页、集合页、产品页，桌面和移动分别计算；Lighthouse **性能均分 ≥ 60**、**无障碍均分 ≥ 90**；测试时区块必须装入真实图片和内容，不能为空 |
| 布局韧性 | 内容长度、图片数量变化时，布局仍须“有意为之”，不出现尴尬空洞、大片空白或破版；产品网格在图片比例不一时不得破版 |
| 设置组织 | 用商家能懂的语言，逻辑分组，常用任务不用深入搜索；避免过深 block 嵌套；在灵活与“有主见（opinionated）”之间平衡 |
| 默认值 | 应说明该设置怎么用；禁止 Lorem Ipsum，不用演示店内容当占位 |
| 命名 | 选项用描述性名称，不用“Image 1/2/3”；写“Button label”而不是“CTA label”；字数上限写成“N words max”；比例写成“3:2 aspect ratio recommended” |
| 色彩 | 每个背景色设置都必须有对应的前景色设置（配色方案） |
| 图片 | 采用响应式图片；支持焦点；所有 img 有 alt |
| 无障碍 | 全键盘可达、焦点可见、焦点顺序等于 DOM 顺序；正文对比度 4.5:1，大于 18pt 文字及边框、图标 3:1；触控目标 ≥ 24×24 CSS px；h1–h6 视觉上可区分 |
| 差异化 | 只改间距、颜色、字体、渐变、动画属于“表面变化”，不构成新主题 |

### 1.4 最佳实践（建议性）

| 规则 | 来源 |
| --- | --- |
| LCP 图不要懒加载，加 `fetchpriority="high"`；主视觉不要用 CSS 背景图；srcset + sizes；写 width/height 防 CLS；preload 只给 1–2 个资源 | [Performance best practices](https://shopify.dev/docs/storefronts/themes/best-practices/performance) |
| 媒体默认不自动播放，必须自动播放时须静音；视频要有字幕；自动轮播可暂停并有上一张 / 下一张；**主要触控目标 ≥ 44×44 px**；h1 标识页面主题、标题按顺序 | [Accessibility best practices](https://shopify.dev/docs/storefronts/themes/best-practices/accessibility) |
| 指导原则：为特定商家类型定制、移动优先、定制简单直观 | [Best practices](https://shopify.dev/docs/storefronts/themes/best-practices) |
| Horizon 以 theme block 为核心；官方注明基于 Horizon 的主题不能提交主题商店 | [Shopify/horizon](https://github.com/Shopify/horizon) |

---

## 2. Puck 编辑器

| 规则 | 来源 |
| --- | --- |
| ComponentConfig：`render`（必填）、`fields`、`defaultProps`、`label`、`metadata`、`permissions`、`resolveData`、`resolveFields`、`resolvePermissions` | [Component config](https://puckeditor.com/docs/api-reference/configuration/component-config) |
| `resolveFields` 按当前 props 动态返回字段集（相当于 `visible_if`） | [Fields base](https://puckeditor.com/docs/api-reference/fields/base) |
| `categories` 给组件库分组，一个组件可属于多个分类 | [Config](https://puckeditor.com/docs/api-reference/configuration/config) |
| Slot 的 `allow` / `disallow` 要写在字段参数上；写在渲染函数上的不被大纲拖拽遵守 | [Slot field](https://puckeditor.com/docs/api-reference/fields/slot) |
| 数组字段支持 `min` / `max`（相当于 `max_blocks`） | [Array field](https://puckeditor.com/docs/api-reference/fields/array) |
| 权限三层：全局 → 组件 → 实例；内置 `delete / drag / duplicate / edit / insert` | [Permissions](https://puckeditor.com/docs/api-reference/permissions) |
| Data 不自带 schema 版本字段，版本由应用自己存 | [Data](https://puckeditor.com/docs/api-reference/data-model/data) |
| 遵循 semver；**重命名或删除 prop 属于破坏性变更**。对策：渲染端向后兼容（如 `heading \|\| title`），或用 `transformProps` 迁移（每次渲染时执行或批量写回）；转换要容忍新旧数据并存 | [Data migration](https://puckeditor.com/docs/integrating-puck/data-migration) |

- **可借鉴**：模板版本由海川自己的 `templateVersion` 与 `schemaVersion` 承担（已有）；破坏性变更分级与迁移转换器；用实例权限锁定结构槽位。
- **不照搬**：Puck 组件即模板的模型。海川母模板是 `TemplateDefinitionV2`，页面是 `PageDocument`，两者隔离（D.17）。

---

## 3. WCAG 2.2

来源：[WCAG 2.2](https://www.w3.org/TR/WCAG22/)

| 准则 | 级别 | 与区块模板相关的要求 |
| --- | --- | --- |
| 1.1.1 非文本内容 | A | 信息图要有替代文本；装饰图用空 alt（必须是**显式**的装饰判断） |
| 1.2.2 字幕（预录） | A | 有声视频要有字幕 |
| 1.3.1 信息与关系 | A | 标题层级用结构化标记 |
| 1.4.3 对比度 | AA | 文字 4.5:1；大字（≥18pt 或 ≥14pt 粗体）3:1 |
| 1.4.4 文字缩放 | AA | 放大到 200% 不丢内容或功能 |
| 1.4.10 重排 | AA | 宽 320 CSS px 时无二维滚动 |
| 1.4.11 非文本对比度 | AA | UI 组件与必要图形 3:1 |
| 1.4.12 文字间距 | AA | 行高 1.5 倍、段距 2 倍、字距 0.12em、词距 0.16em 时不丢内容；**固定高度的文字容器会失败** |
| 2.2.2 暂停、停止、隐藏 | A | 自动开始、持续超过 5 秒、与其他内容并行的动态内容须可暂停 |
| 2.3.3 交互触发的动画 | **AAA** | 交互触发的运动动画可关闭 |
| 2.4.4 链接目的（上下文中） | A | 链接文字结合上下文能判断去向 |
| 2.4.6 标题与标签 | AA | 标题描述主题或用途 |
| 2.5.8 目标尺寸（最小） | AA | 至少 24×24 CSS px，或满足间距例外 |
| 1.4.8 视觉呈现（参考） | AAA | 文本块行宽不超过 80 字符，**CJK 不超过 40 字**；不两端对齐 |

- **可借鉴**：逐条映射为模板检查项；文字容器禁止固定高度；装饰图必须显式声明。
- **不照搬**：海川触控目标已定为 44×44px（UI_GUIDE §6.2），高于 2.5.8 的 24px，保持更严要求。

---

## 4. web.dev：核心网页指标、图片与视频

| 规则 | 来源 |
| --- | --- |
| LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1，按第 75 百分位，移动与桌面分开统计 | [Web Vitals](https://web.dev/articles/vitals) |
| 永远不要懒加载 LCP 图；`fetchpriority="high"` 只给 1–2 张；LCP 资源须能从 HTML 直接发现，否则要 preload；理想耗时分布约为 TTFB 40%、加载延迟 <10%、加载 40%、渲染延迟 <10% | [Optimize LCP](https://web.dev/articles/optimize-lcp) |
| 用宽度描述符 `w` 时必须配 `sizes`；非首屏图 `loading="lazy"` + `decoding="async"`；`object-fit: cover` + `object-position` 控制焦点 | [Responsive images](https://web.dev/learn/design/responsive-images) |
| 构图换片用 `<picture>` + `media`；每个 `<source>` 写 width/height；alt 不随 source 变，要同时适用两种裁切 | [Picture element](https://web.dev/learn/design/picture-element) |
| 媒体一律写 width/height 或 `aspect-ratio`；迟到内容预留空间，无内容时不要收起预留 | [Optimize CLS](https://web.dev/articles/optimize-cls) |
| 非自动播放视频 `preload="none"` + `poster`；替代 GIF 的视频 `autoplay muted loop playsinline`；视频是 LCP 时预加载 poster；通常应避免自动播放 | [Lazy loading video](https://web.dev/articles/lazy-loading-video) |
| 字体只用 WOFF2 并子集化（CJK 常超 1 万字形）；`size-adjust` 减少换字位移 | [Font best practices](https://web.dev/articles/font-best-practices) |

---

## 5. 响应式断点

| 来源 | 断点 |
| --- | --- |
| [Material 3 Breakpoints](https://m3.material.io/foundations/layout/breakpoints/overview) | Compact <600（竖屏手机）；Medium 600–839（竖屏平板，**建议单栏**）；Expanded 840–1199（横屏手机、横屏平板、桌面；建议双栏）；Large 1200–1599；Extra-large ≥1600 |
| [Android window size classes](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes)（页面更新于 2026-09-22） | 宽高分别分级；Compact height <480dp（99.78% 的横屏手机）；Expanded height ≥900dp（94.25% 的竖屏平板）；宽度为 Medium、高度为 Compact 时“双栏布局不实际”；尺寸类不得当作 isTablet 判断 |
| [Bootstrap 5.3](https://getbootstrap.com/docs/5.3/layout/breakpoints/) | 576 / 768 / 992 / 1200 / 1400；官方说明断点不针对具体设备 |
| [Tailwind](https://tailwindcss.com/docs/responsive-design) | 640 / 768 / 1024 / 1280 / 1536；移动优先，提倡容器查询 |
| Apple [自适应模型](https://developer.apple.com/library/archive/featuredarticles/ViewControllerPGforiPhoneOS/TheAdaptiveModel.html)、[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)、[Design tips](https://developer.apple.com/design/tips/) | 只有 compact / regular 两档用于“堆叠还是并排”；控件默认 44×44pt；不允许横向滚动、图片不得变形。HIG Layout 页为脚本渲染，本次未能抓取 |

**对海川 768px 单一内容端点的含义（观察，非结论）：** 768 是 Bootstrap 和 Tailwind 的常见值，但它落在 Material 3 的 Medium（600–839）内部。竖屏平板（768–834）与横屏手机（约 844×390，Compact height）都会拿到桌面内容；超宽屏（≥1600、1920、2560）若无最大内容宽度与高度上限，行宽与首屏高度会失控。项目自己的[奢侈品官网观察](luxury-template-observations-2026-10.md)也显示，三家首屏竖向素材都延续到 1024–1280 才换宽幅。

---

## 6. 设计令牌与字号阶梯

| 规则 | 来源 |
| --- | --- |
| DTCG 格式 2025.10 为“Final Community Group Report”，稳定但**不是 W3C 标准**；有 `$value` 的对象即令牌；`$type` 可继承；别名 `{group.token}`；dimension 单位只有 px / rem；另有组合类型 typography、shadow、border、gradient 等 | [Design Tokens Format 2025.10](https://www.designtokens.org/TR/2025.10/format/) |
| Material 3 间距基础单位 8dp，嵌套允许 2/4/6/10；优先 padding 与 gap | [M3 Spacing](https://m3.material.io/styles/spacing/overview) |
| Material 3 字号 15 档基础样式，产品通常只用其中一部分，相邻档要拉开差距；中文行高约高 7% | [M3 Type scale tokens](https://m3.material.io/styles/typography/type-scale-tokens) |

- **可借鉴**：模板第三层只引用令牌别名，不写原始值；令牌分“基础值 → 语义角色”两级。
- **不照搬**：本记录不建议引入新的令牌工具链或文件格式；令牌迁移属于 AGENTS 规定需审批的“全局设计令牌”变更。

---

## 7. 设计系统治理：变体与文案

| 规则 | 来源 |
| --- | --- |
| 变体放进 presets，避免为每种布局新建 section | [Section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema) |
| 按钮文字：强动词开头，“动词 + 名词”；行动号召太多会让人困惑，位置要一致 | [Polaris Button](https://polaris-react.shopify.com/components/actions/button) |
| 弹窗底部不超过 2 个按钮 | [Polaris Modal](https://polaris.shopify.com/components/overlays/modal) |
| 没有找到官方统一的标题或正文字数上限；可用 WCAG 1.4.8 的 CJK 每行 40 字作为行宽依据 | — |

---

## 8. 本次未覆盖与待复核

- Apple HIG Layout 页面未能抓取，只引用了其可访问性与设计提示页。
- 中国大陆主流移动浏览器（微信内置浏览器、各厂商浏览器）对 `fetchpriority`、`svh` 单位和 `<picture>` 的支持度未核对；草案引用这些能力时须标“需目标浏览器验证”。
- 官方数值会随平台改版变化；重新引用前须重新核对日期与原文。
