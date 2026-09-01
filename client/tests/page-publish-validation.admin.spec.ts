import { expect, test, type Download, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

/**
 * 店铺装修 —— 发布资格与安全边界回归测试
 *
 * 覆盖：点击发布后先保存草稿，再用同一服务端校验器核对该保存版本。
 *   - error：保留草稿、展示精确清单且不调用发布接口
 *   - warning：明确确认后允许发布
 *   - 服务端发布接口继续承担权限、版本冲突和危险内容等最终门禁
 *
 * 运行方式（需已登录 admin 会话快照，非 mock 模式）：
 *   $env:PLAYWRIGHT_ADMIN_STORAGE_STATE="tests/.auth/admin.json"
 *   npx playwright test page-publish-validation --project=admin-chromium
 *
 * 说明：本套件不依赖画布拖拽——通过 mock 直接控制 validate 与 admin 文档返回，
 * 因此比 editor-leave-guard 更稳健。校验规则本身在后端 collectPuckDataErrors，
 * 前端预检调用同一接口，规则天然一致。
 */
const useMock = process.env.VITE_USE_MOCK === "true";

const API_PREFIX = "**/api/**";

async function authenticateAdmin(
  page: Page,
  role: "SUPER_ADMIN" | "ADMIN" | "EDITOR" = "SUPER_ADMIN",
) {
  await installAdminSession(page, {
    username: "publish-validation-test-admin",
    realName: "发布校验管理员",
    role,
  });
}

/** 一个结构合法的草稿（单个首屏主视觉），保证编辑器可正常加载 */
function validDraft() {
  return {
    id: 9201,
    pageKey: "home",
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "d3-hero",
            desktopImage: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            title: "海川典藏",
            subtitle: "HAICHUAN JEWELRY / 2026",
            actionText: "探索本季作品",
            targetType: "page",
            linkUrl: "/products",
            productId: 0,
            altText: "海川典藏系列主视觉",
            alignment: "left",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
          },
        },
      ],
      zones: {},
      root: { props: {} },
    },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    version: 0,
    publishedAt: null,
    publishedBy: null,
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
}

function multiHeroDraft() {
  const draft = validDraft();
  draft.puckData.content.push({
    type: "首屏主视觉",
    props: {
      ...draft.puckData.content[0].props,
      id: "d3-hero-second-stage",
      title: "海川工艺篇章",
    },
  });
  return draft;
}

async function mockEditorApis(
  page: Page,
  opts: {
    valid: boolean;
    errors?: string[];
    issues?: Array<{
      message: string;
      severity: "error" | "warning" | "info";
      blockId?: string;
      path?: string;
      field?: string;
      index?: number;
    }>;
    publishedDocument?: Record<string, unknown> | null;
    saveFailure?: boolean;
    publishFailure?: boolean;
    saveDelayMs?: number;
    validateFailuresBeforeSuccess?: number;
    draftDocument?: Record<string, unknown>;
  },
) {
  const draft = opts.draftDocument ?? validDraft();
  let validateCalls = 0;
  let persistentWriteCalls = 0;
  await page.route(`${API_PREFIX}*`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/auth/profile")) return route.fallback();

    if (url.includes("/validate")) {
      validateCalls += 1;
      if (validateCalls <= (opts.validateFailuresBeforeSuccess ?? 0)) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "internal validation service path must never reach the browser",
          }),
        });
      }
      return route.fulfill(json({
        valid: opts.valid,
        errors: opts.errors ?? [],
        issues: opts.issues ?? [],
      }));
    }
    if (url.includes("/revisions")) {
      return route.fulfill(json([]));
    }
    if (url.includes("/published")) {
      return route.fulfill(json(opts.publishedDocument ?? null));
    }
    if (url.includes("/publish")) {
      // 发布接口（PUT）：返回已发布快照
      persistentWriteCalls += 1;
      if (opts.publishFailure) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: 409,
            message: "该页面已被其他编辑者更新，请重新加载后再发布",
          }),
        });
      }
      return route.fulfill(
        json({ ...draft, status: "PUBLISHED", version: 1, updatedAt: "2026-08-14T00:00:02.000Z" }),
      );
    }
    if (method === "PUT") {
      // 保存草稿
      persistentWriteCalls += 1;
      if (opts.saveDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, opts.saveDelayMs));
      }
      if (opts.saveFailure) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "internal database path must never reach the browser",
          }),
        });
      }
      return route.fulfill(json({ ...draft, updatedAt: "2026-08-14T00:00:01.000Z" }));
    }
    if (url.includes("/admin")) {
      return route.fulfill(json(draft));
    }
    return route.fulfill(json({}));
  });
  return {
    validateCalls: () => validateCalls,
    persistentWriteCalls: () => persistentWriteCalls,
  };
}

