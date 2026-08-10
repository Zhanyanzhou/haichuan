# 商品图片迁移

本流程用于将商品图片迁移到独立媒体存储，同时保留 `client/public/images/products` 中的原图不变。

## 第一阶段：生成迁移清单

在 `server` 目录执行：

```powershell
node scripts/generate-product-image-manifest.js
```

该命令只读取原图，并生成 `server/migration-output/product-images-manifest.json`。清单包含现有访问路径、文件类型、大小、修改时间和建议的对象存储键名。

完整迁移前，执行下列命令计算每张图片的 SHA-256，用于上传后的完整性校验。该操作会读取全部图片，耗时取决于磁盘速度：

```powershell
node scripts/generate-product-image-manifest.js --hash
```

生成器不会覆盖已有清单，避免误覆盖历史迁移记录。

## 后续阶段

1. 根据清单复制图片到对象存储或独立媒体目录。
2. 对上传结果进行数量、文件大小和 SHA-256 校验。
3. 生成旧 URL 到新 CDN URL 的映射表。
4. 经批准后更新数据库中的 `ProductImage.url`。
5. 分批验证商品列表、详情页、后台图片管理与移动端展示。

在整个迁移完成并稳定运行前，原图目录保持不变，不进行删除、移动或重命名。
