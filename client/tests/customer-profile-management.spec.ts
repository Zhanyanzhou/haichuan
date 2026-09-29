import { expect, test, type Page, type Route } from '@playwright/test';
import { installCustomerSession } from './fixtures/session-auth';

type ObservedRequest = {
  path: string;
  method: string;
  body?: unknown;
  contentType: string;
  idempotencyKey?: string;
};

type MockCustomerAddress = {
  id: number;
  recipientName: string;
  recipientPhone: string;
  province: string | null;
  city: string | null;
  district: string | null;
  detail: string;
  postalCode: string | null;
  isDefault: boolean;
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
    loseFirstAvatarDeleteResponse?: boolean;
    failProfileReadAfterAvatarDelete?: boolean;
    avatarUploadResponseLoss?: 'COMMITTED' | 'NOT_COMMITTED' | 'UNKNOWN';
    passwordResponseLoss?: 'COMMITTED' | 'NOT_COMMITTED' | 'UNKNOWN';
    contactConfirmResponseLoss?: 'COMMITTED' | 'NOT_COMMITTED' | 'UNKNOWN';
    accountCloseResponseLoss?: 'COMMITTED' | 'NOT_COMMITTED' | 'UNKNOWN';
    profileNameResponseLoss?: 'COMMITTED' | 'NOT_COMMITTED' | 'UNKNOWN';
    logoutGate?: Promise<void>;
    onLogoutStarted?: () => void;
    onLogoutCompleted?: () => void;
    addresses?: MockCustomerAddress[];
    exportData?: Record<string, unknown>;
    favorites?: Array<{
      id: number;
      productId: number;
      name: string;
      favoritedAt: string;
    }>;
    loseFirstFavoriteDeleteResponse?: boolean;
    loseFirstAddressCreateResponse?: boolean;
    loseFirstAddressUpdateResponse?: boolean;
    failAddressReadsAfterUpdate?: boolean;
    loseFirstAddressDeleteResponse?: boolean;
    onAddressLogicalWrite?: () => void;
    onAddressUpdateLogicalWrite?: () => void;
    onAddressDeleteLogicalWrite?: () => void;
  } = {},
) {
  let avatarDeleted = false;
  let avatarDeleteAttempts = 0;
  let avatarUploadAttempts = 0;
  let currentAvatarOperationKey: string | null = null;
  let passwordAttempts = 0;
  let contactConfirmAttempts = 0;
  let accountCloseAttempts = 0;
  let profileName = '海川会员';
  let profileNameAttempts = 0;
  let profileNameReadUnavailable = false;
  let securitySessionInvalidated = false;
  let securityProfileReadUnavailable = false;
  let favorites = [...(profileOptions.favorites ?? [])];
  let favoriteDeleteAttempts = 0;
  const addresses = [...(profileOptions.addresses ?? [])];
  const addressCreateResults = new Map<
    string,
    { fingerprint: string; address: MockCustomerAddress }
  >();
  let addressCreateAttempts = 0;
  let addressUpdateAttempts = 0;
  let addressDeleteAttempts = 0;
  let nextAddressId = Math.max(0, ...addresses.map((address) => address.id)) + 1;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let body: unknown;
    if ((request.headers()['content-type'] || '').includes('application/json')) {
      body = request.postDataJSON();
    }
    observe({
      path,
      method,
      body,
      contentType: request.headers()['content-type'] || '',
      idempotencyKey: request.headers()['idempotency-key'],
    });

    if (path === '/api/customers/me' && method === 'GET') {
      if (profileNameReadUnavailable) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟称呼写入后的权威读取不可用' }),
        });
      }
      if (profileOptions.failProfileReadAfterAvatarDelete && avatarDeleteAttempts > 0) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟客户资料权威读取不可用' }),
        });
      }
      if (securityProfileReadUnavailable) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟敏感写入后的权威读取不可用' }),
        });
      }
      if (securitySessionInvalidated) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ code: 401, message: '客户会话已失效' }),
        });
      }
      return success(route, {
        id: 7,
        name: profileName,
        phone: '13800138000',
        email: 'member@example.com',
        hasPassword: profileOptions.hasPassword ?? true,
        avatarUrl: avatarDeleted
          ? null
          : currentAvatarOperationKey
            ? '/api/customers/me/avatar'
            : profileOptions.avatarUrl ?? null,
        phoneChangeAvailableAt: null,
        emailChangeAvailableAt: null,
        updatedAt: '2026-09-11T00:00:00.000Z',
      });
    }
    if (path === '/api/customers/me' && method === 'PUT') {
      profileNameAttempts += 1;
      const requestedName = String((body as { name?: unknown })?.name ?? '');
      if (profileOptions.profileNameResponseLoss && profileNameAttempts === 1) {
        if (profileOptions.profileNameResponseLoss !== 'NOT_COMMITTED') {
          profileName = requestedName;
        }
        profileNameReadUnavailable = profileOptions.profileNameResponseLoss === 'UNKNOWN';
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟称呼更新响应丢失' }),
        });
      }
      profileName = requestedName;
      return success(route, { id: 7, name: profileName, phone: '13800138000' });
    }
    if (path === '/api/customers/me/password' && method === 'PUT') {
      passwordAttempts += 1;
      if (profileOptions.passwordResponseLoss && passwordAttempts === 1) {
        securitySessionInvalidated = profileOptions.passwordResponseLoss === 'COMMITTED';
        securityProfileReadUnavailable = profileOptions.passwordResponseLoss === 'UNKNOWN';
        return route.abort('connectionrefused');
      }
      return success(route, { requiresReauthentication: true });
    }
    if (path === '/api/customers/me/security/sms-code' && method === 'POST') {
      return success(route, { message: '验证码已发送' });
    }
    if (path === '/api/customers/me/close/sms-code' && method === 'POST') {
      return success(route, { message: '注销验证码已发送' });
    }
    if (path === '/api/customers/me/close' && method === 'POST') {
      accountCloseAttempts += 1;
      if (profileOptions.accountCloseResponseLoss && accountCloseAttempts === 1) {
        securitySessionInvalidated = profileOptions.accountCloseResponseLoss === 'COMMITTED';
        securityProfileReadUnavailable = profileOptions.accountCloseResponseLoss === 'UNKNOWN';
        return route.abort('connectionrefused');
      }
      return success(route, { retainedUnderLegalHold: 0 });
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
      contactConfirmAttempts += 1;
      if (profileOptions.contactConfirmResponseLoss && contactConfirmAttempts === 1) {
        securitySessionInvalidated = profileOptions.contactConfirmResponseLoss === 'COMMITTED';
        securityProfileReadUnavailable = profileOptions.contactConfirmResponseLoss === 'UNKNOWN';
        return route.abort('connectionrefused');
      }
      return success(route, { requiresReauthentication: true });
    }
    if (path === '/api/customers/me/avatar' && method === 'PUT') {
      avatarUploadAttempts += 1;
      const idempotencyKey = request.headers()['idempotency-key'];
      if (!idempotencyKey) {
        return route.fulfill({
          status: 428,
          contentType: 'application/json',
          body: JSON.stringify({ code: 428, message: '缺少 Idempotency-Key 请求头' }),
        });
      }
      if (profileOptions.avatarUploadResponseLoss && avatarUploadAttempts === 1) {
        if (profileOptions.avatarUploadResponseLoss === 'COMMITTED') {
          currentAvatarOperationKey = idempotencyKey;
        }
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟头像上传响应丢失' }),
        });
      }
      currentAvatarOperationKey = idempotencyKey;
      return success(route, { avatarUrl: '/api/customers/me/avatar', updatedAt: new Date().toISOString() });
    }
    if (path === '/api/customers/me/avatar/status' && method === 'GET') {
      if (profileOptions.avatarUploadResponseLoss === 'UNKNOWN' && avatarUploadAttempts > 0) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟头像上传状态核验不可用' }),
        });
      }
      const idempotencyKey = request.headers()['idempotency-key'];
      return success(route, {
        status: idempotencyKey && idempotencyKey === currentAvatarOperationKey
          ? 'CURRENT'
          : 'NOT_CURRENT',
      });
    }
    if (path === '/api/customers/me/avatar' && method === 'DELETE') {
      avatarDeleteAttempts += 1;
      if (profileOptions.failAvatarDelete) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: 'private storage unavailable' }),
        });
      }
      avatarDeleted = true;
      if (profileOptions.loseFirstAvatarDeleteResponse && avatarDeleteAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟头像删除响应丢失' }),
        });
      }
      return success(route, { avatarUrl: null, updatedAt: new Date().toISOString() });
    }
    if (path === '/api/customers/me/addresses' && method === 'GET') {
      if (profileOptions.failAddressReadsAfterUpdate && addressUpdateAttempts > 0) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟地址权威读取不可用' }),
        });
      }
      return success(route, addresses);
    }
    if (path === '/api/customers/me/addresses' && method === 'POST') {
      addressCreateAttempts += 1;
      const idempotencyKey = request.headers()['idempotency-key'];
      if (!idempotencyKey) {
        return route.fulfill({
          status: 428,
          contentType: 'application/json',
          body: JSON.stringify({ code: 428, message: '缺少 Idempotency-Key 请求头' }),
        });
      }
      const input = body as {
        recipientName: string;
        recipientPhone: string;
        province?: string;
        city?: string;
        district?: string;
        detail: string;
        postalCode?: string;
        isDefault?: boolean;
      };
      const fingerprint = JSON.stringify(input);
      const existing = addressCreateResults.get(idempotencyKey);
      if (existing && existing.fingerprint !== fingerprint) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 409, message: '幂等键已用于不同地址' }),
        });
      }
      let created = existing?.address;
      if (!created) {
        const isDefault = input.isDefault === true || addresses.length === 0;
        if (isDefault) {
          for (const address of addresses) address.isDefault = false;
        }
        created = {
          id: nextAddressId++,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          province: input.province ?? null,
          city: input.city ?? null,
          district: input.district ?? null,
          detail: input.detail,
          postalCode: input.postalCode ?? null,
          isDefault,
        };
        addresses.push(created);
        addressCreateResults.set(idempotencyKey, { fingerprint, address: created });
        profileOptions.onAddressLogicalWrite?.();
      }
      if (profileOptions.loseFirstAddressCreateResponse && addressCreateAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟地址创建响应丢失' }),
        });
      }
      return success(route, created);
    }
    if (/^\/api\/customers\/me\/addresses\/\d+$/.test(path) && method === 'PUT') {
      addressUpdateAttempts += 1;
      const addressId = Number(path.split('/').at(-1));
      const address = addresses.find((candidate) => candidate.id === addressId);
      if (!address) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 404, message: '地址不存在' }),
        });
      }
      const input = body as {
        recipientName: string;
        recipientPhone: string;
        province?: string;
        city?: string;
        district?: string;
        detail: string;
        postalCode?: string;
        isDefault?: boolean;
      };
      if (input.isDefault === true) {
        for (const candidate of addresses) candidate.isDefault = false;
      }
      Object.assign(address, {
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        province: input.province ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        detail: input.detail,
        postalCode: input.postalCode ?? null,
        isDefault: input.isDefault === true,
      });
      profileOptions.onAddressUpdateLogicalWrite?.();
      if (profileOptions.loseFirstAddressUpdateResponse && addressUpdateAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟地址编辑响应丢失' }),
        });
      }
      return success(route, address);
    }
    if (/^\/api\/customers\/me\/addresses\/\d+$/.test(path) && method === 'DELETE') {
      addressDeleteAttempts += 1;
      const addressId = Number(path.split('/').at(-1));
      const addressIndex = addresses.findIndex((address) => address.id === addressId);
      if (addressIndex >= 0) {
        addresses.splice(addressIndex, 1);
        profileOptions.onAddressDeleteLogicalWrite?.();
      }
      if (profileOptions.loseFirstAddressDeleteResponse && addressDeleteAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟地址删除响应丢失' }),
        });
      }
      return success(route, { success: true });
    }
    if (path === '/api/customers/me/favorites' && method === 'GET') {
      return success(route, favorites);
    }
    if (/^\/api\/customers\/me\/favorites\/\d+$/.test(path) && method === 'DELETE') {
      favoriteDeleteAttempts += 1;
      const productId = Number(path.split('/').at(-1));
      favorites = favorites.filter((favorite) => favorite.productId !== productId);
      if (profileOptions.loseFirstFavoriteDeleteResponse && favoriteDeleteAttempts === 1) {
        return route.abort('connectionrefused');
      }
      return success(route, { favorited: false });
    }
    if (path === '/api/customers/me/data-export' && method === 'GET') {
      return success(route, profileOptions.exportData ?? {});
    }
    if (path === '/api/customers/session/refresh' && securitySessionInvalidated) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 401, message: '客户会话已失效' }),
      });
    }
    if (path === '/api/customers/session/logout') {
      profileOptions.onLogoutStarted?.();
      await profileOptions.logoutGate;
      profileOptions.onLogoutCompleted?.();
      return success(route, { success: true });
    }
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

  test('远端退出响应挂起时立即清除本地身份和私有界面', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    let logoutStarted = false;
    let logoutCompleted = false;
    let logoutReleased = false;
    let releaseLogout!: () => void;
    const logoutGate = new Promise<void>((resolve) => {
      releaseLogout = () => {
        logoutReleased = true;
        resolve();
      };
    });
    await installProfileRoutes(page, (request) => requests.push(request), {
      logoutGate,
      onLogoutStarted: () => {
        logoutStarted = true;
      },
      onLogoutCompleted: () => {
        logoutCompleted = true;
      },
    });
    let currentCustomer = {
      id: 7,
      name: '海川会员',
      phone: '13800138000',
      email: 'member@example.com',
    };
    await page.route('**/api/customers/me', (route) => success(route, {
      ...currentCustomer,
      hasPassword: true,
      avatarUrl: null,
      phoneChangeAvailableAt: null,
      emailChangeAvailableAt: null,
      updatedAt: '2026-09-23T00:00:00.000Z',
    }));
    await page.route('**/api/customers/login/challenge', (route) =>
      success(route, { level: 'none' }));
    await page.route('**/api/customers/login', (route) => {
      currentCustomer = {
        id: 8,
        name: '新会话客户',
        phone: '13900139000',
        email: 'new-session@example.com',
      };
      return success(route, { customer: currentCustomer });
    });
    await page.goto('/customer');
    await expect(page.getByRole('heading', { name: '我的账号' })).toBeVisible();

    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect.poll(() => logoutStarted).toBe(true);
    await expect(page.getByRole('button', { name: '登录我的账户' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '我的账号' })).toHaveCount(0);
    expect(logoutReleased).toBe(false);
    expect(requests.filter((item) =>
      item.path === '/api/customers/session/logout' && item.method === 'POST'
    )).toHaveLength(1);

    await page.getByLabel('手机号').fill('13900139000');
    await page.getByLabel('密码').fill('NewSession1');
    await page.getByRole('button', { name: '登录我的账户' }).click();
    await expect(page.getByText('您好，新会话客户。您的作品、咨询与服务记录都在这里。'))
      .toBeVisible();

    releaseLogout();
    await expect.poll(() => logoutCompleted).toBe(true);
    await expect(page.getByText('您好，新会话客户。您的作品、咨询与服务记录都在这里。'))
      .toBeVisible();
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
    expect(requests.find((item) =>
      item.path === '/api/customers/me/avatar' && item.method === 'PUT'
    )?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test('头像已提交但响应丢失时只读核验成功且不重复 PUT', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      avatarUploadResponseLoss: 'COMMITTED',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.locator('#my-profile input[type="file"]').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC1sAAAAASUVORK5CYII=', 'base64'),
    });

    await expect(page.getByText('头像已更新并完成权威核验')).toBeVisible();
    await expect(page.getByRole('img', { name: '海川会员的头像' })).toBeVisible();
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/avatar' && request.method === 'PUT'
    )).toHaveLength(1);
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/avatar/status' && request.method === 'GET'
    )).toHaveLength(1);
  });

  test('头像未成为当前头像时保留同一凭据供用户安全重试', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      avatarUploadResponseLoss: 'NOT_COMMITTED',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    const avatarFile = {
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC1sAAAAASUVORK5CYII=', 'base64'),
    };
    const input = page.locator('#my-profile input[type="file"]');

    await input.setInputFiles(avatarFile);
    await expect(page.getByText('本次图片尚未成为当前头像；请重新选择同一图片安全重试。')).toBeVisible();
    await input.setInputFiles(avatarFile);
    await expect(page.getByText('头像已更新')).toBeVisible();

    const uploads = requests.filter((request) =>
      request.path === '/api/customers/me/avatar' && request.method === 'PUT'
    );
    expect(uploads).toHaveLength(2);
    expect(uploads[0].idempotencyKey).toBeTruthy();
    expect(uploads[1].idempotencyKey).toBe(uploads[0].idempotencyKey);
  });

  test('头像响应和状态核验均不可用时保持待确认且不自动重复 PUT', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      avatarUploadResponseLoss: 'UNKNOWN',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.locator('#my-profile input[type="file"]').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC1sAAAAASUVORK5CYII=', 'base64'),
    });

    await expect(page.getByText('头像上传结果待确认；系统不会自动重复上传，请稍后重新选择同一图片恢复。')).toBeVisible();
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/avatar' && request.method === 'PUT'
    )).toHaveLength(1);
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/avatar/status' && request.method === 'GET'
    )).toHaveLength(1);
  });

  test('称呼已提交但响应丢失时只读核验成功且不重复 PUT', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      profileNameResponseLoss: 'COMMITTED',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: '修改称呼' }).click();
    const dialog = page.getByRole('dialog', { name: '修改称呼' });
    await expect(dialog.getByLabel('称呼')).toHaveValue('海川会员');
    await dialog.getByLabel('称呼').fill('响应丢失后称呼');
    await dialog.getByRole('button', { name: /保\s*存/ }).click();

    await expect(page.getByText('称呼已更新并完成权威核验')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#my-profile').getByText('响应丢失后称呼', { exact: true })).toBeVisible();
    expect(requests.filter((request) =>
      request.path === '/api/customers/me' && request.method === 'PUT'
    )).toHaveLength(1);
    expect(requests.filter((request) =>
      request.path === '/api/customers/me' && request.method === 'GET'
    ).length).toBeGreaterThanOrEqual(2);
  });

  test('称呼写入未提交时权威回读保留表单并允许安全重试', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      profileNameResponseLoss: 'NOT_COMMITTED',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: '修改称呼' }).click();
    const dialog = page.getByRole('dialog', { name: '修改称呼' });
    await expect(dialog.getByLabel('称呼')).toHaveValue('海川会员');
    await dialog.getByLabel('称呼').fill('尚未提交的称呼');
    await dialog.getByRole('button', { name: /保\s*存/ }).click();

    expect(requests.filter((request) =>
      request.path === '/api/customers/me' && request.method === 'PUT'
    )).toHaveLength(1);
    await expect(page.getByText('称呼更新未生效；系统已读取权威资料，您可以安全重试。')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('称呼')).toHaveValue('尚未提交的称呼');
  });

  test('称呼响应和权威读取均不可用时保持待确认且不自动重复 PUT', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      profileNameResponseLoss: 'UNKNOWN',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: '修改称呼' }).click();
    const dialog = page.getByRole('dialog', { name: '修改称呼' });
    await expect(dialog.getByLabel('称呼')).toHaveValue('海川会员');
    await dialog.getByLabel('称呼').fill('待确认的称呼');
    await dialog.getByRole('button', { name: /保\s*存/ }).click();

    await expect(page.getByText('称呼更新结果待确认；系统不会自动重复保存，请保留当前输入并稍后重试。')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('称呼')).toHaveValue('待确认的称呼');
    expect(requests.filter((request) =>
      request.path === '/api/customers/me' && request.method === 'PUT'
    )).toHaveLength(1);
    expect(requests.filter((request) =>
      request.path === '/api/customers/me' && request.method === 'GET'
    ).length).toBeGreaterThanOrEqual(2);
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

  test('密码修改已提交但响应丢失时只读核验会话并转为重新登录确认', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      passwordResponseLoss: 'COMMITTED',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '修改密码' }).click();
    const dialog = page.getByRole('dialog', { name: '修改登录密码' });
    await dialog.locator('input[type="password"]').first().fill('Oldpass1');
    await dialog.getByLabel('新密码', { exact: true }).fill('Newpass2');
    await dialog.getByLabel('确认新密码').fill('Newpass2');
    await dialog.getByRole('button', { name: '确认修改' }).click();

    await expect(page.getByText(/密码修改结果待确认；当前登录状态已失效/)).toBeVisible();
    await expect.poll(() => requests.some((item) =>
      item.path === '/api/customers/session/logout' && item.method === 'POST',
    )).toBe(true);
    expect(requests.filter((item) =>
      item.path === '/api/customers/me/password' && item.method === 'PUT'
    )).toHaveLength(1);
    expect(requests.filter((item) =>
      item.path === '/api/customers/me' && item.method === 'GET'
    ).length).toBeGreaterThanOrEqual(2);
    await expect(page.getByText('密码已修改，请重新登录')).toHaveCount(0);
  });

  test('密码修改确定未生效时保留表单并允许安全重试', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      passwordResponseLoss: 'NOT_COMMITTED',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '修改密码' }).click();
    const dialog = page.getByRole('dialog', { name: '修改登录密码' });
    await dialog.locator('input[type="password"]').first().fill('Oldpass1');
    await dialog.getByLabel('新密码', { exact: true }).fill('Newpass2');
    await dialog.getByLabel('确认新密码').fill('Newpass2');
    await dialog.getByRole('button', { name: '确认修改' }).click();

    await expect(page.getByText(/密码修改未生效，当前会话仍有效；您可以安全重试/)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('新密码', { exact: true })).toHaveValue('Newpass2');
    await expect(dialog.getByRole('button', { name: '确认修改' })).toBeEnabled();
    expect(requests.filter((item) => item.path === '/api/customers/me/password')).toHaveLength(1);
  });

  test('密码修改响应和权威读取均不可用时冻结重复提交', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      passwordResponseLoss: 'UNKNOWN',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '修改密码' }).click();
    const dialog = page.getByRole('dialog', { name: '修改登录密码' });
    await dialog.locator('input[type="password"]').first().fill('Oldpass1');
    await dialog.getByLabel('新密码', { exact: true }).fill('Newpass2');
    await dialog.getByLabel('确认新密码').fill('Newpass2');
    await dialog.getByRole('button', { name: '确认修改' }).click();

    await expect(dialog.getByRole('alert')).toContainText('上次密码修改结果尚未确认');
    await expect(dialog.getByRole('button', { name: '确认修改' })).toBeDisabled();
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-default').click();
    await page.getByRole('button', { name: '修改密码' }).click();
    await expect(page.getByRole('dialog', { name: '修改登录密码' })
      .getByRole('button', { name: '确认修改' })).toBeDisabled();
    expect(requests.filter((item) => item.path === '/api/customers/me/password')).toHaveLength(1);
  });

  test('心愿单移出使用幂等 DELETE，首次响应丢失后重试不会反向加入', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      favorites: [{
        id: 91,
        productId: 27,
        name: '响应丢失恢复作品',
        favoritedAt: '2026-09-22T00:00:00.000Z',
      }],
      loseFirstFavoriteDeleteResponse: true,
    });
    await page.goto('/customer');
    const wishlist = page.locator('#my-favorites');
    await wishlist.scrollIntoViewIfNeeded();
    await expect(wishlist.getByText('响应丢失恢复作品')).toBeVisible();

    await wishlist.getByRole('button', { name: '移出' }).click();
    await expect(page.getByText('移出失败，请稍后重试')).toBeVisible();
    await expect(wishlist.getByText('响应丢失恢复作品')).toBeVisible();

    await wishlist.getByRole('button', { name: '移出' }).click();
    await expect(wishlist.getByText('心愿单还是空的。')).toBeVisible();
    const favoriteWrites = requests.filter((request) =>
      request.path === '/api/customers/me/favorites/27'
    );
    expect(favoriteWrites.map((request) => request.method)).toEqual(['DELETE', 'DELETE']);
    expect(requests.some((request) => request.path.endsWith('/toggle'))).toBe(false);
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

  test('头像删除确定未生效时保留当前头像并允许从原动作重试', async ({ page }) => {
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
    await expect(page.getByText('头像删除未生效，当前头像仍保留，请重试。')).toBeVisible();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('img', { name: '海川会员的头像' })).toBeVisible();
    await page.getByRole('button', { name: '删除头像' }).click();
    const retryConfirm = page.getByRole('dialog', { name: '删除当前头像？' });
    await expect(retryConfirm).toBeVisible();
    await retryConfirm.getByRole('button', { name: '保留头像' }).click();
  });

  test('头像删除已提交但响应丢失时只读核验并收敛为无头像', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      avatarUrl: '/api/customers/me/avatar',
      loseFirstAvatarDeleteResponse: true,
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '删除头像' }).click();
    const confirm = page.getByRole('dialog', { name: '删除当前头像？' });
    await confirm.getByRole('button', { name: '删除头像' }).click();

    await expect(page.getByText('头像已删除并完成权威核验')).toBeVisible();
    await expect(page.getByRole('img', { name: '海川会员的头像' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '删除头像' })).toHaveCount(0);
    expect(requests.filter((item) =>
      item.path === '/api/customers/me/avatar' && item.method === 'DELETE'
    )).toHaveLength(1);
    expect(requests.filter((item) =>
      item.path === '/api/customers/me' && item.method === 'GET'
    ).length).toBeGreaterThanOrEqual(2);
  });

  test('头像删除响应和权威读取均不可用时提示待确认且不重复 DELETE', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      avatarUrl: '/api/customers/me/avatar',
      loseFirstAvatarDeleteResponse: true,
      failProfileReadAfterAvatarDelete: true,
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '删除头像' }).click();
    const confirm = page.getByRole('dialog', { name: '删除当前头像？' });
    await confirm.getByRole('button', { name: '删除头像' }).click();

    await expect(page.getByText(/头像删除结果待确认/)).toBeVisible();
    await expect(page.getByRole('img', { name: '海川会员的头像' })).toBeVisible();
    expect(requests.filter((item) =>
      item.path === '/api/customers/me/avatar' && item.method === 'DELETE'
    )).toHaveLength(1);
    expect(requests.filter((item) =>
      item.path === '/api/customers/me' && item.method === 'GET'
    ).length).toBeGreaterThanOrEqual(2);
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

  test('换绑确认已提交但响应丢失时不重复确认并要求重新登录核对', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      contactConfirmResponseLoss: 'COMMITTED',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '更换邮箱' }).click();
    const dialog = page.getByRole('dialog', { name: '更换邮箱' });
    await dialog.getByLabel('新邮箱').fill('new@example.com');
    await dialog.locator('input[type="password"]').fill('Oldpass1');
    await dialog.getByRole('button', { name: '验证并发送新验证码' }).click();
    await dialog.getByLabel('新邮箱验证码').fill('123456');
    await dialog.getByRole('button', { name: '完成换绑' }).click();

    await expect(page.getByText(/换绑结果待确认；当前登录状态已失效/)).toBeVisible();
    await expect.poll(() => requests.some((item) =>
      item.path === '/api/customers/session/logout' && item.method === 'POST',
    )).toBe(true);
    expect(requests.filter((item) =>
      item.path.includes('/contact-changes/') && item.method === 'PUT'
    )).toHaveLength(1);
    await expect(page.getByText('绑定信息已更新，请重新登录')).toHaveCount(0);
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

  test('无密码客户可用当前手机号验证码注销账户', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), { hasPassword: false });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: '注销账户' }).click();
    const dialog = page.getByRole('dialog', { name: '注销账户' });
    await expect(dialog.getByText('当前账户尚未设置密码，请使用绑定手机号验证码确认注销。'))
      .toBeVisible();
    await expect(dialog.getByText(/处于法律保留状态的咨询事实将继续留存/)).toBeVisible();
    await expect(dialog.getByLabel('登录密码')).toHaveCount(0);

    await dialog.getByRole('button', { name: '发送注销验证码' }).click();
    await expect.poll(() => requests.some((item) =>
      item.path === '/api/customers/me/close/sms-code' && item.method === 'POST',
    )).toBe(true);
    expect(requests.some((item) => item.path === '/api/customers/me/security/sms-code'))
      .toBe(false);
    await dialog.getByLabel('当前手机号验证码').fill('123456');
    await dialog.getByRole('button', { name: '确认注销' }).click();

    await expect.poll(() => requests.some((item) =>
      item.path === '/api/customers/me/close' && item.method === 'POST',
    )).toBe(true);
    expect(requests.find((item) => item.path === '/api/customers/me/close')?.body)
      .toEqual({ currentSmsCode: '123456' });
    await expect.poll(() => requests.some((item) =>
      item.path === '/api/customers/session/logout' && item.method === 'POST',
    )).toBe(true);
  });

  test('账户注销已提交但响应丢失时不重复注销并要求重新登录核对', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      accountCloseResponseLoss: 'COMMITTED',
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '注销账户' }).click();
    const dialog = page.getByRole('dialog', { name: '注销账户' });
    await dialog.getByLabel('登录密码').fill('Oldpass1');
    await dialog.getByRole('button', { name: '确认注销' }).click();

    await expect(page.getByText(/注销结果待确认；当前登录状态已失效/)).toBeVisible();
    await expect.poll(() => requests.some((item) =>
      item.path === '/api/customers/session/logout' && item.method === 'POST',
    )).toBe(true);
    expect(requests.filter((item) =>
      item.path === '/api/customers/me/close' && item.method === 'POST'
    )).toHaveLength(1);
    await expect(page.getByText('账户已注销，关联咨询个人信息已匿名化')).toHaveCount(0);
  });

  test('导出我的数据下载后端返回的完整 JSON', async ({ page }) => {
    const exportData = {
      exportedAt: '2026-09-20T08:00:00.000Z',
      profile: { name: '海川会员' },
      orders: [{
        orderNo: 'ORD-EXPORT-1',
        customerName: '历史收件人',
        customerPhone: '13900139000',
        customerEmail: 'historic-order@example.com',
        address: '上海市黄浦区历史订单路 18 号',
        afterSalesCases: [{ caseNo: 'AS-1', status: 'REQUESTED' }],
      }],
      notificationPreferences: [{
        channel: 'EMAIL',
        topic: 'SERVICE_ORDER_SHIPPED',
        enabled: false,
      }],
      partnerAgreementAcceptances: [{
        status: 'PENDING',
        agreementAcceptedAt: '2026-09-19T08:00:00.000Z',
        agreementVersion: 'partner-agreement-v1',
        agreementHash: 'a'.repeat(64),
        submittedAt: '2026-09-19T08:00:01.000Z',
        createdAt: '2026-09-19T08:00:02.000Z',
      }],
    };
    await installProfileRoutes(page, () => undefined, { exportData });
    await page.goto('/customer');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出我的数据' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^haichuan-my-data-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    let content = '';
    for await (const chunk of stream) content += chunk.toString();
    expect(JSON.parse(content)).toEqual(exportData);
  });

  test('地址新增和编辑使用 detail 合同并保留可见的默认状态', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      addresses: [{
        id: 11,
        recipientName: '海川会员',
        recipientPhone: '13800138000',
        province: '广东省',
        city: '深圳市',
        district: '罗湖区',
        detail: '深南东路 1 号',
        postalCode: '518000',
        isDefault: true,
      }],
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();
    await expect(page.getByText('默认', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '编辑' }).click();
    const editDialog = page.getByRole('dialog', { name: '编辑地址' });
    await expect(editDialog.getByLabel('详细地址')).toHaveValue('深南东路 1 号');
    await expect(editDialog.getByLabel('邮政编码')).toHaveValue('518000');
    await expect(editDialog.getByRole('checkbox', { name: '设为默认收货地址' })).toBeChecked();
    await editDialog.getByLabel('详细地址').fill('深南东路 9 号');
    await editDialog.getByRole('checkbox', { name: '设为默认收货地址' }).uncheck();
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary').click();
    await expect(editDialog).toBeHidden();

    const updateBody = requests.find((item) =>
      item.path === '/api/customers/me/addresses/11' && item.method === 'PUT',
    )?.body as Record<string, unknown>;
    assertAddressBody(updateBody, '深南东路 9 号', false);
    expect(updateBody.postalCode).toBe('518000');

    await page.getByRole('button', { name: '新增地址' }).click();
    const createDialog = page.getByRole('dialog', { name: '新增地址' });
    await createDialog.getByLabel('收件人').fill('新收件人');
    await createDialog.getByLabel('联系电话').fill('13900139000');
    await createDialog.getByLabel('详细地址').fill('罗湖区新址 2 号');
    await createDialog.getByRole('checkbox', { name: '设为默认收货地址' }).check();
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary').click();
    await expect(createDialog).toBeHidden();

    const createBody = requests.find((item) =>
      item.path === '/api/customers/me/addresses' && item.method === 'POST',
    )?.body as Record<string, unknown>;
    assertAddressBody(createBody, '罗湖区新址 2 号', true);
  });

  test('新增地址已落库但响应丢失时原键重试只创建一条地址', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    let logicalWrites = 0;
    await installProfileRoutes(page, (request) => requests.push(request), {
      loseFirstAddressCreateResponse: true,
      onAddressLogicalWrite: () => { logicalWrites += 1; },
    });
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: '新增地址' }).click();
    const dialog = page.getByRole('dialog', { name: '新增地址' });
    await dialog.getByLabel('收件人').fill('响应丢失客户');
    await dialog.getByLabel('联系电话').fill('13900139000');
    await dialog.getByLabel('省').fill('广东省');
    await dialog.getByLabel('市').fill('深圳市');
    await dialog.getByLabel('区/县').fill('罗湖区');
    await dialog.getByLabel('详细地址').fill('深南东路 8 号');
    await dialog.getByLabel('邮政编码').fill('518000');

    const saveButton = page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary');
    await saveButton.click();
    await expect(page.getByText(/地址保存结果待确认/)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('详细地址')).toHaveValue('深南东路 8 号');

    await saveButton.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('深南东路 8 号', { exact: true })).toHaveCount(1);

    const createRequests = requests.filter((request) =>
      request.path === '/api/customers/me/addresses' && request.method === 'POST'
    );
    expect(createRequests).toHaveLength(2);
    expect(createRequests[0]?.idempotencyKey).toMatch(/^address-create-/);
    expect(createRequests[1]?.idempotencyKey).toBe(createRequests[0]?.idempotencyKey);
    expect(logicalWrites).toBe(1);
    expect(await page.evaluate(() => Array.from({ length: sessionStorage.length }, (_, index) =>
      sessionStorage.key(index),
    ).filter((key) => key?.startsWith('hc:customer-address-create-attempt:')).length)).toBe(0);
  });

  test('编辑地址已提交但响应丢失时只读核验成功且不重复 PUT', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    let logicalWrites = 0;
    await installProfileRoutes(page, (request) => requests.push(request), {
      addresses: [{
        id: 11,
        recipientName: '海川会员',
        recipientPhone: '13800138000',
        province: '广东省',
        city: '深圳市',
        district: '罗湖区',
        detail: '深南东路 1 号',
        postalCode: '518000',
        isDefault: false,
      }],
      loseFirstAddressUpdateResponse: true,
      onAddressUpdateLogicalWrite: () => { logicalWrites += 1; },
    });
    await page.goto('/customer');
    const profile = page.locator('#my-profile');
    await profile.scrollIntoViewIfNeeded();

    await profile.getByRole('button', { name: '编辑' }).click();
    const dialog = page.getByRole('dialog', { name: '编辑地址' });
    await dialog.getByLabel('详细地址').fill('深南东路 19 号');
    await dialog.getByRole('checkbox', { name: '设为默认收货地址' }).check();
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary').click();

    await expect(page.getByText('地址已更新并完成权威核验')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(profile.getByText(/深南东路 19 号/)).toBeVisible();
    await expect(profile.getByText('默认', { exact: true })).toBeVisible();
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/addresses/11' && request.method === 'PUT'
    )).toHaveLength(1);
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/addresses' && request.method === 'GET'
    ).length).toBeGreaterThanOrEqual(2);
    expect(logicalWrites).toBe(1);
  });

  test('编辑地址响应和权威读取均不可用时保留表单且不自动重复 PUT', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request), {
      addresses: [{
        id: 11,
        recipientName: '海川会员',
        recipientPhone: '13800138000',
        province: '广东省',
        city: '深圳市',
        district: '罗湖区',
        detail: '深南东路 1 号',
        postalCode: '518000',
        isDefault: false,
      }],
      loseFirstAddressUpdateResponse: true,
      failAddressReadsAfterUpdate: true,
    });
    await page.goto('/customer');
    const profile = page.locator('#my-profile');
    await profile.scrollIntoViewIfNeeded();

    await profile.getByRole('button', { name: '编辑' }).click();
    const dialog = page.getByRole('dialog', { name: '编辑地址' });
    await dialog.getByLabel('详细地址').fill('深南东路 29 号');
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary').click();

    await expect(page.getByText(/地址更新结果待确认/)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('详细地址')).toHaveValue('深南东路 29 号');
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/addresses/11' && request.method === 'PUT'
    )).toHaveLength(1);
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/addresses' && request.method === 'GET'
    ).length).toBeGreaterThanOrEqual(2);
  });

  test('手机端会话存储不可用时新增地址失败关闭且零 POST', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (key.startsWith('hc:customer-address-create-attempt:')) {
          throw new DOMException('storage unavailable', 'QuotaExceededError');
        }
        return originalSetItem.call(this, key, value);
      };
    });
    const requests: ObservedRequest[] = [];
    await installProfileRoutes(page, (request) => requests.push(request));
    await page.goto('/customer');
    await page.locator('#my-profile').scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: '新增地址' }).click();
    const dialog = page.getByRole('dialog', { name: '新增地址' });
    await dialog.getByLabel('收件人').fill('存储失败客户');
    await dialog.getByLabel('联系电话').fill('13900139000');
    await dialog.getByLabel('详细地址').fill('未发送地址 1 号');
    await page.locator('.ant-modal-content:visible .ant-modal-footer .ant-btn-primary').click();

    await expect(page.getByText(/无法安全保存新增地址的重试凭据/)).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/addresses' && request.method === 'POST'
    )).toHaveLength(0);
  });

  test('删除地址已提交但响应丢失时重复删除收敛到已删除状态', async ({ page }) => {
    const requests: ObservedRequest[] = [];
    let logicalDeletes = 0;
    await installProfileRoutes(page, (request) => requests.push(request), {
      addresses: [{
        id: 12,
        recipientName: '待删除客户',
        recipientPhone: '13900139000',
        province: '广东省',
        city: '深圳市',
        district: '罗湖区',
        detail: '深南东路 12 号',
        postalCode: '518000',
        isDefault: true,
      }],
      loseFirstAddressDeleteResponse: true,
      onAddressDeleteLogicalWrite: () => { logicalDeletes += 1; },
    });
    await page.goto('/customer');
    const profile = page.locator('#my-profile');
    await profile.scrollIntoViewIfNeeded();
    await expect(profile.getByText(/深南东路 12 号/)).toBeVisible();

    await profile.getByRole('button', { name: '删除' }).click();
    await expect(page.getByText(/地址删除结果待确认/)).toBeVisible();
    await expect(profile.getByText(/深南东路 12 号/)).toBeVisible();

    await profile.getByRole('button', { name: '删除' }).click();
    await expect(profile.getByText('暂未保存收货地址')).toBeVisible();
    expect(requests.filter((request) =>
      request.path === '/api/customers/me/addresses/12' && request.method === 'DELETE'
    )).toHaveLength(2);
    expect(logicalDeletes).toBe(1);
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
    const keyActions = [
      '修改称呼',
      '更换头像',
      '删除头像',
      '更换手机号',
      '更换邮箱',
      '修改密码',
      '导出我的数据',
      '注销账户',
      '新增地址',
      '退出登录',
    ];
    for (const name of keyActions) {
      const action = page.getByRole('button', { name, exact: true });
      await expect(action).toBeVisible();
      await expect.poll(async () => (await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '新增地址' }).click();
    const addressDialog = page.getByRole('dialog', { name: '新增地址' });
    const defaultAddressCheckbox = addressDialog.getByRole('checkbox', { name: '设为默认收货地址' });
    await expect(defaultAddressCheckbox).toBeVisible();
    const addressTouchTargets = [
      addressDialog.getByLabel('收件人'),
      addressDialog.getByLabel('联系电话'),
      addressDialog.getByLabel('省'),
      addressDialog.getByLabel('市'),
      addressDialog.getByLabel('区/县'),
      addressDialog.getByLabel('邮政编码'),
      addressDialog.getByLabel('详细地址'),
      defaultAddressCheckbox.locator('xpath=ancestor::label'),
    ];
    for (const target of addressTouchTargets) {
      await expect.poll(async () => (await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    for (const name of [/取\s*消/, /保\s*存/]) {
      const action = addressDialog.getByRole('button', { name });
      await expect.poll(async () => (await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect.poll(async () => {
      const box = await addressDialog.boundingBox();
      return Boolean(box && box.x >= 0 && box.x + box.width <= 390);
    }).toBe(true);
    await addressDialog.getByRole('button', { name: /取\s*消/ }).click();

    await page.getByRole('button', { name: '注销账户' }).click();
    const closeDialog = page.getByRole('dialog', { name: '注销账户' });
    const closePassword = closeDialog.getByLabel('登录密码');
    const closePasswordTarget = closePassword.locator('xpath=ancestor::*[contains(@class,"ant-input-affix-wrapper")]');
    await expect.poll(async () => (await closePasswordTarget.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    for (const name of [/再\s*想\s*想/, /确\s*认\s*注\s*销/]) {
      const action = closeDialog.getByRole('button', { name });
      await expect.poll(async () => (await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

function assertAddressBody(
  body: Record<string, unknown>,
  detail: string,
  isDefault: boolean,
) {
  expect(body.detail).toBe(detail);
  expect(body.isDefault).toBe(isDefault);
  expect('detailAddress' in body).toBe(false);
}
