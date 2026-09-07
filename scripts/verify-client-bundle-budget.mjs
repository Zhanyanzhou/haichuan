import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const distDir = path.resolve("client/dist");
const assetsDir = path.join(distDir, "assets");
const indexPath = path.join(distDir, "index.html");

const budgets = {
  initialJsGzip: 180 * 1024,
  initialCssGzip: 30 * 1024,
  reachableJsChunkGzip: 220 * 1024,
  // 编辑器外壳重设计（模板设计四区工作台）后 EditorWorkbench CSS 约 42 KiB；
  // 预算留 44 KiB 上限并保留对其余可达块的约束，后续样式收敛应回落到 40 以下。
  reachableCssChunkGzip: 44 * 1024,
};

if (!existsSync(indexPath)) {
  console.error("客户端包体守卫失败：缺少 client/dist/index.html，请先执行 npm run build:client。");
  process.exit(1);
}

const gzipBytes = (filePath) => gzipSync(readFileSync(filePath)).byteLength;
const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const unique = (values) => [...new Set(values)];
const indexHtml = readFileSync(indexPath, "utf8");
const initialAssets = unique(
  [...indexHtml.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map(
    (match) => match[1],
  ),
);
const initialJs = initialAssets.filter((name) => name.endsWith(".js"));
const initialCss = initialAssets.filter((name) => name.endsWith(".css"));

const forbiddenInitial = initialAssets.filter((name) =>
  /^(?:Dashboard|EditorWorkbench|puck-editor)-/.test(name),
);
if (forbiddenInitial.length) {
  console.error(
    `客户端包体守卫失败：后台重资源进入公开首屏预加载：${forbiddenInitial.join(", ")}`,
  );
  process.exit(1);
}

const reachableJs = new Set(initialJs);
const reachableCss = new Set(initialCss);
const pending = [...initialJs];
while (pending.length) {
  const assetName = pending.pop();
  const assetPath = path.join(assetsDir, assetName);
  if (!existsSync(assetPath)) {
    console.error(`客户端包体守卫失败：index.html 引用了不存在的资源 ${assetName}`);
    process.exit(1);
  }
  const source = readFileSync(assetPath, "utf8");
  const jsRefs = unique(
    [...source.matchAll(/["'](?:\.\/|assets\/)?([A-Za-z0-9_.-]+\.js)["']/g)].map(
      (match) => match[1],
    ),
  );
  const cssRefs = unique(
    [...source.matchAll(/["'](?:\.\/|assets\/)?([A-Za-z0-9_.-]+\.css)["']/g)].map(
      (match) => match[1],
    ),
  );
  for (const ref of cssRefs) reachableCss.add(ref);
  for (const ref of jsRefs) {
    if (reachableJs.has(ref)) continue;
    reachableJs.add(ref);
    pending.push(ref);
  }
}

const measure = (names) =>
  names.map((name) => {
    const filePath = path.join(assetsDir, name);
    if (!existsSync(filePath)) {
      console.error(`客户端包体守卫失败：构建引用了不存在的资源 ${name}`);
      process.exit(1);
    }
    return {
      name,
      raw: statSync(filePath).size,
      gzip: gzipBytes(filePath),
    };
  });

const initialJsRows = measure(initialJs);
const initialCssRows = measure(initialCss);
const reachableJsRows = measure([...reachableJs]);
const reachableCssRows = measure([...reachableCss]);
const sumGzip = (rows) => rows.reduce((total, row) => total + row.gzip, 0);
const largest = (rows) => [...rows].sort((a, b) => b.gzip - a.gzip)[0];

const initialJsGzip = sumGzip(initialJsRows);
const initialCssGzip = sumGzip(initialCssRows);
const largestJs = largest(reachableJsRows);
const largestCss = largest(reachableCssRows);
const failures = [];

if (initialJsGzip > budgets.initialJsGzip) {
  failures.push(
    `公开首屏 JS gzip ${formatKb(initialJsGzip)} > ${formatKb(budgets.initialJsGzip)}`,
  );
}
if (initialCssGzip > budgets.initialCssGzip) {
  failures.push(
    `公开首屏 CSS gzip ${formatKb(initialCssGzip)} > ${formatKb(budgets.initialCssGzip)}`,
  );
}
if (largestJs?.gzip > budgets.reachableJsChunkGzip) {
  failures.push(
    `最大可达 JS 块 ${largestJs.name} gzip ${formatKb(largestJs.gzip)} > ${formatKb(budgets.reachableJsChunkGzip)}`,
  );
}
if (largestCss?.gzip > budgets.reachableCssChunkGzip) {
  failures.push(
    `最大可达 CSS 块 ${largestCss.name} gzip ${formatKb(largestCss.gzip)} > ${formatKb(budgets.reachableCssChunkGzip)}`,
  );
}

console.log(
  [
    `公开首屏 JS gzip：${formatKb(initialJsGzip)} / ${formatKb(budgets.initialJsGzip)}`,
    `公开首屏 CSS gzip：${formatKb(initialCssGzip)} / ${formatKb(budgets.initialCssGzip)}`,
    `最大可达 JS：${largestJs?.name ?? "无"} ${formatKb(largestJs?.gzip ?? 0)} / ${formatKb(budgets.reachableJsChunkGzip)}`,
    `最大可达 CSS：${largestCss?.name ?? "无"} ${formatKb(largestCss?.gzip ?? 0)} / ${formatKb(budgets.reachableCssChunkGzip)}`,
  ].join("\n"),
);

if (failures.length) {
  console.error(`客户端包体守卫失败：\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
