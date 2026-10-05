import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { installCustomerSession } from './fixtures/session-auth';

function reviewSubmissionFingerprint(input: Record<string, unknown>) {
  const canonical = JSON.stringify([
    input.orderId,
    input.productId,
    input.rating,
    String(input.content ?? '').trim(),
    Array.isArray(input.imageUrls)
      ? input.imageUrls.filter((value) => typeof value === 'string' && value.length > 0)
      : [],
  ]);
  return `review-submission:v1:${createHash('sha256').update(canonical).digest('hex')}`;
}

test.describe('客户咨询完整分页', () => {
  test('显示服务端总数并可读取第二页，移动端不产生横向溢出', async ({ page }) => {
    const inquiryRequests: Array<{ page: string | null; pageSize: string | null }> = [];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data, message: 'ok' }),
      });

      if (path === '/api/customers/me') {
        return respond({ id: 7, phone: '13800000007', name: '分页测试会员', email: null });
      }
      if (path === '/api/customers/me/inquiries') {
        const requestedPage = url.searchParams.get('page');
        inquiryRequests.push({
          page: requestedPage,
          pageSize: url.searchParams.get('pageSize'),
        });
        const pageNumber = Number(requestedPage || 1);
        const list = pageNumber === 2
          ? [{
              id: 4,
              status: 'COMPLETED',
              createdAt: '2026-08-20T00:00:00.000Z',
              product: { name: '第二页祖母绿预约' },
            }]
          : [1, 2, 3].map((id) => ({
              id,
              status: 'PENDING',
              createdAt: `2026-08-2${id}T00:00:00.000Z`,
              product: { name: `第一页预约 ${id}` },
            }));
        return respond({ list, total: 4, page: pageNumber, pageSize: 3 });
      }
      if (
        path === '/api/customers/me/orders' ||
        path === '/api/customers/me/addresses' ||
        path === '/api/customers/me/cooperation-design-files' ||
        path === '/api/customers/me/selection-inquiries' ||
        path === '/api/customers/me/favorites'
      ) {
        return respond([]);
      }
      if (path === '/api/customers/me/notifications') {
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === '/api/partners/me') return respond(null);
      if (path === '/api/recommendations/for-you') return respond([]);
      if (path.endsWith('/settings/flags')) {
        return respond({ commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
      }
      if (path.endsWith('/settings/public')) return respond({ siteName: '海川珠宝' });
      return respond({ list: [], total: 0 });
    });

    await page.goto('/customer');
    const summary = page.getByLabel('服务概览');
    await expect(summary.getByText('04', { exact: true })).toBeVisible();
    await expect(page.getByText('第一页预约 1')).toBeVisible();
    await page.getByLabel('预约咨询分页').locator('.ant-pagination-item-2').click();
    await expect(page.getByText('第二页祖母绿预约')).toBeVisible();
    await expect(page.getByText('第一页预约 1')).toHaveCount(0);
    expect(inquiryRequests).toEqual([
      { page: '1', pageSize: '3' },
      { page: '2', pageSize: '3' },
    ]);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});

async function authenticateAdmin(page: Page) {
  await page.route('**/api/auth/profile', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          id: 1,
          username: 'trade-safety-admin',
          realName: '交易安全测试管理员',
          role: 'ADMIN',
          status: 'ACTIVE',
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      }),
    }),
  );
}

async function mockEmptyAdminApis(page: Page) {
  await page.route('**/api/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/auth/profile')) {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: { list: [], total: 0 }, message: 'ok' }),
    });
  });
}

