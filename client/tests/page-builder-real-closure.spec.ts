import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { firstRegionAction, productionStageAction } from "./fixtures/template-authoring-main-route";

const realQaEnabled = process.env.PAGE_BUILDER_REAL_QA === "true";
const apiBaseUrl = process.env.PAGE_BUILDER_REAL_API_BASE_URL ?? "";
const browserBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const username = process.env.PAGE_BUILDER_QA_USERNAME ?? "";
const password = process.env.PAGE_BUILDER_QA_PASSWORD ?? "";
const expectedApiBaseUrl = "http://127.0.0.1:3101/api";
const expectedBrowserBaseUrl = "http://127.0.0.1:5175";
const forwardedProtoHeaders = process.env.PLAYWRIGHT_FORWARDED_PROTO
  ? { "X-Forwarded-Proto": process.env.PLAYWRIGHT_FORWARDED_PROTO }
  : undefined;

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

type JsonResponse = {
  ok(): boolean;
  status(): number;
  url(): string;
  json(): Promise<unknown>;
};

async function responseData<T>(response: JsonResponse): Promise<T> {
  expect(response.ok(), `${response.status()} ${response.url()} 应成功`).toBe(true);
  return unwrap<T>(await response.json());
}

type PageDocumentBlock = {
  props?: Record<string, unknown>;
};

type PageDocumentSnapshot = {
  updatedAt: string;
  publishedRevisionId?: number | null;
  version: number;
  puckData: { content: PageDocumentBlock[] };
};

type PageDocumentRevisionSummary = {
  id: number;
  version: number;
  isPublished: boolean;
};

type PageDocumentRevisionDetail = PageDocumentRevisionSummary & {
  puckData: { content: PageDocumentBlock[] };
};

function dynamicTemplateVersions(
  snapshot: Pick<PageDocumentSnapshot, "puckData">,
  templateId: string,
) {
  return snapshot.puckData.content
    .filter((block) => block.props?.templateId === templateId)
    .map((block) => block.props?.templateVersion);
}

function dynamicTemplateInstanceIdentities(
  snapshot: Pick<PageDocumentSnapshot, "puckData">,
  templateId: string,
): Array<{ instanceId: string; version: number }> {
  return snapshot.puckData.content
    .filter((block) => block.props?.templateId === templateId)
    .map((block) => {
      const instanceId = block.props?.instanceId;
      const version = block.props?.templateVersion;
      if (typeof instanceId !== "string" || typeof version !== "number") {
        throw new Error(`页面实例 ${templateId} 缺少稳定 instanceId 或 templateVersion`);
      }
      return { instanceId, version };
    });
}

async function browserWriteResult(
  page: Page,
  path: string,
  data: Record<string, unknown>,
  method: "PUT" | "POST" = "PUT",
) {
  return page.evaluate(async ({ url, payload, requestMethod }) => {
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
}

async function browserWrite<T>(
  page: Page,
  path: string,
  data: Record<string, unknown>,
  method: "PUT" | "POST" = "PUT",
): Promise<T> {
  const result = await browserWriteResult(page, path, data, method);

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

async function loginAndPrepareIsolatedQaSite(page: Page) {
  await loginThroughUi(page);
  await browserWrite(page, "/settings", {
    siteName: "海川珠宝一次性隔离 QA",
    brandPresentationMode: "text-only",
    brandReviewReference: "QA-ISOLATED-BRAND-20260910",
    contactPhone: "000-0000-0000",
    contactEmail: "qa-only@example.com",
    contactAddress: "一次性隔离 QA 地址（非真实经营地址）",
    businessHours: "一次性隔离 QA 时间（非真实营业时间）",
    legalEntityReviewReference: "QA-ISOLATED-LEGAL-20260910",
    privacyPolicyReviewReference: "QA-ISOLATED-PRIVACY-20260910",
    seoTitle: "海川珠宝一次性隔离 QA",
    seoDescription: "仅用于验证隔离页面发布门禁的 QA 搜索摘要。",
    seoReviewReference: "QA-ISOLATED-SEO-20260910",
    canonicalBaseUrl: "https://qa-isolated.example.invalid",
    defaultLocale: "zh-CN",
    publishedLocales: ["zh-CN"],
  });

  const readinessResult = await page.evaluate(async () => {
    const response = await fetch("/api/settings/publication-readiness", {
      credentials: "include",
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => null),
    };
  });
  expect(
    readinessResult.ok,
    `${readinessResult.status} /settings/publication-readiness 应成功`,
  ).toBe(true);
  const readiness = unwrap<{
    schemaVersion: number;
    status: string;
    ready: boolean;
    persisted: boolean;
    blockers: unknown[];
  }>(readinessResult.body);
  expect(readiness).toMatchObject({
    schemaVersion: 2,
    status: "READY",
    ready: true,
    persisted: true,
  });
  expect(readiness.blockers).toEqual([]);
}

const TEMPLATE_STRESS_SCENARIOS = [
  "short-text",
  "long-text",
  "optional-missing",
  "required-missing",
  "media-ratios",
] as const;

async function openHistoricalTemplateFixture(page: Page) {
  // 本套保留旧模板的结构与真实持久化回归；新方案创建由 recipe 测试覆盖。
  const creator = page.getByRole("dialog", { name: "创建模板", exact: true });
  await expect(creator).toBeVisible();
  await creator.getByRole("button", { name: "取消", exact: true }).click();
  await expect(creator).toBeHidden();
  await page.evaluate(async () => {
    const repoPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ createNewDynamicTemplateDraft }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ repoPath), import(/* @vite-ignore */ sessionPath),
    ]);
    useTemplateEditorSession.getState().open(createNewDynamicTemplateDraft("历史兼容模板"), { isNew: true });
  });
}

async function applyBasicSkeleton(page: Page) {
  // 此真实兼容套件的几何基线是历史 4:3，尺寸与结构在同一条事务装入。
  await page.evaluate(async () => {
    const repoPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
        const [{ createBasicContentSkeletonDefinition }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ repoPath), import(/* @vite-ignore */ sessionPath),
    ]);
    const result = useTemplateEditorSession.getState().executeCommand({ type: "transform-definition", label: "装入历史 4:3 骨架夹具", transform: (source: unknown) => { const next = createBasicContentSkeletonDefinition(source); next.metadata.desktopRatio = "4:3"; next.nodes[next.rootNodeId].responsive.desktop.height = { mode: "aspect-ratio", ratio: { width: 4, height: 3 } }; return next; } });
    if (!result.ok) throw new Error(result.message);
  });
}

async function fillTemplateIdentity(page: Page, name: string, purpose: string) {
  await (await productionStageAction(page, "交付信息")).click();
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const nameInput = inspector.getByRole("textbox", { name: "模板名称", exact: true });
  const purposeInput = inspector.getByRole("textbox", { name: "用途", exact: true });
  await expect(nameInput, "模板名称必须只有一个正式编辑入口").toHaveCount(1);
  await nameInput.fill(name);
  await nameInput.press("Tab");
  await purposeInput.fill(purpose);
  await purposeInput.press("Tab");
  await expect(nameInput).toHaveValue(name);
  await expect(purposeInput).toHaveValue(purpose);
}

async function prepareTemplatePublishThroughProductionReviews(
  page: Page,
  templateId: string,
): Promise<{ confirmAndWaitForSinglePublish: () => Promise<Response>; review: Locator }> {
  const publishPath = `/api/page-modules/dynamic-templates/${templateId}/publish`;
  const publishRequests: string[] = [];
  const capturePublishRequest = (request: Request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === publishPath) {
      publishRequests.push(url.pathname);
    }
  };
  page.on("request", capturePublishRequest);
    const toolbar = page.locator(".template-editor__toolbar");
    const publishTrigger = toolbar.getByRole("button", { name: /^发布模板新版本/ });
    await publishTrigger.click();
    const blockedReview = page.getByRole("region", { name: "本次发布检查", exact: true });
    await expect(blockedReview).toContainText("存在阻止发布的问题");
    await expect(blockedReview).toContainText("发布前需明确核对桌面端布局");
    await expect(blockedReview.getByRole("button", {
      name: "保存并发布模板",
      exact: true,
    })).toBeDisabled();
    await blockedReview.getByRole("button", { name: "返回编辑", exact: true }).click();
    await expect(blockedReview).toBeHidden();
    expect(publishRequests, "人工核对未完成时不得发出模板 publish 请求").toEqual([]);

    await expect(page.getByRole("region", { name: "模板制作步骤", exact: true })).toHaveCount(0);
    const renderer = page.frameLocator("iframe.template-editor__viewport-frame")
      .locator(".template-editor__dynamic-canvas-renderer");
    const assertRendererState = async (label: string, allowPublicCollapse = false) => {
      await expect(renderer, `${label}应挂载真实模板 Renderer`).toBeAttached();
      if (allowPublicCollapse && !(await renderer.isVisible())) {
        await expect(
          renderer.locator("[data-template-slot-id]"),
          `${label}完全收起时不得留下虚假的空槽位`,
        ).toHaveCount(0);
        return;
      }
      await expect(renderer, `${label}应显示真实模板 Renderer`).toBeVisible();
      const box = await renderer.boundingBox();
      if (!box) throw new Error(`${label}真实模板 Renderer 没有可用几何尺寸`);
      expect(box.width, `${label} Renderer 宽度`).toBeGreaterThan(0);
      expect(box.height, `${label} Renderer 高度`).toBeGreaterThan(0);
    };

    const desktop = toolbar.getByRole("button", { name: /^桌面端模板布局/ });
    await desktop.click();
    await expect(desktop).toHaveAttribute("aria-pressed", "true");
    await assertRendererState("桌面端");


    const mobile = toolbar.getByRole("button", { name: /^移动端模板布局/ });
    await mobile.click();
    await expect(mobile).toHaveAttribute("aria-pressed", "true");
    await assertRendererState("移动端");


    await page.getByRole("tab", { name: "页面开放范围", exact: true }).click();
    await expect(page.getByRole("tab", { name: "页面开放范围", exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "页面开放范围", exact: true }))
      .toContainText("交付给页面装修的字段");


    await page.getByRole("button", { name: "预览模板", exact: true }).click();
    const scenario = page.getByRole("combobox", { name: "压力预览场景", exact: true });
    for (const value of TEMPLATE_STRESS_SCENARIOS) {
      await scenario.selectOption(value);
      await expect(scenario).toHaveValue(value);
      await expect(renderer).toHaveAttribute("data-preview-scenario", value);
      const missingContentScenario = value === "optional-missing" || value === "required-missing";
      await assertRendererState(`压力场景 ${value}`, missingContentScenario);
      if (missingContentScenario) {
        await expect(page.locator(`[data-template-stress-preview-summary="${value}"]`))
          .toHaveAttribute("data-template-empty-slot-policy", "public-collapse");
      }
      await page.getByRole("button", {
        name: "确认当前压力预览场景已核对",
        exact: true,
      }).click();
      await expect(page.getByRole("button", {
        name: "当前压力预览场景已核对",
        exact: true,
      })).toBeDisabled();
    }
    await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();
    await expect(page.getByRole("region", { name: "模板制作步骤", exact: true })).toHaveCount(0);

    expect(publishRequests, "完成核对但尚未最终确认时仍不得发出模板 publish 请求")
      .toEqual([]);
    await publishTrigger.click();
    const review = page.getByRole("region", { name: "本次发布检查", exact: true });
    await review.getByRole("button", { name: "确认已核对桌面端布局", exact: true }).click();
    await review.getByRole("button", { name: "确认已核对移动端布局", exact: true }).click();
    await review.getByRole("button", { name: "确认页面开放范围已核对", exact: true }).click();
    await expect(review).toContainText("满足发布门禁");
    await expect(review).toContainText("检查已就绪");
    const confirmPublish = review.getByRole("button", {
      name: /保存并发布模板|发布模板新版本/,
    });
    await expect(confirmPublish).toBeEnabled();
    expect(publishRequests, "只有发布检查内的最终确认才允许发出模板 publish 请求")
      .toEqual([]);
    const confirmAndWaitForSinglePublish = async () => {
      const publishResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST" && url.pathname === publishPath;
      });
      try {
        await confirmPublish.click();
        const response = await publishResponsePromise;
        await expect(review.getByRole("button", {
          name: /去页面装修使用|继续设计/,
        })).toBeVisible();
        expect(publishRequests, "最终确认必须恰好发出一次模板 publish 请求")
          .toEqual([publishPath]);
        return response;
      } finally {
        page.off("request", capturePublishRequest);
      }
    };
    return { confirmAndWaitForSinglePublish, review };
}

async function uploadTemplateInstanceImage(
  page: Page,
  field: Locator,
  altText: string,
) {
  const uploadResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === "/api/upload/image";
  });
  const chooserPromise = page.waitForEvent("filechooser");
  await field.getByRole("button", { name: /拖入图片或点击上传/ }).click();
  await (await chooserPromise).setFiles(
    "public/images/admin/templates/jewelry-home-wireframe.png",
  );
  const uploaded = await responseData<{ url: string }>(await uploadResponsePromise);
  await expect(field.getByRole("button", { name: "替换图片" })).toBeVisible();
  const altInput = field.getByRole("textbox", { name: /替代文字$/ });
  await altInput.fill(altText);
  await altInput.press("Tab");
  await expect(altInput).toHaveValue(altText);
  return uploaded.url;
}

async function completePagePublicationMediaThroughUi(
  page: Page,
  assetUrls: string[],
  authorizationPrefix: string,
) {
  expect(assetUrls.length, "正式发布页面必须至少包含一项已上传公开素材").toBeGreaterThan(0);
  await page.getByRole("button", { name: /^更多编辑操作/ }).click();
  await page.getByRole("menuitem", { name: /页面设置$/ }).click();
  const settings = page.getByRole("dialog", { name: "页面展示设置", exact: true });
  const ogImage = settings.locator('[data-page-settings-field="ogImage"]');
  await ogImage.getByRole("button", { name: "或粘贴图片链接", exact: true }).click();
  await ogImage.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片")
    .fill(assetUrls[0]);
  await ogImage.getByRole("button", { name: /确\s*认/ }).click();

  const rights = settings.getByRole("region", { name: "媒体来源与授权", exact: true });
  await expect(rights).toContainText(`${assetUrls.length} 项当前公开素材`);
  const items = rights.getByTestId("page-media-right");
  await expect(items).toHaveCount(assetUrls.length);
  for (const [index, assetUrl] of assetUrls.entries()) {
    const item = items.nth(index);
    await expect(item.locator("code"), `素材 ${index + 1} 必须对应真实上传地址`)
      .toHaveText(assetUrl);
    await item.getByRole("textbox", { name: `素材 ${index + 1} 来源`, exact: true })
      .fill("QA 自有测试素材");
    await item.getByRole("textbox", { name: `素材 ${index + 1} 授权编号`, exact: true })
      .fill(`${authorizationPrefix}-${String(index + 1).padStart(2, "0")}`);
  }

  const saveResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "PUT"
      && url.pathname === "/api/page-modules/document";
  });
  await settings.getByRole("button", { name: "保存整页草稿", exact: true }).click();
  expect((await saveResponse).ok()).toBe(true);
  await expect(settings).toBeHidden();
}

