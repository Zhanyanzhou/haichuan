import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { request as rawHttpRequest } from 'node:http';
import { NestFactory, Reflector } from '@nestjs/core';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { MediaAuthorizationService } from './media-authorization.service';
import { MediaAuthorizationResolverService } from './media-authorization-resolver.service';
import { PublicUploadsGateway } from './public-uploads.gateway';

const sharp = require('sharp');
const databaseUrl = process.env.MEDIA_REAL_MYSQL_URL?.trim();
const nginxUrl = process.env.MEDIA_REAL_NGINX_URL?.trim();
const { validateTarget: validateSharedTarget } = require('../../../scripts/run-real-mysql-tests.cjs');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({ secret: process.env.JWT_SECRET }),
    }),
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    PublicUploadsGateway,
    MediaAuthorizationService,
    MediaAuthorizationResolverService,
    JwtAuthGuard,
    JwtStrategy,
    RolesGuard,
    CustomerAuthGuard,
    CustomerCommerceGuard,
  ],
})
class MediaUploadRealHttpModule {}

type ApiResult = { status: number; body: unknown; data: Record<string, unknown> | null };

function validateTarget(value: string | undefined) {
  assert.equal(process.env.MEDIA_REAL_MYSQL_TEST, '1', '必须显式声明 MEDIA_REAL_MYSQL_TEST=1');
  assert.ok(value, '必须显式提供 MEDIA_REAL_MYSQL_URL');
  if (
    process.env.REAL_MYSQL_TEST_ISOLATED === '1'
    && value === process.env.REAL_MYSQL_TEST_DATABASE_URL
  ) {
    return validateSharedTarget(process.env);
  }
  const target = new URL(value);
  assert.equal(target.protocol, 'mysql:');
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.match(target.pathname, /^\/haichuan_media_[a-z0-9]{6,12}$/);
  assert.equal(target.username, 'hc_media');
  assert.ok(target.password);
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
  return target.href;
}

function validateLocalHttpOrigin(value: string) {
  const target = new URL(value);
  assert.equal(target.protocol, 'http:');
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.match(target.port, /^\d{4,5}$/);
  assert.equal(target.pathname, '/');
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
  return target.origin;
}

function rawStatus(origin: string, path: string): Promise<number> {
  const target = new URL(origin);
  return new Promise((resolvePromise, reject) => {
    const request = rawHttpRequest({
      hostname: target.hostname,
      port: target.port,
      method: 'GET',
      path,
    }, (response) => {
      response.resume();
      response.on('end', () => resolvePromise(response.statusCode || 0));
    });
    request.on('error', reject);
    request.end();
  });
}

async function jsonResult(response: Response): Promise<ApiResult> {
  const body = await response.json().catch(() => null);
  const envelope = body as { data?: Record<string, unknown> } | null;
  return {
    status: response.status,
    body,
    data: envelope?.data ?? null,
  };
}

function formWith(buffer: Buffer, type: string, filename: string) {
  const form = new FormData();
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  form.append('file', new Blob([bytes], { type }), filename);
  return form;
}

function mp4Box(type: string, payload: Buffer) {
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.length, 0);
  box.write(type, 4, 4, 'ascii');
  payload.copy(box, 8);
  return box;
}

