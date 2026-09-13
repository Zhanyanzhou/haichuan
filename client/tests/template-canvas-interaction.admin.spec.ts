import { expect, test, type Locator, type Page } from "@playwright/test";
import { canvasMarqueeRect, canvasRectIntersects, crossesCanvasDragThreshold, cycleCanvasHit, isCanvasTargetInScope } from "../src/page-builder/template-editor/templateCanvasInteraction";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const errors: string[] = [];
    Object.assign(window, { __resizeNativeErrors: errors });
    window.addEventListener("error", (event) => errors.push(event.error?.stack ? `${event.message}\n${event.error.stack}` : event.message));
  });
});
test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  for (const frame of page.frames()) {
    await frame.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await frame.evaluate(() => (window as unknown as { __resizeNativeErrors?: string[] }).__resizeNativeErrors ?? [])).toEqual([]);
  }
});

async function mountCanvas(page: Page, flow = false, anchor = false, cross = false, grid = false, overlap = false, legacy = false, extra = "") {
  await page.route("**/__template-canvas-interaction*", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-canvas-interaction.tsx"></script></body></html>` }));
  await page.route("**/api/**", (route) => route.abort());
  await page.goto(`/__template-canvas-interaction?${flow ? "flow&" : ""}${anchor ? "anchor&" : ""}${cross ? "cross&" : ""}${grid ? "grid&" : ""}${overlap ? "overlap&" : ""}${legacy ? "legacy" : ""}&${extra}`);
  await expect(page.getByRole("navigation", { name: "画布编辑层级" })).toBeVisible();
}
async function snapshot(page: Page) { return JSON.parse(await page.getByTestId("state").textContent() ?? "{}"); }
async function enterStack(page: Page) {
  await page.getByRole("button", { name: "选择模板目标 内容区域", exact: true }).dblclick();
  await page.getByRole("button", { name: "选择模板目标 自由构图", exact: true }).dblclick();
  const state = await snapshot(page);
  await expect.poll(async () => (await snapshot(page)).scope).toBe(state.ids.stack);
}

test("屏幕阈值、当前层过滤、框选交集和重叠循环是确定的", () => {
  expect(crossesCanvasDragThreshold(3, 0)).toBe(false);
  expect(crossesCanvasDragThreshold(4, 0)).toBe(true);
  const target = { targetId: "node:a", ownerNodeId: "a", parentTargetId: "node:group", kind: "image", label: "图", locator: { attributes: ["data-template-node-id" as const], value: "a" } };
  expect(isCanvasTargetInScope(target, "group")).toBe(true);
  expect(isCanvasTargetInScope({ ...target, locked: true }, "group")).toBe(false);
  expect(isCanvasTargetInScope(target, "root")).toBe(false);
  const rect = canvasMarqueeRect({ x: 40, y: 30 }, { x: 10, y: 5 });
  expect(rect).toEqual({ left: 10, top: 5, width: 30, height: 25 });
  expect(canvasRectIntersects(rect, { left: 20, top: 15, width: 4, height: 4 })).toBe(true);
  const boxes = [target, { ...target, targetId: "node:b" }].map((item) => ({ target: item, hitRect: rect }));
  expect(cycleCanvasHit(boxes, { x: 20, y: 15 })?.target.targetId).toBe("node:b");
  expect(cycleCanvasHit(boxes, { x: 20, y: 15 }, "node:b")?.target.targetId).toBe("node:a");
});

test("隔离画布：流式宽度只固定横轴，间距和内边距走同一事务", async ({ page }) => {
  await mountCanvas(page, true); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 10, y: 60 } });
  const before = await snapshot(page);
  const handle = page.getByRole("button", { name: "调整前图大小：e", exact: true });
  const bounds = await handle.boundingBox(); if (!bounds) throw new Error("缺少流式缩放柄");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 35, bounds.y + bounds.height / 2); await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).history).toBe(1);
  expect((await snapshot(page)).firstRules.width.value).toBeGreaterThan(before.firstRules.width.value);
  expect((await snapshot(page)).firstRules.height).toEqual(before.firstRules.height);
  await page.getByRole("navigation", { name: "画布编辑层级" }).getByRole("button", { name: "自由构图", exact: true }).click();
  await page.getByRole("button", { name: "调整间距", exact: true }).click();
  await page.getByRole("button", { name: "拖动调整间距", exact: true }).press("ArrowRight");
  expect((await snapshot(page)).stackRules.gap.value).toBe(21);
  await page.getByRole("button", { name: "拖动调整左内边距", exact: true }).press("ArrowRight");
  expect((await snapshot(page)).stackRules.padding.left.value).toBe(1);
  expect((await snapshot(page)).history).toBe(3);
});

