# 奢侈珠宝网站技术、媒体性能与页面构建器对照

> 记录日期：2026-10-07
>
> 性质：只读竞品技术审查与后续优化依据，不是已批准的改造方案、产品决定或上线证明。
>
> 范围：Tiffany & Co. 中国、Chaumet、Buccellati、MIKIMOTO、Van Cleef & Arpels、BVLGARI、Cartier、Boucheron，以及海川珠宝当前实现。
>
> 重要限制：外部网站的后台不可直接访问。本文只根据公开页面、网络请求、资源路径、DOM 和平台官方文档判断；无法由前台证明的后台产品、版本、工作流和部署方式一律标为“无法确认”。

## 1. 先给结论

1. 这些品牌没有使用一套共同的技术栈。当前公开资源中可分为三类：
   - Nuxt / Vue 类前端：Tiffany 中国、BVLGARI。
   - Magento / Adobe Commerce 类电商：Chaumet、Buccellati、MIKIMOTO、Boucheron；Boucheron 前端还使用 Hyvä / Alpine.js。
   - Adobe Experience Manager（AEM）类内容平台：Van Cleef & Arpels、Cartier。
2. 它们与海川的**代码栈并不直接兼容**：海川是 React + Vite + Puck、NestJS + Prisma；Magento 主要是 PHP 电商体系，AEM 主要是 Java/Adobe 内容平台，Nuxt 是 Vue 体系。不能复制组件或直接移植后台。
3. 它们与海川的**内容架构高度契合**：受控组件、模板约束、响应式素材、草稿/预览/发布、版本化内容、业务数据引用，这些能力正是海川的 Puck `PageDocument`、模板定义、共享 Renderer 和发布流程正在承担的职责。
4. 不建议为了“像奢侈品牌官网”而迁移到 Magento、AEM 或 Nuxt。当前更合理的路线是保留 React/Puck/NestJS 架构，把公开 Renderer、媒体管线、缓存、视频和发布质量门禁补齐。
5. “用了视频仍然流畅”不等于页面很轻。样本中多个品牌页面首屏或完整流程传输了 8–29 MB，Buccellati 的某个集合页甚至出现约 50 MB 的单个移动视频。它们常通过海报帧、分段请求、浏览器硬件解码、首屏调度和视觉骨架让体验显得流畅；同样也存在明显的超大素材、重复请求、全局遮罩和移动端过度下载问题。

## 2. 审查方法与证据强度

### 2.1 采样方法

- 浏览器：Edge/Chromium，临时审查标签页，不修改用户原有标签页。
- 桌面代表视口：`1440 × 900`；移动代表视口：`390 × 844`。
- 采样方式：禁用 HTTP 缓存，记录页面初次加载约 3 秒后的网络请求、传输字节、资源类型、DOM 媒体节点、响应式资源与懒加载属性；集合或商品流程再执行滚动观察增量请求。
- 页面范围：首页，加一个可进入的集合页或商品页；MIKIMOTO 集合流程被滑块验证码阻断，因此没有把验证码页当成真实集合页。
- 这些数字是一次浏览器采样，不是正式 Lighthouse、RUM 或生产 Core Web Vitals。网络波动、A/B 实验、地区、Cookie、CDN 命中和广告脚本都会改变结果。

### 2.2 结论标签

| 标签 | 含义 |
| --- | --- |
| 已确认 | 当前公开页面或资源路径直接出现对应框架/模块特征 |
| 高度可能 | 多项公开特征与平台交付形式一致，但无法进入后台核对实例配置 |
| 平台具备 | 官方平台本身提供此能力，不代表该品牌实例一定启用 |
| 无法确认 | 仅凭当前公开前台不能负责任地下结论 |

## 3. 首页网络与媒体样本

> 传输量按本次浏览器观测字节换算，主要用于相对比较，不代表品牌长期固定值。

