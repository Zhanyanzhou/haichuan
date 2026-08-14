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

const renderBlock = (Component, module, editMode = false) => renderToStaticMarkup(
  React.createElement(
    MemoryRouter,
    null,
    React.createElement(Component, { module, editMode }),
  ),
);

const assertChecks = (group, checks) => {
  const failed = Object.entries(checks).filter(([, passed]) => !passed);
  if (failed.length > 0) {
    throw new Error(`${group}渲染契约失败：${failed.map(([name]) => name).join(", ")}`);
  }
  return Object.keys(checks).length;
};

try {
  const [heroLoaded, fullBleedLoaded, doubleLoaded, linkLoaded] = await Promise.all([
    server.ssrLoadModule("/src/components/blocks/HeroSection.tsx"),
    server.ssrLoadModule("/src/components/blocks/FullBleedBlock.tsx"),
    server.ssrLoadModule("/src/components/blocks/DoublePosterSection.tsx"),
    server.ssrLoadModule("/src/page-builder/utils/linkTarget.ts"),
  ]);
  const HeroSection = heroLoaded.default;
  const FullBleedBlock = fullBleedLoaded.default;
  const DoublePosterSection = doubleLoaded.default;

  const heroModule = {
    content: {
      image: "/hero-desktop.jpg",
      mobileImage: "/hero-mobile.jpg",
      title: "海川典藏",
      subtitle: "当代高级珠宝作品",
      actionText: "探索作品",
      targetType: "product",
      productId: 12,
      desktopFocusX: 18,
      desktopFocusY: 42,
      mobileFocusX: 72,
      mobileFocusY: 35,
      altText: "海川珠宝首屏",
    },
    styleConfig: {
      textAlign: "left",
      desktopFocusX: 18,
      desktopFocusY: 42,
      mobileFocusX: 72,
      mobileFocusY: 35,
    },
  };
  const heroPublished = renderBlock(HeroSection, heroModule);
  const heroEditor = renderBlock(HeroSection, heroModule, true);
  const heroEmpty = renderBlock(HeroSection, { content: {} });
  const heroLegacy = renderBlock(HeroSection, {
    content: { desktopImage: "/legacy.jpg", actionText: "了解品牌", linkUrl: "/about" },
    styleConfig: { focusX: 33, focusY: 66 },
  });

  const fullBleedPublished = renderBlock(FullBleedBlock, {
    content: {
      image: "/poster-desktop.jpg",
      mobileImage: "/poster-mobile.jpg",
      title: "鎏金新作",
      buttonText: "探索作品",
      targetType: "page",
      linkUrl: "/products",
      altText: "鎏金珠宝海报",
    },
    layoutConfig: { template: "textLeft" },
    styleConfig: {
      overlayPreset: "soft",
      desktopFocusX: 22,
      desktopFocusY: 44,
      mobileFocusX: 68,
      mobileFocusY: 31,
    },
  });

  const doubleModule = {
    content: {
      mainImage: "/double-main.jpg",
      detailImage: "/double-detail.jpg",
      eyebrow: "HIGH JEWELRY",
      title: "珍稀宝石系列",
      description: "由材质、比例与工艺共同构成作品秩序。",
      actionText: "查看系列",
      targetType: "product",
      productId: 28,
      mainAltText: "系列主视觉",
      detailAltText: "珠宝工艺细节",
    },
    layoutConfig: { template: "mainRight" },
    styleConfig: { mainFocusX: 20, mainFocusY: 50, detailFocusX: 80, detailFocusY: 40 },
  };
  const doublePublished = renderBlock(DoublePosterSection, doubleModule);
  const doubleEditor = renderBlock(DoublePosterSection, doubleModule, true);
  const doubleWithoutDetail = renderBlock(DoublePosterSection, {
    content: { ...doubleModule.content, detailImage: "", targetType: "none" },
  });
  const doubleEmpty = renderBlock(DoublePosterSection, { content: {} });

  let count = 0;
  count += assertChecks("首屏展示", {
    fullViewport: heroPublished.includes("100svh"),
    desktopFocus: heroPublished.includes("--hc-hero-focus-desktop:18% 42%"),
    mobileFocus: heroPublished.includes("--hc-hero-focus-mobile:72% 35%"),
    productLink: heroPublished.includes('href="/products/12"'),
    editorPreventsNavigation: !heroEditor.includes('href="/products/12"'),
    accessibleAlt: heroPublished.includes('alt="海川珠宝首屏"'),
    correctIntrinsicRatio: heroPublished.includes('width="3840"') && heroPublished.includes('height="2160"'),
    emptyPublishedHidden: heroEmpty === "",
    legacyPageLink: heroLegacy.includes('href="/about"'),
    legacyFocusCompatible: heroLegacy.includes("--hc-hero-focus-desktop:33% 66%"),
  });
  count += assertChecks("单张海报", {
    desktopRatio: fullBleedPublished.includes("aspect-ratio: 12 / 5"),
    mobileRatio: fullBleedPublished.includes("aspect-ratio: 5 / 6"),
    independentFocus: fullBleedPublished.includes("--hc-poster-focus-desktop:22% 44%")
      && fullBleedPublished.includes("--hc-poster-focus-mobile:68% 31%"),
    pageLink: fullBleedPublished.includes('href="/products"'),
    accessibleAlt: fullBleedPublished.includes('alt="鎏金珠宝海报"'),
  });
  count += assertChecks("双图展示", {
    contentDrivenHeight: !doublePublished.includes("118svh"),
    mainRatio: /aspect-ratio:\s*4 \/ 3/.test(doublePublished),
    detailRatio: /aspect-ratio:\s*4 \/ 5/.test(doublePublished),
    reversibleLayout: doublePublished.includes('data-layout="mainRight"'),
    productLink: doublePublished.includes('href="/products/28"'),
    editorPreventsNavigation: !doubleEditor.includes('href="/products/28"'),
    accessibleAlts: doublePublished.includes('alt="系列主视觉"')
      && doublePublished.includes('alt="珠宝工艺细节"'),
    noPublishedPlaceholder: !doubleWithoutDetail.includes("待上传"),
    emptyPublishedHidden: doubleEmpty === "",
  });
  count += assertChecks("统一跳转", {
    rejectsProtocolRelativeUrl: linkLoaded.resolveLinkTargetUrl({ targetType: "page", linkUrl: "//evil.example" }) === "",
    rejectsExternalUrl: linkLoaded.resolveLinkTargetUrl({ targetType: "page", linkUrl: "https://evil.example" }) === "",
    acceptsInternalPage: linkLoaded.resolveLinkTargetUrl({ targetType: "page", linkUrl: "/about" }) === "/about",
    createsProductPath: linkLoaded.resolveLinkTargetUrl({ targetType: "product", productId: 9 }) === "/products/9",
    supportsLegacyInternalPage: linkLoaded.resolveLinkTargetUrl({ linkUrl: "/custom" }) === "/custom",
  });

  console.log(`视觉海报批次渲染契约通过：${count} 项。`);
} finally {
  console.error = originalConsoleError;
  await server.close();
}
