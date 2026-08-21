# 给 Codex 的修复执行指令（基于 2026-08-20 全产品深度审计）

> 本指令配套 `AUDIT.md`（同目录，含完整证据、截图索引与行号）。先读 `AUDIT.md` §0/§3/§5 再动手。
> 项目规则以 `AGENTS.md`、`PROJECT_RULES.md`、`WORKFLOW.md`、`docs/PROJECT_GUARDRAILS.md` 为准，本指令不重复、不覆盖。

---

## 一、背景与现状（必须先理解）

1. 分支 `codex/release-curation-20260814`，最新提交 `273acfd`。
2. **工作区存在 45 个已跟踪修改文件 + 2 个未跟踪临时脚本的他人在途批次**（+338/-331，主要涉及页面构建器/视频模块/商品编辑器/发布校验）。这些文件你只能审查和在其上叠加，**不得回退、不得格式化重排、不得整文件重写**；确需修改其中文件时，diff 必须最小化。
3. 在途批次中 3 项方向性变更**未获负责人批准，已挂起**（见第三节"冻结区"）。
4. 本地 Docker 完整栈在线（:80 client / :3002 server），但运行的是**已提交代码**，不含在途批次；宿主机后端 :3000 可能未运行（启动方式：`cd server && node dist/main.js`，`nest dev` 本机会 hang，见 DECISIONS A.12）。
5. 审计全部验证（typecheck + 5 条 test 链）当前为绿；你每完成一个批次必须保持全绿。

## 二、硬约束（违反即返工）

- 不得执行任何 Git 写操作（add/commit/restore/reset/checkout/clean）——提交由负责人或集成者执行。
- 不得修改 `.env*`、数据库、docker-compose、部署配置；不得读取/输出任何密钥、客户、订单、支付隐私数据。
- 不得安装/升级/删除依赖。
- 不得为了"让测试通过"而改测试断言迁就代码行为——审计已发现在途批次犯过此错误（`verify-content-template-contract.mjs`、`verify-page-builder-contract.mjs`），你要做的是让行为符合决策，或报负责人改决策。
- 不得破坏 `AUDIT.md` §5 列出的 13 项健康设计（可见性矩阵、Puck 渲染商品链路、交易 Guard、IDOR、编辑器保存体系、发布事务等）。改动 `PuckDocumentRenderer`/`api.ts` 商品拉取链路、`products.service.ts` 可见性过滤、`page-modules.service.ts` 发布事务前，必须重读对应健康项。
- 每个批次一个独立可回退的改动集；批次内不夹带其他问题修复。

## 三、冻结区（负责人未拍板，禁止动）

| 冻结项 | 位置 | 说明 |
|---|---|---|
| 商品默认 status/visibility 值 | `server/src/modules/products/products.service.ts:149-150`；`client/src/pages/admin/ProductEditor/index.tsx:540-541,1038` | 默认 PUBLISHED+PUBLIC 还是 DRAFT+MEMBER 待决策 D-1。**批次 1 的门禁修复不得改动这两处默认值** |
| 发布校验 visibility 口径 | `server/src/modules/page-modules/page-modules.service.ts:828-851` | 放宽与否待决策 D-2，保持现状 |
| 视频比例 palette | `contracts/page-builder/content-templates.contract.json` video coverImage；`tokens.ts` RATIOS | 待决策 D-3，保持现状 |
| `verify-content-template-contract.mjs`、`verify-page-builder-contract.mjs` 中被改写的断言 | scripts/ | 随 D-3/D-2 决策一并处理，现在不动 |

## 四、执行批次（按顺序，批次 1 立即开始）

### 批次 1：P0/P1 安全与防误公开（不依赖任何未决决策）

**1a. 商品创建路径补 canPublish 门禁**（P1-01 的门禁部分）
- 文件：`server/src/modules/products/products.service.ts`。
- 现状：canPublish 在 :1007-1030 定义、仅在 PUT 路径 :1080-1094 强制；create() :921-1005 全程不调。
- 要求：create() 在事务内、写入前，当 status 解析结果为 PUBLISHED 时执行与 update 相同的 canPublish 校验（价>0 + 有图 + 有价态 SKU），不满足则 422 并列出缺项；解析结果为 DRAFT 时不拦截。**不得改 :149-150 的默认值**（冻结区）。
- 验收：新增静态断言脚本或并入现有 verify 脚本，断言 create 路径存在 canPublish 调用；`npm run typecheck && npm run test:trade` 全绿；手工：staff token `POST /api/products` 传 `status:"PUBLISHED"` 无图 → 422。

**1b. 超管自保**（P1-03）
- 文件：`server/src/modules/users/users.service.ts:104-160`。
- 要求：update 拦截"目标是自己且动作会使自己失能（DISABLED 或角色降为非 SUPER_ADMIN）"；delete 拦截"目标是自己"以及"目标是最后一个 ACTIVE 的 SUPER_ADMIN"；统一 422 中文文案。前端 `UserManage` 对触发场景给明确错误提示（若已有通用错误展示则不动前端）。
- 验收：静态检查 + typecheck；（有凭据时）实测自禁/删最后超管 → 422。