test.describe('交易后台不把人工操作伪装成在线资金结果', () => {
  test('支付记录将线下能力降级为异常补录，且只提供银行转账和门店收款', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    await page.goto('/admin/trade/payments');

    await expect(page.getByRole('heading', { name: '支付记录' })).toBeVisible();
    await expect(page.getByText('客户在线支付为标准主链；线下收款仅在异常补录中处理')).toBeVisible();
    await expect(page.getByRole('button', { name: '待确认' })).toBeVisible();
    await expect(page.getByRole('button', { name: '已收款' })).toBeVisible();
    await expect(page.getByRole('button', { name: '待处理' })).toHaveCount(0);
    await page.getByRole('button', { name: '异常补录' }).click();
    await expect(page.getByRole('dialog', { name: '线下收款异常补录' })).toBeVisible();
    await page
      .locator('.ant-form-item')
      .filter({ hasText: '收款方式' })
      .locator('.ant-select-selector')
      .click();

    const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option-content');
    await expect(options).toHaveText(['银行转账', '门店收款']);
    await expect(page.getByText('微信', { exact: true })).toHaveCount(0);
    await expect(page.getByText('支付宝', { exact: true })).toHaveCount(0);
  });

  test('线下实收首次已记账但响应丢失时原样重试复用同一幂等键且只写一次', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const keys: string[] = [];
    let logicalWrites = 0;
    let attempts = 0;
    await page.route('**/api/payments/receipt', async (route) => {
      attempts += 1;
      keys.push(route.request().headers()['idempotency-key'] ?? '');
      if (logicalWrites === 0) logicalWrites += 1;
      if (attempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '响应在提交后丢失' }),
        });
      }
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: { id: 91, paymentNo: 'MR-IDEMPOTENT-91', status: 'PAID' },
        }),
      });
    });

    await page.goto('/admin/trade/payments');
    await page.getByRole('button', { name: '异常补录' }).click();
    const dialog = page.getByRole('dialog', { name: '线下收款异常补录' });
    await dialog.getByLabel('订单 ID').fill('9');
    await dialog.getByLabel('收款金额').fill('30');
    const submitReceipt = dialog.getByRole('button', { name: '确认补录' });
    await submitReceipt.click();

    await expect(page.getByText('收款结果待确认；请保持当前内容不变并重试，系统会沿用同一凭据安全恢复。')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(submitReceipt).not.toHaveClass(/ant-btn-loading/);
    const storedAttempt = await page.evaluate(() => {
      const entry = Object.entries(sessionStorage)
        .find(([key]) => key.startsWith('hc:manual-receipt-attempt:'));
      return entry ? JSON.parse(entry[1]) : null;
    });
    expect(storedAttempt).toMatchObject({ key: keys[0] });
    expect(storedAttempt.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(storedAttempt).sort()).toEqual(['fingerprint', 'key']);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.reload();
    await page.getByRole('button', { name: '异常补录' }).click();
    const reopenedDialog = page.getByRole('dialog', { name: '线下收款异常补录' });
    await reopenedDialog.getByLabel('订单 ID').fill('9');
    await reopenedDialog.getByLabel('收款金额').fill('30');
    await reopenedDialog.getByRole('button', { name: '确认补录' }).click();

    await expect(page.getByText('收款已登记，订单金额已同步')).toBeVisible();
    await expect(reopenedDialog).toHaveCount(0);
    expect(attempts).toBe(2);
    expect(logicalWrites).toBe(1);
    expect(keys[0]).toMatch(/^manual-receipt-/);
    expect(keys[1]).toBe(keys[0]);
    await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage)
      .filter((key) => key.startsWith('hc:manual-receipt-attempt:')).length)).toBe(0);
  });

  test('线下实收结果未知后修改意图会生成新幂等键', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const keys: string[] = [];
    let attempts = 0;
    await page.route('**/api/payments/receipt', async (route) => {
      attempts += 1;
      keys.push(route.request().headers()['idempotency-key'] ?? '');
      return route.fulfill({
        status: attempts === 1 ? 503 : 201,
        contentType: 'application/json',
        body: JSON.stringify(attempts === 1
          ? { code: 503, message: '响应未知' }
          : { code: 200, data: { id: 92, status: 'PAID' }, message: 'ok' }),
      });
    });

    await page.goto('/admin/trade/payments');
    await page.getByRole('button', { name: '异常补录' }).click();
    const dialog = page.getByRole('dialog', { name: '线下收款异常补录' });
    await dialog.getByLabel('订单 ID').fill('9');
    await dialog.getByLabel('收款金额').fill('30');
    const submit = dialog.getByRole('button', { name: '确认补录' });
    await submit.click();
    await expect(page.getByText('收款结果待确认；请保持当前内容不变并重试，系统会沿用同一凭据安全恢复。')).toBeVisible();
    await expect(submit).not.toHaveClass(/ant-btn-loading/);
    await dialog.getByLabel('收款金额').fill('31');
    await submit.click();

    await expect(dialog).toHaveCount(0);
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  test('线下实收明确 4xx 拒绝后同内容重试会使用新幂等键', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const keys: string[] = [];
    let attempts = 0;
    await page.route('**/api/payments/receipt', async (route) => {
      attempts += 1;
      keys.push(route.request().headers()['idempotency-key'] ?? '');
      return route.fulfill({
        status: attempts === 1 ? 400 : 201,
        contentType: 'application/json',
        body: JSON.stringify(attempts === 1
          ? { code: 400, message: '金额不符合当前应收' }
          : { code: 200, data: { id: 93, status: 'PAID' }, message: 'ok' }),
      });
    });

    await page.goto('/admin/trade/payments');
    await page.getByRole('button', { name: '异常补录' }).click();
    const dialog = page.getByRole('dialog', { name: '线下收款异常补录' });
    await dialog.getByLabel('订单 ID').fill('9');
    await dialog.getByLabel('收款金额').fill('30');
    const submit = dialog.getByRole('button', { name: '确认补录' });
    await submit.click();
    await expect.poll(() => attempts).toBe(1);
    await expect(submit).not.toHaveClass(/ant-btn-loading/);
    await submit.click();

    await expect(dialog).toHaveCount(0);
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  test('无法持久化线下实收重试凭据时失败关闭且不发送资金写请求', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (key.startsWith('hc:manual-receipt-attempt:')) {
          throw new DOMException('storage disabled', 'SecurityError');
        }
        return originalSetItem.call(this, key, value);
      };
    });
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    let receiptPosts = 0;
    await page.route('**/api/payments/receipt', async (route) => {
      receiptPosts += 1;
      await route.fulfill({ status: 500, body: '{}' });
    });

    await page.goto('/admin/trade/payments');
    await page.getByRole('button', { name: '异常补录' }).click();
    const dialog = page.getByRole('dialog', { name: '线下收款异常补录' });
    await dialog.getByLabel('订单 ID').fill('9');
    await dialog.getByLabel('收款金额').fill('30');
    await dialog.getByRole('button', { name: '确认补录' }).click();

    await expect(page.getByText('浏览器无法安全保存本次收款的重试凭据，系统未发送收款请求。请恢复会话存储后再试。')).toBeVisible();
    await expect.poll(() => receiptPosts).toBe(0);
    await expect(dialog).toBeVisible();
  });

  test('待确认微信付款不显示人工确认收款入口', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    await page.route('**/api/payments?**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          list: [{
            id: 1,
            paymentNo: 'PAY-WECHAT-PENDING',
            amount: 88,
            method: 'wechat',
            status: 'PENDING',
            createdAt: '2026-08-26T00:00:00.000Z',
            order: {
              orderNo: 'ORD-WECHAT-PENDING',
              customerName: '测试客户',
              customerPhone: '13800000000',
              status: 'PENDING_PAYMENT',
            },
          }],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      }),
    }));

    await page.goto('/admin/trade/payments');
    await expect(page.getByRole('button', { name: '待确认' })).toBeVisible();
    await expect(page.getByRole('table').getByText('待确认')).toBeVisible();
    await expect(page.getByText('在线支付由渠道确认')).toBeVisible();
    await expect(page.getByText('等待渠道确认')).toHaveCount(0);
    await expect(page.getByText('渠道自动确认')).toBeVisible();
    await expect(page.getByRole('button', { name: '确认收款' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '驳回' })).toHaveCount(0);
  });

  test('线下付款确认已提交但响应丢失时只读权威付款并收口且不重复确认', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const payment = {
      id: 91,
      paymentNo: 'PAY-BANK-REVIEW-91',
      amount: 88,
      method: 'bank_transfer',
      status: 'PENDING',
      proofUrl: 'payment-proof:91',
      reviewedBy: null as number | null,
      reviewedAt: null as string | null,
      reviewNote: null as string | null,
      createdAt: '2026-09-23T10:00:00.000Z',
      order: {
        orderNo: 'ORD-BANK-REVIEW-91',
        customerName: '付款审核客户',
        customerPhone: '13800000091',
        status: 'PENDING_PAYMENT',
      },
      reviewer: null,
    };
    let approveWrites = 0;
    await page.route('**/api/payments**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/payments' && method === 'GET') {
        return respond({ list: [payment], total: 1, page: 1, pageSize: 20 });
      }
      if (path === '/api/payments/91' && method === 'GET') return respond(payment);
      if (path === '/api/payments/91/approve' && method === 'PUT') {
        approveWrites += 1;
        const body = route.request().postDataJSON() as { reviewNote?: string };
        payment.status = 'PAID';
        payment.reviewedBy = 1;
        payment.reviewedAt = '2026-09-23T10:01:00.000Z';
        payment.reviewNote = body.reviewNote?.trim() || null;
        return route.abort('failed');
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/payments');
    await page.getByRole('button', { name: '确认收款' }).click();
    const dialog = page.getByRole('dialog', { name: '确认已收到线下转账？' });
    await dialog.getByPlaceholder('审核备注（可选，将记录到交易事件）').fill('银行到账已核对');
    await dialog.getByRole('button', { name: '确认收款' }).click();

    await expect(page.getByText('确认收款已写入并完成权威核验')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => approveWrites).toBe(1);
  });

  test('线下付款驳回确定未提交时保留备注并允许原动作安全重试', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const payment = {
      id: 92,
      paymentNo: 'PAY-BANK-REVIEW-92',
      amount: 99,
      method: 'bank_transfer',
      status: 'PENDING',
      proofUrl: 'payment-proof:92',
      reviewedBy: null as number | null,
      reviewedAt: null as string | null,
      reviewNote: null as string | null,
      createdAt: '2026-09-23T10:10:00.000Z',
      order: {
        orderNo: 'ORD-BANK-REVIEW-92',
        customerName: '付款驳回客户',
        customerPhone: '13800000092',
        status: 'PENDING_PAYMENT',
      },
      reviewer: null,
    };
    let rejectWrites = 0;
    await page.route('**/api/payments**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/payments' && method === 'GET') {
        return respond({ list: [payment], total: 1, page: 1, pageSize: 20 });
      }
      if (path === '/api/payments/92' && method === 'GET') return respond(payment);
      if (path === '/api/payments/92/reject' && method === 'PUT') {
        rejectWrites += 1;
        if (rejectWrites === 1) return route.abort('failed');
        const body = route.request().postDataJSON() as { reviewNote?: string };
        payment.status = 'FAILED';
        payment.reviewedBy = 1;
        payment.reviewedAt = '2026-09-23T10:11:00.000Z';
        payment.reviewNote = body.reviewNote?.trim() || null;
        return respond(payment);
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/payments');
    await page.getByRole('button', { name: '驳回' }).click();
    const dialog = page.getByRole('dialog', { name: '驳回该付款凭证？' });
    const note = dialog.getByPlaceholder('审核备注（可选，将记录到交易事件）');
    await note.fill('凭证流水无法核验');
    await dialog.getByRole('button', { name: '确认驳回' }).click();

    await expect(page.getByText('权威付款仍处于待审核，本次审核确定未生效；审核备注已保留，可安全重试。')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(note).toHaveValue('凭证流水无法核验');
    await expect.poll(() => rejectWrites).toBe(1);

    await dialog.getByRole('button', { name: '确认驳回' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => rejectWrites).toBe(2);
  });

  test('切换管理员身份后忽略旧付款审核结果且不刷新到新身份', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const payment = {
      id: 93,
      paymentNo: 'PAY-BANK-REVIEW-93',
      amount: 66,
      method: 'bank_transfer',
      status: 'PENDING',
      proofUrl: 'payment-proof:93',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: '2026-09-23T10:20:00.000Z',
      order: {
        orderNo: 'ORD-BANK-REVIEW-93',
        customerName: '身份切换付款客户',
        customerPhone: '13800000093',
        status: 'PENDING_PAYMENT',
      },
      reviewer: null,
    };
    let approveWrites = 0;
    let listReads = 0;
    let releaseApprove!: () => void;
    let markApproveStarted!: () => void;
    const approveGate = new Promise<void>((resolve) => {
      releaseApprove = resolve;
    });
    const approveStarted = new Promise<void>((resolve) => {
      markApproveStarted = resolve;
    });
    await page.route('**/api/payments**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/payments' && method === 'GET') {
        listReads += 1;
        return respond({ list: [payment], total: 1, page: 1, pageSize: 20 });
      }
      if (path === '/api/payments/93/approve' && method === 'PUT') {
        approveWrites += 1;
        markApproveStarted();
        await approveGate;
        return respond({ ...payment, status: 'PAID', reviewedBy: 1 });
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/payments');
    await page.getByRole('button', { name: '确认收款' }).click();
    const dialog = page.getByRole('dialog', { name: '确认已收到线下转账？' });
    await dialog.getByRole('button', { name: '确认收款' }).click();
    await approveStarted;

    await page.evaluate(async () => {
      const { useAuthStore } = await import('/src/store/authStore.ts');
      useAuthStore.getState().setAuth({
        id: 2,
        username: 'trade-safety-admin-b',
        realName: '交易安全管理员 B',
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt: '2026-09-23T10:21:00.000Z',
      });
    });
    await expect(dialog).toHaveCount(0);

    releaseApprove();
    await expect.poll(() => approveWrites).toBe(1);
    await expect(page.getByText('已确认收款，请刷新订单核对当前付款与履约状态')).toHaveCount(0);
    await expect(page.getByText('确认收款已写入并完成权威核验')).toHaveCount(0);
    expect(listReads).toBe(1);
  });

  test('关闭付款 A 后打开 B 时迟到的 A 详情不会覆盖当前付款', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const payments = [
      {
        id: 101,
        paymentNo: 'PAY-RACE-A',
        amount: 88,
        method: 'bank_transfer',
        status: 'PAID',
        createdAt: '2026-09-22T08:00:00.000Z',
        reviewedAt: '2026-09-22T08:10:00.000Z',
        order: {
          orderNo: 'ORD-PAY-RACE-A',
          customerName: '甲付款客户',
          customerPhone: '13800000101',
          status: 'PENDING_SHIP',
        },
        reviewer: { id: 1, realName: '审核甲', username: 'reviewer-a' },
      },
      {
        id: 102,
        paymentNo: 'PAY-RACE-B',
        amount: 99,
        method: 'store',
        status: 'PAID',
        createdAt: '2026-09-22T09:00:00.000Z',
        reviewedAt: '2026-09-22T09:10:00.000Z',
        order: {
          orderNo: 'ORD-PAY-RACE-B',
          customerName: '乙付款客户',
          customerPhone: '13800000102',
          status: 'PENDING_SHIP',
        },
        reviewer: { id: 2, realName: '审核乙', username: 'reviewer-b' },
      },
    ];
    let releaseFirstDetail!: () => void;
    let firstDetailCompleted = false;
    const firstDetailGate = new Promise<void>((resolve) => {
      releaseFirstDetail = resolve;
    });
    await page.route('**/api/payments**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/payments') {
        return respond({ list: payments, total: payments.length, page: 1, pageSize: 20 });
      }
      if (path === '/api/payments/101') {
        await firstDetailGate;
        firstDetailCompleted = true;
        return respond(payments[0]);
      }
      if (path === '/api/payments/102') return respond(payments[1]);
      return route.fallback();
    });

    await page.goto('/admin/trade/payments');
    const firstRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname === '/api/payments/101',
    );
    await page.getByRole('row').filter({ hasText: 'PAY-RACE-A' })
      .getByRole('button', { name: '详情' }).click();
    await firstRequest;
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('row').filter({ hasText: 'PAY-RACE-B' })
      .getByRole('button', { name: '详情' }).click();
    const drawer = page.getByRole('dialog', { name: '付款详情' });
    await expect(drawer).toContainText('PAY-RACE-B');
    await expect(drawer).toContainText('乙付款客户 · 13800000102');

    releaseFirstDetail();
    await expect.poll(() => firstDetailCompleted).toBe(true);
    await expect(drawer).toContainText('PAY-RACE-B');
    await expect(drawer).toContainText('乙付款客户 · 13800000102');
    await expect(drawer).not.toContainText('PAY-RACE-A');
    await expect(drawer).not.toContainText('甲付款客户');
    await expect(drawer).not.toContainText('13800000101');
  });

  test('快速切换付款状态筛选时迟到列表不会覆盖当前筛选结果', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const pendingPayment = {
      id: 111,
      paymentNo: 'PAY-FILTER-PENDING',
      amount: 88,
      method: 'wechat',
      status: 'PENDING',
      createdAt: '2026-09-22T08:00:00.000Z',
      order: {
        orderNo: 'ORD-PAY-FILTER-PENDING',
        customerName: '待确认付款客户',
        customerPhone: '13800000111',
        status: 'PENDING_PAYMENT',
      },
    };
    const paidPayment = {
      id: 112,
      paymentNo: 'PAY-FILTER-PAID',
      amount: 99,
      method: 'store',
      status: 'PAID',
      createdAt: '2026-09-22T09:00:00.000Z',
      order: {
        orderNo: 'ORD-PAY-FILTER-PAID',
        customerName: '已收款客户',
        customerPhone: '13800000112',
        status: 'PENDING_SHIP',
      },
    };
    let releasePending!: () => void;
    let pendingCompleted = false;
    const pendingGate = new Promise<void>((resolve) => {
      releasePending = resolve;
    });
    await page.route('**/api/payments**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/api/payments') return route.fallback();
      const status = url.searchParams.get('status');
      if (status === 'PENDING') {
        await pendingGate;
        pendingCompleted = true;
      }
      const list = status === 'PENDING'
        ? [pendingPayment]
        : status === 'PAID'
          ? [paidPayment]
          : [pendingPayment, paidPayment];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: { list, total: list.length, page: 1, pageSize: 20 },
        }),
      });
    });

    await page.goto('/admin/trade/payments');
    await expect(page.getByText('PAY-FILTER-PENDING', { exact: true })).toBeVisible();
    const pendingRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === '/api/payments' && url.searchParams.get('status') === 'PENDING';
    });
    await page.getByRole('button', { name: '待确认', exact: true }).click();
    await pendingRequest;
    await page.getByRole('button', { name: '已收款', exact: true }).click();
    await expect(page.getByText('PAY-FILTER-PAID', { exact: true })).toBeVisible();
    await expect(page.getByText('PAY-FILTER-PENDING', { exact: true })).toHaveCount(0);

    releasePending();
    await expect.poll(() => pendingCompleted).toBe(true);
    await expect(page.getByText('PAY-FILTER-PAID', { exact: true })).toBeVisible();
    await expect(page.getByText('PAY-FILTER-PENDING', { exact: true })).toHaveCount(0);
  });

  test('手机后台同样把线下收款放在异常补录中', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    await page.goto('/admin/trade/payments');

    await expect(page.getByRole('heading', { name: '支付记录' })).toBeVisible();
    await page.getByRole('button', { name: '异常补录' }).click();
    const dialog = page.getByRole('dialog', { name: '线下收款异常补录' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('微信/支付宝不可人工补录。', { exact: false })).toBeVisible();
  });

  test('在线支付退款只允许发起原路退款，不提供人工完成按钮', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    await page.route('**/api/refunds?**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          list: [{
            id: 1,
            refundNo: 'RFD-ONLINE-1',
            amount: 88,
            reason: '在线退款测试',
            status: 'APPROVED',
            createdAt: '2026-08-25T00:00:00.000Z',
            order: {
              orderNo: 'ORD-ONLINE-1',
              customerName: '测试客户',
              customerPhone: '13800000000',
              finalAmount: 88,
              status: 'PENDING_SHIP',
            },
            payment: {
              id: 1,
              paymentNo: 'PAY-ONLINE-1',
              method: 'wechat',
              status: 'PAID',
              amount: 88,
            },
          }],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      }),
    }));

    await page.goto('/admin/trade/refunds');
    const originalRouteButton = page.getByRole('button', { name: '发起原路退款' });
    await expect(originalRouteButton).toBeVisible();
    await expect(originalRouteButton).toBeEnabled();
    await expect(page.getByRole('button', { name: '补录线下退款' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '确认退款已完成' })).toHaveCount(0);

    let channelStarts = 0;
    await page.route('**/api/refunds/1/channel', async (route) => {
      if (route.request().method() === 'PUT') {
        channelStarts += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, message: 'ok', data: { state: 'PROCESSING' } }),
        });
        return;
      }
      await route.fallback();
    });

    await originalRouteButton.click();
    const confirm = page.getByRole('dialog', { name: '确认发起原路退款？' });
    await expect(confirm).toBeVisible();
    // Ant Design 两字按钮的无障碍名会插入空格（取 消）
    await confirm.getByRole('button', { name: /取\s*消/ }).click();
    expect(channelStarts).toBe(0);

    await originalRouteButton.click();
    await page.getByRole('button', { name: '确认发起' }).click();
    await expect.poll(() => channelStarts).toBe(1);
  });

  test('原路退款已受理但发起响应丢失时只读渠道状态且不重复 PUT', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const refund: any = {
      id: 35,
      refundNo: 'RFD-CHANNEL-RECOVERY-35',
      amount: 88,
      reason: '渠道发起响应丢失测试',
      status: 'APPROVED',
      gatewayRefundNo: null,
      createdAt: '2026-09-23T10:40:00.000Z',
      order: {
        orderNo: 'ORD-CHANNEL-RECOVERY-35',
        customerName: '渠道退款客户',
        customerPhone: '13800000035',
        finalAmount: 88,
        status: 'SHIPPED',
      },
      payment: {
        id: 305,
        paymentNo: 'PAY-CHANNEL-RECOVERY-35',
        method: 'wechat',
        status: 'PAID',
        amount: 88,
      },
    };
    let channelStarts = 0;
    let channelQueries = 0;
    await page.route('**/api/refunds**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/refunds/35/channel' && route.request().method() === 'PUT') {
        channelStarts += 1;
        refund.status = 'PROCESSING';
        refund.gatewayRefundNo = 'WX-REFUND-35';
        return route.abort('failed');
      }
      if (path === '/api/refunds/35/channel' && route.request().method() === 'GET') {
        channelQueries += 1;
        return respond({ refund, state: 'PROCESSING' });
      }
      if (path === '/api/refunds') {
        return respond({ list: [refund], total: 1, page: 1, pageSize: 20 });
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/refunds');
    await page.getByRole('button', { name: '发起原路退款' }).click();
    await page.getByRole('dialog', { name: '确认发起原路退款？' })
      .getByRole('button', { name: '确认发起' }).click();

    await expect(page.getByText('微信退款已由渠道受理，已完成只读核验')).toBeVisible();
    await expect(page.getByRole('button', { name: '查询退款状态' })).toBeVisible();
    expect(channelStarts).toBe(1);
    expect(channelQueries).toBe(1);
  });

  test('原路退款发起与首次查单均不可用时锁为只读查询', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const refund: any = {
      id: 36,
      refundNo: 'RFD-CHANNEL-UNKNOWN-36',
      amount: 96,
      reason: '渠道未知结果测试',
      status: 'APPROVED',
      gatewayRefundNo: null,
      createdAt: '2026-09-23T10:50:00.000Z',
      order: {
        orderNo: 'ORD-CHANNEL-UNKNOWN-36',
        customerName: '渠道待确认客户',
        customerPhone: '13800000036',
        finalAmount: 96,
        status: 'SHIPPED',
      },
      payment: {
        id: 306,
        paymentNo: 'PAY-CHANNEL-UNKNOWN-36',
        method: 'wechat',
        status: 'PAID',
        amount: 96,
      },
    };
    let channelStarts = 0;
    let channelQueries = 0;
    await page.route('**/api/refunds**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/refunds/36/channel' && route.request().method() === 'PUT') {
        channelStarts += 1;
        return route.abort('failed');
      }
      if (path === '/api/refunds/36/channel' && route.request().method() === 'GET') {
        channelQueries += 1;
        if (channelQueries === 1) return route.abort('failed');
        refund.status = 'PROCESSING';
        refund.gatewayRefundNo = 'WX-REFUND-36';
        return respond({ refund, state: 'PROCESSING' });
      }
      if (path === '/api/refunds') {
        return respond({ list: [refund], total: 1, page: 1, pageSize: 20 });
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/refunds');
    await page.getByRole('button', { name: '发起原路退款' }).click();
    await page.getByRole('dialog', { name: '确认发起原路退款？' })
      .getByRole('button', { name: '确认发起' }).click();

    await expect(page.getByText('原路退款发起结果待确认；当前只允许查询渠道状态，请勿再次发起。')).toBeVisible();
    await expect(page.getByRole('button', { name: '发起原路退款' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() =>
      sessionStorage.getItem('hc:refund-channel-recovery:1'))).toBe('[36]');
    expect(channelStarts).toBe(1);
    expect(channelQueries).toBe(1);

    await page.reload();
    await expect(page.getByRole('button', { name: '发起原路退款' })).toHaveCount(0);
    const queryButton = page.getByRole('button', { name: '查询退款状态' });
    await expect(queryButton).toBeVisible();
    expect(channelStarts).toBe(1);
    expect(channelQueries).toBe(1);

    await queryButton.click();
    await expect(page.getByText('微信退款处理中，稍后可继续查询')).toBeVisible();
    expect(channelStarts).toBe(1);
    expect(channelQueries).toBe(2);
  });

  test('浏览器无法保存渠道待确认标记时不发送原路退款 PUT', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (key.startsWith('hc:refund-channel-recovery:')) {
          throw new DOMException('storage disabled', 'SecurityError');
        }
        return originalSetItem.call(this, key, value);
      };
    });
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const refund = {
      id: 37,
      refundNo: 'RFD-CHANNEL-STORAGE-37',
      amount: 105,
      reason: '渠道存储失败关闭测试',
      status: 'APPROVED',
      createdAt: '2026-09-23T11:00:00.000Z',
      order: {
        orderNo: 'ORD-CHANNEL-STORAGE-37',
        customerName: '渠道存储客户',
        customerPhone: '13800000037',
        finalAmount: 105,
        status: 'SHIPPED',
      },
      payment: {
        id: 307,
        paymentNo: 'PAY-CHANNEL-STORAGE-37',
        method: 'wechat',
        status: 'PAID',
        amount: 105,
      },
    };
    let channelStarts = 0;
    await page.route('**/api/refunds**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/refunds/37/channel' && route.request().method() === 'PUT') {
        channelStarts += 1;
        return route.fulfill({ status: 500, body: 'unexpected write' });
      }
      if (path === '/api/refunds') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: 'ok',
            data: { list: [refund], total: 1, page: 1, pageSize: 20 },
          }),
        });
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/refunds');
    await page.getByRole('button', { name: '发起原路退款' }).click();
    await page.getByRole('dialog', { name: '确认发起原路退款？' })
      .getByRole('button', { name: '确认发起' }).click();

    await expect(page.getByText('浏览器无法保存原路退款待确认状态，本次未发起资金请求。')).toBeVisible();
    expect(channelStarts).toBe(0);
  });

  test('退款审核已提交但响应丢失时只读权威退款并收口且不重复审核', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const refund: any = {
      id: 31,
      refundNo: 'RFD-REVIEW-RECOVERY-31',
      amount: 36,
      reason: '审核响应丢失测试',
      status: 'PENDING',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: '2026-09-23T10:00:00.000Z',
      order: {
        orderNo: 'ORD-REVIEW-RECOVERY-31',
        customerName: '退款审核客户',
        customerPhone: '13800000031',
        finalAmount: 36,
        status: 'SHIPPED',
      },
      payment: {
        id: 301,
        paymentNo: 'PAY-REVIEW-RECOVERY-31',
        method: 'bank_transfer',
        status: 'PAID',
        amount: 36,
      },
    };
    let reviewWrites = 0;
    let authorityReads = 0;
    await page.route('**/api/refunds**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/refunds/31/review' && route.request().method() === 'PUT') {
        reviewWrites += 1;
        const body = route.request().postDataJSON() as { action: string; reviewNote?: string };
        refund.status = body.action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
        refund.reviewedBy = 1;
        refund.reviewedAt = '2026-09-23T10:01:00.000Z';
        refund.reviewNote = body.reviewNote?.trim() || null;
        return route.abort('failed');
      }
      if (path === '/api/refunds/31') {
        authorityReads += 1;
        return respond(refund);
      }
      if (path === '/api/refunds') {
        return respond({ list: [refund], total: 1, page: 1, pageSize: 20 });
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/refunds');
    const row = page.getByRole('row').filter({ hasText: refund.refundNo });
    await row.getByRole('button', { name: '拒绝' }).click();
    const dialog = page.getByRole('dialog', { name: '拒绝该退款？' });
    await dialog.getByPlaceholder('审核备注（可选）').fill('资料不完整');
    await dialog.getByRole('button', { name: '确认拒绝' }).click();

    await expect(page.getByText('退款审核已写入并完成权威核验')).toBeVisible();
    await expect.poll(() => reviewWrites).toBe(1);
    await expect.poll(() => authorityReads).toBe(1);
    await expect(row.getByText('已拒绝')).toBeVisible();
  });

  test('退款审核确定未提交时保留备注并允许原动作安全重试', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const refund: any = {
      id: 32,
      refundNo: 'RFD-REVIEW-RETRY-32',
      amount: 42,
      reason: '审核未提交测试',
      status: 'PENDING',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: '2026-09-23T10:10:00.000Z',
      order: {
        orderNo: 'ORD-REVIEW-RETRY-32',
        customerName: '退款重试客户',
        customerPhone: '13800000032',
        finalAmount: 42,
        status: 'SHIPPED',
      },
      payment: {
        id: 302,
        paymentNo: 'PAY-REVIEW-RETRY-32',
        method: 'bank_transfer',
        status: 'PAID',
        amount: 42,
      },
    };
    let reviewWrites = 0;
    let authorityReads = 0;
    await page.route('**/api/refunds**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/refunds/32/review' && route.request().method() === 'PUT') {
        reviewWrites += 1;
        if (reviewWrites === 1) return route.abort('failed');
        const body = route.request().postDataJSON() as { action: string; reviewNote?: string };
        refund.status = body.action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
        refund.reviewedBy = 1;
        refund.reviewedAt = '2026-09-23T10:11:00.000Z';
        refund.reviewNote = body.reviewNote?.trim() || null;
        return respond(refund);
      }
      if (path === '/api/refunds/32') {
        authorityReads += 1;
        return respond(refund);
      }
      if (path === '/api/refunds') {
        return respond({ list: [refund], total: 1, page: 1, pageSize: 20 });
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/refunds');
    const row = page.getByRole('row').filter({ hasText: refund.refundNo });
    await row.getByRole('button', { name: '拒绝' }).click();
    const dialog = page.getByRole('dialog', { name: '拒绝该退款？' });
    const note = dialog.getByPlaceholder('审核备注（可选）');
    await note.fill('材料需要补充');
    await dialog.getByRole('button', { name: '确认拒绝' }).click();

    await expect(page.getByText('权威退款仍处于待审核，本次审核确定未生效；当前备注已保留，可安全重试。')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(note).toHaveValue('材料需要补充');
    expect(reviewWrites).toBe(1);
    expect(authorityReads).toBe(1);

    await dialog.getByRole('button', { name: '确认拒绝' }).click();
    await expect(page.getByRole('table').getByText('已拒绝', { exact: true })).toBeVisible();
    await expect.poll(() => reviewWrites).toBe(2);
  });

  test('线下退款完成已提交但响应丢失时只读权威退款并收口', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const refund: any = {
      id: 33,
      refundNo: 'RFD-OFFLINE-COMPLETE-33',
      amount: 58,
      reason: '线下退款完成恢复测试',
      status: 'APPROVED',
      processedBy: null,
      processedAt: null,
      completedAt: null,
      gatewayRefundNo: null,
      createdAt: '2026-09-23T10:20:00.000Z',
      order: {
        orderNo: 'ORD-OFFLINE-COMPLETE-33',
        customerName: '线下退款客户',
        customerPhone: '13800000033',
        finalAmount: 58,
        status: 'SHIPPED',
      },
      payment: {
        id: 303,
        paymentNo: 'PAY-OFFLINE-COMPLETE-33',
        method: 'bank_transfer',
        status: 'PAID',
        amount: 58,
      },
    };
    let executionWrites = 0;
    let authorityReads = 0;
    await page.route('**/api/refunds**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/refunds/33/execute' && route.request().method() === 'PUT') {
        executionWrites += 1;
        const body = route.request().postDataJSON() as { gatewayRefundNo: string };
        refund.status = 'COMPLETED';
        refund.processedBy = 1;
        refund.processedAt = '2026-09-23T10:21:00.000Z';
        refund.completedAt = '2026-09-23T10:21:00.000Z';
        refund.gatewayRefundNo = body.gatewayRefundNo.trim();
        return route.abort('failed');
      }
      if (path === '/api/refunds/33') {
        authorityReads += 1;
        return respond(refund);
      }
      if (path === '/api/refunds') {
        return respond({ list: [refund], total: 1, page: 1, pageSize: 20 });
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/refunds');
    const row = page.getByRole('row').filter({ hasText: refund.refundNo });
    await row.getByRole('button', { name: '补录线下退款' }).click();
    const dialog = page.getByRole('dialog', { name: '确认退款已完成？' });
    await dialog.getByPlaceholder('退款流水号（必填）').fill('BANK-REFUND-33');
    await dialog.getByRole('button', { name: '确认完成' }).click();

    await expect(page.getByText('线下退款已完成并完成权威核验')).toBeVisible();
    await expect.poll(() => executionWrites).toBe(1);
    await expect.poll(() => authorityReads).toBe(1);
    await expect(page.getByRole('table').getByText('已完成', { exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test('线下退款失败记录响应丢失时保留原因并以同一意图安全恢复', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const refund: any = {
      id: 34,
      refundNo: 'RFD-OFFLINE-FAILED-34',
      amount: 63,
      reason: '线下退款失败恢复测试',
      status: 'APPROVED',
      processedBy: null,
      processedAt: null,
      gatewayRefundNo: null,
      createdAt: '2026-09-23T10:30:00.000Z',
      order: {
        orderNo: 'ORD-OFFLINE-FAILED-34',
        customerName: '线下失败客户',
        customerPhone: '13800000034',
        finalAmount: 63,
        status: 'SHIPPED',
      },
      payment: {
        id: 304,
        paymentNo: 'PAY-OFFLINE-FAILED-34',
        method: 'store',
        status: 'PAID',
        amount: 63,
      },
    };
    let executionAttempts = 0;
    let logicalFailureRecords = 0;
    let recordedReason = '';
    let authorityReads = 0;
    await page.route('**/api/refunds**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/refunds/34/execute' && route.request().method() === 'PUT') {
        executionAttempts += 1;
        const body = route.request().postDataJSON() as { reviewNote: string };
        const normalizedReason = body.reviewNote.trim();
        if (logicalFailureRecords === 0) {
          logicalFailureRecords = 1;
          recordedReason = normalizedReason;
          refund.processedBy = 1;
          refund.processedAt = '2026-09-23T10:31:00.000Z';
          return route.abort('failed');
        }
        expect(normalizedReason).toBe(recordedReason);
        return respond(refund);
      }
      if (path === '/api/refunds/34') {
        authorityReads += 1;
        return respond(refund);
      }
      if (path === '/api/refunds') {
        return respond({ list: [refund], total: 1, page: 1, pageSize: 20 });
      }
      return route.fallback();
    });

    await page.goto('/admin/trade/refunds');
    const row = page.getByRole('row').filter({ hasText: refund.refundNo });
    await row.getByRole('button', { name: '记录线下退款失败' }).click();
    const dialog = page.getByRole('dialog', { name: '标记退款执行失败？' });
    const reason = dialog.getByPlaceholder('失败原因（必填）');
    await reason.fill('银行退回请求超时');
    await dialog.getByRole('button', { name: '标记失败' }).click();

    await expect(page.getByText('失败记录结果待确认；请保持失败原因不变后重试，系统会安全恢复同一记录。')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(reason).toHaveValue('银行退回请求超时');
    expect(executionAttempts).toBe(1);
    expect(logicalFailureRecords).toBe(1);
    expect(authorityReads).toBe(1);

    await dialog.getByRole('button', { name: '标记失败' }).click();
    await expect(page.getByText('已记录退款失败')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(executionAttempts).toBe(2);
    expect(logicalFailureRecords).toBe(1);
  });

  test('关闭退款 A 后打开 B 时迟到的 A 详情不会覆盖当前退款', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const refunds = [
      {
        id: 1,
        refundNo: 'RFD-RACE-A',
        amount: 88,
        reason: 'A 退款原因',
        status: 'APPROVED',
        createdAt: '2026-09-22T08:00:00.000Z',
        order: {
          orderNo: 'ORD-RACE-A',
          customerName: '甲退款客户',
          customerPhone: '13800000001',
          finalAmount: 88,
          status: 'PENDING_SHIP',
        },
        payment: null,
      },
      {
        id: 2,
        refundNo: 'RFD-RACE-B',
        amount: 99,
        reason: 'B 退款原因',
        status: 'PENDING',
        createdAt: '2026-09-22T09:00:00.000Z',
        order: {
          orderNo: 'ORD-RACE-B',
          customerName: '乙退款客户',
          customerPhone: '13800000002',
          finalAmount: 99,
          status: 'PENDING_SHIP',
        },
        payment: null,
      },
    ];
    let releaseFirstDetail!: () => void;
    let firstDetailCompleted = false;
    const firstDetailGate = new Promise<void>((resolve) => {
      releaseFirstDetail = resolve;
    });
    await page.route('**/api/refunds**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/refunds') {
        return respond({ list: refunds, total: refunds.length, page: 1, pageSize: 20 });
      }
      if (path === '/api/refunds/1') {
        await firstDetailGate;
        firstDetailCompleted = true;
        return respond(refunds[0]);
      }
      if (path === '/api/refunds/2') return respond(refunds[1]);
      return route.fallback();
    });

    await page.goto('/admin/trade/refunds');
    const firstRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname === '/api/refunds/1',
    );
    await page.getByRole('row').filter({ hasText: 'RFD-RACE-A' })
      .getByRole('button', { name: '详情' }).click();
    await firstRequest;
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('row').filter({ hasText: 'RFD-RACE-B' })
      .getByRole('button', { name: '详情' }).click();
    const drawer = page.getByRole('dialog', { name: '退款详情' });
    await expect(drawer).toContainText('RFD-RACE-B');
    await expect(drawer).toContainText('乙退款客户 · 13800000002');

    releaseFirstDetail();
    await expect.poll(() => firstDetailCompleted).toBe(true);
    await expect(drawer).toContainText('RFD-RACE-B');
    await expect(drawer).toContainText('乙退款客户 · 13800000002');
    await expect(drawer).not.toContainText('RFD-RACE-A');
    await expect(drawer).not.toContainText('甲退款客户');
    await expect(drawer).not.toContainText('13800000001');
  });

  test('快速切换退款状态筛选时迟到列表不会覆盖当前筛选结果', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const pendingRefund = {
      id: 11,
      refundNo: 'RFD-FILTER-PENDING',
      amount: 88,
      reason: '待审核筛选结果',
      status: 'PENDING',
      createdAt: '2026-09-22T08:00:00.000Z',
      order: {
        orderNo: 'ORD-FILTER-PENDING',
        customerName: '待审核客户',
        customerPhone: '13800000011',
        finalAmount: 88,
        status: 'PENDING_SHIP',
      },
      payment: null,
    };
    const approvedRefund = {
      id: 12,
      refundNo: 'RFD-FILTER-APPROVED',
      amount: 99,
      reason: '待执行筛选结果',
      status: 'APPROVED',
      createdAt: '2026-09-22T09:00:00.000Z',
      order: {
        orderNo: 'ORD-FILTER-APPROVED',
        customerName: '待执行客户',
        customerPhone: '13800000012',
        finalAmount: 99,
        status: 'PENDING_SHIP',
      },
      payment: null,
    };
    let releasePending!: () => void;
    let pendingCompleted = false;
    const pendingGate = new Promise<void>((resolve) => {
      releasePending = resolve;
    });
    await page.route('**/api/refunds**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/api/refunds') return route.fallback();
      const status = url.searchParams.get('status');
      if (status === 'PENDING') {
        await pendingGate;
        pendingCompleted = true;
      }
      const list = status === 'PENDING'
        ? [pendingRefund]
        : status === 'APPROVED'
          ? [approvedRefund]
          : [pendingRefund, approvedRefund];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: { list, total: list.length, page: 1, pageSize: 20 },
        }),
      });
    });

    await page.goto('/admin/trade/refunds');
    await expect(page.getByText('RFD-FILTER-PENDING')).toBeVisible();
    const pendingRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === '/api/refunds' && url.searchParams.get('status') === 'PENDING';
    });
    await page.getByRole('button', { name: '待审核', exact: true }).click();
    await pendingRequest;
    await page.getByRole('button', { name: '待执行', exact: true }).click();
    await expect(page.getByText('RFD-FILTER-APPROVED')).toBeVisible();
    await expect(page.getByText('RFD-FILTER-PENDING')).toHaveCount(0);

    releasePending();
    await expect.poll(() => pendingCompleted).toBe(true);
    await expect(page.getByText('RFD-FILTER-APPROVED')).toBeVisible();
    await expect(page.getByText('RFD-FILTER-PENDING')).toHaveCount(0);
  });

  test('退款已创建但响应丢失后跨弹窗和刷新复用原凭据且只创建一笔', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    const requestKeys: string[] = [];
    const createdByKey = new Map<string, Record<string, unknown>>();
    let createAttempts = 0;
    let logicalCreates = 0;
    await page.route('**/api/refunds**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/refunds/orders/91/eligible-payments') {
        return respond({
          order: { id: 91, orderNo: 'ORD-RECOVERY-91', status: 'SHIPPED', orderType: 'SPOT', currency: 'CNY' },
          totalAvailableRefundAmount: '100.00',
          payments: [{
            id: 191,
            paymentNo: 'PAY-RECOVERY-191',
            method: 'wechat',
            status: 'PAID',
            type: 'FULL',
            installmentLabel: null,
            installmentSequence: null,
            amount: '100.00',
            occupiedRefundAmount: '0.00',
            availableRefundAmount: '100.00',
            eligible: true,
            reason: null,
          }],
        });
      }
      if (path !== '/api/refunds') return route.fallback();
      if (request.method() === 'GET') {
        return respond({ list: [], total: 0, page: 1, pageSize: 20 });
      }
      createAttempts += 1;
      const body = request.postDataJSON() as {
        orderId: number;
        paymentId: number;
        amount: number;
        reason: string;
        idempotencyKey: string;
      };
      requestKeys.push(body.idempotencyKey);
      let created = createdByKey.get(body.idempotencyKey);
      if (!created) {
        logicalCreates += 1;
        created = {
          id: 81,
          refundNo: 'RFD-RECOVERY-81',
          status: 'PENDING',
          ...body,
        };
        createdByKey.set(body.idempotencyKey, created);
      }
      if (createAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟退款创建提交后响应丢失' }),
        });
      }
      return respond(created);
    });

    const fillRefund = async (amount: string) => {
      const dialog = page.getByRole('dialog', { name: '发起退款' });
      await dialog.getByLabel('订单 ID').fill('91');
      await dialog.getByRole('button', { name: '核对原付款' }).click();
      await expect(dialog.getByText(/PAY-RECOVERY-191/)).toBeVisible();
      await dialog.getByLabel('退款金额（元）').fill(amount);
      await dialog.getByLabel('退款原因').fill('客户确认取消本次交易');
      return dialog;
    };

    await page.goto('/admin/trade/refunds');
    await page.getByRole('button', { name: '发起退款' }).click();
    let dialog = await fillRefund('30');
    await dialog.getByRole('button', { name: '提交申请' }).click();
    await expect(page.getByText(/退款申请结果待确认/)).toBeVisible();
    await dialog.getByRole('button', { name: /取\s*消/ }).click();

    await page.reload();
    await page.getByRole('button', { name: '发起退款' }).click();
    dialog = await fillRefund('31');
    await dialog.getByRole('button', { name: '提交申请' }).click();
    await expect(dialog.getByText('存在另一笔结果待确认的退款申请')).toBeVisible();
    expect(createAttempts).toBe(1);

    await dialog.getByLabel('退款金额（元）').fill('30');
    await dialog.getByRole('button', { name: '提交申请' }).click();
    await expect(page.getByText('退款申请已创建')).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(createAttempts).toBe(2);
    expect(logicalCreates).toBe(1);
    expect(requestKeys[0]).toMatch(/^refund-/);
    expect(requestKeys[1]).toBe(requestKeys[0]);
    await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage)
      .filter((key) => key.startsWith('hc:refund-create-attempt:')).length)).toBe(0);
  });

  test('浏览器无法保存退款重试凭据时失败关闭且不发送 POST', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (key.startsWith('hc:refund-create-attempt:')) {
          throw new DOMException('storage disabled', 'SecurityError');
        }
        return originalSetItem.call(this, key, value);
      };
    });
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    let createAttempts = 0;
    await page.route('**/api/refunds**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/refunds/orders/92/eligible-payments') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: 'ok',
            data: {
              order: { id: 92, orderNo: 'ORD-STORAGE-92', status: 'SHIPPED', orderType: 'SPOT', currency: 'CNY' },
              totalAvailableRefundAmount: '28.00',
              payments: [{
                id: 192,
                paymentNo: 'PAY-STORAGE-192',
                method: 'bank_transfer',
                status: 'PAID',
                type: 'FULL',
                installmentLabel: null,
                installmentSequence: null,
                amount: '28.00',
                occupiedRefundAmount: '0.00',
                availableRefundAmount: '28.00',
                eligible: true,
                reason: null,
              }],
            },
          }),
        });
      }
      if (path !== '/api/refunds') return route.fallback();
      if (request.method() === 'POST') createAttempts += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: request.method() === 'GET'
            ? { list: [], total: 0, page: 1, pageSize: 20 }
            : { id: 82 },
        }),
      });
    });

    await page.goto('/admin/trade/refunds');
    await page.getByRole('button', { name: '发起退款' }).click();
    const dialog = page.getByRole('dialog', { name: '发起退款' });
    await dialog.getByLabel('订单 ID').fill('92');
    await dialog.getByRole('button', { name: '核对原付款' }).click();
    await expect(dialog.getByText(/PAY-STORAGE-192/)).toBeVisible();
    await dialog.getByLabel('退款金额（元）').fill('28');
    await dialog.getByLabel('退款原因').fill('验证本地重试凭据不可用');
    await dialog.getByRole('button', { name: '提交申请' }).click();

    await expect(page.getByText(/浏览器无法安全保存本次退款的重试凭据/)).toBeVisible();
    expect(createAttempts).toBe(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '提交申请' })).toBeEnabled();
  });

  test('已通过退款售后跳转后保留工单关联并提交权威订单与审核额度', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    let createBody: Record<string, unknown> | null = null;
    const afterSalesCase = {
      id: 73,
      caseNo: 'AS-REFUND-73',
      orderId: 501,
      orderItemId: 601,
      customerId: 7,
      type: 'REFUND',
      status: 'APPROVED',
      reason: '客户确认退回已验收戒指',
      requestedRefundAmount: 88,
      approvedRefundAmount: 80,
      createdAt: '2026-09-22T08:00:00.000Z',
      updatedAt: '2026-09-22T09:00:00.000Z',
      order: {
        orderNo: 'ORD-AFTER-SALES-501',
        customerName: '售后退款客户',
        customerPhone: '13800000501',
        finalAmount: 100,
        status: 'PENDING_SHIP',
      },
    };
    await page.route('**/api/after-sales-cases**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path === '/api/after-sales-cases/73'
        ? afterSalesCase
        : { list: [afterSalesCase], total: 1, page: 1, pageSize: 20 };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
    });
    await page.route('**/api/refunds**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/refunds/orders/501/eligible-payments') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: 'ok',
            data: {
              order: { id: 501, orderNo: 'ORD-AFTER-SALES-501', status: 'SHIPPED', orderType: 'SPOT', currency: 'CNY' },
              totalAvailableRefundAmount: '100.00',
              payments: [{
                id: 701,
                paymentNo: 'PAY-AFTER-SALES-701',
                method: 'bank_transfer',
                status: 'PAID',
                type: 'FULL',
                installmentLabel: null,
                installmentSequence: null,
                amount: '100.00',
                occupiedRefundAmount: '0.00',
                availableRefundAmount: '100.00',
                eligible: true,
                reason: null,
              }],
            },
          }),
        });
      }
      if (request.method() === 'POST') {
        createBody = request.postDataJSON() as Record<string, unknown>;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, message: 'ok', data: { id: 91 } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: { list: [], total: 0, page: 1, pageSize: 20 },
        }),
      });
    });

    await page.goto('/admin/trade/after-sales');
    await page.getByRole('row').filter({ hasText: 'AS-REFUND-73' })
      .getByRole('button', { name: '去退款中心' }).click();
    await expect(page).toHaveURL(/\/admin\/trade\/refunds\?afterSalesCaseId=73$/);

    const dialog = page.getByRole('dialog', { name: '发起退款' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('关联售后工单 AS-REFUND-73')).toBeVisible();
    await expect(dialog.getByLabel('订单 ID')).toHaveValue('501');
    await expect(dialog.getByLabel('订单 ID')).toBeDisabled();
    await expect(dialog.getByLabel('退款金额（元）')).toHaveValue('80.00');
    await expect(dialog.getByLabel('退款原因')).toHaveValue('客户确认退回已验收戒指');
    await expect(dialog.getByText(/PAY-AFTER-SALES-701/)).toBeVisible();
    await dialog.getByRole('button', { name: '提交申请' }).click();

    await expect.poll(() => createBody).toMatchObject({
      orderId: 501,
      paymentId: 701,
      amount: 80,
      reason: '客户确认退回已验收戒指',
      afterSalesCaseId: 73,
    });
    await expect(page.getByText('退款申请已创建')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/trade\/refunds$/);
  });

  test('分期退款必须选择定金或尾款且单张退款不跨原付款额度', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const createBodies: Array<Record<string, unknown>> = [];
    await page.route('**/api/refunds**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path === '/api/refunds/orders/700/eligible-payments') {
        return respond({
          order: { id: 700, orderNo: 'ORD-INSTALLMENT-700', status: 'SHIPPED', orderType: 'CUSTOM', currency: 'CNY' },
          totalAvailableRefundAmount: '95.00',
          payments: [
            {
              id: 701,
              paymentNo: 'PAY-DEPOSIT-30',
              method: 'wechat',
              status: 'PARTIAL_REFUND',
              type: 'DEPOSIT',
              installmentLabel: '定金',
              installmentSequence: 1,
              amount: '30.00',
              occupiedRefundAmount: '5.00',
              availableRefundAmount: '25.00',
              eligible: true,
              reason: null,
            },
            {
              id: 702,
              paymentNo: 'PAY-BALANCE-70',
              method: 'bank_transfer',
              status: 'PAID',
              type: 'BALANCE',
              installmentLabel: '尾款',
              installmentSequence: 2,
              amount: '70.00',
              occupiedRefundAmount: '0.00',
              availableRefundAmount: '70.00',
              eligible: true,
              reason: null,
            },
          ],
        });
      }
      if (path !== '/api/refunds') return route.fallback();
      if (request.method() === 'GET') {
        return respond({ list: [], total: 0, page: 1, pageSize: 20 });
      }
      createBodies.push(request.postDataJSON() as Record<string, unknown>);
      return respond({ id: 7001, refundNo: 'RFD-INSTALLMENT-7001', status: 'PENDING' });
    });

    await page.goto('/admin/trade/refunds');
    await page.getByRole('button', { name: '发起退款' }).click();
    const dialog = page.getByRole('dialog', { name: '发起退款' });
    await dialog.getByLabel('订单 ID').fill('700');
    await dialog.getByRole('button', { name: '核对原付款' }).click();
    await expect(dialog.getByText('订单 ORD-INSTALLMENT-700 · 当前可退合计 ¥95.00')).toBeVisible();
    await dialog.getByLabel('原付款').click();
    const paymentOptions = page.locator('.ant-select-item-option-content');
    await expect(paymentOptions.filter({ hasText: /定金.*PAY-DEPOSIT-30.*可退 ¥25\.00/ })).toBeVisible();
    await expect(paymentOptions.filter({ hasText: /尾款.*PAY-BALANCE-70.*可退 ¥70\.00/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await dialog.getByLabel('退款金额（元）').fill('70');
    await dialog.getByLabel('退款原因').fill('按尾款原路退回');
    await dialog.getByRole('button', { name: '提交申请' }).click();
    await expect(dialog.getByText('请选择原付款')).toBeVisible();
    expect(createBodies).toHaveLength(0);

    await dialog.getByLabel('原付款').click();
    await paymentOptions.filter({ hasText: /尾款.*PAY-BALANCE-70/ }).click();
    await dialog.getByRole('button', { name: '提交申请' }).click();
    await expect.poll(() => createBodies).toHaveLength(1);
    expect(createBodies[0]).toMatchObject({
      orderId: 700,
      paymentId: 702,
      amount: 70,
      reason: '按尾款原路退回',
    });
    await expect(page.getByText('退款申请已创建')).toBeVisible();
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )).toBe(false);
  });

  test('客户未申请退款金额时后台必须明确核定额度且失败不关闭审核框', async ({ page }) => {
    await authenticateAdmin(page);
    await mockEmptyAdminApis(page);
    let reviewRequests = 0;
    let reviewBody: Record<string, unknown> | null = null;
    const caseRecord = {
      id: 74,
      caseNo: 'AS-REFUND-74',
      orderId: 502,
      orderItemId: 602,
      customerId: 8,
      type: 'REFUND',
      status: 'REQUESTED',
      reason: '客户自助申请退回戒指',
      requestedRefundAmount: null,
      approvedRefundAmount: null,
      createdAt: '2026-09-22T08:00:00.000Z',
      updatedAt: '2026-09-22T08:00:00.000Z',
      order: {
        orderNo: 'ORD-AFTER-SALES-502',
        customerName: '待核额客户',
        customerPhone: '13800000502',
        finalAmount: 100,
        status: 'PENDING_SHIP',
      },
    };
    await page.route('**/api/after-sales-cases**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'PUT' && path === '/api/after-sales-cases/74/review') {
        reviewRequests += 1;
        reviewBody = request.postDataJSON() as Record<string, unknown>;
        if (reviewRequests === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 503, message: '模拟售后审核暂时不可用' }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: 'ok',
            data: { ...caseRecord, status: 'APPROVED', approvedRefundAmount: 36 },
          }),
        });
      }
      const data = path === '/api/after-sales-cases/74'
        ? caseRecord
        : { list: [caseRecord], total: 1, page: 1, pageSize: 20 };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
    });

    await page.goto('/admin/trade/after-sales');
    await page.getByRole('row').filter({ hasText: 'AS-REFUND-74' })
      .getByRole('button', { name: /通过/ }).click();
    const reviewDialog = page.getByRole('dialog', { name: '审核通过该售后工单？' });
    await expect(reviewDialog.getByText('客户申请未提供金额')).toBeVisible();
    await reviewDialog.getByRole('button', { name: '确认通过' }).click();
    await expect(page.getByText('请输入大于 0 的审核退款金额。')).toBeVisible();
    await expect(reviewDialog).toBeVisible();
    expect(reviewRequests).toBe(0);

    await reviewDialog.getByLabel('审核通过的退款金额').fill('36');
    await reviewDialog.getByRole('button', { name: '确认通过' }).click();
    await expect.poll(() => reviewRequests).toBe(1);
    await expect(reviewDialog).toBeVisible();
    await expect(reviewDialog.getByLabel('审核通过的退款金额')).toHaveValue('36.00');
    await reviewDialog.getByRole('button', { name: '确认通过' }).click();
    await expect.poll(() => reviewRequests).toBe(2);
    await expect.poll(() => reviewBody).toMatchObject({
      action: 'APPROVED',
      approvedRefundAmount: 36,
    });
    await expect(page.getByRole('dialog', { name: '售后已通过，退款尚未执行' })).toBeVisible();
  });
});

