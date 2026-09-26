import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { UploadController } from './upload.controller';
import type { UploadService } from './upload.service';
import type { MediaAuthorizationService } from './media-authorization.service';
import type { StaffRequest } from '../../common/security/authenticated-principal';
import { CropPageMediaDto } from './dto/crop-page-media.dto';

test('后台按存储键预览页面素材不放宽公开授权', async () => {
  const calls: Array<{ storageKey: string; requirePublicAuthorization: boolean; actor: unknown }> = [];
  const uploadService = {
    getPageMediaContentByStorageKey: async (
      storageKey: string,
      requirePublicAuthorization: boolean,
      actor: unknown,
    ) => {
      calls.push({ storageKey, requirePublicAuthorization, actor });
      return { buffer: Buffer.from('image'), mimeType: 'image/png' };
    },
  } as unknown as UploadService;
  const responseState: {
    headers: Record<string, string>;
    mimeType?: string;
    body?: Buffer;
    ended?: boolean;
  } = {
    headers: {},
  };
  const response = {
    setHeader(name: string, value: string) {
      responseState.headers[name] = value;
      return this;
    },
    type(value: string) {
      responseState.mimeType = value;
      return this;
    },
    send(value: Buffer) {
      responseState.body = value;
      return this;
    },
    end() {
      responseState.ended = true;
      return this;
    },
  } as unknown as Response;
  const controller = new UploadController(
    uploadService,
    {} as MediaAuthorizationService,
  );

  const principal = {
    id: 11,
    sessionFamilyId: '2c68f9e0-3f93-4b5f-9fa5-92250f44c1f2',
  };
  await controller.previewPageMediaByStorageKey(
    'page-assets/abc123.png',
    response,
    { method: 'GET', user: principal } as StaffRequest,
  );

  assert.deepEqual(calls, [{
    storageKey: 'page-assets/abc123.png',
    requirePublicAuthorization: false,
    actor: principal,
  }]);
  assert.equal(responseState.headers['Cache-Control'], 'private, max-age=60');
  assert.equal(responseState.headers.Vary, 'Cookie, Authorization');
  assert.equal(responseState.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(responseState.headers['Content-Length'], '5');
  assert.equal(responseState.mimeType, 'image/png');
  assert.deepEqual(responseState.body, Buffer.from('image'));
  assert.equal(responseState.ended, undefined);
});

test('后台按存储键预览支持 HEAD，不回传文件体', async () => {
  const uploadService = {
    getPageMediaContentByStorageKey: async () => ({
      buffer: Buffer.from('image'),
      mimeType: 'image/png',
    }),
  } as unknown as UploadService;
  const responseState: {
    headers: Record<string, string>;
    mimeType?: string;
    body?: Buffer;
    ended?: boolean;
  } = { headers: {} };
  const response = {
    setHeader(name: string, value: string) {
      responseState.headers[name] = value;
      return this;
    },
    type(value: string) {
      responseState.mimeType = value;
      return this;
    },
    send(value: Buffer) {
      responseState.body = value;
      return this;
    },
    end() {
      responseState.ended = true;
      return this;
    },
  } as unknown as Response;
  const controller = new UploadController(
    uploadService,
    {} as MediaAuthorizationService,
  );

  await controller.previewPageMediaByStorageKey(
    'page-assets/abc123.png',
    response,
    { method: 'HEAD', user: { id: 12 } } as StaffRequest,
  );

  assert.equal(responseState.headers['Cache-Control'], 'private, max-age=60');
  assert.equal(responseState.headers.Vary, 'Cookie, Authorization');
  assert.equal(responseState.headers['Content-Length'], '5');
  assert.equal(responseState.mimeType, 'image/png');
  assert.equal(responseState.body, undefined);
  assert.equal(responseState.ended, true);
});

test('后台按存储键预览页面素材拒绝空存储键', async () => {
  let called = false;
  const uploadService = {
    getPageMediaContentByStorageKey: async () => {
      called = true;
      throw new Error('不应调用素材服务');
    },
  } as unknown as UploadService;
  const controller = new UploadController(
    uploadService,
    {} as MediaAuthorizationService,
  );

  await assert.rejects(
    controller.previewPageMediaByStorageKey('', {} as Response),
    BadRequestException,
  );
  assert.equal(called, false);
});

test('后台按存储键预览页面素材拒绝超长存储键', async () => {
  let called = false;
  const uploadService = {
    getPageMediaContentByStorageKey: async () => {
      called = true;
      throw new Error('不应调用素材服务');
    },
  } as unknown as UploadService;
  const controller = new UploadController(
    uploadService,
    {} as MediaAuthorizationService,
  );

  await assert.rejects(
    controller.previewPageMediaByStorageKey(`page-assets/${'a'.repeat(512)}`, {} as Response),
    BadRequestException,
  );
  assert.equal(called, false);
});

test("裁切页面素材把归一化区域原样委托 service", async () => {
  const calls: unknown[] = [];
  const response = { url: "/uploads/page-assets/cropped.jpg" };
  const uploadService = {
    cropPublicPageMedia: async (...args: unknown[]) => {
      calls.push(args);
      return response;
    },
  } as unknown as UploadService;
  const controller = new UploadController(
    uploadService,
    {} as MediaAuthorizationService,
  );
  const dto = Object.assign(new CropPageMediaDto(), {
    sourceUrl: "/uploads/page-assets/source.jpg",
    x: 0.1,
    y: 0.2,
    width: 0.5,
    height: 0.4,
  });

  assert.equal(
    await controller.cropPageMedia({ user: { id: 17 } } as StaffRequest, dto),
    response,
  );
  assert.deepEqual(calls, [[
    "/uploads/page-assets/source.jpg",
    { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    { id: 17 },
  ]]);
});

test('客户付款凭证读取传递完整认证身份并禁止共享缓存', async () => {
  let received: { principal: unknown; orderId: number } | null = null;
  const proof = { buffer: Buffer.from('proof'), mimeType: 'image/png' };
  const uploadService = {
    getPaymentProofForCustomer: async (principal: unknown, orderId: number) => {
      received = { principal, orderId };
      return proof;
    },
  } as unknown as UploadService;
  const headers = new Map<string, string>();
  let body: Buffer | undefined;
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    type(value: string) {
      headers.set('content-type', value);
      return this;
    },
    send(value: Buffer) {
      body = value;
      return this;
    },
  } as unknown as Response;
  const controller = new UploadController(uploadService, {} as MediaAuthorizationService);
  const principal = { id: 17, authVersion: 3 };

  await controller.getPaymentProof(
    { customer: principal } as any,
    '71',
    response,
  );

  assert.deepEqual(received, { principal, orderId: 71 });
  assert.equal(headers.get('cache-control'), 'private, no-store');
  assert.equal(headers.get('content-disposition'), 'inline');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('content-type'), 'image/png');
  assert.deepEqual(body, proof.buffer);
});

test('素材授权读写把完整员工身份交给事务内复核', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const mediaAuthorizationService = {
    getDetail: async (...args: unknown[]) => {
      calls.push({ method: 'getDetail', args });
      return { kind: 'detail' };
    },
    approve: async (...args: unknown[]) => {
      calls.push({ method: 'approve', args });
      return { kind: 'approved' };
    },
  } as unknown as MediaAuthorizationService;
  const controller = new UploadController({} as UploadService, mediaAuthorizationService);
  const principal = {
    id: 23,
    sessionFamilyId: '2c68f9e0-3f93-4b5f-9fa5-92250f44c1f2',
  };
  const request = { user: principal } as StaffRequest;

  assert.deepEqual(await controller.getMediaAuthorization(request, 71), { kind: 'detail' });
  assert.deepEqual(
    await controller.approveMediaAuthorization(request, 71, {
      expectedRevision: 4,
      reviewNote: '已复核',
      selfReviewAcknowledged: false,
    }),
    { kind: 'approved' },
  );
  assert.deepEqual(calls, [
    { method: 'getDetail', args: [71, principal] },
    { method: 'approve', args: [71, principal, 4, '已复核', false] },
  ]);
});
