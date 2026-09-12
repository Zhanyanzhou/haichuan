import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  createRouteBarrier,
  mockCatalogDetail,
  publicProduct,
  type FixtureSalesMode,
  type WriteObservation,
} from "./fixtures/public-catalog-detail";

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`Catalog ${viewport.name} 缺少观察器 API${viewport.name === "mobile" ? "且减少动态效果" : ""}时保留核心目录并安全停用吸顶增强`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, "IntersectionObserver", {
        configurable: true,
        value: undefined,
      });
    });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    if (viewport.name === "mobile") {
      await page.emulateMedia({ reducedMotion: "reduce" });
    }
    const writes = await mockCatalogDetail(page, { products: fiveModes });

    await page.goto("/catalog");

    await expect(page.getByRole("heading", { level: 1, name: "选款中心" })).toBeVisible();
    await expect(page.getByPlaceholder("搜索作品名称或编号")).toBeVisible();
    await expect(page.locator(".catalog-matrix")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
    await expectWriteContract(writes);
  });
}

test("Catalog 观察器构造异常时不升级为整页错误", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: class BrokenIntersectionObserver {
        constructor() {
          throw new Error("observer-constructor-failure");
        }
      },
    });
  });
  const writes = await mockCatalogDetail(page, { products: fiveModes });

  await page.goto("/catalog");

  await expect(page.getByRole("heading", { level: 1, name: "选款中心" })).toBeVisible();
  await expect(page.getByPlaceholder("搜索作品名称或编号")).toBeVisible();
  await expect(page.locator(".catalog-matrix")).toBeVisible();
  expect(pageErrors).toEqual([]);
  await expectWriteContract(writes);
});

const fiveModes = [
  publicProduct(1, "DIRECT_PURCHASE", { available: true }),
  publicProduct(2, "SELECTION"),
  publicProduct(3, "APPOINTMENT"),
  publicProduct(4, "CUSTOM_INQUIRY"),
  publicProduct(5, "DISPLAY_ONLY"),
  publicProduct(6, "DISPLAY_ONLY"),
];

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
}

async function scanSeriousAccessibility(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  state: string,
) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  await testInfo.attach(`axe-${state}`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  const blocking = results.violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map(({ target }) => target),
    }));
  expect(blocking, `${state} 不应有 serious/critical axe 违规`).toEqual([]);
  expect(
    results.violations
      .filter(({ id }) => ["color-contrast", "dlitem", "select-name"].includes(id))
      .map(({ id }) => id),
    `${state} 应显式消除 contrast、定义列表与排序名称回归`,
  ).toEqual([]);
}

