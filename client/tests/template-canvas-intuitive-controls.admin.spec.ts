import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ channel: process.env.TEMPLATE_BROWSER_CHANNEL });

async function mountCanvas(page: Page, query = "flow&zoom=1") {
  await page.setViewportSize({ width: 1900, height: 1200 });
  await page.route("**/__template-intuitive-controls*", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-canvas-interaction.tsx"></script></body></html>`,
  }));
  await page.route("**/api/**", (route) => route.abort());
  await page.goto(`/__template-intuitive-controls?${query}`);
  await expect(page.getByRole("navigation", { name: "画布编辑层级" })).toBeVisible();
  await page.getByRole("button", { name: "选择模板目标 内容区域", exact: true }).dblclick();
  await page.getByRole("button", { name: "选择模板目标 自由构图", exact: true }).click();
}

async function state(page: Page) {
  return JSON.parse(await page.getByTestId("state").textContent() ?? "{}");
}

async function designSnapshot(page: Page) {
  const value = await state(page);
  return { rules: value.stackRules, history: value.history, dirty: value.dirty, preview: value.preview };
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("当前操作控件不可测量");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("确定性 UI：普通选择与间距调整分离，退出恢复尺寸柄和列线", async ({ page }, testInfo) => {
  await mountCanvas(page, "grid&zoom=1");
  const before = await designSnapshot(page);
  const toolbar = page.locator("[data-canvas-selection-toolbar]");
  const navigation = page.getByRole("navigation", { name: "画布编辑层级" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toContainText("自由构图");
  await expect(toolbar).toContainText(/\d+ × \d+/);
  await expect(toolbar.getByRole("button", { name: "拖动移动自由构图", exact: true })).toHaveCount(1);
  await expect(navigation.getByRole("button", { name: "调整间距", exact: true })).toHaveCount(0);
  await expect(page.getByText("对象操作", { exact: true })).toHaveCount(0);
  const divider = page.getByRole("button", { name: "拖动调整第1与2列比例", exact: true });
  await expect(divider).toBeVisible();
  const dividerBox = await divider.boundingBox();
  expect(dividerBox?.width).toBeGreaterThanOrEqual(28);
  await expect(divider).toContainText(/\d/);
  await expect(page.getByRole("button", { name: "拖动调整左内边距", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "拖动调整间距", exact: true })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("selection-toolbar.png"), fullPage: true });
  await toolbar.getByRole("button", { name: "调整间距", exact: true }).click();
  for (const label of ["上内边距", "右内边距", "下内边距", "左内边距", "间距"]) {
    const handle = page.getByRole("button", { name: `拖动调整${label}`, exact: true });
    await expect(handle).toBeVisible();
    // 不依赖悬停说明辨认当前控制项和单位。
    await expect(handle).toContainText(label);
    await expect(handle).toContainText("px");
  }
  await expect(page.locator("[data-resize-direction]:visible")).toHaveCount(0);
  await expect(divider).not.toBeVisible();
  expect(await designSnapshot(page)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath("spacing-mode.png"), fullPage: true });
  await toolbar.getByRole("button", { name: "完成间距调整", exact: true }).click();
  await expect(page.getByRole("button", { name: "拖动调整左内边距", exact: true })).not.toBeVisible();
  await expect(divider).toBeVisible();
  expect(await page.locator("[data-resize-direction]:visible").count()).toBeGreaterThan(0);
  expect(await designSnapshot(page)).toEqual(before);
});

test("确定性 UI：间距可点击输入，取消零写入，应用一次撤销恢复", async ({ page }) => {
  await mountCanvas(page);
  await page.getByRole("button", { name: "调整间距", exact: true }).click();
  const before = await designSnapshot(page);
  const handle = page.getByRole("button", { name: "拖动调整左内边距", exact: true });
  await handle.click();
  const input = page.getByRole("spinbutton", { name: "左内边距数值", exact: true });
  await expect(input).toBeVisible();
  await input.fill("36");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await designSnapshot(page)).toEqual(before);
  await handle.click();
  await input.fill("24");
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await expect.poll(async () => (await state(page)).stackRules.padding.left.value).toBe(24);
  expect((await state(page)).history).toBe(before.history + 1);
  const nodeId = (await state(page)).ids.stack;
  await expect(page.frameLocator("iframe").locator(`[data-template-node-id="${nodeId}"]`)).toHaveCSS("padding-left", "24px");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect(await designSnapshot(page)).toEqual(before);
});

