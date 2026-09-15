# 公网首访性能、图片加载与页面闪跳专项诊断

> 诊断时间：2026-09-15 16:30–17:00（Asia/Shanghai）<br>
> 公网入口：`https://124.156.173.45/`<br>
> 性质：只读诊断；没有修改业务代码、正式内容、数据库或云端配置，没有提交、推送、部署或重启。

## 1. 通俗结论

图片显示得晚，首要原因不是图片文件太大。首页首图在桌面实际只传了约 55 KiB，移动端约 21 KiB；浏览器也正确拿到了 WebP、响应式尺寸、`eager` 和高优先级。真正的问题是浏览器直到打开网页约 5.0–5.5 秒后才知道主图地址：它先等待 HTML、几轮脚本与样式、公开页面运行时、首页 PageDocument 接口和渲染器，最后才创建图片请求。也就是说，慢在“发现图片太晚”，不是“图片下载很久”。

页面“先一种样子、后变成另一种样子”包含两类现象：

1. 首页没有发生 HTTP 重定向或前端改路由，而是在同一个 `/` 内经历“空白底色 → 正在载入首页 → 已发布首页和 Hero 整体出现”。首页 CLS 是 0，但内容状态替换肉眼可见，所以低 CLS 不能说明体验没有闪换。
2. `/products` 的确有严重布局位移：加载时只保留 `60vh` 占位，页脚进入视口；已发布长页面装入后，页脚被推出视口。单次实测 CLS 为桌面 `0.242`、移动 `0.419`，明显超过 `0.1` 目标。

两者共享同一个上游问题——已发布页面内容和渲染运行时到得太晚——但不是完全相同的故障：首页主要是状态闪换，`/products` 还叠加了占位高度错误导致的真实布局位移。

当前最主要的问题依次是：

1. 公共首屏被多轮代码分包、全局样式/字体和运行时 PageDocument 读取串成了长依赖链；代表性桌面冷启动中，PageDocument 发起前已经启动 66 个资源请求。
2. 每轮公网请求普遍还要等待约 0.54–0.90 秒才收到响应头；这个往返/代理/源站等待被多轮依赖链反复放大。现有证据能确认延迟层存在，但不能把它全部归因于服务器计算。
3. 公共上传图片使用 `Cache-Control: public, no-store`，导致明明是公开、已转换的小图，回访时仍完整重传。
4. PageDocument、备用英文文档和商品列表存在可解释的重复读取；匿名 `/catalog` 还被一次 profile 401 和一次 refresh 401 串行阻塞。

## 2. 公网现场与版本对应

### 2.1 入口、环境和 TLS

- 历史 IP 入口仍可正常访问，最终地址仍是 `https://124.156.173.45/`，无 HTTP 重定向。
- curl 与 Chromium 都使用正常证书校验，未使用 `-k`、`ignoreHTTPSErrors` 或安全警告绕过；校验成功。
- 浏览器实际使用 HTTP/2；响应由 nginx 提供。HTML 为 `no-cache`，带指纹静态资源为一年缓存。
- 页面响应带 `X-Robots-Tag: noindex, nofollow`。已连接云控制台显示实例 `haichuan-preview-hk-01` 位于中国香港三区，未配置公网域名；结合实例名称、noindex 和发布资料，当前入口属于预发布，不是正式生产站。
- 没有观察到 Service Worker 控制，也没有发现 Service Worker 引起的版本更新或缓存切换。

### 2.2 公网运行版本不能被现有部署链自证

公网当前主入口资源是：

- `/assets/index-BNl5bKFG.js`，SHA-256 `6a62b7d2…58da9`
- `/assets/index-CDXENMQQ.css`，SHA-256 `6ea1c1da…98392`

它们与本机 `client/dist/assets/` 中保留的同名旧构建文件逐字节一致，但当前 `client/dist/index.html` 已指向另一组更晚的指纹。因此当前工作树/当前 dist 入口不是公网正在运行的前端。

