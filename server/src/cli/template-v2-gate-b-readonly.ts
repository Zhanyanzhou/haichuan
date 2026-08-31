import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { CONTENT_TEMPLATE_REGISTRY } from "../modules/page-modules/generated/contentTemplates.generated";
import { validateDynamicTemplateDefinition } from "../modules/page-modules/generated/validateTemplateDefinition.generated";
import type { TemplateDefinitionV2 } from "../modules/page-modules/generated/templateDefinition.generated";
import {
  calculateDynamicTemplateDefinitionChecksum,
  matchesDynamicTemplateDefinitionChecksum,
} from "../modules/page-modules/dynamic-template-definition-integrity";
import {
  planDynamicTemplateActivation,
  type DynamicTemplateActivationDocumentSnapshot,
  type DynamicTemplateActivationSchemeSnapshot,
} from "../modules/page-modules/dynamic-template-activation";
import {
  planInitialTemplateV2Cutover,
  type InitialTemplateV2CutoverReplacement,
} from "../modules/page-modules/dynamic-template-initial-cutover";
import { PrismaService } from "../common/prisma/prisma.service";
import { checkMigrationIntegrity } from "./release-preflight";

const DYNAMIC_TEMPLATE_BLOCK_TYPE = "动态模板实例";
const LEGACY_TEMPLATE_TYPES = new Set<string>(
  CONTENT_TEMPLATE_REGISTRY.map((template) => template.moduleType),
);
const REQUIRED_TABLES = [
  "_prisma_migrations",
  "page_documents",
  "page_document_revisions",
  "page_schemes",
  "personal_content_templates",
  "dynamic_templates",
  "dynamic_template_drafts",
  "dynamic_template_versions",
] as const;
const GATE_C_CANDIDATE_TABLES = ["dynamic_template_activations"] as const;
const GATE_C_CANDIDATE_MIGRATIONS = new Set([
  "20260830110000_add_personal_content_template_revision",
  "20260830111000_add_dynamic_template_activations",
]);

type JsonRecord = Record<string, unknown>;

export interface GateBReadOnlyConfig {
  environmentId: string;
  expectedDatabase: string;
  approvalReferenceHash: string;
}

export interface GateBTemplateInventory {
  legacyInstanceCount: number;
  dynamicInstanceCount: number;
  invalidDynamicInstanceCount: number;
  dynamicInstancesByTemplateId: Record<string, number>;
  jsonBytes: number;
}

interface GateBDatabase {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
}

interface PageRow {
  id: number;
  pageKey: string;
  status: string;
  updatedAt: Date | string;
  puckData: Prisma.JsonValue | string;
  metadata: Prisma.JsonValue | string;
}

interface RevisionRow {
  id: number;
  documentId: number;
  version: number;
  puckData: Prisma.JsonValue | string;
  metadata: Prisma.JsonValue | string;
}

interface SchemeRow {
  id: number;
  pageKey: string;
  updatedAt: Date | string;
  puckData: Prisma.JsonValue | string;
}

interface TemplateDraftRow {
  databaseId: number;
  templateId: string;
  ownerId: number | null;
  sourceType: string;
  visibility: string;
  sourceReference: string | null;
  publishedVersion: number;
  status: string;
  draftRevision: number | null;
  definition: Prisma.JsonValue | string | null;
  draftChecksum: string | null;
}