for (const zoom of [.5, 1, 1.5]) test(`尺寸实际反馈：流式三柄、百分比限值、取消与一次提交 ${zoom}`, async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 });
  await mountCanvas(page, true, false, false, false, false, false, `limits&zoom=${zoom}`);
  await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 12, y: 35 } });
  const before = await snapshot(page);
  const node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  const overlay = page.locator(`[data-overlay-selection-for="node:${before.ids.first}"]`);
  await expect(overlay.locator("[data-resize-direction]")).toHaveCount(3);
  await expect(overlay.locator('[data-resize-direction="w"]')).toHaveCount(0);
  const agree = async () => {
    await expect.poll(async () => {
      const actual = await node.boundingBox(); const outline = await overlay.boundingBox();
      if (!actual || !outline) return Infinity;
      return Math.max(...(["x", "y", "width", "height"] as const).map((axis) => Math.abs(actual[axis] - outline[axis])));
    }).toBeLessThan(2);
  };
  const start = await overlay.locator('[data-resize-direction="se"]').boundingBox();
  if (!start) throw new Error("缺少右下尺寸柄");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(start.x + 320 * zoom, start.y + 160 * zoom);
  await expect(page.locator("[data-resize-feedback]")).toContainText("已达到尺寸限制");
  await expect(page.locator("[data-overlay-snap-guide]")).toHaveCount(0);
  await agree();
  const limited = await node.evaluate((element) => {
    const parent = element.parentElement!; const style = getComputedStyle(parent);
    const parentWidth = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { width: parseFloat(getComputedStyle(element).width), height: parseFloat(getComputedStyle(element).height), maxWidth: parentWidth * .3 };
  });
  expect(limited.width).toBeCloseTo(limited.maxWidth, 0); expect(limited.height).toBe(180);
  expect((await snapshot(page)).history).toBe(0);
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect((await snapshot(page)).firstRules).toEqual(before.firstRules); expect((await snapshot(page)).dirty).toBe(false);
  await agree();
  const second = await overlay.locator('[data-resize-direction="e"]').boundingBox(); if (!second) throw new Error("缺少右尺寸柄");
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2); await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2 + 25 * zoom, second.y + second.height / 2);
  await agree(); await page.mouse.up();
  expect((await snapshot(page)).history).toBe(1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).firstRules).toEqual(before.firstRules); await agree();
  const minimum = await overlay.locator('[data-resize-direction="e"]').boundingBox(); if (!minimum) throw new Error("缺少右尺寸柄");
  await page.mouse.move(minimum.x + minimum.width / 2, minimum.y + minimum.height / 2); await page.mouse.down();
  await page.mouse.move(minimum.x - 250 * zoom, minimum.y + minimum.height / 2);
  await expect(page.locator("[data-resize-feedback]")).toContainText("已达到尺寸限制"); await agree();
  const smallest = await node.evaluate((element) => {
    const parent = element.parentElement!; const style = getComputedStyle(parent);
    return { actual: parseFloat(getComputedStyle(element).width), minimum: (parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) * .15 };
  });
  expect(smallest.actual).toBeCloseTo(smallest.minimum, 0);
  await page.keyboard.press("Escape"); await page.mouse.up();
  const bottom = overlay.locator('[data-resize-direction="s"]');
  await bottom.press("ArrowDown");
  await agree(); expect((await snapshot(page)).firstRules.height.value.value).toBe(before.firstRules.height.value.value + 1);
  expect((await snapshot(page)).history).toBe(1);
});

for (const autoParent of [false, true]) test(`尺寸百分比高度：${autoParent ? "内容自适应父级不伪造限制" : "确定父高度兑现百分比限制"}`, async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 });
  await mountCanvas(page, true, false, false, false, false, false, `zoom=1&percent-height${autoParent ? "&auto-parent" : ""}`); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 12, y: 35 } });
  const before = await snapshot(page);
  const node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  const overlay = page.locator(`[data-overlay-selection-for="node:${before.ids.first}"]`);
  const start = await overlay.locator('[data-resize-direction="s"]').boundingBox(); if (!start) throw new Error("缺少下尺寸柄");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 200);
  await expect(node).toHaveCSS("height", `${autoParent ? 340 : 250}px`);
  await expect.poll(async () => { const a = await node.boundingBox(); const b = await overlay.boundingBox(); return a && b ? Math.abs(a.height - b.height) : Infinity; }).toBeLessThan(2);
  if (autoParent) await expect(page.locator("[data-resize-feedback]")).not.toContainText("已达到尺寸限制");
  else await expect(page.locator("[data-resize-feedback]")).toContainText("已达到尺寸限制");
  await page.mouse.up(); expect((await snapshot(page)).history).toBe(1);
  expect((await snapshot(page)).firstRules.height.value.value).toBe(autoParent ? 340 : 250);
  await page.getByRole("button", { name: "撤销", exact: true }).click(); expect((await snapshot(page)).firstRules).toEqual(before.firstRules);
});

test("尺寸百分比宽度：网格子项按实际网格区域限宽且提交真实尺寸", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 });
  await mountCanvas(page, false, false, false, true, false, false, "zoom=1&grid-limit"); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 12, y: 35 } });
  const before = await snapshot(page);
  const node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  const sibling = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.second}"]`);
  const gridWidth = (await sibling.boundingBox())!.width;
  const handle = await page.getByRole("button", { name: "调整前图大小：e", exact: true }).boundingBox(); if (!handle) throw new Error("缺少网格子项右柄");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 300, handle.y + handle.height / 2);
  await expect.poll(async () => (await node.boundingBox())!.width).toBeCloseTo(gridWidth / 2, 0);
  await expect(page.locator("[data-resize-feedback]")).toContainText("已达到尺寸限制");
  await expect(page.locator("[data-overlay-snap-guide]")).toHaveCount(0);
  await page.mouse.up(); expect((await snapshot(page)).history).toBe(1);
  expect((await snapshot(page)).firstRules.width.value).toBeCloseTo(gridWidth / 2, 0);
  const committedWidth = (await snapshot(page)).firstRules.width.value;
  await page.getByRole("button", { name: "调整前图大小：e", exact: true }).press("ArrowRight");
  await expect.poll(async () => (await snapshot(page)).preview).toBe(false);
  expect((await snapshot(page)).history).toBe(1); expect((await snapshot(page)).firstRules.width.value).toBe(committedWidth);
});

test("尺寸实际反馈：锚定百分比限制使用CSS包含块且受限预览保持起边", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 });
  await mountCanvas(page, false, true, false, false, false, false, "zoom=1&anchor-limit"); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 12, y: 35 } });
  const before = await snapshot(page); const node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  const initial = await node.boundingBox(); const maxWidth = await node.evaluate((element) => element.parentElement!.clientWidth * .5);
  const handle = await page.getByRole("button", { name: "调整前图大小：e", exact: true }).boundingBox(); if (!handle || !initial) throw new Error("缺少锚定测试尺寸");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 350, handle.y + handle.height / 2);
  await expect.poll(async () => (await node.boundingBox())!.width).toBeCloseTo(maxWidth, 0);
  await expect.poll(async () => (await node.boundingBox())!.x).toBeCloseTo(initial.x, 0);
  await expect(page.locator("[data-resize-feedback]")).toContainText("已达到尺寸限制");
  await page.mouse.up(); expect((await snapshot(page)).history).toBe(1); expect((await snapshot(page)).firstRules.width.value).toBeCloseTo(maxWidth, 0);
});