下载到本地的最新预发布 manifest 指向 Git SHA `2fcfaa3`，对应 Release Images run `34932766722` 和成功的 Quality Gate run `34931377817`。但它不能证明公网正在运行这批镜像：

- 公网健康接口显示进程启动时间为 `2026-09-14T17:24:06Z`；
- `2fcfaa3` 本身直到 `2026-09-15T05:06:46Z` 才提交，镜像工作流到 `05:33:51Z` 才完成；
- 健康接口中的 release revision/source/digest 都是 `unknown`。

所以，公网进程早于 `2fcfaa3` 镜像产生，不可能是该后来生成的镜像。精确运行 SHA/镜像摘要属于“未验证”，最小补证是让部署流程注入现有 `RELEASE_GIT_SHA`、`RELEASE_SOURCE` 和 migration digest，并在部署后核对健康接口；本轮没有更改部署。

当前分支是 `release/2026-09-15-preproduction`，HEAD 为 `ad2a78e`。其最新 Quality Gate run `34944617728` 失败，而且本地源码/入口指纹与公网不同；不能把它当作公网版本，也不能把当前分支中对首页 eager renderer 的改动当作已验证修复。

### 2.3 已发布内容和回退来源

- 首页实际通过 `/api/page-modules/document/published?pageKey=home&locale=zh-CN` 获取 PageDocument。
- 返回的是 `home / zh-CN / version 45 / PUBLISHED`，发布时间为 `2026-09-02T13:30:53.877Z`，content hash 为 `0c981075…33bd8`。
- 浏览器最终渲染的 Hero 来自该 PageDocument，不是 HTML 内的默认首页，也不是 Release Images manifest 中 `safe-fallback / contentReady=false` 的 SEO 快照。
- `/catalog` 当前没有已发布 PageDocument，最终显示代码提供的固定公开目录空态；公开商品列表也为空，因此没有可点击的作品详情链接。本轮没有猜测详情路径，详情页的真实数据场景标记为未验证。

### 2.4 正式构建和页头补丁

- HTML 是 2,035 字节的客户端应用壳，引用内容哈希 JS/CSS，没有 Vite 开发客户端、HMR 或开发服务器特征；这是正式前端构建，不是 dev server。
- 当前渲染是客户端渲染；没有服务端 HTML 内容可供“水合”，因此本问题不是 SSR 水合故障。
- `/assets/header-search-standard-v3.css` 仍被 HTML 静态 `<link>` 引用，只有一处引用，没有观察到运行时追加或重复版本并存。
- 它与主 CSS 同时在约 `1.41s` 发起，代表性冷启动中约 `2.16s` 完成，早于 `4.36s` 的 FCP，因此不是本次首页 4–6 秒状态切换的直接触发器。
- 但它在主构建之后单独更新，文件名不含内容指纹，却设置一年缓存。这会让旧访客长期保留旧补丁，构成明确的版本混用风险。应纳入正式构建或改为内容指纹资源，而不是直接删除。

## 3. 测试基线

### 3.1 测试条件和局限

- 浏览器：Playwright Chromium `151.0.7922.34`，headless。
- 桌面：`1920 × 1200`，DPR 1；移动：`390 × 844`，DPR 2。
- 冷访：每次创建独立浏览器 context，不复用浏览器缓存；没有清理日常浏览器或服务器共享缓存。
- 回访：同一 context 内第二次导航，保留浏览器正常缓存。
- 这里的“冷/热”只指浏览器缓存；源站或中间层当时是否已有缓存属于现场自然状态，未清空且精确状态未知。
- 网络/CPU：未限速；测试端时区为 Asia/Shanghai，但网络出口地域未知、未做地理定位。
- 为隔离浏览器缓存，测试 context 阻止 Service Worker；现场页面本身没有 Service Worker controller。
- 这些结果来自当前 Codex 主机的网络出口，不能代表用户当前电脑、不同运营商或全部真实访客。
- Node `v25.2.1` 只用于运行诊断脚本，不作为项目 Node 22 构建或发布合格证据。

