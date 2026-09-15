import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { UploadController } from './upload.controller';
import type { UploadService } from './upload.service';
import type { MediaAuthorizationService } from './media-authorization.service';

test('后台按存储键预览页面素材不放宽公开授权', async () => {
  const calls: Array<{ storageKey: string; requirePublicAuthorization: boolean }> = [];
  const uploadService = {
    getPageMediaContentByStorageKey: async (
      storageKey: string,
      requirePublicAuthorization: boolean,
    ) => {
      calls.push({ storageKey, requirePublicAuthorization });
      return { buffer: Buffer.from('image'), mimeType: 'image/png' };
    },
  } as unknown as UploadService;
  const responseState: { headers: Record<string, string>; mimeType?: string; body?: Buffer } = {
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
  } as unknown as Response;
  const controller = new UploadController(
    uploadService,
    {} as MediaAuthorizationService,
  );

  await controller.previewPageMediaByStorageKey('page-assets/abc123.png', response);

  assert.deepEqual(calls, [{
    storageKey: 'page-assets/abc123.png',
    requirePublicAuthorization: false,
  }]);
  assert.equal(responseState.headers['Cache-Control'], 'private, no-store');
  assert.equal(responseState.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(responseState.mimeType, 'image/png');
  assert.deepEqual(responseState.body, Buffer.from('image'));
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
