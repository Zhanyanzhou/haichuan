import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "server/prisma/schema.prisma");
const migrationsPath = path.join(root, "server/prisma/migrations");
const dynamicMigrationPath = path.join(
  migrationsPath,
  "20260828200000_add_dynamic_template_versioning/migration.sql",
);
const rejectedFixedMigrationPath = path.join(
  migrationsPath,
  "20260829120000_add_fixed_template_versioning/migration.sql",
);
const personalRevisionMigrationPath = path.join(
  migrationsPath,
  "20260830110000_add_personal_content_template_revision/migration.sql",
);
const activationMigrationPath = path.join(
  migrationsPath,
  "20260830111000_add_dynamic_template_activations/migration.sql",
);
const activationPlannerPath = path.join(
  root,
  "server/src/modules/page-modules/dynamic-template-activation.ts",
);
const dynamicTemplateServicePath = path.join(
  root,
  "server/src/modules/page-modules/dynamic-templates.service.ts",
);
const dynamicTemplateControllerPath = path.join(
  root,
  "server/src/modules/page-modules/dynamic-templates.controller.ts",
);
const pageModulesModulePath = path.join(
  root,
  "server/src/modules/page-modules/page-modules.module.ts",
);
const dynamicTemplateClientPath = path.join(
  root,
  "client/src/services/clients/dynamicTemplateClient.ts",
);
const homepageConfigPath = path.join(
  root,
  "client/src/pages/admin/HomepageConfig/index.tsx",
);

const [
  schema,
  dynamicMigration,
  rejectedFixedMigration,
  personalRevisionMigration,
  activationMigration,
  activationPlanner,
  dynamicTemplateService,
  dynamicTemplateController,
  pageModulesModule,
  dynamicTemplateClient,
  homepageConfig,
  migrationEntries,
] = await Promise.all([
  readFile(schemaPath, "utf8"),
  readFile(dynamicMigrationPath, "utf8"),
  readFile(rejectedFixedMigrationPath, "utf8"),
  readFile(personalRevisionMigrationPath, "utf8"),
  readFile(activationMigrationPath, "utf8"),
  readFile(activationPlannerPath, "utf8"),
  readFile(dynamicTemplateServicePath, "utf8"),
  readFile(dynamicTemplateControllerPath, "utf8"),
  readFile(pageModulesModulePath, "utf8"),
  readFile(dynamicTemplateClientPath, "utf8"),
  readFile(homepageConfigPath, "utf8"),
  readdir(migrationsPath, { withFileTypes: true }),
]);

const issues = [];
const requireMatch = (text, pattern, message) => {
  if (!pattern.test(text)) issues.push(message);
};
const requireNoMatch = (text, pattern, message) => {
  if (pattern.test(text)) issues.push(message);
};

