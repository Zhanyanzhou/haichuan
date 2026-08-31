import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

/**
 * 店铺装修 —— 草稿恢复与继续编辑回归测试
 *
 * 覆盖：保存草稿后重新进入编辑器默认加载最新草稿（而非线上版本）；
 * 「查看线上版本 / 继续编辑草稿 / 放弃草稿」的完整状态流转。
 *
 * 运行方式（需预先录制已登录的 admin 会话快照）：
 *   $env:PLAYWRIGHT_ADMIN_STORAGE_STATE="tests/.auth/admin.json"
 *   npx playwright test editor-draft-recovery --project=admin-chromium
 *
 * 说明：本测试通过 page.route 注入「已发布版本 P + 与 P 不同的草稿 D」，
 * 断言编辑器的草稿状态机，不依赖真实业务数据；仅为前端流程回归。
 */

const useMock = process.env.VITE_USE_MOCK === "true";
const API_PREFIX = "**/api/**";

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "editor-draft-test-admin",
    realName: "草稿回归管理员",
  });
}

async function selectHeroTitleInput(page: Page) {
  const inspector = page.getByRole("region", { name: "属性面板" });
  const input = inspector.getByRole("textbox", {
    name: "主标题",
    exact: true,
  });
  await expect(input).toBeVisible();
  return input;
}

const heroBlock = {
  type: "首屏主视觉",
  props: {
    id: "draft-hero",
    title: "草稿标题",
    subtitle: "草稿副标题",
    desktopImage: "/svg/template-hero.svg",
    mobileImage: "/svg/template-hero.svg",
    altText: "草稿测试图",
  },
};

const publishedDoc = {
  id: 9001,
  pageKey: "home",
  puckData: { content: [], root: { props: {} } },
  metadata: { seoTitle: "线上版本" },
  editorVersion: "0.22.4",
  status: "PUBLISHED",
  version: 1,
  publishedAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const draftDoc = {
  id: 9002,
  pageKey: "home",
  puckData: { content: [heroBlock], root: { props: {} } },
  metadata: { seoTitle: "草稿版本" },
  editorVersion: "0.22.4",
  status: "DRAFT",
  version: 1,
  publishedAt: null,
  updatedAt: "2026-08-14T01:00:00.000Z",
};

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

async function mockEditorApis(
  page: Page,
  options: {
    published?: Record<string, any>;
    draft?: Record<string, any>;
    saveDelayMs?: number;
    beforeSaveResponse?: () => Promise<void>;
    adminFailureOnRequest?: number;
    saveConflict?: boolean;
    publishFailure?: boolean;
    revisions?: Array<Record<string, any>>;
    revisionsFailureCount?: number;
    restoreFailureCount?: number;
    discardFailureCount?: number;
    normalizeSavedPuckData?: (puckData: any) => any;
    normalizeSavedMetadata?: (metadata: any) => any;
  } = {},
) {
  let published: Record<string, any> = options.published ?? publishedDoc;
  let saved: Record<string, any> = { ...(options.draft ?? draftDoc) };
  let revisionsFailureCount = options.revisionsFailureCount ?? 0;
  let restoreFailureCount = options.restoreFailureCount ?? 0;
  let discardFailureCount = options.discardFailureCount ?? 0;
  let adminRequestCount = 0;
  await page.route(`${API_PREFIX}*`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/auth/profile")) return route.fallback();

    if (url.includes("/validate")) {
      return route.fulfill(json({ valid: true, errors: [] }));
    }
    if (method === "PUT" && /\/revisions\/\d+\/restore/.test(url)) {
      if (restoreFailureCount > 0) {
        restoreFailureCount -= 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at revision.restore",
          }),
        });
      }
      const version = Number(url.match(/\/revisions\/(\d+)\/restore/)?.[1]);
      const revision = options.revisions?.find(
        (item) => item.version === version,
      );
      saved = {
        ...(revision ?? saved),
        status: "DRAFT",
        updatedAt: "2026-08-14T03:00:00.000Z",
      };
      return route.fulfill(json(saved));
    }
    if (url.includes("/revisions")) {
      if (revisionsFailureCount > 0) {
        revisionsFailureCount -= 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at revision.list",
          }),
        });
      }
      return route.fulfill(json(options.revisions ?? []));
    }
    if (method === "DELETE" && url.includes("/document/draft")) {
      if (discardFailureCount > 0) {
        discardFailureCount -= 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at draft.discard",
          }),
        });
      }
      saved = { ...published };
      return route.fulfill(json({ discarded: true }));
    }
    if (url.includes("/published")) {
      return route.fulfill(json(published));
    }
    if (url.includes("/publish")) {
      if (options.publishFailure) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at page_modules.publish",
          }),
        });
      }
      saved = {
        ...saved,
        status: "PUBLISHED",
        publishedAt: "2026-08-14T02:00:00.000Z",
      };
      published = { ...published, ...saved };
      return route.fulfill(json(saved));
    }
    if (url.includes("/admin")) {
      adminRequestCount += 1;
      if (adminRequestCount === options.adminFailureOnRequest) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at document.admin",
          }),
        });
      }
      return route.fulfill(json(saved));
    }
    if (method === "PUT") {
      if (options.saveConflict) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: 409,
            message: "该页面已被其他编辑者更新，请重新加载后再保存",
          }),
        });
      }
      if (options.saveDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.saveDelayMs));
      }
      await options.beforeSaveResponse?.();
      const body = route.request().postDataJSON() as {
        puckData?: unknown;
        metadata?: unknown;
      };
      saved = {
        ...saved,
        puckData: options.normalizeSavedPuckData
          ? options.normalizeSavedPuckData(body.puckData ?? saved.puckData)
          : (body.puckData ?? saved.puckData) as any,
        metadata: options.normalizeSavedMetadata
          ? options.normalizeSavedMetadata(body.metadata ?? saved.metadata)
          : (body.metadata ?? saved.metadata) as any,
        updatedAt: "2026-08-14T01:30:00.000Z",
      };
      return route.fulfill(json(saved));
    }
    return route.fulfill(json({}));
  });
}

