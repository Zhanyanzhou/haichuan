import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(root, "client/src");
const serverRoot = path.join(root, "server/src");

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function collectRuntimeSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectRuntimeSources(absolutePath));
      continue;
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.spec\.(?:ts|tsx)$/.test(entry.name)) continue;
    files.push({
      path: path.relative(root, absolutePath).replaceAll("\\", "/"),
      source: await readFile(absolutePath, "utf8"),
    });
  }
  return files;
}

const [
  clientFiles,
  serverFiles,
  templateEditorTypes,
  templateWorkspace,
  systemTemplateClient,
  apiClient,
  pageModulesController,
  pageModulesService,
  dynamicTemplateController,
  dynamicTemplateClient,
  homepageConfig,
] = await Promise.all([
  collectRuntimeSources(clientRoot),
  collectRuntimeSources(serverRoot),
  read("client/src/page-builder/template-editor/types.ts"),
  read("client/src/page-builder/template-editor/TemplateWorkspace.tsx"),
  read("client/src/services/clients/systemContentTemplateClient.ts"),
  read("client/src/services/api.ts"),
  read("server/src/modules/page-modules/page-modules.controller.ts"),
  read("server/src/modules/page-modules/page-modules.service.ts"),
  read("server/src/modules/page-modules/dynamic-templates.controller.ts"),
  read("client/src/services/clients/dynamicTemplateClient.ts"),
  read("client/src/pages/admin/HomepageConfig/index.tsx"),
]);

const clientRuntime = clientFiles.map((file) => file.source).join("\n");
const issues = [];
const requireMatch = (text, pattern, message) => {
  if (!pattern.test(text)) issues.push(message);
};
const requireNoMatch = (text, pattern, message) => {
  if (pattern.test(text)) issues.push(message);
};

