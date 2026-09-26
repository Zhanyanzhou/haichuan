import { expect, test } from "@playwright/test";

test("健康 SSE 漏事件时仍定期对账，并随页面生命周期启停", async ({ page }) => {
  test.skip(
    process.env.PLAYWRIGHT_APP_MODE === "mock",
    "需要 development HTTP 夹具覆盖真实发布读取 hook",
  );

  let revision = 1;
  let reads = 0;

  await page.clock.install();
  await page.addInitScript(() => {
    const streams: Array<{
      closed: boolean;
      onmessage: ((event: { data: string }) => void) | null;
      onerror: (() => void) | null;
      close: () => void;
    }> = [];
    let visibility: DocumentVisibilityState = "visible";

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    Object.assign(window, {
      pagePublishTestStreams: streams,
      setPagePublishTestVisibility(next: DocumentVisibilityState) {
        visibility = next;
        document.dispatchEvent(new Event("visibilitychange"));
      },
    });

    class PagePublishTestStream {
      closed = false;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        streams.push(this);
      }

      close() {
        this.closed = true;
      }
    }

    Object.assign(window, { EventSource: PagePublishTestStream });
  });

  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/page-modules/document/published")) {
      return route.abort();
    }

    reads += 1;
    return route.fulfill({
      json: {
        code: 200,
        data: {
          pageKey: "home",
          status: "PUBLISHED",
          version: revision,
          puckData: {
            content: [{
              type: "首屏主视觉",
              props: { title: `发布版本 ${revision}` },
            }],
          },
        },
      },
    });
  });
  await page.route("**/__page-publish-reconciliation", (route) => route.fulfill({
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
        const resource = usePublishedPageDocument('home', 'zh-CN');
        return React.createElement(
          'output',
          { 'data-stale': resource.stale },
          resource.pageDocument?.puckData.content[0].props.title ?? resource.status,
        );
      }
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(App));
      window.unmountPagePublishTest = () => root.unmount();
    </script></body></html>`,
  }));

  const streamCount = () => page.evaluate(() => (
    window as typeof window & { pagePublishTestStreams: unknown[] }
  ).pagePublishTestStreams.length);
  const emitPublished = (index: number) => page.evaluate((streamIndex) => {
    const stream = (window as typeof window & {
      pagePublishTestStreams: Array<{
        onmessage: ((event: { data: string }) => void) | null;
      }>;
    }).pagePublishTestStreams[streamIndex];
    stream.onmessage?.({
      data: JSON.stringify({ type: "page-document-published", pageKey: "home" }),
    });
  }, index);

  await page.goto("/__page-publish-reconciliation");
  await expect(page.locator("output")).toHaveText("发布版本 1");
  await expect.poll(streamCount).toBe(1);
  expect(reads).toBe(1);

  // EventSource 保持健康但未收到发布事件：60 秒独立 GET 对账必须拉到新 revision。
  revision = 2;
  await page.clock.runFor(60000);
  await expect(page.locator("output")).toHaveText("发布版本 2");
  expect(reads).toBe(2);
  expect(await streamCount()).toBe(1);

  // SSE 消息仍是快速路径，但不能取消下一轮长期对账。
  revision = 3;
  await emitPublished(0);
  await expect(page.locator("output")).toHaveText("发布版本 3");
  expect(reads).toBe(3);
  revision = 4;
  await page.clock.runFor(60000);
  await expect(page.locator("output")).toHaveText("发布版本 4");
  expect(reads).toBe(4);

  // 隐藏期间关闭 SSE 且停止 GET；恢复可见时沿既有合同立即补拉并重建订阅。
  await page.evaluate(() => (
    window as typeof window & {
      setPagePublishTestVisibility: (next: DocumentVisibilityState) => void;
    }
  ).setPagePublishTestVisibility("hidden"));
  const readsBeforeHiddenWait = reads;
  revision = 5;
  await page.clock.runFor(120000);
  expect(reads).toBe(readsBeforeHiddenWait);
  await expect(page.locator("output")).toHaveText("发布版本 4");
  expect(await page.evaluate(() => (
    window as typeof window & {
      pagePublishTestStreams: Array<{ closed: boolean }>;
    }
  ).pagePublishTestStreams[0].closed)).toBe(true);

  await page.evaluate(() => (
    window as typeof window & {
      setPagePublishTestVisibility: (next: DocumentVisibilityState) => void;
    }
  ).setPagePublishTestVisibility("visible"));
  await expect(page.locator("output")).toHaveText("发布版本 5");
  await expect.poll(streamCount).toBe(2);
  expect(reads).toBe(readsBeforeHiddenWait + 1);

  // 卸载必须同时关闭当前连接并清除长期对账计时器。
  await page.evaluate(() => (
    window as typeof window & { unmountPagePublishTest: () => void }
  ).unmountPagePublishTest());
  const readsBeforeUnmountWait = reads;
  await page.clock.runFor(120000);
  expect(reads).toBe(readsBeforeUnmountWait);
  expect(await streamCount()).toBe(2);
  expect(await page.evaluate(() => (
    window as typeof window & {
      pagePublishTestStreams: Array<{ closed: boolean }>;
    }
  ).pagePublishTestStreams[1].closed)).toBe(true);
});