interface TemplateVersionRow {
  dynamicTemplateId: number;
  version: number;
  definition: Prisma.JsonValue | string;
  definitionChecksum: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("GATE_B_INVALID_DATABASE_TIMESTAMP");
  return date.toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return String(value);
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function checksumJson(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

export function verifyStoredTemplateDefinitionChecksum(
  definition: TemplateDefinitionV2,
  storedChecksum: string,
) {
  const calculatedChecksum = calculateDynamicTemplateDefinitionChecksum(definition);
  return {
    calculatedChecksum,
    matches: matchesDynamicTemplateDefinitionChecksum(definition, storedChecksum),
  };
}

export function classifyGateBMigrationIntegrity(check: {
  ok: boolean;
  facts?: Record<string, unknown>;
}) {
  if (check.ok) return { baselineCompatible: true, pendingGateCMigrations: [] as string[] };
  const issueCodes = Array.isArray(check.facts?.issueCodes)
    ? check.facts.issueCodes.filter((value): value is string => typeof value === "string")
    : [];
  const affectedMigrations = Array.isArray(check.facts?.affectedMigrations)
    ? check.facts.affectedMigrations.filter((value): value is string => typeof value === "string")
    : [];
  const onlyApprovedPendingMigrations = issueCodes.length === 1
    && issueCodes[0] === "PENDING_MIGRATION"
    && affectedMigrations.length > 0
    && affectedMigrations.every((migration) => GATE_C_CANDIDATE_MIGRATIONS.has(migration));
  return {
    baselineCompatible: onlyApprovedPendingMigrations,
    pendingGateCMigrations: onlyApprovedPendingMigrations ? affectedMigrations : [],
  };
}

export function createGateBReadOnlyConfig(
  environment: NodeJS.ProcessEnv,
): GateBReadOnlyConfig {
  if (environment.TEMPLATE_V2_GATE_B_READ_ONLY_AUTHORIZED !== "1") {
    throw new Error("GATE_B_READ_ONLY_AUTHORIZATION_REQUIRED");
  }
  const environmentId = environment.TEMPLATE_V2_GATE_B_ENVIRONMENT_ID?.trim() ?? "";
  const expectedDatabase = environment.TEMPLATE_V2_GATE_B_EXPECTED_DATABASE?.trim() ?? "";
  const approvalReference = environment.TEMPLATE_V2_GATE_B_APPROVAL_REFERENCE?.trim() ?? "";
  const databaseUrl = environment.DATABASE_URL?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(environmentId)) {
    throw new Error("GATE_B_ENVIRONMENT_ID_REQUIRED");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_$-]{0,63}$/.test(expectedDatabase)) {
    throw new Error("GATE_B_EXPECTED_DATABASE_REQUIRED");
  }
  if (approvalReference.length < 3 || approvalReference.length > 200) {
    throw new Error("GATE_B_APPROVAL_REFERENCE_REQUIRED");
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("GATE_B_DATABASE_URL_INVALID");
  }
  if (parsed.protocol !== "mysql:") throw new Error("GATE_B_DATABASE_MUST_BE_MYSQL");
  const configuredDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (configuredDatabase !== expectedDatabase) {
    throw new Error("GATE_B_DATABASE_NAME_MISMATCH");
  }
  return {
    environmentId,
    expectedDatabase,
    approvalReferenceHash: sha256(approvalReference),
  };
}

export function evaluateReadOnlyGrantStatements(statements: readonly string[]): {
  ok: boolean;
  rejected: string[];
} {
  const rejected: string[] = [];
  for (const statement of statements) {
    const normalized = statement.replace(/\s+/g, " ").trim();
    if (/\bWITH GRANT OPTION\b/i.test(normalized)) {
      rejected.push("GRANT_OPTION");
      continue;
    }
    const match = /^GRANT (.+?) ON .+ TO /i.exec(normalized);
    if (!match) {
      rejected.push("ROLE_OR_UNKNOWN_GRANT");
      continue;
    }
    const privileges = match[1]
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    if (privileges.some((value) => !["USAGE", "SELECT", "SHOW VIEW"].includes(value))) {
      rejected.push("WRITE_OR_ADMIN_PRIVILEGE");
    }
  }
  return { ok: rejected.length === 0, rejected: [...new Set(rejected)].sort() };
}

function collectBlockArrays(puckData: unknown): unknown[][] {
  if (!isRecord(puckData)) return [];
  const arrays: unknown[][] = [];
  if (Array.isArray(puckData.content)) arrays.push(puckData.content);
  if (isRecord(puckData.zones)) {
    for (const blocks of Object.values(puckData.zones)) {
      if (Array.isArray(blocks)) arrays.push(blocks);
    }
  }
  return arrays;
}

