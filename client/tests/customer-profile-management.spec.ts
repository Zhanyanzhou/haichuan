import { expect, test, type Page, type Route } from '@playwright/test';
import { installCustomerSession } from './fixtures/session-auth';

type ObservedRequest = {
  path: string;
  method: string;
  body?: unknown;
  contentType: string;
};

function success(route: Route, data: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 200, data, message: 'success' }),
  });
}

async function installProfileRoutes(
  page: Page,
  observe: (request: ObservedRequest) => void,
  profileOptions: {
    hasPassword?: boolean;
    avatarUrl?: string | null;
    failAvatarDelete?: boolean;
  } = {},
) {
  let avatarDeleted = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let body: unknown;
    if ((request.headers()['content-type'] || '').includes('application/json')) {
      body = request.postDataJSON();
    }
    observe({ path, method, body, contentType: request.headers()['content-type'] || '' });

    if (path === '/api/customers/me' && method === 'GET') {
      return success(route, {
        id: 7,
        name: '海川会员',
        phone: '13800138000',
        email: 'member@example.com',
        hasPassword: profileOptions.hasPassword ?? true,
        avatarUrl: avatarDeleted ? null : profileOptions.avatarUrl ?? null,
        phoneChangeAvailableAt: null,
        emailChangeAvailableAt: null,
        updatedAt: '2026-09-11T00:00:00.000Z',
      });
    }
    if (path === '/api/customers/me' && method === 'PUT') {
      return success(route, { id: 7, name: '海川贵宾 7', phone: '13800138000' });
    }
    if (path === '/api/customers/me/password' && method === 'PUT') {
      return success(route, { requiresReauthentication: true });
    }
    if (path === '/api/customers/me/security/sms-code' && method === 'POST') {
      return success(route, { message: '验证码已发送' });
    }
    if (path === '/api/customers/me/contact-changes' && method === 'POST') {
      return success(route, {
        changeId: '123e4567-e89b-12d3-a456-426614174000',
        expiresAt: '2026-09-11T00:10:00.000Z',
        maskedTarget: 'ne***@example.com',
        message: '验证码已发送',
      });
    }
    if (path === '/api/customers/me/contact-changes/123e4567-e89b-12d3-a456-426614174000' && method === 'PUT') {
      return success(route, { requiresReauthentication: true });
    }
    if (path === '/api/customers/me/avatar' && method === 'PUT') {
      return success(route, { avatarUrl: '/api/customers/me/avatar', updatedAt: new Date().toISOString() });
    }
    if (path === '/api/customers/me/avatar' && method === 'DELETE') {
      if (profileOptions.failAvatarDelete) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: 'private storage unavailable' }),
        });
      }
      avatarDeleted = true;
      return success(route, { avatarUrl: null, updatedAt: new Date().toISOString() });
    }
    if (path === '/api/customers/session/logout') return success(route, { success: true });
    if (path === '/api/settings/flags') {
      return success(route, {
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
        partnerApplicationsWriteEnabled: false,
      });
    }
    if (path === '/api/customers/me/notifications') {
      return success(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
    }
    if (path === '/api/partner-applications/me') return success(route, null);
    return success(route, []);
  });
}

