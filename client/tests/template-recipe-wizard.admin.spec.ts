import { expect, test } from "@playwright/test";
import { installNewTemplateServer, openTemplateDesignWithoutDraft } from "./fixtures/template-authoring-main-route";
import { seedLaunchMasterDraft } from "./fixtures/template-launch-master-entry";

for (const width of [1600, 960, 390]) {
  test(`从零新建、七步向导和首发母版在 ${width}px 均无入口（自有 API Mock）`, async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width, height: 900 });
    await openTemplateDesignWithoutDraft(page);

    const libraryRail = page.getByRole("button", { name: "展开模板组件库", exact: true });
    if (width <= 1024) await libraryRail.press("Enter");
    await expect(page.getByRole("button", { name: "从首发母版开始", exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "新建模板", exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "顶部新建模板", exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "选择首发母版", exact: true, includeHidden: true })).toHaveCount(0);

    if (width <= 1024) await page.getByRole("button", { name: "收起模板组件库", exact: true }).press("Enter");
    await seedLaunchMasterDraft(page);
    await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /模板设置$/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /新建模板$/, includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "创建模板", exact: true, includeHidden: true })).toHaveCount(0);
    expect(server.writes).toEqual([]);
  });
}

test("十种生成布局公开 Renderer 桌面与手机真实几何（隔离界面）", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/recipe-neutral.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e4e6e8"/><circle cx="200" cy="145" r="60" fill="#c2c7cb"/></svg>' }));
  await page.route("**/__recipe-layouts", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
    </script><style>body{margin:0;font-family:Arial;background:#f5f5f5}main{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px;padding:16px}section{min-width:0;background:white}h2{font-size:16px;margin:12px} .canvas{position:relative;overflow:hidden} .inner{transform-origin:top left} @media(max-width:600px){main{grid-template-columns:1fr;padding:0}h2{margin:16px}}</style></head><body><main id="fixture"></main><script type="module">
    import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import '/src/styles/globals.css';
    import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
    import {generateTemplateFromRecipe} from '/src/page-builder/template-creation/generateTemplateFromRecipe.ts';
    import {createRecommendedRecipe,createContentSlot,createMediaSlots,LAYOUTS} from '/src/page-builder/template-creation/presets.ts';
    const device = innerWidth < 600 ? 'mobile' : 'desktop'; const width = device === 'mobile' ? 390 : (innerWidth - 96) / 5;
    const recipes = LAYOUTS.map(([layout,label])=>{ const recipe=createRecommendedRecipe();recipe.layout=layout;
      recipe.canvas={width:1440,height:810,aspectRatio:16/9};
      recipe.media=createMediaSlots(layout==='cards'?['heroImage','secondaryImage','secondaryImage']:['heroImage']);
      recipe.content=[createContentSlot('title')];
      recipe.media.forEach(item=>item.defaultImage='/recipe-neutral.svg'); const definition=generateTemplateFromRecipe(recipe,{templateId:'tpl_'+layout});
      const heading=Object.values(definition.slots).find(slot=>slot.type==='heading'); if(heading) definition.defaultContent[heading.slotId]='测试标题';
      return {definition,label,layout,content:definition.defaultContent};});
    ReactDOM.createRoot(document.getElementById('fixture')).render(React.createElement(React.Fragment,null,...recipes.map(({definition,label,layout,content})=>React.createElement('section',{key:layout,'data-layout':layout},React.createElement('h2',null,label),React.createElement('div',{className:'canvas',style:{height:device==='desktop'?width*1.25:undefined}},React.createElement('div',{className:'inner',style:{width:device==='desktop'?1080:390,transform:device==='desktop'?'scale('+width/1080+')':undefined}},React.createElement(DynamicTemplateRenderer,{definition,device,mode:'public',contentBySlotId:content})))))));
    window.__recipeLayoutCount=recipes.length;
    </script></body></html>` }));
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1200 : 844 });
    await page.goto("/__recipe-layouts");
    await expect(page.locator("section[data-layout]")).toHaveCount(10);
    await expect(page.locator("img")).toHaveCount(12);
    expect(errors).toEqual([]);
    const layouts = await page.locator("section[data-layout]").evaluateAll((elements) => elements.map((element) => {
      const images = Array.from(element.querySelectorAll("img")).map((image) => { const box = image.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
      const heading = element.querySelector('[data-template-node-type="HeadingSlot"]')?.getBoundingClientRect();
      return { name: element.getAttribute("data-layout"), images, heading: heading ? { x: heading.x, y: heading.y, width: heading.width, height: heading.height } : null };
    }));
    for (const layout of layouts) {
      expect(layout.images.every((image) => image.width > 0 && image.height > 0), layout.name!).toBe(true);
      expect(layout.heading, `${layout.name}:标题槽位`).not.toBeNull();
      expect(layout.heading?.height, layout.name!).toBeGreaterThan(0);
      if (width === 390 && !["topContentBottomImage", "leftContentRightImage", "headerSubjectFooter", "centerSubject"].includes(layout.name!)) expect(layout.heading!.y).toBeGreaterThanOrEqual(layout.images[0].y + layout.images[0].height - 1);
      if (width === 390 && ["topContentBottomImage", "leftContentRightImage", "headerSubjectFooter", "centerSubject"].includes(layout.name!)) expect(layout.heading!.y + layout.heading!.height).toBeLessThanOrEqual(layout.images[0].y + 1);
    }
    const geometryIssues = await page.locator("section[data-layout]").evaluateAll((sections) => sections.flatMap((section) => {
      const root = section.querySelector("[data-template-node-id]")!.getBoundingClientRect();
      const leaves = Array.from(section.querySelectorAll("[data-template-slot-id]"));
      const issues = leaves.flatMap((leaf) => {
        const rect = leaf.getBoundingClientRect();
        const name = `${section.getAttribute("data-layout")}:${leaf.getAttribute("data-template-node-id")}`;
        const problems = [];
        if (rect.left < root.left - 1 || rect.top < root.top - 1 || rect.right > root.right + 1 || rect.bottom > root.bottom + 1) problems.push(`${name}:出界`);
        if (leaf.scrollHeight > leaf.clientHeight + 1 || leaf.scrollWidth > leaf.clientWidth + 1) problems.push(`${name}:内容溢出`);
        return problems;
      });
      for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
        if (section.getAttribute("data-layout") === "fullImageOverlay" && leaves[i].getAttribute("data-template-node-type") === "ImageSlot") continue;
        const a = leaves[i].getBoundingClientRect();
        const b = leaves[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push(`${section.getAttribute("data-layout")}:槽位异常覆盖`);
      }
      return issues;
    }));
    expect(geometryIssues).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`generated-layouts-${width}.png`), fullPage: true, animations: "disabled" });
    if (width === 390) await page.locator("section[data-layout]").first().screenshot({ path: testInfo.outputPath("generated-first-layout-mobile.png"), animations: "disabled" });
  }
});
