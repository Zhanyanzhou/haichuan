import { expect, test, type APIResponse, type Page } from "@playwright/test";

const realQaEnabled = process.env.PAGE_BUILDER_REAL_QA === "true";
const apiBaseUrl = process.env.PAGE_BUILDER_REAL_API_BASE_URL ?? "";
const browserBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const username = process.env.PAGE_BUILDER_QA_USERNAME ?? "";
const password = process.env.PAGE_BUILDER_QA_PASSWORD ?? "";
const expectedApiBaseUrl = "http://127.0.0.1:3101/api";
const expectedBrowserBaseUrl = "http://127.0.0.1:5175";

const exactQaTarget = realQaEnabled
  && apiBaseUrl === expectedApiBaseUrl
  && browserBaseUrl === expectedBrowserBaseUrl
  && username.length > 0
  && password.length > 0;

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

async function responseData<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.status()} ${response.url()} 应成功`).toBe(true);
  return unwrap<T>(await response.json());
}

async function browserWrite<T>(
  page: Page,
  path: string,
  data: Record<string, unknown>,
  method: "PUT" | "POST" = "PUT",
): Promise<T> {
  const result = await page.evaluate(async ({ url, payload, requestMethod }) => {
    const prefix = "hc_csrf=";
    const csrfCookie = document.cookie
      .split("; ")
      .find((item) => item.startsWith(prefix));
    const csrfToken = csrfCookie
      ? decodeURIComponent(csrfCookie.slice(prefix.length))
      : "";
    if (!csrfToken) throw new Error("登录后未获得 CSRF Cookie");

    const response = await fetch(url, {
      method: requestMethod,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(payload),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }, { url: `/api${path}`, payload: data, requestMethod: method });

  expect(result.ok, `${result.status} ${path} 应成功`).toBe(true);
  return unwrap<T>(result.body);
}

async function loginThroughUi(page: Page) {
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "用户名" }).fill(username);
  await page.locator("#admin-login-password").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole("button", { name: /账户菜单/ })).toBeVisible();
}

async function dragTextBannerIntoCanvas(page: Page) {
  const card = page.getByRole("button", {
    name: "纯文字：点击添加到页面末尾，也可拖到画布指定位置",
  });
  const canvas = page.locator(".homepage-editor__canvas-document");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeInViewport();
  await expect(canvas).toBeVisible();
  const cardBox = await card.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!cardBox || !canvasBox) throw new Error("模板卡片或页面画布没有可用尺寸");

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 120, {
    steps: 14,
  });
  await expect(page.getByText("在此插入")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText("已插入“纯文字”，可在右侧继续编辑")).toBeVisible();
  await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
}

test.describe("店铺装修真实浏览器闭环（一次性 MySQL + 真实 NestJS API）", () => {
  test.skip(
    !exactQaTarget,
    "仅在显式 PAGE_BUILDER_REAL_QA=true 且使用 127.0.0.1:3101/5175 一次性环境时运行",
  );

  test("拖入模板、编辑、保存、刷新、预览、发布，并保持未发布草稿与公开快照隔离", async ({
    browser,
    page,
  }, testInfo) => {
    const pageKey = "products";
    const publishedTitle = "真实浏览器闭环页面";
    const draftOnlyTitle = "仅存在于未发布草稿";
    const metadata = {
      seoTitle: "真实浏览器闭环 | 海川珠宝",
      seoDescription: "验证店铺装修从页面编辑到公开 Renderer 的真实保存与发布链路。",
      ogImage: "https://example.com/haichuan-page-builder-qa.jpg",
      contentOwner: "店铺装修 QA",
      mediaRights: [{
        assetUrl: "https://example.com/haichuan-page-builder-qa.jpg",
        source: "一次性 QA 固定素材",
        authorizationId: "PAGE-BUILDER-QA-20260829",
      }],
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginThroughUi(page);

    const previousPublished = await responseData<{ version: number } | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/published/admin?pageKey=${pageKey}`,
      ),
    );
    const expectedPublishedVersion = (previousPublished?.version ?? 0) + 1;
    const currentDraft = await responseData<{ updatedAt: string } | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    const seeded = await browserWrite<{ updatedAt: string }>(
      page,
      "/page-modules/document",
      {
        pageKey,
        puckData: { content: [], zones: {}, root: { props: {} } },
        metadata,
        editorVersion: "0.22.4",
        ...(currentDraft ? { expectedUpdatedAt: currentDraft.updatedAt } : {}),
      },
    );
    expect(Date.parse(seeded.updatedAt)).not.toBeNaN();

    await page.goto(`/admin/editor/${pageKey}`);
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await dragTextBannerIntoCanvas(page);

    const inspector = page.locator(".homepage-editor__inspector");
    const titleInput = inspector.getByRole("textbox", {
      name: "标题",
      exact: true,
    });
    const bodyInput = inspector.getByRole("textbox", {
      name: "正文",
      exact: true,
    });
    await titleInput.fill(publishedTitle);
    await expect(titleInput).toHaveValue(publishedTitle);
    await bodyInput.fill("页面内容通过真实属性面板写入，并由同一公开 Renderer 展示。");
    await expect(titleInput).toHaveValue(publishedTitle);

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(page.getByText("当前画布预览 · 1920 × 1200")).toBeVisible();
    await expect(
      page.frameLocator(".homepage-editor__canvas-scale iframe").getByText(publishedTitle),
    ).toBeVisible();
    await page.getByRole("button", { name: "退出当前画布预览" }).click();

    const saveResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    expect((await saveResponse).ok()).toBe(true);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await expect(
      inspector.getByRole("textbox", { name: "标题", exact: true }),
    ).toHaveValue(publishedTitle);
    await expect(
      page.frameLocator(".homepage-editor__canvas-scale iframe").getByText(publishedTitle),
    ).toBeVisible();

    const validation = await browserWrite<{
      valid: boolean;
      errors: string[];
    }>(page, "/page-modules/document/validate", { pageKey }, "POST");
    expect(validation.valid, JSON.stringify(validation.errors)).toBe(true);
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 15_000 });
    await publishButton.click();
    const confirmDialog = page.getByRole("dialog").filter({ hasText: "确认发布" });
    await expect(confirmDialog).toBeVisible();
    const publishResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document/publish";
    });
    await confirmDialog.getByRole("button", { name: "确认发布" }).click();
    expect((await publishResponse).ok()).toBe(true);

    const anonymous = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const publicPage = await anonymous.newPage();
    const publicApi = await responseData<{
      version: number;
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await anonymous.request.get(
      `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(publicApi.version).toBe(expectedPublishedVersion);
    expect(publicApi.puckData.content[0]?.props?.title).toBe(publishedTitle);

    await publicPage.goto(`${browserBaseUrl}/products`);
    await expect(publicPage.getByText(publishedTitle)).toBeVisible();
    const publicRenderer = publicPage.locator('[data-content-template="textBanner"]');
    await expect(publicRenderer).toBeVisible();
    await expect.poll(() => publicRenderer.evaluate((node) => node.getBoundingClientRect().height))
      .toBeGreaterThan(20);
    await expect.poll(() => publicPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await publicPage.screenshot({
      path: testInfo.outputPath("page-builder-public-1200x900.png"),
      fullPage: true,
    });

    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.reload();
    await expect(publicPage.getByText(publishedTitle)).toBeVisible();
    await expect(publicRenderer).toHaveAttribute("data-mobile-order", /.+/);
    await expect.poll(() => publicPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await publicPage.screenshot({
      path: testInfo.outputPath("page-builder-public-390x844.png"),
      fullPage: true,
    });

    await titleInput.fill(draftOnlyTitle);
    const draftSaveResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    expect((await draftSaveResponse).ok()).toBe(true);

    await publicPage.reload();
    await expect(publicPage.getByText(publishedTitle)).toBeVisible();
    await expect(publicPage.getByText(draftOnlyTitle)).toHaveCount(0);
    const publishedAfterDraft = await responseData<{
      version: number;
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await anonymous.request.get(
      `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(publishedAfterDraft.version).toBe(expectedPublishedVersion);
    expect(publishedAfterDraft.puckData.content[0]?.props?.title).toBe(publishedTitle);

    await anonymous.close();
  });
});
