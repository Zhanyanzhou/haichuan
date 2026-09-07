# 海川珠宝 — 数据与 API 导航

> 本页是领域导航，不维护完整端点表、字段清单或 CRUD 承诺。精确事实只认当前 Controller、DTO、Service、`server/prisma/schema.prisma` 和 `docs/PUBLIC_ACCESS_MATRIX.md`。

## 身份与调用约定

- 浏览器默认通过独立的后台/客户 `HttpOnly` 会话 Cookie 调用 API；共享客户端启用 `withCredentials`，写请求附加 `X-CSRF-Token`，服务端同时校验精确 Origin。
- 服务端保留受控 Bearer access token 兼容入口；不得把它描述成浏览器默认持久化或重新写入 `localStorage`。
- 前端调用统一走 `client/src/services/httpClient.ts` 和 `client/src/services/clients/`，不得在组件中创建第二个传输、鉴权或响应解包实现。
- 路由存在不等于当前身份可访问、允许物理删除、允许交易或已完成真实联调。

## 领域入口

| 领域 | 代码入口 | 说明 |
| --- | --- | --- |
| 后台认证 | `server/src/modules/auth/` | 登录、刷新、注销、注册与资料；浏览器会话和 Bearer 兼容语义见当前安全实现 |
| 客户认证 | `server/src/modules/customers/` | 与后台员工身份域分离 |
| 商品与分类 | `server/src/modules/products/`、`categories/` | 创建、编辑、状态、归档/恢复、公开读取和媒体；删除语义必须逐端点核对 |
| 库存与交易 | `inventory/`、`orders/`、`payments/`、`fulfillment/`、`after-sales/` | 受交易、权限、状态机和真实资金门禁约束 |
| 咨询与客户跟进 | `inquiries/`、`selection-inquiry/`、`leads/` | 公开提交、后台处理、隐私与通知边界 |
| 页面装修与模板 | `server/src/modules/page-modules/` | `PageDocument`、发布版本、动态母模板和兼容读取；现行导航见 `docs/page-builder/README.md` |
| 站点与内容 | `settings/` 及相关内容模块 | 公开字段、后台写入和版本行为按当前控制器与访问矩阵核对 |

## 统一响应

成功响应由全局 `TransformInterceptor` 统一包装为：

```json
{
  "code": 200,
  "data": {},
  "message": "success",
  "timestamp": "ISO-8601"
}
```

客户端只通过共享 `unwrapResponse` / `unwrapList` 解包；错误结构由当前异常过滤器和领域错误合同决定，不在本页复制枚举。

## 数据与生命周期

- 数据库模型与关系只认 `server/prisma/schema.prisma`；表或字段数量不写入手册。
- 商品稳定业务标识、图片选择、成交价、库存、SalesMode、报价通道、订单快照和员工权限遵守 `PROJECT_RULES.md` 的单一事实源与生命周期规则。
- `DELETE` 路由可能表达兼容拒绝、受限删除、关联删除或历史接口；不得由方法名推断允许物理删除。
- migration 文件存在、类型生成或测试通过不证明任何目标数据库已迁移。

## 尚未实现的报价目标

双客群、三报价、客户本人确认、蜡模克价、分通道资源门禁、事务转单和不可变订单快照的业务决定只认 `docs/DECISIONS.md` D.19，数值与字段约束见 `docs/PRODUCT_DATA_CONTRACT.md`。

这些目标尚不能从当前路由、Schema 或页面存在推断为已实现；任何新增 API、Schema、migration、真实支付或生产接线仍按 `AGENTS.md` 和 `WORKFLOW.md` 单独实施与验证。
