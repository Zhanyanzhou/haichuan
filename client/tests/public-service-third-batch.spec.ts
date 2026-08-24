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

const customFaqs = [
  {
    q: "可以自带材料进行定制吗？",
    a: "请在咨询中说明材料类型与现状，是否适合使用需在评估后确认。",
  },
  {
    q: "旧款珠宝可以改造吗？",
    a: "请提供作品现状与改造方向，是否适合翻新、调整或重新设计需在评估后确认。",
  },
  {
    q: "周期与费用如何确认？",
    a: "周期与费用受设计、材料与制作范围影响，均以沟通确认的方案为准。",
  },
  {
    q: "设计与交付后的调整如何确认？",
    a: "可在方案确认前提出调整需求；交付后的尺寸、保养或其他需求，以作品结构与实际评估为准。",
  },
];

const craftItems = [
  "材质需求",
  "宝石需求",
  "雕刻需求",
  "镶嵌需求",
  "表面效果",
  "交付确认",
];

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

for (const viewport of viewports) {
  test(`Custom ${viewport.name} 安全文案、单一外部行动与定制预选`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = await mockPublicServiceThirdBatch(page);
    await page.goto("/custom");

    const main = page.locator("main");
    const hero = main.getByRole("img", { name: "珠宝制作细节" });
    await expect.poll(() => hero.evaluate((image: HTMLImageElement) =>
      image.complete && image.naturalWidth > 0,
    )).toBe(true);
    await expect(main.locator('img[src^="data:image/svg"], img[src*="placeholder"]'))
      .toHaveCount(0);
    await expect(main).not.toContainText("HAICHUAN seed");

    const craftSection = main.locator("section").filter({
      has: page.getByRole("heading", { name: "材质与制作细节" }),
    });
    const craftListItems = craftSection.locator("ul > li");
    await expect(craftListItems).toHaveCount(6);
    await expect(craftListItems).toHaveText(craftItems);

    const faqSection = main.locator("section").filter({
      has: page.getByRole("heading", { name: "常见问题" }),
    });
    await expect(faqSection.getByRole("button")).toHaveCount(4);
    for (const faq of customFaqs) {
      await faqSection.getByRole("button", { name: faq.q }).click();
      await expect(faqSection.getByText(faq.a, { exact: true })).toBeVisible();
    }

    for (const unsafeText of [
      "预约私人顾问",
      "一对一定制之旅",
      "支持线上沟通",
      "也可到店",
      "售后与保养安排会在交付时与您说明",
      "材质甄选，工艺传承",
    ]) {
      await expect(main).not.toContainText(unsafeText);
    }

    const heroAnchor = main.getByRole("link", { name: "了解定制服务" });
    await expect(heroAnchor).toHaveAttribute("href", "#custom-services");
    const externalActions = main.locator('a[href]:not([href^="#"])');
    await expect(externalActions).toHaveCount(1);
    const cta = main.getByRole("link", { name: "前往咨询", exact: true });
    await expect(cta).toHaveAttribute("href", "/contact?type=custom");
    await expect(page.getByText("PRIVATE APPOINTMENT", { exact: true })).toHaveCount(0);

    if (viewport.name === "mobile") {
      await cta.scrollIntoViewIfNeeded();
      const box = await cta.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      expect(box!.width).toBeGreaterThanOrEqual(340);
    }
    await expectNoHorizontalOverflow(page);

    await cta.click();
    await expect(page).toHaveURL(/\/contact\?type=custom$/);
    const routedMain = page.locator("#main-content");
    await expect(routedMain).toBeFocused();
    const routedMainFocus = await readFocusStyle(routedMain);
    expect(routedMainFocus.outlineStyle).toBe("none");
    await expect(page.locator("#cf-type")).toHaveValue("高级定制");
    await expect(page.getByText("PRIVATE APPOINTMENT", { exact: true })).toHaveCount(0);
    await expect(page.locator('input[id*="product"], select[id*="product"], textarea[id*="product"]'))
      .toHaveCount(0);
    await expectWriteGate(writes);
  });

  test(`Contact ${viewport.name} 空联系方式、未知 type、首错焦点与双栏顺序`, async ({ page }) => {
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
      expect(formBox!.y).toBeLessThan(informationBox!.y);
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
    const [headerBox, nameBox, nameErrorBox] = await Promise.all([
      header.boundingBox(),
      name.boundingBox(),
      nameError.boundingBox(),
    ]);
    expect(headerBox && nameBox && nameErrorBox).toBeTruthy();
    expect(nameBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height + 8);
    expect(nameErrorBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
    expect(nameErrorBox!.y + nameErrorBox!.height).toBeLessThanOrEqual(viewport.height);
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
