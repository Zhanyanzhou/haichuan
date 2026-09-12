import { expect, test } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

const useMock = process.env.VITE_USE_MOCK === "true";

const REVIEW_INPUTS = {
  brandReviewReference: ["品牌审核记录", "TEST-BRAND-APPROVAL"],
  legalEntityReviewReference: ["经营主体审核记录", "TEST-LEGAL-APPROVAL"],
  privacyPolicyReviewReference: ["隐私说明审核记录", "TEST-PRIVACY-APPROVAL"],
  seoReviewReference: ["搜索信息审核记录", "TEST-SEO-APPROVAL"],
  canonicalBaseUrl: ["正式站点网址", "https://example.invalid"],
} as const;

async function installPublicationSettings(page: import("@playwright/test").Page) {
  await authenticateAdmin(page);
  const state = {
    settings: { siteName: "发布资料测试站点", defaultLocale: "zh-CN", publishedLocales: ["zh-CN"] } as Record<string, unknown>,
    writes: [] as Record<string, unknown>[], failSave: false, failReadiness: false,
  };
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "PUT") {
      state.writes.push(route.request().postDataJSON());
      if (state.failSave) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      state.settings = { ...state.settings, ...route.request().postDataJSON() };
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ code: 200, data: state.settings }) });
  });
  await page.route("**/api/settings/publication-readiness", (route) => {
    if (state.failReadiness) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    const blockers = ["brandPresentationMode", ...Object.keys(REVIEW_INPUTS)]
      .filter((field) => !state.settings[field])
      .map((field) => ({ code: `${field}_MISSING`, area: "brand", field: `siteSettings.${field}`, message: `待完善 ${field}` }));
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ code: 200, data: {
      schemaVersion: 2, ready: blockers.length === 0, status: blockers.length ? "BLOCKED" : "READY", persisted: true, blockers,
    } }) });
  });
  return state;
}