export function inventoryTemplateInstances(puckDataInput: unknown): GateBTemplateInventory {
  const puckData = parseJson(puckDataInput);
  const dynamicInstancesByTemplateId: Record<string, number> = {};
  let legacyInstanceCount = 0;
  let dynamicInstanceCount = 0;
  let invalidDynamicInstanceCount = 0;
  for (const block of collectBlockArrays(puckData).flat()) {
    if (!isRecord(block) || typeof block.type !== "string") continue;
    if (LEGACY_TEMPLATE_TYPES.has(block.type)) legacyInstanceCount += 1;
    if (block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE) continue;
    dynamicInstanceCount += 1;
    const props = isRecord(block.props) ? block.props : {};
    const templateId = typeof props.templateId === "string" ? props.templateId.trim() : "";
    const templateVersion = Number(props.templateVersion);
    const instanceId = typeof props.instanceId === "string" ? props.instanceId.trim() : "";
    if (!templateId || !instanceId || !Number.isInteger(templateVersion) || templateVersion <= 0) {
      invalidDynamicInstanceCount += 1;
      continue;
    }
    dynamicInstancesByTemplateId[templateId] = (dynamicInstancesByTemplateId[templateId] ?? 0) + 1;
  }
  return {
    legacyInstanceCount,
    dynamicInstanceCount,
    invalidDynamicInstanceCount,
    dynamicInstancesByTemplateId,
    jsonBytes: Buffer.byteLength(JSON.stringify(puckData ?? null)),
  };
}

function mergeInventories(inventories: GateBTemplateInventory[]): GateBTemplateInventory {
  const result: GateBTemplateInventory = {
    legacyInstanceCount: 0,
    dynamicInstanceCount: 0,
    invalidDynamicInstanceCount: 0,
    dynamicInstancesByTemplateId: {},
    jsonBytes: 0,
  };
  for (const inventory of inventories) {
    result.legacyInstanceCount += inventory.legacyInstanceCount;
    result.dynamicInstanceCount += inventory.dynamicInstanceCount;
    result.invalidDynamicInstanceCount += inventory.invalidDynamicInstanceCount;
    result.jsonBytes += inventory.jsonBytes;
    for (const [templateId, count] of Object.entries(inventory.dynamicInstancesByTemplateId)) {
      result.dynamicInstancesByTemplateId[templateId] =
        (result.dynamicInstancesByTemplateId[templateId] ?? 0) + count;
    }
  }
  result.dynamicInstancesByTemplateId = Object.fromEntries(
    Object.entries(result.dynamicInstancesByTemplateId).sort(([left], [right]) => left.localeCompare(right)),
  );
  return result;
}

function createLegacyImpactState(
  pages: PageRow[],
  revisionsByDocumentId: Map<number, RevisionRow>,
  schemes: SchemeRow[],
) {
  const legacyPages = pages.flatMap((page) => {
    const draftPuckData = parseJson(page.puckData);
    const draftLegacyInstanceCount = inventoryTemplateInstances(draftPuckData).legacyInstanceCount;
    const published = revisionsByDocumentId.get(page.id);
    const publishedPuckData = published ? parseJson(published.puckData) : null;
    const publishedLegacyInstanceCount = published
      ? inventoryTemplateInstances(publishedPuckData).legacyInstanceCount
      : 0;
    if (draftLegacyInstanceCount + publishedLegacyInstanceCount === 0) return [];
    return [{
      documentId: page.id,
      pageKey: page.pageKey,
      draftUpdatedAt: toIso(page.updatedAt),
      draftChecksum: checksumJson(draftPuckData),
      draftLegacyInstanceCount,
      publishedRevisionId: published?.id ?? null,
      publishedRevisionVersion: published?.version ?? null,
      publishedChecksum: published ? checksumJson(publishedPuckData) : null,
      publishedLegacyInstanceCount,
    }];
  });
  const legacySchemes = schemes.flatMap((scheme) => {
    const puckData = parseJson(scheme.puckData);
    const legacyInstanceCount = inventoryTemplateInstances(puckData).legacyInstanceCount;
    if (legacyInstanceCount === 0) return [];
    return [{
      schemeId: scheme.id,
      pageKey: scheme.pageKey,
      updatedAt: toIso(scheme.updatedAt),
      contentChecksum: checksumJson(puckData),
      legacyInstanceCount,
    }];
  });
  return { legacyPages, legacySchemes };
}

