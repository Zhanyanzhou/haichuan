import { expect, test, type Page } from '@playwright/test';
import { installAdminSession } from './fixtures/session-auth';

async function authenticateCustomerService(page: Page) {
  await installAdminSession(page, {
    id: 7,
    username: 'customer-service-7',
    realName: '客服七号',
    role: 'CUSTOMER_SERVICE',
  });
}

async function authenticateSuperAdmin(page: Page) {
  await installAdminSession(page, {
    id: 1,
    username: 'super-admin-1',
    realName: '超级管理员',
    role: 'SUPER_ADMIN',
  });
}

const wrapped = (data: unknown) =>
  JSON.stringify({ code: 200, data, message: 'ok' });

function listLead(id: number, customerName: string, status: string) {
  return {
    id,
    leadType: 'inquiry',
    leadTypeLabel: '预约咨询',
    customerName,
    phone: '13800000000',
    relatedProducts: 0,
    status,
    assignedTo: null,
    assigneeName: null,
    createdAt: '2026-09-22T00:00:00.000Z',
  };
}

function detailLead(
  id: number,
  customerName: string,
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    ...listLead(id, customerName, status),
    customerId: null,
    leadType: 'inquiry',
    leadTypeLabel: '预约咨询',
    message: '希望预约到店看款。',
    internalNote: null,
    updatedAt: '2026-09-23T01:00:00.000Z',
    followUps: [],
    ...overrides,
  };
}

test('状态、备注和指派在响应丢失后沿用各自幂等键并收敛到权威结果', async ({ page }) => {
  await authenticateCustomerService(page);
  const state: {
    status: string;
    internalNote: string | null;
    assignedTo: number | null;
  } = {
    status: 'PENDING',
    internalNote: null,
    assignedTo: null,
  };
  const writes = {
    note: [] as Array<Record<string, string>>,
    assignment: [] as Array<Record<string, string>>,
    status: [] as Array<Record<string, string>>,
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({ contentType: 'application/json', body: wrapped({ list: [], total: 0 }) });
      return;
    }
    if (path === '/api/users/assignable') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped([{ id: 12, name: '顾问十二' }]),
      });
      return;
    }
    if (path === '/api/leads/inquiry/71' && request.method() === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const action = 'internalNote' in body
        ? 'note'
        : 'assignedTo' in body
          ? 'assignment'
          : 'status';
      writes[action].push(request.headers());
      if (action === 'note') state.internalNote = String(body.internalNote);
      if (action === 'assignment') state.assignedTo = Number(body.assignedTo);
      if (action === 'status') state.status = String(body.status);
      if (writes[action].length === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: 'response lost after commit' }),
        });
      } else {
        await route.fulfill({
          contentType: 'application/json',
          body: wrapped(detailLead(71, '响应恢复客户', state.status, {
            internalNote: state.internalNote,
            assignedTo: state.assignedTo,
          })),
        });
      }
      return;
    }
    if (path === '/api/leads/inquiry/71') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped(detailLead(71, '响应恢复客户', state.status, {
          internalNote: state.internalNote,
          assignedTo: state.assignedTo,
          assignee: state.assignedTo ? { realName: '顾问十二' } : null,
        })),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [{
            ...listLead(71, '响应恢复客户', state.status),
            assignedTo: state.assignedTo,
            assigneeName: state.assignedTo ? '顾问十二' : null,
          }],
          total: 1,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads');
  await page.getByRole('button', { name: '查看' }).click();
  const drawer = page.getByRole('dialog', { name: '线索详情' });
  const note = drawer.getByLabel('内部备注或跟进内容');

  await note.fill('已确认客户周六到店');
  const saveNoteButton = drawer.getByRole('button', { name: '保存备注' });
  await saveNoteButton.click();
  await expect(page.getByText(/备注保存结果待确认/)).toBeVisible();
  await expect(saveNoteButton).not.toHaveClass(/ant-btn-loading/);
  await saveNoteButton.click();
  await expect(
    drawer.getByRole('cell', { name: '已确认客户周六到店', exact: true }),
  ).toBeVisible();

  await drawer.locator('.ant-select')
    .filter({ hasText: '选择员工' })
    .getByRole('combobox')
    .click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText('顾问十二', { exact: true }).click();
  const assignButton = drawer.getByRole('button', { name: /指\s*派/ });
  await assignButton.click();
  await expect(page.getByText(/线索指派结果待确认/)).toBeVisible();
  await expect(assignButton).not.toHaveClass(/ant-btn-loading/);
  await assignButton.click();
  await expect(
    drawer.getByRole('cell', { name: '顾问十二', exact: true }),
  ).toBeVisible();

  const contactButton = drawer.getByRole('button').filter({ hasText: '已联系' });
  await contactButton.click();
  await expect(page.getByText(/状态更新结果待确认/)).toBeVisible();
  await expect(contactButton).not.toHaveClass(/ant-btn-loading/);
  await contactButton.click();
  await expect(drawer.getByText('已联系', { exact: true }).first()).toBeVisible();

  for (const actionWrites of Object.values(writes)) {
    expect(actionWrites).toHaveLength(2);
    expect(actionWrites[0]['idempotency-key']).toBeTruthy();
    expect(actionWrites[1]['idempotency-key']).toBe(actionWrites[0]['idempotency-key']);
  }
});

