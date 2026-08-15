# 海川珠宝 · 运营就绪度全景盘点

> 盘点日期：2026-08-15 | 方法：三路并行探索（安全纵深 15 项 / 运营必备 14 项 / 半成品与悬置决策）+ 主会话独立复核约 60 项，全部结论以代码事实为准
> 部署现状：仅本机/内网（未公网暴露）——安全缺口按"上线前必办"排期
> 交易现状：冻结中（`CUSTOMER_COMMERCE_ENABLED` 未配置=false，三层冻结：前端 flag 不渲染 / CustomerCommerceGuard 503 / 路由重定向）

---

## 0. 一句话结论

**安全基本面扎实**（deny-by-default 架构、每请求查库鉴权、CSP/上传白名单/审计脱敏等在同类项目中少见地规范），**真正的缺口集中在三类**：

1. **上线前基建**（TLS、登录锁定、依赖扫描、异地备份）——代码级，全是小工作量
2. **外部凭据接入**（SMTP/短信/快递100/支付/微信登录/OSS 六类，代码全部就绪等凭据）
3. **运营深化**（对账、库存预警、通知补全、内容模块、CDN）——解冻后按节奏补

另有**两笔账**：验证债务（8/14-15 全部改动批次从未运行验证，Runbook 待跑）与文档滞后（DECISIONS D.1/D.3、PRODUCT_DATA_CONTRACT、DEPLOYMENT.md 等落后代码 1-2 周）。

---

## 1. 总体仪表盘

| 能力域 | ✅ 已具备 | 🟡 半成品 | ❌ 缺失 |
|---|---|---|---|
| 安全纵深（防黑客） | 15 | 8 | 5 |
| 交易与资金 | 4 | 4 | 3 |
| 运营触达与增长 | 3 | 8 | 5 |
| 基建与运维 | 7 | 6 | 4 |

（计数为主观归档口径，明细见下）

---

## 2. 域一：安全纵深（防黑客）

### ✅ 已具备（质量良好）

| 能力 | 证据 |
|---|---|
| deny-by-default 认证架构 | 全局三 Guard（JwtAuthGuard 默认拒绝 + RolesGuard + ThrottlerGuard），`@Public` 约 50 处显式豁免（server/src/app.module.ts:131-135） |
| 双认证隔离 | JwtStrategy 显式拒绝客户 token（防 Customer.id/User.id 主键重叠型垂直越权，server/src/modules/auth/jwt.strategy.ts:20-34） |
| 会话实时有效性 | admin 与客户 Guard 均**每请求查库**：禁用账号立即生效（jwt.strategy.ts:26-31、customer-auth.guard.ts:25-32） |
| HTTP 安全头 | nginx 层 CSP（script-src 'self' 无 unsafe-inline）+ nosniff + Referrer-Policy + Permissions-Policy（client/nginx.conf:7-10） |
| CORS 生产强制 | 未配置/非法即拒绝启动（server/src/main.ts:87-117） |
| 输入校验 | ValidationPipe whitelist+transform（main.ts:56-62） |
| 限流矩阵 | 全局 60/min + 定制：登录/注册 5、短信 3、忘记密码 5、支付回调 120、媒体 600、客户上传 10（13 个 controller 覆盖） |
| 网络边界 | MySQL/后端不对宿主机暴露（expose 非 ports）、仅 client 80 对外、kuma 仅 127.0.0.1、密钥 `:?` 必填（docker-compose.yml） |
| 上传安全 | 图片 MIME 白名单+10MB、视频扩展名+MIME 双白名单+100MB、sharp 转码剥离恶意载荷（upload.controller.ts:31-98） |
| XSS 防线 | dangerouslySetInnerHTML 全仓零命中 + React 转义 + CSP |
| SQL 注入防线 | $queryRawUnsafe 零命中，raw 查询全走 tagged template 参数化 |
| 操作审计 | 登录用户全部写操作自动落库 + 敏感字段正则脱敏 + IP（audit-log.interceptor.ts） |
| 信息泄露控制 | 500 统一兜底无堆栈；Swagger 仅开发环境；.env 全层级 gitignore |
| 支付回调防护 | provider 白名单 + rawBody 验签 + 幂等 + 金额强校验（payments.controller.ts:44-78） |
| **授权覆盖（专项抽查）** | 14 个 controller 抽查全部有 @Roles（写操作再收紧）；水平越权零发现——customerId 一律取自 JWT 登录态（customers/orders/favorites/上传凭证抽查无一从参数取身份）；上传内容嗅探：sharp metadata 比对声明 MIME（等价 magic bytes）+ randomUUID 文件名 + 路径穿越防护 resolveWithinRoot |

