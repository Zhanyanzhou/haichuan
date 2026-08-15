# 海川珠宝首页梵克雅宝比例改版 Design QA

## Evidence

- Source visual truth:
  - `G:\网站搭建2\design-qa-assets\reference-vca-proportion-home.png`
  - `G:\网站搭建2\design-qa-assets\reference-vca-proportion-drawer.png`
  - `G:\网站搭建2\design-qa-assets\reference-vca-proportion-mobile.png`
- Browser-rendered implementation:
  - `G:\网站搭建2\design-qa-assets\vca-inspired-home-final-1920x1080.jpg`
  - `G:\网站搭建2\design-qa-assets\vca-inspired-drawer-final-1920x1080.jpg`
  - `G:\网站搭建2\design-qa-assets\vca-inspired-drawer-mobile-final-390x844.jpg`
- Full-view comparison evidence:
  - `G:\网站搭建2\design-qa-assets\comparison-vca-home-final.jpg`
  - `G:\网站搭建2\design-qa-assets\comparison-vca-drawer-final.jpg`
  - `G:\网站搭建2\design-qa-assets\comparison-vca-mobile-final.jpg`
- Focused comparison evidence:
  - `G:\网站搭建2\design-qa-assets\comparison-vca-header-focus.jpg`
  - `G:\网站搭建2\design-qa-assets\comparison-vca-drawer-focus.jpg`
- Viewports: desktop `1920×1080`; mobile `390×844`.
- Source pixels: desktop references `1672×941`; mobile reference `853×1844`.
- Density normalization: all references were proportionally normalized to the CSS viewport dimensions. Browser implementation used `deviceScaleFactor: 1`. The in-app browser's 1920 viewport was captured as adjacent non-overlapping segments and stitched without rescaling; mobile was captured directly at `390×844`.
- States: homepage closed menu, desktop left drawer open, mobile full-screen drawer open.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the English brand uses Cormorant Garamond with Garamond/Times fallback, and Chinese navigation uses Noto Serif SC with Song-style system fallbacks. The desktop wordmark reaches 41px at 1920 and remains optically centered. Drawer labels use 21px desktop and 25px mobile, avoiding the former oversized 40px menu.
- Spacing and layout rhythm: the desktop header is 96px high. The drawer is exactly 432px at 1920, or 22.5% of the viewport, matching the reference proportion. Main navigation begins near 118px rather than being vertically centered. Mobile rows, dividers, secondary links, and utilities follow the selected reference's vertical rhythm.
- Colors and visual tokens: the interface is pure white and deep brown-black. The desktop mask is the approved 35% deep-brown overlay; no black primary surface, gold button, card, radius, or glass effect was introduced.
- Image quality and asset fidelity: the existing HaiChuan gold bangle hero remains full-bleed and sharp. The image itself was not regenerated or replaced. Its crop and focal point remain compatible with the existing homepage media configuration.
- Copy and content: the hero contains no marketing headline, subtitle, or CTA. The drawer retains the four approved primary routes and adds the reference-approved secondary grouping and business utilities.
- Icons: all visible interface icons use the existing Ant Design icon family; no CSS-drawn, text-glyph, inline-SVG, or placeholder icon substitutions were used.
- Responsiveness: desktop header groups do not overlap at the desktop boundary. At 390px the drawer occupies the complete viewport and has no horizontal overflow. All content remains visible at 844px height.
- Accessibility and behavior: Ant Design Drawer retains focus trapping and page scroll locking. Menu state is exposed through `aria-expanded`; Esc closes the drawer; after closing, focus returns to the menu button. Route changes continue to close the drawer automatically.
- Runtime: the browser console contains no application errors. Only existing React Router v7 future-flag warnings are present.

## Full-view comparison

- Homepage: the implementation matches the selected media-first composition, large centered wordmark, left menu/search cluster, right service icons, full-bleed hero, and bottom scroll cue. The hero intentionally contains no promotional copy.
- Desktop drawer: the implementation matches the 432px white left rail, top close control, top-aligned primary navigation, grouped secondary navigation, bottom utilities, and visible dimmed hero.
- Mobile drawer: the final implementation aligns closely with the selected reference in wordmark placement, 25px navigation scale, 64px row rhythm, divider positions, and lower utility block.

## Focused-region comparison

- Header focus: confirms the center wordmark scale, 60px desktop outer margin, left control spacing, and right utility balance.
- Drawer focus: confirms close control placement, label size, chevrons, hairlines, group spacing, and bottom utility hierarchy at the exact 432px drawer width.

