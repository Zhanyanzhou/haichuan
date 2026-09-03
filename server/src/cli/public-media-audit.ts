/**
 * 公开 uploads 目录存量审计（只读）：识别仍留在公开目录、但关联受限可见性商品的媒体。
 *
 * 用法：npm run build && node dist/cli/public-media-audit.js [--verbose]
 *
 * 背景：新上传默认进入 private-media；历史 /uploads/ 文件仍整体公开可读。
 * 本脚本只输出清单，不迁移、不删除任何数据；处置（迁移/断链）需按 AGENTS.md 单独授权。
 * 退出码：0=未发现受限关联；1=存在需处置的受限关联；2=执行失败。
 */
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";

export interface AuditRow {
  productId: number;
  productCode: string | null;
  productName: string;
  visibility: string;
  status: string;
  imageId: number;
  url: string;
  isVideo: boolean;
}

export interface AuditSummary {
  totalPublicImages: number;
  restrictedRows: AuditRow[];
  orphanCount: number;
  misplacedProofs: number;
  misplacedEvidence: number;
}

const RESTRICTED_VISIBILITIES = new Set(["MEMBER", "PARTNER"]);

/** 核心分类（纯函数，供测试复用） */
export function classifyPublicMedia(rows: AuditRow[]): {
  restricted: AuditRow[];
  byVisibility: Record<string, number>;
} {
  const restricted = rows.filter((row) => RESTRICTED_VISIBILITIES.has(row.visibility));
  const byVisibility = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.visibility] = (acc[row.visibility] || 0) + 1;
    return acc;
  }, {});
  return { restricted, byVisibility };
}

async function runAudit(): Promise<AuditSummary> {
  const prisma = new PrismaService();
  try {
    const images = await prisma.productImage.findMany({
      where: { url: { startsWith: "/uploads/" } },
      select: {
        id: true,
        url: true,
        isVideo: true,
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            visibility: true,
            status: true,
          },
        },
      },
    });
    const rows: AuditRow[] = images.map((image) => ({
      productId: image.product.id,
      productCode: image.product.code,
      productName: image.product.name,
      visibility: image.product.visibility,
      status: image.product.status,
      imageId: image.id,
      url: image.url,
      isVideo: image.isVideo,
    }));

    // 付款凭证只允许私有 storageKey（customerId/日期/uuid 形态）；出现 /uploads/ 前缀即错放
    const misplacedProofs = await prisma.payment.count({
      where: { proofUrl: { startsWith: "/uploads/" } },
    });
    // 售后证据图片应走受控上传；同样不应落在公开目录（Json 字段非空用 DbNull 过滤）
    const evidenceCases = await prisma.afterSalesCase.findMany({
      where: { NOT: { evidenceUrls: { equals: Prisma.DbNull } } },
      select: { evidenceUrls: true },
    });
    const misplacedEvidence = evidenceCases.filter((caseRecord) => {
      const urls = Array.isArray(caseRecord.evidenceUrls)
        ? (caseRecord.evidenceUrls as unknown[])
        : [];
      return urls.some((url) => typeof url === "string" && url.startsWith("/uploads/"));
    }).length;

    const { restricted } = classifyPublicMedia(rows);
    return {
      totalPublicImages: rows.length,
      restrictedRows: restricted,
      orphanCount: 0,
      misplacedProofs,
      misplacedEvidence,
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const verbose = process.argv.includes("--verbose");
  const summary = await runAudit();
  console.log(`公开目录(/uploads/)媒体总数：${summary.totalPublicImages}`);
  if (summary.misplacedProofs > 0) {
    console.log(`⚠ 付款凭证错放公开目录：${summary.misplacedProofs} 笔（应仅存 private-media storageKey）`);
  }
  if (summary.misplacedEvidence > 0) {
    console.log(`⚠ 售后证据错放公开目录：${summary.misplacedEvidence} 单`);
  }
  if (summary.restrictedRows.length === 0) {
    console.log("RESULT: CLEAN（未发现 MEMBER/PARTNER 可见性商品关联的公开媒体）");
    return;
  }
  console.log(`RESULT: RESTRICTED ${summary.restrictedRows.length} 项受限可见性商品仍引用公开媒体（需迁移或断链处置）：`);
  for (const row of summary.restrictedRows.slice(0, verbose ? undefined : 50)) {
    console.log(
      `  product#${row.productId}(${row.productCode ?? "-"} · ${row.productName}) visibility=${row.visibility} status=${row.status} -> ${row.url}${row.isVideo ? " [视频]" : ""}`,
    );
  }
  if (!verbose && summary.restrictedRows.length > 50) {
    console.log(`  …另有 ${summary.restrictedRows.length - 50} 项，使用 --verbose 查看全部`);
  }
  process.exitCode = 1;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(`审计执行失败：${error instanceof Error ? error.message : error}`);
    process.exit(2);
  });
}
