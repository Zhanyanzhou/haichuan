# 海川珠宝 全产品深度审计报告（2026-08-20）

> [!CAUTION]
> **历史审计快照，不是当前修复清单或验收结论。** 下文“必须先修”、批次、命令、路由和运行事实只属于 2026-08-20；配套 `CODEX_INSTRUCTIONS.md` 已失效。当前任务必须重新检查工作树，以现行规则、当前状态和新鲜验证为准，不得据此直接修改、迁移、提交、部署或宣称通过。
>
> 审计性质：只读调查 + 本地容器栈实测 + 在途批次静态核查。审计过程未修改任何项目文件、Git 状态、数据库或配置。
> 配套文件：`CODEX_INSTRUCTIONS.md`（给 Codex 的修复执行指令）。
> 证据截图：本目录 `01/02/06/07/08*.png`。
> 审计方法：3 个只读审计子代理（前台旅程 / 管理后台 / 横向质量）+ 主会话浏览器实测与接口探测，结论已交叉合并。

---

# 0. 审计边界

- **检查日期**：2026-08-20；分支 `codex/release-curation-20260814`；最新提交 `273acfd`。
- **工作区**：45 个已跟踪修改文件 + 2 个未跟踪临时脚本（`client/scripts/tmp-verify-business.mjs`、`tmp-verify-publish.mjs`），+338/-331 行。全部视为他人在途资产，仅审查。
- **关键环境事实**：
  - 宿主机后端 :3000 审计时未运行；dev 前台 :5173 不可用 → **在途批次未在任何可运行环境中部署**。
  - Docker 完整栈在线（:80 client、:3002 server、MySQL、backup、uptime-kuma 均 healthy），但容器镜像是**已提交代码**构建的 → **浏览器实测反映已提交状态，不含在途 45 文件**。在途批次结论全部来自静态代码证据 + 静态验证链。
  - 无后台账号（admin 密码不在仓库）、无客户账号 → 后台浏览器实测、客户登录态实测为**验证缺口**，未绕过认证、未伪造截图。
- **实际运行的验证**（全部 exit 0）：`npm run typecheck`（含 contracts:check + server/client tsc）、`test:content-templates`、`test:page-builder-publish`、`test:selection-inquiry`、`test:trade`。注意：其中两个发布校验脚本的断言**已在在途批次中被改写以迁就新行为**（见 §6），"测试通过"≠"行为符合原决策"。
- **实测接口探测**（游客身份，:80）：
  - `GET /api/settings/flags` → `commerceEnabled:false, cartEnabled:false, paymentEnabled:false`（交易全关）。
  - `POST /api/orders` → 401；`POST /api/customers/checkout` → 503（CustomerCommerceGuard 拦截，无绕过）。
  - `GET /api/products/public/21|24|31` → 200（垃圾测试商品对游客公开）；`/99999`、`/1`、`/2`、`/3` → 404（无存在性预言机）。
  - `GET /api/products/public/24/media/13`、`/31/media/14` → **404**（商品主图媒体文件缺失）。
  - `/cart`、`/checkout` 直连 → **重定向到 /contact**（交易关闭降级安全）。
- **未验证项**：后台 10 角色实操（无凭据）；客户注册/登录/客户中心真实流程（需写库）；真实下单/支付/退款（交易关+无联调环境）；生产环境（不可达）；键盘/屏幕阅读器/200% 缩放（需专项工具）；临时脚本实际运行（需凭据）。
- **环境区分**：全部实测为本地容器栈（开发等效）；无任何生产证据；`VITE_USE_MOCK` 未启用。

---

# 1. 产品健康总览