## Comparison history

### Iteration 1

- [P2] Desktop drawer was proportionally too wide at medium desktop sizes because it allowed up to 38vw.
  - Fix: capped the desktop drawer at 24vw while retaining the 432px maximum, so it resolves to exactly 432px at 1920 and follows the reference ratio.
- [P2] The first navigation item appeared selected after opening because it was forcibly focused and inherited the hover fade treatment.
  - Fix: removed the forced first-link focus. Ant Design keeps the focus trap, and focus still returns to the menu button after close.
- [P2] Mobile primary navigation was too large and vertically loose compared with the selected mobile reference.
  - Fix: changed the mobile labels from 29px to 25px, rows from 80px to 64px, and rebalanced the navigation and utility gaps.

### Iteration 2

- Re-captured the exact 1920×1080 desktop closed/open states and the exact 390×844 mobile open state.
- Rebuilt full-view and focused side-by-side comparison images.
- Re-tested Esc close, scroll lock, focus return, responsive overflow, and browser console state.
- No new P0, P1, or P2 findings.

## Primary interactions tested

- Open the left drawer from the homepage menu button.
- Close the drawer with Esc.
- Confirm focus returns to the homepage menu button.
- Confirm body scroll is locked while the drawer is open.
- Confirm route links and accessible names are present.
- Confirm the 390×844 full-screen drawer has no horizontal overflow.

## Residual test gaps

- The repository's lint script cannot run because ESLint is not installed in the current client dependencies. TypeScript and the Vite production build pass.
- The existing React Router future-flag warnings were not changed because they are unrelated to this visual revision.

## Follow-up polish

- P3: when a final licensed brand typeface is selected, self-host it to remove dependence on Google Fonts and ensure identical rendering in restricted networks.
- P3: final production video and poster focal coordinates should still be tuned in the existing homepage media admin after real assets are uploaded.

final result: passed

---

## 2026-08-11：商品编辑页 SKU 白色表格底验收

- 视觉参考：用户本会话提供的商品编辑页截图，聚焦“价格与规格”中的 SKU 表头与空状态区域。
- 实现截图：应用内浏览器实际打开 `http://localhost:5174/admin/products/19/edit`，滚动至 SKU 规格区域。
- 对照结果：SKU 表头、空状态单元格和价格输入框均为纯白；表头文字从金色调整为深色，使用浅灰分隔线保持列边界；未改变蓝色主操作按钮与状态色。
- 技术核对：浏览器计算样式确认 SKU 表头与空状态背景均为 `rgb(255, 255, 255)`。
- 构建：`npx vite build` 通过（仅保留现有大体积产物提示）。

final result: passed

---

## 2026-08-11：商品管理参考结构复刻

**证据**

- 源视觉：用户本会话提供的红框商品管理参考图；未复制工作区外附件。
- 实现截图：`G:\网站搭建2\design-qa-product-manage-implementation.png`。
- 视口：`1806 × 943` CSS 像素，密度 1；比较范围为商品管理工作区，保留项目既有后台侧栏。

**对照结果**

- 状态页签、质量提示、四项筛选、排序/展开入口、发布与批量工具栏、浅灰表头及创建/发布时间列均已按参考图重排。
- 蓝色 `#315EFB` 用于搜索、发布商品和选中状态；次级按钮与表头采用低对比浅灰，匹配参考图的紧凑后台节奏。
- 展开筛选、质量问题筛选和勾选后启用批量操作均在应用内浏览器验证；控制台无错误。
- 30 日销量接口尚未提供，因此该列显示 `—`，不伪造经营数据；其余商品内容来自当前列表数据。

final result: passed

---

## 2026-08-09：商品编辑四模板功能补全

**证据**

- 源视觉：本会话中用户提供的四张淘宝商品编辑截图（图文描述、基础信息、销售信息、物流服务）。附件位于工作区外，未读取或复制。
- 实现：`http://127.0.0.1:5173/admin/products/1/edit`，应用内浏览器实际渲染；首屏截图已在本会话捕获。
- 状态：已有商品编辑态；四个区块在同一条长表单中连续展示，顶部锚点定位。
- 视口：默认桌面视口；本轮聚焦首屏的图文描述布局，并以 DOM 检查覆盖后续三个功能区。

**发现与修复**