async function mockCustomerWechatCheckout(
  page: Page,
  scene: 'native' | 'h5',
  options: {
    checkoutFailures?: number;
    checkoutError?: { status: number; message: string };
    checkoutGate?: Promise<void>;
    onCheckoutStarted?: () => void;
    paymentCreateFailure?: 'server' | 'network' | 'conflict' | 'rejected' | 'invalid';
    paymentStatusGate?: Promise<void>;
    onPaymentStatusStarted?: () => void;
    paymentStatusFailures?: number;
    paymentStatusState?: 'NONE' | 'PENDING' | 'PAID' | 'FAILED' | 'ATTENTION';
    paymentGatewayState?: 'NOTPAY' | 'USERPAYING';
    paymentCreateGate?: Promise<void>;
    onPaymentCreateStarted?: () => void;
    paymentContractFailure?: 'missing-type' | 'invalid-type' | 'invalid-amount';
    orderFinalAmount?: number;
    paymentAmount?: number;
    paymentType?: 'DEPOSIT' | 'BALANCE' | 'FULL' | 'SUPPLEMENT';
    orderLookupFailures?: number;
  } = {},
) {
  const checkoutKeys: string[] = [];
  let remainingCheckoutFailures = options.checkoutFailures ?? 0;
  let remainingOrderLookupFailures = options.orderLookupFailures ?? 0;
  let remainingPaymentStatusFailures = options.paymentStatusFailures ?? 0;
  let paymentCreateRequests = 0;
  let paymentStatusRequests = 0;
  let orderLookupRequests = 0;
  let customerId = 7;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const data = (value: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: value }),
    });
    if (path.endsWith('/settings/flags')) {
      return data({ commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
    }
    if (path.endsWith('/settings/public')) return data({ siteName: '海川珠宝' });
    if (path.endsWith('/cart') && method === 'GET') {
      return data([{
        id: customerId,
        skuId: customerId === 7 ? 10 : 20,
        quantity: 1,
        product: { name: customerId === 7 ? '甲账户支付测试戒指' : '乙账户专属项链' },
        sku: { price: customerId === 7 ? 8800 : 12800 },
        availability: { available: true, status: 'AVAILABLE', message: null },
      }]);
    }
    if (path.endsWith('/customers/me') && method === 'GET') {
      return data({
        id: customerId,
        name: customerId === 7 ? '甲账户客户' : '乙账户客户',
        phone: customerId === 7 ? '13800000007' : '13800000008',
      });
    }
    if (path.endsWith('/customers/me/orders/9') && method === 'GET') {
      orderLookupRequests += 1;
      if (customerId !== 7) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 404, message: '订单不存在' }),
        });
      }
      if (remainingOrderLookupFailures > 0) {
        remainingOrderLookupFailures -= 1;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '订单读取暂时失败' }),
        });
      }
      return data({ id: 9, orderNo: 'ORD-WX-9', finalAmount: options.orderFinalAmount ?? 8800 });
    }
    if (path.endsWith('/customers/checkout') && method === 'POST') {
      const idempotencyKey = request.headers()['idempotency-key'] ?? '';
      checkoutKeys.push(idempotencyKey);
      options.onCheckoutStarted?.();
      if (options.checkoutGate) await options.checkoutGate;
      if (!idempotencyKey) {
        return route.fulfill({
          status: 428,
          contentType: 'application/json',
          body: JSON.stringify({ code: 428, message: '缺少 Idempotency-Key 请求头' }),
        });
      }
      if (options.checkoutError) {
        return route.fulfill({
          status: options.checkoutError.status,
          contentType: 'application/json',
          body: JSON.stringify({
            code: options.checkoutError.status,
            message: options.checkoutError.message,
          }),
        });
      }
      if (remainingCheckoutFailures > 0) {
        remainingCheckoutFailures -= 1;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟响应丢失' }),
        });
      }
      return data({
        order: {
          id: 9,
          orderNo: 'ORD-WX-9',
          finalAmount: options.orderFinalAmount ?? 8800,
        },
      });
    }
    if (path.endsWith('/customers/me/orders/9/payment') && method === 'POST') {
      paymentCreateRequests += 1;
      options.onPaymentCreateStarted?.();
      if (options.paymentCreateGate) await options.paymentCreateGate;
      if (paymentCreateRequests === 1) {
        if (options.paymentContractFailure) {
          return data({
            provider: 'wechat',
            scene: 'native',
            qrCode: 'weixin://wxpay/bizpayurl/up?pr=invalid-contract',
            payment: {
              id: 3,
              paymentNo: 'PAY-WX-9',
              amount: options.paymentContractFailure === 'invalid-amount'
                ? 0
                : options.paymentAmount ?? 8800,
              ...(options.paymentContractFailure === 'missing-type'
                ? {}
                : {
                    type: options.paymentContractFailure === 'invalid-type'
                      ? 'INSTALLMENT'
                      : options.paymentType ?? 'FULL',
                  }),
            },
          });
        }
        if (options.paymentCreateFailure === 'network') {
          return route.abort('connectionfailed');
        }
        if (options.paymentCreateFailure === 'server') {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 503, message: '模拟微信预下单响应丢失' }),
          });
        }
        if (options.paymentCreateFailure === 'conflict') {
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ code: 409, message: '已有支付操作正在处理中' }),
          });
        }
        if (options.paymentCreateFailure === 'rejected') {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code: 400, message: '当前订单状态不支持发起在线收款' }),
          });
        }
        if (options.paymentCreateFailure === 'invalid') {
          return data({
            provider: 'wechat',
            scene: 'native',
            payment: {
              id: 3,
              paymentNo: 'PAY-WX-9',
              amount: options.paymentAmount ?? 8800,
              type: options.paymentType ?? 'FULL',
            },
          });
        }
      }
      return data({
        provider: 'wechat',
        scene,
        payment: {
          id: 3,
          paymentNo: 'PAY-WX-9',
          amount: options.paymentAmount ?? 8800,
          type: options.paymentType ?? 'FULL',
        },
        reused: paymentCreateRequests > 1,
        ...(scene === 'native'
          ? { qrCode: 'weixin://wxpay/bizpayurl/up?pr=test' }
          : { payUrl: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?stub=1' }),
      });
    }
    if (path.endsWith('/customers/me/orders/9/payment') && method === 'GET') {
      paymentStatusRequests += 1;
      options.onPaymentStatusStarted?.();
      if (options.paymentStatusGate) await options.paymentStatusGate;
      if (remainingPaymentStatusFailures > 0) {
        remainingPaymentStatusFailures -= 1;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '模拟微信查单瞬时失败' }),
        });
      }
      const state = options.paymentStatusState ?? 'PENDING';
      return data({
        state,
        gatewayState: state === 'PAID'
          ? 'SUCCESS'
          : state === 'PENDING'
            ? options.paymentGatewayState ?? 'NOTPAY'
            : undefined,
      });
    }
    return data(null);
  });
  await page.route('**/cgi-bin/mmpayweb-bin/checkmweb*', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<meta charset="utf-8"><main><h1>微信 H5 收银台跳转测试</h1></main>',
  }));
  return {
    checkoutKeys,
    setCustomerId: (nextCustomerId: number) => {
      customerId = nextCustomerId;
    },
    getPaymentCreateRequests: () => paymentCreateRequests,
    getPaymentStatusRequests: () => paymentStatusRequests,
    getOrderLookupRequests: () => orderLookupRequests,
  };
}