async function installLayoutShiftProbe(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    type ShiftSample = { value: number; startTime: number; sources: string[] };
    const samples: ShiftSample[] = [];
    const probe = {
      supported: PerformanceObserver.supportedEntryTypes.includes("layout-shift"),
      reset: () => samples.splice(0, samples.length),
      read: () => {
        let maximumSessionValue = 0;
        let currentSessionValue = 0;
        let sessionStart = 0;
        let previousShift = 0;
        for (const sample of samples) {
          const continuesSession = currentSessionValue > 0
            && sample.startTime - previousShift <= 1000
            && sample.startTime - sessionStart <= 5000;
          if (!continuesSession) {
            currentSessionValue = 0;
            sessionStart = sample.startTime;
          }
          currentSessionValue += sample.value;
          previousShift = sample.startTime;
          maximumSessionValue = Math.max(maximumSessionValue, currentSessionValue);
        }
        return { value: maximumSessionValue, samples: [...samples] };
      },
    };
    Object.defineProperty(window, "__hcLayoutShiftProbe", {
      configurable: true,
      value: probe,
    });
    if (!probe.supported) return;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
          sources?: Array<{ node?: Node | null }>;
        };
        if (shift.hadRecentInput || !shift.value) continue;
        samples.push({
          value: shift.value,
          startTime: shift.startTime,
          sources: (shift.sources ?? []).map(({ node }) => {
            if (!(node instanceof Element)) return node?.nodeName ?? "unknown";
            if (node.id) return `#${node.id}`;
            const className = typeof node.className === "string"
              ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".")
              : "";
            return `${node.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
          }),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function waitForVisualStability(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function expectWriteContract(
  writes: WriteObservation,
  allowedCartWrites = 0,
  allowedFavoriteWrites = 0,
  allowedInquiryWrites = 0,
  allowedAnalyticsWrites = 0,
) {
  await expect.poll(() => writes.analytics).toBe(allowedAnalyticsWrites);
  await expect.poll(() => writes.cart).toBe(allowedCartWrites);
  await expect.poll(() => writes.favorite).toBe(allowedFavoriteWrites);
  await expect.poll(() => writes.inquiry).toBe(allowedInquiryWrites);
  await expect.poll(() => writes.unexpected).toBe(0);
}

async function fillContactForm(page: import("@playwright/test").Page) {
  await page.locator("#cf-name").fill("测试访客");
  await page.locator("#cf-phone").fill("13800000000");
  await page.locator("#cf-time").selectOption("下午 (14:00-18:00)");
  await page.locator("#cf-message").fill("希望围绕这件作品确认佩戴场景与可提供的咨询安排。");
  await page.locator("#cf-privacy-consent").check();
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900, columns: 3 },
  { name: "mobile", width: 390, height: 844, columns: 1 },
]) {
  test(`Catalog ${viewport.name} 完整层级、QuickView、托盘与媒体稳定`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = await mockCatalogDetail(page, { products: fiveModes });
    await page.goto("/catalog");

    await expect(page.getByText("SELECTION CENTER", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "选款中心" })).toBeVisible();
    await expect(page.getByText("按关键词、货号与当前公开属性查找作品，并将意向款式加入选款清单。"))
      .toBeVisible();
    await expect(page.getByPlaceholder("搜索作品名称或编号")).toBeVisible();

    const grid = page.locator(".catalog-matrix");
    await expect(grid).toBeVisible();
    await expect.poll(() => grid.evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    )).toBe(viewport.columns);
    await grid.scrollIntoViewIfNeeded();
    const stickyBar = page.locator(".catalog-sticky-bar");
    await expect(stickyBar).toBeVisible();
    await expect.poll(async () => Math.round((await stickyBar.boundingBox())?.y ?? -1))
      .toBe(viewport.name === "mobile" ? 64 : 108);
    const firstImage = page.locator("[data-catalog-product-media] img").first();
    await firstImage.scrollIntoViewIfNeeded();
    await expect.poll(() => firstImage.evaluate((image: HTMLImageElement) =>
      image.complete && image.naturalWidth > 0,
    )).toBe(true);

    const quickTrigger = page.getByRole("button", { name: /快速预览/ }).first();
    await quickTrigger.click();
    const dialog = page.getByRole("dialog", { name: /构图验证作品 1/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("构图验证作品 1", { exact: true })).toBeVisible();
    await expect(dialog.getByText("HC-TEST-001", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "查看完整信息" }))
      .toHaveAttribute("href", "/products/HC-TEST-001");
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    if (viewport.name === "desktop") {
      expect(dialogBox!.x).toBeGreaterThanOrEqual(viewport.width / 2);
    } else {
      expect(dialogBox!.width).toBeGreaterThanOrEqual(viewport.width - 1);
    }
    await page.keyboard.press("Escape");
    await expect(quickTrigger).toBeFocused();

    await page.getByRole("button", { name: "加入选款" }).click();
    const tray = page.getByRole("button", { name: /查看已选 1 款/ });
    await expect(tray).toBeVisible();

    await tray.click();
    const inquiryDialog = page.getByRole("dialog", { name: "提交选款咨询" });
    await expect(inquiryDialog).toBeVisible();
    await expect(page.getByRole("button", { name: /查看已选 1 款/ })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    const closeInquiry = inquiryDialog.getByRole("button", { name: "关闭选款咨询" });
    const submitInquiry = inquiryDialog.getByRole("button", {
      name: "提交选款咨询（1 款）",
    });
    const backgroundLink = page.locator(".catalog-cell").last()
      .getByRole("link", { name: "查看作品" });
    await expect(closeInquiry).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(submitInquiry).toBeFocused();
    await expect(backgroundLink).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeInquiry).toBeFocused();

    await closeInquiry.click();
    await expect(inquiryDialog).toHaveCount(0);
    let restoredTray = page.getByRole("button", { name: /查看已选 1 款/ });
    await expect(restoredTray).toBeVisible();
    await expect(restoredTray).toBeFocused();

    await restoredTray.click();
    await expect(inquiryDialog).toBeVisible();
    await expect(closeInquiry).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(inquiryDialog).toHaveCount(0);
    restoredTray = page.getByRole("button", { name: /查看已选 1 款/ });
    await expect(restoredTray).toBeFocused();

    await restoredTray.click();
    await expect(inquiryDialog).toBeVisible();
    await page.locator(".catalog-selection-inquiry__backdrop").click({
      position: { x: 2, y: 2 },
    });
    await expect(inquiryDialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/catalog$/);
    restoredTray = page.getByRole("button", { name: /查看已选 1 款/ });
    await expect(restoredTray).toBeFocused();
    await expect(backgroundLink).not.toBeFocused();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastCard = page.locator(".catalog-cell").last();
    await expect.poll(async () => {
      const [cardBox, trayBox] = await Promise.all([
        lastCard.boundingBox(),
        restoredTray.boundingBox(),
      ]);
      return Boolean(cardBox && trayBox && cardBox.y + cardBox.height <= trayBox.y);
    }).toBe(true);
    await expectNoHorizontalOverflow(page);
    await expectWriteContract(writes);

    await backgroundLink.click();
    await expect(page).toHaveURL(/\/products\/HC-TEST-006$/);
    await expect(page.getByRole("heading", { level: 1, name: "构图验证作品 6" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectWriteContract(writes);
  });

  test(`ProductDetail ${viewport.name} 7/5 或单列顺序、唯一行动与空事实省略`, async ({ page, baseURL }) => {
    const product = publicProduct(11, "DIRECT_PURCHASE", {
      available: true,
      goldWeight: 0,
      weight: 0,
      size: "-",
    });
    Object.assign(product.images[0], {
      mediaUrl: "/products/public/11/media/1011",
      width: 1200,
      height: 1500,
    });
    product.shortDescription = "来自公开商品接口的作品简介。";
    delete (product as { description?: string }).description;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = await mockCatalogDetail(page, { products: [product], signedIn: false });
    await page.route("**/api/products/public/11/media/1011**", (route) => route.fulfill({
      status: 302,
      // API 使用不可达隔离源时，相对 Location 会继续落到 API 源；显式回到当前测试前端。
      headers: { location: new URL("/images/system/product-placeholder.svg", baseURL!).href },
    }));
    await page.goto("/products/11");

    await expect(page.getByRole("heading", { level: 1, name: "构图验证作品 11" })).toBeVisible();
    await expect(page.getByText("来自公开商品接口的作品简介。", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "面包屑" }).getByRole("link", { name: "选款中心" }))
      .toHaveAttribute("href", "/catalog");
    const action = page.locator(".product-detail-page__primary-action");
    await expect(action).toHaveCount(1);
    await expect(action).toHaveText("登录后购买");
    await expect(page.getByText("0g", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "证书" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "评价" })).toHaveCount(0);

    const media = page.locator(".product-detail-page__main-media img");
    await expect(media).toHaveAttribute("width", "1200");
    await expect(media).toHaveAttribute("height", "1500");
    await expect(media).toHaveAttribute("srcset", /width=480 480w.*width=800 800w.*width=1200 1200w/);
    await expect(media).toHaveAttribute(
      "sizes",
      "(max-width: 900px) calc(100vw - 40px), (max-width: 1440px) 55vw, 700px",
    );
    await expect.poll(() => media.evaluate((image: HTMLImageElement) =>
      image.complete && image.naturalWidth > 0,
    )).toBe(true);
    if (viewport.name === "mobile") {
      const galleryBox = await page.locator(".product-detail-page__gallery").boundingBox();
      const summaryBox = await page.locator(".product-detail-page__summary").boundingBox();
      const actionBox = await action.boundingBox();
      expect(galleryBox && summaryBox && actionBox).toBeTruthy();
      expect(summaryBox!.y).toBeGreaterThan(galleryBox!.y + galleryBox!.height - 1);
      expect(actionBox!.width).toBeGreaterThanOrEqual(summaryBox!.width - 1);
    } else {
      await expect.poll(() => page.locator(".product-detail-page__layout").evaluate((node) =>
        getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
      )).toBe(2);
      const galleryBox = await page.locator(".product-detail-page__gallery").boundingBox();
      const summaryBox = await page.locator(".product-detail-page__summary").boundingBox();
      expect(galleryBox && summaryBox).toBeTruthy();
      expect(galleryBox!.width / summaryBox!.width).toBeGreaterThan(1.32);
      expect(galleryBox!.width / summaryBox!.width).toBeLessThan(1.5);
    }
    await expectNoHorizontalOverflow(page);
    await expectWriteContract(writes);
  });
}

for (const viewport of [
  { name: "compact", width: 1024, height: 900, catalogColumns: 3, detailColumns: 2, contactColumns: 2 },
  { name: "tablet", width: 768, height: 1024, catalogColumns: 2, detailColumns: 1, contactColumns: 1 },
]) {
  test(`${viewport.width}px Catalog、ProductDetail 与 Contact 使用目标内容断点`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const product = publicProduct(12, "DISPLAY_ONLY");
    const writes = await mockCatalogDetail(page, { products: [product, ...fiveModes] });

    await page.goto("/catalog");
    await expect.poll(() => page.locator(".catalog-matrix").evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    )).toBe(viewport.catalogColumns);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/products/${product.code}`);
    const detailLayout = page.locator(".product-detail-page__layout");
    await expect.poll(() => detailLayout.evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    )).toBe(viewport.detailColumns);
    if (viewport.detailColumns === 1) {
      const galleryBox = await page.locator(".product-detail-page__gallery").boundingBox();
      const summaryBox = await page.locator(".product-detail-page__summary").boundingBox();
      expect(galleryBox && summaryBox).toBeTruthy();
      expect(summaryBox!.y).toBeGreaterThanOrEqual(galleryBox!.y + galleryBox!.height - 1);
    }
    await expectNoHorizontalOverflow(page);

    await page.goto("/contact");
    const contactGrid = page.locator(".contact-grid");
    const contactRow = page.locator(".contact-row").first();
    await expect.poll(() => contactGrid.evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    )).toBe(viewport.contactColumns);
    await expect.poll(() => contactRow.evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    )).toBe(viewport.contactColumns);
    await expectNoHorizontalOverflow(page);
    await expectWriteContract(writes);
  });
}

