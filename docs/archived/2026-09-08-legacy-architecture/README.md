# 2026-09-08 旧架构与媒体方案归档

> 本目录保存被现行合同与实现取代的早期架构材料，只用于追溯。不得把其中的旧模型、字段、角色、接口、交易阶段、图片角色或 migration 建议恢复为当前设计。

## 现行入口

- 当前架构总览：[`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md)
- 当前实现与运行状态：[`docs/CURRENT_STATE.md`](../../CURRENT_STATE.md)
- 技术不变量：[`PROJECT_RULES.md`](../../../PROJECT_RULES.md)
- 已批准决策：[`docs/DECISIONS.md`](../../DECISIONS.md)
- 商品数据与媒体合同：[`docs/PRODUCT_DATA_CONTRACT.md`](../../PRODUCT_DATA_CONTRACT.md)

## 原路径映射

| 原路径 | 归档文件 | 被取代原因 |
| --- | --- | --- |
| `docs/architecture/commerce-domain-model.md` | [commerce-domain-model.md](commerce-domain-model.md) | 早期电商扩展规划已被商品、交易与报价合同取代 |
| `docs/architecture/current-system-map.md` | [current-system-map.md](current-system-map.md) | 2026-08-06 系统快照包含已退役页面与模块 |
| `docs/architecture/product-image-pipeline.md` | [product-image-pipeline.md](product-image-pipeline.md) | `ProductImage.role` 方案未成为现行模型，已由主图/列表图关系、私有媒体裁切与完整性门禁取代 |

商品图片历史方案中关于 `BACK` 拍摄角度的未决风险，已由 `PRODUCT_DATA_CONTRACT.md` 的现行检查清单承接。任何 Schema、migration、导入或媒体批处理仍需按当前合同与授权重新评估。

