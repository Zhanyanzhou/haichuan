import { expect, test, type Page } from "@playwright/test";

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
  await page.goto("/admin/login");
  await page.evaluate(() => {
    const user = {
      id: 1,
      username: "editor-draft-test-admin",
      realName: "草稿回归管理员",
      role: "SUPER_ADMIN",
    };
    localStorage.setItem("token", "editor-draft-test-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: { token: "editor-draft-test-token", user, isLoggedIn: true },
        version: 0,
      }),
    );
  });
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
    saveConflict?: boolean;
  } = {},
) {
  let published: Record<string, any> = options.published ?? publishedDoc;
  let saved: Record<string, any> = { ...(options.draft ?? draftDoc) };
  await page.route(`${API_PREFIX}*`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/validate")) {
      return route.fulfill(json({ valid: true, errors: [] }));
    }
    if (url.includes("/revisions")) {
      return route.fulfill(json([]));
    }
    if (url.includes("/published")) {
      return route.fulfill(json(published));
    }
    if (url.includes("/publish")) {
      saved = {
        ...saved,
        status: "PUBLISHED",
        publishedAt: "2026-08-14T02:00:00.000Z",
      };
      published = { ...published, ...saved };
      return route.fulfill(json(saved));
    }
    if (url.includes("/admin")) {
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
      const body = route.request().postDataJSON() as {
        puckData?: unknown;
        metadata?: unknown;
      };
      saved = {
        ...saved,
        puckData: (body.puckData ?? saved.puckData) as any,
        metadata: (body.metadata ?? saved.metadata) as any,
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

  test("查看线上版本后，可无损回到草稿", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("草稿有未发布修改", { timeout: 10000 });

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    await expect(status).toHaveCount(0);

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "继续编辑草稿" }).click();
    await expect(status).toContainText("草稿有未发布修改");
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
    const publishDialog = page.getByRole("dialog", { name: "确认发布首页？" });
    await publishDialog.getByRole("button", { name: "确认发布" }).click();
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

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    validations.length = 0;

    await page.evaluate(() => {
      window.history.pushState({}, "", "/admin/editor/custom");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page).toHaveURL(/\/admin\/editor\/custom$/);
    await expect(page.locator(".homepage-editor__toolbar")).toHaveCount(0);
    await expect(page.locator(".ant-spin-spinning")).toBeVisible();
    expect(writes).toEqual([]);
    expect(validations).toEqual([]);

    releaseCustom();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    expect(writes).toEqual([]);
  });
});
