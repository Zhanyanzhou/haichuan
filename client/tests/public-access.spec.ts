import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { installCustomerSession } from "./fixtures/session-auth";

const publicRoutes = [
  "/products",
  "/products/2147483647",
  "/catalog",
  "/search",
];
const apiBaseURL = process.env.PLAYWRIGHT_API_BASE_URL?.replace(/\/$/, "");
const customerStorageState = process.env.PLAYWRIGHT_CUSTOMER_STORAGE_STATE;
const useMock = process.env.VITE_USE_MOCK === "true";

const forbiddenProductFields = [
  "visibility",
  "status",
  "sortOrder",
  "viewCount",
  "salesCount",
  "publishedAt",
  "createdAt",
  "updatedAt",
  "totalStock",
  "craftFee",
  "multiDiscount",
];

const forbiddenImageFields = [
  "url",
  "storageKey",
  "sourceImageId",
  "cropData",
  "fileSize",
  "mimeType",
];

function apiUrl(path: string) {
  return `${apiBaseURL}${path}`;
}

function unwrap(body: any) {
  return body?.data ?? body;
}

function expectSafeProduct(product: Record<string, any>) {
  for (const field of forbiddenProductFields)
    expect(product).not.toHaveProperty(field);

  const images = [
    ...(Array.isArray(product.images) ? product.images : []),
    product.primaryImage,
    product.listingImage,
  ].filter(Boolean);
  for (const image of images) {
    for (const field of forbiddenImageFields)
      expect(image).not.toHaveProperty(field);
    expect(image.mediaUrl).toMatch(
      /^\/products\/(public|catalog)\/\d+\/media\/\d+$/,
    );
  }

  for (const sku of Array.isArray(product.skus) ? product.skus : []) {
    expect(sku).not.toHaveProperty("stock");
    expect(sku).not.toHaveProperty("safetyStock");
    expect(sku).not.toHaveProperty("inventories");
    expect(sku).not.toHaveProperty("skuCode");
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function navigateInSpa(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test.describe("游客公开浏览", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("customerToken");
      localStorage.removeItem("customer");
    });
    // 无真实后端的 route-mock 项目必须明确区分“未登录 401”与网络/服务失败；
    // 后者由客户路由守卫保留未知态并允许重试。
    await page.route("**/api/customers/me", (route) => route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: 401, message: "anonymous" }),
    }));
    await page.route("**/api/customers/session/refresh", (route) => route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: 401, message: "expired" }),
    }));
  });

  for (const path of publicRoutes) {
    test(`${path} 不再跳转到客户登录`, async ({ page }) => {
      await page.goto(path);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(path === "/search" ? "/catalog" : path);
      await expect(page.getByRole("banner")).toBeVisible();
    });
  }

  test("旧合作入口要求登录并回到我的账户内唯一申请入口", async ({ page }) => {
    await page.goto("/partner");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/customer");

    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/api/settings/flags")
        ? {
            commerceEnabled: false,
            cartEnabled: false,
            paymentEnabled: false,
            partnerApplicationsWriteEnabled: true,
          }
        : null;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
    });
    await installCustomerSession(page, { id: 7, name: "合作申请测试客户" });
    await page.goto("/partner");
    await expect(page).toHaveURL(/\/customer\?section=partner$/);
    await expect(page.getByText("合作申请暂未开放", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "提交申请" })).toHaveCount(0);
  });

  test("客户会话验证遇到 500 时保留未知态且可原地重试，不伪装成退出登录", async ({ page }) => {
    let profileUnavailable = true;
    let profileRequests = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me") {
        profileRequests += 1;
        if (profileUnavailable) {
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ code: 503, message: "temporary unavailable" }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            code: 200,
            data: { id: 7, phone: "13800000007", name: "恢复验证客户", email: null },
            message: "success",
          }),
        });
      }
      const data = path === "/api/settings/flags"
        ? {
            commerceEnabled: false,
            cartEnabled: false,
            paymentEnabled: false,
            partnerApplicationsWriteEnabled: true,
          }
        : path === "/api/customers/me/notifications"
          ? { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 }
          : path === "/api/customers/me/inquiries"
            ? { list: [], total: 0, page: 1, pageSize: 5 }
            : path === "/api/partner-applications/me"
              ? null
              : [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
    });

    await page.goto("/partner");
    await expect(page).toHaveURL(/\/partner$/);
    await expect(page.getByRole("alert")).toContainText(
      "登录状态暂时无法确认，当前页面没有加载任何账户数据。",
    );
    await expect(page.getByRole("button", { name: "重新验证" })).toBeVisible();
    await expect(page.getByRole("button", { name: "会员登录 / 注册" })).toHaveCount(0);

    profileUnavailable = false;
    await page.getByRole("button", { name: "重新验证" }).click();
    await expect.poll(() => profileRequests).toBe(2);
    await expect(page).toHaveURL(/\/customer\?section=partner$/);
    await expect(page.getByText("合作申请暂未开放", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "提交申请" })).toHaveCount(0);
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`未登录我的账户只呈现一套会员入口 @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.route("**/api/customers/sms-requirements", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { registerRequired: true } }),
      }));
      await page.route("**/api/customers/wechat/config**", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { enabled: false } }),
      }));

      await page.goto("/customer");

      await expect(page.getByRole("heading", { level: 1, name: /您的珠宝档案/ }))
        .toBeVisible();
      await expect(page.locator("#member-access-form")).toBeVisible();
      await expect(page.getByRole("button", { name: "会员登录", exact: true }))
        .toBeVisible();
      await expect(page.getByText("账户首页", { exact: true })).toHaveCount(0);
      await expect(page.getByText("我的订单", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "注册会员" }).click();
      await expect(page.getByRole("button", { name: "创建会员账户" })).toBeVisible();
      await expect(page.getByLabel("称呼")).toBeVisible();
      await expect(page.getByLabel("邮箱（选填）")).toBeVisible();
      await expect(page.getByLabel("短信验证码")).toBeVisible();
      const registerPassword = page.getByLabel("密码");
      await expect(registerPassword).toHaveAttribute("minlength", "6");
      await expect(registerPassword).toHaveAttribute("maxlength", "18");
      await expect(page.getByText("密码需为 6–18 位，并同时包含字母和数字", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("三级登录失败后显示 Unicode 图形验证码并在失败后自动换新", async ({ page }) => {
    const loginBodies: Array<Record<string, unknown>> = [];
    let failedLogins = 0;
    let captchaRequests = 0;

    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const fulfill = (status: number, data: unknown, message = "success") =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ code: status, data, message }),
        });

      if (pathname.endsWith("/api/customers/login/challenge")) {
        return fulfill(200, {
          level: failedLogins >= 3 ? "captcha" : "none",
        });
      }
      if (pathname.endsWith("/api/customers/login/captcha")) {
        captchaRequests += 1;
        const code = captchaRequests === 1 ? "ABCD" : `EFG${captchaRequests}`;
        return fulfill(200, {
          captchaId: `captcha-${captchaRequests}`,
          svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="44" role="img" aria-label="图形验证码"><rect width="160" height="44" fill="#f3efe7"/><text x="18" y="29">${code} 验证码</text></svg>`,
        });
      }
      if (pathname.endsWith("/api/customers/login")) {
        loginBodies.push(route.request().postDataJSON() as Record<string, unknown>);
        failedLogins += 1;
        return fulfill(401, null, "手机号或密码不正确");
      }
      if (
        pathname.endsWith("/api/customers/me") ||
        pathname.endsWith("/api/customers/session/refresh")
      ) {
        return fulfill(401, null, "未登录");
      }
      if (pathname.endsWith("/api/customers/sms-requirements")) {
        return fulfill(200, { registerRequired: true });
      }
      if (pathname.endsWith("/api/customers/wechat/config")) {
        return fulfill(200, { enabled: false });
      }
      if (pathname.endsWith("/api/settings/flags")) {
        return fulfill(200, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      return fulfill(200, null);
    });

    await page.goto("/customer");
    await page.getByLabel("手机号").fill("13800138000");
    await page.getByLabel("密码").fill("wrong-password");
    const loginButton = page.getByRole("button", { name: "登录我的账户" });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await loginButton.click();
      await expect.poll(() => loginBodies.length).toBe(attempt);
      await expect(loginButton).toBeEnabled();
    }

    const captchaImage = page.getByRole("img", { name: "图形验证码" });
    await expect(captchaImage).toBeVisible();
    await expect(captchaImage).toHaveAttribute("title", "点击刷新");
    await expect.poll(() => captchaRequests).toBe(1);
    await expect.poll(() =>
      captchaImage.evaluate((image) => {
        const element = image as HTMLImageElement;
        return element.complete && element.naturalWidth > 0;
      }),
    ).toBe(true);
    const firstSource = await captchaImage.getAttribute("src");
    expect(firstSource).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(firstSource).toContain("%E5%9B%BE%E5%BD%A2%E9%AA%8C%E8%AF%81%E7%A0%81");

    await page.getByLabel("图形验证码").fill("ABCD");
    await loginButton.click();
    await expect.poll(() => loginBodies.length).toBe(4);
    expect(loginBodies[3]).toMatchObject({
      captchaId: "captcha-1",
      captchaCode: "ABCD",
    });

    await expect.poll(() => captchaRequests).toBe(2);
    await expect(page.getByLabel("图形验证码")).toHaveValue("");
    const secondSource = await captchaImage.getAttribute("src");
    expect(secondSource).not.toBe(firstSource);

    await page.getByLabel("图形验证码").fill("EFG2");
    await loginButton.click();
    await expect.poll(() => loginBodies.length).toBe(5);
    expect(loginBodies[4]).toMatchObject({
      captchaId: "captcha-2",
      captchaCode: "EFG2",
    });

    await expect.poll(() => captchaRequests).toBe(3);
    await captchaImage.click();
    await expect.poll(() => captchaRequests).toBe(4);
  });

  test("微信回调同时校验 origin/source 与固定消息 Schema", async ({ page, baseURL }) => {
    await page.route("**/api/customers/me", (route) =>
      route.fulfill({ status: 401, body: "{}" }),
    );
    await page.route("**/api/customers/sms-requirements", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: { registerRequired: true },
          message: "success",
        }),
      }),
    );
    await page.route("**/api/customers/wechat/config**", (route) => {
      const origin = new URL(route.request().url()).origin;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            enabled: true,
            qrConnectUrl: `${origin}/wechat-oauth-frame`,
            callbackOrigin: origin,
          },
          message: "success",
        }),
      });
    });
    await page.route("**/wechat-oauth-frame", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>wechat oauth frame</title>",
      }),
    );

    await page.goto("/customer");
    const iframe = page.locator('iframe[title="微信扫码登录"]');
    await expect(iframe).toBeVisible();
    await expect.poll(() => page.frames().length).toBeGreaterThan(1);

    const validMessage = {
      type: "wechat-login-result",
      version: 1,
      payload: {
        kind: "need-bind",
        bindToken: "header.payload.signature",
      },
    };
    await page.evaluate((data) => {
      window.postMessage(data, window.location.origin);
    }, validMessage);
    await expect(page.getByText("已通过微信验证身份")).toHaveCount(0);

    await page.evaluate((data) => {
      const source = document.querySelector<HTMLIFrameElement>(
        'iframe[title="微信扫码登录"]',
      )?.contentWindow;
      window.dispatchEvent(
        new MessageEvent("message", {
          data,
          origin: "https://attacker.example",
          source,
        }),
      );
    }, validMessage);
    await expect(page.getByText("已通过微信验证身份")).toHaveCount(0);

    await page.evaluate((data) => {
      const source = document.querySelector<HTMLIFrameElement>(
        'iframe[title="微信扫码登录"]',
      )?.contentWindow;
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { ...data, unexpected: true },
          origin: window.location.origin,
          source,
        }),
      );
    }, validMessage);
    await expect(page.getByText("已通过微信验证身份")).toHaveCount(0);

    const iframeHandle = await iframe.elementHandle();
    const oauthFrame = await iframeHandle?.contentFrame();
    expect(oauthFrame).not.toBeNull();
    await oauthFrame!.evaluate(({ data, parentOrigin }) => {
      window.parent.postMessage(data, parentOrigin);
    }, { data: validMessage, parentOrigin: new URL(baseURL!).origin });
    await expect(page.getByText("已通过微信验证身份")).toBeVisible();
  });

  test("找回密码同步阻止重复提交且失败后可以原地重试", async ({ page }) => {
    let requestCount = 0;
    let releaseFirstRequest: (() => void) | undefined;
    await page.route("**/api/customers/forgot-password", async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstRequest = resolve;
        });
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code: 400, message: "暂时无法处理找回请求" }),
        });
        return;
      }
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { accepted: true }, message: "success" }),
      });
    });

    await page.goto("/customer/forgot");
    await page.getByLabel("注册邮箱").fill("member@example.test");
    await page.locator("form").evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect.poll(() => typeof releaseFirstRequest).toBe("function");
    await expect.poll(() => requestCount).toBe(1);
    await expect(page.getByLabel("注册邮箱")).toBeDisabled();

    releaseFirstRequest!();
    await expect(page.getByText("暂时无法处理找回请求")).toBeVisible();
    await expect(page.getByRole("button", { name: "提交找回请求" })).toBeEnabled();
    await page.getByRole("button", { name: "提交找回请求" }).click();
    await expect.poll(() => requestCount).toBe(2);
    await expect(page.getByRole("heading", { name: "找回请求已受理" })).toBeVisible();
    await expect(page.getByText(/若该邮箱已注册，我们已受理找回请求/)).toBeVisible();
  });

  test("离开找回密码页后迟到失败不在新页面弹错", async ({ page }) => {
    let releaseRequest: (() => void) | undefined;
    let requestSettled = false;
    await page.route("**/api/customers/forgot-password", async (route) => {
      await new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: 503, message: "离开后的旧找回请求失败" }),
      });
      requestSettled = true;
    });

    await page.goto("/customer/forgot");
    await page.getByLabel("注册邮箱").fill("member@example.test");
    await page.getByRole("button", { name: "提交找回请求" }).click();
    await expect.poll(() => typeof releaseRequest).toBe("function");

    await navigateInSpa(page, "/privacy");
    await expect(page.getByRole("heading", { name: "隐私说明" })).toBeVisible();
    releaseRequest!();
    await expect.poll(() => requestSettled).toBe(true);
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByText("离开后的旧找回请求失败")).toHaveCount(0);
    await expect(page.getByText("服务器繁忙，请稍后再试", { exact: true })).toHaveCount(0);
  });

  test("公开密码恢复端点的异常 401 不刷新或清理任一登录身份", async ({ page }) => {
    let refreshRequests = 0;
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/session/refresh" || path === "/api/customers/session/refresh") {
        refreshRequests += 1;
      }
    });
    await page.route("**/api/customers/forgot-password", (route) => route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: 401, message: "公开端点异常返回 401" }),
    }));

    await page.goto("/customer/forgot");
    await page.evaluate(async () => {
      const [{ useAuthStore }, { useCustomerAuthStore }] = await Promise.all([
        import("/src/store/authStore.ts"),
        import("/src/store/customerAuthStore.ts"),
      ]);
      useAuthStore.getState().setAuth({
        id: 71,
        username: "admin-preserved",
        realName: "保留管理员",
        role: "ADMIN",
        status: "ACTIVE",
        createdAt: "2026-09-23T00:00:00.000Z",
      });
      useCustomerAuthStore.getState().setAuth({
        id: 72,
        phone: "13800000072",
        name: "保留客户",
        email: "member@example.test",
      });
    });

    await page.getByLabel("注册邮箱").fill("member@example.test");
    await page.getByRole("button", { name: "提交找回请求" }).click();
    await expect(page.getByRole("alert")).toContainText("公开端点异常返回 401");
    await expect.poll(() => refreshRequests).toBe(0);
    await expect(page.evaluate(async () => {
      const [{ useAuthStore }, { useCustomerAuthStore }] = await Promise.all([
        import("/src/store/authStore.ts"),
        import("/src/store/customerAuthStore.ts"),
      ]);
      return {
        adminId: useAuthStore.getState().user?.id,
        adminStatus: useAuthStore.getState().status,
        customerId: useCustomerAuthStore.getState().customer?.id,
        customerStatus: useCustomerAuthStore.getState().status,
      };
    })).resolves.toEqual({
      adminId: 71,
      adminStatus: "authenticated",
      customerId: 72,
      customerStatus: "authenticated",
    });
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "390px", width: 390, height: 844 },
  ]) {
    test(`找回请求以 202 受理且不把受理冒充送达 @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.route("**/api/customers/forgot-password", (route) => route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { accepted: true }, message: "success" }),
      }));

      await page.goto("/customer/forgot");
      await page.getByLabel("注册邮箱").fill("member@example.test");
      await page.getByRole("button", { name: "提交找回请求" }).click();

      const accepted = page.getByRole("status");
      await expect(accepted.getByRole("heading", { name: "找回请求已受理" })).toBeVisible();
      await expect(accepted).toContainText("若该邮箱已注册，我们已受理找回请求");
      await expect(accepted).not.toContainText("邮件已发送");
      await expectNoHorizontalOverflow(page);
    });

    test(`找回请求网络结果未知时同步阻止重复提交且不立刻重放 @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      let requestCount = 0;
      let releaseRequest: (() => void) | undefined;
      await page.route("**/api/customers/forgot-password", async (route) => {
        requestCount += 1;
        await new Promise<void>((resolve) => {
          releaseRequest = resolve;
        });
        await route.abort("failed");
      });

      await page.goto("/customer/forgot");
      await page.getByLabel("注册邮箱").fill("member@example.test");
      await page.locator("form").evaluate((form) => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await expect.poll(() => typeof releaseRequest).toBe("function");
      await expect.poll(() => requestCount).toBe(1);

      releaseRequest!();
      await expect(page.getByRole("heading", { name: "请求结果待确认" })).toBeVisible();
      await expect(page.getByText("Network Error", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "提交找回请求" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "返回客户中心登录" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test(`找回请求按 Retry-After 安全限流且不叠加全局错误 @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.route("**/api/customers/forgot-password", (route) => route.fulfill({
        status: 429,
        // 测试环境的 API 基址与页面跨源；非 safelist 响应头须显式 Expose 才能被 JS 读取，
        // 生产同源部署无此限制。
        headers: { "Retry-After": "120", "Access-Control-Expose-Headers": "Retry-After" },
        contentType: "application/json",
        body: JSON.stringify({ code: 429, message: "请求过于频繁", errorCode: "HTTP_429" }),
      }));

      await page.goto("/customer/forgot");
      await page.getByLabel("注册邮箱").fill("member@example.test");
      await page.getByRole("button", { name: "提交找回请求" }).click();

      await expect(page.getByRole("button", { name: /秒后可重试/ })).toBeDisabled();
      await expect(page.getByRole("alert")).toContainText(/请在 1(?:19|20) 秒后重试/);
      await expect(page.getByText("操作过于频繁，请稍后再试", { exact: true })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("登录挑战迟到时不会在登录组件卸载后继续发送凭据", async ({ page }) => {
    let challengeRequests = 0;
    let loginRequests = 0;
    let releaseChallenge: (() => void) | undefined;
    let challengeSettled = false;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (status: number, data: unknown, message = "success") =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ code: status, data, message }),
        });
      if (path === "/api/customers/login/challenge") {
        challengeRequests += 1;
        await new Promise<void>((resolve) => {
          releaseChallenge = resolve;
        });
        await respond(200, { level: "none" });
        challengeSettled = true;
        return;
      }
      if (path === "/api/customers/login") {
        loginRequests += 1;
        return respond(200, {
          customer: { id: 7, phone: "13800000007", name: "旧登录", email: null },
        });
      }
      if (
        path === "/api/customers/me"
        || path === "/api/customers/session/refresh"
      ) return respond(401, null, "未登录");
      if (path === "/api/customers/sms-requirements") {
        return respond(200, { registerRequired: true });
      }
      if (path === "/api/customers/wechat/config") {
        return respond(200, { enabled: false });
      }
      return respond(200, null);
    });

    await page.goto("/customer");
    await page.getByLabel("手机号").fill("13800000007");
    await page.getByLabel("密码").fill("old-login-pass");
    await page.locator("#member-access-form").evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect.poll(() => typeof releaseChallenge).toBe("function");
    await expect.poll(() => challengeRequests).toBe(1);

    await navigateInSpa(page, "/privacy");
    await expect(page.getByRole("heading", { name: "隐私说明" })).toBeVisible();
    releaseChallenge!();
    await expect.poll(() => challengeSettled).toBe(true);
    await page.waitForTimeout(100);
    expect(loginRequests).toBe(0);
  });

  test("登录挑战读取失败时不发送密码且可原地重试", async ({ page }) => {
    let challengeRequests = 0;
    let loginRequests = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (status: number, data: unknown, message = "success") =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ code: status, data, message }),
        });
      if (path === "/api/customers/login/challenge") {
        challengeRequests += 1;
        return respond(503, null, "internal challenge dependency unavailable");
      }
      if (path === "/api/customers/login") {
        loginRequests += 1;
        return respond(200, {
          customer: { id: 7, phone: "13800000007", name: "不应登录", email: null },
        });
      }
      if (
        path === "/api/customers/me"
        || path === "/api/customers/session/refresh"
      ) return respond(401, null, "未登录");
      if (path === "/api/customers/sms-requirements") {
        return respond(200, { registerRequired: true });
      }
      if (path === "/api/customers/wechat/config") {
        return respond(200, { enabled: false });
      }
      return respond(200, null);
    });

    await page.goto("/customer");
    await page.getByLabel("手机号").fill("13800000007");
    await page.getByLabel("密码").fill("challenge-read-failure");
    await page.getByRole("button", { name: "登录我的账户" }).click();

    await expect.poll(() => challengeRequests).toBe(1);
    expect(loginRequests).toBe(0);
    await expect(page.getByRole("alert").filter({
      hasText: "登录验证暂时不可用，请稍后重试。",
    })).toHaveText("登录验证暂时不可用，请稍后重试。");
    await expect(page.getByText("服务器繁忙，请稍后再试")).toHaveCount(0);
    await expect(page.getByText("internal challenge dependency unavailable")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "登录我的账户" })).toBeEnabled();
  });

  test("登录页卸载后迟到成功不写入客户身份或弹出成功提示", async ({ page }) => {
    const customer = {
      id: 7,
      phone: "13800000007",
      name: "迟到登录客户",
      email: null,
    };
    let releaseLogin: (() => void) | undefined;
    let loginSettled = false;
    let loginSucceeded = false;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (status: number, data: unknown, message = "success") =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ code: status, data, message }),
        });
      if (path === "/api/customers/login/challenge") {
        return respond(200, { level: "none" });
      }
      if (path === "/api/customers/login") {
        await new Promise<void>((resolve) => {
          releaseLogin = resolve;
        });
        loginSucceeded = true;
        await respond(200, { customer });
        loginSettled = true;
        return;
      }
      if (path === "/api/customers/me") {
        return loginSucceeded
          ? respond(200, customer)
          : respond(401, null, "未登录");
      }
      if (path === "/api/customers/session/refresh") {
        return respond(401, null, "未登录");
      }
      if (path === "/api/customers/sms-requirements") {
        return respond(200, { registerRequired: true });
      }
      if (path === "/api/customers/wechat/config") {
        return respond(200, { enabled: false });
      }
      if (path === "/api/customers/me/notifications") {
        return respond(200, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/customers/me/inquiries") {
        return respond(200, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/partner-applications/me") return respond(200, null);
      return respond(200, []);
    });

    await page.goto("/customer");
    await page.getByLabel("手机号").fill(customer.phone);
    await page.getByLabel("密码").fill("late-login-pass");
    await page.getByRole("button", { name: "登录我的账户" }).click();
    await expect.poll(() => typeof releaseLogin).toBe("function");

    await navigateInSpa(page, "/privacy");
    await expect(page.getByRole("heading", { name: "隐私说明" })).toBeVisible();
    releaseLogin!();
    await expect.poll(() => loginSettled).toBe(true);
    await page.waitForTimeout(100);
    const authState = await page.evaluate(async () => {
      const { useCustomerAuthStore } = await import("/src/store/customerAuthStore.ts");
      const state = useCustomerAuthStore.getState();
      return { status: state.status, customerId: state.customer?.id ?? null };
    });
    expect(authState).toEqual({ status: "anonymous", customerId: null });
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByText("已登录您的会员账户")).toHaveCount(0);
  });

  test("客户登录返回路径只接受可解析的同源内部地址", async ({ page }) => {
    await page.goto("/customer");
    const normalized = await page.evaluate(async () => {
      const { normalizeCustomerReturnPath } = await import(
        "/src/pages/public/CustomerCenter/index.tsx"
      );
      return {
        safe: normalizeCustomerReturnPath(" /catalog?page=2#selection "),
        protocolRelative: normalizeCustomerReturnPath("//attacker.example/steal"),
        backslash: normalizeCustomerReturnPath("/\\attacker.example/steal"),
        external: normalizeCustomerReturnPath("https://attacker.example/steal"),
        control: normalizeCustomerReturnPath("/catalog\n/steal"),
      };
    });

    expect(normalized).toEqual({
      safe: "/catalog?page=2#selection",
      protocolRelative: null,
      backslash: null,
      external: null,
      control: null,
    });
  });

  test("会员密码重置页兼容旧 query 并立即清除地址栏令牌", async ({ page }) => {
    const resetToken = "a".repeat(64);
    await page.goto(`/customer/reset?token=${resetToken}`);
    const password = page.getByLabel("新密码", { exact: true });
    const confirmation = page.getByLabel("确认新密码", { exact: true });
    await expect(page).toHaveURL(/\/customer\/reset$/);
    expect(page.url()).not.toContain(resetToken);
    await expect(password).toHaveAttribute("minlength", "6");
    await expect(password).toHaveAttribute("maxlength", "18");
    await expect(confirmation).toHaveAttribute("minlength", "6");
    await expect(confirmation).toHaveAttribute("maxlength", "18");
    await expect(page.getByText("密码需为 6–18 位，并同时包含字母和数字。", { exact: true })).toBeVisible();
  });

  test("会员密码重置页读取新 fragment 后清除地址栏且提交原令牌", async ({ page }) => {
    const resetToken = "b".repeat(64);
    let submittedToken = "";
    await page.route("**/api/customers/reset-password", async (route) => {
      submittedToken = String(route.request().postDataJSON()?.token || "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { message: "ok" }, message: "success" }),
      });
    });

    await page.goto(`/customer/reset#token=${resetToken}`);
    await expect(page).toHaveURL(/\/customer\/reset$/);
    expect(page.url()).not.toContain(resetToken);
    await page.getByLabel("新密码", { exact: true }).fill("safe-pass-123");
    await page.getByLabel("确认新密码", { exact: true }).fill("safe-pass-123");
    await page.getByRole("button", { name: "重置密码" }).click();
    await expect.poll(() => submittedToken).toBe(resetToken);
  });

  test("会员密码重置页首次缺少令牌时保持无效态", async ({ page }) => {
    await page.goto("/customer/reset");
    await expect(page.getByRole("heading", { name: "重置链接无效" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重置密码" })).toHaveCount(0);
  });

  test("同一 SPA 实例收到新令牌时清空密码并只提交新令牌", async ({ page }) => {
    const firstToken = "a".repeat(64);
    const secondToken = "b".repeat(64);
    const submittedTokens: string[] = [];
    await page.route("**/api/customers/reset-password", async (route) => {
      submittedTokens.push(String(route.request().postDataJSON()?.token || ""));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { message: "ok" }, message: "success" }),
      });
    });

    await page.goto(`/customer/reset#token=${firstToken}`);
    await expect(page).toHaveURL(/\/customer\/reset$/);
    await page.getByLabel("新密码", { exact: true }).fill("first-pass-123");
    await page.getByLabel("确认新密码", { exact: true }).fill("first-pass-123");

    await navigateInSpa(page, `/customer/reset#token=${secondToken}`);
    await expect(page).toHaveURL(/\/customer\/reset$/);
    expect(page.url()).not.toContain(secondToken);
    await expect(page.getByLabel("新密码", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("确认新密码", { exact: true })).toHaveValue("");

    await page.getByLabel("新密码", { exact: true }).fill("second-pass-123");
    await page.getByLabel("确认新密码", { exact: true }).fill("second-pass-123");
    await page.getByRole("button", { name: "重置密码" }).click();
    await expect.poll(() => submittedTokens).toEqual([secondToken]);
  });

  test("显式空值或非法新令牌替换旧令牌且进入无效态", async ({ page }) => {
    const resetToken = "a".repeat(64);
    await page.goto(`/customer/reset#token=${resetToken}`);
    await expect(page.getByRole("heading", { name: "设置新密码" })).toBeVisible();

    await navigateInSpa(page, "/customer/reset#token=not-a-reset-token");
    await expect(page).toHaveURL(/\/customer\/reset$/);
    await expect(page.getByRole("heading", { name: "重置链接无效" })).toBeVisible();

    await navigateInSpa(page, "/customer/reset?token=");
    await expect(page).toHaveURL(/\/customer\/reset$/);
    await expect(page.getByRole("heading", { name: "重置链接无效" })).toBeVisible();
  });

  for (const staleResponse of [
    { label: "成功", status: 200, message: "success" },
    { label: "失败", status: 400, message: "旧请求失败" },
  ]) {
    test(`旧令牌请求迟到${staleResponse.label}不污染新令牌流程`, async ({ page }) => {
      const firstToken = "a".repeat(64);
      const secondToken = "b".repeat(64);
      const submittedTokens: string[] = [];
      let releaseFirstRequest: (() => void) | undefined;
      let firstRequestSettled = false;
      await page.route("**/api/customers/reset-password", async (route) => {
        const submittedToken = String(route.request().postDataJSON()?.token || "");
        submittedTokens.push(submittedToken);
        if (submittedToken === firstToken) {
          await new Promise<void>((resolve) => {
            releaseFirstRequest = resolve;
          });
          await route.fulfill({
            status: staleResponse.status,
            contentType: "application/json",
            body: JSON.stringify({
              code: staleResponse.status,
              data: staleResponse.status === 200 ? { message: "ok" } : null,
              message: staleResponse.message,
            }),
          });
          firstRequestSettled = true;
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ code: 200, data: { message: "ok" }, message: "success" }),
        });
      });

      await page.goto(`/customer/reset#token=${firstToken}`);
      await page.getByLabel("新密码", { exact: true }).fill("first-pass-123");
      await page.getByLabel("确认新密码", { exact: true }).fill("first-pass-123");
      await page.getByRole("button", { name: "重置密码" }).click();
      await expect.poll(() => typeof releaseFirstRequest).toBe("function");

      await navigateInSpa(page, `/customer/reset#token=${secondToken}`);
      await expect(page).toHaveURL(/\/customer\/reset$/);
      await expect(page.getByLabel("新密码", { exact: true })).toHaveValue("");
      await expect(page.getByRole("button", { name: "重置密码" })).toBeEnabled();

      releaseFirstRequest!();
      await expect.poll(() => firstRequestSettled).toBe(true);
      await expect(page).toHaveURL(/\/customer\/reset$/);
      await expect(page.getByText("密码已重置，请使用新密码登录")).toHaveCount(0);
      await expect(page.getByText("旧请求失败")).toHaveCount(0);

      await page.getByLabel("新密码", { exact: true }).fill("second-pass-123");
      await page.getByLabel("确认新密码", { exact: true }).fill("second-pass-123");
      await page.getByRole("button", { name: "重置密码" }).click();
      await expect.poll(() => submittedTokens).toEqual([firstToken, secondToken]);
    });
  }

  test("重置页卸载后迟到成功或失败均不产生提示或跳转", async ({ page }) => {
    const responses = [
      { status: 200, message: "success" },
      { status: 503, message: "卸载后的旧请求失败" },
    ];
    let requestIndex = 0;
    let releaseRequest: (() => void) | undefined;
    let settledRequests = 0;
    await page.route("**/api/customers/reset-password", async (route) => {
      const response = responses[requestIndex];
      requestIndex += 1;
      await new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify({
          code: response.status,
          data: response.status === 200 ? { message: "ok" } : null,
          message: response.message,
        }),
      });
      settledRequests += 1;
    });

    for (let index = 0; index < responses.length; index += 1) {
      const resetToken = (index === 0 ? "a" : "b").repeat(64);
      releaseRequest = undefined;
      if (index === 0) {
        await page.goto(`/customer/reset#token=${resetToken}`);
      } else {
        await navigateInSpa(page, `/customer/reset#token=${resetToken}`);
      }
      await expect(page.getByRole("heading", { name: "设置新密码" })).toBeVisible();
      await page.getByLabel("新密码", { exact: true }).fill("safe-pass-123");
      await page.getByLabel("确认新密码", { exact: true }).fill("safe-pass-123");
      await page.getByRole("button", { name: "重置密码" }).click();
      await expect.poll(() => typeof releaseRequest).toBe("function");

      await navigateInSpa(page, "/privacy");
      await expect(page).toHaveURL(/\/privacy$/);
      await expect(page.getByRole("heading", { name: "隐私说明" })).toBeVisible();
      await expect(page.getByRole("button", { name: "重置密码" })).toHaveCount(0);
      releaseRequest!();
      await expect.poll(() => settledRequests).toBe(index + 1);
      await expect(page).toHaveURL(/\/privacy$/);
      await expect(page.getByText("密码已重置，请使用新密码登录")).toHaveCount(0);
      await expect(page.getByText("卸载后的旧请求失败")).toHaveCount(0);
      await expect(page.getByText("服务器繁忙，请稍后再试", { exact: true })).toHaveCount(0);
    }
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "390px", width: 390, height: 844 },
  ]) {
    for (const failure of ["network", "503"] as const) {
      test(`密码重置 ${failure} 结果未知时同步阻止重复消费 @ ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const resetToken = "c".repeat(64);
        let requestCount = 0;
        let releaseRequest: (() => void) | undefined;
        await page.route("**/api/customers/reset-password", async (route) => {
          requestCount += 1;
          await new Promise<void>((resolve) => {
            releaseRequest = resolve;
          });
          if (failure === "network") {
            await route.abort("failed");
            return;
          }
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ code: 503, message: "服务暂不可用" }),
          });
        });

        await page.goto(`/customer/reset#token=${resetToken}`);
        await page.getByLabel("新密码", { exact: true }).fill("safe-pass-123");
        await page.getByLabel("确认新密码", { exact: true }).fill("safe-pass-123");
        await page.locator("form").evaluate((form) => {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await expect.poll(() => typeof releaseRequest).toBe("function");
        await expect.poll(() => requestCount).toBe(1);

        releaseRequest!();
        await expect(page.getByRole("heading", { name: "重置结果待确认" })).toBeVisible();
        await expect(page.getByText(/请勿重复提交当前链接/)).toBeVisible();
        await expect(page.getByRole("link", { name: "使用新密码登录" })).toBeVisible();
        await expect(page.getByRole("link", { name: "重新找回密码" })).toBeVisible();
        await expect(page.getByRole("button", { name: "重置密码" })).toHaveCount(0);
        await expect(page.getByText("Network Error", { exact: true })).toHaveCount(0);
        await expect(page.getByText("服务器繁忙，请稍后再试", { exact: true })).toHaveCount(0);
        await expectNoHorizontalOverflow(page);
      });
    }

    test(`稳定 token-invalid 错误进入失效终态 @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const resetToken = "d".repeat(64);
      let requestCount = 0;
      await page.route("**/api/customers/reset-password", async (route) => {
        requestCount += 1;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            code: 400,
            message: "重置链接无效或已过期，请重新发起找回",
            errorCode: "PASSWORD_RESET_TOKEN_INVALID",
          }),
        });
      });

      await page.goto(`/customer/reset#token=${resetToken}`);
      await page.getByLabel("新密码", { exact: true }).fill("safe-pass-123");
      await page.getByLabel("确认新密码", { exact: true }).fill("safe-pass-123");
      await page.getByRole("button", { name: "重置密码" }).click();

      await expect.poll(() => requestCount).toBe(1);
      await expect(page.getByRole("heading", { name: "重置链接无效" })).toBeVisible();
      await expect(page.getByText("该链接无效、已过期或已使用，请重新发起找回。")).toBeVisible();
      await expect(page.getByRole("link", { name: "重新找回密码" })).toBeVisible();
      await expect(page.getByRole("button", { name: "重置密码" })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("客户中心首个核心快照失败时不把未知数据伪装成空记录", async ({ page }) => {
    let ordersFail = true;
    await installCustomerSession(page, { id: 7, name: "状态测试会员" });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
      if (path === "/api/customers/me") return respond({ id: 7, name: "状态测试会员", phone: "13800000000" });
      if (path === "/api/customers/me/orders" && ordersFail) {
        return route.fulfill({ status: 503, json: { message: "暂不可用" } });
      }
      if (path === "/api/settings/flags") {
        return respond({ commerceEnabled: false, cartEnabled: false, paymentEnabled: false, partnerApplicationsWriteEnabled: false });
      }
      if (path === "/api/customers/me/notifications") {
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      return respond(path === "/api/partner-applications/me" ? null : []);
    });

    await page.goto("/customer");
    await expect(page.getByText("账户数据暂时无法加载，请稍后重试。"))
      .toBeVisible();
    await expect(page.getByText("历史订单")).toHaveCount(0);
    await expect(page.getByText("暂未有订单记录")).toHaveCount(0);

    ordersFail = false;
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByRole("heading", { name: "我的账号" })).toBeVisible();
    await expect(page.getByText("历史订单")).toBeVisible();
  });

  test("权威会话切换客户且新快照失败时不保留上一客户订单", async ({ page }) => {
    let customerId = 7;
    let ordersFail = false;
    await installCustomerSession(page, { id: 7, name: "甲账户" });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
      if (path === "/api/customers/me") {
        return respond({
          id: customerId,
          name: customerId === 7 ? "甲账户" : "乙账户",
          phone: customerId === 7 ? "13800000007" : "13800000008",
        });
      }
      if (path === "/api/customers/me/orders") {
        if (ordersFail) {
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ code: 503, message: "暂不可用" }),
          });
        }
        return respond([{
          id: 71,
          orderNo: "ORD-CUSTOMER-A",
          status: "PENDING_PAYMENT",
          finalAmount: "12800.00",
          createdAt: "2026-09-20T00:00:00.000Z",
          items: [{ id: 711, product: { name: "甲账户私有订单作品" } }],
        }]);
      }
      if (path === "/api/partner-applications/me") {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, message: "暂不可用" }),
        });
      }
      if (path === "/api/settings/flags") {
        return respond({
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      if (path === "/api/customers/me/notifications") {
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/customers/me/inquiries") {
        return respond({ list: [], total: 0, page: 1, pageSize: 3 });
      }
      return respond([]);
    });

    await page.goto("/customer");
    await expect(page.getByText("甲账户私有订单作品")).toBeVisible();
    await expect(page.getByText("合作状态暂时无法确认，请重新加载后再继续。"))
      .toBeVisible();

    customerId = 8;
    ordersFail = true;
    await page.getByRole("button", { name: "重新加载" }).click();

    await expect(page.getByText("账户数据暂时无法加载，请稍后重试。"))
      .toBeVisible();
    await expect(page.getByText("甲账户私有订单作品")).toHaveCount(0);
    await expect(page.getByText("暂未有订单记录")).toHaveCount(0);
  });

  test("退出登录后迟到的会话刷新不能恢复旧客户或私有订单", async ({ page }) => {
    let profileRequests = 0;
    let refreshStarted = false;
    let refreshCompleted = false;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await installCustomerSession(page, { id: 7, name: "旧会话客户" });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
      if (path === "/api/customers/me") {
        profileRequests += 1;
        if (profileRequests === 2) {
          return route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ code: 401, message: "会话已过期" }),
          });
        }
        return respond({
          id: 7,
          name: "旧会话客户",
          phone: "13800000007",
        });
      }
      if (path === "/api/customers/session/refresh") {
        refreshStarted = true;
        await refreshGate;
        refreshCompleted = true;
        return respond({
          customer: {
            id: 7,
            name: "旧会话客户",
            phone: "13800000007",
            email: null,
          },
        });
      }
      if (path === "/api/customers/session/logout") {
        return respond({ success: true });
      }
      if (path === "/api/customers/me/orders") {
        return respond([{
          id: 72,
          orderNo: "ORD-STALE-SESSION",
          status: "PENDING_PAYMENT",
          finalAmount: "16800.00",
          createdAt: "2026-09-20T00:00:00.000Z",
          items: [{ id: 721, product: { name: "旧会话私有订单作品" } }],
        }]);
      }
      if (path === "/api/partner-applications/me") {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, message: "暂不可用" }),
        });
      }
      if (path === "/api/settings/flags") {
        return respond({
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      if (path === "/api/customers/me/notifications") {
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/customers/me/inquiries") {
        return respond({ list: [], total: 0, page: 1, pageSize: 3 });
      }
      return respond([]);
    });

    await page.goto("/customer");
    await expect(page.getByText("旧会话私有订单作品")).toBeVisible();
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect.poll(() => refreshStarted).toBe(true);

    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(page.getByRole("button", { name: "登录我的账户" })).toBeVisible();

    releaseRefresh();
    await expect.poll(() => refreshCompleted).toBe(true);
    // 明确越过迟到 refresh 的响应与后续微任务窗口，验证它不能重新认证旧身份。
    await page.waitForTimeout(250);
    await expect(page.getByRole("button", { name: "登录我的账户" })).toBeVisible();
    await expect(page.getByText("旧会话私有订单作品")).toHaveCount(0);
    expect(profileRequests).toBe(2);
  });

  test("客户中心辅助资源失败时不伪装成未申请或真实空态", async ({ page }) => {
    let partnerFail = true;
    let favoritesFail = true;
    let notificationsFail = true;
    await installCustomerSession(page, { id: 8, name: "辅助状态会员" });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
      if (path === "/api/customers/me") return respond({ id: 8, name: "辅助状态会员", phone: "13800000000" });
      if (path === "/api/settings/flags") {
        return respond({ commerceEnabled: false, cartEnabled: false, paymentEnabled: false, partnerApplicationsWriteEnabled: false });
      }
      if (path === "/api/partner-applications/me") {
        if (partnerFail) return route.fulfill({ status: 503, json: { message: "暂不可用" } });
        return respond({ customer: { partnerStatus: "PENDING" }, latest: null });
      }
      if (path === "/api/customers/me/favorites") {
        if (favoritesFail) return route.fulfill({ status: 503, json: { message: "暂不可用" } });
        return respond([]);
      }
      if (path === "/api/customers/me/notifications") {
        if (notificationsFail) return route.fulfill({ status: 503, json: { message: "暂不可用" } });
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      return respond([]);
    });

    await page.goto("/customer");
    await expect(page.getByText("合作状态暂时无法确认，请重新加载后再继续。"))
      .toBeVisible();
    await expect(page.getByText("尚未申请合作商家身份")).toHaveCount(0);

    const favorites = page.getByRole("region", { name: "我的心愿单" });
    await expect(favorites.getByText("心愿单暂时无法加载。"))
      .toBeVisible();
    await expect(favorites.getByText("心愿单还是空的。"))
      .toHaveCount(0);
    favoritesFail = false;
    await favorites.getByRole("button", { name: "重新加载" }).click();
    await expect(favorites.getByText("心愿单还是空的。"))
      .toBeVisible();

    const notifications = page.getByRole("region", { name: "服务通知" });
    await expect(notifications.getByText("服务通知暂时无法加载，订单和账户功能不受影响。"))
      .toBeVisible();
    await expect(notifications.getByText("暂时没有新的服务通知。"))
      .toHaveCount(0);
    notificationsFail = false;
    await notifications.getByRole("button", { name: "重新加载" }).click();
    await expect(notifications.getByText("暂时没有新的服务通知。"))
      .toBeVisible();

    partnerFail = false;
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("合作申请审核中")).toBeVisible();

    await navigateInSpa(page, "/customer?section=partner");
    await expect(page.getByText(
      "您的合作申请正在审核中。审核状态更新后，我们会按您预留的联系方式与您联系。",
    )).toBeVisible();
    await expect(page.getByText(/3 个工作日/)).toHaveCount(0);
  });

  test("合作状态读取失败时申请页不会开放重复申请表", async ({ page }) => {
    await installCustomerSession(page, { id: 9, name: "合作状态测试会员" });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
      if (path === "/api/customers/me") {
        return respond({ id: 9, name: "合作状态测试会员", phone: "13800000000" });
      }
      if (path === "/api/partner-applications/me") {
        return route.fulfill({ status: 503, json: { message: "暂不可用" } });
      }
      return respond([]);
    });

    await page.goto("/customer?section=partner");
    await expect(page.getByText("合作状态暂时无法确认", { exact: true }))
      .toBeVisible();
    await expect(page.getByText("为避免重复申请，当前不会显示新的申请表。", { exact: false }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "提交申请" })).toHaveCount(0);
  });

  for (const path of ["/cart", "/checkout"]) {
    test(`${path} 在交易关闭时降级至咨询页`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/contact/);
      await expect(page.getByRole("banner")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("移动端交易关闭时跳转咨询页且没有横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cart");
    await expect(page).toHaveURL(/\/contact/);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Tab");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName))
      .not.toBe("BODY");
  });

  test("390 像素下公开选款页没有横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/catalog");
    await expect(page).toHaveURL(/\/catalog(?:[?#]|$)/);
    await expect(page.getByRole("banner")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("未登录选款中心请求公开接口", async ({ page }) => {
    test.skip(useMock, "模拟数据模式不发送商品网络请求");
    const requestPromise = page.waitForRequest((request) =>
      request.url().includes("/api/products/public"),
    );
    await page.goto("/catalog");
    const request = await requestPromise;
    expect(request.url()).toContain("/api/products/public");
    await expect(page).toHaveURL(/\/catalog(?:[?#]|$)/);
  });

  test("存在客户 Cookie 会话时优先请求会员目录", async ({ page }) => {
    test.skip(useMock, "模拟数据模式不发送商品网络请求");
    await installCustomerSession(page, { id: 7, name: "目录合同测试客户" });
    const requestPromise = page.waitForRequest((request) =>
      new URL(request.url()).pathname === "/api/products/catalog",
    );
    await page.goto("/catalog");
    const request = await requestPromise;
    expect(request.headers().authorization).toBeUndefined();
    expect(request.headers()["x-session-domain"]).toBe("customer");
  });
});

test.describe("真实接口公开数据契约", () => {
  test.skip(!apiBaseURL, "设置 PLAYWRIGHT_API_BASE_URL 后执行真实接口契约测试");

  test("游客列表只返回公开安全字段", async ({ request }) => {
    const response = await request.get(apiUrl("/products/public"), {
      params: { page: 1, pageSize: 20 },
    });
    expect(response.status()).toBe(200);
    const result = unwrap(await response.json());
    expect(Array.isArray(result.list)).toBe(true);
    for (const product of result.list) expectSafeProduct(product);
  });

  test("游客不能直接访问会员目录和会员媒体", async ({ request }) => {
    const catalog = await request.get(apiUrl("/products/catalog"));
    expect(catalog.status()).toBe(401);

    const media = await request.get(apiUrl("/products/catalog/1/media/1"));
    expect(media.status()).toBe(401);
  });

  test("交易接口需客户登录（未登录返回 401）", async ({ request }) => {
    const responses = await Promise.all([
      request.post(apiUrl("/customers/checkout"), {
        data: { address: "测试地址", items: [{ skuId: 1, quantity: 1 }] },
      }),
      request.post(apiUrl("/customers/me/orders/1/payment-proof"), {
        data: { proofKey: "test-proof" },
      }),
      request.post(apiUrl("/upload/payment-proof")),
    ]);

    for (const response of responses) {
      expect(response.status()).toBe(401);
    }
  });

  test("猜测不存在的公开商品 ID 统一返回 404", async ({ request }) => {
    const response = await request.get(apiUrl("/products/public/2147483647"));
    expect(response.status()).toBe(404);
  });

  test("公开详情与公开媒体不泄露内部字段", async ({ request }) => {
    const listResponse = await request.get(apiUrl("/products/public"), {
      params: { page: 1, pageSize: 1 },
    });
    expect(listResponse.status()).toBe(200);
    const result = unwrap(await listResponse.json());
    test.skip(!result.list?.length, "当前数据库没有已审核的 PUBLIC 商品");

    const detailResponse = await request.get(
      apiUrl(`/products/public/${result.list[0].id}`),
    );
    expect(detailResponse.status()).toBe(200);
    const product = unwrap(await detailResponse.json());
    expectSafeProduct(product);

    const firstImage = product.images?.[0];
    if (firstImage?.mediaUrl) {
      const mediaResponse = await request.get(apiUrl(firstImage.mediaUrl));
      expect(mediaResponse.status()).toBe(200);
      expect(mediaResponse.headers()["content-type"]).toMatch(
        /^(image|video)\//,
      );
      expect(mediaResponse.headers()["x-content-type-options"]).toBe("nosniff");
    }
  });

  test("带客户 Cookie 会话的目录响应仍使用安全字段白名单", async ({ request }) => {
    test.skip(!customerStorageState, "设置 PLAYWRIGHT_CUSTOMER_STORAGE_STATE 后验证会员目录");
    await expectSafeCatalogResponse(request);
  });
});

async function expectSafeCatalogResponse(
  request: APIRequestContext,
) {
  const response = await request.get(apiUrl("/products/catalog"), {
    headers: { "X-Session-Domain": "customer" },
    params: { page: 1, pageSize: 20 },
  });
  expect(response.status()).toBe(200);
  const result = unwrap(await response.json());
  for (const product of result.list || []) expectSafeProduct(product);
}
