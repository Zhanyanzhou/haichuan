import { expect, test, type Page, type Route } from '@playwright/test';
import { installAdminSession, type TestAdminRole } from './fixtures/session-auth';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const wrapped = (data: unknown) => JSON.stringify({ code: 200, data, message: 'ok' });

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: status >= 400
      ? JSON.stringify({ code: status, data: null, message: 'synthetic failure' })
      : wrapped(data),
  });
}

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    url: '/uploads/page-assets/fixture.png',
    name: '合成页面素材.png',
    type: 'image',
    mimeType: 'image/png',
    size: PNG.length,
    width: 1,
    height: 1,
    createdAt: '2026-09-12T00:00:00.000Z',
    status: 'READY',
    available: true,
    publicUrl: null,
    lifecycleRevision: 1,
    authorization: {
      reviewStatus: 'DRAFT',
      revocationStatus: 'ACTIVE',
      revision: 1,
      publicUseEpoch: 0,
      sourceType: 'LEGACY_UNVERIFIED',
      publicWebUseAllowed: false,
    },
    publicEligibility: {
      eligible: false,
      reasons: ['AUTHORIZATION_NOT_APPROVED'],
    },
    ...overrides,
  };
}

async function installBaseRoutes(
  page: Page,
  handler: (route: Route) => Promise<void>,
  role: TestAdminRole = 'ADMIN',
) {
  await installAdminSession(page, { role, username: 'media-library-admin' });
  await page.route('**/uploads/page-assets/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/auth/profile') return route.fallback();
    await handler(route);
  });
}