| 域 | 状态 | 一句话依据 |
|---|---|---|
| 客户前台 | ⚠️ 有风险 | 品牌体验在线，但公开目录展示垃圾测试商品+破图；IA 三套命名；首页无页脚 |
| 客户账户 | ⚠️ 有风险 | 流程完整（注册/登录/回跳/注销/导出），但 load 失败即清 token 误踢、服务端零输入校验 |
| 选款咨询 | 🟡 基本健康 | 服务端快照复核扎实；无幂等、游客可灌单 |
| 购物与结算 | 🔒 未上线（安全关闭） | 交易全关，Guard/重定向实测有效；无绕过路径 |
| 管理后台 | ⚠️ 有风险 | 超管可自锁、客服无法分配咨询、金价 AUTO 误导 |
| 商品管理 | ⛔ 阻断（在途） | 默认改为 PUBLISHED+PUBLIC 且 create 无 canPublish 门禁 |
| 页面装修 | ⚠️ 有风险 | 编辑器健壮；发布校验放宽 + 视频比例违反 D.13 + 合同外新能力 |
| 客户与咨询管理 | ⚠️ 有风险 | leads 无状态机；客服分配 403 静默失效 |
| 订单和交易 | 🟡 基本健康（未上线） | 状态机/凭证审核/库存单轨齐全；真实资金闭环未验证 |
| 权限与安全 | 🟡 基本健康 | @Public/IDOR/上传/错误脱敏良好；超管自保缺失、RolesGuard fail-open |
| 响应式和无障碍 | ⚠️ 有风险 | 390px 无溢出实测通过；无 skip link、内容图 alt 空、键盘实测缺口 |
| 性能 | 🟡 基本健康 | 懒加载/srcset/分包齐全；公开列表 pageSize 2000、选品器 200 无虚拟化 |
| SEO 与上线准备 | ⛔ 阻断 | sitemap 空、robots 未声明、无 404 页、无 canonical、SPA 无 SSR、联系方式全空 |

---

# 2. 用户旅程报告（实测部分）

## 2.1 未登录游客（:80 实测）

| 步骤 | 目标 | 实际结果 | 状态 | 证据 |
|---|---|---|---|---|
| 01 | 首屏理解品牌 | 桌面 hero 品牌摄影+"HAICHUAN"，排版克制，符合高级珠宝定位；导航仅 4 项（选款/预约/我的账号） | 健康（IA 偏薄） | 01-home-desktop.png |
| 01b | 移动端首屏 | 390px 无横向溢出；hero 图完整加载，但**淡入期间首屏呈空白米色约 2-3 秒** | 有风险 P3 | 06/08-home-mobile390 |
| 01c | 页脚信息 | **首页（Puck 渲染）无页脚**；/catalog 等标准页有页脚，但"联系方式待完善" | 有风险 P2 | 01/02 截图 + DOM 实测 |
| 02 | 目录浏览 | /catalog 展示 3 件商品，2 件**主图 404**、商品名为"高富帅啊发烧发撒…""10414141"等**测试垃圾数据**，全部对游客公开 | ⛔ 阻断级观感 | 02-catalog-guest.png + 接口探测 |
| 03 | 商品详情 | /products/24 游客可访问，"仅展示，暂不售卖/咨询此款"降级正确；参数区垃圾数据；面包屑"首页/臻品/…" | 有风险 | 接口 + 页面文本实测 |
| 04 | 不存在商品 | /products/99999 → 404，统一"暂不可浏览"文案，不泄露存在性 | 健康 | 接口实测 |
| 05 | 搜索 | /search 有热词/推荐；搜"zzzz不存在"→ 0 结果空态完整（清除筛选+咨询客服+推荐） | 健康 | 页面实测 |
| 06 | 受限页 | /customer 未登录 → 品牌化登录引导页（非粗暴 401） | 健康 | 页面实测 |
| 07 | 交易入口 | flags 全 false；/cart、/checkout 直连 → 重定向 /contact；API 下单 401/503 | 健康 | 接口 + 路由实测 |
| 08 | 联系/预约 | /contact 表单完整（label 关联、隐私同意文案）；"公开联系方式正在完善"诚实降级，但**全站无任何真实联系方式** | 有风险 P2 | 页面实测 |
| 09 | IA 一致性 | 三个入口三套命名：导航"选款"→/catalog（选款中心）、页脚"珠宝作品"→/products、详情面包屑"臻品"；/catalog 与 /products 为两个并行列表页，筛选器不同 | 有风险 P2 | 页面实测 |