**1c. 客服可分配咨询**（P1-04）
- 文件：`server/src/modules/users/users.controller.ts`（或新端点）、`client/src/pages/admin/LeadManage/index.tsx:181-192`。
- 要求：新增轻量员工选项端点（如 `GET /users/assignable`，@Roles 含 CUSTOMER_SERVICE，只返回 id/name/role 白名单字段，不返回邮箱/手机等）；LeadManage 的 loadStaff 改用该端点；403 兜底从"静默置空"改为显式提示。
- 验收：typecheck；客服角色调 `/users/assignable` → 200；调原 `/users` 仍 403（权限面不扩大）。

**1d. 客户域写接口补 DTO**（P1-05）
- 文件：`server/src/modules/customers/customers.controller.ts:40,47,55,62,79,93` + 新建 DTO 文件。
- 要求：register/login/forgot-password/reset-password/updateProfile 全部改用 class-validator DTO：手机号 `^1[3-9]\d{9}$`、密码最少 8 位且含字母数字（与前端提示口径一致）、字符串字段长度上限、禁止多余字段渗透（配合 whitelist，注意保持与现有客户端请求体兼容——先核对 `client/src/services/api.ts` 实际发送字段再定 DTO）。
- 验收：typecheck；非法手机号/弱密码 → 400；正常注册登录回归（手工或静态）。

**批次 1 完成门槛**：typecheck 全绿；`test:trade`、`test:selection-inquiry` 全绿；4 项改动各自独立 diff；向负责人输出变更清单与 V-01/V-03/V-04 的实测状态（无凭据则标注"待实测"）。

### 批次 2：页面构建器合同与发布一致性（**前置：D-2/D-3 拍板，未拍板不得开始**）
- 按 D-3 结果执行视频比例：回退 或 正式修 D.13（合同 + tokens.ts + 两个 verify 脚本 + UI_GUIDE 同步，改前按 A.10 追记二做影响盘点）。
- videoWidth/bgColor 入合同声明或撤下（P2-03）。
- P2-01：后端发布校验输出结构化 blockId 错误清单，LayerRail 角标与发布定位统一消费它，废除正则解析错误文本（`HomepageConfig/index.tsx:3575-3592`、`LayerRail.tsx:93-106`）。
- P2-02：图层栏角标升级为可点击的错误清单面板；发布失败提示加 role=alert。
- 保留 LEGACY_RATIOS 旧数据兼容层不动。
- 验收：`test:content-templates`、`test:page-builder-publish` 全绿 + 编辑器发布流浏览器实测（可用 `client/scripts/tmp-verify-publish.mjs` 同款流程）。

### 批次 3：后台效率与防误操作
- P2-05：ProductEditor 接 useBlocker（复用 `UnsavedChangesGuard` 模式）。
- P2-06：leads updateLead 校验状态枚举与合法流转（`leads.service.ts:198-229`）。
- P1-07：金价页在未配置 GOLD_PRICE_API_URL 时显示"自动抓取未配置，当前需手动维护"横幅（不改 cron 行为；D.10 拍板另行）。
- P3-09/P3-10/P3-06/P3-07 择小修复。
- 验收：typecheck + 后台走查。

### 批次 4：客户前台旅程与数据卫生
- 公开目录垃圾商品与破图：**只出清理方案清单（商品 ID 21/24/31 现状与处置建议），删/下架由负责人确认后执行，不得自行操作数据库**。
- P2-08：CustomerCenter 仅 401 清会话，5xx 给重试（`CustomerCenter/index.tsx:73-75`）。
- P2-07：选款咨询幂等（联系方式+商品集+时间窗去重）。
- P2-11：Puck 渲染页统一挂载标准页脚。
- P2-10 与联系方式配置化：待 D-8 与运营输入，不在本批。

### 批次 5+：响应式/无障碍/性能（P2-13/P2-16/P3-05/P3-12）、SEO 上线门禁（批次 6，需正式域名等运营输入）、技术债（批次 7）
- 按 `AUDIT.md` §3 表逐项，批量小步提交。

## 五、每批次交付格式

1. 改动文件清单 + 每个文件的 diff 摘要；
2. 运行的验证命令与结果（typecheck / 相关 test 链 / 浏览器实测或"待实测"标注）；
3. 触及的健康项复核声明（§5 哪几项被波及、为何安全）；
4. 新发现的问题（如有）单独列出，不夹带修复；
5. 需要负责人决策或提供凭据/输入的事项。

## 六、优先级速查

立即做：1a、1b、1c、1d。
等决策：批次 2 全部（D-2/D-3）、P2-10（D-8）、P2-09（D-6）、批次 6（运营输入）。
禁做：冻结区全部、数据库清理、Git 写操作、依赖变更、测试断言迁就。
