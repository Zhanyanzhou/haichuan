# 商品图片迁移

本流程用于将商品图片迁移到独立媒体存储，同时保留迁移源中的原图字节不变。

## 迁移源（2026-08-19 起）

| 目录 | 角色 | 内容 |
| --- | --- | --- |
| `server/migration-source/product-images/` | **迁移源（归档态）** | 836 张原始字节（2.09 GB），gitignore 收编 |
| `client/public/images/products/` | 线上运行态 | 43 张压缩活图（2.7 MB），继续以 `/images/products/` URL 提供服务 |

- 两者是同一资产的不同形态，**不是冲突版本**：public 中每张活图对应迁移源中一张未压缩原始字节（Sharp 无损降采样前备份）。
- URL 命名空间不变：迁移清单中的 `currentPublicUrl` 仍为 `/images/products/...`。
- 路径变更历史：迁移源原位于 `client/public/images/products`（836 张原图），2026-08-19 经 SHA-256 基线 → 复制 → 逐文件复验（836/836 文件名+大小+SHA-256 全匹配）→ 删源，迁入本目录。决策与执行记录见 `docs/DECISIONS.md` A.13。
- 引用该目录的代码（均支持 `PRODUCT_MEDIA_ROOT_LEGACY` 环境变量覆盖）：
  - `server/scripts/generate-product-image-manifest.js`（清单来源）
  - `server/src/modules/products/product-media.service.ts`（`legacyProductImageRoot` 存在性检查）
  - `server/scripts/migrate-product-media.ts`（受控媒体迁移的 legacy 来源）

## 第一阶段：生成迁移清单

在 `server` 目录执行：

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

- **字节完整性锚点**：`server/migration-output/migration-baseline-20260819.csv`（迁移前逐文件 SHA-256 基线）；2026-08-19 迁入本目录后已三方互证（基线、迁移后目录、新 manifest 的 SHA-256 集合完全一致）。
- **备份责任（须知晓）**：本目录已 gitignore 收编（版本库不管理），且 `docker-compose.yml` 的 backup 容器只挂载 `uploads`/`private-media` 两个命名卷，**不覆盖本目录**。当前冷快照：`backups/migration-source-snapshot-20260819/`（836 张全量拷贝）。`backups/` 为宿主机异地同步建议范围；正式方案（backup 挂载收编或对象存储冷备）待拍板。
- 磁盘单点风险：在本目录纳入备份链路前，宿主机磁盘故障即丢失 836 张原始字节（压缩不可逆，无法从 public 活图再生）。

## 后续阶段

1. 根据清单复制图片到对象存储或独立媒体目录。
2. 对上传结果进行数量、文件大小和 SHA-256 校验。
3. 生成旧 URL 到新 CDN URL 的映射表。
4. 经批准后更新数据库中的 `ProductImage.url`。
5. 分批验证商品列表、详情页、后台图片管理与移动端展示。

在整个迁移完成并稳定运行前，迁移源目录保持不变，不进行删除、移动或重命名；若必须调整位置，须先更新本文件与 `docs/DECISIONS.md`，并按上述「基线 → 复制 → 复验 → 删源」流程执行。