function createActivationDryRuns(input: {
  templates: TemplateDraftRow[];
  versions: TemplateVersionRow[];
  pages: PageRow[];
  revisions: RevisionRow[];
  schemes: SchemeRow[];
}) {
  const revisionsByDocumentId = new Map(input.revisions.map((revision) => [revision.documentId, revision]));
  const documents: DynamicTemplateActivationDocumentSnapshot[] = input.pages.map((page) => {
    const revision = revisionsByDocumentId.get(page.id);
    return {
      documentId: page.id,
      pageKey: page.pageKey,
      status: page.status,
      draftUpdatedAt: toIso(page.updatedAt),
      draftPuckData: parseJson(page.puckData),
      draftMetadata: parseJson(page.metadata),
      latestPublishedRevision: revision ? {
        id: revision.id,
        version: revision.version,
        puckData: parseJson(revision.puckData),
        metadata: parseJson(revision.metadata),
      } : null,
    };
  });
  const schemes: DynamicTemplateActivationSchemeSnapshot[] = input.schemes.map((scheme) => ({
    schemeId: scheme.id,
    pageKey: scheme.pageKey,
    updatedAt: toIso(scheme.updatedAt),
    puckData: parseJson(scheme.puckData),
  }));
  const legacyImpactState = createLegacyImpactState(
    input.pages,
    revisionsByDocumentId,
    input.schemes,
  );
  const legacyPageInstanceCount = legacyImpactState.legacyPages.reduce(
    (sum, page) => sum + page.draftLegacyInstanceCount + page.publishedLegacyInstanceCount,
    0,
  );
  const legacySchemeInstanceCount = legacyImpactState.legacySchemes.reduce(
    (sum, scheme) => sum + scheme.legacyInstanceCount,
    0,
  );

  return input.templates.map((template) => {
    const initialBlockers: string[] = [];
    if (template.status !== "ACTIVE") initialBlockers.push("模板已归档，不进入激活候选");
    if (!template.definition || !template.draftRevision || !template.draftChecksum) {
      initialBlockers.push("模板缺少可审计草稿");
    }
    if (legacyPageInstanceCount > 0) {
      initialBlockers.push(
        `现有 ${legacyImpactState.legacyPages.length} 个页面仍包含 ${legacyPageInstanceCount} 个旧模板实例`,
      );
    }
    if (legacySchemeInstanceCount > 0) {
      initialBlockers.push(
        `现有 ${legacyImpactState.legacySchemes.length} 个页面方案仍包含 ${legacySchemeInstanceCount} 个旧模板实例`,
      );
    }
    const draftValidation = validateDynamicTemplateDefinition(parseJson(template.definition));
    if (!draftValidation.valid || !draftValidation.definition) {
      initialBlockers.push("模板草稿定义未通过 V2 校验");
    } else if (template.draftChecksum
      && !verifyStoredTemplateDefinitionChecksum(draftValidation.definition, template.draftChecksum).matches) {
      initialBlockers.push("模板草稿定义与数据库校验和不一致");
    }
    const definitionsByVersion: Record<number, TemplateDefinitionV2> = {};
    const templateVersions = input.versions.filter((version) => version.dynamicTemplateId === template.databaseId);
    for (const version of templateVersions) {
      const validation = validateDynamicTemplateDefinition(parseJson(version.definition));
      if (!validation.valid || !validation.definition) {
        initialBlockers.push(`正式模板 v${version.version} 的定义已损坏`);
      } else if (!verifyStoredTemplateDefinitionChecksum(
        validation.definition,
        version.definitionChecksum,
      ).matches) {
        initialBlockers.push(`正式模板 v${version.version} 的定义与数据库校验和不一致`);
      } else {
        definitionsByVersion[version.version] = validation.definition;
      }
    }
    const current = templateVersions.find((version) => version.version === template.publishedVersion);
    if (current?.definitionChecksum === template.draftChecksum) {
      initialBlockers.push("模板内容与当前正式版本相同");
    }
    if (!draftValidation.definition || !template.draftRevision || !template.draftChecksum) {
      return {
        templateId: template.templateId,
        fromVersion: template.publishedVersion,
        toVersion: template.publishedVersion + 1,
        blockers: [...new Set(initialBlockers)],
        warnings: [],
        affectedDocumentCount: 0,
        affectedDraftInstanceCount: 0,
        affectedPublishedInstanceCount: 0,
        affectedSchemeCount: 0,
        affectedSchemeInstanceCount: 0,
        upgradedJsonBytes: 0,
      };
    }
    const impact = planDynamicTemplateActivation({
      templateId: template.templateId,
      currentPublishedVersion: template.publishedVersion,
      targetVersion: template.publishedVersion + 1,
      expectedDraftRevision: template.draftRevision,
      draftChecksum: template.draftChecksum,
      targetDefinition: draftValidation.definition,
      definitionsByVersion,
      documents,
      schemes,
      initialBlockers,
      additionalImpactState: legacyImpactState,
    });
    const upgradedJsonBytes = impact.documents.reduce((sum, document) => (
      sum
      + Buffer.byteLength(JSON.stringify(document.upgradedDraftPuckData))
      + Buffer.byteLength(JSON.stringify(document.upgradedPublishedPuckData))
    ), 0) + impact.schemes.reduce((sum, scheme) => (
      sum + Buffer.byteLength(JSON.stringify(scheme.upgradedPuckData))
    ), 0);
    return {
      templateId: impact.templateId,
      fromVersion: impact.fromVersion,
      toVersion: impact.toVersion,
      expectedDraftRevision: impact.expectedDraftRevision,
      draftChecksum: impact.draftChecksum,
      plannerImpactHash: impact.impactHash,
      affectedDocumentCount: impact.affectedDocumentCount,
      affectedDraftInstanceCount: impact.affectedDraftInstanceCount,
      affectedPublishedInstanceCount: impact.affectedPublishedInstanceCount,
      preservedDraftDocumentCount: impact.preservedDraftDocumentCount,
      affectedSchemeCount: impact.affectedSchemeCount,
      affectedSchemeInstanceCount: impact.affectedSchemeInstanceCount,
      blockers: impact.blockers,
      warnings: impact.warnings,
      upgradedJsonBytes,
    };
  });
}

