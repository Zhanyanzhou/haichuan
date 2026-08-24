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
      return fulfill(route, { id: 1 });
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
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name} 原生提交聚焦首错且避开固定页头`, async ({ page }) => {
      let inquiryRequests = 0;
      await mockServiceApis(page, async (route) => {
        inquiryRequests += 1;
        await fulfill(route, { id: 1 });
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/contact");

      const submit = page.getByRole("button", { name: "提交需求" });
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

      for (const id of ["cf-phone", "cf-type", "cf-time", "cf-message", "cf-privacy-consent"]) {
        await expect(page.locator(`#${id}`)).toHaveAttribute("aria-invalid", "true");
        await expect(page.locator(`#${id}`)).toHaveAttribute("aria-describedby", /-error$/);
      }
      await expectNoHorizontalOverflow(page);
      expect(inquiryRequests).toBe(0);
    });
  }

  test("提交中阻止重复请求，成功后聚焦结果标题", async ({ page }) => {
    let inquiryRequests = 0;
    let releaseInquiry = () => {};
    const inquiryReleased = new Promise<void>((resolve) => {
      releaseInquiry = resolve;
    });
    await mockServiceApis(page, async (route) => {
      inquiryRequests += 1;
      await inquiryReleased;
      await fulfill(route, { id: 1 });
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
    const successHeading = page.getByRole("heading", { name: "需求已提交" });
    await expect(successHeading).toBeFocused();
    expect(inquiryRequests).toBe(1);
  });

  test("提交失败以 alert 呈现且不伪造成功", async ({ page }) => {
    await mockServiceApis(page, async (route) => {
      await fulfill(route, { statusCode: 500, message: "提交服务暂时不可用" }, 500);
    });
    await page.goto("/contact");
    await fillRequiredContactFields(page);
    await page.getByRole("button", { name: "提交需求" }).press("Enter");

    await expect(page.locator("form").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("heading", { name: "需求已提交" })).toHaveCount(0);
  });
});

test.describe("Custom 无图安全版式（Mock）", () => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900, processColumns: 2, craftColumns: 3 },
    { name: "mobile", width: 390, height: 844, processColumns: 1, craftColumns: 1 },
  ]) {
    test(`${viewport.name} 保留真实 Hero 并使用无占位媒体的流程与工艺布局`, async ({ page }) => {
      await mockServiceApis(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/custom");

      const hero = page.getByRole("img", { name: "珠宝制作细节" });
      await expect(hero).toHaveAttribute("src", "/images/錾刻.png");
      await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);

      const process = page.locator("section").filter({
        has: page.getByRole("heading", { name: "从灵感到交付" }),
      });
      const processItems = process.locator("ol > li");
      await expect(processItems).toHaveCount(4);
      await expect(process.locator("img")).toHaveCount(0);

      const craft = page.locator("section").filter({
        has: page.getByRole("heading", { name: "材质与制作细节" }),
      });
      const craftItems = craft.locator("ul > li");
      await expect(craftItems).toHaveCount(6);
      await expect(craft.locator("img")).toHaveCount(0);
      await expect(page.locator('main img[src^="data:image/svg"]')).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("HAICHUAN seed");

      const processColumnCount = await processItems.first().evaluate((item) =>
        getComputedStyle(item).gridTemplateColumns.split(" ").length,
      );
      const craftColumnCount = await craft.locator("ul").evaluate((list) =>
        getComputedStyle(list).gridTemplateColumns.split(" ").length,
      );
      expect(processColumnCount).toBe(viewport.processColumns);
      expect(craftColumnCount).toBe(viewport.craftColumns);

      const cta = page.getByRole("link", { name: "前往咨询", exact: true });
      await expect(cta).toHaveCount(1);
      await expect(cta).toHaveAttribute("href", "/contact?type=custom");
      await expect(page.getByRole("link", { name: "联系客服", exact: true })).toHaveCount(0);
      if (viewport.width === 390) {
        await cta.scrollIntoViewIfNeeded();
        const box = await cta.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(48);
        expect(box?.width).toBeGreaterThanOrEqual(340);
      }
      await expectNoHorizontalOverflow(page);
    });
  }
});