- [P1，已修复] 旧页面只有简单图片、基础字段、价格与物流提示，不能覆盖四张参考图中的素材、属性、SKU 和物流设置。
  - 修复：补齐 1:1 主图 5 位、3:4 主图 5 位、视频入口、填写助手、商品属性矩阵、可增删销售规格、购买须知、多件优惠、上架计划、发货时效、运费模板、区域限售与保价服务。
- [P2，已修复] SKU 与物流控件缺少可操作状态。
  - 修复：规格行可新增/删除，规格表单包含颜色、规格、价格、库存；物流支持按商品或按规格设置、时效与配送方式选择。

**保真度检查**

- 字体与层级：沿用后台现有字体、14px 表单标签与金色主按钮，不复制淘宝品牌色。
- 间距与布局：采用左侧填写助手 + 右侧长表单；素材区、属性区和物流模板均以浅灰分组承载，保持页面可连续滚动。
- 颜色与视觉令牌：白色编辑卡、浅灰素材区、蓝色填写助手标题、金色提交按钮沿用现有后台体系。
- 图片与图标：已有商品图片实际载入；空上传位使用 Ant Design 图标；未增加自绘图标或占位素材。
- 文案与交互：顶部四个锚点、只看必填开关、图片上传、设封面、删除图片、SKU 增删、物流单选均有可见交互。

**交互验证**

1. 商品列表“编辑商品”跳转到独立编辑路由：通过。
2. 点击“销售信息 / 物流服务”锚点后，后台主内容滚动容器定位到对应区块：通过。
3. 点击“添加销售规格”后，销售规格从 2 行增至 3 行：通过。
4. 主图区显示 5 个 1:1 槽位，竖图区显示 5 个 3:4 槽位：通过。
5. 浏览器控制台没有阻塞流程的新错误；历史日志保留了一条已去除的 Ant Design 输入框弃用提示。

**数据范围说明**

- 图片、封面、基本资料、价格、商品状态继续调用现有商品接口保存。
- 视频、细粒度商品属性、SKU、优惠与物流模板的专用持久化接口尚未在现有 API 中提供；本轮先完成完整可操作的前端表单，不擅自进行数据库迁移。

final result: passed

---

## 2026-08-09：商品独立编辑页（四分区连续表单）

**证据**

- 源视觉：本会话用户提供的商品编辑四张参考截图，分别对应“图文描述 / 基础信息 / 销售信息 / 物流服务”。未读取或复制工作区外的附件文件。
- 实现页面：`http://127.0.0.1:5173/admin/products/1/edit`，应用内浏览器实际渲染。
- 视口：`1806 × 945` CSS 像素，密度 1；实现截图为该视口下的浏览器捕获。
- 状态：已登录管理员、已有商品编辑态；源图为淘宝四模板编辑态。两者的品牌侧栏不同，比较范围限定为编辑工作区。
- 全视图对照：实现采用顶部标题与操作区、紧随其后的四锚点导航，以及同一页面内纵向连续的四个编辑区块；不再使用模态弹窗。
- 焦点对照：首屏核对了“图文描述”区的图片区、详情输入区、顶部导航和底部保存条；点击“销售信息”锚点后，后台内容滚动容器滚动至该区（`scrollTop: 1141`），URL 为 `#sales`。

**发现**

- 无待修复的 P0、P1、P2 差异。
- 字体与层级：复用后台既有中文字体和按钮层级；页面标题、区块标题、表单标签与辅助文案的层次清晰。
- 间距与布局：内容区维持统一的 1240px 宽度、24–28px 内边距和 20px 区块间距；首屏不需要在四个模板间切换即可继续向下编辑。
- 颜色与视觉令牌：沿用后台白色内容卡与金色主操作，不复制淘宝品牌色。
- 图片与图标：商品图片来自已有商品数据，上传、返回等操作沿用 Ant Design 图标；未加入占位图或自绘图标。
- 文案与交互：商品列表的“编辑商品”已验证跳转到 `/admin/products/1/edit`；新增商品入口跳转到 `/admin/products/new`。页面顶部及底部均可保存或返回，四个锚点可定位区块。

**检查清单**

1. 以商品列表“编辑商品”入口实际跳转到独立路由：通过。
2. 图文描述、基础信息、销售信息、物流服务在一张长表单内连续出现：通过。
3. 顶部锚点定位和内容区滚动：通过。
4. 现有商品的类目路径、图片、价格及商品标签正常载入：通过。
5. 浏览器控制台：无阻塞性错误；存在 Ant Design `Spin` 的既有提示性警告，不影响编辑流程。
6. 客户端构建：本次商品编辑页未新增 TypeScript 错误；仓库仍有与本任务无关的既有错误（InquiryManage、LeadManage、PuckEditor、SelectionInquiry、Catalog、Custom）。

