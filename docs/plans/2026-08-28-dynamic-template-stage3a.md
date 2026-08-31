# 动态模板阶段 3A：持久化、版本与权限实施记录

> 历史阶段记录：本文件中的角色和 `publish` 端点表已被 2026-08-30 的 Gate A 决策取代，不再作为当前实施合同。当前只允许 `SUPER_ADMIN` 设计、保存、预检和激活；旧 `publish` HTTP 入口固定返回 409，现行合同见 `artifacts/design-audit/template-v2-acceptance-2026-08-29/high-risk-activation-gate.md`。
> 状态：阶段 3A 代码、迁移文件与静态验证已完成；数据库 migration **尚未执行**，未连接或修改任何真实数据库。
> 裁定：采用新增三表方案；草稿仅所有者可见，正式版本向已登录员工开放；旧个人模板、旧页面、旧 Renderer 与历史 revision 不迁移、不重写、不删除。
> 唯一后续审批门禁：阶段 3B 对明确目标数据库执行备份、迁移与真实接口验收。

## 1. 阶段 3A 授权范围

本阶段已获准：

- 修改 Prisma Schema，并生成、审查一个只新增对象的 migration 文件。
- 增加动态模板 DTO、Service、Controller、客户端 API 契约与测试。
- 实现账号私有草稿、乐观 revision、另存为、归档/恢复和不可变正式版本。
- 进行不连接数据库的 Schema、类型、单元测试和 migration 静态验证。

本阶段不执行：

- 不运行 `prisma migrate deploy`、`prisma migrate dev` 或任何真实数据库 DDL/DML。
- 不读取 `.env` 的真实值，不连接测试、预发布或生产数据库。
- 不部署，不修改依赖，不执行 Git 写入，不删除文件。
- 不删除或迁移 `personal_content_templates`、旧模板合同、旧 Renderer、页面文档或历史 revision。
- 不把动态模板 API 默认接入当前模板编辑 UI；迁移完成前，UI 继续使用阶段 2 的本机草稿，避免访问尚不存在的表。

## 2. 数据模型

迁移文件：`server/prisma/migrations/20260828200000_add_dynamic_template_versioning/migration.sql`
当前 SHA-256：`b10ffe1e7ff8cdf7aad94fb52b2890b398d6caa389c5bb9e412a17fa77b3921d`

### 2.1 `dynamic_templates`

模板身份、所有权、目录元数据与当前正式版本指针：

- 稳定外部身份：`template_id`，唯一且不依赖数组下标或数据库自增 ID。
- 所有权：`owner_id` 可空；自定义模板创建时必须写当前管理员 ID。
- 生命周期：`source_type`、`visibility`、`status`、`archived_at`。
- 目录投影：名称、分类、用途、布局类型、描述、槽位摘要、推荐页面与标签。
- 版本指针：`definition_schema_version`、`published_version`。
- 来源：`source_reference` 记录另存为来源，不形成可变继承链。
- 同一所有者下名称唯一；模板 ID 全局唯一。

### 2.2 `dynamic_template_drafts`

每个动态模板最多一个可变草稿：

- `dynamic_template_id` 唯一，一对一绑定模板。
- `revision` 用于乐观并发控制，保存和发布均须提交 `expectedRevision`。
- `base_version` 记录草稿基于或刚发布的正式版本。
- `definition` 保存完整、经服务端同源校验的 `TemplateDefinition` JSON。
- `definition_checksum` 保存规范化 JSON 的 SHA-256。
- `version_note`、`updated_by_id` 和时间戳记录编辑上下文。

草稿只通过 `owner_id` 绑定的管理员接口读取和修改，不进入员工正式模板目录。

### 2.3 `dynamic_template_versions`

只追加、不可原地覆盖的正式版本：

- `(dynamic_template_id, version)` 唯一。
- 固化 `schema_version`、完整 `definition`、checksum、版本说明、发布者与发布时间。
- 已发布版本没有更新和删除接口。
- 模板外键使用 `ON DELETE RESTRICT`，避免误删根记录导致正式版本丢失。

### 2.4 关系与兼容

