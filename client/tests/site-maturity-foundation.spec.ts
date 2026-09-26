import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPublicUrl,
  normalizePublicSiteOrigin,
} from "../src/utils/publicSiteUrl";
import { isNonIndexablePublicRoute } from "../src/utils/publicSeoPolicy";
import {
  PUBLIC_ENGLISH_ROUTES_ENABLED,
  resolveRetiredEnglishRedirect,
  resolvePublicLocalePath,
  withPublicLocalePath,
} from "../src/i18n/publicLocale";
import {
  publicPageDocumentStreamUrl,
  publicProductStreamUrl,
} from "../src/services/httpClient";

test("公开站点 Origin 拒绝不安全或带路径配置", () => {
  expect(normalizePublicSiteOrigin("https://jewelry.example.com")).toBe(
    "https://jewelry.example.com",
  );
  expect(normalizePublicSiteOrigin("http://jewelry.example.com")).toBeNull();
  expect(
    normalizePublicSiteOrigin("http://127.0.0.1:5173", { allowHttp: true }),
  ).toBe("http://127.0.0.1:5173");
  expect(
    normalizePublicSiteOrigin("https://jewelry.example.com/store"),
  ).toBeNull();
  expect(
    buildPublicUrl("https://jewelry.example.com", "//hostile.example/path"),
  ).toBe("https://jewelry.example.com/hostile.example/path");
});

test("账户、交易、受控预览和开发页统一使用非索引路由策略", () => {
  for (const pathname of [
    "/customer",
    "/customer/forgot",
    "/CUSTOMER/RESET",
    "/cart",
    "/checkout/confirm",
    "/partner",
    "/preview/home",
    "/__templates",
    "/en",
    "/en/about",
  ]) {
    expect(isNonIndexablePublicRoute(pathname), pathname).toBe(true);
  }

  for (const pathname of [
    "/",
    "/catalog",
    "/products/HC-001",
    "/custom",
    "/contact",
    "/privacy",
    "/business-info",
  ]) {
    expect(isNonIndexablePublicRoute(pathname), pathname).toBe(false);
  }
});

test("退役英文路由保持历史解析但只允许安全地回到同源中文路径", () => {
  expect(PUBLIC_ENGLISH_ROUTES_ENABLED).toBe(false);
  expect(resolvePublicLocalePath("/EN/about")).toEqual({
    locale: "en",
    pathname: "/about",
  });
  expect(withPublicLocalePath("/ABOUT", "en")).toBe("/en/ABOUT");
  expect(withPublicLocalePath("/about", "en")).toBe("/en/about");
  expect(resolveRetiredEnglishRedirect("/en")).toBe("/");
  expect(resolveRetiredEnglishRedirect("/EN/about")).toBe("/about");
  expect(resolveRetiredEnglishRedirect("/en//evil.example")).toBe("/");
  expect(resolveRetiredEnglishRedirect("/en/%2F%2Fevil.example")).toBe("/");
  expect(resolveRetiredEnglishRedirect("/en/%5cevil.example")).toBe("/");
  expect(resolveRetiredEnglishRedirect("/en/\\evil.example")).toBe("/");
});