### 3.2 首页三次重复结果

表中均为中位数，括号内为三次范围。资源量不包含 HTML 本身。Hero 时间来自另一组三次专用观察：每 25 ms 检查视口内最大图片，等待 `complete` 且 `decode()` 完成后记录；它是体验代理指标，不是 Web Vital。

| 视口 / 缓存 | TTFB | FCP | LCP | 首屏主图清晰可见 | CLS | 资源数 | 传输量 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 桌面冷访 | 1.40s（1.39–1.60） | 4.36s（4.23–4.56） | 4.36s（4.23–4.56） | 6.04s（5.57–6.83） | 0 | 73 | 0.975 MB |
| 桌面回访 | 0.95s（0.54–0.96） | 1.00s（0.58–1.02） | 1.00s（0.58–1.02） | 1.97s（1.85–1.97） | 0 | 73 | 0.184 MB |
| 移动冷访 | 1.52s（1.38–1.53） | 4.30s（4.11–4.79） | 5.81s（5.56–6.27） | 5.79s（5.60–6.03） | 0 | 74 | 0.878 MB |
| 移动回访 | 0.54s（0.53–0.54） | 0.58s（0.56–0.60） | 1.83s（1.82–1.86） | 1.69s（1.66–1.69） | 0 | 74 | 0.088 MB |

首页冷访的 LCP 明显不达 `≤ 2.5s` 目标。桌面 LCP 元素实际是页头品牌文字 `span.site-header__brand-text`，不是 Hero 图片，因此还必须看 6 秒左右的自定义主图指标；移动 LCP 才是首图附近的视觉结果。

三次首页没有控制台错误、页面脚本错误或导航失败。8 秒观察窗中没有 long task，观察型主线程阻塞为 0；这不是正式 Lighthouse TBT，也不能替代真实用户 INP。受控菜单展开在桌面约 49 ms、移动约 31 ms，只能说明该次实验操作没有明显卡顿，不能宣称 INP 达标。

### 3.3 代表性桌面冷访时间线

| 时间 | 发生的事情 | 解释 |
| ---: | --- | --- |
| 0–1.40s | 建连、TLS、HTML TTFB；无重定向 | 首个响应已经偏慢，但不是全部 6 秒 |
| 1.41–2.61s | 入口 JS、React vendor、主 CSS、页头补丁完成 | HTML 只有应用壳，尚无真实首页 |
| 2.62–4.31s | PublicLayout、PageDocument runtime、模板渲染、Ant Design、motion、字体 CSS 等多轮动态块加载 | 代码依赖链产生多个网络往返；尚未请求首页文档 |
| 4.00s 截图 | 全屏浅底色和“正在载入首页” | 最早稳定可辨认的是加载状态，不是默认旧首页 |
| 4.35s | PageDocument 与公开设置首次发起 | 发起前已有 66 个资源开始加载 |
| 4.36s | FCP/LCP：页头“海川珠宝”文字 | LCP 没有代表主图就绪 |
| 5.26s | PageDocument 和设置返回 | 首页从 loading 进入 published；随后创建 Hero 图片 |
| 5.28s | Hero 请求发起 | 图片地址必须等 PageDocument 和渲染器 |
| 5.97–5.99s | Hero 收到响应并下载完 | 约 56 KiB 的 body 下载约 20 ms；等待响应头约 697 ms |
| 6.01s | Hero 解码并清晰显示 | 截图已显示最终 “DESERT ELEGANCE” 首屏 |
| 6.38–6.39s | 重复/英文 PageDocument 补拉结束，最后一次 DOM 变动 | URL 始终为 `/`；不是跳转 |

截图序列显示：约 `0.26s`、`2.20s`、`2.50s` 仍近似空白；约 `4.00s` 是加载状态；约 `6.00s` 才是最终 Hero。截图调度在浏览器主线程繁忙时会晚于目标时刻，报告采用文件内记录的实际时间，不把文件名 `0750ms` 误当成真实 0.75 秒。

