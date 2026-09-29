import assert from 'node:assert/strict';
import test from 'node:test';
import { PartnerApplicationsController } from './partner-applications.controller';

test('本人合作申请响应禁止共享缓存并只使用认证客户身份', async () => {
  let receivedPrincipal: unknown;
  const controller = Object.create(
    PartnerApplicationsController.prototype,
  ) as PartnerApplicationsController;
  Object.defineProperty(controller, 'service', {
    value: {
      findMyLatest: async (principal: unknown) => {
        receivedPrincipal = principal;
        return { partnerStatus: 'PENDING', latest: { id: 41 } };
      },
    },
  });
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    vary(name: string) {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return this;
    },
  };

  const principal = { id: 9, authVersion: 4 };
  const result = await controller.getMyApplication(
    { customer: principal } as any,
    response as any,
  );

  assert.deepEqual(result, { partnerStatus: 'PENDING', latest: { id: 41 } });
  assert.equal(receivedPrincipal, principal);
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});

function privateResponseHeaders() {
  const headers = new Map<string, string>();
  return {
    headers,
    response: {
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
        return this;
      },
      vary(name: string) {
        const current = headers.get('vary');
        headers.set('vary', current ? `${current}, ${name}` : name);
        return this;
      },
    },
  };
}

test('后台合作申请列表与详情传递完整员工 principal 且禁止共享缓存', async () => {
  const calls: Array<{ operation: string; actor: unknown }> = [];
  const controller = Object.create(
    PartnerApplicationsController.prototype,
  ) as PartnerApplicationsController;
  Object.defineProperty(controller, 'service', {
    value: {
      findAll: async (_query: unknown, actor: unknown) => {
        calls.push({ operation: 'list', actor });
        return { list: [], total: 0 };
      },
      findById: async (_id: number, actor: unknown) => {
        calls.push({ operation: 'detail', actor });
        return { id: 41 };
      },
    },
  });
  const principal = {
    id: 7,
    role: 'CUSTOMER_SERVICE',
    sessionFamilyId: 'staff-family',
  };
  const listHeaders = privateResponseHeaders();
  const detailHeaders = privateResponseHeaders();

  await controller.list(
    { user: principal } as any,
    listHeaders.response as any,
    {} as any,
  );
  await controller.detail(
    { user: principal } as any,
    detailHeaders.response as any,
    41,
  );

  assert.deepEqual(calls, [
    { operation: 'list', actor: principal },
    { operation: 'detail', actor: principal },
  ]);
  for (const headers of [listHeaders.headers, detailHeaders.headers]) {
    assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(headers.get('vary'), 'Cookie, Authorization');
  }
});