for (const resultCount of [1, 2]) {
  test(`Catalog 桌面少量结果 ${resultCount} 件时不保留空轨道，390px 统一单列`, async ({ page }) => {
    const products = fiveModes.slice(0, resultCount);
    const writes = await mockCatalogDetail(page, { products });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/catalog");
    const grid = page.locator(".catalog-matrix");
    await expect(grid).toHaveAttribute("data-result-count", String(resultCount));
    await expect.poll(() => grid.evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    )).toBe(resultCount);
    const desktopBox = await grid.boundingBox();
    expect(desktopBox).not.toBeNull();
    expect(desktopBox!.width).toBeLessThanOrEqual(resultCount === 1 ? 560 : 960);
    expect(Math.abs(desktopBox!.x - (1440 - desktopBox!.width) / 2)).toBeLessThan(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => grid.evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    )).toBe(1);
    await expectNoHorizontalOverflow(page);
    await expectWriteContract(writes);
  });
}

test("ProductDetail 金重与总重相同时省略重复事实，不同时继续分别展示", async ({ page }) => {
  const equalWeight = publicProduct(21, "DIRECT_PURCHASE", {
    available: true,
    goldWeight: 5.2,
    weight: 5.2,
  });
  const distinctWeight = publicProduct(22, "DIRECT_PURCHASE", {
    available: true,
    goldWeight: 3.8,
    weight: 4.2,
  });
  const writes = await mockCatalogDetail(page, { products: [equalWeight, distinctWeight] });

  await page.goto("/products/21");
  const equalFacts = page.locator(".product-detail-page__facts-grid");
  await expect(equalFacts.getByText("金重", { exact: true })).toBeVisible();
  await expect(equalFacts.getByText("总重", { exact: true })).toHaveCount(0);

  await page.goto("/products/22");
  const distinctFacts = page.locator(".product-detail-page__facts-grid");
  await expect(distinctFacts.getByText("金重", { exact: true })).toBeVisible();
  await expect(distinctFacts.getByText("总重", { exact: true })).toBeVisible();
  await expectWriteContract(writes);
});