### 3.4 内页和站内导航

- `/catalog` 直接冷开：桌面 TTFB `1.39s`、LCP `5.78s`、CLS `0.015`；移动 TTFB `1.54s`、LCP `6.10s`、CLS `0.068`。两者 80 个资源，约 782 KiB。
- `/catalog` 在约 3.55–3.68 秒发起匿名 `/api/customers/me`，得到 401 后又串行请求 `/api/customers/session/refresh`，再得到 401；两步合计占用约 1.10–1.29 秒。在此期间 PublicLayout 用“正在确认账户状态”替代 Outlet。
- 目录的数据、功能开关、分类、属性和产品 API 要到约 5.75–6.08 秒才开始；商品列表又在约 1 秒后重复请求一次。服务端商品 SSE 会先发送 `ready`，通用 SSE hook 将任何 message 当作变更信号，因此触发重拉。
- 从首页菜单进入 `/catalog#catalog-search-input` 是 SPA `pushState`，没有整页文档重新加载；菜单打开实验响应约 31–49 ms。目录最终是公开空态，没有可用详情链接，所以真实作品详情的直接打开和站内跳转均未测得。
- `/products` 纯品牌页单次冷开确认了另一类闪跳：加载占位为 `60vh`，先让页脚出现在视口，然后最终长页面插入，把页脚推出视口。布局位移源由浏览器直接指向 `footer.site-footer`；CLS 桌面 `0.242`、移动 `0.419`。这是已证实的布局稳定性故障。

## 4. 图片专项结果

### 4.1 首页 Hero

| 项目 | 桌面 | 移动 |
| --- | --- | --- |
| 脱敏用途地址 | `/uploads/2026/09/02/{hero}.png?width=1680` | `/uploads/2026/09/02/{hero}.png?width=800` |
| 实际响应格式 | WebP | WebP |
| 实际像素 | 1672 × 941 | 800 × 450 |
| 页面显示 | 1920 × 1200，按 Hero 容器裁切 | 390 × 488，按移动 Hero 容器裁切 |
| 传输体积 | 56,554 B（ResourceTiming 含头 56,854 B） | 21,650 B（含头 21,950 B） |
| 属性 | `srcset 480/800/1200/1680`、`sizes=100vw`、`eager`、`fetchpriority=high`、`decoding=async` | 同左，浏览器选择 800w |
| 代表性请求 | 5.28s 发起；5.97s 收到响应；5.99s 下载完；6.01s 解码显示 | 5.19s 发起；5.79s 收到响应；5.80s 下载完；约 5.84s 显示 |
| 缓存 | `public, no-store`；回访仍重传 | 同左 |

已排除：首页不是向移动设备直传桌面原图；没有误用懒加载；没有等待 IntersectionObserver；实际网络没有 Base64 Hero；响应式变换和现代格式确实生效。图片清晰度和现有裁切本轮没有改动。

已证实的问题：图片地址只能从异步 PageDocument 中得到，因此发现太晚；同时 `server/src/modules/upload/public-uploads.gateway.ts:50` 明确给公共上传图设置 `public, no-store`，导致回访仍传输 Hero。专用回访测试每次仍观测到桌面 56,854 B、移动 21,950 B 的 Hero 传输，不是浏览器缓存命中。

次要现象：移动端两张后续懒加载图在约 5.23 秒进入浏览器预加载阈值，约 5.73 秒开始请求，与 Hero 尾段短暂并行；它们分别约 18 KiB 和 34 KiB。桌面第二张屏下图实际到 Hero 完成后才开始网络请求。它们不是本次 5 秒前空白的主因，但修复主链后应重新检查移动端是否需要更保守的屏下预取距离。

### 4.2 文本、字体和脚本