test("Dockerfile 只声明公开 Vite 构建参数，Compose 使用不可变镜像且 Nginx 二次隔离非公开页面", () => {
  const dockerfile = readFileSync(resolve("Dockerfile"), "utf8");
  const compose = readFileSync(resolve("../docker-compose.yml"), "utf8");
  const nginx = readFileSync(resolve("nginx.conf"), "utf8");
  const nginxMain = readFileSync(resolve("nginx-main.conf"), "utf8");
  const publicSeoGenerator = readFileSync(
    resolve("../scripts/generate-public-seo-artifacts.mjs"),
    "utf8",
  );
  const spaShell = readFileSync(resolve("index.html"), "utf8");

  expect(dockerfile).toContain("ARG VITE_PUBLIC_SITE_ORIGIN");
  expect(dockerfile).not.toContain('ARG VITE_PUBLIC_SITE_ORIGIN=""');
  expect(dockerfile).toContain('test -n "$VITE_PUBLIC_SITE_ORIGIN"');
  expect(dockerfile).toContain('ARG VITE_ANALYTICS_ENABLED="false"');
  expect(compose).not.toMatch(/^\s+build\s*:/m);
  expect(compose).not.toContain("VITE_PUBLIC_SITE_ORIGIN:");
  expect(nginx).toContain("location = /__templates");
  expect(nginx).toContain("TemplateGallery-");
  expect(nginx).toContain("include /etc/nginx/public-seo-routes.conf;");
  expect(nginx).toContain("include /etc/nginx/public-origin-redirect.conf;");
  expect(nginx).not.toContain("https://$host$request_uri");
  expect(dockerfile).toContain("COPY .release-seo/public-origin-redirect.conf");
  expect(dockerfile).toContain("--nginx-origin-redirect ./public-origin-redirect.conf");
  expect(nginx).toContain("location ~* ^/en(?:/|$)");
  expect(spaShell).toContain('<meta name="robots" content="noindex, nofollow" />');
  expect(nginx).toContain("location = /en {");
  expect(nginx).toContain("location ~* ^/en/([^/].*)$ {");
  expect(nginx).toMatch(/location ~\* \^\/en\/\/ \{\s*return 404;/);
  expect(nginx).toMatch(/location ~\* \^\/en\/\.\+%2f \{\s*return 404;/);
  expect(nginx).toMatch(/location ~\* \^\/en\/\.\+%5c \{\s*return 404;/);
  expect(nginxMain).toContain("merge_slashes off;");
  expect(nginx).toMatch(/location ~\* \^\/en\(\?:\/\|\$\) \{\s*return 404;/);
  expect(nginx).toContain("error_page 404 /404.html;");
  expect(nginx).toContain("location = /404.html");
  expect(nginx).not.toContain("404-en.html");
  expect(nginx).toContain(
    "location ~* ^/(admin|preview|customer|cart|checkout|partner)(/|$)",
  );
  expect(nginxMain).toContain("include /etc/nginx/public-seo-policy.conf;");
  expect(nginxMain).toContain("include /etc/nginx/public-origin-host.conf;");
  expect(nginx).toContain("listen 127.0.0.1:8082;");
  expect(nginx).toContain("location = /healthz");
  expect(nginx).toContain("if ($hc_public_origin_host_allowed = 0) { return 421; }");
  expect(publicSeoGenerator).toContain(
    '"map $request_uri $hc_robots_tag {"',
  );
  expect(publicSeoGenerator).toContain('"/en"');
  expect(nginx).toContain(
    'add_header X-Robots-Tag $hc_robots_tag always',
  );
  expect(nginx).not.toContain('add_header X-Robots-Tag "noindex, nofollow"');
  expect(nginx).toMatch(
    /location = \/api\/products\/catalog\/stream \{[\s\S]*?proxy_buffering off;[\s\S]*?\}/,
  );
});

test("公开 SSE URL 显式携带中文语言", () => {
  expect(publicProductStreamUrl("zh-CN")).toContain("locale=zh-CN");
  expect(publicPageDocumentStreamUrl("zh-CN")).toContain("locale=zh-CN");
});

for (const viewport of [
  { name: "桌面", width: 1440, height: 900 },
  { name: "手机", width: 390, height: 844 },
] as const) {
  test(`首页公开读取期间以克制可见状态稳定首屏（${viewport.name}）`, async ({ page }) => {
    const pendingPublishedRoutes: Route[] = [];
    let pageDocumentRequested = false;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/page-modules/document/published") {
        expect(url.searchParams.get("locale")).toBe("zh-CN");
        pageDocumentRequested = true;
        pendingPublishedRoutes.push(route);
        return;
      }
      await route.fulfill({ json: { code: 200, data: null, message: "success" } });
    });

    await page.goto("/");
    await expect.poll(() => pageDocumentRequested).toBe(true);
    const loadingStatus = page.getByRole("status");
    await expect(loadingStatus).toBeVisible();
    await expect(loadingStatus).toContainText("首页内容正在准备");
    await expect(page.getByText("正在载入首页", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Loading home", { exact: true })).toHaveCount(0);

    const geometry = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      return {
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        footerTop: footer?.getBoundingClientRect().top ?? -1,
        viewportHeight: window.innerHeight,
      };
    });
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(geometry.footerTop).toBeGreaterThanOrEqual(geometry.viewportHeight - 1);

    const accessibility = await new AxeBuilder({ page }).include("main").analyze();
    expect(
      accessibility.violations.filter((violation) =>
        violation.impact === "serious" || violation.impact === "critical"
      ),
    ).toEqual([]);

    for (const route of pendingPublishedRoutes) {
      await route.fulfill({
        json: {
          code: 200,
          data: {
            pageKey: "home",
            status: "PUBLISHED",
            version: 1,
            puckData: {
              content: [{
                type: "首屏主视觉",
                props: { title: "已发布首页" },
              }],
            },
          },
          message: "success",
        },
      });
    }
    await expect(loadingStatus).toBeHidden();
    await expect(page.getByRole("heading", { name: "已发布首页", level: 1 })).toBeVisible();
  });
}

test("预渲染首页在接口校准前先使用同一份已发布文档", async ({ page }) => {
  const unknownPropWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error"
      && message.text().includes("React does not recognize the fetchPriority prop")
    ) {
      unknownPropWarnings.push(message.text());
    }
  });
  const bootstrap = JSON.stringify({
    pageKey: "home",
    status: "PUBLISHED",
    metadata: {},
    puckData: {
      content: [{
        type: "首屏主视觉",
        props: {
          desktopImage: "/uploads/static-hero.jpg",
          mobileImage: "/images/system/launch-short-page-mobile.svg",
          title: "静态首屏",
          subtitle: "稳定首屏副标题",
          __instanceOverrides: {
            version: 2,
            nodes: { title: { enabled: false } },
          },
        },
      }],
    },
  }).replaceAll("<", "\\u003c");
  await page.route("**/__prerendered-home-bootstrap", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></head><body><div id="root"><script id="hc-published-page-document" type="application/json">${bootstrap}</script></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { usePublishedPageDocument } from '/src/page-builder/runtime/usePublishedPageDocument.ts';
      import { HomeFirstFold } from '/src/pages/public/Home/index.tsx';
      function App() {
        const resource = usePublishedPageDocument('home');
        return React.createElement(
          React.Fragment,
          null,
          React.createElement('output', null, resource.pageDocument?.puckData.content[0].props.title ?? resource.status),
          React.createElement(HomeFirstFold, { data: resource.pageDocument?.puckData }),
        );
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    </script></body></html>`,
  }));
  await page.route("**/api/page-modules/document/published**", (route) => route.fulfill({
    status: 503,
    json: { code: 503, message: "fixture unavailable" },
  }));

  await page.goto("/__prerendered-home-bootstrap");
  await expect(page.locator("output")).toHaveText("静态首屏");
  await expect(page.getByRole("heading", { name: "静态首屏" })).toHaveCount(0);
  await expect(page.getByText("稳定首屏副标题")).toBeVisible();
  await expect(page.locator('section[aria-label="首页首屏"] source')).toHaveAttribute(
    "srcset",
    "/uploads/static-hero.jpg?width=480",
  );
  await expect(page.locator('section[aria-label="首页首屏"] img')).toHaveAttribute(
    "src",
    "/uploads/static-hero.jpg?width=1680",
  );
  await expect(page.locator('section[aria-label="首页首屏"] img')).toHaveAttribute(
    "fetchpriority",
    "high",
  );
  expect(unknownPropWarnings).toEqual([]);
});

for (const scenario of ["首次订阅与断线重连", "首次订阅重叠且补拉失败"] as const) {
test(`公开页面${scenario}保留安全快照并正确补拉（自有 API Mock）`, async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "需要 development HTTP 夹具覆盖真实发布读取 hook");
  let revision = 1;
  let reads = 0;
  let finishFirstRead!: () => void;
  const firstReadGate = new Promise<void>((resolve) => { finishFirstRead = resolve; });
  await page.clock.install();
  await page.addInitScript(() => {
    const streams: Array<{
      onmessage: ((event: { data: string }) => void) | null;
      onerror: (() => void) | null;
    }> = [];
    Object.assign(window, { publicationTestStreams: streams });
    class PublicationTestStream {
      onmessage = null;
      onerror = null;
      constructor() { streams.push(this); }
      close() {}
    }
    Object.assign(window, { EventSource: PublicationTestStream });
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/page-modules/document/published")) return route.abort();
    reads += 1;
    const requestedRevision = revision;
    if (scenario === "首次订阅重叠且补拉失败") {
      if (reads === 1) await firstReadGate;
      else if (reads === 2) return route.fulfill({ status: 503, json: { code: 503, message: "fixture unavailable" } });
    }
    return route.fulfill({ json: { code: 200, data: {
      pageKey: "home", status: "PUBLISHED", version: requestedRevision,
      puckData: { content: [{ type: "首屏主视觉", props: { title: `发布版本 ${requestedRevision}` } }] },
    } } });
  });
  await page.route("**/__publication-reconnect", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></head><body><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { usePublishedPageDocument } from '/src/page-builder/runtime/usePublishedPageDocument.ts';
      function App() {
        const resource = usePublishedPageDocument('home');
        return React.createElement('output', { 'data-stale': resource.stale }, resource.pageDocument?.puckData.content[0].props.title ?? resource.status);
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    </script></body></html>`,
  }));
  await page.goto("/__publication-reconnect");
  const emit = (index: number, type: string, pageKey?: string) => page.evaluate(({ index, type, pageKey }) => {
    const { publicationTestStreams } = window as typeof window & {
      publicationTestStreams: Array<{ onmessage: (event: { data: string }) => void; onerror: () => void }>;
    };
    if (type === "disconnect") publicationTestStreams[index].onerror();
    else publicationTestStreams[index].onmessage({ data: JSON.stringify({ type, ...(pageKey ? { pageKey } : {}) }) });
  }, { index, type, pageKey });

  if (scenario === "首次订阅重叠且补拉失败") {
    await expect.poll(() => reads).toBe(1);
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & { publicationTestStreams: unknown[] }
    ).publicationTestStreams.length)).toBe(1);
    await emit(0, "ready");
    await emit(0, "page-document-published", "home");
    expect(reads).toBe(1);
    finishFirstRead();
    await expect(page.locator("output")).toHaveText("发布版本 1");
    await expect(page.locator("output")).toHaveAttribute("data-stale", "true");
    expect(reads).toBe(2);
    revision = 3;
    await emit(0, "page-document-published", "home");
    await expect(page.locator("output")).toHaveText("发布版本 3");
    await expect(page.locator("output")).toHaveAttribute("data-stale", "false");
    expect(reads).toBe(3);
    return;
  }
  await expect(page.locator("output")).toHaveText("发布版本 1");
  expect(reads).toBe(1);

  // 首次 GET 后、订阅建立前恰好发布，也必须读取新版本。
  revision = 2;
  await emit(0, "ready");
  await expect(page.locator("output")).toHaveText("发布版本 2");
  expect(reads).toBe(2);
  await emit(0, "disconnect");
  revision = 3;
  await page.clock.runFor(1000);
  await emit(1, "ready");
  await expect(page.locator("output")).toHaveText("发布版本 3");
  expect(reads).toBe(3);
  await emit(1, "heartbeat");
  await emit(1, "page-document-published", "about");
  await page.clock.runFor(1000);
  expect(reads).toBe(3);
  revision = 4;
  await emit(1, "page-document-published", "home");
  await expect(page.locator("output")).toHaveText("发布版本 4");
  expect(reads).toBe(4);
});
}

