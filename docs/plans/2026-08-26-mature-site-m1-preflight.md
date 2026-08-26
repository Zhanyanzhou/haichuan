# 海川珠宝“成熟网站 M1”技术预检与批次 0 待签合同（非权威草案）

> 日期：2026-08-26
> 性质：只读技术预检记录；不是 `CURRENT_STATE`、`PENDING_WORK`、运行手册或发布批准。
> 结论：当前工作树的确定性合同和定向单测通过，但**批次 0 尚未签署，目标环境仍为 No-Go**。负责人/批准人字段为空、待指定或只有角色名，都不表示已经签字。
> 边界：本轮未读取 `.env` 值，未连接数据库、HTTP 服务或外部渠道，未保存/发布 PageDocument，未运行 migration、Docker、部署或生产操作，也未修改任何现有权威文档。

## 1. 状态口径

| 状态 | 本文含义 |
| --- | --- |
| **已验证** | 只对当前工作树、列明命令和列明证据成立；不能外推到真实数据库、目标环境或生产。 |
| **代码具备但未实测** | 存在实现或配置，但本轮没有真实运行时、真实入口或真实第三方证据。 |
| **需业务签认** | 必须由相应业务角色确认内容、能力范围、承诺、责任人与验收口径。 |
| **需高风险授权** | 涉及目标环境、数据库、密钥、配置、外部渠道、发布或部署，只能在精确目标和回退边界获批后执行。 |
| **阻断** | 在进入目标环境部署/放量前必须解决；静态通过不能覆盖。 |

## 2. 批次 0：部署合同待签字段

以下字段是下一次签认会议的最小输入。`当前值` 中的“未提供”不是默认值，也不是批准。

### 2.1 发布身份、范围与责任

| 待签字段 | 当前值 | 需指定负责人 / 批准人 | 必须附带的证据 | 当前状态 |
| --- | --- | --- | --- | --- |
| 唯一目标环境名称、环境 ID、访问边界 | 未提供 | 项目负责人 + 运维负责人 | 明确环境名称、主机/平台归属、允许访问方式、禁止触碰的其他环境 | **阻断** |
| 发布版本、不可变构建物、变更清单 | 未形成；当前工作树存在大量既有修改和未跟踪资产 | 技术负责人 + 发布负责人 | 可追溯版本、构建摘要、精确变更范围、回退版本 | **阻断** |
| 首次部署或升级、维护窗口、停机容忍度 | 未提供 | 业务负责人 + 运维负责人 | 时间窗、流量策略、通知对象、终止条件 | **需业务签认** |
| Go/No-Go 最终批准人 | 未提供 | 业务负责人、技术负责人、运维负责人 | 三方姓名、时间、批准范围；空白不得视作同意 | **需业务签认** |
| 数据库、内容、商品、财务/支付、法务/隐私、渠道责任人 | 均未提供 | 项目负责人 | 每个角色的姓名、替补与响应方式 | **需业务签认** |
| 首发能力范围 | 未签：品牌页、选款、咨询、客户账户、购物车、结算、支付、退款、短信、邮件、物流、分析、英文站分别待定 | 业务负责人 + 对应域负责人 | 每项明确“开放 / 关闭 / 延后”，不可用 Compose 默认值代替业务决定 | **需业务签认** |

### 2.2 域名、入口、安全与运维

