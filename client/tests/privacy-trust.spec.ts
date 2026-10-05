import { expect, test, type Page } from "@playwright/test";

/**
 * P0-C 公开信息真实性与隐私 测试
 * - 联系信息空设置 / 加载失败 / 真实设置三态
 * - /privacy 匿名可访问 + 隐私链接
 * - 行为分析按当前负责人决策默认开启，并使用匿名会话标识
 * - 不出现假电话 / 假邮箱 / 假地址
 * - 桌面与移动端无横向溢出 + 键盘可操作
 */

const useMock = process.env.VITE_USE_MOCK === "true";
const analyticsConfigured = process.env.VITE_ANALYTICS_ENABLED === "true";

// 明确禁止出现在前台的假值
const FORBIDDEN_FAKE_VALUES = [
  "400-888-8888",
  "contact@haichuan.com",
  "深圳市罗湖区水贝珠宝产业园",
  "haichuanjewelry.com",
];

function settingsBody(overrides: Record<string, any> = {}) {
  return JSON.stringify({
    code: 200,
    data: {
      siteName: "海川珠宝",
      contactPhone: "",
      contactEmail: "",
      contactAddress: "",
      businessHours: "",
      ...overrides,
    },
    message: "success",
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function expectNoForbiddenFakeValues(page: Page) {
  const body = await page.evaluate(() => document.body.innerText);
  for (const fake of FORBIDDEN_FAKE_VALUES) {
    expect(body).not.toContain(fake);
  }
}

test.describe("联系信息真实性", () => {
  test("演示数据提示只在 mock 模式出现", async ({ page }) => {
    await page.goto("/catalog");
    const notice = page.getByRole("complementary", { name: "演示数据说明" });

    if (useMock) {
      await expect(notice).toBeVisible();
      await expect(notice).toContainText("不代表真实库存、价格或服务承诺");
      return;
    }

    await expect(notice).toHaveCount(0);
  });

  test("设置接口失败时展示安全错误态且不泄露假数据", async ({ page }) => {
    test.skip(useMock, "模拟数据模式不发送设置网络请求");
    await page.route("**/api/settings/public**", (route) =>
      route.fulfill({ status: 500 }),
    );
    await page.goto("/contact");
    await expect(page.getByRole("heading", { name: "提交咨询需求" })).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "联系信息暂时无法加载" }),
    ).toBeVisible();
    await expectNoForbiddenFakeValues(page);
    await expectNoHorizontalOverflow(page);
  });

  test("空设置时展示空态且不泄露假数据", async ({ page }) => {
    test.skip(useMock, "模拟数据模式不发送设置网络请求");
    await page.route("**/api/settings/public**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: settingsBody(),
      }),
    );
    await page.goto("/contact");
    await expect(page.getByText("公开联系方式正在完善")).toBeVisible();
    await expectNoForbiddenFakeValues(page);
    await expectNoHorizontalOverflow(page);
  });

  test("真实设置只展示后台返回的值", async ({ page }) => {
    test.skip(useMock, "模拟数据模式不发送设置网络请求");
    await page.route("**/api/settings/public**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: settingsBody({
          contactPhone: "13800000000",
          contactEmail: "service@example.org",
          contactAddress: "测试门店地址",
          businessHours: "工作日 10:00-18:00",
        }),
      }),
    );
    await page.goto("/contact");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "13800000000", exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "service@example.org", exact: true })).toBeVisible();
    await expect(main.getByText("测试门店地址", { exact: true })).toBeVisible();
    await expect(main.getByText("工作日 10:00-18:00", { exact: true })).toBeVisible();
    await expectNoForbiddenFakeValues(page);
  });

  test("mock 模式下联系页仍不出现假兜底数据", async ({ page }) => {
    test.skip(!useMock, "仅在模拟数据模式验证 mock 默认值");
    await page.goto("/contact");
    await expectNoForbiddenFakeValues(page);
    // mock 默认联系信息为空，应出现空态
    await expect(page.getByText("公开联系方式正在完善")).toBeVisible();
  });
});

