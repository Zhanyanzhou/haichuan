import { expect, test, type Page, type Route } from "@playwright/test";

const wrapped = (data: unknown) => ({
  code: 200,
  data,
  message: "success",
});

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status === 200 ? wrapped(data) : data),
  });
}

const receipt = (sourceId: number, leadId = sourceId + 100) => ({
  id: sourceId,
  sourceId,
  leadId,
  status: "PENDING",
  createdAt: "2026-09-22T08:00:00.000Z",
});

async function mockServiceApis(
  page: Page,
  onInquiry?: (route: Route) => Promise<void>,
) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/analytics/track")) {
      return route.fulfill({ status: 204, body: "" });
    }
    if (path.endsWith("/inquiries") && request.method() === "POST") {
      if (onInquiry) return onInquiry(route);
      return fulfill(route, receipt(1));
    }
    if (request.method() !== "GET") return route.abort();
    if (path.endsWith("/settings/public")) {
      return fulfill(route, {
        siteName: "海川珠宝",
        contactPhone: "",
        contactEmail: "",
        contactAddress: "",
        businessHours: "",
      });
    }
    if (path.endsWith("/settings/flags")) {
      return fulfill(route, {
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
      });
    }
    if (path.endsWith("/page-modules/document/published")) {
      return fulfill(route, null);
    }
    return fulfill(route, null);
  });
}

async function fillRequiredContactFields(page: Page) {
  await page.locator("#cf-name").fill("测试访客");
  await page.locator("#cf-phone").fill("13800000000");
  await page.locator("#cf-type").selectOption("高级定制");
  await page.locator("#cf-time").selectOption("下午 (14:00-18:00)");
  await page.locator("#cf-message").fill("希望了解适合日常佩戴的珠宝定制方案。\n");
  await page.locator("#cf-privacy-consent").check();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
}

