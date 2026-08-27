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

test('线索跟进请求保持员工鉴权和最小请求体合同', async ({ page }) => {
  await authenticateCustomerService(page);
  const writes: Array<{
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];

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
          message: '希望预约看款。',
          createdAt: '2026-08-26T00:00:00.000Z',
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
              customerName: '测试访客',
              phone: '13800000000',
              relatedProducts: 0,
              status: 'PENDING',
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
  await drawer
    .getByPlaceholder('添加内部备注或跟进记录...')
    .fill('已电话确认到店时间');
  await page.evaluate(() => {
    document.cookie = 'hc_csrf=lead-csrf-token; path=/';
  });
  await drawer.getByRole('button', { name: '添加跟进' }).click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].headers.authorization).toBeUndefined();
  expect(writes[0].headers['x-csrf-token']).toBe('lead-csrf-token');
  expect(writes[0].body).toEqual({
    content: '已电话确认到店时间',
    contactMethod: 'other',
  });
});

test('通知失败可发现且只允许安全失败进入人工重投队列', async ({ page }) => {
  await authenticateCustomerService(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const retries: number[] = [];

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
      retries.push(81);
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
  await expect.poll(() => retries).toEqual([81]);
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

test('只有超级管理员可在详情中设置结构化法律保留', async ({ page }) => {
  await authenticateSuperAdmin(page);
  const writes: Array<Record<string, unknown>> = [];
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
      writes.push(request.postDataJSON());
      held = true;
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

  await expect.poll(() => writes).toEqual([{ reason: 'LEGAL_REQUIREMENT' }]);
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
