import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  fulfillServiceApi,
  mockPublicServiceThirdBatch,
  type ServiceWriteObservation,
} from "./fixtures/public-service-third-batch";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
}

async function expectWriteGate(
  writes: ServiceWriteObservation,
  inquiryCount = 0,
) {
  await expect.poll(() => writes.inquiry).toBe(inquiryCount);
  await expect.poll(() => writes.unexpected).toBe(0);
}

async function readFocusStyle(locator: Locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      textDecorationLine: style.textDecorationLine,
      textDecorationThickness: style.textDecorationThickness,
    };
  });
}

async function fillRequiredContactFields(page: Page) {
  await page.locator("#cf-name").fill("测试访客");
  await page.locator("#cf-phone").fill("13800000000");
  if (await page.locator("#cf-type").inputValue() === "") {
    await page.locator("#cf-type").selectOption("高级定制");
  }
  await page.locator("#cf-time").selectOption("下午 (14:00-18:00)");
  await page.locator("#cf-message").fill("希望说明设计与尺寸需求并确认可提供的安排。");
  await page.locator("#cf-privacy-consent").check();
}

for (const scenario of [
  "reduced-motion",
  "reduced-motion-toggle",
  "observer-unavailable",
  "observer-constructor-fails",
] as const) {
  test(`Custom 未发布安全短页在 ${scenario} 时保持可见`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    if (scenario === "reduced-motion") {
      await page.emulateMedia({ reducedMotion: "reduce" });
    } else if (scenario === "observer-unavailable") {
      await page.addInitScript(() => {
        Object.defineProperty(window, "IntersectionObserver", {
          configurable: true,
          value: undefined,
        });
      });
    } else if (scenario === "observer-constructor-fails") {
      await page.addInitScript(() => {
        Object.defineProperty(window, "IntersectionObserver", {
          configurable: true,
          value: class BrokenIntersectionObserver {
            constructor() {
              throw new Error("deterministic observer constructor failure");
            }
          },
        });
      });
    }
    await mockPublicServiceThirdBatch(page);
    await page.goto("/custom");
    if (scenario === "reduced-motion-toggle") {
      await page.emulateMedia({ reducedMotion: "reduce" });
    }

    const fallback = page.locator('[data-production-fallback="safe-status"]');
    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole("heading", { name: "珠宝定制" })).toBeVisible();
    await expect(fallback.getByRole("link", { name: "提交定制咨询" }))
      .toHaveAttribute("href", "/contact?type=custom");
    await expect(page.locator(".custom-scroll-reveal")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
  });
}

