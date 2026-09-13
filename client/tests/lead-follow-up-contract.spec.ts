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
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'temporary failure' }),
        });
        return;
      }
      savedFollowUp = writes.at(-1)?.body ?? null;
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

  await expect(page.getByText(/跟进记录添加失败/)).toBeVisible();
  await expect(drawer.getByLabel('内部备注或跟进内容'))
    .toHaveValue('已电话确认到店时间');
  await expect(channelSelect).toContainText('电子邮件');
  await expect(drawer.getByLabel('下次跟进时间')).toHaveValue(localNextFollowUpAt);
  await drawer.getByRole('button', { name: '添加跟进' }).click();

  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0].headers.authorization).toBeUndefined();
  expect(writes[0].headers['x-csrf-token']).toBe('lead-csrf-token');
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
  await expect(drawer.getByText(/客户回复提交失败/)).toBeVisible();
  await drawer.getByRole('button', { name: '重新提交' }).click();

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