| 品牌 | 请求数 | 已记录传输量 | 主要负载 | 媒体/调度观察 |
| --- | ---: | ---: | --- | --- |
| Tiffany 中国 | 29 | 约 1.56 MB | 图片约 1.21 MB；脚本约 0.22 MB | 16 张图片，13 张原生懒加载；移动端切换 `MOB1.jpg`；未观察到 `picture/srcset`；`_nuxt` 资源明显 |
| Chaumet | 51 | 约 1.69 MB | 图片约 1.33 MB；字体约 0.12 MB；部分媒体约 0.11 MB | 桌面/移动图片与视频分轨；商品图带 `w/h` 查询参数；图片通过空 `src` 等自定义方式延迟，而非原生 `loading=lazy` |
| Buccellati | 121 | 约 1.96 MB | 图片约 1.64 MB；111 个脚本请求合计约 0.28 MB | 56 张图片，18 张原生懒加载；有移动端 Hero；可见 Magento Page Builder 的 jarallax 资源 |
| MIKIMOTO | 129 | 约 1.35 MB | 脚本约 0.90 MB，其中 Google 相关约 0.54 MB；图片约 0.39 MB | 190 张图片，未观察到原生懒加载；`picture` 提供手机/平板/桌面三档；移动端约 4 px 横向溢出 |
| Van Cleef & Arpels | 48 | 约 10.73 MB | 视频约 8.41 MB；图片约 1.28 MB；脚本约 0.79 MB | 74 张图片中 70 张懒加载；70 个 `picture`、119 个媒体源；移动端独立竖屏视频；隐藏菜单视频在菜单未打开前出现重复请求 |
| BVLGARI | 75 | 约 29.47 MB | 图片约 16.78 MB；视频约 12.46 MB | 95 张图片，未观察到原生懒加载；41 张图片的固有宽度超过显示宽度 2.2 倍；移动端独立视频；`_nuxt` 资源明显 |
| Cartier | 85 | 约 9.89 MB | 视频约 8.36 MB；脚本约 1.17 MB；字体约 0.27 MB | 233 张图片中 220 张懒加载；394 个 `picture`、约 1100 个 `source`；4 个视频；第三方追踪较多 |
| Boucheron | 47 | 约 7.52 MB | 视频约 4.92 MB；图片约 2.02 MB；脚本约 0.39 MB | 106 张图片中 86 张懒加载；商品图使用 `width/height` 查询参数；移动卡片仍可能下载 512/1024 px 图用于约 147 px 展示位 |

## 4. 集合/商品流程样本

| 品牌与页面 | 初次传输 | 滚动增量 | 关键现象 |
| --- | ---: | ---: | --- |
| Tiffany 高级珠宝 | 约 3.48 MB | 约 0.71 MB | 滚动后再加载图片，首屏控制较克制 |
| Chaumet Joséphine | 约 2.91 MB | 约 0.41 MB | 响应式商品图片与定制延迟加载并存 |
| Buccellati Serenissima | 约 50.88 MB | 约 6.69 MB | 桌面环境请求约 50.0 MB 的 `1_HP_Serenissima_Mobile.mp4`，是明确反例，不应借鉴 |
| MIKIMOTO M Signature | 约 0.58 MB | 不适用 | 被阿里云滑块验证码阻断；数据不能代表集合页本身 |
| Van Cleef & Arpels 商品详情 | 约 7.81 MB | 约 0 MB | 图片、价格、款式、尺寸指南、加入购物袋、电话订购、退换与预约服务形成完整业务路径 |
| BVLGARI Serpenti | 约 12.95 MB | 几乎无增量 | DOM 中约 436 个图片节点，采样稳定后仍见全屏加载遮罩，节点密度和阻塞式状态值得警惕 |
| Cartier Love | 约 1.41 MB（部分请求持续） | 约 0.34 MB | 572 张图片、409 张懒加载、730 个 `picture`、10 个视频；媒体节点规模很大 |
| Boucheron Quatre | 约 3.92 MB | 约 0.08 MB | 滚动增量较小，但卡片实际显示尺寸与下载尺寸仍有压缩空间 |

## 5. 各品牌技术栈与后台页面构建器判断