for (const viewport of viewports) {
  test(`Custom ${viewport.name} 安全短页保留作品引用与定制预选`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = await mockPublicServiceThirdBatch(page);
    await page.goto("/custom?type=custom&productRef=HC-TEST-004");

    const main = page.locator("main");
    const fallback = main.locator('[data-production-fallback="safe-status"]');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("data-page-document-state", "unpublished");
    await expect(fallback.getByRole("heading", { name: "珠宝定制" })).toBeVisible();
    await expect(fallback).toContainText(
      "定制内容正在整理。您可以先提交咨询需求，由珠宝顾问了解您的佩戴场景与偏好。",
    );
    await expect(main).not.toContainText("HAICHUAN seed");
    const cta = fallback.getByRole("link", { name: "提交定制咨询", exact: true });
    await expect(cta)
      .toHaveAttribute("href", "/contact?type=custom&productRef=HC-TEST-004");
    await expect(fallback.getByRole("link", { name: "浏览公开款式" }))
      .toHaveAttribute("href", "/catalog");
    await expect(page.getByText("PRIVATE APPOINTMENT", { exact: true })).toHaveCount(0);

    if (viewport.name === "mobile") {
      await cta.scrollIntoViewIfNeeded();
      const box = await cta.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }
    await expectNoHorizontalOverflow(page);

    await cta.click();
    await expect(page).toHaveURL(/\/contact\?type=custom&productRef=HC-TEST-004$/);
    const routedMain = page.locator("#main-content");
    await expect(routedMain).toBeFocused();
    const routedMainFocus = await readFocusStyle(routedMain);
    expect(routedMainFocus.outlineStyle).toBe("none");
    await expect(page.locator("#cf-type")).toHaveValue("高级定制");
    await expect(page.getByText("作品当前不可咨询。您可以移除作品后继续提交普通咨询。"))
      .toBeVisible();
    await expect(page.getByText("PRIVATE APPOINTMENT", { exact: true })).toHaveCount(0);
    await expect(page.locator('input[id*="product"], select[id*="product"], textarea[id*="product"]'))
      .toHaveCount(0);
    await expectWriteGate(writes);
  });

  test(`Contact ${viewport.name} 空联系方式、未知 type、首错焦点与 DOM 一致顺序`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = await mockPublicServiceThirdBatch(page);
    await page.goto(viewport.name === "desktop" ? "/contact" : "/contact?type=unknown");
    await expect(page.locator("#cf-type")).toHaveValue("");

    await expect(page.getByText(
      "公开联系方式正在完善，您仍可通过本页表单提交需求。",
      { exact: true },
    )).toBeVisible();
    await expect(page.getByText("PRIVATE APPOINTMENT", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/尽快/)).toHaveCount(0);

    const grid = page.locator(".contact-grid");
    const columns = await grid.evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
    expect(columns).toBe(viewport.name === "desktop" ? 2 : 1);
    const [informationBox, formBox] = await Promise.all([
      grid.locator(":scope > div").first().boundingBox(),
      grid.locator(":scope > div").last().boundingBox(),
    ]);
    expect(informationBox && formBox).toBeTruthy();
    if (viewport.name === "mobile") {
      // 移动端不再用 CSS order 把表单视觉前置；视觉、DOM 与键盘顺序统一。
      expect(informationBox!.y).toBeLessThan(formBox!.y);
    } else {
      expect(informationBox!.x).toBeLessThan(formBox!.x);
    }

    await page.getByRole("button", { name: "提交需求" }).press("Enter");
    const header = page.getByRole("banner");
    const name = page.locator("#cf-name");
    const nameError = page.locator("#cf-name-error");
    await expect(name).toBeFocused();
    await expect.poll(() => name.evaluate((node) => node.matches(":focus-visible")))
      .toBe(true);
    const nameFocus = await readFocusStyle(name);
    expect(nameFocus.outlineStyle).toBe("solid");
    expect(parseFloat(nameFocus.outlineWidth)).toBeGreaterThanOrEqual(2);
    expect(parseFloat(nameFocus.outlineOffset)).toBeGreaterThanOrEqual(2);
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAttribute("aria-describedby", "cf-name-error");
    await expect(name).toBeInViewport();
    await expect(nameError).toBeInViewport();
    // 聚焦与 scrollIntoView 已触发时，页面仍可能在下一帧提交字体/错误文案造成的布局变化。
    // 轮询用户最终可见的稳定关系，仍会让持续被固定页头遮挡的真实回归失败。
    await expect.poll(async () => {
      const [headerBox, nameBox, nameErrorBox] = await Promise.all([
        header.boundingBox(),
        name.boundingBox(),
        nameError.boundingBox(),
      ]);
      if (!headerBox || !nameBox || !nameErrorBox) return false;
      return nameBox.y >= headerBox.y + headerBox.height + 8
        && nameErrorBox.y >= nameBox.y + nameBox.height
        && nameErrorBox.y + nameErrorBox.height <= viewport.height;
    }).toBe(true);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectWriteGate(writes);
  });

  test(`Contact ${viewport.name} 设置与提交失败各自单 alert`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = await mockPublicServiceThirdBatch(page, {
      settingsState: "error",
      onInquiry: (route) => fulfillServiceApi(
        route,
        { statusCode: 500, message: "提交服务暂时不可用" },
        500,
      ),
    });
    await page.goto("/contact?type=custom");
    const main = page.locator("main");

    const settingsAlert = page.getByText(
      "联系信息暂时无法加载，您仍可通过本页表单提交需求。",
      { exact: true },
    );
    await expect(settingsAlert).toHaveAttribute("role", "alert");
    await expect(main.getByRole("alert")).toHaveCount(1);

    await fillRequiredContactFields(page);
    await page.getByRole("button", { name: "提交需求" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveCount(1);
    await expect(main.getByRole("alert")).toHaveCount(2);
    await expect(settingsAlert).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "需求已提交" })).toHaveCount(0);
    await expect(page.getByText(/尽快/)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectWriteGate(writes, 1);
  });

  test(`Contact ${viewport.name} 重复提交门禁与成功行动层级`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    let releaseInquiry = () => {};
    let submittedPayload: Record<string, unknown> | undefined;
    const inquiryReleased = new Promise<void>((resolve) => {
      releaseInquiry = resolve;
    });
    const writes = await mockPublicServiceThirdBatch(page, {
      onInquiry: async (route) => {
        submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
        await inquiryReleased;
        await fulfillServiceApi(route, { id: 1 });
      },
    });
    await page.goto("/contact?type=custom");
    await fillRequiredContactFields(page);

    const submit = page.getByRole("button", { name: "提交需求" });
    const privacyConsent = page.locator("#cf-privacy-consent");
    const privacyLink = page.locator("form").getByRole("link", { name: "隐私说明" });
    await privacyConsent.focus();
    await page.keyboard.press("Tab");
    await expect(privacyLink).toBeFocused();
    await expect.poll(() => privacyLink.evaluate((node) => node.matches(":focus-visible")))
      .toBe(true);
    expect((await readFocusStyle(privacyLink)).outlineStyle).not.toBe("none");
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
    await expect.poll(() => submit.evaluate((node) => node.matches(":focus-visible")))
      .toBe(true);
    expect((await readFocusStyle(submit)).outlineStyle).not.toBe("none");

    await submit.press("Enter");
    await expect(page.getByRole("button", { name: "正在提交…" })).toBeDisabled();
    await page.locator("form").evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect.poll(() => writes.inquiry).toBe(1);

    releaseInquiry();
    const successHeading = page.getByRole("heading", { name: "需求已提交" });
    await expect(successHeading).toBeFocused();
    const successFocus = await readFocusStyle(successHeading);
    expect(successFocus.outlineStyle).toBe("none");
    expect(successFocus.textDecorationLine).toContain("underline");
    expect(parseFloat(successFocus.textDecorationThickness)).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(
      "我们会根据您提供的联系方式与您联系，具体时间与安排以实际沟通为准。",
      { exact: true },
    )).toBeVisible();
    await expect(page.getByText(/尽快/)).toHaveCount(0);

    const primaryAction = page.getByRole("link", { name: "浏览作品", exact: true });
    const secondaryAction = page.getByRole("link", { name: "返回首页", exact: true });
    await expect(primaryAction).toHaveAttribute("href", "/catalog");
    await expect(secondaryAction).toHaveAttribute("href", "/");
    await expect.poll(() => primaryAction.evaluate((node) =>
      getComputedStyle(node).borderTopWidth,
    )).toBe("1px");
    await expect.poll(() => secondaryAction.evaluate((node) =>
      getComputedStyle(node).borderTopWidth,
    )).toBe("0px");
    await expect(page.getByText("PRIVATE APPOINTMENT", { exact: true })).toHaveCount(0);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    expect(submittedPayload).toMatchObject({ consultationType: "高级定制" });
    expect(submittedPayload).not.toHaveProperty("productId");
    expect(submittedPayload).not.toHaveProperty("productReference");
    await expectNoHorizontalOverflow(page);
    await expectWriteGate(writes, 1);
  });
}

test("其他公开路由继续显示唯一共享页脚服务条", async ({ page }) => {
  const writes = await mockPublicServiceThirdBatch(page);
  await page.goto("/privacy");
  await expect(page.getByText("PRIVATE APPOINTMENT", { exact: true })).toBeVisible();
  await expect(page.locator("footer.site-footer")).toHaveCount(1);
  await expectWriteGate(writes);
});