代表性桌面冷访 73 个资源中：脚本 49 个、脚本传输约 312 kB；CSS initiator 9 个、约 307 kB；另有 5 个 preload/link 资源约 93 kB。入口还全局导入 `adminLuxury.css`、`adminDashboard.css`、`adminCompatibility.css`，并在两帧后加载两个 Noto Serif SC CSS chunk。字体文件从约 4.32 秒开始大量请求，和 PageDocument/Hero 关键阶段重叠。

静态文本资源已压缩且使用长缓存；浏览器看到的是直连 IP 的 nginx 响应，没有 `Age`、`Via` 或 `X-Cache` 等中间缓存命中证据，但仅凭这些响应头不能证明完整网络拓扑。问题更像分包轮次、依赖发现顺序和大量小请求的往返累积，不是单个超大入口包或明显 JavaScript 长任务。

## 5. 根因排序与证据链

### P0-1 已证实：首屏关键资源发现链过长

- 用户现象：冷访约 4 秒才出现加载文字，约 6 秒才看到 Hero。
- 实测：PageDocument 到 `4.35s` 才发起，之前已有 66 个资源开始；Hero 到 `5.28s` 才发起，实际 body 只需约 20 ms 下载。
- 代码/配置：`client/src/main.tsx:21-23` 全局载入后台 CSS，`:45-48` 两帧后载入中文字体；`PublicLayout` 到运行期才建立 PageDocument；公网版本的 Home 又懒加载 Puck renderer。
- 机制：HTML 没有主图/已发布内容提示；多轮脚本分包和字体网络往返完成后，才运行页面文档 hook，再等接口，再加载/执行渲染器，再发现图片。
- 影响：所有依赖 PageDocument 的公开页冷访；纯品牌页最明显。
- 修复方向：建立公共入口的首屏关键路径，优先启动当前语言 PageDocument；将后台 CSS、非关键字体字重、Ant Design 和非首屏模板能力从公共首屏移出或延后；压平 PublicLayout → PageDocument → renderer 的嵌套动态加载轮次。不要直接迁移框架或用更长 Loading 遮掩。
- 复验：同矩阵三次冷访，确认 PageDocument 和 Hero 请求显著提前；同时核对 bundle、字体回退、页面内容和管理后台未回归。

### P0-2 已证实：`/products` 占位与最终页面几何不匹配

- 用户现象：先看到短页/页脚，随后整页内容把布局推走。
- 实测：桌面 CLS `0.242`、移动 `0.419`；两次最大 shift 的 source 都是 `footer.site-footer`。
- 代码：`client/src/page-builder/runtime/PublishedPageDecoration.tsx:251-268` 对 replaceChildren 页面使用 `minHeight: 60vh` 加载占位；最终 `/products` 内容包含多个视口高度区块。
- 机制：初始占位不足，页脚进入首屏；已发布页面装入后页脚从视口消失，形成大幅布局位移。
- 影响：`replaceChildren` 的纯品牌页，具体页面需逐一抽查。
- 修复方向：占位至少稳定覆盖首个最终视口和页头/页脚关系，并让 loading 与最终 Hero 几何一致；不要隐藏正文或延长动画。
- 复验：桌面/移动截图序列和 LayoutShift source，目标 CLS `≤0.1`，页脚在加载与最终态之间不得穿过视口。

### P1-1 已证实：公共图片禁止浏览器缓存

- 用户现象：回访仍产生图片网络等待和流量。
- 实测：Hero 在每次 warm 导航仍完整传输；响应头为 `Cache-Control: public, no-store`。
- 代码：`server/src/modules/upload/public-uploads.gateway.ts:50`。
- 机制：`no-store` 明确禁止浏览器保存，即使 URL 和内容未变也不能命中缓存。
- 影响：所有 `/uploads/` 公共媒体；不应外推到受控/个人媒体。
- 修复方向：只对审核后的公共非个人媒体使用内容哈希或不可变版本号，再配置长缓存/immutable；原始素材继续保留，响应式 WebP/AVIF 派生按视口输出，不以降低珠宝细节换速度。
- 复验：冷访质量和尺寸不变；warm ResourceTiming 的该 URL `transferSize=0` 或确认 304/内存缓存，发布新版本又能立即得到新 URL。