| 品牌 | 公开前端/平台证据 | 后台页面构建器判断 | 证据强度 | 与海川的直接代码兼容性 |
| --- | --- | --- | --- | --- |
| Tiffany 中国 | `_nuxt` 静态资源；另有 OCSSaaS 相关 iframe/资源 | Nuxt 是前端框架，不等于 CMS。当前前台不能确认其后台使用哪一种页面构建器 | Nuxt 已确认；后台无法确认 | 中低：同属现代 JS，但 Vue/Nuxt 组件不能直接放进 React/Puck |
| Chaumet | Magento 版本化静态路径、RequireJS | Adobe Commerce/Magento 平台具备 Page Builder；当前样本没有足够的品牌实例证据证明该后台已启用或承担哪些页面 | Magento 已确认；Page Builder 仅平台具备 | 低：PHP/RequireJS 与 React/NestJS 不同，可借鉴内容类型与发布流程 |
| Buccellati | Magento/RequireJS；公开资源直接出现 `Magento_PageBuilder/js/resource/jarallax/jarallax.js` | 存在 Magento Page Builder 前端资源，可高置信判断站点内容使用或至少集成了 Page Builder 能力；具体后台权限与工作流不可见 | 高 | 低：不可直接移植；“内容类型 + 预览 + 店铺渲染”模型高度可借鉴 |
| MIKIMOTO | Magento/RequireJS | Magento 平台具备 Page Builder，但当前前台未出现足够的 Page Builder 专属证据；也可能使用 CMS Block、定制模块或混合方案 | Magento 已确认；构建器无法确认 | 低 |
| Van Cleef & Arpels | `/etc.clientlibs/`、`/content/dam/` 等 AEM 典型资源路径，另有 Vue 前端脚本 | 高度可能使用 AEM Sites 的页面作者环境、模板与组件；精确编辑器、组件策略、审批流和发布拓扑无法从公开站点确认 | AEM 高度可能；作者工具高概率存在 | 低：AEM 服务端体系不同；组件/模板治理思路高度可借鉴 |
| BVLGARI | `_nuxt` 静态资源 | Nuxt 本身不提供品牌后台页面构建器。可能连接 Headless CMS、自研 CMS 或其他平台，但当前前台无法确认 | Nuxt 已确认；后台无法确认 | 中低：渲染、路由缓存、响应式媒体策略可借鉴，组件不可直接移植 |
| Cartier | `/etc.clientlibs/`、`/dam/`、大量 AEM 风格图片变体 | 高度可能使用 AEM Sites 的页面作者、模板、组件和 DAM 能力；具体品牌后台界面与流程不可见 | AEM 高度可能；作者工具高概率存在 | 低：架构概念契合，代码不兼容 |
| Boucheron | Magento 路径；`frontend/Boucheron/hyva`、`Hyva_Theme/js/alpine3.min.js` | Magento/Adobe Commerce 可使用 Page Builder；Hyvä 产品线也包含 CMS/管理能力，但仅凭 Hyvä Theme 资源不能证明该品牌使用 Hyvä CMS 或 Page Builder | Magento + Hyvä Theme 已确认；构建器无法确认 | 低：PHP 模板/Tailwind/Alpine 与 React/Puck 不同，性能简化方向可借鉴 |

### 5.1 为什么不能从前台百分之百确认后台

- 一个公开网站可能把 CMS 输出预渲染成 HTML，后台编辑器不会向访客下载。
- 同一 Magento 站点可以混用 Page Builder、CMS Page、CMS Block、主题模板和定制模块。
- 同一 AEM 站点可以使用 Page Editor、Universal Editor、Experience Fragments、Content Fragments 或定制 Headless 交付。
- Nuxt 只说明 Vue/Nuxt 的渲染层，不能说明内容来自 Contentful、Adobe、内部 CMS、静态文件还是自研后台。
- 资源名称可能被 CDN 重写、合并或长期遗留。因此，本文只把 Page Builder 专属资源、AEM 交付路径等作为有边界的技术证据。

## 6. 官方平台能力与本次判断的关系

### 6.1 Adobe Commerce / Magento Page Builder

Adobe 官方将 Page Builder 定义为通过预制内容类型进行拖放编辑的扩展，支持实时店铺预览与表单编辑；官方说明从 Adobe Commerce / Magento Open Source 2.4.3 起默认提供 Page Builder。它的内容类型通常包含后台预览、店铺 master 渲染、字段表单和样式配置。

这与海川的对应关系是：

| Adobe Commerce Page Builder | 海川当前概念 |
| --- | --- |
| Content type | Puck 组件 / 模板内容槽 |
| Admin preview | Puck 画布 / 模板预览 |
| Master storefront rendering | 共享 Renderer / 公开 PageDocument 渲染 |
| Content form | Inspector / 字段控制 |
| Appearance | 模板版本与响应式呈现规则 |
| Commerce data insertion | 商品、分类、媒体引用 |

