export const SOURCE_HASH = "1".repeat(64);
export const CONTENT_HASHES = {
  aboutZh: "2".repeat(64),
  aboutEn: "3".repeat(64),
  legalZh: "4".repeat(64),
  productZh: "5".repeat(64),
};

export const BASE_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="description" content="SPA fallback">
    <meta name="keywords" content="中文基础壳关键词">
    <title>SPA fallback</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/app.js"></script>
  </body>
</html>`;

export function makeRoute(overrides = {}) {
  const path = overrides.path ?? "/about";
  const locale = overrides.locale ?? (path === "/en" || path.startsWith("/en/") ? "en" : "zh-CN");
  const kind = overrides.kind ?? "page";
  const productCode = overrides.productCode;
  const hash = overrides.hash ?? CONTENT_HASHES.aboutZh;
  return {
    path,
    canonicalPath: overrides.canonicalPath ?? path,
    locale,
    kind,
    alternateKey: overrides.alternateKey ?? "page:about",
    published: overrides.published ?? true,
    indexable: overrides.indexable ?? true,
    contentSource: overrides.contentSource ?? "human-reviewed",
    contentHashBefore: overrides.contentHashBefore ?? hash,
    contentHashAfter: overrides.contentHashAfter ?? hash,
    lastModified: overrides.lastModified ?? "2026-09-13",
    siteName: overrides.siteName ?? "Haichuan Jewelry",
    title: overrides.title ?? (locale === "en" ? "About Haichuan" : "关于海川"),
    description: overrides.description ?? (locale === "en" ? "Human-reviewed English introduction." : "经人工审核的品牌介绍。"),
    shareImage: overrides.shareImage ?? "https://cdn.example.test/seo/share.jpg",
    renderedBodyHtml: overrides.renderedBodyHtml ?? `<main><h1>${locale === "en" ? "About" : "关于我们"}</h1><p>Published body.</p></main>`,
    structuredData: overrides.structuredData ?? (kind === "product"
      ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: overrides.title ?? "海川珠宝产品",
        sku: productCode,
      }
      : undefined),
    productCode,
  };
}

export function makeSnapshotInput(routes) {
  return {
    schemaVersion: 1,
    sourceStage: "production",
    origin: "https://jewelry.example.test",
    sourceSnapshotHashBefore: SOURCE_HASH,
    sourceSnapshotHashAfter: SOURCE_HASH,
    routes,
  };
}

export function makeRepresentativeRoutes() {
  return [
    makeRoute({
      path: "/about",
      alternateKey: "page:about",
      hash: CONTENT_HASHES.aboutZh,
      title: "关于海川 <珠宝>",
    }),
    makeRoute({
      path: "/en/about",
      locale: "en",
      alternateKey: "page:about",
      hash: CONTENT_HASHES.aboutEn,
    }),
    makeRoute({
      path: "/privacy",
      kind: "legal",
      alternateKey: "legal:privacy",
      hash: CONTENT_HASHES.legalZh,
      title: "隐私政策",
    }),
    makeRoute({
      path: "/products/HC-001",
      kind: "product",
      alternateKey: "product:hc-001",
      productCode: "HC-001",
      contentSource: "verified-facts",
      hash: CONTENT_HASHES.productZh,
      title: "海川珠宝 HC-001",
    }),
  ];
}