### 🟡 半成品

| 项 | 缺口 | 档位 |
|---|---|---|
| 会话管理 | JWT 默认 7 天长效；**改密/重置后旧 token 不作废**（残余窗口最长 7 天）；无 refresh token / 登出吊销端点 | P2 |
| 双认证共用 secret | admin/customer 共用 JWT_SECRET（DECISIONS D.6 待决策拆分） | P3 |
| RBAC 粒度 | 粗粒度 @Roles 白名单（A.5 既定决策）；前端细粒度权限键服务端不校验（D.4 待决策）；RolesGuard 无 @Roles 时放行，依赖装饰器纪律 | P3 |
| 容器加固 | server 容器以 root 运行（无 USER 指令）；无优雅停机钩子 | P3 |
| PII 明文（存储+日志） | 手机号/邮箱/收件人电话明文入库；手机号与邮箱明文进服务端日志（sms.service.ts:63+、mailer.service.ts:60+，验证码本身未打印） | P3（日志脱敏 P2） |
| DTO 覆盖不均 | login/register/sms-code/updateProfile 用内联 body 类型（ValidationPipe 不生效，靠 service 手工校验兜底）；marketing controller 全 `b: any` | P2 |
| token 存 localStorage | 员工+客户 token 均存 localStorage（无 cookie）；CSP script-src 'self' 已挡脚本注入，但纵深上仍偏脆（httpOnly cookie 更稳，属架构级改动） | P3 |
| 审计日志范围 | 不记 User-Agent、不记客户操作/客户登录、失败响应不落审计、无防篡改链 | P3 |

### ❌ 缺失（上线前必办）

| 项 | 说明 | 档位 |
|---|---|---|
| 登录失败锁定 | 除 5/min 限流外无账号锁定/二次防线，慢速或换 IP 爆破可行 | P1 |
| TLS/HTTPS 终结 | compose 无 443（内网合理）；上线方案需拍板：宿主 Nginx+certbot vs 容器内 | **P0（公网开放日）** |
| 依赖供应链扫描 | 无 dependabot/renovate、CI 无 npm audit | P1 |
| **backups/ 未加 .gitignore** | 含数据库 dump 与付款凭证媒体，误 `git add .` 会把客户数据提交进仓库（仅 `_local_backups/` 被忽略）——**2026-08-15 盘点当场已修** | ✅ 已修 |
| 备份加密与异地化 | 备份仅 gzip 无加密；仅宿主机本地（违反 3-2-1 原则），宿主机盘坏=备份同归于尽 | P2 |
| **nginx body 限制（部署级 bug）** | client/nginx.conf 未设 client_max_body_size，默认 1m——容器部署后 >1MB 上传全部 413（开发走 Vite 代理从未暴露）——**2026-08-15 盘点当场已修（110m）** | ✅ 已修 |

---

## 3. 域二：交易与资金（解冻前主线）