test.describe("Contact 原生表单与错误可访问性（Mock）", () => {
  test("Cookie 会话延迟恢复后补填咨询联系方式且不覆盖已输入内容", async ({ page }) => {
    let profileRequests = 0;
    let releaseProfile = () => {};
    const profileReleased = new Promise<void>((resolve) => {
      releaseProfile = resolve;
    });
    await mockServiceApis(page);
    await page.route("**/api/customers/me", async (route) => {
      profileRequests += 1;
      await profileReleased;
      await fulfill(route, {
        id: 7,
        name: "已登录会员",
        phone: "13800138000",
        email: "member@example.com",
      });
    });

    await page.goto("/contact");
    await expect(page.locator("#cf-name")).toBeVisible();
    await page.locator("#cf-name").fill("我已开始填写");
    releaseProfile();

    await expect.poll(() => profileRequests).toBe(1);
    await expect(page.locator("#cf-name")).toHaveValue("我已开始填写");
    await expect(page.locator("#cf-phone")).toHaveValue("13800138000");
    await expect(page.locator("#cf-email")).toHaveValue("member@example.com");
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name} 原生提交聚焦首错且避开固定页头`, async ({ page }) => {
      let inquiryRequests = 0;
      await mockServiceApis(page, async (route) => {
        inquiryRequests += 1;
        await fulfill(route, receipt(1));
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/contact");

      const submit = page.getByRole("button", { name: "提交需求" });
      await expect(page.locator("#cf-name")).toHaveAttribute("autocomplete", "name");
      await expect(page.locator("#cf-phone")).toHaveAttribute("autocomplete", "tel-national");
      await expect(page.locator("#cf-phone")).toHaveAttribute("inputmode", "numeric");
      await expect(page.locator("#cf-email")).toHaveAttribute("autocomplete", "email");
      await expect(submit).toHaveAttribute("type", "submit");
      await submit.press("Enter");

      const header = page.getByRole("banner");
      const name = page.locator("#cf-name");
      const nameError = page.locator("#cf-name-error");
      await expect(name).toBeFocused();
      await expect(name).toHaveAttribute("aria-invalid", "true");
      await expect(name).toHaveAttribute("aria-describedby", "cf-name-error");
      await expect(nameError).toHaveText("请输入姓名");
      await expect(name).toBeInViewport();
      await expect(nameError).toBeInViewport();

      const [headerBox, nameBox, errorBox] = await Promise.all([
        header.boundingBox(),
        name.boundingBox(),
        nameError.boundingBox(),
      ]);
      expect(headerBox).not.toBeNull();
      expect(nameBox).not.toBeNull();
      expect(errorBox).not.toBeNull();
      expect(nameBox!.y).toBeGreaterThanOrEqual(
        headerBox!.y + headerBox!.height + 8,
      );
      expect(nameBox!.y + nameBox!.height).toBeLessThanOrEqual(viewport.height);
      expect(errorBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
      expect(errorBox!.y + errorBox!.height).toBeLessThanOrEqual(viewport.height);

      for (const id of ["cf-phone", "cf-type", "cf-message", "cf-privacy-consent"]) {
        await expect(page.locator(`#${id}`)).toHaveAttribute("aria-invalid", "true");
        await expect(page.locator(`#${id}`)).toHaveAttribute("aria-describedby", /-error$/);
      }
      await expect(page.locator("#cf-time")).not.toHaveAttribute("aria-invalid", "true");
      await expectNoHorizontalOverflow(page);
      expect(inquiryRequests).toBe(0);
    });
  }

  test("电子邮件偏好要求选填邮箱，并保留手机号必填合同", async ({ page }) => {
    let inquiryRequests = 0;
    await mockServiceApis(page, async (route) => {
      inquiryRequests += 1;
      await fulfill(route, receipt(1));
    });
    await page.goto("/contact");
    await fillRequiredContactFields(page);
    await page.locator("#cf-contact").selectOption("电子邮件");
    await page.getByRole("button", { name: "提交需求" }).click();

    await expect(page.locator("#cf-email")).toBeFocused();
    await expect(page.locator("#cf-email-error"))
      .toHaveText("选择电子邮件联系时请填写邮箱");
    expect(inquiryRequests).toBe(0);

    await page.locator("#cf-phone").fill("");
    await page.locator("#cf-email").fill("visitor@example.com");
    await page.getByRole("button", { name: "提交需求" }).click();
    await expect(page.locator("#cf-phone")).toBeFocused();
    await expect(page.locator("#cf-phone-error")).toHaveText("请输入正确的手机号码");
    expect(inquiryRequests).toBe(0);
  });

  test("提交中阻止重复请求，成功后聚焦结果标题", async ({ page }) => {
    let inquiryRequests = 0;
    let releaseInquiry = () => {};
    const inquiryReleased = new Promise<void>((resolve) => {
      releaseInquiry = resolve;
    });
    await mockServiceApis(page, async (route) => {
      inquiryRequests += 1;
      await inquiryReleased;
      await fulfill(route, receipt(1));
    });
    await page.goto("/contact");
    await fillRequiredContactFields(page);

    const submit = page.getByRole("button", { name: "提交需求" });
    await submit.press("Enter");
    await expect(page.getByRole("button", { name: "正在提交…" })).toBeDisabled();
    await page.locator("form").evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect.poll(() => inquiryRequests).toBe(1);

    releaseInquiry();
    const successHeading = page.getByRole("heading", { level: 1, name: "需求已提交" });
    await expect(successHeading).toBeFocused();
    expect(inquiryRequests).toBe(1);
  });

  test("电子邮件偏好提交失败保留输入，重试只确认需求已保存", async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    const idempotencyKeys: string[] = [];
    await mockServiceApis(page, async (route) => {
      bodies.push(route.request().postDataJSON());
      idempotencyKeys.push(route.request().headers()["idempotency-key"] || "");
      if (bodies.length === 1) {
        await fulfill(route, { statusCode: 500, message: "提交服务暂时不可用" }, 500);
        return;
      }
      await fulfill(route, receipt(1));
    });
    await page.goto("/contact");
    await fillRequiredContactFields(page);
    await page.locator("#cf-email").fill("visitor@example.com");
    await page.locator("#cf-contact").selectOption("电子邮件");
    await page.getByRole("button", { name: "提交需求" }).press("Enter");

    await expect(page.locator("form").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("heading", { name: "需求已提交" })).toHaveCount(0);
    await expect(page.locator("#cf-phone")).toHaveValue("13800000000");
    await expect(page.locator("#cf-email")).toHaveValue("visitor@example.com");
    await expect(page.locator("#cf-contact")).toHaveValue("电子邮件");
    await expect(page.getByText(
      "存在一笔结果待确认的咨询。保持原内容再次提交可安全查回原回执；新建前请先明确放弃恢复。",
      { exact: true },
    )).toBeVisible();

    const storedAttempt = await page.evaluate(() => ({ ...sessionStorage }));
    expect(JSON.stringify(storedAttempt)).not.toContain("13800000000");
    expect(JSON.stringify(storedAttempt)).not.toContain("visitor@example.com");
    expect(JSON.stringify(storedAttempt)).not.toContain("日常佩戴");

    await page.reload();
    await expect(page.getByText(
      "存在一笔结果待确认的咨询。保持原内容再次提交可安全查回原回执；新建前请先明确放弃恢复。",
      { exact: true },
    )).toBeVisible();
    await fillRequiredContactFields(page);
    await page.locator("#cf-email").fill("visitor@example.com");
    await page.locator("#cf-contact").selectOption("电子邮件");
    await page.getByRole("button", { name: "提交需求" }).click();
    await expect(page.getByRole("heading", { name: "需求已提交" })).toBeVisible();
    await expect(page.getByText("邮件已送达")).toHaveCount(0);
    expect(bodies).toHaveLength(2);
    expect(idempotencyKeys[0]).toBeTruthy();
    expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
    for (const body of bodies) {
      expect(body.customerPhone).toBe("13800000000");
      expect(body.customerEmail).toBe("visitor@example.com");
      expect(body.preferredContact).toBe("电子邮件");
    }
    expect(await page.evaluate(() => Object.keys(sessionStorage).some(
      (key) => key.startsWith("hc:consultation-submission-attempt:contact:"),
    ))).toBe(false);
  });

  test("结果待确认时不同内容零请求，明确放弃后才生成新提交意图", async ({ page }) => {
    const keys: string[] = [];
    await mockServiceApis(page, async (route) => {
      keys.push(route.request().headers()["idempotency-key"] || "");
      if (keys.length === 1) {
        await fulfill(route, { statusCode: 503, message: "响应丢失" }, 503);
        return;
      }
      await fulfill(route, receipt(2));
    });
    await page.goto("/contact");
    await fillRequiredContactFields(page);
    await page.getByRole("button", { name: "提交需求" }).click();
    await expect.poll(() => keys.length).toBe(1);

    await page.reload();
    await fillRequiredContactFields(page);
    await page.locator("#cf-message").fill("这是另一笔不同的咨询需求。");
    await page.getByRole("button", { name: "提交需求" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "当前内容与一笔结果待确认的咨询不同",
    );
    expect(keys).toHaveLength(1);

    await page.getByRole("button", { name: "放弃恢复并准备新建" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "这不会撤销服务器上可能已生效的咨询",
    );
    await page.getByRole("button", { name: "提交需求" }).click();
    await expect(page.getByRole("heading", { name: "需求已提交" })).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBeTruthy();
    expect(keys[1]).not.toBe(keys[0]);
  });
});

test.describe("Custom 未发布文档安全短页（Mock）", () => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name} 不回退硬编码长页或占位媒体，并保留可达咨询入口`, async ({ page }) => {
      await mockServiceApis(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/custom");

      const fallback = page.locator('[data-production-fallback="safe-status"]');
      await expect(fallback).toBeVisible();
      await expect(fallback).toHaveAttribute("data-page-document-state", "unpublished");
      await expect(fallback.getByRole("heading", { name: "珠宝定制" })).toBeVisible();
      await expect(page.locator("main img")).toHaveCount(0);
      await expect(page.locator(".custom-scroll-reveal")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("HAICHUAN seed");

      const cta = fallback.getByRole("link", { name: "提交定制咨询", exact: true });
      await expect(cta).toHaveAttribute("href", "/contact?type=custom");
      await expect(fallback.getByRole("link", { name: "浏览公开款式" }))
        .toHaveAttribute("href", "/catalog");
      if (viewport.width === 390) {
        await cta.scrollIntoViewIfNeeded();
        const box = await cta.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(48);
        expect(box?.width).toBeGreaterThanOrEqual(44);
      }
      await expectNoHorizontalOverflow(page);
    });
  }
});