| 待签字段 | 当前值 | 需指定负责人 / 批准人 | 必须附带的证据 | 当前状态 |
| --- | --- | --- | --- | --- |
| 正式 canonical Origin 与域名 | 未提供 | 品牌/业务负责人 + 运维负责人 | 唯一 HTTPS Origin、后台是否同源、canonical/sitemap/OG/回调域映射 | **阻断** |
| DNS 控制权、TTL 与切换/回退人 | 未提供 | 运维负责人 | DNS 服务商、控制账号归属、切换窗口、前后记录快照 | **阻断** |
| TLS 终止点、证书签发/续期、HSTS 计划 | 代码未实施；现行专项计划选择宿主机 Nginx，Compose 仍公开 `80:80` | 运维负责人 + 安全负责人；实施需高风险授权 | 证书链/SAN/有效期、续期 dry-run、80→443、TLS 1.2/1.3、短期 HSTS 与回退演练 | **需高风险授权** |
| 精确 CORS Origin | 变量映射存在，真实值未读 | 运维负责人 + 安全负责人 | 允许 Origin 正向预检、任意其他 Origin 负向验证、Cookie/CSRF 联测 | **需高风险授权** |
| CSP 与安全响应头例外 | Nginx 有 CSP；当前仍允许外部字体、`unsafe-inline`、宽泛 HTTPS 图片/媒体 | 前端负责人 + 安全负责人 + 内容负责人 | 正式素材/字体域清单、浏览器 CSP 报告、唯一响应头、收紧或风险接受签字 | **需业务签认** |
| Secret store、注入、轮换与审计 | 仅确认变量名映射；平台与真实值未知 | 安全负责人 + 运维负责人 | secret 来源、最小权限、轮换/吊销、日志脱敏；禁止进入 client build args、镜像和 Git | **需高风险授权** |
| 支付证书只读挂载 | 微信证书路径变量已映射，server 容器没有证书目录只读挂载 | 安全负责人 + 运维负责人；实施需生产配置授权 | 宿主证书目录、容器内固定路径、只读挂载、文件权限、轮换和缺失负向启动检查 | **阻断真实支付** |
| 首管理员安全初始化 | 当前只有完整 seed；会同时创建默认仓库和 5 条已发布样例商品 | 安全负责人 + 运维负责人 | 独立幂等管理员初始化、一次性凭据交付、首次登录轮换、重复运行和失败恢复 | **阻断** |
| 健康探针、监控、告警接收与升级链 | Compose 有 server `/api/ready` 和 client `/` 探针；监控说明已区分 `/api/health` 存活与 `/api/ready` 数据库就绪；未运行 | 运维负责人 | 真实入口 `/api/health`、`/api/ready`、前台、后台、SSE/媒体探测，告警收件人与演练 | **代码具备但未实测** |
| 媒体持久化、备份、同批次恢复点 | Compose 有数据库、公开上传、私有媒体和备份结构；仓库没有当前可执行恢复脚本，默认同宿主机明文保留 7 天且媒体归档非原子 | 数据库负责人 + 运维负责人 | 数据库与两类媒体一致备份、产物校验、隔离恢复成功、RPO/RTO、回滚点和可审查恢复步骤 | **需高风险授权** |
| 目标库 migration 状态与 runner | 未读取目标数据库；仓库文件不能证明目标库状态 | 数据库负责人 | 只读状态、待应用清单、锁时长、回填/冲突、runner 锁定版本与恢复方案 | **需高风险授权** |

### 2.3 商品、六页内容、语言与权利

| 待签字段 | 当前值 | 需指定负责人 / 批准人 | 必须附带的证据 | 当前状态 |
| --- | --- | --- | --- | --- |
| 正式商品 Q0 目标与访问方式 | 未提供；本轮没有目标库/接口权限 | 商品负责人 + 数据库/环境负责人 | 精确环境、只读授权、逐条 ID/code/name/visibility/storedStatus/assessment/issues、公开列表与媒体可读性 | **需高风险授权** |
| Q1 存量整改/下架清单 | 无 Q0，不得先定 Q1 | 商品负责人 + 业务负责人 + 数据库负责人 | 精确记录 ID、逐条动作、操作前快照、负责人、恢复方案；禁止删除和无清单批量写 | **阻断** |
| Q2 是否将质量状态纳入游客/直购资格 | 未签；当前代码明确暂不强制质量状态 | 业务负责人 + 商品负责人 + 技术负责人 | 兼容影响、旧购物车/推荐/PageDocument 引用、库存/销售模式回归和分阶段策略 | **需业务签认** |
| 六页 PageDocument 正式内容 | 只确认六个 page key 和渲染装配；真实发布快照未知 | 每页内容负责人 + 发布批准人 | `home/about/products/catalog/custom/contact` 逐页预检、发布版本、公开回读、桌面/移动验收 | **需业务签认** |
| 六页 SEO、CTA、服务承诺 | 技术门禁存在；真实值未验 | 内容负责人 + SEO/业务负责人 + 法务（涉及承诺时） | 标题、描述、OG 图、目标链接、服务范围、费用/时效/条件的事实来源 | **需业务签认** |
| 素材商用权利 | 门禁要求 URL 对应 `source` 与 `authorizationId`；真实授权凭据未验 | 内容负责人 + 品牌/法务负责人 | 每个正式 URL 的来源、授权编号、用途/地域/期限/署名限制；预览素材不得当正式素材 | **需业务签认** |
| SiteSettings 正式资料 | 电话、邮箱、地址、营业时间、地图等真实值未验 | 运营负责人 + 业务负责人 | 唯一事实源中的逐项核对、公开回读、隐私/服务时间确认 | **需业务签认** |
| 完整英文 `/en` 体验 | EN-A 已建立不可索引且不回退中文的路由、公开 API/SSE locale 轨道与服务端事实源前拒绝；PageDocumentLocalization 等候选表仍未被运行时消费，PageDocumentRevision 又缺 locale/contentHash，不能承接独立语言发布/回滚 | 产品负责人 + 内容/翻译负责人 + 法务；Schema/迁移另批 | 与中文同核心旅程、严格 locale API、同语言修订/审阅/发布、法律/交易信息、翻译审校、语言切换与 canonical/hreflang | **EN-A 已验证，EN-B 阻断** |