async function recoverTemplateCatalogAfterThrottle(page: Page) {
  const retryButton = page.getByRole("button", { name: "重新读取", exact: true });
  await page.waitForTimeout(1_000);
  for (let attempt = 0; attempt < 3 && await retryButton.isVisible(); attempt += 1) {
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/page-modules/dynamic-templates/catalog";
    });
    await retryButton.click();
    const response = await responsePromise;
    if (response.ok()) {
      await expect(retryButton).toHaveCount(0);
      return;
    }
    expect(response.status()).toBe(429);
    const retryAfterSeconds = Number.parseInt(response.headers()["retry-after"] ?? "1", 10);
    await page.waitForTimeout((Math.min(Math.max(retryAfterSeconds, 1), 59) * 1_000) + 250);
  }
  await expect(retryButton).toHaveCount(0);
}

async function readTemplateCatalogWithThrottleRetry<T>(page: Page): Promise<T> {
  const url = `${apiBaseUrl}/page-modules/dynamic-templates/catalog`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.request.get(url);
    if (response.ok()) return unwrap<T>(await response.json());
    expect(response.status(), `${response.status()} ${response.url()} 仅允许目录限流后重试`)
      .toBe(429);
    if (attempt === 2) break;
    const retryAfter = response.headers()["retry-after"] ?? "1";
    const numericSeconds = Number(retryAfter);
    const httpDateDelayMs = Date.parse(retryAfter) - Date.now();
    const retryAfterMs = Number.isFinite(numericSeconds)
      ? numericSeconds * 1_000
      : Number.isFinite(httpDateDelayMs)
        ? httpDateDelayMs
        : 1_000;
    await page.waitForTimeout(Math.min(Math.max(retryAfterMs, 1_000), 60_000) + 250);
  }
  throw new Error(`${url} 连续限流，目录读取未完成`);
}

async function createAndPublishFourThreeTemplateThroughUi(
  page: Page,
  templateName: string,
) {
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await recoverTemplateCatalogAfterThrottle(page);
  const designLibrary = page.locator('[data-unified-template-library="design"]');
  await expect(
    designLibrary.locator('[data-template-identity^="source:legacy_"]'),
    "模板设计目录不得暴露旧兼容来源；新建模板必须是唯一创建路径",
  ).toHaveCount(0);
  await expect(
    designLibrary.locator(
      '[data-template-catalog-card]:not([data-template-identity^="template:"])',
    ),
    "模板设计目录中的既有卡片必须全部来自 Repository",
  ).toHaveCount(0);
  await designLibrary.getByRole("button", { name: "新建模板", exact: true }).click();
  await openHistoricalTemplateFixture(page);
  await fillTemplateIdentity(
    page,
    templateName,
    "用于验证仅通过新建模板进入统一设计、保存、发布与页面使用流程",
  );
  await page.getByRole("button", { name: "预览模板", exact: true }).focus();
  await applyBasicSkeleton(page);
  await setOverlayLightNavigationCompatibilityThroughUi(page);

  const saveResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST"
      && url.pathname === "/api/page-modules/dynamic-templates";
  });
  await page.getByRole("button", { name: "保存模板", exact: true }).click();
  const saved = await responseData<{ templateId: string }>(await saveResponsePromise);
  await expect(page.getByText("模板草稿已保存，可继续设计或发布", { exact: true }))
    .toBeVisible();

  const { confirmAndWaitForSinglePublish, review } = await prepareTemplatePublishThroughProductionReviews(
    page,
    saved.templateId,
  );
  expect((await confirmAndWaitForSinglePublish()).ok()).toBe(true);
  await expect(page.getByText("模板 v1 已发布；目录已确认可用。已有页面继续锁定原版本。", { exact: true }))
    .toBeVisible();
  await review.getByRole("button", { name: "去页面装修使用", exact: true }).click();

  const pageCard = page.locator(
    `[data-unified-template-library="page"] [data-template-identity="template:${saved.templateId}"]`,
  );
  await expect(pageCard).toHaveCount(1);
  await expect(pageCard).toContainText("已发布 · v1");
  const published = await responseData<{
    definition: {
      nodes: Record<string, { nodeId: string; slotId?: string; type: string }>;
    };
  }>(await page.request.get(
    `${apiBaseUrl}/page-modules/dynamic-templates/published/${saved.templateId}/versions/1`,
  ));
  const nodes = Object.values(published.definition.nodes);
  const headingSlotId = nodes.find((node) => node.type === "HeadingSlot")?.slotId;
  const textSlotId = nodes.find((node) => node.type === "TextSlot")?.slotId;
  const imageSlotId = nodes.find((node) => node.type === "ImageSlot")?.slotId;
  if (!headingSlotId || !textSlotId || !imageSlotId) {
    throw new Error("新建 4:3 双图文模板缺少标题、正文或图片槽位");
  }
  return { templateId: saved.templateId, headingSlotId, textSlotId, imageSlotId };
}

async function setOverlayLightNavigationCompatibilityThroughUi(page: Page) {
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await page.locator(".template-editor__toolbar")
    .getByRole("button", { name: "更多模板操作", exact: true }).click();
  await page.getByRole("menuitem", { name: /模板资料与使用限制/ }).click();
  const overlayLightButton = inspector.getByRole("button", {
    name: "导航兼容模式：浅色覆盖",
    exact: true,
  });
  if (await overlayLightButton.getAttribute("aria-pressed") !== "true") {
    await overlayLightButton.click();
  }
  await expect(overlayLightButton).toHaveAttribute("aria-pressed", "true");
}

async function returnToPageWorkspaceAndOpenPublishedTemplate(
  page: Page,
  accessibleName: string,
) {
  let retryAfterSeconds = 60;
  const captureCatalogThrottle = (response: import("@playwright/test").Response) => {
    const url = new URL(response.url());
    if (
      response.status() === 429
      && url.pathname === "/api/page-modules/dynamic-templates/catalog"
    ) {
      const parsed = Number.parseInt(response.headers()["retry-after"] ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) retryAfterSeconds = parsed;
    }
  };
  page.on("response", captureCatalogThrottle);
  try {
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    const templateButton = page.getByRole("button", { name: accessibleName });
    try {
      await expect(templateButton).toBeVisible({ timeout: 5_000 });
    } catch {
      const retryButton = page.getByRole("button", { name: "重新读取" });
      await expect(page.getByRole("alert")).toContainText("目录刷新失败");
      await expect(retryButton).toBeVisible();
      await page.waitForTimeout((Math.min(retryAfterSeconds, 60) + 1) * 1_000);
      await retryButton.click();
      await expect(templateButton).toBeVisible({ timeout: 15_000 });
    }
    await templateButton.click();
  } finally {
    page.off("response", captureCatalogThrottle);
  }
}

async function dragPublishedTemplateIntoCanvas(
  page: Page,
  templateId: string,
  templateName: string,
) {
  const card = page.locator(
    `[data-unified-template-library="page"] [data-template-identity="template:${templateId}"]`,
  ).getByRole("button", { name: `预览${templateName}版本1`, exact: true });
  const canvas = page.locator(".homepage-editor__canvas-document");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeInViewport();
  await expect(card).toHaveAttribute("draggable", "true");
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
  await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "模板实例属性", exact: true }),
    "拖放完成后应选中新插入的模板实例，并显示其可编辑内容",
  ).toContainText(templateName);
}

async function design1920By240Template(page: Page, templateName: string) {
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const structure = page.getByRole("complementary", { name: "模板结构" });
  const palette = page.getByRole("dialog", { name: "添加槽位", exact: true });
  const closeSlotPalette = async () => {
    if (!(await palette.isVisible())) return;
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  };
  const addSlot = async (label: "图片槽位" | "标题槽位" | "正文槽位" | "按钮槽位") => {
    if (!(await palette.isVisible())) {
      await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    }
    const addButton = palette.getByRole("button", { name: `添加${label}`, exact: true });
    await expect(addButton).toBeEnabled();
    await addButton.click();
    await expect(inspector.getByRole("textbox", { name: "节点名称", exact: true }))
      .toHaveValue(new RegExp(`^${label}(?: \\d+)?$`));
  };
  await fillTemplateIdentity(
    page,
    templateName,
    "用于验证 1920×240 母模板、页面实例和版本锁定闭环",
  );
  await setOverlayLightNavigationCompatibilityThroughUi(page);

  await page.getByRole("button", { name: /^模板尺寸：/ }).click();
  const sizeControls = page.getByRole("group", { name: "模板整体尺寸" });
  await expect(sizeControls).toBeVisible();
  await sizeControls.getByRole("combobox", { name: "模板高度模式" }).selectOption("fixed");
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).fill("240");
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).press("Enter");
  await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" })).toHaveValue("1920");
  await expect(page.getByRole("button", { name: /^模板尺寸：/ })).toContainText("1920 × 240");

  await inspector.getByRole("button", { name: "容器布局：分列排列", exact: true }).click();
  await inspector.getByRole("button", { name: "容器列宽：2:3", exact: true }).click();
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).fill("12");
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).press("Enter");
  await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();

  await structure.getByRole("button", { name: /添加区域/ }).click();
  await inspector.getByRole("textbox", { name: "节点名称" }).fill("文字区");
  await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  const gapInput = inspector.getByRole("spinbutton", { name: "槽位间距", exact: true });
  const initialGap = await gapInput.inputValue();
  await gapInput.fill("4");
  await gapInput.press("Enter");
  await expect(gapInput).toHaveValue("4");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(gapInput).toHaveValue(initialGap);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(gapInput).toHaveValue("4");
  await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();

  await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
  await page.getByRole("dialog", { name: "添加槽位", exact: true })
    .getByRole("button", { name: "添加上下排列布局分组", exact: true })
    .click();
  const textGroupGap = inspector.getByRole("spinbutton", { name: "槽位间距", exact: true });
  await textGroupGap.fill("4");
  await textGroupGap.press("Enter");
  await expect(textGroupGap).toHaveValue("4");

  await addSlot("标题槽位");
  await inspector.getByRole("spinbutton", { name: "槽位字号", exact: true }).fill("28");
  await inspector.getByRole("spinbutton", { name: "槽位字号", exact: true }).press("Enter");
  await addSlot("正文槽位");
  await addSlot("按钮槽位");
  await closeSlotPalette();

  await structure.getByRole("button", { name: /添加区域/ }).click();
  await page.getByRole("dialog", { name: "添加区域", exact: true })
    .getByRole("button", { name: "确认添加区域", exact: true })
    .click();
  await inspector.getByRole("textbox", { name: "节点名称" }).fill("图片区");
  await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();
  await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
  await page.getByRole("dialog", { name: "添加槽位", exact: true })
    .getByRole("button", { name: "添加上下排列布局分组", exact: true })
    .click();
  await addSlot("图片槽位");
  await inspector.getByRole("combobox", { name: "槽位高度方式" }).selectOption("fixed");
  await inspector.getByRole("spinbutton", { name: "槽位高度", exact: true }).fill("180");
  await inspector.getByRole("spinbutton", { name: "槽位高度", exact: true }).press("Enter");
  await inspector.getByRole("button", { name: "裁切填满", exact: true }).click();
  await closeSlotPalette();

  return { inspector, structure, sizeControls };
}

interface AcceptanceTemplateBlueprint {
  name: string;
  width: number;
  height: number;
  mobileHeight: number;
  imageFirst: boolean;
  dualColumn: boolean;
  textSlots: string[];
  imageRatio: "1:1" | "4:3" | "16:9" | "9:16";
  headingSize: number;
}

const ACCEPTANCE_TEMPLATE_BLUEPRINTS: AcceptanceTemplateBlueprint[] = [
  {
    name: "01 方形作品入口",
    width: 1080,
    height: 1080,
    mobileHeight: 488,
    imageFirst: false,
    dualColumn: false,
    textSlots: ["系列标识", "副标题", "作品说明", "辅助信息"],
    imageRatio: "1:1",
    headingSize: 48,
  },
  {
    name: "02 纵版作品海报",
    width: 1080,
    height: 1350,
    mobileHeight: 585,
    imageFirst: true,
    dualColumn: false,
    textSlots: ["分类标签", "作品说明", "系列署名"],
    imageRatio: "4:3",
    headingSize: 56,
  },
  {
    name: "03 移动沉浸品牌故事",
    width: 1080,
    height: 1920,
    mobileHeight: 693,
    imageFirst: true,
    dualColumn: false,
    textSlots: ["叙事眉题", "副标题", "日期或章节"],
    imageRatio: "9:16",
    headingSize: 72,
  },
  {
    name: "04 横向工艺专题",
    width: 1200,
    height: 627,
    mobileHeight: 520,
    imageFirst: false,
    dualColumn: true,
    textSlots: ["专题眉题", "专题摘要"],
    imageRatio: "4:3",
    headingSize: 50,
  },
  {
    name: "05 系列主视觉 Hero",
    width: 1920,
    height: 1080,
    mobileHeight: 693,
    imageFirst: false,
    dualColumn: true,
    textSlots: ["系列标识", "小标签", "主视觉说明"],
    imageRatio: "4:3",
    headingSize: 82,
  },
];