test('修改更新意图会换幂等键，切换线索会清除旧线索待确认凭据', async ({ page }) => {
  await authenticateCustomerService(page);
  const writes: Array<{ id: number; key: string; note: string }> = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({ contentType: 'application/json', body: wrapped({ list: [], total: 0 }) });
      return;
    }
    const detailMatch = path.match(/^\/api\/leads\/inquiry\/(81|82)$/);
    if (detailMatch && request.method() === 'PUT') {
      const id = Number(detailMatch[1]);
      const body = request.postDataJSON() as { internalNote: string };
      writes.push({ id, key: request.headers()['idempotency-key'], note: body.internalNote });
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 503, message: 'response lost after commit' }),
      });
      return;
    }
    if (detailMatch) {
      const id = Number(detailMatch[1]);
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped(detailLead(id, id === 81 ? '客户甲' : '客户乙', 'PENDING')),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [listLead(81, '客户甲', 'PENDING'), listLead(82, '客户乙', 'PENDING')],
          total: 2,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads');
  const rowA = page.getByRole('row').filter({ hasText: '客户甲' });
  const rowB = page.getByRole('row').filter({ hasText: '客户乙' });
  await rowA.getByRole('button', { name: '查看' }).click();
  let drawer = page.getByRole('dialog', { name: '线索详情' });
  const note = drawer.getByLabel('内部备注或跟进内容');
  await note.fill('第一次意图');
  await drawer.getByRole('button', { name: '保存备注' }).click();
  await expect(page.getByText(/备注保存结果待确认/)).toBeVisible();
  await note.fill('修改后的意图');
  await drawer.getByRole('button', { name: '保存备注' }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].key).not.toBe(writes[0].key);

  await drawer.getByRole('button', { name: 'Close' }).click();
  await rowB.getByRole('button', { name: '查看' }).click();
  drawer = page.getByRole('dialog', { name: '线索详情' });
  await drawer.getByRole('button', { name: 'Close' }).click();
  await rowA.getByRole('button', { name: '查看' }).click();
  drawer = page.getByRole('dialog', { name: '线索详情' });
  await drawer.getByLabel('内部备注或跟进内容').fill('修改后的意图');
  await drawer.getByRole('button', { name: '保存备注' }).click();
  await expect.poll(() => writes.length).toBe(3);
  expect(writes[2].key).not.toBe(writes[1].key);
});

test('旧线索更新迟到时不会提示成功或解除新线索的保存状态', async ({ page }) => {
  await authenticateCustomerService(page);
  let releaseOldWrite!: () => void;
  let markOldWriteRequested!: () => void;
  let markOldWriteSettled!: () => void;
  const oldWriteGate = new Promise<void>((resolve) => {
    releaseOldWrite = resolve;
  });
  const oldWriteRequested = new Promise<void>((resolve) => {
    markOldWriteRequested = resolve;
  });
  const oldWriteSettled = new Promise<void>((resolve) => {
    markOldWriteSettled = resolve;
  });
  const writes: Array<{ id: number; key: string; note: string }> = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({ contentType: 'application/json', body: wrapped({ list: [], total: 0 }) });
      return;
    }
    const detailMatch = path.match(/^\/api\/leads\/inquiry\/(91|92)$/);
    if (detailMatch && request.method() === 'PUT') {
      const id = Number(detailMatch[1]);
      const body = request.postDataJSON() as { internalNote: string };
      writes.push({ id, key: request.headers()['idempotency-key'], note: body.internalNote });
      if (id === 91) {
        markOldWriteRequested();
        await oldWriteGate;
        await route.fulfill({
          contentType: 'application/json',
          body: wrapped(detailLead(91, '迟到客户甲', 'PENDING', {
            internalNote: body.internalNote,
          })),
        });
        markOldWriteSettled();
      } else {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: 'new lead still pending' }),
        });
      }
      return;
    }
    if (detailMatch) {
      const id = Number(detailMatch[1]);
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped(detailLead(id, id === 91 ? '迟到客户甲' : '当前客户乙', 'PENDING')),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [listLead(91, '迟到客户甲', 'PENDING'), listLead(92, '当前客户乙', 'PENDING')],
          total: 2,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads');
  const rowA = page.getByRole('row').filter({ hasText: '迟到客户甲' });
  const rowB = page.getByRole('row').filter({ hasText: '当前客户乙' });
  await rowA.getByRole('button', { name: '查看' }).click();
  let drawer = page.getByRole('dialog', { name: '线索详情' });
  await drawer.getByLabel('内部备注或跟进内容').fill('甲的迟到备注');
  await drawer.getByRole('button', { name: '保存备注' }).click();
  await oldWriteRequested;

  await drawer.getByRole('button', { name: 'Close' }).click();
  await rowB.getByRole('button', { name: '查看' }).click();
  drawer = page.getByRole('dialog', { name: '线索详情' });
  await drawer.getByLabel('内部备注或跟进内容').fill('乙的当前备注');
  await drawer.getByRole('button', { name: '保存备注' }).click();
  await expect.poll(() => writes.some((write) => write.id === 92)).toBe(true);
  await expect(page.getByText(/备注保存结果待确认/)).toBeVisible();

  releaseOldWrite();
  await oldWriteSettled;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(page.getByText('备注已保存', { exact: true })).toHaveCount(0);
  await expect(drawer).toContainText('当前客户乙');
  await expect(drawer.getByLabel('内部备注或跟进内容')).toHaveValue('乙的当前备注');
  expect(writes[0].key).not.toBe(writes[1].key);
});

