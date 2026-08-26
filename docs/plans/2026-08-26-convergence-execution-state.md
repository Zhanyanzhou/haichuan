# 当前代码库收敛执行状态

> 核对时间：2026-08-26。分支 `codex/release-curation-20260814`，HEAD `ea38fdc`。本文件记录当前收敛批次、B08 精确清理、一次性数据库演练和后续通知日志隐私收口；不构成后续删除、现有/目标数据库、Git、部署或生产授权。

## 当前结果

- 当前基线含 218 个受跟踪文件变化、298 个未跟踪文件、暂存区 0；按当前 Git 行尾配置计算的受跟踪 diff 为 `+17,184 / -17,478`。在 Windows 上强制关闭 `core.autocrlf` 会得到不同的行数，因此路径数和逐路径归组比行数更适合作为收敛基线。完整逐路径状态、归组与保护级别见 `convergence-path-manifest-2026-08-26.tsv`；该清单现已纳入 EN-A、可靠通知及其测试文件，516/516 个当前状态路径均有登记。历史 499 路径只作为 `client/NUL` 精确删除完成时的中间基线。
- 当前 Working Tree 仍是受保护的整体候选版本，不可只提交受跟踪文件；大量运行时消费者依赖未跟踪源码。
- 加入 EN-A 与可靠通知第一批后的新鲜统一工程门禁均退出 0：完整根测试、Server 346/346、双端 typecheck、客户端 lint、双端生产构建、24 模板合同、环境合同，以及 `/en`/客户通知浏览器合同 2/2；可靠通知与客户范围定向测试为 11/11。环境合同为 runtime/Compose 50=50、errors 0、warnings 1；唯一警告是微信支付证书只读挂载为空、`readyForRealWechatPayments=false`，用于防止把变量映射误报为渠道就绪。
- 职责拆分代表性 Playwright 使用确定性自有 API 夹具：Catalog、商品编辑、分类、客户档案与后台壳在 development mode 为 50 通过/4 按模式跳过，显式 mock mode 补跑 9/9；后台售后登记另有桌面与 390×844 两条合同 2/2。本轮再以独立端口、单 worker 新鲜复跑 Puck Hero/工艺细节完整壳 2/2 与客户售后桌面/手机 2/2，端口已释放。所有这些浏览器结果均为自有 API 夹具，不等于真实 Nest/MySQL 联调。
- 发布仍为 `No-Go`：`/en` 已有 EN-A 安全路由，但英文内容和独立发布事实尚未完成，Nginx 在此阶段强制响应级 `noindex, nofollow`；目标数据库、正式内容和素材授权、正式域名/TLS、真实商品数据、真实资金渠道、通知外部投递、备份恢复、生产容器与发布窗口均未验收。

## 原子收敛批次