**后续微调**

- P3：如需完全贴近淘宝的填单助手，可在后续补充左侧步骤提示和必填字段聚焦，但不影响当前连续编辑流程。

final result: passed

---

## 2026-08-09：商品管理与四分区编辑

**证据**

- 视觉参考：用户在本会话提供的淘宝商品管理截图与四张商品编辑分区截图（会话附件 `codex-clipboard-592421b8-56f7-4160-bdba-f097bb08a70a.png` 等）。
- 实现页面：`http://127.0.0.1:5173/admin/products`，应用内浏览器实际渲染。
- 视口：`1693 × 945` CSS 像素，密度 1；与列表参考图尺寸对齐。
- 状态：模拟数据管理员登录后，商品库“全部”页签；另已验证“出售中”状态筛选及图文描述、基础信息、销售信息、物流服务四个编辑页签。

**对照结果**

- 字体与层级：沿用后台既有中文界面字体和 14px 信息密度；状态页签、筛选栏、批量操作区及表头层级清晰。
- 间距与布局：采用“状态页签 → 横向筛选 → 批量操作 → 宽表格 → 分页”的工作台节奏；在参考尺寸下商品信息、价格、库存、销量、创建时间、状态和操作均完整可见。
- 颜色与视觉标记：沿用系统的金色操作色与绿色在售状态，避免直接复制淘宝品牌色；表格保持轻边框和低圆角的后台风格。
- 图像与图标：商品缩略图取现有商品图；功能图标使用现有 Ant Design 图标，不新增占位图或自绘图标。
- 文案与交互：搜索、分类筛选、状态页签、勾选批量操作、上/下架、移入回收站和分页均已接入；编辑窗口四个分区可切换。物流规则明确标注为店铺统一规则，未在未批准数据库改造的前提下伪造持久化。

**差异与结论**

- 编辑页采用更符合现有后台路由结构的宽模态窗口，而非淘宝的全屏编辑页；四分区信息架构和功能覆盖保持一致。
- 无待修复的 P0、P1、P2 差异。构建期仍有其他既存页面的 TypeScript 错误，未由本次商品管理变更引入。

final result: passed

---

## 2026-08-08：后台一级导航响应式比例校准验收

**对照目标**

- 视觉基准：`G:\网站搭建2\design-qa-assets\admin-nav-audit-current.png` 的真实后台基线，以及已确认的响应式比例规则；不再将生成效果图用作像素标尺。
- 实现截图：应用内浏览器在 `http://localhost:5173/admin/dashboard` 的 1280 × 720 实际渲染截图（本次会话内捕获）。
- 状态：桌面端，`数据` 处于选中状态；右侧内容区保持数据概览。
- 对照方式：已将视觉基准与实际浏览器截图置于同一对照画布核查；聚焦区域为左侧导航。

**验收结果**

- 字体与层级：一级类目仍为 14px，选中项使用较深文字和 600 字重；图标与文字未发生替换或截断。
- 间距与布局：1280 × 720 下，侧栏实测为 160px、导航上内边距为 58px、首项视觉中心为 127px、行高为 42px、内容区横向内边距为 24.88px；1440px 为 168px 侧栏，1920px 平滑增长并封顶为 208px 侧栏与 72px 顶部留白。文字与图标尺寸保持不变，首项不再贴近顶部。
- 色彩与状态：选中背景实测为 `rgb(240, 240, 239)`，保留 2px 深色左侧标记；未增加阴影、渐变、卡片或新色彩。
- 图像与图标：未新增或替换图像资产；继续使用现有 Ant Design 图标。
- 文案与业务内容：一级类目顺序、中文文案、右侧页面内容均未改动。
- 交互：点击“商品”会展开 5 个二级项；点击“全部商品”会导航至 `/admin/products` 并保持该分组展开；点击“交易”会进入 `/admin/orders` 并收起已展开的分组。箭头常显、展开时旋转，始终最多只展开一个一级分组。移动端通过媒体查询维持原先 20px 顶部留白，避免抽屉菜单变得过松。

**发现项**

- 无 P0、P1、P2 级视觉或交互差异。

**残余测试缺口**

