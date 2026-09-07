# 运行时所有权审计与断开项处置单

> 核对日期：2026-08-27（Asia/Shanghai）
> 证据：`artifacts/runtime-ownership-audit/current.json`
> 边界：本文件是只读消费图与处置建议，不授权删除文件、移除 API、修改 Schema、开放支付能力或执行 Git 写入。

## 结论

当前消费图没有证明任何 Controller 或 Prisma 模型是可安全删除的孤儿。可确认的断开项仅包括 4 个生产入口不可达的 Client 文件；其中 2 个是被 PageDocument 取代的旧公开页面候选，2 个是仍处于 Puck 能力裁决期的编辑器文件。另有 1 个仅供 Playwright 夹具使用的组件和 1 个环境类型声明，均应保留。

生产 Client 的 231 个静态 API 调用均能匹配服务端路由。253 个服务端路由中，23 个没有直接静态 Client 调用；14 个已经解释为动态请求、兼容别名、外部回调、基础设施探针或间接资源 URL，剩余 9 个需要产品/API 负责人裁决。不能把“没有静态前端调用”当成删除授权。

## 已验证范围

| 项目 | 当前结果 |
| --- | ---: |
| Client 源文件 / 生产可达 | 299 / 293 |
| 页面文件 / 生产不可达页面 | 74 / 2 |
| Server 源文件 / 生产可达 | 301 / 206 |
| Controller / 生产不可达 Controller | 36 / 0 |
| Server 路由 / Client 静态 API 调用 | 253 / 231 |
| 无法匹配服务端路由的 Client 静态调用 | 0 |
| 无直接静态 Client 调用的服务端路由 | 23 |
| 仍需消费者裁决的服务端路由 | 9 |
| Prisma 模型 / 无直接 delegate 引用 | 70 / 20 |
| 既无 delegate 引用也无 Schema 关系的模型 | 0 |
| 未解析 Client / Server 静态导入 | 0 / 0 |

## 文件处置

### 等待 P-ORPHAN-FILE 批准：迁移唯一内容后删除或归档

| 精确路径 | 当前证据 | 建议 | 删除前必须完成 |
| --- | --- | --- | --- |
| `client/src/pages/public/About/index.tsx` | 12,868 bytes；SHA-256 `b272bc1f7a32628d4558cdad25194838b0bc2eacd5ed05609efefdd0a54ef51c`；无生产或测试 importer；`App.tsx` 的 `/about` 由 `PublicLayout` PageDocument Renderer 提供 | 候选退役 | 把仍需保留的唯一文案、链接和媒体逐项映射到当前 `about` PageDocument；桌面/移动比较；批准精确删除路径 |
| `client/src/pages/public/Custom/index.tsx` | 23,922 bytes；SHA-256 `85873602318f4ad0e6e26391826d03a01c105f7e65aae156e5df9390d1478808`；无生产或测试 importer；`App.tsx` 的 `/custom` 由 `PublicLayout` PageDocument Renderer 提供 | 候选退役 | 把仍需保留的唯一文案、咨询入口和媒体逐项映射到当前 `custom` PageDocument；桌面/移动比较；批准精确删除路径 |

这两个旧页面不应直接接回路由：接回会重新建立 PageDocument 与代码页面两个公开事实源。若发现 PageDocument 尚未覆盖的业务内容，应先迁移并发布验证，而不是恢复竞争渲染器。

### 等待 P-ORPHAN-PUCK 批准：先证明替代能力

| 精确路径 | 当前证据 | 当前处置 |
| --- | --- | --- |
| `client/src/page-builder/inspector/InspectorQuickActions.tsx` | 无生产或测试 importer；历史收敛清单仍标记 `puck-delete-hold` | 保留不接线。先确认当前 Inspector 是否完整覆盖快捷动作及键盘/撤销语义，再决定删除；不得为了消除孤儿而推测性接线 |
| `client/src/page-builder/preview/previewGeometry.ts` | 无生产或测试 importer；历史收敛清单仍标记 `puck-delete-hold` | 保留不接线。先对照当前预览合同、桌面/移动几何和空素材稳定性证明替代，再决定删除 |

### 明确保留