## 2.2 其余角色

- **已登录客户 / 合作商**：可见性矩阵代码证据充分（游客 PUBLIC；会员 +MEMBER；合作商 +PARTNER；SUSPENDED 降级），媒体接口同样内嵌过滤。实测缺口：无客户账号。
- **内容运营/商品编辑/客服/仓库/财务/管理员/超管**：见 §3；浏览器实测缺凭据，为本审计最大验证缺口。

---

# 3. 已确认问题

> 文件行号为审计时当前工作区。

## P1 高风险

### P1-01 新建商品默认"出售中+游客公开"，且创建路径无发布门禁（在途批次）
- **角色/流程**：商品编辑人员 / 创建商品；任何直接调 API 的调用方。
- **证据**：`server/src/modules/products/products.service.ts:149-150`（`status??"PUBLISHED"`、`visibility??"PUBLIC"`，原 DRAFT/MEMBER）；`client/src/pages/admin/ProductEditor/index.tsx:540-541,1038`（表单初始值同步）；`products.service.ts:921-1005` **create() 全程不调 canPublish**（canPublish :1007-1030 定义、:1080-1094 仅用于 PUT）。
- **实际/预期**：实际——省略 status 的创建请求立即公开上架可 0 价、无图、无价态 SKU 的商品，游客目录立即可见。预期——新建默认草稿；上架必须过"价>0+有图+有价态 SKU"门禁。
- **旁证**：公开目录已躺 3 件垃圾测试商品（§2.1 步骤 02）。
- **影响**：品牌信任、运营误操作不可逆面广（公开即被索引/截图）。**未经决策合并上线即升级为 P0"未完成商品意外公开"。**
- **最小修复**：① 默认值方向按决策单 D-1 拍板；② create() 接入与 update 相同的 canPublish 门禁（status 解析为 PUBLISHED 时强制校验）——**门禁部分不依赖决策，可先行**。
- **验收**：API 省略 status 创建 → 按拍板默认；直传 status=PUBLISHED 但无图 → 422；typecheck + test:trade 全绿。

### P1-02 视频桌面比例合同违反已批准决策 D.13（在途批次）
- **角色/流程**：内容运营 / 视频模块编辑；品牌一致性。
- **证据**：`contracts/page-builder/content-templates.contract.json`（video coverImage `allowedRatioPresetsByViewport.desktop`：`["16 / 9","21 / 6"]` → `["16 / 9","21 / 9","4 / 3"]`）；`client/src/page-builder/designSystem/tokens.ts:30-38`（RATIOS 唯一合法 5 档，注释明示"21:9 已于 2026-08-16 清退""不要新增"）；DECISIONS D.13（16:9/21:6 为已批准）。
- **实际/预期**：实际——合同、生成物、Inspector、Renderer、校验脚本已全链路切到 21:9/4:3，21:6 降级为旧数据兼容。预期——未经负责人重新批准不得变更已批比例调色板。
- **影响**：设计治理失守（合同是 A.9 单一事实源）；旧 21:6 已发布页面视觉无回归（渲染层兼容，正确）；新做页面将与已批决策分叉。
- **最小修复**：按决策单 D-3 执行：回退 或 正式修 D.13（同步 tokens.ts、两个 verify 脚本、UI_GUIDE）。

### P1-03 超管可禁用/降权自己或最后一个超管 → 后台永久锁死
- **证据**：`server/src/modules/users/users.service.ts:104-160`（update 只拦"非超管改超管"；delete :155-160 直接 DISABLED，零自保校验）。
- **影响**：唯一超管误操作 → 无恢复入口（除直改数据库）。
- **最小修复**：服务端拦截：禁止 DISABLED/降权自己；禁止使最后一个 ACTIVE 超管失效；前端确认文案。
- **验收**：自禁/删最后超管 → 422 明确文案。