test.describe("店铺装修 —— 草稿恢复与继续编辑", () => {
  test.skip(useMock, "依赖 HTTP 拦截夹具，mock 模式由手动验收覆盖");

  test.beforeEach(async ({ page }) => {
    await authenticateAdmin(page);
    await mockEditorApis(page);
  });

  test("存在未发布草稿时，重新进入编辑器默认加载草稿", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("草稿有未发布修改", { timeout: 10000 });
    await expect(status).toContainText("最后保存");
    await expect(status).toHaveAttribute(
      "aria-label",
      /草稿状态：草稿有未发布修改，最后保存/,
    );
  });

  test("线上内容与草稿一致时默认直接进入编辑模式", async ({
    page,
  }) => {
    const sharedPuckData = {
      content: [
        {
          ...heroBlock,
          props: { ...heroBlock.props, title: "线上编辑基线标题" },
        },
      ],
      root: { props: {} },
    };
    let adminReads = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document/admin")
      ) {
        adminReads += 1;
      }
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      published: {
        ...publishedDoc,
        puckData: sharedPuckData,
        metadata: { seoTitle: "共同页面资料" },
      },
      draft: {
        ...draftDoc,
        puckData: sharedPuckData,
        metadata: { seoTitle: "共同页面资料" },
      },
      // 保留第二次读取失败陷阱，证明进入编辑态不依赖额外请求。
      adminFailureOnRequest: 2,
    });

    await page.goto("/admin/editor/home");
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.frameLocator("iframe").getByText("线上编辑基线标题", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "保存当前装修草稿" }),
    ).toBeVisible();
    await expect(
      page.frameLocator("iframe").getByText("线上编辑基线标题", { exact: true }),
    ).toBeVisible();
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("线上编辑基线标题");
    await heroTitleInput.fill("从线上基线开始的新草稿标题");
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toContainText("有未保存修改");
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at document.admin", {
        exact: true,
      }),
    ).toHaveCount(0);
    expect(adminReads).toBe(1);
  });

  test("连续编辑文字后立即预览并退出，保存仍使用完整最新画布", async ({
    page,
  }) => {
    const savePayloads: any[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document")
      ) {
        savePayloads.push(request.postDataJSON());
      }
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const inspector = page.getByRole("region", { name: "属性面板" });
    const titleInput = await selectHeroTitleInput(page);
    const subtitleInput = inspector.getByRole("textbox", {
      name: "副标题",
      exact: true,
    });
    await titleInput.fill("立即预览也不能丢失的主标题");
    await subtitleInput.fill("连续输入后保存的完整副标题");

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(page.getByText("当前画布预览 · 1920 × 1200")).toBeVisible();
    await expect(
      page
        .frameLocator(".homepage-editor__canvas-scale iframe")
        .getByText("立即预览也不能丢失的主标题", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "退出当前画布预览" }).click();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savePayloads.length).toBe(1);
    expect(savePayloads[0]?.puckData?.content?.[0]?.props).toMatchObject({
      title: "立即预览也不能丢失的主标题",
      subtitle: "连续输入后保存的完整副标题",
    });
  });

  test("查看线上版本为只读比较，返回后保留未保存画布", async ({ page }) => {
    const savePayloads: any[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document")
      ) {
        savePayloads.push(request.postDataJSON());
      }
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      published: {
        ...publishedDoc,
        puckData: {
          content: [
            {
              ...heroBlock,
              props: { ...heroBlock.props, title: "当前线上标题" },
            },
          ],
          root: { props: {} },
        },
      },
    });
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("草稿有未发布修改", { timeout: 10000 });
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");
    await heroTitleInput.fill("返回后仍需保留的未保存标题");
    await expect(status).toContainText("有未保存修改");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    const dialog = page.getByRole("dialog", { name: "查看线上版本？" });
    await expect(dialog).toContainText("返回编辑时会恢复当前草稿和未保存修改");
    await dialog.getByRole("button", { name: "查看线上版本" }).click();
    await expect(status).toHaveCount(0);
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.frameLocator("iframe").getByText("当前线上标题", { exact: true }),
    ).toBeVisible();
    await expect(heroTitleInput).toHaveCount(0);
    await expect(page.getByRole("button", { name: "删除当前模块" })).toHaveCount(0);
    await page
      .locator(".homepage-editor__layer-item")
      .filter({ hasText: "首屏" })
      .click();
    await expect(page.getByRole("group", { name: /首屏.*图层操作/ })).toHaveCount(0);
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await expect(page.getByRole("menuitem", { name: "套用推荐结构" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "发布设置" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "导入方案 JSON" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "返回编辑" }).click();
    await expect(
      page
        .frameLocator("iframe")
        .getByText("返回后仍需保留的未保存标题", { exact: true }),
    ).toBeVisible();
    await expect(status).toContainText("有未保存修改");
    await page
      .locator(".homepage-editor__layer-item")
      .filter({ hasText: "首屏" })
      .click();
    await expect(heroTitleInput).toHaveValue("返回后仍需保留的未保存标题");
    await expect(page.getByText("已返回草稿，未保存修改保持不变")).toBeVisible();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect(page.getByText("页面草稿已保存")).toBeVisible();
    expect(savePayloads).toHaveLength(1);
    expect(savePayloads[0].puckData.content[0].props.title).toBe(
      "返回后仍需保留的未保存标题",
    );
  });

  test("移动窄屏查看线上版本后仍可恢复未保存画布", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");
    await heroTitleInput.fill("移动端未保存标题");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    const dialog = page.getByRole("dialog", { name: "查看线上版本？" });
    await dialog.getByRole("button", { name: "查看线上版本" }).click();
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(2);

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "继续编辑草稿" }).click();
    await expect(
      page
        .frameLocator("iframe")
        .getByText("移动端未保存标题", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toContainText("有未保存修改");
  });

  test("查看线上版本期间离开仍保护并保存进入前的草稿", async ({ page }) => {
    const savePayloads: any[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document")
      ) {
        savePayloads.push(request.postDataJSON());
      }
    });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await heroTitleInput.fill("离开前必须保存的草稿标题");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    await page
      .getByRole("dialog", { name: "查看线上版本？" })
      .getByRole("button", { name: "查看线上版本" })
      .click();
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(2);

    await page.getByRole("button", { name: "展开一级导航" }).click();
    await page
      .locator(".admin-sidebar__nav")
      .getByRole("button", { name: "首页" })
      .first()
      .click();
    const guard = page.getByRole("dialog", { name: "保存后离开？" });
    await expect(guard).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/editor\/home/);
    await guard.getByRole("button", { name: "保存并离开" }).click();

    await expect(page).toHaveURL(/\/admin\/dashboard/);
    expect(savePayloads).toHaveLength(1);
    expect(savePayloads[0].puckData.content[0].props.title).toBe(
      "离开前必须保存的草稿标题",
    );
  });

  test("查看线上版本等待在途保存后建立最新草稿快照", async ({ page }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { saveDelayMs: 800 });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await heroTitleInput.fill("保存完成后再比较的标题");
    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.endsWith("/page-modules/document"),
    );
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    await page
      .getByRole("dialog", { name: "查看线上版本？" })
      .getByRole("button", { name: "查看线上版本" })
      .click();

    await saveResponse;
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(2);
    await page.getByRole("button", { name: "返回编辑" }).click();
    await expect(
      page
        .frameLocator("iframe")
        .getByText("保存完成后再比较的标题", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="pending"]'),
    ).toContainText("草稿有未发布修改");
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toHaveCount(0);
  });

  test("放弃草稿需二次确认，取消后草稿不变", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("草稿有未发布修改", { timeout: 10000 });

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "放弃草稿" }).click();
    const dialog = page.getByRole("dialog", {
      name: "放弃当前草稿并恢复线上版本？",
    });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /取\s*消/ }).click();
    await expect(dialog).toBeHidden();
    await expect(status).toContainText("草稿有未发布修改");
  });

  test("版本列表失败时在抽屉保留安全错误并可原位重试", async ({ page }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { revisionsFailureCount: 1 });
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();

    const alert = page.getByRole("alert").filter({
      hasText: "版本操作未完成",
    });
    await expect(alert).toContainText("版本列表加载失败，请稍后重试");
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at revision.list", {
        exact: true,
      }),
    ).toHaveCount(0);

    await alert.getByRole("button", { name: "重新加载" }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByText("未发布草稿", { exact: true })).toBeVisible();
  });

  test("恢复版本失败时保留当前画布并可从抽屉重试", async ({ page }) => {
    const revision = {
      ...publishedDoc,
      id: 8999,
      version: 1,
      puckData: {
        content: [
          {
            ...heroBlock,
            props: { ...heroBlock.props, title: "历史版本标题" },
          },
        ],
      },
      updatedAt: "2026-08-13T00:00:00.000Z",
      publishedAt: "2026-08-13T00:00:00.000Z",
    };
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      revisions: [{ ...publishedDoc, version: 2 }, revision],
      restoreFailureCount: 1,
    });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();
    const revisionItem = page
      .locator(".homepage-editor__revision-item")
      .filter({ hasText: "版本 1" });
    await revisionItem.getByRole("button", { name: "恢复到草稿" }).click();
    let dialog = page.getByRole("dialog", { name: "恢复版本 1？" });
    await dialog.getByRole("button", { name: "恢复到草稿" }).click();

    const alert = page.getByRole("alert").filter({
      hasText: "版本操作未完成",
    });
    await expect(alert).toContainText("版本恢复失败，请稍后重试");
    await expect(heroTitleInput).toHaveValue("草稿标题");
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at revision.restore", {
        exact: true,
      }),
    ).toHaveCount(0);

    await alert
      .getByRole("button", { name: "重新恢复版本 1" })
      .click();
    dialog = page.getByRole("dialog", { name: "恢复版本 1？" });
    await dialog.getByRole("button", { name: "恢复到草稿" }).click();
    await expect(alert).toHaveCount(0);
    await expect(
      page.frameLocator("iframe").getByText("历史版本标题", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="pending"]'),
    ).toContainText("草稿有未发布修改");
  });

  test("恢复历史版本等待在途保存并使用最新乐观锁", async ({ page }) => {
    const revision = {
      ...publishedDoc,
      id: 8998,
      version: 1,
      puckData: {
        content: [
          {
            ...heroBlock,
            props: { ...heroBlock.props, title: "串行恢复后的历史标题" },
          },
        ],
        root: { props: {} },
      },
      updatedAt: "2026-08-12T00:00:00.000Z",
      publishedAt: "2026-08-12T00:00:00.000Z",
    };
    const restoreBodies: Array<{ expectedUpdatedAt?: string }> = [];
    let releaseSaveResponse: (() => void) | undefined;
    const saveResponseGate = new Promise<void>((resolve) => {
      releaseSaveResponse = resolve;
    });
    page.on("request", (request) => {
      if (/\/revisions\/\d+\/restore$/.test(new URL(request.url()).pathname)) {
        restoreBodies.push(request.postDataJSON() as { expectedUpdatedAt?: string });
      }
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      revisions: [{ ...publishedDoc, version: 2 }, revision],
      beforeSaveResponse: () => saveResponseGate,
    });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await heroTitleInput.fill("保存队列中的新标题");

    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.endsWith("/page-modules/document"),
    );
    const saveRequest = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document"),
    );
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await saveRequest;
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();
    const revisionItem = page
      .locator(".homepage-editor__revision-item")
      .filter({ hasText: "版本 1" });
    await revisionItem.getByRole("button", { name: "恢复到草稿" }).click();
    const dialog = page.getByRole("dialog", { name: "恢复版本 1？" });
    await expect(dialog).toContainText("未保存修改无法恢复");
    await dialog.getByRole("button", { name: "恢复到草稿" }).click();

    releaseSaveResponse?.();
    await saveResponse;
    await expect.poll(() => restoreBodies.length).toBe(1);
    expect(restoreBodies[0]?.expectedUpdatedAt).toBe(
      "2026-08-14T01:30:00.000Z",
    );
    await expect(
      page.frameLocator("iframe").getByText("串行恢复后的历史标题", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="pending"]'),
    ).toContainText("草稿有未发布修改");
  });

  test("放弃草稿失败时保留草稿并提供持续重试入口", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { discardFailureCount: 1 });
    await page.goto("/admin/editor/home");
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("草稿有未发布修改");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "放弃草稿" }).click();
    let dialog = page.getByRole("dialog", {
      name: "放弃当前草稿并恢复线上版本？",
    });
    await dialog.getByRole("button", { name: "放弃草稿" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "草稿仍然保留" });
    await expect(alert).toContainText("放弃草稿失败，请稍后重试");
    await expect(status).toContainText("草稿有未发布修改");
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at draft.discard", {
        exact: true,
      }),
    ).toHaveCount(0);

    await alert.getByRole("button", { name: "重新放弃草稿" }).click();
    dialog = page.getByRole("dialog", {
      name: "放弃当前草稿并恢复线上版本？",
    });
    await dialog.getByRole("button", { name: "放弃草稿" }).click();
    await expect(alert).toHaveCount(0);
    await expect(status).toContainText("与线上版本一致");
  });

  test("仅 metadata 不同时仍识别为未发布草稿", async ({ page }) => {
    const sharedPuck = { content: [heroBlock], root: { props: {} } };
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      published: {
        ...publishedDoc,
        puckData: sharedPuck,
        metadata: { seoTitle: "线上 SEO" },
      },
      draft: {
        ...draftDoc,
        puckData: sharedPuck,
        metadata: { seoTitle: "草稿 SEO" },
      },
    });

    await page.goto("/admin/editor/home");
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("草稿有未发布修改", { timeout: 10000 });
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await expect(page.getByRole("menuitem", { name: "查看线上版本" })).toBeVisible();
  });

  test("发布后再次保存不会把相同 content 和 metadata 误报为草稿", async ({
    page,
  }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { saveDelayMs: 250 });

    await page.goto("/admin/editor/home");
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 10000 });
    await publishButton.click();
    await expect(page.getByText("店铺首页已发布")).toBeVisible();

    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("与线上版本一致");
    const saveButton = page.getByRole("button", { name: "保存当前装修草稿" });
    await saveButton.click();
    await expect(status).toContainText("正在保存草稿");
    await expect(status).toHaveAttribute("title", "草稿状态：正在保存草稿");
    await expect(page.getByText("页面草稿已保存")).toBeVisible();
    await expect(status).toContainText("与线上版本一致");
    await expect(status).toContainText("最后保存");
    await expect(status).not.toContainText("草稿有未发布修改");
  });

  test("归一化后的 409 仍触发并发保护并保留本地画布", async ({ page }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { saveConflict: true });
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();

    const conflictDialog = page.getByRole("dialog", {
      name: "检测到其他人更新了这份页面草稿",
    });
    await expect(conflictDialog).toBeVisible();
    await expect(conflictDialog).toContainText("当前画布修改仍完整保留");
    await conflictDialog.getByRole("button", { name: "保留本地修改" }).click();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
  });

  test("保存并发布后采用服务端清洗结果，不在当前会话回写废弃字段", async ({
    page,
  }) => {
    const legacyAppointment = {
      type: "预约入口",
      props: {
        id: "legacy-appointment",
        title: "预约鉴赏",
        subtitle: "旧版预约说明",
        buttonText: "立即预约",
        linkUrl: "/contact",
        phone: "400-legacy-copy",
      },
    };
    const savePayloads: any[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document")
      ) {
        savePayloads.push(request.postDataJSON());
      }
    });

    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      draft: {
        ...draftDoc,
        puckData: {
          content: [heroBlock, legacyAppointment],
          zones: {
            secondary: [
              {
                ...legacyAppointment,
                props: { ...legacyAppointment.props, id: "legacy-zone-appointment" },
              },
            ],
          },
          root: { props: {} },
        },
        metadata: {
          seoTitle: "草稿版本",
          contentTemplateContract: { schemaVersion: 2 },
        },
      },
      normalizeSavedPuckData: (puckData) => {
        const normalizeBlock = (block: any) => {
          if (block.type === "预约入口") {
            const { phone: _legacyPhone, ...props } = block.props;
            return { ...block, props };
          }
          return block.type === "首屏主视觉"
            ? {
                ...block,
                props: { ...block.props, title: "服务端规范后的标题" },
              }
            : block;
        };
        return {
          ...puckData,
          content: puckData.content.map(normalizeBlock),
          zones: Object.fromEntries(
            Object.entries(puckData.zones ?? {}).map(([zone, blocks]) => [
              zone,
              Array.isArray(blocks) ? blocks.map(normalizeBlock) : blocks,
            ]),
          ),
        };
      },
      normalizeSavedMetadata: (metadata) => {
        const { contentTemplateContract: _legacyContract, ...rest } = metadata;
        return rest;
      },
    });

    await page.goto("/admin/editor/home");
    let heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");

    await page.locator(".homepage-editor__toolbar-publish").click();
    await expect(page.getByText("店铺首页已发布")).toBeVisible();
    await page
      .locator(".homepage-editor__layer-item")
      .filter({ hasText: "首屏" })
      .click();
    heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("服务端规范后的标题");

    const saveAfterPublish = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.endsWith("/page-modules/document"),
    );
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await saveAfterPublish;

    expect(savePayloads).toHaveLength(2);
    expect(
      savePayloads[0].puckData.content.find(
        (block: any) => block.type === "首屏主视觉",
      ).props.title,
    ).toBe("草稿标题");
    expect(
      savePayloads[1].puckData.content.find(
        (block: any) => block.type === "首屏主视觉",
      ).props.title,
    ).toBe("服务端规范后的标题");
    expect(savePayloads[0].metadata).toHaveProperty("contentTemplateContract");
    expect(savePayloads[1].metadata).not.toHaveProperty(
      "contentTemplateContract",
    );
  });

  test("发布前保存等待期间出现新修改时中止发布并保留本地画布", async ({
    page,
  }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { saveDelayMs: 800 });
    const publishRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/document/publish")) {
        publishRequests.push(request.url());
      }
    });

    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");

    await page.locator(".homepage-editor__toolbar-publish").click();
    await heroTitleInput.fill("发布等待期间的新修改");

    await expect(
      page.getByText(
        "保存期间页面又发生了修改；新修改已保留但尚未保存，请再次确认后发布",
      ),
    ).toBeVisible();
    await expect(heroTitleInput).toHaveValue("发布等待期间的新修改");
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toContainText("有未保存修改");
    expect(publishRequests).toEqual([]);
  });

  test("发布接口失败后只提示一次安全错误，已保存草稿刷新后仍可继续", async ({
    page,
  }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { publishFailure: true });

    await page.goto("/admin/editor/home");
    let heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");
    await heroTitleInput.fill("发布失败后保留的草稿标题");

    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 10000 });
    await publishButton.click();

    await expect(page.getByText("发布失败，请稍后重试", { exact: true })).toHaveCount(1);
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at page_modules.publish", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText("服务器繁忙，请稍后再试", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="pending"]'),
    ).toContainText("草稿有未发布修改");
    await expect(publishButton).toBeEnabled();

    await page.reload();
    heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("发布失败后保留的草稿标题");
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="pending"]'),
    ).toContainText("草稿有未发布修改");
  });

  test("SPA 切换页面时隐藏旧画布且不会把旧内容写入新 pageKey", async ({
    page,
  }) => {
    await page.unroute(`${API_PREFIX}*`);
    let releaseCustom!: () => void;
    const customGate = new Promise<void>((resolve) => {
      releaseCustom = resolve;
    });
    const writes: Array<Record<string, unknown>> = [];
    const validations: string[] = [];
    const routerWarnings: string[] = [];
    page.on("console", (entry) => {
      if (entry.type() === "warning" && entry.text().includes("blocker on a POP navigation")) {
        routerWarnings.push(entry.text());
      }
    });

    await page.route(`${API_PREFIX}*`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pageKey = url.searchParams.get("pageKey") || "home";
      const method = request.method();
      if (url.pathname.endsWith("/document/validate")) {
        const body = request.postDataJSON() as { pageKey?: string };
        validations.push(body.pageKey || "");
        return route.fulfill(json({ valid: true, errors: [], issues: [] }));
      }
      if (method === "PUT") {
        writes.push(request.postDataJSON());
        return route.fulfill(json(draftDoc));
      }
      if (
        pageKey === "custom" &&
        (url.pathname.endsWith("/document/admin") ||
          url.pathname.endsWith("/document/published"))
      ) {
        await customGate;
      }
      if (url.pathname.endsWith("/document/published")) {
        return route.fulfill(json(pageKey === "home" ? publishedDoc : null));
      }
      if (url.pathname.endsWith("/document/admin")) {
        return route.fulfill(
          json(
            pageKey === "home"
              ? draftDoc
              : {
                  ...draftDoc,
                  pageKey: "custom",
                  puckData: {
                    content: [
                      {
                        type: "文字横幅",
                        props: { id: "custom-copy", title: "定制页草稿" },
                      },
                    ],
                    root: { props: {} },
                  },
                },
          ),
        );
      }
      return route.fulfill(json([]));
    });
    await authenticateAdmin(page);

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    // 工具栏先于 650ms 防抖发布校验出现。先等初始 home 校验真正完成，
    // 避免把它在高并发下的延迟到达误记为 SPA 切页后发出的旧页请求。
    await expect(page.locator(".homepage-editor__toolbar-publish")).toBeEnabled();
    validations.length = 0;

    await page.evaluate(() => {
      window.postMessage(
        {
          type: "homepage-editor:page-navigation",
          path: "/custom",
        },
        window.location.origin,
      );
    });
    await expect(page).toHaveURL(/\/admin\/editor\/custom$/);
    await expect(page.locator(".homepage-editor__toolbar")).toHaveCount(0);
    await expect(page.locator(".ant-spin-spinning")).toBeVisible();
    expect(writes).toEqual([]);
    expect(validations).toEqual([]);

    releaseCustom();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    expect(writes).toEqual([]);
    expect(routerWarnings).toEqual([]);
  });
});