test('同一线索关闭重开后旧请求不会解除新请求的保存状态', async ({ page }) => {
  await authenticateCustomerService(page);
  let releaseFirstWrite!: () => void;
  let releaseSecondWrite!: () => void;
  let markFirstRequested!: () => void;
  let markSecondRequested!: () => void;
  let markFirstSettled!: () => void;
  let markSecondSettled!: () => void;
  const firstWriteGate = new Promise<void>((resolve) => {
    releaseFirstWrite = resolve;
  });
  const secondWriteGate = new Promise<void>((resolve) => {
    releaseSecondWrite = resolve;
  });
  const firstRequested = new Promise<void>((resolve) => {
    markFirstRequested = resolve;
  });
  const secondRequested = new Promise<void>((resolve) => {
    markSecondRequested = resolve;
  });
  const firstSettled = new Promise<void>((resolve) => {
    markFirstSettled = resolve;
  });
  const secondSettled = new Promise<void>((resolve) => {
    markSecondSettled = resolve;
  });
  const writes: Array<{ key: string; note: string }> = [];
  let storedNote: string | null = null;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({ contentType: 'application/json', body: wrapped({ list: [], total: 0 }) });
      return;
    }
    if (path === '/api/leads/inquiry/93' && request.method() === 'PUT') {
      const body = request.postDataJSON() as { internalNote: string };
      writes.push({ key: request.headers()['idempotency-key'], note: body.internalNote });
      const isFirstWrite = writes.length === 1;
      if (isFirstWrite) {
        markFirstRequested();
        await firstWriteGate;
      } else {
        markSecondRequested();
        await secondWriteGate;
      }
      storedNote = body.internalNote;
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped(detailLead(93, '重开客户', 'PENDING', { internalNote: storedNote })),
      });
      if (isFirstWrite) markFirstSettled();
      else markSecondSettled();
      return;
    }
    if (path === '/api/leads/inquiry/93') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped(detailLead(93, '重开客户', 'PENDING', { internalNote: storedNote })),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({ list: [listLead(93, '重开客户', 'PENDING')], total: 1 }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads');
  const row = page.getByRole('row').filter({ hasText: '重开客户' });
  await row.getByRole('button', { name: '查看' }).click();
  let drawer = page.getByRole('dialog', { name: '线索详情' });
  await drawer.getByLabel('内部备注或跟进内容').fill('第一次仍在途');
  await drawer.getByRole('button', { name: '保存备注' }).click();
  await firstRequested;

  await drawer.getByRole('button', { name: 'Close' }).click();
  await row.getByRole('button', { name: '查看' }).click();
  drawer = page.getByRole('dialog', { name: '线索详情' });
  await drawer.getByLabel('内部备注或跟进内容').fill('重开后的新请求');
  const saveButton = drawer.getByRole('button').filter({ hasText: '保存备注' });
  await saveButton.click();
  await secondRequested;
  await expect(saveButton).toHaveClass(/ant-btn-loading/);

  releaseFirstWrite();
  await firstSettled;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(page.getByText('备注已保存', { exact: true })).toHaveCount(0);
  await expect(saveButton).toHaveClass(/ant-btn-loading/);

  releaseSecondWrite();
  await secondSettled;
  await expect(page.getByText('备注已保存', { exact: true })).toBeVisible();
  await expect(saveButton).not.toHaveClass(/ant-btn-loading/);
  expect(writes).toHaveLength(2);
  expect(writes[0].key).not.toBe(writes[1].key);
});

test('旧线索跟进迟到失败不会在新线索显示错误提示', async ({ page }) => {
  await authenticateCustomerService(page);
  let releaseFollowUp!: () => void;
  let markFollowUpRequested!: () => void;
  let markFollowUpSettled!: () => void;
  const followUpGate = new Promise<void>((resolve) => {
    releaseFollowUp = resolve;
  });
  const followUpRequested = new Promise<void>((resolve) => {
    markFollowUpRequested = resolve;
  });
  const followUpSettled = new Promise<void>((resolve) => {
    markFollowUpSettled = resolve;
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({ contentType: 'application/json', body: wrapped({ list: [], total: 0 }) });
      return;
    }
    if (path === '/api/leads/inquiry/94/follow-up' && request.method() === 'POST') {
      markFollowUpRequested();
      await followUpGate;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 503, message: '旧线索迟到跟进失败' }),
      });
      markFollowUpSettled();
      return;
    }
    const detailMatch = path.match(/^\/api\/leads\/inquiry\/(94|95)$/);
    if (detailMatch) {
      const id = Number(detailMatch[1]);
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped(detailLead(id, id === 94 ? '跟进客户甲' : '当前客户乙', 'PENDING')),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [listLead(94, '跟进客户甲', 'PENDING'), listLead(95, '当前客户乙', 'PENDING')],
          total: 2,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads');
  const rowA = page.getByRole('row').filter({ hasText: '跟进客户甲' });
  const rowB = page.getByRole('row').filter({ hasText: '当前客户乙' });
  await rowA.getByRole('button', { name: '查看' }).click();
  let drawer = page.getByRole('dialog', { name: '线索详情' });
  await drawer.getByLabel('内部备注或跟进内容').fill('尚在请求中的跟进');
  await drawer.getByRole('button', { name: '添加跟进' }).click();
  await followUpRequested;

  await drawer.getByRole('button', { name: 'Close' }).click();
  await rowB.getByRole('button', { name: '查看' }).click();
  drawer = page.getByRole('dialog', { name: '线索详情' });
  releaseFollowUp();
  await followUpSettled;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  await expect(page.getByText(/旧线索迟到跟进失败|跟进记录添加失败/)).toHaveCount(0);
  await expect(drawer).toContainText('当前客户乙');
});

