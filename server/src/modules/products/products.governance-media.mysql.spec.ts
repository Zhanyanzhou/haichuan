import "reflect-metadata";
import * as assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { ForbiddenException, Module, NotFoundException, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaClient } from "@prisma/client";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtStrategy } from "../auth/jwt.strategy";
import { CustomerAuthGuard } from "../customers/customer-auth.guard";
import { UploadService } from "../upload/upload.service";
import { ProductAccessService } from "./product-access.service";
import { CustomerOrStaffGuard } from "./customer-or-staff.guard";
import { ProductMediaService } from "./product-media.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

const databaseUrl = process.env.PRODUCT_GOV_REAL_MYSQL_URL?.trim();
const jwtSecret = "isolated-product-governance-http-secret";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({ secret: jwtSecret }),
  ],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductMediaService,
    ProductAccessService,
    JwtAuthGuard,
    JwtStrategy,
    RolesGuard,
    CustomerAuthGuard,
    CustomerOrStaffGuard,
    { provide: UploadService, useValue: {} },
  ],
})
class ProductGovernanceRealHttpModule {}

function validateTarget(value: string | undefined) {
  assert.equal(process.env.PRODUCT_GOV_REAL_MYSQL_TEST, "1");
  assert.ok(value);
  const target = new URL(value);
  assert.equal(target.protocol, "mysql:");
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
  assert.equal(target.pathname, "/haichuan_gov_test");
  assert.equal(target.search, "");
  assert.equal(target.hash, "");
  return target.href;
}