for (const zoom of [0.5, 1]) {
  test(`确定性 UI：下内边距向内拖动、Esc取消与一次提交 ${zoom}`, async ({ page }) => {
    await mountCanvas(page, `grid&zoom=${zoom}`);
    await page.getByRole("button", { name: "调整间距", exact: true }).click();
    const before = await designSnapshot(page);
    const nodeId = (await state(page)).ids.stack;
    const node = page.frameLocator("iframe").locator(`[data-template-node-id="${nodeId}"]`);
    const original = await node.evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom));
    const handle = page.getByRole("button", { name: "拖动调整下内边距", exact: true });
    const beginDrag = async () => {
      const point = await center(handle);
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"), point)).toBe("拖动调整下内边距");
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x, point.y - 24 * zoom, { steps: 4 });
      await expect(node).toHaveCSS("padding-bottom", `${original + 24}px`);
      expect((await state(page)).history).toBe(before.history);
      expect((await state(page)).dirty).toBe(before.dirty);
    };
    await beginDrag();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(node).toHaveCSS("padding-bottom", `${original}px`);
    expect(await designSnapshot(page)).toEqual(before);
    await beginDrag();
    await page.mouse.up();
    await expect(page.getByRole("spinbutton", { name: "下内边距数值", exact: true })).not.toBeVisible();
    expect((await state(page)).history).toBe(before.history + 1);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    expect(await designSnapshot(page)).toEqual(before);
  });
}

test("确定性 UI：间距方向键只处理对应轴，另一轴不改定义与历史", async ({ page }) => {
  await mountCanvas(page);
  await page.getByRole("button", { name: "调整间距", exact: true }).click();
  const before = await designSnapshot(page);
  const gap = page.getByRole("button", { name: "拖动调整间距", exact: true });
  await gap.press("ArrowDown");
  expect(await designSnapshot(page)).toEqual(before);
  await gap.press("ArrowRight");
  expect((await state(page)).stackRules.gap.value).toBe(before.rules.gap.value + 1);
  expect((await state(page)).history).toBe(before.history + 1);
  const top = page.getByRole("button", { name: "拖动调整上内边距", exact: true });
  const afterGap = await designSnapshot(page);
  await top.press("ArrowRight");
  expect(await designSnapshot(page)).toEqual(afterGap);
  await top.press("ArrowDown");
  expect((await state(page)).stackRules.padding.top.value).toBe((before.rules.padding?.top?.value ?? 0) + 1);
  expect((await state(page)).history).toBe(before.history + 2);
});

test("确定性 UI：尺寸柄兼容原可访问名称，悬停可见中文动作提示", async ({ page }) => {
  await mountCanvas(page);
  await page.getByRole("button", { name: "进入选中容器", exact: true }).click();
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 10, y: 60 } });
  const handle = page.getByRole("button", { name: "调整前图大小：e", exact: true });
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("title", /宽/);
  const before = await state(page);
  await handle.hover();
  const visibleHint = await handle.evaluate((button) => {
    const children = Array.from(button.querySelectorAll<HTMLElement>("span"));
    return children.filter((child) => getComputedStyle(child).visibility !== "hidden").map((child) => child.textContent).join(" ");
  });
  expect(visibleHint).toMatch(/宽/);
  expect((await state(page)).history).toBe(before.history);
});

test("确定性 UI：非法间距输入阻止切断点和完成，明确取消保留原设计", async ({ page }) => {
  await mountCanvas(page);
  await page.getByRole("button", { name: "调整间距", exact: true }).click();
  const before = await designSnapshot(page);
  const breakpointBefore = (await state(page)).breakpoint;
  await page.getByRole("button", { name: "拖动调整左内边距", exact: true }).click();
  const input = page.getByRole("spinbutton", { name: "左内边距数值", exact: true });
  await input.fill("-1");
  await page.getByRole("button", { name: "聚焦mobile", exact: true }).click();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("-1");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toBeFocused();
  expect((await state(page)).breakpoint).toBe(breakpointBefore);
  expect(await designSnapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "完成间距调整", exact: true }).click();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("-1");
  expect(await designSnapshot(page)).toEqual(before);
  await page.getByRole("button", { name: /^视图辅助/ }).click();
  await page.getByRole("button", { name: "多设备并排预览", exact: true }).click();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("-1");
  await expect(input).toBeFocused();
  await expect(page.getByRole("button", { name: "返回单画布编辑", exact: true })).not.toBeVisible();
  expect(await designSnapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(input).not.toBeVisible();
  expect(await designSnapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "完成间距调整", exact: true }).click();
  await expect(page.getByRole("button", { name: "调整间距", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "聚焦mobile", exact: true }).click();
  await expect.poll(async () => (await state(page)).breakpoint).toBe("mobile");
  expect(await designSnapshot(page)).toEqual(before);
});
