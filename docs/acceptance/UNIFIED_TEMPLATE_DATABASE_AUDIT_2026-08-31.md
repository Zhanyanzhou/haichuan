# 统一母模板数据库审计与切换门禁

> 状态：代码准备完成，目标数据库未连接，migration 未执行，生产未切换。
> 范围：只覆盖单一母模板产品收敛涉及的动态模板基础表、旧系统/个人兼容来源、精确页面实例引用与历史 activation ledger。
> 本文件不是执行授权；精确环境、只读账号、审批引用、备份和回退均需另行确认。

## 1. 已确定的数据库原则

1. 新写入只允许进入 `DynamicTemplate / DynamicTemplateDraft / DynamicTemplateVersion`；旧系统合同与 `PersonalContentTemplate` 只读。
2. 页面实例必须保存精确 `templateId + templateVersion`，历史页面和正式快照不得因覆盖或发布母模板而改写。
3. `dynamic_template_activations` 不再对应任何运行时能力。其 migration 与 Prisma 模型暂时只用于识别不同环境可能已经形成的 migration ledger，不能作为恢复 Activation 的依据。
4. 既有 migration 是不可变历史。是否保留未应用的 activation ledger migration，或在已应用环境追加前向收敛 migration，只能由精确目标库审计结果决定；本轮不修改、删除、重命名 migration，也不创建删除表的前向 migration。
5. 旧系统/个人记录只有在兼容读取、历史重放和首次建立统一母模板身份时可读；不得原地转换、批量覆盖或删除。

## 2. Gate B 只读审计入口

入口：`npm run audit:template-v2-gate-b:readonly`。运行前必须在 `server/` 的受控进程环境中显式提供：

- `TEMPLATE_V2_GATE_B_READ_ONLY_AUTHORIZED=1`
- `TEMPLATE_V2_GATE_B_ENVIRONMENT_ID`
- `TEMPLATE_V2_GATE_B_EXPECTED_DATABASE`
- `TEMPLATE_V2_GATE_B_APPROVAL_REFERENCE`
- 指向同一预期库的 `DATABASE_URL`

该命令会在读取业务内容前完成以下失败关闭检查：

- 实际 `SELECT DATABASE()` 必须与预期库名一致；
- 当前账号权限只能是 `USAGE / SELECT / SHOW VIEW` 范围；
- migration ledger 不得缺失、漂移或出现仓库外已应用记录；
- 必需表、24 个系统兼容来源对应的唯一 SYSTEM V2 草稿、模板 checksum 与页面精确引用必须完整；
- 页面草稿、最新正式快照与 PageScheme 分开做内存 dry-run，只输出计数、摘要、blocker 和 warning，不输出页面正文。

任何失败都只生成证据，不得自动执行 migration、写入、激活、发布或部署。

## 3. 审计结果分类

| 结果 | 结论 | 后续动作 |
| --- | --- | --- |
| 必需表或基础 V2 migration 缺失 | 不能切换 | 先形成精确 migration 计划、备份和回退，经批准后再执行 |
| 24 个 SYSTEM 替代缺失或重复 | 不能切换 | 在隔离环境生成转换证据，确认唯一身份后再计划写入 |
| 页面精确版本、Schema 或 checksum 无法解析 | 不能切换 | 修复引用或版本供应，禁止用公开端静默隐藏代替数据修复 |
| 仅个人模板 revision 未应用 | 可继续只读审计，不可开放新写入 | 决定前向 migration 与兼容窗口 |
| activation ledger migration 未应用 | 不影响运行时产品能力，但 migration 序列未收敛 | 根据目标 ledger 决定保留历史表或另立前向收敛，不得直接删历史 migration |
| activation ledger 已应用 | 保留现状，不恢复运行入口 | 先确认是否有记录与审计保留要求，再决定未来前向清理 |
| 仅存在可解释 warning | 人工审阅后决定 | 保存差异报告；不自动修改页面或模板 |

## 4. Gate C 执行前的必备证据

- 精确环境和数据库身份；
- 只读 Gate B 报告及全部 blocker 关闭证据；
- migration 逐条影响、执行窗口、备份位置和恢复演练；
- 24 个兼容来源转换后的节点/槽位、桌面/移动、空内容和公开 Renderer 对比；
- 页面草稿与正式快照的精确模板引用清单；
- 旧外部 API 消费者审计，确认删除的旧写路由没有仍在使用的调用方；
- 单独的 migration/数据转换/部署授权。

## 5. 回退边界

- 应用层回退必须继续读取既有精确 TemplateVersion；不得通过覆盖母模板伪造回退。
- 页面回退只切换同一 PageDocument 的正式 revision 指针，不修改历史 revision。
- migration 回退必须是已审阅的前向修复或已验证的备份恢复；不得改写已应用 migration 文件或 checksum。
- 若统一目录异常，页面编辑器可以保留当前草稿并提示目录不可用，但不得回退到前端四接口聚合或旧模板写入口。

## 6. 本轮证据边界

本轮只完成代码、合同、测试资产与只读审计入口的准备。未读取 `.env` 真实值，未连接现有开发库或目标库，未运行 Prisma migration，未处理真实页面数据，也未部署或发布。