test(
  "真实 MySQL：发布角色、媒体授权撤销/到期、重启与恢复闭环",
  {
    skip:
      databaseUrl && process.env.PRODUCT_GOV_REAL_MYSQL_TEST === "1"
        ? false
        : "需要显式提供一次性 PRODUCT_GOV_REAL_MYSQL_URL",
  },
  async () => {
    assert.equal(process.versions.node.split(".")[0], "22");
    const isolatedUrl = validateTarget(databaseUrl);
    const mediaRoot = join(tmpdir(), "haichuan-product-governance-real");
    process.env.DATABASE_URL = isolatedUrl;
    process.env.PRODUCT_MEDIA_ROOT = mediaRoot;
    process.env.RELEASE_PROFILE = "commerce";
    process.env.JWT_SECRET = jwtSecret;
    process.env.NODE_ENV = "test";
    await rm(mediaRoot, { recursive: true, force: true });

    const prisma = new PrismaClient({ datasourceUrl: isolatedUrl });
    let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
    await prisma.$connect();
    try {
      assert.deepEqual(
        [await prisma.user.count(), await prisma.product.count(), await prisma.mediaAsset.count()],
        [0, 0, 0],
      );
      const admin = await prisma.user.create({
        data: { username: "gov-admin", password: "unused", role: "ADMIN" },
      });
      const editor = await prisma.user.create({
        data: { username: "gov-editor", password: "unused", role: "EDITOR" },
      });
      const reviewer = await prisma.user.create({
        data: { username: "gov-reviewer", password: "unused", role: "SUPER_ADMIN" },
      });
      const category = await prisma.category.create({
        data: { name: "隔离分类", slug: "isolated-governance" },
      });
      const storageKey = "product-assets/isolated/authorized.png";
      await mkdir(join(mediaRoot, "product-assets", "isolated"), { recursive: true });
      await writeFile(join(mediaRoot, storageKey), Buffer.from("synthetic-product-media"));
      const asset = await prisma.mediaAsset.create({
        data: {
          storageKey,
          originalName: "authorized.png",
          mimeType: "image/png",
          byteSize: 23,
          checksumSha256: "0".repeat(64),
          accessLevel: "PUBLIC",
          status: "READY",
          uploadedBy: editor.id,
          authorization: {
            create: {
              revision: 3,
              publicUseEpoch: 1,
              sourceType: "BRAND_OWNED",
              authorizationBasis: "isolated governance verification",
              evidenceReference: "local://governance/authorized.png",
              publicWebUseAllowed: true,
              reviewStatus: "APPROVED",
              preparedById: editor.id,
              submittedById: editor.id,
              submittedAt: new Date(),
              reviewedById: reviewer.id,
              reviewedAt: new Date(),
            },
          },
        },
      });
      const product = await prisma.product.create({
        data: {
          code: "HC-GOV-ISOLATED-01",
          name: "金质工艺作品",
          shortDescription: "用于隔离环境验证的金质工艺作品简介",
          description: "用于隔离环境验证授权边界、发布边界与即时撤权行为的完整作品说明。",
          detailContent: { sections: [{ type: "text", value: "金质工艺与细节说明" }] },
          categoryId: category.id,
          goldWeight: 1,
          weight: 1,
          status: "DRAFT",
          visibility: "PUBLIC",
          salesMode: "DISPLAY_ONLY",
        },
      });
      const image = await prisma.productImage.create({
        data: {
          productId: product.id,
          url: `/products/catalog/${product.id}/media/pending`,
          storageKey,
          mediaAssetId: asset.id,
          type: "FRONT",
          isVideo: false,
          mimeType: "image/png",
        },
      });
      await prisma.product.update({
        where: { id: product.id },
        data: {
          primaryImageId: image.id,
          listingImageId: image.id,
        },
      });

      app = await NestFactory.create(ProductGovernanceRealHttpModule, {
        abortOnError: false,
        logger: false,
      });
      app.setGlobalPrefix("api");
      app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }));
      await app.listen(0, "127.0.0.1");
      const origin = await app.getUrl();
      const jwt = app.get(JwtService);
      const editorToken = await jwt.signAsync({ sub: editor.id, type: "admin", tokenUse: "access" });
      const adminToken = await jwt.signAsync({ sub: admin.id, type: "admin", tokenUse: "access" });
      const call = (path: string, token?: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(`${origin}${path}`, { ...init, headers });
      };
      const jsonCall = (path: string, token: string, method: string, body?: unknown) =>
        call(path, token, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

      assert.equal(
        (await jsonCall(`/api/products/${product.id}/status`, editorToken, "PUT", { status: "PUBLISHED" })).status,
        403,
      );
      assert.equal(
        (await jsonCall(`/api/products/${product.id}/submit-review`, "invalid.jwt.token", "POST")).status,
        401,
      );
      assert.equal(
        (await call(`/api/products/${product.id}/submit-review`, undefined, { method: "POST" })).status,
        401,
      );
      assert.equal(
        (await jsonCall(`/api/products/${product.id}/submit-review`, editorToken, "POST")).status,
        201,
      );
      const reviewListResponse = await call("/api/products?page=1&pageSize=20", adminToken);
      assert.equal(reviewListResponse.status, 200);
      const reviewList = await reviewListResponse.json() as {
        list: Array<{ id: number; reviewStatus?: string }>;
      };
      assert.equal(
        reviewList.list.find((item) => item.id === product.id)?.reviewStatus,
        "IN_REVIEW",
      );

      const frozenWrites = [
        jsonCall(`/api/products/${product.id}`, editorToken, "PUT", { name: "编辑审核后修改" }),
        jsonCall(`/api/products/${product.id}`, adminToken, "PUT", { name: "管理员审核后修改" }),
        jsonCall(`/api/products/${product.id}/skus`, adminToken, "POST", {
          skuCode: "LOCKED-SKU",
          material: "GOLD_999",
          price: 1,
          isActive: true,
        }),
        jsonCall(`/api/products/${product.id}/images/${image.id}`, adminToken, "PUT", { sortOrder: 2 }),
        jsonCall(`/api/products/${product.id}/tags`, adminToken, "PUT", { tags: ["审核后标签"] }),
        jsonCall(`/api/products/${product.id}/attributes`, adminToken, "PUT", { attributeValueIds: [] }),
        jsonCall(`/api/products/${product.id}/certificates`, adminToken, "POST", {
          certType: "GIA",
          certNumber: "LOCKED-CERT",
        }),
        jsonCall(`/api/products/${product.id}/status`, adminToken, "PUT", { status: "OFFLINE" }),
      ];
      assert.deepEqual(
        await Promise.all(frozenWrites).then((responses) => responses.map((response) => response.status)),
        [409, 409, 409, 409, 409, 409, 409, 409],
      );

      assert.equal(
        (await jsonCall(`/api/products/${product.id}/status`, adminToken, "PUT", { status: "DRAFT" })).status,
        200,
      );
      const returnedName = "退回后允许修改的金质工艺作品";
      assert.equal(
        (await jsonCall(`/api/products/${product.id}`, editorToken, "PUT", { name: returnedName })).status,
        200,
      );

      const concurrentName = "并发提交前完成的金质工艺作品";
      const [concurrentUpdate, concurrentSubmit] = await Promise.all([
        jsonCall(`/api/products/${product.id}`, editorToken, "PUT", { name: concurrentName }),
        jsonCall(`/api/products/${product.id}/submit-review`, editorToken, "POST"),
      ]);
      assert.equal(concurrentSubmit.status, 201);
      assert.ok([200, 409].includes(concurrentUpdate.status));

      const submittedReview = await prisma.operationLog.findFirst({
        where: { targetId: product.id, action: "product.review.submit" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      assert.ok(submittedReview);
      const submittedDetail = JSON.parse(String(submittedReview.detail)) as {
        productUpdatedAt: string;
      };
      const productAtReview = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      assert.equal(
        productAtReview.name,
        concurrentUpdate.status === 200 ? concurrentName : returnedName,
      );
      assert.equal(productAtReview.updatedAt.toISOString(), submittedDetail.productUpdatedAt);

      assert.equal(
        (await jsonCall(`/api/products/${product.id}/status`, adminToken, "PUT", { status: "PUBLISHED" })).status,
        200,
      );

      const makeService = () =>
        new ProductsService(
          prisma as never,
          new ProductMediaService(),
          {} as never,
        );
      let service = makeService();
      assert.equal((await service.findPublic({ ids: String(product.id) })).total, 1);
      await assert.rejects(
        () => service.update(product.id, { name: "越权修改" } as never, editor as never),
        ForbiddenException,
      );
      const publishAudit = await prisma.operationLog.findFirst({
          where: { targetId: product.id, action: "product.publish", userId: admin.id },
        });
      assert.ok(publishAudit);
      assert.equal(
        (JSON.parse(String(publishAudit.detail)) as { reviewSubmissionId?: number }).reviewSubmissionId,
        submittedReview.id,
      );
      assert.ok(
        await prisma.operationLog.findFirst({
          where: { targetId: product.id, action: "product.review.return", userId: admin.id },
        }),
      );

      await prisma.mediaAssetAuthorization.update({
        where: { assetId: asset.id },
        data: {
          revision: { increment: 1 },
          publicUseEpoch: { increment: 1 },
          revocationStatus: "REVOKED",
          revokedById: reviewer.id,
          revokedAt: new Date(),
          revocationReason: "isolated revoke verification",
        },
      });
      assert.equal((await service.findPublic({ ids: String(product.id) })).total, 0);
      const publicListResponse = await call(`/api/products/public?ids=${product.id}`);
      assert.equal(publicListResponse.status, 200);
      assert.equal((await publicListResponse.json() as { total: number }).total, 0);
      assert.equal((await call(`/api/products/public/${product.id}/media/${image.id}`)).status, 404);
      const response = { setHeader: () => undefined, end: () => undefined };
      await assert.rejects(
        () => service.servePublicMedia(product.id, image.id, response as never),
        NotFoundException,
      );

      service = makeService();
      assert.equal((await service.findPublic({ ids: String(product.id) })).total, 0, "进程重建后仍保持撤权");

      await prisma.mediaAssetAuthorization.update({
        where: { assetId: asset.id },
        data: {
          revision: { increment: 1 },
          revocationStatus: "ACTIVE",
          revokedById: null,
          revokedAt: null,
          revocationReason: null,
          validUntil: new Date(Date.now() + 60_000),
        },
      });
      assert.equal((await service.findPublic({ ids: String(product.id) })).total, 1, "恢复授权后重新可见");
      await prisma.mediaAssetAuthorization.update({
        where: { assetId: asset.id },
        data: { revision: { increment: 1 }, validUntil: new Date(Date.now() - 1_000) },
      });
      assert.equal((await service.findPublic({ ids: String(product.id) })).total, 0, "授权到期后新请求立即不可见");
    } finally {
      await app?.close();
      await prisma.$disconnect();
      await rm(mediaRoot, { recursive: true, force: true });
    }
  },
);
