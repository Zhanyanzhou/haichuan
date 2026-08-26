import { expect, test, type Page } from '@playwright/test';

async function authenticateWarehouseOperator(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'warehouse-manage-test-token');
    localStorage.setItem(
      'jewelry-auth',
      JSON.stringify({
        state: {
          token: 'warehouse-manage-test-token',
          user: {
            id: 1,
            username: 'warehouse-operator',
            role: 'SUPER_ADMIN',
            name: '仓库管理员',
          },
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

test('仓库管理加载与新建请求保持当前员工合同', async ({ page }) => {
  await authenticateWarehouseOperator(page);
  const writes: Array<{
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/warehouses' && request.method() === 'POST') {
      writes.push({
        headers: request.headers(),
        body: request.postDataJSON(),
      });
    }

    const data =
      path === '/api/warehouses' && request.method() === 'GET'
        ? [
            {
              id: 1,
              name: '深圳展厅',
              type: 'SHOWROOM',
              address: '深圳市福田区',
              contact: '陈经理',
              phone: '13800138000',
              isActive: true,
              _count: { inventories: 5 },
            },
          ]
        : path === '/api/warehouses' && request.method() === 'POST'
          ? { id: 2, name: '广州工厂', type: 'FACTORY' }
          : path === '/api/settings/flags'
            ? {
                commerceEnabled: false,
                cartEnabled: false,
                paymentEnabled: false,
              }
            : {};

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data, message: 'ok' }),
    });
  });

  await page.goto('/admin/warehouses');
  await expect(page.getByRole('heading', { name: '仓库管理' })).toBeVisible();
  await expect(page.getByText('深圳展厅', { exact: true })).toBeVisible();
  await expect(page.getByText('5', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    document.cookie = 'hc_admin_csrf=warehouse-csrf-token; path=/';
  });
  await page.getByRole('button', { name: '新建仓库' }).click();
  const dialog = page.getByRole('dialog', { name: '新建仓库' });
  await dialog.getByLabel('仓库名称').fill('广州展厅');
  await dialog.getByLabel('地址（选填）').fill('广州市番禺区');
  await dialog.getByRole('button', { name: /保\s*存/ }).click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].headers.authorization).toBe(
    'Bearer warehouse-manage-test-token',
  );
  expect(writes[0].headers['x-csrf-token']).toBe('warehouse-csrf-token');
  expect(writes[0].body).toEqual({
    name: '广州展厅',
    type: 'SHOWROOM',
    address: '广州市番禺区',
  });
});
