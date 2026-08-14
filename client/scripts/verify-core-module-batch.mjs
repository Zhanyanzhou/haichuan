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
  const [featuredLoaded, categoryLoaded, imageTextLoaded, appointmentLoaded, contracts] = await Promise.all([
    server.ssrLoadModule("/src/components/blocks/FeaturedProductBlock.tsx"),
    server.ssrLoadModule("/src/components/blocks/CategoryCardsBlock.tsx"),
    server.ssrLoadModule("/src/components/blocks/ImageTextBlock.tsx"),
    server.ssrLoadModule("/src/components/blocks/AppointmentBlock.tsx"),
    server.ssrLoadModule("/src/page-builder/config/blockContracts.ts"),
  ]);

  const FeaturedProductBlock = featuredLoaded.default;
  const CategoryCardsBlock = categoryLoaded.default;
  const ImageTextBlock = imageTextLoaded.default;
  const AppointmentBlock = appointmentLoaded.default;

  const featuredModule = {
    content: {
      eyebrow: "FEATURED PIECE",
      title: "典藏主推",
      summary: "以克制比例呈现宝石、金属与镶嵌细节。",
      productId: 18,
      product: { id: 18, name: "星河钻石戒指", image: "/product.jpg", price: "¥28,900", link: "/products/18" },
      primaryText: "查看作品",
      secondaryText: "预约鉴赏",
      secondaryLink: "/contact",
    },
    layoutConfig: { template: "imageRight" },
    styleConfig: { bgColor: "#F5F2ED" },
  };
  const featuredPublished = renderBlock(FeaturedProductBlock, featuredModule);
  const featuredEditor = renderBlock(FeaturedProductBlock, featuredModule, true);
  const featuredEmpty = renderBlock(FeaturedProductBlock, { content: {} });

  const categoryModule = {
    content: {
      title: "按系列探索",
      subtitle: "从作品类型进入适合自己的选择路径。",
      categories: [
        { name: "戒指", image: "/ring.jpg", link: "/products?categoryId=1", description: "典藏与日常佩戴", focusX: 42, focusY: 50 },
        { name: "项链", image: "/necklace.jpg", link: "/products?categoryId=2", description: "贴近颈间的光", focusX: 58, focusY: 45 },
      ],
    },
    layoutConfig: { template: "grid-2" },
  };
  const categoryPublished = renderBlock(CategoryCardsBlock, categoryModule);
  const categoryEditor = renderBlock(CategoryCardsBlock, categoryModule, true);
  const categoryUnsafe = renderBlock(CategoryCardsBlock, {
    content: { title: "错误入口", categories: [{ name: "外链", image: "/bad.jpg", link: "https://evil.example" }] },
  });

  const imageTextModule = {
    content: {
      label: "CRAFTSMANSHIP",
      title: "工艺与光",
      body: "从宝石比例到镶嵌收边，每个细节都服务于作品本身。",
      image: "/craft.jpg",
      imageAlt: "珠宝工艺细节",
      buttonText: "了解工艺",
      targetType: "page",
      linkUrl: "/about",
    },
    layoutConfig: { template: "textRightImageLeft" },
    styleConfig: { spacing: "normal", focusX: 35, focusY: 60 },
  };
  const imageTextPublished = renderBlock(ImageTextBlock, imageTextModule);
  const imageTextEditor = renderBlock(ImageTextBlock, imageTextModule, true);
  const imageTextUnsafe = renderBlock(ImageTextBlock, {
    ...imageTextModule,
    content: { ...imageTextModule.content, linkUrl: "//evil.example" },
  });

  const appointmentModule = {
    content: {
      backgroundImage: "/appointment.jpg",
      altText: "海川珠宝预约鉴赏空间",
      title: "预约专属鉴赏",
      subtitle: "由珠宝顾问为您安排一对一作品介绍。",
      buttonText: "立即预约",
      linkUrl: "/contact",
      phone: "400-800-1234",
    },
    layoutConfig: { template: "ivory" },
    styleConfig: { focusX: 30, focusY: 65 },
  };
  const appointmentPublished = renderBlock(AppointmentBlock, appointmentModule);
  const appointmentEditor = renderBlock(AppointmentBlock, appointmentModule, true);
  const appointmentUnsafe = renderBlock(AppointmentBlock, {
    content: { ...appointmentModule.content, linkUrl: "https://evil.example" },
  });

  let count = 0;
  count += assertChecks("单品主推", {
    fixedProductRatio: /aspect-ratio:\s*3 \/ 4/.test(featuredPublished),
    imageRightVariant: featuredPublished.includes('data-layout="imageRight"'),
    productDetailLink: featuredPublished.includes('href="/products/18"'),
    secondaryInternalLink: featuredPublished.includes('href="/contact"'),
    editorPreventsNavigation: !featuredEditor.includes('href="/products/18"') && !featuredEditor.includes('href="/contact"'),
    emptyPublishedHidden: featuredEmpty === "",
  });
  count += assertChecks("分类导航", {
    gridTwoUsesLandscapeRatio: /aspect-ratio:\s*16 \/ 9/.test(categoryPublished),
    categoryLinks: categoryPublished.includes('href="/products?categoryId=1"') && categoryPublished.includes('href="/products?categoryId=2"'),
    editorPreventsNavigation: !categoryEditor.includes('href="/products?categoryId=1"'),
    unsafeCardHidden: categoryUnsafe === "",
    mobileSingleColumnRule: categoryPublished.includes("grid-template-columns: minmax(0, 1fr) !important"),
  });
  count += assertChecks("图文介绍", {
    desktopMediaRatio: imageTextPublished.includes("aspect-ratio: 4 / 3"),
    mobileMediaRatio: imageTextPublished.includes("aspect-ratio: 3 / 4"),
    safePageLink: imageTextPublished.includes('href="/about"'),
    editorPreventsNavigation: !imageTextEditor.includes('href="/about"'),
    unsafeTargetRejected: !imageTextUnsafe.includes("evil.example"),
  });
  count += assertChecks("预约引导", {
    ivoryPreset: appointmentPublished.includes("#F4EFE7"),
    imageFocus: appointmentPublished.includes("object-position:30% 65%"),
    appointmentLink: appointmentPublished.includes('href="/contact"'),
    normalizedPhoneLink: appointmentPublished.includes('href="tel:4008001234"'),
    editorPreventsNavigation: !appointmentEditor.includes('href="/contact"') && !appointmentEditor.includes('href="tel:4008001234"'),
    unsafeTargetRejected: !appointmentUnsafe.includes("evil.example"),
  });
  count += assertChecks("核心合同", {
    featuredReady: contracts.evaluateFeaturedProductContract({ productId: 18, title: "典藏主推", primaryText: "查看作品" }).errors.length === 0,
    featuredMissingProductBlocked: contracts.evaluateFeaturedProductContract({ title: "典藏主推", primaryText: "查看作品" }).errors.length > 0,
    categoryReady: contracts.evaluateCategoryCardsContract(categoryModule.content).errors.length === 0,
    categoryUnsafeBlocked: contracts.evaluateCategoryCardsContract({ title: "分类", categories: [{ name: "外链", image: "/bad.jpg", link: "https://evil.example" }, { name: "戒指", image: "/ring.jpg", link: "/products" }] }).errors.length > 0,
    appointmentReady: contracts.evaluateAppointmentContract(appointmentModule.content).errors.length === 0,
    appointmentExternalBlocked: contracts.evaluateAppointmentContract({ ...appointmentModule.content, linkUrl: "https://evil.example" }).errors.length > 0,
  });

  console.log(`核心模块第二批渲染契约通过：${count} 项。`);
} finally {
  console.error = originalConsoleError;
  await server.close();
}
