import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { ReviewsController } from './reviews.controller';
import { ReviewMediaService } from './review-media.service';
import { ReviewsService } from './reviews.service';
import { JwtStrategy } from '../auth/jwt.strategy';

const sharp = require('sharp');

let approvedImages: string[] | null = null;
const TEST_JWT_SECRET = 'review-media-http-test-secret-at-least-32-bytes';

const prisma = {
  $queryRaw: async () => [{ id: 31 }],
  user: {
    findFirst: async ({ where }: { where: { id: number } }) => ({
      id: where.id,
      username: where.id === 6 ? 'editor' : 'review-admin',
      realName: where.id === 6 ? '编辑' : '评价管理员',
      phone: null,
      email: null,
      avatar: null,
      role: where.id === 6 ? 'EDITOR' : 'ADMIN',
      status: 'ACTIVE',
      lastLoginIp: null,
      lastLoginAt: null,
      createdAt: new Date('2026-09-23T00:00:00.000Z'),
      updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    }),
  },
  customer: {
    findFirst: async ({ where }: { where: { id: number; authVersion: number } }) => ({
      id: where.id,
      name: where.id === 31 ? '晒单客户' : '其他客户',
      phone: where.id === 31 ? '13800000000' : '13900000000',
      email: null,
      authVersion: where.authVersion,
      accountType: 'PERSONAL',
      partnerStatus: 'NONE',
    }),
    findUnique: async () => ({ status: 'ACTIVE', authVersion: 2 }),
  },
  productReview: {
    findMany: async () => [],
    findFirst: async ({ where }: { where: { customerId?: number; status?: string } }) => (
      approvedImages
      && (where.customerId === undefined || where.customerId === 31)
      && (where.status === undefined || where.status === 'APPROVED')
        ? { images: approvedImages }
        : null
    ),
    findUnique: async () => approvedImages ? { images: approvedImages } : null,
  },
};
Object.assign(prisma, {
  $transaction: async (action: (transaction: typeof prisma) => Promise<unknown>) => action(prisma),
});

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({ secret: TEST_JWT_SECRET }),
  ],
  controllers: [ReviewsController],
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) => key === 'JWT_SECRET' ? TEST_JWT_SECRET : 'test',
      },
    },
    { provide: PrismaService, useValue: prisma },
    { provide: ReviewsService, useValue: {} },
    ReviewMediaService,
    IdempotencyService,
    CustomerAuthGuard,
    JwtStrategy,
  ],
})
class ReviewMediaHttpModule {}

test('Nest HTTP 强制客户鉴权并在审核前后切换晒单图公开可见性', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-media-http-'));
  const previousRoot = process.env.REVIEW_MEDIA_ROOT;
  process.env.REVIEW_MEDIA_ROOT = root;
  approvedImages = null;
  const app = await NestFactory.create(ReviewMediaHttpModule, {
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const idempotencyKey = 'review-media-http-0001';
  const jwt = app.get(JwtService);
  const customerToken = await jwt.signAsync({
    type: 'customer',
    tokenUse: 'access',
    sub: 31,
    authVersion: 2,
  });
  const otherCustomerToken = await jwt.signAsync({
    type: 'customer',
    tokenUse: 'access',
    sub: 32,
    authVersion: 2,
  });
  const adminToken = await jwt.signAsync({ type: 'admin', tokenUse: 'access', sub: 5 });
  const editorToken = await jwt.signAsync({ type: 'admin', tokenUse: 'access', sub: 6 });

  try {
    const image = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 3,
        background: { r: 198, g: 178, b: 142 },
      },
    }).png().toBuffer();
    const anonymousBody = new FormData();
    anonymousBody.append('file', new Blob([image], { type: 'image/png' }), 'review.png');
    const anonymous = await fetch(`${baseUrl}/reviews/media`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: anonymousBody,
    });
    assert.equal(anonymous.status, 401);

    const body = new FormData();
    body.append('file', new Blob([image], { type: 'image/png' }), 'review.png');
    const uploaded = await fetch(`${baseUrl}/reviews/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'Idempotency-Key': idempotencyKey,
      },
      body,
    });
    assert.equal(uploaded.status, 201);
    const uploadResult = await uploaded.json() as { reference: string };
    assert.match(uploadResult.reference, /^review-image:v1:31:[a-f0-9]{64}$/);

    const status = await fetch(`${baseUrl}/reviews/media/status`, {
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'Idempotency-Key': idempotencyKey,
      },
    });
    assert.equal(status.status, 200);
    assert.equal(status.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(status.headers.get('vary'), 'Cookie, Authorization');
    assert.deepEqual(await status.json(), {
      status: 'AVAILABLE',
      reference: uploadResult.reference,
    });

    const pending = await fetch(`${baseUrl}/reviews/media/public/91/0`);
    assert.equal(pending.status, 404);

    approvedImages = [uploadResult.reference];
    const approved = await fetch(`${baseUrl}/reviews/media/public/91/0`);
    assert.equal(approved.status, 200);
    assert.equal(approved.headers.get('content-type'), 'image/webp');
    assert.equal(approved.headers.get('cache-control'), 'public, max-age=3600');
    assert.equal(approved.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await approved.arrayBuffer()).byteLength > 0);

    const anonymousCustomerRead = await fetch(`${baseUrl}/reviews/me/91/media/0`);
    assert.equal(anonymousCustomerRead.status, 401);
    const adminCustomerRead = await fetch(`${baseUrl}/reviews/me/91/media/0`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminCustomerRead.status, 401);
    const customerRead = await fetch(`${baseUrl}/reviews/me/91/media/0`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(customerRead.status, 200);
    assert.equal(customerRead.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(customerRead.headers.get('vary'), 'Cookie, Authorization');
    assert.equal(customerRead.headers.get('content-type'), 'image/webp');
    assert.equal(customerRead.headers.get('x-content-type-options'), 'nosniff');
    const otherCustomerRead = await fetch(`${baseUrl}/reviews/me/91/media/0`, {
      headers: { Authorization: `Bearer ${otherCustomerToken}` },
    });
    assert.equal(otherCustomerRead.status, 404);

    const anonymousStaffRead = await fetch(`${baseUrl}/reviews/91/media/0`);
    assert.equal(anonymousStaffRead.status, 401);
    const editorStaffRead = await fetch(`${baseUrl}/reviews/91/media/0`, {
      headers: { Authorization: `Bearer ${editorToken}` },
    });
    assert.equal(editorStaffRead.status, 403);
    const adminStaffRead = await fetch(`${baseUrl}/reviews/91/media/0`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminStaffRead.status, 200);
    assert.equal(adminStaffRead.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(adminStaffRead.headers.get('content-type'), 'image/webp');
  } finally {
    await app.close();
    approvedImages = null;
    if (previousRoot === undefined) delete process.env.REVIEW_MEDIA_ROOT;
    else process.env.REVIEW_MEDIA_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});
