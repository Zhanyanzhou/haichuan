import { expect, test, type Page, type Route } from '@playwright/test';
import { installAdminSession } from './fixtures/session-auth';

type Outcome = 'committed' | 'not-committed' | 'unknown' | 'rejected';

type FulfillmentFixture = {
  id: number;
  fulfillmentNo: string;
  orderId: number;
  status: string;
  carrier: string | null;
  trackingNo: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  abnormalReason: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: number;
    orderNo: string;
    status: string;
    deliveryStatus: string;
    customerName: string;
    customerPhone: string;
    address: string;
    items: never[];
  };
};

function fulfillment(
  id: number,
  fulfillmentNo: string,
  orderNo: string,
  status: 'PENDING_SHIP' | 'SHIPPED',
): FulfillmentFixture {
  const shipped = status === 'SHIPPED';
  return {
    id,
    fulfillmentNo,
    orderId: 100 + id,
    status,
    carrier: shipped ? '顺丰速运' : null,
    trackingNo: shipped ? `SF-ORIGINAL-${id}` : null,
    shippedAt: shipped ? '2026-09-23T08:00:00.000Z' : null,
    deliveredAt: null,
    abnormalReason: null,
    createdAt: '2026-09-23T07:00:00.000Z',
    updatedAt: '2026-09-23T08:00:00.000Z',
    order: {
      id: 100 + id,
      orderNo,
      status: shipped ? 'SHIPPED' : 'PENDING_SHIP',
      deliveryStatus: status,
      customerName: `履约客户${id}`,
      customerPhone: '138****0000',
      address: '测试收货地址',
      items: [],
    },
  };
}

async function installFulfillmentApis(
  page: Page,
  options: {
    dispatch?: Outcome;
    delivered?: Outcome;
    abnormal?: Outcome;
    delayedDispatch?: { gate: Promise<void>; onCompleted?: () => void };
    delayedInitialList?: { gate: Promise<void>; onCompleted?: () => void };
    delayedDetail?: { id: number; gate: Promise<void>; onCompleted?: () => void };
  },
) {
  const records = [
    fulfillment(1, 'FUL-PENDING-1', 'ORDER-PENDING-1', 'PENDING_SHIP'),
    fulfillment(2, 'FUL-SHIPPED-2', 'ORDER-SHIPPED-2', 'SHIPPED'),
    fulfillment(3, 'FUL-SHIPPED-3', 'ORDER-SHIPPED-3', 'SHIPPED'),
    fulfillment(4, 'FUL-PENDING-4', 'ORDER-PENDING-4', 'PENDING_SHIP'),
  ];
  const writes: string[] = [];
  const detailReads: number[] = [];
  const unavailable = new Set<number>();

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

    if (request.method() === 'GET' && path === '/api/fulfillments') {
      const status = url.searchParams.get('status');
      if (options.delayedInitialList && !status) {
        await options.delayedInitialList.gate;
        options.delayedInitialList.onCompleted?.();
      }
      const visibleRecords = status
        ? records.filter((record) => record.status === status)
        : records;
      await respond(route, { list: visibleRecords, total: visibleRecords.length });
      return;
    }

    const detailMatch = path.match(/^\/api\/fulfillments\/(\d+)$/);
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

    if (request.method() === 'PUT' && path === '/api/fulfillments/1/dispatch') {
      writes.push(`${request.method()} ${path}`);
      if (options.delayedDispatch) {
        await options.delayedDispatch.gate;
        options.delayedDispatch.onCompleted?.();
        await respond(route, null, 503);
        return;
      }
      const body = request.postDataJSON() as { carrier: string; trackingNo: string };
      if (options.dispatch === 'committed') {
        Object.assign(records[0], {
          status: 'SHIPPED',
          carrier: body.carrier.trim(),
          trackingNo: body.trackingNo.trim(),
          shippedAt: '2026-09-23T09:00:00.000Z',
        });
        Object.assign(records[0].order, { status: 'SHIPPED', deliveryStatus: 'SHIPPED' });
      }
      if (options.dispatch === 'rejected') {
        await respond(route, null, 400, '物流信息不合法');
        return;
      }
      if (options.dispatch === 'unknown') unavailable.add(1);
      await respond(route, null, 503);
      return;
    }

    if (request.method() === 'PUT' && path === '/api/fulfillments/2/status') {
      writes.push(`${request.method()} ${path}`);
      if (options.delivered === 'committed') {
        Object.assign(records[1], {
          status: 'DELIVERED',
          deliveredAt: '2026-09-23T10:00:00.000Z',
        });
        records[1].order.deliveryStatus = 'RECEIVED';
      }
      if (options.delivered === 'unknown') unavailable.add(2);
      await respond(route, null, 503);
      return;
    }

    if (request.method() === 'PUT' && path === '/api/fulfillments/3/status') {
      writes.push(`${request.method()} ${path}`);
      const body = request.postDataJSON() as { abnormalReason: string };
      if (options.abnormal === 'committed') {
        Object.assign(records[2], {
          status: 'ABNORMAL',
          abnormalReason: body.abnormalReason.trim(),
        });
        records[2].order.deliveryStatus = 'ABNORMAL';
      }
      if (options.abnormal === 'unknown') unavailable.add(3);
      await respond(route, null, 503);
      return;
    }

    if (path === '/api/settings/flags') {
      await respond(route, { commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
      return;
    }

    await respond(route, {});
  });
  await installAdminSession(page, { role: 'WAREHOUSE' });

  return { writes, detailReads };
}