test("尺寸协调生命周期：不循环预览且同帧卸载取消待执行RAF", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 });
  await mountCanvas(page, false, false, false, true, false, false, "zoom=1&grid-limit"); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 12, y: 35 } });
  const before = await snapshot(page); const handle = page.getByRole("button", { name: "调整前图大小：e", exact: true });
  const box = await handle.boundingBox(); if (!box) throw new Error("缺少右尺寸柄");
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 300, start.y);
  await expect(page.locator("[data-resize-feedback]")).toContainText("已达到尺寸限制");
  const mutationCount = await page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`).evaluate((element) => new Promise<number>((resolve) => {
    let count = 0, frames = 0; const observer = new MutationObserver((records) => { count += records.length; }); observer.observe(element, { attributes: true, attributeFilter: ["style"] });
    const tick = () => { if (++frames === 10) { observer.disconnect(); resolve(count); } else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  }));
  expect(mutationCount).toBeLessThanOrEqual(1); expect((await snapshot(page)).history).toBe(0);
  await page.keyboard.press("Escape"); await page.mouse.up(); expect((await snapshot(page)).firstRules).toEqual(before.firstRules);
  const next = await handle.boundingBox(); if (!next) throw new Error("取消后缺少右柄");
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2); await page.mouse.down();
  await handle.evaluate((element, point) => new Promise<void>((resolve) => requestAnimationFrame(() => {
    element.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, buttons: 1, clientX: point.x + 300, clientY: point.y, bubbles: true }));
    (document.querySelector('[data-testid="toggle-canvas"]') as HTMLButtonElement).click();
    resolve();
  })), { x: next.x + next.width / 2, y: next.y + next.height / 2 });
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve) => { let n = 0; const tick = () => ++n === 8 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }));
  await page.mouse.up();
  const after = await snapshot(page); expect(after.preview).toBe(false); expect(after.history).toBe(0); expect(after.dirty).toBe(false); expect(after.firstRules).toEqual(before.firstRules);
});

test("尺寸实际反馈：横向保留比例，锚定左上柄保持相反边", async ({ page }) => {
  await mountCanvas(page, true, false, false, false, false, false, "ratio&zoom=1"); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 12, y: 35 } });
  let before = await snapshot(page);
  let node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  let overlay = page.locator(`[data-overlay-selection-for="node:${before.ids.first}"]`);
  let handle = await overlay.locator('[data-resize-direction="e"]').boundingBox(); if (!handle) throw new Error("缺少右柄");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + 80, handle.y + handle.height / 2);
  await expect.poll(async () => { const a = await node.boundingBox(); const b = await overlay.boundingBox(); return a && b ? Math.abs(a.height - b.height) + Math.abs(a.width - b.width) : Infinity; }).toBeLessThan(2);
  const ratio = await node.boundingBox(); expect(ratio!.width / ratio!.height).toBeCloseTo(2, 1);
  await page.mouse.up(); expect((await snapshot(page)).firstRules.height).toEqual(before.firstRules.height);

  await mountCanvas(page, false, true, false, false, false, false, "zoom=1"); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 12, y: 35 } });
  before = await snapshot(page); node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  overlay = page.locator(`[data-overlay-selection-for="node:${before.ids.first}"]`);
  await expect(overlay.locator("[data-resize-direction]")).toHaveCount(8);
  const initial = await node.boundingBox(); handle = await overlay.locator('[data-resize-direction="nw"]').boundingBox(); if (!handle || !initial) throw new Error("缺少锚定左上柄");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 25, handle.y + handle.height / 2 + 20);
  await expect.poll(async () => { const a = await node.boundingBox(); const b = await overlay.boundingBox(); return a && b ? Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y), Math.abs(a.width-b.width), Math.abs(a.height-b.height)) : Infinity; }).toBeLessThan(2);
  const changed = await node.boundingBox(); expect(changed!.x + changed!.width).toBeCloseTo(initial.x + initial.width, 0); expect(changed!.y + changed!.height).toBeCloseTo(initial.y + initial.height, 0);
  await page.mouse.up(); expect((await snapshot(page)).history).toBe(1);
});

test("隔离画布：流式拖动重排保存关系，连续拖宽不修改模板", async ({ page }) => {
  await mountCanvas(page, true); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 10, y: 60 } });
  const before = await snapshot(page);
  const move = await page.getByRole("button", { name: "拖动移动前图", exact: true }).boundingBox();
  const target = await page.getByRole("button", { name: "选择模板目标 后图", exact: true }).boundingBox();
  if (!move || !target) throw new Error("缺少移动源或落点");
  await page.mouse.move(move.x + move.width / 2, move.y + move.height / 2); await page.mouse.down();
  await page.mouse.move(target.x + target.width * .85, target.y + target.height * .7);
  await expect(page.getByRole("status").filter({ hasText: "重排：" })).toBeVisible();
  await expect(page.locator("[data-overlay-flow-insertion]")).toBeVisible();
  expect((await snapshot(page)).childIds).toEqual(before.childIds);
  expect((await snapshot(page)).history).toBe(0);
  await expect.poll(() => page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.stack}"] > [data-template-node-id]`).first().getAttribute("data-template-node-id")).toBe(before.ids.second);
  await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).childIds[0]).toBe(before.ids.second);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).childIds).toEqual(before.childIds);
  const width = await page.getByRole("button", { name: /^拖动预览宽度/ }).boundingBox();
  if (!width) throw new Error("缺少预览宽度柄");
  await page.mouse.move(width.x + width.width / 2, width.y + width.height / 2); await page.mouse.down();
  await page.mouse.move(width.x - 150, width.y + width.height / 2); await page.mouse.up();
  const resized = await snapshot(page);
  expect(resized.previewWidth).toBeLessThan(900);
  expect(resized.storedWidth).toBe(900); expect(resized.history).toBe(0); expect(resized.dirty).toBe(false);
});