test('领取服务合同使用当前员工会话，冲突后可原动作重试', async ({ page }) => {
  await authenticateCustomerService(page);
  const writes: Array<{
    headers: Record<string, string>;
    body: string | null;
  }> = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/inquiry/17/claim' && request.method() === 'POST') {
      writes.push({ headers: request.headers(), body: request.postData() });
      if (writes.length === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 409, message: '线索已被其他员工领取，请刷新后确认' }),
        });
      } else {
        await route.fulfill({
          contentType: 'application/json',
          body: wrapped({
            id: 17,
            assignedTo: 7,
            status: 'PENDING',
            updatedAt: '2026-09-12T01:00:00.000Z',
          }),
        });
      }
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/');
  await page.evaluate(() => {
    document.cookie = 'hc_csrf=lead-claim-csrf; path=/';
  });
  const firstStatus = await page.evaluate(async () => {
    const [{ leadApi }, { requestStatus }] = await Promise.all([
      import('/src/services/api.ts'),
      import('/src/services/httpClient.ts'),
    ]);
    try {
      await leadApi.claim('inquiry', 17);
      return 200;
    } catch (error) {
      return requestStatus(error);
    }
  });
  expect(firstStatus).toBe(409);

  const claimedBy = await page.evaluate(async () => {
    const { leadApi } = await import('/src/services/api.ts');
    const response = await leadApi.claim('inquiry', 17);
    return response.data.data.assignedTo;
  });
  expect(claimedBy).toBe(7);
  expect(writes).toHaveLength(2);
  expect(writes.every((write) => write.headers.authorization === undefined)).toBe(true);
  expect(writes.every((write) => write.headers['x-csrf-token'] === 'lead-claim-csrf')).toBe(true);
  expect(writes.every((write) => write.body === null)).toBe(true);
});

for (const staleOutcome of ['success', 'failure'] as const) {
  test(`旧列表${staleOutcome === 'success' ? '成功' : '失败'}迟到不会污染当前状态筛选`, async ({ page }) => {
    await authenticateCustomerService(page);
    let releaseStaleRequest!: () => void;
    let markStaleRequested!: () => void;
    let markStaleSettled!: () => void;
    const staleRequestGate = new Promise<void>((resolve) => {
      releaseStaleRequest = resolve;
    });
    const staleRequested = new Promise<void>((resolve) => {
      markStaleRequested = resolve;
    });
    const staleSettled = new Promise<void>((resolve) => {
      markStaleSettled = resolve;
    });

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (path === '/api/auth/profile') return route.fallback();
      if (path === '/api/leads/notification-failures') {
        await route.fulfill({
          contentType: 'application/json',
          body: wrapped({ list: [], total: 0 }),
        });
        return;
      }
      if (path === '/api/leads' && !url.searchParams.get('status')) {
        markStaleRequested();
        await staleRequestGate;
        if (staleOutcome === 'failure') {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'stale list unavailable' }),
          });
        } else {
          await route.fulfill({
            contentType: 'application/json',
            body: wrapped({
              list: [listLead(17, '旧筛选客户', 'PENDING')],
              total: 1,
            }),
          });
        }
        markStaleSettled();
        return;
      }
      if (
        path === '/api/leads'
        && url.searchParams.get('status') === 'CONTACTED'
      ) {
        await route.fulfill({
          contentType: 'application/json',
          body: wrapped({
            list: [listLead(18, '当前筛选客户', 'CONTACTED')],
            total: 1,
          }),
        });
        return;
      }
      await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
    });

    await page.goto('/admin/leads');
    await staleRequested;
    await page.locator('.ant-select').filter({ hasText: '状态筛选' })
      .getByRole('combobox').click();
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
      .getByText('已联系', { exact: true }).click();

    const currentRow = page.getByRole('row').filter({ hasText: '当前筛选客户' });
    await expect(currentRow).toBeVisible();
    await expect(currentRow).toContainText('已联系');

    releaseStaleRequest();
    await staleSettled;
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    await expect(currentRow).toBeVisible();
    await expect(page.getByText('旧筛选客户', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重试', exact: true })).toHaveCount(0);
  });
}