### 2.4 交易、退款、通知与真实渠道

| 待签字段 | 当前值 | 需指定负责人 / 批准人 | 必须附带的证据 | 当前状态 |
| --- | --- | --- | --- | --- |
| `CUSTOMER_COMMERCE_ENABLED` | Compose 默认 `false`；运行时值未读 | 业务负责人 + 财务负责人；启用需生产配置授权 | 购物车/结算/订单全链、失败/重复/库存、客服兜底和回退 | **需高风险授权** |
| `PAYMENT_GATEWAY_TRANSACTIONS_ENABLED` | Compose 默认 `false`；代码仅显式 `true` 才创建新交易 | 业务负责人 + 财务负责人 + 安全/运维负责人 | 微信/支付宝商户资质、密钥/证书、回调验签、查单/关单、金额/幂等、对账、真实小额交易 | **需高风险授权** |
| `PAYMENT_GATEWAY_REFUNDS_ENABLED` | Compose 默认 `false`；与支付创建分离 | 财务负责人 + 售后负责人 + 安全/运维负责人 | 审核、原路退款、主动查询/回调、重复通知、金额一致性、对账和人工异常边界 | **需高风险授权** |
| 微信支付优先、支付宝批次 | 项目守则给出方向，但本批没有业务放行 | 业务负责人 + 财务负责人 | 每渠道开放批次、端类型、商户能力、回调域与验收单 | **需业务签认** |
| SMTP 邮件通知 | 订单创建和每笔支付确认已形成 Notification/Delivery/Outbox 原子事实、客户本人 API 与带租约 Worker；外部开关默认 false，旧发货/取消/完成和咨询邮件尚未统一迁移 | 运营负责人 + 运维负责人；扩大交易事件需业务/财务批准 | 目标库 migration、真实 MySQL 抢占、授权收件人、发件域、SPF/DKIM/DMARC、真实送达与退信 | **本地第一批闭合，外部链未验证** |
| 阿里云短信 | Compose 变量和服务实现存在；未提供真实送达证据 | 运营负责人 + 安全/运维负责人 | 签名/模板审批、测试手机号授权、送达回执、限流、防滥用、费用与失败恢复 | **代码具备但未实测** |
| 快递 100 物流 | Compose 变量和服务实现存在；未提供真实渠道证据 | 履约负责人 + 运维负责人 | 正式账号、真实运单、承运商识别、异常/缓存/限流、降级文案 | **代码具备但未实测** |
| 通知接收人与事件矩阵 | 首批已批准：认证客户的订单创建与每笔支付确认；服务通知与营销分离；订单快照为收件事实源 | 运营负责人 + 客服/财务/履约负责人 | 注册/咨询/退款/售后/发货等后续事件的渠道、模板、接收人、重试与审计矩阵 | **首批已签，后续事件待签** |

## 3. 当前证据矩阵