test("隔离画布：图片焦点即时生效，默认文字内联编辑可取消且不写入模板内容", async ({ page }) => {
  await mountCanvas(page, true, false, false, false, false, false, "schema3"); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 10, y: 60 } });
  const first = (await snapshot(page)).ids.first;
  await page.getByRole("button", { name: "拖动调整图片横向焦点", exact: true }).press("ArrowRight");
  await expect(page.frameLocator("iframe").locator(`[data-template-node-id="${first}"] img`)).toHaveCSS("object-position", "51% 50%");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  const text = page.getByRole("button", { name: "选择模板目标 试排文字", exact: true });
  await text.dblclick({ position: { x: 30, y: 60 } });
  const editor = page.getByRole("textbox", { name: "画布默认文字" });
  await editor.fill("仅本次试排的标题");
  await expect(page.frameLocator("iframe").getByText("仅本次试排的标题", { exact: true })).toBeVisible();
  await editor.press("Escape");
  await expect(page.frameLocator("iframe").getByText("仅本次试排的标题", { exact: true })).toHaveCount(0);
  await expect(page.frameLocator("iframe").getByText("模板默认文字", { exact: true })).toBeVisible();
  expect((await snapshot(page)).history).toBe(0); expect((await snapshot(page)).dirty).toBe(false);
});

test("隔离画布：跨容器移动预览父子关系、取消恢复、确认后选中同步", async ({ page }) => {
  await mountCanvas(page, true, false, true); await enterStack(page);
  const before = await snapshot(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 10, y: 70 } });
  const source = await page.getByRole("button", { name: "拖动移动前图", exact: true }).boundingBox();
  const destination = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.destination}"]`);
  const target = await destination.boundingBox();
  if (!source || !target) throw new Error("缺少跨容器目标");
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const drag = async () => {
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(target.x + target.width * .5, target.y + target.height * .65);
    await expect(page.getByRole("status").filter({ hasText: "跨容器移动：" })).toBeVisible();
    await expect(destination.locator(`[data-template-node-id="${before.ids.first}"]`)).toHaveCount(1);
    expect((await snapshot(page)).history).toBe(0);
  };
  await drag(); await page.keyboard.press("Escape"); await page.mouse.up();
  expect((await snapshot(page)).childIds).toEqual(before.childIds);
  await expect(destination.locator(`[data-template-node-id="${before.ids.first}"]`)).toHaveCount(0);
  // 原位内容恢复后，宿主选框下一次测量也必须返回，才开始另一条独立手势。
  await expect.poll(async () => {
    const box = await page.getByRole("button", { name: "拖动移动前图", exact: true }).boundingBox();
    return box ? Math.abs(box.x - source.x) + Math.abs(box.y - source.y) : Infinity;
  }).toBeLessThan(1);
  await drag(); await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).destinationChildren).toEqual([before.ids.first]);
  const after = await snapshot(page);
  expect(after.scope).toBe(before.ids.destination); expect(after.history).toBe(1);
  expect(after.selected).toEqual([{ targetId: before.ids.first }]);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).childIds).toEqual(before.childIds);
});

test("隔离画布：Alt循环重叠对象，框选只包含当前层可见未锁定对象", async ({ page }) => {
  await mountCanvas(page); await enterStack(page);
  const state = await snapshot(page);
  const second = await page.getByRole("button", { name: "选择模板目标 后图", exact: true }).boundingBox();
  if (!second) throw new Error("缺少重叠目标");
  const point = { x: second.x + second.width * .55, y: second.y + second.height * .62 };
  await page.mouse.click(point.x, point.y);
  expect((await snapshot(page)).selected[0].targetId).toBe(state.ids.second);
  await page.keyboard.down("Alt"); await page.mouse.click(point.x, point.y); await page.keyboard.up("Alt");
  expect((await snapshot(page)).selected[0].targetId).toBe(state.ids.first);
  const background = await page.getByRole("button", { name: "画布空白区域，拖动框选当前层对象", exact: true }).boundingBox();
  if (!background) throw new Error("缺少框选画布");
  await page.mouse.move(background.x + 15, background.y + background.height * .8); await page.mouse.down();
  await page.mouse.move(background.x + background.width * .62, background.y + 35);
  await expect(page.locator("[data-overlay-marquee]")).toBeVisible(); await page.mouse.up();
  expect((await snapshot(page)).selected.map((item: { targetId: string }) => item.targetId).sort()).toEqual([state.ids.first, state.ids.second].sort());
  expect((await snapshot(page)).history).toBe(0);
});

test("隔离画布：加号向明确当前层添加，新增节点可一步撤销", async ({ page }) => {
  await mountCanvas(page, true); await enterStack(page);
  const before = await snapshot(page);
  await page.getByText("＋ 添加内容", { exact: true }).click();
  await page.getByRole("button", { name: "添加标题槽位", exact: true }).click();
  const after = await snapshot(page);
  expect(after.childIds.length).toBe(before.childIds.length + 1); expect(after.scope).toBe(before.ids.stack);
  expect(after.history).toBe(1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).childIds).toEqual(before.childIds);
});

test("隔离画布：拖入显示容器和插入线，取消零写入，提交一次添加", async ({ page }) => {
  await mountCanvas(page, true); await enterStack(page);
  const before = await snapshot(page);
  await page.getByText("＋ 添加内容", { exact: true }).click();
  const button = await page.getByRole("button", { name: "添加标题槽位", exact: true }).boundingBox();
  const target = await page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.second}"]`).boundingBox();
  if (!button || !target) throw new Error("缺少拖入源或目标");
  const start = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect((await snapshot(page)).history).toBe(0); expect((await snapshot(page)).scope).toBe(before.scope);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(target.x + target.width * .75, target.y + target.height * .75);
  await expect(page.locator("[data-canvas-insert-target]")).toBeVisible();
  await expect(page.locator("[data-canvas-insert-line]")).toBeVisible();
  expect((await snapshot(page)).history).toBe(0);
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect((await snapshot(page)).childIds).toEqual(before.childIds);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(target.x + target.width * .75, target.y + target.height * .75); await page.mouse.up();
  const after = await snapshot(page);
  expect(after.history).toBe(1); expect(after.childIds.length).toBe(before.childIds.length + 1);
  expect(after.childIds[2]).toBe(after.selected[0].targetId);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).childIds).toEqual(before.childIds);
});

