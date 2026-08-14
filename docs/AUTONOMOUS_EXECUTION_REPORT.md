# 自主完善执行报告

> 本报告只记录当前代码事实、已完成批次、验证结果与阻塞项。
> 不复制旧文档未经验证的结论。
> 最后更新：2026-08-13

## 当前目标

把项目完善为可正式对外使用的「珠宝品牌展示 + 公开作品浏览 + 会员选款 + 私人顾问咨询」网站，当前阶段不开放完整线上电商。按工单 P0-C → P0-D → P0-E → P1-* → P2-* 顺序持续推进。

## 老板确定的业务决定

- 公开访客无需登录即可浏览 PUBLIC 商品；会员登录只用于选款/咨询记录/个人资料。
- 购物车、结算、支付、付款凭证继续关闭；`/cart`、`/checkout` 引导至顾问咨询。
- SiteSettings 是联系信息唯一真实来源；空值隐藏，不得使用假电话/假邮箱/假地址兜底。
- 正式域名未确认前不输出 canonical / sitemap / JSON-LD 固定域名。
- 行为分析默认关闭，不创建 `_asid`，不发送 `/analytics/track`，保留接口安全 no-op。
- 公开商品必须同时满足 `status=PUBLISHED` + `visibility=PUBLIC` + `deletedAt IS NULL`。

## 当前运行环境

- 平台：Windows 11 Pro for Workstations；项目目录 `G:\网站搭建2`。
- 本会话工具约束：无 Shell 工具，只能静态验证（读取/搜索/编辑）。命令类验证（build / lint / typecheck / playwright / git）需用户在本机执行。
- Docker 3000 端口服务为旧版本，尚未重新部署。

## 已完成批次

### 批次 P0-C：公开信息真实性与隐私

**目标**：移除全站假联系信息与假域名，新增真实隐私说明，关闭行为分析，补齐三态。

**修改文件（10 个生产 + 1 个测试）**：

| 文件 | 改动 |
| --- | --- |
| [client/index.html](client/index.html) | 删除 JSON-LD 中未确认域名 `haichuanjewelry.com` 与假电话 `400-888-8888`；删除不存在的 og-image/twitter:image；JSON-LD 只保留 name + description |
| [client/public/robots.txt](client/public/robots.txt) | 移除未确认域名 Sitemap 行 |
| [client/public/sitemap.xml](client/public/sitemap.xml) | 改为合法空结构（域名确认后补回） |
| [client/src/services/api.ts](client/src/services/api.ts) L1025-1038 | mock `getPublicSettings` 联系字段改为空 |
| [client/src/services/mockData.ts](client/src/services/mockData.ts) L164 | 联系块 mock 假电话/邮箱/地址改为空 |
| [client/src/hooks/useAnalytics.ts](client/src/hooks/useAnalytics.ts) | 全量改造为安全 no-op：不创建 `_asid`、不发送 `/analytics/track`，保留所有导出签名（`ANALYTICS_ENABLED=false`） |
| [client/src/pages/public/Contact/index.tsx](client/src/pages/public/Contact/index.tsx) | 移除 4 个假兜底；`useSiteSettings` 加 loading/loaded/error 三态；CONTACT_INFO 空值过滤；隐私链接从 `href="#"` 改为 `<Link to="/privacy">` |
| [client/src/pages/public/Privacy/index.tsx](client/src/pages/public/Privacy/index.tsx) | **新增** 隐私说明页（7 章节 + SiteSettings 联系区块，空联系信息引导 /contact） |
| [client/src/App.tsx](client/src/App.tsx) L27,98 | 新增 Privacy 懒加载 + `/privacy` 路由 |
| [client/src/components/layout/PublicLayout.tsx](client/src/components/layout/PublicLayout.tsx) L361-374 | 页脚「联系」列与版权行各加一条「隐私说明」链接 |
| [client/src/styles/globals.css](client/src/styles/globals.css) L2608-2616 | 新增 `.site-footer__copyright-link` 样式 |
| [client/src/pages/admin/SiteContent/index.tsx](client/src/pages/admin/SiteContent/index.tsx) L54 | 邮箱占位符 `contact@haichuan.com` → `name@example.com` |
| [client/tests/privacy-trust.spec.ts](client/tests/privacy-trust.spec.ts) | **新增** P0-C 回归测试（空/失败/真实设置三态 + 隐私页 + 隐私链接 + 分析关闭 + 响应式 + 键盘） |