### P1-2 已证实：首次订阅和备用语言造成重复读取

- 用户现象：首屏稳定前仍有多余请求和 DOM 更新。
- 实测：首页每次两次中文 PageDocument、两次英文 PageDocument；目录商品列表两次。
- 代码：`usePublishedPageDocument.ts:131-154, 228-243` 在初始 GET 期间收到 SSE `ready` 后标记 pending，并在 finally 补拉；`usePagePublishStream.ts:130-132` 把 `ready` 当刷新信号；`PublicLayout.tsx:374` 在中文文档后再读取英文文档；商品通用 SSE hook 对服务端 `ready` message 直接触发 revision。
- 机制：为封闭“初始快照与订阅之间空窗”的正确性策略，无条件多做一次 GET；备用语言又重复同样流程。商品 SSE 的 ready 被误当成数据变化。
- 影响：页面文档和目录数据首访；每次请求约 0.54–0.90 秒时放大明显。
- 修复方向：以 revision/建立订阅时刻做条件补拉；只有真正发布/变更事件才刷新；非当前语言在实际切换或必要 SEO 场景再取。保留断线恢复正确性测试。
- 复验：首屏冷访每个当前语言文档只一次；模拟“GET 与发布同时发生”、SSE 重连、切换语言，确认不会显示旧内容。

### P1-3 已证实：匿名目录被登录恢复串行阻塞

- 用户现象：进入公开目录后长时间停在“正在确认账户状态”。
- 实测：`/api/customers/me` 401 后，拦截器串行调用 `/api/customers/session/refresh` 再 401；Outlet 在两步完成前不渲染。
- 代码：`PublicLayout.tsx:441, 495-512, 901-903`；`httpClient.ts:241-247`。
- 机制：公开目录把客户身份当作首屏硬前置，匿名访客支付了两次失败往返。
- 影响：`/catalog` 和公开作品详情；已登录恢复路径也需要保留。
- 修复方向：公开内容先渲染，身份恢复并行；仅在确有会话迹象或进入会员能力时刷新。不要缓存、泄露或降级个人数据边界。
- 复验：匿名、有效登录、过期会话三种浏览器状态；匿名目录不再被 401 链阻塞，登录会员仍得到正确可见性。

### P1-4 已证实延迟层，高度怀疑为公网路径/代理等待；精确位置未验证

- 实测：浏览器持久 HTTP/2 连接上的静态块和小 API 普遍约 0.54–0.90 秒才收到响应；新 TLS 连接本身约 0.85 秒。HTML/5 KiB PageDocument/21–56 KiB 图片均有相似等待，说明不是单纯大文件吞吐。
- 云端证据：24 小时 CPU 平均 `2.76%`、最大 `23.32%`；内存平均 `45.38%`、最大 `51.57%`；公网出带宽最大 `13.21 Mbps`，低于 30 Mbps 峰值配置；数据库 ready 探针约 `0.56 ms`。没有持续资源饱和证据。
- 局限：已有云终端会话已断开，且没有只读容器日志/云内 curl 对照；所以不能区分公网 RTT、nginx/容器转发、应用调度或瞬时网络抖动，也不能用“现在 CPU 低”排除瞬时异常。
- 下一步：先做同一时刻、同一小静态文件/API 的“公网 vs 云主机本机”低频对照，并读取目标请求的服务端 access timing；若云内几十毫秒而公网仍约 0.5 秒，再评估域名、边缘缓存/CDN或对象存储。CDN不能修复 5 秒后才发现 Hero 的应用依赖链。

### P2 已证实：页头补丁发布方式存在版本混用风险，但不是本次直接根因

- 单一静态引用、首绘前完成，已排除它作为当前 4–6 秒状态切换的直接触发器。
- 无哈希文件名配一年缓存、且与主构建不同时间更新，会让不同访客长期拿到不同补丁版本。
- 应纳入构建或改为内容哈希资源，并让发布 manifest/健康接口能追踪；不建议直接删除。