async function designAcceptanceTemplate(
  page: Page,
  blueprint: AcceptanceTemplateBlueprint,
) {
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const structure = page.getByRole("complementary", { name: "模板结构", exact: true });
  const palette = page.getByRole("dialog", { name: "添加槽位", exact: true });
  const closeSlotPalette = async () => {
    if (!(await palette.isVisible())) return;
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  };
  const addSlot = async (
    type: "图片槽位" | "标题槽位" | "正文槽位" | "按钮槽位",
    label: string,
  ) => {
    if (!(await palette.isVisible())) {
      await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    }
    const addButton = palette.getByRole("button", { name: `添加${type}`, exact: true });
    await expect(addButton).toBeEnabled();
    await addButton.click();
    const name = inspector.getByRole("textbox", { name: "节点名称", exact: true });
    await expect(name).toHaveValue(new RegExp(`^${type}(?: \\d+)?$`));
    await name.fill(label);
    await name.press("Tab");
  };
  const addTextRegionContent = async () => {
    if (blueprint.textSlots[0]) await addSlot("正文槽位", blueprint.textSlots[0]);
    await addSlot("标题槽位", "主标题");
    await inspector.getByRole("spinbutton", { name: "槽位字号", exact: true })
      .fill(String(blueprint.headingSize));
    await inspector.getByRole("spinbutton", { name: "槽位字号", exact: true }).press("Enter");
    for (const label of blueprint.textSlots.slice(1)) {
      await addSlot("正文槽位", label);
    }
    await addSlot("按钮槽位", "行动入口");
  };
  const addImage = async () => {
    await addSlot("图片槽位", "主视觉图片");
    const ratio = inspector.getByRole("combobox", { name: "图片槽位比例" });
    await ratio.selectOption(blueprint.imageRatio);
    await inspector.getByRole("button", { name: "裁切填满", exact: true }).click();
    if (blueprint.imageRatio === "1:1" || blueprint.imageRatio === "9:16") {
      await inspector.getByRole("combobox", { name: "槽位宽度方式" }).selectOption("px");
      const imageWidth = blueprint.imageRatio === "9:16" ? 520 : 500;
      await inspector.getByRole("spinbutton", { name: "槽位宽度" }).fill(String(imageWidth));
      await inspector.getByRole("spinbutton", { name: "槽位宽度" }).press("Enter");
    }
  };

  await fillTemplateIdentity(
    page,
    blueprint.name,
    `用于验证${blueprint.name}的桌面、移动与公开页面构图`,
  );
  const desktop = page.getByRole("button", { name: /^桌面端模板布局/ });
  if ((await desktop.getAttribute("aria-pressed")) !== "true") {
    await desktop.click();
  }
  await expect(desktop).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^模板尺寸：/ }).click();
  const sizeControls = page.getByRole("group", { name: "模板整体尺寸" });
  await sizeControls.getByRole("spinbutton", { name: "设计宽度" }).fill(String(blueprint.width));
  await sizeControls.getByRole("spinbutton", { name: "设计宽度" }).press("Enter");
  await sizeControls.getByRole("combobox", { name: "模板高度模式" }).selectOption("fixed");
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).fill(String(blueprint.height));
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).press("Enter");

  if (blueprint.dualColumn) {
    await inspector.getByRole("button", { name: "容器布局：分列排列", exact: true }).click();
    await inspector.getByRole("button", { name: "容器列宽：2:3", exact: true }).click();
  } else {
    await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  }
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).fill(blueprint.dualColumn ? "48" : "0");
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).press("Enter");
  await inspector.getByRole("button", { name: blueprint.width >= 1200 ? "容器留白：宽松" : "容器留白：标准", exact: true }).click();

  await structure.getByRole("button", { name: "添加区域", exact: true }).click();
  await inspector.getByRole("textbox", { name: "节点名称", exact: true })
    .fill(blueprint.dualColumn ? "文案区域" : "内容区域");
  await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).fill(blueprint.dualColumn ? "16" : "12");
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).press("Enter");
  await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();
  await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
  await page.getByRole("dialog", { name: "添加槽位", exact: true })
    .getByRole("button", { name: "添加上下排列布局分组", exact: true })
    .click();

  if (!blueprint.dualColumn && blueprint.imageFirst) await addImage();
  await addTextRegionContent();
  if (!blueprint.dualColumn && !blueprint.imageFirst) await addImage();

  if (blueprint.dualColumn) {
    await closeSlotPalette();
    await structure.getByRole("button", { name: "添加区域", exact: true }).click();
    await page.getByRole("dialog", { name: "添加区域", exact: true })
      .getByRole("button", { name: "确认添加区域", exact: true })
      .click();
    await inspector.getByRole("textbox", { name: "节点名称", exact: true }).fill("媒体区域");
    await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
    await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();
    await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    await page.getByRole("dialog", { name: "添加槽位", exact: true })
      .getByRole("button", { name: "添加上下排列布局分组", exact: true })
      .click();
    await addImage();
  }
  await closeSlotPalette();

  await page.getByRole("button", { name: /^移动端模板布局/ }).click();
  await page.getByRole("button", { name: /^模板尺寸：/ }).click();
  await sizeControls.getByRole("spinbutton", { name: "设计宽度" }).fill("390");
  await sizeControls.getByRole("spinbutton", { name: "设计宽度" }).press("Enter");
  await sizeControls.getByRole("combobox", { name: "模板高度模式" }).selectOption("fixed");
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).fill(String(blueprint.mobileHeight));
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).press("Enter");
  const mobileRootTarget = page.getByRole("button", {
    name: "选择模板目标 模板根节点",
    exact: true,
  });
  await mobileRootTarget.focus();
  await mobileRootTarget.press("Enter");
  await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  await page.getByRole("button", { name: "选择模板目标 主视觉图片", exact: true }).click();
  await inspector.getByRole("combobox", { name: "槽位宽度方式" }).selectOption("px");
  const mobileImageWidth = blueprint.imageRatio === "9:16" ? 240 : blueprint.imageRatio === "1:1" ? 220 : 300;
  await inspector.getByRole("spinbutton", { name: "槽位宽度" }).fill(String(mobileImageWidth));
  await inspector.getByRole("spinbutton", { name: "槽位宽度" }).press("Enter");
  await page.getByRole("button", { name: /^桌面端模板布局/ }).click();

  return { inspector, structure, sizeControls };
}

