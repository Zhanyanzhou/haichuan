# 海川珠宝 — 组件与代码入口

> 本页只提供稳定目录导航，不维护组件数量、消费者数量、死代码清单或完成状态。精确所有权必须从当前 import 图、路由和运行入口复核。

## 客户端

| 目录 | 职责 |
| --- | --- |
| `client/src/pages/public/` | 客户前台页面与公开旅程 |
| `client/src/pages/admin/` | 管理后台页面与编辑工作台 |
| `client/src/components/` | 跨页面复用组件；页面私有结构优先留在对应页面目录 |
| `client/src/page-builder/` | Puck 配置、共享编辑基础设施、模板适配与 Renderer 消费入口 |
| `client/src/services/clients/` | 领域 API 客户端，共享同一 HTTP 传输 |
| `client/src/store/` | 已批准的全局状态；不得为局部状态建立平行全局来源 |
| `client/src/utils/` | 跨页面纯工具和既有单一事实函数 |

## 服务端

| 目录 | 职责 |
| --- | --- |
| `server/src/modules/` | 按领域组织 Controller、Service、DTO 和测试 |
| `server/src/common/` | 全局安全、响应、异常、观测与共享基础设施 |
| `server/prisma/` | Schema、不可变 migration 历史和种子入口 |

## 所有权判断

- 组件、页面或接口是否可删除，不能只看文件名或一次文本搜索；至少核对生产入口、动态导入、测试夹具、机器合同、服务端消费者和兼容窗口。
- 页面构建器的产品模型与实现入口分别见 `docs/page-builder/template-design-framework.md` 和 `docs/architecture/page-builder-boundary.md`。
- 当前可达性与遗留候选只认新鲜运行时所有权审计；历史处置单已归档，不作为删除授权。