function rowFor(page: Page, fulfillmentNo: string) {
  return page.getByRole('row').filter({ hasText: fulfillmentNo });
}

async function fillDispatch(page: Page, trackingNo: string) {
  const dialog = page.getByRole('dialog', { name: '登记发货' });
  const carrier = dialog.getByLabel('承运商');
  await carrier.click();
  await carrier.press('Enter');
  await dialog.getByLabel('运单号').fill(trackingNo);
  await dialog.getByRole('button', { name: '确认发货' }).click();
  return dialog;
}

test.describe('履约中心响应丢失恢复', () => {
  test('发货已提交时以权威物流事实收口且不重复 PUT', async ({ page }) => {
    const state = await installFulfillmentApis(page, { dispatch: 'committed' });
    await page.goto('/admin/trade/fulfillment');

    await rowFor(page, 'FUL-PENDING-1').getByRole('button', { name: '发货' }).click();
    const dialog = await fillDispatch(page, 'SF-RECOVERY-1');

    await expect(page.getByText('发货信息已写入并完成权威核验')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(state.writes.filter((entry) => entry === 'PUT /api/fulfillments/1/dispatch')).toHaveLength(1);
  });

  for (const scenario of [
    {
      outcome: 'not-committed' as const,
      message: '权威履约单仍明确处于待发货，本次登记确定未生效；当前物流信息已保留，可安全重试。',
    },
    {
      outcome: 'unknown' as const,
      message: '发货登记结果待确认，当前物流信息已保留；请先重新加载或查看履约详情，暂不要重复操作。',
    },
  ]) {
    test(`发货响应丢失后区分 ${scenario.outcome} 并保留物流输入`, async ({ page }) => {
      const state = await installFulfillmentApis(page, { dispatch: scenario.outcome });
      await page.goto('/admin/trade/fulfillment');

      await rowFor(page, 'FUL-PENDING-1').getByRole('button', { name: '发货' }).click();
      const dialog = await fillDispatch(page, 'SF-RETAIN-1');

      await expect(page.getByText(scenario.message)).toBeVisible();
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('FUL-PENDING-1 · 订单：ORDER-PENDING-1');
      await expect(dialog.getByLabel('运单号')).toHaveValue('SF-RETAIN-1');
      expect(state.writes.filter((entry) => entry === 'PUT /api/fulfillments/1/dispatch')).toHaveLength(1);
    });
  }

  test('发货确定性 4xx 保留原错误与表单且不触发权威回读', async ({ page }) => {
    const state = await installFulfillmentApis(page, { dispatch: 'rejected' });
    await page.goto('/admin/trade/fulfillment');

    await rowFor(page, 'FUL-PENDING-1').getByRole('button', { name: '发货' }).click();
    const dialog = await fillDispatch(page, 'SF-REJECTED-1');

    await expect(page.getByText('发货登记失败，请核对物流信息后重试。')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('运单号')).toHaveValue('SF-REJECTED-1');
    expect(state.detailReads).toEqual([]);
    expect(state.writes.filter((entry) => entry === 'PUT /api/fulfillments/1/dispatch')).toHaveLength(1);
  });

  for (const scenario of [
    { outcome: 'committed' as const, message: '送达状态已写入并完成权威核验' },
    { outcome: 'not-committed' as const, message: '权威履约单仍未送达，本次操作确定未生效，可安全重试。' },
    { outcome: 'unknown' as const, message: '送达结果待确认，请先重新加载或查看履约详情，暂不要重复操作。' },
  ]) {
    test(`送达响应丢失后区分 ${scenario.outcome} 且不重复 PUT`, async ({ page }) => {
      const state = await installFulfillmentApis(page, { delivered: scenario.outcome });
      await page.goto('/admin/trade/fulfillment');

      await rowFor(page, 'FUL-SHIPPED-2').getByRole('button', { name: '标记送达' }).click();
      await page.getByRole('dialog', { name: '将该包裹标记为已送达？' })
        .getByRole('button', { name: '确认送达' })
        .click();

      await expect(page.getByText(scenario.message)).toBeVisible();
      expect(state.writes.filter((entry) => entry === 'PUT /api/fulfillments/2/status')).toHaveLength(1);
    });
  }

  for (const scenario of [
    { outcome: 'committed' as const, message: '物流异常已写入并完成权威核验' },
    { outcome: 'not-committed' as const, message: '权威履约单仍为已发货，本次异常登记确定未生效；异常原因已保留，可安全重试。' },
    { outcome: 'unknown' as const, message: '物流异常登记结果待确认，异常原因已保留；请先重新加载或查看履约详情，暂不要重复操作。' },
  ]) {
    test(`异常登记响应丢失后区分 ${scenario.outcome} 且保留必要输入`, async ({ page }) => {
      const state = await installFulfillmentApis(page, { abnormal: scenario.outcome });
      await page.goto('/admin/trade/fulfillment');

      await rowFor(page, 'FUL-SHIPPED-3').getByRole('button', { name: /异\s*常/ }).click();
      const dialog = page.getByRole('dialog', { name: '标记物流异常' });
      const reason = dialog.getByPlaceholder('例：包裹在运输途中破损，客户拒收');
      await reason.fill('  中转站发现外包装破损  ');
      await dialog.getByRole('button', { name: '标记物流异常' }).click();

      await expect(page.getByText(scenario.message)).toBeVisible();
      if (scenario.outcome === 'committed') {
        await expect(dialog).toHaveCount(0);
      } else {
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('FUL-SHIPPED-3 · 订单：ORDER-SHIPPED-3');
        await expect(reason).toHaveValue('  中转站发现外包装破损  ');
      }
      expect(state.writes.filter((entry) => entry === 'PUT /api/fulfillments/3/status')).toHaveLength(1);
    });
  }

  test('关闭 A 后打开 B 时迟到的发货失败不会污染当前履约单', async ({ page }) => {
    let releaseDispatch!: () => void;
    let delayedCompleted = false;
    const gate = new Promise<void>((resolve) => {
      releaseDispatch = resolve;
    });
    const state = await installFulfillmentApis(page, {
      delayedDispatch: {
        gate,
        onCompleted: () => {
          delayedCompleted = true;
        },
      },
    });
    await page.goto('/admin/trade/fulfillment');

    await rowFor(page, 'FUL-PENDING-1').getByRole('button', { name: '发货' }).click();
    const firstDialog = await fillDispatch(page, 'SF-DELAYED-1');
    await firstDialog.getByRole('button', { name: 'Close' }).click();
    await rowFor(page, 'FUL-PENDING-4').getByRole('button', { name: '发货' }).click();

    const currentDialog = page.getByRole('dialog', { name: '登记发货' });
    await expect(currentDialog).toContainText('FUL-PENDING-4 · 订单：ORDER-PENDING-4');
    releaseDispatch();
    await expect.poll(() => delayedCompleted).toBe(true);
    await expect(currentDialog).toContainText('FUL-PENDING-4 · 订单：ORDER-PENDING-4');
    await expect(page.getByText('发货登记结果待确认')).toHaveCount(0);
    expect(state.detailReads).toEqual([]);
  });

  test('旧列表晚到时不会覆盖当前状态筛选', async ({ page }) => {
    let releaseInitialList!: () => void;
    let initialListCompleted = false;
    const gate = new Promise<void>((resolve) => {
      releaseInitialList = resolve;
    });
    await installFulfillmentApis(page, {
      delayedInitialList: {
        gate,
        onCompleted: () => {
          initialListCompleted = true;
        },
      },
    });
    await page.goto('/admin/trade/fulfillment');

    await page.getByRole('button', { name: '已发货' }).click();
    await expect(rowFor(page, 'FUL-SHIPPED-2')).toBeVisible();
    await expect(rowFor(page, 'FUL-PENDING-1')).toHaveCount(0);

    releaseInitialList();
    await expect.poll(() => initialListCompleted).toBe(true);
    await expect(rowFor(page, 'FUL-SHIPPED-2')).toBeVisible();
    await expect(rowFor(page, 'FUL-PENDING-1')).toHaveCount(0);
  });

  test('关闭 A 后打开 B 时迟到的 A 详情不会覆盖当前履约单', async ({ page }) => {
    let releaseFirstDetail!: () => void;
    let firstDetailCompleted = false;
    const gate = new Promise<void>((resolve) => {
      releaseFirstDetail = resolve;
    });
    await installFulfillmentApis(page, {
      delayedDetail: {
        id: 1,
        gate,
        onCompleted: () => {
          firstDetailCompleted = true;
        },
      },
    });
    await page.goto('/admin/trade/fulfillment');

    await rowFor(page, 'FUL-PENDING-1').getByRole('button', { name: '详情' }).click();
    const drawer = page.getByRole('dialog', { name: '履约详情' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(drawer).toBeHidden();

    await rowFor(page, 'FUL-SHIPPED-2').getByRole('button', { name: '详情' }).click();
    await expect(drawer).toContainText('FUL-SHIPPED-2');
    await expect(drawer).toContainText('ORDER-SHIPPED-2');

    releaseFirstDetail();
    await expect.poll(() => firstDetailCompleted).toBe(true);
    await expect(drawer).toContainText('FUL-SHIPPED-2');
    await expect(drawer).toContainText('ORDER-SHIPPED-2');
    await expect(drawer).not.toContainText('FUL-PENDING-1');
  });
});