对应关系是架构类比，不是数据格式或代码兼容声明。

### 6.2 Adobe Experience Manager Sites

AEM 官方的可编辑模板能够限定页面结构、初始内容与允许使用的组件；作者可通过 Page Editor 或 Universal Editor 编辑页面。它更接近“被设计系统约束的企业内容生产系统”，而不是让运营任意写 HTML/CSS 的开放式网页工具。

这与海川的模板合同、可编辑能力声明、受控字段、草稿/发布与共享 Renderer 非常接近。值得借鉴的是治理边界，不是采购或迁移到 AEM。

### 6.3 Nuxt

Nuxt 官方将其定义为 Vue 的全栈 Web 框架，默认支持服务端渲染，并可按路由做静态生成、客户端渲染和混合渲染。它不是 CMS，也不自动带页面构建器。

Nuxt 对海川的借鉴价值主要在公开页面交付：首屏 HTML、按路由缓存/预渲染、代码分割与数据获取策略。海川当前是 React + Vite，并已有公开 SEO 快照和预渲染脚本，因此应先验证现有链路和真实 CWV，再决定是否补充 SSR/混合渲染；不能仅因 Tiffany 或 BVLGARI 使用 Nuxt 就迁移框架。

### 6.4 Hyvä

Hyvä 官方说明其 Theme 是 Magento 2 / Adobe Commerce 前端，使用 Magento 模板体系，并以 Tailwind CSS 与 Alpine.js 替代传统 RequireJS、Knockout 等复杂前端层。Hyvä 产品线还包含 Checkout、CMS、后台面板和媒体优化，但看到 `Hyva_Theme` 只能证明主题层，不能证明某个站点购买或启用了整套产品。

对海川最有价值的启示不是采用 Alpine，而是持续压缩前端依赖、减少水合/脚本成本、让核心购物和内容页面优先使用稳定的服务端数据与轻交互。

### 6.5 Puck

Puck 官方将其定义为可嵌入 React 应用的模块化开源可视化编辑器：开发者配置允许使用的组件与字段，编辑器产生数据，Renderer 按同一配置渲染；数据与后端由使用者自己拥有。

这说明海川现有技术选择是合理的：它天生比 Magento/AEM 更贴合当前 React 代码库，也更适合构建品牌受控的页面装修器。但 Puck 只提供编辑内核，不会自动替海川完成媒体派生、发布版本、权限、业务引用、缓存、SEO、视频策略和性能预算；这些仍是项目自己的产品与工程责任。

## 7. 海川当前技术栈与成熟度

### 7.1 当前技术基线

- 客户端：React 18、TypeScript、Vite 8、React Router、Puck `0.22.4`。
- 服务端：NestJS 11、Prisma 5、MySQL 数据模型、Sharp 媒体处理。
- 页面生产：Puck `PageDocument` 负责页面实例；模板定义、版本、Repository 和共享 Renderer 负责可复用结构；公开页读取已发布文档。
- 公开交付：项目已有 SEO 快照、公开路由预渲染、客户端包预算和本地 CWV 测量脚本，但这些不能替代真实生产 RUM 或线上验证。

### 7.2 已经具备、应继续保留的能力

1. `HeroSection` 已支持桌面/移动素材、`srcSet/sizes`、可见性调度、优先级和固有尺寸。
2. 商品详情主图已提供响应式 `srcSet/sizes` 与已知宽高。
3. `SecureImage` 已包含可见性观察、懒加载、固有尺寸和公开响应式 URL 处理。
4. 服务端响应式公开图片使用 Sharp 生成 WebP，质量 82，并禁止放大原图。
5. 公开视频/文件网关已支持 HTTP Range，这对视频分段播放是必要基础。
6. 客户端已有首包 JavaScript gzip 180 KiB 等预算；本地 CWV 脚本采用 LCP 2.5 s、CLS 0.1、INP 200 ms 的良好阈值。
7. 页面装修和模板设计已明确分工：页面实例使用 `PageDocument`，模板结构和版本不与页面内容混为同一来源。

### 7.3 当前最重要的技术缺口