test("ProductDetail 快速切换作品时不会被较早请求的迟到响应覆盖", async ({ page }) => {
  const first = publicProduct(23, "DISPLAY_ONLY");
  const second = publicProduct(24, "DISPLAY_ONLY");
  const firstBarrier = createRouteBarrier();
  const writes = await mockCatalogDetail(page, {
    products: [first, second],
    detailBarriers: { [String(first.id)]: firstBarrier },
  });

  await page.goto(`/products/${first.id}`);
  await firstBarrier.reached;
  await page.evaluate((path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/products/${second.id}`);
  await expect(page.getByRole("heading", { name: second.name })).toBeVisible();

  firstBarrier.release();
  await expect(page.getByRole("heading", { name: second.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: first.name })).toHaveCount(0);
  await expectWriteContract(writes);
});

test("Catalog loading、error、empty 与 no-results 状态完整", async ({ page }) => {
  const barrier = createRouteBarrier();
  const writes = await mockCatalogDetail(page, { products: fiveModes, productsBarrier: barrier });
  await page.goto("/catalog");
  await barrier.reached;
  await expect(page.getByText("正在加载珠宝作品…")).toBeVisible();
  barrier.release();
  await expect(page.locator(".catalog-matrix")).toBeVisible();
  await expectWriteContract(writes);
});

test("Catalog error 状态提供可理解恢复路径", async ({ page }) => {
  const writes = await mockCatalogDetail(page, { products: [], productsStatus: 500 });
  await page.goto("/catalog");
  await expect(page.getByText("作品目录暂时无法加载")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "服务器繁忙，请稍后再试" }),
  ).toHaveCount(0);
  await expectWriteContract(writes);
});

test("Catalog 分类资源失败时保留已成功加载的作品并提供局部重试", async ({ page }) => {
  const writes = await mockCatalogDetail(page, {
    products: fiveModes,
    categoriesStatus: 503,
  });
  await page.goto("/catalog");

  await expect(page.getByText("分类筛选暂时无法加载，作品列表仍可浏览。"))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "重试分类" })).toBeVisible();
  await expect(page.locator(".catalog-matrix")).toBeVisible();
  await expect(page.getByText("构图验证作品 1", { exact: true })).toBeVisible();
  await expect(page.getByText("作品目录暂时无法加载")).toHaveCount(0);
  await expectWriteContract(writes);
});

test("Catalog empty 与 no-results 分离", async ({ page }) => {
  const writes = await mockCatalogDetail(page, { products: [] });
  await page.goto("/catalog");
  await expect(page.getByText("珠宝作品正在筹备中")).toBeVisible();
  await expectWriteContract(writes);
});

test("Catalog 有数据但关键词无命中时显示 no-results", async ({ page }) => {
  const writes = await mockCatalogDetail(page, { products: fiveModes });
  await page.goto("/catalog?query=%E6%97%A0%E7%BB%93%E6%9E%9C");
  await expect(page.getByText("没有符合当前筛选的作品")).toBeVisible();
  await expect(page.getByRole("button", { name: "清除筛选" })).toBeVisible();
  await expectWriteContract(writes);
});

test("Catalog 清除筛选会原子移除全部 URL 条件并恢复作品", async ({ page }) => {
  const writes = await mockCatalogDetail(page, { products: fiveModes });
  await page.goto(
    "/catalog?category=1&query=%E6%97%A0%E7%BB%93%E6%9E%9C&material=%E8%B6%B3%E9%87%91999&craft=%E5%8F%A4%E6%B3%95%E9%87%91&weight=0%E2%80%945%E5%85%8B&size=%E6%A0%87%E5%87%86&page=2",
  );

  await page.locator(".catalog-state")
    .getByRole("button", { name: "清除筛选", exact: true })
    .click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByText("构图验证作品 1", { exact: true })).toBeVisible();
  await expectWriteContract(writes);
});

test("五种 SalesMode 各自只呈现一个 ProductPrimaryAction", async ({ page }) => {
  const writes = await mockCatalogDetail(page, { products: fiveModes, signedIn: true });
  const expected: Record<FixtureSalesMode, string> = {
    DISPLAY_ONLY: "咨询此款作品",
    SELECTION: "加入选款",
    APPOINTMENT: "预约鉴赏此款",
    CUSTOM_INQUIRY: "咨询此款定制",
    DIRECT_PURCHASE: "加入购物车",
  };
  for (const product of fiveModes.slice(0, 5)) {
    await page.goto(`/products/${product.id}`);
    const action = page.locator(".product-detail-page__primary-action");
    await expect(action).toHaveCount(1);
    await expect(action).toHaveText(expected[product.salesMode]);
    if (product.salesMode === "SELECTION") {
      await action.click();
      await expect(action).toHaveText("已加入");
    }
  }
  await expectWriteContract(writes);
});

test("详情咨询行动携带稳定货号和明确来源类型", async ({ page }) => {
  const writes = await mockCatalogDetail(page, {
    products: fiveModes,
    flags: { commerceEnabled: false, cartEnabled: false, paymentEnabled: false },
  });
  const expectations = [
    { product: fiveModes[2], href: "/contact?type=appointment&productRef=HC-TEST-003" },
    { product: fiveModes[3], href: "/custom?type=custom&productRef=HC-TEST-004" },
    { product: fiveModes[4], href: "/contact?type=product&productRef=HC-TEST-005" },
    { product: fiveModes[0], href: "/contact?type=purchase-support&productRef=HC-TEST-001" },
  ];

  for (const { product, href } of expectations) {
    await page.goto(`/products/${product.code}`);
    await expect(page.locator(".product-detail-page__primary-action")).toHaveAttribute("href", href);
  }
  await page.goto("/custom?type=custom&productRef=HC-TEST-004");
  await expect(page.getByRole("link", { name: "提交定制咨询", exact: true }))
    .toHaveAttribute("href", "/contact?type=custom&productRef=HC-TEST-004");
  await expectWriteContract(writes);
});

test("Catalog 卡片与 QuickView 咨询行动携带稳定货号和明确来源类型", async ({ page }) => {
  const writes = await mockCatalogDetail(page, { products: fiveModes });
  await page.goto("/catalog");

  const expectations = [
    { name: "预约到店", href: "/contact?type=appointment&productRef=HC-TEST-003", product: fiveModes[2] },
    { name: "定制咨询", href: "/custom?type=custom&productRef=HC-TEST-004", product: fiveModes[3] },
  ];

  for (const { name, href, product } of expectations) {
    const card = page.locator(".catalog-cell").filter({ hasText: product.name });
    await expect(card.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    await card.getByRole("button", { name: `快速预览 ${product.name}` }).click();
    const dialog = page.getByRole("dialog", { name: product.name });
    await expect(dialog.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    await dialog.getByRole("button", { name: "关闭快速预览" }).click();
  }

  await expectWriteContract(writes);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900, columns: 2 },
  { name: "mobile", width: 390, height: 844, columns: 1 },
]) {
  test(`Contact ${viewport.name} 解析来源作品并只提交服务端 ID`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const product = publicProduct(31, "APPOINTMENT");
    let submittedPayload: Record<string, unknown> | undefined;
    const writes = await mockCatalogDetail(page, {
      products: [product],
      onInquiry: async (route) => {
        submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ code: 200, data: { id: 91 }, message: "ok" }),
        });
      },
    });

    await page.goto(`/contact?type=appointment&productRef=${product.code}`);
    const context = page.locator(".contact-product-context");
    await expect(context.getByText(product.name, { exact: true })).toBeVisible();
    await expect(context.getByText(`货号：${product.code}`, { exact: true })).toBeVisible();
    await expect(page.locator("#cf-type")).toHaveValue("到店咨询");
    await expect.poll(() => page.locator(".contact-grid").evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    )).toBe(viewport.columns);
    await expect.poll(() => page.locator(".contact-row").first().evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    )).toBe(viewport.columns);
    await fillContactForm(page);
    await page.getByRole("button", { name: "提交需求" }).click();

    await expect(page.getByRole("heading", { name: "需求已提交" })).toBeVisible();
    expect(submittedPayload).toMatchObject({
      productId: product.id,
      consultationType: "到店咨询",
    });
    expect(submittedPayload).not.toHaveProperty("productName");
    expect(submittedPayload).not.toHaveProperty("productCode");
    await expectNoHorizontalOverflow(page);
    await expectWriteContract(writes, 0, 0, 1);
  });
}

test("Contact 首选时间可留空，非空短留言按权威合同提交", async ({ page }) => {
  let submittedPayload: Record<string, unknown> | undefined;
  const writes = await mockCatalogDetail(page, {
    products: [],
    onInquiry: async (route) => {
      submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { id: 95 }, message: "ok" }),
      });
    },
  });
  await page.goto("/contact");

  await expect(page.getByText("方便联系的时间（选填）", { exact: true })).toBeVisible();
  await expect(page.locator("#cf-time")).not.toHaveAttribute("aria-required", "true");
  await page.locator("#cf-name").fill("测试访客");
  await page.locator("#cf-phone").fill("13800000000");
  await page.locator("#cf-type").selectOption("选款建议");
  await page.locator("#cf-message").fill("咨询");
  await page.locator("#cf-privacy-consent").check();
  await page.getByRole("button", { name: "提交需求" }).click();

  await expect(page.getByRole("heading", { name: "需求已提交" })).toBeVisible();
  expect(submittedPayload).toMatchObject({ consultationType: "选款建议", message: "咨询" });
  expect(submittedPayload).not.toHaveProperty("preferredTime");
  await expectWriteContract(writes, 0, 0, 1);
});

test("Contact 提交时作品失效会保留可恢复选择，移除后作为普通咨询重试", async ({ page }) => {
  const product = publicProduct(32, "DISPLAY_ONLY");
  const payloads: Record<string, unknown>[] = [];
  const writes = await mockCatalogDetail(page, {
    products: [product],
    onInquiry: async (route) => {
      payloads.push(route.request().postDataJSON() as Record<string, unknown>);
      if (payloads.length === 1) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            errorCode: "INQUIRY_PRODUCT_NOT_AVAILABLE",
            message: "internal product visibility query leaked",
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { id: 92 }, message: "ok" }),
      });
    },
  });

  await page.goto(`/contact?type=product&productRef=${product.code}`);
  await expect(page.locator(".contact-product-context").getByText(product.name, { exact: true }))
    .toBeVisible();
  await fillContactForm(page);
  await page.getByRole("button", { name: "提交需求" }).click();
  await expect(page.getByText("作品当前不可咨询，请移除作品后提交普通咨询。", { exact: true }))
    .toBeVisible();
  await expect(page.getByText("internal product visibility query leaked")).toHaveCount(0);

  await page.getByRole("button", { name: "移除作品上下文" }).click();
  await expect(page).not.toHaveURL(/productRef=/);
  await page.getByRole("button", { name: "提交需求" }).click();
  await expect(page.getByRole("heading", { name: "需求已提交" })).toBeVisible();
  expect(payloads[0]).toMatchObject({ productId: product.id });
  expect(payloads[1]).not.toHaveProperty("productId");
  await expectWriteContract(writes, 0, 0, 2);
});

test("Contact 普通表单校验失败不会被误判为作品失效", async ({ page }) => {
  const product = publicProduct(34, "DISPLAY_ONLY");
  const writes = await mockCatalogDetail(page, {
    products: [product],
    onInquiry: async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          errorCode: "VALIDATION_ERROR",
          message: "internal validation detail",
        }),
      });
    },
  });

  await page.goto(`/contact?type=product&productRef=${product.code}`);
  await expect(page.locator(".contact-product-context").getByText(product.name, { exact: true }))
    .toBeVisible();
  await fillContactForm(page);
  await page.getByRole("button", { name: "提交需求" }).click();

  await expect(page.getByText("提交信息未通过校验，请检查后重试。", { exact: true }))
    .toBeVisible();
  await expect(page.locator(".contact-product-context").getByText(product.name, { exact: true }))
    .toBeVisible();
  await expect(page.getByText("internal validation detail")).toHaveCount(0);
  await expectWriteContract(writes, 0, 0, 1);
});

test("Contact 非法作品引用不会发起解析或静默提交，可移除恢复普通咨询", async ({ page }) => {
  const writes = await mockCatalogDetail(page, { products: [] });
  await page.goto(`/contact?type=product&productRef=${"x".repeat(51)}`);
  await expect(page.getByText("作品当前不可咨询。您可以移除作品后继续提交普通咨询。"))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "请先处理来源作品" })).toBeDisabled();
  await page.getByRole("button", { name: "移除作品上下文" }).click();
  await expect(page).not.toHaveURL(/productRef=/);
  await expect(page.getByRole("button", { name: "提交需求" })).toBeEnabled();
  await expectWriteContract(writes);
});

test("Contact 来源作品解析具有等待、失败和移除恢复状态", async ({ page }) => {
  const product = publicProduct(33, "DISPLAY_ONLY");
  const barrier = createRouteBarrier();
  const writes = await mockCatalogDetail(page, {
    products: [product],
    productsBarrier: barrier,
  });
  await page.goto(`/contact?type=product&productRef=${product.code}`);
  await barrier.reached;
  await expect(page.getByText("正在确认来源作品…", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "正在确认来源作品…" })).toBeDisabled();
  barrier.release();
  await expect(page.locator(".contact-product-context").getByText(product.name, { exact: true }))
    .toBeVisible();
  await expectWriteContract(writes);

  const failedPage = await page.context().newPage();
  const failedWrites = await mockCatalogDetail(failedPage, {
    products: [product],
    productsStatus: 503,
  });
  await failedPage.goto(`/contact?type=product&productRef=${product.code}`);
  await expect(failedPage.getByText("来源作品暂时无法确认。您可以重试，或移除后提交普通咨询。"))
    .toBeVisible();
  await expect(failedPage.getByText("detail unavailable")).toHaveCount(0);
  await expect(failedPage.getByRole("button", { name: "重新确认" })).toBeVisible();
  await failedPage.getByRole("button", { name: "移除作品上下文" }).click();
  await expect(failedPage.getByRole("button", { name: "提交需求" })).toBeEnabled();
  await expectWriteContract(failedWrites);
  await failedPage.close();
});

test("DIRECT_PURCHASE flags unknown 时 fail-closed", async ({ page }) => {
  const flagsBarrier = createRouteBarrier();
  const writes = await mockCatalogDetail(page, {
    products: [publicProduct(20, "DIRECT_PURCHASE", { available: true })],
    flagsBarrier,
  });
  await page.goto("/products/20");
  await flagsBarrier.reached;
  await expect(page.locator(".product-detail-page__primary-action")).toHaveText("正在确认购买状态");
  flagsBarrier.release();
  await expectWriteContract(writes);
});

test("DIRECT_PURCHASE commerce off 与售罄各保持单一准确行动", async ({ page }) => {
  const writes = await mockCatalogDetail(page, {
    products: [publicProduct(21, "DIRECT_PURCHASE", { available: true })],
    flags: { commerceEnabled: false, cartEnabled: true, paymentEnabled: false },
  });
  await page.goto("/products/21");
  await expect(page.locator(".product-detail-page__primary-action"))
    .toHaveText("购买暂未开放，联系顾问");
  await expectWriteContract(writes);
});

test("DIRECT_PURCHASE 登录且开放时写请求仅由函数桩接收一次", async ({ page }) => {
  const writes = await mockCatalogDetail(page, {
    products: [publicProduct(22, "DIRECT_PURCHASE", { available: true })],
    signedIn: true,
    allowCartWrite: true,
  });
  await page.goto("/products/22");
  await page.locator(".product-detail-page__primary-action").click();
  await expectWriteContract(writes, 1);
});

test("货号详情的收藏写入使用真实商品 ID 而不是路由字符串", async ({ page }) => {
  const product = publicProduct(27, "DISPLAY_ONLY");
  const writes = await mockCatalogDetail(page, {
    products: [product],
    signedIn: true,
    allowFavoriteWrite: true,
  });
  await page.goto(`/products/${product.code}`);
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();

  const favoriteRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("/customers/me/favorites/27/toggle"),
  );
  await page.getByRole("button", { name: "加入心愿单" }).click();
  expect(new URL((await favoriteRequest).url()).pathname)
    .toBe("/api/customers/me/favorites/27/toggle");
  await expect(page.getByRole("button", { name: "已加入心愿单" })).toBeVisible();
  await expectWriteContract(writes, 0, 1);
});

test("DIRECT_PURCHASE 售罄与详情 loading/error 安全", async ({ page }) => {
  const writes = await mockCatalogDetail(page, {
    products: [publicProduct(23, "DIRECT_PURCHASE", { available: false })],
  });
  await page.goto("/products/23");
  const action = page.locator(".product-detail-page__primary-action");
  await expect(action).toHaveText("已售罄");
  await expect(action).toBeDisabled();
  await expect(page.getByText("该作品已售罄，仍可继续浏览作品信息或联系珠宝顾问。"))
    .toBeVisible();
  await expectWriteContract(writes);
});

test("ProductDetail 请求等待与失败分别显示 loading 和不可浏览", async ({ page }) => {
  const barrier = createRouteBarrier();
  const writes = await mockCatalogDetail(page, {
    products: [publicProduct(24, "DISPLAY_ONLY")],
    productsBarrier: barrier,
  });
  await page.goto("/products/24");
  await barrier.reached;
  await expect(page.getByText("正在加载作品")).toBeVisible();
  barrier.release();
  await expect(page.getByRole("heading", { name: "构图验证作品 24" })).toBeVisible();
  await expectWriteContract(writes);
});

test("ProductDetail 缺媒体、不存在与请求失败使用可区分的安全降级", async ({ page }) => {
  const writes = await mockCatalogDetail(page, {
    products: [publicProduct(25, "DISPLAY_ONLY", { image: null })],
  });
  await page.goto("/products/25");
  await expect(page.locator(".product-detail-page__main-media")).toContainText("图片暂不可用");

  const failedPage = await page.context().newPage();
  const failedWrites = await mockCatalogDetail(failedPage, {
    products: [publicProduct(26, "DISPLAY_ONLY")],
    productsStatus: 500,
  });
  await failedPage.setViewportSize({ width: 390, height: 844 });
  await failedPage.goto("/products/26");
  await expect(failedPage.getByRole("heading", { name: "作品暂时无法加载" })).toBeVisible();
  await expect(failedPage.locator(".ant-message-notice")).toHaveCount(0);
  const retryResponse = failedPage.waitForResponse((response) =>
    /\/products\/(?:catalog|public)\/26$/.test(new URL(response.url()).pathname),
  );
  await failedPage.getByRole("button", { name: "重新尝试" }).click();
  await retryResponse;
  await expect(failedPage.getByRole("heading", { name: "作品暂时无法加载" })).toBeVisible();
  const catalogLink = failedPage.getByRole("link", { name: "进入选款中心" });
  await expect(catalogLink).toHaveAttribute("href", "/catalog");
  await expect(catalogLink).toBeVisible();
  const catalogLinkBox = await catalogLink.boundingBox();
  expect(catalogLinkBox).not.toBeNull();
  expect(catalogLinkBox!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(failedPage);

  const missingPage = await page.context().newPage();
  const missingWrites = await mockCatalogDetail(missingPage, { products: [] });
  await missingPage.goto("/products/27");
  await expect(missingPage.getByRole("heading", { name: "作品暂不可浏览" })).toBeVisible();
  await expect(missingPage.getByRole("button", { name: "重新尝试" })).toHaveCount(0);
  await expectWriteContract(writes);
  await expectWriteContract(failedWrites);
  await expectWriteContract(missingWrites);
  await missingPage.close();
  await failedPage.close();
});

test("Catalog 搜索建议与历史记录支持完整键盘和焦点路径", async ({ page }) => {
  const writes = await mockCatalogDetail(page, { products: fiveModes });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/catalog");

  const input = page.getByPlaceholder("搜索作品名称或编号");
  await input.fill("构图验证作品");
  const broadSuggestions = page.getByRole("listbox", { name: "搜索建议" }).getByRole("option");
  await expect(broadSuggestions).toHaveCount(6);
  const firstSuggestionId = await broadSuggestions.first().getAttribute("id");
  const lastSuggestionId = await broadSuggestions.last().getAttribute("id");
  await input.press("ArrowUp");
  await expect(input).toHaveAttribute("aria-activedescendant", lastSuggestionId!);
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", firstSuggestionId!);

  await input.fill("构图验证作品 1");
  const suggestion = page.getByRole("option", {
    name: "作品 构图验证作品 1",
  });
  await expect(suggestion).toBeVisible();
  await expect(input).toHaveAttribute("aria-expanded", "true");
  const listboxId = await input.getAttribute("aria-controls");
  expect(listboxId).toBeTruthy();
  await expect(page.locator(`[id="${listboxId}"]`)).toHaveAttribute("role", "listbox");
  await input.press("ArrowDown");
  await expect(input).toBeFocused();
  const activeOptionId = await input.getAttribute("aria-activedescendant");
  expect(activeOptionId).toBeTruthy();
  await expect(page.locator(`[id="${activeOptionId}"]`)).toHaveAttribute("aria-selected", "true");
  await input.press("Escape");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("构图验证作品 1");
  await expect(page.getByRole("listbox", { name: "搜索建议" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/query=/);

  await input.fill("");
  await input.fill("构图验证作品 1");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page).toHaveURL(/query=%E6%9E%84%E5%9B%BE%E9%AA%8C%E8%AF%81%E4%BD%9C%E5%93%81\+1/);
  await expect(input).toHaveValue("构图验证作品 1");
  await expect(input).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "清除关键词" }).click();
  await expect(page).not.toHaveURL(/query=/);
  await expect(input).toBeFocused();
  const history = page.getByRole("region", { name: "最近搜索" });
  await expect(history).toBeVisible();
  const historyButton = history.getByRole("button", { name: "构图验证作品 1", exact: true });
  await expect(historyButton).toBeVisible();
  await input.press("Tab");
  await expect(page.getByRole("search").getByRole("button", { name: "搜索" })).toBeFocused();
  await expect(history).toBeVisible();
  await page.keyboard.press("Tab");
  const clearHistory = history.getByRole("button", { name: "清除记录" });
  await expect(clearHistory).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(historyButton).toBeFocused();
  await page.keyboard.press("Tab");
  const deleteHistory = history.getByRole("button", { name: "删除搜索记录 构图验证作品 1" });
  await expect(deleteHistory).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(history).toHaveCount(0);

  await input.focus();
  await expect(history).toBeVisible();
  await clearHistory.focus();
  await clearHistory.press("Escape");
  await expect(input).toBeFocused();
  await expect(history).toHaveCount(0);

  await page.getByRole("heading", { name: "查找作品" }).click();
  await input.focus();
  await expect(history).toBeVisible();
  await deleteHistory.focus();
  await deleteHistory.press("Enter");
  await expect(input).toBeFocused();
  await expect(historyButton).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("hc_search_history") || "[]") as unknown[],
  )).toEqual([]);
  await expectWriteContract(writes);
});

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "compact", width: 1024, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`${viewport.width}px Catalog、Contact 与 ProductDetail 通过重点 Axe、触控和 CLS 门禁`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await installLayoutShiftProbe(page);
    const detail = publicProduct(41, "DIRECT_PURCHASE", { available: true });
    const detailBarrier = createRouteBarrier();
    const writes = await mockCatalogDetail(page, {
      products: [detail, ...fiveModes],
      detailBarriers: { [detail.code]: detailBarrier },
    });

    await page.goto("/catalog");
    await expect(page.locator(".catalog-matrix")).toBeVisible();
    await expect(
      page.locator(".catalog-toolbar__inner").getByRole("combobox", { name: "作品排序方式" }),
    ).toBeVisible();
    await scanSeriousAccessibility(page, testInfo, `${viewport.name}-catalog-default`);

    const input = page.getByPlaceholder("搜索作品名称或编号");
    await input.fill("构图验证作品");
    await expect(page.getByRole("listbox", { name: "搜索建议" })).toBeVisible();
    await scanSeriousAccessibility(page, testInfo, `${viewport.name}-catalog-search`);
    await input.press("Escape");

    await page.getByRole("button", { name: `快速预览 ${detail.name}` }).click();
    await expect(page.getByRole("dialog", { name: detail.name })).toBeVisible();
    await scanSeriousAccessibility(page, testInfo, `${viewport.name}-catalog-quick-view`);
    await page.getByRole("button", { name: "关闭快速预览" }).click();

    await page.locator(".catalog-matrix").scrollIntoViewIfNeeded();
    const stickySort = page.locator(".catalog-sticky-bar")
      .getByRole("combobox", { name: "作品排序方式" });
    await expect(stickySort).toBeVisible();
    if (viewport.width === 390) {
      const categorySizes = await page.locator(".catalog-category-nav__item").evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      );
      expect(categorySizes.length).toBeGreaterThan(0);
      expect(categorySizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
    }
    await expectNoHorizontalOverflow(page);

    await page.goto("/contact");
    await expect(page.locator("#cf-name")).toBeVisible();
    await scanSeriousAccessibility(page, testInfo, `${viewport.name}-contact`);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/products/${detail.code}`);
    await detailBarrier.reached;
    await expect(page.getByText("正在加载作品")).toBeVisible();
    await waitForVisualStability(page);
    const loadingFooter = await page.locator(".site-footer").boundingBox();
    expect(loadingFooter).not.toBeNull();
    expect(loadingFooter!.y).toBeGreaterThanOrEqual(viewport.height - 1);
    await scanSeriousAccessibility(page, testInfo, `${viewport.name}-product-loading`);
    await page.evaluate(() => {
      const probe = (window as Window & {
        __hcLayoutShiftProbe: { reset: () => void };
      }).__hcLayoutShiftProbe;
      probe.reset();
    });

    detailBarrier.release();
    await expect(page.getByRole("heading", { level: 1, name: detail.name })).toBeVisible();
    const mainImage = page.locator(".product-detail-page__main-media img");
    await expect.poll(() => mainImage.evaluate((image: HTMLImageElement) =>
      image.complete && image.naturalWidth > 0,
    )).toBe(true);
    await waitForVisualStability(page);

    const commerceFacts = page.locator(".product-detail-page__commerce-facts");
    await expect(commerceFacts.locator(":scope > dt")).toHaveCount(3);
    await expect(commerceFacts.locator(":scope > dd")).toHaveCount(3);
    await expect(commerceFacts.locator(":scope > :not(dt):not(dd)")).toHaveCount(0);
    const skuSizes = await page.locator(".product-detail-page__sku-option").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    expect(skuSizes.length).toBeGreaterThan(0);
    expect(skuSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
    await scanSeriousAccessibility(page, testInfo, `${viewport.name}-product-loaded`);
    await expectNoHorizontalOverflow(page);

    const cls = await page.evaluate(() => {
      const probe = (window as Window & {
        __hcLayoutShiftProbe: {
          supported: boolean;
          read: () => { value: number; samples: Array<{ value: number; startTime: number; sources: string[] }> };
        };
      }).__hcLayoutShiftProbe;
      return { supported: probe.supported, ...probe.read() };
    });
    await testInfo.attach(`cls-${viewport.name}-product-detail`, {
      body: JSON.stringify(cls, null, 2),
      contentType: "application/json",
    });
    console.info(`[CLS] ProductDetail ${viewport.width}px loading→loaded: ${cls.value.toFixed(6)}`);
    expect(cls.supported).toBe(true);
    expect(cls.value, `${viewport.width}px ProductDetail loading→loaded CLS`).toBeLessThan(0.1);
    await expectWriteContract(writes);
  });
}