test.describe("站点发布资料入口（自有 API Mock）", () => {
  test.skip(useMock, "使用自有 API 路由验证保存与回显，不使用应用内 Mock");

  test("必要资料齐全时审核编号可留空，页面显示可发布且不自动保存", async ({ page }) => {
    const state = await installPublicationSettings(page);
    state.settings = {
      ...state.settings,
      brandPresentationMode: "text-only",
      canonicalBaseUrl: "https://example.invalid",
    };
    await page.route("**/api/settings/publication-readiness", (route) => route.fulfill({
      json: { code: 200, data: { schemaVersion: 2, ready: true, status: "READY", persisted: true, blockers: [] } },
    }));
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin/site-content");
      await expect(page.getByText("站点资料已满足发布要求")).toBeVisible();
      await expect(page.getByRole("radio", { name: "纯文字品牌名称", exact: true })).toBeChecked();
      await expect(page.getByLabel("品牌审核记录", { exact: true })).toHaveValue("");
      await expect(page.getByText("选填，记录品牌负责人已确认的编号或批准版本，不影响页面发布。")).toBeVisible();
      await expect(page.getByRole("button", { name: /^完善.*审核记录$/ })).toHaveCount(0);
    }
    expect(state.writes).toHaveLength(0);
  });

  test("六项资料可保存，准备度刷新并在重新打开后回显", async ({ page }) => {
    const state = await installPublicationSettings(page);
    await page.goto("/admin/site-content?field=canonicalBaseUrl");
    await expect(page.getByLabel("正式站点网址", { exact: true })).toBeFocused();
    await expect(page.getByText("站点资料还有 6 项待完善")).toBeVisible();
    await page.getByRole("radio", { name: "纯文字品牌名称", exact: true }).check();
    for (const [label, value] of Object.values(REVIEW_INPUTS)) await page.getByLabel(label, { exact: true }).fill(value);
    await expect(page.getByText("有未保存修改，保存后重新检查发布准备度")).toBeVisible();
    await page.getByRole("button", { name: /保存设置$/ }).click();
    await expect(page.getByText("站点资料已满足发布要求")).toBeVisible();
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].brandPresentationMode).toBe("text-only");
    for (const [field, [, value]] of Object.entries(REVIEW_INPUTS)) expect(state.writes[0][field]).toBe(value);
    await page.reload();
    await expect(page.getByRole("radio", { name: "纯文字品牌名称", exact: true })).toBeChecked();
    for (const [label, value] of Object.values(REVIEW_INPUTS)) await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
    await expect(page.getByRole("link", { name: "返回店铺装修", exact: true })).toHaveAttribute("href", "/admin/editor/home");
  });

  test("无效网址阻止保存；保存失败保留审核记录并可重试", async ({ page }) => {
    const state = await installPublicationSettings(page);
    await page.goto("/admin/site-content");
    await page.getByRole("button", { name: "完善品牌审核记录", exact: true }).click();
    await expect(page.getByLabel("品牌审核记录", { exact: true })).toBeFocused();
    await page.getByLabel("品牌审核记录", { exact: true }).fill("TEST-KEEP-INPUT");
    for (const invalid of ["http://example.invalid", "https://example.invalid/page", "https://user:pass@example.invalid", "https://example.invalid?q=1"]) {
      await page.getByLabel("正式站点网址", { exact: true }).fill(invalid);
      await page.getByRole("button", { name: /保存设置$/ }).click();
      await expect(page.getByText("请输入仅包含域名的 HTTPS 网址，不要附带页面路径或参数", { exact: true })).toBeVisible();
    }
    expect(state.writes).toHaveLength(0);
    state.failSave = true;
    await page.getByLabel("正式站点网址", { exact: true }).fill("https://example.invalid");
    await page.getByRole("button", { name: /保存设置$/ }).click();
    await expect(page.getByText("店铺资料保存失败，请检查填写内容后重试。", { exact: true })).toBeVisible();
    await expect(page.getByLabel("品牌审核记录", { exact: true })).toHaveValue("TEST-KEEP-INPUT");
    expect(state.settings.brandReviewReference).toBeUndefined();
    state.failSave = false;
    await page.getByRole("button", { name: /保存设置$/ }).click();
    await expect(page.getByText("店铺资料已保存", { exact: true })).toBeVisible();
    expect(state.settings.brandReviewReference).toBe("TEST-KEEP-INPUT");
  });

  test("准备度读取失败不会伪装可发布，重查不覆盖表单", async ({ page }) => {
    const state = await installPublicationSettings(page);
    state.failReadiness = true;
    await page.goto("/admin/site-content?field=unknown-field");
    await expect(page.getByText("暂时无法读取发布准备度", { exact: true })).toBeVisible();
    await page.getByLabel("品牌审核记录", { exact: true }).fill("TEST-UNSAVED");
    state.failReadiness = false;
    await page.getByRole("button", { name: "重新检查发布准备度", exact: true }).click();
    await expect(page.getByText("有未保存修改，保存后重新检查发布准备度", { exact: true })).toBeVisible();
    await expect(page.getByLabel("品牌审核记录", { exact: true })).toHaveValue("TEST-UNSAVED");
    await expect(page.getByText("站点资料已满足发布要求", { exact: true })).toHaveCount(0);
    expect(state.writes).toHaveLength(0);
  });

  test("语言异常可明确恢复中文，仅保存后写入服务端", async ({ page }) => {
    const state = await installPublicationSettings(page);
    state.settings.defaultLocale = "en";
    state.settings.publishedLocales = ["en"];
    await page.goto("/admin/site-content?field=publishedLocales");
    await expect(page.getByLabel("公开语言设置", { exact: true })).toBeFocused();
    await expect(page.getByText("默认语言：en", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "恢复中文发布设置", exact: true }).click();
    await expect(page.getByText("默认语言：简体中文（zh-CN）", { exact: true })).toBeVisible();
    expect(state.settings.defaultLocale).toBe("en");
    expect(state.writes).toHaveLength(0);
    await page.getByRole("button", { name: /保存设置$/ }).click();
    await expect(page.getByText("店铺资料已保存", { exact: true })).toBeVisible();
    expect(state.writes[0]).toMatchObject({ defaultLocale: "zh-CN", publishedLocales: ["zh-CN"] });
    await page.reload();
    await expect(page.getByText("公开语言：简体中文（zh-CN）", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "恢复中文发布设置", exact: true })).toHaveCount(0);
  });
});