test.describe('页面素材库确定性浏览器状态', () => {
  test('未批准图片在后台素材库通过鉴权预览地址显示', async ({ page }) => {
    const previewStorageKeys: string[] = [];
    const publicAssetRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/uploads/page-assets/')) publicAssetRequests.push(url.pathname);
    });
    await installBaseRoutes(page, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/upload/media' && request.method() === 'GET') {
        await fulfillJson(route, { list: [asset()], total: 1, page: 1, pageSize: 100 });
        return;
      }
      if (url.pathname === '/api/upload/media/preview-by-storage-key' && request.method() === 'GET') {
        previewStorageKeys.push(url.searchParams.get('storageKey') || '');
        await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto('/admin/media');
    const previewButton = page.getByRole('button', { name: '预览 合成页面素材.png' });
    await expect(previewButton).toBeVisible();
    await expect.poll(() => previewStorageKeys).toContain('page-assets/fixture.png');
    expect(publicAssetRequests).toEqual([]);

    await previewButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('合成页面素材.png');
    await expect(dialog.locator('img')).toHaveAttribute(
      'src',
      '/api/upload/media/preview-by-storage-key?storageKey=page-assets%2Ffixture.png',
    );
    expect(publicAssetRequests).toEqual([]);
  });

  test('加载失败不会伪装成空库，键盘重试后同步服务端素材供装修选择', async ({ page }) => {
    let fail = true;
    let releaseFailure: () => void = () => undefined;
    const failureGate = new Promise<void>((resolve) => { releaseFailure = resolve; });
    await installBaseRoutes(page, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/upload/media' && route.request().method() === 'GET') {
        if (fail) await failureGate;
        await fulfillJson(route, fail ? null : { list: [asset()], total: 1, page: 1, pageSize: 100 }, fail ? 503 : 200);
        return;
      }
      await fulfillJson(route, {});
    });
    await page.addInitScript(() => {
      localStorage.setItem('haichuan.page-media', JSON.stringify([{
        url: '/uploads/page-assets/stale.png',
        type: 'image',
        name: '过期本地投影.png',
        createdAt: '2026-09-01T00:00:00.000Z',
      }]));
    });

    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { name: '页面素材库' })).toBeVisible();
    await expect(page.getByText('正在加载页面素材…')).toBeVisible();
    releaseFailure();
    await expect(page.getByText('页面素材加载失败，请稍后重新加载。')).toBeVisible();
    await expect(page.getByText('暂无页面素材；上传后可在装修中选择并引用')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('haichuan.page-media') || '[]'))).toEqual([]);

    fail = false;
    const retry = page.getByRole('button', { name: '重新加载' });
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('合成页面素材.png')).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('haichuan.page-media') || '[]')))
      .toEqual([{
        url: '/uploads/page-assets/fixture.png',
        type: 'image',
        name: '合成页面素材.png',
        createdAt: '2026-09-12T00:00:00.000Z',
      }]);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('上传、重复提示、归档失败恢复、公开失效反馈和恢复入口保持可操作', async ({ page }) => {
    let rows: Array<ReturnType<typeof asset>> = [];
    let archiveFails = true;
    let uploadCount = 0;
    await installBaseRoutes(page, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (path === '/api/upload/media' && request.method() === 'GET') {
        const requestedStatus = url.searchParams.get('status');
        const selectedRows = requestedStatus
          ? rows.filter((row) => row.status === requestedStatus)
          : rows;
        await fulfillJson(route, { list: selectedRows, total: selectedRows.length, page: 1, pageSize: 100 });
        return;
      }
      if (path === '/api/upload/image' && request.method() === 'POST') {
        uploadCount += 1;
        const item = asset({ name: '浏览器上传合成图.png' });
        rows = [item];
        await fulfillJson(route, { ...item, filename: 'fixture.png', deduplicated: uploadCount > 1 }, 201);
        return;
      }
      if (path === '/api/upload/media/41' && request.method() === 'DELETE') {
        if (archiveFails) {
          await fulfillJson(route, null, 503);
          return;
        }
        rows = [asset({ name: '浏览器上传合成图.png', status: 'ARCHIVED', available: false })];
        await fulfillJson(route, rows[0]);
        return;
      }
      if (path === '/api/upload/media/41/restore' && request.method() === 'POST') {
        rows = [asset({ name: '浏览器上传合成图.png' })];
        await fulfillJson(route, rows[0], 201);
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto('/admin/media');
    await expect(page.getByText('暂无页面素材；上传后可在装修中选择并引用')).toBeVisible();
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: '浏览器上传合成图.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.getByText('素材已上传；请在公开使用前完成授权审核')).toBeVisible();
    await expect(page.getByText('浏览器上传合成图.png')).toBeVisible();
    await expect(page.getByRole('button', { name: '复制公开链接' })).toBeDisabled();

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: '相同内容.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.getByText('已使用素材库中的相同文件')).toBeVisible();

    await page.locator('button').filter({ hasText: /^归档$/ }).click();
    await page.getByRole('button', { name: '归档素材' }).click();
    await expect(page.getByText('素材归档失败，请重新加载后重试。')).toBeVisible();
    await expect(page.getByText('浏览器上传合成图.png')).toBeVisible();

    archiveFails = false;
    await page.locator('button').filter({ hasText: /^归档$/ }).click();
    await page.getByRole('button', { name: '归档素材' }).click();
    await expect(page.getByText('素材已归档，公开地址已停止访问')).toBeVisible();
    await expect(page.getByText('暂无页面素材；上传后可在装修中选择并引用')).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('haichuan.page-media') || '[]'))).toEqual([]);

    await page.locator('.ant-select').filter({ has: page.locator('input[aria-label="素材状态"]') }).click();
    await page.getByText('已归档', { exact: true }).last().click();
    await expect(page.getByText('已归档，公开地址不可访问')).toBeVisible();
    await page.getByRole('button', { name: '恢复素材' }).click();
    await expect(page.getByText('素材文件已恢复；公开使用仍需有效授权并重新发布页面')).toBeVisible();
  });

  test('服务端分页不会截断装修投影，预览入口支持键盘操作', async ({ page }) => {
    const rows = Array.from({ length: 125 }, (_, index) => asset({
      id: index + 1,
      url: `/uploads/page-assets/fixture-${index + 1}.png`,
      name: `分页素材-${String(index + 1).padStart(3, '0')}.png`,
    }));
    await installBaseRoutes(page, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/upload/media' && request.method() === 'GET') {
        const pageNumber = Number(url.searchParams.get('page') || 1);
        const pageSize = Number(url.searchParams.get('pageSize') || 50);
        const start = (pageNumber - 1) * pageSize;
        await fulfillJson(route, {
          list: rows.slice(start, start + pageSize),
          total: rows.length,
          page: pageNumber,
          pageSize,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto('/admin/media');
    await expect(page.getByText('当前筛选共 125 个素材')).toBeVisible();
    await expect(page.getByText('分页素材-001.png')).toBeVisible();
    await expect(page.getByText('分页素材-025.png')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('haichuan.page-media') || '[]').length)).toBe(125);

    const previewButton = page.getByRole('button', { name: '预览 分页素材-001.png' });
    await previewButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toContainText('分页素材-001.png');
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('listitem', { name: '2', exact: true }).click();
    await expect(page.getByText('分页素材-025.png')).toBeVisible();
    await expect(page.getByRole('button', { name: '预览 分页素材-001.png' })).toHaveCount(0);
  });

  test('编辑角色只能上传、查看和登记授权，最后一页归档后管理员回到有效页', async ({ page }) => {
    let rows = Array.from({ length: 49 }, (_, index) => asset({
      id: index + 1,
      url: `/uploads/page-assets/role-${index + 1}.png`,
      name: `角色素材-${String(index + 1).padStart(2, '0')}.png`,
    }));
    const routeHandler = async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/upload/media' && request.method() === 'GET') {
        const readyRows = rows.filter((row) => row.status === 'READY');
        const pageNumber = Number(url.searchParams.get('page') || 1);
        const pageSize = Number(url.searchParams.get('pageSize') || 50);
        const start = (pageNumber - 1) * pageSize;
        await fulfillJson(route, {
          list: readyRows.slice(start, start + pageSize),
          total: readyRows.length,
          page: pageNumber,
          pageSize,
        });
        return;
      }
      if (url.pathname === '/api/upload/media/49' && request.method() === 'DELETE') {
        const archived = asset({ ...rows.find((row) => row.id === 49), status: 'ARCHIVED', available: false });
        // 同期模拟另一会话批量归档：动作前总数推导到第 2 页，但服务端实际只剩第 1 页。
        rows = [...rows.slice(0, 10), archived];
        await fulfillJson(route, archived);
        return;
      }
      await fulfillJson(route, {});
    };

    await installBaseRoutes(page, routeHandler, 'EDITOR');
    await page.goto('/admin/media');
    await expect(page.getByText('角色素材-01.png')).toBeVisible();
    await expect(page.getByRole('button', { name: '复制公开链接' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: /^归档$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '恢复素材' })).toHaveCount(0);

    await installAdminSession(page, { role: 'ADMIN', username: 'media-library-admin' });
    await page.reload();
    await page.getByRole('listitem', { name: '3', exact: true }).click();
    await expect(page.getByText('角色素材-49.png')).toBeVisible();
    await page.locator('button').filter({ hasText: /^归档$/ }).click();
    await page.getByRole('button', { name: '归档素材' }).click();
    await expect(page.getByText('素材已归档，公开地址已停止访问')).toBeVisible();
    await expect(page.getByText('角色素材-01.png')).toBeVisible();
    await expect(page.getByText('当前筛选共 10 个素材')).toBeVisible();
  });

  test('授权在素材库集中登记、提交与审核，页面列表只显示非敏感摘要', async ({ page }) => {
    let revision = 1;
    let reviewStatus: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' = 'DRAFT';
    let publicWebUseAllowed = false;
    const authorizationResource = () => ({
      asset: asset({
        publicUrl: reviewStatus === 'APPROVED' ? '/api/upload/public-media/41' : null,
      }),
      authorization: {
        mediaAssetId: 41,
        revision,
        publicUseEpoch: Math.max(0, revision - 1),
        sourceType: reviewStatus === 'DRAFT' ? 'LEGACY_UNVERIFIED' : 'BRAND_OWNED',
        authorizationBasis: reviewStatus === 'DRAFT' ? null : '品牌内部拍摄任务',
        evidenceReference: reviewStatus === 'DRAFT' ? null : 'HC-SHOOT-2026-09',
        publicWebUseAllowed,
        reviewStatus,
        revocationStatus: 'ACTIVE',
        createdAt: '2026-09-12T00:00:00.000Z',
        updatedAt: '2026-09-12T00:00:00.000Z',
      },
      publicEligibility: {
        eligible: reviewStatus === 'APPROVED',
        reasons: reviewStatus === 'APPROVED' ? [] : ['AUTHORIZATION_NOT_APPROVED'],
      },
      proof: {
        authorizationBasis: reviewStatus === 'DRAFT' ? null : '品牌内部拍摄任务',
        evidenceReference: reviewStatus === 'DRAFT' ? null : 'HC-SHOOT-2026-09',
        events: [],
      },
    });
    await installBaseRoutes(page, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/upload/media' && request.method() === 'GET') {
        await fulfillJson(route, { list: [asset()], total: 1, page: 1, pageSize: 100 });
        return;
      }
      if (path === '/api/upload/media/authorization/impact-preview' && request.method() === 'POST') {
        await fulfillJson(route, {
          complete: false,
          reason: 'PAGE_MANIFEST_NOT_AVAILABLE',
          items: [{
            assetId: 41,
            eligibleForPublic: false,
            blockingReasons: ['AUTHORIZATION_NOT_APPROVED'],
            affectedPublishedPages: [],
            affectedDraftPages: [],
          }],
          summary: { total: 1, eligible: 0, blocked: 1, publishedAffected: 0, draftAffected: 0 },
        });
        return;
      }
      if (path === '/api/upload/media/41/authorization' && request.method() === 'GET') {
        await fulfillJson(route, authorizationResource());
        return;
      }
      if (path === '/api/upload/media/41/authorization/draft' && request.method() === 'PUT') {
        expect(request.postDataJSON()).toMatchObject({
          expectedRevision: 1,
          sourceType: 'BRAND_OWNED',
          authorizationBasis: '品牌内部拍摄任务',
          evidenceReference: 'HC-SHOOT-2026-09',
          publicWebUseAllowed: true,
        });
        revision = 2;
        publicWebUseAllowed = true;
        await fulfillJson(route, authorizationResource());
        return;
      }
      if (path === '/api/upload/media/41/authorization/submit' && request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ expectedRevision: 2 });
        revision = 3;
        reviewStatus = 'IN_REVIEW';
        await fulfillJson(route, authorizationResource());
        return;
      }
      if (path === '/api/upload/media/41/authorization/approve' && request.method() === 'POST') {
        expect(request.postDataJSON()).toMatchObject({ expectedRevision: 3 });
        revision = 4;
        reviewStatus = 'APPROVED';
        await fulfillJson(route, authorizationResource());
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto('/admin/media');
    await page.getByRole('button', { name: '登记授权' }).click();
    const dialog = page.getByRole('dialog', { name: /素材授权/ });
    await expect(dialog).toContainText('当前素材不能公开使用');
    await dialog.getByRole('combobox', { name: '素材来源' }).press('ArrowDown');
    await page.getByText('品牌自有', { exact: true }).click();
    await dialog.getByLabel('授权依据').fill('品牌内部拍摄任务');
    await dialog.getByLabel('证明存档引用').fill('HC-SHOOT-2026-09');
    await dialog.getByRole('checkbox', { name: '授权范围允许品牌网站公开使用' }).check();
    await dialog.getByRole('button', { name: '保存授权草稿' }).click();
    await expect(page.getByText('素材授权草稿已保存')).toBeVisible();
    await dialog.getByRole('button', { name: '提交审核' }).click();
    await expect(page.getByText('素材授权已提交审核')).toBeVisible();
    await dialog.getByRole('textbox', { name: '审核备注（不通过时必填）' }).fill('证明已核验');
    await dialog.getByRole('button', { name: '通过审核' }).click();
    await expect(dialog).toContainText('当前素材已具备公开资格');
    await expect(page.getByText('已批准公开')).toBeVisible();
    await expect(page.getByRole('button', { name: '复制公开链接' })).toBeEnabled();
    await expect(dialog.getByLabel('证明存档引用')).toHaveValue('HC-SHOOT-2026-09');
  });
});