test.describe("隐私页面", () => {
  test("匿名可访问且内容完整", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("customerToken");
      localStorage.removeItem("customer");
    });
    await page.goto("/privacy");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/privacy");
    await expect(page.getByRole("heading", { name: "隐私说明" })).toBeVisible();
    // 核心章节存在
    await expect(page.getByRole("heading", { name: "我们收集哪些信息" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "你的权利" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "行为分析" })).toBeVisible();
    await expectNoForbiddenFakeValues(page);
    await expectNoHorizontalOverflow(page);
  });

  test("咨询表单阅读隐私说明后恢复短时填写状态且不恢复同意", async ({ page }) => {
    await page.goto("/contact");
    await page.locator("#cf-name").fill("本地回填验收用户");
    await page.locator("#cf-phone").fill("13800000000");
    await page.locator("#cf-message").fill("只用于本地隐私返回链路验收");
    await page.locator("#cf-privacy-consent").check();

    const privacyLink = page.locator("form").getByRole("link", { name: "隐私说明" });
    const privacyLinkBox = await privacyLink.boundingBox();
    expect(privacyLinkBox).not.toBeNull();
    expect(privacyLinkBox!.width).toBeGreaterThanOrEqual(44);
    expect(privacyLinkBox!.height).toBeGreaterThanOrEqual(44);
    await privacyLink.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/privacy");
    await page.getByRole("link", { name: "返回继续填写" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe("/contact");
    await expect(page.locator("#cf-name")).toHaveValue("本地回填验收用户");
    await expect(page.locator("#cf-phone")).toHaveValue("13800000000");
    await expect(page.locator("#cf-message")).toHaveValue("只用于本地隐私返回链路验收");
    await expect(page.locator("#cf-privacy-consent")).not.toBeChecked();

    const browserStorage = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }));
    expect(JSON.stringify(browserStorage)).not.toContain("本地回填验收用户");
    expect(JSON.stringify(browserStorage)).not.toContain("13800000000");
    expect(JSON.stringify(browserStorage)).not.toContain("只用于本地隐私返回链路验收");
  });

  test("客户身份切换后不会恢复上一客户的咨询草稿", async ({ page }) => {
    await page.goto("/contact");
    await page.evaluate(async () => {
      const { useCustomerAuthStore } = await import("/src/store/customerAuthStore.ts");
      useCustomerAuthStore.getState().setAuth({
        id: 101,
        name: "客户甲",
        phone: "13800000101",
        email: "a-owner@example.test",
      });
    });

    await expect(page.locator("#cf-name")).toHaveValue("客户甲");
    await page.locator("#cf-email").fill("a-private@example.test");
    await page.locator("#cf-message").fill("客户甲的私密咨询内容");
    await page.locator("form").getByRole("link", { name: "隐私说明" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/privacy");

    await page.evaluate(async () => {
      const { useCustomerAuthStore } = await import("/src/store/customerAuthStore.ts");
      useCustomerAuthStore.getState().setAuth({
        id: 202,
        name: "客户乙",
        phone: "13800000202",
        email: "b-owner@example.test",
      });
    });
    await page.getByRole("link", { name: "返回继续填写" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe("/contact");
    await expect(page.locator("#cf-name")).toHaveValue("客户乙");
    await expect(page.locator("#cf-phone")).toHaveValue("13800000202");
    await expect(page.locator("#cf-email")).toHaveValue("b-owner@example.test");
    await expect(page.locator("#cf-message")).toHaveValue("");
    await expect(page.locator("#cf-privacy-consent")).not.toBeChecked();
    await expect(page.locator("form")).not.toContainText("客户甲的私密咨询内容");

    const selectionDraftForAnotherOwner = await page.evaluate(async () => {
      const {
        consultationDraftOwner,
        readSelectionConsultationDraft,
        saveSelectionConsultationDraft,
      } = await import("/src/utils/consultationJourneyState.ts");
      saveSelectionConsultationDraft(consultationDraftOwner(101), {
        customerName: "客户甲",
        phone: "13800000101",
        email: "a-private@example.test",
        wechat: "a-private-wechat",
        message: "客户甲的选款咨询内容",
      });
      return readSelectionConsultationDraft(consultationDraftOwner(202));
    });
    expect(selectionDraftForAnotherOwner).toBeNull();
  });

  test("页脚隐私链接跳转到 /privacy", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await page.getByRole("link", { name: "隐私说明" }).last().click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/privacy");
  });

  test("无联系信息时隐私页引导至咨询表单", async ({ page }) => {
    test.skip(useMock, "模拟数据模式使用内置空设置");
    await page.route("**/api/settings/public**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: settingsBody(),
      }),
    );
    await page.goto("/privacy");
    const privacyRequest = page.getByRole("link", { name: "提交隐私与个人信息请求" });
    await expect(privacyRequest).toBeVisible();
    await expect(privacyRequest).toHaveAttribute("href", "/contact?type=privacy");
  });
});

