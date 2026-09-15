import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient, type ProductVisibility, type Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { HttpExceptionFilter } from "../../common/filters/http-exception.filter";
import { TransformInterceptor } from "../../common/interceptors/transform.interceptor";

const databaseUrl = process.env.MEDIA_SESSION_REAL_MYSQL_URL?.trim();
const { validateTarget: validateSharedTarget } = require("../../../scripts/run-real-mysql-tests.cjs");

type JsonResult = {
  response: Response;
  body: any;
};

function validateTarget(value: string | undefined) {
  assert.equal(process.env.MEDIA_SESSION_REAL_MYSQL_TEST, "1");
  assert.ok(value);
  assert.equal(value, process.env.REAL_MYSQL_TEST_DATABASE_URL);
  return validateSharedTarget(process.env);
}

async function readJson(response: Response): Promise<JsonResult> {
  return { response, body: await response.json().catch(() => null) };
}

test(
  "真实 Nest HTTP + MySQL：会话撤销与商品媒体访问保持一致",
  {
    skip:
      databaseUrl && process.env.MEDIA_SESSION_REAL_MYSQL_TEST === "1"
        ? false
        : "需要显式提供一次性 MEDIA_SESSION_REAL_MYSQL_URL",
  },
  async (t) => {
    assert.equal(process.versions.node.split(".")[0], "22");
    const isolatedUrl = validateTarget(databaseUrl);
    const runId = process.env.MEDIA_SESSION_RUN_ID || randomUUID().slice(0, 10);
    const root = await mkdtemp(join(tmpdir(), `haichuan-media-session-${runId}-`));
    const publicRoot = join(root, "uploads");
    const privateRoot = join(root, "private-media", "products");
    const jwtSecret = `media-session-${randomUUID()}`;
    const previousEnvironment = new Map<string, string | undefined>();
    const setEnvironment = (key: string, value: string) => {
      previousEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    };
    setEnvironment("NODE_ENV", "test");
    setEnvironment("DATABASE_URL", isolatedUrl);
    setEnvironment("JWT_SECRET", jwtSecret);
    setEnvironment("RELEASE_PROFILE", "commerce");
    setEnvironment("CUSTOMER_COMMERCE_ENABLED", "false");
    setEnvironment("PAYMENT_GATEWAY_TRANSACTIONS_ENABLED", "false");
    setEnvironment("PAYMENT_GATEWAY_REFUNDS_ENABLED", "false");
    setEnvironment("CORS_ORIGIN", "http://127.0.0.1:5173");
    setEnvironment("PUBLIC_MEDIA_ROOT", publicRoot);
    setEnvironment("PRODUCT_MEDIA_ROOT", privateRoot);
    setEnvironment("PAGE_MEDIA_ARCHIVE_ROOT", join(root, "page-media-archive"));
    setEnvironment("PAYMENT_PROOF_MEDIA_ROOT", join(root, "payment-proofs"));

    await mkdir(publicRoot, { recursive: true });
    await mkdir(privateRoot, { recursive: true });
    const prisma = new PrismaClient({ datasourceUrl: isolatedUrl });
    let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
    await prisma.$connect();
    try {
      assert.deepEqual(
        [await prisma.user.count(), await prisma.customer.count(), await prisma.product.count()],
        [0, 0, 0],
      );
      const password = "R7!mQ2";
      const changedPassword = "T8!nW3";
      const passwordHash = await bcrypt.hash(password, 4);
      const marker = runId.replace(/[^a-z0-9]/gi, "").slice(0, 8).padEnd(8, "7");
      const createStaff = (role: Role) => prisma.user.create({
        data: {
          username: `media-${role.toLowerCase().replaceAll("_", "-")}-${marker}`,
          realName: `媒体会话-${role}`,
          password: passwordHash,
          role,
        },
      });
      const [superAdmin, admin, warehouse] = await Promise.all([
        createStaff("SUPER_ADMIN"),
        createStaff("ADMIN"),
        createStaff("WAREHOUSE"),
      ]);
      const customer = await prisma.customer.create({
        data: {
          phone: `139${marker.replace(/\D/g, "").padEnd(8, "7").slice(0, 8)}`,
          name: `媒体客户-${marker}`,
          passwordHash,
        },
      });
      const category = await prisma.category.create({
        data: { name: `媒体会话分类-${marker}`, slug: `media-session-${marker}` },
      });

      const createProductMedia = async (input: {
        code: string;
        visibility: ProductVisibility;
        storageKey: string;
        bytes: Buffer;
        legacyPublicPath?: string;
      }) => {
        const diskPath = input.legacyPublicPath
          ? join(publicRoot, ...input.legacyPublicPath.split("/"))
          : join(privateRoot, ...input.storageKey.split("/"));
        await mkdir(join(diskPath, ".."), { recursive: true });
        await writeFile(diskPath, input.bytes);
        const asset = await prisma.mediaAsset.create({
          data: {
            storageKey: input.storageKey,
            originalName: `${input.code}.mp4`,
            mimeType: "video/mp4",
            byteSize: input.bytes.byteLength,
            checksumSha256: createHash("sha256").update(input.bytes).digest("hex"),
            accessLevel: "PUBLIC",
            status: "READY",
            uploadedBy: superAdmin.id,
            authorization: {
              create: {
                sourceType: "BRAND_OWNED",
                authorizationBasis: "isolated session-media verification",
                evidenceReference: `local://${input.code}`,
                publicWebUseAllowed: true,
                reviewStatus: "APPROVED",
                preparedById: admin.id,
                submittedById: admin.id,
                submittedAt: new Date(),
                reviewedById: superAdmin.id,
                reviewedAt: new Date(),
              },
            },
          },
        });
        const product = await prisma.product.create({
          data: {
            code: input.code,
            name: `合成媒体作品-${input.code}`,
            categoryId: category.id,
            status: "PUBLISHED",
            publicationQualityStatus: "READY",
            visibility: input.visibility,
            salesMode: "DISPLAY_ONLY",
            publishedAt: new Date(),
          },
        });
        const image = await prisma.productImage.create({
          data: {
            productId: product.id,
            url: input.legacyPublicPath
              ? `/uploads/${input.legacyPublicPath}`
              : `/products/catalog/${product.id}/media/pending`,
            storageKey: input.legacyPublicPath ? null : input.storageKey,
            mediaAssetId: asset.id,
            type: "FRONT",
            isVideo: true,
            mimeType: "video/mp4",
            fileSize: input.bytes.byteLength,
          },
        });
        await prisma.product.update({
          where: { id: product.id },
          data: { primaryImageId: image.id, listingImageId: image.id },
        });
        return { product, image, bytes: input.bytes };
      };

      const memberMedia = await createProductMedia({
        code: `HC-MEMBER-${marker}`,
        visibility: "MEMBER",
        storageKey: `product-assets/${marker}-member.mp4`,
        bytes: Buffer.from(`member-controlled-${marker}`),
      });
      const legacyBypassMedia = await createProductMedia({
        code: `HC-LEGACY-${marker}`,
        visibility: "MEMBER",
        storageKey: `legacy/${marker}-member.mp4`,
        legacyPublicPath: `legacy/${marker}-member.mp4`,
        bytes: Buffer.from(`legacy-controlled-${marker}`),
      });
      const legacyPageAssetBypassMedia = await createProductMedia({
        code: `HC-PAGE-ASSET-${marker}`,
        visibility: "MEMBER",
        storageKey: `page-assets/${marker}-member.jpg`,
        legacyPublicPath: `page-assets/${marker}-member.jpg`,
        bytes: Buffer.from(`page-asset-controlled-${marker}`),
      });
      const partnerMedia = await createProductMedia({
        code: `HC-PARTNER-${marker}`,
        visibility: "PARTNER",
        storageKey: `product-assets/${marker}-partner.mp4`,
        bytes: Buffer.from(`partner-controlled-${marker}`),
      });
      const publicMedia = await createProductMedia({
        code: `HC-PUBLIC-${marker}`,
        visibility: "PUBLIC",
        storageKey: `product-assets/${marker}-public.mp4`,
        bytes: Buffer.from(`public-approved-${marker}`),
      });

      const { AppModule } = await import("../../app.module");
      app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
      app.setGlobalPrefix("api");
      app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }));
      app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
      app.useGlobalFilters(new HttpExceptionFilter());
      await app.listen(0, "127.0.0.1");
      const origin = await app.getUrl();
      const call = (path: string, token?: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
        return fetch(`${origin}${path}`, { ...init, headers });
      };
      const jsonCall = async (path: string, token?: string, init: RequestInit = {}) =>
        readJson(await call(path, token, init));
      const cookieSession = (response: Response, domain: "admin" | "customer") => {
        const setCookie = response.headers.get("set-cookie") || "";
        const accessName = `hc_${domain}_access`;
        const refreshName = `hc_${domain}_refresh`;
        const access = new RegExp(`${accessName}=([^;,\\s]+)`).exec(setCookie)?.[1];
        const refresh = new RegExp(`${refreshName}=([^;,\\s]+)`).exec(setCookie)?.[1];
        assert.ok(access, `${domain} access cookie missing`);
        assert.ok(refresh, `${domain} refresh cookie missing`);
        return {
          accessToken: decodeURIComponent(access),
          cookieHeader: `${accessName}=${access}; ${refreshName}=${refresh}`,
        };
      };
      const loginStaff = async (username: string) => {
        const result = await jsonCall("/api/auth/login", undefined, {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        assert.equal(result.response.status, 201);
        assert.equal(typeof result.body?.data?.accessToken, "string");
        return result.body.data.accessToken as string;
      };
      const loginStaffCookie = async (username: string) => {
        const result = await jsonCall("/api/auth/login", undefined, {
          method: "POST",
          headers: { Origin: "http://127.0.0.1:5173", "X-Session-Mode": "cookie" },
          body: JSON.stringify({ username, password }),
        });
        assert.equal(result.response.status, 201);
        return cookieSession(result.response, "admin");
      };
      const loginCustomer = async (loginPassword = password) => {
        const result = await jsonCall("/api/customers/login", undefined, {
          method: "POST",
          body: JSON.stringify({ phone: customer.phone, password: loginPassword }),
        });
        assert.equal(result.response.status, 201);
        assert.equal(typeof result.body?.data?.accessToken, "string");
        return result.body.data.accessToken as string;
      };
      const loginCustomerCookie = async (loginPassword = password) => {
        const result = await jsonCall("/api/customers/login", undefined, {
          method: "POST",
          headers: { Origin: "http://127.0.0.1:5173", "X-Session-Mode": "cookie" },
          body: JSON.stringify({ phone: customer.phone, password: loginPassword }),
        });
        assert.equal(result.response.status, 201);
        return cookieSession(result.response, "customer");
      };
      const mediaPath = (entry: typeof memberMedia) =>
        `/api/products/catalog/${entry.product.id}/media/${entry.image.id}`;
      const assertMedia = async (response: Response, expected: Buffer) => {
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control") || "", /no-store/);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
      };
      const assertRejectedMedia = async (response: Response, status: number) => {
        assert.equal(response.status, status);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.notDeepEqual(bytes, memberMedia.bytes);
        assert.match(response.headers.get("content-type") || "", /json/);
      };
      const jwt = new JwtService({ secret: jwtSecret });
      let unaffectedAdminToken = "";

      await t.test("旧 uploads 商品原文件不再形成等价公开读取旁路", async () => {
        await assertRejectedMedia(
          await call(`/uploads/legacy/${marker}-member.mp4`),
          404,
        );
        await assertRejectedMedia(
          await call(`/uploads/legacy/${marker}-member.mp4?width=480`),
          404,
        );
        for (const init of [{}, { method: "HEAD" }]) {
          const response = await call(`/uploads/page-assets/${marker}-member.jpg`, undefined, init);
          assert.equal(response.status, 404);
          assert.equal(Buffer.from(await response.arrayBuffer()).includes(legacyPageAssetBypassMedia.bytes), false);
        }
        await assertRejectedMedia(
          await call(`/uploads/page-assets/${marker}-member.jpg?width=480`),
          404,
        );
        await assertMedia(
          await call(`/api/products/public/${publicMedia.product.id}/media/${publicMedia.image.id}`),
          publicMedia.bytes,
        );
        assert.equal(legacyBypassMedia.image.url, `/uploads/legacy/${marker}-member.mp4`);
      });

      await t.test("员工混合 Cookie/Bearer 注销仅撤销 Bearer 所在会话家族", async () => {
        const cookie = await loginStaffCookie(admin.username);
        const bearer = await loginStaff(admin.username);
        const cookiePayload = jwt.decode(cookie.accessToken) as { sessionFamilyId?: string };
        const bearerPayload = jwt.decode(bearer) as { sessionFamilyId?: string };
        assert.notEqual(cookiePayload.sessionFamilyId, bearerPayload.sessionFamilyId);

        const rejected = await call("/api/auth/session/logout", "invalid.jwt.value", {
          method: "POST",
          headers: { Cookie: cookie.cookieHeader },
        });
        assert.equal(rejected.status, 401);
        await assertMedia(
          await call(mediaPath(memberMedia), undefined, { headers: { Cookie: cookie.cookieHeader } }),
          memberMedia.bytes,
        );

        const response = await call("/api/auth/session/logout", bearer, {
          method: "POST",
          headers: { Cookie: cookie.cookieHeader },
        });
        assert.equal(response.status, 201);
        await assertRejectedMedia(await call(mediaPath(memberMedia), bearer), 401);
        await assertMedia(
          await call(mediaPath(memberMedia), undefined, { headers: { Cookie: cookie.cookieHeader } }),
          memberMedia.bytes,
        );
        unaffectedAdminToken = cookie.accessToken;
      });

      await t.test("员工会话撤销、角色与停用状态在普通接口和媒体接口一致", async () => {
        const firstAdminToken = await loginStaff(admin.username);
        const secondAdminToken = unaffectedAdminToken;
        assert.ok(secondAdminToken);
        await assertMedia(await call(mediaPath(memberMedia), firstAdminToken), memberMedia.bytes);
        assert.equal((await call("/api/auth/profile", firstAdminToken)).status, 200);
        assert.equal(
          (await call("/api/auth/session/logout", firstAdminToken, { method: "POST" })).status,
          201,
        );
        assert.equal((await call("/api/auth/profile", firstAdminToken)).status, 401);
        await assertRejectedMedia(await call(mediaPath(memberMedia), firstAdminToken), 401);
        await assertMedia(await call(mediaPath(memberMedia), secondAdminToken), memberMedia.bytes);

        const warehouseToken = await loginStaff(warehouse.username);
        await assertRejectedMedia(await call(mediaPath(memberMedia), warehouseToken), 403);
        const superToken = await loginStaff(superAdmin.username);
        const disabled = await jsonCall(`/api/users/${warehouse.id}`, superToken, {
          method: "PUT",
          body: JSON.stringify({ status: "DISABLED" }),
        });
        assert.equal(disabled.response.status, 200);
        await assertRejectedMedia(await call(mediaPath(memberMedia), warehouseToken), 401);
      });

      await t.test("客户当前会话注销、全会话改密和对象权限在媒体入口即时生效", async () => {
        const firstCustomerToken = await loginCustomer();
        const secondCustomerToken = await loginCustomer();
        await assertMedia(await call(mediaPath(memberMedia), firstCustomerToken), memberMedia.bytes);
        assert.equal((await call("/api/customers/me", firstCustomerToken)).status, 200);
        await assertRejectedMedia(await call(mediaPath(partnerMedia), firstCustomerToken), 404);

        const firstPayload = jwt.decode(firstCustomerToken) as { sessionFamilyId?: string };
        assert.match(firstPayload.sessionFamilyId || "", /^[0-9a-f-]{36}$/i);
        assert.equal(
          (await call("/api/customers/session/logout", firstCustomerToken, { method: "POST" })).status,
          201,
        );
        assert.equal(
          await prisma.customerRefreshSession.count({
            where: { customerId: customer.id, familyId: firstPayload.sessionFamilyId, revokedAt: null },
          }),
          0,
        );
        assert.equal((await call("/api/customers/me", firstCustomerToken)).status, 401);
        await assertRejectedMedia(await call(mediaPath(memberMedia), firstCustomerToken), 401);
        await assertMedia(await call(mediaPath(memberMedia), secondCustomerToken), memberMedia.bytes);

        const passwordChanged = await jsonCall("/api/customers/me/password", secondCustomerToken, {
          method: "PUT",
          body: JSON.stringify({ currentPassword: password, newPassword: changedPassword }),
        });
        assert.equal(passwordChanged.response.status, 200);
        assert.equal(
          await prisma.customerRefreshSession.count({ where: { customerId: customer.id, revokedAt: null } }),
          0,
        );
        assert.equal((await call("/api/customers/me", secondCustomerToken)).status, 401);
        await assertRejectedMedia(await call(mediaPath(memberMedia), secondCustomerToken), 401);
        assert.equal(typeof await loginCustomer(changedPassword), "string");
      });

      await t.test("客户混合 Cookie/Bearer 注销仅撤销 Bearer 所在会话家族", async () => {
        const cookie = await loginCustomerCookie(changedPassword);
        const bearer = await loginCustomer(changedPassword);
        const cookiePayload = jwt.decode(cookie.accessToken) as { sessionFamilyId?: string };
        const bearerPayload = jwt.decode(bearer) as { sessionFamilyId?: string };
        assert.notEqual(cookiePayload.sessionFamilyId, bearerPayload.sessionFamilyId);

        const rejected = await call("/api/customers/session/logout", unaffectedAdminToken, {
          method: "POST",
          headers: { Cookie: cookie.cookieHeader },
        });
        assert.equal(rejected.status, 401);
        await assertMedia(
          await call(mediaPath(memberMedia), undefined, { headers: { Cookie: cookie.cookieHeader } }),
          memberMedia.bytes,
        );

        const response = await call("/api/customers/session/logout", bearer, {
          method: "POST",
          headers: { Cookie: cookie.cookieHeader },
        });
        assert.equal(response.status, 201);
        await assertRejectedMedia(await call(mediaPath(memberMedia), bearer), 401);
        await assertMedia(
          await call(mediaPath(memberMedia), undefined, { headers: { Cookie: cookie.cookieHeader } }),
          memberMedia.bytes,
        );
      });

      await t.test("缺失、错误身份域、无效与过期令牌都不返回受控字节", async () => {
        await assertRejectedMedia(await call(mediaPath(memberMedia)), 401);
        const wrongDomain = jwt.sign({
          sub: customer.id,
          type: "unknown",
          tokenUse: "access",
        });
        await assertRejectedMedia(await call(mediaPath(memberMedia), wrongDomain), 401);
        const expired = jwt.sign(
          { sub: admin.id, type: "admin", tokenUse: "access" },
          { expiresIn: -1 },
        );
        await assertRejectedMedia(await call(mediaPath(memberMedia), expired), 401);
        await assertRejectedMedia(await call(mediaPath(memberMedia), "invalid.jwt.value"), 401);
      });
    } finally {
      if (app) await app.close();
      await prisma.$disconnect();
      await rm(root, { recursive: true, force: true });
      for (const [key, previous] of previousEnvironment) {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      }
    }
  },
);