test("隔离画布：带内边距的锚定对象移动写偏移，缩放不改变父子顺序", async ({ page }) => {
  await mountCanvas(page, false, true); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 6, y: 50 } });
  const before = await snapshot(page);
  const handle = await page.getByRole("button", { name: "拖动移动前图", exact: true }).boundingBox();
  const node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  const original = await node.boundingBox();
  if (!handle || !original) throw new Error("缺少锚定对象");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2 + 15);
  await expect.poll(async () => (await snapshot(page)).preview).toBe(true);
  await page.mouse.up();
  const after = await snapshot(page);
  expect(after.firstRules.anchor.offsetX.value).toBeGreaterThan(0);
  expect(after.childIds).toEqual(before.childIds); expect(after.history).toBe(1);
  const moved = await node.boundingBox();
  expect(moved!.x - original.x).toBeCloseTo(30, 0); expect(moved!.y - original.y).toBeCloseTo(15, 0);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).firstRules.anchor).toEqual(before.firstRules.anchor);
});

test("隔离画布：中文组合键不退出默认文字编辑，空格平移取消恢复视图和层级", async ({ page }) => {
  await mountCanvas(page, true, false, false, false, false, false, "schema3"); await enterStack(page);
  const before = await snapshot(page);
  await page.getByRole("button", { name: "选择模板目标 试排文字", exact: true }).dblclick({ position: { x: 30, y: 60 } });
  const editor = page.getByRole("textbox", { name: "画布默认文字" });
  await editor.dispatchEvent("keydown", { key: "Escape", isComposing: true, bubbles: true });
  await expect(editor).toBeVisible();
  await editor.dispatchEvent("keydown", { key: "Enter", ctrlKey: true, isComposing: true, bubbles: true });
  await expect(editor).toBeVisible(); await editor.press("Escape");
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).focus();
  await page.keyboard.down("Space");
  const stage = page.locator(".template-editor__canvas-scroll");
  await expect(stage).toHaveClass(/is-pan-mode/);
  const box = await stage.boundingBox();
  const scroll = await stage.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
  if (!box) throw new Error("缺少平移视口");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 40);
  await page.keyboard.press("Escape"); await page.mouse.up(); await page.keyboard.up("Space");
  expect(await stage.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }))).toEqual(scroll);
  expect((await snapshot(page)).scope).toBe(before.scope); expect((await snapshot(page)).history).toBe(0);
});

test("隔离画布：逐层选择、Enter/Esc与面包屑共享选中状态，锁定隐藏对象不命中", async ({ page }) => {
  await mountCanvas(page);
  await expect(page.getByRole("button", { name: "选择模板目标 前图", exact: true })).toHaveCount(0);
  const region = page.getByRole("button", { name: "选择模板目标 内容区域", exact: true });
  await region.click();
  await region.press("Enter");
  await page.getByRole("button", { name: "选择模板目标 自由构图", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "选择模板目标 前图", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "选择模板目标 锁定图", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "选择模板目标 隐藏图", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 10, y: 10 } });
  await page.keyboard.press("Escape");
  const state = await snapshot(page);
  expect(state.scope).toBe(state.ids.region);
  expect(state.selected).toEqual([{ targetId: state.ids.stack }]);
  await page.getByRole("navigation", { name: "画布编辑层级" }).getByRole("button").first().click();
  expect((await snapshot(page)).scope).toBe(state.rootId);
  expect((await snapshot(page)).history).toBe(0);
});

test("隔离画布：拖动预览改变真实内容，Esc零历史，提交仅一步撤销", async ({ page }) => {
  await mountCanvas(page);
  await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 8, y: 8 } });
  const before = await snapshot(page);
  const move = page.getByRole("button", { name: "拖动移动前图", exact: true });
  const bounds = await move.boundingBox();
  if (!bounds) throw new Error("缺少移动柄");
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  const initialLeft = await node.evaluate((element) => (element as HTMLElement).style.left);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 2, point.y);
  expect((await snapshot(page)).preview).toBe(false);
  await page.mouse.move(point.x + 30, point.y + 15);
  await expect.poll(async () => (await snapshot(page)).preview).toBe(true);
  expect((await snapshot(page)).dirty).toBe(false);
  expect((await snapshot(page)).history).toBe(0);
  await expect.poll(() => node.evaluate((element) => (element as HTMLElement).style.left)).not.toBe(initialLeft);
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect((await snapshot(page)).preview).toBe(false);
  expect((await snapshot(page)).placement).toEqual(before.placement);
  await expect.poll(() => node.evaluate((element) => (element as HTMLElement).style.left)).toBe(initialLeft);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 30, point.y + 15); await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).history).toBe(1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).placement).toEqual(before.placement);
});

test("隔离画布新增：取景可持续编辑、取消零写入、确认一次历史且外框不变", async ({ page }) => {
  await mountCanvas(page, true); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 12, y: 55 } });
  const before = await snapshot(page);
  const node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  const box = await node.boundingBox();
  await page.getByRole("button", { name: "调整画面", exact: true }).click();
  const editor = page.getByRole("group", { name: "图片取景编辑", exact: true });
  await expect(editor).toBeVisible();
  const focus = page.getByRole("slider", { name: "图片焦点", exact: true });
  await focus.press("ArrowRight"); await focus.press("ArrowDown");
  await expect(focus).toHaveAttribute("aria-valuetext", "横向 51%，纵向 51%");
  await expect(node.locator("img")).toHaveCSS("object-position", "51% 51%");
  expect((await snapshot(page)).history).toBe(0); expect((await snapshot(page)).dirty).toBe(false);
  await page.getByRole("button", { name: "取消取景", exact: true }).click();
  expect((await snapshot(page)).firstSlotRules).toEqual(before.firstSlotRules);
  await page.getByRole("button", { name: "调整画面", exact: true }).click();
  await focus.press("Shift+ArrowRight"); await page.getByRole("button", { name: "确认取景", exact: true }).click();
  await expect(editor).toHaveCount(0); expect((await snapshot(page)).history).toBe(1);
  expect((await snapshot(page)).firstSlotRules.objectPosition).toBe("60% 50%");
  const afterBox = await node.boundingBox();
  for (const axis of ["x", "y", "width", "height"] as const) expect(afterBox![axis]).toBeCloseTo(box![axis], 0);
  await page.getByRole("button", { name: "撤销", exact: true }).click(); expect((await snapshot(page)).firstSlotRules).toEqual(before.firstSlotRules);
});