- 模板所有者删除时 `owner_id` 置空；已公开给员工的正式版本仍可保留，私有孤立草稿不会出现在任何账号的“我的模板”。
- 草稿跟随模板根删除的数据库关系是 `CASCADE`，但阶段 3A 不提供删除接口。
- 发布者、草稿更新者删除时审计引用置空，版本内容保留。
- migration 不回填、不修改任何旧表；旧应用可忽略新增三表，因此应用代码回退不依赖数据库反向迁移。

## 3. API 与权限

统一前缀：`/page-modules/dynamic-templates`

| 方法 | 路径 | 角色 | 语义 |
| --- | --- | --- | --- |
| GET | `/published` | `EDITOR`、`ADMIN`、`SUPER_ADMIN` | 读取当前可用的员工正式模板 |
| GET | `/published/:templateId/versions/:version` | 同上 | 按稳定 ID 和不可变版本读取 |
| GET | `/mine` | `ADMIN`、`SUPER_ADMIN` | 读取当前管理员拥有的模板和草稿 |
| POST | `/` | `ADMIN`、`SUPER_ADMIN` | 创建私有动态模板草稿 |
| GET/PATCH | `/:templateId/draft` | `ADMIN`、`SUPER_ADMIN` | 读取或按 revision 保存本人草稿 |
| POST | `/:templateId/save-as` | `ADMIN`、`SUPER_ADMIN` | 创建全新 templateId 和私有草稿 |
| POST | `/:templateId/publish` | `ADMIN`、`SUPER_ADMIN` | 生成下一不可变版本并设为员工可见 |
| GET | `/:templateId/versions` | `ADMIN`、`SUPER_ADMIN` | 查看本人模板版本历史 |
| POST | `/:templateId/archive`、`restore` | `ADMIN`、`SUPER_ADMIN` | 可逆生命周期变更，不删除数据 |

所有私有操作都在 Service 再次按 `ownerId` 限定；前端隐藏按钮不是权限边界。没有动态模板 `DELETE` 接口。

## 4. 服务端不变量

- 服务端使用由同一 `template-definition.schema.json` 生成的校验器，不信任客户端校验结果。
- 模板定义上限 1 MiB、最大结构深度 30，并拒绝原型污染相关对象键。
- JSON 先规范化键序再计算 checksum，相同语义定义得到稳定摘要。
- `templateId` 创建后不可通过普通保存改变；派生模板必须走“另存为”。
- 草稿更新通过 `revision` 条件更新；并发失败返回冲突，不静默覆盖。
- 发布事务先认领草稿 revision，再乐观推进模板正式版本指针，最后插入不可变版本；任一步冲突使事务回滚。
- 与当前正式版本 checksum 相同的草稿不能重复发布。
- 归档不删除版本；归档模板不出现在员工正式目录，恢复后重新可见。按 `templateId + version` 的精确读取仍可访问归档前正式版本，确保未来旧页面引用不因归档失效。

## 5. 客户端接线策略

`client/src/services/clients/dynamicTemplateClient.ts` 已提供与上述端点对应的类型和请求方法，但当前模板工作空间尚不默认调用它们。

- 真实 API 模式可以在阶段 3B 后接线。
- Mock 模式的读取返回明确空集合；写请求主动报错，避免用内存假成功冒充数据库持久化。
- 阶段 2 本机草稿仍是当前 UI 的事实来源，页面 `PageDocument`、页面历史与 `LayerRail` 不受本阶段影响。

## 6. 阶段 3A 验证与证据边界

阶段 3A 至少执行：

1. `npx prisma format` 与 `npx prisma validate`。
2. 服务端 TypeScript 检查。
3. 动态定义同源校验、服务权限、所有权、revision 冲突、另存为、发布、重复发布、归档/恢复测试。
4. migration 静态测试：只创建三张获批新表；`ALTER TABLE` 只作用于这三张新表；无旧表名和破坏性 DML/DDL。
5. 客户端 TypeScript/构建和相关模板回归。

证据限制：

- Prisma Client 类型已经生成，但 Windows 上运行中的进程锁住 query engine DLL，`prisma generate` 最终替换引擎文件时报 `EPERM`；不终止用户进程，不把类型生成等同于数据库迁移。
- 单元测试使用内存 Prisma 假实现，证明业务分支和事务调用顺序，不证明 MySQL 上的真实锁行为或接口可用性。
- migration 文件存在、Schema 校验通过和构建成功都不证明任何目标数据库已迁移。
- 阶段 3A 不声明真实 API、生产数据库、部署或备份已经验收。