test('关闭旧线索后打开新线索时忽略迟到详情，避免跨线索隐私覆盖', async ({ page }) => {
  await authenticateCustomerService(page);
  let releaseOldDetail!: () => void;
  let markOldDetailRequested!: () => void;
  const oldDetailGate = new Promise<void>((resolve) => {
    releaseOldDetail = resolve;
  });
  const oldDetailRequested = new Promise<void>((resolve) => {
    markOldDetailRequested = resolve;
  });
  let releaseOldReply!: () => void;
  let markOldReplyRequested!: () => void;
  const oldReplyGate = new Promise<void>((resolve) => {
    releaseOldReply = resolve;
  });
  const oldReplyRequested = new Promise<void>((resolve) => {
    markOldReplyRequested = resolve;
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({ list: [], total: 0 }),
      });
      return;
    }
    if (
      path === '/api/leads/inquiry/17/reply'
      && request.method() === 'POST'
    ) {
      markOldReplyRequested();
      await oldReplyGate;
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          leadId: 17,
          status: 'CONTACTED',
          updatedAt: '2026-09-22T01:00:02.000Z',
          reply: {
            id: 91,
            content: '旧线索的迟到回复',
            createdAt: '2026-09-22T01:00:02.000Z',
          },
        }),
      });
      return;
    }
    if (path === '/api/leads/inquiry/17') {
      markOldDetailRequested();
      await oldDetailGate;
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          id: 17,
          customerId: 7,
          leadType: 'inquiry',
          leadTypeLabel: '预约咨询',
          customerName: '旧线索客户',
          phone: '13800000017',
          email: 'old-lead@example.test',
          status: 'PENDING',
          message: '旧线索私密内容',
          updatedAt: '2026-09-22T01:00:00.000Z',
          followUps: [],
        }),
      });
      return;
    }
    if (path === '/api/leads/inquiry/18') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          id: 18,
          customerId: 8,
          leadType: 'inquiry',
          leadTypeLabel: '预约咨询',
          customerName: '当前线索客户',
          phone: '13800000018',
          email: 'current-lead@example.test',
          status: 'PENDING',
          message: '当前线索内容',
          updatedAt: '2026-09-22T01:00:01.000Z',
          followUps: [],
        }),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [
            {
              id: 17,
              leadType: 'inquiry',
              leadTypeLabel: '预约咨询',
              customerName: '旧线索客户',
              phone: '13800000017',
              relatedProducts: 0,
              status: 'PENDING',
              createdAt: '2026-09-22T00:00:00.000Z',
            },
            {
              id: 18,
              leadType: 'inquiry',
              leadTypeLabel: '预约咨询',
              customerName: '当前线索客户',
              phone: '13800000018',
              relatedProducts: 0,
              status: 'PENDING',
              createdAt: '2026-09-22T00:01:00.000Z',
            },
          ],
          total: 2,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads');
  const oldRow = page.getByRole('row', { name: /旧线索客户/ });
  await oldRow.getByRole('button', { name: '查看' }).click();
  await oldDetailRequested;

  const drawer = page.getByRole('dialog', { name: '线索详情' });
  await drawer.locator('.ant-drawer-close').click();
  const currentRow = page.getByRole('row', { name: /当前线索客户/ });
  await currentRow.getByRole('button', { name: '查看' }).click();
  await expect(drawer).toContainText('current-lead@example.test');
  await expect(drawer).toContainText('当前线索内容');

  const oldResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/leads/inquiry/17',
  );
  releaseOldDetail();
  await oldResponse;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  await expect(drawer).toContainText('current-lead@example.test');
  await expect(drawer).toContainText('当前线索内容');
  await expect(drawer).not.toContainText('old-lead@example.test');
  await expect(drawer).not.toContainText('旧线索私密内容');

  await drawer.locator('.ant-drawer-close').click();
  await oldRow.getByRole('button', { name: '查看' }).click();
  await expect(drawer).toContainText('old-lead@example.test');
  await drawer.getByLabel('客户可见回复').fill('旧线索的迟到回复');
  await drawer.getByRole('button', { name: '提交回复' }).click();
  await oldReplyRequested;

  await drawer.locator('.ant-drawer-close').click();
  await currentRow.getByRole('button', { name: '查看' }).click();
  await expect(drawer).toContainText('current-lead@example.test');
  const oldReplyResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/leads/inquiry/17/reply',
  );
  releaseOldReply();
  await oldReplyResponse;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  await expect(drawer).toContainText('current-lead@example.test');
  await expect(drawer).toContainText('当前线索内容');
  await expect(drawer).not.toContainText('旧线索的迟到回复');
});

test('线索跟进请求保持员工鉴权和最小请求体合同', async ({ page }) => {
  await authenticateCustomerService(page);
  const writes: Array<{
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];
  const initialNextFollowUpAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const savedNextFollowUpAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const localNextFollowUpAt = new Date(
    new Date(savedNextFollowUpAt).getTime()
      - new Date(savedNextFollowUpAt).getTimezoneOffset() * 60_000,
  ).toISOString().slice(0, 16);
  let savedFollowUp: Record<string, unknown> | null = null;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (
      path === '/api/leads/inquiry/17/follow-up' &&
      request.method() === 'POST'
    ) {
      writes.push({
        headers: request.headers(),
        body: request.postDataJSON(),
      });
      if (writes.length === 1) {
        savedFollowUp = writes[0].body;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'temporary failure' }),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({ id: 1 }),
      });
      return;
    }
    if (path === '/api/leads/inquiry/17') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          id: 17,
          leadType: 'inquiry',
          leadTypeLabel: '预约咨询',
          customerName: '测试访客',
          phone: '13800000000',
          status: 'PENDING',
          nextFollowUpAt: savedFollowUp ? savedNextFollowUpAt : initialNextFollowUpAt,
          message: '希望预约看款。',
          createdAt: '2026-08-26T00:00:00.000Z',
          followUps: savedFollowUp ? [{
            id: 91,
            type: 'FOLLOW_UP',
            content: savedFollowUp.content,
            contactMethod: savedFollowUp.contactMethod,
            nextFollowUpAt: savedNextFollowUpAt,
            createdAt: new Date().toISOString(),
            creator: { realName: '客服七号' },
          }] : [],
        }),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [
            {
              id: 17,
              leadType: 'inquiry',
              leadTypeLabel: '预约咨询',
              customerName: '测试访客',
              phone: '13800000000',
              relatedProducts: 0,
              status: 'PENDING',
              nextFollowUpAt: savedFollowUp ? savedNextFollowUpAt : initialNextFollowUpAt,
              createdAt: '2026-08-26T00:00:00.000Z',
            },
          ],
          total: 1,
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: wrapped({}),
    });
  });

  await page.goto('/admin/leads');
  await page.getByRole('button', { name: '查看' }).click();
  const drawer = page.getByRole('dialog', { name: '线索详情' });
  await expect(page.getByText('已逾期', { exact: true })).toBeVisible();
  await expect(drawer).toContainText(
    '游客咨询无法生成客户中心站内回复；请根据其电话或邮箱，在下方记录实际联系渠道与跟进结果。',
  );
  await expect(drawer).not.toContainText('原咨询管理入口');
  await drawer
    .getByPlaceholder('添加内部备注或跟进记录...')
    .fill('已电话确认到店时间');
  const channelSelect = drawer.locator(
    '.ant-select:has(input[aria-label="跟进渠道"])',
  );
  await channelSelect.locator('.ant-select-selector').click();
  await page.locator('.ant-select-item-option-content', { hasText: '电子邮件' }).click();
  await drawer.getByLabel('下次跟进时间').fill(localNextFollowUpAt);
  await page.evaluate(() => {
    document.cookie = 'hc_csrf=lead-csrf-token; path=/';
  });
  await drawer.getByRole('button', { name: '添加跟进' }).click();

  await expect(page.getByText('跟进记录结果待确认', { exact: true })).toBeVisible();
  await expect(page.getByText(/当前内容与原凭据已保留/)).toBeVisible();
  await expect(drawer.getByLabel('内部备注或跟进内容'))
    .toHaveValue('已电话确认到店时间');
  await expect(channelSelect).toContainText('电子邮件');
  await expect(drawer.getByLabel('下次跟进时间')).toHaveValue(localNextFollowUpAt);
  await drawer.getByRole('button', { name: '使用原凭据恢复' }).click();

  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0].headers.authorization).toBeUndefined();
  expect(writes[0].headers['x-csrf-token']).toBe('lead-csrf-token');
  expect(writes[0].headers['idempotency-key']).toBeTruthy();
  expect(writes[1].headers['idempotency-key']).toBe(writes[0].headers['idempotency-key']);
  expect(writes[1].body).toEqual({
    content: '已电话确认到店时间',
    contactMethod: 'email',
    nextFollowUpAt: new Date(localNextFollowUpAt).toISOString(),
  });
  await expect(drawer.getByText('已电话确认到店时间', { exact: true })).toBeVisible();
  await expect(drawer.locator('ol .ant-tag', { hasText: '电子邮件' })).toBeVisible();
  await expect(drawer.getByLabel('下次跟进时间')).toHaveValue(localNextFollowUpAt);
});