### ✅ 已具备
- **交易域状态机**：订单/支付/退款/售后/报价五模块，状态机+并发+契约测试三套脚本护栏
- **库存原子性**：Inventory 单轨单一来源（orders.service.ts:201、619 明确不 fallback sku.stock）；条件 updateMany 防超卖；预留超时自动释放（10min Cron）
- **营销真实生效**：优惠券接入订单结算，试算/核销单一公式防三口径（common/marketing/coupon-calculation.ts）
- **支付网关抽象层**：支付宝当面付/微信 Native 双 provider，验签+幂等+金额强校验+localhost 拒收款（防"扫码收不到钱"坏链）

### 🟡 半成品
| 项 | 缺口 | 档位 |
|---|---|---|
| 支付联调 | 框架就绪但**从未实测**（SDK 凭记忆编写，接入商户号后须沙箱联调） | 解冻前 |
| 退款资金流 | 申请→审核→**人工网关打款**→录入完成；无网关退款 API 自动化 | P2 |
| 交易通知 | 已发货/已完成/已取消已接邮件；**订单创建与支付成功无通知** | P2 |
| 库存预警 | 无阈值告警（低库存无提醒） | P2 |

### ❌ 缺失
| 项 | 说明 | 档位 |
|---|---|---|
| 对账 | 无对账单下载/自动核对（全仓"对账"仅注释提示人工） | P2 |
| 发票/电子面单 | 无（承运商自由文本+运单号手填；等物流商/税务格式，拍板暂缓正确） | P3 |
| 真实资金验收 | 解冻验收清单（支付网关对接、回调验证、库存/价格/退款审计、真实资金测试）全部未做 | 解冻前 |

---

## 4. 域三：运营触达与增长

### ✅ 已具备
- **页面 CMS 化**：Puck 构建器 6 页可视化编辑、草稿/发布预检/版本回滚/SSE 实时推送（23 模板 Brand 过滤）
- **客服转化闭环**：咨询→指派→回复（邮件通知客户）；选款咨询/线索/报价模块齐备
- **SEO 基建**：8 前台页 meta+社交分享卡片同步；robots/sitemap 骨架就绪

### 🟡 半成品
| 项 | 缺口 | 档位 |
|---|---|---|
| SEO 完成度 | 无 SSR/预渲染（爬虫无 JS 只见壳）；详情页无 Product JSON-LD；无 canonical；sitemap 空待域名 | 域名后 P1 |
| 邮件触达 | 框架完整但 **SMTP 凭据未配**（当前全部降级为服务端日志）；邮件内链接默认 localhost | 凭据即激活 |
| 物流轨迹 | 快递100 框架+缓存就绪，凭据未配 | 凭据即激活 |
| 短信 | 阿里云框架+防轰炸三层就绪，凭据未配；仅注册验证码用途 | 凭据即激活 |
| 数据分析 | 埋点**合规暂停**（ANALYTICS_ENABLED=false 全 no-op，恢复条件=隐私授权机制）；行为分析页空数据壳；GA/百度统计无 | G-2 |
| 内容运营 | 博客/资讯模块缺失，首页"新闻中心"硬编码；About/Custom 静态代码（vs 装修叠加层双轨，COMPONENTS.md:58） | P3 |
| 营销工具 | 促销活动仅 CRUD 无结算逻辑；**MarketingManage 横幅文案"暂不参与线上结算"与服务端事实不符（文案过时）** | P1（一行） |
| 会员体系 | 免登录浏览+轻会员定位（PUBLIC_ACCESS_MATRIX 产品决策）；会员深度功能等解冻后真实数据 | P3 |

### ❌ 缺失
微信服务号/模板消息通道｜在线聊天客服｜独立 FAQ/帮助中心页｜ICP 备案号占位｜Cookie 同意横幅｜i18n（整体缺失，全中文硬编码）

---

## 5. 域四：基建与运维