test("隔离画布新增：可见候选列表可选择重叠对象，排除锁定隐藏并恢复焦点", async ({ page }) => {
  await mountCanvas(page, false, false, false, false, true); await enterStack(page);
  const before = await snapshot(page);
  const trigger = page.getByRole("button", { name: "选择模板目标 前图", exact: true });
  await trigger.click({ position: { x: 8, y: 8 } });
  const openOverlapMenu = async (target: Locator) => {
    const box = await target.boundingBox();
    if (!box) throw new Error("缺少重叠对象命中区测量");
    await target.evaluate((element, point) => element.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
      clientX: point.x,
      clientY: point.y,
    })), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  };
  await openOverlapMenu(trigger);
  const dialog = page.getByRole("dialog", { name: "选择此处对象", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /前图/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /后图/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /锁定图|隐藏图/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: /后图/ }).click();
  expect((await snapshot(page)).selected).toEqual([{ targetId: before.ids.second }]);
  const selectedTrigger = page.getByRole("button", { name: "选择模板目标 后图", exact: true });
  await openOverlapMenu(selectedTrigger); await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0); await expect(selectedTrigger).toBeFocused();
  expect((await snapshot(page)).scope).toBe(before.scope); expect((await snapshot(page)).history).toBe(0);
});

test("隔离画布主流程：结构操作不在画布重复出现", async ({ page }) => {
  await mountCanvas(page); await enterStack(page);
  const before = await snapshot(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 8, y: 8 } });
  await expect(page.getByText("对象操作", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "复制节点", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "上移一层", exact: true })).toHaveCount(0);
  expect((await snapshot(page)).childIds).toEqual(before.childIds);
  expect((await snapshot(page)).history).toBe(before.history);
});

test("隔离画布新增：列分隔线实际预览、Esc恢复、提交一次历史", async ({ page }) => {
  await mountCanvas(page, false, false, false, true);
  await page.getByRole("button", { name: "选择模板目标 内容区域", exact: true }).dblclick();
  await page.getByRole("button", { name: "选择模板目标 自由构图", exact: true }).click();
  const before = await snapshot(page);
  const divider = page.getByRole("button", { name: "拖动调整第1与2列比例", exact: true });
  await expect(divider).toBeVisible();
  const node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  const original = await node.boundingBox(); const handle = await divider.boundingBox();
  if (!handle || !original) throw new Error("缺少列分隔线测量");
  const point = { x: handle.x + 6, y: handle.y + handle.height / 2 };
  const drag = async () => { await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 40, point.y); };
  await drag(); await expect.poll(async () => (await snapshot(page)).preview).toBe(true);
  await expect.poll(async () => (await node.boundingBox())!.width).toBeGreaterThan(original.width + 20);
  expect((await snapshot(page)).history).toBe(0); expect((await snapshot(page)).dirty).toBe(false);
  await page.keyboard.press("Escape"); await page.mouse.up(); expect((await snapshot(page)).stackRules.columns).toEqual([1, 1, 1]);
  await expect.poll(async () => (await node.boundingBox())!.width).toBeCloseTo(original.width, 0);
  await drag(); await page.mouse.up();
  const after = await snapshot(page); expect(after.history).toBe(1); expect(after.stackRules.columns[0]).toBeGreaterThan(1); expect(after.stackRules.columns[0] + after.stackRules.columns[1]).toBeCloseTo(2);
  await page.getByRole("button", { name: "撤销", exact: true }).click(); expect((await snapshot(page)).stackRules.columns).toEqual([1, 1, 1]);
});

for (const side of ["right", "bottom"] as const) test(`间距实际交互：${side}内边距向内拖、边内标签命中、取消与一次提交`, async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 });
  await mountCanvas(page, false, false, false, true, false, false, "zoom=1");
  await page.getByRole("button", { name: "选择模板目标 内容区域", exact: true }).dblclick();
  await page.getByRole("button", { name: "选择模板目标 自由构图", exact: true }).click();
  const before = await snapshot(page);
  const node = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.stack}"]`);
  const label = side === "right" ? "拖动调整右内边距" : "拖动调整下内边距";
  await page.getByRole("button", { name: "调整间距", exact: true }).click();
  const control = page.getByRole("button", { name: label, exact: true });
  const original = await node.evaluate((element, selectedSide) => parseFloat(getComputedStyle(element).getPropertyValue(`padding-${selectedSide}`)), side);
  const begin = async () => {
    const handle = await control.boundingBox(); const content = await node.boundingBox();
    if (!handle || !content) throw new Error("缺少内边距操作几何");
    const point = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    expect(point.x).toBeGreaterThanOrEqual(content.x); expect(point.x).toBeLessThanOrEqual(content.x + content.width);
    expect(point.y).toBeGreaterThanOrEqual(content.y); expect(point.y).toBeLessThanOrEqual(content.y + content.height);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"), point)).toBe(label);
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(point.x - (side === "right" ? 24 : 0), point.y - (side === "bottom" ? 24 : 0));
    await expect(node).toHaveCSS(`padding-${side}`, `${original + 24}px`);
    expect((await snapshot(page)).history).toBe(0); expect((await snapshot(page)).dirty).toBe(false);
  };
  await begin(); await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(node).toHaveCSS(`padding-${side}`, `${original}px`);
  expect((await snapshot(page)).stackRules).toEqual(before.stackRules);
  await begin(); await page.mouse.up();
  expect((await snapshot(page)).stackRules.padding[side].value).toBe(original + 24);
  expect((await snapshot(page)).history).toBe(1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(node).toHaveCSS(`padding-${side}`, `${original}px`);
  expect((await snapshot(page)).stackRules).toEqual(before.stackRules);
});

