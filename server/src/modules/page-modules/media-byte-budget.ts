/**
 * 发布期媒体字节预算门禁（G05/G08）。
 *
 * 背景：首页此前曾直出 7 张全尺寸 PNG（合计约 17.85 MiB）导致首屏过重。
 * 前端已统一接响应式派生图（srcset/WebP），但「超预算源文件」本身仍是运营债：
 * 派生图冷启动要重转码、源文件占用存储、极端单图甚至无法合理派生。本门禁在
 * 发布预检里按受控素材的**源文件字节数**（resolveReferences 统计的 sourceBytes）
 * 产出告警，让「超预算来源」在发布前被明确展示，而不是再次静默直出原图。
 *
 * 阈值依据 2026-10-07 实测基线：server/uploads/page-assets 17 文件合计约
 * 25.96 MiB，最大单张 3.58 MiB（约 3.41 MiB），首页 7 图合计约 17.85 MiB。
 * 因此警告阈值取「略高于当前最大单张 / 略高于当前首页总量」，避免对现状噪音，
 * 但能拦截未来更重的上传；硬阻断阈值只针对病理性单图（远超任何正常单图）。
 *
 * 语义：预算超支一律 WARNING（不阻断发布，经「不影响发布的提醒」弹窗展示），
 * 因为派生 WebP 可能仍很小、大 PNG 源并不必然导致运行时超预算；这与 G05
 * 「发布前明确展示超预算来源」而非「强制阻断」的验收一致。仅病理性单图
 * （perAssetErrorBytes 以上）升级为 ERROR 阻断，因为它已无法合理派生。
 */

import type { ContentTemplateIssue } from "./content-template-contract";
import type { ResolvedPublicationMediaItem } from "./media-publication-manifest";

const MiB = 1024 * 1024;

export const MEDIA_SOURCE_BYTE_BUDGET = {
  /** 单张受控素材源文件建议上限（实测最大单张 ≈3.41 MiB，留余量）。 */
  perAssetWarningBytes: 4 * MiB,
  /** 单张受控素材源文件硬阻断上限（病理性，远超任何正常单图）。 */
  perAssetErrorBytes: 12 * MiB,
  /** 单页受控素材源文件总量建议预算（首页 7 图 ≈17.85 MiB，留余量）。 */
  perPageWarningBytes: 24 * MiB,
} as const;

function formatBytes(bytes: number): string {
  if (bytes >= MiB) {
    const value = bytes / MiB;
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)} MiB`;
  }
  const KiB = 1024;
  if (bytes >= KiB) return `${Math.round(bytes / KiB)} KiB`;
  return `${bytes} B`;
}

function byteBudgetIssue(
  item: ResolvedPublicationMediaItem,
  severity: "warning" | "error",
  message: string,
): ContentTemplateIssue {
  return {
    code:
      severity === "error"
        ? "page-validation-media-source-oversize-blocking"
        : "page-validation-media-source-oversize",
    severity,
    layer: "page",
    path: item.context.path ?? "puckData",
    message,
    ...(item.assetId ? { assetId: item.assetId } : {}),
    ...(item.url ? { assetUrl: item.url } : {}),
  } as ContentTemplateIssue;
}

/**
 * 由受控素材源文件字节数产出发布期媒体字节预算 issue。
 * 只统计授权可读（已拿到 sourceBytes）的素材，避免在授权错误之上叠加字节告警。
 */
export function collectMediaByteBudgetIssues(
  items: readonly ResolvedPublicationMediaItem[] | undefined,
): ContentTemplateIssue[] {
  if (!items) return [];
  const sized = items.filter((item) => typeof item.sourceBytes === "number");
  const issues: ContentTemplateIssue[] = [];

  for (const item of sized) {
    const bytes = item.sourceBytes!;
    if (bytes > MEDIA_SOURCE_BYTE_BUDGET.perAssetErrorBytes) {
      issues.push(byteBudgetIssue(
        item,
        "error",
        `素材源文件 ${formatBytes(bytes)} 超过单张硬上限 ${formatBytes(MEDIA_SOURCE_BYTE_BUDGET.perAssetErrorBytes)}，请压缩或替换后再发布`,
      ));
    } else if (bytes > MEDIA_SOURCE_BYTE_BUDGET.perAssetWarningBytes) {
      issues.push(byteBudgetIssue(
        item,
        "warning",
        `素材源文件 ${formatBytes(bytes)} 超过单张建议上限 ${formatBytes(MEDIA_SOURCE_BYTE_BUDGET.perAssetWarningBytes)}，建议压缩后重新上传（前端已按响应式派生图分发）`,
      ));
    }
  }

  const totalBytes = sized.reduce((sum, item) => sum + (item.sourceBytes ?? 0), 0);
  if (totalBytes > MEDIA_SOURCE_BYTE_BUDGET.perPageWarningBytes) {
    issues.push({
      code: "page-validation-media-page-source-budget",
      severity: "warning",
      layer: "page",
      path: "puckData",
      message: `页面受控素材源文件总量 ${formatBytes(totalBytes)}，超过建议预算 ${formatBytes(MEDIA_SOURCE_BYTE_BUDGET.perPageWarningBytes)}，建议优先压缩首屏大图`,
    } as ContentTemplateIssue);
  }
  return issues;
}