### ✅ 已具备
- **备份链路**：backup 容器（DB+媒体双产物、7 天保留、磁盘水位告警）**已真实运行**（backups/ 有 8-15 两轮产物）+ 恢复演练脚本 v1/v2
- **监控基础**：uptime-kuma（127.0.0.1:3001）+ /api/health /api/ready 双探针 + 容器 healthcheck
- **日志体系**：nestjs-pino JSON 单行 + 全容器 50m×3 轮转 + 前端请求错误统一事件
- **CI**：lint/typecheck/契约测试/交易测试/build 双流水线（quality.yml 曾全绿）
- **图片优化**：sharp 动态缩放+webp82、公开/受控媒体差异化缓存头
- **部署编排**：docker-compose 五服务健康检查、迁移 32 个完整、Dockerfile 多阶段构建
- **权限产品文档**：PUBLIC_ACCESS_MATRIX 四级可见性矩阵（产品负责人确认）

### 🟡 半成品
| 项 | 缺口 | 档位 |
|---|---|---|
| 验证债务 | 8/14-15 全部改动批次（OR-1/OR-2/支付框架/营销/收藏/评价/物流/SMS/合规/清扫/模板重构 R0-R5/批次 B/C/D）**从未运行验证**——docs/VERIFICATION_RUNBOOK.md 七节待跑 | **P0（最高优先）** |
| E2E 未入 CI | 7 套 Playwright spec 不在 CI（需浏览器安装步骤） | P1 |
| 迁移执行 | 生产库 migrate status 未确认（批次 B drop_content_slots 等 deploy 状态未知） | P0 |
| CDN | 无接入（ali-oss 依赖零使用=死依赖）；nginx 无 gzip/expires；Prisma 无连接池调参 | P2/P3 |
| 性能承载 | Catalog/Search 仍 2000 全量拉取（服务端分页已具备；有意决策保联想/托盘交互，触发条件=商品超阈值或补 suggest 端点） | P3 |
| 文档滞后 | DECISIONS D.1（库存已单轨仍写双轨）/D.3（flag 已服务端化）/DEPLOYMENT.md（仍画 redis+443）/PROJECT.md/PENDING_WORK.md/CLEANUP_PLAN.md | P1 |

### ❌ 缺失
Sentry 类错误聚合｜慢查询追踪｜自动 CD（手动 git pull+compose）｜staging 环境｜灰度/回滚流程

---

## 6. OWASP Top 10 攻击面推演

| # | 攻击面 | 现有防线 | 残余风险（内网期→公网前） |
|---|---|---|---|
| A01 失效访问控制 | admin 端点/客户数据 | deny-by-default 三 Guard+每请求查库+14 controller 授权抽查全过+水平越权零发现（customerId 全部取自 JWT）+@Public 白名单模式 | 已抽查验证为低；公网前建议一轮专项渗透自查 |
| A02 加密失败 | token/PII/传输 | bcrypt 10/12 轮、reset token SHA-256 哈希+30min 一次性、fail-fast secret | TLS 缺失（公网前必补）、PII 明文（存储+日志，增强项） |
| A03 注入 | SQL/XSS | Prisma 参数化、零 unsafeRaw、零 innerHTML/eval、CSP（nginx 层 script-src 'self'）、whitelist pipe | 低；薄弱点=部分端点无 DTO（marketing `b:any` 等，service 层有手工校验兜底） |
| A04 不安全设计 | 支付/建单 | 验签+幂等+金额强校验+原子核销+预留释放 | 支付未实测（联调期验证） |
| A05 安全配置错误 | CORS/headers/调试 | 生产强制 CORS、Swagger 仅 dev、.env 管理 | 容器 root、HSTS 待 TLS |
| A06 易受攻击组件 | npm 依赖 | lockfile+npm ci | **无 audit/dependabot（P1）** |
| A07 认证失败 | 爆破/会话 | 限流矩阵、bcrypt、实时查库禁用 | **无账号锁定计数（P1）**、改密后 7 天会话窗口（P2） |
| A08 完整性失败 | CI/CD | npm ci 锁定 | 无签名/SCA（P3） |
| A09 日志监控失败 | 攻击检测 | pino JSON、操作审计、kuma、磁盘水位告警 | 无 Sentry 聚合、无登录失败告警（P2） |
| A10 SSRF | 服务端外部拉取 | 全部外部调用为固定端点（Kimi 转发/快递100/短信/支付网关），无用户可控 URL | 近零 |