test('后台回复在响应失败后复用幂等键并恢复成功结果', async ({ page }) => {
  await authenticateCustomerService(page);
  const writes: Array<{
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];
  let reply: string | null = null;
  let updatedAt = '2026-09-07T01:00:00.000Z';

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/inquiry/41/reply' && request.method() === 'POST') {
      writes.push({ headers: request.headers(), body: request.postDataJSON() });
      if (writes.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'temporary failure' }),
        });
        return;
      }
      reply = String(writes.at(-1)?.body.reply);
      updatedAt = '2026-09-07T01:00:01.000Z';
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          leadId: 41,
          status: 'CONTACTED',
          updatedAt,
          reply: { id: 91, content: reply, createdAt: updatedAt },
        }),
      });
      return;
    }
    if (path === '/api/leads/inquiry/41') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          id: 41,
          customerId: 7,
          leadType: 'inquiry',
          leadTypeLabel: '预约咨询',
          customerName: '测试会员',
          phone: '13800000007',
          status: reply ? 'CONTACTED' : 'PENDING',
          message: '希望预约到店鉴赏。',
          reply,
          createdAt: '2026-09-07T00:00:00.000Z',
          updatedAt,
          followUps: [],
        }),
      });
      return;
    }
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({ contentType: 'application/json', body: wrapped({ list: [], total: 0 }) });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [{
            id: 41,
            leadType: 'inquiry',
            leadTypeLabel: '预约咨询',
            customerName: '测试会员',
            phone: '13800000007',
            relatedProducts: 0,
            status: reply ? 'CONTACTED' : 'PENDING',
            createdAt: '2026-09-07T00:00:00.000Z',
          }],
          total: 1,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads');
  await page.getByRole('button', { name: '查看' }).click();
  const drawer = page.getByRole('dialog', { name: '线索详情' });
  await drawer.getByLabel('客户可见回复').fill('已为您安排本周六到店鉴赏。');
  await page.evaluate(() => {
    document.cookie = 'hc_csrf=lead-reply-csrf; path=/';
  });
  await drawer.getByRole('button', { name: '提交回复' }).click();
  await expect(drawer.getByText(/客户回复结果待确认/)).toBeVisible();
  await drawer.getByRole('button', { name: '使用原凭据恢复' }).click();

  await expect(drawer.getByText('已为您安排本周六到店鉴赏。', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[0].headers['idempotency-key']).toBeTruthy();
  expect(writes[1].headers['idempotency-key']).toBe(writes[0].headers['idempotency-key']);
  expect(writes[1].headers['x-csrf-token']).toBe('lead-reply-csrf');
  expect(writes[1].headers.authorization).toBeUndefined();
  expect(writes[1].body).toEqual({
    reply: '已为您安排本周六到店鉴赏。',
    expectedUpdatedAt: '2026-09-07T01:00:00.000Z',
  });
});

