import { expect, test, type Page, type Route } from "@playwright/test";
import { publishedCatalogDocument, publicProduct } from "./fixtures/public-catalog-detail";

// 自有 HTTP 与摘要延迟夹具，只验证前端操作边界和回执一致性，不发送真实咨询。
test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "需要真实前端与 HTTP 夹具");

const products = [1, 2, 3].map((id) => publicProduct(id, "SELECTION"));

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({ json: { code: 200, data, message: "ok" } });
}

async function installApis(page: Page, onSubmit?: (route: Route) => Promise<void>) {
  const posts: { path: string; key?: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "POST" && /\/(?:selection-inquiries|inquiries)$/.test(path)) {
      posts.push({
        path,
        key: request.headers()["idempotency-key"],
        body: request.postDataJSON() as Record<string, unknown>,
      });
      if (onSubmit) return onSubmit(route);
      return fulfill(route, {
        id: 41, sourceId: 41, leadId: 141, status: "PENDING", createdAt: "2026-11-05T00:00:00.000Z",
      });
    }
    if (request.method() !== "GET") return route.abort();
    if (path.endsWith("/stream")) return route.abort();
    if (path.endsWith("/settings/flags")) {
      return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
    }
    if (path.endsWith("/settings/public")) return fulfill(route, { siteName: "海川珠宝" });
    if (path.endsWith("/page-modules/document/published")) {
      return fulfill(route, url.searchParams.get("pageKey") === "catalog" ? publishedCatalogDocument() : null);
    }
    if (path.endsWith("/categories/tree")) {
      return fulfill(route, [{ id: 1, name: "戒指", slug: "rings", level: 1, parentId: null, children: [] }]);
    }
    if (path.endsWith("/products/public")) {
      return fulfill(route, { list: products, total: products.length, facets: { sizes: [] } });
    }
    const detail = path.match(/\/products\/public\/([^/]+)$/);
    if (detail) {
      return fulfill(route, products.find((product) => product.code === decodeURIComponent(detail[1])) ?? null);
    }
    if (path.endsWith("/attributes") || path.endsWith("/customers/me/favorites")) return fulfill(route, []);
    return fulfill(route, null);
  });
  return posts;
}

async function delaySubmissionDigest(page: Page) {
  await page.addInitScript(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const pending: Array<() => void> = [];
    const tasks: Promise<ArrayBuffer>[] = [];
    const state = {
      started: 0,
      release: async () => {
        pending.splice(0).forEach((release) => release());
        await Promise.all(tasks);
        // 等待提交 continuation 和由它发起的 UI/网络任务，避免依赖任意毫秒延时。
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      },
    };
    Object.defineProperty(window, "__submissionDigest", { value: state });
    Object.defineProperty(crypto.subtle, "digest", {
      configurable: true,
      value: (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        state.started += 1;
        const task = new Promise<void>((resolve) => pending.push(resolve)).then(() => digest(algorithm, data));
        tasks.push(task);
        return task;
      },
    });
  });
}

async function expectDigestWaiting(page: Page) {
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __submissionDigest: { started: number } }
  ).__submissionDigest.started)).toBe(1);
}

async function releaseDigest(page: Page) {
  await page.evaluate(() => (
    window as Window & { __submissionDigest: { release: () => Promise<void> } }
  ).__submissionDigest.release());
}

async function fillContact(page: Page) {
  await page.locator("#cf-name").fill("测试访客");
  await page.locator("#cf-phone").fill("13800000000");
  await page.locator("#cf-type").selectOption("选款建议");
  await page.locator("#cf-message").fill("仅用于自动化夹具的咨询内容");
  await page.locator("#cf-privacy-consent").check();
}

async function seedSelection(page: Page, ids: number[]) {
  await page.evaluate(async (nextIds) => {
    // @ts-expect-error Vite 开发入口；用于确定性驱动另一个选款消费端。
    const { useSelectionStore } = await import("/src/store/selectionStore.ts");
    const store = useSelectionStore.getState();
    store.activateOwner("guest");
    store.clear();
    nextIds.forEach((id: number) => store.toggle(id));
  }, ids);
}