**总体评价**：静态防线在中小电商项目里属第一梯队；攻击面收敛主要剩"上线前基建三件"（TLS/锁定/依赖扫描）+ 实战化（渗透自查、告警）。

---

## 7. 修复路线图

### P0 · 立即（✅ 盘点当场已完成，2026-08-15）
1. ✅ `.gitignore` 增加 `backups/`、`home-5174.png`、`home-5174.jpeg`、`client/.env.production`（防客户数据/截图/未来密钥误入库）
2. ✅ MarketingManage 横幅文案更正（"券不参与结算"→ 与服务端事实一致）
3. ✅ `package.json` test:selection-inquiry 串联 validation 脚本（已写好未接入）
4. ✅ client/nginx.conf 补 `client_max_body_size 110m`（修复容器部署后 >1MB 上传全 413 的部署级 bug）

### P0 · 本机验证还债（既有主线，不另起炉灶）
跑完 docs/VERIFICATION_RUNBOOK.md 七节：静态门禁 → `prisma migrate status`（确认批次 B 等 deploy）→ 五容器+**恢复演练** → admin/公开回归 → Playwright → 收尾 git rm 五项死资产（types/homepage.ts、根 nginx.conf、homeCampaign.ts、splitPanel.ts、content-slots/dto/save-slot.dto.ts）

### P1 · 公网开放前必办（按上线日倒排）
TLS 终结（方案拍板）｜登录失败锁定｜dependabot+npm audit 入 CI｜Playwright 入 CI｜ICP 备案号占位｜docs 滞后批刷新（DECISIONS D.1/D.3、DEPLOYMENT、PROJECT、PENDING_WORK、PRODUCT_DATA_CONTRACT、CLEANUP_PLAN）

### P2 · 交易解冻前
外部凭据接入联调（SMTP→快递100→短信→支付宝/微信，签约周期长尽早启动）｜~~**WECHAT_APP_ID 拆分**~~（✅ 2026-08-15 已完成：支付侧改读独立的 `WECHAT_PAY_APP_ID`，扫码登录保持 `WECHAT_APP_ID`）｜对账能力｜订单创建/支付成功通知补全｜库存预警｜备份异地化+加密（rsync/对象存储）｜Sentry 类错误聚合｜PII 日志脱敏｜薄弱端点补 DTO（marketing `b:any` 等）

### P3 · 运营增强（按业务节奏）
博客/资讯模块｜在线客服｜FAQ 页｜CDN+nginx gzip/expires｜连接池调参｜Catalog/Search 服务端化迁移｜容器非 root+优雅停机｜JWT 双 secret 拆分｜埋点隐私授权机制（G-2）｜图片双体系收敛（IMAGE_MIGRATION.md 五阶段方案就绪待拍板）

---

## 8. 你需要提供的（阻塞项）

**凭据类**（代码就绪，填 .env 即激活）：SMTP → 邮件通知全激活｜ALIYUN_SMS 四项 → 短信验证码｜KUAIDI100 两项 → 物流轨迹｜ALIPAY/WECHAT 支付五项+SITE_BASE_URL → 在线收款｜WECHAT 开放平台三项 → 扫码登录｜OSS → CDN（当前零接线属新增开发）

**决策类**：正式域名（解锁 sitemap/robots/canonical/og/支付回调/CORS 收口）｜TLS 方案（宿主 Nginx vs 容器）｜图片双体系迁移执行（P4 大工程）｜DECISIONS D.2/D.4/D.5/D.6/D.9/D.10 逐项拍板｜交易解冻时间点