1. `DynamicTemplateRenderer` 的通用图片节点目前主要输出单一 `<img src>`：非优先图片没有明确 `loading="lazy"`，也没有通用 `srcSet`、`sizes`、`decoding` 和固有宽高。这会让模板画布中“只是几张图片”的页面仍可能下载和解码过大的原图。
2. 合同/编辑器已有视频相关概念，但通用公开模板 Renderer 尚未形成与 Hero 同等级的完整视频运行时：缺少统一的桌面/移动源、poster、preload、可见后播放、暂停、减少动态效果和失败回退策略。
3. 响应式图片派生目前以请求时生成加短期内存缓存为主：缓存 TTL 约 5 分钟、最多 64 条。它不能代替发布时预生成、对象存储/CDN 持久化和稳定的变体清单。
4. 页面资产当前可能使用内容哈希标识，但受授权与撤销语义影响，网关仍可返回 `public, no-store`。不能直接把所有页面资产改成长期 immutable；需要在“受控资产可撤销”和“公开发布制品可长期缓存”之间设计明确边界。
5. 已有包预算和本地 CWV 工具，不等于所有发布页面已经自动通过真实网络、真实设备和生产 CDN 的性能门禁。

## 8. 为什么视频站看起来流畅，而少量图片也可能卡

浏览器处理视频和图片的路径不同：

- 视频通常可以通过 HTTP Range 分段获取，先显示 poster，再由硬件解码器按播放进度解码；不必在首帧前下载完整文件。
- 大图即使只有几张，只要每张是 4000–8000 px、PNG 或高质量 JPEG，浏览器仍要下载、解码为完整像素位图，再缩放到几百像素显示。压缩文件 3 MB 解码后可能占几十 MB 内存。
- 没有 `srcset/sizes` 时，手机也可能下载桌面原图；没有懒加载时，屏下图与首屏竞争带宽、CPU 和内存。
- 没有 `width/height` 或 `aspect-ratio` 会造成布局跳动；图片解码、主线程脚本、字体、第三方追踪与页面构建器组件也会共同造成“卡”。
- 品牌站常用视觉过渡、骨架、淡入和固定尺寸让等待更平滑，但这不代表资源更少。部分样本站点本身也有明显性能反例。

因此，问题既是技术问题，也是内容生产规则问题：前端标签、媒体服务、后台上传约束、发布流程和 CDN 缓存必须共同负责。

## 9. 可借鉴的工程规则

### 9.1 媒体槽必须有合同

每个 Hero、系列封面、商品卡、故事图和视频槽至少声明：

- 桌面与移动建议比例、最大显示宽度和安全裁切。
- 允许的文件类型、像素上限、文件大小警告与拒绝阈值。
- 响应式变体宽度、格式与质量。
- 是否可能成为 LCP、是否默认懒加载、是否允许自动播放。
- 必须的 `alt`、标题、CTA、授权来源和业务引用。

### 9.2 每个页面只允许一个明确的首屏高优先级媒介

- LCP 候选使用高优先级、预留尺寸和准确的 `sizes`。
- 屏下图片默认延迟加载，不与首屏字体、导航和主要脚本争抢。
- 隐藏菜单、抽屉和轮播的媒体不得在用户未触发时全部预取。

### 9.3 视频必须按“体验组件”而不是普通文件处理

- poster 先行；首屏视频通常使用 `preload="metadata"` 或经过验证的受控策略。
- 提供桌面/移动编码与比例，避免桌面下载移动竖屏大视频或反向下载。
- 静音自动播放必须可暂停，并尊重 `prefers-reduced-motion`。
- 不允许视频阻塞标题、商品事实、导航、加入购物袋或预约操作。
- Range 支持、编码规格、CDN、错误回退与监控需要一起验收。

### 9.4 页面构建器必须受设计系统和业务事实约束

- 运营编辑“允许变化的字段”，不能任意写 HTML/CSS 破坏品牌与响应式。
- 商品价格、库存、材质、证书、服务和交易事实引用业务数据源，不复制成容易过期的自由文本。
- 模板、页面实例、业务数据、媒体资产和发布版本保持分离。
- 草稿、预览、预检、发布、回滚和资产撤销需要明确状态与审计记录。

### 9.5 性能必须成为发布门禁

