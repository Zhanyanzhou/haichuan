import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 比例派生管道守护(2026-08-18 P0-A):
 * 1. imageSpecs.ts 禁止新增手写比例字面值;
 * 2. 活动契约中每个带默认比例的模板,必须在 imageSpecs 有 contractSpec 派生条目;
 * 3. contractSpec 引用的 template/role 必须真实存在于契约(防拼错静默失败);
 * 4. schema 模块的 placeholder/description 禁止手写比例文案(比例由 MediaPickerField 从规格追加)。
 */

const contract = JSON.parse(
  await readFile(
    path.join(root, "contracts/page-builder/content-templates.contract.json"),
    "utf8",
  ),
);
const imageSpecsSource = await readFile(
  path.join(root, "client/src/page-builder/config/imageSpecs.ts"),
  "utf8",
);

// ── 1. 手写比例字面值白名单 ────────────────────────────────────────────
// `ratio: "N:N"` 赋值一律视为回流。
const RATIO_LITERAL_RE = /ratio:\s*"[0-9]+:[0-9]+"/g;
const ratioLines = [];
{
  const lines = imageSpecsSource.split("\n");
  lines.forEach((line, idx) => {
    if (RATIO_LITERAL_RE.test(line)) {
      RATIO_LITERAL_RE.lastIndex = 0;
      ratioLines.push({ line: idx + 1, text: line.trim() });
    }
    RATIO_LITERAL_RE.lastIndex = 0;
  });
}
for (const item of ratioLines) {
  const all = imageSpecsSource.split("\n");
  const context = all
    .slice(Math.max(0, item.line - 9), Math.min(all.length, item.line + 3))
    .join("\n");
  assert.match(
    context,
    /$^/,
    `imageSpecs.ts:${item.line} 不得手写比例字面值(${item.text}) —— 比例一律经 contractSpec 从契约派生`,
  );
}

// ── 2/3. coverage 与 roleId 真实性 ────────────────────────────────────
const contractRatios = new Map(); // templateKey -> Set(roleId)
const activeContractRatios = new Map();
for (const template of contract.templates) {
  for (const role of template.roles) {
    const d = role.defaultRatioByViewport;
    if (d && (d.desktop || d.mobile)) {
      if (!contractRatios.has(template.key))
        contractRatios.set(template.key, new Set());
      contractRatios.get(template.key).add(role.id);
      if (template.implementationStatus === "active") {
        if (!activeContractRatios.has(template.key)) activeContractRatios.set(template.key, new Set());
        activeContractRatios.get(template.key).add(role.id);
      }
    }
  }
}

// imageSpecs 中每个 contractSpec 调用的 template/role 参数对
const specCalls = [];
const callRe = /contractSpec\(\{[\s\S]*?\}\)/g;
for (const call of imageSpecsSource.match(callRe) || []) {
  const template = /template:\s*"([^"]+)"/.exec(call)?.[1];
  const role = /role:\s*"([^"]+)"/.exec(call)?.[1];
  if (template && role) specCalls.push({ template, role });
}
for (const call of specCalls) {
  const roles = contractRatios.get(call.template);
  assert.ok(
    roles !== undefined,
    `contractSpec 引用的模板 "${call.template}" 在契约中不存在或无默认比例角色`,
  );
  assert.ok(
    roles.has(call.role),
    `contractSpec 引用的 "${call.template}.${call.role}" 角色在契约中不存在(可用角色: ${[...roles].join(", ")})`,
  );
}

const covered = new Set(specCalls.map((call) => call.template));
for (const templateKey of activeContractRatios.keys()) {
  assert.ok(
    covered.has(templateKey),
    `契约模板 "${templateKey}" 有默认比例角色,但 imageSpecs 缺少 contractSpec 派生条目`,
  );
}

// ── 4. schema placeholder/description 禁止手写比例 ────────────────────
const modulesDir = path.join(
  root,
  "client/src/page-builder/inspector/schema/modules",
);
const RATIO_TEXT_RE =
  /(placeholder|description)[^\n]*[（(][^）)]*\b(21:6|16:7|16:9|3:2|4:5|3:4|1:1)\b/;
for (const file of (await readdir(modulesDir)).filter((name) =>
  name.endsWith(".ts"),
)) {
  const source = await readFile(path.join(modulesDir, file), "utf8");
  assert.doesNotMatch(
    source,
    RATIO_TEXT_RE,
    `${file} 的 placeholder/description 手写了比例文案 —— 比例由 MediaPickerField 从规格派生,这里只写人话`,
  );
}

console.log(
  `比例派生管道一致:${activeContractRatios.size}/${activeContractRatios.size} 个活动模板经 contractSpec 派生；通用规格仍做引用真实性校验，字面值仅存 ${ratioLines.length} 条白名单。`,
);