**附带清除的假值（后端种子/配置）**：

| 文件 | 改动 |
| --- | --- |
| [server/prisma/seed.ts](server/prisma/seed.ts) L140-145 | 3 个仓库种子地址（水贝/番禺/国贸）改为空，保留仓库结构名 |
| [server/settings.json](server/settings.json) L10 | `contactAddress` 龙岗区具体地址改为空 |

**静态验证结果**：

- 全仓搜索 `400-888-8888` / `contact@haichuan.com` / `haichuanjewelry.com` / `水贝` 等假值：仅测试文件 `privacy-trust.spec.ts` 保留断言引用（FORBIDDEN_FAKE_VALUES 数组），生产代码 0 处。
- `useAnalytics.ts` 模块级不再写 localStorage、不再 fetch；`ANALYTICS_ENABLED=false` 为唯一开关。
- Contact 页 `useSiteSettings` 返回 `{settings, status}`，三态正确解构；旧 `role="status"` 唯一性保持（loading 用 `aria-live="polite"` 避免与 commerce banner 冲突）。
- Privacy 页匿名可读，无登录墙；联系信息空时引导 `/contact`。
- 后端 `/settings/public` 默认值为空（`settings.service.ts` DEFAULT_SETTINGS），是真实来源，无需改动。

### 批次 P0-D：公开浏览与交易冻结回归（静态核对）

**结论**：P0-A/B 未被破坏，无需修复。