## 6. 最小修复顺序

### 第 1 组：代码关键路径（最高优先，无云费用）

1. 让公共入口尽早启动当前语言 PageDocument；压平首屏所需 renderer 的动态依赖轮次。
2. 从公共首屏移走后台 CSS、非关键字体字重、非首屏 Ant Design/编辑器能力；保持必要品牌字体回退，避免字体闪换变成新问题。
3. 同时修正 `/products` loading 几何，让其稳定占住最终首个视口。

风险是首包可能变大、字体/样式加载顺序变化或 Puck preview 回归。应做小步提交、对比构建资产和真实页面；回滚为撤销对应代码提交。当前分支已有“renderer 改为 eager”的未验证变化，不能绕过失败的质量门禁直接发布。

### 第 2 组：去重和匿名目录解阻塞（代码，无云费用）

1. 对 PageDocument SSE ready、商品 SSE ready 和备用语言读取做条件去重。
2. 公开目录先渲染公开事实，客户身份恢复改为并行且仅在必要时 refresh。

风险是错过并发发布或破坏登录恢复；必须加入“读取期间发布”、断线重连、匿名/登录/过期会话测试。回滚为恢复原 hook/拦截策略。

### 第 3 组：公共媒体缓存（后端/部署配置，无需改原图）

保持当前响应式 WebP 和源素材不变，为公共媒体建立内容不可变 URL，再开启长期公共缓存。受控商品图、个人图、签名地址仍按私有策略，绝不能统一公共缓存。

风险是错误缓存旧图或越权媒体；前置条件是 URL 版本化和公开资格判定。回滚可先恢复 `no-store`，再清理新缓存规则，不覆盖原始素材。

### 第 4 组：发布可追溯性（部署配置，无云费用）

将页头补丁纳入内容哈希构建，部署注入 release identity，并让部署后健康检查核对 SHA/镜像摘要。它主要解决版本混用和诊断可信度，不会单独把 6 秒首屏变成 2 秒。

### 第 5 组：公网链路/基础设施（条件方案，可能有费用）

只有云内/公网对照确认公网链路是主要剩余瓶颈后，再比较：正式域名和证书、CDN/边缘缓存、公共媒体对象存储、地域或带宽调整。它们能减少静态资源 RTT 和回访源站压力，不能替代前端提前发现 PageDocument/Hero，也不能缓存个人接口。费用、备案/域名、缓存失效和安全边界需单独决策；本轮未购买或启用。

## 7. 修复后验收方案

1. 使用同一入口、同一 Chromium 版本、`1920×1200 DPR1` 与 `390×844 DPR2`，冷访独立 context、回访保留同一 context，各至少 3 次；报告中位数和范围。
2. 同时记录 HTML、PageDocument、Hero 的请求开始/响应/解码、FCP/LCP/CLS、long task 和截图序列；不能只看 Lighthouse 总分。
3. 目标：首页冷访 LCP `≤2.5s`、CLS `≤0.1`；`/products` 页脚不再进入后被推出视口；Hero 自定义清晰时间与 LCP 分开报告。
4. 浏览器 warm 复验公共 Hero 缓存命中；发布一张新版本图片后又必须得到新 URL。比较桌面 1672×941、移动 800×450 的清晰度、宝石/金属细节、裁切和色彩，不以低清替换换成绩。
5. 核对后台当前发布的 `home v45` 与公网 DOM、Hero、CTA 一致；测试中文/英文发布切换、读取期间发布和 SSE 重连。
6. 匿名、已登录、过期会话分别测试 `/catalog`；公开内容不被登录恢复阻塞，会员可见性和私有媒体不泄露。
7. 站内导航测试菜单、首页→目录、目录→真实详情。详情需先有经过审核且公开可见的测试作品；本轮因零公开作品无法完成。
8. 可在正常网络通过后增加一档明确记录参数的移动弱网对照，例如 RTT 150 ms、下行 1.6 Mbps、上行 750 Kbps、CPU 4× slowdown；它只用于回归对照，不代表全部用户。
9. 真正的 INP 验收应在合规的真实用户监测上线后，分别看移动/桌面第 75 百分位 `≤200ms`。本轮少量受控点击不能冒充真实 INP。
10. 验收不得靠隐藏正文、长时间全屏 Loading、延长动画、低清图或只展示 warm 成绩。

