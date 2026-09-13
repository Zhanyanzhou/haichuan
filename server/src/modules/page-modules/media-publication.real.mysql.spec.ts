import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MediaAuthorizationResolverService } from "../upload/media-authorization-resolver.service";
import { PageModulesService } from "./page-modules.service";

const { validateTarget } = require("../../../scripts/run-real-mysql-tests.cjs");
const databaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL;

test(
  "真实 MySQL：页面发布继承精确授权，文件漂移拒绝再发布，撤权后公开读取失败关闭",
  { skip: databaseUrl ? false : "需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL" },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env), "媒体发布测试必须使用显式隔离库");
    const publicRoot = await mkdtemp(join(tmpdir(), "haichuan-media-publication-"));
    const previousPublicRoot = process.env.PUBLIC_MEDIA_ROOT;
    process.env.PUBLIC_MEDIA_ROOT = publicRoot;
    const prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    try {
      const marker = randomUUID().replaceAll("-", "").slice(0, 16);
      const storageKey = `page-assets/publication-${marker}.png`;
      const original = Buffer.from(`approved-media-${marker}`, "utf8");
      const managedUrl = `/uploads/${storageKey}`;
      await mkdir(join(publicRoot, "page-assets"), { recursive: true });
      await writeFile(join(publicRoot, storageKey), original);

      const submitter = await prisma.user.create({
        data: {
          username: `media-publish-submitter-${marker}`,
          password: "isolated-fixture-no-login",
          realName: "素材提交人",
          role: "EDITOR",
          status: "ACTIVE",
        },
      });
      const reviewer = await prisma.user.create({
        data: {
          username: `media-publish-reviewer-${marker}`,
          password: "isolated-fixture-no-login",
          realName: "素材审核人",
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      const asset = await prisma.mediaAsset.create({
        data: {
          storageKey,
          originalName: `publication-${marker}.png`,
          mimeType: "image/png",
          byteSize: original.byteLength,
          checksumSha256: createHash("sha256").update(original).digest("hex"),
          accessLevel: "PUBLIC",
          status: "READY",
          integrityCheckedAt: new Date(),
          uploadedBy: submitter.id,
        },
      });
      await prisma.mediaAssetAuthorization.create({
        data: {
          assetId: asset.id,
          revision: 1,
          publicUseEpoch: 0,
          sourceType: "BRAND_OWNED",
          authorizationBasis: "隔离测试品牌自有素材",
          evidenceReference: `isolated-test://${marker}`,
          publicWebUseAllowed: true,
          reviewStatus: "APPROVED",
          preparedById: submitter.id,
          submittedById: submitter.id,
          submittedAt: new Date(),
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
        },
      });

      const resolver = new MediaAuthorizationResolverService(prisma);
      const pages = new PageModulesService(prisma, resolver);
      const puckData = {
        content: [{
          type: "首屏主视觉",
          props: {
            id: `managed-hero-${marker}`,
            title: "已通过集中授权的珠宝作品",
            desktopImage: managedUrl,
            mobileImage: "/images/system/product-placeholder.svg",
            altText: "珠宝作品",
            actionText: "",
            targetType: "none",
            productId: 0,
            linkUrl: "",
          },
        }],
        root: { props: {} },
        zones: {},
      };
      const metadata = {
        seoTitle: "媒体发布继承隔离测试",
        seoDescription: "验证集中授权、文件完整性和撤权传播。",
        contentOwner: "自动化测试",
        mediaRights: [{
          assetUrl: managedUrl,
          source: "品牌自有拍摄",
          authorizationId: `MEDIA-${marker}`,
        }],
      };
      const saved = await pages.saveLocalizedPageDocument(
        "home",
        "en",
        puckData,
        metadata,
        "ci-real-mysql",
      );
      assert.ok(saved);
      const submitted = await pages.submitLocalizedPageDocumentReview(
        "home",
        "en",
        saved.updatedAt.toISOString(),
        saved.contentHash,
        submitter.id,
      );
      const approved = await pages.reviewLocalizedPageDocument(
        "home",
        "en",
        "APPROVE",
        submitted.updatedAt.toISOString(),
        submitted.contentHash,
        reviewer.id,
      );

      await writeFile(join(publicRoot, storageKey), Buffer.from("tampered", "utf8"));
      await assert.rejects(
        () => pages.publishLocalizedPageDocument(
          "home",
          "en",
          reviewer.id,
          approved.updatedAt.toISOString(),
          approved.contentHash,
        ),
        (error: unknown) => JSON.stringify(error).includes("ASSET_INTEGRITY_MISMATCH")
          || (error instanceof Error && error.message.includes("校验和不一致")),
      );
      assert.equal(
        await prisma.pageDocumentRevision.count({ where: { documentId: saved.id } }),
        0,
        "完整性失败必须保持发布事务零新增 revision",
      );
      assert.equal(await pages.getLocalizedPublishedPageDocument("home", "en"), null);

      await writeFile(join(publicRoot, storageKey), original);
      const published = await pages.publishLocalizedPageDocument(
        "home",
        "en",
        reviewer.id,
        approved.updatedAt.toISOString(),
        approved.contentHash,
      );
      assert.ok(published.publishedRevisionId);
      const manifest = await prisma.pageDocumentRevisionMediaAsset.findMany({
        where: { pageDocumentRevisionId: published.publishedRevisionId! },
      });
      assert.equal(manifest.length, 1);
      assert.equal(manifest[0]!.assetId, asset.id);
      assert.equal(manifest[0]!.assetLifecycleRevision, 1);
      assert.equal(manifest[0]!.authorizationRevision, 1);
      assert.equal(manifest[0]!.publicUseEpoch, 0);
      assert.equal(
        (await pages.getLocalizedPublishedPageDocument("home", "en"))?.status,
        "PUBLISHED",
      );
      await prisma.mediaAssetAuthorization.update({
        where: { assetId: asset.id },
        data: {
          revision: { increment: 1 },
          publicUseEpoch: { increment: 1 },
          revocationStatus: "REVOKED",
          revokedById: reviewer.id,
          revokedAt: new Date(),
          revocationReason: "隔离测试撤权",
        },
      });
      const publicAfterRevocation = await pages.getLocalizedPublishedPageDocument("home", "en");
      assert.equal(publicAfterRevocation?.status, "INVALID");
      assert.equal(
        "puckData" in (publicAfterRevocation ?? {}),
        false,
        "撤权后公开接口不得继续返回已发布正文",
      );
    } finally {
      await prisma.$disconnect();
      if (previousPublicRoot === undefined) delete process.env.PUBLIC_MEDIA_ROOT;
      else process.env.PUBLIC_MEDIA_ROOT = previousPublicRoot;
      await rm(publicRoot, { recursive: true, force: true });
    }
  },
);
