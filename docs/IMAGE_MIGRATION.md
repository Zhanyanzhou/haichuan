# 商品图片迁移

本流程用于将商品图片迁移到独立媒体存储，同时保留项目外归档中的原图字节不变。生产运行时只读取受控私有媒体，不挂载原图归档。

## 迁移源归档（2026-08-26 起）

| 目录 | 角色 | 内容 |
| --- | --- | --- |
| `G:\网站搭建2-外部资料文件夹\server-migration-source-20260826\product-images\` | **项目外迁移源归档** | 836 张原始字节（2.09 GB），不进入构建上下文 |
| `client/public/images/products/` | 线上运行态 | 43 张压缩活图（2.7 MB），继续以 `/images/products/` URL 提供服务 |

- 两者是同一资产的不同形态，**不是冲突版本**：public 中每张活图对应迁移源中一张未压缩原始字节（Sharp 无损降采样前备份）。
- URL 命名空间不变：迁移清单中的 `currentPublicUrl` 仍为 `/images/products/...`。
- 路径变更历史：迁移源原位于 `client/public/images/products`（836 张原图），2026-08-19 经 SHA-256 基线 → 复制 → 逐文件复验后迁入 `server/migration-source/product-images/`；2026-08-26 又以同盘可逆移动退出部署项目，并按原基线逐文件复验，836/836 文件名、大小和 SHA-256 全匹配。决策与执行记录见 `docs/DECISIONS.md` A.13。
- 以下代码仅是离线迁移工具，不进入生产读取链；如需重新执行，必须先在独立维护副本中把归档恢复到 `server/migration-source/product-images/`：
  - `server/scripts/generate-product-image-manifest.js`（清单来源）
  - `server/scripts/migrate-product-media.ts`（受控媒体迁移的 legacy 来源）

## 第一阶段：生成迁移清单

仅在已恢复迁移源的独立维护副本中，从 `server` 目录执行：

```powershell
node scripts/generate-product-image-manifest.js
```

该命令只读取迁移源原图，并生成 `server/migration-output/product-images-manifest.json`。清单包含现有访问路径、文件类型、大小、修改时间和建议的对象存储键名。

完整迁移前，执行下列命令计算每张图片的 SHA-256，用于上传后的完整性校验。该操作会读取全部图片，耗时取决于磁盘速度：

```powershell
node scripts/generate-product-image-manifest.js --hash
```

生成器不会覆盖已有清单，避免误覆盖历史迁移记录。

## 完整性与备份状态

- **字节完整性锚点**：`server/migration-output/migration-baseline-20260819.csv`（迁移前逐文件 SHA-256 基线）；2026-08-26 项目外归档已再次按该基线复验，836/836 文件名、大小和 SHA-256 全匹配。
- **备份责任（须知晓）**：当前主归档位于 `G:\网站搭建2-外部资料文件夹\server-migration-source-20260826\product-images\`；较早冷快照位于 `G:\网站搭建2-外部资料\quarantine-2026-08-26\backups\migration-source-snapshot-20260819\`。两者均与项目处在同一磁盘，**不构成异地备份**；正式对象存储冷备仍待拍板。
- 磁盘单点风险：在原图归档进入异地备份链路前，宿主机磁盘故障仍可能丢失 836 张原始字节（压缩不可逆，无法从 public 活图再生）。

## 后续阶段

1. 根据清单把项目外原图归档复制到对象存储或异地冷备。
2. 对上传结果进行数量、文件大小和 SHA-256 校验。
3. 生成旧 URL 到新 CDN URL 的映射表。
4. 经批准后更新数据库中的 `ProductImage.url`。
5. 分批验证商品列表、详情页、后台图片管理与移动端展示。

项目外归档不得删除或改写；若再次调整位置，须先更新本文件与 `docs/DECISIONS.md`，并按「基线 → 复制/移动 → 复验 → 删源（如适用）」流程执行。生产 Compose 不得重新挂载该归档。
