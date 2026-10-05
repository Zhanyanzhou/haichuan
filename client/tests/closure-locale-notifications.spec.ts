import { expect, test, type Route } from "@playwright/test";
import { installCustomerSession, readSessionHeaders } from "./fixtures/session-auth";

function apiResponse(data: unknown) {
  return JSON.stringify({ code: 200, data, message: "success" });
}

test.describe("收敛闭环：公开语言与客户通知", () => {
  test("退役英文链接只重定向中文且不请求英文公开事实", async ({ page }) => {
    const apiRequests: string[] = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      apiRequests.push(url.toString());
      if (url.pathname === "/api/page-modules/document/published") {
        await route.fulfill({
          contentType: "application/json",
          body: apiResponse(null),
        });
        return;
      }
      await route.abort();
    });

    await page.goto("/en/about?from=legacy#story");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/about");
    expect(new URL(page.url()).search).toBe("?from=legacy");
    expect(new URL(page.url()).hash).toBe("#story");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    expect(apiRequests.some((requestUrl) => requestUrl.includes("locale=en"))).toBe(false);
    expect(apiRequests.some((requestUrl) => requestUrl.includes("locale=zh-CN"))).toBe(true);

    apiRequests.length = 0;
    await page.goto("/EN/about");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/about");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    expect(apiRequests.some((requestUrl) => requestUrl.includes("locale=en"))).toBe(false);
  });

  test("即使存在历史英文发布事实，旧英文链接也只渲染中文发布事实", async ({ page }) => {
    const englishTitle = "SYNTHETIC ENGLISH ABOUT PUBLICATION";
    const chineseTitle = "合成中文关于页面";
    const chineseFact = {
      pageKey: "about",
      locale: "zh-CN",
      status: "PUBLISHED",
      puckData: {
        content: [{
          type: "首屏主视觉",
          props: {
            id: "chinese-about-publication",
            title: chineseTitle,
            subtitle: "只允许中文公开事实",
            desktopImage: "/images/hero-desktop.jpg",
            mobileImage: "/images/hero-mobile.jpg",
            altText: "合成珠宝图片",
            actionText: "",
            targetType: "none",
            linkUrl: "",
          },
        }],
        zones: {},
        root: { props: {} },
      },
      metadata: {},
    };
    const historicalEnglishFact = {
      ...chineseFact,
      locale: "en",
      puckData: {
        ...chineseFact.puckData,
        content: [{
          ...chineseFact.puckData.content[0],
          props: { ...chineseFact.puckData.content[0].props, title: englishTitle },
        }],
      },
    };
    const requestedLocales: string[] = [];

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/page-modules/document/published") {
        const locale = url.searchParams.get("locale") ?? "";
        requestedLocales.push(locale);
        await route.fulfill({
          contentType: "application/json",
          body: apiResponse(locale === "en" ? historicalEnglishFact : chineseFact),
        });
        return;
      }
      await route.abort();
    });

    await page.goto("/en/about");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/about");
    await expect(page.getByText(chineseTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(englishTitle, { exact: true })).toHaveCount(0);
    expect(requestedLocales).not.toContain("en");
    expect(requestedLocales).toContain("zh-CN");
  });

  test("已登录客户只能通过本人 Cookie 会话读取并更新服务通知", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let notificationStatus = "AVAILABLE";
    let orderEmailEnabled = true;
    const notificationRequests: Array<{
      method: string;
      authorization: string | undefined;
      csrf: string | undefined;
      sessionDomain: string | undefined;
    }> = [];
    const preferenceWrites: unknown[] = [];

    await page.addInitScript(() => {
      document.cookie = "hc_csrf=closure-customer-csrf; path=/";
    });

    await page.route("**/api/**", async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      let data: unknown = [];

      if (path === "/api/customers/me/notification-preferences" && request.method() === "GET") {
        data = {
          list: [
            {
              channel: "EMAIL",
              topic: "SERVICE_ORDER_CREATED",
              enabled: orderEmailEnabled,
              defaulted: false,
              updatedAt: "2026-09-12T00:00:00.000Z",
              requiresMarketingConsent: false,
            },
            {
              channel: "EMAIL",
              topic: "MARKETING_GENERAL",
              enabled: false,
              defaulted: true,
              updatedAt: null,
              requiresMarketingConsent: true,
            },
          ],
          marketingConsentGranted: false,
        };
      } else if (path === "/api/customers/me/notification-preferences" && request.method() === "PATCH") {
        preferenceWrites.push({
          body: request.postDataJSON(),
          ...readSessionHeaders(request),
        });
        orderEmailEnabled = false;
        data = {
          channel: "EMAIL",
          topic: "SERVICE_ORDER_CREATED",
          enabled: false,
          defaulted: false,
          updatedAt: "2026-09-12T00:01:00.000Z",
          requiresMarketingConsent: false,
        };
      } else if (path === "/api/customers/me/notifications") {
        notificationRequests.push({
          method: request.method(),
          ...readSessionHeaders(request),
        });
        data = {
          list: [{
            id: 91,
            type: "SERVICE_PAYMENT_CONFIRMED",
            title: "付款已确认",
            body: "本次付款 ¥400.00，累计 ¥400.00，剩余 ¥600.00。",
            actionUrl: "/customer?section=orders",
            status: notificationStatus,
            availableAt: "2026-08-26T08:00:00.000Z",
            readAt: notificationStatus === "READ" ? "2026-08-26T08:01:00.000Z" : null,
          }],
          total: 1,
          unreadCount: notificationStatus === "AVAILABLE" ? 1 : 0,
          page: 1,
          pageSize: 20,
        };
      } else if (path === "/api/customers/me/notifications/91/read") {
        notificationRequests.push({
          method: request.method(),
          ...readSessionHeaders(request),
        });
        notificationStatus = "READ";
        data = { id: 91, status: "READ" };
      } else if (path === "/api/settings/flags") {
        data = { commerceEnabled: false, cartEnabled: false, paymentEnabled: false };
      } else if (path === "/api/settings/public") {
        data = { siteName: "海川珠宝" };
      } else if (path === "/api/partner-applications/me") {
        data = null;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(data),
      });
    });
    await installCustomerSession(page, { id: 7, name: "测试会员" });

    await page.goto("/customer");

    const panel = page.getByRole("region", { name: "服务通知" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "付款已确认" })).toBeVisible();
    await expect(panel.getByText(/本次付款.*累计.*剩余/)).toBeVisible();
    await panel.getByRole("button", { name: "标为已读", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: "标为已读", exact: true }),
    ).toHaveCount(0);
    const preference = panel.getByRole("checkbox", { name: "订单创建邮件通知" });
    await expect(preference).toBeChecked();
    await preference.uncheck();
    await expect(preference).not.toBeChecked();
    await expect(panel.getByText("通知偏好已更新。")).toBeVisible();
    await expect(panel.getByText("当前没有有效营销同意，即使开启也不会发送")).toBeVisible();
    await expect(panel.getByText("短信通知当前未启用")).toBeVisible();

    const preferenceRows = panel.locator(".customer-notification-preferences__list label");
    const desktopFirst = await preferenceRows.nth(0).boundingBox();
    const desktopSecond = await preferenceRows.nth(1).boundingBox();
    expect(desktopFirst).not.toBeNull();
    expect(desktopSecond).not.toBeNull();
    expect(Math.abs(desktopFirst!.y - desktopSecond!.y)).toBeLessThan(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel.getByRole("checkbox", { name: "订单创建邮件通知" })).toBeVisible();
    const mobileFirst = await preferenceRows.nth(0).boundingBox();
    const mobileSecond = await preferenceRows.nth(1).boundingBox();
    expect(mobileFirst).not.toBeNull();
    expect(mobileSecond).not.toBeNull();
    expect(mobileFirst!.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(mobileFirst!.x - mobileSecond!.x)).toBeLessThan(2);
    expect(mobileSecond!.y).toBeGreaterThan(mobileFirst!.y + mobileFirst!.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await preference.focus();
    expect(
      await preference.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth)),
    ).toBeGreaterThanOrEqual(2);

    expect(notificationRequests).toEqual(expect.arrayContaining([
      {
        method: "GET",
        authorization: undefined,
        csrf: undefined,
        sessionDomain: "customer",
      },
      {
        method: "PUT",
        authorization: undefined,
        csrf: "closure-customer-csrf",
        sessionDomain: "customer",
      },
    ]));
    expect(preferenceWrites).toEqual([{
      body: {
        channel: "EMAIL",
        topic: "SERVICE_ORDER_CREATED",
        enabled: false,
        expectedUpdatedAt: "2026-09-12T00:00:00.000Z",
      },
      authorization: undefined,
      csrf: "closure-customer-csrf",
      sessionDomain: "customer",
    }]);
  });

  test("通知偏好保存与回读同时失败时保留最后确认状态且不误报成功", async ({ page }) => {
    let preferenceReads = 0;
    let preferenceWrites = 0;
    let orderEmailEnabled = true;
    let updatedAt = "2026-09-12T00:00:00.000Z";
    let failSaveAndReload = false;

    await page.addInitScript(() => {
      document.cookie = "hc_csrf=closure-customer-csrf; path=/";
    });

    await page.route("**/api/**", async (route: Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (path === "/api/customers/me/notification-preferences") {
        if (request.method() === "GET") {
          preferenceReads += 1;
          if (failSaveAndReload) {
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ code: 503, message: "temporary unavailable" }),
            });
            return;
          }
          await route.fulfill({
            contentType: "application/json",
            body: apiResponse({
              list: [{
                channel: "EMAIL",
                topic: "SERVICE_ORDER_CREATED",
                enabled: orderEmailEnabled,
                defaulted: false,
                updatedAt,
                requiresMarketingConsent: false,
              }],
              marketingConsentGranted: false,
            }),
          });
          return;
        }
        if (request.method() === "PATCH") {
          preferenceWrites += 1;
          if (!failSaveAndReload) {
            const body = request.postDataJSON() as { enabled: boolean };
            orderEmailEnabled = body.enabled;
            updatedAt = `2026-09-12T00:0${preferenceWrites}:00.000Z`;
            await route.fulfill({
              contentType: "application/json",
              body: apiResponse({
                channel: "EMAIL",
                topic: "SERVICE_ORDER_CREATED",
                enabled: orderEmailEnabled,
                defaulted: false,
                updatedAt,
                requiresMarketingConsent: false,
              }),
            });
            return;
          }
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ code: 503, message: "temporary unavailable" }),
          });
          return;
        }
      }

      const data = path === "/api/customers/me/notifications"
        ? { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 }
        : path === "/api/settings/flags"
          ? { commerceEnabled: false, cartEnabled: false, paymentEnabled: false }
          : path === "/api/settings/public"
            ? { siteName: "海川珠宝" }
            : [];
      await route.fulfill({
        contentType: "application/json",
        body: apiResponse(data),
      });
    });
    await installCustomerSession(page, { id: 7, name: "测试会员" });

    await page.goto("/customer");

    const panel = page.getByRole("region", { name: "服务通知" });
    const preference = panel.getByRole("checkbox", { name: "订单创建邮件通知" });
    await expect(preference).toBeChecked();
    await preference.uncheck();
    await expect(preference).not.toBeChecked();
    await expect(panel.getByText("通知偏好已更新。" )).toBeVisible();

    failSaveAndReload = true;
    await preference.check();

    await expect(preference).not.toBeChecked();
    await expect(panel.getByRole("alert")).toContainText(
      "通知偏好未保存，且最新状态暂时无法加载；已保留上次确认的状态，请稍后重试。",
    );
    await expect(panel.getByRole("button", { name: "重试保存" })).toBeVisible();
    await expect(panel.getByText("通知偏好已更新。")).toHaveCount(0);
    await expect(panel.getByText("已重新加载服务端最新状态")).toHaveCount(0);
    expect(preferenceReads).toBe(2);
    expect(preferenceWrites).toBe(2);

    failSaveAndReload = false;
    await panel.getByRole("button", { name: "重试保存" }).click();
    await expect(preference).toBeChecked();
    await expect(panel.getByText("通知偏好已更新。" )).toBeVisible();

    await page.reload();
    await expect(panel.getByRole("checkbox", { name: "订单创建邮件通知" })).toBeChecked();
    expect(preferenceReads).toBe(3);
    expect(preferenceWrites).toBe(3);
  });

  test("通知偏好保存时会话失效会清除客户快照并返回会员入口", async ({ page }) => {
    let sessionExpired = false;
    const sessionRequests: string[] = [];

    await page.addInitScript(() => {
      document.cookie = "hc_csrf=closure-customer-csrf; path=/";
    });
    await page.route("**/api/**", async (route: Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (path === "/api/customers/session/refresh") {
        sessionRequests.push(`${request.method()} ${path}`);
        await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
        return;
      }
      if (path === "/api/customers/me/notification-preferences") {
        sessionRequests.push(`${request.method()} ${path}`);
        if (sessionExpired) {
          await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
          return;
        }
        await route.fulfill({
          contentType: "application/json",
          body: apiResponse({
            list: [{
              channel: "EMAIL",
              topic: "SERVICE_ORDER_CREATED",
              enabled: true,
              defaulted: false,
              updatedAt: "2026-09-12T00:00:00.000Z",
              requiresMarketingConsent: false,
            }],
            marketingConsentGranted: false,
          }),
        });
        return;
      }

      const data = path === "/api/customers/me"
        ? { id: 7, name: "测试会员", hasPassword: true }
        : path === "/api/customers/me/notifications"
          ? { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 }
          : path === "/api/settings/flags"
            ? { commerceEnabled: false, cartEnabled: false, paymentEnabled: false }
            : path === "/api/settings/public"
              ? { siteName: "海川珠宝" }
              : [];
      await route.fulfill({
        contentType: "application/json",
        body: apiResponse(data),
      });
    });
    await installCustomerSession(page, { id: 7, name: "测试会员" });
    await page.goto("/customer");

    const preference = page.getByRole("checkbox", { name: "订单创建邮件通知" });
    await expect(preference).toBeChecked();
    sessionExpired = true;
    await preference.uncheck();

    await expect(page.getByRole("heading", { level: 1, name: /您的珠宝档案/ })).toBeVisible();
    await expect(page.locator("#member-access-form")).toBeVisible();
    await expect(preference).toHaveCount(0);
    expect(sessionRequests).toContain("PATCH /api/customers/me/notification-preferences");
    expect(sessionRequests).toContain("POST /api/customers/session/refresh");
  });

  for (const viewport of [
    { name: "桌面", width: 1440, height: 900 },
    { name: "390px 手机", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}订单通知恢复 canonical 定位且伪造 ID 只读失败关闭`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const privateOrderDetailRequests: string[] = [];
      let exactHistoricalOrderAttempts = 0;
      let notificationStatus = "AVAILABLE";
      const orders = Array.from({ length: 5 }, (_, index) => {
        const id = 15 - index;
        return {
          id,
          orderNo: `ORD-NOTIFY-${id}`,
          finalAmount: 6800 - index * 100,
          status: "SHIPPED",
          orderType: "SPOT",
          createdAt: `2026-09-${22 - index}T08:00:00.000Z`,
          paymentConfirmedAt: `2026-09-${22 - index}T08:10:00.000Z`,
          shippedAt: `2026-09-${22 - index}T09:00:00.000Z`,
          items: [{
            id: id * 10,
            productId: id,
            product: { name: id === 11 ? "较早通知定位胸针" : `通知测试作品 ${id}` },
          }],
          payments: [{ id: id * 100, status: "PAID", method: "wechat" }],
          fulfillments: [],
          refunds: [],
          afterSalesCases: [],
          timeline: [],
        };
      });
      const exactHistoricalOrder = {
        ...orders[orders.length - 1],
        id: 3,
        orderNo: "ORD-NOTIFY-HISTORY-3",
        createdAt: "2025-01-03T08:00:00.000Z",
        items: [{
          id: 30,
          productId: 3,
          product: { name: "列表上限外的本人历史订单" },
        }],
      };

      await page.route("**/api/**", async (route: Route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (/^\/api\/customers\/me\/orders\/\d+$/.test(path)) {
          privateOrderDetailRequests.push(path);
        }
        const respond = (data: unknown) => route.fulfill({
          status: 200,
          contentType: "application/json",
          body: apiResponse(data),
        });

        if (path === "/api/customers/me/orders/3") {
          exactHistoricalOrderAttempts += 1;
          if (exactHistoricalOrderAttempts === 1) {
            return route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ code: 503, message: "订单读取暂时不可用" }),
            });
          }
          return respond(exactHistoricalOrder);
        }
        if (/^\/api\/customers\/me\/orders\/\d+$/.test(path)) {
          return route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ code: 404, message: "订单不存在" }),
          });
        }

        if (path === "/api/customers/me") {
          return respond({ id: 7, name: "通知定位客户", phone: "13800000007", email: null });
        }
        if (path === "/api/customers/me/orders") return respond(orders);
        if (path === "/api/customers/me/notifications/91/read") {
          notificationStatus = "READ";
          return respond({ id: 91, status: "READ" });
        }
        if (path === "/api/customers/me/notifications") {
          return respond({
            list: [
              {
                id: 91,
                type: "SERVICE_REFUND_COMPLETED",
                locale: "ZH_CN",
                title: "较早订单退款已完成",
                body: "订单 ORD-NOTIFY-11 的退款已完成。",
                actionUrl: "/customer?orderId=11&section=orders",
                status: notificationStatus,
                availableAt: "2026-09-22T08:00:00.000Z",
                readAt: notificationStatus === "READ" ? "2026-09-22T08:01:00.000Z" : null,
              },
              {
                id: 92,
                type: "SERVICE_LEAD_REPLY",
                locale: "ZH_CN",
                title: "安全咨询入口",
                body: "咨询已有新回复。",
                actionUrl: "/customer?leadId=41&section=consultations",
                status: "READ",
                availableAt: "2026-09-22T07:59:00.000Z",
                readAt: "2026-09-22T08:00:00.000Z",
              },
              {
                id: 93,
                type: "SERVICE_ORDER_CREATED",
                locale: "ZH_CN",
                title: "历史订单入口",
                body: "查看本人订单列表。",
                actionUrl: "/customer?section=orders",
                status: "READ",
                availableAt: "2026-09-22T07:58:00.000Z",
                readAt: "2026-09-22T08:00:00.000Z",
              },
              ...[
                ["近似路径入口", "/customer-evil?section=orders&orderId=11"],
                ["未知参数入口", "/customer?section=orders&orderId=11&next=%2Fadmin"],
                ["重复参数入口", "/customer?section=orders&orderId=11&orderId=12"],
                ["片段入口", "/customer?section=orders&orderId=11#other"],
                ["无效编号入口", "/customer?section=orders&orderId=1e2"],
                ["站外入口", "//example.invalid/customer?section=orders&orderId=11"],
              ].map(([title, actionUrl], index) => ({
                id: 94 + index,
                type: "SERVICE_ORDER_CREATED",
                locale: "ZH_CN",
                title,
                body: "此通知入口应被客户端拒绝。",
                actionUrl,
                status: "READ",
                availableAt: `2026-09-22T07:${57 - index}:00.000Z`,
                readAt: "2026-09-22T08:00:00.000Z",
              })),
            ],
            total: 9,
            unreadCount: notificationStatus === "AVAILABLE" ? 1 : 0,
            page: 1,
            pageSize: 20,
          });
        }
        if (path === "/api/customers/me/notification-preferences") {
          return respond({ list: [], marketingConsentGranted: false });
        }
        if (path === "/api/customers/me/quotations") {
          return respond({ list: [], total: 0, page: 1, pageSize: 20 });
        }
        if (path === "/api/customers/me/inquiries") {
          return respond({ list: [], total: 0, page: 1, pageSize: 3 });
        }
        if (path === "/api/customers/me/notifications/read-all") return respond({ count: 0 });
        if (path === "/api/settings/flags") {
          return respond({ commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
        }
        if (path === "/api/settings/public") return respond({ siteName: "海川珠宝" });
        if (path === "/api/partners/me") return respond(null);
        return respond([]);
      });
      await installCustomerSession(page, { id: 7, name: "通知定位客户" });

      await page.goto("/customer");
      const notifications = page.getByRole("region", { name: "服务通知" });
      await expect(notifications.getByRole("link", { name: "查看对应订单 →" }).first())
        .toHaveAttribute("href", "/customer?section=orders&orderId=11");
      await expect(notifications.getByRole("link", { name: "查看咨询详情 →" }))
        .toHaveAttribute("href", "/customer?section=consultations&leadId=41");
      await expect(notifications.getByRole("link", { name: "查看对应订单 →" }).nth(1))
        .toHaveAttribute("href", "/customer?section=orders");
      for (const title of [
        "近似路径入口",
        "未知参数入口",
        "重复参数入口",
        "片段入口",
        "无效编号入口",
        "站外入口",
      ]) {
        await expect(notifications.locator("article").filter({ hasText: title }).getByRole("link"))
          .toHaveCount(0);
      }
      await page.getByRole("link", { name: "查看对应订单 →" }).first().click();
      await expect(page).toHaveURL(/\/customer\?section=orders&orderId=11$/);
      const canonicalOrder = page.locator("#customer-order-11");
      await expect(canonicalOrder).toBeVisible();
      await expect(canonicalOrder).toBeFocused();

      await page.reload();
      await expect(canonicalOrder).toBeVisible();
      await expect(canonicalOrder).toBeFocused();

      await page.goto("/customer?section=orders&orderId=3");
      await expect(page.getByRole("alert").filter({
        hasText: "订单定位暂时失败",
      })).toBeVisible();
      await expect(page.locator("#customer-order-3")).toHaveCount(0);
      await page.getByRole("button", { name: "重新定位" }).click();
      const exactHistoricalTarget = page.locator("#customer-order-3");
      await expect(exactHistoricalTarget).toBeVisible();
      await expect(exactHistoricalTarget).toBeFocused();
      await expect(page).toHaveURL(/\/customer\?section=orders&orderId=3$/);
      expect(exactHistoricalOrderAttempts).toBe(2);

      await page.goto("/customer?section=orders&orderId=999");
      await expect(page.getByRole("alert").filter({
        hasText: "未找到这笔订单，或者它不属于当前账户",
      })).toBeVisible();
      await expect(page.getByRole("button", { name: "重新定位" })).toHaveCount(0);

      await page.goto("/customer?section=orders&orderId=1e2");
      await expect(page.getByRole("alert").filter({
        hasText: "订单定位信息无效",
      })).toBeVisible();

      for (const invalidUrl of [
        "/customer?section=orders&orderId=11&orderId=12",
        "/customer?section=consultations&orderId=11",
        "/customer?section=orders&orderId=11&next=%2Fadmin",
      ]) {
        await page.goto(invalidUrl);
        await expect(page.getByRole("alert").filter({
          hasText: "订单定位信息无效",
        })).toBeVisible();
      }

      await page.goto("/customer?section=orders&orderId=999");
      await expect(page.getByRole("alert").filter({
        hasText: "未找到这笔订单，或者它不属于当前账户",
      })).toBeVisible();
      await page.goto("/customer?section=orders");
      await expect(page.getByRole("alert").filter({
        hasText: /订单定位信息无效|未找到这笔订单|订单定位暂时失败/,
      })).toHaveCount(0);
      await page.goBack();
      await expect(page.getByRole("alert").filter({
        hasText: "未找到这笔订单，或者它不属于当前账户",
      })).toBeVisible();
      await page.goForward();
      await expect(page).toHaveURL(/\/customer\?section=orders$/);
      await expect(page.getByRole("alert").filter({
        hasText: /订单定位信息无效|未找到这笔订单|订单定位暂时失败/,
      })).toHaveCount(0);
      expect(privateOrderDetailRequests).toContain("/api/customers/me/orders/3");
      expect(privateOrderDetailRequests).toContain("/api/customers/me/orders/999");
      expect(privateOrderDetailRequests.every((path) =>
        path === "/api/customers/me/orders/3"
        || path === "/api/customers/me/orders/999"
      )).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("切换 canonical 目标后忽略较早精确订单的迟到响应", async ({ page }) => {
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    let firstResponseCompleted = false;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const exactOrder = (id: number) => ({
      id,
      orderNo: `ORD-EXACT-${id}`,
      finalAmount: 6800,
      status: "SHIPPED",
      orderType: "SPOT",
      createdAt: "2025-01-03T08:00:00.000Z",
      items: [{ id: id * 10, productId: id, product: { name: `历史订单 ${id}` } }],
      payments: [],
      fulfillments: [],
      refunds: [],
      afterSalesCases: [],
      timeline: [],
    });

    await page.route("**/api/**", async (route: Route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(data),
      });
      if (path === "/api/customers/me/orders/701") {
        markFirstStarted();
        await firstGate;
        await respond(exactOrder(701));
        firstResponseCompleted = true;
        return;
      }
      if (path === "/api/customers/me/orders/702") return respond(exactOrder(702));
      if (path === "/api/customers/me") {
        return respond({ id: 7, name: "迟到订单客户", phone: "13800000007", email: null });
      }
      if (path === "/api/customers/me/orders") return respond([]);
      if (path === "/api/customers/me/notifications") {
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/customers/me/inquiries") {
        return respond({ list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/settings/flags") {
        return respond({ commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path === "/api/settings/public") return respond({ siteName: "海川珠宝" });
      if (path === "/api/partners/me") return respond(null);
      return respond([]);
    });
    await installCustomerSession(page, { id: 7, name: "迟到订单客户" });

    await page.goto("/customer?section=orders&orderId=701");
    await firstStarted;
    await page.goto("/customer?section=orders&orderId=702");
    const latestTarget = page.locator("#customer-order-702");
    await expect(latestTarget).toBeVisible();
    await expect(latestTarget).toBeFocused();

    releaseFirst();
    await expect.poll(() => firstResponseCompleted).toBe(true);
    await expect(page.locator("#customer-order-701")).toHaveCount(0);
    await expect(latestTarget).toBeVisible();
    await expect(page).toHaveURL(/\/customer\?section=orders&orderId=702$/);
  });
});
