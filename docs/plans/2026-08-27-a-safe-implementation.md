# A-SAFE 实施与上线门禁说明（2026-08-27）

## 结论

A1—A5 的普通源码、测试和文档候选已按批准范围实现。本批只收敛安全合同，不开启交易、合作申请写入或生产能力，也没有执行依赖、Schema/migration、数据库写入、Git 写入、第三方调用、证书操作、容器切换、部署或生产操作。

本文件描述当前工作树候选，不代表当前运行容器、目标环境或生产已经采用这些改动。

## A1：同 SHA 质量门禁与不可变发布清单

- `Release Images` 保持人工触发。
- 推送任何镜像前，独立 `quality-proof` job 必须通过 GitHub Actions API 找到 `quality.yml` 中与 `github.sha` 完全相同、事件为 `push`、状态完成且结论成功的运行。
- 发布 job 显式依赖 `quality-proof`；找不到证明时失败关闭。
- `release-manifest.json` 升级为 schemaVersion 2，记录质量门禁 workflow、run ID、run URL、head SHA、事件和结论。
- 本地静态验证只能证明工作流和校验器合同存在；真实 API 查询、远端 Quality Gate、GHCR digest、SBOM、provenance 和签名证明必须由远端运行重新取证。

## A2：仓库角色最小授权

- `WAREHOUSE` 不再拥有 `/orders` 通用列表、详情、兼容发货和签收接口权限，也不能进入前端通用订单中心。
- 仓库人员统一通过 `/fulfillments` 工作；列表只返回履约识别、状态、物流和脱敏客户联系方式。
- 履约详情只返回完成拣货/发货所需的订单号、客户、地址、商品快照和仓储备注；不查询或返回金额、支付、退款、邮箱、销售顾问和订单内部备注。
- 已送达终态默认隐藏地址并脱敏手机号。
- 服务端角色守卫是最终权限边界，前端路由隐藏只用于一致体验。

## A3：商品公开资格唯一合同

所有客户可见与可交易入口共享以下数据库查询条件：

`deletedAt IS NULL + status=PUBLISHED + publicationQualityStatus=READY + 当前客户 visibility + RELEASE_PROFILE`

覆盖公开/客户列表、详情、媒体、推荐、页面装修引用、咨询快照、分类公开分支、收藏、购物车和结算。筛选、总数和 Facet 在数据库查询层应用相同基础条件，不使用 Node 侧事后过滤伪造一致性。

商品内容、SKU、库存和影响公开质量的图片新增、排序、主图/列表图切换或删除，均在商品行锁和同一事务内重新执行发布质量校验；失败会回滚本次写入。仍被 `PUBLISHED + READY + DIRECT_PURCHASE` 商品使用的配送模板不能停用。

本批没有执行存量数据回填。上线前必须在隔离副本盘点目标数据库中全部 `PUBLISHED` 商品的当前质量事实与 READY 状态；未完成盘点时，空目录或商品被隔离是安全预期，不能通过移除 READY 条件绕过。

## A4：备份执行可观测性

- 每次 `backup.sh` 尝试结束时原子写入 `.health/backup-status.env`。
- 标记只包含 schema 版本、开始/完成/最近成功时间、退出码、结果、受控错误/告警代码和最新 manifest 文件名，不包含连接字符串、密码或命令输出。
- backup 容器健康检查不 `source` 标记文件；只接受最近结果 `SUCCESS`、exit 0 且成功时间未超过计划周期加宽限。
- 最近一次失败、磁盘高水位告警、状态标记缺失/损坏或超期都会使容器不健康。
- 后台设置页同时展示执行标记和完整产物；只有两者新鲜且 manifest 对齐才显示“最近成功”。

健康检查不能证明备份可恢复。目标环境仍须完成空库、空媒体目录的隔离恢复，记录耗时、表/行/哈希抽样、RPO/RTO、失败回退和责任人。

## A5：合作申请写能力安全关闭

- 新增 `PARTNER_APPLICATIONS_WRITE_ENABLED`，缺失或非严格 `true` 时关闭。
- 关闭时，客户仍可查看既有申请和当前合作状态，后台仍可只读查看历史记录。
- 新申请、补充资料和后台审核在任何数据库事务前统一返回稳定的 503 能力错误。
- 客户端关闭时不显示申请表单和草案协议，改为可解释的联系顾问路径；后台显示只读提示并禁用审核。
- 该能力独立于交易开关。协议法务终审、申请字段、资质私有存储、客服责任人、处理 SLA、通知与失败补偿、审计和目标环境验收全部通过前，保持 false。

## 进入目标环境前的硬门禁

1. 冻结唯一 Git SHA，远端完整 Quality Gate 成功；人工触发 Release Images 并取得 Manifest v2 与两个 digest。
2. 对目标数据库执行只读 migration/READY/关键业务数据盘点；任何 migration 或回填另行批准。
3. 用隔离测试账号验证仓库角色对 `/orders` 为 403、对履约最小投影可用，且终态脱敏。
4. 在目标环境验证 backup 容器从首次成功、失败、磁盘告警到恢复成功的健康转换；完成真实隔离恢复演练。
5. 保持 `RELEASE_PROFILE=lead-generation`、交易/支付/退款/通知外发/合作申请写入全部关闭，直到各自运营和第三方证据单独通过。
6. 完成正式主体、联系方式、内容与媒体授权、域名/TLS/CSP、监控告警、异地加密备份和回滚演练后，再作人工 Go/No-Go。

## 当前工作树验证记录

以下结果均来自 2026-08-27 当前工作树的非破坏性本地验证，不代表运行容器或目标环境：

- `npm run lint`：通过。
- `npm run typecheck`：通过；内容模板生成合同、服务端和客户端类型检查均通过。
- `npm run test:trade`：64 项状态机、并发/金额/幂等和跨层静态合同检查通过。
- `npm run test:contracts`：通过；页面构建器检查已同步验证共享商品资格函数及 READY/发布画像条件。
- `npm run test:content-templates` 与 `npm run test:page-builder-publish`：通过。
- `npm run verify:release-images`：本地静态合同通过；未执行远端 GitHub Actions/GHCR 验证。
- `npm run verify:environment-contract`：无错误；仍警告微信支付证书路径没有只读挂载，真实微信支付不可启用。
- `bash -n scripts/backup.sh scripts/check-backup-health.sh`（`server` 目录）：通过；未执行真实备份或恢复。
- `npm test`（`server` 目录）：444 项通过、0 项失败、2 项跳过；跳过项均要求显式一次性真实 MySQL 测试环境，本批未获数据库写入授权。
- `npm run build`：服务端与客户端构建通过；Vite 报告编辑器主分块超过 500 kB，这属于后续性能治理证据，不影响本批安全合同编译通过。
- `git diff --check` 与 `git diff --cached --check`：通过；只有工作区既有的 LF/CRLF 转换提示。

未运行浏览器 E2E、真实角色联调、目标数据库盘点、备份/恢复、远端工作流、第三方或生产验证。

## 不得据此宣称

- 本地类型检查或测试通过，不等于浏览器、运行容器、目标环境或生产正确。
- 状态标记健康，不等于恢复成功。
- Mock、静态工作流合同或本地 manifest 校验，不等于远端质量门禁与 GHCR 制品已存在。
- 功能开关关闭是安全状态，不等于合作、交易、支付或通知业务闭环已经实现。
