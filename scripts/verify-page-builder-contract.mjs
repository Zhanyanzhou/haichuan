import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [clientSource, serverSource, rendererSource] = await Promise.all([
  readFile(path.join(root, "client/src/page-builder/config/puckConfig.tsx"), "utf8"),
  readFile(path.join(root, "server/src/modules/page-modules/page-modules.service.ts"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/runtime/PuckDocumentRenderer.tsx"), "utf8"),
]);

function clientBlockTypes(source) {
  const typeBlock = source.match(/type MyComponents = \{([\s\S]*?)\n\};/);
  assert.ok(typeBlock, "未找到前端 MyComponents 区块契约");
  return [...typeBlock[1].matchAll(/^\s{2}([^:\n]+):\s*[^;]+;\s*$/gm)].map((match) => match[1].trim());
}

function serverBlockTypes(source) {
  const labelsBlock = source.match(/const PUCK_COMPONENT_LABELS = \[([\s\S]*?)\] as const;/);
  assert.ok(labelsBlock, "未找到服务端 PUCK_COMPONENT_LABELS 区块契约");
  return [...labelsBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

const clientTypes = clientBlockTypes(clientSource);
const serverTypes = serverBlockTypes(serverSource);
const missingOnServer = clientTypes.filter((type) => !serverTypes.includes(type));
const staleOnServer = serverTypes.filter((type) => !clientTypes.includes(type));

assert.deepEqual(missingOnServer, [], `服务端缺少前端区块类型：${missingOnServer.join("、")}`);
assert.deepEqual(staleOnServer, [], `服务端存在前端未注册区块类型：${staleOnServer.join("、")}`);

const editorOnlyTypes = ["网站全局设置", "业务功能区"];
const rendererDirectTypes = ["产品展示行", "单品焦点推荐", "佩戴灵感"];
const rendererTypes = [...rendererSource.matchAll(/case "([^"]+)":/g)].map((match) => match[1]);
const missingOnRenderer = clientTypes.filter(
  (type) => !editorOnlyTypes.includes(type) && !rendererDirectTypes.includes(type) && !rendererTypes.includes(type),
);
assert.deepEqual(missingOnRenderer, [], `前台渲染器缺少区块类型：${missingOnRenderer.join("、")}`);

const publishProductCheck = serverSource.match(
  /if \(productIds\.size > 0\) \{([\s\S]*?)\n    \}/,
);
assert.ok(publishProductCheck, "未找到页面发布时的关联商品校验");
const publishProductSource = publishProductCheck[1];
assert.match(
  publishProductSource,
  /deletedAt:\s*null/,
  "页面发布必须拒绝引用已删除商品",
);
assert.match(
  publishProductSource,
  /status:\s*["']PUBLISHED["']/,
  "页面发布必须拒绝引用草稿商品",
);
assert.match(
  publishProductSource,
  /visibility:\s*["']PUBLIC["']/,
  "页面发布必须拒绝引用内部或非公开商品",
);

const productVisibilityCases = [
  { name: "public", status: "PUBLISHED", visibility: "PUBLIC", deletedAt: null, allowed: true },
  { name: "draft", status: "DRAFT", visibility: "PUBLIC", deletedAt: null, allowed: false },
  { name: "internal", status: "PUBLISHED", visibility: "INTERNAL", deletedAt: null, allowed: false },
  { name: "deleted", status: "PUBLISHED", visibility: "PUBLIC", deletedAt: new Date(), allowed: false },
];

for (const product of productVisibilityCases) {
  const isPubliclyVisible =
    product.status === "PUBLISHED" &&
    product.visibility === "PUBLIC" &&
    product.deletedAt === null;
  assert.equal(
    isPubliclyVisible,
    product.allowed,
    `公开页面商品范围错误：${product.name}`,
  );
}

console.log(`页面构建器契约一致：${clientTypes.length} 种区块。`);
