# 海川珠宝 V1 内容与生产当前证据（2026-08-27）

> **归档于 2026-09-08：** 标题中的“当前”只对应 2026-08-27 当时证据；现行状态与阻断只查 `docs/CURRENT_STATE.md` 和 `docs/AI_PROGRAM_LEDGER.md`。
>
> **2026-08-31 校正：本文件是历史只读快照，不是可重放的当前操作手册。** 其中在长驻 `jewelry-server` 容器运行 `release-preflight` 的命令只记录当时证据；当前入口要求独立只读 runner、显式环境身份、预期数据库、审批引用和仅作用于目标数据库的最小权限，必须按 `docs/DEPLOYMENT.md` 执行，不得复用下方历史命令。

> 范围：中文、非交易型、咨询获客 V1。
>
> 证据边界：本报告只读核验当前本机 Docker 运行态、公开 HTTP 接口、项目配置、备份清单和候选证据；未修改当前业务数据库、页面内容、运行容器、环境变量或基础设施，未执行部署、migration、恢复或回滚。

## 1. 结论

| 层级 | 结论 | 决定性原因 |
| --- | --- | --- |
| CODE_READY | PASS（本地候选 + 隔离 MySQL） | 到期匿名化、法律 hold、默认 dry-run 有界 CLI、账户注销 PII 清理、43/43 migration 和真实 MySQL 并发/逐字段事务验证已经完成；当前/生产数据库未迁移或执行处置 |
| CONTENT_READY | BLOCKED | 公开作品为 0；四个已发布页面仍含“正在完善/整理”占位内容；catalog 失效；contact 未发布；正式联系方式和媒体权利未签认 |
| PRODUCTION_READY | BLOCKED | 当前容器不是可证明的候选构建；发布预检失败；没有正式域名/TLS、目标告警、异地加密备份、当前候选恢复和回滚实证 |
| RELEASE_READY | BLOCKED | 三个前置层级没有全部通过 |

健康探针成功只能证明当前服务和数据库此刻可响应，不能证明内容真实、候选身份一致、外部服务接线或生产可发布。

## 2. CONTENT_READY 当前事实

### 2.1 公开设置与作品

对当前本机 API `http://127.0.0.1:3002/api` 的只读公开请求结果：

- `GET /settings/public?locale=zh-CN`：站点名存在；`contactPhone`、`contactEmail`、`contactAddress`、`businessHours` 均为空。
- `GET /products/public?page=1&pageSize=100&locale=zh-CN`：`total = 0`，返回作品数为 0。
- 未读取后台私有内容、客户、订单或其他业务数据。

### 2.2 公开页面发布态

`GET /page-modules/document/published?pageKey=<key>&locale=zh-CN` 的当前结果：

| 页面 | 状态 | 版本 | 顶层块数 | 当前阻塞事实 |
| --- | --- | ---: | ---: | --- |
| home | PUBLISHED | 39 | 1 | 含“网站内容正在完善” |
| products | PUBLISHED | 1 | 1 | 含“正式作品内容正在整理中” |
| catalog | INVALID | 9 | 0 | `publication-revalidation-required`，不满足当前发布合同 |
| about | PUBLISHED | 4 | 1 | 含“品牌与工作室资料正在核验整理中” |
| custom | PUBLISHED | 1 | 1 | 含“定制内容正在完善” |
| contact | 未发布 | — | 0 | 没有公开发布文档 |

这些页面虽有部分 `PUBLISHED` 标记，但内容仍是短页占位状态，不能据此判定正式内容完成。

### 2.3 当前运行态发布预检

在当前 `jewelry-server` 容器中执行只读命令：

```text
RELEASE_PROFILE=lead-generation node dist/cli/release-preflight.js
```

结果为退出码 1，`technicalReady = false`。其中：

- 通过：存在启用中的超级管理员；无已知占位管理员身份；无已知 Demo 商品；站点设置记录已持久化。
- 失败：缺 `contactPhone`、`contactEmail`、`contactAddress`、`businessHours`。
- 失败：catalog 最新发布 revision 未通过当前合同签认。
- 失败：contact 缺少已发布 revision。
- 仍需人工签认：公开联系与营业信息、品牌与法务文案、公开媒体商用权利和最终视觉。

### 2.4 关闭 CONTENT_READY 所需输入

1. 在 `V1_CONTENT_PRODUCTION_INPUT_CHECKLIST.md` 中签认经营主体、公开联系方式、营业信息、隐私联系人和客服责任人。
2. 提供并签认首页、关于、作品/选款、定制、联系和隐私正式文案，移除所有占位语义。
3. 录入真实公开作品；每项事实、分类、图片、视频、字体和图标均有可追溯权利记录。
4. 通过现有后台发布并重新运行发布预检。
5. 用正式内容完成 1440×900 与 390×844 浏览器视觉、响应式、交互、可访问性和失败路径验收。

内容录入会写当前业务数据库；必须由用户明确指定目标实例和输入内容后另行执行。本报告没有授权虚构内容或代替责任人签认事实。

## 3. PRODUCTION_READY 当前事实

### 3.1 运行容器与候选身份

当前本机 `jewelry-server`、`jewelry-client`、`jewelry-mysql` 和 `jewelry-uptime-kuma` 正在运行且健康；`jewelry-backup` 正在运行但未配置容器健康检查。

当前 server/client 容器缺少以下 OCI 候选标签：

- `org.opencontainers.image.revision`
- `org.opencontainers.image.source`
- `com.haichuan.component`
- `com.haichuan.migration-bundle-sha256`