test("商品 SSE 始终权威对账并在恢复、隐藏或卸载时正确收敛", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const streams: Array<{
      closed: boolean;
      onopen: (() => void) | null;
      onmessage: (() => void) | null;
      onerror: (() => void) | null;
      close: () => void;
    }> = [];
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    Object.assign(window, {
      reconnectTestStreams: streams,
      reconnectTestCallbacks: 0,
      setReconnectTestVisibility(next: DocumentVisibilityState) {
        visibility = next;
        document.dispatchEvent(new Event("visibilitychange"));
      },
    });
    class ReconnectTestStream {
      closed = false;
      onopen: (() => void) | null = null;
      onmessage: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        streams.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    Object.assign(window, { EventSource: ReconnectTestStream });
  });
  await page.route("**/__product-stream-reconnect", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></head><body><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { useReconnectingEventSource } from '/src/hooks/useReconnectingEventSource.ts';
      function App() {
        useReconnectingEventSource('/api/products/stream', () => {
          window.reconnectTestCallbacks += 1;
        }, { maxRetries: 1, maxDelayMs: 10, debounceMs: 20 });
        return null;
      }
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(App));
      window.unmountReconnectTest = () => root.unmount();
    </script></body></html>`,
  }));

  await page.goto("/__product-stream-reconnect");
  const streamCount = () => page.evaluate(() => (
    window as typeof window & { reconnectTestStreams: unknown[] }
  ).reconnectTestStreams.length);
  const callbackCount = () => page.evaluate(() => (
    window as typeof window & { reconnectTestCallbacks: number }
  ).reconnectTestCallbacks);
  const emit = (index: number, type: "open" | "message" | "error") => page.evaluate(
    ({ index, type }) => {
      const stream = (window as typeof window & {
        reconnectTestStreams: Array<{
          onopen: (() => void) | null;
          onmessage: (() => void) | null;
          onerror: (() => void) | null;
        }>;
      }).reconnectTestStreams[index];
      if (type === "open") stream.onopen?.();
      else if (type === "message") stream.onmessage?.();
      else stream.onerror?.();
    },
    { index, type },
  );

  await expect.poll(streamCount).toBe(1);
  await emit(0, "error");
  await page.clock.runFor(10);
  await expect.poll(streamCount).toBe(2);
  await emit(1, "error");

  // 指数重试耗尽后不永久放弃：60 秒后独立补拉并且只建立一条恢复连接。
  await page.clock.runFor(60000);
  await expect.poll(streamCount).toBe(3);
  await page.clock.runFor(20);
  expect(await callbackCount()).toBe(1);
  await emit(2, "open");
  await page.clock.runFor(60000);
  expect(await streamCount()).toBe(3);
  // 健康连接没有消息时仍回源，证明多实例漏消息不会让页面永久陈旧。
  expect(await callbackCount()).toBe(2);

  // 本实例消息只负责加速刷新，不能取消下一轮跨实例权威对账。
  await emit(2, "message");
  await page.clock.runFor(20);
  expect(await callbackCount()).toBe(3);
  await page.clock.runFor(60000);
  expect(await streamCount()).toBe(3);
  expect(await callbackCount()).toBe(4);

  // open 已重置退避，下次断线从快速重试开始，而不是直接回到兜底。
  await emit(2, "error");
  await page.clock.runFor(10);
  await expect.poll(streamCount).toBe(4);

  await emit(3, "message");
  await page.evaluate(() => (
    window as typeof window & {
      setReconnectTestVisibility: (next: DocumentVisibilityState) => void;
    }
  ).setReconnectTestVisibility("hidden"));
  await page.clock.runFor(120000);
  expect(await streamCount()).toBe(4);
  expect(await callbackCount()).toBe(4);

  await page.evaluate(() => (
    window as typeof window & {
      setReconnectTestVisibility: (next: DocumentVisibilityState) => void;
    }
  ).setReconnectTestVisibility("visible"));
  await expect.poll(streamCount).toBe(5);
  await page.clock.runFor(20);
  expect(await callbackCount()).toBe(5);

  // 卸载后关闭当前 EventSource，并取消已排队的 debounce/重连/兜底 timer。
  await emit(4, "message");
  await page.evaluate(() => (
    window as typeof window & { unmountReconnectTest: () => void }
  ).unmountReconnectTest());
  await page.clock.runFor(120000);
  expect(await streamCount()).toBe(5);
  expect(await callbackCount()).toBe(5);
  expect(await page.evaluate(() => (
    window as typeof window & { reconnectTestStreams: Array<{ closed: boolean }> }
  ).reconnectTestStreams[4].closed)).toBe(true);
});

test("商品权威对账不依赖浏览器支持 EventSource", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: undefined,
    });
    Object.assign(window, {
      reconnectWithoutSseCallbacks: 0,
      setReconnectWithoutSseVisibility(next: DocumentVisibilityState) {
        visibility = next;
        document.dispatchEvent(new Event("visibilitychange"));
      },
    });
  });
  await page.route("**/__product-reconciliation-without-sse", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></head><body><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { useReconnectingEventSource } from '/src/hooks/useReconnectingEventSource.ts';
      function App() {
        useReconnectingEventSource('/api/products/stream', () => {
          window.reconnectWithoutSseCallbacks += 1;
        }, { debounceMs: 20 });
        return null;
      }
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(App));
      window.unmountReconnectWithoutSse = () => root.unmount();
    </script></body></html>`,
  }));

  await page.goto("/__product-reconciliation-without-sse");
  const callbackCount = () => page.evaluate(() => (
    window as typeof window & { reconnectWithoutSseCallbacks: number }
  ).reconnectWithoutSseCallbacks);
  await page.clock.runFor(60020);
  expect(await callbackCount()).toBe(1);

  await page.evaluate(() => (
    window as typeof window & {
      setReconnectWithoutSseVisibility: (next: DocumentVisibilityState) => void;
    }
  ).setReconnectWithoutSseVisibility("hidden"));
  await page.clock.runFor(120000);
  expect(await callbackCount()).toBe(1);

  await page.evaluate(() => (
    window as typeof window & {
      setReconnectWithoutSseVisibility: (next: DocumentVisibilityState) => void;
    }
  ).setReconnectWithoutSseVisibility("visible"));
  await page.clock.runFor(20);
  expect(await callbackCount()).toBe(2);

  await page.evaluate(() => (
    window as typeof window & { unmountReconnectWithoutSse: () => void }
  ).unmountReconnectWithoutSse());
  await page.clock.runFor(120000);
  expect(await callbackCount()).toBe(2);
});

