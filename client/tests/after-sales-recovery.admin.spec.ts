import { expect, test, type Page, type Route } from '@playwright/test';
import { installAdminSession } from './fixtures/session-auth';

type Outcome = 'committed' | 'not-committed' | 'unknown' | 'rejected';
type CreateOutcome = 'response-lost-recover' | 'rejected';

type CreateRequest = {
  key: string;
  body: Record<string, unknown>;
};

type AfterSalesFixture = {
  id: number;
  caseNo: string;
  orderId: number;
  orderItemId: number;
  customerId: number;
  type: 'REFUND' | 'EXCHANGE' | 'REPAIR';
  status: 'REQUESTED' | 'APPROVED' | 'RETURNING';
  reason: string;
  customerNote: string | null;
  adminNote: string | null;
  requestedRefundAmount: number | null;
  approvedRefundAmount: number | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: number;
    orderNo: string;
    customerName: string;
    customerPhone: string;
    finalAmount: number;
    status: string;
    items: never[];
  };
  customer: { id: number; name: string; phone: string };
  handler: null;
};

function afterSalesCase(
  id: number,
  caseNo: string,
  status: AfterSalesFixture['status'],
  type: AfterSalesFixture['type'],
): AfterSalesFixture {
  return {
    id,
    caseNo,
    orderId: 100 + id,
    orderItemId: 200 + id,
    customerId: 300 + id,
    type,
    status,
    reason: `售后原因 ${id}`,
    customerNote: null,
    adminNote: null,
    requestedRefundAmount: type === 'REFUND' ? 36 : null,
    approvedRefundAmount: null,
    createdAt: '2026-09-23T08:00:00.000Z',
    updatedAt: '2026-09-23T08:00:00.000Z',
    order: {
      id: 100 + id,
      orderNo: `ORDER-AFTER-${id}`,
      customerName: `售后客户${id}`,
      customerPhone: '138****0000',
      finalAmount: 100,
      status: 'SHIPPED',
      items: [],
    },
    customer: { id: 300 + id, name: `售后客户${id}`, phone: '138****0000' },
    handler: null,
  };
}

