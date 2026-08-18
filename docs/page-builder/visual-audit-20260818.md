# 视觉横切审计 — 空态/预览/编辑器表面（2026-08-18 P0-D）

> 依据：内容模板规范化计划 P0-D。横切标准（用户 2026-08-18 需求说明书）：
> 纯白或象牙白、石墨黑、浅石灰与中石灰、低饱和灰线、单一香槟金仅用于编号/热点/播放/分页/CTA 等识别符；
> 禁止大面积米黄、土黄、咖啡、卡其、橄榄灰、多种金色、渐变、厚阴影、仿材质。
> 本批只整改**空态与编辑器表面**（运营高频可见）；区块正文完整色彩 token 化列入后续批次。

## 一、审计范围与结论

| 表面 | 文件 | 结论 |
| --- | --- | --- |
| 模板库/总览预览骨架 | `page-builder/preview/ContentTemplateSkeletonPreview.tsx` | 灰阶合规；accent 金原为非标 `#B49768`，**已统一**到品牌金令牌 `#B8944E`（UI_GUIDE.md:215） |
| 画布合同框架 | `page-builder/runtime/ContentTemplateContractFrame.tsx` | 灰阶合规；accent `#B8944E` 与令牌一致 ✓ |
| 画布空态占位 | `components/blocks/_shared/BlockEmptyPlaceholder.tsx` | 原为蓝灰科技色（`#3687F5`/`#DCE3EE`/`#667085`/`#98A2B3`）+ 渐变背景，**全面不合规，已重绘**：纯白底、灰线 `#D7D5D0`、石墨 `#66645F`、香槟金识别符；新增 `ratio`（契约比例框）与 `tone`（暗色表面）参数 |
| 媒体容器缺省底色 | 6 处 `#E7DDCE` 米黄（DoublePoster×2 / Carousel / BeforeAfter / Hero / AsymmetricGallery） | **已统一**为浅石灰 `#E4E3DF`（与 ContractFrame surface-strong 同值） |

## 二、后续整改清单（本批不动，防范围爆炸）

以下为 blocks 目录色值全量统计（`#B8944E` ×33 为唯一合规金）中的残留项：

1. **金色家族膨胀**（"多种金色"违规，正文小面积用色）：
   - `#8E6A35` ×4（FeaturedProductBlock 价格/次按钮文字、ImageTextBlock 次按钮）
   - `#9F7941` ×2（ProductRowBlock 行动链接/hover）
   - `#9A753E`（FeaturedProductBlock eyebrow）
   - 建议统一收敛到 `#B8944E` 或纳入设计令牌的 muted-gold 档位
2. **champagne 配色预设与标准冲突**：`designSystem/tokens.ts` TONE_PRESETS.champagne 背景 `#F5EDE0`（米黄大面积）、gold `#9A7B3E`——该预设整体方向与新标准冲突，需产品决策（改预设 or 下架预设）
3. **暖米色小面积残留**：`#F5F2ED`×3、`#F7F4EE`×2、`#EDE6DC`、`#F3F0E9`、`#EFE9E0` 等（多为文字底/卡片底的小面积暖白）——待完整 token 化时归类：可保留的暖白并入"象牙白"档，不可保留的改石灰
4. **单例异色**：`#F7F8FB`（冷白偏蓝，应为 `#F7F8F9` 或白）、`#6B5735`/`#776D63`/`#A89A87`（橄榄/卡其灰系）
5. `utils/placeholder.ts` 的 goldColors 数组 4 色（`#B8944E`/`#C9AD84`/`#D4C5A2`/`#8A7F72`）——占位图生成器用，非页面渲染，暂列观察

## 三、整改验证

- `npm run typecheck:client` ✓
- 浏览器实测（画布空态/模板库预览观感）待 P0 收尾统一进行（见计划 P0 验证节）
