import { expect, test, type Route } from "@playwright/test";
import { installCustomerSession, readSessionHeaders } from "./fixtures/session-auth";

function apiResponse(data: unknown) {
  return JSON.stringify({ code: 200, data, message: "success" });
}

test.describe("收敛闭环：公开语言与客户通知", () => {
  test("英文内容页只请求英文公开事实，未开放英文业务区保持 noindex", async ({ page }) => {
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

    await page.goto("/en/about");
    await expect(page.getByRole("heading", { name: "About is not published" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    expect(apiRequests.some((requestUrl) => requestUrl.includes("locale=en"))).toBe(true);
    expect(apiRequests.some((requestUrl) => requestUrl.includes("locale=zh-CN"))).toBe(false);

    apiRequests.length = 0;
    await page.goto("/EN/about");
    await expect(page.getByRole("heading", { name: "About is not published" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(apiRequests.some((requestUrl) => requestUrl.includes("locale=en"))).toBe(true);
    expect(apiRequests.some((requestUrl) => requestUrl.includes("locale=zh-CN"))).toBe(false);

    for (const path of [
      "/en/catalog",
      "/en/products/HC-001",
      "/en/contact",
      "/en/privacy",
    ]) {
      apiRequests.length = 0;
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "English site is not published yet" }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      await expect(page.locator('[data-locale-availability="unavailable"]')).toBeVisible();
      expect(apiRequests, path).toEqual([]);
    }

    await page.getByRole("link", { name: "Visit the Chinese site" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  });

  test("英文页面只在本语言发布事实有效时开放，并在撤销或失效后清除旧正文", async ({ page }) => {
    const englishTitle = "SYNTHETIC ENGLISH ABOUT PUBLICATION";
    const publishedFact = {
      pageKey: "about",
      locale: "en",
      status: "PUBLISHED",
      puckData: {
        content: [{
          type: "首屏主视觉",
          props: {
            id: "english-about-publication",
            title: englishTitle,
            subtitle: "English publication fact only",
            desktopImage: "/images/hero-desktop.jpg",
            mobileImage: "/images/hero-mobile.jpg",
            altText: "Synthetic jewelry image",
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
    let englishFact: unknown = publishedFact;
    const requestedLocales: string[] = [];

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/page-modules/document/published") {
        const locale = url.searchParams.get("locale") ?? "";
        requestedLocales.push(locale);
        await route.fulfill({
          contentType: "application/json",
          body: apiResponse(locale === "en" ? englishFact : null),
        });
        return;
      }
      await route.abort();
    });

    await page.goto("/en/about");
    await expect(page.getByText(englishTitle, { exact: true })).toBeVisible();
    await expect(page.locator('[data-locale-availability="unavailable"]')).toHaveCount(0);
    expect(requestedLocales.filter((locale) => locale === "en").length).toBeGreaterThan(0);

    englishFact = {
      pageKey: "about",
      status: "INVALID",
      invalidReason: "publication-revalidation-required",
    };
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByRole("heading", { name: "About is not published" })).toBeVisible();
    await expect(page.getByText(englishTitle, { exact: true })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );

    englishFact = publishedFact;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByText(englishTitle, { exact: true })).toBeVisible();

    englishFact = null;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByRole("heading", { name: "About is not published" })).toBeVisible();
    await expect(page.getByText(englishTitle, { exact: true })).toHaveCount(0);
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
});
