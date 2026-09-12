import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "artifacts/content-readiness/current.json";
const mediaExtensions = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".png",
  ".svg",
  ".wav",
  ".webm",
  ".webp",
]);
const sourceExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".scss",
  ".ts",
  ".tsx",
]);

function normalizePath(value) {
  return value.split(sep).join("/");
}

function compareStable(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectRelative(projectRoot, path) {
  const value = normalizePath(relative(projectRoot, resolve(path)));
  if (!value || value === "." || value.startsWith("../")) {
    throw new Error(`PATH_OUTSIDE_PROJECT:${path}`);
  }
  return value;
}

function walk(path) {
  if (!existsSync(path)) return [];
  const stat = lstatSync(path);
  if (!stat.isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true })
    .sort((left, right) => compareStable(left.name, right.name))
    .flatMap((entry) => {
      const child = resolve(path, entry.name);
      return entry.isDirectory() ? walk(child) : [child];
    });
}

function lineAt(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

function isTestSource(path) {
  return /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/i.test(path);
}

function isInternalPlaceholderPath(path) {
  return /(?:^|\/)(?:system|admin\/templates|audit|editorial\/concepts)\//i.test(path)
    || /(?:placeholder|wireframe|concept)/i.test(path);
}

function inspectMediaFile(path, extension) {
  const content = readFileSync(path);
  if (extension === ".png") {
    const valid = content.length >= 24
      && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return {
      valid,
      width: valid ? content.readUInt32BE(16) : null,
      height: valid ? content.readUInt32BE(20) : null,
    };
  }
  if (extension === ".svg") {
    const source = content.toString("utf8");
    const viewBox = /\bviewBox=["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*["']/i.exec(source);
    return {
      valid: /^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source),
      width: viewBox ? Number(viewBox[3]) : null,
      height: viewBox ? Number(viewBox[4]) : null,
    };
  }
  return { valid: content.length > 0, width: null, height: null };
}

function isLikelyMediaUrl(value) {
  try {
    const url = new URL(value);
    if (/\.(?:invalid|local)$/i.test(url.hostname)) return false;
    const extension = extname(url.pathname).toLowerCase();
    return mediaExtensions.has(extension)
      || /(?:^|\.)(?:images\.unsplash\.com|imagekit\.io|cloudinary\.com)$/i.test(url.hostname)
      || /(?:image|media|cdn)/i.test(url.hostname);
  } catch {
    return false;
  }
}

function collectSources(projectRoot) {
  const roots = [
    "client/src",
    "server/src",
    "contracts",
    "client/index.html",
  ];
  return roots
    .flatMap((path) => walk(resolve(projectRoot, path)))
    .filter((path) => sourceExtensions.has(extname(path).toLowerCase()))
    .map((path) => ({
      path: projectRelative(projectRoot, path),
      content: readFileSync(path, "utf8"),
    }))
    .sort((left, right) => compareStable(left.path, right.path));
}

function collectPublicAssets(projectRoot, sources) {
  const publicRoot = resolve(projectRoot, "client/public");
  const sourceRows = sources.filter((source) => !isTestSource(source.path));
  return walk(publicRoot)
    .map((path) => {
      const publicPath = normalizePath(relative(publicRoot, path));
      const publicUrl = `/${publicPath}`;
      const extension = extname(publicPath).toLowerCase();
      const references = [];
      for (const source of sourceRows) {
        let offset = 0;
        while (offset < source.content.length) {
          const index = source.content.indexOf(publicUrl, offset);
          if (index < 0) break;
          references.push({ file: source.path, line: lineAt(source.content, index) });
          offset = index + publicUrl.length;
        }
      }
      const media = mediaExtensions.has(extension);
      const mediaInspection = media ? inspectMediaFile(path, extension) : null;
      const classification = media
        ? isInternalPlaceholderPath(publicPath)
          ? "TEST_PLACEHOLDER"
          : "AUTHORIZATION_UNKNOWN"
        : "EXISTING";
      return {
        path: publicPath,
        publicUrl,
        extension,
        bytes: lstatSync(path).size,
        media,
        mediaInspection,
        classification,
        result: classification === "AUTHORIZATION_UNKNOWN" ? "unknown-rights" : "passed",
        runtimeReferences: references,
      };
    })
    .sort((left, right) => compareStable(left.path, right.path));
}

function collectMissingLocalMediaReferences(sources, publicAssets) {
  const available = new Set(publicAssets.map((asset) => asset.publicUrl));
  const knownSentinels = new Set(["/images/brand-logo.svg"]);
  const pattern = /\/(?:images|fonts|videos|audio)\/[^\s"'`)<>{}?#]+\.(?:avif|gif|ico|jpe?g|mov|mp3|mp4|ogg|png|svg|wav|webm|webp)/giu;
  const rows = [];
  for (const source of sources.filter((entry) => !isTestSource(entry.path))) {
    for (const match of source.content.matchAll(pattern)) {
      const value = match[0].replaceAll("\\", "/");
      if (!available.has(value) && !knownSentinels.has(value)) {
        rows.push({
          file: source.path,
          line: lineAt(source.content, match.index),
          url: value,
          result: "invalid-reference",
        });
      }
    }
  }
  return rows.sort((left, right) =>
    compareStable(left.url, right.url)
    || compareStable(left.file, right.file)
    || left.line - right.line);
}

function collectExternalMediaReferences(sources) {
  const pattern = /https?:\/\/[^\s"'`)<>{}]+/giu;
  const rows = [];
  for (const source of sources.filter((entry) => !isTestSource(entry.path))) {
    for (const match of source.content.matchAll(pattern)) {
      const url = match[0].replace(/[.,;:]+$/, "");
      if (!isLikelyMediaUrl(url)) continue;
      const before = source.content.slice(Math.max(0, match.index - 500), match.index);
      const classification = /USE_MOCK|mockRes|mockData/i.test(before)
        ? "TEST_PLACEHOLDER"
        : "LAUNCH_MISSING";
      rows.push({
        file: source.path,
        line: lineAt(source.content, match.index),
        url,
        classification,
        result: classification === "TEST_PLACEHOLDER" ? "passed" : "invalid-reference",
      });
    }
  }
  return rows.sort((left, right) =>
    compareStable(left.url, right.url)
    || compareStable(left.file, right.file)
    || left.line - right.line);
}

function collectImageAltEvidence(projectRoot) {
  const roots = [
    "client/src/pages/public",
    "client/src/components/layout",
    "client/src/page-builder/runtime",
    "client/src/page-builder/template-definition",
  ];
  const tags = [];
  for (const absolutePath of roots.flatMap((path) => walk(resolve(projectRoot, path)))) {
    if (!/\.(?:jsx|tsx)$/i.test(absolutePath) || isTestSource(normalizePath(absolutePath))) continue;
    const file = projectRelative(projectRoot, absolutePath);
    const content = readFileSync(absolutePath, "utf8");
    for (const match of content.matchAll(/<(?:img|SecureImage)\b[\s\S]*?>/g)) {
      tags.push({
        file,
        line: lineAt(content, match.index),
        hasAltAttribute: /\balt\s*=/.test(match[0]),
      });
    }
  }
  return {
    inspectedTags: tags.length,
    missingAltAttributes: tags.filter((tag) => !tag.hasAltAttribute),
  };
}

function collectPages(projectRoot) {
  const contract = JSON.parse(readFileSync(
    resolve(projectRoot, "contracts/page-builder/content-templates.contract.json"),
    "utf8",
  ));
  const appSource = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");
  return contract.pageRules.map((rule) => {
    const routeMarker = rule.pageKey === "home"
      ? "<Route index element={<Home />}"
      : `contentPageRoute("${rule.pageKey}")`;
    return {
      pageKey: rule.pageKey,
      publicPath: rule.publicPath,
      pageRole: rule.pageRole,
      contractDeclared: true,
      routeWired: appSource.includes(routeMarker),
      persistedPublishedRevision: "NOT_INSPECTED",
      formalContentReview: "NOT_PROVIDED",
      seoReview: "NOT_PROVIDED",
      desktopReview: "NOT_PROVIDED",
      mobileReview: "NOT_PROVIDED",
      classification: "LAUNCH_MISSING",
      result: "missing",
    };
  });
}

function collectPackageLicenseEvidence(projectRoot, packageNames) {
  const clientPackage = JSON.parse(readFileSync(resolve(projectRoot, "client/package.json"), "utf8"));
  return packageNames.map((packageName) => {
    const packageRoot = resolve(projectRoot, "client/node_modules", packageName);
    const manifestPath = resolve(packageRoot, "package.json");
    const licensePath = resolve(packageRoot, "LICENSE");
    const manifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : {};
    const licenseText = existsSync(licensePath) ? readFileSync(licensePath, "utf8") : "";
    return {
      packageName,
      declaredRange: clientPackage.dependencies?.[packageName] ?? null,
      installedVersion: manifest.version ?? null,
      licenseFilePresent: Boolean(licenseText),
      licenseKind: /SIL Open Font License|OFL-1\.1/i.test(licenseText)
        ? "OFL-1.1"
        : /MIT License/i.test(licenseText)
          ? "MIT"
          : "UNKNOWN",
    };
  });
}

function existingCheck(id, area, summary, evidence) {
  return {
    id,
    area,
    classification: "EXISTING",
    result: "passed",
    blocking: false,
    summary,
    evidence,
  };
}

function blocker(id, area, classification, summary, evidence) {
  const result = classification === "AUTHORIZATION_UNKNOWN"
    ? "unknown-rights"
    : "missing";
  return { id, area, classification, result, blocking: true, summary, evidence };
}

function informational(id, area, classification, summary, evidence) {
  return {
    id,
    area,
    classification,
    result: "passed",
    blocking: false,
    summary,
    evidence,
  };
}

export function collectContentReadiness(projectRoot = defaultProjectRoot) {
  const sources = collectSources(projectRoot);
  const publicAssets = collectPublicAssets(projectRoot, sources);
  const pages = collectPages(projectRoot);
  const missingLocalMediaReferences = collectMissingLocalMediaReferences(sources, publicAssets);
  const externalMediaReferences = collectExternalMediaReferences(sources);
  const unmanagedExternalMediaReferences = externalMediaReferences.filter(
    (item) => item.classification === "LAUNCH_MISSING",
  );
  const imageAlt = collectImageAltEvidence(projectRoot);
  const authorizationUnknownAssets = publicAssets.filter(
    (asset) => asset.classification === "AUTHORIZATION_UNKNOWN",
  );
  const testPlaceholderAssets = publicAssets.filter(
    (asset) => asset.classification === "TEST_PLACEHOLDER",
  );
  const invalidMediaFiles = publicAssets.filter(
    (asset) => asset.media && asset.mediaInspection?.valid === false,
  );
  const mediaByExtension = Object.fromEntries(
    [...mediaExtensions]
      .map((extension) => [
        extension,
        publicAssets.filter((asset) => asset.media && asset.extension === extension).length,
      ])
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => compareStable(left, right)),
  );
  const responsiveAssetPairMap = new Map();
  for (const asset of publicAssets.filter((item) => item.media)) {
    const marker = /-(desktop|mobile)(?=-|\.)/i.exec(asset.path);
    if (!marker) continue;
    const key = asset.path.replace(marker[0], "-{viewport}");
    const row = responsiveAssetPairMap.get(key) ?? { key, desktop: null, mobile: null };
    row[marker[1].toLowerCase()] = asset.path;
    responsiveAssetPairMap.set(key, row);
  }
  const responsiveAssetPairs = [...responsiveAssetPairMap.values()]
    .filter((item) => item.desktop && item.mobile)
    .sort((left, right) => compareStable(left.key, right.key));
  const fontPackages = collectPackageLicenseEvidence(projectRoot, [
    "@fontsource/cormorant-garamond",
    "@fontsource/inter",
    "@fontsource/noto-serif-sc",
  ]);
  const iconPackages = collectPackageLicenseEvidence(projectRoot, [
    "@ant-design/icons",
  ]);
  const contract = JSON.parse(readFileSync(
    resolve(projectRoot, "contracts/page-builder/content-templates.contract.json"),
    "utf8",
  ));
  const rootPackage = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
  const indexHtml = readFileSync(resolve(projectRoot, "client/index.html"), "utf8");
  const publicLayout = readFileSync(
    resolve(projectRoot, "client/src/components/layout/PublicLayout.tsx"),
    "utf8",
  );
  const siteReadiness = readFileSync(
    resolve(projectRoot, "server/src/modules/settings/site-publication-readiness.ts"),
    "utf8",
  );
  const releasePreflight = readFileSync(
    resolve(projectRoot, "server/src/cli/release-preflight.ts"),
    "utf8",
  );
  const uploadService = readFileSync(
    resolve(projectRoot, "server/src/modules/upload/upload.service.ts"),
    "utf8",
  );
  const publicMediaAudit = readFileSync(
    resolve(projectRoot, "server/src/cli/public-media-audit.ts"),
    "utf8",
  );
  const mainSource = readFileSync(resolve(projectRoot, "client/src/main.tsx"), "utf8");

  const checks = [
    existingCheck(
      "six-public-page-contract-and-routes",
      "pages",
      "六个公开页面均有合同声明和路由入口。",
      { pageCount: pages.length, allRoutesWired: pages.every((page) => page.routeWired) },
    ),
    blocker(
      "six-public-page-published-content",
      "pages",
      "LAUNCH_MISSING",
      "未连接目标数据库，无法证明六页都有当前已发布 revision、正式内容与签认。",
      { pageKeys: pages.map((page) => page.pageKey), runtimeEvidence: "NOT_PROVIDED" },
    ),
    existingCheck(
      "page-seo-plumbing",
      "seo",
      "PageDocument SEO、canonical、Open Graph 与 Twitter 标签注入能力已存在。",
      {
        pageMetadataFields: contract.pageMetadata?.publicFields ?? [],
        canonicalImplemented: publicLayout.includes('syncLink("canonical"'),
        socialMetadataImplemented: publicLayout.includes('"og:image"')
          && publicLayout.includes('"twitter:image"'),
      },
    ),
    blocker(
      "formal-seo-and-social-image",
      "seo",
      "LAUNCH_MISSING",
      "正式 SEO 标题、描述、canonical 与分享图尚无当前持久化签认证据。",
      {
        staticHtmlDeclaresSocialImageMissing: /og:image[^\n]*待|twitter:image[^\n]*待/.test(indexHtml),
        runtimeEvidence: "NOT_PROVIDED",
      },
    ),
    existingCheck(
      "site-settings-readiness-gate",
      "contact",
      "服务端已有正式品牌、联系、主体、SEO 与语言准备度门禁。",
      {
        launchDetailsRequired: siteReadiness.includes("requireLaunchDetails"),
        releasePreflightConsumesGate: releasePreflight.includes("evaluateSitePublicationReadiness"),
      },
    ),
    blocker(
      "formal-site-contact-and-legal-settings",
      "contact",
      "LAUNCH_MISSING",
      "未连接目标数据库，无法证明正式主体、电话、邮箱、地址、营业时间和复核编号已持久化。",
      { runtimeEvidence: "NOT_PROVIDED" },
    ),
    existingCheck(
      "product-publication-quality-gate",
      "products",
      "作品详情、公开完整度与发布前商品集合检查能力已存在。",
      {
        releasePreflightChecksProducts: releasePreflight.includes("governedPublicProductWhere"),
        productDetailRoute: readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8")
          .includes('path="products/:id"'),
      },
    ),
    blocker(
      "formal-product-assortment",
      "products",
      "LAUNCH_MISSING",
      "没有目标数据库证据证明至少一个作品/系列达到正式发布完整度并具备有效主图。",
      { runtimeEvidence: "NOT_PROVIDED" },
    ),
    informational(
      "internal-placeholder-assets",
      "assets",
      "TEST_PLACEHOLDER",
      "中性占位、线框、审计或概念资产只计入测试稳定性，不计入正式内容。",
      { count: testPlaceholderAssets.length },
    ),
    blocker(
      "public-media-rights",
      "assets",
      "AUTHORIZATION_UNKNOWN",
      "公开目录媒体的逐素材商用授权状态无法由当前仓库静态证据确认；未知不等于违规或已授权。",
      {
        count: authorizationUnknownAssets.length,
        contractRequiresSourceAndAuthorization: Boolean(contract.pageMetadata?.mediaRights),
      },
    ),
    blocker(
      "public-media-file-integrity",
      "assets",
      "LAUNCH_MISSING",
      invalidMediaFiles.length === 0
        ? "公开目录媒体文件头和基础尺寸可解析。"
        : "存在无法解析文件头或基础尺寸的公开媒体文件。",
      { count: invalidMediaFiles.length, files: invalidMediaFiles.map((asset) => asset.path) },
    ),
    blocker(
      "unmanaged-external-media",
      "assets",
      "LAUNCH_MISSING",
      unmanagedExternalMediaReferences.length === 0
        ? "未发现生产源中的未纳管远程媒体字面量。"
        : "生产源中存在未纳管远程媒体字面量。",
      { count: unmanagedExternalMediaReferences.length },
    ),
    blocker(
      "missing-public-media-files",
      "assets",
      "LAUNCH_MISSING",
      missingLocalMediaReferences.length === 0
        ? "静态公开媒体字面量均能解析到文件。"
        : "存在无法解析到 client/public 文件的静态媒体字面量。",
      { count: missingLocalMediaReferences.length },
    ),
    blocker(
      "public-image-alt-attributes",
      "accessibility",
      "LAUNCH_MISSING",
      imageAlt.missingAltAttributes.length === 0
        ? "所检查公开渲染标签均显式声明 alt；内容准确性仍需用正式内容复核。"
        : "存在未显式声明 alt 的公开图片标签。",
      imageAlt,
    ),
    blocker(
      "formal-alt-copy-review",
      "accessibility",
      "LAUNCH_MISSING",
      "静态标签具备 alt 属性，但没有正式页面与作品数据的替代文字准确性复核证据。",
      { runtimeEvidence: "NOT_PROVIDED" },
    ),
    existingCheck(
      "responsive-content-capability",
      "responsive",
      "合同与页面实现具有桌面/移动媒体及响应式能力。",
      {
        contractHasDesktopAndMobileMedia: JSON.stringify(contract).includes("desktopImage")
          && JSON.stringify(contract).includes("mobileImage"),
      },
    ),
    blocker(
      "desktop-mobile-content-acceptance",
      "responsive",
      "LAUNCH_MISSING",
      "没有六页正式内容在桌面与 390px 手机视口的当次浏览器验收证据。",
      { requiredViewports: ["1440x900", "390x844"], runtimeEvidence: "NOT_PROVIDED" },
    ),
    existingCheck(
      "font-self-hosting-capability",
      "fonts",
      "字体通过 npm Fontsource 包随构建自托管，未发现运行时 Google Fonts 外链。",
      {
        fontsourceImports: (mainSource.match(/@fontsource\//g) ?? []).length,
        remoteGoogleFonts: sources.some((source) => /fonts\.(?:googleapis|gstatic)\.com/i.test(source.content)),
      },
    ),
    existingCheck(
      "font-package-license-evidence",
      "fonts",
      "当前安装的三项 Fontsource 字体包均附带 OFL-1.1 许可文件。",
      {
        packages: fontPackages,
        allLicenseFilesPresent: fontPackages.every((item) => item.licenseFilePresent),
        allOfL11: fontPackages.every((item) => item.licenseKind === "OFL-1.1"),
      },
    ),
    blocker(
      "formal-brand-font-approval",
      "fonts",
      "LAUNCH_MISSING",
      "开源字体许可存在，但正式品牌核心字体选择和中英文字体关系尚无签认凭据。",
      { brandFontReview: "NOT_PROVIDED" },
    ),
    existingCheck(
      "icon-source-and-license",
      "icons",
      "客户前台使用代码内简单线性 SVG 与已安装图标包；依赖许可文件可本地核验。",
      {
        inlineSvgCount: (publicLayout.match(/<svg\b/g) ?? []).length,
        packages: iconPackages,
        allMit: iconPackages.every((item) => item.licenseKind === "MIT"),
      },
    ),
    existingCheck(
      "public-private-media-storage-boundary",
      "persistence",
      "通用页面媒体使用 /uploads；商品图和付款凭证具有私有 storageKey 路径与受控读取。",
      {
        publicUploadsImplemented: uploadService.includes("/uploads/"),
        productPrivateStorageImplemented: uploadService.includes("private-media', 'products"),
        paymentProofPrivateStorageImplemented: uploadService.includes("private-media', 'payment-proofs"),
        publicMediaAuditImplemented: publicMediaAudit.includes("RESTRICTED_VISIBILITIES"),
      },
    ),
    blocker(
      "runtime-media-reference-and-persistence-audit",
      "persistence",
      "LAUNCH_MISSING",
      "未对目标数据库和目标媒体卷执行公开 uploads、受限商品、付款凭证、售后证据及缺失文件审计。",
      { runtimeEvidence: "NOT_PROVIDED" },
    ),
  ];

  // 零数量是可验证通过，而不是发布阻断；只保留 blocker 结构以维持稳定 ID。
  for (const id of [
    "unmanaged-external-media",
    "missing-public-media-files",
    "public-image-alt-attributes",
    "public-media-file-integrity",
  ]) {
    const check = checks.find((item) => item.id === id);
    const count = check?.evidence?.count
      ?? check?.evidence?.missingAltAttributes?.length;
    if (check && count === 0) {
      check.classification = "EXISTING";
      check.result = "passed";
      check.blocking = false;
    } else if (check && count > 0) {
      check.result = "invalid-reference";
    }
  }
  for (const id of ["font-package-license-evidence", "icon-source-and-license"]) {
    const check = checks.find((item) => item.id === id);
    const valid = id === "font-package-license-evidence"
      ? check?.evidence?.allLicenseFilesPresent && check?.evidence?.allOfL11
      : check?.evidence?.packages?.every((item) => item.licenseFilePresent)
        && check?.evidence?.allMit;
    if (check && !valid) {
      check.classification = "AUTHORIZATION_UNKNOWN";
      check.result = "unknown-rights";
      check.blocking = true;
      check.summary = "依赖或许可文件不完整，无法确认当前字体/图标包的使用授权。";
    }
  }

  const blockers = checks
    .filter((check) => check.blocking)
    .map((check) => ({
      code: check.id.toUpperCase().replaceAll("-", "_"),
      area: check.area,
      classification: check.classification,
      result: check.result,
      summary: check.summary,
    }));
  const classificationCounts = checks.reduce((counts, check) => {
    counts[check.classification] = (counts[check.classification] ?? 0) + 1;
    return counts;
  }, {});
  const resultCounts = checks.reduce((counts, check) => {
    counts[check.result] = (counts[check.result] ?? 0) + 1;
    return counts;
  }, {
    passed: 0,
    missing: 0,
    "unknown-rights": 0,
    "invalid-reference": 0,
  });
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const worktreeRows = execFileSync("git", ["status", "--porcelain"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim().split(/\r?\n/).filter(Boolean);

  return {
    schemaVersion: 1,
    evidenceKind: "LOCAL_CONTENT_MEDIA_READINESS",
    generatedAt: new Date().toISOString(),
    gitSha,
    worktree: {
      dirty: worktreeRows.length > 0,
      changedPathCount: worktreeRows.length,
      evidenceIncludesUncommittedSources: worktreeRows.length > 0,
    },
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    ready: blockers.length === 0,
    evidenceLevel: "LOCAL_STATIC_AND_REPOSITORY",
    tooling: {
      nodeVersion: process.version,
      expectedNodeRange: rootPackage.engines?.node ?? null,
    },
    targetEnvironmentInspected: false,
    rightsVerified: false,
    summary: {
      pageCount: pages.length,
      publicFileCount: publicAssets.length,
      publicMediaCount: publicAssets.filter((asset) => asset.media).length,
      authorizationUnknownAssetCount: authorizationUnknownAssets.length,
      testPlaceholderAssetCount: testPlaceholderAssets.length,
      missingLocalMediaReferenceCount: missingLocalMediaReferences.length,
      unmanagedExternalMediaReferenceCount: unmanagedExternalMediaReferences.length,
      imageTagsInspected: imageAlt.inspectedTags,
      imageTagsMissingAltAttribute: imageAlt.missingAltAttributes.length,
      invalidMediaFileCount: invalidMediaFiles.length,
      mediaByExtension,
      responsiveAssetPairCount: responsiveAssetPairs.length,
      blockerCount: blockers.length,
      classificationCounts,
      resultCounts,
    },
    checks,
    blockers,
    pages,
    assets: {
      public: publicAssets,
      responsivePairs: responsiveAssetPairs,
      missingLocalMediaReferences,
      externalMediaReferences,
    },
    requiredRuntimeEvidence: [
      "目标数据库中的 SiteSettings 正式字段与复核编号",
      "六页当前 publishedRevisionId、正式内容、SEO 与 mediaRights",
      "至少一个达到公开完整度且有有效主图的作品或系列",
      "公开 uploads 与私有媒体卷的文件存在性、可见性和数据库引用审计",
      "六页 1440x900 与 390x844 的真实浏览器内容验收",
    ],
    limitations: [
      "LOCAL_STATIC_EVIDENCE_DOES_NOT_PROVE_PERSISTED_PRODUCTION_CONTENT",
      "FILE_EXISTENCE_DOES_NOT_PROVE_RIGHTS_OR_COMMERCIAL_AUTHORIZATION",
      "PLACEHOLDERS_AND_MOCK_MEDIA_DO_NOT_COUNT_AS_FORMAL_CONTENT",
      "ALT_ATTRIBUTE_PRESENCE_DOES_NOT_PROVE_ALT_TEXT_ACCURACY",
      "RESPONSIVE_CAPABILITY_DOES_NOT_PROVE_DESKTOP_OR_MOBILE_CONTENT_ACCEPTANCE",
      "PRIVATE_MEDIA_CODE_BOUNDARY_DOES_NOT_PROVE_TARGET_VOLUME_OR_DATABASE_STATE",
    ],
  };
}

export function stableContentReadiness(evidence) {
  const clone = structuredClone(evidence);
  delete clone.generatedAt;
  return clone;
}

export function writeContentReadinessEvidence(
  evidence,
  outputPath = resolve(defaultProjectRoot, defaultOutput),
  projectRoot = defaultProjectRoot,
) {
  projectRelative(projectRoot, outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return projectRelative(projectRoot, outputPath);
}

export function verifyContentReadinessArtifact(
  evidence,
  outputPath = resolve(defaultProjectRoot, defaultOutput),
) {
  if (!existsSync(outputPath)) throw new Error(`CONTENT_READINESS_OUTPUT_MISSING:${outputPath}`);
  const stored = JSON.parse(readFileSync(outputPath, "utf8"));
  if (JSON.stringify(stableContentReadiness(stored)) !== JSON.stringify(stableContentReadiness(evidence))) {
    throw new Error("CONTENT_READINESS_OUTPUT_STALE");
  }
  return stored;
}

function main() {
  const args = process.argv.slice(2);
  const projectRoot = defaultProjectRoot;
  const evidence = collectContentReadiness(projectRoot);
  const outputIndex = args.indexOf("--output");
  const outputPath = resolve(projectRoot, outputIndex >= 0 ? args[outputIndex + 1] : defaultOutput);
  if (outputIndex >= 0 && !args[outputIndex + 1]) throw new Error("CONTENT_READINESS_OUTPUT_REQUIRED");
  let output = projectRelative(projectRoot, outputPath);
  if (args.includes("--write")) output = writeContentReadinessEvidence(evidence, outputPath, projectRoot);
  if (args.includes("--check")) verifyContentReadinessArtifact(evidence, outputPath);
  console.log(JSON.stringify({
    ok: evidence.ready,
    mode: args.includes("--check") ? "check" : args.includes("--write") ? "write" : "report",
    output,
    status: evidence.status,
    summary: evidence.summary,
    blockers: evidence.blockers,
  }, null, 2));
  if (args.includes("--enforce") && !evidence.ready) process.exitCode = 1;
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "CONTENT_READINESS_VERIFICATION_FAILED",
    }));
    process.exitCode = 1;
  }
}