- 当前应用内浏览器会话未提供可切换的 390px 视口；小屏样式已通过媒体查询隔离，建议在真机或开发者工具中进行最终抽屉视觉复核。

**后续微调**

- P3：若后续需要更强的层级感，可仅将相邻类目间距从 3px 调至 4px；本次不实施，以维持确认稿的紧凑节奏。

final result: passed

---

## 2026-08-08：后台一级导航验收

- 源视觉：用户在会话中提供的窄幅侧栏参考图。
- 实现截图：`G:\网站搭建2\design-qa-navigation.png`。
- 验收视口：桌面端 1298 × 910；实现截图为侧栏聚焦裁切 164 × 672。
- 状态：一级导航收起；参考图展示“店铺”选中，实施图展示“数据”选中，用于核对同一选中样式。

### 验收结果

- 14px 常规标签、40px 行高、20px 左右内边距、11px 图标间距与参考图的单列节奏一致。
- 侧栏使用暖白 `#FBFBFA`，选中项使用 `#F0F0EF` 浅灰底和 2px 深墨左线。
- 点击一级类目只进行导航；仅点击箭头才展开子项。已验证“店铺”可导航，子项可独立展开和收起。
- 390px 宽度下，侧栏作为全宽抽屉正常显示。
- [P3] 参考图没有悬停与键盘焦点状态，后续人工验收时应确认焦点环可见性。

final result: passed

---

## 2026-08-13：作品陈列全展开编辑面板

### Evidence

- Source visual truth:
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-14adc727-9853-4503-ad08-eca540f44c7f.png`
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-afd7473d-da9a-4d0a-9cea-6e2f63d0c780.png`
- Implementation route: `http://localhost:5174/admin/editor/about`，选中“作品陈列”。
- Implementation screenshot: `G:\网站搭建2\design-qa-assets\product-row-flat-inspector-5174.png`.
- Full-view comparison: `G:\网站搭建2\design-qa-assets\comparison-product-row-flat-inspector.png`.
- Viewport: `898 × 778` CSS px；参考图以完整装修工作台为视觉方向，重点比较右侧编辑结构。
- State: 已登录管理员，桌面端，“关于海川”页面中的作品陈列处于选中状态；未保存、未发布。

### Findings

- 无待修复的 P0、P1 或 P2 差异。
- 信息结构：模块名称、样式预览、标题与副标题合并为连续的“模块基础内容”；商品、布局、商品信息和背景依次平铺，没有折叠区。
- 字体与层级：沿用后台现有中文字体；分区标题、字段标签、辅助说明与字数提示保持清晰层级。
- 间距与布局：样式选择使用两列大缩略图卡；商品未搜索时保持轻量空状态，不再默认铺满所有候选商品。
- 色彩与视觉令牌：继续使用项目品牌金色与暖白背景，没有复制参考产品的蓝色品牌色。
- 图片与资产：样式卡使用仓库已有的画册与作品陈列 SVG 预览资产，没有新增伪造商品图或 CSS 绘图。
- 文案与内容：只展示现有的画册模式与标准选款模式；未伪造参考图中的第三种业务样式或智能分配功能。
- 无障碍与交互：作品陈列面板中 `aria-expanded` 数量为 0；两张模式卡、3 个桌面列数选项和 2 个手机列数选项均提供可识别状态；浏览器控制台无错误。
- 状态完整性：商品搜索保留加载、空值、无结果、错误和结果状态；已选商品保留加载、失效、移除及排序状态。
- 响应式：桌面与手机列数在同一面板中同时可见，不会因当前预览设备而隐藏。

### Comparison history

- Iteration 1: 仅调整旧表单的标题和顺序，视觉上仍接近旧面板；商品候选列表默认铺满右栏。
- Iteration 2: 将模式选择重做为真实缩略图卡，合并基础内容，并让商品候选仅在输入搜索词后出现。
- Post-fix evidence: 在用户实际使用的 5174 开发服务中重新加载并选中作品陈列；确认无折叠控件、空搜索状态正确、所有配置平铺、控制台无错误。

### Verification

- TypeScript 与 Vite 生产构建通过。
- 作品陈列渲染契约 8 项通过。
- 页面构建器 26 种区块契约在上一轮通过，本轮未改动契约定义。
- `git diff --check` 通过。

final result: passed


---

> 归档约定：后续设计 QA 记录追加到本文档（docs/design-qa.md），勿在根目录另建 design-qa.md。