async function installAfterSalesApis(
  page: Page,
  options: {
    review?: Outcome;
    status?: Outcome;
    create?: CreateOutcome;
    delayedInitialList?: { gate: Promise<void>; onCompleted?: () => void };
    delayedDetail?: { id: number; gate: Promise<void>; onCompleted?: () => void };
  },
) {
  const records = [
    afterSalesCase(1, 'AS-REQUESTED-1', 'REQUESTED', 'REFUND'),
    afterSalesCase(2, 'AS-APPROVED-2', 'APPROVED', 'REPAIR'),
    afterSalesCase(3, 'AS-REQUESTED-3', 'REQUESTED', 'EXCHANGE'),
  ];
  const writes: string[] = [];
  const createRequests: CreateRequest[] = [];
  const detailReads: number[] = [];
  const unavailable = new Set<number>();
  let delayedInitialListConsumed = false;

  const respond = (
    route: Route,
    data: unknown,
    status = 200,
    message = status >= 500 ? 'response lost' : 'ok',
  ) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ code: status, data, message }),
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === 'GET' && path === '/api/after-sales-cases') {
      const status = url.searchParams.get('status');
      if (options.delayedInitialList && !status && !delayedInitialListConsumed) {
        delayedInitialListConsumed = true;
        await options.delayedInitialList.gate;
        options.delayedInitialList.onCompleted?.();
      }
      const visible = status ? records.filter((record) => record.status === status) : records;
      await respond(route, { list: visible, total: visible.length, page: 1, pageSize: 20 });
      return;
    }

    if (request.method() === 'POST' && path === '/api/after-sales-cases') {
      const key = request.headers()['idempotency-key'] ?? '';
      const body = request.postDataJSON() as Record<string, unknown>;
      createRequests.push({ key, body });
      if (options.create === 'rejected') {
        await respond(route, null, 400, '售后登记数据无效');
        return;
      }
      if (options.create === 'response-lost-recover' && createRequests.length === 1) {
        await respond(route, null, 503);
        return;
      }
      if (
        options.create === 'response-lost-recover'
        && key !== createRequests[0]?.key
      ) {
        await respond(route, null, 409, '幂等键不一致');
        return;
      }
      await respond(route, { id: 91, caseNo: 'AS-CREATE-91' });
      return;
    }

    if (request.method() === 'GET' && path === '/api/orders') {
      await respond(route, {
        list: [{
          id: 501,
          orderNo: 'ORDER-CREATE-501',
          customerId: 601,
          customerName: '售后登记客户',
          customerPhone: '13800000601',
          orderType: 'SPOT',
          status: 'SHIPPED',
          finalAmount: 100,
          items: [{
            id: 701,
            productNameSnapshot: '测试戒指',
            productCodeSnapshot: 'R-001',
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
          }],
        }],
        total: 1,
        page: 1,
        pageSize: 10,
      });
      return;
    }

    const detailMatch = path.match(/^\/api\/after-sales-cases\/(\d+)$/);
    if (request.method() === 'GET' && detailMatch) {
      const id = Number(detailMatch[1]);
      detailReads.push(id);
      if (options.delayedDetail?.id === id) {
        await options.delayedDetail.gate;
        options.delayedDetail.onCompleted?.();
      }
      if (unavailable.has(id)) {
        await respond(route, null, 503);
        return;
      }
      await respond(route, records.find((record) => record.id === id) ?? null);
      return;
    }

    if (request.method() === 'PUT' && path === '/api/after-sales-cases/1/review') {
      writes.push(`${request.method()} ${path}`);
      const body = request.postDataJSON() as {
        action: 'APPROVED' | 'REJECTED';
        approvedRefundAmount?: number;
        adminNote?: string;
      };
      if (options.review === 'committed') {
        Object.assign(records[0], {
          status: body.action,
          approvedRefundAmount: body.action === 'APPROVED' ? body.approvedRefundAmount ?? null : null,
          adminNote: body.adminNote?.trim() || null,
        });
      }
      if (options.review === 'rejected') {
        await respond(route, null, 400, '审核数据已失效');
        return;
      }
      if (options.review === 'unknown') unavailable.add(1);
      await respond(route, null, 503);
      return;
    }

    if (request.method() === 'PUT' && path === '/api/after-sales-cases/2/status') {
      writes.push(`${request.method()} ${path}`);
      const body = request.postDataJSON() as { status: AfterSalesFixture['status']; adminNote?: string };
      if (options.status === 'committed') {
        Object.assign(records[1], {
          status: body.status,
          adminNote: body.adminNote?.trim() || null,
        });
      }
      if (options.status === 'rejected') {
        await respond(route, null, 409, '售后状态已变化');
        return;
      }
      if (options.status === 'unknown') unavailable.add(2);
      await respond(route, null, 503);
      return;
    }

    if (path === '/api/settings/flags') {
      await respond(route, { commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
      return;
    }

    await respond(route, {});
  });
  await installAdminSession(page, { role: 'ADMIN' });

  return { writes, detailReads, createRequests };
}

function rowFor(page: Page, caseNo: string) {
  return page.getByRole('row').filter({ hasText: caseNo });
}

async function submitReview(page: Page) {
  await rowFor(page, 'AS-REQUESTED-1').getByRole('button', { name: '通过' }).click();
  const dialog = page.getByRole('dialog', { name: '审核通过该售后工单？' });
  await dialog.getByPlaceholder('处理备注（可选）').fill('审核恢复备注');
  await dialog.getByRole('button', { name: '确认通过' }).click();
  return dialog;
}

