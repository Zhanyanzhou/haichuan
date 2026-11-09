# 商品图片迁移

生产运行时只读取受控私有媒体，不挂载原图归档。

| 目录 | 角色 | 内容 |
| --- | --- | --- |
| `client/public/images/products/` | 线上运行态 | 43 张压缩活图（2.7 MB），继续以 `/images/products/` URL 提供服务 |
| `server/migration-output/migration-baseline-20260819.csv` | 仓库内字节基线 | 迁移前逐文件 SHA-256 |
| `server/migration-output/product-images-manifest.json` | 仓库内迁移清单 | 访问路径、大小和建议对象存储键名 |

836 张未压缩原图（2.09 GB）已不在本机，不能从 public 活图还原。迁移清单中的 `currentPublicUrl` 仍为 `/images/products/...`。决策记录见 `docs/DECISIONS.md` A.13。

`server/scripts/generate-product-image-manifest.js` 与 `server/scripts/migrate-product-media.ts` 只作为离线工具，不进入生产读取链。本机没有它们所需的原图目录。