test.describe('客户标准零售使用微信在线支付主链', () => {
  const paymentCases = [
    { name: '30% 定金', slug: 'deposit-30', amount: 30, type: 'DEPOSIT', role: '定金' },
    { name: '70% 尾款', slug: 'balance-70', amount: 70, type: 'BALANCE', role: '尾款' },
    { name: '100% 定金', slug: 'deposit-100', amount: 100, type: 'DEPOSIT', role: '定金' },
  ] as const;
  const paymentViewports = [
    { name: '桌面', width: 1440, height: 900 },
    { name: '390px 手机', width: 390, height: 844 },
  ] as const;

  for (const paymentCase of paymentCases) {
    for (const viewport of paymentViewports) {
      test(`${viewport.name} ${paymentCase.name}按服务端响应显示本期款项角色`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        let releasePaymentCreate!: () => void;
        let paymentCreateStarted = false;
        const paymentCreateGate = new Promise<void>((resolve) => {
          releasePaymentCreate = resolve;
        });
        await mockCustomerWechatCheckout(page, 'native', {
          paymentCreateGate,
          onPaymentCreateStarted: () => {
            paymentCreateStarted = true;
          },
          orderFinalAmount: 100,
          paymentAmount: paymentCase.amount,
          paymentType: paymentCase.type,
        });
        await page.goto('/checkout');
        await page.getByLabel('收货地址').fill(`深圳市${paymentCase.name}测试地址 30 号`);
        await page.getByRole('button', { name: /提交订单并支付/ }).click();

        const dialog = page.getByRole('dialog', { name: '微信支付' });
        await expect.poll(() => paymentCreateStarted).toBe(true);
        const totalRow = dialog.getByText('订单总额', { exact: true }).locator('..');
        await expect(totalRow.getByText('¥100', { exact: true })).toBeVisible();
        await expect(dialog.getByText(/^本期应付/)).toHaveCount(0);
        if (paymentCase.amount !== 100) {
          await expect(dialog.getByText(`¥${paymentCase.amount}`, { exact: true })).toHaveCount(0);
        }

        releasePaymentCreate();
        await expect(dialog.locator('canvas')).toBeVisible();
        const currentRow = dialog
          .getByText(`本期应付（${paymentCase.role}）`, { exact: true })
          .locator('..');
        await expect(currentRow.getByText(`¥${paymentCase.amount}`, { exact: true })).toBeVisible();
        await expect(totalRow.getByText('¥100', { exact: true })).toBeVisible();

        const hasHorizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(hasHorizontalOverflow).toBe(false);
        await dialog.screenshot({
          path: test.info().outputPath(
            `payment-${paymentCase.slug}-after-${viewport.width}.png`,
          ),
        });
      });
    }
  }

  for (const contractCase of [
    { name: '缺失款项类型', failure: 'missing-type' as const, width: 1440, height: 900 },
    { name: '非法款项类型', failure: 'invalid-type' as const, width: 390, height: 844 },
    { name: '非法本期金额', failure: 'invalid-amount' as const, width: 1440, height: 900 },
  ]) {
    test(`${contractCase.name}不展示二维码或本期金额并查单恢复`, async ({ page }) => {
      await page.setViewportSize({ width: contractCase.width, height: contractCase.height });
      let releasePaymentStatus!: () => void;
      let markPaymentStatusStarted!: () => void;
      const paymentStatusGate = new Promise<void>((resolve) => {
        releasePaymentStatus = resolve;
      });
      const paymentStatusStarted = new Promise<void>((resolve) => {
        markPaymentStatusStarted = resolve;
      });
      const state = await mockCustomerWechatCheckout(page, 'native', {
        paymentContractFailure: contractCase.failure,
        paymentAmount: 30,
        paymentType: 'DEPOSIT',
        orderFinalAmount: 100,
        paymentStatusGate,
        onPaymentStatusStarted: markPaymentStatusStarted,
        paymentStatusState: 'PENDING',
        paymentGatewayState: 'NOTPAY',
      });
      await page.goto('/checkout');
      await page.getByLabel('收货地址').fill(`深圳市${contractCase.name}恢复地址 31 号`);
      await page.getByRole('button', { name: /提交订单并支付/ }).click();

      const dialog = page.getByRole('dialog', { name: '微信支付' });
      await paymentStatusStarted;
      await expect(dialog.getByText(/支付发起结果待确认，请勿重复付款/)).toBeVisible();
      await expect(dialog.getByText(/^本期应付/)).toHaveCount(0);
      await expect(dialog.getByText('¥30', { exact: true })).toHaveCount(0);
      await expect(dialog.locator('canvas')).toHaveCount(0);
      expect(state.getPaymentCreateRequests()).toBe(1);

      releasePaymentStatus();
      const resume = dialog.getByRole('button', { name: '恢复原微信支付入口' });
      await expect(resume).toBeVisible();
      await resume.click();
      await expect.poll(state.getPaymentCreateRequests).toBe(2);
      await expect(dialog.locator('canvas')).toBeVisible();
      await expect(dialog.getByText('本期应付（定金）', { exact: true })).toBeVisible();
      await expect(dialog.getByText('¥30', { exact: true })).toBeVisible();
    });
  }

  test('桌面结算创建订单后展示 Native 二维码，不再引导人工线下转账', async ({ page }) => {
    await mockCustomerWechatCheckout(page, 'native');
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市测试地址 1 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();

    const dialog = page.getByRole('dialog', { name: '微信支付' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('ORD-WX-9')).toBeVisible();
    await expect(dialog.locator('canvas')).toBeVisible();
    await expect(dialog.getByText('请使用微信扫描二维码完成支付')).toBeVisible();
    await expect(page.getByText('线下转账')).toHaveCount(0);
  });

  test('收费或区域规则未接入时展示服务端原因且不进入支付', async ({ page }) => {
    const rejection = '当前订单的运费或配送区域尚未完成结算核算，请联系客服处理';
    const state = await mockCustomerWechatCheckout(page, 'native', {
      checkoutError: { status: 409, message: rejection },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市收费配送测试地址 12 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();

    await expect(page.getByText(rejection, { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: '微信支付' })).toHaveCount(0);
    expect(state.checkoutKeys).toHaveLength(1);
    expect(state.getPaymentCreateRequests()).toBe(0);
  });

  test('手机网站接收 H5 场景后跳转微信收银台链接', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockCustomerWechatCheckout(page, 'h5');
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市测试地址 2 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();

    await expect(page).toHaveURL(/wx\.tenpay\.com\/cgi-bin\/mmpayweb-bin\/checkmweb/);
    await expect(page.getByRole('heading', { name: '微信 H5 收银台跳转测试' })).toBeVisible();
  });

  test('H5 回跳在新会话中按本人订单恢复并先查支付结果', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await mockCustomerWechatCheckout(page, 'h5', { paymentStatusState: 'PAID' });
    await page.goto('/checkout?paymentReturn=1&orderId=9');

    await expect(page.locator('#main-content').getByText('订单号：ORD-WX-9')).toBeVisible();
    await expect(page.getByRole('heading', { name: '支付已确认' })).toBeVisible();
    expect(state.getOrderLookupRequests()).toBe(1);
    expect(state.getPaymentStatusRequests()).toBeGreaterThan(0);
    expect(state.getPaymentCreateRequests()).toBe(0);
  });

  test('H5 回跳拒绝无效订单编号且不发起支付', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'h5');
    await page.goto('/checkout?paymentReturn=1&orderId=9&orderId=8');

    await expect(page.getByRole('heading', { name: '无法核实支付返回的订单' })).toBeVisible();
    await expect(page.getByText('支付返回链接中的订单编号无效，请从我的订单查看支付结果。')).toBeVisible();
    expect(state.getOrderLookupRequests()).toBe(0);
    expect(state.getPaymentStatusRequests()).toBe(0);
    expect(state.getPaymentCreateRequests()).toBe(0);
  });

  test('H5 回跳无法读取他人订单时不显示旧订单并允许本人查找', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'h5');
    state.setCustomerId(8);
    await page.goto('/checkout?paymentReturn=1&orderId=9');

    await expect(page.getByRole('heading', { name: '无法核实支付返回的订单' })).toBeVisible();
    await expect(page.getByRole('link', { name: '查看我的订单' })).toBeVisible();
    await expect(page.getByText('ORD-WX-9')).toHaveCount(0);
    expect(state.getOrderLookupRequests()).toBe(1);
    expect(state.getPaymentStatusRequests()).toBe(0);
    expect(state.getPaymentCreateRequests()).toBe(0);
  });

  test('H5 回跳订单读取短暂失败后可重试查单', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'h5', { orderLookupFailures: 1 });
    await page.goto('/checkout?paymentReturn=1&orderId=9');

    await expect(page.getByRole('heading', { name: '无法核实支付返回的订单' })).toBeVisible();
    await page.getByRole('button', { name: '重新核实订单' }).click();
    await expect(page.locator('#main-content').getByText('订单号：ORD-WX-9')).toBeVisible();
    expect(state.getOrderLookupRequests()).toBe(2);
    expect(state.getPaymentCreateRequests()).toBe(0);
  });

  for (const recoveryCase of [
    { name: '桌面 503', width: 1280, height: 900, failure: 'server' as const },
    { name: '390px 手机网络中断', width: 390, height: 844, failure: 'network' as const },
    { name: '桌面 409 并发冲突', width: 1280, height: 900, failure: 'conflict' as const },
  ]) {
    test(`${recoveryCase.name}预下单结果未知时先查单，再用同一商户单号恢复二维码`, async ({ page }) => {
      await page.setViewportSize({ width: recoveryCase.width, height: recoveryCase.height });
      let releasePaymentStatus!: () => void;
      let markPaymentStatusStarted!: () => void;
      const paymentStatusGate = new Promise<void>((resolve) => {
        releasePaymentStatus = resolve;
      });
      const paymentStatusStarted = new Promise<void>((resolve) => {
        markPaymentStatusStarted = resolve;
      });
      const state = await mockCustomerWechatCheckout(page, 'native', {
        paymentCreateFailure: recoveryCase.failure,
        paymentStatusGate,
        onPaymentStatusStarted: markPaymentStatusStarted,
        paymentStatusState: 'PENDING',
        paymentGatewayState: 'NOTPAY',
      });
      await page.goto('/checkout');
      await page.getByLabel('收货地址').fill('深圳市预下单未知恢复地址 8 号');
      await page.getByRole('button', { name: /提交订单并支付/ }).click();

      const dialog = page.getByRole('dialog', { name: '微信支付' });
      await paymentStatusStarted;
      await expect(dialog.getByText(/支付发起结果待确认，请勿重复付款/)).toBeVisible();
      await expect(dialog.getByRole('button', { name: '重新发起微信支付' })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: '恢复原微信支付入口' })).toHaveCount(0);
      expect(state.getPaymentCreateRequests()).toBe(1);

      releasePaymentStatus();
      const resume = dialog.getByRole('button', { name: '恢复原微信支付入口' });
      await expect(resume).toBeVisible();
      const recoveryResponse = page.waitForResponse((response) =>
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/customers/me/orders/9/payment'
        && response.ok(),
      );
      await resume.click();
      const recoveryBody = await (await recoveryResponse).json() as {
        data?: { reused?: boolean; payment?: { paymentNo?: string } };
      };

      expect(recoveryBody.data).toMatchObject({
        reused: true,
        payment: { paymentNo: 'PAY-WX-9' },
      });
      await expect.poll(state.getPaymentCreateRequests).toBe(2);
      await expect(dialog.locator('canvas')).toBeVisible();
      await expect(dialog.getByText('请使用微信扫描二维码完成支付')).toBeVisible();
      await expect(dialog.getByRole('button', { name: '重新发起微信支付' })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: '恢复原微信支付入口' })).toHaveCount(0);
    });
  }

  test('预下单结果未知后查单已支付时不再发送第二次 POST', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'native', {
      paymentCreateFailure: 'server',
      paymentStatusState: 'PAID',
    });
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市未知结果已支付地址 9 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();

    await expect(page.getByRole('heading', { name: '支付已确认' })).toBeVisible();
    expect(state.getPaymentCreateRequests()).toBe(1);
    await expect(page.getByRole('button', { name: '重新发起微信支付' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '恢复原微信支付入口' })).toHaveCount(0);
  });

  test('预下单结果未知后查单待核对时锁住所有创建入口', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'native', {
      paymentCreateFailure: 'server',
      paymentStatusState: 'ATTENTION',
    });
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市未知结果待核对地址 9A 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();

    const dialog = page.getByRole('dialog', { name: '微信支付' });
    await expect(dialog.getByText('支付状态待核对')).toBeVisible();
    await expect(dialog.getByText(/请勿重复支付，并联系珠宝顾问/)).toBeVisible();
    expect(state.getPaymentCreateRequests()).toBe(1);
    await expect(dialog.getByRole('button', { name: '重新发起微信支付' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '恢复原微信支付入口' })).toHaveCount(0);
  });

  for (const terminalState of ['FAILED', 'NONE'] as const) {
    test(`预下单结果未知后查单明确 ${terminalState} 时才允许重新发起`, async ({ page }) => {
      const state = await mockCustomerWechatCheckout(page, 'native', {
        paymentCreateFailure: 'server',
        paymentStatusState: terminalState,
      });
      await page.goto('/checkout');
      await page.getByLabel('收货地址').fill(`深圳市${terminalState} 恢复地址 9B 号`);
      await page.getByRole('button', { name: /提交订单并支付/ }).click();

      const dialog = page.getByRole('dialog', { name: '微信支付' });
      await expect(dialog.getByRole('button', { name: '重新发起微信支付' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: '恢复原微信支付入口' })).toHaveCount(0);
      expect(state.getPaymentCreateRequests()).toBe(1);
    });
  }

  test('明确 400 拒绝与结果未知分开呈现，且不立即开放再次 POST', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'native', {
      paymentCreateFailure: 'rejected',
    });
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市明确拒绝地址 10 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();

    const dialog = page.getByRole('dialog', { name: '微信支付' });
    await expect(dialog.getByText('本次支付请求未被受理', { exact: true })).toBeVisible();
    await expect(dialog.getByText('当前订单状态不支持发起在线收款')).toBeVisible();
    await expect(dialog.getByText(/支付发起结果待确认/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '重新发起微信支付' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '恢复原微信支付入口' })).toHaveCount(0);
    expect(state.getPaymentCreateRequests()).toBe(1);
    expect(state.getPaymentStatusRequests()).toBe(0);
  });

  test('预下单成功响应缺少二维码时也按结果未知先查单', async ({ page }) => {
    let releasePaymentStatus!: () => void;
    let markPaymentStatusStarted!: () => void;
    const paymentStatusGate = new Promise<void>((resolve) => {
      releasePaymentStatus = resolve;
    });
    const paymentStatusStarted = new Promise<void>((resolve) => {
      markPaymentStatusStarted = resolve;
    });
    await mockCustomerWechatCheckout(page, 'native', {
      paymentCreateFailure: 'invalid',
      paymentStatusGate,
      onPaymentStatusStarted: markPaymentStatusStarted,
      paymentStatusState: 'PENDING',
      paymentGatewayState: 'USERPAYING',
    });
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市响应校验失败地址 11 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();

    const dialog = page.getByRole('dialog', { name: '微信支付' });
    await paymentStatusStarted;
    await expect(dialog.getByText(/支付发起结果待确认，请勿重复付款/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: '重新发起微信支付' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '恢复原微信支付入口' })).toHaveCount(0);

    releasePaymentStatus();
    await expect(dialog.getByText('微信正在处理付款，稍后自动确认')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '重新发起微信支付' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '恢复原微信支付入口' })).toHaveCount(0);
  });

  test('结算响应失败后重试复用同一幂等键', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'native', {
      checkoutFailures: 1,
    });
    await page.goto('/checkout');
    const address = '深圳市幂等重试地址 3 号';
    const email = 'checkout-retry@example.test';
    await page.getByLabel('收货地址').fill(address);
    await page.getByLabel('邮箱（可选）').fill(email);

    await page.getByRole('button', { name: /提交订单并支付/ }).click();
    await expect.poll(() => state.checkoutKeys.length).toBe(1);
    const persistedAttempt = await page.evaluate(() =>
      sessionStorage.getItem('haichuan:checkout-attempt'),
    );
    expect(persistedAttempt).not.toContain(address);
    expect(persistedAttempt).not.toContain(email);
    const parsedAttempt = JSON.parse(persistedAttempt || 'null') as {
      requestHash?: string;
      key?: string;
    } | null;
    expect(Object.keys(parsedAttempt ?? {}).sort()).toEqual(['key', 'requestHash']);
    expect(parsedAttempt?.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsedAttempt?.key).toBe(state.checkoutKeys[0]);

    await page.reload();
    await page.getByLabel('收货地址').fill(address);
    await page.getByLabel('邮箱（可选）').fill(email);
    await page.getByRole('button', { name: /提交订单并支付/ }).click();
    await expect.poll(() => state.checkoutKeys.length).toBe(2);

    expect(state.checkoutKeys[0]).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
    expect(state.checkoutKeys[1]).toBe(state.checkoutKeys[0]);
    await expect(page.getByRole('dialog', { name: '微信支付' })).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      sessionStorage.getItem('haichuan:checkout-attempt'),
    )).toBeNull();
  });

  test('客户身份切换后相同结算内容不会复用旧账户幂等键', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'native', {
      checkoutFailures: 2,
    });
    const address = '深圳市账号切换测试地址 4 号';
    const email = 'account-switch@example.test';
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill(address);
    await page.getByLabel('邮箱（可选）').fill(email);
    await page.getByRole('button', { name: /提交订单并支付/ }).click();
    await expect.poll(() => state.checkoutKeys.length).toBe(1);
    const firstAttempt = await page.evaluate(() =>
      sessionStorage.getItem('haichuan:checkout-attempt'),
    );

    state.setCustomerId(8);
    await page.reload();
    await page.getByLabel('收货地址').fill(address);
    await page.getByLabel('邮箱（可选）').fill(email);
    await page.getByRole('button', { name: /提交订单并支付/ }).click();
    await expect.poll(() => state.checkoutKeys.length).toBe(2);
    const secondAttempt = await page.evaluate(() =>
      sessionStorage.getItem('haichuan:checkout-attempt'),
    );

    const first = JSON.parse(firstAttempt || 'null') as { requestHash?: string; key?: string } | null;
    const second = JSON.parse(secondAttempt || 'null') as { requestHash?: string; key?: string } | null;
    expect(second?.requestHash).not.toBe(first?.requestHash);
    expect(second?.key).not.toBe(first?.key);
    expect(state.checkoutKeys[1]).not.toBe(state.checkoutKeys[0]);
    expect(secondAttempt).not.toContain(address);
    expect(secondAttempt).not.toContain(email);
  });

  test('客户身份切换后不会恢复上一账户的待支付订单', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'native');
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市待支付归属测试地址 5 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();

    await expect(page.getByRole('dialog', { name: '微信支付' })).toBeVisible();
    const stored = await page.evaluate(() =>
      sessionStorage.getItem('haichuan:pending-payment-order'),
    );
    expect(JSON.parse(stored || 'null')).toMatchObject({
      ownerId: 7,
      order: { id: 9, orderNo: 'ORD-WX-9' },
    });

    state.setCustomerId(8);
    await page.reload();

    await expect(page.getByRole('button', { name: /提交订单并支付/ })).toBeVisible();
    await expect(page.getByText('ORD-WX-9')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() =>
      sessionStorage.getItem('haichuan:pending-payment-order'),
    )).toBeNull();
  });

  test('同页客户身份切换会重建结算会话并清除上一账户资料', async ({ page }) => {
    const state = await mockCustomerWechatCheckout(page, 'native');
    await page.goto('/checkout');
    await expect(page.getByText('甲账户支付测试戒指')).toBeVisible();
    await expect(page.getByText('甲账户客户')).toBeVisible();
    await page.getByLabel('收货地址').fill('甲账户未提交的私密地址');

    state.setCustomerId(8);
    await page.evaluate(async () => {
      const { useCustomerAuthStore } = await import('/src/store/customerAuthStore.ts');
      useCustomerAuthStore.getState().setAuth({
        id: 8,
        name: '乙账户客户',
        phone: '13800000008',
        email: null,
      });
    });

    await expect(page.getByText('乙账户专属项链')).toBeVisible();
    await expect(page.getByText('乙账户客户')).toBeVisible();
    await expect(page.getByText('甲账户支付测试戒指')).toHaveCount(0);
    await expect(page.getByText('甲账户客户')).toHaveCount(0);
    await expect(page.getByLabel('收货地址')).toHaveValue('');
  });

  test('同页身份切换后旧结算成功响应不会写入新账户待支付状态', async ({ page }) => {
    let releaseCheckout!: () => void;
    let markCheckoutStarted!: () => void;
    const checkoutGate = new Promise<void>((resolve) => {
      releaseCheckout = resolve;
    });
    const checkoutStarted = new Promise<void>((resolve) => {
      markCheckoutStarted = resolve;
    });
    const state = await mockCustomerWechatCheckout(page, 'native', {
      checkoutGate,
      onCheckoutStarted: markCheckoutStarted,
    });
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('甲账户准备提交的地址');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();
    await checkoutStarted;

    state.setCustomerId(8);
    await page.evaluate(async () => {
      const { useCustomerAuthStore } = await import('/src/store/customerAuthStore.ts');
      useCustomerAuthStore.getState().setAuth({
        id: 8,
        name: '乙账户客户',
        phone: '13800000008',
        email: null,
      });
    });
    await expect(page.getByText('乙账户专属项链')).toBeVisible();

    releaseCheckout();
    await expect.poll(() => page.evaluate(() =>
      sessionStorage.getItem('haichuan:pending-payment-order'),
    )).toBeNull();
    await expect(page.getByText('ORD-WX-9')).toHaveCount(0);
    await expect(page.getByText('会话身份已变更，已忽略旧请求结果')).toHaveCount(0);
  });

  test('自动查单遇到一次瞬时失败后继续轮询并恢复已支付状态', async ({ page }) => {
    await page.clock.install();
    const state = await mockCustomerWechatCheckout(page, 'native', {
      paymentStatusFailures: 1,
      paymentStatusState: 'PAID',
    });
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市支付恢复测试地址 6 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();
    const dialog = page.getByRole('dialog', { name: '微信支付' });
    await expect(dialog.locator('canvas')).toBeVisible();

    await page.clock.runFor(3_000);
    await expect.poll(state.getPaymentStatusRequests).toBe(1);
    await expect(dialog.getByText(/支付状态暂时无法查询/)).toHaveCount(0);

    await page.clock.runFor(3_000);
    await expect.poll(state.getPaymentStatusRequests).toBe(2);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: '支付已确认' })).toBeVisible();
    await expect(page.getByText('微信支付已经由服务端确认，订单将进入拣货与发货流程。')).toBeVisible();
  });

  for (const viewport of [
    { name: '桌面', width: 1280, height: 900 },
    { name: '390px 手机', width: 390, height: 844 },
  ]) {
    test(`${viewport.name}已有二维码查单失败时保留原支付并只允许重查`, async ({ page }) => {
      await page.clock.install();
      await page.clock.pauseAt(new Date('2030-09-22T10:00:00.000Z'));
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const state = await mockCustomerWechatCheckout(page, 'native', {
        paymentStatusFailures: 1,
        paymentStatusState: 'PENDING',
      });
      await page.goto('/checkout');
      await page.getByLabel('收货地址').fill('深圳市支付查单恢复地址 7 号');
      await page.getByRole('button', { name: /提交订单并支付/ }).click();

      const dialog = page.getByRole('dialog', { name: '微信支付' });
      await expect(dialog.locator('canvas')).toBeVisible();
      await dialog.getByRole('button', { name: '我已完成支付，查询结果' }).click();

      await expect(dialog.getByText('模拟微信查单瞬时失败')).toBeVisible();
      await expect(dialog.locator('canvas')).toBeVisible();
      await expect(dialog.getByRole('button', { name: '重新发起微信支付' })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: '我已完成支付，查询结果' })).toBeEnabled();

      await dialog.getByRole('button', { name: '我已完成支付，查询结果' }).click();
      await expect.poll(state.getPaymentStatusRequests).toBe(2);
      await expect(dialog.getByText('模拟微信查单瞬时失败')).toHaveCount(0);
      await expect(dialog.locator('canvas')).toBeVisible();
    });
  }

  test('切换订单后旧支付响应不会覆盖当前订单二维码', async ({ page }) => {
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data, message: 'ok' }),
      });
      if (path.endsWith('/settings/public')) return respond({ siteName: '海川珠宝' });
      if (path.endsWith('/settings/flags')) {
        return respond({ commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
      }
      if (path === '/api/customers/me/orders' && method === 'GET') {
        return respond([9, 10].map((id) => ({
          id,
          orderNo: `ORD-PAY-RACE-${id}`,
          orderType: 'SPOT',
          finalAmount: id * 100,
          status: 'PENDING_PAYMENT',
          paymentMethod: 'wechat',
          createdAt: '2026-09-21T08:00:00.000Z',
          items: [{ id: id * 10, productId: id, product: { name: `支付竞态作品 ${id}` } }],
          payments: [],
          fulfillments: [],
          refunds: [],
          afterSalesCases: [],
          timeline: [],
        })));
      }
      if (path === '/api/customers/me/orders/9/payment' && method === 'POST') {
        markFirstStarted();
        await firstGate;
        // 故意返回缺失二维码的旧响应；如果污染新订单会显示错误。
        return respond({
          provider: 'wechat',
          scene: 'native',
          payment: { id: 90, paymentNo: 'PAY-RACE-9', amount: 900, type: 'FULL' },
        });
      }
      if (path === '/api/customers/me/orders/10/payment' && method === 'POST') {
        return respond({
          provider: 'wechat',
          scene: 'native',
          qrCode: 'weixin://wxpay/bizpayurl/up?pr=order-10',
          payment: { id: 100, paymentNo: 'PAY-RACE-10', amount: 1000, type: 'FULL' },
        });
      }
      if (/\/api\/customers\/me\/orders\/(9|10)\/payment$/.test(path) && method === 'GET') {
        return respond({ state: 'PENDING', gatewayState: 'NOTPAY' });
      }
      if (path === '/api/customers/me/notifications') {
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === '/api/customers/me/inquiries') {
        return respond({ list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (
        path === '/api/customers/me/addresses' ||
        path === '/api/customers/me/selection-inquiries' ||
        path === '/api/customers/me/favorites' ||
        path === '/api/recommendations/for-you'
      ) return respond([]);
      if (path === '/api/partners/me') return respond(null);
      return respond([]);
    });
    await installCustomerSession(page, { name: '支付竞态客户' });
    await page.goto('/customer');

    const payButtons = page.getByRole('button', { name: '继续微信支付' });
    await payButtons.nth(0).click();
    await firstStarted;
    await page.getByRole('button', { name: 'Close' }).click();
    await payButtons.nth(1).click();

    const dialog = page.getByRole('dialog', { name: '微信支付' });
    await expect(dialog.getByText('ORD-PAY-RACE-10')).toBeVisible();
    await expect(dialog.locator('canvas')).toBeVisible();
    releaseFirst();
    await expect(dialog.getByText('ORD-PAY-RACE-10')).toBeVisible();
    await expect(dialog.getByText(/二维码内容缺失/)).toHaveCount(0);
    await expect(dialog.locator('canvas')).toBeVisible();
  });
});