async function submitStatus(page: Page) {
  await rowFor(page, 'AS-APPROVED-2').getByRole('button', { name: '推进状态' }).click();
  const dialog = page.getByRole('dialog', { name: '更新售后状态' });
  await dialog.getByPlaceholder('处理备注（可选）').fill('状态恢复备注');
  await dialog.getByRole('button', { name: '确认更新' }).click();
  return dialog;
}

async function fillCreateForm(page: Page, reason = '连接处需要售后检修') {
  await page.getByRole('button', { name: '登记售后' }).click();
  const dialog = page.getByRole('dialog', { name: '登记售后工单' });
  await dialog.getByLabel('关联订单').fill('ORDER-CREATE-501');
  await page.locator('.ant-select-dropdown:visible').getByText('ORDER-CREATE-501', { exact: false }).click();
  await dialog
    .locator('.ant-form-item')
    .filter({ hasText: '订单商品' })
    .locator('.ant-select-selector')
    .click();
  await page.locator('.ant-select-dropdown:visible').getByText('测试戒指 · R-001', { exact: true }).click();
  await dialog
    .locator('.ant-form-item')
    .filter({ hasText: '售后类型' })
    .locator('.ant-select-selector')
    .click();
  await page.locator('.ant-select-dropdown:visible').getByText('维修', { exact: true }).click();
  await dialog.getByLabel('售后原因').fill(reason);
  return dialog;
}