| 精确路径 | 原因 |
| --- | --- |
| `client/src/page-builder/visual-editor/VisualEditorToolbar.tsx` | 生产入口不可达，但由多个 `client/tests/fixtures` 直接使用，分类为 `TEST_ONLY_REACHABLE`；它是确定性编辑器验收夹具资产 |
| `client/src/vite-env.d.ts` | Vite/TypeScript 环境声明，分类为 `AMBIENT_TYPE_DECLARATION`；不能按运行时 import 规则判断 |

## API 处置

### 明确保留或继续安全暂停

| 方法与路由 | 判定 | 原因 |
| --- | --- | --- |
| `POST /payments/:orderId/channel` | 保留，继续不接前台 | 这是后台代客户发起真实渠道收款的高风险能力；未有 Client 入口是当前安全暂停的一部分。只能在 P6 指定商户、回调域、测试订单和资金上限后接线 |
| `DELETE /products/:id` | 保留兼容拒绝，等待 API 版本裁决 | 服务层对回收站商品也始终抛出冲突，不写 `deletedAt`；端点表达“不能删除”的既有安全合同。移除会改变外部 API 行为，接前端则会制造无效操作 |
| `GET /products/admin/publication-quality-report` | 保留只读运营接口 | 服务按批扫描已发布商品并返回质量评估，不写质量状态；已有服务合同覆盖。是否增加后台入口由运营范围决定 |

### 等待 P-ORPHAN-API 消费者/兼容性裁决

| 方法与路由 | 当前证据 | 建议决策方向 |
| --- | --- | --- |
| `GET /ai-classify/status` | 无当前静态 Client 消费者 | 确认是否供运维/外部客户端使用；否则在 API 版本与回退窗口批准后退役 |
| `GET /inventory/:id` | 当前后台使用库存列表与更新，未发现详情调用 | 确认外部运营消费者；若无，纳入版本化退役 |
| `GET /leads/:type/:id/follow-ups` | `getLeadDetail` 已内嵌 `followUps`，当前 Client 未独立拉取 | 优先判定为冗余兼容端点；确认无外部消费者后版本化退役 |
| `POST /products/:id/images/:sourceImageId/crop-listing` | 无当前 UI 调用 | 若列表图裁切仍是产品需求，应先设计明确入口和媒体回退；否则版本化退役 |
| `PUT /products/:id/images/listing/reset` | 无当前 UI 调用 | 与裁切能力一并裁决，不能只删除其中一个形成半套合同 |
| `POST /upload/images` | 当前 UI 使用更专门的上传入口，未发现通用批量图片调用 | 确认外部/CMS 消费者和存储治理；无消费者后版本化退役 |

除上述 9 条外，另外 14 条无直接静态调用路由已由审计解释为：3 条动态 Client 请求、2 条向后兼容别名、3 条外部回调、2 条健康探针、4 条间接资源 URL。它们不进入孤儿候选。

## Prisma 处置

20 个模型没有直接 `prisma.<delegate>` 调用，但全部通过 Schema 关系被其他根模型的嵌套读写或选择集消费；例如订单项、商品翻译、分类翻译和媒体变体。当前没有任何模型同时满足“无 delegate 使用且无 Schema 关系”，因此本轮不提出 Schema 删除、migration 或数据清理。

## 批准与执行门槛

1. `P-ORPHAN-FILE`、`P-ORPHAN-PUCK`、`P-ORPHAN-API` 分开批准；批准一个不代表批准另外两个。
2. 删除批准必须列出精确路径或方法+路由，不接受“把所有未引用项删掉”这种动态范围。
3. 文件删除前保存当前 SHA-256、唯一内容映射和可恢复来源；API 退役前确认外部消费者、版本窗口、监控和回退路由。
4. 每批变更后重新生成本审计，要求未解析导入为 0、Client 静态调用未匹配为 0；再执行受影响 typecheck、build、合同测试和真实浏览器路径。
5. 本处置单不改变当前 `NO-GO`：目标环境、正式业务事实、migration、交易合同、TLS、恢复和渠道证据仍由 P0-S/P1–P7 控制。

## 当前不执行的动作

- 不删除、移动、重命名或覆盖上述文件。
- 不移除或新增接线任何 API。
- 不修改 Prisma Schema 或运行 migration。
- 不把静态消费图外推为 CMS、数据库、第三方或目标环境真实流量证据。