async function mockCustomerTradeTimeline(
  page: Page,
  options: { withTracking?: boolean; trackingFailures?: number } = {},
) {
  let trackingAttempts = 0;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = (value: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: value }),
    });
    if (path.endsWith('/settings/public')) return data({ siteName: '海川珠宝' });
    if (path.endsWith('/settings/flags')) {
      return data({ commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
    }
    if (path.endsWith('/customers/me')) {
      return data({ id: 7, name: '测试客户', phone: '13800000000' });
    }
    if (path.endsWith('/customers/me/orders/9/tracking')) {
      trackingAttempts += 1;
      if (trackingAttempts <= (options.trackingFailures ?? 0)) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: '物流服务暂不可用' }),
        });
      }
      return data({
        carrier: '顺丰速运',
        trackingNo: 'SF1234567890',
        state: '3',
        events: [{ time: '2026-08-26 10:30', context: '珠宝作品已签收' }],
      });
    }
    if (path.endsWith('/customers/me/orders')) {
      return data([{
        id: 9,
        orderNo: 'ORD-TIMELINE-9',
        finalAmount: 8800,
        status: 'PENDING_SHIP',
        createdAt: '2026-08-25T08:00:00.000Z',
        paymentConfirmedAt: '2026-08-25T08:10:00.000Z',
        ...(options.withTracking
          ? { logisticsCompany: '顺丰速运', logisticsNo: 'SF1234567890' }
          : {}),
        items: [{ id: 11, productId: 1, product: { name: '时间线测试戒指' } }],
        payments: [{ id: 1, status: 'PARTIAL_REFUND', method: 'wechat' }],
        fulfillments: [{ id: 2, status: 'PENDING_PICK' }],
        afterSalesCases: [{
          id: 3,
          caseNo: 'AS-TIMELINE-3',
          orderItemId: 11,
          type: 'REFUND',
          status: 'APPROVED',
          reason: '测试售后',
          createdAt: '2026-08-25T09:00:00.000Z',
          updatedAt: '2026-08-25T09:10:00.000Z',
        }],
        refunds: [{
          id: 4,
          refundNo: 'RFD-TIMELINE-4',
          amount: 88,
          status: 'PROCESSING',
          createdAt: '2026-08-25T09:20:00.000Z',
        }],
        timeline: [{
          id: 5,
          eventType: 'REFUND_PROCESSING',
          entityType: 'REFUND',
          fromStatus: 'APPROVED',
          toStatus: 'PROCESSING',
          createdAt: '2026-08-25T09:30:00.000Z',
        }],
      }]);
    }
    if (
      path.endsWith('/customers/me/addresses') ||
      path.endsWith('/customers/me/selection-inquiries') ||
      path.endsWith('/customers/me/inquiries') ||
      path.endsWith('/customers/me/favorites')
    ) return data([]);
    if (path.endsWith('/partners/me')) return data(null);
    return data(null);
  });
}