test.describe('后台售后响应丢失恢复', () => {
  test('新建工单响应丢失后同内容重试沿用同一键并恢复原结果', async ({ page }) => {
    const state = await installAfterSalesApis(page, { create: 'response-lost-recover' });
    await page.goto('/admin/trade/after-sales');
    const dialog = await fillCreateForm(page);

    await dialog.getByRole('button', { name: '创建工单' }).click();
    await expect(page.getByText('售后工单创建结果待确认')).toBeVisible();
    await expect(dialog.getByLabel('售后原因')).toHaveValue('连接处需要售后检修');
    expect(state.createRequests).toHaveLength(1);

    await dialog.getByRole('button', { name: '创建工单' }).click();
    await expect(page.getByText('售后工单已创建')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(state.createRequests).toHaveLength(2);
    expect(state.createRequests[0]?.key).toMatch(/^after-sales-admin-/);
    expect(state.createRequests[1]?.key).toBe(state.createRequests[0]?.key);
    expect(state.createRequests[1]?.body).toEqual(state.createRequests[0]?.body);
  });

  test('刷新页面后重填相同内容仍复用待确认凭据', async ({ page }) => {
    const state = await installAfterSalesApis(page, { create: 'response-lost-recover' });
    await page.goto('/admin/trade/after-sales');
    let dialog = await fillCreateForm(page);
    await dialog.getByRole('button', { name: '创建工单' }).click();
    await expect(page.getByText('售后工单创建结果待确认')).toBeVisible();
    const firstKey = state.createRequests[0]?.key;

    await page.reload();
    dialog = await fillCreateForm(page);
    await expect(dialog.getByText('存在结果待确认的售后登记')).toBeVisible();
    await dialog.getByRole('button', { name: '创建工单' }).click();

    await expect(page.getByText('售后工单已创建')).toBeVisible();
    expect(state.createRequests).toHaveLength(2);
    expect(state.createRequests[1]?.key).toBe(firstKey);
  });

  test('待确认期间修改内容会零 POST 并提供显式放弃入口', async ({ page }) => {
    const state = await installAfterSalesApis(page, { create: 'response-lost-recover' });
    await page.goto('/admin/trade/after-sales');
    const dialog = await fillCreateForm(page);
    await dialog.getByRole('button', { name: '创建工单' }).click();
    await expect(page.getByText('售后工单创建结果待确认')).toBeVisible();

    await dialog.getByLabel('售后原因').fill('改成另一项售后需求');
    await dialog.getByRole('button', { name: '创建工单' }).click();

    await expect(dialog.getByText('存在另一笔结果待确认的售后登记')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '放弃旧凭据' })).toBeVisible();
    expect(state.createRequests).toHaveLength(1);
  });

  test('无法持久化重试凭据时不发送新建请求', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (key.startsWith('hc:admin-after-sales-create-attempt:')) {
          throw new DOMException('storage unavailable', 'QuotaExceededError');
        }
        return originalSetItem.call(this, key, value);
      };
    });
    const state = await installAfterSalesApis(page, { create: 'response-lost-recover' });
    await page.goto('/admin/trade/after-sales');
    const dialog = await fillCreateForm(page);

    await dialog.getByRole('button', { name: '创建工单' }).click();

    await expect(page.getByText('浏览器无法安全保存本次售后登记的重试凭据')).toBeVisible();
    expect(state.createRequests).toHaveLength(0);
  });

  test('确定性 4xx 清除旧凭据，修正内容后使用新键提交', async ({ page }) => {
    const state = await installAfterSalesApis(page, { create: 'rejected' });
    await page.goto('/admin/trade/after-sales');
    const dialog = await fillCreateForm(page);
    await dialog.getByRole('button', { name: '创建工单' }).click();
    await expect(page.getByText('售后工单创建失败')).toBeVisible();
    const firstKey = state.createRequests[0]?.key;

    await dialog.getByLabel('售后原因').fill('修正后的售后原因');
    await dialog.getByRole('button', { name: '创建工单' }).click();

    expect(state.createRequests).toHaveLength(2);
    expect(state.createRequests[1]?.key).not.toBe(firstKey);
    await expect(dialog.getByText('存在另一笔结果待确认的售后登记')).toHaveCount(0);
  });

  test('审核已提交时以权威状态、额度和备注收口且不重复 PUT', async ({ page }) => {
    const state = await installAfterSalesApis(page, { review: 'committed' });
    await page.goto('/admin/trade/after-sales');

    const dialog = await submitReview(page);

    await expect(page.getByText('售后审核已写入并完成权威核验')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: '售后已通过，退款尚未执行' })).toBeVisible();
    expect(state.writes.filter((entry) => entry.endsWith('/1/review'))).toHaveLength(1);
  });

  for (const scenario of [
    {
      outcome: 'not-committed' as const,
      message: '权威售后工单仍处于待审核，本次审核确定未生效；当前额度与备注已保留，可安全重试。',
    },
    {
      outcome: 'unknown' as const,
      message: '售后审核结果待确认，当前额度与备注已保留；请先重新加载或查看工单详情，暂不要重复操作。',
    },
  ]) {
    test(`审核响应丢失后区分 ${scenario.outcome} 并保留输入`, async ({ page }) => {
      const state = await installAfterSalesApis(page, { review: scenario.outcome });
      await page.goto('/admin/trade/after-sales');

      const dialog = await submitReview(page);

      await expect(page.getByText(scenario.message)).toBeVisible();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('审核通过的退款金额')).toHaveValue('36.00');
      await expect(dialog.getByPlaceholder('处理备注（可选）')).toHaveValue('审核恢复备注');
      expect(state.writes.filter((entry) => entry.endsWith('/1/review'))).toHaveLength(1);
    });
  }

  test('审核确定性 4xx 保留原错误和输入且不触发权威回读', async ({ page }) => {
    const state = await installAfterSalesApis(page, { review: 'rejected' });
    await page.goto('/admin/trade/after-sales');

    const dialog = await submitReview(page);

    await expect(page.getByText('售后审核未完成，请重新加载工单后重试。')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder('处理备注（可选）')).toHaveValue('审核恢复备注');
    expect(state.detailReads).toHaveLength(0);
  });

  test('状态已提交时以权威目标状态和备注收口且不重复 PUT', async ({ page }) => {
    const state = await installAfterSalesApis(page, { status: 'committed' });
    await page.goto('/admin/trade/after-sales');

    const dialog = await submitStatus(page);

    await expect(page.getByText('售后状态已写入并完成权威核验')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(state.writes.filter((entry) => entry.endsWith('/2/status'))).toHaveLength(1);
  });

  for (const scenario of [
    {
      outcome: 'not-committed' as const,
      message: '权威售后工单仍处于操作前状态，本次更新确定未生效；当前选择与备注已保留，可安全重试。',
    },
    {
      outcome: 'unknown' as const,
      message: '售后状态更新结果待确认，当前选择与备注已保留；请先重新加载或查看工单详情，暂不要重复操作。',
    },
  ]) {
    test(`状态更新响应丢失后区分 ${scenario.outcome} 并保留输入`, async ({ page }) => {
      const state = await installAfterSalesApis(page, { status: scenario.outcome });
      await page.goto('/admin/trade/after-sales');

      const dialog = await submitStatus(page);

      await expect(page.getByText(scenario.message)).toBeVisible();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByPlaceholder('处理备注（可选）')).toHaveValue('状态恢复备注');
      expect(state.writes.filter((entry) => entry.endsWith('/2/status'))).toHaveLength(1);
    });
  }

  test('状态更新确定性 4xx 保留原错误且不触发权威回读', async ({ page }) => {
    const state = await installAfterSalesApis(page, { status: 'rejected' });
    await page.goto('/admin/trade/after-sales');

    const dialog = await submitStatus(page);

    await expect(page.getByText('数据已被其他操作更新，请重新加载后再试。')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder('处理备注（可选）')).toHaveValue('状态恢复备注');
    expect(state.detailReads).toHaveLength(0);
  });

  test('旧列表晚到时不会覆盖当前状态筛选', async ({ page }) => {
    let releaseInitialList!: () => void;
    let initialListCompleted = false;
    const gate = new Promise<void>((resolve) => { releaseInitialList = resolve; });
    await installAfterSalesApis(page, {
      delayedInitialList: {
        gate,
        onCompleted: () => { initialListCompleted = true; },
      },
    });
    await page.goto('/admin/trade/after-sales');

    await page.getByRole('button', { name: '待审核', exact: true }).click();
    await expect(rowFor(page, 'AS-REQUESTED-1')).toBeVisible();
    await expect(rowFor(page, 'AS-APPROVED-2')).toHaveCount(0);

    releaseInitialList();
    await expect.poll(() => initialListCompleted).toBe(true);
    await expect(rowFor(page, 'AS-REQUESTED-1')).toBeVisible();
    await expect(rowFor(page, 'AS-APPROVED-2')).toHaveCount(0);
  });

  test('关闭 A 后打开 B 时迟到的 A 详情不会覆盖当前售后工单', async ({ page }) => {
    let releaseFirstDetail!: () => void;
    let firstDetailCompleted = false;
    const gate = new Promise<void>((resolve) => { releaseFirstDetail = resolve; });
    await installAfterSalesApis(page, {
      delayedDetail: {
        id: 1,
        gate,
        onCompleted: () => { firstDetailCompleted = true; },
      },
    });
    await page.goto('/admin/trade/after-sales');

    await rowFor(page, 'AS-REQUESTED-1').getByRole('button', { name: '详情' }).click();
    const drawer = page.getByRole('dialog', { name: '售后详情' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(drawer).toBeHidden();

    await rowFor(page, 'AS-APPROVED-2').getByRole('button', { name: '详情' }).click();
    await expect(drawer).toContainText('AS-APPROVED-2');
    await expect(drawer).toContainText('ORDER-AFTER-2');

    releaseFirstDetail();
    await expect.poll(() => firstDetailCompleted).toBe(true);
    await expect(drawer).toContainText('AS-APPROVED-2');
    await expect(drawer).toContainText('ORDER-AFTER-2');
    await expect(drawer).not.toContainText('AS-REQUESTED-1');
  });
});