test.describe("匿名行为分析", () => {
  test("默认未开启时不显示偏好、不创建会话且不发送事件", async ({ page }) => {
    test.skip(analyticsConfigured, "该用例验证生产安全默认关闭配置");
    const analyticsRequests: Record<string, unknown>[] = [];
    await page.context().clearCookies();
    await page.addInitScript(() => {
      sessionStorage.removeItem("hc.analytics-session");
      sessionStorage.removeItem("hc.analytics-visitor");
      localStorage.setItem("hc.analytics-visitor", JSON.stringify({
        id: "v_legacy-cross-session-id",
        createdAt: Date.now(),
      }));
      localStorage.removeItem("_asid");
    });
    await page.route("**/api/analytics/track", async (route) => {
      analyticsRequests.push(route.request().postDataJSON());
      await route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/catalog");
    const search = page.getByPlaceholder("搜索作品名称或编号");
    await expect(search).toBeVisible();
    await expect(
      page.getByRole("region", { name: "分析数据偏好" }),
    ).toHaveCount(0);

    await search.fill("戒指");
    await page.getByRole("button", { name: "搜索" }).click();
    await page.waitForTimeout(250);

    expect(analyticsRequests).toEqual([]);
    expect(
      await page.evaluate(() => sessionStorage.getItem("hc.analytics-session")),
    ).toBeNull();
    expect(
      await page.evaluate(() => sessionStorage.getItem("hc.analytics-visitor")),
    ).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("hc.analytics-visitor"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("_asid"))).toBeNull();
  });

  test("显式开启后仍须同意，撤回后清除会话并停止发送", async ({ page }) => {
    test.skip(!analyticsConfigured, "需要 VITE_ANALYTICS_ENABLED=true 的独立构建验证");
    const analyticsRequests: Record<string, unknown>[] = [];
    await page.context().clearCookies();
    await page.addInitScript(() => {
      sessionStorage.removeItem("hc.analytics-session");
      sessionStorage.removeItem("hc.analytics-visitor");
      localStorage.setItem("hc.analytics-visitor", JSON.stringify({
        id: "v_legacy-cross-session-id",
        createdAt: Date.now(),
      }));
      localStorage.removeItem("_asid");
    });
    await page.route("**/api/analytics/track", async (route) => {
      analyticsRequests.push(route.request().postDataJSON());
      await route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/catalog");
    const search = page.getByPlaceholder("搜索作品名称或编号");
    await expect(search).toBeVisible();
    await expect(
      page.getByRole("region", { name: "分析数据偏好" }),
    ).toBeVisible();

    await search.fill("戒指");
    await page.getByRole("button", { name: "搜索" }).click();
    await page.waitForTimeout(250);
    expect(analyticsRequests).toEqual([]);
    expect(
      await page.evaluate(() => sessionStorage.getItem("hc.analytics-session")),
    ).toBeNull();
    expect(
      await page.evaluate(() => sessionStorage.getItem("hc.analytics-visitor")),
    ).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("hc.analytics-visitor"))).toBeNull();

    await page.getByRole("button", { name: "同意匿名分析" }).click();
    await expect.poll(() => analyticsRequests.length).toBe(1);
    expect(analyticsRequests[0]).toMatchObject({
      eventName: "page_view",
      consentGranted: true,
      consentVersion: "analytics-v1",
      pagePath: "/catalog",
    });
    expect(String(analyticsRequests[0].sessionId)).toMatch(/^s_[a-z0-9-]+$/i);
    expect(String(analyticsRequests[0].visitorId)).toMatch(/^v_[a-z0-9-]+$/i);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const stored = sessionStorage.getItem("hc.analytics-session");
          return stored ? JSON.parse(stored).id : null;
        }),
      )
      .toMatch(/^s_[a-z0-9-]+$/i);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const stored = sessionStorage.getItem("hc.analytics-visitor");
          return stored ? JSON.parse(stored).id : null;
        }),
      )
      .toMatch(/^v_[a-z0-9-]+$/i);
    expect(await page.evaluate(() => localStorage.getItem("hc.analytics-visitor"))).toBeNull();

    await page
      .getByRole("button", { name: "打开分析数据偏好设置" })
      .click();
    await page.getByRole("button", { name: "撤回同意" }).click();
    expect(
      await page.evaluate(() => sessionStorage.getItem("hc.analytics-session")),
    ).toBeNull();
    expect(
      await page.evaluate(() => sessionStorage.getItem("hc.analytics-visitor")),
    ).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("hc.analytics-visitor"))).toBeNull();
    await expect
      .poll(() => page.evaluate(() => decodeURIComponent(document.cookie)))
      .toContain("hc_analytics_consent=analytics-v1:withdrawn");
    await page.waitForTimeout(100);
    const requestCountAfterWithdrawal = analyticsRequests.length;

    await search.fill("项链");
    await page.getByRole("button", { name: "搜索" }).click();
    await page.waitForTimeout(250);
    expect(analyticsRequests).toHaveLength(requestCountAfterWithdrawal);
  });
});