async function openSelection(page: Page) {
  await page.goto("/catalog");
  await expect(page.getByRole("region", { name: "作品结果", exact: true })).toBeVisible();
  await seedSelection(page, [1, 2]);
  await page.getByRole("button", { name: "查看已选 2 款并提交选款咨询", exact: true }).click();
  await page.locator("#sel-name").fill("测试访客");
  await page.locator("#sel-phone").fill("13800000000");
  await page.getByRole("dialog").getByRole("checkbox").check();
}

async function switchCustomer(page: Page) {
  await page.evaluate(async () => {
    // @ts-expect-error Vite 开发入口；不制造真实登录或凭据。
    const { useCustomerAuthStore } = await import("/src/store/customerAuthStore.ts");
    useCustomerAuthStore.getState().setAuth({ id: 9, name: "夹具客户", phone: "13800000009", email: null });
  });
}

test("普通咨询在摘要等待期间离开页面，不预约或发送旧咨询", async ({ page }) => {
  const posts = await installApis(page);
  await delaySubmissionDigest(page);
  await page.goto("/contact?view=request");
  await fillContact(page);
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  await expectDigestWaiting(page);
  await expect(page.locator("#cf-name")).toBeDisabled();
  await expect(page.locator("#cf-message")).toBeDisabled();
  await expect(page.locator("#cf-privacy-consent")).toBeDisabled();
  await page.getByRole("navigation", { name: "页脚导航", exact: true }).getByRole("link", { name: "选款中心", exact: true }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await releaseDigest(page);
  expect(posts).toEqual([]);
});

test("普通咨询在摘要等待期间移除作品上下文，不发送旧作品咨询", async ({ page }) => {
  const posts = await installApis(page);
  await delaySubmissionDigest(page);
  await page.goto(`/contact?view=request&type=product&productRef=${products[0].code}`);
  await expect(page.getByRole("button", { name: "移除作品，改为普通咨询", exact: true })).toBeVisible();
  await fillContact(page);
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  await expectDigestWaiting(page);
  await page.getByRole("button", { name: "移除作品，改为普通咨询", exact: true }).click();
  await expect(page).not.toHaveURL(/productRef=/);
  await releaseDigest(page);
  expect(posts).toEqual([]);
  await expect(page.getByRole("button", { name: "提交需求", exact: true })).toBeEnabled();
});

test("普通咨询在摘要等待期间切换客户，不发送旧身份咨询", async ({ page }) => {
  const posts = await installApis(page);
  await delaySubmissionDigest(page);
  await page.goto("/contact?view=request");
  await fillContact(page);
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  await expectDigestWaiting(page);
  await switchCustomer(page);
  await releaseDigest(page);
  expect(posts).toEqual([]);
});

test("选款咨询在摘要等待期间离开页面，不发送旧选款", async ({ page }) => {
  const posts = await installApis(page);
  await delaySubmissionDigest(page);
  await openSelection(page);
  await page.getByRole("button", { name: "提交选款咨询（2 款）", exact: true }).click();
  await expectDigestWaiting(page);
  await page.getByRole("button", { name: "关闭选款咨询", exact: true }).click();
  await page.getByRole("navigation", { name: "页脚导航", exact: true }).getByRole("link", { name: "隐私说明", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await releaseDigest(page);
  expect(posts).toEqual([]);
});

test("选款咨询在摘要等待期间切换客户，不发送旧身份选款", async ({ page }) => {
  const posts = await installApis(page);
  await delaySubmissionDigest(page);
  await openSelection(page);
  await page.getByRole("button", { name: "提交选款咨询（2 款）", exact: true }).click();
  await expectDigestWaiting(page);
  await switchCustomer(page);
  await releaseDigest(page);
  expect(posts).toEqual([]);
});

test("选款提交冻结编辑，回执保留提交快照且不清空后来加入的作品", async ({ page }) => {
  let releaseResponse = () => {};
  let reachedRequest = () => {};
  const reached = new Promise<void>((resolve) => { reachedRequest = resolve; });
  const released = new Promise<void>((resolve) => { releaseResponse = resolve; });
  const posts = await installApis(page, async (route) => {
    reachedRequest();
    await released;
    await fulfill(route, {
      id: 42, sourceId: 42, leadId: 142, status: "PENDING", createdAt: "2026-11-05T00:00:00.000Z",
    });
  });
  try {
    await openSelection(page);
    await page.getByRole("button", { name: "提交选款咨询（2 款）", exact: true }).click();
    await reached;
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: `移除 ${products[0].name}`, exact: true })).toBeDisabled();
    await expect(dialog.locator("#sel-name")).toBeDisabled();
    await expect(dialog.getByRole("checkbox")).toBeDisabled();
    const close = dialog.getByRole("button", { name: "关闭选款咨询", exact: true });
    const privacy = dialog.getByRole("link", { name: "隐私说明", exact: true });
    await close.focus();
    await close.press("Shift+Tab");
    await expect(privacy).toBeFocused();
    await privacy.press("Tab");
    await expect(close).toBeFocused();
    await page.getByRole("button", { name: "关闭选款咨询", exact: true }).click();
    // 模拟其他选款消费端在等待期间替换清单；本次回执不能跟着变或消失。
    await seedSelection(page, [3]);
    // 同页筛选变化也不能丢弃已经发出的提交回执或让提交状态永久停留。
    const rings = page.getByRole("navigation", { name: "作品品类", exact: true }).getByRole("button", { name: "戒指", exact: true });
    await rings.click();
    await expect(rings).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "查看正在提交的 2 款选款咨询", exact: true }).click();
    releaseResponse();
    const receipt = page.getByRole("dialog", { name: "选款咨询已提交", exact: true });
    await expect(receipt).toContainText("已收到 2 款作品");
    await expect(receipt.getByRole("definition").filter({ hasText: "#42" })).toBeVisible();
    expect((posts[0].body.items as { productId: number }[]).map((item) => item.productId)).toEqual([1, 2]);
    await receipt.getByRole("button", { name: "完成并移除本次选款", exact: true }).click();
    await expect(page.getByRole("button", { name: "查看已选 1 款并提交选款咨询", exact: true })).toBeVisible();
  } finally {
    releaseResponse();
  }
});