## 7. 阶段 3B 单独门禁

真正执行 migration 前必须获得针对**明确目标环境和数据库**的单独批准，并完成以下顺序：

1. 确认环境名称、负责人、维护窗口、数据库主机/库名的非敏感标识和当前应用版本；不得输出密码或完整连接串。
2. 只读执行当前目标的 `prisma migrate status`；如有 drift、失败 migration 或未知历史，立即停止，不自行 `resolve`。
3. 使用当前部署的备份链生成同一时点的数据库和媒体备份，记录时间、文件大小、hash 和健康状态。
4. 把最新数据库备份恢复到隔离、可丢弃的测试数据库，核对旧表、代表性记录和 migration 前状态。当前仓库没有已确认可直接执行的正式 restore 工具，因此必须先明确并演练恢复命令，不能仅凭备份文件存在宣称可恢复。
5. 再次核对 migration hash 与本文件记录一致，并确认 SQL 仍只有新增三表和新表外键。
6. 获批后在目标环境执行 `npx prisma migrate deploy`；不得使用 `migrate dev`。
7. 验证 migration 状态、三表/索引/外键、服务 `/api/health` 与 `/api/ready`，再做真实角色和接口闭环：创建草稿、保存冲突、另存为、发布、员工读取旧版本、归档/恢复。
8. 阶段 3B 验收后，才把模板工作空间从本机草稿切换到真实 API；该 UI 接线仍须保留 loading、empty、error、success、冲突恢复和未保存保护。

当前 `docker-compose.yml` 提供 MySQL 与数据库/媒体备份容器，交易总开关默认关闭；这些只是代码配置证据。历史运维记录明确不能代表当前目标数据库、当前备份或当前容器健康状态。

## 8. 失败与回退

### migration 执行前

- 直接撤回阶段 3A 的定点代码接线即可；没有数据库状态需要回滚。
- 不使用全仓 `reset`、`restore`、`clean`，也不覆盖当前工作区的其他未提交修改。

### migration 成功、但应用接线失败

- 回退应用到不调用动态模板 API 的版本；新增表可以留存，不影响旧 Schema 和旧应用。
- 不自动删除新表，不删除已经产生的模板或正式版本。

### migration 中途失败或目标库出现异常

- 立即停止应用写入和后续 migration，保存失败日志、migration 状态和新表实际状态。
- MySQL DDL 可能部分提交，禁止未经审查直接重跑、手工删表或 `prisma migrate resolve`。
- 优先把迁移前备份恢复到隔离的新数据库，完成一致性校验后再经批准切换；若必须在原库清理部分创建对象，另行列明精确 SQL、数据影响和恢复点后审批。
- 任何真实库恢复、切换、删表或 migration 修复都属于新的高风险操作，不由阶段 3A 授权覆盖。

## 9. 阶段 3A 完成标准

- Schema、migration、DTO、Service、Controller、模块注册、客户端 API 契约和目标测试全部存在且通过静态/单元验证。
- 没有动态模板删除端点，没有旧数据回填，没有页面实例接线，没有默认 UI 远程写入。
- 迁移未执行、真实数据库未连接的状态在交付中明确列出。
- 阶段 3B 的目标、备份、恢复、执行、验收和失败停止条件可逐项操作与审计。

## 10. 2026-08-28 新鲜验证记录

- `npm run typecheck`：通过；旧内容模板合同 24/24 活跃注册一致，动态模板合同为 schema v1、18 种节点、10 种槽位，两端生成物一致。
- `npm run verify:migration-integrity`：通过；仓库共识别 45 个 migration，本次文件只作为新增 migration 纳入 bundle，未检查或连接数据库 ledger。
- `npx prisma validate`：通过；只验证本地 Schema。Prisma CLI 自动加载环境文件但未输出变量值，命令不连接数据库。
- 目标后端测试：23/23 通过；包含动态模板 10 项与既有个人模板 13 项，覆盖角色、所有权、revision、正式版本不可变语义、归档兼容和 migration 静态边界。
- `npm run build:server` 与 `npm run build:client`：通过；客户端构建仍有既有大 chunk 警告，本阶段没有以构建结果冒充真实 UI 或 API 验收。
- 未执行：真实 MySQL migration、真实角色接口联调、容器健康检查、恢复演练、部署和生产验证；这些全部属于阶段 3B。