async function readDownloadJson(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
}

test.describe("店铺装修 —— Mock 发布边界", () => {
  test.skip(!useMock, "仅在 PLAYWRIGHT_APP_MODE=mock 下验证本地模式边界");

  test("明确标记发布资格未验证并保留移动端草稿保存入口", async ({ page }) => {
    await authenticateAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/editor/home");

    await expect(page.getByTestId("homepage-editor-mock-mode")).toBeVisible();
    await expect(page.locator('[data-validation-status="unverified"]')).toContainText(
      "Mock 模式 · 发布资格未验证",
    );
    await expect(page.getByRole("button", { name: "保存当前装修草稿" })).toBeVisible();
    await expect(page.locator(".homepage-editor__toolbar-publish")).toBeDisabled();
    await expect(page.locator(".homepage-editor__toolbar-publish")).toHaveAttribute(
      "title",
      "Mock 模式未连接真实发布服务",
    );
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("店铺装修 —— 发布资格与安全边界", () => {
  test.skip(useMock, "发布预检闭环依赖 HTTP 拦截夹具，mock 模式下由手动验收覆盖");

  test.beforeEach(async ({ page }) => {
    await authenticateAdmin(page);
  });

  test("内容检查存在错误时保存草稿并展示精确清单，不调用发布接口", async ({ page }) => {
    const requests = await mockEditorApis(page, {
      valid: false,
      errors: [
        "第 1 个区块「首屏展示」：title 文本过长（150/100 字）",
        "第 2 个区块「单图文」：desktopImage 图片不能为空",
        "页面设置：seoTitle 过长（200/60 字）",
      ],
      issues: [{
        message: "统一门店资料尚未配置；公开端将使用安全降级。",
        severity: "warning",
        path: "siteSettings.store",
      }],
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect.poll(requests.validateCalls).toBe(1);
    await expect(publishButton).toBeEnabled();
    await expect(publishButton).toHaveAttribute(
      "aria-label",
      "发布到前台网站",
    );
    await expect(publishButton).toHaveAttribute(
      "title",
      "发布到前台网站",
    );
    await publishButton.click();
    await expect(page.getByRole("dialog").filter({ hasText: "确认发布首页" })).toHaveCount(0);
    const blockers = page.getByRole("dialog", { name: "暂不能发布 · 3 项问题待处理" });
    await expect(blockers).toBeVisible({ timeout: 8000 });
    await expect(blockers).toContainText("title 文本过长");
    await expect(blockers).toContainText("desktopImage 图片不能为空");
    await expect(blockers).toContainText("seoTitle 过长");
    await expect(page.getByText("店铺首页已发布")).toHaveCount(0);
    expect(requests.validateCalls()).toBe(2);
    expect(requests.persistentWriteCalls()).toBe(1);
  });

  for (const viewport of [
    { name: "桌面", width: 1440, height: 900 },
    { name: "移动窄屏", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}即时预检失败会明确标记不可用，重试后仍以发布动作的新鲜预检为准`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const requests = await mockEditorApis(page, {
        valid: true,
        validateFailuresBeforeSuccess: 1,
      });

      await page.goto("/admin/editor/home");
      const publishButton = page.locator(".homepage-editor__toolbar-publish");
      await expect(publishButton).toHaveAttribute(
        "title",
        "发布到前台网站",
      );
      await expect(publishButton).toBeEnabled();
      await expect(page.getByText("internal validation service path must never reach the browser"))
        .toHaveCount(0);
      await expect.poll(requests.validateCalls).toBe(1);
      await expect(page.getByRole("button", { name: "发布检查不可用 · 重试" }))
        .toBeVisible();

      await page.getByRole("button", { name: "更多编辑操作" }).click();
      await page.getByRole("menuitem", { name: "重新检查发布资格" }).click();
      await expect.poll(requests.validateCalls).toBe(2);
      await expect(page.getByText("发布检查已通过", { exact: true })).toBeVisible();
      await publishButton.click();

      await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
      expect(requests.validateCalls()).toBe(3);
      expect(requests.persistentWriteCalls()).toBe(2);
      await expectNoHorizontalOverflow(page);
    });
  }

  for (const viewport of [
    { name: "桌面", width: 1440, height: 900 },
    { name: "移动窄屏", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}页面级错误在发布时展示并阻止发布请求`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const requests = await mockEditorApis(page, {
        valid: false,
        errors: ["页面设置：seoTitle 过长（200/60 字）"],
        issues: [{
          message: "页面设置：seoTitle 过长（200/60 字）",
          severity: "error",
          path: "metadata.seoTitle",
          field: "seoTitle",
        }],
      });

      await page.goto("/admin/editor/home");
      const publishButton = page.locator(".homepage-editor__toolbar-publish");
      await expect(publishButton).toBeEnabled();
      await expect.poll(requests.validateCalls).toBe(1);
      const firstLayer = page.locator('[data-layer-index="0"] .homepage-editor__layer-select');
      const navigatedFromIssue = (await firstLayer.count()) > 0;
      if (navigatedFromIssue) {
        await firstLayer.click();
        await page.getByRole("button", { name: "1 项发布阻断" }).click();
        await page.getByRole("dialog", { name: "当前模块与页面发布检查 · 1 项阻断" })
          .getByRole("button", { name: "打开页面设置" }).click();
      } else {
        await page.getByRole("button", { name: "更多编辑操作" }).click();
        await page.getByRole("menuitem", { name: "页面设置" }).click();
      }
      const pageSettings = page.getByRole("dialog", { name: "页面展示设置" });
      await expect(pageSettings).toContainText("seoTitle 过长");
      if (navigatedFromIssue) {
        await expect(pageSettings.getByPlaceholder("例：海川珠宝 · 足金匠心系列官方旗舰店"))
          .toBeFocused();
      }
      await page.keyboard.press("Escape");
      await publishButton.click();
      const blockers = page.getByRole("dialog", { name: "暂不能发布 · 1 项问题待处理" });
      await expect(blockers).toContainText("seoTitle 过长");
      await expect(page.getByText("店铺首页已发布")).toHaveCount(0);
      expect(requests.persistentWriteCalls()).toBe(1);
      await expectNoHorizontalOverflow(page);
    });
  }

  for (const viewport of [
    { name: "桌面", width: 1440, height: 900 },
    { name: "移动窄屏", width: 390, height: 844 },
  ]) {
    test(viewport.name + "属性面板展示精确阻断且发布动作不穿透服务端门禁", async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const issueMessage = "第 1 个区块「首屏主视觉」：外部链接只允许完整的 HTTPS 地址";
      const requests = await mockEditorApis(page, {
        valid: false,
        errors: [issueMessage],
        issues: [{
          message: issueMessage,
          severity: "error",
          blockId: "d3-hero",
          path: "content[0].props.linkUrl",
          field: "linkUrl",
        }],
      });

      await page.goto("/admin/editor/home");
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
      const layerSelect = page.locator(
        '[data-layer-index="0"] .homepage-editor__layer-select',
      );
      if (await layerSelect.count()) {
        await layerSelect.click();
      }

      await expect(page.getByRole("alert", { name: "发布检查问题" })).toHaveCount(0);
      await expect(page.getByRole("alert", { name: "当前模块发布检查问题" })).toHaveCount(0);
      await expect(page.getByText("当前任务：修复发布阻断", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "1 项发布阻断" }).click();
      const issueDialog = page.getByRole("dialog", { name: "当前模块与页面发布检查 · 1 项阻断" });
      await expect(issueDialog).toContainText(issueMessage);
      await issueDialog.getByRole("button", { name: "定位到字段" }).click();
      await expect(issueDialog).toBeHidden();
      await expect(page.locator('[data-inspector-field="targetType"]')).toBeInViewport();
      const publishButton = page.locator(".homepage-editor__toolbar-publish");
      await expect(publishButton).toBeEnabled();
      await publishButton.click();
      await expect(page.getByRole("dialog", { name: "暂不能发布 · 1 项问题待处理" }))
        .toContainText(issueMessage);
      await expect(page.getByText("店铺首页已发布")).toHaveCount(0);
      expect(requests.persistentWriteCalls()).toBe(1);
    });
  }

  for (const viewport of [
    { name: "桌面", width: 1440, height: 900 },
    { name: "移动窄屏", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}明确提示旧线上版本需重新校验并说明页面资料全部可选`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const draft = validDraft();
      await mockEditorApis(page, {
        valid: false,
        errors: ["页面设置：seoTitle 过长（200/60 字）"],
        issues: [{
          message: "页面设置：seoTitle 过长（200/60 字）",
          severity: "error",
          path: "metadata.seoTitle",
          field: "seoTitle",
        }],
        publishedDocument: {
          ...draft,
          status: "PUBLISHED",
          version: 7,
          publicationAttested: false,
        },
      });

      await page.goto("/admin/editor/home");
      const more = page.getByRole("button", { name: /更多编辑操作，线上版本需重新校验/ });
      await expect(more).toBeVisible();
      await more.click();
      await page.getByRole("menuitem", { name: "线上版本需重新校验" }).click();

      const drawer = page.getByRole("dialog", { name: "页面展示设置" });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("status", { name: "当前页面可选展示资料说明" })).toContainText(
        "不填写也可以直接发布",
      );
      await expect(drawer).toContainText("填写后会校验长度、格式与素材是否已上传到本站");
    });
  }

  test("合法数据点击一次即完成发布", async ({ page }) => {
    const requests = await mockEditorApis(page, { valid: true });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    await page.locator(".homepage-editor__toolbar-publish").click();
    await expect(page.getByRole("dialog").filter({ hasText: "确认发布首页" })).toHaveCount(0);
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
    expect(requests.persistentWriteCalls()).toBe(2);
  });

  test("发布接口拒绝时保留明确错误且不误报成功", async ({ page }) => {
    const requests = await mockEditorApis(page, {
      valid: true,
      publishFailure: true,
    });

    await page.goto("/admin/editor/home");
    await page.locator(".homepage-editor__toolbar-publish").click();

    await expect(page.getByText("数据已被其他操作更新，请重新加载后再试。"))
      .toBeVisible({ timeout: 8000 });
    await expect(page.getByText("店铺首页已发布")).toHaveCount(0);
    expect(requests.persistentWriteCalls()).toBe(2);
  });

  test("多个首屏通过预检后发布按钮可用并完成发布", async ({ page }) => {
    await mockEditorApis(page, {
      valid: true,
      draftDocument: multiHeroDraft(),
    });

    await page.goto("/admin/editor/home");
    await expect(
      page.locator(".homepage-editor__template-card", { hasText: "已添加" }),
    ).toHaveCount(0);
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 10000 });
    await publishButton.click();
    await expect(page.getByRole("dialog").filter({ hasText: "确认发布首页" })).toHaveCount(0);
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
  });

  test("内容提示进入属性面板但不阻断点击一次直接发布", async ({ page }) => {
    const warning = "第 2 个区块「首屏主视觉」：标题仍是占位内容";
    await mockEditorApis(page, {
      valid: true,
      errors: [],
      issues: [{
        message: warning,
        severity: "warning",
        blockId: "d3-hero-second-stage",
        path: "content[1].props.title",
        field: "title",
      }],
      draftDocument: multiHeroDraft(),
    });

    await page.goto("/admin/editor/home");
    await page.getByRole("button", { name: /首屏 2\/2/ }).click();
    await page.getByRole("button", { name: "1 项待检查" }).click();
    const warningDialog = page.getByRole("dialog", {
      name: "当前模块与页面发布检查 · 1 项待检查",
    });
    await expect(warningDialog).toContainText(warning);
    await warningDialog.getByRole("button", { name: "知道了" }).click();
    await expect(page.getByRole("status", { name: /发布阻断/ })).toHaveCount(0);
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 10000 });
    await publishButton.click();
    await expect(page.getByRole("dialog", { name: "确认发布首页？" })).toHaveCount(0);
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
  });

  test("正式资料提示不打断一键发布", async ({ page }) => {
    const warning =
      "统一联系资料尚未配置；公开联系页仍可提交咨询，但不会显示服务热线、邮箱、地址或服务时间。请先到「店铺资料」维护。";
    const requests = await mockEditorApis(page, {
      valid: true,
      issues: [{
        message: warning,
        severity: "warning",
        blockId: "d3-hero",
        path: "siteSettings.contact",
      }],
    });

    await page.goto("/admin/editor/home");
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 10000 });
    await publishButton.click();
    await expect(page.getByRole("dialog", { name: "确认发布首页？" })).toHaveCount(0);
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
    expect(requests.persistentWriteCalls()).toBe(2);
  });

  test("EDITOR 只能编辑草稿，前端发布入口与服务端权限一致", async ({ page }) => {
    await authenticateAdmin(page, "EDITOR");
    const requests = await mockEditorApis(page, { valid: true });
    await page.goto("/admin/editor/home");

    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeDisabled();
    await expect(publishButton).toHaveAttribute(
      "title",
      "当前账号只能编辑草稿，需由管理员发布",
    );
    expect(requests.persistentWriteCalls()).toBe(0);
  });

  for (const actor of [
    { role: "SUPER_ADMIN" as const, name: "管理员桌面", width: 1440, height: 900 },
    { role: "EDITOR" as const, name: "编辑移动端", width: 390, height: 844 },
  ]) {
    test(`${actor.name}导入方案时立即执行当前页面能力归一化`, async ({ page }) => {
      await authenticateAdmin(page, actor.role);
      await page.setViewportSize({ width: actor.width, height: actor.height });
      const requests = await mockEditorApis(page, { valid: true });
      await page.goto("/admin/editor/home");
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
      await expect(
        page.frameLocator("iframe").getByText("海川典藏", { exact: true }),
      ).toBeVisible();

      const importedDocument = {
        kind: "haichuan-page-decoration",
        version: 1,
        pageKey: "home",
        puckData: {
          content: [
            {
              type: "网站全局设置",
              props: { id: "imported-site-config", visible: true },
            },
            {
              type: "改款对比",
              props: {
                id: "imported-disallowed-before-after",
                title: "不适用于首页的改款对比",
                beforeImage: "/svg/template-before.svg",
                afterImage: "/svg/template-after.svg",
              },
            },
            {
              ...validDraft().puckData.content[0],
              props: {
                ...validDraft().puckData.content[0].props,
                title: "导入后的海川典藏",
              },
            },
          ],
          zones: {
            legacy: [{
              type: "文字横幅",
              props: {
                id: "imported-unreachable-zone-banner",
                title: "不会被公开 Renderer 消费的 zones 内容",
                body: "导入时必须按根内容唯一位置合同移除。",
              },
            }],
          },
          root: { props: {} },
        },
      };
      await page.locator("#homepage-editor-import-file").setInputFiles({
        name: "page-capability-normalization.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(importedDocument)),
      });
      const confirmDialog = page.getByRole("dialog", { name: "导入装修方案？" });
      await expect(confirmDialog).toContainText("将移除 2 个不适用于店铺首页的系统或模板区块");
      await confirmDialog.getByRole("button", { name: "导入并替换画布" }).click();
      await expect(confirmDialog).toBeHidden();

      if (actor.width <= 390) {
        await page.getByRole("button", { name: "收起属性面板" }).click();
        await page.getByRole("button", { name: "展开图层面板" }).click();
      }
      await expect(page.locator("[data-layer-index]")).toHaveCount(2);
      await expect(page.locator("[data-layer-index]", { hasText: "首屏" })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "编辑店铺资料" })).toHaveCount(0);
      await expect(
        page.frameLocator("iframe").getByText("导入后的海川典藏", { exact: true }),
      ).toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      })).toBe(true);
      expect(requests.persistentWriteCalls()).toBe(0);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("拒绝把其他页面的装修方案导入当前页面", async ({ page }) => {
    const requests = await mockEditorApis(page, { valid: true });
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    await page.locator("#homepage-editor-import-file").setInputFiles({
      name: "about-page-decoration.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        kind: "haichuan-page-decoration",
        version: 1,
        pageKey: "about",
        puckData: validDraft().puckData,
      })),
    });

    await expect(page.getByText(
      "导入失败：该方案属于 about 页面，不能覆盖当前 home 页面",
    )).toBeVisible();
    await expect(page.getByRole("dialog", { name: "导入装修方案？" })).toHaveCount(0);
    await expect(page.locator("[data-layer-index]")).toHaveCount(1);
    await expect(page.locator('[data-layer-index="0"]')).toContainText("首屏");
    expect(requests.persistentWriteCalls()).toBe(0);
  });

  for (const pageCase of [
    { pageKey: "about", pageLabel: "关于海川", width: 1440, height: 900 },
    { pageKey: "products", pageLabel: "珠宝作品", width: 390, height: 844 },
    { pageKey: "custom", pageLabel: "珠宝定制", width: 1024, height: 768 },
  ] as const) {
    test(`${pageCase.pageLabel}导入时移除不属于静态品牌页的固定业务区`, async ({ page }) => {
      await page.setViewportSize({ width: pageCase.width, height: pageCase.height });
      const initialHero = {
        ...validDraft().puckData.content[0],
        props: {
          ...validDraft().puckData.content[0].props,
          id: `${pageCase.pageKey}-initial-hero`,
          title: `${pageCase.pageLabel}导入前`,
        },
      };
      const importedHero = {
        ...initialHero,
        props: {
          ...initialHero.props,
          id: `${pageCase.pageKey}-imported-hero`,
          title: `${pageCase.pageLabel}导入后`,
        },
      };
      const requests = await mockEditorApis(page, {
        valid: true,
        draftDocument: {
          ...validDraft(),
          pageKey: pageCase.pageKey,
          puckData: {
            content: [initialHero],
            zones: {},
            root: { props: {} },
          },
        },
      });
      await page.goto(`/admin/editor/${pageCase.pageKey}`);
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

      const importedBusinessRegion = (id: string) => ({
        type: "业务功能区",
        props: {
          id,
          pageKey: "catalog",
          title: "不属于静态品牌页的固定业务区",
          description: "此内容必须在导入时移除。",
          items: "错误业务能力",
          locked: true,
        },
      });
      await page.locator("#homepage-editor-import-file").setInputFiles({
        name: `${pageCase.pageKey}-unexpected-business-regions.json`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
          kind: "haichuan-page-decoration",
          version: 1,
          pageKey: pageCase.pageKey,
          puckData: {
            content: [
              importedHero,
              importedBusinessRegion("unexpected-root-business"),
            ],
            zones: {
              legacy: [
                importedBusinessRegion("unexpected-zone-business"),
                {
                  type: "文字横幅",
                  props: {
                    id: `${pageCase.pageKey}-unreachable-zone-banner`,
                    title: "不会被公开 Renderer 消费的 zones 内容",
                    body: "导入时必须移除。",
                  },
                },
              ],
            },
            root: { props: {} },
          },
        })),
      });

      const confirmDialog = page.getByRole("dialog", { name: "导入装修方案？" });
      await expect(confirmDialog).toContainText(
        `将移除 3 个不适用于${pageCase.pageLabel}的系统或模板区块`,
      );
      await confirmDialog.getByRole("button", { name: "导入并替换画布" }).click();
      await expect(confirmDialog).toBeHidden();
      await expect(page.locator(".ant-message-notice-content")).toHaveCount(0, {
        timeout: 10_000,
      });

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "更多编辑操作" }).click();
      await page.getByRole("menuitem", { name: "导出方案 JSON" }).click();
      const exported = await readDownloadJson(await downloadPromise);
      const rootBlocks = exported.puckData.content as Array<{ type?: string }>;
      const zoneBlocks = Object.values(exported.puckData.zones ?? {}).flat() as Array<{
        type?: string;
      }>;
      expect(rootBlocks.map((block) => block.type)).toEqual(["首屏主视觉"]);
      expect(zoneBlocks).toHaveLength(0);
      await expect.poll(() => page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      })).toBe(true);
      expect(requests.persistentWriteCalls()).toBe(0);
      await expectNoHorizontalOverflow(page);
    });
  }

  for (const pageCase of [
    {
      pageKey: "catalog",
      pageLabel: "选款中心",
      width: 1440,
      height: 900,
      brandBlock: {
        type: "文字横幅",
        props: {
          id: "catalog-imported-intro",
          eyebrow: "SELECTION CENTER",
          title: "导入后的选款入口",
          body: "按当前公开数据选款。",
          buttonText: "",
          linkUrl: "",
          targetType: "none",
          productId: 0,
          template: "left",
          bgColor: "#FFFFFF",
          textColor: "#181A1B",
          spacing: "compact",
        },
      },
    },
    {
      pageKey: "contact",
      pageLabel: "预约咨询",
      width: 390,
      height: 844,
      brandBlock: {
        type: "首屏主视觉",
        props: {
          ...validDraft().puckData.content[0].props,
          id: "contact-imported-hero",
          title: "导入后的预约咨询",
          actionText: "",
          targetType: "none",
          linkUrl: "",
        },
      },
    },
  ] as const) {
    test(`${pageCase.pageLabel}导入时清除 zones 与重复固定业务区`, async ({ page }) => {
      await page.setViewportSize({ width: pageCase.width, height: pageCase.height });
      const initialBusinessRegion = {
        type: "业务功能区",
        props: {
          id: `${pageCase.pageKey}-business-region`,
          pageKey: pageCase.pageKey,
          title: "当前页面固定业务区",
          description: "当前页面业务能力。",
          items: "当前业务能力",
          locked: true,
        },
      };
      const requests = await mockEditorApis(page, {
        valid: true,
        draftDocument: {
          ...validDraft(),
          pageKey: pageCase.pageKey,
          puckData: {
            content: [pageCase.brandBlock, initialBusinessRegion],
            zones: {},
            root: { props: {} },
          },
        },
      });
      await page.goto(`/admin/editor/${pageCase.pageKey}`);
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

      const legacyBusinessRegion = (id: string) => ({
        type: "业务功能区",
        props: {
          id,
          pageKey: "home",
          title: "不应保留的导入固定区",
          description: "不应覆盖当前页面合同。",
          items: "错误业务能力",
          locked: false,
        },
      });
      await page.locator("#homepage-editor-import-file").setInputFiles({
        name: `${pageCase.pageKey}-duplicate-business-regions.json`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
          kind: "haichuan-page-decoration",
          version: 1,
          pageKey: pageCase.pageKey,
          puckData: {
            content: [
              pageCase.brandBlock,
              legacyBusinessRegion("legacy-root-business-1"),
              legacyBusinessRegion("legacy-root-business-2"),
            ],
            zones: {
              legacy: [
                legacyBusinessRegion("legacy-zone-business"),
                {
                  type: "文字横幅",
                  props: {
                    id: `${pageCase.pageKey}-unreachable-zone-banner`,
                    title: "不会被公开 Renderer 消费的 zones 内容",
                    body: "导入时必须移除。",
                  },
                },
              ],
            },
            root: { props: {} },
          },
        })),
      });

      const confirmDialog = page.getByRole("dialog", { name: "导入装修方案？" });
      await expect(confirmDialog).toContainText(
        `将移除 3 个不适用于${pageCase.pageLabel}的系统或模板区块`,
      );
      await confirmDialog.getByRole("button", { name: "导入并替换画布" }).click();
      await expect(confirmDialog).toBeHidden();

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "更多编辑操作" }).click();
      await page.getByRole("menuitem", { name: "导出方案 JSON" }).click();
      const exported = await readDownloadJson(await downloadPromise);
      const rootBlocks = exported.puckData.content as Array<{
        type?: string;
        props?: Record<string, unknown>;
      }>;
      const zoneBlocks = Object.values(exported.puckData.zones ?? {}).flat() as Array<{
        type?: string;
      }>;
      expect(rootBlocks.map((block) => block.type)).toEqual([
        pageCase.brandBlock.type,
        "业务功能区",
      ]);
      expect(rootBlocks[1]?.props).toMatchObject({
        id: `${pageCase.pageKey}-business-region`,
        pageKey: pageCase.pageKey,
        locked: true,
      });
      expect(rootBlocks[1]?.props?.title).not.toBe("不应保留的导入固定区");
      expect(zoneBlocks).toHaveLength(0);
      await expect.poll(() => page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      })).toBe(true);
      expect(requests.persistentWriteCalls()).toBe(0);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("页面设置可选保存媒体来源与授权编号，未完成 SEO 仍可作为草稿保存", async ({ page }) => {
    await mockEditorApis(page, { valid: true });
    const publishedAdminRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith(
        "/page-modules/document/published/admin",
      ),
    );
    await page.goto("/admin/editor/home");
    await publishedAdminRequest;

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "页面设置" }).click();
    const drawer = page.getByRole("dialog", { name: "页面展示设置" });
    await expect(drawer).toBeVisible();
    for (const label of ["内容责任团队 / 岗位", "页面标题", "页面描述", "社交分享图"]) {
      await expect(drawer.locator("label").filter({ hasText: label })).toContainText("可选");
    }
    await expect(drawer).toContainText("不随公开页面接口返回");
    await drawer.getByPlaceholder("例：品牌内容组").fill("品牌内容组");
    await expect(drawer.getByRole("region", { name: "媒体来源与授权" })).toContainText(
      "1 项当前公开素材",
    );
    await drawer.getByRole("textbox", { name: "素材 1 来源" }).fill("品牌自有拍摄");
    await drawer.getByRole("textbox", { name: "素材 1 授权编号" }).fill("HC-OWN-2026-001");
    const draftSaveRequest = page.waitForRequest((request) => {
      const pathname = new URL(request.url()).pathname;
      return request.method() === "PUT"
        && /\/page-modules\/document$/.test(pathname);
    });
    await drawer.getByRole("button", { name: /保\s*存/ }).click();
    const request = await draftSaveRequest;
    expect(request.postDataJSON()).toMatchObject({
      metadata: {
        contentOwner: "品牌内容组",
        mediaRights: [{
          assetUrl: "/svg/template-hero.svg",
          source: "品牌自有拍摄",
          authorizationId: "HC-OWN-2026-001",
        }],
      },
    });
    await expect(drawer).toBeHidden();
  });

  test("关闭有未保存输入的页面设置时先确认并允许继续编辑", async ({ page }) => {
    await mockEditorApis(page, { valid: true });
    await page.goto("/admin/editor/home");
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "页面设置" }).click();

    const drawer = page.getByRole("dialog", { name: "页面展示设置" });
    const ownerInput = drawer.getByPlaceholder("例：品牌内容组");
    await ownerInput.fill("尚未保存的审计内容");
    await drawer.locator(".ant-drawer-close").click();
    const confirm = page.getByRole("dialog", { name: "放弃未保存的页面设置？" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "继续编辑" }).click();
    await expect(drawer).toBeVisible();
    await expect(ownerInput).toHaveValue("尚未保存的审计内容");

    await drawer.locator(".ant-drawer-close").click();
    await page.getByRole("dialog", { name: "放弃未保存的页面设置？" })
      .getByRole("button", { name: "放弃修改" }).click();
    await expect(drawer).toBeHidden();
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "页面设置" }).click();
    await expect(page.getByRole("dialog", { name: "页面展示设置" })
      .getByPlaceholder("例：品牌内容组")).toHaveValue("");
  });

  test("390px 窄屏保留保存草稿入口", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockEditorApis(page, { valid: true });
    await page.goto("/admin/editor/home");

    await expect(page.getByRole("button", { name: "保存当前装修草稿" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  for (const viewport of [
    { name: "桌面", width: 1440, height: 900 },
    { name: "移动窄屏", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}页面设置保存失败时保留抽屉、字段与未保存保护`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockEditorApis(page, {
        valid: true,
        saveFailure: true,
        saveDelayMs: 300,
      });
      await page.goto("/admin/editor/home");
      await page.getByRole("button", { name: "更多编辑操作" }).click();
      await page.getByRole("menuitem", { name: "页面设置" }).click();

      const drawer = page.getByRole("dialog", { name: "页面展示设置" });
      await drawer.getByPlaceholder("例：品牌内容组").fill("失败后仍保留的内容团队");
      const saveButton = drawer.getByRole("button", { name: /保\s*存/ });
      await saveButton.click();
      await expect(saveButton).toBeDisabled();

      await expect(drawer).toBeVisible();
      await expect(drawer.getByPlaceholder("例：品牌内容组")).toHaveValue(
        "失败后仍保留的内容团队",
      );
      await expect(saveButton).toBeEnabled();
      await expect(page.getByText("internal database path must never reach the browser")).toHaveCount(0);
      if (viewport.width > 390) {
        await expect(page.getByRole("status", { name: "草稿状态：有未保存修改" })).toBeVisible();
      }
      await expect.poll(() => page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      })).toBe(true);
    });
  }

  test("移动端窄屏仍可完整查看并编辑素材授权字段", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockEditorApis(page, { valid: true });
    await page.goto("/admin/editor/home");
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "页面设置" }).click();

    const drawer = page.getByRole("dialog", { name: "页面展示设置" });
    await expect(drawer).toBeVisible();
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox!.x).toBeGreaterThanOrEqual(0);
    expect(drawerBox!.width).toBeLessThanOrEqual(390.5);
    await drawer.getByRole("textbox", { name: "素材 1 来源" }).fill("品牌自有拍摄");
    await expect(drawer.getByRole("textbox", { name: "素材 1 来源" })).toHaveValue(
      "品牌自有拍摄",
    );
  });
});