test(
  '真实 Nest HTTP + MySQL + 文件系统：页面素材登记、访问、失败关闭、归档恢复与重启持久化',
  {
    skip: databaseUrl && process.env.MEDIA_REAL_MYSQL_TEST === '1'
      ? false
      : '需要显式提供本任务一次性 MEDIA_REAL_MYSQL_URL',
  },
  async () => {
    assert.equal(process.versions.node.split('.')[0], '22', '真实素材闭环必须在 Node 22 下运行');
    const isolatedDatabaseUrl = validateTarget(databaseUrl);
    const runId = process.env.MEDIA_REAL_RUN_ID?.trim() || '';
    assert.match(runId, /^[a-z0-9]{6,12}$/);
    const port = Number(process.env.MEDIA_REAL_API_PORT);
    assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
    const directOrigin = `http://127.0.0.1:${port}`;
    const publicOrigins = [directOrigin, ...(nginxUrl ? [validateLocalHttpOrigin(nginxUrl)] : [])];

    const mediaRoot = join(tmpdir(), `haichuan-media-http-${runId}`);
    const publicRoot = join(mediaRoot, 'uploads');
    // 公共根位于系统临时盘，归档根位于工作区临时目录；在 Windows 上同时覆盖跨卷 EXDEV 回退。
    const archiveRoot = join(process.cwd(), '..', '.codex-tmp', `media-archive-${runId}`);
    const paymentProofRoot = join(mediaRoot, 'private-media', 'payment-proofs');
    process.env.PUBLIC_MEDIA_ROOT = publicRoot;
    process.env.PAGE_MEDIA_ARCHIVE_ROOT = archiveRoot;
    process.env.PAYMENT_PROOF_MEDIA_ROOT = paymentProofRoot;
    process.env.DATABASE_URL = isolatedDatabaseUrl;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = `media-${runId}-local-isolated-secret`;
    process.env.HOST = '127.0.0.1';
    process.env.RELEASE_PROFILE = 'commerce';
    process.env.CUSTOMER_COMMERCE_ENABLED = 'true';
    await rm(mediaRoot, { recursive: true, force: true });
    await rm(archiveRoot, { recursive: true, force: true });
    await mkdir(publicRoot, { recursive: true });

    const prisma = new PrismaClient({ datasourceUrl: isolatedDatabaseUrl });
    await prisma.$connect();
    assert.deepEqual(
      [await prisma.user.count(), await prisma.mediaAsset.count()],
      [0, 0],
      '真实素材验收必须从空的一次性业务库开始',
    );
    const staff = await prisma.user.create({
      data: {
        username: `media-admin-${runId}`,
        password: 'not-used-by-token-test',
        realName: `素材验收-${runId}`,
        role: 'ADMIN',
      },
    });
    const unauthorizedStaff = await prisma.user.create({
      data: {
        username: `media-cs-${runId}`,
        password: 'not-used-by-token-test',
        realName: `素材越权验收-${runId}`,
        role: 'CUSTOMER_SERVICE',
      },
    });
    const reviewer = await prisma.user.create({
      data: {
        username: `media-reviewer-${runId}`,
        password: 'not-used-by-token-test',
        realName: `素材复核-${runId}`,
        role: 'ADMIN',
      },
    });
    const editor = await prisma.user.create({
      data: {
        username: `media-editor-${runId}`,
        password: 'not-used-by-token-test',
        realName: `素材编辑验收-${runId}`,
        role: 'EDITOR',
      },
    });
    const customer = await prisma.customer.create({
      data: { phone: `139${runId.replace(/[^0-9]/g, '').padEnd(8, '0').slice(0, 8)}` },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const staffToken = await jwt.signAsync({ sub: staff.id, type: 'admin', tokenUse: 'access' }, { expiresIn: '10m' });
    const unauthorizedStaffToken = await jwt.signAsync(
      { sub: unauthorizedStaff.id, type: 'admin', tokenUse: 'access' },
      { expiresIn: '10m' },
    );
    const editorToken = await jwt.signAsync({ sub: editor.id, type: 'admin', tokenUse: 'access' }, { expiresIn: '10m' });
    const reviewerToken = await jwt.signAsync({ sub: reviewer.id, type: 'admin', tokenUse: 'access' }, { expiresIn: '10m' });
    const customerToken = await jwt.signAsync(
      { sub: customer.id, type: 'customer', tokenUse: 'access', authVersion: customer.authVersion },
      { expiresIn: '10m' },
    );
    const customerDomainToken = await jwt.signAsync({ sub: 9001, type: 'customer', tokenUse: 'access' }, { expiresIn: '10m' });

    const createApp = async () => {
      const app = await NestFactory.create(MediaUploadRealHttpModule, { abortOnError: false, logger: false });
      app.setGlobalPrefix('api');
      app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }));
      app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
      app.useGlobalFilters(new HttpExceptionFilter());
      await app.listen(port, '127.0.0.1');
      return app;
    };
    const call = async (path: string, token?: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return jsonResult(await fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers }));
    };
    const upload = (buffer: Buffer, filename: string, mimeType = 'image/png', token = staffToken) =>
      call('/api/upload/image', token, { method: 'POST', body: formWith(buffer, mimeType, filename) });
    const jsonCall = (path: string, token: string, method: string, body: Record<string, unknown>) =>
      call(path, token, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const authorize = async (assetId: number, validUntil = new Date(Date.now() + 86_400_000).toISOString()) => {
      const drafted = await jsonCall(`/api/upload/media/${assetId}/authorization/draft`, staffToken, 'PUT', {
        expectedRevision: 1,
        sourceType: 'BRAND_OWNED',
        authorizationBasis: 'D29 isolated local HTTP test',
        evidenceReference: `local://${runId}/${assetId}`,
        publicWebUseAllowed: true,
        validUntil,
      });
      assert.equal(drafted.status, 200, JSON.stringify(drafted.body));
      const draftRevision = Number((drafted.data?.authorization as Record<string, unknown>)?.revision);
      const submitted = await jsonCall(`/api/upload/media/${assetId}/authorization/submit`, staffToken, 'POST', {
        expectedRevision: draftRevision,
      });
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
      const submitRevision = Number((submitted.data?.authorization as Record<string, unknown>)?.revision);
      const approved = await jsonCall(`/api/upload/media/${assetId}/authorization/approve`, reviewerToken, 'POST', {
        expectedRevision: submitRevision,
        reviewNote: 'isolated two-person approval',
      });
      assert.equal(approved.status, 201, JSON.stringify(approved.body));
      return Number((approved.data?.authorization as Record<string, unknown>)?.revision);
    };
    const assertPublicStatus = async (
      path: string,
      expectedStatus: number,
      expectedBody?: Buffer,
      requireNoStore = true,
    ) => {
      for (const origin of publicOrigins) {
        const response = await fetch(`${origin}${path}`);
        assert.equal(response.status, expectedStatus, `${origin}${path}`);
        if (expectedStatus === 200) {
          if (requireNoStore) assert.match(response.headers.get('cache-control') || '', /no-store/, `${origin}${path}`);
          assert.match(response.headers.get('x-content-type-options') || '', /(?:^|,\s*)nosniff(?:,|$)/, `${origin}${path}`);
          if (expectedBody) assert.deepEqual(Buffer.from(await response.arrayBuffer()), expectedBody, `${origin}${path}`);
        }
      }
    };
    const assertBothPublicUrls = async (assetId: number, legacyUrl: string, expectedStatus: number, body?: Buffer) => {
      await assertPublicStatus(legacyUrl, expectedStatus, body);
      await assertPublicStatus(`/api/upload/public-media/${assetId}`, expectedStatus, body);
    };

    let app = await createApp();
    try {
      const png = await sharp({
        create: { width: 2, height: 2, channels: 4, background: { r: 230, g: 230, b: 230, alpha: 1 } },
      }).png().toBuffer();
      const secondPng = await sharp({
        create: { width: 3, height: 2, channels: 4, background: { r: 35, g: 35, b: 35, alpha: 1 } },
      }).png().toBuffer();

      assert.equal((await call('/api/upload/media')).status, 401, '匿名不能读取媒体库');
      assert.equal((await call('/api/upload/media', unauthorizedStaffToken)).status, 403, '无内容权限员工不能读取媒体库');
      assert.equal((await call('/api/upload/media', editorToken)).status, 200, '编辑可读取媒体库');
      assert.equal((await upload(png, 'customer-domain.png', 'image/png', customerDomainToken)).status, 401, '客户令牌不能进入员工上传域');
      assert.equal((await upload(png, 'anonymous.png', 'image/png', '')).status, 401, '匿名不能上传');
      assert.equal((await call('/api/upload/payment-proof', undefined, {
        method: 'POST',
        body: formWith(png, 'image/png', 'anonymous-proof.png'),
      })).status, 401, '匿名不能上传客户私有凭证');

      const first = await upload(png, 'synthetic-gray.png');
      assert.equal(first.status, 201, JSON.stringify(first.body));
      assert.equal(first.data?.status, 'READY');
      assert.equal(first.data?.available, true);
      assert.equal(first.data?.deduplicated, false);
      const assetId = Number(first.data?.id);
      const publicUrl = String(first.data?.url);
      assert.match(publicUrl, /^\/uploads\/page-assets\/[a-f0-9]{64}\.png$/);
      const stored = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
      assert.equal(stored?.uploadedBy, staff.id);
      assert.equal(stored?.accessLevel, 'PUBLIC');
      assert.equal(stored?.status, 'READY');

      await assertBothPublicUrls(assetId, publicUrl, 404);
      const approvedRevision = await authorize(assetId);
      await assertBothPublicUrls(assetId, publicUrl, 200, png);
      for (const origin of publicOrigins) {
        const head = await fetch(`${origin}${publicUrl}`, { method: 'HEAD' });
        assert.equal(head.status, 200, `HEAD ${origin}${publicUrl}`);
        assert.equal((await head.arrayBuffer()).byteLength, 0);
        assert.equal(head.headers.get('content-length'), String(png.byteLength));
        const range = await fetch(`${origin}${publicUrl}`, { headers: { Range: 'bytes=0-7' } });
        assert.equal(range.status, 206, `Range ${origin}${publicUrl}`);
        assert.equal(range.headers.get('content-range'), `bytes 0-7/${png.byteLength}`);
        assert.deepEqual(Buffer.from(await range.arrayBuffer()), png.subarray(0, 8));
        const invalidRange = await fetch(`${origin}${publicUrl}`, { headers: { Range: 'bytes=999999-' } });
        assert.equal(invalidRange.status, 416, `invalid Range ${origin}${publicUrl}`);
      }

      const duplicate = await upload(png, 'same-bytes.png');
      assert.equal(duplicate.status, 201);
      assert.equal(duplicate.data?.id, assetId);
      assert.equal(duplicate.data?.deduplicated, true);
      const concurrent = await Promise.all(
        Array.from({ length: 4 }, (_, index) => upload(png, `same-${index}.png`)),
      );
      assert.deepEqual(concurrent.map((result) => result.status), [201, 201, 201, 201]);
      assert.equal(await prisma.mediaAsset.count(), 1);

      const syntheticMp4 = Buffer.concat([
        mp4Box('ftyp', Buffer.from('isom\0\0\0\0isom', 'binary')),
        mp4Box('moov', mp4Box('mvhd', Buffer.alloc(4))),
        mp4Box('mdat', Buffer.from([0, 0, 0, 1])),
      ]);
      const video = await call('/api/upload/video', staffToken, {
        method: 'POST',
        body: formWith(syntheticMp4, 'video/mp4', 'synthetic.mp4'),
      });
      assert.equal(video.status, 201);
      assert.equal(video.data?.type, 'video');
      const videoList = await call('/api/upload/media?type=video', staffToken);
      assert.equal(videoList.status, 200);
      assert.equal(videoList.data?.total, 1);
      assert.equal((await call('/api/upload/video', staffToken, {
        method: 'POST',
        body: formWith(Buffer.from('<svg/>'), 'video/mp4', 'fake.mp4'),
      })).status, 400, '伪装视频必须拒绝且不落盘');
      assert.equal((await call('/api/upload/video', staffToken, {
        method: 'POST',
        body: formWith(syntheticMp4.subarray(0, 12), 'video/mp4', 'truncated.mp4'),
      })).status, 400, '截断 MP4 必须拒绝');
      assert.equal((await call('/api/upload/video', staffToken, {
        method: 'POST',
        body: formWith(syntheticMp4, 'video/webm', 'wrong.webm'),
      })).status, 400, '声明为 WebM 的 MP4 内容必须拒绝');

      assert.equal((await upload(png, 'wrong.jpg', 'image/jpeg')).status, 400, 'MIME 与真实内容不符必须拒绝');
      assert.equal((await upload(png, 'wrong.svg')).status, 400, '扩展名与 MIME 不符必须拒绝');
      assert.equal((await upload(Buffer.from('<svg/>'), 'unsafe.svg', 'image/svg+xml')).status, 400, 'SVG 不进入公开上传域');
      assert.equal((await upload(png, 'bad..name.png')).status, 400, '危险文件名必须拒绝');
      assert.equal((await upload(Buffer.alloc(10 * 1024 * 1024 + 1), 'oversize.png')).status, 413, '超限请求必须在写盘前拒绝');
      assert.notEqual((await fetch(`http://127.0.0.1:${port}/uploads/%2e%2e/private-media/secret.png`)).status, 200);
      assert.equal((await call('/api/upload/media?type=svg', staffToken)).status, 400, '未知媒体筛选必须拒绝');
      assert.equal((await call(`/api/upload/media/${assetId}`, unauthorizedStaffToken, { method: 'DELETE' })).status, 403, '无内容权限员工不能归档');
      assert.equal((await call(`/api/upload/media/${assetId}`, editorToken, { method: 'DELETE' })).status, 403, '编辑不能绕过发布权限归档公开素材');

      const archived = await call(`/api/upload/media/${assetId}`, staffToken, { method: 'DELETE' });
      assert.equal(archived.status, 200);
      assert.equal(archived.data?.status, 'ARCHIVED');
      await assertBothPublicUrls(assetId, publicUrl, 404);
      const restored = await call(`/api/upload/media/${assetId}/restore`, staffToken, { method: 'POST' });
      assert.equal(restored.status, 201);
      assert.equal(restored.data?.available, true);
      await assertBothPublicUrls(assetId, publicUrl, 200, png);

      await prisma.mediaAssetAuthorization.update({
        where: { assetId },
        data: { validUntil: new Date(Date.now() - 1_000) },
      });
      await assertBothPublicUrls(assetId, publicUrl, 404);
      await prisma.mediaAssetAuthorization.update({
        where: { assetId },
        data: { validUntil: new Date(Date.now() + 86_400_000) },
      });
      const revoked = await jsonCall(`/api/upload/media/${assetId}/authorization/revoke`, reviewerToken, 'POST', {
        expectedRevision: approvedRevision,
        reason: 'D29 local revocation propagation probe',
      });
      assert.equal(revoked.status, 201, JSON.stringify(revoked.body));
      await assertBothPublicUrls(assetId, publicUrl, 404);

      const legacyPath = join(publicRoot, '2026', '09', 'legacy.png');
      await mkdir(dirname(legacyPath), { recursive: true });
      await writeFile(legacyPath, png);
      await assertPublicStatus('/uploads/2026/09/legacy.png', 200, png, false);
      for (const origin of publicOrigins) {
        for (const path of [
          '/uploads/page-assets/%2e%2e/2026/09/legacy.png',
          '/uploads/page-assets/%5cescape.png',
          '/uploads/%70age-assets/%252e%252e%252f2026%252f09%252flegacy.png',
        ]) {
          assert.notEqual(await rawStatus(origin, path), 200, `${origin}${path}`);
        }
      }

      const racePng = await sharp({
        create: { width: 4, height: 2, channels: 4, background: { r: 96, g: 96, b: 96, alpha: 1 } },
      }).png().toBuffer();
      const raceInitial = await upload(racePng, 'archive-race.png');
      const raceId = Number(raceInitial.data?.id);
      const raceUrl = String(raceInitial.data?.url);
      const [raceArchive, raceUpload] = await Promise.all([
        call(`/api/upload/media/${raceId}`, staffToken, { method: 'DELETE' }),
        upload(racePng, 'archive-race-duplicate.png'),
      ]);
      assert.equal(raceArchive.status, 200);
      assert.ok([201, 409].includes(raceUpload.status));
      assert.equal((await prisma.mediaAsset.findUnique({ where: { id: raceId } }))?.status, 'ARCHIVED');
      await assertPublicStatus(raceUrl, 404);
      assert.equal((await call(`/api/upload/media/${raceId}/restore`, staffToken, { method: 'POST' })).status, 201);

      const publicPath = join(publicRoot, publicUrl.replace(/^\/uploads\//, ''));
      await unlink(publicPath);
      const missingList = await call('/api/upload/media?includeArchived=true', staffToken);
      const missingItems = (missingList.data?.list ?? []) as Array<Record<string, unknown>>;
      assert.equal(missingItems.find((item) => item.id === assetId)?.available, false);
      assert.equal((await call(`/api/upload/media/${assetId}`, staffToken, { method: 'DELETE' })).status, 200);
      assert.equal((await call(`/api/upload/media/${assetId}/restore`, staffToken, { method: 'POST' })).status, 404);

      const persistent = await upload(secondPng, 'restart-proof.png');
      assert.equal(persistent.status, 201);
      const persistentId = Number(persistent.data?.id);
      const persistentUrl = String(persistent.data?.url);
      await authorize(persistentId);
      const paged = await call('/api/upload/media?page=1&pageSize=1&status=READY', staffToken);
      assert.equal(paged.status, 200);
      assert.equal(((paged.data?.list ?? []) as unknown[]).length, 1);
      assert.ok(Number(paged.data?.total) >= 3, '服务端分页必须保留完整总数');
      const searched = await call('/api/upload/media?status=READY&keyword=restart-proof', staffToken);
      assert.equal(searched.status, 200);
      assert.equal(searched.data?.total, 1);
      assert.equal(((searched.data?.list ?? []) as Array<Record<string, unknown>>)[0]?.url, persistentUrl);
      const proofUpload = await call('/api/upload/payment-proof', customerToken, {
        method: 'POST',
        body: formWith(png, 'image/png', 'customer-proof.png'),
      });
      assert.equal(proofUpload.status, 201, JSON.stringify(proofUpload.body));
      const proofStorageKey = String(proofUpload.data?.storageKey);
      const privateProbe = join(paymentProofRoot, proofStorageKey);
      assert.equal(existsSync(privateProbe), true, '真实客户上传必须落入本任务隔离的付款凭证私有根');
      assert.deepEqual(await readFile(privateProbe), png);
      assert.equal((await fetch(`http://127.0.0.1:${port}/uploads/${proofStorageKey}`)).status, 404);
      assert.equal((await fetch(`http://127.0.0.1:${port}/private-media/payment-proofs/${proofStorageKey}`)).status, 404);

      const interruptedPng = await sharp({
        create: { width: 5, height: 2, channels: 4, background: { r: 140, g: 140, b: 140, alpha: 1 } },
      }).png().toBuffer();
      const interrupted = await upload(interruptedPng, 'interrupted-archive.png');
      assert.equal(interrupted.status, 201);
      const interruptedId = Number(interrupted.data?.id);
      const interruptedUrl = String(interrupted.data?.url);
      await authorize(interruptedId);
      const interruptedPublicPath = join(publicRoot, interruptedUrl.replace(/^\/uploads\//, ''));
      const interruptedArchivePath = join(archiveRoot, interruptedUrl.replace(/^\/uploads\//, ''));
      await mkdir(dirname(interruptedArchivePath), { recursive: true });
      await copyFile(interruptedPublicPath, interruptedArchivePath);
      await unlink(interruptedPublicPath);
      assert.equal(
        (await prisma.mediaAsset.findUnique({ where: { id: interruptedId } }))?.status,
        'READY',
        '构造归档文件移动完成但数据库事务尚未提交即进程退出的真实分裂状态',
      );

      const tamperedPng = await sharp({
        create: { width: 6, height: 2, channels: 4, background: { r: 175, g: 175, b: 175, alpha: 1 } },
      }).png().toBuffer();
      const tampered = await upload(tamperedPng, 'tampered-after-register.png');
      const tamperedId = Number(tampered.data?.id);
      const tamperedUrl = String(tampered.data?.url);
      await authorize(tamperedId);
      await writeFile(join(publicRoot, tamperedUrl.replace(/^\/uploads\//, '')), Buffer.from('tampered-public-content'));
      await assertBothPublicUrls(tamperedId, tamperedUrl, 409);
      assert.equal((await prisma.mediaAsset.findUnique({ where: { id: tamperedId } }))?.status, 'QUARANTINED');
      const orphanUrl = '/uploads/page-assets/orphan-without-registration.png';
      await writeFile(join(publicRoot, orphanUrl.replace(/^\/uploads\//, '')), png);
      await assertPublicStatus(orphanUrl, 404);

      const missingFilePng = await sharp({
        create: { width: 8, height: 2, channels: 4, background: { r: 215, g: 215, b: 215, alpha: 1 } },
      }).png().toBuffer();
      const missingFile = await upload(missingFilePng, 'missing-controlled-file.png');
      const missingFileId = Number(missingFile.data?.id);
      const missingFileUrl = String(missingFile.data?.url);
      await authorize(missingFileId);
      await unlink(join(publicRoot, missingFileUrl.replace(/^\/uploads\//, '')));
      await assertBothPublicUrls(missingFileId, missingFileUrl, 404);
      assert.equal((await prisma.mediaAsset.findUnique({ where: { id: missingFileId } }))?.status, 'ARCHIVED');

      const corruptArchivePng = await sharp({
        create: { width: 7, height: 2, channels: 4, background: { r: 205, g: 185, b: 185, alpha: 1 } },
      }).png().toBuffer();
      const corruptArchive = await upload(corruptArchivePng, 'corrupt-private-archive.png');
      const corruptArchiveId = Number(corruptArchive.data?.id);
      const corruptArchiveUrl = String(corruptArchive.data?.url);
      assert.equal((await call(`/api/upload/media/${corruptArchiveId}`, staffToken, { method: 'DELETE' })).status, 200);
      await writeFile(
        join(archiveRoot, corruptArchiveUrl.replace(/^\/uploads\//, '')),
        Buffer.from('tampered-private-archive-content'),
      );
      assert.equal(
        (await call(`/api/upload/media/${corruptArchiveId}/restore`, staffToken, { method: 'POST' })).status,
        409,
        '哈希不匹配的归档文件不能重新公开',
      );

      await app.close();
      app = await createApp();
      const afterRestart = await call('/api/upload/media?includeArchived=true', staffToken);
      assert.equal(afterRestart.status, 200);
      const afterRestartItems = (afterRestart.data?.list ?? []) as Array<Record<string, unknown>>;
      assert.ok(afterRestartItems.some((item) => item.url === persistentUrl && item.available === true));
      await assertBothPublicUrls(persistentId, persistentUrl, 200, secondPng);
      assert.equal(
        (await prisma.mediaAsset.findUnique({ where: { id: interruptedId } }))?.status,
        'ARCHIVED',
        '重启恢复必须优先停止不存在文件的公开引用',
      );
      await assertBothPublicUrls(interruptedId, interruptedUrl, 404);
      assert.equal((await call(`/api/upload/media/${interruptedId}/restore`, staffToken, { method: 'POST' })).status, 201);
      await assertBothPublicUrls(interruptedId, interruptedUrl, 200, interruptedPng);
      assert.equal((await prisma.mediaAsset.findUnique({ where: { id: tamperedId } }))?.status, 'QUARANTINED');
      await assertBothPublicUrls(tamperedId, tamperedUrl, 409);
      await assertPublicStatus(orphanUrl, 404);
      assert.deepEqual(await readFile(privateProbe), png);
    } finally {
      await app.close().catch(() => undefined);
      await prisma.$disconnect();
      await rm(mediaRoot, { recursive: true, force: true });
      await rm(archiveRoot, { recursive: true, force: true });
    }
  },
);
