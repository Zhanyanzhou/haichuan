import { expect, test, type Page } from '@playwright/test';

async function authenticateCustomerService(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'lead-follow-up-test-token');
    localStorage.setItem(
      'jewelry-auth',
      JSON.stringify({
        state: {
          token: 'lead-follow-up-test-token',
          user: {
            id: 7,
            username: 'customer-service-7',
            role: 'CUSTOMER_SERVICE',
            name: '客服七号',
          },
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
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
    document.cookie = 'hc_admin_csrf=lead-csrf-token; path=/';
  });
  await drawer.getByRole('button', { name: '添加跟进' }).click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].headers.authorization).toBe(
    'Bearer lead-follow-up-test-token',
  );
  expect(writes[0].headers['x-csrf-token']).toBe('lead-csrf-token');
  expect(writes[0].body).toEqual({
    content: '已电话确认到店时间',
    contactMethod: 'other',
  });
});
