import { expect, test, type Download, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createContentSlot, createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { createDynamicTemplateInstanceProps } from "../src/page-builder/dynamic-template-instance/types";

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
    locale: "zh-CN",
    status: "DRAFT",
    reviewStatus: "APPROVED",
    contentHash: "a".repeat(64),
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

const supportRecipe = createRecommendedRecipe("general");
supportRecipe.content = [createContentSlot("title")];
const supportDefinition = generateTemplateFromRecipe(supportRecipe, {
  templateId: "tpl_publish_support", name: "内容说明",
});
supportDefinition.metadata.visualRole = "support-stage";
const supportTitleSlot = Object.values(supportDefinition.slots).find((slot) => slot.type === "heading")!;
supportTitleSlot.required = true;

function locatablePublishDraft() {
  const draft = validDraft();
  draft.puckData.content[0].props.mobileImage = "";
  return {
    ...draft,
    puckData: {
      ...draft.puckData,
      // 两个辅助内容实例承载同名字段，用于确认错误定位不会混淆重复槽位。
      content: [...draft.puckData.content, ...["poster-one", "poster-two"].map((id) => ({
        type: "动态模板实例",
        props: {
          ...createDynamicTemplateInstanceProps({ templateId: supportDefinition.templateId, version: 1, name: "内容说明" }),
          id, instanceId: id, contentBySlotId: { [supportTitleSlot.slotId]: "" },
        },
      }))],
      resolvedDynamicTemplates: {
        [`${supportDefinition.templateId}@1`]: {
          templateId: supportDefinition.templateId, version: 1, schemaVersion: supportDefinition.schemaVersion,
          definitionChecksum: "a".repeat(64), definition: supportDefinition,
        },
      },
    },
  };
}

function locatableValidation(body: Record<string, unknown>) {
  const puckData = body.puckData as {
    content?: Array<{ props?: Record<string, unknown> }>;
  } | undefined;
  const blocks = puckData?.content ?? [];
  const byId = (id: string) => blocks.find((block) => block.props?.id === id)?.props ?? {};
  const issues = [] as Array<{
    code: string;
    message: string;
    severity: "error";
    blockId: string;
    path: string;
    field: string;
  }>;
  const titleOf = (id: string) => (byId(id).contentBySlotId as Record<string, unknown> | undefined)?.[supportTitleSlot.slotId];
  if (!titleOf("poster-one")) issues.push({
    code: "required-field",
    message: "第一张海报必须填写标题",
    severity: "error",
    blockId: "poster-one",
    path: `content[1].props.contentBySlotId.${supportTitleSlot.slotId}`,
    field: supportTitleSlot.slotId,
  });
  if (!titleOf("poster-two")) issues.push({
    code: "required-field",
    message: "第二张海报必须填写标题",
    severity: "error",
    blockId: "poster-two",
    path: `content[2].props.contentBySlotId.${supportTitleSlot.slotId}`,
    field: supportTitleSlot.slotId,
  });
  if (!byId("d3-hero").mobileImage) issues.push({
    code: "required-mobile-media",
    message: "首屏必须填写移动端主图",
    severity: "error",
    blockId: "d3-hero",
    path: "content[0].props.mobileImage",
    field: "mobileImage",
  });
  return {
    valid: issues.length === 0,
    errors: issues.map((issue) => issue.message),
    issues,
  };
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
      code?: string;
    }>;
    validationResult?: (body: Record<string, unknown>) => {
      valid: boolean;
      errors: string[];
      issues: Array<{
        message: string;
        severity: "error" | "warning" | "info";
        blockId?: string;
        path?: string;
        field?: string;
        index?: number;
        code?: string;
      }>;
    };
    publishedDocument?: Record<string, unknown> | null;
    saveFailure?: boolean;
    saveFailureStatus?: number;
    publishFailure?: boolean;
    publishFailureStatus?: number;
    publishFailuresBeforeSuccess?: number;
    remoteDraftAfterPublishConflict?: Record<string, unknown>;
    publishDelayMs?: number;
    saveDelayMs?: number;
    validateFailuresBeforeSuccess?: number;
    beforeValidateResponse?: (call: number) => Promise<void>;
    draftDocument?: Record<string, unknown>;
  },
) {
  let draft = structuredClone(opts.draftDocument ?? validDraft()) as Record<string, unknown>;
  let validateCalls = 0;
  let validateResponses = 0;
  let persistentWriteCalls = 0;
  let saveCalls = 0;
  let publishCalls = 0;
  await page.route(`${API_PREFIX}*`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/auth/profile")) return route.fallback();

    if (url.includes("/validate")) {
      validateCalls += 1;
      await opts.beforeValidateResponse?.(validateCalls);
      if (validateCalls <= (opts.validateFailuresBeforeSuccess ?? 0)) {
        validateResponses += 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "internal validation service path must never reach the browser",
          }),
        });
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      validateResponses += 1;
      return route.fulfill(json(opts.validationResult?.(body) ?? {
          valid: opts.valid,
          errors: opts.errors ?? [],
          issues: opts.issues ?? [],
        }));
    }
    if (url.includes("/revisions")) {
      return route.fulfill(json([]));
    }
    if (url.includes("/review/submit")) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      draft = {
        ...draft,
        reviewStatus: "IN_REVIEW",
        updatedAt: "2026-08-14T00:00:01.500Z",
        contentHash: body.expectedContentHash ?? draft.contentHash,
      };
      return route.fulfill(json(draft));
    }
    if (url.includes("/published")) {
      return route.fulfill(json(opts.publishedDocument ?? null));
    }
    if (url.includes("/publish")) {
      // 发布接口（PUT）：返回已发布快照
      persistentWriteCalls += 1;
      publishCalls += 1;
      if (opts.publishDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, opts.publishDelayMs));
      }
      const publishFailureLimit = opts.publishFailure
        ? Number.POSITIVE_INFINITY
        : (opts.publishFailuresBeforeSuccess ?? 0);
      if (publishCalls <= publishFailureLimit) {
        const failureStatus = opts.publishFailureStatus ?? 409;
        if (failureStatus === 409 && opts.remoteDraftAfterPublishConflict) {
          draft = structuredClone(opts.remoteDraftAfterPublishConflict);
        }
        return route.fulfill({
          status: failureStatus,
          contentType: "application/json",
          body: JSON.stringify({
            code: failureStatus,
            message: failureStatus === 403
              ? "forbidden publish detail must never reach the browser"
              : failureStatus === 409
                ? "该页面已被其他编辑者更新，请重新加载后再发布"
                : "internal publish path must never reach the browser",
          }),
        });
      }
      return route.fulfill(
        json({
          ...draft,
          status: "PUBLISHED",
          reviewStatus: "PUBLISHED",
          publishedHash: draft.contentHash,
          version: 1,
          updatedAt: "2026-08-14T00:00:02.000Z",
        }),
      );
    }
    if (method === "PUT") {
      // 保存草稿
      persistentWriteCalls += 1;
      saveCalls += 1;
      if (opts.saveDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, opts.saveDelayMs));
      }
      if (opts.saveFailure) {
        const failureStatus = opts.saveFailureStatus ?? 503;
        return route.fulfill({
          status: failureStatus,
          contentType: "application/json",
          body: JSON.stringify({
            code: failureStatus,
            message: failureStatus === 403
              ? "forbidden save detail must never reach the browser"
              : "internal database path must never reach the browser",
          }),
        });
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      draft = {
        ...draft,
        ...(body.puckData ? { puckData: body.puckData } : {}),
        ...(body.metadata ? { metadata: body.metadata } : {}),
        updatedAt: "2026-08-14T00:00:01.000Z",
      };
      return route.fulfill(json(draft));
    }
    if (url.includes("/admin")) {
      return route.fulfill(json(draft));
    }
    return route.fulfill(json({}));
  });
  return {
    validateCalls: () => validateCalls,
    validateResponses: () => validateResponses,
    persistentWriteCalls: () => persistentWriteCalls,
    saveCalls: () => saveCalls,
    publishCalls: () => publishCalls,
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
    await expect(page.getByRole("button", { name: "保存当前装修草稿" })).toHaveAttribute(
      "title",
      "仅保存草稿，不更新客户前台",
    );
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

  test("未经审核的语言草稿不能直接发布", async ({ page }) => {
    await mockEditorApis(page, {
      valid: true,
      draftDocument: {
        ...validDraft(),
        reviewStatus: "DRAFT",
      },
    });

    await page.goto("/admin/editor/home");
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeDisabled();
    await expect(publishButton).toHaveAttribute(
      "title",
      "当前语言版本需先通过审核",
    );
    await expect(page.getByRole("button", { name: "提交审核" })).toBeVisible();
  });

  test("审核工具栏在 1440、1600 与 390 宽度可直接点击且键盘焦点不裁切", async ({ page }, testInfo) => {
    await mockEditorApis(page, {
      valid: true,
      draftDocument: {
        ...validDraft(),
        reviewStatus: "DRAFT",
      },
    });
    await page.goto("/admin/editor/home");

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1600, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const locale = page.getByLabel("内容语言", { exact: true });
      const submit = page.getByRole("button", { name: "提交审核", exact: true });
      await expect(locale).toBeVisible();
      await expect(submit).toBeVisible();
      await expect(submit).toBeEnabled();
      expect(await submit.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit === element || element.contains(hit);
      })).toBe(true);
      expect(await page.locator(".homepage-editor__locale-review-controls").evaluate((element) => (
        element.scrollWidth <= element.clientWidth
        && Array.from(element.querySelectorAll("select, button, [role='status']")).every(
          (control) => control.scrollWidth <= control.clientWidth,
        )
      ))).toBe(true);
      await locale.focus();
      await page.keyboard.press("Tab");
      await expect(submit).toBeFocused();
      await expect(submit).toHaveCSS("outline-style", "solid");
      const screenshot = testInfo.outputPath(`review-toolbar-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot, animations: "disabled" });
      await testInfo.attach(`review-toolbar-${viewport.width}x${viewport.height}`, {
        path: screenshot,
        contentType: "image/png",
      });
    }

    await page.setViewportSize({ width: 1600, height: 1000 });
    const submitted = page.waitForResponse((response) => (
      response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/page-modules/document/review/submit"
    ));
    await page.getByRole("button", { name: "提交审核", exact: true }).click();
    expect((await submitted).ok()).toBe(true);
    await expect(page.getByTestId("page-review-status")).toHaveText("待审核");
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
      "保存当前草稿并发布页面；只有此操作会更新客户前台，无图片模板会自动隐藏",
    );
    await publishButton.click();
    await expect(page.getByRole("dialog").filter({ hasText: "确认发布首页" })).toHaveCount(0);
    const blockers = page.getByRole("region", { name: "本次发布检查" });
    await expect(blockers).toBeVisible({ timeout: 8000 });
    await expect(blockers).toContainText("title 文本过长");
    await expect(blockers).toContainText("desktopImage 图片不能为空");
    await expect(blockers).toContainText("seoTitle 过长");
    await expect(page.getByText("店铺首页已发布")).toHaveCount(0);
    expect(requests.validateCalls()).toBe(2);
    expect(requests.persistentWriteCalls()).toBe(1);
  });

  for (const viewport of [
    { name: "1600", width: 1600, height: 1000 },
    { name: "1280", width: 1280, height: 900 },
    { name: "1024", width: 1024, height: 900 },
    { name: "390", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}px 发布错误可跨同名字段与移动端素材连续定位修复`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const requests = await mockEditorApis(page, {
        valid: false,
        draftDocument: locatablePublishDraft(),
        validationResult: locatableValidation,
      });

      await page.goto("/admin/editor/home");
      await expect.poll(requests.validateCalls).toBe(1);
      const publishButton = page.locator(".homepage-editor__toolbar-publish");
      await publishButton.click();

      const review = page.getByRole("region", { name: "本次发布检查" });
      await expect(review).toBeVisible({ timeout: 8000 });
      await expect(review).toContainText("3 项错误待处理");
      await expect(review.locator('[data-page-publish-block="poster-one"]'))
        .toContainText(`动态模板实例 / ${supportTitleSlot.label} / 桌面端与移动端`);
      await expect(review.locator('[data-page-publish-block="poster-two"]'))
        .toContainText(`动态模板实例 / ${supportTitleSlot.label} / 桌面端与移动端`);
      await expect(review.locator('[data-page-publish-block="d3-hero"]'))
        .toContainText("移动端");
      await expect(review.locator('[data-page-publish-block="d3-hero"]'))
        .toHaveAttribute("data-page-publish-field", "mobileImage");
      const reviewScreenshot = testInfo.outputPath(`publish-review-${viewport.name}.png`);
      await page.screenshot({ path: reviewScreenshot, animations: "disabled" });
      await testInfo.attach(`publish-review-${viewport.name}`, {
        path: reviewScreenshot,
        contentType: "image/png",
      });
      expect(requests.publishCalls()).toBe(0);
      expect(requests.persistentWriteCalls()).toBe(1);

      await review.getByRole("button", { name: /下一个问题/ }).press("Space");
      await expect(review).toContainText("当前 2 / 3");
      await review.getByRole("button", { name: /上一个问题/ }).press("Enter");

      const firstIssue = review.locator('[data-page-publish-block="poster-one"]');
      await firstIssue.getByRole("button").first().focus();
      await page.keyboard.press("Enter");
      const firstTitle = page.locator(`[data-inspector-field="${supportTitleSlot.slotId}"][data-page-publish-located="true"]`);
      await expect(firstTitle).toBeVisible();
      await firstTitle.getByRole("textbox").fill("第一张已修复");
      await expect(review).toContainText("2 项错误待处理", { timeout: 8000 });

      const secondIssue = review.locator('[data-page-publish-block="poster-two"]');
      await secondIssue.getByRole("button").first().click();
      const secondTitle = page.locator(`[data-inspector-field="${supportTitleSlot.slotId}"][data-page-publish-located="true"]`);
      await expect(secondTitle).toBeVisible();
      await secondTitle.getByRole("textbox").fill("第二张已修复");
      await expect(review).toContainText("1 项错误待处理", { timeout: 8000 });

      const mobileIssue = review.locator('[data-page-publish-block="d3-hero"]');
      await mobileIssue.getByRole("button").first().click();
      await expect(page.getByRole("button", { name: /移动端布局/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const mobileImage = page.locator('[data-inspector-field="mobileImage"][data-page-publish-located="true"]');
      await expect(mobileImage).toBeVisible();
      const enableMobileImage = mobileImage.getByRole("button", { name: "单独设置手机端" });
      if (await enableMobileImage.count()) await enableMobileImage.click();
      await mobileImage.getByRole("button", { name: /图片链接|粘贴图片链接/ }).click();
      const imageUrl = mobileImage.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片");
      await imageUrl.fill("/svg/template-hero.svg");
      await imageUrl.press("Enter");

      await expect(review).toContainText("当前问题已全部解决", { timeout: 8000 });
      expect(requests.publishCalls()).toBe(0);
      expect(requests.persistentWriteCalls()).toBe(1);

      const stableEntry = page.getByRole("button", { name: "查看本次发布检查（0 项错误）" });
      if (viewport.width <= 1024) {
        const inspectorDialog = page.getByRole("dialog", { name: "属性面板" });
        await expect(inspectorDialog).toBeVisible();
        await inspectorDialog.getByRole("button", { name: "收起属性面板" }).focus();
        await page.keyboard.press("Shift+Tab");
        await expect.poll(() => inspectorDialog.evaluate(
          (element) => element.contains(document.activeElement),
        )).toBe(true);

        await review.focus();
        await page.keyboard.press("Escape");
        await expect(review).toBeHidden();
        await expect(inspectorDialog).toHaveCount(0);
        await expect(stableEntry).toBeFocused();

        await stableEntry.press("Space");
        await expect(review).toBeVisible();
        await expect(page.getByRole("dialog", { name: "属性面板" })).toBeVisible();
        await review.getByRole("button", { name: "关闭本次发布检查" }).click();
        await expect(review).toBeHidden();
        await expect(page.getByRole("dialog", { name: "属性面板" })).toHaveCount(0);
        await expect(stableEntry).toBeFocused();

        await stableEntry.press("Space");
        await expect(page.getByRole("dialog", { name: "属性面板" })).toBeVisible();
      } else {
        await review.focus();
        await page.keyboard.press("Escape");
        await expect(review).toBeHidden();
        await expect(stableEntry).toBeVisible();
        await stableEntry.press("Space");
      }
      await expect(review).toBeVisible();
      await expect(review).toContainText("页面不会自动保存或发布");

      await page.getByRole("button", { name: "保存当前装修草稿" }).click();
      await expect.poll(requests.persistentWriteCalls).toBe(2);
      await expect(publishButton).toBeEnabled();
      await publishButton.click();
      await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
      expect(requests.publishCalls()).toBe(1);
      expect(requests.persistentWriteCalls()).toBe(4);
      await expectNoHorizontalOverflow(page);
    });
  }

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
        "保存当前草稿并发布页面；只有此操作会更新客户前台，无图片模板会自动隐藏",
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
      await expect(page.locator(".homepage-editor__layer-issue-count")).toHaveCount(0);
      await page.getByRole("button", { name: "更多编辑操作" }).click();
      await page.getByRole("menuitem", { name: "页面设置" }).click();
      const pageSettings = page.getByRole("dialog", { name: "页面展示设置" });
      await expect(pageSettings).toContainText("seoTitle 过长");
      await page.keyboard.press("Escape");
      await publishButton.click();
      const blockers = page.getByRole("region", { name: "本次发布检查" });
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
      await expect.poll(requests.validateCalls).toBe(1);
      await expect(page.locator(".homepage-editor__layer-issue-count")).toHaveCount(0);
      const layerSelect = page.locator(
        '[data-layer-index="0"] .homepage-editor__layer-select',
      );
      if (await layerSelect.count()) {
        await layerSelect.click();
      }

      await expect(page.getByRole("alert", { name: "发布检查问题" })).toHaveCount(0);
      await expect(page.getByRole("alert", { name: "当前模块发布检查问题" })).toHaveCount(0);
      await expect(page.getByText("当前任务：修复发布阻断", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "1 项发布阻断" }).press("Enter");
      const issueReview = page.getByRole("region", { name: "本次发布检查" });
      await expect(issueReview).toContainText(issueMessage);
      await issueReview.getByRole("button", { name: "定位", exact: true }).click();
      await expect(page.locator('[data-inspector-field="targetType"]')).toHaveAttribute(
        "data-page-publish-located",
        "true",
      );
      const publishButton = page.locator(".homepage-editor__toolbar-publish");
      await expect(publishButton).toBeEnabled();
      await publishButton.click();
      await expect(page.getByRole("region", { name: "本次发布检查" }))
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
        "素材授权在页面素材库集中维护",
      );
      await expect(drawer).toContainText("实际可见素材的公开资格由服务端统一检查");
    });
  }

  test("店铺资料提醒不混入页面发布错误且不打断一键发布", async ({ page }) => {
    const issueMessage = "品牌名称与公开呈现方式尚无正式签认凭据。";
    const requests = await mockEditorApis(page, {
      valid: true,
      errors: [],
      issues: [{ message: issueMessage, severity: "warning", path: "siteSettings.brandReviewReference", field: "brandReviewReference" }],
    });
    await page.goto("/admin/editor/home");
    await expect.poll(requests.validateCalls).toBeGreaterThan(0);
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "页面设置" }).click();
    await expect(page.getByRole("dialog", { name: "页面展示设置" })).not.toContainText(issueMessage);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "发布到前台网站" }).click();
    await expect(page.getByRole("region", { name: "本次发布检查" })).toHaveCount(0);
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
    expect(requests.persistentWriteCalls()).toBe(2);
  });

  test("素材来源审计提醒不打开问题面板且不打断一键发布", async ({ page }) => {
    const requests = await mockEditorApis(page, {
      valid: true,
      errors: [],
      issues: [{
        code: "page-validation-media-rights-advisory",
        message: "页面设置：1 项当前公开素材尚无完整来源记录。不影响本次页面发布，可在后续素材治理中补充。",
        severity: "warning",
        path: "metadata.mediaRights",
        field: "mediaRights",
      }],
    });
    await page.goto("/admin/editor/home");
    await expect.poll(requests.validateCalls).toBeGreaterThan(0);
    await page.getByRole("button", { name: "发布到前台网站" }).click();
    await expect(page.getByRole("region", { name: "本次发布检查" })).toHaveCount(0);
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
    expect(requests.persistentWriteCalls()).toBe(2);
  });

  test("合法数据点击一次即完成发布", async ({ page }) => {
    const requests = await mockEditorApis(page, { valid: true });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    await page.locator(".homepage-editor__toolbar-publish").click();
    await expect(page.getByRole("dialog").filter({ hasText: "确认发布首页" })).toHaveCount(0);
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
    expect(requests.persistentWriteCalls()).toBe(2);
  });

  test("保存草稿实际收到 403 时保留本地编辑并持续显示权限失败", async ({ page }) => {
    const requests = await mockEditorApis(page, {
      valid: true,
      saveFailure: true,
      saveFailureStatus: 403,
    });
    await page.goto("/admin/editor/home");
    const titleInput = page.getByRole("region", { name: "属性面板" }).getByRole(
      "textbox",
      { name: "主标题", exact: true },
    );
    await titleInput.fill("403 后仍保留的本地草稿");

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();

    const draftStatus = page.locator('.homepage-editor__draft-status[data-mode="error"]');
    await expect(draftStatus).toContainText("保存失败");
    await expect(page.locator(".ant-message-notice-content")).toContainText(
      "权限可能已发生变化。请重新登录后再试，或联系管理员确认权限。",
    );
    await expect(titleInput).toHaveValue("403 后仍保留的本地草稿");
    await expect(page.getByText("页面草稿已保存", { exact: true })).toHaveCount(0);
    expect(requests.saveCalls()).toBe(1);
    expect(requests.publishCalls()).toBe(0);
    expect(requests.persistentWriteCalls()).toBe(1);
  });

  test("发布实际收到 403 时保留草稿、持续失败且不误报成功", async ({ page }) => {
    const requests = await mockEditorApis(page, {
      valid: true,
      publishFailure: true,
      publishFailureStatus: 403,
    });
    await page.goto("/admin/editor/home");
    const titleInput = page.getByRole("region", { name: "属性面板" }).getByRole(
      "textbox",
      { name: "主标题", exact: true },
    );
    await titleInput.fill("403 后仍保留的发布草稿");

    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeDisabled();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    const review = page.getByRole("region", { name: "本次发布检查" });
    await expect(review).toContainText("本次发布失败");
    await expect(review).toContainText("权限可能已发生变化");
    await expect(review).toContainText("请重新登录后再试，或联系管理员确认发布权限");
    await expect(page.locator('.homepage-editor__workspace-status[data-mode="error"]'))
      .toContainText("发布失败 · 可重试");
    await expect(titleInput).toHaveValue("403 后仍保留的发布草稿");
    await expect(page.getByText("店铺首页已发布")).toHaveCount(0);
    expect(requests.saveCalls()).toBe(2);
    expect(requests.publishCalls()).toBe(1);
    expect(requests.persistentWriteCalls()).toBe(3);
  });

  test("发布 409 后保留本地修改不发额外写请求且冲突状态持续可见", async ({ page }) => {
    const remoteDraft = validDraft();
    remoteDraft.puckData.content[0].props.title = "远端编辑者的新草稿";
    remoteDraft.updatedAt = "2026-08-14T00:00:03.000Z";
    const requests = await mockEditorApis(page, {
      valid: true,
      publishFailure: true,
      publishFailureStatus: 409,
      remoteDraftAfterPublishConflict: remoteDraft,
    });
    await page.goto("/admin/editor/home");
    const titleInput = page.getByRole("region", { name: "属性面板" }).getByRole(
      "textbox",
      { name: "主标题", exact: true },
    );
    await titleInput.fill("冲突后保留的本地修改");

    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeDisabled();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    const review = page.getByRole("region", { name: "本次发布检查" });
    await expect(review.getByRole("button", { name: "保留本地修改", exact: true })).toBeVisible();
    await expect(review.getByRole("button", { name: /重新\s*加载远端草稿/ })).toBeVisible();
    await review.getByRole("button", { name: "保留本地修改", exact: true }).click();

    await expect(review).toBeHidden();
    await expect(titleInput).toHaveValue("冲突后保留的本地修改");
    await expect(page.locator('.homepage-editor__workspace-status[data-mode="error"]'))
      .toContainText("发布失败 · 可重试");
    await expect(page.getByRole("button", { name: "保存当前装修草稿" })).toBeEnabled();
    await expect(page.getByText("店铺首页已发布")).toHaveCount(0);
    expect(requests.saveCalls()).toBe(2);
    expect(requests.publishCalls()).toBe(1);
    expect(requests.persistentWriteCalls()).toBe(3);
  });

  test("发布 409 后仅在确认后加载远端草稿并可继续发布", async ({ page }) => {
    const remoteDraft = validDraft();
    remoteDraft.puckData.content[0].props.title = "确认后加载的远端草稿";
    remoteDraft.updatedAt = "2026-08-14T00:00:03.000Z";
    const requests = await mockEditorApis(page, {
      valid: true,
      publishFailuresBeforeSuccess: 1,
      publishFailureStatus: 409,
      remoteDraftAfterPublishConflict: remoteDraft,
    });
    await page.goto("/admin/editor/home");
    const titleInput = page.getByRole("region", { name: "属性面板" }).getByRole(
      "textbox",
      { name: "主标题", exact: true },
    );
    await titleInput.fill("确认前不能丢失的本地修改");
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeDisabled();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    const review = page.getByRole("region", { name: "本次发布检查" });
    await review.getByRole("button", { name: /重新\s*加载远端草稿/ }).click();
    const confirm = page.getByRole("dialog", { name: "重新加载远端草稿？" });
    await expect(confirm).toContainText("当前本地修改将被远端草稿替换");
    await expect(confirm).toContainText("不会自动合并或覆盖任一侧");
    await expect(titleInput).toHaveValue("确认前不能丢失的本地修改");
    expect(requests.persistentWriteCalls()).toBe(3);

    await confirm.getByRole("button", { name: "重新加载远端草稿", exact: true }).click();
    await expect(titleInput).toHaveValue("确认后加载的远端草稿");
    await expect(page.locator('.homepage-editor__workspace-status[data-mode="error"]')).toHaveCount(0);
    expect(requests.persistentWriteCalls()).toBe(3);

    await publishButton.click();
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
    expect(requests.saveCalls()).toBe(3);
    expect(requests.publishCalls()).toBe(2);
    expect(requests.persistentWriteCalls()).toBe(5);
  });

  test("发布失败在自动重验后仍保留，关闭重开后明确重试只发送一次请求", async ({ page }) => {
    let releaseAutomaticValidation!: () => void;
    const automaticValidationGate = new Promise<void>((resolve) => {
      releaseAutomaticValidation = resolve;
    });
    const requests = await mockEditorApis(page, {
      valid: true,
      publishFailuresBeforeSuccess: 1,
      publishFailureStatus: 503,
      publishDelayMs: 250,
      beforeValidateResponse: async (call) => {
        if (call === 3) await automaticValidationGate;
      },
    });

    await page.goto("/admin/editor/home");
    await expect.poll(requests.validateCalls).toBe(1);
    await page.locator(".homepage-editor__toolbar-publish").click();

    await expect(page.locator(".ant-message-notice-content").getByText(
      "发布失败，请稍后重试",
      { exact: true },
    ))
      .toBeVisible({ timeout: 8000 });
    await expect(page.getByText("店铺首页已发布")).toHaveCount(0);
    const failureStatus = page.locator(
      '.homepage-editor__workspace-status[data-mode="error"]',
    );
    await expect(failureStatus).toContainText("发布失败 · 可重试");
    await expect(failureStatus).toContainText("草稿仍在");
    await expect.poll(requests.publishCalls).toBe(1);
    await expect.poll(requests.validateCalls).toBe(3);

    releaseAutomaticValidation();
    await expect.poll(requests.validateResponses).toBe(3);
    const review = page.getByRole("region", { name: "本次发布检查" });
    await expect(review).toContainText("本次发布失败");
    await expect(review).toContainText("自动检查只更新发布资格，不会把本次失败改成成功");
    await expect(failureStatus).toContainText("发布失败 · 可重试");

    await review.getByRole("button", { name: "关闭本次发布检查" }).press("Enter");
    await expect(review).toBeHidden();
    await failureStatus.press("Enter");
    await expect(review).toContainText("本次发布失败");

    const retryPublish = review.locator(":scope > footer button");
    await expect(retryPublish).toContainText("重新发布");
    await retryPublish.evaluate((button) => {
      button.click();
      button.click();
    });
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
    await expect.poll(requests.publishCalls).toBe(2);
    await expect(page.locator('.homepage-editor__draft-status[data-mode="clean"]')).toHaveCount(0);
    await expect(page.locator(".homepage-editor__toolbar")).not.toContainText("已保存");
    expect(requests.persistentWriteCalls()).toBe(4);
  });

  test("发布失败后继续编辑会使旧结果失效并恢复真实草稿状态", async ({ page }) => {
    const requests = await mockEditorApis(page, {
      valid: true,
      publishFailure: true,
      publishFailureStatus: 503,
    });

    await page.goto("/admin/editor/home");
    await expect.poll(requests.validateCalls).toBe(1);
    await page.locator(".homepage-editor__toolbar-publish").click();
    const review = page.getByRole("region", { name: "本次发布检查" });
    await expect(review).toContainText("本次发布失败");
    await review.getByRole("button", { name: "关闭本次发布检查" }).click();

    const titleInput = page.getByRole("region", { name: "属性面板" }).getByRole(
      "textbox",
      { name: "主标题", exact: true },
    );
    await titleInput.fill("发布失败后继续编辑的新标题");

    await expect(page.getByText("发布失败 · 可重试", { exact: true })).toHaveCount(0);
    await expect(page.locator('.homepage-editor__draft-status[data-mode="dirty"]'))
      .toContainText("有未保存修改");
    expect(requests.publishCalls()).toBe(1);
    expect(requests.persistentWriteCalls()).toBe(2);
  });

  test("1600/1280/1024/390 发布失败提示持续可见且不遮断工作区操作", async ({ page }) => {
    const requests = await mockEditorApis(page, {
      valid: true,
      publishFailure: true,
      publishFailureStatus: 503,
    });
    const viewports = [
      { width: 1600, height: 1000 },
      { width: 1280, height: 900 },
      { width: 1024, height: 900 },
      { width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`/admin/editor/home?publish-failure=${viewport.width}`);
      const publishButton = page.locator(".homepage-editor__toolbar-publish");
      await expect(publishButton).toBeEnabled();
      await publishButton.press("Enter");

      const failureStatus = page.locator(
        '.homepage-editor__workspace-status[data-mode="error"]',
      );
      await expect(failureStatus).toContainText("发布失败 · 可重试");
      await expect(failureStatus).toBeInViewport();
      const review = page.getByRole("region", { name: "本次发布检查" });
      await expect(review).toContainText("草稿仍完整保留，可明确重试");
      await expect(review).toBeInViewport();
      await expectNoHorizontalOverflow(page);

      await review.press("Escape");
      await expect(review).toBeHidden();
      await expect(failureStatus).toBeFocused();
    }

    expect(requests.publishCalls()).toBe(viewports.length);
    expect(requests.persistentWriteCalls()).toBe(viewports.length * 2);
  });

  test("多个首屏不产生数量阻断且点击一次即可发布", async ({ page }) => {
    const requests = await mockEditorApis(page, {
      valid: true,
      errors: [],
      issues: [],
      draftDocument: multiHeroDraft(),
    });

    await page.goto("/admin/editor/home");
    await expect(
      page.locator(".homepage-editor__template-card", { hasText: "已添加" }),
    ).toHaveCount(0);
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 10000 });
    await expect(page.getByRole("status", { name: /发布阻断/ })).toHaveCount(0);
    await publishButton.click();
    await expect(page.getByRole("dialog").filter({ hasText: "确认发布首页" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "本次发布检查" })).toHaveCount(0);
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
    expect(requests.persistentWriteCalls()).toBe(2);
  });

  test("内容提示进入属性面板但不阻断点击一次直接发布", async ({ page }) => {
    const warning = "第 1 个区块「首屏主视觉」：标题仍是占位内容";
    await mockEditorApis(page, {
      valid: true,
      errors: [],
      issues: [{
        message: warning,
        severity: "warning",
        blockId: "d3-hero",
        path: "content[0].props.title",
        field: "title",
      }],
    });

    await page.goto("/admin/editor/home");
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
      "当前账号可提交审核，发布需由管理员完成",
    );
    expect(requests.persistentWriteCalls()).toBe(0);
  });

  for (const actor of [
    { role: "SUPER_ADMIN" as const, name: "管理员桌面", width: 1440, height: 900 },
    { role: "EDITOR" as const, name: "编辑移动端", width: 390, height: 844 },
  ]) {
    test(`${actor.name}导入拒绝退役模板并按当前能力归一化已知系统区块`, async ({ page }) => {
      await authenticateAdmin(page, actor.role);
      await page.setViewportSize({ width: actor.width, height: actor.height });
      const requests = await mockEditorApis(page, { valid: true });
      await page.goto("/admin/editor/home");
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
      await expect(
        page.frameLocator("iframe").getByText("海川典藏", { exact: true }),
      ).toBeVisible();

      await page.locator("#homepage-editor-import-file").setInputFiles({
        name: "retired-template.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
          kind: "haichuan-page-decoration", version: 1, pageKey: "home",
          puckData: { ...validDraft().puckData, content: [
            ...validDraft().puckData.content,
            { type: "已删除模板", props: { id: "retired-block", title: "保留原画布" } },
          ] },
        })),
      });
      await expect(page.getByText("导入失败：包含未知模块类型（已删除模板），可能来自其他版本", { exact: true })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "导入装修方案？" })).toHaveCount(0);
      await expect(page.frameLocator("iframe").getByText("海川典藏", { exact: true })).toBeVisible();
      expect(requests.persistentWriteCalls()).toBe(0);

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
              type: "业务功能区",
              props: {
                id: "imported-business-region",
                pageKey: "home",
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
              type: "业务功能区",
              props: {
                id: "imported-unreachable-zone-banner",
                pageKey: "home",
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
      await expect(confirmDialog).toContainText("将移除 3 个不适用于店铺首页的系统或模板区块");
      await confirmDialog.getByRole("button", { name: "导入并替换画布" }).click();
      await expect(confirmDialog).toBeHidden();

      if (actor.width <= 390) {
        await page.getByRole("button", { name: "收起属性面板" }).press("Enter");
        await page.getByRole("button", { name: "展开图层面板" }).press("Enter");
      }
      await expect(page.locator("[data-layer-index]")).toHaveCount(1);
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
                  type: "已删除模板",
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
        type: "首屏主视觉",
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
                  type: "已删除模板",
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

  test("页面只展示素材授权汇总并跳转集中素材库，不再写入逐素材权利记录", async ({ page }) => {
    const requests = await mockEditorApis(page, { valid: true });
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
      "1 项当前页面素材",
    );
    await expect(drawer.getByRole("region", { name: "媒体来源与授权" })).toContainText("集中维护");
    await expect(drawer.getByRole("textbox", { name: /素材 \d+ 来源/ })).toHaveCount(0);
    await expect(drawer.getByRole("link", { name: "在页面素材库登记与审核" }))
      .toHaveAttribute("href", "/admin/media");
    await expect(drawer).toContainText("页面设置与画布修改会一起保存为整页草稿");
    const draftSaveRequest = page.waitForRequest((request) => {
      const pathname = new URL(request.url()).pathname;
      return request.method() === "PUT"
        && /\/page-modules\/document$/.test(pathname);
    });
    await drawer.getByRole("button", { name: "保存整页草稿" }).click();
    const request = await draftSaveRequest;
    expect(request.postDataJSON()).toMatchObject({
      puckData: {
        content: [{ props: { id: "d3-hero" } }],
      },
      metadata: {
        contentOwner: "品牌内容组",
      },
    });
    expect(request.postDataJSON().metadata).not.toHaveProperty("mediaRights");
    await expect(drawer).toBeHidden();
    await expect(page.getByText("整页草稿已保存，包含页面设置与画布修改", { exact: true }))
      .toBeVisible();
    expect(requests.persistentWriteCalls()).toBe(1);
  });

  test("1600/1280/1024/390 页面设置没有局部修改时仍可键盘执行整页保存", async ({ page }) => {
    const requests = await mockEditorApis(page, { valid: true, saveDelayMs: 250 });
    const viewports = [
      { width: 1600, height: 1000 },
      { width: 1280, height: 900 },
      { width: 1024, height: 900 },
      { width: 390, height: 844 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`/admin/editor/home?save-scope=${viewport.width}`);
      await page.getByRole("button", { name: "更多编辑操作" }).click();
      await page.getByRole("menuitem", { name: "页面设置" }).click();

      const drawer = page.getByRole("dialog", { name: "页面展示设置" });
      const saveButton = drawer.getByRole("button", { name: "保存整页草稿" });
      await expect(saveButton).toBeVisible();
      await saveButton.focus();
      await saveButton.press("Enter");
      await expect(saveButton).toBeDisabled();
      await expect(drawer).toBeHidden();
      await expect(page.locator(".ant-message-notice-content")
        .getByText("整页草稿已保存，包含页面设置与画布修改", { exact: true }).last())
        .toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    expect(requests.persistentWriteCalls()).toBe(viewports.length);
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

    const actions = page.getByRole("toolbar", { name: "编辑器主要操作" });
    await expect(page.getByRole("button", { name: "保存当前装修草稿" })).toBeVisible();
    expect(await actions.locator("[data-workspace-action]").evaluateAll((controls) => (
      controls.map((control) => control.getAttribute("data-workspace-action"))
    ))).toEqual(["undo", "redo", "preview", "save", "publish", "more"]);
    const actionsBox = await actions.boundingBox();
    if (!actionsBox) throw new Error("移动端页面装修缺少操作栏尺寸");
    expect(actionsBox.x).toBeGreaterThanOrEqual(0);
    expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(390);
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
      const saveButton = drawer.getByRole("button", { name: "保存整页草稿" });
      await saveButton.click();
      await expect(saveButton).toBeDisabled();

      await expect(drawer).toBeVisible();
      await expect(drawer.getByPlaceholder("例：品牌内容组")).toHaveValue(
        "失败后仍保留的内容团队",
      );
      await expect(saveButton).toBeEnabled();
      await expect(page.getByText("整页草稿保存失败，请重试", { exact: true })).toBeVisible();
      await expect(page.getByText("internal database path must never reach the browser")).toHaveCount(0);
      if (viewport.width > 390) {
        await expect(page.getByRole("status", { name: /草稿状态：保存失败.*请重试/ })).toBeVisible();
      }
      await expect.poll(() => page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      })).toBe(true);
    });
  }

  test("移动端窄屏可查看授权汇总与素材库入口，不出现页面级授权表单", async ({ page }) => {
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
    await expect(drawer.getByRole("link", { name: "在页面素材库登记与审核" })).toBeVisible();
    await expect(drawer.getByRole("textbox", { name: /素材 \d+ 来源/ })).toHaveCount(0);
  });
});