| 批次 | 当前状态 | 已形成的主实现/证据 | 下一门禁 |
| --- | --- | --- | --- |
| B00 受保护基线 | 已完成 | 逐路径 TSV 标记备份、证据、删除与数据库保护；暂存区保持 0 | 后续每批开始前重算状态和哈希 |
| B01 验证权威 | 已完成 | 个人模板测试已对齐 registry 14；共享基础测试直接读取正式 migration | 不允许退回 draft 或弱化断言 |
| B02 发布基础/Schema | 基础变量合同与 EN-A 安全门禁通过；证书挂载和 EN-B 内容仍待 | Compose 已显式接入退款、通知和商户证书序列号变量；环境合同正/负向通过并明确 `readyForRealWechatPayments=false`；PageDocumentLocalization 候选结构已存在；英文 API 不能回退中文 | 指定目标数据库后只读盘点；EN-B 前裁决 locale revision/published pointer；隔离候选环境前补证书只读挂载；未批准前不迁移、不改 checksum |
| B03 权限/经济/隐私边界 | 当前本地计划项已完成 | 报价销售本人范围、优惠券 DTO/经济条款冻结/事务重验、后台售后三元关联；邮件/短信降级、拒绝与异常日志不再记录完整联系方式、主题或提供商原始错误 | 目标环境身份、连续业务数据与真实通知投递验收 |
| B04 标准零售 | 本轮目标闭合 | 订单号/报价号并发、支付取消锁顺序、送达同步、未付款返券、售后并发；临时 MySQL/Nest 真实验收 | 完整订单到售后纵向链；真实资金继续关闭并单独审批 |
| B05 公开商品/咨询 | 代码与隔离证据较完整 | `/catalog` 唯一发现筛选入口，`/products` PageDocument，详情 `/products/:id`；稳定商品引用进入咨询 | 目标环境正式商品质量与咨询后台承接验收 |
| B06 Puck registry 14 | 技术闭环已验证 | schema 5、registry 14、24 active、6 page rules；临时真实保存/发布/公开哈希一致；Hero 可见媒体鼠标命中通过 | 正式内容、素材授权、目标数据库和现有账号多人验收；现有草稿不可触碰 |
| B07 前端职责拆分 | 保留候选；代表集已过 | `httpClient + services/clients/*` 为主，`api.ts` 为兼容门面；Catalog/商品编辑/分类/客户档案/后台壳代表性浏览器合同已通过 | 纳入审查批次时保持容器与新子文件原子，不继续拆交易、上传、认证和编辑器热点 |
| B08 精确遗留裁决 | 已完成已批准范围 | 两项零消费者 API 残留已删除；两个 draft 已做字节等价备份后删除；四项既有源码删除差异已确认保留 | Puck 删除项、About/Custom 仍不在本批范围 |
| B09 权威文档 | 当前收敛中 | CURRENT_STATE、组件手册和两份验收矩阵已同步主体合同、migration 与临时真实证据；误产物删除后路径清单已重建为 499 路径基线 | `/en`、通知、目标环境和发布门禁完成后再冻结，不预写“完成” |
| B10 素材/证据分流 | 部分完成 | TSV 已区分 PageDocument 备份、审计证据、运行时/预览媒体 | 正式使用前由内容负责人逐项确认来源、授权和用途 |
| B11 R3/R4 未来能力 | 安全暂停 | 高级定制确认/转单与合作蜡模没有因 Schema 模型存在而开放 | 商业规则、权限和 migration 决策完成后另开实现批次 |
| B12 EN-A 语言安全 | 本地候选闭合 | `/en` 全路由由外层门禁拦截；客户端不请求中文事实；公开 API 与 SSE 显式携带 locale；服务端 `en` 在事实源前返回 unavailable；Nginx 初始响应强制 noindex | EN-B 正式英文内容、同语言 revision/published pointer、导航与 SEO 发布验收；开放时显式移除 Nginx 临时 noindex |
| B13 可靠通知第一批 | 本地候选闭合；外部投递关闭 | 认证客户订单创建与每笔付款确认在业务事务内写 Notification/Delivery/Outbox；Outbox 无 PII；客户 API 绑定本人；注销不会复活 CANCELLED；未知 SMTP 结果不自动重发 | 目标库 migration 状态、真实 MySQL `SKIP LOCKED`、授权测试收件人、SMTP 配置和真实投递专项；未完成前 `NOTIFICATION_DELIVERY_ENABLED=false` |

## 精确遗留裁决结果

### 1. 失败的 API 提取路径：已清理

- 已删除 `client/src/services/api/categoryClient.ts` 与 `client/src/services/api/mockResponse.ts`。执行前再次确认运行时与测试零消费者；主实现保持 `services/clients/categoryClient.ts` 与 `services/mockResponse.ts`，没有改变 API 行为。
- 前者可由当前领域客户端重建；后者的保留实现 SHA-256 仍为 `3189A166...88C3FF`。

### 2. 已存在的四个旧源码删除差异：已确认保留

- `client/src/components/common/AdminStatusTag.tsx`
- `client/src/components/common/FilterPanel.tsx`
- `client/src/pages/admin/ProductEditor/index.tsx`
- `client/src/pages/public/ProductList/index.tsx`