test("390px 选款慢提交跨购物袋只发送一次，失败返回保留表单和同键恢复", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const posts = await installApis(page, async (route) => {
    calls += 1;
    if (calls === 1) {
      await firstPending;
      return route.fulfill({ status: 503, json: { message: "fixture unavailable" } });
    }
    await fulfill(route, {
      id: 44, sourceId: 44, leadId: 144, status: "PENDING", createdAt: "2026-11-05T00:00:00.000Z",
    });
  });
  await openSelection(page);
  const dialog = page.getByRole("dialog", { name: "提交选款咨询", exact: true });
  const submit = dialog.getByRole("button", { name: "提交选款咨询（2 款）", exact: true });
  await dialog.locator("textarea").fill("同一标签页返回后保留的夹具留言");
  await submit.click();
  await expect.poll(() => posts.length).toBe(1);

  try {
    await dialog.getByRole("button", { name: "关闭选款咨询" }).click();
    await page.getByRole("link", { name: /^购物袋/ }).first().click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(dialog.locator("#sel-name")).toHaveValue("测试访客");
    await expect(dialog.locator("textarea")).toHaveValue("同一标签页返回后保留的夹具留言");
    await expect(dialog.getByRole("checkbox")).not.toBeChecked();
    await dialog.getByRole("checkbox").check();
    await submit.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(dialog.getByRole("button", { name: "提交中…" })).toBeDisabled();
    expect(posts).toHaveLength(1);
  } finally {
    releaseFirst();
  }

  await expect(dialog.getByRole("alert")).toContainText("提交结果待确认");
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(dialog.locator("#sel-phone")).toHaveValue("13800000000");
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByRole("checkbox").check();
  await submit.click();
  const receipt = page.getByRole("dialog", { name: "选款咨询已提交", exact: true });
  await expect(receipt).toContainText("#44");
  expect(posts).toHaveLength(2);
  expect(posts[0].key).toBeTruthy();
  expect(posts[1]).toEqual(posts[0]);

  await receipt.getByRole("button", { name: "关闭选款咨询" }).click();
  await page.getByRole("link", { name: /^购物袋/ }).first().click();
  await expect(receipt).toContainText("#44");
  expect(posts).toHaveLength(2);
  await receipt.getByRole("button", { name: "完成并移除本次选款" }).click();
  await expect(page.getByText("购物袋里还没有作品。")).toBeVisible();
});