## 8. 当前完成状态

已完成：

- 正常 TLS、入口、最终 URL、HTTP 协议、响应头和正式构建核查；
- 公网静态指纹、当前工作树/当前 dist、发布 manifest 和 GitHub Actions 记录比对；
- 首页 PageDocument 发布版本核查；
- 首页桌面/移动冷访与回访各 3 次，另做主图解码可见时间各 3 次；
- 首页截图序列、资源瀑布、LCP 元素、CLS、长任务、图片 currentSrc/像素/格式/缓存核查；
- `/catalog` 直接访问、首页站内导航、匿名鉴权链和重复商品请求核查；
- `/products` 桌面/移动布局位移 source 核查；
- 云控制台实例地域、规格、24 小时 CPU/内存/带宽/TCP 只读监控核查。

未验证或缺失：

- 公网容器的精确 Git SHA 和镜像 digest：运行时 release identity 未注入；
- 云主机本机/容器到同一资源的低频 curl 和目标请求 access timing：现有云终端已断开；
- 磁盘 I/O 和请求级容器日志；
- 真实作品详情：公开目录无作品链接；
- 真实用户 INP 和移动/桌面 p75；
- 用户本人当前电脑、运营商和地理网络的体验；
- 弱网模拟：正常网络已足以稳定复现主问题，本轮未额外放大故障。

本轮完成的是“诊断和证据闭环”，不是“公网已修复”。没有修改或部署任何业务内容与云端状态。

## 9. 证据索引

- [脱敏汇总 JSON](../../.codex-tmp/public-first-visit-performance-20260915/public-performance-summary.json)
- [代表性桌面冷访瀑布 CSV](../../.codex-tmp/public-first-visit-performance-20260915/representative-desktop-cold-waterfall.csv)
- [首页 12 组原始浏览器测量](../../.codex-tmp/public-first-visit-performance-20260915/public-browser-runs.json)
- [主图解码可见时间 12 组测量](../../.codex-tmp/public-first-visit-performance-20260915/hero-render-runs.json)
- [目录和站内导航探测](../../.codex-tmp/public-first-visit-performance-20260915/public-route-navigation-probes.json)
- [`/products` 布局位移探测](../../.codex-tmp/public-first-visit-performance-20260915/public-products-route-probes.json)
- [公网、版本与云监控脱敏观察](../../.codex-tmp/public-first-visit-performance-20260915/environment-observations.json)
- [桌面 4 秒加载态截图](../../.codex-tmp/public-first-visit-performance-20260915/desktop-1920x1200-cold-browser-cache-run1-4000ms.png)
- [桌面 6 秒最终 Hero 截图](../../.codex-tmp/public-first-visit-performance-20260915/desktop-1920x1200-cold-browser-cache-run1-6000ms.png)
- [移动 4 秒加载态截图](../../.codex-tmp/public-first-visit-performance-20260915/mobile-390x844-cold-browser-cache-run1-4000ms.png)
- [移动 6 秒最终 Hero 截图](../../.codex-tmp/public-first-visit-performance-20260915/mobile-390x844-cold-browser-cache-run1-6000ms.png)

说明：原始浏览器 JSON 保留了诊断所需的资源 URL 和状态，但不包含 Cookie、Token、响应正文、完整 HAR、客户数据或内部地址。报告不依赖被污染的跨轮 response listener 计数；资源数量和耗时均取每次导航自己的 ResourceTiming state。
