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
  const loaded = await server.ssrLoadModule("/src/components/blocks/ProductRowBlock.tsx");
  const ProductRowBlock = loaded.default;
  const products = [
    { id: 1, name: "作品一", image: "/a.jpg", price: "¥1,000", link: "/products/1" },
    { id: 2, name: "作品二", image: "/b.jpg", price: "¥2,000", link: "/products/2" },
  ];

  const render = (content) => renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(ProductRowBlock, { module: { content } }),
    ),
  );

  const album = render({
    products,
    layout: "grid-2",
    mobileColumns: 1,
    displayMode: "album",
    imageRatio: "3:4",
    showPrice: true,
    actionStyle: "button",
  });
  const standard = render({
    products,
    layout: "grid-4",
    mobileColumns: 2,
    displayMode: "standard",
    imageRatio: "1:1",
    showPrice: true,
    actionStyle: "text",
  });
  const button = render({ products, actionStyle: "button", buttonText: "查看详情" });

  const checks = {
    albumMode: album.includes('data-display-mode="album"'),
    mobileOneColumn: album.includes("--product-row-mobile-columns:1"),
    albumHidesPrice: !album.includes("¥1,000"),
    desktopFourColumns: standard.includes("--product-row-columns:4"),
    squareImage: standard.includes("aspect-ratio:1 / 1"),
    standardShowsPrice: standard.includes("¥1,000"),
    textAction: standard.includes("查看作品"),
    buttonAction: button.includes("is-button"),
  };

  const failed = Object.entries(checks).filter(([, passed]) => !passed);
  if (failed.length > 0) {
    throw new Error(`作品陈列渲染契约失败：${failed.map(([name]) => name).join(", ")}`);
  }

  console.log(`作品陈列渲染契约通过：${Object.keys(checks).length} 项。`);
} finally {
  console.error = originalConsoleError;
  await server.close();
}