| 检查项 | 当前证据 | 不能证明什么 | 状态 |
| --- | --- | --- | --- |
| 权威脚本来源 | 先读取根 `package.json` 和 `server/package.json`，仅调用已有 `verify:*`、`test:*` 或 server 既有 Node test runner | 不代表整个仓库或生产验收 | **已验证** |
| 环境合同 | `verify:environment-contract`：server runtime 50、Compose 50，client build 3，`.env.example` key 52，errors 0；另有 1 条机器可读警告，证书只读挂载为空、`readyForRealWechatPayments=false` | 只证明变量名覆盖并明确阻止误判真实微信支付就绪；不证明目标值、Secret 安全或服务可启动 | **变量合同已验证，真实支付未就绪** |
| Compose 开关与变量映射 | `DATABASE_URL/JWT_SECRET/CORS_ORIGIN` 必填；交易/退款默认 false；SMTP、短信、物流、支付变量显式映射；前端仅 3 个公开 build args | 不证明真实值、第三方账号、证书文件已挂载或 Compose 可在目标机运行 | **已验证** |
| CORS 实现 | `main.ts` 通过 `resolveCorsOrigins` 读取正式来源，不再使用代码内置正式域名回退 | 不证明生产正负向预检、Cookie 或 CSRF | **已验证** |
| CSP | `client/nginx.conf` 有 CSP、nosniff、Referrer 与 Permissions Policy | 不证明真实入口只返回一份头、无 CSP 报错或当前宽泛例外已被业务接受 | **代码具备但未实测** |
| TLS | 当前 Compose 仅 `80:80`；仓库没有已实施的 443 入口 | 不证明证书、续期、HSTS、端口收敛 | **阻断** |
| 健康探针 | server 容器探测 `/api/ready`，client 容器探测 `/`，依赖关系按健康状态启动 | 不证明真实数据库 ready、真实入口、监控和告警 | **代码具备但未实测** |
| 内容模板合同 | 24/24 active，schema v5，publication gate v2，当前 SHA-256 前缀 `5ed6616593c3`；骨架、Renderer、22 个比例和 22 个 Inspector schema 通过 | 不证明运营可视化体验、真实页面内容或商用素材 | **已验证** |
| PageDocument 确定性发布合同 | `test:page-builder-publish` 通过；页面模块 37/37 通过 | 不是真实保存、真实发布、真实数据库 revision 或公开回读 | **已验证** |
| 六页接管 | 生成合同登记 `/`、`/about`、`/products`、`/catalog`、`/custom`、`/contact`；`editorPages` 六项；`PublicLayout` 统一挂载 `PublishedPageDecoration`，纯品牌页替换 children、动态页保留固定业务区 | 不证明六页当前都有满足门禁的已发布快照 | **已验证** |
| 六页真实内容 | 本轮禁止 HTTP/数据库和页面发布，未读取发布快照 | 不证明 SEO、内容负责人、素材权利、CTA、SiteSettings 已真实完成 | **需业务签认** |
| 英文站 | `/en` 外层门禁、客户端 locale 参数、公开 API/SSE 与响应级 noindex 已形成 EN-A；英文 availability 默认关闭，PageDocumentRevision 仍缺 locale/contentHash，英文内容与同语言发布合同尚无运行时实现 | 不能通过复制路由或中文回退完成；需在目标 migration 状态明确后实施独立修订发布合同与正式内容 | **EN-A 已验证，EN-B 阻断** |
| 公开商品资格 | 商品定向测试 18/18 通过；游客/会员/合作商可见性、公开 DTO、媒体引用合同存在 | 当前查询明确只按 deleted/status/visibility，**不强制 publication quality**；不证明正式商品可公开 | **阻断** |
| 正式商品 Q0 | 未运行；缺唯一目标环境与只读授权 | 不能从本机 Mock/代码推断目标库有哪些商品、图片是否可读或质量状态是否新鲜 | **需高风险授权** |
| 支付/退款关闭门禁 | 支付/退款定向测试 16/16 通过：总开关默认拒绝新交易、服务层在本地 Payment 前拒绝、退款开关关闭保留 APPROVED、既有查询/验签回调不被误阻断 | 不证明真实支付 SDK、证书、回调公网、到账、退款或对账 | **已验证** |
| 支付/退款运行时状态 | Compose 默认 false，但本轮未读 `.env`，未启动服务 | 不得声称当前任一环境已开放或已关闭 | **代码具备但未实测** |
| 公开资产检查 | `test:public-assets` 通过，报告 `client/public` 总体积 67.7 MB | 不证明素材授权、CDN/缓存、移动网络 LCP 或生产带宽；67.7 MB 需运行时性能专项复核 | **已验证** |
| 邮件/短信/物流 | 缺配置时诚实降级/不可用；通知日志回归 2/2，可靠通知与客户范围 11/11，服务端全量 346/346；订单创建/每笔支付确认已有默认关闭的可靠 Worker 候选 | 不证明目标库、真实账号、真实收件人、真实运单、SMTP 送达/退信或后续事件统一迁移 | **通知第一批本地闭合，外部业务链未完成** |
| 生产域名/TLS/CORS/CSP/secret/探针 | 只有代码、Compose 和历史计划证据 | 不证明任何生产状态 | **阻断** |