requireMatch(
  templateEditorTypes,
  /interface LegacyTemplateSourceDraft \{[\s\S]*?interface TemplateEditorDraft \{[\s\S]*?format: "dynamic";/,
  "旧格式兼容输入与统一模板编辑会话没有保持单向适配边界",
);
requireNoMatch(
  templateEditorTypes,
  /format: "fixed"|TemplateDraftV1|DynamicTemplateDraftV1/,
  "模板编辑会话类型仍保留旧 fixed/dynamic 双模型",
);

for (const [pattern, message] of [
  [/systemContentTemplateApi\.(?:overwrite|rollback)\b/, "客户端仍调用旧系统模板覆盖或回滚"],
  [/personalContentTemplateApi\.(?:create|update|remove)\b/, "客户端仍调用旧个人模板写方法"],
  [/\bonSaveAsTemplate\b/, "页面 Inspector 仍携带旧另存模板回调"],
  [/另存到模板库/, "客户端运行时仍展示旧另存模板入口"],
  [/\bcanOverwriteSystemTemplates\b/, "客户端仍保留旧系统模板覆盖能力开关"],
]) {
  requireNoMatch(clientRuntime, pattern, message);
}

requireNoMatch(
  systemTemplateClient,
  /systemContentTemplateApi|api\.get\(/,
  "客户端仍保留旧系统模板独立请求门面",
);
requireNoMatch(apiClient, /personalContentTemplateApi/, "客户端仍保留旧个人模板独立请求门面");

requireMatch(
  templateWorkspace,
  /页面中已使用的模板会继续保留添加或升级时选择的版本；此处仅供查看，不会修改模板草稿、正式版本或任何页面。/,
  "统一母模板版本历史没有明确页面锁版与只读语义",
);
requireNoMatch(
  templateWorkspace,
  /激活此版本|rollbackSystemVersion|转换为新版|固定模板|动态模板/,
  "模板工作区仍暴露旧历史激活或并列模板产品概念",
);

requireNoMatch(
  pageModulesService,
  /(?:overwriteSystemContentTemplate|rollbackSystemContentTemplate|createPersonalContentTemplate|updatePersonalContentTemplate|deletePersonalContentTemplate)|this\.prisma\.personalContentTemplate\.(?:create|updateMany|deleteMany)\s*\(/,
  "PageModulesService 仍保留旧模板写方法或数据库写入",
);

requireNoMatch(
  pageModulesController,
  /@(?:Post|Patch|Delete)\("(?:system-content-templates|personal-content-templates)|return this\.service\.(?:overwriteSystemContentTemplate|rollbackSystemContentTemplate|createPersonalContentTemplate|updatePersonalContentTemplate|deletePersonalContentTemplate)\s*\(/,
  "旧模板 HTTP 写端点仍存在",
);

requireMatch(
  dynamicTemplateController,
  /@Get\("catalog"\)[\s\S]*?this\.service\.listPublished\(\)[\s\S]*?this\.pageModules\.getSystemContentTemplates\(\)[\s\S]*?this\.pageModules\.getPersonalContentTemplates/,
  "服务端未提供统一母模板目录聚合入口",
);
requireMatch(
  dynamicTemplateController,
  /@Post\(":templateId\/publish"\)[\s\S]*?return this\.service\.publish\(/,
  "统一 V2 publish 没有转发到独立模板版本发布服务",
);
requireMatch(dynamicTemplateClient, /\blistCatalog\s*:\s*async\s*\(/, "客户端缺少统一母模板目录调用");
requireMatch(dynamicTemplateClient, /\bpublish\s*:\s*async\s*\(/, "客户端缺少独立 V2 publish 调用");
requireNoMatch(
  dynamicTemplateController + dynamicTemplateClient,
  /activation-impact|:templateId\/activate|\bactivate\s*:\s*async\s*\(/,
  "运行时仍暴露 Activation 入口",
);
requireMatch(
  homepageConfig,
  /dynamicTemplateApi\.publish\(/,
  "模板设计发布入口没有调用独立 V2 publish",
);
requireNoMatch(
  homepageConfig.match(/const publishDynamicTemplateDraft[\s\S]*?\n  \};/)?.[0] ?? "",
  /(?:getActivationImpact|\.activate)\(/,
  "模板设计发布仍耦合页面影响预检或全页面 Activation",
);

const templateToolboxImports = clientFiles.filter((file) => (
  /from\s+["'][^"']*\/TemplateToolbox["']/.test(file.source)
));
if (templateToolboxImports.length > 0) {
  issues.push(`旧 TemplateToolbox 仍有活动引用：${templateToolboxImports.map((file) => file.path).join(", ")}`);
}
const dynamicToolboxImports = clientFiles.filter((file) => (
  /from\s+["'][^"']*\/DynamicTemplateToolbox["']/.test(file.source)
));
if (dynamicToolboxImports.length !== 1
  || dynamicToolboxImports[0]?.path !== "client/src/page-builder/template-editor/DynamicTemplateStructurePanel.tsx") {
  issues.push(`DynamicTemplateToolbox 活动引用不符合预期：${dynamicToolboxImports.map((file) => file.path).join(", ")}`);
}

if (issues.length > 0) {
  console.error(["Template V2 Gate D 静态准备审计失败：", ...issues.map((issue) => `- ${issue}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "GATE_D_STATIC_CANDIDATE",
    runtimeFilesScanned: clientFiles.length + serverFiles.length,
    legacyWriteSurfaces: {
      client: "closed",
      pageModulesService: "removed",
      httpWriteRoutes: "removed",
      dynamicTemplatePublish: "independent-version-only",
      dynamicTemplateActivation: "runtime-path-removed; database-ledger-retained",
      catalog: "single-server-aggregation",
    },
    retainedCompatibility: [
      "system template list/get/history",
      "personal template list",
      "legacy page origin hydration and exact historical rendering",
      "DynamicTemplateToolbox node palette",
      "historical activation migration and ledger schema for database compatibility",
    ],
    remainingGates: [
      "Gate B target-environment dry-run",
      "external API consumer audit",
      "Gate C migration and production cutover approval",
    ],
  }, null, 2));
}