镜像虽可解析到本机仓库 digest，但没有候选 revision、组件和 migration bundle 身份，无法证明它们对应当前脏工作树候选。`artifacts/candidate-evidence/current.json` 同样给出：

- `releaseEligible = false`
- `runtime.candidateIdentityVerified = false`

因此，当前容器行为只能作为“现有本机运行态”证据，不能替代当前候选或目标生产环境验证。

### 3.2 HTTP、TLS 与安全头

- 客户端当前仅通过本机 HTTP 80 端口访问，未发现本机 443/TLS 终结证据。
- HTTP 200 响应包含 CSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy` 和 `Permissions-Policy`。
- 当前 HTTP 响应没有 HSTS；在没有正式 HTTPS 的情况下不能把 HSTS 判为已完成。
- CSP 已包含 `frame-ancestors 'self'`，因此没有单独 `X-Frame-Options` 不构成本报告的独立 P0。
- `GET /api/ready` 返回 200、`status=ready`、`database=ok`；该响应不包含构建 revision 或 migration bundle 身份。

正式域名、DNS、TLS 证书链、HTTPS 跳转、HSTS、生效后的 CSP 和公网探针仍需在唯一目标环境验证。

### 3.3 数据与媒体持久化

当前 compose/容器具备以下本机持久化基础：

- MySQL 使用命名卷。
- server 的 `/app/uploads` 与 `/app/private-media` 使用独立命名卷。
- backup 以只读方式挂载数据库导出所需连接和两个媒体卷，并将产物写到本机备份目录。

这能证明本机设计存在持久化边界，但不能证明目标生产服务器、磁盘容量、权限、加密、异地复制、故障切换或灾难恢复。

### 3.4 备份与恢复

当前最新核验批次：`20260826_124443`。

- 数据库归档：256,123 bytes，SHA-256 与清单匹配。
- uploads 归档：180,126,598 bytes，SHA-256 与清单匹配。
- private-media 归档：17,256,530 bytes，SHA-256 与清单匹配。
- 最新日志显示数据库和两个媒体归档完成、清单发布并复验成功。
- 同一日志也显示更早存在 MySQL 连接失败；最新 uploads 归档期间 tar 报“file changed as we read it”，脚本在归档可读取且校验通过后发布该批次。

项目现有 `server/scripts/restore.sh` 包含清单控制、安全文件名、哈希/压缩/路径校验、空目标保护、显式确认、数据库 migration 表检查和媒体树哈希。该脚本的存在和静态审查不等于恢复已经成功。

仍未完成：

- 没有对当前 42-migration 候选执行这组备份的隔离恢复演练。
- 没有恢复后的行数、媒体抽样、权限、耗时和 RPO/RTO 证据。
- 备份保留在同一主机、明文且本地保留 7 天；没有异地加密副本证据。
- 数据库与媒体不是跨资源原子快照；恢复验收必须包含业务一致性抽样。

### 3.5 监控、错误与外部服务

- Uptime Kuma 本机界面可通过 `http://127.0.0.1:3001/` 返回 200，容器健康。
- 未通过本轮证据确认正式 monitor、通知渠道、外部探测点或告警演练；“工具可访问”不等于“告警闭环完成”。
- 未验证目标环境错误聚合、日志脱敏检索、通知失败升级或客服值班接收链。
- 未验证真实 SMTP 配置、发送、退信、超时和未知投递结果处置。
- lead-generation 档位默认关闭交易、支付、退款和主动通知；这不证明生产环境实际值，仍需发布清单和运行态检查。

## 4. 关闭 PRODUCTION_READY 的最小顺序

1. 用户指定唯一目标环境、正式域名、DNS/TLS 责任人、维护窗口和回滚负责人。
2. 冻结获批代码范围并生成不可变 server/client 镜像；镜像携带 commit、component 和 migration bundle 标签，以 digest 部署。
3. 提交单独的 migration/部署批准包；在目标环境执行只读预检、备份和受控迁移，不直接沿用当前本机容器作为生产证明。
4. 验证 MySQL/媒体持久化、容量、权限和重启后数据；完成异地加密备份。
5. 以当前候选在隔离目标执行真实恢复和回滚演练，记录耗时、抽样和一致性结果。
6. 配置域名/TLS、安全头、公网健康探针、错误聚合、通知失败告警和接收人，并执行一次受控告警演练。
7. 连接真实 SMTP 后验证成功、确定失败、未知投递和人工安全重投边界。
8. 生成与目标实际运行 digest 一致的 release manifest，重新判断 `PRODUCTION_READY`。

上述步骤包含 Git 冻结、镜像发布、环境配置、migration、部署、外部发送或生产数据操作时，均需按项目规则逐项获得明确批准。

## 5. 当前专业判断

方向没有偏：先收口非交易型咨询获客，而不是恢复交易，是当前事实条件下风险最低且最可验收的 V1 路径。

真正的不足不在“再写一些页面组件”，而在三条闭环尚未相交：

1. **事实闭环**：正式主体、联系方式、作品和媒体权利尚未进入系统并签认。
2. **隐私正式生效闭环**：代码已实现，但保留期限、法定例外、权利请求与备份到期规则仍需正式责任人签认，目标 migration 和生产首次处置仍需另行批准。
3. **运行闭环**：当前容器与当前候选身份不一致，目标生产环境、恢复、告警和回滚尚无实证。

在这三条闭环完成前，不应投入交易、支付、库存或大规模视觉扩展，也不应把本机健康容器包装成正式上线证据。
