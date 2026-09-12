import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [clientSource, serverSource, productEligibilitySource, rendererSource, matureRegistrySource, matureRendererSource, blockMetaSource, homepageConfigSource, schemaInspectorSource, publishValidationSource] = await Promise.all([
  readFile(path.join(root, "client/src/page-builder/config/puckConfig.tsx"), "utf8"),
  readFile(path.join(root, "server/src/modules/page-modules/page-modules.service.ts"), "utf8"),
  readFile(path.join(root, "server/src/modules/products/product-eligibility.ts"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/runtime/PuckDocumentRenderer.tsx"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/template-definition/validateTemplateDefinition.ts"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/template-definition/MatureContentTemplateRenderer.tsx"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/config/blockMeta.ts"), "utf8"),
  readFile(path.join(root, "client/src/pages/admin/HomepageConfig/index.tsx"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/inspector/SchemaInspectorPanel.tsx"), "utf8"),
  readFile(path.join(root, "client/src/page-builder/inspector/publishValidation.ts"), "utf8"),
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

function objectStringValues(source, constName) {
  const objectBlock = source.match(
    new RegExp(`const ${constName} = \\{([\\s\\S]*?)\\n\\} as const`),
  );
  assert.ok(objectBlock, `未找到 ${constName} 映射`);
  return [...objectBlock[1].matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1]);
}

const clientTypes = clientBlockTypes(clientSource);
const serverTypes = serverBlockTypes(serverSource);
const missingOnServer = clientTypes.filter((type) => !serverTypes.includes(type));
const staleOnServer = serverTypes.filter((type) => !clientTypes.includes(type));

assert.deepEqual(missingOnServer, [], `服务端缺少前端区块类型：${missingOnServer.join("、")}`);
assert.deepEqual(staleOnServer, [], `服务端存在前端未注册区块类型：${staleOnServer.join("、")}`);

const editorOnlyTypes = ["网站全局设置", "业务功能区"];
const rendererDirectTypes = ["动态模板实例"];
const rendererTypes = [...rendererSource.matchAll(/case "([^"]+)":/g)].map((match) => match[1]);
const matureTypes = objectStringValues(
  matureRegistrySource,
  "MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE",
);
assert.deepEqual(matureTypes, ["首屏主视觉"], "成熟模板注册表只能保留首屏测试模板");
assert.match(matureRendererSource, /const moduleType = "首屏主视觉"/, "成熟模板渲染器必须只处理首屏测试模板");
assert.match(
  rendererSource,
  /getMatureContentTemplateSlotType\(block\.type \|\| ""\)[\s\S]*<MatureContentTemplateRenderer/,
  "前台渲染器必须把成熟模板映射接入统一渲染器",
);
const missingOnRenderer = clientTypes.filter(
  (type) => !editorOnlyTypes.includes(type)
    && !rendererDirectTypes.includes(type)
    && !matureTypes.includes(type)
    && !rendererTypes.includes(type),
);
assert.deepEqual(missingOnRenderer, [], `前台渲染器缺少区块类型：${missingOnRenderer.join("、")}`);

// 模板库必须消费生成合同的状态，不能重新暴露已删除模板。
assert.match(
  blockMetaSource,
  /CONTENT_TEMPLATE_REGISTRY[\s\S]*isContentTemplateInsertable/,
  "模块元数据必须从生成合同读取模板实施状态",
);
// 页面制作已经统一为已发布动态模板；守护当前精确版本链，不依赖退役 helper 名称。
const pageLibrarySource = await readFile(path.join(root, "client/src/page-builder/template-editor/TemplateEditorLibrary.tsx"), "utf8");
const pageLibraryEntry = homepageConfigSource.match(/<UnifiedTemplateLibrary\b[^>]*mode="page"[\s\S]*?\/>/);
assert.ok(pageLibraryEntry, "页面必须使用统一模板库的 page 模式");
assert.match(pageLibraryEntry[0], /onInsertPublished=\{insertPublishedDynamicTemplate\}/, "页面必须走已发布版本插入链");
assert.doesNotMatch(pageLibraryEntry[0], /onInsertSystem|onInsertPersonal|onInsertDraft/, "页面不得提供系统旁路、个人模板或草稿插入入口");
assert.match(pageLibrarySource, /props\.mode === "page"[\s\S]*presentation\.source === "published"[\s\S]*props\.isPublishedTemplateAllowed\(presentation\.published\)/, "页面可插入目录必须过滤已发布版本");
assert.doesNotMatch(pageLibrarySource, /pageHasPrimaryStage|当前页面已有主舞台|不能重复添加此主舞台模板/, "页面模板目录不得按已有首屏数量禁用模板");
assert.doesNotMatch(homepageConfigSource, /isPrimaryStageInsertionBlocked|首屏主舞台全页只能有一个/, "页面插入命令不得限制首屏数量");
assert.match(homepageConfigSource, /createDynamicTemplateInstanceProps\(\{\s*templateId: template\.templateId,\s*version: template\.version,/, "页面实例必须钉住所选模板的精确版本");
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
  /getInspectorPublishIssues\(publishIssues, editor\.props\.id\)/,
  "属性面板必须通过共享过滤器读取当前模块的发布问题",
);
assert.match(
  publishValidationSource,
  /const acceptedBlockIds = new Set\(\[[\s\S]*normalizedBlockId[\s\S]*\]\);[\s\S]*acceptedBlockIds\.has\(issue\.blockId\)/,
  "共享发布问题过滤器必须通过当前模块身份集合保留对应问题",
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

// 商品公开可见性的行为级验证在服务端测试中执行（导入真实导出函数并对其实际输出求值）：
// server/src/modules/products/product-eligibility.spec.ts。
// 此处曾存在用本地复制的同一表达式自我断言的用例，不构成对真实门禁的验证，已移除。

console.log(`页面构建器契约一致：${clientTypes.length} 种区块。`);
