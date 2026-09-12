# 海川珠宝 — 系统架构边界

> 本页只描述稳定系统边界，不维护端口、模块数量、测试结果、Feature Flag 状态或完成度。运行方式见 `docs/DEVELOPMENT_WORKFLOW.md`，当前状态见 `docs/CURRENT_STATE.md`。

## 系统组成

```text
Browser
  └─ React / TypeScript / Vite client
       └─ shared HTTP transport + domain clients
            └─ NestJS controllers
                 └─ domain services
                      └─ Prisma
                           └─ MySQL
```

- 根目录负责跨包脚本、合同、门禁和编排。
- `client/` 负责客户前台、管理后台、页面编辑器和浏览器侧状态。
- `server/` 负责身份、权限、业务规则、事务、持久化和外部服务边界。
- `contracts/page-builder/` 是页面构建器跨端机器合同来源；生成物不得手改。
- `docs/` 只解释方向、决定、状态和操作，不成为运行时代码或数据的第二事实源。

## 请求与数据流

1. React 页面或组件调用领域客户端。
2. 领域客户端复用 `client/src/services/httpClient.ts` 的传输、凭据、CSRF、错误与响应处理。
3. NestJS Controller 负责路由、鉴权、参数接收和委托；Service 承担业务规则、事务与 Prisma 访问。
4. 成功响应由全局 `TransformInterceptor` 包装，客户端通过共享解包工具消费。
5. 数据模型、关系和数据库约束只认 `server/prisma/schema.prisma`；migration 是否应用必须对精确目标库核验。

## 身份与信任边界

- 后台员工和前台客户使用独立身份域、独立会话与域标记。
- 浏览器默认使用 `HttpOnly` 会话 Cookie；写请求同时通过精确 Origin 和 CSRF 校验。
- Bearer access token 仅作受控兼容入口，不是浏览器 `localStorage` 持久化架构。
- 前端路由和按钮只提供界面约束；服务端 Guard、角色声明和 Service 校验才是最终权限边界。

## 页面装修边界

- `PageDocument` 保存页面实例及发布快照；`TemplateDefinitionV2` 保存母模板结构和不可变版本。
- 页面装修和模板设计复用 Shared Editor Core、Repository 与 Renderer，但选择、历史、脏状态、保存对象和发布结果相互隔离。
- 内容模板兼容合同与模板结构合同各自承担明确职责，Renderer、Inspector、目录和测试只消费，不复制合同。
- 详细产品语义见 `docs/page-builder/template-design-framework.md`，当前调用链见 `docs/architecture/page-builder-boundary.md`。

## 运行与发布边界

- 本地端口、启动命令和容器拓扑只在 `docs/DEVELOPMENT_WORKFLOW.md` 维护。
- 部署准备、正式制品、证据、告警和回滚统一见 `docs/PRODUCTION_RELEASE_RUNBOOK.md`。
- 代码、路由、Feature Flag、Mock、构建或隔离测试存在，都不能单独证明真实业务闭环或生产可用。
