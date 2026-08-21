import { expect, test, type Page } from "@playwright/test";

const publicRoutes = [
  "/",
  "/about",
  "/contact",
  "/custom",
  "/products",
  "/catalog",
  "/search",
  "/customer",
  "/privacy",
  "/__templates",
];

const allowedRgb = new Set([
  "255,255,255", "244,245,245", "24,26,27", "95,101,104", "110,116,119",
  "221,225,226", "184,190,193", "17,19,21", "247,248,248", "236,238,239",
  "16,18,19", "0,0,0", "140,63,59", "250,240,239", "215,182,180",
  "51,95,125", "238,244,247", "173,195,208", "53,99,72", "239,245,241",
  "172,196,180", "122,83,26", "251,244,232", "212,189,150",
]);

async function expectVisibleColorsToFollowStandard(page: Page, route: string) {
  const viewport = page.viewportSize();
  if (viewport) {
    await page.mouse.move(viewport.width - 2, viewport.height - 2);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  const issues = await page.evaluate(({ allowed, currentRoute }) => {
    const allowedColors = new Set(allowed);
    const properties = [
      "color", "backgroundColor", "borderTopColor", "borderRightColor",
      "borderBottomColor", "borderLeftColor", "outlineColor", "textDecorationColor",
      "fill", "stroke", "boxShadow", "backgroundImage",
    ] as const;
    const rgbPattern = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)/gi;
    const failures: string[] = [];
    const isNeutral = (r: number, g: number, b: number) => {
      const values = [r, g, b].map((value) => value / 255);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const lightness = (max + min) / 2;
      if (max === min) return true;
      const saturation = (max - min) / (lightness > 0.5 ? 2 - max - min : max + min);
      return saturation <= 0.08;
    };

    const inspectStyle = (element: Element, style: CSSStyleDeclaration, suffix = "") => {
      for (const property of properties) {
        if (property.startsWith("border")) {
          const side = property.slice("border".length, -"Color".length);
          if (style[`border${side}Style` as keyof CSSStyleDeclaration] === "none"
            || Number.parseFloat(String(style[`border${side}Width` as keyof CSSStyleDeclaration])) === 0) continue;
        }
        if (property === "outlineColor" && (style.outlineStyle === "none" || Number.parseFloat(style.outlineWidth) === 0)) continue;
        if (property === "textDecorationColor" && style.textDecorationLine === "none") continue;
        const value = style[property];
        if (!value || value === "none" || value === "normal") continue;
        for (const match of value.matchAll(rgbPattern)) {
          if (Number(match[4] ?? "1") === 0) continue;
          const key = `${Number(match[1])},${Number(match[2])},${Number(match[3])}`;
          if (allowedColors.has(key) || isNeutral(Number(match[1]), Number(match[2]), Number(match[3]))) continue;
          const html = element as HTMLElement;
          const id = html.id ? `#${html.id}` : "";
          const classes = typeof html.className === "string" && html.className.trim()
            ? `.${html.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : "";
          failures.push(`${currentRoute} ${element.tagName.toLowerCase()}${id}${classes}${suffix} ${property}=${value}`);
          if (failures.length >= 40) return;
        }
      }
    };

    for (const element of Array.from(document.querySelectorAll("body *"))) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width === 0 || rect.height === 0) continue;
      inspectStyle(element, style);
      for (const pseudo of ["::before", "::after"] as const) {
        const pseudoStyle = getComputedStyle(element, pseudo);
        if (pseudoStyle.content !== "none" && pseudoStyle.content !== "normal") inspectStyle(element, pseudoStyle, pseudo);
      }
      if (failures.length >= 40) break;
    }
    return [...new Set(failures)];
  }, { allowed: [...allowedRgb], currentRoute: route });

  expect(issues, `页面 ${route} 存在标准外的最终计算颜色`).toEqual([]);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`公开页面最终计算颜色符合全站标准 @ ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of publicRoutes) {
      await page.goto(route);
      await expect(page.locator("#root")).not.toBeEmpty();
      await expect(page.getByRole("banner")).toBeVisible();
      await expectVisibleColorsToFollowStandard(page, route);
    }
  });
}

test("后台登录页最终计算颜色符合后台标准", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/login");
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  await expectVisibleColorsToFollowStandard(page, "/admin/login");
});

test("后台代表页面在确定性失败态下仍符合颜色标准", async ({ page }) => {
  await page.addInitScript(() => {
    const user = { id: 1, username: "ui-color-audit", role: "SUPER_ADMIN" };
    localStorage.setItem("token", "ui-color-audit-token");
    localStorage.setItem("jewelry-auth", JSON.stringify({
      state: { token: "ui-color-audit-token", user, isLoggedIn: true },
      version: 0,
    }));
  });
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ success: false, message: "颜色审计的确定性失败态" }),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const route of [
    "/admin/dashboard",
    "/admin/products",
    "/admin/products/new",
    "/admin/editor/home",
    "/admin/site-content",
    "/admin/trade/overview",
  ]) {
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/admin\/login/);
    await expect(page.locator(".admin-shell-v7")).toBeVisible();
    if (route === "/admin/dashboard") {
      const refreshButton = page.locator(".admin-dashboard__refresh.is-error");
      await expect(refreshButton).toBeVisible();
      await expect(refreshButton).toBeEnabled();
    }
    await expectVisibleColorsToFollowStandard(page, route);
  }
});