### P1-04 客服角色（CUSTOMER_SERVICE）无法分配咨询——403 被静默吞掉
- **证据**：`client/src/pages/admin/LeadManage/index.tsx:181-192` loadStaff 调 `GET /users`（需 SUPER_ADMIN/ADMIN，`users.controller.ts:17`），客服 403 被 catch 静默置空 → 分配下拉为空。
- **影响**：咨询分配对最需要的角色失效——核心工作流断裂。
- **最小修复**：提供客服可读的轻量员工列表端点（仅 id+姓名+角色，@Roles 含 CUSTOMER_SERVICE），LeadManage 改用它。
- **验收**：客服登录咨询管理，分配下拉可见可分；重抓包确认无 403。

### P1-05 客户认证与客户资料接口服务端零校验
- **证据**：`server/src/modules/customers/customers.controller.ts:40,47,55,62,79`（register/login/forgot/reset 内联类型无 class-validator DTO）；`:93 updateProfile(@Body() body: any)`。
- **影响**：手机号格式、密码强度服务端不校验，脏数据直入库；与选款咨询 DTO 的严谨口径断裂。
- **最小修复**：客户域全部写接口补 DTO（手机号正则、密码策略、字段白名单）。
- **验收**：非法手机号/弱密码 → 400。

### P1-06 SEO/上线门禁缺口
- **证据**：`client/public/sitemap.xml`（空 urlset）；`robots.txt`（未声明 Sitemap）；`client/src/App.tsx:557`（`path="*"` 软重定向首页，无 404 页）；`index.html` 无 canonical；实测页脚"联系方式待完善"。
- **影响**：正式上线阻断项。
- **最小修复**：域名确定后回填 sitemap/robots/canonical/og:image；实现真 404 页；联系方式配置化并强制非空才上线。

### P1-07 金价 AUTO 空壳但后台显示"自动"，误导运营
- **证据**：`server/src/modules/gold-price/gold-price.service.ts:121-126`（未配 GOLD_PRICE_API_URL 时 cron 只 warn 返回）；`client/src/pages/admin/GoldPrice/index.tsx:54,67`（"自动"标签无未配置提示）。DECISIONS D.10 为🟡待决策。
- **影响**：运营以为金价自动更新，实际停滞 → 金重计价商品长期错价（金额风险）。
- **最小修复**：页面检测未配置时显示"自动抓取未配置，当前需手动维护"横幅；D.10 拍板另行。

## P2 中风险

