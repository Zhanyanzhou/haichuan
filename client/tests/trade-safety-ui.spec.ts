import { expect, test, type Page } from '@playwright/test';

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
    await expect(page.getByText('等待渠道确认')).toBeVisible();
    await expect(page.getByText('渠道自动确认')).toBeVisible();
    await expect(page.getByRole('button', { name: '确认收款' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '驳回' })).toHaveCount(0);
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
  });
});

async function mockCustomerWechatCheckout(
  page: Page,
  scene: 'native' | 'h5',
) {
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
        id: 1,
        skuId: 10,
        quantity: 1,
        product: { name: '支付测试戒指' },
        sku: { price: 8800 },
        availability: { available: true, status: 'AVAILABLE', message: null },
      }]);
    }
    if (path.endsWith('/customers/me') && method === 'GET') {
      return data({ name: '测试客户', phone: '13800000000' });
    }
    if (path.endsWith('/customers/checkout') && method === 'POST') {
      return data({ order: { id: 9, orderNo: 'ORD-WX-9', finalAmount: 8800 } });
    }
    if (path.endsWith('/customers/me/orders/9/payment') && method === 'POST') {
      return data({
        provider: 'wechat',
        scene,
        payment: { id: 3, paymentNo: 'PAY-WX-9', amount: 8800 },
        ...(scene === 'native'
          ? { qrCode: 'weixin://wxpay/bizpayurl/up?pr=test' }
          : { payUrl: `${new URL(request.url()).origin}/wechat-h5-stub` }),
      });
    }
    if (path.endsWith('/customers/me/orders/9/payment') && method === 'GET') {
      return data({ state: 'PENDING', gatewayState: 'NOTPAY' });
    }
    return data(null);
  });
  await page.route('**/wechat-h5-stub', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<meta charset="utf-8"><main><h1>微信 H5 收银台跳转测试</h1></main>',
  }));
}

test.describe('客户标准零售使用微信在线支付主链', () => {
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

  test('手机网站接收 H5 场景后跳转微信收银台链接', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockCustomerWechatCheckout(page, 'h5');
    await page.goto('/checkout');
    await page.getByLabel('收货地址').fill('深圳市测试地址 2 号');
    await page.getByRole('button', { name: /提交订单并支付/ }).click();

    await expect(page).toHaveURL(/\/wechat-h5-stub$/);
    await expect(page.getByRole('heading', { name: '微信 H5 收银台跳转测试' })).toBeVisible();
  });
});

async function mockCustomerTradeTimeline(
  page: Page,
  options: { withTracking?: boolean; trackingFails?: boolean } = {},
) {
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
      if (options.trackingFails) {
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

  test('物流服务失败时显示可恢复的本地失败态', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockCustomerTradeTimeline(page, {
      withTracking: true,
      trackingFails: true,
    });
    await page.goto('/customer');

    await page.getByRole('button', { name: '查看轨迹' }).click();
    await expect(page.getByText('物流服务暂不可用')).toBeVisible();
    await expect(
      page.getByText('暂无轨迹数据（物流查询服务可能未接入，请联系顾问）'),
    ).toBeVisible();
  });
});

async function mockCustomerReview(
  page: Page,
  options: { firstReviewFails?: boolean } = {},
) {
  let reviewAttempts = 0;
  let lastReviewBody: Record<string, unknown> | null = null;
  const uploadedImage = 'data:image/png;base64,iVBORw0KGgo=';

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
    if (path.endsWith('/upload/image') && request.method() === 'POST') {
      return data({ url: uploadedImage });
    }
    if (path.endsWith('/reviews') && request.method() === 'POST') {
      reviewAttempts += 1;
      lastReviewBody = request.postDataJSON() as Record<string, unknown>;
      if (options.firstReviewFails && reviewAttempts === 1) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: '评价提交冲突，请重试' }),
        });
      }
      return data({ id: 91, status: 'PENDING' });
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
});

async function mockCustomerAfterSales(
  page: Page,
  options: { firstCreateFails?: boolean } = {},
) {
  let createAttempts = 0;
  let lastCreateBody: Record<string, unknown> | null = null;
  let cases: Array<Record<string, unknown>> = [];
  let markFirstCreateStarted!: () => void;
  let releaseFirstCreate!: () => void;
  const firstCreateStarted = new Promise<void>((resolve) => {
    markFirstCreateStarted = resolve;
  });
  const firstCreateRelease = new Promise<void>((resolve) => {
    releaseFirstCreate = resolve;
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
      return data([{
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
      }]);
    }
    if (path.endsWith('/customers/me/orders/9/after-sales') && method === 'POST') {
      createAttempts += 1;
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
      const created = {
        id: 31,
        caseNo: 'AS-CUSTOMER-31',
        orderId: 9,
        orderItemId: lastCreateBody.orderItemId,
        type: lastCreateBody.type,
        status: 'REQUESTED',
        reason: lastCreateBody.reason,
        requestedRefundAmount: null,
        approvedRefundAmount: null,
        createdAt: '2026-08-26T10:00:00.000Z',
        updatedAt: '2026-08-26T10:00:00.000Z',
      };
      cases = [created];
      return data(created);
    }
    if (path.endsWith('/customers/me/after-sales/31/cancel') && method === 'POST') {
      cases = cases.map((record) => ({ ...record, status: 'CANCELLED' }));
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

      await page.goto('/admin/trade/after-sales');
      await page.getByRole('button', { name: '登记售后' }).click();
      const dialog = page.getByRole('dialog', { name: '登记售后工单' });
      await dialog.getByLabel('订单 ID').fill('101');
      await dialog.getByLabel('客户 ID').fill('7');
      await dialog.getByLabel('订单商品 ID').fill('202');
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