test('后台回复遇到版本冲突会保留正文并用刷新后的版本重新提交', async ({ page }) => {
  await authenticateCustomerService(page);
  const keys: string[] = [];
  const versions: string[] = [];
  let attempts = 0;
  let updatedAt = '2026-09-07T02:00:00.000Z';

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/selection/42/reply' && request.method() === 'POST') {
      attempts += 1;
      keys.push(request.headers()['idempotency-key']);
      versions.push(String(request.postDataJSON().expectedUpdatedAt));
      if (attempts === 1) {
        updatedAt = '2026-09-07T02:00:01.000Z';
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'stale lead version' }),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          leadId: 42,
          status: 'FOLLOWING',
          updatedAt: '2026-09-07T02:00:02.000Z',
          reply: {
            id: 92,
            content: '三件作品可在到店时逐一试戴。',
            createdAt: '2026-09-07T02:00:02.000Z',
          },
        }),
      });
      return;
    }
    if (path === '/api/leads/selection/42') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          id: 42,
          customerId: 7,
          leadType: 'selection',
          leadTypeLabel: '选款咨询',
          customerName: '测试会员',
          status: 'FOLLOWING',
          message: '希望比较三件作品。',
          items: [],
          reply: attempts > 1 ? '三件作品可在到店时逐一试戴。' : null,
          repliedAt: attempts > 1 ? '2026-09-07T02:00:02.000Z' : null,
          createdAt: '2026-09-07T01:00:00.000Z',
          updatedAt,
          followUps: [],
        }),
      });
      return;
    }
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({ contentType: 'application/json', body: wrapped({ list: [], total: 0 }) });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [{
            id: 42,
            leadType: 'selection',
            leadTypeLabel: '选款咨询',
            customerName: '测试会员',
            relatedProducts: 3,
            status: 'FOLLOWING',
            createdAt: '2026-09-07T01:00:00.000Z',
          }],
          total: 1,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads');
  await page.getByRole('button', { name: '查看' }).click();
  const drawer = page.getByRole('dialog', { name: '线索详情' });
  const editor = drawer.getByLabel('客户可见回复');
  await editor.fill('三件作品可在到店时逐一试戴。');
  await drawer.getByRole('button', { name: '提交回复' }).click();
  await expect(drawer.getByText('数据已被其他操作更新，请重新加载后再试。')).toBeVisible();
  await expect(editor).toHaveValue('三件作品可在到店时逐一试戴。');
  await drawer.getByRole('button', { name: '重新提交' }).click();

  await expect(drawer.getByText('三件作品可在到店时逐一试戴。', { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).not.toBe(keys[0]);
  expect(versions).toEqual([
    '2026-09-07T02:00:00.000Z',
    '2026-09-07T02:00:01.000Z',
  ]);
});

test('通知失败只允许安全重投，并可在丢响应后使用原凭据恢复', async ({ page }) => {
  await authenticateCustomerService(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const retries: Array<{
    id: number;
    headers: Record<string, string>;
  }> = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [
            {
              id: 81,
              leadId: 17,
              leadType: 'inquiry',
              customerName: '测试访客',
              attempts: 5,
              lastErrorCode: 'SMTP_SEND_FAILED',
              retryable: true,
              updatedAt: '2026-08-27T01:05:00.000Z',
            },
            {
              id: 82,
              leadId: 18,
              leadType: 'inquiry',
              customerName: '另一位访客',
              attempts: 1,
              lastErrorCode: 'DELIVERY_RESULT_UNKNOWN',
              retryable: false,
              updatedAt: '2026-08-27T01:06:00.000Z',
            },
          ],
          total: 2,
        }),
      });
      return;
    }
    if (
      path === '/api/leads/notification-failures/81/retry'
      && request.method() === 'POST'
    ) {
      retries.push({ id: 81, headers: request.headers() });
      if (retries.length === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: wrapped({}) });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({ id: 81, leadId: 17, status: 'PENDING' }),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({ list: [], total: 0 }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: wrapped({}),
    });
  });

  await page.goto('/admin/leads?notification=failed');
  await expect(page.getByText('2 条咨询回复通知需要处理')).toBeVisible();
  await expect(page.getByText('邮件服务发送失败')).toBeVisible();
  await expect(page.getByText('发送结果未知')).toBeVisible();
  await expect(page.getByText('需人工核对，系统禁止重投')).toBeVisible();
  await expect(page.getByRole('button', { name: '重新投递' })).toHaveCount(1);

  await page.evaluate(() => {
    document.cookie = 'hc_csrf=lead-notification-csrf; path=/';
  });
  await page.getByRole('button', { name: '重新投递' }).click();
  await page.getByRole('button', { name: '确认重投' }).click();
  await expect(page.getByText('通知重投结果待确认', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用原凭据恢复' })).toBeVisible();
  await expect.poll(() => retries).toHaveLength(1);
  await page.waitForTimeout(250);
  expect(retries).toHaveLength(1);

  await page.getByRole('button', { name: '使用原凭据恢复' }).click();
  await page.getByRole('button', { name: '确认恢复' }).click();

  await expect.poll(() => retries).toHaveLength(2);
  expect(retries[0].id).toBe(81);
  expect(retries[0].headers['idempotency-key']).toBeTruthy();
  expect(retries[1].headers['idempotency-key']).toBe(retries[0].headers['idempotency-key']);
  expect(retries[1].headers['x-csrf-token']).toBe('lead-notification-csrf');
  expect(retries[1].headers.authorization).toBeUndefined();
  await expect(page.getByText('通知重投结果待确认', { exact: true })).toHaveCount(0);
});

test('留存到期入口是只读复核视图并携带服务端筛选', async ({ page }) => {
  await authenticateCustomerService(page);
  let retentionFilter = '';

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const url = new URL(route.request().url());
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({ list: [], total: 0 }),
      });
      return;
    }
    if (path === '/api/leads') {
      retentionFilter = url.searchParams.get('retentionDue') || '';
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [{
            id: 17,
            leadType: 'inquiry',
            leadTypeLabel: '预约咨询',
            customerName: '测试访客',
            relatedProducts: 0,
            status: 'COMPLETED',
            retentionUntil: '2026-08-26T00:00:00.000Z',
            createdAt: '2025-08-26T00:00:00.000Z',
          }],
          total: 1,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads?retention=due');
  await expect(page.getByText('正在查看留存期已到期的线索')).toBeVisible();
  await expect(page.getByText(/匿名化 CLI 默认只预览/)).toBeVisible();
  await expect(page.getByText('已到期', { exact: true })).toBeVisible();
  await expect.poll(() => retentionFilter).toBe('true');
});