test.describe("店铺装修真实浏览器闭环（一次性 MySQL + 真实 NestJS API）", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !exactQaTarget,
    "仅在显式 PAGE_BUILDER_REAL_QA=true 且使用 127.0.0.1:3101/5175 一次性环境时运行",
  );

  test("拖入模板、编辑、保存、刷新、预览、发布，并保持未发布草稿与公开快照隔离", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const pageKey = "products";
    const templateName = "真实页面闭环 4:3 模板";
    const publishedTitle = "真实浏览器闭环页面";
    const draftOnlyTitle = "仅存在于未发布草稿";
    const metadata = {
      seoTitle: "真实浏览器闭环 | 海川珠宝",
      seoDescription: "验证店铺装修从页面编辑到公开 Renderer 的真实保存与发布链路。",
      ogImage: "",
      contentOwner: "店铺装修 QA",
      mediaRights: [],
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAndPrepareIsolatedQaSite(page);

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
    const createdTemplate = await createAndPublishFourThreeTemplateThroughUi(
      page,
      templateName,
    );
    await dragPublishedTemplateIntoCanvas(
      page,
      createdTemplate.templateId,
      templateName,
    );

    const inspector = page.getByRole("region", { name: "模板实例属性", exact: true });
    const titleInput = inspector.getByRole("textbox", {
      name: "标题槽位",
      exact: true,
    });
    const bodyInput = inspector.getByRole("textbox", {
      name: "正文槽位",
      exact: true,
    });
    await titleInput.fill(publishedTitle);
    await expect(titleInput).toHaveValue(publishedTitle);
    await bodyInput.fill("页面内容通过真实属性面板写入，并由同一公开 Renderer 展示。");
    await expect(titleInput).toHaveValue(publishedTitle);
    const uploadedImageUrl = await uploadTemplateInstanceImage(
      page,
      inspector.locator(`[data-slot-id="${createdTemplate.imageSlotId}"]`),
      "珠宝双图文闭环测试图片",
    );

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(page.getByText("当前画布预览 · 1920 × 1200")).toBeVisible();
    await expect(
      page.frameLocator(".homepage-editor__canvas-scale iframe").getByText(publishedTitle),
    ).toBeVisible();
    await page.getByRole("button", { name: "退出当前画布预览" }).click();

    await completePagePublicationMediaThroughUi(
      page,
      [uploadedImageUrl],
      "QA-REAL-CLOSURE",
    );

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await expect(
      inspector.getByRole("textbox", { name: "标题槽位", exact: true }),
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
    const publishResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document/publish";
    });
    await publishButton.click();
    expect((await publishResponse).ok()).toBe(true);

    const anonymous = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      extraHTTPHeaders: forwardedProtoHeaders,
    });
    const publicPage = await anonymous.newPage();
    const publicApi = await responseData<{
      version: number;
      puckData: {
        content: Array<{
          props?: { contentBySlotId?: Record<string, unknown> };
        }>;
      };
    }>(await anonymous.request.get(
      `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(publicApi.version).toBe(expectedPublishedVersion);
    expect(publicApi.puckData.content[0]?.props?.contentBySlotId?.[
      createdTemplate.headingSlotId
    ]).toBe(publishedTitle);

    await publicPage.goto(`${browserBaseUrl}/products`);
    await expect(publicPage.getByText(publishedTitle)).toBeVisible();
    const publicRenderer = publicPage.locator(
      `.hc-dynamic-template[data-dynamic-template-id="${createdTemplate.templateId}"]`,
    );
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
    await expect(publicRenderer).toHaveAttribute("data-dynamic-template-device", "mobile");
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
      puckData: {
        content: Array<{
          props?: { contentBySlotId?: Record<string, unknown> };
        }>;
      };
    }>(await anonymous.request.get(
      `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(publishedAfterDraft.version).toBe(expectedPublishedVersion);
    expect(publishedAfterDraft.puckData.content[0]?.props?.contentBySlotId?.[
      createdTemplate.headingSlotId
    ]).toBe(publishedTitle);

    await anonymous.close();
  });

  test("真实网站从零创建并往返加载五种画布模板", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loginAndPrepareIsolatedQaSite(page);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();

    const created: Array<{ templateId: string; blueprint: AcceptanceTemplateBlueprint }> = [];
    for (const blueprint of ACCEPTANCE_TEMPLATE_BLUEPRINTS) {
      await page.getByRole("button", { name: "新建模板", exact: true }).click();
  await openHistoricalTemplateFixture(page);
      const { sizeControls } = await designAcceptanceTemplate(page, blueprint);
      await page.screenshot({
        path: testInfo.outputPath(`${blueprint.name.replace(/\s+/g, "-")}-editor.png`),
        fullPage: true,
      });

      const createResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST"
          && url.pathname === "/api/page-modules/dynamic-templates";
      });
      await page.getByRole("button", { name: "保存模板", exact: true }).click();
      const record = await responseData<{ templateId: string }>(await createResponsePromise);
      created.push({ templateId: record.templateId, blueprint });
      await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

      await page.reload();
      await page.getByRole("button", { name: "模板设计", exact: true }).click();
      await recoverTemplateCatalogAfterThrottle(page);
      await page.getByRole("textbox", { name: "搜索模板", exact: true }).fill(blueprint.name);
      await page.getByRole("button", {
        name: new RegExp(`(?:打开|正在编辑)${blueprint.name}模板`),
      }).click();
      await page.getByRole("button", { name: /^模板尺寸：/ }).click();
      await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" }))
        .toHaveValue(String(blueprint.width));
      await expect(sizeControls.getByRole("spinbutton", { name: "模板固定高度" }))
        .toHaveValue(String(blueprint.height));

      const { confirmPublish, review } = await prepareTemplatePublishThroughProductionReviews(
        page,
        record.templateId,
      );
      const publishResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST"
          && url.pathname === `/api/page-modules/dynamic-templates/${record.templateId}/publish`;
      });
      await confirmPublish.click();
      expect((await publishResponsePromise).ok()).toBe(true);
      await expect(page.getByText("模板 v1 已发布；目录已确认可用。已有页面继续锁定原版本。", { exact: true })).toBeVisible();
      await review.getByRole("button", { name: "继续设计", exact: true }).click();

      const published = await responseData<{
        definition: {
          metadata: { previewDesktopWidth: number; previewMobileWidth: number };
          rootNodeId: string;
          nodes: Record<string, {
            type: string;
            childIds: string[];
            responsive: {
              desktop: { height: { mode: string; value?: { value: number } } };
              mobile: { height: { mode: string; value?: { value: number } } };
            };
          }>;
          slots: Record<string, { type: string; desktopRules: { objectFit?: string } }>;
          defaultContent: Record<string, unknown>;
          previewContent: Record<string, unknown>;
        };
      }>(await page.request.get(
        `${apiBaseUrl}/page-modules/dynamic-templates/published/${record.templateId}/versions/1`,
      ));
      const definition = published.definition;
      const root = definition.nodes[definition.rootNodeId];
      expect(definition.metadata.previewDesktopWidth).toBe(blueprint.width);
      expect(definition.metadata.previewMobileWidth).toBe(390);
      expect(root.responsive.desktop.height.value?.value).toBe(blueprint.height);
      expect(root.responsive.mobile.height.value?.value).toBe(blueprint.mobileHeight);
      expect(Object.values(definition.slots).filter((slot) => slot.type === "image")).toHaveLength(1);
      expect(Object.values(definition.slots).filter((slot) => slot.type === "heading")).toHaveLength(1);
      expect(Object.values(definition.slots).filter((slot) => slot.type === "button")).toHaveLength(1);
      expect(Object.values(definition.slots).find((slot) => slot.type === "image")?.desktopRules.objectFit)
        .toBe("cover");
      expect(root.childIds).toHaveLength(blueprint.dualColumn ? 2 : 1);
      expect(definition.defaultContent).toEqual({});
      expect(definition.previewContent).toEqual({});
    }

    const catalog = await readTemplateCatalogWithThrottleRetry<{
      items: Array<{ kind: string; template: { templateId?: string; version?: number } }>;
    }>(page);
    for (const { templateId } of created) {
      expect(catalog.items.some((item) => (
        item.kind === "published"
        && item.template.templateId === templateId
        && item.template.version === 1
      ))).toBe(true);
    }

    for (const viewport of [
      { width: 1600, height: 1000 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )).toBe(true);
    }
  });

  test("历史 4:3 双图文模板保持真实保存发布及双端公开构图", async ({
    browser,
    page,
  }) => {
    test.setTimeout(300_000);
    const pageKey = "products";
    const templateName = "真实闭环 4:3 双图文模板";

    await page.setViewportSize({ width: 1600, height: 1000 });
    await loginAndPrepareIsolatedQaSite(page);
    const currentDraft = await responseData<{ updatedAt: string } | null>(
      await page.request.get(`${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`),
    );
    await browserWrite(page, "/page-modules/document", {
      pageKey,
      puckData: { content: [], zones: {}, root: { props: {} } },
      metadata: {
        seoTitle: "4:3 双图文真实闭环 | 海川珠宝",
        seoDescription: "验证历史双图文模板保存发布到公开 Renderer。",
        ogImage: "",
        contentOwner: "模板设计 QA",
        mediaRights: [],
      },
      editorVersion: "0.22.4",
      ...(currentDraft ? { expectedUpdatedAt: currentDraft.updatedAt } : {}),
    });

    await page.goto(`/admin/editor/${pageKey}`);
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
  await openHistoricalTemplateFixture(page);
    await fillTemplateIdentity(
      page,
      templateName,
      "用于验证双图片与文字内容在桌面左右、移动上下的公开构图",
    );
    await page.getByRole("button", { name: "预览模板", exact: true }).focus();
  await applyBasicSkeleton(page);
    await setOverlayLightNavigationCompatibilityThroughUi(page);

    const tree = page.getByRole("tree", { name: "模板区域与槽位", exact: true });
    for (const label of [
      "内容区域 1",
      "双图文布局",
      "图片组",
      "图片槽位 1",
      "图片槽位 2",
      "文字组",
      "标题槽位",
      "正文槽位",
    ]) {
      await expect(tree.getByRole("treeitem", { name: new RegExp(label) })).toBeVisible();
    }

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === "/api/page-modules/dynamic-templates";
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const created = await responseData<{ templateId: string }>(await createResponsePromise);
    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await recoverTemplateCatalogAfterThrottle(page);
    const designLibrary = page.locator('[data-unified-template-library="design"]');
    const sameTemplateIdentity = `template:${created.templateId}`;
    const sourceLevelWords = /内置模板|系统模板|系统必填内容|动态模板|个人模板|自定义模板/;
    const legacyTemplateActions = /另存副本|另存为模板|导入|转换为新版|基于此模板创建/;
    const savedTemplateCard = designLibrary.locator(
      `[data-template-catalog-card][data-template-identity="${sameTemplateIdentity}"]`,
    );
    await expect(savedTemplateCard, "保存并重新载入后必须打开同一个 Repository 模板身份")
      .toHaveCount(1);
    await savedTemplateCard.locator(".homepage-editor__template-card-main").click();
    await expect(tree.getByRole("treeitem", { name: /图片槽位 2/ })).toBeVisible();

    const { confirmAndWaitForSinglePublish, review } = await prepareTemplatePublishThroughProductionReviews(
      page,
      created.templateId,
    );
    expect((await confirmAndWaitForSinglePublish()).ok()).toBe(true);
    await review.getByRole("button", { name: "继续设计", exact: true }).click();

    const sameTemplateCard = designLibrary.locator(
      `[data-template-catalog-card][data-template-identity="${sameTemplateIdentity}"]`,
    );
    await expect(sameTemplateCard, "正式发布后目录必须保留同一个 Repository 模板身份")
      .toHaveCount(1);
    await expect(sameTemplateCard).toContainText(templateName);
    await expect(sameTemplateCard.locator('[data-template-publication-status="published-current"]'))
      .toHaveCount(1);
    await expect(designLibrary).not.toContainText(sourceLevelWords);
    await expect(sameTemplateCard).not.toContainText(sourceLevelWords);
    await expect(designLibrary.getByRole("button", { name: legacyTemplateActions }))
      .toHaveCount(0);
    const sameTemplateCardMain = sameTemplateCard.locator(".homepage-editor__template-card-main");
    await expect(sameTemplateCardMain).toHaveAttribute(
      "aria-label",
      new RegExp(`^(?:打开|正在编辑)${templateName}，状态：已发布$`),
    );
    await sameTemplateCardMain.click();
    await expect(tree.getByRole("treeitem", { name: /图片槽位 1/ })).toBeVisible();
    await expect(tree.getByRole("treeitem", { name: /图片槽位 2/ })).toBeVisible();

    await sameTemplateCard.getByRole("button", {
      name: `更多模板操作：${templateName}`,
      exact: true,
    }).click();
    await expect(page.getByRole("menuitem", { name: /打开编辑$/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: legacyTemplateActions })).toHaveCount(0);
    await page.getByRole("menuitem", { name: /移入回收站$/ }).click();
    const archiveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${created.templateId}/archive`;
    });
    const archiveDialog = page.getByRole("dialog", {
      name: `将模板“${templateName}”移入回收站？`,
      exact: true,
    });
    await archiveDialog.getByRole("button", { name: "移入回收站", exact: true }).click();
    expect((await archiveResponsePromise).ok()).toBe(true);
    await expect(archiveDialog).toBeHidden();
    await expect(sameTemplateCard).toHaveCount(0);

    await designLibrary.getByRole("button", { name: "打开模板回收站", exact: true }).click();
    const trashedSameTemplateCard = designLibrary.locator(
      `[data-template-catalog-card][data-template-identity="${sameTemplateIdentity}"]`,
    );
    await expect(trashedSameTemplateCard, "回收站必须继续使用原 Repository 模板身份")
      .toHaveCount(1);
    await expect(trashedSameTemplateCard).toContainText(templateName);
    await expect(trashedSameTemplateCard.locator('[data-template-publication-status="archived"]'))
      .toHaveCount(1);
    await expect(trashedSameTemplateCard).not.toContainText(sourceLevelWords);
    await trashedSameTemplateCard.getByRole("button", {
      name: `更多模板操作：${templateName}`,
      exact: true,
    }).click();
    await expect(page.getByRole("menuitem", { name: /恢复模板$/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: legacyTemplateActions })).toHaveCount(0);
    await page.getByRole("menuitem", { name: /恢复模板$/ }).click();
    const restoreResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${created.templateId}/restore`;
    });
    const restoreDialog = page.getByRole("dialog", {
      name: `恢复模板“${templateName}”？`,
      exact: true,
    });
    await restoreDialog.getByRole("button", { name: "恢复模板", exact: true }).click();
    expect((await restoreResponsePromise).ok()).toBe(true);
    await expect(restoreDialog).toBeHidden();
    await expect(trashedSameTemplateCard).toHaveCount(0);

    await page.getByRole("button", { name: "返回模板库", exact: true }).click();
    const restoredSameTemplateCard = designLibrary.locator(
      `[data-template-catalog-card][data-template-identity="${sameTemplateIdentity}"]`,
    );
    await expect(restoredSameTemplateCard, "恢复后目录必须回到原 Repository 模板身份")
      .toHaveCount(1);
    await expect(restoredSameTemplateCard).toContainText(templateName);
    await expect(restoredSameTemplateCard.locator(
      '[data-template-publication-status="published-current"]',
    )).toHaveCount(1);
    await expect(restoredSameTemplateCard).not.toContainText(sourceLevelWords);
    await restoredSameTemplateCard.locator(".homepage-editor__template-card-main").click();
    await expect(tree.getByRole("treeitem", { name: /图片槽位 1/ })).toBeVisible();
    await expect(tree.getByRole("treeitem", { name: /图片槽位 2/ })).toBeVisible();

    const published = await responseData<{
      definition: {
        rootNodeId: string;
        nodes: Record<string, {
          childIds: string[];
          name: string;
          nodeId: string;
          slotId?: string;
          type: string;
          responsive: {
            desktop: { direction?: string };
            mobile: { direction?: string };
          };
        }>;
        slots: Record<string, {
          desktopRules: { aspectRatio?: string };
          key: string;
          label: string;
          mobileRules: { aspectRatio?: string };
          slotId: string;
          type: string;
        }>;
      };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/dynamic-templates/published/${created.templateId}/versions/1`,
    ));
    const definition = published.definition;
    const [regionId] = definition.nodes[definition.rootNodeId].childIds;
    const [compositionId] = definition.nodes[regionId].childIds;
    const [imageGroupId, textGroupId] = definition.nodes[compositionId].childIds;
    const imageNodeIds = definition.nodes[imageGroupId].childIds;
    const textNodeIds = definition.nodes[textGroupId].childIds;
    expect(definition.nodes[definition.rootNodeId].childIds).toHaveLength(1);
    expect(definition.nodes[definition.rootNodeId].type).toBe("Section");
    expect(definition.nodes[regionId].name).toBe("内容区域 1");
    expect(definition.nodes[regionId].type).toBe("Container");
    expect(definition.nodes[compositionId].name).toBe("双图文布局");
    expect(definition.nodes[compositionId].type).toBe("Row");
    expect(definition.nodes[compositionId].responsive.desktop.direction).toBe("row");
    expect(definition.nodes[compositionId].responsive.mobile.direction).toBe("column");
    expect(definition.nodes[imageGroupId].name).toBe("图片组");
    expect(definition.nodes[imageGroupId].type).toBe("Column");
    expect(definition.nodes[textGroupId].name).toBe("文字组");
    expect(definition.nodes[textGroupId].type).toBe("Column");
    expect(imageNodeIds.map((nodeId) => definition.nodes[nodeId].type))
      .toEqual(["ImageSlot", "ImageSlot"]);
    expect(textNodeIds.map((nodeId) => definition.nodes[nodeId].type))
      .toEqual(["HeadingSlot", "TextSlot"]);
    expect(Object.values(definition.slots)).toHaveLength(4);
    expect([...imageNodeIds, ...textNodeIds].map((nodeId) => {
      const node = definition.nodes[nodeId];
      const slot = definition.slots[node.slotId!];
      return {
        key: slot.key,
        label: slot.label,
        nodeName: node.name,
        nodeType: node.type,
        slotType: slot.type,
      };
    })).toEqual([
      {
        key: "image",
        label: "图片槽位 1",
        nodeName: "图片槽位 1",
        nodeType: "ImageSlot",
        slotType: "image",
      },
      {
        key: "image2",
        label: "图片槽位 2",
        nodeName: "图片槽位 2",
        nodeType: "ImageSlot",
        slotType: "image",
      },
      {
        key: "heading",
        label: "标题槽位",
        nodeName: "标题槽位",
        nodeType: "HeadingSlot",
        slotType: "heading",
      },
      {
        key: "text",
        label: "正文槽位",
        nodeName: "正文槽位",
        nodeType: "TextSlot",
        slotType: "text",
      },
    ]);
    for (const nodeId of imageNodeIds) {
      const slot = definition.slots[definition.nodes[nodeId].slotId!];
      expect(slot.desktopRules.aspectRatio).toBe("4:3");
      expect(slot.mobileRules.aspectRatio).toBe("4:3");
    }

    await returnToPageWorkspaceAndOpenPublishedTemplate(
      page,
      `添加到页面：${templateName} v1`,
    );
    const instanceInspector = page.getByRole("region", { name: "模板实例属性" });
    await instanceInspector.getByRole("textbox", { name: "标题槽位", exact: true })
      .fill("双图文系列标题");
    await instanceInspector.getByRole("textbox", { name: "正文槽位", exact: true })
      .fill("两幅珠宝图片与文字共同组成同一内容区域。");
    const uploadedImageUrls: string[] = [];
    const uploadedImageAltTexts: string[] = [];
    for (const [index, nodeId] of imageNodeIds.entries()) {
      const slotId = definition.nodes[nodeId].slotId!;
      const altText = `双图文珠宝图片 ${index + 1}`;
      uploadedImageAltTexts.push(altText);
      uploadedImageUrls.push(await uploadTemplateInstanceImage(
        page,
        instanceInspector.locator(`[data-slot-id="${slotId}"]`),
        altText,
      ));
    }
    const previewFrame = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const previewRenderer = previewFrame.locator(
      `.hc-dynamic-template[data-dynamic-template-id="${created.templateId}"]`,
    );
    const previewComposition = previewFrame.locator(
      `[data-template-node-id="${compositionId}"]`,
    );
    const previewImageGroup = previewFrame.locator(
      `[data-template-node-id="${imageGroupId}"]`,
    );
    for (const preview of [
      {
        buttonName: "桌面端布局（1920 × 1200）",
        device: "desktop",
        direction: "row",
        viewportLabel: "1920 × 1200",
      },
      {
        buttonName: "移动端布局（390 × 844）",
        device: "mobile",
        direction: "column",
        viewportLabel: "390 × 844",
      },
    ] as const) {
      const deviceButton = page.getByRole("button", {
        name: preview.buttonName,
        exact: true,
      });
      await deviceButton.click();
      await expect(deviceButton).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "预览当前画布", exact: true }).click();
      await expect(page.getByText(
        `当前画布预览 · ${preview.viewportLabel}`,
        { exact: true },
      )).toBeVisible();
      await expect(previewRenderer).toHaveAttribute(
        "data-dynamic-template-device",
        preview.device,
      );
      await expect(previewComposition).toHaveCSS("flex-direction", preview.direction);
      await expect(previewImageGroup).toHaveCSS("flex-direction", preview.direction);
      await expect(previewFrame.getByText("双图文系列标题", { exact: true })).toBeVisible();
      for (const altText of uploadedImageAltTexts) {
        await expect(previewFrame.getByRole("img", { name: altText, exact: true }))
          .toBeVisible();
      }
      await page.getByRole("button", { name: "退出当前画布预览", exact: true }).click();
    }
    await completePagePublicationMediaThroughUi(
      page,
      uploadedImageUrls,
      "QA-FOUR-THREE",
    );
    const publishPageResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document/publish";
    });
    const publishPage = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishPage).toBeEnabled({ timeout: 15_000 });
    await publishPage.click();
    expect((await publishPageResponse).ok()).toBe(true);

    const anonymous = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      extraHTTPHeaders: forwardedProtoHeaders,
    });
    const publicPage = await anonymous.newPage();
    await publicPage.goto(`${browserBaseUrl}/products`);
    const publicInstance = publicPage.locator('[data-dynamic-template-version="1"]')
      .filter({ has: publicPage.locator(`[data-dynamic-template-id="${created.templateId}"]`) })
      .filter({ hasText: "双图文系列标题" })
      .first();
    await expect(publicInstance).toBeVisible();
    await expect(publicInstance).toHaveAttribute("data-dynamic-template-render-mode", "public");
    const publicRenderer = publicInstance.locator(
      `.hc-dynamic-template[data-dynamic-template-id="${created.templateId}"]`,
    );
    await expect(publicRenderer).toHaveAttribute(
      "data-template-composition-authority",
      "template-definition-v2",
    );
    await expect(publicRenderer).toHaveAttribute("data-dynamic-template-device", "desktop");
    await expect(publicRenderer).toHaveAttribute("data-template-root-height-mode", "aspect-ratio");
    await expect(publicRenderer).toHaveAttribute("data-template-root-height-ratio", "4:3");
    const publicRoot = publicInstance.locator(
      `[data-template-node-id="${definition.rootNodeId}"]`,
    );
    const publicComposition = publicInstance.locator(`[data-template-node-id="${compositionId}"]`);
    const publicImageGroup = publicInstance.locator(`[data-template-node-id="${imageGroupId}"]`);
    const publicTextGroup = publicInstance.locator(`[data-template-node-id="${textGroupId}"]`);
    await expect(publicComposition).toBeVisible();
    expect(await publicRoot.locator(":scope > [data-template-node-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id"))))
      .toEqual([regionId]);
    const publicRegion = publicInstance.locator(`[data-template-node-id="${regionId}"]`);
    expect(await publicRegion.locator(":scope > [data-template-node-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id"))))
      .toEqual([compositionId]);
    await expect(publicComposition).toHaveCSS("flex-direction", "row");
    await expect(publicImageGroup).toHaveCSS("flex-direction", "row");
    expect(await publicComposition.locator(":scope > [data-template-node-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id"))))
      .toEqual([imageGroupId, textGroupId]);
    const publicImages = publicImageGroup.locator(
      ':scope > [data-template-node-type="ImageSlot"]',
    );
    await expect(publicImages).toHaveCount(2);
    expect(await publicImageGroup.locator(":scope > [data-template-node-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id"))))
      .toEqual(imageNodeIds);
    expect(await publicTextGroup.locator(":scope > [data-template-node-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id"))))
      .toEqual(textNodeIds);
    await expect(publicTextGroup.locator(':scope > [data-template-node-type="HeadingSlot"]'))
      .toHaveCount(1);
    await expect(publicTextGroup.locator(':scope > [data-template-node-type="TextSlot"]'))
      .toHaveCount(1);
    for (const [index, altText] of uploadedImageAltTexts.entries()) {
      await expect(publicInstance.getByRole("img", { name: altText, exact: true }))
        .toHaveAttribute("src", uploadedImageUrls[index]);
    }
    expect(await publicImageGroup.evaluate((node) => (
      node.parentElement?.closest("[data-template-node-id]")?.getAttribute("data-template-node-id")
    ))).toBe(compositionId);
    expect(await publicTextGroup.evaluate((node) => (
      node.parentElement?.closest("[data-template-node-id]")?.getAttribute("data-template-node-id")
    ))).toBe(compositionId);
    const desktopImageBox = await publicImageGroup.boundingBox();
    const desktopTextBox = await publicTextGroup.boundingBox();
    const desktopRootBox = await publicRoot.boundingBox();
    const desktopFirstImageBox = await publicImages.nth(0).boundingBox();
    const desktopSecondImageBox = await publicImages.nth(1).boundingBox();
    if (
      !desktopImageBox
      || !desktopTextBox
      || !desktopRootBox
      || !desktopFirstImageBox
      || !desktopSecondImageBox
    ) throw new Error("桌面 4:3 双图文缺少根节点、组级或图片几何证据");
    expect(Math.abs((desktopRootBox.width / desktopRootBox.height) - (4 / 3)))
      .toBeLessThanOrEqual(0.02);
    expect(desktopImageBox.x).toBeLessThan(desktopTextBox.x);
    expect(desktopImageBox.x + desktopImageBox.width).toBeLessThanOrEqual(desktopTextBox.x + 1);
    expect(Math.abs(desktopImageBox.y - desktopTextBox.y)).toBeLessThanOrEqual(2);
    expect(desktopFirstImageBox.x).toBeLessThan(desktopSecondImageBox.x);
    expect(desktopFirstImageBox.x + desktopFirstImageBox.width)
      .toBeLessThanOrEqual(desktopSecondImageBox.x + 1);
    for (const imageNodeId of imageNodeIds) {
      await expect(publicInstance.locator(`[data-template-node-id="${imageNodeId}"]`))
        .toHaveCSS("aspect-ratio", "4 / 3");
    }

    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.reload();
    await expect(publicInstance).toBeVisible();
    await expect(publicRenderer).toHaveAttribute("data-dynamic-template-device", "mobile");
    await expect(publicComposition).toHaveCSS("flex-direction", "column");
    await expect(publicImageGroup).toHaveCSS("flex-direction", "column");
    const mobileImageBox = await publicImageGroup.boundingBox();
    const mobileTextBox = await publicTextGroup.boundingBox();
    const mobileFirstImageBox = await publicImages.nth(0).boundingBox();
    const mobileSecondImageBox = await publicImages.nth(1).boundingBox();
    if (
      !mobileImageBox
      || !mobileTextBox
      || !mobileFirstImageBox
      || !mobileSecondImageBox
    ) throw new Error("移动 4:3 双图文缺少组级或图片几何证据");
    expect(mobileImageBox.y).toBeLessThan(mobileTextBox.y);
    expect(mobileImageBox.y + mobileImageBox.height).toBeLessThanOrEqual(mobileTextBox.y + 1);
    expect(Math.abs(mobileImageBox.x - mobileTextBox.x)).toBeLessThanOrEqual(2);
    expect(mobileFirstImageBox.y).toBeLessThan(mobileSecondImageBox.y);
    expect(mobileFirstImageBox.y + mobileFirstImageBox.height)
      .toBeLessThanOrEqual(mobileSecondImageBox.y + 1);
    await expect.poll(() => publicPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);

    const publicBeforeDraft = await responseData<PageDocumentSnapshot>(
      await anonymous.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    const draftOnlyTitle = "双图文系列标题（未发布草稿）";
    await instanceInspector.getByRole("textbox", { name: "标题槽位", exact: true })
      .fill(draftOnlyTitle);
    const draftSaveResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await page.getByRole("button", { name: "保存当前装修草稿", exact: true }).click();
    expect((await draftSaveResponse).ok()).toBe(true);
    await publicPage.reload();
    await expect(publicPage.getByText("双图文系列标题", { exact: true })).toBeVisible();
    await expect(publicPage.getByText(draftOnlyTitle, { exact: true })).toHaveCount(0);
    const publicAfterDraft = await responseData<PageDocumentSnapshot>(
      await anonymous.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    expect(publicAfterDraft.version).toBe(publicBeforeDraft.version);
    const publicInstanceAfterDraft = publicAfterDraft.puckData.content.find(
      (block) => block.props?.templateId === created.templateId,
    );
    const headingSlotId = definition.nodes[textNodeIds[0]].slotId!;
    expect((publicInstanceAfterDraft?.props?.contentBySlotId as Record<string, unknown> | undefined)?.[
      headingSlotId
    ]).toBe("双图文系列标题");
    await anonymous.close();
  });

  test("真实网站完成 1920×240 模板设计、页面内容、版本锁定、回收站与恢复闭环", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const pageKey = "products";
    const templateNameV1 = "真实闭环临时模板";
    const templateNameV2 = "真实闭环临时模板 v2";

    await page.setViewportSize({ width: 1600, height: 1000 });
    await loginAndPrepareIsolatedQaSite(page);

    const currentDraft = await responseData<{ updatedAt: string } | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    await browserWrite(page, "/page-modules/document", {
      pageKey,
      puckData: { content: [], zones: {}, root: { props: {} } },
      metadata: {
        seoTitle: "模板设计真实闭环 | 海川珠宝",
        seoDescription: "验证母模板结构、页面实例内容与公开 Renderer 的真实发布链路。",
        ogImage: "",
        contentOwner: "模板设计 QA",
        mediaRights: [],
      },
      editorVersion: "0.22.4",
      ...(currentDraft ? { expectedUpdatedAt: currentDraft.updatedAt } : {}),
    });

    await page.goto(`/admin/editor/${pageKey}`);
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const workspaceSwitch = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(workspaceSwitch).toHaveAttribute("data-active-mode", "page");

    await expect(workspaceSwitch).toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await expect(page.locator(".template-editor__toolbar")).toBeVisible();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
  await openHistoricalTemplateFixture(page);
    const { sizeControls } = await design1920By240Template(page, templateNameV1);
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-editor-1920x240-structure.png"),
      fullPage: true,
    });
    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === "/api/page-modules/dynamic-templates";
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const createdTemplate = await responseData<{ templateId: string }>(await createResponsePromise);
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await recoverTemplateCatalogAfterThrottle(page);
    await page.locator(
      `[data-unified-template-library="design"] [data-template-identity="template:${createdTemplate.templateId}"] .homepage-editor__template-card-main`,
    ).click();
    await page.getByRole("button", { name: /^模板尺寸：/ }).click();
    await expect(sizeControls).toBeVisible();
    await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" })).toHaveValue("1920");
    await expect(sizeControls.getByRole("spinbutton", { name: "模板固定高度" })).toHaveValue("240");
    await expect(page.getByRole("complementary", { name: "模板结构" })).toContainText("图片区");
    await expect(page.getByRole("complementary", { name: "模板结构" })).toContainText("文字区");

    await page.getByRole("button", { name: "预览模板" }).click();
    const previewScenario = page.getByRole("combobox", { name: "压力预览场景" });
    for (const scenario of ["short-text", "long-text", "optional-missing", "required-missing", "media-ratios"] as const) {
      await previewScenario.selectOption(scenario);
      await expect(page.frameLocator("iframe.template-editor__viewport-frame")
        .locator(".template-editor__dynamic-canvas-renderer"))
        .toHaveAttribute("data-preview-scenario", scenario);
      await page.screenshot({
        path: testInfo.outputPath(`dynamic-template-preview-${scenario}.png`),
        fullPage: true,
      });
    }
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await expect(page.getByRole("button", {
      name: new RegExp(`添加到页面：${templateNameV1} v`),
    })).toHaveCount(0);
    await expect(page.locator(
      `[data-template-identity="template:${createdTemplate.templateId}"]`,
    )).toHaveCount(0);
    await expect(workspaceSwitch).toHaveAttribute("data-active-mode", "page");

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.locator(
      `[data-unified-template-library="design"] [data-template-identity="template:${createdTemplate.templateId}"] .homepage-editor__template-card-main`,
    ).click();
    const { confirmAndWaitForSinglePublish: publishV1Once, review: publishReviewV1 } =
      await prepareTemplatePublishThroughProductionReviews(
        page,
        createdTemplate.templateId,
      );
    expect((await publishV1Once()).ok()).toBe(true);
    await expect(page.getByText("模板 v1 已发布；目录已确认可用。已有页面继续锁定原版本。", { exact: true })).toBeVisible();
    await publishReviewV1.getByRole("button", { name: "继续设计", exact: true }).click();
    const publishedV1 = await responseData<{
      templateId: string;
      version: number;
      definitionChecksum: string;
      definition: {
        rootNodeId: string;
        nodes: Record<string, {
          nodeId: string;
          name: string;
          slotId?: string;
          childIds: string[];
          responsive: {
            desktop: { gap?: { value: number; unit: string } };
            mobile: { gap?: { value: number; unit: string } };
          };
        }>;
        slots: Record<string, { slotId: string; key: string }>;
        defaultContent: Record<string, unknown>;
        previewContent: Record<string, unknown>;
      };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/dynamic-templates/published/${createdTemplate.templateId}/versions/1`,
    ));
    expect(publishedV1.templateId).toBe(createdTemplate.templateId);
    expect(publishedV1.version).toBe(1);
    const publishedV1Snapshot = structuredClone(publishedV1);
    const slotsByKey = Object.fromEntries(
      Object.values(publishedV1.definition.slots).map((slot) => [slot.key, slot]),
    );
    expect(publishedV1.definition.defaultContent).toEqual({});
    expect(publishedV1.definition.previewContent).toEqual({});
    expect(JSON.stringify(publishedV1.definition)).not.toContain("周年典藏系列");

    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    const publishedV1Control = page.getByRole("button", {
      name: `添加到页面：${templateNameV1} v1`,
      exact: true,
    });
    await expect(publishedV1Control).toBeVisible();
    await publishedV1Control.click();
    await publishedV1Control.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);

    const populatedV1Layer = page.locator(
      '.homepage-editor__layer-item[data-layer-index="0"] .homepage-editor__layer-select',
    );
    await populatedV1Layer.click();

    const instanceInspector = page.getByRole("region", { name: "模板实例属性" });
    await expect(instanceInspector).toContainText(`固定版本 ${createdTemplate.templateId} v1`);
    await instanceInspector.getByRole("textbox", { name: "标题槽位" }).fill("周年典藏系列");
    await instanceInspector.getByRole("textbox", { name: "正文槽位" })
      .fill("以克制留白呈现珠宝工艺与佩戴光泽。");
    await instanceInspector.getByRole("textbox", { name: "按钮槽位文案" }).fill("查看系列");
    await instanceInspector.getByRole("group", { name: "按钮槽位跳转" })
      .getByRole("button", { name: "页面" }).click();
    await instanceInspector.getByRole("combobox", { name: "站内页面" }).fill("/products");
    const imageField = instanceInspector.locator(`[data-slot-id="${slotsByKey.image.slotId}"]`);
    const uploadImageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === "/api/upload/image";
    });
    const imageChooserPromise = page.waitForEvent("filechooser");
    await imageField.getByRole("button", { name: /拖入图片或点击上传/ }).click();
    await (await imageChooserPromise).setFiles(
      "public/images/admin/templates/jewelry-home-wireframe.png",
    );
    const uploadedImage = await responseData<{ url: string }>(await uploadImageResponsePromise);
    await expect(imageField.getByRole("button", { name: "替换图片" })).toBeVisible();
    await imageField.getByRole("textbox", { name: "图片槽位替代文字" })
      .fill("周年典藏系列珠宝工艺展示");
    await instanceInspector.getByRole("group", { name: "页面实例属性范围" })
      .getByRole("button", { name: "标题槽位", exact: true }).click();
    await expect(instanceInspector.getByText("水平偏移", { exact: true })).toHaveCount(0);
    await expect(instanceInspector.getByText("垂直偏移", { exact: true })).toHaveCount(0);
    await expect(instanceInspector.getByText("区域宽度", { exact: true })).toHaveCount(0);
    const lockedV1Layer = page.locator(
      '.homepage-editor__layer-item[data-layer-index="1"] .homepage-editor__layer-select',
    );
    await lockedV1Layer.click();
    await instanceInspector.getByRole("textbox", { name: "标题槽位" })
      .fill("经典常青系列");
    await instanceInspector.getByRole("textbox", { name: "正文槽位" })
      .fill("保留 v1 结构与内容，验证历史版本持续可渲染。");
    await instanceInspector.getByRole("textbox", { name: "按钮槽位文案" })
      .fill("浏览经典系列");
    await instanceInspector.getByRole("group", { name: "按钮槽位跳转" })
      .getByRole("button", { name: "页面" }).click();
    await instanceInspector.getByRole("combobox", { name: "站内页面" }).fill("/products");
    await populatedV1Layer.click();
    await expect(instanceInspector.getByRole("textbox", { name: "标题槽位" }))
      .toHaveValue("周年典藏系列");
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-v1-repeat.png"),
      fullPage: true,
    });

    await completePagePublicationMediaThroughUi(
      page,
      [uploadedImage.url],
      "QA-TEMPLATE-V1",
    );
    await page.reload();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);

    const draftAfterV1 = await responseData<{
      updatedAt: string;
      metadata: Record<string, unknown>;
      editorVersion?: string;
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
    ));
    const v1Instances = draftAfterV1.puckData.content.filter((block) => (
      block.props?.templateId === createdTemplate.templateId
    ));
    expect(v1Instances).toHaveLength(2);
    expect(v1Instances.every((block) => block.props?.templateVersion === 1)).toBe(true);
    const v1InstanceIdentities = dynamicTemplateInstanceIdentities(
      draftAfterV1,
      createdTemplate.templateId,
    );
    expect(v1InstanceIdentities).toEqual([
      { instanceId: expect.any(String), version: 1 },
      { instanceId: expect.any(String), version: 1 },
    ]);
    expect(v1InstanceIdentities[0].instanceId).not.toBe(v1InstanceIdentities[1].instanceId);
    const [populatedV1InstanceId, untouchedV1InstanceId] = v1InstanceIdentities
      .map((instance) => instance.instanceId);
    const upgradedInstanceIdentities = [
      { instanceId: populatedV1InstanceId, version: 2 },
      { instanceId: untouchedV1InstanceId, version: 1 },
    ];
    const populatedV1 = v1Instances.find((block) => (
      (block.props?.contentBySlotId as Record<string, unknown> | undefined)?.[slotsByKey.heading.slotId]
      === "周年典藏系列"
    ));
    expect(populatedV1).toBe(v1Instances[0]);
    expect(populatedV1?.props?.instanceId).toBe(populatedV1InstanceId);
    expect(populatedV1?.props?.layoutOverridesByNodeId).toEqual({});
    expect(populatedV1?.props?.nodes).toBeUndefined();
    expect(populatedV1?.props?.slots).toBeUndefined();
    expect(populatedV1?.props?.definition).toBeUndefined();
    expect(populatedV1?.props?.contentBySlotId).toMatchObject({
      [slotsByKey.image.slotId]: { src: uploadedImage.url },
      [slotsByKey.heading.slotId]: "周年典藏系列",
      [slotsByKey.description.slotId]: "以克制留白呈现珠宝工艺与佩戴光泽。",
      [slotsByKey.button.slotId]: {
        label: "查看系列",
        targetType: "page",
        pagePath: "/products",
      },
    });

    const headingNode = Object.values(publishedV1.definition.nodes).find(
      (node) => node.slotId === slotsByKey.heading.slotId,
    );
    if (!headingNode) throw new Error("正式模板 v1 缺少标题槽位节点");
    const forgedPuckData = structuredClone(draftAfterV1.puckData);
    const forgedInstance = forgedPuckData.content.find((block) => (
      (block.props?.contentBySlotId as Record<string, unknown> | undefined)?.[
        slotsByKey.heading.slotId
      ] === "周年典藏系列"
    ));
    if (!forgedInstance?.props) throw new Error("页面草稿缺少待伪造的 v1 实例");
    forgedInstance.props.layoutOverridesByNodeId = {
      [headingNode.nodeId]: {
        desktop: { offsetXPercent: 12, widthPercent: 120 },
      },
    };
    const forbiddenLayoutWrite = await browserWriteResult(page, "/page-modules/document", {
      pageKey,
      puckData: forgedPuckData,
      metadata: draftAfterV1.metadata,
      editorVersion: draftAfterV1.editorVersion,
      expectedUpdatedAt: draftAfterV1.updatedAt,
    });
    expect(forbiddenLayoutWrite.status).toBe(400);
    const forbiddenLayoutMessage = JSON.stringify(forbiddenLayoutWrite.body);
    expect(forbiddenLayoutMessage).toContain("页面草稿实例授权无效");
    expect(forbiddenLayoutMessage).toContain("不允许调整位置");
    expect(forbiddenLayoutMessage).toContain("宽度超出母模板允许范围");
    const draftAfterForbiddenWrite = await responseData<{
      updatedAt: string;
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
    ));
    expect(draftAfterForbiddenWrite.updatedAt).toBe(draftAfterV1.updatedAt);
    const unchangedPopulatedV1 = draftAfterForbiddenWrite.puckData.content.find((block) => (
      (block.props?.contentBySlotId as Record<string, unknown> | undefined)?.[
        slotsByKey.heading.slotId
      ] === "周年典藏系列"
    ));
    expect(unchangedPopulatedV1?.props?.layoutOverridesByNodeId).toEqual({});

    const publishPageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document/publish";
    });
    const publishPageButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishPageButton).toBeEnabled({ timeout: 15_000 });
    await publishPageButton.click();
    expect((await publishPageResponsePromise).ok()).toBe(true);
    await expect(page.getByText("珠宝作品已发布，前台页面将立即读取最新版本")).toBeVisible();

    const draftAfterPageV1Publish = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    const publicAfterPageV1Publish = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    expect(dynamicTemplateVersions(draftAfterPageV1Publish, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(dynamicTemplateVersions(publicAfterPageV1Publish, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(draftAfterPageV1Publish.publishedRevisionId).toBeTruthy();
    const pageRevisionsAfterV1Publish = await responseData<{
      items: PageDocumentRevisionSummary[];
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/revisions?pageKey=${pageKey}&limit=50`,
    ));
    const pageRevisionV1 = pageRevisionsAfterV1Publish.items.find(
      (revision) => revision.id === draftAfterPageV1Publish.publishedRevisionId,
    );
    expect(pageRevisionV1).toMatchObject({ isPublished: true });
    if (!pageRevisionV1) throw new Error("页面 v1 发布后缺少 publishedRevisionId 对应的历史版本");
    const pageRevisionV1Detail = await responseData<PageDocumentRevisionDetail>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/revisions/${pageRevisionV1.version}?pageKey=${pageKey}`,
      ),
    );
    expect(pageRevisionV1Detail.id).toBe(draftAfterPageV1Publish.publishedRevisionId);
    expect(pageRevisionV1Detail.isPublished).toBe(true);
    expect(dynamicTemplateVersions(pageRevisionV1Detail, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(dynamicTemplateInstanceIdentities(pageRevisionV1Detail, createdTemplate.templateId))
      .toEqual(v1InstanceIdentities);
    const pageRevisionV1PuckDataSnapshot = structuredClone(pageRevisionV1Detail.puckData);
    expect(publicAfterPageV1Publish.version).toBe(pageRevisionV1.version);

    const anonymous = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      extraHTTPHeaders: forwardedProtoHeaders,
    });
    const publicPage = await anonymous.newPage();
    await publicPage.goto(`${browserBaseUrl}/products`);
    await expect(publicPage.getByText("周年典藏系列", { exact: true })).toBeVisible();
    const publicInstance = publicPage.locator('[data-dynamic-template-version="1"]')
      .filter({ has: publicPage.locator(`[data-dynamic-template-id="${createdTemplate.templateId}"]`) })
      .filter({ hasText: "周年典藏系列" })
      .first();
    await expect(publicInstance).toBeVisible();
    const imageRegionNode = Object.values(publishedV1.definition.nodes)
      .find((node) => node.name === "图片区");
    const textRegionNode = Object.values(publishedV1.definition.nodes)
      .find((node) => node.name === "文字区");
    if (!imageRegionNode || !textRegionNode) throw new Error("正式模板缺少图片区或文字区");
    const textGroupNodeId = textRegionNode.childIds[0];
    const publishedV1TextGroup = publishedV1.definition.nodes[textGroupNodeId];
    if (!publishedV1TextGroup || publishedV1TextGroup.childIds.length < 2) {
      throw new Error("正式模板文字区缺少可验证的上下布局组");
    }
    const publicImageRegion = publicInstance.locator(
      `[data-template-node-id="${imageRegionNode.nodeId}"]`,
    );
    const publicTextRegion = publicInstance.locator(
      `[data-template-node-id="${textRegionNode.nodeId}"]`,
    );
    await expect(publicImageRegion).toBeVisible();
    await expect(publicTextRegion).toBeVisible();
    const desktopImageBox = await publicImageRegion.boundingBox();
    const desktopTextBox = await publicTextRegion.boundingBox();
    if (!desktopImageBox || !desktopTextBox) throw new Error("桌面公开模板区域没有可用尺寸");
    expect(desktopTextBox.x).toBeLessThan(desktopImageBox.x);
    expect(Math.abs(desktopImageBox.y - desktopTextBox.y)).toBeLessThanOrEqual(2);
    expect(desktopImageBox.width / desktopTextBox.width).toBeGreaterThan(1.45);
    expect(desktopImageBox.width / desktopTextBox.width).toBeLessThan(1.55);
    await expect.poll(() => publicPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await publicPage.screenshot({
      path: testInfo.outputPath("dynamic-template-public-1200x900.png"),
      fullPage: true,
    });

    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.reload();
    await expect(publicPage.getByText("周年典藏系列", { exact: true })).toBeVisible();
    const mobileImageBox = await publicImageRegion.boundingBox();
    const mobileTextBox = await publicTextRegion.boundingBox();
    if (!mobileImageBox || !mobileTextBox) throw new Error("移动公开模板区域没有可用尺寸");
    expect(mobileTextBox.y).toBeLessThan(mobileImageBox.y);
    expect(Math.abs(mobileImageBox.x - mobileTextBox.x)).toBeLessThanOrEqual(2);
    await expect.poll(() => publicPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await publicPage.screenshot({
      path: testInfo.outputPath("dynamic-template-public-390x844.png"),
      fullPage: true,
    });
    await anonymous.close();

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.locator(
      `[data-unified-template-library="design"] [data-template-identity="template:${createdTemplate.templateId}"] .homepage-editor__template-card-main`,
    ).click();
    const templateInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await templateInspector.getByRole("textbox", { name: "模板名称", exact: true })
      .fill(templateNameV2);
    const templateStructureV2 = page.getByRole("complementary", { name: "模板结构" });
    await templateStructureV2.locator(
      `[role="treeitem"][data-selection-target-id="${textGroupNodeId}"]`,
    ).click();
    const v2TextGroupGap = templateInspector.getByRole("spinbutton", {
      name: "槽位间距",
      exact: true,
    });
    await v2TextGroupGap.fill("20");
    await v2TextGroupGap.press("Enter");
    await expect(v2TextGroupGap).toHaveValue("20");
    const updateResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PATCH"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdTemplate.templateId}/draft`;
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    expect((await updateResponsePromise).ok()).toBe(true);
    const { confirmAndWaitForSinglePublish: publishV2Once, review: publishReviewV2 } =
      await prepareTemplatePublishThroughProductionReviews(
        page,
        createdTemplate.templateId,
      );
    expect((await publishV2Once()).ok()).toBe(true);
    await publishReviewV2.getByRole("button", { name: "继续设计", exact: true }).click();

    const templateVersionPage = await responseData<{
      items: Array<{ version: number; definitionChecksum: string }>;
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/dynamic-templates/${createdTemplate.templateId}/versions?limit=50`,
    ));
    expect(templateVersionPage.items.map((version) => version.version)).toEqual([2, 1]);
    const publishedV1AfterV2 = await responseData<typeof publishedV1>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/dynamic-templates/published/${createdTemplate.templateId}/versions/1`,
      ),
    );
    const publishedV2 = await responseData<typeof publishedV1>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/dynamic-templates/published/${createdTemplate.templateId}/versions/2`,
      ),
    );
    expect(publishedV1AfterV2.definitionChecksum)
      .toBe(publishedV1Snapshot.definitionChecksum);
    expect(publishedV1AfterV2.definition).toEqual(publishedV1Snapshot.definition);
    expect(publishedV2.templateId).toBe(createdTemplate.templateId);
    expect(publishedV2.version).toBe(2);
    expect(publishedV2.definitionChecksum).not.toBe(publishedV1.definitionChecksum);
    expect(publishedV2.definition).not.toEqual(publishedV1.definition);
    const publishedV2TextGroup = publishedV2.definition.nodes[textGroupNodeId];
    if (!publishedV2TextGroup) {
      throw new Error("精确模板 v2 缺少稳定文字布局组 nodeId");
    }
    expect(publishedV2.definition.rootNodeId).toBe(publishedV1.definition.rootNodeId);
    expect(publishedV2.definition.nodes[publishedV2.definition.rootNodeId].childIds)
      .toEqual(publishedV1.definition.nodes[publishedV1.definition.rootNodeId].childIds);
    expect(publishedV2.definition.nodes[publishedV2.definition.rootNodeId].childIds)
      .toEqual([textRegionNode.nodeId, imageRegionNode.nodeId]);
    expect(publishedV2TextGroup.childIds).toEqual(publishedV1TextGroup.childIds);
    expect(publishedV1TextGroup.responsive.desktop.gap).toEqual({ value: 4, unit: "px" });
    expect(publishedV2TextGroup.responsive.desktop.gap).toEqual({ value: 20, unit: "px" });
    expect(templateVersionPage.items.map((version) => ({
      version: version.version,
      definitionChecksum: version.definitionChecksum,
    }))).toEqual([
      { version: 2, definitionChecksum: publishedV2.definitionChecksum },
      { version: 1, definitionChecksum: publishedV1.definitionChecksum },
    ]);

    const draftBeforeUpgrade = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    const publicBeforeUpgrade = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    expect(dynamicTemplateVersions(draftBeforeUpgrade, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(dynamicTemplateVersions(publicBeforeUpgrade, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(draftBeforeUpgrade.updatedAt).toBe(draftAfterPageV1Publish.updatedAt);
    expect(draftBeforeUpgrade.publishedRevisionId)
      .toBe(draftAfterPageV1Publish.publishedRevisionId);
    expect(publicBeforeUpgrade.version).toBe(pageRevisionV1.version);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await recoverTemplateCatalogAfterThrottle(page);
    await populatedV1Layer.click();
    await expect(instanceInspector).toContainText("发现新版本 v2");
    const pageDocumentWritePaths: string[] = [];
    const capturePageDocumentWrite = (request: import("@playwright/test").Request) => {
      const url = new URL(request.url());
      if (
        request.method() === "PUT"
        && ["/api/page-modules/document", "/api/page-modules/document/publish"].includes(url.pathname)
      ) pageDocumentWritePaths.push(url.pathname);
    };
    page.on("request", capturePageDocumentWrite);

    await instanceInspector.getByRole("button", { name: "查看差异" }).click();
    const upgradeDialog = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(upgradeDialog).toContainText("周年典藏系列");
    await expect(upgradeDialog).toContainText("确认后只修改当前内存草稿并增加一条页面历史");
    await upgradeDialog.getByRole("button", { name: "保留当前版本", exact: true }).click();
    await expect(upgradeDialog).toBeHidden();
    await expect(instanceInspector).toContainText(`固定版本 ${createdTemplate.templateId} v1`);
    expect(pageDocumentWritePaths).toEqual([]);

    const draftAfterCancelledUpgrade = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    const publicAfterCancelledUpgrade = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    expect(dynamicTemplateVersions(draftAfterCancelledUpgrade, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(draftAfterCancelledUpgrade.updatedAt).toBe(draftBeforeUpgrade.updatedAt);
    expect(draftAfterCancelledUpgrade.publishedRevisionId)
      .toBe(draftBeforeUpgrade.publishedRevisionId);
    expect(dynamicTemplateVersions(publicAfterCancelledUpgrade, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(publicAfterCancelledUpgrade.version).toBe(publicBeforeUpgrade.version);
    expect(pageDocumentWritePaths).toEqual([]);

    await instanceInspector.getByRole("button", { name: "查看差异" }).click();
    await expect(upgradeDialog).toBeVisible();
    await upgradeDialog.getByRole("button", { name: "确认升级页面草稿", exact: true }).click();
    await expect(page.getByText("页面实例已升级到 v2；尚未保存页面草稿，可使用页面撤销回退"))
      .toBeVisible();
    await expect(instanceInspector).toContainText(`固定版本 ${createdTemplate.templateId} v2`);
    await expect(instanceInspector.getByRole("textbox", { name: "标题槽位" }))
      .toHaveValue("周年典藏系列");
    await expect(instanceInspector.getByRole("textbox", { name: "正文槽位" }))
      .toHaveValue("以克制留白呈现珠宝工艺与佩戴光泽。");
    await expect(imageField.getByRole("button", { name: "替换图片" })).toBeVisible();
    await expect(imageField.getByRole("textbox", { name: "图片槽位替代文字" }))
      .toHaveValue("周年典藏系列珠宝工艺展示");
    await expect(instanceInspector.getByRole("textbox", { name: "按钮槽位文案" }))
      .toHaveValue("查看系列");
    await expect(instanceInspector.getByRole("combobox", { name: "站内页面" }))
      .toHaveValue("/products");
    const editorTemplateInstances = page.frameLocator(".homepage-editor__canvas-scale iframe")
      .locator("section[data-dynamic-template-version]")
      .filter({
        has: page.frameLocator(".homepage-editor__canvas-scale iframe")
          .locator(`[data-dynamic-template-id="${createdTemplate.templateId}"]`),
    });
    await expect(editorTemplateInstances).toHaveCount(2);
    expect(await editorTemplateInstances.evaluateAll((nodes) => (
      nodes.map((node) => ({
        instanceId: node.getAttribute("data-dynamic-template-instance-id"),
        version: Number(node.getAttribute("data-dynamic-template-version")),
      }))
    ))).toEqual(upgradedInstanceIdentities);
    expect(pageDocumentWritePaths).toEqual([]);

    const draftAfterInMemoryUpgrade = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    const publicAfterInMemoryUpgrade = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    expect(dynamicTemplateVersions(draftAfterInMemoryUpgrade, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(draftAfterInMemoryUpgrade.updatedAt).toBe(draftBeforeUpgrade.updatedAt);
    expect(draftAfterInMemoryUpgrade.publishedRevisionId)
      .toBe(draftBeforeUpgrade.publishedRevisionId);
    expect(dynamicTemplateVersions(publicAfterInMemoryUpgrade, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(publicAfterInMemoryUpgrade.version).toBe(publicBeforeUpgrade.version);
    expect(pageDocumentWritePaths).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-explicit-upgrade-v1-to-v2.png"),
      fullPage: true,
    });

    const saveV2PageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    expect((await saveV2PageResponsePromise).ok()).toBe(true);
    expect(pageDocumentWritePaths).toEqual(["/api/page-modules/document"]);
    await page.reload();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);

    const draftAfterV2 = await responseData<PageDocumentSnapshot>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
    ));
    const versionedInstances = draftAfterV2.puckData.content.filter((block) => (
      block.props?.templateId === createdTemplate.templateId
    ));
    expect(versionedInstances.map((block) => block.props?.templateVersion)).toEqual([2, 1]);
    expect(dynamicTemplateInstanceIdentities(draftAfterV2, createdTemplate.templateId))
      .toEqual(upgradedInstanceIdentities);
    const upgradedPopulatedV2 = versionedInstances.find((block) => (
      block.props?.templateVersion === 2
      && (block.props?.contentBySlotId as Record<string, unknown> | undefined)?.[
        slotsByKey.heading.slotId
      ] === "周年典藏系列"
    ));
    expect(upgradedPopulatedV2).toBe(versionedInstances[0]);
    expect(upgradedPopulatedV2?.props?.instanceId).toBe(populatedV1InstanceId);
    expect(upgradedPopulatedV2?.props?.contentBySlotId).toMatchObject({
      [slotsByKey.image.slotId]: { src: uploadedImage.url },
      [slotsByKey.heading.slotId]: "周年典藏系列",
      [slotsByKey.description.slotId]: "以克制留白呈现珠宝工艺与佩戴光泽。",
      [slotsByKey.button.slotId]: {
        label: "查看系列",
        targetType: "page",
        pagePath: "/products",
      },
    });
    expect(draftAfterV2.publishedRevisionId).toBe(draftBeforeUpgrade.publishedRevisionId);
    const publishedAfterV2Draft = await responseData<PageDocumentSnapshot>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(dynamicTemplateVersions(publishedAfterV2Draft, createdTemplate.templateId))
      .toEqual([1, 1]);
    expect(publishedAfterV2Draft.version).toBe(publicBeforeUpgrade.version);
    const pageRevisionsAfterDraftSave = await responseData<{
      items: PageDocumentRevisionSummary[];
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/revisions?pageKey=${pageKey}&limit=50`,
    ));
    expect(pageRevisionsAfterDraftSave.items).toEqual(pageRevisionsAfterV1Publish.items);
    pageDocumentWritePaths.length = 0;

    const publishV2PageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document/publish";
    });
    await expect(publishPageButton).toBeEnabled({ timeout: 15_000 });
    await publishPageButton.click();
    expect((await publishV2PageResponsePromise).ok()).toBe(true);
    await expect(page.getByText("珠宝作品已发布，前台页面将立即读取最新版本")).toBeVisible();
    expect(pageDocumentWritePaths).toEqual([
      // 发布动作强制保存一次最新快照，再发布同一份已持久化草稿。
      "/api/page-modules/document",
      "/api/page-modules/document/publish",
    ]);
    page.off("request", capturePageDocumentWrite);

    const draftAfterV2Publish = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    const publicAfterV2Publish = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    expect(dynamicTemplateVersions(draftAfterV2Publish, createdTemplate.templateId))
      .toEqual([2, 1]);
    expect(dynamicTemplateVersions(publicAfterV2Publish, createdTemplate.templateId))
      .toEqual([2, 1]);
    expect(draftAfterV2Publish.publishedRevisionId).not.toBe(pageRevisionV1.id);
    const pageRevisionsAfterV2Publish = await responseData<{
      items: PageDocumentRevisionSummary[];
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/revisions?pageKey=${pageKey}&limit=50`,
    ));
    const pageRevisionV2 = pageRevisionsAfterV2Publish.items.find((revision) => revision.isPublished);
    expect(pageRevisionV2?.id).toBe(draftAfterV2Publish.publishedRevisionId);
    expect(pageRevisionV2?.version).toBe(pageRevisionV1.version + 1);
    expect(pageRevisionsAfterV2Publish.items.find((revision) => revision.id === pageRevisionV1.id))
      .toMatchObject({ isPublished: false });
    if (!pageRevisionV2) throw new Error("页面 v2 发布后缺少新的 publishedRevisionId 对应历史版本");
    const pageRevisionV2Detail = await responseData<PageDocumentRevisionDetail>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/revisions/${pageRevisionV2.version}?pageKey=${pageKey}`,
      ),
    );
    expect(pageRevisionV2Detail.id).toBe(draftAfterV2Publish.publishedRevisionId);
    expect(pageRevisionV2Detail.isPublished).toBe(true);
    expect(dynamicTemplateVersions(pageRevisionV2Detail, createdTemplate.templateId))
      .toEqual([2, 1]);
    expect(dynamicTemplateInstanceIdentities(pageRevisionV2Detail, createdTemplate.templateId))
      .toEqual(upgradedInstanceIdentities);
    const pageRevisionV2PuckDataSnapshot = structuredClone(pageRevisionV2Detail.puckData);
    const pageRevisionV1AfterV2Publish = await responseData<PageDocumentRevisionDetail>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/revisions/${pageRevisionV1.version}?pageKey=${pageKey}`,
      ),
    );
    expect(pageRevisionV1AfterV2Publish.id).toBe(pageRevisionV1.id);
    expect(pageRevisionV1AfterV2Publish.version).toBe(pageRevisionV1.version);
    expect(pageRevisionV1AfterV2Publish.puckData).toEqual(pageRevisionV1PuckDataSnapshot);
    expect(dynamicTemplateInstanceIdentities(pageRevisionV1AfterV2Publish, createdTemplate.templateId))
      .toEqual(v1InstanceIdentities);
    expect(publicAfterV2Publish.version).toBe(pageRevisionV2.version);

    const publishedV2Anonymous = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      extraHTTPHeaders: forwardedProtoHeaders,
    });
    const anonymousPublicAfterV2Publish = await responseData<PageDocumentSnapshot>(
      await publishedV2Anonymous.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    expect(anonymousPublicAfterV2Publish.version).toBe(pageRevisionV2.version);
    expect(dynamicTemplateVersions(anonymousPublicAfterV2Publish, createdTemplate.templateId))
      .toEqual([2, 1]);
    expect(dynamicTemplateInstanceIdentities(
      anonymousPublicAfterV2Publish,
      createdTemplate.templateId,
    )).toEqual(upgradedInstanceIdentities);
    const publishedV2Page = await publishedV2Anonymous.newPage();
    await publishedV2Page.goto(`${browserBaseUrl}/products`);
    const publicTemplateInstances = publishedV2Page
      .locator("section[data-dynamic-template-version]")
      .filter({
        has: publishedV2Page.locator(
          `.hc-dynamic-template[data-dynamic-template-id="${createdTemplate.templateId}"]`,
        ),
    });
    await expect(publicTemplateInstances).toHaveCount(2);
    expect(await publicTemplateInstances.evaluateAll((nodes) => (
      nodes.map((node) => ({
        instanceId: node.getAttribute("data-dynamic-template-instance-id"),
        version: Number(node.getAttribute("data-dynamic-template-version")),
      }))
    ))).toEqual(upgradedInstanceIdentities);
    const publicUpgradedV2 = publicTemplateInstances.nth(0);
    const publicLockedV1 = publicTemplateInstances.nth(1);
    await expect(publicUpgradedV2).toHaveAttribute("data-dynamic-template-version", "2");
    await expect(publicLockedV1).toHaveAttribute("data-dynamic-template-version", "1");
    const publicUpgradedV2Renderer = publicUpgradedV2.locator(
      `.hc-dynamic-template[data-dynamic-template-id="${createdTemplate.templateId}"]`,
    );
    await expect(publicUpgradedV2Renderer).toHaveAttribute("data-dynamic-template-mode", "public");
    await expect(publicUpgradedV2Renderer)
      .toHaveAttribute("data-template-composition-authority", "template-definition-v2");
    await expect(publicUpgradedV2.getByText("周年典藏系列", { exact: true })).toBeVisible();
    await expect(publicUpgradedV2.getByRole("img", { name: "周年典藏系列珠宝工艺展示" }))
      .toHaveAttribute("src", uploadedImage.url);
    await expect(publicUpgradedV2.getByRole("link", { name: "查看系列" }))
      .toHaveAttribute("href", "/products");
    await expect(publicLockedV1.getByText("经典常青系列", { exact: true })).toBeVisible();
    await expect(publicLockedV1.getByRole("link", { name: "浏览经典系列" }))
      .toHaveAttribute("href", "/products");
    const publicV2TextGroup = publicUpgradedV2.locator(
      `[data-template-node-id="${textGroupNodeId}"]`,
    );
    const publicV1TextGroup = publicLockedV1.locator(
      `[data-template-node-id="${textGroupNodeId}"]`,
    );
    await expect(publicV2TextGroup).toHaveCSS("gap", "20px");
    await expect(publicV1TextGroup).toHaveCSS("gap", "4px");
    expect(await publicV2TextGroup.evaluate((node) => (
      node.parentElement?.getAttribute("data-template-node-id")
    ))).toBe(textRegionNode.nodeId);
    expect(await publicV1TextGroup.evaluate((node) => (
      node.parentElement?.getAttribute("data-template-node-id")
    ))).toBe(textRegionNode.nodeId);
    const publicV2Root = publicUpgradedV2.locator(
      `[data-template-node-id="${publishedV2.definition.rootNodeId}"]`,
    );
    const publicV1Root = publicLockedV1.locator(
      `[data-template-node-id="${publishedV1.definition.rootNodeId}"]`,
    );
    expect(await publicV2Root.locator(":scope > [data-template-node-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id"))))
      .toEqual([textRegionNode.nodeId, imageRegionNode.nodeId]);
    expect(await publicV1Root.locator(":scope > [data-template-node-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id"))))
      .toEqual([textRegionNode.nodeId, imageRegionNode.nodeId]);
    expect(await publicV2TextGroup.locator(":scope > [data-template-node-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id"))))
      .toEqual(publishedV2TextGroup.childIds);
    expect(await publicV1TextGroup.locator(":scope > [data-template-node-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id"))))
      .toEqual(publishedV1TextGroup.childIds);
    const [v2FirstChildBox, v2SecondChildBox, v1FirstChildBox, v1SecondChildBox] = await Promise.all([
      publicV2TextGroup.locator(":scope > [data-template-node-id]").nth(0).boundingBox(),
      publicV2TextGroup.locator(":scope > [data-template-node-id]").nth(1).boundingBox(),
      publicV1TextGroup.locator(":scope > [data-template-node-id]").nth(0).boundingBox(),
      publicV1TextGroup.locator(":scope > [data-template-node-id]").nth(1).boundingBox(),
    ]);
    if (!v2FirstChildBox || !v2SecondChildBox || !v1FirstChildBox || !v1SecondChildBox) {
      throw new Error("公开 Renderer 文字区子节点缺少可用几何尺寸");
    }
    const renderedV2Gap = v2SecondChildBox.y - (v2FirstChildBox.y + v2FirstChildBox.height);
    const renderedV1Gap = v1SecondChildBox.y - (v1FirstChildBox.y + v1FirstChildBox.height);
    expect(Math.abs(renderedV2Gap - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(renderedV1Gap - 4)).toBeLessThanOrEqual(1);
    expect(renderedV2Gap).toBeGreaterThan(renderedV1Gap + 10);

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.locator(
      `[data-unified-template-library="design"] [data-template-identity="template:${createdTemplate.templateId}"] .homepage-editor__template-card-main`,
    ).click();
    await page.locator(".template-editor__toolbar")
      .getByRole("button", { name: "更多模板操作", exact: true }).click();
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const archiveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdTemplate.templateId}/archive`;
    });
    const archiveDialog = page.getByRole("dialog", { name: `将模板“${templateNameV2}”移入回收站？` });
    await archiveDialog
      .getByRole("button", { name: "移入回收站" })
      .click();
    expect((await archiveResponsePromise).ok()).toBe(true);
    await expect(archiveDialog).toBeHidden();

    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await expect(page.locator(
      `[data-template-identity="template:${createdTemplate.templateId}"]`,
    )).toHaveCount(0);
    await expect(page.getByRole("button", {
      name: `添加到页面：${templateNameV2} v2`,
      exact: true,
    })).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-archived-existing-page.png"),
      fullPage: true,
    });

    const archivedPublishedV1 = await responseData<typeof publishedV1>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/dynamic-templates/published/${createdTemplate.templateId}/versions/1`,
      ),
    );
    const archivedPublishedV2 = await responseData<typeof publishedV2>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/dynamic-templates/published/${createdTemplate.templateId}/versions/2`,
      ),
    );
    expect(archivedPublishedV1.definitionChecksum)
      .toBe(publishedV1Snapshot.definitionChecksum);
    expect(archivedPublishedV1.definition).toEqual(publishedV1Snapshot.definition);
    expect(archivedPublishedV2.templateId).toBe(publishedV2.templateId);
    expect(archivedPublishedV2.version).toBe(publishedV2.version);
    expect(archivedPublishedV2.definitionChecksum).toBe(publishedV2.definitionChecksum);
    expect(archivedPublishedV2.definition).toEqual(publishedV2.definition);
    const archivedPageRevisionV1 = await responseData<PageDocumentRevisionDetail>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/revisions/${pageRevisionV1.version}?pageKey=${pageKey}`,
      ),
    );
    expect(archivedPageRevisionV1.id).toBe(pageRevisionV1.id);
    expect(archivedPageRevisionV1.version).toBe(pageRevisionV1.version);
    expect(archivedPageRevisionV1.puckData).toEqual(pageRevisionV1PuckDataSnapshot);
    expect(dynamicTemplateInstanceIdentities(archivedPageRevisionV1, createdTemplate.templateId))
      .toEqual(v1InstanceIdentities);
    const archivedPageRevisionV2 = await responseData<PageDocumentRevisionDetail>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/revisions/${pageRevisionV2.version}?pageKey=${pageKey}`,
      ),
    );
    expect(archivedPageRevisionV2.id).toBe(pageRevisionV2.id);
    expect(archivedPageRevisionV2.isPublished).toBe(true);
    expect(archivedPageRevisionV2.puckData).toEqual(pageRevisionV2PuckDataSnapshot);
    expect(dynamicTemplateVersions(archivedPageRevisionV2, createdTemplate.templateId))
      .toEqual([2, 1]);
    expect(dynamicTemplateInstanceIdentities(archivedPageRevisionV2, createdTemplate.templateId))
      .toEqual(upgradedInstanceIdentities);
    const anonymousPublicAfterArchive = await responseData<PageDocumentSnapshot>(
      await publishedV2Anonymous.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    expect(anonymousPublicAfterArchive.version).toBe(pageRevisionV2.version);
    expect(dynamicTemplateVersions(anonymousPublicAfterArchive, createdTemplate.templateId))
      .toEqual([2, 1]);
    expect(dynamicTemplateInstanceIdentities(
      anonymousPublicAfterArchive,
      createdTemplate.templateId,
    )).toEqual(upgradedInstanceIdentities);
    await publishedV2Page.reload();
    await expect(publicTemplateInstances).toHaveCount(2);
    expect(await publicTemplateInstances.evaluateAll((nodes) => (
      nodes.map((node) => ({
        instanceId: node.getAttribute("data-dynamic-template-instance-id"),
        version: Number(node.getAttribute("data-dynamic-template-version")),
      }))
    ))).toEqual(upgradedInstanceIdentities);
    await expect(publicV2TextGroup).toHaveCSS("gap", "20px");
    await expect(publicV1TextGroup).toHaveCSS("gap", "4px");
    await expect(publicTemplateInstances.nth(0).getByText("周年典藏系列", { exact: true }))
      .toBeVisible();
    await expect(publicTemplateInstances.nth(0).getByRole("img", {
      name: "周年典藏系列珠宝工艺展示",
    })).toHaveAttribute("src", uploadedImage.url);
    await expect(publicTemplateInstances.nth(0).getByRole("link", { name: "查看系列" }))
      .toHaveAttribute("href", "/products");
    await publishedV2Anonymous.close();

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: "打开模板回收站", exact: true }).click();
    const archivedTemplateCard = page.locator(
      `[data-unified-template-library="design"] [data-template-identity="template:${createdTemplate.templateId}"]`,
    );
    await expect(archivedTemplateCard).toBeVisible();
    const restoreResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdTemplate.templateId}/restore`;
    });
    await archivedTemplateCard.getByRole("button", {
      name: `更多模板操作：${templateNameV2}`,
      exact: true,
    }).click();
    await page.getByRole("menuitem", { name: "恢复模板" }).click();
    await page.getByRole("dialog", { name: `恢复模板“${templateNameV2}”？` })
      .getByRole("button", { name: "恢复模板" })
      .click();
    expect((await restoreResponsePromise).ok()).toBe(true);
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await expect(page.getByRole("button", {
      name: `添加到页面：${templateNameV2} v2`,
      exact: true,
    })).toBeVisible();

    const finalCatalog = await readTemplateCatalogWithThrottleRetry<{
      items: Array<{
        kind: string;
        template: { templateId?: string; status?: string; version?: number };
      }>;
    }>(page);
    expect(finalCatalog.items.some((item) => (
      item.kind === "editable"
        && item.template.templateId === createdTemplate.templateId
        && item.template.status === "ACTIVE"
    ))).toBe(true);
    expect(finalCatalog.items.some((item) => (
      item.kind === "published"
        && item.template.templateId === createdTemplate.templateId
        && item.template.version === 2
    ))).toBe(true);
    const finalPublic = await responseData<PageDocumentSnapshot>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(finalPublic.version).toBe(pageRevisionV2.version);
    expect(dynamicTemplateVersions(finalPublic, createdTemplate.templateId)).toEqual([2, 1]);
    expect(dynamicTemplateInstanceIdentities(finalPublic, createdTemplate.templateId))
      .toEqual(upgradedInstanceIdentities);
  });

  test("真实网站以 Product Slot 选择真实商品 code，并阻断未就绪商品发布", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const pageKey = "products";
    const templateName = "真实闭环商品槽位模板";
    const productCode = "HC-TEMPLATE-QA-001";

    await page.setViewportSize({ width: 1600, height: 1000 });
    await loginAndPrepareIsolatedQaSite(page);
    const category = await browserWrite<{ id: number }>(page, "/categories", {
      name: "模板闭环测试分类",
      slug: "template-closure-qa",
      isActive: true,
    }, "POST");
    await browserWrite(page, "/products", {
      name: "真实闭环测试商品",
      code: productCode,
      shortDescription: "仅存在于一次性隔离数据库的 Product Slot 测试商品。",
      categoryId: category.id,
      price: 12_800,
      status: "DRAFT",
      visibility: "INTERNAL",
      salesMode: "DISPLAY_ONLY",
    }, "POST");

    const currentDraft = await responseData<{ updatedAt: string } | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    await browserWrite(page, "/page-modules/document", {
      pageKey,
      puckData: { content: [], zones: {}, root: { props: {} } },
      metadata: {
        seoTitle: "Product Slot 真实闭环 | 海川珠宝",
        seoDescription: "验证页面装修只保存稳定商品 code，并阻止未就绪商品进入公开页面。",
        ogImage: "",
        contentOwner: "模板设计 QA",
        mediaRights: [],
      },
      editorVersion: "0.22.4",
      ...(currentDraft ? { expectedUpdatedAt: currentDraft.updatedAt } : {}),
    });

    await page.goto(`/admin/editor/${pageKey}`);
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
  await openHistoricalTemplateFixture(page);
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await fillTemplateIdentity(
      page,
      templateName,
      "用于验证真实商品选择及未就绪商品的页面发布阻断",
    );
    const structure = page.getByRole("complementary", { name: "模板结构" });
    await page.getByRole("button", { name: "预览模板", exact: true }).focus();
  await applyBasicSkeleton(page);
    await setOverlayLightNavigationCompatibilityThroughUi(page);
    await structure.getByRole("treeitem", { name: /^文字组/ }).click();
    await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    const slotPalette = page.getByRole("dialog", { name: "添加槽位", exact: true });
    await slotPalette.getByRole("button", {
      name: "添加商品槽位",
      exact: true,
    }).click();
    await page.keyboard.press("Escape");
    await expect(slotPalette).toBeHidden();
    await expect(structure.getByRole("treeitem", { name: /商品槽位 商品内容 可选/ }))
      .toBeVisible();

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === "/api/page-modules/dynamic-templates";
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const createdTemplate = await responseData<{ templateId: string }>(await createResponsePromise);
    const { confirmAndWaitForSinglePublish, review } = await prepareTemplatePublishThroughProductionReviews(
      page,
      createdTemplate.templateId,
    );
    expect((await confirmAndWaitForSinglePublish()).ok()).toBe(true);
    await review.getByRole("button", { name: "继续设计", exact: true }).click();
    const publishedTemplate = await responseData<{
      definition: { slots: Record<string, { slotId: string; key: string; type: string }> };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/dynamic-templates/published/${createdTemplate.templateId}/versions/1`,
    ));
    const productSlot = Object.values(publishedTemplate.definition.slots)
      .find((slot) => slot.type === "product");
    if (!productSlot) throw new Error("正式模板缺少 Product Slot");

    await returnToPageWorkspaceAndOpenPublishedTemplate(
      page,
      `添加到页面：${templateName} v1`,
    );
    const instanceInspector = page.getByRole("region", { name: "模板实例属性" });
    const productField = instanceInspector.locator(`[data-slot-id="${productSlot.slotId}"]`);
    await expect(productField).toContainText("从真实商品库选择");
    await productField.getByRole("button", { name: "选择商品", exact: true }).click();
    const productDialog = page.getByRole("dialog", { name: "选择商品" });
    await productDialog.getByRole("textbox", { name: "搜索商品名称或货号" }).fill(productCode);
    const productCard = productDialog.getByRole("button", { name: new RegExp(productCode) });
    await expect(productCard).toBeVisible();
    await expect(productCard).toContainText("草稿");
    await productCard.click();
    await productDialog.getByRole("button", { name: "确认选择（1）" }).click();
    await expect(productField).toContainText("已选择 1 件商品");
    await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText(productCode))
      .toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-product-slot-selected.png"),
      fullPage: true,
    });

    const saveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    expect((await saveResponsePromise).ok()).toBe(true);
    const savedDraft = await responseData<PageDocumentSnapshot>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
    ));
    const productInstance = savedDraft.puckData.content.find(
      (block) => block.props?.templateId === createdTemplate.templateId,
    );
    expect(productInstance?.props?.contentBySlotId).toEqual({
      [productSlot.slotId]: productCode,
    });
    expect(productInstance?.props?.product).toBeUndefined();
    expect(productInstance?.props?.productId).toBeUndefined();

    const publicBeforeBlockedPublish = await responseData<PageDocumentSnapshot | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    const revisionsBeforeBlockedPublish = await responseData<{
      items: PageDocumentRevisionSummary[];
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/revisions?pageKey=${pageKey}&limit=50`,
    ));
    const blockedPublish = await browserWriteResult(page, "/page-modules/document/publish", {
      pageKey,
      expectedUpdatedAt: savedDraft.updatedAt,
    });
    expect(blockedPublish.status).toBe(400);
    expect(JSON.stringify(blockedPublish.body)).toContain(productCode);
    expect(JSON.stringify(blockedPublish.body)).toContain("未满足公开发布条件");
    const draftAfterBlockedPublish = await responseData<PageDocumentSnapshot>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    const publicAfterBlockedPublish = await responseData<PageDocumentSnapshot | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
      ),
    );
    const revisionsAfterBlockedPublish = await responseData<{
      items: PageDocumentRevisionSummary[];
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/revisions?pageKey=${pageKey}&limit=50`,
    ));
    expect(draftAfterBlockedPublish.updatedAt).toBe(savedDraft.updatedAt);
    expect(draftAfterBlockedPublish.publishedRevisionId).toBe(savedDraft.publishedRevisionId);
    expect(publicAfterBlockedPublish).toEqual(publicBeforeBlockedPublish);
    expect(revisionsAfterBlockedPublish.items).toEqual(revisionsBeforeBlockedPublish.items);
  });

  test("真实网站区分放弃未保存模板与回收站永久删除", async ({ page }) => {
    test.setTimeout(300_000);
    const unsavedName = "真实闭环待放弃模板";
    const draftName = "真实闭环待删除草稿";
    const createRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() === "POST"
        && url.pathname === "/api/page-modules/dynamic-templates"
      ) {
        createRequests.push(url.pathname);
      }
    });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await loginAndPrepareIsolatedQaSite(page);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await recoverTemplateCatalogAfterThrottle(page);
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
  await openHistoricalTemplateFixture(page);
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await fillTemplateIdentity(
      page,
      unsavedName,
      "用于验证未保存模板只关闭本地会话且不创建服务端记录",
    );
    await page.locator(".template-editor__toolbar")
      .getByRole("button", { name: "更多模板操作", exact: true }).click();
    await page.getByRole("menuitem", { name: /关闭模板会话/ }).click();
    const discardDialog = page.getByRole("dialog", {
      name: `关闭“${unsavedName}”的模板编辑会话？`,
    });
    await expect(discardDialog).toContainText("当前模板还有未保存修改");
    await discardDialog.getByRole("button", { name: "不保存并关闭" }).click();
    await expect(inspector.getByRole("textbox", { name: "模板名称", exact: true })).toHaveCount(0);
    expect(createRequests).toHaveLength(0);

    await page.getByRole("button", { name: "新建模板", exact: true }).click();
  await openHistoricalTemplateFixture(page);
    await fillTemplateIdentity(
      page,
      draftName,
      "用于验证草稿进入回收站后可永久删除",
    );
    const structure = page.getByRole("complementary", { name: "模板结构", exact: true });
    await firstRegionAction(page).click();
    const firstRegion = structure.getByRole("treeitem", { name: /^内容区域 1/ });
    await expect(firstRegion).toBeVisible();
    await firstRegion.click();
    await expect(firstRegion).toHaveAttribute("aria-selected", "true");
    await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    const addHeading = page.getByRole("dialog", { name: "添加槽位", exact: true })
      .getByRole("button", { name: "添加标题槽位", exact: true });
    await expect(addHeading).toBeEnabled();
    await addHeading.click();
    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === "/api/page-modules/dynamic-templates";
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const createdDraft = await responseData<{ templateId: string }>(await createResponsePromise);
    expect(createRequests, "已保存草稿必须恰好创建一个 Repository 模板身份")
      .toHaveLength(1);
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const draftTemplateCard = page.locator(
      `[data-unified-template-library="design"] [data-template-identity="template:${createdDraft.templateId}"]`,
    );
    await draftTemplateCard.getByRole("button", {
      name: `更多模板操作：${draftName}`,
      exact: true,
    }).click();
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const trashResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdDraft.templateId}/archive`;
    });
    await page.getByRole("dialog", { name: `将模板“${draftName}”移入回收站？` })
      .getByRole("button", { name: "移入回收站" })
      .click();
    expect((await trashResponsePromise).ok()).toBe(true);
    await page.getByRole("button", { name: "打开模板回收站", exact: true }).click();
    const archivedDraftTemplateCard = page.locator(
      `[data-unified-template-library="design"] [data-template-identity="template:${createdDraft.templateId}"]`,
    );
    await archivedDraftTemplateCard.getByRole("button", {
      name: `更多模板操作：${draftName}`,
      exact: true,
    }).click();
    await page.getByRole("menuitem", { name: "永久删除模板" }).click();
    const deleteDialog = page.getByRole("dialog", { name: `永久删除模板“${draftName}”？` });
    await expect(deleteDialog).toContainText("从未发布");
    await expect(deleteDialog).toContainText("没有版本历史");
    await expect(deleteDialog).toContainText("没有页面引用");
    const deleteResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "DELETE"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdDraft.templateId}`;
    });
    await deleteDialog.getByRole("button", { name: "永久删除模板" }).click();
    expect((await deleteResponsePromise).ok()).toBe(true);
    await expect(page.getByText(`模板“${draftName}”已永久删除`)).toBeVisible();

    const catalog = await readTemplateCatalogWithThrottleRetry<{
      items: Array<{ kind: string; template: { templateId?: string } }>;
    }>(page);
    expect(catalog.items.some((item) => (
      item.kind === "editable" && item.template.templateId === createdDraft.templateId
    ))).toBe(false);
  });
});