const dynamicTables = [...dynamicMigration.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1]);
const expectedDynamicTables = [
  "dynamic_templates",
  "dynamic_template_drafts",
  "dynamic_template_versions",
];
if (JSON.stringify(dynamicTables) !== JSON.stringify(expectedDynamicTables)) {
  issues.push(`统一模板基础 migration 表集合漂移：${dynamicTables.join(", ")}`);
}
requireNoMatch(
  dynamicMigration,
  /\b(?:DROP TABLE|TRUNCATE TABLE|DELETE FROM|INSERT INTO|UPDATE\s+`)\b/i,
  "统一模板基础 migration 出现破坏性或数据写入语句",
);

requireNoMatch(
  rejectedFixedMigration,
  /\b(?:CREATE|ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE)\s+(?:TABLE\s+|INTO\s+|FROM\s+)?`?/i,
  "被拒固定模板 migration 不是无操作审计标记",
);
requireNoMatch(
  rejectedFixedMigration,
  /system_content_template_(?:states|versions)/i,
  "被拒固定模板 migration 仍包含双事实来源表",
);
for (const [pattern, message] of [
  [/information_schema`.`COLUMNS/i, "个人模板 revision migration 未检测既有列"],
  [/@personal_template_revision_exists = 0/i, "个人模板 revision migration 未覆盖缺列起点"],
  [/ALTER TABLE `personal_content_templates` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1/i, "个人模板 revision migration 缺少加法收敛语句"],
  [/PREPARE personal_template_revision_migration/i, "个人模板 revision migration 未使用受控条件语句"],
]) {
  requireMatch(personalRevisionMigration, pattern, message);
}

for (const model of [
  "PersonalContentTemplate",
  "DynamicTemplate",
  "DynamicTemplateDraft",
  "DynamicTemplateVersion",
  "DynamicTemplateActivation",
]) {
  requireMatch(schema, new RegExp(`model ${model} \\{`), `当前 Prisma Schema 缺少 Gate A 模型 ${model}`);
}
requireMatch(
  schema,
  /model PersonalContentTemplate \{[\s\S]*?\n\s+revision\s+Int\s+@default\(1\)/,
  "当前 Prisma Schema 未保留个人模板 revision 合同",
);
requireMatch(
  schema,
  /model DynamicTemplateActivation \{/,
  "Prisma Schema 缺少唯一激活事实模型",
);
requireNoMatch(schema, /model SystemContentTemplate(?:State|Version) \{/, "Prisma Schema 仍保留固定模板双事实来源");
requireNoMatch(schema, /system_content_template_(?:states|versions)/, "Prisma Schema 仍映射固定模板双事实来源表");

const migrationSqlFiles = [];
for (const entry of migrationEntries) {
  if (!entry.isDirectory()) continue;
  const sqlPath = path.join(migrationsPath, entry.name, "migration.sql");
  try {
    migrationSqlFiles.push({ name: entry.name, sql: await readFile(sqlPath, "utf8") });
  } catch {
    // Prisma migration 目录应包含 migration.sql；其他目录不参与本静态 Gate A 审计。
  }
}
const activationMigrations = migrationSqlFiles.filter(({ sql }) => (
  /CREATE TABLE `dynamic_template_activations`/i.test(sql)
));
if (activationMigrations.length !== 1
  || activationMigrations[0]?.name !== "20260830111000_add_dynamic_template_activations") {
  issues.push(`激活表 migration 数量或目录异常：${activationMigrations.map(({ name }) => name).join(", ")}`);
}
const activationTables = [...activationMigration.matchAll(/CREATE TABLE `([^`]+)`/g)]
  .map((match) => match[1]);
if (JSON.stringify(activationTables) !== JSON.stringify(["dynamic_template_activations"])) {
  issues.push(`激活 migration 表集合漂移：${activationTables.join(", ")}`);
}
for (const [pattern, message] of [
  [/`request_hash` CHAR\(64\) NOT NULL/, "激活表缺少 request_hash"],
  [/`result_summary` JSON NOT NULL/, "激活表缺少无正文结果摘要"],
  [/UNIQUE INDEX `dynamic_template_activations_idempotency_key_hash_key`/, "激活表缺少幂等唯一索引"],
  [/UNIQUE INDEX `dynamic_template_activations_dynamic_template_id_to_version_key`/, "激活表缺少模板版本唯一索引"],
  [/INDEX `dynamic_template_activations_template_activated_idx`\(`dynamic_template_id`, `activated_at`\)/, "激活表缺少长度安全的审计索引"],
]) {
  requireMatch(activationMigration, pattern, message);
}
requireNoMatch(
  activationMigration,
  /ALTER TABLE `(?:page_documents|page_document_revisions|page_schemes)`|\b(?:DELETE FROM|INSERT INTO|UPDATE\s+`)/i,
  "激活 migration 夹带页面结构或数据写入",
);

for (const [pattern, message] of [
  [/schemes\?: DynamicTemplateActivationSchemeSnapshot\[\]/, "纯规划器尚未接收页面方案快照"],
  [/affectedSchemeCount: number/, "纯规划器影响合同缺少页面方案计数"],
  [/createDynamicTemplateActivationRequestHash/, "纯规划器缺少规范化 requestHash"],
  [/classifyDynamicTemplateActivationIdempotency/, "纯规划器缺少幂等重放/冲突判定"],
  [/source: "scheme"/, "纯规划器没有把方案实例标识为独立来源"],
  [/draftMetadata\?: unknown/, "激活快照没有纳入页面 metadata 基线"],
  [/nextDocumentStatus: "DRAFT" \| "PUBLISHED"/, "纯规划器没有输出升级后的页面状态"],
  [/preservedDraftDocumentCount: number/, "影响合同没有统计需保留的未发布草稿"],
  [/createDynamicTemplateActivationOutboxEvent/, "纯规划层缺少模板激活 outbox 事件合同"],
  [/eventType: "page\.template-activated"/, "模板激活 outbox 事件类型未固定"],
  [/deduplicationKey = `template-activated:/, "模板激活 outbox 事件缺少稳定去重键"],
]) {
  requireMatch(activationPlanner, pattern, message);
}
for (const [text, pattern, message] of [
  [dynamicTemplateService, /\b(?:previewActivationImpact|activate)\s*\(/, "运行时服务仍暴露 Activation 能力"],
  [dynamicTemplateController, /activation-impact|:templateId\/activate/, "运行时控制器仍暴露 Activation HTTP 入口"],
  [dynamicTemplateClient, /previewActivationImpact|\bactivate\s*:\s*async/, "客户端仍暴露 Activation 调用"],
  [homepageConfig, /(?:getActivationImpact|previewActivationImpact|dynamicTemplateApi\.activate)\s*\(/, "模板工作区仍调用 Activation"],
]) {
  requireNoMatch(text, pattern, message);
}
requireMatch(
  pageModulesModule,
  /exports:\s*\[PageModulesService\]/,
  "DynamicTemplatesService 仍可能被其他模块注入并绕过发布控制器",
);
requireMatch(
  dynamicTemplateController,
  /@Post\(":templateId\/publish"\)[\s\S]*?return this\.service\.publish\(/,
  "模板发布 HTTP 入口没有转发到独立版本发布服务",
);
requireMatch(
  dynamicTemplateClient,
  /\bpublish\s*:\s*async\s*\(/,
  "客户端缺少独立模板版本发布调用",
);
const publishFlow = homepageConfig.match(/const publishDynamicTemplateDraft[\s\S]*?\n  \};/)?.[0] ?? "";
requireMatch(
  publishFlow,
  /dynamicTemplateApi\.publish\([\s\S]*?published\.draft\.revision[\s\S]*?published\.version[\s\S]*?current\.markSaved\(nextDraft\)/,
  "独立模板发布成功后没有推进草稿 revision 与发布版本基线",
);
requireNoMatch(
  publishFlow,
  /(?:getActivationImpact|previewActivationImpact|dynamicTemplateApi\.activate)\s*\(/,
  "模板日常发布仍耦合页面影响预检或全页面激活",
);

if (issues.length > 0) {
  console.error(["Template V2 Gate A 静态准备审计失败：", ...issues.map((issue) => `- ${issue}`)].join("\n"));
  process.exitCode = 1;
} else {
  const digest = createHash("sha256")
    .update([
      schema,
      dynamicMigration,
      rejectedFixedMigration,
      personalRevisionMigration,
      activationMigration,
      activationPlanner,
      dynamicTemplateService,
      dynamicTemplateController,
      pageModulesModule,
      dynamicTemplateClient,
      homepageConfig,
    ].join("\n---\n"))
    .digest("hex");
  console.log(
    `Template V2 Gate A 候选状态一致：GATE_A_CANDIDATE · 单一母模板发布合同与 Activation 运行入口清除通过；历史 migration/ledger 仅保留兼容审计，目标数据库仍需独立核验 · SHA-256 ${digest.slice(0, 12)}`,
  );
}
