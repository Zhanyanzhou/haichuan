import { expect, test } from "@playwright/test";
import {
  createRouteBarrier,
  mockCatalogDetail,
  publicProduct,
  type FixtureSalesMode,
  type WriteObservation,
} from "./fixtures/public-catalog-detail";

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

async function expectWriteContract(
  writes: WriteObservation,
  allowedCartWrites = 0,
) {
  await expect.poll(() => writes.analytics).toBeGreaterThan(0);
  await expect.poll(() => writes.cart).toBe(allowedCartWrites);
  await expect.poll(() => writes.unexpected).toBe(0);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900, columns: 3 },
  { name: "mobile", width: 390, height: 844, columns: 2 },
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
      .toHaveAttribute("href", "/products/1");
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
  });

  test(`ProductDetail ${viewport.name} 7/5 或单列顺序、唯一行动与空事实省略`, async ({ page }) => {
    const product = publicProduct(11, "DIRECT_PURCHASE", {
      available: true,
      goldWeight: 0,
      weight: 0,
      size: "-",
    });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = await mockCatalogDetail(page, { products: [product], signedIn: false });
    await page.goto("/products/11");

    await expect(page.getByRole("heading", { level: 1, name: "构图验证作品 11" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "面包屑" }).getByRole("link", { name: "选款中心" }))
      .toHaveAttribute("href", "/catalog");
    const action = page.locator(".product-detail-page__primary-action");
    await expect(action).toHaveCount(1);
    await expect(action).toHaveText("登录后购买");
    await expect(page.getByText("0g", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "证书" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "评价" })).toHaveCount(0);

    const media = page.locator(".product-detail-page__main-media img");
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

test("ProductDetail 请求失败与缺媒体都使用安全公开降级", async ({ page }) => {
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
  await failedPage.goto("/products/26");
  await expect(failedPage.getByRole("heading", { name: "作品暂不可浏览" })).toBeVisible();
  await expect(failedPage.getByRole("link", { name: "进入选款中心" }))
    .toHaveAttribute("href", "/catalog");
  await expectWriteContract(writes);
  await expectWriteContract(failedWrites);
  await failedPage.close();
});
