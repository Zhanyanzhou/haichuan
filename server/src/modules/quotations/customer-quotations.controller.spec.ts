import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomerQuotationsController } from './customer-quotations.controller';

function createResponseHarness() {
  const headers = new Map<string, string>();
  let sent: unknown;
  const response = {
    setHeader: (name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
      return response;
    },
    vary: (name: string) => {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return response;
    },
    send: (value: unknown) => {
      sent = value;
      return response;
    },
  };
  return { headers, response, getSent: () => sent };
}

function assertPrivateNoStore(headers: Map<string, string>) {
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
}

test('客户报价列表禁止共享缓存并只读取认证客户数据', async () => {
  let receivedPrincipal: unknown;
  const expected = [{ id: 11, quoteNo: 'QT-11' }];
  const controller = new CustomerQuotationsController({
    findForCustomer: async (principal: unknown) => {
      receivedPrincipal = principal;
      return expected;
    },
  } as never, {} as never);
  const { headers, response } = createResponseHarness();

  const principal = { id: 9, authVersion: 4 };
  const result = await controller.findAll(
    { customer: principal } as any,
    response as any,
  );

  assert.equal(result, expected);
  assert.equal(receivedPrincipal, principal);
  assertPrivateNoStore(headers);
});

test('客户报价详情禁止共享缓存并透传认证客户与报价参数', async () => {
  let received: { principal: unknown; quotationId: number } | null = null;
  const expected = { id: 23, quoteNo: 'QT-23' };
  const controller = new CustomerQuotationsController({
    findForCustomerById: async (principal: unknown, quotationId: number) => {
      received = { principal, quotationId };
      return expected;
    },
  } as never, {} as never);
  const { headers, response } = createResponseHarness();

  const principal = { id: 9, authVersion: 4 };
  const result = await controller.findById(
    { customer: principal } as any,
    response as any,
    23,
  );

  assert.equal(result, expected);
  assert.deepEqual(received, { principal, quotationId: 23 });
  assertPrivateNoStore(headers);
});

test('合作设计文件元数据禁止共享缓存并只读取认证客户数据', async () => {
  let receivedPrincipal: unknown;
  const expected = [{ id: 31, versions: [{ version: 4 }] }];
  const controller = new CustomerQuotationsController({} as never, {
    listDesignFilesForCustomer: async (principal: unknown) => {
      receivedPrincipal = principal;
      return expected;
    },
  } as never);
  const { headers, response } = createResponseHarness();

  const principal = { id: 9, authVersion: 4 };
  const result = await controller.listDesignFiles(
    { customer: principal } as any,
    response as any,
  );

  assert.equal(result, expected);
  assert.equal(receivedPrincipal, principal);
  assertPrivateNoStore(headers);
});

test('合作设计文件下载保留内容安全头且补齐私有缓存边界', async () => {
  let received: { principal: unknown; fileId: number; version: number } | null = null;
  const buffer = Buffer.from('synthetic-design-file');
  const controller = new CustomerQuotationsController({} as never, {
    getDesignFileContentForCustomer: async (
      principal: unknown,
      fileId: number,
      version: number,
    ) => {
      received = { principal, fileId, version };
      return {
        originalName: '设计 稿.step',
        mimeType: 'model/step',
        checksumSha256: '00'.repeat(32),
        buffer,
      };
    },
  } as never);
  const { headers, response, getSent } = createResponseHarness();

  const principal = { id: 9, authVersion: 4 };
  await controller.getDesignFileContent(
    { customer: principal } as any,
    31,
    4,
    response as any,
  );

  assert.deepEqual(received, { principal, fileId: 31, version: 4 });
  assert.equal(getSent(), buffer);
  assertPrivateNoStore(headers);
  assert.equal(headers.get('content-type'), 'model/step');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.match(headers.get('content-disposition') ?? '', /^attachment; filename="_.step"; filename\*=UTF-8''/);
  assert.equal(headers.get('digest'), `sha-256=${Buffer.alloc(32).toString('base64')}`);
});

test('合作设计文件读取失败时也预先禁止共享缓存', async () => {
  const controller = new CustomerQuotationsController({} as never, {
    getDesignFileContentForCustomer: async () => {
      throw new Error('synthetic unavailable');
    },
  } as never);
  const { headers, response } = createResponseHarness();

  await assert.rejects(
    controller.getDesignFileContent(
      { customer: { id: 9 } } as any,
      31,
      4,
      response as any,
    ),
    /synthetic unavailable/,
  );

  assertPrivateNoStore(headers);
});