test.describe('客户中心展示真实履约、售后与退款状态', () => {
  for (const viewport of [
    { name: '桌面', width: 1280, height: 900 },
    { name: '手机', width: 390, height: 844 },
  ]) {
    test(`${viewport.name}订单卡展示服务状态与可展开时间线`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockCustomerTradeTimeline(page);
      await page.goto('/customer');

      await expect(page.getByText('履约 · 待拣货')).toBeVisible();
      await expect(page.getByText('售后 · 时间线测试戒指 · 退款 · 已通过')).toBeVisible();
      await expect(page.getByText('退款 ¥88 · 原路退款处理中')).toBeVisible();
      await page.getByText('查看处理记录').click();
      await expect(page.getByText('原路退款处理中').last()).toBeVisible();
    });
  }

  test('订单物流轨迹可展开、展示渠道事实并收起', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockCustomerTradeTimeline(page, { withTracking: true });
    await page.goto('/customer');

    await page.getByRole('button', { name: '查看轨迹' }).click();
    await expect(page.getByText('已签收 · 顺丰速运')).toBeVisible();
    await expect(page.getByText('珠宝作品已签收')).toBeVisible();
    await page.getByRole('button', { name: '收起轨迹' }).click();
    await expect(page.getByText('珠宝作品已签收')).toHaveCount(0);
  });

  for (const viewport of [
    { name: '桌面', width: 1280, height: 900 },
    { name: '390px 手机', width: 390, height: 844 },
  ]) {
    test(`${viewport.name}物流失败与空结果分离并可原位重试`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockCustomerTradeTimeline(page, {
        withTracking: true,
        trackingFailures: 1,
      });
      await page.goto('/customer');

      await page.getByRole('button', { name: '查看轨迹' }).click();
      await expect(page.getByRole('alert').filter({
        hasText: '物流信息暂时无法查询，请稍后重试。',
      })).toBeVisible();
      await expect(
        page.getByText('暂无轨迹数据（物流查询服务可能未接入，请联系顾问）'),
      ).toHaveCount(0);
      await page.getByRole('button', { name: '重新查询物流' }).click();
      await expect(page.getByText('珠宝作品已签收')).toBeVisible();
    });
  }

  test('快速切换订单时迟到的物流响应不会覆盖当前订单', async ({ page }) => {
    let releaseFirstTracking!: () => void;
    let firstTrackingCompleted = false;
    const firstTrackingGate = new Promise<void>((resolve) => {
      releaseFirstTracking = resolve;
    });
    await installCustomerSession(page, { id: 7, name: '物流竞态客户' });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data }),
      });
      if (path.endsWith('/settings/public')) return respond({ siteName: '海川珠宝' });
      if (path.endsWith('/settings/flags')) {
        return respond({ commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path.endsWith('/customers/me')) {
        return respond({ id: 7, name: '物流竞态客户', phone: '13800000000' });
      }
      if (path.endsWith('/customers/me/orders')) {
        return respond([9, 10].map((id) => ({
          id,
          orderNo: `ORD-TRACK-${id}`,
          finalAmount: 8800,
          status: 'SHIPPED',
          createdAt: '2026-08-25T08:00:00.000Z',
          logisticsCompany: '顺丰速运',
          logisticsNo: `SF${id}`,
          items: [{ id: id * 10, productId: id, product: { name: `测试作品 ${id}` } }],
        })));
      }
      if (path.endsWith('/customers/me/orders/9/tracking')) {
        await firstTrackingGate;
        firstTrackingCompleted = true;
        return respond({ carrier: '顺丰速运', trackingNo: 'SF9', state: '2', events: [{ time: '09:00', context: '订单九轨迹' }] });
      }
      if (path.endsWith('/customers/me/orders/10/tracking')) {
        return respond({ carrier: '顺丰速运', trackingNo: 'SF10', state: '3', events: [{ time: '10:00', context: '订单十轨迹' }] });
      }
      if (
        path.endsWith('/customers/me/addresses') ||
        path.endsWith('/customers/me/selection-inquiries') ||
        path.endsWith('/customers/me/inquiries') ||
        path.endsWith('/customers/me/favorites')
      ) return respond([]);
      if (path.endsWith('/customers/me/notifications')) {
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path.endsWith('/partner-applications/me')) return respond(null);
      return respond(null);
    });

    await page.goto('/customer');
    const trackingButtons = page.getByRole('button', { name: '查看轨迹' });
    await trackingButtons.nth(0).click();
    await trackingButtons.nth(0).click();
    await expect(page.getByText('订单十轨迹')).toBeVisible();

    releaseFirstTracking();
    await expect.poll(() => firstTrackingCompleted).toBe(true);
    await expect(page.getByText('订单十轨迹')).toBeVisible();
    await expect(page.getByText('订单九轨迹')).toHaveCount(0);
  });
});

async function mockCustomerOrderRecovery(page: Page) {
  const recoveryOrders = [
    {
      id: 15,
      orderNo: 'ORD-RECOVERY-PROCESSING',
      productName: '渠道处理中戒指',
      refunds: [{
        id: 151,
        refundNo: 'RFD-RECOVERY-PROCESSING',
        amount: 520,
        status: 'PROCESSING',
        createdAt: '2026-09-22T10:00:00.000Z',
      }],
      afterSalesCases: [],
    },
    {
      id: 14,
      orderNo: 'ORD-RECOVERY-FAILED',
      productName: '退款待核对项链',
      refunds: [{
        id: 141,
        refundNo: 'RFD-RECOVERY-FAILED',
        amount: 430,
        status: 'FAILED',
        createdAt: '2026-09-22T09:00:00.000Z',
      }],
      afterSalesCases: [],
    },
    {
      id: 13,
      orderNo: 'ORD-RECOVERY-QC-FAILED',
      productName: '质检待沟通耳饰',
      refunds: [],
      afterSalesCases: [{
        id: 131,
        caseNo: 'AS-RECOVERY-QC-FAILED',
        orderItemId: 130,
        type: 'REPAIR',
        status: 'QC_FAILED',
        reason: '连接处需要检查',
        createdAt: '2026-09-22T08:00:00.000Z',
        updatedAt: '2026-09-22T08:30:00.000Z',
      }],
    },
    {
      id: 12,
      orderNo: 'ORD-RECOVERY-RECENT',
      productName: '近期订单手镯',
      refunds: [],
      afterSalesCases: [],
    },
    {
      id: 11,
      orderNo: 'ORD-RECOVERY-OLDER',
      productName: '较早恢复订单胸针',
      refunds: [],
      afterSalesCases: [],
    },
  ].map((order, index) => ({
    id: order.id,
    orderNo: order.orderNo,
    orderType: 'SPOT',
    finalAmount: 6800 - index * 100,
    status: 'SHIPPED',
    createdAt: `2026-09-${22 - index}T08:00:00.000Z`,
    paymentConfirmedAt: `2026-09-${22 - index}T08:10:00.000Z`,
    shippedAt: `2026-09-${22 - index}T09:00:00.000Z`,
    items: [{
      id: order.id * 10,
      productId: order.id,
      product: { name: order.productName },
    }],
    payments: [{ id: order.id * 100, status: 'PAID', method: 'wechat' }],
    fulfillments: [],
    refunds: order.refunds,
    afterSalesCases: order.afterSalesCases,
    timeline: [],
  }));

  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data }),
    });
    if (path.endsWith('/settings/public')) return respond({ siteName: '海川珠宝' });
    if (path.endsWith('/settings/flags')) {
      return respond({ commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
    }
    if (path === '/api/customers/me') {
      return respond({ id: 27, name: '订单恢复验收客户', phone: '13800000027' });
    }
    if (path === '/api/customers/me/orders') return respond(recoveryOrders);
    if (path === '/api/customers/me/notifications') {
      return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
    }
    if (path === '/api/customers/me/inquiries') {
      return respond({ list: [], total: 0, page: 1, pageSize: 3 });
    }
    if (
      path === '/api/customers/me/addresses' ||
      path === '/api/customers/me/selection-inquiries' ||
      path === '/api/customers/me/favorites' ||
      path === '/api/customers/me/cooperation-design-files' ||
      path === '/api/recommendations/for-you'
    ) return respond([]);
    if (path === '/api/partners/me') return respond(null);
    return respond([]);
  });
}

test.describe('客户订单恢复状态与完整订单入口（确定性 UI）', () => {
  for (const viewport of [
    { name: '桌面', width: 1280, height: 900 },
    { name: '390px 手机', width: 390, height: 844 },
  ]) {
    test(`${viewport.name}默认折叠较早订单并可用键盘展开恢复状态`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installCustomerSession(page, { id: 27, name: '订单恢复验收客户' });
      await mockCustomerOrderRecovery(page);
      await page.goto('/customer');

      await expect(page.getByText('较早恢复订单胸针', { exact: true })).toHaveCount(0);
      await expect(page.getByText(/当前责任：支付渠道与海川财务.*系统会继续查询渠道结果/)).toBeVisible();
      await expect(page.getByText(/当前责任：海川财务.*按原退款单核对渠道或重新建单/)).toBeVisible();
      await expect(page.getByText(/当前责任：海川售后.*核对质检差异/)).toBeVisible();

      const expand = page.getByRole('button', { name: '查看全部 5 笔订单' });
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      await expand.focus();
      await expect(expand).toBeFocused();
      await expand.press('Enter');

      await expect(page.getByText('较早恢复订单胸针', { exact: true })).toBeVisible();
      const collapse = page.getByRole('button', { name: '收起较早订单' });
      await expect(collapse).toHaveAttribute('aria-expanded', 'true');
      await expect(collapse).toBeFocused();
      const overflowElements = await page.locator('#my-orders').evaluate((root) => {
        const viewportWidth = document.documentElement.clientWidth;
        return [root, ...root.querySelectorAll('*')]
          .map((element) => ({
            element,
            rect: element.getBoundingClientRect(),
          }))
          .filter(({ rect }) => rect.right > viewportWidth + 1)
          .slice(0, 10)
          .map(({ element, rect }) => ({
            tag: element.tagName,
            className: element.getAttribute('class') || '',
            text: (element.textContent || '').trim().slice(0, 80),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          }));
      });
      expect(overflowElements).toEqual([]);

      await collapse.press('Space');
      await expect(page.getByText('较早恢复订单胸针', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '查看全部 5 笔订单' }))
        .toHaveAttribute('aria-expanded', 'false');
    });
  }
});