async function authenticateAdmin(page: import("@playwright/test").Page) {
  await installAdminSession(page, {
    username: "mock-admin",
    realName: "Mock Admin",
  });
  await page.route("**/api/settings/publication-readiness", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data: {
      schemaVersion: 2, status: "BLOCKED", ready: false, persisted: true,
      blockers: [{ code: "BRAND_REVIEW_MISSING", area: "brand", field: "siteSettings.brandReviewReference", message: "品牌审核记录尚未填写。" }],
    } }),
  }));
}

test.describe("店铺资料加载失败保护", () => {
  test.skip(useMock, "该回归通过拦截真实 API 路径构造确定性的加载失败状态");

  test("加载失败时禁止保存，重试成功后回显并允许保存", async ({ page }) => {
    const antdConsoleProblems: string[] = [];
    page.on("console", (entry) => {
      const text = entry.text();
      if (/Static function can not consume context|destroyOnClose.*deprecated/i.test(text)) {
        antdConsoleProblems.push(text);
      }
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await authenticateAdmin(page);

    let settingsRequestCount = 0;
    let updateRequestCount = 0;
    let lastUpdateBody: Record<string, unknown> | null = null;
    let releaseFailedRequest: (() => void) | undefined;
    const failedRequestGate = new Promise<void>((resolve) => {
      releaseFailedRequest = resolve;
    });

    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "PUT") {
        updateRequestCount += 1;
        lastUpdateBody = route.request().postDataJSON();
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ code: 200, data: route.request().postDataJSON(), message: "ok" }),
        });
        return;
      }

      settingsRequestCount += 1;
      if (settingsRequestCount === 1) {
        await failedRequestGate;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, message: "service unavailable" }),
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: { siteName: "远端店铺名称", contactPhone: "400-123-4567" },
          message: "ok",
        }),
      });
    });

    await page.goto("/admin/site-content");
    await expect(page.getByText("正在加载店铺资料…")).toBeVisible();
    releaseFailedRequest?.();

    await expect(page.getByText("店铺资料读取失败。为避免覆盖未知的远端内容，当前已禁止编辑和保存。"))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "保存设置" })).toHaveCount(0);

    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByLabel("网站名称")).toHaveValue("远端店铺名称");
    await expect(page.getByRole("button", { name: "保存设置" })).toBeEnabled();

    await page.getByLabel("网站名称").fill("已确认的店铺名称");
    await page.getByLabel("门店地图链接").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("请输入以 http:// 或 https:// 开头的地图链接")).toBeVisible();
    expect(updateRequestCount).toBe(0);

    await page.getByLabel("门店地图链接").fill("https://maps.example.com/store");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect.poll(() => updateRequestCount).toBe(1);
    expect(lastUpdateBody).toMatchObject({
      siteName: "已确认的店铺名称",
      storeMapUrl: "https://maps.example.com/store",
    });
    await expect(page.getByText("店铺资料已保存")).toBeVisible();
    expect(antdConsoleProblems).toEqual([]);
  });

  test("远端明确返回空数据时展示空态并允许首次配置", async ({ page }) => {
    await authenticateAdmin(page);
    await page.route("**/api/settings", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: {}, message: "ok" }),
      }),
    );

    await page.goto("/admin/site-content");

    await expect(page.getByText("当前尚未配置店铺资料。填写下方表单并保存后，将用于网站页眉、页脚和默认 SEO。"))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "保存设置" })).toBeEnabled();
  });
});