test('超级管理员可在法律保留丢响应后显式使用原凭据恢复', async ({ page }) => {
  await authenticateSuperAdmin(page);
  const writes: Array<{
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }> = [];
  let held = false;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({ contentType: 'application/json', body: wrapped({ list: [], total: 0 }) });
      return;
    }
    if (path === '/api/leads/inquiry/17/legal-hold' && request.method() === 'POST') {
      writes.push({ body: request.postDataJSON(), headers: request.headers() });
      held = true;
      if (writes.length === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: wrapped({}) });
        return;
      }
      await route.fulfill({ contentType: 'application/json', body: wrapped({ id: 17 }) });
      return;
    }
    if (path === '/api/leads/inquiry/17') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          id: 17,
          leadType: 'inquiry',
          leadTypeLabel: '预约咨询',
          customerName: '测试访客',
          status: 'COMPLETED',
          message: '希望预约看款。',
          legalHoldAt: held ? '2026-08-27T00:00:00.000Z' : null,
          retentionUntil: '2026-08-26T00:00:00.000Z',
          createdAt: '2025-08-26T00:00:00.000Z',
          followUps: [],
        }),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [{
            id: 17,
            leadType: 'inquiry',
            leadTypeLabel: '预约咨询',
            customerName: '测试访客',
            relatedProducts: 0,
            status: 'COMPLETED',
            retentionUntil: '2026-08-26T00:00:00.000Z',
            createdAt: '2025-08-26T00:00:00.000Z',
          }],
          total: 1,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads?retention=due');
  await page.getByRole('button', { name: '查看' }).click();
  const drawer = page.getByRole('dialog', { name: '线索详情' });
  await expect(drawer.getByText('法律保留', { exact: true })).toBeVisible();
  await drawer.getByRole('combobox').first().click();
  await page.getByText('法律或监管要求', { exact: true }).click();
  await page.evaluate(() => {
    document.cookie = 'hc_csrf=lead-privacy-csrf; path=/';
  });
  await drawer.getByRole('button', { name: '设置法律保留' }).click();
  await page.getByRole('tooltip').getByRole('button', { name: /确\s*认/ }).click();

  await expect(drawer.getByText('法律保留操作结果待确认')).toBeVisible();
  await expect(drawer.getByRole('combobox').first()).toBeDisabled();
  await expect.poll(() => writes).toHaveLength(1);
  await page.waitForTimeout(250);
  expect(writes).toHaveLength(1);

  await drawer.getByRole('button', { name: '使用原凭据恢复' }).click();
  await page.getByRole('tooltip').getByRole('button', { name: /确\s*认/ }).click();

  await expect.poll(() => writes).toHaveLength(2);
  expect(writes[0].body).toEqual({ reason: 'LEGAL_REQUIREMENT' });
  expect(writes[1].body).toEqual(writes[0].body);
  expect(writes[0].headers['idempotency-key']).toBeTruthy();
  expect(writes[1].headers['idempotency-key']).toBe(writes[0].headers['idempotency-key']);
  expect(writes[1].headers['x-csrf-token']).toBe('lead-privacy-csrf');
  expect(writes[1].headers.authorization).toBeUndefined();
  await expect(drawer.getByText('该线索不会进入到期匿名化批次')).toBeVisible();
});

test('已匿名化线索保留结构化查看但禁止继续写入', async ({ page }) => {
  await authenticateSuperAdmin(page);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/profile') return route.fallback();
    if (path === '/api/leads/notification-failures') {
      await route.fulfill({ contentType: 'application/json', body: wrapped({ list: [], total: 0 }) });
      return;
    }
    if (path === '/api/leads/inquiry/17') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          id: 17,
          leadType: 'inquiry',
          leadTypeLabel: '预约咨询',
          customerName: '已匿名化',
          status: 'COMPLETED',
          privacyDisposition: 'ANONYMIZED',
          privacyDisposedAt: '2026-08-27T00:00:00.000Z',
          createdAt: '2025-08-26T00:00:00.000Z',
          followUps: [{
            id: 91,
            type: 'NOTE',
            content: '线索个人信息已按隐私规则匿名化',
            createdAt: '2026-08-27T00:00:00.000Z',
          }],
        }),
      });
      return;
    }
    if (path === '/api/leads') {
      await route.fulfill({
        contentType: 'application/json',
        body: wrapped({
          list: [{
            id: 17,
            leadType: 'inquiry',
            leadTypeLabel: '预约咨询',
            customerName: '已匿名化',
            relatedProducts: 0,
            status: 'COMPLETED',
            privacyDisposition: 'ANONYMIZED',
            privacyDisposedAt: '2026-08-27T00:00:00.000Z',
            createdAt: '2025-08-26T00:00:00.000Z',
          }],
          total: 1,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: wrapped({}) });
  });

  await page.goto('/admin/leads');
  await expect(page.getByRole('cell', { name: '已匿名化' }).first()).toBeVisible();
  await page.getByRole('button', { name: '查看' }).click();
  const drawer = page.getByRole('dialog', { name: '线索详情' });
  await expect(drawer.getByText('该线索已完成匿名化')).toBeVisible();
  await expect(drawer.getByPlaceholder('添加内部备注或跟进记录...')).toHaveCount(0);
  await expect(drawer.getByText('状态流转：')).toHaveCount(0);
  await expect(drawer.getByText('指派负责人：')).toHaveCount(0);
});
