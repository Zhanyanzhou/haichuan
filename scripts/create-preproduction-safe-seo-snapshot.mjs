import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicSeoSnapshot } from "./export-public-seo-snapshot.mjs";

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArguments(argv) {
  const result = { origin: "", revision: "", output: "", htmlOutput: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--origin") result.origin = argv[++index] || "";
    else if (argument === "--revision") result.revision = argv[++index] || "";
    else if (argument === "--output") result.output = resolve(argv[++index] || "");
    else if (argument === "--html-output") result.htmlOutput = resolve(argv[++index] || "");
    else fail(`Unknown argument: ${argument}`);
  }
  if (!result.origin || !result.output || !/^[a-f0-9]{40}$/.test(result.revision)) {
    fail("--origin, --revision (40 lowercase hex), and --output are required.");
  }
  return result;
}

export function createPreproductionSafeSnapshot({ origin, revision }) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? "")) fail("Safe snapshot revision is invalid.");
  const sourceHash = sha256(JSON.stringify({
    contract: "haichuan-preproduction-safe-content-v1",
    origin,
    revision,
  }));
  return createPublicSeoSnapshot({
    schemaVersion: 1,
    sourceStage: "preproduction",
    contentReady: false,
    origin,
    sourceSnapshotHashBefore: sourceHash,
    sourceSnapshotHashAfter: sourceHash,
    routes: [],
  });
}

export function renderPreproductionSafeHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>预发布内容准备中</title>
    <style>html{color:#242424;background:#f7f6f2;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center}main{width:min(38rem,calc(100% - 3rem));padding:3rem 0;border-top:1px solid #b79a63}p{line-height:1.8;color:#626262}small{color:#777}</style>
  </head>
  <body>
    <main data-content-ready="false">
      <h1>预发布内容准备中</h1>
      <p>技术版本已经更新，页面内容仍在审核与整理。此页面仅用于预发布验收，不代表正式网站内容。</p>
      <small>contentReady=false</small>
    </main>
  </body>
</html>
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const snapshot = createPreproductionSafeSnapshot(options);
  await writeFile(options.output, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  if (options.htmlOutput) {
    await writeFile(options.htmlOutput, renderPreproductionSafeHtml(), { encoding: "utf8", flag: "wx" });
  }
  process.stdout.write(`PREPRODUCTION_SAFE_SEO_OK snapshot=${snapshot.snapshotHash}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