| 编号 | 问题 | 证据 | 影响 | 最小修复 |
|---|---|---|---|---|
| P2-01 | 发布"待完善"角标口径 ⊂ 后端发布门禁，会"全绿但发布失败" | `LayerRail.tsx:93-106` vs `page-modules.service.ts` 发布校验（另有文案长度/链接合法性/视频必填/商品上架态）；定位靠正则解析后端错误文本 `HomepageConfig/index.tsx:3575-3592` | 运营反复试错；错误格式一变定位即失效 | 后端校验输出结构化 blockId 清单，角标消费同一结构化结果 |
| P2-02 | 发布失败反馈弱化：仅一次性短 toast，多错误无持久清单 | `HomepageConfig/index.tsx:3572-3601`（Modal.error 错误列表已删除） | 多错误场景改完第一处后迷失；读屏感知弱 | 图层栏角标升级为可点击错误清单面板；toast 加 role=alert |
| P2-03 | videoWidth/bgColor 为合同外新能力（违反 A.9 单一合同） | 合同 JSON 无 `videoWidth`；`video.puck.tsx:21-22,48-49`、`video.ts` schema、`VideoBlock.tsx`、`puckPropsToModule.ts:477-483` 已接线 | 合同治理开口 | 能力入合同声明或撤下（随 D-3 批次） |
| P2-04 | 页面发布校验放宽 visibility（在途） | `page-modules.service.ts:828-851`；`verify-page-builder-contract.mjs` 断言改写（internal: allowed true） | 渲染链路已验证安全（puckData 仅存数字 ID，按访客身份运行时拉取）；残留：受限商品数字 ID 明文可见 | 按决策单 D-2 收尾 |
| P2-05 | 商品编辑器无 useBlocker，SPA 内跳转直丢未保存内容 | `ProductEditor/index.tsx:313-318`（仅 beforeunload）；装修器有 UnsavedChangesGuard | 编辑内容一点菜单全丢 | 复用 UnsavedChangesGuard 模式接 useBlocker |
| P2-06 | leads 无状态机，任意字符串状态可写 | `leads.service.ts:198-229`（LEAD_STATUSES :4-10 虚设） | 咨询数据写脏 | updateLead 校验状态枚举+合法流转 |
| P2-07 | 选款咨询无幂等；游客手机号即身份可脚本化灌单 | `selection-inquiry.service.ts` create 无去重；仅 5/min 限流 | 重复单、客服骚扰 | 幂等键（联系方式+商品集+时间窗去重） |
| P2-08 | 客户中心任一接口失败即清 token 误踢 | `CustomerCenter/index.tsx:73-75` | 网络抖动=被登出 | 仅 401 清会话，5xx 给重试 |
| P2-09 | 首页 Fallback 硬编码伪商品（productFocus/ProductMoment 始终静态） | `Home/index.tsx:54-73,1024-1052` | 无发布文档时展示"假商品" | 按决策单 D-6 |
| P2-10 | IA 三套命名并行（/catalog、/products、臻品） | 实测两列表页并存，筛选器不同 | 游客迷失、SEO 重复内容 | 按决策单 D-8 |
| P2-11 | 首页无页脚（Puck 渲染页不挂标准页脚） | 实测首页 DOM 无 `footer` | 无联系/隐私入口、合规无处放 | 布局层统一挂载页脚 |
| P2-12 | 公开商品媒体 404（数据-文件分裂残留） | `/api/products/public/24/media/13`、`/31/media/14` → 404 | 破图商品公开可见 | 媒体完整性扫描+缺图商品下架提醒（运维） |
| P2-13 | 无障碍：无 skip link；内容性图片 alt 空；catalog 页无 h1 | 全库无 skip link；`About/index.tsx:120,124,183` alt=""；实测 /catalog h1=null | 键盘/读屏用户受损 | 补 skip link、alt、h1 |
| P2-14 | SEO：无 canonical；动态 meta 仅 title；SPA 无 SSR | `PublicLayout.tsx:180` 只改 title | 收录与分享预览弱 |  helmet 类方案或预渲染（随上线批次） |
| P2-15 | analytics track 公开端点可灌垃圾事件 | `analytics.controller.ts:18` 仅 60/min | 分析数据可污染 | 采样/签名校验或收紧 |
| P2-16 | 公开列表 pageSize 2000 全量拉取；推荐候选集无 take 上限 | `useProductData.ts:131`；`recommendations.service.ts:35,83,123,161` | 商品量增长后劣化 | 分页化 + 候选集上限 |
| P2-17 | pino 请求日志脱敏未确证 | 未见 redact 配置 | token/body 可能落日志 | 配 pino redact 并实测 |

## P3 低风险（简列）

- P3-01 puckData 公开泄露受限商品数字 ID（随 P2-04 决策）。
- P3-02 INTERNAL 可见性前台任何身份都取不到——语义需确认是否有意。
- P3-03 ValidationPipe 缺 `forbidNonWhitelisted`（`main.ts:56-62`）。
- P3-04 图片上传仅信声明 mime，未嗅探 magic bytes（`upload.controller.ts:36`）。
- P3-05 商品选择器空关键词一次拉 200 无虚拟化（在途改为此行为，`ProductIdsField.tsx:76`）；后台多处硬编码 pageSize 200。
- P3-06 Dashboard `pendingReview` 实为 DRAFT 商品数，命名误导（`statistics.service.ts:76`）。
- P3-07 settings `paymentMethods`/`logisticsCompanies` 死键无消费方（`settings.service.ts:20-21`）。
- P3-08 RolesGuard fail-open：无 @Roles 的已登录端点默认放行（`roles.guard.ts:22`）。
- P3-09 库存后台直设数量无确认/无原因记录（`Inventory/index.tsx:90-97,238-261`）。
- P3-10 商品图片排序两次 PUT 非原子（`ProductEditor/index.tsx:731-747`）。
- P3-11 后台残余 `body:any`（products.controller.ts:269,305；gold-price query:any）。
- P3-12 移动端 hero 淡入期首屏空白 2-3 秒。
- P3-13 `collectPlaceholderErrors` 前端复刻后端占位校验，双源漂移风险（`LayerRail.tsx:33-65`）。
- P3-14 填充老商品时无 visibility 数据回填 "MEMBER"，与新默认口径不一。