## 4. 实际运行命令与结果

以下均在当前工作树执行；除读取和测试进程外没有产生被授权范围外的写入。

| 命令 | 结果 |
| --- | --- |
| `git status --short` | 已检查；工作树存在大量既有修改与未跟踪资产，均视为用户资产，未回退、清理、暂存或提交。 |
| 读取根 `package.json`、`server/package.json` scripts | 确认权威环境、内容、PageDocument、资产脚本和 server 的 Node test runner。 |
| `npm run verify:environment-contract` | 最新 exit 0；server runtime/Compose 50=50，client build 3，`.env.example` key 52，errors 0、warnings 1；证书只读挂载 `[]`、`readyForRealWechatPayments=false`。脚本只读取 `.env.example`，不读取 `.env`。 |
| `npm run test:content-templates` | exit 0；24/24 active，schema v5，当前摘要前缀 `5ed6616593c3`；骨架、Renderer、比例、Inspector 全通过。 |
| `npm run test:page-builder-publish` | exit 0；确定性保存/校验/发布/公开快照合同通过。它不是实际发布。 |
| `npm run test:public-assets` | exit 0；报告 `client/public` 67.7 MB。 |
| `node --test -r ts-node/register "src/modules/products/product-eligibility.spec.ts" "src/modules/products/products.public-query.spec.ts" "src/modules/products/products.media-integrity.spec.ts"`（`server/`） | 18/18 pass；均为内存假实现/静态行为。 |
| `node --test -r ts-node/register "src/modules/page-modules/page-modules.page-contract.spec.ts" "src/modules/page-modules/page-modules.hero-publication.spec.ts" "src/modules/page-modules/page-modules.craft-details-publication.spec.ts" "src/modules/page-modules/page-modules.site-settings-readiness.spec.ts" "src/modules/page-modules/page-modules.store-info-source.spec.ts" "src/modules/page-modules/page-modules.appointment-source.spec.ts"`（`server/`） | 37/37 pass；均为内存假实现，不是持久化发布。 |
| `node --test -r ts-node/register "src/common/payment-gateway/payment-gateway.refund.spec.ts" "src/modules/payments/payments.transaction-gate.spec.ts" "src/modules/payments/customer-payments.controller.spec.ts" "src/modules/refunds/refunds.online-flow.spec.ts"`（`server/`） | 16/16 pass；测试日志显示无凭据时支付宝/微信不可用，未发起外部请求。 |
| `rg ... '/en' client/src server/src`（排除 specs/generated） | 无 `/en` 前缀命中。 |

## 5. 明确跳过与证据缺口

| 跳过项 | 原因 | 获批后的最小下一步 |
| --- | --- | --- |
| `.env`、secret 值 | 绝对禁止读取/输出 | 由运维在受控环境执行“只报告存在性/来源/轮换状态、不回显值”的检查。 |
| 目标数据库、Prisma status/migration、正式商品 Q0 | 本轮没有目标环境和数据库授权；第 41 个 migration 的 locale-less PageDocument revision/published pointer 还需设计裁决 | 先签唯一目标环境；再单独批准只读 migration/Q0/孤儿 revision 证据采集。已应用则只做前向修复，未应用才评估拆分或修正；Q1/Q2 必须另批。 |
| 现有 HTTP、浏览器、Docker/Compose 运行 | 本轮明确禁止连接/启动 | 在隔离候选环境依次验证 health/ready、六页、商品、登录、交易关闭态、CORS/CSP；不得复用 Mock 结论。 |
| 真实 PageDocument 保存/预检/发布 | 属业务写入/发布，且内容签认缺失 | 六页内容、权利、SEO、CTA 和发布人逐页签认后，按精确 page key 分批执行。 |
| 真实支付/退款/SMTP/短信/物流 | 涉及凭据、费用、外部发送和生产回调 | 每个渠道单独提供 sandbox/正式目标、测试账号或收件人、费用与回退授权，再做端到端证据。 |
| TLS、DNS、生产 CORS/CSP/secret、监控 | 生产基础设施高风险操作未授权 | 先签域名、终止点、责任人、维护窗和回退；先隔离演练，后申请生产实施。 |
| 全仓 build/lint/test、Playwright | 本轮要求从权威脚本做目标性预检，不用宽泛检查替代业务证据；浏览器还会连接 HTTP | 在代码批次冻结后按风险矩阵运行，但仍不能替代真实环境验收。 |