async function mockCustomerReview(
  page: Page,
  options: {
    firstReviewFails?: boolean;
    firstReviewCommitsButFails?: boolean;
    recoveryReadFails?: boolean;
    firstUploadCommitsButFails?: boolean;
    uploadRecoveryReadFails?: boolean;
    recoveryFingerprintMismatch?: boolean;
  } = {},
) {
  let reviewAttempts = 0;
  let uploadAttempts = 0;
  let uploadStored = false;
  let lastReviewBody: Record<string, unknown> | null = null;
  let storedReview: Record<string, unknown> | null = null;
  const uploadedImage = 'review-image:v1:18:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const data = (value: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: value }),
    });

    if (path.endsWith('/settings/public')) return data({ siteName: '海川珠宝' });
    if (path.endsWith('/settings/flags')) {
      return data({ commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
    }
    if (path.endsWith('/customers/me')) {
      return data({ id: 18, name: '评价测试客户', phone: '13800000000' });
    }
    if (path.endsWith('/customers/me/orders')) {
      return data([{
        id: 14,
        orderNo: 'ORD-REVIEW-14',
        finalAmount: 16800,
        status: 'COMPLETED',
        createdAt: '2026-08-24T08:00:00.000Z',
        paymentConfirmedAt: '2026-08-24T08:10:00.000Z',
        shippedAt: '2026-08-24T09:00:00.000Z',
        completedAt: '2026-08-25T10:00:00.000Z',
        items: [{ id: 41, productId: 77, product: { name: '评价测试吊坠' } }],
        payments: [{ id: 31, status: 'SUCCESS', method: 'wechat' }],
        fulfillments: [{ id: 32, status: 'DELIVERED' }],
      }]);
    }
    if (path.endsWith('/reviews/media') && request.method() === 'POST') {
      uploadAttempts += 1;
      expect(request.headers()['idempotency-key']).toMatch(/^review-image:[a-f0-9]{64}$/);
      expect(request.headers()['x-session-domain']).toBe('customer');
      uploadStored = true;
      if (options.firstUploadCommitsButFails && uploadAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: '模拟晒单图上传响应丢失' }),
        });
      }
      return data({ reference: uploadedImage });
    }
    if (path.endsWith('/reviews/media/status') && request.method() === 'GET') {
      if (options.uploadRecoveryReadFails) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: '模拟晒单图状态读取失败' }),
        });
      }
      return data(uploadStored
        ? { status: 'AVAILABLE', reference: uploadedImage }
        : { status: 'MISSING' });
    }
    if (path.endsWith('/reviews') && request.method() === 'POST') {
      reviewAttempts += 1;
      lastReviewBody = request.postDataJSON() as Record<string, unknown>;
      const review = {
        id: 91,
        ...(lastReviewBody ?? {}),
        images: ((lastReviewBody?.imageUrls as string[] | undefined) ?? [])
          .map((_, index) => `/reviews/me/91/media/${index}`),
        submissionFingerprint: options.recoveryFingerprintMismatch
          ? `review-submission:v1:${'f'.repeat(64)}`
          : reviewSubmissionFingerprint(lastReviewBody ?? {}),
        status: 'PENDING',
      };
      delete review.imageUrls;
      if (options.firstReviewCommitsButFails && reviewAttempts === 1) {
        storedReview = review;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: '模拟评价提交响应丢失' }),
        });
      }
      if (options.firstReviewFails && reviewAttempts === 1) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: '评价提交冲突，请重试' }),
        });
      }
      storedReview = review;
      return data({ id: 91, status: 'PENDING' });
    }
    if (path.endsWith('/reviews/me') && request.method() === 'GET') {
      if (options.recoveryReadFails) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: '模拟本人评价读取失败' }),
        });
      }
      return data(storedReview ? [storedReview] : []);
    }
    if (
      path.endsWith('/customers/me/addresses') ||
      path.endsWith('/customers/me/selection-inquiries') ||
      path.endsWith('/customers/me/inquiries') ||
      path.endsWith('/customers/me/favorites')
    ) return data([]);
    if (path.endsWith('/partners/me')) return data(null);
    return data(null);
  });

  return {
    uploadedImage,
    getUploadAttempts: () => uploadAttempts,
    getReviewAttempts: () => reviewAttempts,
    getLastReviewBody: () => lastReviewBody,
  };
}

test.describe('客户完成订单评价（先审后展）', () => {
  test('校验评价内容、上传晒单图并提交审核', async ({ page }) => {
    const mock = await mockCustomerReview(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/customer');

    await page.getByRole('button', { name: '评价作品' }).click();
    const dialog = page.getByRole('dialog', { name: '评价作品' });
    await dialog.getByRole('button', { name: '提交评价' }).click();
    await expect(page.getByText('评价内容至少 5 个字')).toBeVisible();

    await dialog
      .getByPlaceholder('工艺、佩戴感受、顾问服务体验…')
      .fill('吊坠工艺细致，佩戴舒适自然');
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'review.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await expect(dialog.getByAltText('晒单图')).toBeVisible();
    await dialog.getByRole('button', { name: '提交评价' }).click();

    await expect(page.getByText('评价已提交，审核通过后将在作品页展示')).toBeVisible();
    expect(mock.getReviewAttempts()).toBe(1);
    expect(mock.getLastReviewBody()).toEqual({
      orderId: 14,
      productId: 77,
      rating: 5,
      content: '吊坠工艺细致，佩戴舒适自然',
      imageUrls: [mock.uploadedImage],
    });
  });

  test('提交冲突保留输入并允许客户重试', async ({ page }) => {
    const mock = await mockCustomerReview(page, { firstReviewFails: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/customer');

    await page.getByRole('button', { name: '评价作品' }).click();
    const dialog = page.getByRole('dialog', { name: '评价作品' });
    const content = dialog.getByPlaceholder('工艺、佩戴感受、顾问服务体验…');
    await content.fill('手机端评价提交失败后继续重试');
    await dialog.getByRole('button', { name: '提交评价' }).click();
    await expect(page.getByText('评价提交冲突，请重试')).toBeVisible();
    await expect(content).toHaveValue('手机端评价提交失败后继续重试');
    await dialog.getByRole('button', { name: '提交评价' }).click();

    await expect(page.getByText('评价已提交，审核通过后将在作品页展示')).toBeVisible();
    expect(mock.getReviewAttempts()).toBe(2);
  });

  test('晒单图已写入但响应丢失时只读核验且不重复上传', async ({ page }) => {
    const mock = await mockCustomerReview(page, { firstUploadCommitsButFails: true });
    await page.goto('/customer');
    await page.getByRole('button', { name: '评价作品' }).click();
    const dialog = page.getByRole('dialog', { name: '评价作品' });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'review.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });

    await expect(dialog.getByAltText('晒单图')).toBeVisible();
    expect(mock.getUploadAttempts()).toBe(1);
  });

  test('评价已提交但响应丢失时只读核验成功且不重复 POST', async ({ page }) => {
    const mock = await mockCustomerReview(page, { firstReviewCommitsButFails: true });
    await page.goto('/customer');
    await page.getByRole('button', { name: '评价作品' }).click();
    const dialog = page.getByRole('dialog', { name: '评价作品' });
    await dialog
      .getByPlaceholder('工艺、佩戴感受、顾问服务体验…')
      .fill('响应丢失后由本人评价列表确认成功');
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'review.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await expect(dialog.getByAltText('晒单图')).toBeVisible();
    await dialog.getByRole('button', { name: '提交评价' }).click();

    await expect(page.getByText('评价已提交并完成权威核验')).toBeVisible();
    expect(mock.getReviewAttempts()).toBe(1);
  });

  test('本人列表摘要与本次意图不同时不误报精确核验成功', async ({ page }) => {
    const mock = await mockCustomerReview(page, {
      firstReviewCommitsButFails: true,
      recoveryFingerprintMismatch: true,
    });
    await page.goto('/customer');
    await page.getByRole('button', { name: '评价作品' }).click();
    const dialog = page.getByRole('dialog', { name: '评价作品' });
    await dialog
      .getByPlaceholder('工艺、佩戴感受、顾问服务体验…')
      .fill('摘要不一致时只能刷新权威评价状态');
    await dialog.getByRole('button', { name: '提交评价' }).click();

    await expect(page.getByText('该订单中的作品已有评价，已刷新权威状态。')).toBeVisible();
    await expect(page.getByText('评价已提交并完成权威核验')).toHaveCount(0);
    expect(mock.getReviewAttempts()).toBe(1);
  });

  test('评价响应和本人列表均不可用时保留输入且不自动重复 POST', async ({ page }) => {
    const mock = await mockCustomerReview(page, {
      firstReviewCommitsButFails: true,
      recoveryReadFails: true,
    });
    await page.goto('/customer');
    await page.getByRole('button', { name: '评价作品' }).click();
    const dialog = page.getByRole('dialog', { name: '评价作品' });
    const content = dialog.getByPlaceholder('工艺、佩戴感受、顾问服务体验…');
    await content.fill('评价结果待确认时仍保留这段输入');
    await dialog.getByRole('button', { name: '提交评价' }).click();

    await expect(page.getByText(/评价提交结果待确认/)).toBeVisible();
    await expect(content).toHaveValue('评价结果待确认时仍保留这段输入');
    expect(mock.getReviewAttempts()).toBe(1);
  });
});

async function mockCustomerAfterSales(
  page: Page,
  options: {
    firstCreateFails?: boolean;
    firstCreateCommitsButFails?: boolean;
    firstCancelFailsBeforeCommit?: boolean;
    firstCancelCommitsButFails?: boolean;
    cancelRecoveryReadFails?: boolean;
  } = {},
) {
  let createAttempts = 0;
  let logicalCreateWrites = 0;
  let cancelAttempts = 0;
  let orderDetailReads = 0;
  let lastCreateBody: Record<string, unknown> | null = null;
  let cases: Array<Record<string, unknown>> = [];
  const createKeys: string[] = [];
  const createdByKey = new Map<string, Record<string, unknown>>();
  let markFirstCreateStarted!: () => void;
  let releaseFirstCreate!: () => void;
  const firstCreateStarted = new Promise<void>((resolve) => {
    markFirstCreateStarted = resolve;
  });
  const firstCreateRelease = new Promise<void>((resolve) => {
    releaseFirstCreate = resolve;
  });
  const customerOrder = () => ({
    id: 9,
    orderNo: 'ORD-AFTER-SALES-9',
    orderType: 'SPOT',
    finalAmount: 12800,
    status: 'SHIPPED',
    createdAt: '2026-08-26T08:00:00.000Z',
    paymentConfirmedAt: '2026-08-26T08:10:00.000Z',
    shippedAt: '2026-08-26T09:00:00.000Z',
    items: [
      { id: 21, productId: 1, product: { name: '售后测试戒指' } },
      { id: 22, productId: 2, product: { name: '售后测试项链' } },
    ],
    payments: [{ id: 1, status: 'PAID', method: 'wechat' }],
    fulfillments: [{ id: 2, status: 'SHIPPED' }],
    refunds: [],
    afterSalesCases: cases,
    timeline: [],
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const data = (value: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: value }),
    });

    if (path.endsWith('/settings/public')) return data({ siteName: '海川珠宝' });
    if (path.endsWith('/settings/flags')) {
      return data({ commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
    }
    if (path.endsWith('/customers/me') && method === 'GET') {
      return data({ id: 7, name: '售后测试客户', phone: '13800000000' });
    }
    if (path.endsWith('/customers/me/orders') && method === 'GET') {
      return data([customerOrder()]);
    }
    if (path.endsWith('/customers/me/orders/9') && method === 'GET') {
      orderDetailReads += 1;
      if (options.cancelRecoveryReadFails) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '权威订单暂不可读' }),
        });
      }
      return data(customerOrder());
    }
    if (path.endsWith('/customers/me/orders/9/after-sales') && method === 'POST') {
      createAttempts += 1;
      const idempotencyKey = request.headers()['idempotency-key'] ?? '';
      createKeys.push(idempotencyKey);
      if (!idempotencyKey) {
        return route.fulfill({
          status: 428,
          contentType: 'application/json',
          body: JSON.stringify({ code: 428, message: '缺少 Idempotency-Key 请求头' }),
        });
      }
      lastCreateBody = request.postDataJSON() as Record<string, unknown>;
      if (options.firstCreateFails && createAttempts === 1) {
        markFirstCreateStarted();
        await firstCreateRelease;
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 409,
            message: '该商品已有进行中的售后申请',
          }),
        });
      }
      const replayed = createdByKey.get(idempotencyKey);
      if (replayed) return data(replayed);
      const created = {
        id: 31,
        caseNo: 'AS-CUSTOMER-31',
        orderItemId: lastCreateBody.orderItemId,
        type: lastCreateBody.type,
        status: 'REQUESTED',
        reason: lastCreateBody.reason,
        requestedRefundAmount: null,
        approvedRefundAmount: null,
        createdAt: '2026-08-26T10:00:00.000Z',
        updatedAt: '2026-08-26T10:00:00.000Z',
      };
      logicalCreateWrites += 1;
      createdByKey.set(idempotencyKey, created);
      cases = [created];
      if (options.firstCreateCommitsButFails && createAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '响应在提交后丢失' }),
        });
      }
      return data(created);
    }
    if (path.endsWith('/customers/me/after-sales/31/cancel') && method === 'POST') {
      cancelAttempts += 1;
      if (options.firstCancelFailsBeforeCommit && cancelAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '提交前暂时不可用' }),
        });
      }
      cases = cases.map((record) => ({ ...record, status: 'CANCELLED' }));
      if (options.firstCancelCommitsButFails && cancelAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '响应在提交后丢失' }),
        });
      }
      return data(cases[0]);
    }
    if (
      path.endsWith('/customers/me/addresses') ||
      path.endsWith('/customers/me/selection-inquiries') ||
      path.endsWith('/customers/me/inquiries') ||
      path.endsWith('/customers/me/favorites')
    ) return data([]);
    if (path.endsWith('/partners/me')) return data(null);
    return data(null);
  });

  return {
    waitForFirstCreate: () => firstCreateStarted,
    releaseFirstCreate,
    getCreateAttempts: () => createAttempts,
    getCreateKeys: () => createKeys,
    getLogicalCreateWrites: () => logicalCreateWrites,
    getCancelAttempts: () => cancelAttempts,
    getOrderDetailReads: () => orderDetailReads,
    getLastCreateBody: () => lastCreateBody,
  };
}