---

# 4. 待验证风险（不与已确认混淆）

| 编号 | 已有证据 | 缺什么 | 最小验证步骤 | 通过/失败含义 |
|---|---|---|---|---|
| V-01 | create() 无 canPublish（代码确证） | 运行态确认 | 凭 staff token `POST /api/products` 省略 status | 200+公开=P0 坐实；被拒=另有拦截 |
| V-02 | 发布放宽后"优雅降级"链路 | 浏览器端真实表现 | 造引用 MEMBER 商品的页面发布，游客抓 `/page-modules/document/published` + 渲染 | 仅 ID=符合声明；带出名称/价/图=P0 泄露 |
| V-03 | 客服分配 403（代码确证） | 客服账号实操 | 客服登录打开咨询管理 | 下拉空=P1-04 坐实 |
| V-04 | 超管自锁（代码确证） | 实操无自救路径 | 测试超管自降权 | 锁死=P1-03 坐实 |
| V-05 | 客户中心误踢（代码确证） | 过期 token/抖动实操 | 客户登录后断网刷新 | 被踢=P2-08 坐实 |
| V-06 | 在途批次编辑器改动运行时表现 | 可运行环境（在途未部署） | 起宿主机后端 + 5173 dev，跑 tmp 脚本同款流程 | 验证无运行时回归 |
| V-07 | 键盘/读屏/200% 缩放 | 专项工具 | 键盘走查发布流 + NVDA 抽样 | 确认 P2-02 无障碍面 |
| V-08 | 真实交易闭环 | 交易开关+测试数据+联调环境 | 按 D.2 清单逐项 | 未验证前不得宣称交易可用 |

---

# 5. 合理设计与健康项（修复时不得破坏）

1. **商品可见性矩阵**：游客/会员/合作商 where 过滤、详情统一 404 无存在性预言机、字段白名单 `CUSTOMER_FACING_LIST_SELECT`、媒体接口内嵌产品过滤（`products.service.ts:343-380,607-618,737-774`）。
2. **Puck 公开渲染商品链路**：puckData 只存 ID，运行时按访客身份走 public/catalog 双通道，401 自动降级游客（`PuckDocumentRenderer.tsx:281-445`、`api.ts:254-331`）——发布放宽的安全性正建立于此，改此链路必须重审 P2-04。
3. **交易关闭降级**：Guard 503 + flag 安全默认 + /cart /checkout 路由重定向（实测）。
4. **选款咨询服务端校验**：登录客户身份以令牌为准、逐商品可见性复核、服务端快照覆盖客户端快照（`selection-inquiry.service.ts:55-127`）。
5. **IDOR 防护**：订单/凭证/评价全部带 customerId 归属条件；凭证路径正则绑定客户（`orders.service.ts:494-513,971-987`）。
6. **上传双白名单**：视频扩展名+mime 双校验；凭证读取 no-store+nosniff。
7. **编辑器保存体系**：显式保存+保存队列串行+乐观锁 409+beforeunload+useBlocker+真丢弃接口。
8. **服务端发布事务**：行锁+乐观锁+二次校验+版本留存 50 份+隐藏模块跳过（`page-modules.service.ts:248-332,486`）。
9. **错误脱敏**：生产环境 Prisma 错误通用文案、堆栈只进日志（`http-exception.filter.ts:54-88`）。
10. **性能基建**：懒加载+`<source media srcset>`+`?width=` 服务端缩放+视频 preload=metadata+rolldown 分包+搜索防抖+SSE 合并。
11. **隐私工程**：隐私政策页+表单强制同意+数据导出+注销。
12. **体验细节**：搜索空态、/customer 登录引导、/contact 诚实降级。
13. **后台交互色去金改墨棕**（在途）：金 #B8944E 白底对比 2.84:1 不达标，改 #6F5733 有 UI_GUIDE §484 依据——**但它同时改了前台区块硬编码色**（HeroSection/DoublePosterSection 角标、PuckDocumentRenderer 缺图态描边），属决策边界外溢，合并说明中须注明。