- 对首页、集合页、详情页分别设定首屏传输、图片数量、视频、脚本、DOM 节点与 CWV 预算。
- 使用相同代表视口、相同状态和禁用缓存的基线做回归；生产再用 RUM 验证真实用户。
- 构建通过、Mock 通过或本机“看起来顺”不能代替公开页面的真实性能证据。

## 10. 后续候选优化顺序（尚未授权实施）

### P0：先补齐公开模板 Renderer 的媒体交付

- 通用图片槽接入响应式 URL、`srcset/sizes`、固有尺寸、`decoding="async"` 和非首屏懒加载。
- 建立唯一 LCP 媒体优先级规则，禁止多个模板块同时声明高优先级。
- 统一公开模板视频组件与桌面/移动媒体选择。

### P1：把媒体优化从请求时行为变成发布制品

- 上传或发布时生成受控宽度/格式变体和视频 poster。
- 为公开不可变制品设计内容哈希、长期缓存与发布撤销/清理边界。
- 在页面发布预检中显示实际文件大小、预计首屏负载和错误素材。

### P1：加强构建器治理

- 组件能力白名单、页面类型允许组件、响应式必填项与空素材稳定性。
- 草稿/预览/发布内容一致性和已发布版本回读。
- 业务引用失效、素材归档、权限变化时 fail closed 或要求重新确认。

### P2：以证据评估公开渲染模式

- 先用现有预渲染、CDN 与真实 CWV 证明问题所在。
- 只有 SEO、首屏 HTML、缓存或交互成本仍有明确缺口时，再评估 React 侧 SSR/混合渲染；不以竞品框架名称作为迁移理由。

## 11. 明确不借鉴的反例

- Buccellati：桌面请求约 50 MB 的移动端视频。
- Van Cleef & Arpels：隐藏菜单媒体在交互前重复请求。
- BVLGARI：大量超出实际显示尺寸的图片、集合页高 DOM 媒体密度和长时间全屏遮罩。
- Cartier：单页数百图片/`picture` 与多视频造成非常高的 DOM 和网络调度复杂度。
- MIKIMOTO：首页图片数量很高且未见原生懒加载，第三方脚本占比较大。
- Boucheron：移动端卡片仍下载明显过大的图片变体。
- 任何以加载动画掩盖阻塞、以视觉淡入替代真实性能治理的做法。

## 12. 官方资料

- [Adobe Commerce Page Builder overview](https://experienceleague.adobe.com/en/docs/commerce-learn/tutorials/content/page-builder-overview)
- [Adobe Commerce: What is Page Builder?](https://developer.adobe.com/commerce/frontend-core/page-builder/)
- [Adobe Commerce Page Builder content types](https://developer.adobe.com/commerce/frontend-core/page-builder/content-types/create/)
- [AEM Sites Templates Console](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/sites/administering/templates-console)
- [AEM Sites site and page templates](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/sites/administering/site-creation/create-site)
- [Nuxt introduction](https://nuxt.com/docs/4.x/getting-started/introduction)
- [Nuxt rendering modes](https://nuxt.com/docs/4.x/guide/concepts/rendering)
- [Hyvä: What is Hyvä?](https://docs.hyva.io/welcome/what-is-hyva.html)
- [Puck introduction](https://puckeditor.com/docs)
- [Puck component configuration](https://puckeditor.com/docs/integrating-puck/component-configuration)

## 13. 本项目证据入口

- 技术依赖：`client/package.json`、`server/package.json`。
- 页面职责：`docs/page-builder/store-decoration.md`、`docs/page-builder/template-creation-rules.md`。
- 媒体与性能规范：`docs/UI_GUIDE.md` 第 5、9 节。
- Hero 响应式媒体：`client/src/components/blocks/HeroSection.tsx`。
- 通用安全图片：`client/src/components/common/SecureImage.tsx`。
- 商品详情响应式图片：`client/src/pages/public/ProductDetail/index.tsx`。
- 通用动态模板 Renderer：`client/src/page-builder/template-definition/DynamicTemplateRenderer.tsx`。
- 响应式图片生成：`server/src/modules/upload/responsive-public-media.ts`。
- Range 与缓存响应：`server/src/modules/upload/public-uploads.gateway.ts`。
- 响应式变体内存缓存：`server/src/modules/upload/upload.service.ts`。
- 包预算与 CWV：`scripts/verify-client-bundle-budget.mjs`、`scripts/measure-public-cwv.mjs`。