当前运行时均为零消费者，替代分别为 Ant Design `Tag` + 后台语义样式、`/catalog` 自有筛选、`ProfessionalProductEditor.tsx`、以及 `/products` PageDocument + `/catalog`。本轮已确认继续保留这四个删除差异；它们属于 HEAD 受跟踪文件，可从 HEAD 精确恢复。裁决没有扩大到 Puck 的 `InspectorQuickActions.tsx`、`previewGeometry.ts` 或其他文件。

### 3. migration drafts：已备份并清理

- 两个零消费者原始 draft 已从 `server/prisma/migration-drafts/` 删除；正式 migration 与 checksum 未改动。
- 字节等价副本与恢复说明存放于 `.codex-artifacts/migration-draft-backups/20260826/`。两个备份 SHA-256 分别为 `ea3db704...b3b8b` 与 `68892f9a...99d717`，均与删除前原文件一致。
- 另以第二个全新、无宿主端口、无持久卷的 MySQL 8.0 容器从空库顺序应用正式目录 41/41 个 SQL：生成 70 张表，第 41 个 migration 的 21/21 个关键表及 `page_document_revisions_document_id_fkey` 均存在；容器随后删除且剩余 0。该证据是正式 SQL 链空库演练，不写 `_prisma_migrations`，也不证明目标数据库升级兼容。

### 4. 继续保留

- Puck 删除差异 `InspectorQuickActions.tsx`、`previewGeometry.ts`：继续等待完整替代能力裁决。
- 休眠 `About` / `Custom`：不恢复平行公开路由；正式 PageDocument 内容闭合前保留，尤其保护 `Custom` 的用户差异。
- `.codex-artifacts/page-document-backups`：不可触碰的恢复资产。
- 预览图、概念图和其他媒体：未核实商用授权前不得进入正式页面。

## 证据与协作边界偏差

- Puck 任务在早期协调边界尚未明确时，曾连接 `hc-page-builder-audit-20260825:3307` 并进入一次因合成页面键无效而失败的事务；后续只读残留检查未发现页面或 revision 记录。该经过不计为已授权的持久化证据，后续真实持久化只认新建一次性数据库/账号/页面的独立验收。
- M1 预检任务曾在初始“不调用现有 HTTP”边界下请求本机现有 `/api/health` 与 `/api/ready`。没有发现业务写入证据，但 ready 路径可能读取后端依赖，因此不把该调用当作“从未触达现有环境”的证据。
- 当前主机仍有多个历史 MySQL 容器运行；本收敛任务没有连接、停止或删除它们。其存在意味着“任务已停止”不等于“历史环境已清空”；归属与保留/清理需另行精确裁决。
- 后续并行任务统一为只读验证者，当前主任务保留唯一集成写入权；其自报结果必须由主任务复核命令、产物、差异和证据边界后才能进入本表。
- Windows 下的一次 `git diff --no-index --check` 检查误生成 `client/NUL`。用户于 2026-08-26 精确批准删除后，已确认其真实内容为 45 字节测试结果 JSON（`status=passed`、空失败列表），SHA-256 为 `91d1c43004802cd49950d78eb11c8fa7d05da8ffffe219a8b13b2f561bc00903`，并只删除这一项。此前 PowerShell 将保留名读作空设备而形成的“全零文件”判断已作废；删除后工作树为 215 个受跟踪变化、284 个未跟踪文件、暂存区 0。

## 仍需外部决定或新授权

1. 指定目标数据库（开发、预发布或其他明确实例）并授权只读 `_prisma_migrations` / Schema 盘点；在此之前不连接任何现有数据库。
2. 业务和内容负责人提供并签认中/英文六页正式文案、法律/交易信息、SiteSettings、正式商品和媒体权利证据；未授权机器翻译、占位内容或概念素材不得代替。
3. 正式域名、TLS、Secret 管理、真实微信商户/退款、通知渠道、备份恢复、监控告警和部署窗口分别进入专项门禁；当前交易与退款开关保持安全关闭，支付宝继续属于第二批。