---

# 6. 决策冲突与文档漂移

## 6.1 代码违反现行决策
- **在途合同违反 D.13**：视频桌面比例 16:9/21:6 → 16:9/21:9/4:3；21:9 曾明文清退，4:3 不在 5 档调色板。校验脚本断言被同步改写迁就——**测试为行为让路，非行为为决策让路**。
- **videoWidth/bgColor 未入合同** 即上线编辑器能力（违反 A.9 单一合同）。
- **发布校验放宽** 未经 D 级决策记录（仅代码注释），`verify-page-builder-contract.mjs` 商品可见性用例被改写。

## 6.2 文档过期
- `.github/prompts/developer.prompt.md` 在途修正（NestJS 11、双域认证、模块数）——方向正确。
- DECISIONS D.13 需按决策单 D-3 结果修订或确认回退。

## 6.3 无决策依据的当前行为
- 新建商品默认 PUBLISHED+PUBLIC（在途）。
- /catalog 与 /products 双列表页并存。
- 首页无页脚（设计意图还是遗漏无记录）。

## 6.4 只需同步状态文档
- CURRENT_STATE 与审计记忆在批次合并后刷新。

---

# 7. 负责人决策单（截至报告完成未拍板）

| 编号 | 事项 | 推荐 | 备选 |
|---|---|---|---|
| D-1 | 新建商品默认状态 | 恢复 DRAFT+MEMBER + create 补门禁 | 保留新默认+补门禁 |
| D-2 | 非公开商品能否被公开页面引用 | 接受放宽+补决策记录 | 恢复 PUBLIC 门禁 |
| D-3 | 视频桌面比例 | 修 D.13：只收 21:9，不收 4:3 | 回退 16:9/21:6 |
| D-4 | 交易功能开放范围 | 维持全关，按 D.2 清单验收后再谈 | — |
| D-5 | 临时 QA 脚本 | 转正 scripts/qa/ | 删除 |
| D-6 | 首页 FallbackHome 终局 | 纯品牌叙事+真实推荐商品，删硬编码伪商品 | 保留+示例角标 |
| D-7 | 未决台账（D.4/D.5/D.6/D.9/D.10） | D.10 随批次 3 拍板；D.6 提级；余维持挂起 | — |
| D-8 | IA 归一 /catalog vs /products | 保留 /catalog，/products 301，统一"选款中心" | 双轨分工 |

---

# 8. 最终结论

1. **能否安全继续开发**：可以，但必须先完成在途批次分流——其中含 2 个未经批准的方向性变更（商品默认公开、视频比例）和 1 个未记录的发布门禁放宽。
2. **在途批次能否合并**：**不能整体合并**。编辑器健壮性部分基本可收；商品默认值（P1-01）与视频比例（P1-02）须回退或经 D-1/D-3 拍板；发布放宽（P2-04）安全性已验证可接受但需补决策记录（D-2）。
3. **必须先修**：P1-01 create 门禁、P1-03 超管自保、P1-04 客服分配、P1-07 金价误导；公开目录垃圾商品与破图（运维清理，需负责人确认）。
4. **需要负责人决策**：D-1~D-8，其中 D-1/D-2/D-3 是在途批次合并的前置条件。
5. **只是改进项**：P2 大部分与全部 P3。
6. **Codex 最小起步批次**：批次 1（create 门禁+超管自保+客服分配+客户 DTO），不依赖任何未决决策。执行细则见 `CODEX_INSTRUCTIONS.md`。