| 验证项 | 代码事实 |
| --- | --- |
| `/cart`、`/checkout` 引导咨询 | [App.tsx:90-91](client/src/App.tsx#L90) `Navigate to="/contact?reason=commerce-unavailable"` |
| 商品详情无「加入购物车」渲染 | [featureFlags.ts:9](client/src/store/featureFlags.ts#L9) `CUSTOMER_COMMERCE_ENABLED=false` → `isCommerceAllowed()` 恒 false → [ProductDetail:289](client/src/pages/public/ProductDetail/index.tsx#L289) 走 else 分支显示咨询 CTA（代码保留符合安全冻结） |
| 客户中心无付款凭证入口 | [MyAccountDashboard:75](client/src/pages/public/CustomerCenter/MyAccountDashboard.tsx#L75) `commerceEnabled=false` → 显示「线上付款暂未开放·顾问将联系您」；Modal `{commerceEnabled && ...}` 不渲染 |
| 后端交易写接口 503 | `CustomerCommerceGuard` 应用于 [cart.controller:15](server/src/modules/cart/cart.controller.ts#L15) / [customers.controller:27,84](server/src/modules/customers/customers.controller.ts#L27) / [upload.controller:60](server/src/modules/upload/upload.controller.ts#L60)，抛 `ServiceUnavailableException("线上购物与支付暂未开放…")` |
| 公开路由匿名可达 | `/products`、`/products/:id`、`/catalog`、`/search` 在 PublicLayout 下无登录墙（既有实现） |

## 构建结果

- 本会话无 Shell 工具，build/lint/typecheck 需用户本机执行（见「部署前检查清单」）。
- IDE 静态诊断：Contact 页仅剩既有 warning（label 关联、array index key、button type），无新增 error。

## 自动化测试结果

- 本会话无 Shell 工具，Playwright 需用户本机执行（见「部署前检查清单」）。
- 已新增 `privacy-trust.spec.ts` 覆盖 P0-C 全部验收点，待运行确认。

## 真实接口只读验证结果

- 本批次未发起真实接口请求（无 Shell 工具）。
- 后端代码静态核对：`/settings/public` 返回字段白名单正确，默认值为空；`CustomerCommerceGuard` 503 边界正确。

## 未验证项

- 客户端 `npm run build` / `npm run lint`
- 项目根 `npm run typecheck`
- `npx playwright test --project=public-chromium`（含新增 privacy-trust.spec.ts）
- 真实接口 503 交易冻结回归（需后端运行 + `PLAYWRIGHT_API_BASE_URL`）
- 各尺寸（1440/1024/768/390）响应式与键盘操作真实视觉验收
- `/privacy` 页面真实浏览器渲染（内容、对比度、移动端布局）

## 权限阻塞

- 无 Shell 工具：命令类验证全部待用户本机执行。
- 正式域名未确认：robots/sitemap/JSON-LD 域名相关内容保持空或仅本地相对路径。
- admin 密码不在仓库：admin 端点回归需用户提供密码。
- `server/src/main.ts:40` CORS 默认 `https://haichuanjewelry.com`：属基础设施网络配置，不在本次自主授权范围，记录待老板确认正式域名后统一处理。

## 需要真实经营资料

- 真实联系电话 / 邮箱 / 地址 / 营业时间（由后台 SiteSettings 填写）。
- 正式域名（确认后才能输出 canonical / sitemap 绝对 URL / JSON-LD url）。
- 真实运营主体（隐私说明正式上线前需实际运营方或专业人员复核）。

## 部署前检查清单

- [ ] `cd client && npm run build`
- [ ] `cd client && npm run lint`
- [ ] `cd server && npm run build`
- [ ] `npm run typecheck`（项目根）
- [ ] `cd client && npx playwright test --project=public-chromium`
- [ ] 后台 SiteSettings 填入真实联系信息
- [ ] 老板确认正式域名后补 sitemap/robots/JSON-LD

## 风险清单

- 本会话无法运行 build/test，存在静态自查未覆盖的编译/类型错误风险，需用户本机回归。
- `privacy-trust.spec.ts` 中 `page.route("**/api/settings/public**")` 拦截仅真实模式生效，mock 模式已用 `test.skip(useMock, ...)` 规避。
- 隐私页内容为产品说明性质，正式上线前需运营主体/合规人员复核（页面已标注）。

## 下一执行项

全部代码层阶段（P0-C → P2-C）已完成。剩余事项均为运行时验证或真实资料/部署依赖，见「权限阻塞」「需要真实经营资料」「部署前检查清单」。

---

## P1-B/C/D + P2 补充（2026-08-13）

### P1-D 安全与数据边界复查（静态，全部通过）

| 验证项 | 结论 |
|---|---|
| 客户/管理员令牌隔离 | ✅ 全局 JwtAuthGuard 拒绝客户令牌；客户接口 @Public + CustomerAuthGuard |
| Public 装饰器无意外暴露 | ✅ 所有 @Public 客户接口均有方法级 CustomerAuthGuard / OptionalCustomerAuthGuard |
| 密码哈希泄露 | ✅ accountResponse 白名单构造；getProfile/updateProfile 显式 select 排除 passwordHash |
| 客户数据隔离 | ✅ 所有 me/* 端点用 request.customer.id 限定查询 |
| 合作商暂停降级 | ✅ resolveVisibleVisibilities 实时检查 APPROVED，旧 JWT 立即失效 |
| 上传文件类型/大小 | ✅ MIME 白名单 + 10MB 限制；视频扩展名白名单防 XSS |
| 路径穿越 | ✅ 媒体从 DB buffer 输出，integer 校验 productId/imageId |
| 限流 | ✅ inquiry/selection-inquiry/upload 均 @Throttle |
| 异常泄露堆栈 | ✅ HttpExceptionFilter 生产环境隐藏内部细节，仅服务端日志记 stack |
| 付款凭证公开 | ✅ CustomerAuthGuard + scoped + private/no-store/nosniff + commerceGuard 503 |

**无需修复。**

**后端字段白名单深度验证（products.service.ts）**：
- `CUSTOMER_FACING_LIST_SELECT`（L25-50）：显式 SELECT 只含安全字段（id/code/name/category/材质/价格/标志位/安全媒体），排除 cost/supplier/stock/salesCount/viewCount/publishedAt/internalNote。
- `CUSTOMER_FACING_DETAIL_SELECT`（L52-73）：详情额外允许 description/gemInfo/craftTechnique/skus；SKU select 排除 stock/safetyStock/inventories/skuCode。
- `toCustomerFacingProduct`（L429+）：逐字段序列化器，注释明确"禁止 storageKey、库存、统计和运营字段进入响应"。
- 查询层强制 `deletedAt: null + status: PUBLISHED + visibility: in [范围]`。
- PUBLIC_ACCESS_MATRIX §3 字段白名单在 service 层完整落地。

### P1-C SEO 与分享可信度

| 改动 | 文件 |
|---|---|
| AdminLayout 加 noindex meta（robots.txt Disallow 的补充保障） | [AdminLayout.tsx](client/src/components/layout/AdminLayout.tsx) |
| Privacy 页独立标题/描述 | [Privacy/index.tsx](client/src/pages/public/Privacy/index.tsx) |
| ProductDetail 商品名标题 | [ProductDetail/index.tsx](client/src/pages/public/ProductDetail/index.tsx) |
| Search 固定中性标题（不拼搜索词，防误导） | [Search/index.tsx](client/src/pages/public/Search/index.tsx) |
| Contact 独立标题/描述 | [Contact/index.tsx](client/src/pages/public/Contact/index.tsx) |

### P1-B 公开页面体验（静态可做部分）

| 改动 | 文件 |
|---|---|
| Contact 表单 7 个 label 关联控件（htmlFor/id） | [Contact/index.tsx](client/src/pages/public/Contact/index.tsx) |
| Contact 提交按钮补 type="button" | 同上 |

**视觉项（横向溢出/对比度/移动端菜单等）需浏览器实测，本会话无法完成。**

### P2-A 测试与 CI

- ✅ Playwright 配置已有 `trace: "on-first-retry"` + `screenshot: "only-on-failure"`。
- ✅ 测试用 `test.skip(useMock/apiBaseURL)` 优雅跳过，不依赖真实数据/生产写入。
- ✅ CI 不使用真实密钥（ci.yml + quality.yml 仅 lint/build/typecheck/contract）。
- ✅ responsive-public.spec.ts 补 `/privacy` 到 publicPages。
- 🟡 Playwright 纳入 CI：记录建议（需浏览器安装，属流水线变更，不擅自改依赖）。

### P2-B 性能与代码健康

- ✅ SecureImage 已用 `loading="lazy"`。
- ✅ Admin 模块 lazy load；分析 7 处引用全 no-op（零网络请求 = 性能增益）。
- ✅ 新增 useEffect 依赖均稳定（setPageMeta/clearPageMeta 为 store 稳定引用），无重渲染循环。
- ✅ 本地存储读取均 try-catch。
- 结论：无架构级改动需求（符合"禁止为减警告做架构重写"）。

### P2-C 文档校准

- ✅ [CURRENT_STATE.md](docs/CURRENT_STATE.md)：页面清单（加 /privacy、标 cart/checkout 重定向）、纠正过时已知问题。
- ✅ [acceptance/open-issues.md](docs/acceptance/open-issues.md)：标注各 P0/P1/P2 当前状态。
- ✅ [acceptance/feature-completion-matrix.md](docs/acceptance/feature-completion-matrix.md)：全量重写为代码事实。
- ✅ [acceptance/end-to-end-flow-matrix.md](docs/acceptance/end-to-end-flow-matrix.md)：选款链已闭环、采集链已关闭、交易链冻结。
- ✅ [MODULES.md](docs/MODULES.md)：补齐交易域模块（fulfillment/refunds/after-sales/trade-events/customers/recommendations/partner-applications）+ 交易冻结标注。

---

## 第二轮补充改进（2026-08-13 续）

### P1-B 扩展：Catalog 选款表单可访问性

- [Catalog/index.tsx](client/src/pages/public/Catalog/index.tsx)：5 个表单字段（称呼/手机号/邮箱/微信/备注）补 `htmlFor`/`id` 关联；提交按钮补 `type="button"`。
- 验证：CustomerCenter 登录/注册表单已用包裹 label（合法关联）；PartnerApplication 用 Ant Design Form。

### P1-C 扩展：公开页面 SEO 标题全覆盖

新增独立标题的页面（合计 8 个公开页均已有专属 title）：
- [About](client/src/pages/public/About/index.tsx)：「品牌故事 | 海川珠宝」
- [Custom](client/src/pages/public/Custom/index.tsx)：「珠宝定制 | 海川珠宝」
- [Catalog](client/src/pages/public/Catalog/index.tsx)：「选款中心 | 海川珠宝」
- [ProductList](client/src/pages/public/ProductList/index.tsx)：「珠宝作品 | 海川珠宝」
- （前批已完成：Privacy / ProductDetail / Search / Contact）

### P2-A 扩展：SEO 测试补充

[privacy-trust.spec.ts](client/tests/privacy-trust.spec.ts) 新增 `SEO 与索引` describe：
- 隐私页有独立标题且不含未确认域名
- 搜索页中性标题不拼搜索词
- 联系页独立标题
- 前台公开页 robots meta 不阻止索引

### Mock 数据审计结论

- 公开联系信息 mock 已清空（P0-C.4）。
- 管理端 mock 订单/用户为脱敏测试数据（masked phones `138****8888` + `xxx` 地址），属内部 UI 测试，非公开内容，可接受。

### 其他清理（2026-08-13 续）

- [storeInfo.puck.tsx](client/src/page-builder/adapters/storeInfo.puck.tsx)：门店信息区块默认 props 清空（移除"旗舰门店"声称、`400-XXX-XXXX`、`XX 市...` 占位、真实感营业时间），由运营在编辑器填入真实值。
- [catalogData.ts](client/src/data/catalogData.ts)：注释"临时产品数据"过时，更新为"分类结构定义 + 筛选常量"（产品数据由真实 API 获取）。
- [PublicLayout.tsx](client/src/components/layout/PublicLayout.tsx)：加防御性 robots meta 管理（公开页确保 `index, follow`，与 AdminLayout noindex 互补）。
- 全仓扫描确认：客户端无 `console.log`/调试代码；无 `example.com`/`placeholder.com` 假域名引用；唯一 `haichuanjewelry.com` 残留在 `server/src/main.ts` CORS 默认（基础设施，已记录）。

---

## 全批次修改文件汇总（P0-C → P2-C，含两轮改进）

**生产代码（22 文件）**：
1. [client/index.html](client/index.html)
2. [client/public/robots.txt](client/public/robots.txt)
3. [client/public/sitemap.xml](client/public/sitemap.xml)
4. [client/src/services/api.ts](client/src/services/api.ts)
5. [client/src/services/mockData.ts](client/src/services/mockData.ts)
6. [client/src/hooks/useAnalytics.ts](client/src/hooks/useAnalytics.ts)
7. [client/src/pages/public/Contact/index.tsx](client/src/pages/public/Contact/index.tsx)
8. [client/src/pages/public/Privacy/index.tsx](client/src/pages/public/Privacy/index.tsx)（新增）
9. [client/src/App.tsx](client/src/App.tsx)
10. [client/src/components/layout/PublicLayout.tsx](client/src/components/layout/PublicLayout.tsx)
11. [client/src/components/layout/AdminLayout.tsx](client/src/components/layout/AdminLayout.tsx)
12. [client/src/styles/globals.css](client/src/styles/globals.css)
13. [client/src/pages/admin/SiteContent/index.tsx](client/src/pages/admin/SiteContent/index.tsx)
14. [client/src/pages/public/Catalog/index.tsx](client/src/pages/public/Catalog/index.tsx)
15. [client/src/pages/public/ProductDetail/index.tsx](client/src/pages/public/ProductDetail/index.tsx)
16. [client/src/pages/public/Search/index.tsx](client/src/pages/public/Search/index.tsx)
17. [client/src/pages/public/About/index.tsx](client/src/pages/public/About/index.tsx)
18. [client/src/pages/public/Custom/index.tsx](client/src/pages/public/Custom/index.tsx)
19. [client/src/pages/public/ProductList/index.tsx](client/src/pages/public/ProductList/index.tsx)
20. [server/prisma/seed.ts](server/prisma/seed.ts)
21. [server/settings.json](server/settings.json)

**测试代码（2 文件）**：
- [client/tests/privacy-trust.spec.ts](client/tests/privacy-trust.spec.ts)（新增，含 SEO 与索引测试）
- [client/tests/responsive-public.spec.ts](client/tests/responsive-public.spec.ts)（补 /privacy）

**文档（6 文件）**：
- [docs/AUTONOMOUS_EXECUTION_REPORT.md](docs/AUTONOMOUS_EXECUTION_REPORT.md)（本报告）
- [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md)
- [docs/MODULES.md](docs/MODULES.md)
- [docs/acceptance/open-issues.md](docs/acceptance/open-issues.md)
- [docs/acceptance/feature-completion-matrix.md](docs/acceptance/feature-completion-matrix.md)
- [docs/acceptance/end-to-end-flow-matrix.md](docs/acceptance/end-to-end-flow-matrix.md)

---

## P1-A 补充：咨询和选款闭环代码审查（静态，2026-08-13）

**结论**：闭环基本完整，补齐 1 项 gap（Catalog 选款表单缺隐私同意）。

| 验证项 | 代码事实 |
| --- | --- |
| Contact 咨询 loading/error/success | [Contact:209-288](client/src/pages/public/Contact/index.tsx#L209) submitted 成功页 + submitError + submitting |
| Contact 防重复提交 | [Contact:717](client/src/pages/public/Contact/index.tsx#L717) `disabled={submitting}` |
| Contact 隐私同意校验 | [Contact:180](client/src/pages/public/Contact/index.tsx#L180) `if (!form.privacyConsent) e.privacyConsent = ...` |
| Catalog 选款防重复 | [Catalog:1769](client/src/pages/public/Catalog/index.tsx#L1769) `disabled={submitting}` + "提交中…" |
| Catalog 隐私同意（本次补齐） | 新增 `privacyConsent` 字段 + checkbox + `/privacy` 链接 + handleSubmit 校验 |
| 登录失效 401 处理 | [api.ts:68-75](client/src/services/api.ts#L68) 区分 customer/admin；[api.ts:226-239](client/src/services/api.ts#L226) 客户令牌失效降级游客公开接口，不阻断浏览 |
| 后端咨询校验 | [create-inquiry.dto.ts](server/src/modules/inquiries/dto/create-inquiry.dto.ts) class-validator（name/phone regex/email/message 长度） |
| 后端选款校验 | [selection-inquiry.service.ts:61-68](server/src/modules/selection-inquiry/selection-inquiry.service.ts#L61) name/phone regex/items 1-20 |
| 限流 | inquiry + selection-inquiry 提交端点均 `@Throttle` |

**本次 P1-A 修改文件**：
- [client/src/pages/public/Catalog/index.tsx](client/src/pages/public/Catalog/index.tsx) — 导入 Link；form 加 privacyConsent；handleSubmit 加校验；弹窗加 checkbox + /privacy 链接；reset 含 privacyConsent

**部署前人工验收项**：
- 真实数据库写入选款咨询（不向真实库写测试线索，部署前由人工验收）。

---

## 全批次修改文件汇总（P0-C + P1-A）

**生产代码（13 文件）**：
1. [client/index.html](client/index.html)
2. [client/public/robots.txt](client/public/robots.txt)
3. [client/public/sitemap.xml](client/public/sitemap.xml)
4. [client/src/services/api.ts](client/src/services/api.ts)
5. [client/src/services/mockData.ts](client/src/services/mockData.ts)
6. [client/src/hooks/useAnalytics.ts](client/src/hooks/useAnalytics.ts)
7. [client/src/pages/public/Contact/index.tsx](client/src/pages/public/Contact/index.tsx)
8. [client/src/pages/public/Privacy/index.tsx](client/src/pages/public/Privacy/index.tsx)（新增）
9. [client/src/App.tsx](client/src/App.tsx)
10. [client/src/components/layout/PublicLayout.tsx](client/src/components/layout/PublicLayout.tsx)
11. [client/src/styles/globals.css](client/src/styles/globals.css)
12. [client/src/pages/admin/SiteContent/index.tsx](client/src/pages/admin/SiteContent/index.tsx)
13. [client/src/pages/public/Catalog/index.tsx](client/src/pages/public/Catalog/index.tsx)
14. [server/prisma/seed.ts](server/prisma/seed.ts)
15. [server/settings.json](server/settings.json)

**测试代码（1 文件）**：
- [client/tests/privacy-trust.spec.ts](client/tests/privacy-trust.spec.ts)（新增）

**文档（1 文件）**：
- [docs/AUTONOMOUS_EXECUTION_REPORT.md](docs/AUTONOMOUS_EXECUTION_REPORT.md)（本报告）

---

## P0-E 补充：公开内容空状态（静态核对，2026-08-13）

**结论**：已有完整三态实现，无需修改。

| 验证项 | 代码事实 |
| --- | --- |
| 商品列表为空非白屏 | [ProductList:326-346](client/src/pages/public/ProductList/index.tsx#L326) `◆` + "暂无珠宝作品，敬请期待" |
| 商品列表 loading | [ProductList:292-302](client/src/pages/public/ProductList/index.tsx#L292) `<Spin size="large" />` |
| 商品列表 error | [ProductList:304-324](client/src/pages/public/ProductList/index.tsx#L304) "加载失败，请检查网络后重试" + 重新加载按钮 |
| 搜索为空反馈 | [Search:873-876](client/src/pages/public/Search/index.tsx#L873) "暂未找到符合条件的珠宝作品" |
| 选款中心为空 | [Catalog:2070](client/src/pages/public/Catalog/index.tsx#L2070) "暂无可展示的珠宝作品" + clearAll 按钮 |
| 选款/搜索 loading+error | 共用 [useProductData](client/src/hooks/useProductData.ts) 返回 `loading`/`error`；Catalog L2020/L2032、Search L485/L501 均已渲染 |
| 商品详情不存在 | [ProductDetail:88-93](client/src/pages/public/ProductDetail/index.tsx#L88) "该珠宝作品当前暂不可浏览" + 返回列表链接 |
| 首页无发布文档 | [Home:1441](client/src/pages/public/Home/index.tsx#L1441) `<FallbackHome />` 兜底 + [Home:1430](client/src/pages/public/Home/index.tsx#L1430) `HomeDocumentError` 重试 |

**观察项（不在 P0-E 范围，记录待运营决定）**：
- 首页 `FallbackHome` 含静态精选作品展示（productFocus 数组，引用真实图片文件但未关联商品库）。仅在未发布 Puck 文档时显示；上线后由运营发布真实装修内容覆盖，不构成白屏或崩溃风险。

