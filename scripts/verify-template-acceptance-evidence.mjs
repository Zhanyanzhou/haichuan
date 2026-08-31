import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "contracts/page-builder/content-templates.contract.json");
const acceptanceDir = path.join(root, "artifacts/design-audit/template-v2-acceptance-2026-08-29");
const acceptancePath = path.join(acceptanceDir, "acceptance.md");
const screenshotDir = path.join(acceptanceDir, "screenshots");
const widths = [1920, 1200, 960, 768, 390];

const [contractText, acceptanceText, screenshotNames] = await Promise.all([
  readFile(contractPath, "utf8"),
  readFile(acceptancePath, "utf8"),
  readdir(screenshotDir),
]);
const contract = JSON.parse(contractText);
const keys = contract.templates.map((template) => template.key);
const issues = [];

if (keys.length !== contract.expectedTemplateCount || keys.length !== contract.activeTemplateCount) {
  issues.push(`合同模板数量不一致：keys=${keys.length} expected=${contract.expectedTemplateCount} active=${contract.activeTemplateCount}`);
}
if (new Set(keys).size !== keys.length) issues.push("合同包含重复模板 key");

const expectedNames = new Set(keys.flatMap((key) => widths.map((width) => `${key}-${width}.png`)));
const actualNames = screenshotNames.filter((name) => name.endsWith(".png"));
for (const name of actualNames) {
  if (!expectedNames.has(name)) issues.push(`存在未声明截图：${name}`);
}

const hashes = [];
for (const key of keys) {
  if (!acceptanceText.includes(`\`${key}\``)) issues.push(`逐模板表缺少 ${key}`);
  for (const width of widths) {
    const name = `${key}-${width}.png`;
    const link = `](./screenshots/${name})`;
    if (!acceptanceText.includes(link)) issues.push(`验收表缺少截图链接：${name}`);
    const screenshotPath = path.join(screenshotDir, name);
    let fileStat;
    let bytes;
    try {
      [fileStat, bytes] = await Promise.all([stat(screenshotPath), readFile(screenshotPath)]);
    } catch {
      issues.push(`缺少截图：${name}`);
      continue;
    }
    if (fileStat.size < 1024) issues.push(`截图文件异常小：${name} (${fileStat.size} bytes)`);
    const pngSignature = bytes.subarray(0, 8).toString("hex");
    if (pngSignature !== "89504e470d0a1a0a" || bytes.length < 24) {
      issues.push(`截图不是合法 PNG：${name}`);
      continue;
    }
    const pngWidth = bytes.readUInt32BE(16);
    const pngHeight = bytes.readUInt32BE(20);
    if (pngWidth !== width || pngHeight <= 0) {
      issues.push(`截图尺寸无效：${name} 实际 ${pngWidth}×${pngHeight}`);
    }
    hashes.push(`${name}:${createHash("sha256").update(bytes).digest("hex")}`);
  }
}

if (actualNames.length !== expectedNames.size) {
  issues.push(`截图总数不一致：actual=${actualNames.length} expected=${expectedNames.size}`);
}
if (issues.length > 0) {
  console.error(["模板验收证据无效：", ...issues.map((issue) => `- ${issue}`)].join("\n"));
  process.exitCode = 1;
} else {
  const evidenceHash = createHash("sha256").update(hashes.sort().join("\n")).digest("hex");
  console.log(`模板验收证据完整：${keys.length}/${contract.expectedTemplateCount} 模板 · ${actualNames.length} 张 PNG · 五档宽度 · SHA-256 ${evidenceHash.slice(0, 12)}`);
}
