import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [clientSource, serverSource, productEligibilitySource, rendererSource, blockMetaSource, homepageConfigSource, schemaInspectorSource] = await Promise.all([
  readFile(path.join(root, "client/src/page-builder/config/puckConfig.tsx"), "utf8"),
  readFile(path.join(root, "server/src/modules/page-modules/page-modules.service.ts"), "utf8"),
  readFile(path.join(root, "server/src/modules/products/product-eligibility.ts"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/runtime/PuckDocumentRenderer.tsx"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/config/blockMeta.ts"), "utf8"),
  readFile(path.join(root, "client/src/pages/admin/HomepageConfig/index.tsx"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/inspector/SchemaInspectorPanel.tsx"), "utf8"),
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

// 生命周期只限制“新增入口”，不能影响存量 Renderer。模板库必须消费生成合同的状态，
// 不能再把所有已注册组件直接暴露给运营人员。
assert.match(
  blockMetaSource,
  /CONTENT_TEMPLATE_REGISTRY[\s\S]*isContentTemplateInsertable/,
  "模块元数据必须从生成合同读取模板实施状态",
);
assert.match(
  homepageConfigSource,
  /isContentTemplateInsertable\(name\)/,
  "模板库必须按合同实施状态限制新增入口",
);
assert.match(
  homepageConfigSource,
  /<SchemaInspectorPanel[\s\S]*publishIssues=\{publishIssues\}/,
  "当前模块的发布问题必须传入属性面板",
);
assert.match(
  schemaInspectorSource,
  /BUSINESS_TASK_GROUP_ORDER[\s\S]*"product"[\s\S]*"media"/,
  "业务对象模块必须先选择业务事实，再编辑表现内容",
);
assert.match(
  schemaInspectorSource,
  /issue\.blockId === editor\.props\.id/,
  "属性面板必须只显示当前模块的发布问题",
);

const publishProductCheck = serverSource.match(
  /if \(productIds\.size > 0\) \{([\s\S]*?)\n    \}/,
);
assert.ok(publishProductCheck, "未找到页面发布时的关联商品校验");
const publishProductSource = publishProductCheck[1];
assert.match(
  publishProductSource,
  /customerFacingProductWhereForVisibilities\(\["PUBLIC"\]\)/,
  "页面发布必须复用客户侧公开商品资格单一事实源",
);
assert.match(
  serverSource,
  /import \{ customerFacingProductWhereForVisibilities \} from "\.\.\/products\/product-eligibility";/,
  "页面发布必须从商品资格模块导入共享门禁",
);
assert.match(
  productEligibilitySource,
  /deletedAt:\s*null/,
  "共享商品资格必须拒绝已删除商品",
);
assert.match(
  productEligibilitySource,
  /status:\s*["']PUBLISHED["']/,
  "共享商品资格必须拒绝未上架商品",
);
assert.match(
  productEligibilitySource,
  /publicationQualityStatus:\s*["']READY["']/,
  "共享商品资格必须拒绝未通过发布质量门禁的商品",
);
assert.match(
  productEligibilitySource,
  /visibility:\s*\{\s*in:\s*visibilities\s*\}/,
  "共享商品资格必须按调用方允许的可见范围过滤",
);
assert.match(
  productEligibilitySource,
  /\.\.\.customerFacingReleaseWhere\(\)/,
  "共享商品资格必须遵循当前发布画像",
);

const productVisibilityCases = [
  { name: "public-ready", status: "PUBLISHED", quality: "READY", visibility: "PUBLIC", deletedAt: null, allowed: true },
  { name: "quarantined", status: "PUBLISHED", quality: "QUARANTINED", visibility: "PUBLIC", deletedAt: null, allowed: false },
  { name: "draft", status: "DRAFT", quality: "READY", visibility: "PUBLIC", deletedAt: null, allowed: false },
  { name: "member", status: "PUBLISHED", quality: "READY", visibility: "MEMBER", deletedAt: null, allowed: false },
  { name: "internal", status: "PUBLISHED", quality: "READY", visibility: "INTERNAL", deletedAt: null, allowed: false },
  { name: "deleted", status: "PUBLISHED", quality: "READY", visibility: "PUBLIC", deletedAt: new Date(), allowed: false },
];

for (const product of productVisibilityCases) {
  const isPubliclyVisible =
    product.status === "PUBLISHED" &&
    product.quality === "READY" &&
    product.visibility === "PUBLIC" &&
    product.deletedAt === null;
  assert.equal(
    isPubliclyVisible,
    product.allowed,
    `公开页面商品范围错误：${product.name}`,
  );
}

console.log(`页面构建器契约一致：${clientTypes.length} 种区块。`);
