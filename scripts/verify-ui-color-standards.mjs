import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const scanRoots = [
  resolve(projectRoot, "client/src"),
  resolve(projectRoot, "client/tailwind.config.js"),
  resolve(projectRoot, "client/index.html"),
];
const sourceExtensions = new Set([".css", ".html", ".js", ".jsx", ".ts", ".tsx"]);

// 后台状态色是信息语义，不属于品牌装饰色。
const semanticStateColors = new Set(["#7A531A", "#FBF4E8", "#D4BD96"]);
const legacyInputColors = new Set(["#1A1A1A", "#222222", "#66645F", "#8C8C8C", "#E4E3DF", "#F5F5F5", "#F8F7F4", "#FCFCFB"]);
const legacyCompatibilityFiles = new Set([
  "client/src/page-builder/fields/ColorField.tsx",
  "client/src/page-builder/generated/contentTemplates.generated.ts",
  "client/src/page-builder/runtime/ContentTemplateContractFrame.tsx",
  "client/src/page-builder/runtime/PuckDocumentRenderer.tsx",
  "scripts/generate-content-template-contract.mjs",
]);
const storefrontPalette = new Set([
  "#FFFFFF", "#F4F5F5", "#181A1B", "#5F6568", "#6E7477",
  "#DDE1E2", "#B8BEC1", "#111315", "#F7F8F8", "#ECEEEF", "#101213", "#000000",
  "#8C3F3B", "#FAF0EF", "#D7B6B4", "#335F7D", "#EEF4F7", "#ADC3D0",
  "#356348", "#EFF5F1", "#ACC4B4", "#7A531A", "#FBF4E8", "#D4BD96",
]);
const storefrontRgb = new Set([...storefrontPalette].map((hex) => hexToRgb(hex).join(",")));

function isStorefrontScope(path) {
  return path.startsWith("client/src/pages/public/")
    || path.startsWith("client/src/components/blocks/")
    || path.startsWith("client/src/components/layout/")
    || path.startsWith("client/src/components/common/")
    || path.startsWith("client/src/page-builder/adapters/")
    || path.startsWith("client/src/page-builder/layout/")
    || path.startsWith("client/src/page-builder/runtime/")
    || path === "client/src/styles/globals.css";
}

function filesUnder(target) {
  if (statSync(target).isFile()) return [target];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const current = join(target, entry.name);
    if (entry.isDirectory()) return filesUnder(current);
    return sourceExtensions.has(extname(entry.name).toLowerCase()) ? [current] : [];
  });
}

function rgbToHsl(r, g, b) {
  const values = [r, g, b].map((value) => value / 255);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 0, saturation: 0, lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === values[0]) hue = (values[1] - values[2]) / delta + (values[1] < values[2] ? 6 : 0);
  else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
  else hue = (values[0] - values[1]) / delta + 4;
  return { hue: hue * 60, saturation, lightness };
}

function hexToRgb(hex) {
  const value = hex.length === 4
    ? hex.slice(1).split("").map((part) => part + part).join("")
    : hex.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function isWarmDecorative([r, g, b]) {
  const { hue, saturation } = rgbToHsl(r, g, b);
  return hue >= 20 && hue <= 70 && saturation >= 0.08;
}

const issues = [];
for (const file of scanRoots.flatMap(filesUnder)) {
  const displayPath = relative(projectRoot, file).replaceAll("\\", "/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const storefrontFile = isStorefrontScope(displayPath);
    const governedUiFile = displayPath.startsWith("client/src/")
      || displayPath === "client/tailwind.config.js"
      || displayPath === "client/index.html";
    if (governedUiFile
      && displayPath !== "client/src/styles/adminLuxury.css"
      && /(?:text|bg|border|ring|outline)-(?:red|green|blue|yellow|amber|orange|purple|pink|emerald|teal|cyan|indigo|violet|lime|rose|sky)-\d{2,3}/.test(line)) {
      issues.push(`${displayPath}:${index + 1} 使用了未收敛的框架颜色工具类`);
    }
    const hexMatches = line.matchAll(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/gi);
    for (const match of hexMatches) {
      const normalized = match[0].length === 4
        ? `#${match[0].slice(1).split("").map((part) => part + part).join("")}`.toUpperCase()
        : match[0].toUpperCase();
      if (semanticStateColors.has(normalized)) continue;
      if (legacyInputColors.has(normalized) && legacyCompatibilityFiles.has(displayPath)) continue;
      if (governedUiFile && !storefrontPalette.has(normalized)) {
        issues.push(`${displayPath}:${index + 1} ${match[0]}（非标准全站色）`);
        continue;
      }
      if (isWarmDecorative(hexToRgb(normalized))) {
        issues.push(`${displayPath}:${index + 1} ${match[0]}`);
      }
    }

    const rgbMatches = line.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,[^)]*)?\)/gi);
    for (const match of rgbMatches) {
      const rgb = match.slice(1, 4).map(Number);
      if (rgb.some((value) => value > 255)) continue;
      if (governedUiFile && !storefrontRgb.has(rgb.join(","))) {
        issues.push(`${displayPath}:${index + 1} ${match[0]}（非标准全站色）`);
        continue;
      }
      if (isWarmDecorative(rgb)) issues.push(`${displayPath}:${index + 1} ${match[0]}`);
    }
    const modernRgbMatches = line.matchAll(/rgba?\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s*\/[^)]*)?\)/gi);
    for (const match of modernRgbMatches) {
      const rgb = match.slice(1, 4).map(Number);
      if (rgb.some((value) => value > 255)) continue;
      if (governedUiFile && !storefrontRgb.has(rgb.join(","))) {
        issues.push(`${displayPath}:${index + 1} ${match[0]}（非标准全站色）`);
        continue;
      }
      if (isWarmDecorative(rgb)) issues.push(`${displayPath}:${index + 1} ${match[0]}`);
    }
  });
}

if (issues.length > 0) {
  console.error("发现不符合全站共享底盘或功能状态规范的颜色字面量：");
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("UI 颜色标准校验通过：前台、页面构建器与管理后台均未发现标准外颜色字面量。");