function createInitialCutoverDryRun(input: {
  templates: TemplateDraftRow[];
  pages: PageRow[];
  revisions: RevisionRow[];
  schemes: SchemeRow[];
}) {
  const initialBlockers: string[] = [];
  const replacements: InitialTemplateV2CutoverReplacement[] = [];
  for (const template of input.templates) {
    if (!template.sourceReference?.startsWith("legacy_system_")) continue;
    if (
      template.ownerId !== null
      || template.sourceType !== "SYSTEM"
      || template.visibility !== "STAFF"
      || template.status !== "ACTIVE"
    ) {
      initialBlockers.push(
        `${template.sourceReference} 必须是 ownerId=NULL、SYSTEM、STAFF、ACTIVE 的系统 V2 模板`,
      );
      continue;
    }
    if (!template.definition || !template.draftRevision || !template.draftChecksum) {
      initialBlockers.push(`${template.sourceReference} 缺少可审计草稿`);
      continue;
    }
    const validation = validateDynamicTemplateDefinition(parseJson(template.definition));
    if (!validation.valid || !validation.definition) {
      initialBlockers.push(`${template.sourceReference} 的 V2 草稿定义无效`);
      continue;
    }
    if (!verifyStoredTemplateDefinitionChecksum(validation.definition, template.draftChecksum).matches) {
      initialBlockers.push(`${template.sourceReference} 的 V2 草稿定义与数据库校验和不一致`);
      continue;
    }
    replacements.push({
      sourceReference: template.sourceReference,
      templateId: template.templateId,
      targetVersion: template.publishedVersion + 1,
      definitionChecksum: template.draftChecksum,
      definition: validation.definition,
    });
  }
  const revisionsByDocumentId = new Map(input.revisions.map((revision) => [revision.documentId, revision]));
  const documents: DynamicTemplateActivationDocumentSnapshot[] = input.pages.map((page) => {
    const revision = revisionsByDocumentId.get(page.id);
    return {
      documentId: page.id,
      pageKey: page.pageKey,
      status: page.status,
      draftUpdatedAt: toIso(page.updatedAt),
      draftPuckData: parseJson(page.puckData),
      draftMetadata: parseJson(page.metadata),
      latestPublishedRevision: revision ? {
        id: revision.id,
        version: revision.version,
        puckData: parseJson(revision.puckData),
        metadata: parseJson(revision.metadata),
      } : null,
    };
  });
  const schemes: DynamicTemplateActivationSchemeSnapshot[] = input.schemes.map((scheme) => ({
    schemeId: scheme.id,
    pageKey: scheme.pageKey,
    updatedAt: toIso(scheme.updatedAt),
    puckData: parseJson(scheme.puckData),
  }));
  const impact = planInitialTemplateV2Cutover({
    replacements,
    documents,
    schemes,
    initialBlockers,
  });
  return {
    impactHash: impact.impactHash,
    requiredReplacementCount: impact.requiredReplacementCount,
    readyReplacementCount: impact.readyReplacementCount,
    affectedDocumentCount: impact.affectedDocumentCount,
    affectedDraftInstanceCount: impact.affectedDraftInstanceCount,
    affectedPublishedInstanceCount: impact.affectedPublishedInstanceCount,
    preservedDraftDocumentCount: impact.preservedDraftDocumentCount,
    affectedSchemeCount: impact.affectedSchemeCount,
    affectedSchemeInstanceCount: impact.affectedSchemeInstanceCount,
    blockers: impact.blockers,
    warnings: impact.warnings,
    documents: impact.documents.map((document) => ({
      documentId: document.documentId,
      pageKey: document.pageKey,
      hadUnpublishedDraft: document.hadUnpublishedDraft,
      nextDocumentStatus: document.nextDocumentStatus,
      occurrenceCount: document.occurrences.length,
    })),
    schemes: impact.schemes.map((scheme) => ({
      schemeId: scheme.schemeId,
      pageKey: scheme.pageKey,
      occurrenceCount: scheme.occurrences.length,
    })),
  };
}