**资料类**（PENDING_WORK B-1~B-8）：真实联系方式四项、品牌 Logo、1200×630 分享图、隐私页运营主体（法务复核）

---

## 9. 盘点结论与状态

- ✅ 三路探索全部完成（安全纵深 15 项 / 运营必备 14 项 / 半成品悬置决策），授权覆盖专项抽查已并入 §2
- ✅ P0 四项当场修复（见 §7），均一行级零业务影响；验证方式：容器重新构建后上传 >1MB 文件应成功（nginx 项）、`git status` 应不再显示 backups/ 与截图（gitignore 项）
- ⚠️ 代理报告的两处误报已裁决：①"CSP 完全缺失"——实际 client/nginx.conf:7 有完整 CSP（代理只看了 server 端 helmet 关闭，helmet CSP 对 API 响应本无必要）；②"库存双轨"——orders.service.ts:201/619 已单轨（代理引用的 PRODUCT_DATA_CONTRACT/DECISIONS D.1 为滞后文档，已列入 P1 文档刷新批）

### 验证还债进度（2026-08-15 实跑，Runbook 七节）

| 节 | 结果 |
|---|---|
| 一 静态门禁 | ✅ prisma generate/validate + server build + client build（4267 模块）+ page-builder 契约（25 区块）全绿 |
| 二 数据库迁移 | ✅ 32 迁移全部应用、无 drift（含 drop_content_slots/微信 OAuth） |
| 三 编排+备份 | ✅ 五容器 healthy；修复版 backup.sh 实测三产物齐全（旧轮次 PROCESS 权限/tar 误判两个错误均不再现）；**恢复演练通过**（表数 46=46、抽样 6 表一致、微信新列在位、临时库自清理） |
| 四 后台回归 | ✅ admin 视角全过（2026-08-15 浏览器实测）：登录落地/dashboard 统计正常（历史 400 不复现）/客户管理"回车应用"交互/设置页真实备份状态（16:51 那轮+8 产物）/AI 分类实测 503+诚实消息（GB-1 关闭）/编辑器 23/23 模板+三档预览/评价页/建单弹窗 UI 联动（完整链路受阻于无在售商品=数据态非代码）。多角色落地页矩阵无其他角色账号未测 |
| 五 前台回归 | ✅ 主体由 Playwright 真实后端模式覆盖；客户中心写流程（注册/下单类）按"不向真实库写测试数据"原则留人工验收 |
| 六 Playwright | ✅ 对容器部署形态（真实 nginx+后端+库）：59 通过/0 失败/3 跳过；另交易域三套 59 项+选款咨询两套 35 项+发布校验全过 |

### 验证途中的第三个部署级 bug（已修复，2026-08-15）

**CSP 拦截外部字体域 → 品牌字体失效 + 编辑器整页崩溃**：`client/nginx.conf` 原 CSP 未放行 `fonts.googleapis.com` 与 `rsms.me`（Puck 编辑器样式的 `@import "inter.css"`）。部署形态下品牌衬线字体全部回退系统字体，且 @import 被 CSP 拦时 Chrome 将整个样式表标记失败 → Vite preload 抛错 → `/admin/editor/home` 崩溃到兜底页（dev 模式无 CSP 故从未暴露）。修复：CSP 放行两域（样式+字体二进制），重建容器复验通过（编辑器 23/23 模板正常、console 零错误）。**遗留 P1**：品牌字体本地化——两个字体域国内均常不可达，公网上线前应下载 woff2 本地自托管并收紧 CSP 回 'self'。

至此三个"开发正常、部署坏"的暗雷全部修复：nginx body 限制、CSP 字体域、（另 backups/ gitignore 为数据安全项）。共性教训：**部署形态验证不可省**，本次 Runbook 实跑全部逮住。

- 本文档随修复进度更新；盘点结论与 docs/CURRENT_STATE.md、DECISIONS.md 冲突处均以代码为准
