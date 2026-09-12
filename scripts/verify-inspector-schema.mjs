// Inspector Schema 编写约定 —— 静态自检
// 运行：node scripts/verify-inspector-schema.mjs
//
// 对应 client/src/page-builder/inspector/schema/types.ts 顶部「编写约定」：
// 1) sections 按七层顺序书写、同层只留一个 section（软警告，不阻断）；
// 2) 未知 layer / 空 section 属于硬错误（阻断）；
// 3) 字段语义冲突不做正则级检查（getTaskGroup 有 control 兜底），保持脚本轻量。

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(
  root,
  "client/src/page-builder/inspector/schema/modules",
);

const LAYER_ORDER = [
  "media",
  "product",
  "content",
  "interaction",
  "layout",
  "style",
  "feature",
];

const EXPECTED_SCHEMA_FILE_COUNT = 3;
const EXPECTED_REGISTRY_ENTRY_COUNT = 3;

const files = (await readdir(schemaDir)).filter((file) => /\.tsx?$/.test(file));
const registryPath = path.join(
  root,
  "client/src/page-builder/inspector/schema/registry.ts",
);
const typesPath = path.join(
  root,
  "client/src/page-builder/inspector/schema/types.ts",
);
const rendererPath = path.join(
  root,
  "client/src/page-builder/inspector/FieldRenderer.tsx",
);
const sharedPath = path.join(
  root,
  "client/src/page-builder/inspector/schema/shared.ts",
);

const [registrySource, typesSource, rendererSource, sharedSource] =
  await Promise.all([
    readFile(registryPath, "utf8"),
    readFile(typesPath, "utf8"),
    readFile(rendererPath, "utf8"),
    readFile(sharedPath, "utf8"),
  ]);

const errors = [];
const warnings = [];
let checked = 0;
const moduleTypes = new Set();
const activeControls = new Set();

const readControls = (source) =>
  [...source.matchAll(/\bcontrol:\s*"([A-Za-z]+)"/g)].map((match) => match[1]);

for (const file of files) {
  const src = await readFile(path.join(schemaDir, file), "utf8");
  checked += 1;
  for (const match of src.matchAll(/\bmoduleType:\s*"([^"]+)"/g)) {
    moduleTypes.add(match[1]);
  }
  for (const control of readControls(src)) activeControls.add(control);

  // 提取 section 的 layer 序列（仅匹配 section 定义里的 layer，不匹配类型引用）
  const layers = [...src.matchAll(/\blayer:\s*"([a-z]+)"/g)].map((m) => m[1]);

  // 硬错误 1：未知 layer
  for (const layer of layers) {
    if (!LAYER_ORDER.includes(layer)) {
      errors.push(`${file}: 未知 layer "${layer}"（合法集合：${LAYER_ORDER.join("/")}）`);
    }
  }

  // 硬错误 2：空 section（fields 数组为空）
  if (/fields:\s*\[\s*\]/.test(src)) {
    errors.push(`${file}: 存在空 section（fields: []），应整节省略`);
  }

  // 软警告 1：section 顺序相对七层逆序（显示层会重排，不影响运营，仅提示源码整洁）
  let lastIdx = -1;
  for (const layer of layers) {
    const idx = LAYER_ORDER.indexOf(layer);
    if (idx === -1) continue;
    if (idx < lastIdx) {
      warnings.push(`${file}: section 顺序相对七层逆序（${layer} 出现在 ${LAYER_ORDER[lastIdx]} 之后）`);
      break;
    }
    lastIdx = idx;
  }

  // 软警告 2：同一层多个 section
  const seen = new Set();
  for (const layer of layers) {
    if (seen.has(layer)) {
      warnings.push(`${file}: 同一层 "${layer}" 有多个 section，建议合并`);
      break;
    }
    seen.add(layer);
  }
}

for (const control of readControls(sharedSource)) activeControls.add(control);

if (files.length !== EXPECTED_SCHEMA_FILE_COUNT) {
  errors.push(
    `Schema 源文件数量不一致：actual=${files.length} expected=${EXPECTED_SCHEMA_FILE_COUNT}`,
  );
}

const registryBlock = registrySource.match(
  /const MODULE_INSPECTOR_SCHEMA_SOURCE:[\s\S]*?=\s*\{([\s\S]*?)\n\};/,
);
if (!registryBlock) {
  errors.push("无法解析 MODULE_INSPECTOR_SCHEMA_SOURCE 注册表");
}
const registryEntries = registryBlock
  ? [...registryBlock[1].matchAll(/^\s{2}([^\s/][^:]+):\s*[A-Za-z]/gm)].map(
      (match) => match[1].trim(),
    )
  : [];
if (registryEntries.length !== EXPECTED_REGISTRY_ENTRY_COUNT) {
  errors.push(
    `Inspector 注册项数量不一致：actual=${registryEntries.length} expected=${EXPECTED_REGISTRY_ENTRY_COUNT}`,
  );
}
if (new Set(registryEntries).size !== registryEntries.length) {
  errors.push("Inspector 注册表包含重复模块类型");
}
for (const moduleType of registryEntries) {
  if (!moduleTypes.has(moduleType)) {
    errors.push(`Inspector 注册项缺少对应 Schema moduleType：${moduleType}`);
  }
}

const supportedControls = new Set(
  [...typesSource.matchAll(/\bcontrol:\s*([^;]+);/g)].flatMap((match) =>
    [...match[1].matchAll(/"([A-Za-z]+)"/g)].map((value) => value[1]),
  ),
);
const renderedControls = new Set(
  [...rendererSource.matchAll(/case\s+"([A-Za-z]+)":/g)].map((match) => match[1]),
);
for (const control of activeControls) {
  if (!supportedControls.has(control)) {
    errors.push(`Schema 使用了 FieldDef 未声明的控件：${control}`);
  }
  if (!renderedControls.has(control)) {
    errors.push(`Schema 控件缺少 FieldRenderer 分发：${control}`);
  }
}
for (const control of supportedControls) {
  if (!renderedControls.has(control)) {
    errors.push(`FieldDef 控件缺少 FieldRenderer 分发：${control}`);
  }
}

const label = (n) => (n ? `${n} 条` : "0");

console.log(
  `Inspector Schema 自检：${checked} 个源文件 · ${registryEntries.length} 个注册项 · ${activeControls.size}/${supportedControls.size} 个活跃/支持控件 · 硬错误 ${errors.length} · 软警告 ${warnings.length}`,
);

for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✗ ${e}`);

if (errors.length > 0) {
  console.error(`\n失败：${label(errors.length)}硬错误需修复。`);
  process.exit(1);
}
console.log("\n通过：无硬错误（软警告仅提示源码整洁，不阻断）。");