## 6. 已识别的旧文档漂移

这些文件只作为历史证据，不应直接驱动当前发布：

1. `docs/DEPLOYMENT.md:22-25,174-184` 仍把宿主机 Nginx与 client 容器 443 写成“两条路线待拍板”；较新的 `docs/audits/2026-08-25-r0-r1-release-foundation/tls-production-entry-plan.md:19` 已裁决宿主机 Nginx 为当前唯一方向。**设计方向已裁决不等于已实施**，当前 Compose 仍是 `80:80`。
2. `docs/acceptance/open-issues.md:54` 仍写 `main.ts` 有 `haichuanjewelry.com` CORS 默认值；当前 `server/src/main.ts:33-38` 明确要求生产来源、没有内置正式域名回退。该条为已漂移历史问题。
3. `docs/acceptance/release-curation-log.md:20` 是 2026-08-14 提交快照，写 `/cart`、`/checkout` 仍重定向咨询；当前 `client/src/App.tsx:205-227` 已挂载真实 Cart/Checkout，并受 `CommerceRoute` 与客户登录保护。是否开放仍由业务和运行时开关决定。
4. `docs/acceptance/puck-published-content-audit.md:203` 链接的 23 模板标准已明确归档；当前机器合同是 24 active、schema v5，生成文件声明来源为 `contracts/page-builder/content-templates.contract.json`。不得按 23 模板历史文档验收。
5. `R0-R1-REPORT.md:44-49` 记录的是当时 47 个 server runtime 变量；加入退款与可靠通知开关后的新鲜检查为 50 个 runtime/50 个 Compose 变量。该报告自身也限定为历史工作树和临时环境证据，不能代替当前合同。
6. `docs/OPERATIONS_READINESS.md` 历史正文仍写“代码全部就绪”“恢复演练脚本 v1/v2”；当前仓库事实是没有恢复脚本、通知只有第一批本地候选且外部关闭、证书没有只读挂载，`/en` 也只有不可索引的 EN-A 安全轨道。其顶部已增加 2026-08-26 校正，历史执行结果不得外推为当前能力。

本轮已仅在 `docs/OPERATIONS_READINESS.md` 顶部增加 2026-08-26 当前校正，没有改写其历史执行正文；其他历史文件仍保持不动。后续继续采用同一原则：只补权威入口与已漂移字段提示，不把历史执行事实重写成当前证据。

## 7. 下一次批准应如何拆分

1. **业务签认（无环境操作）**：签首发能力范围、六页负责人/内容/权利、SiteSettings、正式商品 Q2 方向、EN-B 正式英文范围与负责人，以及通知后续事件/接收人/渠道语义。
2. **目标环境只读授权**：签唯一环境后，批准 migration 状态、正式商品 Q0、现有 PageDocument/站点资料清单和 secret 存在性检查；仍不得写入。
3. **隔离候选环境授权**：批准构建、Compose、恢复演练、真实 HTTP/浏览器、CORS/CSP/健康/监控和各第三方 sandbox 测试。
4. **数据/配置变更授权**：只按 Q0 和隔离验收结果批准精确 migration、商品 Q1、开关、secret、DNS/TLS 配置；每项附回退。
5. **生产发布授权**：以不可变版本和完成的证据包开 Go/No-Go；生产放量后重新验证真实入口、关键旅程、告警和回滚点。

在第 1、2 步完成前，不应把“成熟网站 M1 总计划”解释为业务已经签字，也不应把本轮技术预检解释为可部署结论。