test.describe('客户自助售后方案 A（确定性 UI 与失败态）', () => {
  test('桌面端按订单商品提交售后并可撤销待受理申请', async ({ page }) => {
    const mock = await mockCustomerAfterSales(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/customer');

    await page.getByRole('button', { name: '申请售后' }).click();
    const dialog = page.getByRole('dialog', { name: '申请售后' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('退款金额将在售后审核时')).toBeVisible();
    await expect(dialog.getByLabel('退款金额')).toHaveCount(0);
    await expect(dialog.getByText('上传证据')).toHaveCount(0);

    await dialog
      .locator('.ant-form-item')
      .filter({ hasText: '售后类型' })
      .locator('.ant-select-selector')
      .click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .filter({ hasText: '申请维修' })
      .click();
    await dialog.getByLabel('申请原因').fill('佩戴后需要检查并维修连接处');
    await dialog.getByRole('button', { name: '提交申请' }).click();

    await expect(page.getByText('售后申请已提交，我们会尽快处理')).toBeVisible();
    await expect(page.getByText('售后 · 售后测试戒指 · 维修 · 待受理')).toBeVisible();
    expect(mock.getLastCreateBody()).toEqual({
      orderItemId: 21,
      type: 'REPAIR',
      reason: '佩戴后需要检查并维修连接处',
    });

    await page.getByRole('button', { name: '撤销申请' }).click();
    const confirm = page.getByRole('dialog', { name: '撤销售后申请？' });
    await confirm.getByRole('button', { name: '确认撤销' }).click();
    await expect(page.getByText('售后申请已撤销')).toBeVisible();
    await expect(page.getByText('售后 · 售后测试戒指 · 维修 · 已取消')).toBeVisible();
    await expect(page.getByRole('button', { name: '申请售后' })).toBeVisible();
  });

  test('撤销已提交但响应丢失时以权威订单收敛且不重复撤销', async ({ page }) => {
    const mock = await mockCustomerAfterSales(page, {
      firstCancelCommitsButFails: true,
    });
    await page.goto('/customer');

    await page.getByRole('button', { name: '申请售后' }).click();
    const requestDialog = page.getByRole('dialog', { name: '申请售后' });
    await requestDialog.getByLabel('申请原因').fill('需要撤销恢复验证');
    await requestDialog.getByRole('button', { name: '提交申请' }).click();
    await expect(page.getByText('售后申请已提交，我们会尽快处理')).toBeVisible();

    await page.getByRole('button', { name: '撤销申请' }).click();
    const confirm = page.getByRole('dialog', { name: '撤销售后申请？' });
    await confirm.getByRole('button', { name: '确认撤销' }).click();

    await expect(page.getByText('售后申请已撤销并完成权威核验')).toBeVisible();
    await expect(page.getByText('售后 · 售后测试戒指 · 退款 · 已取消')).toBeVisible();
    expect(mock.getCancelAttempts()).toBe(1);
    expect(mock.getOrderDetailReads()).toBe(1);
  });

  test('撤销 5xx 后权威状态仍待受理时保留安全重试', async ({ page }) => {
    const mock = await mockCustomerAfterSales(page, {
      firstCancelFailsBeforeCommit: true,
    });
    await page.goto('/customer');

    await page.getByRole('button', { name: '申请售后' }).click();
    const requestDialog = page.getByRole('dialog', { name: '申请售后' });
    await requestDialog.getByLabel('申请原因').fill('需要验证安全重试');
    await requestDialog.getByRole('button', { name: '提交申请' }).click();
    await expect(page.getByText('售后申请已提交，我们会尽快处理')).toBeVisible();

    await page.getByRole('button', { name: '撤销申请' }).click();
    const confirm = page.getByRole('dialog', { name: '撤销售后申请？' });
    await confirm.getByRole('button', { name: '确认撤销' }).click();
    await expect(page.getByText('撤销结果未确认，已刷新权威状态，可以安全重试。')).toBeVisible();
    await expect(confirm).toBeHidden();
    expect(mock.getCancelAttempts()).toBe(1);
    expect(mock.getOrderDetailReads()).toBe(1);

    await page.getByRole('button', { name: '撤销申请' }).click();
    await page
      .getByRole('dialog', { name: '撤销售后申请？' })
      .getByRole('button', { name: '确认撤销' })
      .click();
    await expect(page.getByText('售后申请已撤销')).toBeVisible();
    await expect(page.getByText('售后 · 售后测试戒指 · 退款 · 已取消')).toBeVisible();
    expect(mock.getCancelAttempts()).toBe(2);
  });

  test('撤销结果与权威订单都不可读时不猜测成功并保留安全重试', async ({ page }) => {
    const mock = await mockCustomerAfterSales(page, {
      firstCancelFailsBeforeCommit: true,
      cancelRecoveryReadFails: true,
    });
    await page.goto('/customer');

    await page.getByRole('button', { name: '申请售后' }).click();
    const requestDialog = page.getByRole('dialog', { name: '申请售后' });
    await requestDialog.getByLabel('申请原因').fill('需要验证权威读取失败');
    await requestDialog.getByRole('button', { name: '提交申请' }).click();
    await expect(page.getByText('售后申请已提交，我们会尽快处理')).toBeVisible();

    await page.getByRole('button', { name: '撤销申请' }).click();
    await page
      .getByRole('dialog', { name: '撤销售后申请？' })
      .getByRole('button', { name: '确认撤销' })
      .click();

    await expect(page.getByText('撤销结果待确认，暂未读取到权威状态，可以安全重试。')).toBeVisible();
    await expect(page.getByText('售后申请已撤销')).toHaveCount(0);
    await expect(page.getByText('售后 · 售后测试戒指 · 退款 · 待受理')).toBeVisible();
    await expect(page.getByRole('button', { name: '撤销申请' })).toBeVisible();
    expect(mock.getCancelAttempts()).toBe(1);
    expect(mock.getOrderDetailReads()).toBe(1);
  });

  test('手机端展示提交中、服务端错误和可重试成功状态', async ({ page }) => {
    const mock = await mockCustomerAfterSales(page, { firstCreateFails: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/customer');

    await page.getByRole('button', { name: '申请售后' }).click();
    const dialog = page.getByRole('dialog', { name: '申请售后' });
    await dialog.getByLabel('申请原因').fill('希望申请退款并由客服核对');
    await dialog.getByRole('button', { name: '提交申请' }).click();
    await mock.waitForFirstCreate();
    await expect(dialog.getByRole('button', { name: '提交申请' })).toBeDisabled();
    mock.releaseFirstCreate();

    await expect(dialog.getByText('该商品已有进行中的售后申请')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '提交申请' })).toBeEnabled();
    await dialog.getByRole('button', { name: '提交申请' }).click();

    await expect(page.getByText('售后申请已提交，我们会尽快处理')).toBeVisible();
    expect(mock.getCreateAttempts()).toBe(2);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('售后申请已落库但响应丢失时原样重试复用同一幂等键且只写一次', async ({ page }) => {
    const mock = await mockCustomerAfterSales(page, {
      firstCreateCommitsButFails: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/customer');

    await page.getByRole('button', { name: '申请售后' }).click();
    const dialog = page.getByRole('dialog', { name: '申请售后' });
    await dialog.getByLabel('申请原因').fill('响应丢失后恢复同一售后申请');
    await dialog.getByRole('button', { name: '提交申请' }).click();

    await expect(dialog.getByText(
      '售后申请结果待确认；请保持当前内容不变并重试，系统会沿用同一凭据恢复结果。',
    )).toBeVisible();
    await expect(dialog.getByLabel('申请原因')).toHaveValue('响应丢失后恢复同一售后申请');
    await dialog.getByRole('button', { name: '提交申请' }).click();

    await expect(page.getByText('售后申请已提交，我们会尽快处理')).toBeVisible();
    expect(mock.getCreateAttempts()).toBe(2);
    expect(mock.getLogicalCreateWrites()).toBe(1);
    expect(mock.getCreateKeys()[0]).toMatch(/^after-sales-/);
    expect(mock.getCreateKeys()[1]).toBe(mock.getCreateKeys()[0]);
    await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage)
      .filter((key) => key.startsWith('hc:customer-after-sales-attempt:')).length)).toBe(0);
  });

  test('无法保存售后重试凭据时失败关闭且不发送申请', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (key.startsWith('hc:customer-after-sales-attempt:')) {
          throw new DOMException('storage disabled', 'SecurityError');
        }
        return originalSetItem.call(this, key, value);
      };
    });
    const mock = await mockCustomerAfterSales(page);
    await page.goto('/customer');

    await page.getByRole('button', { name: '申请售后' }).click();
    const dialog = page.getByRole('dialog', { name: '申请售后' });
    await dialog.getByLabel('申请原因').fill('验证安全凭据不可用');
    await dialog.getByRole('button', { name: '提交申请' }).click();

    await expect(dialog.getByText(
      '浏览器无法安全保存本次售后申请的重试凭据，系统未发送申请。请恢复会话存储后再试。',
    )).toBeVisible();
    expect(mock.getCreateAttempts()).toBe(0);
    await expect(dialog.getByRole('button', { name: '提交申请' })).toBeEnabled();
  });
});

test.describe('后台售后登记关联合同', () => {
  for (const viewport of [
    { name: '桌面端', width: 1440, height: 900 },
    { name: '手机端', width: 390, height: 844 },
  ]) {
    test(`${viewport.name}强制提交订单、客户与订单商品三元关联`, async ({ page }) => {
      let createBody: Record<string, unknown> | null = null;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await authenticateAdmin(page);
      await mockEmptyAdminApis(page);
      await page.route('**/api/after-sales-cases**', async (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
          createBody = request.postDataJSON() as Record<string, unknown>;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ code: 200, message: 'ok', data: { id: 51 } }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: 'ok',
            data: { list: [], total: 0, page: 1, pageSize: 20 },
          }),
        });
      });

      // 登记表单按订单搜索选择：搜索订单 → 自动带出客户 → 选择订单商品行，
      // 提交合同（orderId/customerId/orderItemId 三元关联）与手填时代保持一致。
      await page.route('**/api/orders**', async (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: 'ok',
            data: {
              list: [
                {
                  id: 101,
                  orderNo: 'HC20260903000101',
                  customerName: '测试客户',
                  customerPhone: '13800000000',
                  customerId: 7,
                  items: [
                    { id: 202, productNameSnapshot: '测试手镯', productCodeSnapshot: 'B-001' },
                  ],
                },
              ],
              total: 1,
              page: 1,
              pageSize: 10,
            },
          }),
        });
      });

      await page.goto('/admin/trade/after-sales');
      await page.getByRole('button', { name: '登记售后' }).click();
      const dialog = page.getByRole('dialog', { name: '登记售后工单' });
      await dialog.getByLabel('关联订单').fill('HC20260903000101');
      await page.locator('.ant-select-dropdown:visible').getByText('HC20260903000101').click();
      await dialog
        .locator('.ant-form-item')
        .filter({ hasText: '订单商品' })
        .locator('.ant-select-selector')
        .click();
      await page.locator('.ant-select-dropdown:visible').getByText('测试手镯 · B-001', { exact: true }).click();
      await dialog
        .locator('.ant-form-item')
        .filter({ hasText: '售后类型' })
        .locator('.ant-select-selector')
        .click();
      await page.locator('.ant-select-dropdown:visible').getByText('维修', { exact: true }).click();
      await dialog.getByLabel('售后原因').fill('连接处需要由售后检查');
      await dialog.getByRole('button', { name: '创建工单' }).click();

      await expect.poll(() => createBody).toEqual({
        orderId: 101,
        customerId: 7,
        orderItemId: 202,
        type: 'REPAIR',
        reason: '连接处需要由售后检查',
      });
      await expect(page.getByText('售后工单已创建')).toBeVisible();
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasHorizontalOverflow).toBe(false);
    });
  }
});

test.describe('客户自助取消未付款订单', () => {
  type CancelCase = {
    hasPendingProof?: boolean;
    bankTransfer?: boolean;
    cancelStatus?: number;
    cancelMessage?: string;
    firstCancelCommitsButFails?: boolean;
    firstCancelFailsBeforeCommit?: boolean;
    cancelRecoveryReadFails?: boolean;
  };

  async function mockCustomerCancelPage(page: Page, options: CancelCase = {}) {
    let orderStatus = 'PENDING_PAYMENT';
    let cancelCalled = 0;
    let orderDetailReads = 0;
    const proofUploadPaths: string[] = [];
    const proofIdempotencyKeys: Array<string | undefined> = [];
    const customerOrder = () => ({
      id: 9,
      orderNo: 'ORD-CANCEL-9',
      orderType: 'SPOT',
      finalAmount: 6600,
      status: orderStatus,
      paymentMethod: options.hasPendingProof || options.bankTransfer ? 'bank_transfer' : 'wechat',
      createdAt: '2026-09-02T08:00:00.000Z',
      items: [{ id: 21, productId: 1, product: { name: '取消测试手镯' } }],
      payments: options.hasPendingProof
        ? [{ id: 1, status: 'PENDING', method: 'bank_transfer', hasProof: true }]
        : [],
      fulfillments: [],
      refunds: [],
      afterSalesCases: [],
      timeline: [],
    });
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data, message: 'ok' }),
      });
      if (path === '/api/customers/me') {
        return respond({ id: 7, phone: '13800000007', name: '取消测试会员', email: null });
      }
      if (path === '/api/customers/me/orders' && method === 'GET') {
        return respond([customerOrder()]);
      }
      if (path === '/api/customers/me/orders/9' && method === 'GET') {
        orderDetailReads += 1;
        if (options.cancelRecoveryReadFails) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 503, message: '权威订单暂不可读' }),
          });
        }
        return respond(customerOrder());
      }
      if (path === '/api/customers/me/orders/9/cancel' && method === 'POST') {
        cancelCalled += 1;
        if (options.cancelStatus && options.cancelStatus !== 200) {
          return route.fulfill({
            status: options.cancelStatus,
            contentType: 'application/json',
            body: JSON.stringify({ code: options.cancelStatus, message: options.cancelMessage || '取消失败' }),
          });
        }
        if (options.firstCancelFailsBeforeCommit && cancelCalled === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 503, message: '提交前暂时不可用' }),
          });
        }
        orderStatus = 'CANCELLED';
        if (options.firstCancelCommitsButFails && cancelCalled === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 503, message: '响应在提交后丢失' }),
          });
        }
        return respond({ id: 9, orderNo: 'ORD-CANCEL-9', status: 'CANCELLED' });
      }
      if (path.startsWith('/api/upload/payment-proof') && method === 'POST') {
        proofUploadPaths.push(path);
        proofIdempotencyKeys.push(route.request().headers()['idempotency-key']);
        return respond({ paymentNo: 'PAY-PROOF-9', status: 'PENDING', hasProof: true });
      }
      if (
        path === '/api/customers/me/addresses' ||
        path === '/api/customers/me/selection-inquiries' ||
        path === '/api/customers/me/inquiries' ||
        path === '/api/customers/me/favorites'
      ) return respond([]);
      if (path === '/api/customers/me/notifications') {
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === '/api/partners/me') return respond(null);
      if (path === '/api/recommendations/for-you') return respond([]);
      if (path.endsWith('/settings/flags')) {
        return respond({ commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
      }
      if (path.endsWith('/settings/public')) return respond({ siteName: '海川珠宝' });
      return respond({ list: [], total: 0 });
    });
    return {
      getCancelCalls: () => cancelCalled,
      getOrderDetailReads: () => orderDetailReads,
      getProofUploadPaths: () => proofUploadPaths,
      getProofIdempotencyKeys: () => proofIdempotencyKeys,
    };
  }

  test('未付款且无待处理支付时确认后取消并刷新状态', async ({ page }) => {
    const { getCancelCalls } = await mockCustomerCancelPage(page);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/customer');

    const cancelButton = page.getByRole('button', { name: '取消订单' });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(page.getByText('订单已取消', { exact: true })).toBeVisible();
    expect(getCancelCalls()).toBe(1);
    // 刷新后订单状态显示已取消，且不再出现取消按钮
    await expect(page.getByText('已取消').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '取消订单' })).toHaveCount(0);
  });

  test('线下凭证待审核时不提供取消入口（防渠道扣款与取消竞态）', async ({ page }) => {
    const { getCancelCalls } = await mockCustomerCancelPage(page, { hasPendingProof: true });
    await page.goto('/customer');

    await expect(page.getByText('特殊线下凭证已提交·待审核')).toBeVisible();
    await expect(page.getByRole('button', { name: '取消订单' })).toHaveCount(0);
    expect(getCancelCalls()).toBe(0);
  });

  test('取消被服务端拒绝时保留原状态并提示原因', async ({ page }) => {
    const { getCancelCalls } = await mockCustomerCancelPage(page, {
      cancelStatus: 409,
      cancelMessage: '订单存在待处理的支付交易 PAY-1，请先在订单中查询或结束支付后再取消',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/customer');

    await page.getByRole('button', { name: '取消订单' }).click();
    await expect(page.getByText(/请先在订单中查询或结束支付/).first()).toBeVisible();
    // 订单仍为待付款，按钮保留可重试
    await expect(page.getByText('待付款').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '取消订单' })).toBeVisible();
    const cancelBox = await page.getByRole('button', { name: '取消订单' }).boundingBox();
    expect(cancelBox?.height).toBeGreaterThanOrEqual(44);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(getCancelCalls()).toBe(1);
  });

  test('订单已取消但响应丢失时以权威订单收敛且不重复取消', async ({ page }) => {
    const mock = await mockCustomerCancelPage(page, {
      firstCancelCommitsButFails: true,
    });
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/customer');

    await page.getByRole('button', { name: '取消订单' }).click();
    await expect(page.getByText('订单已取消并完成权威核验')).toBeVisible();
    await expect(page.getByText('已取消').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '取消订单' })).toHaveCount(0);
    expect(mock.getCancelCalls()).toBe(1);
    expect(mock.getOrderDetailReads()).toBe(1);
  });

  test('订单取消 5xx 后权威状态仍待付款时保留安全重试', async ({ page }) => {
    const mock = await mockCustomerCancelPage(page, {
      firstCancelFailsBeforeCommit: true,
    });
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/customer');

    await page.getByRole('button', { name: '取消订单' }).click();
    await expect(page.getByText('取消结果未确认，已刷新权威状态，可以安全重试。')).toBeVisible();
    await expect(page.getByText('待付款').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '取消订单' })).toBeVisible();
    expect(mock.getCancelCalls()).toBe(1);
    expect(mock.getOrderDetailReads()).toBe(1);

    await page.getByRole('button', { name: '取消订单' }).click();
    await expect(page.getByText('订单已取消', { exact: true })).toBeVisible();
    expect(mock.getCancelCalls()).toBe(2);
  });

  test('订单取消结果与权威订单都不可读时不猜测成功', async ({ page }) => {
    const mock = await mockCustomerCancelPage(page, {
      firstCancelFailsBeforeCommit: true,
      cancelRecoveryReadFails: true,
    });
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/customer');

    await page.getByRole('button', { name: '取消订单' }).click();
    await expect(page.getByText('取消结果待确认，暂未读取到权威订单，可以安全重试。')).toBeVisible();
    await expect(page.getByText('订单已取消', { exact: true })).toHaveCount(0);
    await expect(page.getByText('待付款').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '取消订单' })).toBeVisible();
    expect(mock.getCancelCalls()).toBe(1);
    expect(mock.getOrderDetailReads()).toBe(1);
  });

  test('线下凭证通过上传与订单关联的单一请求提交', async ({ page }) => {
    const { getProofUploadPaths, getProofIdempotencyKeys } = await mockCustomerCancelPage(page, { bankTransfer: true });
    await page.goto('/customer');

    await page.getByRole('button', { name: '上传线下付款凭证' }).click();
    const dialog = page.getByRole('dialog', { name: '上传付款凭证' });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from('proof-image'),
    });

    await expect(page.getByText('付款凭证已提交，等待审核')).toBeVisible();
    await page.getByRole('button', { name: '上传线下付款凭证' }).click();
    await page.getByRole('dialog', { name: '上传付款凭证' }).locator('input[type="file"]').setInputFiles({
      name: 'renamed-proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from('proof-image'),
    });

    await expect.poll(getProofUploadPaths).toEqual([
      '/api/upload/payment-proof/9',
      '/api/upload/payment-proof/9',
    ]);
    const keys = getProofIdempotencyKeys();
    expect(keys[0]).toMatch(/^payment-proof-[a-f0-9]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[0]).not.toContain('proof-image');
  });
});
