import { test, expect, type Page } from "@playwright/test";
import { installNewTemplateServer, openTemplateDesignWithoutDraft, readSession } from "./fixtures/template-authoring-main-route";
async function mount(page: Page) {
  await page.route("**/__template-layout-conversion", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-layout-conversion.tsx"></script></body></html>` }));
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/__template-layout-conversion");
  await expect(page.getByRole("button", { name: "预览自由排列", exact: true })).toBeVisible();
}
const read = async (page: Page) => JSON.parse(await page.getByTestId("state").textContent() ?? "{}");

test("隔离布局：手机仅覆盖排列方向仍准确标记手机覆盖，撤销恢复继承", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  const layout = page.getByRole("region", { name: "排列与分栏设置" });
  await expect(layout).toHaveAttribute("data-template-layout-inheritance", "inherited");
  const before = await read(page);
  await page.getByRole("button", { name: "预览上下排列", exact: true }).click();
  await page.getByRole("button", { name: "确认排列转换", exact: true }).click();
  await expect(layout).toHaveAttribute("data-template-layout-inheritance", "override");
  await expect(layout).toContainText("手机覆盖");
  const changed = await read(page);
  expect(changed.definition.nodes[changed.stack].responsive.desktop).toEqual(before.definition.nodes[before.stack].responsive.desktop);
  expect(changed.definition.nodes[changed.stack].responsive.mobile.direction).toBe("column");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(layout).toHaveAttribute("data-template-layout-inheritance", "inherited");
  expect((await read(page)).definition).toEqual(before.definition);
});
test("隔离布局：自由转换扣除内边距保持位置、取消零写入、确认一次历史并往返", async ({ page }) => {
  await mount(page); const before = await read(page);
  const child = page.locator(`[data-template-node-id="${before.cards[0]}"]`);
  const box = await child.boundingBox();
  await page.getByRole("button", { name: "预览自由排列", exact: true }).click();
  await expect(page.getByRole("table", { name: "布局转换断点影响" })).toBeVisible();
  expect((await read(page)).history).toBe(0);
  const previewBox = await child.boundingBox();
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(previewBox![key] - box![key])).toBeLessThan(1.5);
  await page.keyboard.press("Escape");
  expect((await read(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "预览自由排列", exact: true }).click();
  await page.getByRole("button", { name: "确认排列转换" }).click();
  const saved = await read(page); expect(saved.history).toBe(1); expect(saved.definition.nodes[saved.stack].responsive.desktop.layoutMode).toBe("free");
  await page.getByRole("button", { name: "撤销", exact: true }).click(); expect((await read(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.getByRole("button", { name: "保存格式往返" }).click(); expect((await read(page)).definition).toEqual(saved.definition);
});
test("隔离布局：手机从自由转网格仅写覆盖并自动回流，列比例走同一事务", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "预览自由排列", exact: true }).click(); await page.getByRole("button", { name: "确认排列转换" }).click();
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  const layout = page.getByRole("region", { name: "排列与分栏设置" });
  await expect(layout).toHaveAttribute("data-template-layout-mode", "free");
  await expect(layout).toHaveAttribute("data-template-layout-inheritance", "inherited");
  await expect(layout).toContainText("自由叠放");
  await expect(layout).toContainText("继承桌面");
  await page.getByRole("button", { name: "预览网格排列", exact: true }).click(); await page.getByRole("button", { name: "确认排列转换" }).click();
  await expect(layout).toHaveAttribute("data-template-layout-mode", "flow");
  await expect(layout).toHaveAttribute("data-template-layout-inheritance", "override");
  await expect(layout).toContainText("顺序布局");
  await expect(layout).toContainText("手机覆盖");
  const state = await read(page); expect(state.definition.nodes[state.stack].responsive.desktop.layoutMode).toBe("free"); expect(state.definition.nodes[state.stack].responsive.mobile.layoutMode).toBe("flow");
  for (const id of state.cards) expect(state.definition.nodes[id].responsive.mobile.placement).toBeNull();
  const ratio = page.getByRole("spinbutton", { name: "第 1 列比例" }); await ratio.fill("2"); expect((await read(page)).history).toBe(2); await ratio.press("Enter"); expect((await read(page)).history).toBe(3);
  const changed = await read(page); expect(changed.definition.nodes[changed.stack].responsive.mobile.columns).toEqual([2, 1, 1]);
  await page.getByRole("button", { name: "模拟列分隔线意图" }).click();
  const resized = await read(page); const columns = resized.definition.nodes[resized.stack].responsive.mobile.columns; expect(columns[0] + columns[1]).toBeCloseTo(3); expect(columns[0]).toBeGreaterThan(2);
});
test("隔离布局：未呈现容器不猜测自由几何，横纵换行转换均可取消", async ({ page }) => {
  await mount(page); const before = await read(page);
  for (const label of ["上下排列", "左右排列", "自动换行", "网格排列"]) { await page.getByRole("button", { name: `预览${label}`, exact: true }).click(); await page.getByRole("button", { name: "取消排列转换" }).click(); expect((await read(page)).definition).toEqual(before.definition); }
  await page.getByRole("button", { name: "切换画布呈现" }).click(); await page.getByRole("button", { name: "预览自由排列", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("未呈现此容器"); expect((await read(page)).history).toBe(0); expect((await read(page)).preview).toBe(false);
});

async function launchMasterOnMainRoute(page: Page, name: "左右图文" | "作品网格") {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const server = await installNewTemplateServer(page);
  await openTemplateDesignWithoutDraft(page);
  await page.getByRole("button", { name: "从首发母版开始", exact: true }).click();
  await page.getByRole("button", { name: `母版 ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "用这块母版开始", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "选择首发母版", exact: true })).toBeHidden();
  const state = await readSession(page);
  expect(state.definition!.name).toBe(name);
  await expect(page.frameLocator("iframe.template-editor__viewport-frame").locator(`[data-template-node-id="${state.definition!.rootNodeId}"]`)).toBeVisible();
  return { server, definition: state.definition! };
}

async function selectLaunchStructure(page: Page, nodeId: string) {
  const trigger = page.getByRole("button", { name: "展开模板结构面板", exact: true });
  if (await trigger.isVisible()) await trigger.click();
  await page.getByRole("tree", { name: "模板区域与槽位", exact: true })
    .locator(`[role="treeitem"][data-selection-target-id="${nodeId}"]`).click();
}

async function renderedNodeBox(page: Page, nodeId: string) {
  const element = page.frameLocator("iframe.template-editor__viewport-frame").locator(`[data-template-node-id="${nodeId}"]`);
  const box = await element.boundingBox();
  expect(box, `真实画布节点 ${nodeId} 必须可测量`).not.toBeNull();
  return box!;
}

for (const device of ["desktop", "mobile"] as const) test(`首发主路由真实几何：左右图文${device}切换排列必须改变主图与文字位置且可撤销`, async ({ page }, testInfo) => {
  // 普通图文分栏可以切换合法排列。测试实际节点位置，不以按钮选中态或规则 JSON 代替画面。
  const { server, definition } = await launchMasterOnMainRoute(page, "左右图文");
  const split = Object.values(definition.nodes).find((node) => node.name === "图文分栏")!;
  const hero = Object.values(definition.nodes).find((node) => node.name === "主图")!;
  const text = Object.values(definition.nodes).find((node) => node.name === "文字列")!;
  await page.getByRole("button", { name: new RegExp(`${device === "desktop" ? "桌面端" : "移动端"}模板布局`) }).click();
  await selectLaunchStructure(page, split.nodeId);
  const before = await readSession(page);
  const originalHero = await renderedNodeBox(page, hero.nodeId);
  const originalText = await renderedNodeBox(page, text.nodeId);
  const layout = page.getByRole("region", { name: "排列与分栏设置", exact: true });
  await page.screenshot({ path: testInfo.outputPath(`launch-split-${device}-before-layout.png`), animations: "disabled" });
  await layout.getByRole("button", { name: `预览${device === "desktop" ? "上下排列" : "左右排列"}`, exact: true }).click();
  await expect.poll(async () => {
    const picture = await renderedNodeBox(page, hero.nodeId);
    const copy = await renderedNodeBox(page, text.nodeId);
    return device === "desktop" ? copy.y - picture.y - picture.height : copy.x - picture.x - picture.width;
  }, { message: "确认前的真实画布预览必须已经显示目标上下/左右关系" }).toBeGreaterThanOrEqual(-1);
  const previewState = await readSession(page);
  expect(previewState.definition).toEqual(before.definition);
  expect(previewState.historyPast).toEqual(before.historyPast);
  await page.screenshot({ path: testInfo.outputPath(`launch-split-${device}-preview-layout.png`), animations: "disabled" });
  const previewGeometry = { image: await renderedNodeBox(page, hero.nodeId), text: await renderedNodeBox(page, text.nodeId) };
  await layout.getByRole("button", { name: "确认排列转换", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath(`launch-split-${device}-after-layout.png`), animations: "disabled" });
  await testInfo.attach("layout-geometry.json", {
    body: JSON.stringify({ device, before: { image: originalHero, text: originalText }, preview: previewGeometry, after: { image: await renderedNodeBox(page, hero.nodeId), text: await renderedNodeBox(page, text.nodeId) } }, null, 2),
    contentType: "application/json",
  });
  await expect.poll(async () => {
    const picture = await renderedNodeBox(page, hero.nodeId);
    const copy = await renderedNodeBox(page, text.nodeId);
    return Math.max(
      Math.abs((copy.x - picture.x) - (originalText.x - originalHero.x)),
      Math.abs((copy.y - picture.y) - (originalText.y - originalHero.y)),
      Math.abs(picture.width - originalHero.width),
    );
  }, { message: "排列规则确认后，主图与文字实际相对位置/主图宽度必须改变" }).toBeGreaterThan(5);
  const changedHero = await renderedNodeBox(page, hero.nodeId);
  const changedText = await renderedNodeBox(page, text.nodeId);
  if (device === "desktop") expect(changedText.y).toBeGreaterThanOrEqual(changedHero.y + changedHero.height - 1);
  else expect(changedText.x).toBeGreaterThanOrEqual(changedHero.x + changedHero.width - 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(before.definition);
  await expect.poll(async () => {
    const picture = await renderedNodeBox(page, hero.nodeId);
    const copy = await renderedNodeBox(page, text.nodeId);
    return Math.max(Math.abs(picture.width - originalHero.width), Math.abs((copy.x - picture.x) - (originalText.x - originalHero.x)), Math.abs((copy.y - picture.y) - (originalText.y - originalHero.y)));
  }).toBeLessThan(1.5);
  expect(server.writes).toEqual([]);
});

test("首发主路由真实几何：只有一个直接子区域的模板整体不能提供无效排列", async ({ page }) => {
  const { server, definition } = await launchMasterOnMainRoute(page, "左右图文");
  expect(definition.nodes[definition.rootNodeId].childIds).toHaveLength(1);
  await page.getByRole("button", { name: "模板整体", exact: true }).click();
  const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
  const rootLayout = inspector.locator('details[data-template-property-group="排列与分栏"]');
  if (await rootLayout.count()) await rootLayout.locator(":scope > summary").click();
  const choices = inspector.getByRole("group", { name: "选择容器排列方式", exact: true }).getByRole("button");
  expect(await choices.evaluateAll((buttons) => buttons.every((button) => (button as HTMLButtonElement).disabled)), "根只有一个直接子区域，不能把无视觉效果的切换显示成可用操作；应引导选择图文分栏").toBe(true);
  const beforeLocate = await readSession(page);
  const split = Object.values(definition.nodes).find((node) => node.name === "图文分栏")!;
  await inspector.getByRole("button", { name: "调整图文分栏排列", exact: true }).click();
  await expect.poll(async () => (await readSession(page)).selectedObjectId).toBe(split.nodeId);
  expect((await readSession(page)).definition).toEqual(beforeLocate.definition);
  expect((await readSession(page)).historyPast).toEqual(beforeLocate.historyPast);
  expect(server.writes).toEqual([]);
});

for (const device of ["desktop", "mobile"] as const) test(`首发主路由真实几何：固定四格作品${device}保持约定排布且不提供失效转换`, async ({ page }, testInfo) => {
  // 首发作品网格固定四格：桌面四列、手机两列。不能为使控件显得可用而任意改成单列。
  const { server, definition } = await launchMasterOnMainRoute(page, "作品网格");
  const works = Object.values(definition.nodes).find((node) => node.name === "作品卡组")!;
  await page.getByRole("button", { name: new RegExp(`${device === "desktop" ? "桌面端" : "移动端"}模板布局`) }).click();
  await selectLaunchStructure(page, works.nodeId);
  const boxes = await Promise.all(works.childIds.map((id) => renderedNodeBox(page, id)));
  expect(boxes).toHaveLength(4);
  if (device === "desktop") {
    for (const box of boxes) expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(1.5);
    for (let index = 1; index < boxes.length; index++) expect(boxes[index].x).toBeGreaterThan(boxes[index - 1].x);
  } else {
    expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(1.5);
    expect(Math.abs(boxes[2].y - boxes[3].y)).toBeLessThan(1.5);
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1);
  }
  await page.screenshot({ path: testInfo.outputPath(`launch-works-${device}-layout.png`), animations: "disabled" });
  const choices = page.getByRole("region", { name: "排列与分栏设置", exact: true }).getByRole("group", { name: "选择容器排列方式", exact: true });
  const invalidChoices = choices.getByRole("button", { name: /预览(?:上下排列|左右排列|自动换行)/ });
  const vertical = choices.getByRole("button", { name: "预览上下排列", exact: true });
  if (await vertical.count() && await vertical.isEnabled()) {
    await vertical.click();
    await page.getByRole("button", { name: "确认排列转换", exact: true }).click();
    const afterBoxes = await Promise.all(works.childIds.map((id) => renderedNodeBox(page, id)));
    await testInfo.attach("controlled-grid-geometry.json", { body: JSON.stringify({ device, before: boxes, after: afterBoxes }, null, 2), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath(`launch-works-${device}-after-invalid-layout.png`), animations: "disabled" });
  }
  expect(await invalidChoices.evaluateAll((buttons) => buttons.every((button) => (button as HTMLButtonElement).disabled)), "受控四格不能提供 Renderer 忽略或破坏约定的排列选项").toBe(true);
  await expect(page.getByRole("spinbutton", { name: "网格列数", exact: true })).toHaveCount(0);
  const beforeGap = await readSession(page);
  const gap = page.getByRole("spinbutton", { name: "对象间距", exact: true });
  const previousGap = Number(await gap.inputValue());
  await gap.fill(String(previousGap + 12));
  await gap.press("Enter");
  await expect.poll(async () => {
    const after = await Promise.all(works.childIds.map((id) => renderedNodeBox(page, id)));
    return Math.max(...after.map((box, index) => Math.max(Math.abs(box.width - boxes[index].width), Math.abs((box.x - after[0].x) - (boxes[index].x - boxes[0].x)), Math.abs((box.y - after[0].y) - (boxes[index].y - boxes[0].y)))));
  }, { message: "允许的作品间距修改必须改变四图实际位置或尺寸" }).toBeGreaterThan(0.5);
  const afterGap = await Promise.all(works.childIds.map((id) => renderedNodeBox(page, id)));
  if (device === "desktop") {
    for (const box of afterGap) expect(Math.abs(box.y - afterGap[0].y)).toBeLessThan(1.5);
    for (let index = 1; index < afterGap.length; index++) expect(afterGap[index].x).toBeGreaterThan(afterGap[index - 1].x);
  } else {
    expect(Math.abs(afterGap[0].y - afterGap[1].y)).toBeLessThan(1.5);
    expect(Math.abs(afterGap[2].y - afterGap[3].y)).toBeLessThan(1.5);
    expect(afterGap[2].y).toBeGreaterThan(afterGap[0].y + afterGap[0].height - 1);
  }
  await page.screenshot({ path: testInfo.outputPath(`launch-works-${device}-after-gap.png`), animations: "disabled" });
  expect((await readSession(page)).historyPast).toHaveLength(beforeGap.historyPast.length + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(beforeGap.definition);
  await expect.poll(async () => {
    const restored = await Promise.all(works.childIds.map((id) => renderedNodeBox(page, id)));
    return Math.max(...restored.map((box, index) => Math.max(Math.abs(box.width - boxes[index].width), Math.abs((box.x - restored[0].x) - (boxes[index].x - boxes[0].x)), Math.abs((box.y - restored[0].y) - (boxes[index].y - boxes[0].y)))));
  }).toBeLessThan(1.5);
  expect(server.writes).toEqual([]);
});