test("390px 普通咨询接口失败后站内返回恢复填写，同键重试", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let calls = 0;
  const posts = await installApis(page, async (route) => {
    calls += 1;
    if (calls === 1) return route.fulfill({ status: 503, json: { message: "fixture unavailable" } });
    await fulfill(route, {
      id: 45, sourceId: 45, leadId: 145, status: "PENDING", createdAt: "2026-11-05T00:00:00.000Z",
    });
  });
  await page.goto("/contact?view=request");
  await fillContact(page);
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "提交结果待确认" })).toBeVisible();
  await page.getByRole("navigation", { name: "页脚导航", exact: true }).getByRole("link", { name: "选款中心", exact: true }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("region", { name: "作品结果", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator("#cf-message")).toHaveValue("仅用于自动化夹具的咨询内容");
  await expect(page.locator("#cf-phone")).toHaveValue("13800000000");
  await expect(page.locator("#cf-privacy-consent")).not.toBeChecked();
  await page.locator("#cf-privacy-consent").check();
  await page.getByRole("button", { name: /提交需求/ }).click();
  await expect(page.getByRole("heading", { name: "需求已提交" })).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[0].key).toBeTruthy();
  expect(posts[1]).toEqual(posts[0]);
});

test("切换咨询作品再返回时恢复原作品的留言和幂等键", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let calls = 0;
  const posts = await installApis(page, async (route) => {
    calls += 1;
    if (calls === 1) return route.fulfill({ status: 503, json: { message: "fixture unavailable" } });
    await fulfill(route, {
      id: 45, sourceId: 45, leadId: 145, status: "PENDING", createdAt: "2026-11-05T00:00:00.000Z",
    });
  });
  const inquiryUrl = (code: string) => `/contact?view=request&type=product&productRef=${code}`;
  const context = page.locator(".contact-product-context");
  const message = page.locator("#cf-message");
  const submit = page.getByRole("button", { name: /提交需求/ });
  await page.goto(inquiryUrl(products[0].code));
  await expect(context).toContainText(products[0].name);
  await fillContact(page);
  await message.fill("第一件作品的夹具留言");
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "提交结果待确认" })).toBeVisible();

  await page.evaluate((url) => {
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, inquiryUrl(products[1].code));
  await expect(context).toContainText(products[1].name);
  await message.fill("第二件作品的夹具留言");
  await submit.click();
  await expect(page.getByRole("heading", { name: "需求已提交" })).toBeVisible();
  expect(posts[1].key).not.toBe(posts[0].key);
  expect(posts[1].body).toMatchObject({ productId: products[1].id, message: "第二件作品的夹具留言" });

  await page.goBack();
  await expect(context).toContainText(products[0].name);
  await expect(message).toHaveValue("第一件作品的夹具留言");
  await expect(page.locator("#cf-privacy-consent")).not.toBeChecked();
  await page.locator("#cf-privacy-consent").check();
  await submit.click();
  await expect(page.getByRole("heading", { name: "需求已提交" })).toBeVisible();
  expect(posts).toHaveLength(3);
  expect(posts[2]).toEqual(posts[0]);
});