test.describe("响应式与键盘", () => {
  for (const { name, width } of [
    { name: "桌面 1440", width: 1440 },
    { name: "平板 768", width: 768 },
    { name: "移动 390", width: 390 },
  ]) {
    test(`${name} 像素下隐私页与联系页无横向溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/privacy");
      await expectNoHorizontalOverflow(page);
      await page.goto("/contact");
      await expectNoHorizontalOverflow(page);
    });
  }

  test("公开菜单可用键盘打开和关闭", async ({ page }) => {
    await page.goto("/privacy");
    await page.getByRole("button", { name: "打开菜单" }).press("Enter");
    await expect(page.getByRole("button", { name: "关闭菜单" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "打开菜单" })).toBeVisible();
  });

  test("联系页表单可键盘提交并展示必填错误", async ({ page }) => {
    await page.goto("/contact");
    // 直接点击提交，校验必填错误
    await page.getByRole("button", { name: "提交需求" }).click();
    await expect(page.getByText("请输入姓名")).toBeVisible();
    await expect(page.getByText("请输入正确的手机号码")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("SEO 与索引", () => {
  test("隐私页有独立标题且不含未确认域名", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle(/隐私说明/);
    const html = await page.content();
    expect(html).not.toContain("haichuanjewelry.com");
  });

  test("旧搜索深链进入选款中心并使用不拼搜索词的中性标题", async ({ page }) => {
    await page.goto("/search?query=平安扣");
    await expect(page).toHaveURL(/\/catalog\?query=%E5%B9%B3%E5%AE%89%E6%89%A3/);
    await expect(page).toHaveTitle(/选款中心 \| 海川珠宝/);
    await expect(page).not.toHaveTitle(/平安扣/);
  });

  test("联系页有独立标题", async ({ page }) => {
    await page.goto("/contact");
    await expect(page).toHaveTitle(/提交咨询需求/);
  });

  test("未绑定严格预渲染证据的公开 SPA 壳保持 noindex", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex,\s*nofollow/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });
});