test("间距实际交互：三列网格column规则仍以横向真实间隙放置和拖动gap", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 });
  await mountCanvas(page, false, false, false, true, false, false, "zoom=1");
  await page.getByRole("button", { name: "选择模板目标 内容区域", exact: true }).dblclick();
  await page.getByRole("button", { name: "选择模板目标 自由构图", exact: true }).click();
  const before = await snapshot(page); expect(before.stackRules.direction).toBe("column");
  const first = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"]`);
  const second = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.second}"]`);
  const container = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.stack}"]`);
  await page.getByRole("button", { name: "调整间距", exact: true }).click();
  const control = page.getByRole("button", { name: "拖动调整间距", exact: true });
  await expect(control).toHaveCSS("cursor", "ew-resize");
  const actualGap = async () => { const a = await first.boundingBox(); const b = await second.boundingBox(); if (!a || !b) throw new Error("缺少网格卡片几何"); return b.x - a.x - a.width; };
  const begin = async () => {
    const a = await first.boundingBox(); const b = await second.boundingBox(); const h = await control.boundingBox(); if (!a || !b || !h) throw new Error("缺少网格间隙控件");
    const point = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
    expect(point.x).toBeGreaterThan(a.x + a.width); expect(point.x).toBeLessThan(b.x);
    expect(point.y).toBeGreaterThan(Math.max(a.y, b.y)); expect(point.y).toBeLessThan(Math.min(a.y+a.height, b.y+b.height));
    expect(await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"), point)).toBe("拖动调整间距");
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 16, point.y);
    await expect(container).toHaveCSS("gap", "36px"); await expect.poll(actualGap).toBeCloseTo(36, 0);
    expect((await snapshot(page)).history).toBe(0); expect((await snapshot(page)).dirty).toBe(false);
  };
  await begin(); await page.keyboard.press("Escape"); await page.mouse.up();
  await expect.poll(actualGap).toBeCloseTo(20, 0); expect((await snapshot(page)).stackRules).toEqual(before.stackRules);
  await begin(); await page.mouse.up(); expect((await snapshot(page)).history).toBe(1); expect((await snapshot(page)).stackRules.gap.value).toBe(36);
  await page.getByRole("button", { name: "撤销", exact: true }).click(); await expect.poll(actualGap).toBeCloseTo(20, 0);
});

test("隔离画布新增：三断点观察菜单只改预览宽度，不改根尺寸和保存状态", async ({ page }) => {
  await mountCanvas(page);
  const before = await snapshot(page);
  await page.getByRole("button", { name: /^预览宽度：/ }).click();
  const panel = page.getByRole("group", { name: "画布观察宽度", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "模板高度模式" })).toHaveCount(0);
  await expect(panel.getByRole("combobox", { name: "常用模板比例" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "恢复已保存尺寸" })).toHaveCount(0);
  const width = panel.getByRole("spinbutton", { name: "预览宽度", exact: true });
  await width.fill("834"); await width.press("Enter");
  const after = await snapshot(page); expect(after.breakpoint).toBe("tablet"); expect(after.previewWidth).toBe(834); expect(after.rootResponsive).toEqual(before.rootResponsive); expect(after.history).toBe(0); expect(after.dirty).toBe(false);
});

test("隔离画布新增：旧合同仍保留原模板高度与比例菜单", async ({ page }) => {
  await mountCanvas(page, false, false, false, false, false, true);
  await page.getByRole("button", { name: /^模板尺寸：/ }).click();
  const panel = page.getByRole("group", { name: "模板整体尺寸", exact: true });
  await expect(panel.getByRole("combobox", { name: "模板高度模式" })).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "常用模板比例" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "恢复已保存尺寸" })).toBeVisible();
});

test("画布尺寸：比例根随预览宽度同步，观察操作不写模板", async ({ page }) => {
  await mountCanvas(page, false, false, false, false, false, false, "root-ratio");
  const before = await snapshot(page);
  const frame = page.locator("iframe");
  const root = page.frameLocator("iframe").locator(`[data-template-node-id="${before.rootId}"]`);
  await expect.poll(() => frame.evaluate((element) => Number.parseFloat(element.style.height))).toBe(675);
  await page.getByRole("button", { name: /^预览宽度：/ }).click();
  const width = page.getByRole("group", { name: "画布观察宽度", exact: true }).getByRole("spinbutton", { name: "预览宽度", exact: true });
  await width.fill("1200"); await width.press("Enter");
  await expect.poll(() => frame.evaluate((element) => Number.parseFloat(element.style.height))).toBe(900);
  await expect.poll(() => root.evaluate((element) => element.getBoundingClientRect().height)).toBe(900);
  const after = await snapshot(page);
  expect(after.rootResponsive).toEqual(before.rootResponsive);
  expect(after.storedWidth).toBe(before.storedWidth);
  expect(after.history).toBe(0); expect(after.dirty).toBe(false);
});

test("画布尺寸：比例根 root-max-height-vh 使用稳定参照且连续多帧不塌缩", async ({ page }) => {
  await mountCanvas(page, false, false, false, false, false, false, "root-ratio&root-max-height-vh");
  const before = await snapshot(page);
  const root = page.frameLocator("iframe").locator(`[data-template-node-id="${before.rootId}"]`);
  const heights = await root.evaluate(async (element) => {
    const values: number[] = [];
    for (let index = 0; index < 16; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      values.push(element.getBoundingClientRect().height);
    }
    return values;
  });
  // 900px 的 4:3 预览基线高 675px；50vh 以稳定基线计算为 337.5px。
  expect(heights).toHaveLength(16);
  for (const height of heights) expect(height).toBeCloseTo(337.5, 0);
  await expect.poll(() => page.locator("iframe").evaluate((element) => Number.parseFloat(element.style.height))).toBe(338);
  const after = await snapshot(page);
  expect(after.rootResponsive).toEqual(before.rootResponsive);
  expect(after.history).toBe(0); expect(after.dirty).toBe(false);
});

