import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const originalConsoleError = console.error;
console.error = (...args) => {
  if (String(args[0]).includes("useLayoutEffect does nothing on the server")) return;
  originalConsoleError(...args);
};

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const loaded = await server.ssrLoadModule("/src/components/blocks/FullBleedBlock.tsx");
  const FullBleedBlock = loaded.default;

  const render = (content, styleConfig = {}, editMode = false) => renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(FullBleedBlock, {
        module: {
          content: { image: "/poster-desktop.jpg", mobileImage: "/poster-mobile.jpg", ...content },
          layoutConfig: { template: "textLeft" },
          styleConfig,
        },
        editMode,
      }),
    ),
  );

  const productPoster = render(
    { title: "鎏金新作", buttonText: "探索作品", targetType: "product", productId: 12, altText: "鎏金珠宝海报" },
    { overlayPreset: "soft", desktopFocusX: 18, desktopFocusY: 42, mobileFocusX: 72, mobileFocusY: 35 },
  );
  const pagePoster = render({ targetType: "page", linkUrl: "/about" });
  const staticPoster = render({ targetType: "none", linkUrl: "/about" });
  const legacyPoster = render({ linkUrl: "/custom" }, { bgColor: "rgba(1,2,3,.4)" });
  const editorPoster = render({ targetType: "product", productId: 12 }, {}, true);
  const emptyPoster = renderToStaticMarkup(
    React.createElement(FullBleedBlock, { module: { content: {} } }),
  );

  const checks = {
    desktopRatio: productPoster.includes("aspect-ratio: 12 / 5"),
    mobileRatio: productPoster.includes("aspect-ratio: 5 / 6"),
    independentDesktopFocus: productPoster.includes("--hc-poster-focus-desktop:18% 42%"),
    independentMobileFocus: productPoster.includes("--hc-poster-focus-mobile:72% 35%"),
    productLink: productPoster.includes('href="/products/12"'),
    pageLink: pagePoster.includes('href="/about"'),
    noLinkMode: !staticPoster.includes('href="/about"'),
    editModePreventsNavigation: !editorPoster.includes('href="/products/12"'),
    legacyLinkCompatible: legacyPoster.includes('href="/custom"'),
    emptyPublishedHidden: emptyPoster === "",
    guideText: productPoster.includes("探索作品"),
    accessibleAlt: productPoster.includes('alt="鎏金珠宝海报"'),
  };

  const failed = Object.entries(checks).filter(([, passed]) => !passed);
  if (failed.length > 0) {
    throw new Error(`单张海报渲染契约失败：${failed.map(([name]) => name).join(", ")}`);
  }

  console.log(`单张海报渲染契约通过：${Object.keys(checks).length} 项。`);
} finally {
  console.error = originalConsoleError;
  await server.close();
}
