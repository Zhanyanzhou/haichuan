# 海川珠宝 — 清理计划

> 最后更新：2026-08-07 | 需逐项确认后执行

## 待删除

| 文件                      | 理由                   |
| ------------------------- | ---------------------- |
| `client/vite.config.js`   | 与 `.ts` 内容完全相同  |
| `client/vite.config.d.ts` | 自动生成，冗余         |
| `client/query`            | 仅含 "MySQL"，废弃文件 |
| `_local_backups/`         | 空目录                 |
| `to-upload/`              | 空目录                 |

## 待移动

| 当前路径              | 建议路径                            |
| --------------------- | ----------------------------------- |
| `batch-upload.mjs`    | `scripts/batch-upload.mjs`          |
| `create-products.mjs` | `scripts/create-products.mjs`       |
| `retry-upload.mjs`    | `scripts/retry-upload.mjs`          |
| `upload-products.csv` | `server/prisma/upload-products.csv` |
| `design-qa.md`        | `docs/design-qa.md`                 |

## 待确认清理（需用户决定）

| 目录/文件           | 文件数 | 内容         |
| ------------------- | ------ | ------------ |
| `design-qa/`        | 24     | 设计审查截图 |
| `design-qa-assets/` | 45     | 设计参考图   |
| `nav-design-qa/`    | 2      | 导航审查截图 |
| `nav-audit-assets/` | 4      | 导航审计截图 |

## 待确认的死代码（15 个组件）

### common/ 未引用

AdminConfirm, EmptyState, FilterPanel, ImageUpload, PageHeader, ProductCard

### ui/ 未引用

GlowCard, ParticleBg

### admin/ 未引用

ImageCropper

### blocks/ 旧版（仅通过注册表可达）

HeroBlock, CategoriesBlock, StoryBlock, ProductsBlock, CraftBlock, ContactBlock

## 待修复

| 问题                        | 方式                   |
| --------------------------- | ---------------------- |
| 5 处 `(this.prisma as any)` | `npx prisma generate`  |
| 图片 v1 双格式              | 确认引用后移除冗余格式 |
| 0 个测试                    | 逐步添加               |

## 清理后收益

- 减少约 75 个文件
- 移除 15 个可能死代码的组件
- 代码库更清晰