for (const limit of ["root-max-height", "root-max-width"] as const) {
  test(`画布尺寸：比例根遵循 ${limit} 的实际边界并保留子项越界提示`, async ({ page }) => {
    await mountCanvas(page, false, false, false, false, false, false, `root-ratio&${limit}`);
    const before = await snapshot(page);
    const frame = page.locator("iframe");
    const root = page.frameLocator("iframe").locator(`[data-template-node-id="${before.rootId}"]`);
    const expectedHeight = limit === "root-max-height" ? 400 : 338;
    await expect.poll(() => root.evaluate((element) => Math.ceil(element.getBoundingClientRect().height))).toBe(expectedHeight);
    await expect.poll(() => frame.evaluate((element) => Number.parseFloat(element.style.height))).toBe(expectedHeight);
    await expect(page.getByRole("button", { name: /内容越界.*纵向/ })).toBeVisible();
    const after = await snapshot(page);
    expect(after.rootResponsive).toEqual(before.rootResponsive);
    expect(after.history).toBe(0); expect(after.dirty).toBe(false);
  });
}

for (const mode of ["root-ratio", "root-auto", "fixed"] as const) {
  test(`画布尺寸：${mode} 区分内容撑高与固定边界溢出，并能回落`, async ({ page }) => {
    await mountCanvas(page, false, false, false, false, false, false, mode);
    const before = await snapshot(page);
    const frame = page.locator("iframe");
    const region = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.region}"]`);
    const initialHeight = mode === "root-ratio" ? 675 : mode === "root-auto" ? 550 : 600;
    await expect.poll(() => frame.evaluate((element) => Number.parseFloat(element.style.height))).toBe(initialHeight);
    // 仅在隔离夹具中模拟子内容实际增长，验证 ResizeObserver，而不制造编辑事务。
    await region.evaluate((element) => { element.style.height = "1200px"; });
    await expect.poll(() => frame.evaluate((element) => Number.parseFloat(element.style.height))).toBe(mode === "fixed" ? 600 : 1200);
    if (mode === "fixed") await expect(page.getByRole("button", { name: /内容越界.*纵向/ })).toBeVisible();
    else await expect(page.getByRole("button", { name: /内容越界.*纵向/ })).toHaveCount(0);
    await region.evaluate((element) => { element.style.height = "550px"; });
    await expect.poll(() => frame.evaluate((element) => Number.parseFloat(element.style.height))).toBe(initialHeight);
    await expect(page.getByRole("button", { name: /内容越界.*纵向/ })).toHaveCount(0);
    const after = await snapshot(page);
    expect(after.rootResponsive).toEqual(before.rootResponsive);
    expect(after.history).toBe(0); expect(after.dirty).toBe(false);
  });
}

test("隔离画布新增：鼠标取景遵守屏幕阈值，松手保留预览，Esc恢复原取景", async ({ page }) => {
  await mountCanvas(page, true); await enterStack(page);
  await page.getByRole("button", { name: "选择模板目标 前图", exact: true }).click({ position: { x: 12, y: 55 } });
  const before = await snapshot(page);
  const image = page.frameLocator("iframe").locator(`[data-template-node-id="${before.ids.first}"] img`);
  const original = await image.evaluate((element) => getComputedStyle(element).objectPosition);
  await page.getByRole("button", { name: "调整画面", exact: true }).click();
  const slider = page.getByRole("slider", { name: "图片焦点", exact: true });
  const bounds = await slider.boundingBox(); if (!bounds) throw new Error("缺少图片取景拖动区域");
  const point = { x: bounds.x + bounds.width * .3, y: bounds.y + bounds.height * .3 };
  const sliderPoint = { x: bounds.width * .3, y: bounds.height * .3 };
  await slider.hover({ position: sliderPoint }); await page.mouse.down(); await page.mouse.move(point.x + 2, point.y); await page.mouse.up();
  await expect(image).toHaveCSS("object-position", original); expect((await snapshot(page)).preview).toBe(false);
  await slider.evaluate((element) => element.addEventListener("pointerdown", (event) => element.setAttribute("data-test-pointer-id", String(event.pointerId)), { once: true }));
  await slider.hover({ position: sliderPoint }); await page.mouse.down();
  await expect(slider).toHaveAttribute("data-test-pointer-id", /^\d+$/);
  const pointerId = Number(await slider.getAttribute("data-test-pointer-id"));
  // capture 丢失只恢复普通命中；指针仍在 slider 内且尚未跨阈值时，不得取消取景事务。
  await slider.dispatchEvent("lostpointercapture", { pointerId });
  await page.mouse.move(point.x + 18, point.y + 12, { steps: 5 });
  await expect.poll(() => image.evaluate((element) => getComputedStyle(element).objectPosition)).not.toBe(original);
  await page.mouse.up(); await expect(slider).toBeVisible(); expect((await snapshot(page)).history).toBe(0); expect((await snapshot(page)).preview).toBe(true);
  await page.keyboard.press("Escape"); await expect(slider).toHaveCount(0); await expect(image).toHaveCSS("object-position", original);
  await page.getByRole("button", { name: "调整画面", exact: true }).click();
  const activeSlider = page.getByRole("slider", { name: "图片焦点", exact: true });
  const activeBounds = await activeSlider.boundingBox(); if (!activeBounds) throw new Error("缺少图片取景拖动区域");
  const activePoint = { x: activeBounds.x + activeBounds.width * .3, y: activeBounds.y + activeBounds.height * .3 };
  const activeSliderPoint = { x: activeBounds.width * .3, y: activeBounds.height * .3 };
  await activeSlider.evaluate((element) => element.addEventListener("pointerdown", (event) => element.setAttribute("data-test-pointer-id", String(event.pointerId)), { once: true }));
  await activeSlider.hover({ position: activeSliderPoint }); await page.mouse.down();
  await expect(activeSlider).toHaveAttribute("data-test-pointer-id", /^\d+$/);
  const activePointerId = Number(await activeSlider.getAttribute("data-test-pointer-id"));
  await page.mouse.move(activePoint.x + 18, activePoint.y + 12, { steps: 5 });
  await expect.poll(() => image.evaluate((element) => getComputedStyle(element).objectPosition)).not.toBe(original);
  await activeSlider.dispatchEvent("lostpointercapture", { pointerId: activePointerId });
  await expect(activeSlider).toHaveCount(0); await page.mouse.up(); await expect(image).toHaveCSS("object-position", original);
  expect((await snapshot(page)).firstSlotRules).toEqual(before.firstSlotRules); expect((await snapshot(page)).dirty).toBe(false);
});