test("未知公开路径呈现可恢复的品牌 404 且禁止索引", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");

  await expect(page).toHaveURL(/this-page-does-not-exist$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "此页未被找到" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "返回首页" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex,\s*nofollow/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("失效作品页禁止索引且不输出 Product 结构化数据", async ({ page }) => {
  await page.route("**/api/products/public/definitely-not-published**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: 404, data: null, message: "not found" }),
    }),
  );
  await page.goto("/products/definitely-not-published");

  await expect(
    page.getByRole("heading", { level: 1, name: "作品暂不可浏览" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex,\s*nofollow/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(
    page.locator('script[data-structured-data="product"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('script[data-structured-data="product-breadcrumb"]'),
  ).toHaveCount(0);
});

test("未配置公开 Origin 时联系页只输出 FAQ Schema，并准确标记必填语义", async ({ page }) => {
  await page.goto("/contact");

  await expect(
    page.locator('script[data-structured-data="organization"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('script[data-structured-data="contact-faq"]'),
  ).toHaveCount(1);

  const schemaTypes = await page
    .locator('script[type="application/ld+json"][data-structured-data]')
    .evaluateAll((scripts) => scripts.map((script) => {
      const value = JSON.parse(script.textContent || "{}") as { "@type"?: string };
      return value["@type"];
    }));
  expect(schemaTypes).toEqual(["FAQPage"]);

  for (const id of [
    "cf-name",
    "cf-phone",
    "cf-type",
    "cf-message",
    "cf-privacy-consent",
  ]) {
    await expect(page.locator(`#${id}`)).toHaveAttribute("aria-required", "true");
  }
  await expect(page.locator("#cf-time")).not.toHaveAttribute("aria-required", "true");
});

test("经营主体与隐私页使用同一法定事实并如实说明分析同意边界", async ({ page }) => {
  await page.goto("/business-info");
  await expect(page.getByRole("heading", { level: 1, name: "经营主体信息" })).toBeVisible();
  await expect(page.getByText("深圳市海川文化创意设计有限公司", { exact: true })).toBeVisible();
  await expect(page.getByText("91440300MA5HH1J83Y", { exact: true })).toBeVisible();

  await page.goto("/privacy");
  await expect(page.getByText(/行为分析功能默认关闭/)).toBeVisible();
  await expect(page.getByText(/只有在该功能已启用且您明确同意后/)).toBeVisible();
  await expect(page.getByText(/随机分析标识仅保存在当前会话存储中/)).toBeVisible();
});

test("404 在 390px 视口无横向溢出且键盘焦点清晰", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/missing-on-mobile");
  await page.getByRole("link", { name: "返回首页" }).focus();

  await expect(page.getByRole("link", { name: "返回首页" })).toBeFocused();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("客户中心只暴露公共布局的单一 main 地标", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer");

  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
});

for (const viewport of [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
]) {
  test(`账户旅程与无预渲染证据的公开 SPA 壳均禁止索引 · ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/customer/forgot");

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex,\s*nofollow/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

    await page.goto("/privacy");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex,\s*nofollow/,
    );
    if (process.env.VITE_PUBLIC_SITE_ORIGIN) {
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new URL("/privacy", process.env.VITE_PUBLIC_SITE_ORIGIN).href,
      );
    } else {
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    }
  });
}

test("公开发布资源切换页面时不泄漏上一身份内容且退役语言不发请求（自有 API Mock）", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "需要 development HTTP 夹具覆盖真实发布读取 hook");
  let finishCustomRead!: () => void;
  const customReadGate = new Promise<void>((resolve) => { finishCustomRead = resolve; });
  await page.addInitScript(() => {
    class IdentityTestStream {
      onmessage = null;
      onerror = null;
      constructor(url) {
        window.__publishedIdentityStreamUrls.push(String(url));
      }
      close() {}
    }
    Object.assign(window, {
      __publishedIdentityStreamUrls: [],
      EventSource: IdentityTestStream,
    });
  });

  const requestedLocales: string[] = [];
  await page.route("**/api/page-modules/document/published**", async (route) => {
    const url = new URL(route.request().url());
    const pageKey = url.searchParams.get("pageKey") || "home";
    const locale = url.searchParams.get("locale") || "zh-CN";
    requestedLocales.push(locale);
    if (pageKey === "custom" && locale === "zh-CN") await customReadGate;
    const label = pageKey === "home"
      ? "首页已发布"
      : "定制页已发布";
    await route.fulfill({ json: { code: 200, data: {
      pageKey,
      status: "PUBLISHED",
      testLocale: locale,
      puckData: {
        content: [{
          type: "首屏主视觉",
          props: { title: label, ctaLabel: `${label}咨询` },
        }],
      },
    } } });
  });
  await page.route("**/__published-resource-identity", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></head><body><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { usePublishedPageDocument } from '/src/page-builder/runtime/usePublishedPageDocument.ts';
      window.__publishedIdentitySnapshots = [];
      function App({ pageKey, locale }) {
        const resource = usePublishedPageDocument(pageKey, locale);
        const block = resource.pageDocument?.puckData.content[0];
        window.__publishedIdentitySnapshots.push({
          requestedPageKey: pageKey,
          requestedLocale: locale,
          actualPageKey: resource.pageDocument?.pageKey ?? null,
          actualLocale: resource.pageDocument?.testLocale ?? null,
          status: resource.status,
        });
        return React.createElement(React.Fragment, null,
          React.createElement('button', { type: 'button', onClick: () => window.renderIdentity('custom', locale) }, '切换定制页'),
          React.createElement('button', { type: 'button', onClick: () => window.renderIdentity(pageKey, 'en') }, '切换英文'),
          React.createElement('output', { 'data-status': resource.status }, block?.props?.title ?? resource.status),
          block ? React.createElement('a', { href: '/contact' }, block.props.ctaLabel) : null,
        );
      }
      const root = ReactDOM.createRoot(document.getElementById('root'));
      window.renderIdentity = (pageKey, locale) => root.render(React.createElement(App, { pageKey, locale }));
      window.renderIdentity('home', 'zh-CN');
    </script></body></html>`,
  }));

  await page.goto("/__published-resource-identity");
  await expect(page.locator("output")).toHaveText("首页已发布");
  await expect(page.getByRole("link", { name: "首页已发布咨询" })).toBeVisible();

  await page.getByRole("button", { name: "切换定制页" }).click();
  await expect(page.locator("output")).toHaveText("loading");
  await expect(page.getByText("首页已发布", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "首页已发布咨询" })).toHaveCount(0);
  expect(await page.evaluate(() => (
    window as typeof window & { __publishedIdentitySnapshots: Array<Record<string, unknown>> }
  ).__publishedIdentitySnapshots.filter((snapshot) => (
    snapshot.requestedPageKey === "custom" && snapshot.actualPageKey === "home"
  )))).toEqual([]);

  finishCustomRead();
  await expect(page.locator("output")).toHaveText("定制页已发布");
  await expect(page.getByRole("link", { name: "定制页已发布咨询" })).toBeVisible();

  await page.getByRole("button", { name: "切换英文" }).click();
  await expect(page.locator("output")).toHaveText("invalid");
  await expect(page.getByText("定制页已发布", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "定制页已发布咨询" })).toHaveCount(0);
  expect(await page.evaluate(() => (
    window as typeof window & { __publishedIdentitySnapshots: Array<Record<string, unknown>> }
  ).__publishedIdentitySnapshots.filter((snapshot) => (
    snapshot.requestedPageKey === "custom"
    && snapshot.requestedLocale === "en"
    && snapshot.actualLocale === "zh-CN"
  )))).toEqual([]);

  const directReadError = await page.evaluate(async () => {
    const { pageDocumentApi } = await import('/src/services/api.ts');
    try {
      await pageDocumentApi.getPublished('custom', 'en');
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(directReadError).toBe("Requested locale is not published");
  expect(requestedLocales).not.toContain("en");
  expect(await page.evaluate(() => (
    window as typeof window & { __publishedIdentityStreamUrls: string[] }
  ).__publishedIdentityStreamUrls.some((url) => url.includes("locale=en")))).toBe(false);
});