test.describe('客户个人资料管理', () => {
  test.beforeEach(async ({ page }) => {
    await installCustomerSession(page, { id: 7, name: '海川会员' });
  });

  test('称呼只能独立修改，头像上传使用专用受保护接口', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request));
    await page.goto('/customer');
    await expect(page.getByRole('heading', { name: '我的账号' })).toBeVisible();
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: '修改称呼' }).click();
    const dialog = page.getByRole('dialog', { name: '修改称呼' });
    await expect(dialog.getByLabel('称呼')).toHaveValue('海川会员');
    await dialog.getByLabel('称呼').fill('海川贵宾 7');
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary').click();
    await expect(dialog).toBeHidden();
    expect(requests.filter((item) => item.path === '/api/customers/me' && item.method === 'PUT').at(-1)?.body)
      .toEqual({ name: '海川贵宾 7' });

    const fileInput = page.locator('#my-profile input[type="file"]');
    await fileInput.setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC1sAAAAASUVORK5CYII=', 'base64'),
    });
    await expect.poll(() => requests.some((item) => item.path === '/api/customers/me/avatar' && item.method === 'PUT')).toBe(true);
    expect(requests.find((item) => item.path === '/api/customers/me/avatar')?.contentType)
      .toMatch(/^multipart\/form-data;\s*boundary=/i);
  });

  test('改密执行组合校验并在成功后退出当前会话', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request));
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '修改密码' }).click();
    const dialog = page.getByRole('dialog', { name: '修改登录密码' });
    await dialog.locator('input[type="password"]').first().fill('Oldpass1');
    await dialog.getByLabel('新密码', { exact: true }).fill('12345678');
    await dialog.getByLabel('确认新密码').fill('12345678');
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary').click();
    await expect(dialog.locator('.ant-form-item-explain-error')).toHaveText('密码需为 6–18 位，并同时包含字母和数字');
    expect(requests.some((item) => item.path === '/api/customers/me/password')).toBe(false);

    await dialog.getByLabel('新密码', { exact: true }).fill('Newpass2');
    await dialog.getByLabel('确认新密码').fill('Newpass2');
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary').click();
    await expect.poll(() => requests.some((item) => item.path === '/api/customers/session/logout')).toBe(true);
    expect(requests.find((item) => item.path === '/api/customers/me/password')?.body).toEqual({
      currentPassword: 'Oldpass1',
      newPassword: 'Newpass2',
    });
  });

  test('已有头像可确认删除，成功后刷新为称呼首字', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      avatarUrl: '/api/customers/me/avatar',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await expect(page.getByRole('img', { name: '海川会员的头像' })).toBeVisible();

    await page.getByRole('button', { name: '删除头像' }).click();
    const confirm = page.getByRole('dialog', { name: '删除当前头像？' });
    await expect(confirm.getByText('删除后将改为显示称呼首字；您仍可随时重新上传头像。')).toBeVisible();
    await confirm.getByRole('button', { name: '删除头像' }).click();

    await expect.poll(() => requests.some((item) =>
      item.path === '/api/customers/me/avatar' && item.method === 'DELETE',
    )).toBe(true);
    await expect(page.getByRole('img', { name: '海川会员的头像' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '删除头像' })).toHaveCount(0);
    await expect(page.locator('.my-account__avatar')).toContainText('海');
  });

  test('头像删除失败保留当前头像并允许从原动作重试', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      avatarUrl: '/api/customers/me/avatar',
      failAvatarDelete: true,
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '删除头像' }).click();
    const confirm = page.getByRole('dialog', { name: '删除当前头像？' });
    await confirm.getByRole('button', { name: '删除头像' }).click();

    await expect.poll(() => requests.filter((item) =>
      item.path === '/api/customers/me/avatar' && item.method === 'DELETE',
    ).length).toBe(1);
    await expect(page.getByText('头像删除失败，当前头像已保留，请重试')).toBeVisible();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('img', { name: '海川会员的头像' })).toBeVisible();
    await page.getByRole('button', { name: '删除头像' }).click();
    const retryConfirm = page.getByRole('dialog', { name: '删除当前头像？' });
    await expect(retryConfirm).toBeVisible();
    await retryConfirm.getByRole('button', { name: '保留头像' }).click();
  });

  test('邮箱换绑必须完成旧身份和新邮箱两阶段验证', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request));
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '更换邮箱' }).click();
    const dialog = page.getByRole('dialog', { name: '更换邮箱' });
    await dialog.getByLabel('新邮箱').fill('new@example.com');
    await dialog.locator('input[type="password"]').fill('Oldpass1');
    await page.getByRole('button', { name: '验证并发送新验证码', exact: true }).click();
    await expect(dialog.getByText('验证码已发送至 ne***@example.com，10 分钟内有效。')).toBeVisible();
    expect(requests.find((item) => item.path === '/api/customers/me/contact-changes')?.body).toEqual({
      type: 'EMAIL',
      newValue: 'new@example.com',
      currentPassword: 'Oldpass1',
    });

    await dialog.getByLabel('新邮箱验证码').fill('123456');
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary').click();
    expect(requests.find((item) => item.path.includes('/contact-changes/') && item.method === 'PUT')?.body)
      .toEqual({ verificationCode: '123456' });
    await expect.poll(() => requests.some((item) => item.path === '/api/customers/session/logout')).toBe(true);
  });

  test('无密码客户默认使用手机验证码设置密码和换绑', async ({ page }) => {
    await installProfileRoutes(page, () => undefined, { hasPassword: false });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: '设置密码' }).click();
    const passwordDialog = page.getByRole('dialog', { name: '修改登录密码' });
    await expect(passwordDialog.getByRole('radio', { name: '当前密码' })).toBeDisabled();
    await expect(passwordDialog.getByRole('radio', { name: '手机验证码' })).toBeChecked();
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-default').click();
    await expect(passwordDialog).toBeHidden();

    await page.getByRole('button', { name: '更换邮箱' }).click();
    const contactDialog = page.getByRole('dialog', { name: '更换邮箱' });
    await expect(contactDialog.getByRole('radio', { name: '当前密码' })).toBeDisabled();
    await expect(contactDialog.getByRole('radio', { name: '当前手机验证码' })).toBeChecked();
  });

  test('手机宽度下资料区无水平溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installProfileRoutes(page, () => undefined, {
      avatarUrl: '/api/customers/me/avatar',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '修改密码' })).toBeVisible();
    await expect(page.getByRole('button', { name: '删除头像' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