async function readRows<T>(database: GateBDatabase, tableNames: Set<string>, table: string, query: string) {
  if (!tableNames.has(table)) return [] as T[];
  return database.$queryRawUnsafe<T[]>(query);
}

export async function runTemplateV2GateBReadOnlyAudit(
  database: GateBDatabase,
  config: GateBReadOnlyConfig,
) {
  const identity = await database.$queryRawUnsafe<Array<{ databaseName: string | null }>>(
    "SELECT DATABASE() AS databaseName",
  );
  if (identity[0]?.databaseName !== config.expectedDatabase) {
    throw new Error("GATE_B_CONNECTED_DATABASE_MISMATCH");
  }
  const grantRows = await database.$queryRawUnsafe<Array<Record<string, unknown>>>(
    "SHOW GRANTS FOR CURRENT_USER()",
  );
  const grants = grantRows.flatMap((row) => Object.values(row).filter((value): value is string => typeof value === "string"));
  const grantEvaluation = evaluateReadOnlyGrantStatements(grants);
  if (!grantEvaluation.ok) {
    throw new Error(`GATE_B_DATABASE_ACCOUNT_NOT_READ_ONLY:${grantEvaluation.rejected.join(",")}`);
  }

  const tableRows = await database.$queryRawUnsafe<Array<{ tableName: string }>>(
    "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  const tableNames = new Set(tableRows.map((row) => row.tableName));
  const missingTables = REQUIRED_TABLES.filter((table) => !tableNames.has(table));
  const pendingGateCTables = GATE_C_CANDIDATE_TABLES.filter((table) => !tableNames.has(table));
  const migrationIntegrity = await checkMigrationIntegrity(database);
  const migrationReadiness = classifyGateBMigrationIntegrity(migrationIntegrity);
  const pages = await readRows<PageRow>(database, tableNames, "page_documents", `
    SELECT id, page_key AS pageKey, status, updated_at AS updatedAt, puck_data AS puckData, metadata
      FROM page_documents ORDER BY id
  `);
  const revisions = await readRows<RevisionRow>(database, tableNames, "page_document_revisions", `
    SELECT revision.id, revision.document_id AS documentId, revision.version,
           revision.puck_data AS puckData, revision.metadata
      FROM page_document_revisions revision
      JOIN (
        SELECT document_id, MAX(version) AS version
          FROM page_document_revisions
         WHERE status = 'published'
         GROUP BY document_id
      ) latest
        ON latest.document_id = revision.document_id AND latest.version = revision.version
     WHERE revision.status = 'published'
     ORDER BY revision.document_id
  `);
  const schemes = await readRows<SchemeRow>(database, tableNames, "page_schemes", `
    SELECT id, page_key AS pageKey, updated_at AS updatedAt, puck_data AS puckData
      FROM page_schemes ORDER BY id
  `);
  const templates = tableNames.has("dynamic_templates") && tableNames.has("dynamic_template_drafts")
    ? await database.$queryRawUnsafe<TemplateDraftRow[]>(`
        SELECT template.id AS databaseId, template.template_id AS templateId,
               template.owner_id AS ownerId, template.source_type AS sourceType,
               template.visibility, template.source_reference AS sourceReference,
               template.published_version AS publishedVersion, template.status,
               draft.revision AS draftRevision, draft.definition,
               draft.definition_checksum AS draftChecksum
          FROM dynamic_templates template
          LEFT JOIN dynamic_template_drafts draft ON draft.dynamic_template_id = template.id
         ORDER BY template.id
      `)
    : [];
  const versions = tableNames.has("dynamic_template_versions")
    ? await database.$queryRawUnsafe<TemplateVersionRow[]>(`
        SELECT dynamic_template_id AS dynamicTemplateId, version, definition,
               definition_checksum AS definitionChecksum
          FROM dynamic_template_versions ORDER BY dynamic_template_id, version
      `)
    : [];
  const scalarCount = async (table: string) => {
    if (!tableNames.has(table)) return null;
    const rows = await database.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*) AS count FROM \`${table}\``,
    );
    return Number(rows[0]?.count ?? 0);
  };
  const pageInventory = mergeInventories(pages.map((page) => inventoryTemplateInstances(page.puckData)));
  const revisionInventory = mergeInventories(revisions.map((revision) => inventoryTemplateInstances(revision.puckData)));
  const schemeInventory = mergeInventories(schemes.map((scheme) => inventoryTemplateInstances(scheme.puckData)));
  const activationDryRuns = createActivationDryRuns({ templates, versions, pages, revisions, schemes });
  const initialCutoverDryRun = createInitialCutoverDryRun({ templates, pages, revisions, schemes });
  const blockers = [
    ...(missingTables.length > 0 ? [`缺少 ${missingTables.length} 张 Gate B 必需表`] : []),
    ...(!migrationReadiness.baselineCompatible ? ["migration 历史完整性未通过"] : []),
    ...(pageInventory.invalidDynamicInstanceCount
      + revisionInventory.invalidDynamicInstanceCount
      + schemeInventory.invalidDynamicInstanceCount > 0
      ? ["存在身份或版本无效的 V2 页面实例"]
      : []),
    ...initialCutoverDryRun.blockers,
  ];
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environmentId: config.environmentId,
    databaseName: config.expectedDatabase,
    approvalReferenceHash: config.approvalReferenceHash,
    access: { grantsVerifiedReadOnly: true },
    migrationIntegrity,
    migrationReadiness,
    missingTables,
    pendingGateCTables,
    counts: {
      pageDocuments: pages.length,
      latestPublishedRevisions: revisions.length,
      pageSchemes: schemes.length,
      personalTemplates: await scalarCount("personal_content_templates"),
      dynamicTemplates: templates.length,
      dynamicTemplateVersions: versions.length,
      dynamicTemplateActivations: await scalarCount("dynamic_template_activations"),
    },
    inventories: {
      pageDrafts: pageInventory,
      latestPublishedRevisions: revisionInventory,
      pageSchemes: schemeInventory,
    },
    initialCutoverDryRun,
    activationDryRuns,
    blockers: [...new Set(blockers)],
    readOnlyAuditPassed: blockers.length === 0,
    evidenceBoundary: "只读数据库聚合与内存 dry-run；结果不构成 Gate C 授权，且未执行 migration、写入、激活、部署或生产公开页回读",
  };
}

async function main() {
  const config = createGateBReadOnlyConfig(process.env);
  const database = new PrismaService();
  await database.$connect();
  try {
    const report = await runTemplateV2GateBReadOnlyAudit(database, config);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.readOnlyAuditPassed) process.exitCode = 2;
  } finally {
    await database.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "GATE_B_READ_ONLY_AUDIT_FAILED";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
