import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { Prisma } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { ApiError } from "../../common/errors/api-error";
import { HttpExceptionFilter } from "../../common/filters/http-exception.filter";
import { DynamicTemplatesController } from "./dynamic-templates.controller";
import { DynamicTemplatesService } from "./dynamic-templates.service";
import {
  ArchiveDynamicTemplateDto,
  CreateDynamicTemplateDto,
  PublishDynamicTemplateDto,
  RebuildDynamicTemplateDraftFromPublishedDto,
} from "./dto/dynamic-template.dto";
import { calculateDynamicTemplateDefinitionChecksum } from "./dynamic-template-definition-integrity";
import { definitionFixture } from "./dynamic-template-test-fixture";
import { CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE } from "./generated/contentTemplates.generated";
import { PageModulesModule } from "./page-modules.module";
import { PageModulesService } from "./page-modules.service";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function draftIdentity(resource: {
  draft: { revision: number; definitionChecksum: string } | null;
}) {
  assert.ok(resource.draft);
  return {
    expectedRevision: resource.draft.revision,
    expectedChecksum: resource.draft.definitionChecksum,
  };
}

function filterError(error: unknown): Record<string, any> {
  let body: Record<string, any> | undefined;
  const response = {
    status(status: number) {
      assert.equal(status, HttpStatus.CONFLICT);
      return this;
    },
    json(value: Record<string, any>) {
      body = value;
      return this;
    },
  };
  new HttpExceptionFilter().catch(error, {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: "POST", url: "/api/page-modules/dynamic-templates/test/publish" }),
    }),
  } as any);
  assert.ok(body);
  return body;
}

async function assertApiConflict(
  action: () => Promise<unknown>,
  errorCode: string,
  expectedDetails?: Record<string, string | number | boolean | null>,
) {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.getStatus(), HttpStatus.CONFLICT);
    assert.equal(error.errorCode, errorCode);
    const body = filterError(error);
    assert.equal(body.code, HttpStatus.CONFLICT);
    assert.equal(body.errorCode, errorCode);
    assert.equal(body.path, "/api/page-modules/dynamic-templates/test/publish");
    if (expectedDetails) {
      assert.deepEqual(error.details, expectedDetails);
      assert.deepEqual(body.details, expectedDetails);
    }
    return true;
  });
}

function createStatefulService(mediaAuthorizationResolver?: {
  resolveReferences(references: unknown[], options: unknown): Promise<unknown>;
}) {
  const calls: Array<{ operation: string; args: any }> = [];
  let template: any = null;
  let draft: any = null;
  const versions: any[] = [];
  const operationLogs: any[] = [];
  let pageDocuments: any[] = [];
  let pageSchemes: any[] = [];
  let activationCount = 0;
  let nextTemplateId = 1;
  let nextDraftId = 11;
  let nextVersionId = 21;
  let nextPublishRace: null | {
    stage: "draft" | "version";
    winnerChecksum?: string;
    winnerVersionNote?: string | null;
  } = null;
  let pendingConcurrentWinner: any = null;
  let nextArchiveCreateRace: "winner" | "no-winner" | null = null;
  let pendingArchiveWinner: { template: any; draft: any } | null = null;
  let archiveBeforeNextDraftUpdate = false;
  let pendingConcurrentArchive: any = null;
  let nextDraftRebuildRace: "same" | "different" | "no-winner" | null = null;
  let pendingDraftRebuildWinner: any = null;
  let lineageReferences: Array<{ id: number; sourceReference: string }> = [];
  let nextTransactionConflict: null | {
    error: Prisma.PrismaClientKnownRequestError;
    applyWinner: boolean;
    winnerChecksum?: string;
    winnerVersionNote?: string | null;
  } = null;

  const prismaConflict = (
    code: "P2002" | "P2034",
    target: string[] = ["dynamic_template_id", "version"],
  ) => new Prisma.PrismaClientKnownRequestError(
    "synthetic dynamic template publish conflict",
    {
      code,
      clientVersion: "5.8.0",
      meta: { target },
    },
  );

  const buildConcurrentWinner = (input: any) => ({
    id: nextVersionId++,
    dynamicTemplateId: template.id,
    version: template.publishedVersion + 1,
    schemaVersion: draft.definition.schemaVersion,
    definition: clone(draft.definition),
    definitionChecksum: nextPublishRace?.winnerChecksum ?? draft.definitionChecksum,
    versionNote: nextPublishRace?.winnerVersionNote ?? null,
    publishedById: input.updatedById ?? 17,
    publishedAt: new Date("2026-08-28T12:00:00.000Z"),
  });

  const dynamicTemplateDraft = {
    create: async (args: any) => {
      calls.push({ operation: "draft.create", args: clone(args) });
      if (draft) throw prismaConflict("P2002", ["dynamic_template_id"]);
      const created = {
        id: nextDraftId++,
        createdAt: new Date("2026-09-10T12:00:00.000Z"),
        updatedAt: new Date("2026-09-10T12:00:00.000Z"),
        ...clone(args.data),
      };
      if (nextDraftRebuildRace) {
        if (nextDraftRebuildRace !== "no-winner") {
          pendingDraftRebuildWinner = {
            ...created,
            definitionChecksum: nextDraftRebuildRace === "same"
              ? created.definitionChecksum
              : "f".repeat(64),
          };
        }
        nextDraftRebuildRace = null;
        throw prismaConflict("P2002", ["dynamic_template_id"]);
      }
      draft = created;
      return clone(created);
    },
    findUnique: async (args: any) => {
      calls.push({ operation: "draft.findUnique", args: clone(args) });
      return draft && draft.id === args.where.id ? clone(draft) : null;
    },
    updateMany: async (args: any) => {
      calls.push({ operation: "draft.updateMany", args: clone(args) });
      if (!draft || draft.id !== args.where.id || draft.revision !== args.where.revision) return { count: 0 };
      if (archiveBeforeNextDraftUpdate) {
        archiveBeforeNextDraftUpdate = false;
        pendingConcurrentArchive = {
          ...clone(template),
          status: "ARCHIVED",
          archivedAt: new Date("2026-09-09T12:00:00.000Z"),
        };
        template = clone(pendingConcurrentArchive);
      }
      if (nextPublishRace?.stage === "draft") {
        pendingConcurrentWinner = buildConcurrentWinner(args.data);
        nextPublishRace = null;
        return { count: 0 };
      }
      draft = {
        ...draft,
        ...args.data,
        revision: draft.revision + Number(args.data.revision?.increment ?? 0),
      };
      return { count: 1 };
    },
    update: async (args: any) => {
      calls.push({ operation: "draft.update", args: clone(args) });
      if (!draft || draft.id !== args.where.id) throw new Error("missing draft");
      draft = {
        ...draft,
        ...args.data,
        revision: draft.revision + Number(args.data.revision?.increment ?? 0),
      };
      return clone(draft);
    },
  };
  const dynamicTemplateVersion = {
    count: async (args: any) => {
      calls.push({ operation: "version.count", args: clone(args) });
      return versions.filter((item) => item.dynamicTemplateId === args.where.dynamicTemplateId).length;
    },
    findUnique: async (args: any) => {
      calls.push({ operation: "version.findUnique", args: clone(args) });
      const key = args.where.dynamicTemplateId_version;
      return clone(versions.find((item) => (
        item.dynamicTemplateId === key.dynamicTemplateId && item.version === key.version
      )) ?? null);
    },
    create: async (args: any) => {
      calls.push({ operation: "version.create", args: clone(args) });
      const created = {
        id: nextVersionId++,
        publishedAt: new Date("2026-08-28T12:00:00.000Z"),
        ...clone(args.data),
      };
      if (nextPublishRace?.stage === "version") {
        pendingConcurrentWinner = {
          ...created,
          definitionChecksum: nextPublishRace.winnerChecksum ?? created.definitionChecksum,
          versionNote: nextPublishRace.winnerVersionNote === undefined
            ? created.versionNote
            : nextPublishRace.winnerVersionNote,
        };
        nextPublishRace = null;
        throw prismaConflict("P2002");
      }
      versions.push(created);
      return clone(created);
    },
    findMany: async (args: any) => {
      calls.push({ operation: "version.findMany", args: clone(args) });
      const matchesWhere = (item: any, where: any) => (
        (
          where.dynamicTemplateId === undefined
          || item.dynamicTemplateId === where.dynamicTemplateId
          || (
            Array.isArray(where.dynamicTemplateId?.in)
            && where.dynamicTemplateId.in.includes(item.dynamicTemplateId)
          )
        )
        && (
          where.version === undefined
          || item.version === where.version
          || (where.version.lt !== undefined && item.version < where.version.lt)
        )
      );
      let rows = versions.filter((item) => (
        Array.isArray(args.where.OR)
          ? args.where.OR.some((where: any) => matchesWhere(item, where))
          : matchesWhere(item, args.where)
      )).sort((left, right) => right.version - left.version);
      if (typeof args.take === "number") rows = rows.slice(0, args.take);
      if (args.select) {
        rows = rows.map((item) => Object.fromEntries(
          Object.entries(args.select)
            .filter(([, selected]) => selected)
            .map(([key]) => [key, item[key]]),
        ));
      }
      return clone(rows);
    },
  };
  const matchesTemplateWhere = (candidate: any, where: any): boolean => {
    if (!where) return true;
    if (Array.isArray(where.OR) && !where.OR.some((clause: any) => matchesTemplateWhere(candidate, clause))) {
      return false;
    }
    for (const key of ["id", "templateId", "ownerId", "sourceType", "sourceReference", "status", "visibility"] as const) {
      if (where[key] !== undefined && where[key] !== candidate[key]) return false;
    }
    if (typeof where.publishedVersion === "number" && where.publishedVersion !== candidate.publishedVersion) {
      return false;
    }
    if (where.publishedVersion?.gt !== undefined && candidate.publishedVersion <= where.publishedVersion.gt) {
      return false;
    }
    return true;
  };
  const dynamicTemplate = {
    create: async (args: any) => {
      calls.push({ operation: "template.create", args: clone(args) });
      const draftInput = args.data.draft.create;
      const createdTemplate = {
        id: nextTemplateId++,
        publishedVersion: 0,
        archivedAt: null,
        ...clone(args.data),
      };
      delete createdTemplate.draft;
      const createdDraft = {
        id: nextDraftId++,
        dynamicTemplateId: createdTemplate.id,
        baseVersion: null,
        ...clone(draftInput),
      };
      if (nextArchiveCreateRace) {
        if (nextArchiveCreateRace === "winner") {
          pendingArchiveWinner = {
            template: clone(createdTemplate),
            draft: clone(createdDraft),
          };
        }
        nextArchiveCreateRace = null;
        throw prismaConflict("P2002", ["template_id"]);
      }
      template = createdTemplate;
      draft = createdDraft;
      return clone({ ...template, draft });
    },
    findFirst: async (args: any) => {
      calls.push({ operation: "template.findFirst", args: clone(args) });
      if (!template) return null;
      if (!matchesTemplateWhere(template, args.where)) return null;
      return clone({ ...template, ...(args.include?.draft ? { draft } : {}) });
    },
    findMany: async (args: any) => {
      calls.push({ operation: "template.findMany", args: clone(args) });
      if (Array.isArray(args.where?.sourceReference?.in)) {
        return clone(lineageReferences.filter((item) => (
          args.where.sourceReference.in.includes(item.sourceReference)
          && !args.where.id?.notIn?.includes(item.id)
        )));
      }
      if (!template) return [];
      if (!matchesTemplateWhere(template, args.where)) return [];
      return [clone({
        ...template,
        ...(args.include?.draft ? { draft } : {}),
        ...(args.include?.versions ? { versions: versions.slice().sort((a, b) => b.version - a.version).slice(0, 1) } : {}),
      })];
    },
    updateMany: async (args: any) => {
      calls.push({ operation: "template.updateMany", args: clone(args) });
      if (!template) return { count: 0 };
      if (!matchesTemplateWhere(template, args.where)) return { count: 0 };
      template = { ...template, ...clone(args.data) };
      return { count: 1 };
    },
    update: async (args: any) => {
      calls.push({ operation: "template.update", args: clone(args) });
      if (!template || template.id !== args.where.id) throw new Error("missing template");
      template = { ...template, ...clone(args.data) };
      return clone(template);
    },
    findUnique: async (args: any) => {
      calls.push({ operation: "template.findUnique", args: clone(args) });
      if (!template || template.id !== args.where.id) return null;
      return clone({ ...template, ...(args.include?.draft ? { draft } : {}) });
    },
    deleteMany: async (args: any) => {
      calls.push({ operation: "template.deleteMany", args: clone(args) });
      if (!template || !matchesTemplateWhere(template, args.where)) return { count: 0 };
      template = null;
      draft = null;
      return { count: 1 };
    },
  };
  const prisma: any = {
    dynamicTemplate,
    dynamicTemplateDraft,
    dynamicTemplateVersion,
    dynamicTemplateActivation: {
      count: async (args: any) => {
        calls.push({ operation: "activation.count", args: clone(args) });
        return activationCount;
      },
      findMany: async (args: any) => {
        calls.push({ operation: "activation.findMany", args: clone(args) });
        if (
          activationCount <= 0
          || !template
          || !args.where.dynamicTemplateId.in.includes(template.id)
        ) return [];
        return [{ dynamicTemplateId: template.id }];
      },
    },
    pageDocument: {
      findMany: async (args: any) => {
        calls.push({ operation: "pageDocument.findMany", args: clone(args) });
        return clone(pageDocuments);
      },
    },
    pageScheme: {
      findMany: async (args: any) => {
        calls.push({ operation: "pageScheme.findMany", args: clone(args) });
        return clone(pageSchemes);
      },
    },
    operationLog: {
      create: async (args: any) => {
        calls.push({ operation: "operationLog.create", args: clone(args) });
        operationLogs.push(clone(args.data));
        return { id: calls.length, ...clone(args.data) };
      },
    },
  };
  prisma.$transaction = async (callback: (tx: any) => Promise<unknown>) => {
    calls.push({ operation: "transaction.begin", args: {} });
    const snapshot = {
      template: clone(template),
      draft: clone(draft),
      versions: clone(versions),
      operationLogs: clone(operationLogs),
    };
    try {
      const result = await callback(prisma);
      if (nextTransactionConflict) {
        const conflict = nextTransactionConflict;
        nextTransactionConflict = null;
        if (conflict.applyWinner) {
          const attempted = versions.at(-1);
          if (!attempted) throw new Error("missing attempted publish version");
          pendingConcurrentWinner = {
            ...clone(attempted),
            definitionChecksum: conflict.winnerChecksum ?? attempted.definitionChecksum,
            versionNote: conflict.winnerVersionNote === undefined
              ? attempted.versionNote
              : conflict.winnerVersionNote,
          };
        }
        throw conflict.error;
      }
      calls.push({ operation: "transaction.commit", args: {} });
      return result;
    } catch (error) {
      calls.push({ operation: "transaction.rollback", args: {} });
      template = snapshot.template;
      draft = snapshot.draft;
      versions.splice(0, versions.length, ...snapshot.versions);
      operationLogs.splice(0, operationLogs.length, ...snapshot.operationLogs);
      if (pendingConcurrentWinner) {
        const winner = pendingConcurrentWinner;
        pendingConcurrentWinner = null;
        template = {
          ...template,
          publishedVersion: winner.version,
          visibility: "STAFF",
        };
        draft = {
          ...draft,
          baseVersion: winner.version,
          revision: draft.revision + 1,
          definitionChecksum: winner.definitionChecksum,
          versionNote: null,
          updatedById: winner.publishedById,
        };
        versions.push(clone(winner));
        operationLogs.push({ action: "TEMPLATE_VERSION_PUBLISHED", source: "concurrent-winner" });
        calls.push({
          operation: "operationLog.create",
          args: { data: { action: "TEMPLATE_VERSION_PUBLISHED", source: "concurrent-winner" } },
        });
      }
      if (pendingArchiveWinner) {
        template = clone(pendingArchiveWinner.template);
        draft = clone(pendingArchiveWinner.draft);
        pendingArchiveWinner = null;
      }
      if (pendingConcurrentArchive) {
        template = clone(pendingConcurrentArchive);
        pendingConcurrentArchive = null;
      }
      if (pendingDraftRebuildWinner) {
        draft = clone(pendingDraftRebuildWinner);
        pendingDraftRebuildWinner = null;
      }
      throw error;
    }
  };
  return {
    service: new DynamicTemplatesService(
      prisma as unknown as PrismaService,
      mediaAuthorizationResolver as never,
    ),
    calls,
    setPageDocuments: (documents: any[]) => {
      pageDocuments = clone(documents);
    },
    setPageSchemes: (schemes: any[]) => {
      pageSchemes = clone(schemes);
    },
    setActivationCount: (count: number) => {
      activationCount = count;
    },
    setTemplateIdentity: (identity: { ownerId: number | null; sourceType: "SYSTEM" | "CUSTOM" }) => {
      if (!template) throw new Error("template not created");
      template = { ...template, ...identity };
    },
    setTemplateStatus: (status: "ACTIVE" | "ARCHIVED") => {
      if (!template) throw new Error("template not created");
      template = { ...template, status };
    },
    corruptDraftChecksum: () => {
      if (!draft) throw new Error("draft not created");
      draft.definitionChecksum = "0".repeat(64);
    },
    corruptVersionChecksum: (version: number) => {
      const target = versions.find((item) => item.version === version);
      if (!target) throw new Error("version not created");
      target.definitionChecksum = "f".repeat(64);
    },
    corruptVersionDefinition: (version: number) => {
      const target = versions.find((item) => item.version === version);
      if (!target) throw new Error("version not created");
      target.definition = {};
    },
    removeVersion: (version: number) => {
      const index = versions.findIndex((item) => item.version === version);
      if (index < 0) throw new Error("version not created");
      versions.splice(index, 1);
    },
    setDraftDefinition: (definition: unknown) => {
      if (!draft) throw new Error("draft not created");
      draft.definition = clone(definition);
      draft.definitionChecksum = calculateDynamicTemplateDefinitionChecksum(definition as any);
    },
    simulateConcurrentPublish: (
      stage: "draft" | "version",
      winnerChecksum?: string,
      winnerVersionNote?: string | null,
    ) => {
      nextPublishRace = { stage, winnerChecksum, winnerVersionNote };
    },
    simulateP2034: (
      applyWinner: boolean,
      winnerChecksum?: string,
      winnerVersionNote?: string | null,
    ) => {
      nextTransactionConflict = {
        error: prismaConflict("P2034"),
        applyWinner,
        winnerChecksum,
        winnerVersionNote,
      };
    },
    simulateTransactionPrismaError: (
      code: "P2002" | "P2034",
      applyWinner: boolean,
      winnerChecksum?: string,
      target?: string[],
      winnerVersionNote?: string | null,
    ) => {
      const error = prismaConflict(code, target);
      nextTransactionConflict = { error, applyWinner, winnerChecksum, winnerVersionNote };
      return error;
    },
    simulateConcurrentArchive: (applyWinner: boolean) => {
      nextArchiveCreateRace = applyWinner ? "winner" : "no-winner";
    },
    simulateArchiveBeforeNextDraftUpdate: () => {
      archiveBeforeNextDraftUpdate = true;
    },
    simulateDraftRebuildRace: (outcome: "same" | "different" | "no-winner") => {
      nextDraftRebuildRace = outcome;
    },
    setLineageReferences: (references: Array<{ id: number; sourceReference: string }>) => {
      lineageReferences = clone(references);
    },
    insertOrphanVersion: (
      definitionChecksum?: string,
      version?: number,
    ) => {
      if (!template || !draft) throw new Error("template not created");
      const orphanVersion = version ?? template.publishedVersion + 1;
      versions.push({
        id: nextVersionId++,
        dynamicTemplateId: template.id,
        version: orphanVersion,
        schemaVersion: draft.definition.schemaVersion,
        definition: clone(draft.definition),
        definitionChecksum: definitionChecksum ?? draft.definitionChecksum,
        versionNote: null,
        publishedById: 17,
        publishedAt: new Date("2026-08-28T12:00:00.000Z"),
      });
    },
    removeDraft: () => {
      draft = null;
    },
    getState: () => ({
      template: clone(template),
      draft: clone(draft),
      versions: clone(versions),
      operationLogs: clone(operationLogs),
    }),
  };
}

function catalogTemplate(id: number, publishedVersion: number, definition: any) {
  return {
    id,
    templateId: definition.templateId,
    name: definition.name,
    category: definition.metadata.category,
    purpose: definition.metadata.purpose,
    layoutType: definition.metadata.layoutType,
    description: definition.description ?? null,
    slotSummary: definition.metadata.slotSummary,
    recommendedFor: clone(definition.metadata.recommendedFor),
    tags: clone(definition.metadata.tags),
    sourceReference: null,
    status: "ACTIVE",
    visibility: "STAFF",
    publishedVersion,
  };
}

function catalogVersion(
  id: number,
  dynamicTemplateId: number,
  version: number,
  definition: any,
) {
  return {
    id,
    dynamicTemplateId,
    version,
    schemaVersion: definition.schemaVersion,
    definition: clone(definition),
    definitionChecksum: calculateDynamicTemplateDefinitionChecksum(definition),
    versionNote: null,
    publishedById: 17,
    publishedAt: new Date("2026-09-08T12:00:00.000Z"),
  };
}

function createPublishedCatalogService(templates: any[], versions: any[]) {
  const calls: Array<{ operation: string; args: any }> = [];
  const prisma: any = {
    dynamicTemplate: {
      findMany: async (args: any) => {
        calls.push({ operation: "template.findMany", args: clone(args) });
        return clone(templates);
      },
    },
    dynamicTemplateVersion: {
      findMany: async (args: any) => {
        calls.push({ operation: "version.findMany", args: clone(args) });
        return clone(versions);
      },
    },
  };
  return {
    service: new DynamicTemplatesService(prisma as unknown as PrismaService),
    calls,
  };
}

async function createPublishedTemplateWithoutDraft(
  harness: ReturnType<typeof createStatefulService>,
  ownerId = 17,
) {
  const definition = definitionFixture();
  const created = await harness.service.create(ownerId, { definition });
  assert.ok(created.draft);
  const published = await harness.service.publish(ownerId, definition.templateId, {
    expectedRevision: created.draft.revision,
    expectedChecksum: created.draft.definitionChecksum,
    targetVersion: 1,
  });
  harness.removeDraft();
  return {
    definition,
    expectedChecksum: published.published.definitionChecksum,
    expectedVersion: published.published.version,
  };
}

test("发布 DTO 保持 legacy 可用，并要求严格发布身份成对且格式有效", async () => {
  const checksum = "a".repeat(64);
  assert.equal((await validate(plainToInstance(PublishDynamicTemplateDto, {
    expectedRevision: 1,
  }))).length, 0);
  assert.equal((await validate(plainToInstance(PublishDynamicTemplateDto, {
    expectedRevision: 1,
    expectedChecksum: checksum,
    targetVersion: 1,
  }))).length, 0);

  const checksumOnly = await validate(plainToInstance(PublishDynamicTemplateDto, {
    expectedRevision: 1,
    expectedChecksum: checksum,
  }));
  assert.deepEqual(checksumOnly.map((error) => error.property), ["targetVersion"]);

  const versionOnly = await validate(plainToInstance(PublishDynamicTemplateDto, {
    expectedRevision: 1,
    targetVersion: 1,
  }));
  assert.deepEqual(versionOnly.map((error) => error.property), ["expectedChecksum"]);

  const invalid = await validate(plainToInstance(PublishDynamicTemplateDto, {
    expectedRevision: 1,
    expectedChecksum: "A".repeat(64),
    targetVersion: 0,
  }));
  assert.deepEqual(
    invalid.map((error) => error.property).sort(),
    ["expectedChecksum", "targetVersion"],
  );
});

test("母模板发布对无有效集中授权的受管素材失败关闭且回滚事务", async () => {
  let resolverMode = "";
  const harness = createStatefulService({
    async resolveReferences(references: unknown[], options: unknown) {
      resolverMode = (options as { mode: string }).mode;
      const reference = references[0] as { url?: string; path?: string } | undefined;
      return {
        mode: resolverMode,
        eligible: false,
        issues: [{
          url: reference?.url ?? "",
          path: reference?.path,
          code: "AUTHORIZATION_MISSING",
          severity: "ERROR",
          message: "素材缺少集中授权记录",
        }],
        items: [],
      };
    },
  });
  const definition = definitionFixture();
  definition.schemaVersion = 3;
  definition.nodes.node_root.responsive.desktop.backgroundImage =
    "/uploads/page-assets/unapproved-template.jpg";
  const created = await harness.service.create(17, { definition });
  assert.ok(created.draft);

  await assert.rejects(
    () => harness.service.publish(17, definition.templateId, {
      expectedRevision: created.draft!.revision,
    }),
    (error: unknown) => error instanceof BadRequestException
      && JSON.stringify(error.getResponse()).includes("DYNAMIC_TEMPLATE_MEDIA_INELIGIBLE"),
  );
  assert.equal(resolverMode, "ENFORCE");
  assert.equal(harness.getState().versions.length, 0);
  assert.equal(harness.getState().draft?.revision, created.draft.revision);
});

test("归档 DTO 强制绑定草稿身份且生产端不再提供另存 DTO", async () => {
  const checksum = "a".repeat(64);
  const emptyArchive = await validate(plainToInstance(ArchiveDynamicTemplateDto, {}));
  assert.deepEqual(
    emptyArchive.map((error) => error.property).sort(),
    ["expectedChecksum", "expectedRevision"],
  );
  assert.deepEqual(await validate(plainToInstance(ArchiveDynamicTemplateDto, {
    expectedRevision: 1,
    expectedChecksum: checksum,
  })), []);
  assert.equal((DynamicTemplatesService.prototype as any).saveAs, undefined);
});

test("从正式版本重建草稿 DTO 强制绑定精确 version 与 checksum", async () => {
  const checksum = "a".repeat(64);
  assert.deepEqual(await validate(plainToInstance(
    RebuildDynamicTemplateDraftFromPublishedDto,
    { expectedVersion: 3, expectedChecksum: checksum },
  )), []);
  const missing = await validate(plainToInstance(
    RebuildDynamicTemplateDraftFromPublishedDto,
    {},
  ));
  assert.deepEqual(
    missing.map((error) => error.property).sort(),
    ["expectedChecksum", "expectedVersion"],
  );
  const invalid = await validate(plainToInstance(
    RebuildDynamicTemplateDraftFromPublishedDto,
    { expectedVersion: 0, expectedChecksum: "A".repeat(64) },
  ));
  assert.deepEqual(
    invalid.map((error) => error.property).sort(),
    ["expectedChecksum", "expectedVersion"],
  );
});

test("缺失草稿只能从当前精确正式版本重建 revision 1，且审计日志不写定义或 checksum", async () => {
  const harness = createStatefulService();
  const identity = await createPublishedTemplateWithoutDraft(harness);

  const rebuilt = await harness.service.rebuildDraftFromPublished(
    17,
    identity.definition.templateId,
    identity,
  );

  assert.ok(rebuilt.draft);
  assert.equal(rebuilt.draft.baseVersion, 1);
  assert.equal(rebuilt.draft.revision, 1);
  assert.equal(rebuilt.draft.definitionChecksum, identity.expectedChecksum);
  assert.deepEqual(rebuilt.draft.definition, identity.definition);
  const state = harness.getState();
  assert.equal(state.operationLogs.length, 2);
  const rebuildLog = state.operationLogs.at(-1);
  assert.equal(rebuildLog.action, "TEMPLATE_DRAFT_REBUILT_FROM_PUBLISHED");
  const detail = JSON.parse(rebuildLog.detail);
  assert.deepEqual(
    {
      event: detail.event,
      templateId: detail.templateId,
      fromVersion: detail.fromVersion,
      toRevision: detail.toRevision,
      result: detail.result,
    },
    {
      event: "TEMPLATE_DRAFT_REBUILT_FROM_PUBLISHED",
      templateId: identity.definition.templateId,
      fromVersion: 1,
      toRevision: 1,
      result: "succeeded",
    },
  );
  assert.equal(rebuildLog.detail.includes(identity.expectedChecksum), false);
  assert.equal(rebuildLog.detail.includes("definition"), false);
});

test("SYSTEM 历史行不再进入统一可编辑范围", async () => {
  const harness = createStatefulService();
  const definition = definitionFixture();
  const created = await harness.service.create(17, { definition });
  const createdDraft = created.draft;
  assert.ok(createdDraft);
  harness.setTemplateIdentity({ ownerId: null, sourceType: "SYSTEM" });
  await assert.rejects(
    () => harness.service.publish(99, definition.templateId, {
      expectedRevision: createdDraft.revision,
      expectedChecksum: createdDraft.definitionChecksum,
      targetVersion: 1,
    }),
    NotFoundException,
  );
  assert.deepEqual(await harness.service.listMine(99), []);
});

test("重建草稿拒绝已有草稿、过期版本、错误 checksum 与损坏的正式定义", async () => {
  const existingDraft = createStatefulService();
  const definition = definitionFixture();
  const created = await existingDraft.service.create(17, { definition });
  assert.ok(created.draft);
  const published = await existingDraft.service.publish(17, definition.templateId, {
    expectedRevision: created.draft.revision,
    expectedChecksum: created.draft.definitionChecksum,
    targetVersion: 1,
  });
  await assertApiConflict(
    () => existingDraft.service.rebuildDraftFromPublished(17, definition.templateId, {
      expectedVersion: 1,
      expectedChecksum: published.published.definitionChecksum,
    }),
    "DYNAMIC_TEMPLATE_DRAFT_ALREADY_EXISTS",
    { expectedVersion: 1 },
  );

  const staleVersion = createStatefulService();
  const staleIdentity = await createPublishedTemplateWithoutDraft(staleVersion);
  await assertApiConflict(
    () => staleVersion.service.rebuildDraftFromPublished(17, staleIdentity.definition.templateId, {
      ...staleIdentity,
      expectedVersion: 2,
    }),
    "DYNAMIC_TEMPLATE_DRAFT_REBUILD_VERSION_CONFLICT",
    { expectedVersion: 2, currentVersion: 1 },
  );

  const wrongChecksum = createStatefulService();
  const checksumIdentity = await createPublishedTemplateWithoutDraft(wrongChecksum);
  await assertApiConflict(
    () => wrongChecksum.service.rebuildDraftFromPublished(17, checksumIdentity.definition.templateId, {
      ...checksumIdentity,
      expectedChecksum: "e".repeat(64),
    }),
    "DYNAMIC_TEMPLATE_DRAFT_REBUILD_CHECKSUM_CONFLICT",
    { expectedVersion: 1 },
  );

  const corruptVersion = createStatefulService();
  const corruptIdentity = await createPublishedTemplateWithoutDraft(corruptVersion);
  corruptVersion.corruptVersionDefinition(1);
  await assertApiConflict(
    () => corruptVersion.service.rebuildDraftFromPublished(17, corruptIdentity.definition.templateId, corruptIdentity),
    "DYNAMIC_TEMPLATE_VERSION_INTEGRITY_FAILED",
    { expectedVersion: 1 },
  );
});

test("重建草稿在事务内限定 ACTIVE 与可编辑 owner 范围，且拒绝缺失的指针版本", async () => {
  const wrongOwner = createStatefulService();
  const ownerIdentity = await createPublishedTemplateWithoutDraft(wrongOwner);
  await assert.rejects(
    wrongOwner.service.rebuildDraftFromPublished(18, ownerIdentity.definition.templateId, ownerIdentity),
    NotFoundException,
  );
  assert.equal(wrongOwner.getState().draft, null);

  const archived = createStatefulService();
  const archivedIdentity = await createPublishedTemplateWithoutDraft(archived);
  archived.setTemplateStatus("ARCHIVED");
  await assert.rejects(
    archived.service.rebuildDraftFromPublished(17, archivedIdentity.definition.templateId, archivedIdentity),
    NotFoundException,
  );
  assert.equal(archived.getState().draft, null);

  const missingVersion = createStatefulService();
  const missingIdentity = await createPublishedTemplateWithoutDraft(missingVersion);
  missingVersion.removeVersion(1);
  await assertApiConflict(
    () => missingVersion.service.rebuildDraftFromPublished(
      17,
      missingIdentity.definition.templateId,
      missingIdentity,
    ),
    "DYNAMIC_TEMPLATE_PUBLISHED_VERSION_MISSING",
    { expectedVersion: 1 },
  );
  assert.equal(missingVersion.getState().draft, null);
});

test("并发重建不覆盖赢家草稿：同一正式身份回读赢家，不同身份明确 409", async () => {
  const same = createStatefulService();
  const sameIdentity = await createPublishedTemplateWithoutDraft(same);
  same.simulateDraftRebuildRace("same");
  const winner = await same.service.rebuildDraftFromPublished(
    17,
    sameIdentity.definition.templateId,
    sameIdentity,
  );
  assert.ok(winner.draft);
  assert.equal(winner.draft.revision, 1);
  assert.equal(winner.draft.definitionChecksum, sameIdentity.expectedChecksum);
  assert.equal(
    same.calls.filter((call) => call.operation === "draft.create").length,
    1,
  );

  const different = createStatefulService();
  const differentIdentity = await createPublishedTemplateWithoutDraft(different);
  different.simulateDraftRebuildRace("different");
  await assertApiConflict(
    () => different.service.rebuildDraftFromPublished(
      17,
      differentIdentity.definition.templateId,
      differentIdentity,
    ),
    "DYNAMIC_TEMPLATE_DRAFT_REBUILD_CONCURRENT_CONFLICT",
    { expectedVersion: 1 },
  );
  assert.equal(different.getState().draft.definitionChecksum, "f".repeat(64));
  assert.equal(
    different.calls.filter((call) => call.operation === "draft.create").length,
    1,
  );
});

test("正式版本向 EDITOR 开放，设计操作只允许超级管理员且旧发布写路径不能跨模块绕过", () => {
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, DynamicTemplatesController),
    ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  );
  const prototype = DynamicTemplatesController.prototype;
  assert.equal(Reflect.getMetadata(ROLES_KEY, prototype.listCatalog), undefined);
  assert.equal(Reflect.getMetadata(ROLES_KEY, prototype.listPublished), undefined);
  assert.equal(Reflect.getMetadata(ROLES_KEY, prototype.getPublishedVersion), undefined);
  for (const method of [
    prototype.listMine,
    prototype.create,
    prototype.getDraft,
    prototype.updateDraft,
    prototype.publish,
    prototype.listVersions,
    prototype.archive,
    prototype.restore,
    prototype.deleteDraft,
  ]) {
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, method), ["SUPER_ADMIN"]);
  }
  assert.equal((prototype as any).previewActivationImpact, undefined);
  assert.equal((prototype as any).activate, undefined);
  assert.equal((prototype as any).saveAs, undefined);
  assert.equal((DynamicTemplatesService.prototype as any).previewActivationImpact, undefined);
  assert.equal((DynamicTemplatesService.prototype as any).activate, undefined);
  const publishCalls: unknown[] = [];
  const controller = new DynamicTemplatesController({
    publish: async (...args: unknown[]) => {
      publishCalls.push(args);
      return { templateId: "tpl_publish", version: 2 };
    },
  } as unknown as DynamicTemplatesService);
  void controller.publish("tpl_publish", { expectedRevision: 3 }, { user: { id: 17 } } as any);
  assert.deepEqual(publishCalls, [[17, "tpl_publish", { expectedRevision: 3 }]]);
  assert.deepEqual(
    Reflect.getMetadata(MODULE_METADATA.EXPORTS, PageModulesModule),
    [PageModulesService],
  );
});

test("统一母模板目录只返回 Repository 正式版本与可编辑草稿", async () => {
  const listMineCalls: number[] = [];
  const controller = new DynamicTemplatesController({
    listPublished: async () => [{ templateId: "tpl_published" }],
    listMine: async (ownerId: number) => {
      listMineCalls.push(ownerId);
      return [{ templateId: "tpl_editable" }];
    },
  } as unknown as DynamicTemplatesService);

  const superAdminCatalog = await controller.listCatalog({
    user: { id: 17, role: "SUPER_ADMIN" },
  } as any);
  assert.deepEqual(
    superAdminCatalog.items.map((item) => item.kind),
    ["published", "editable"],
  );
  assert.deepEqual(listMineCalls, [17]);

  const adminCatalog = await controller.listCatalog({
    user: { id: 23, role: "ADMIN" },
  } as any);
  assert.deepEqual(
    adminCatalog.items.map((item) => item.kind),
    ["published"],
  );
  assert.deepEqual(listMineCalls, [17]);
});

test("创建母模板只写当前所有者私有草稿并保存服务端校验摘要", async () => {
  const { service, calls } = createStatefulService();
  const definition = definitionFixture();
  const created = await service.create(17, {
    definition,
    versionNote: " 首个结构草稿 ",
  });
  assert.equal(created.ownerId, 17);
  assert.equal(created.visibility, "PRIVATE");
  assert.equal(created.status, "ACTIVE");
  assert.equal(created.publishedVersion, 0);
  assert.ok(created.draft);
  assert.equal(created.draft.revision, 1);
  assert.equal(created.draft.versionNote, "首个结构草稿");
  assert.match(created.draft.definitionChecksum, /^[a-f0-9]{64}$/);
  const createCall = calls.find((call) => call.operation === "template.create");
  assert.equal(createCall?.args.data.ownerId, 17);
  assert.equal(createCall?.args.data.sourceType, "CUSTOM");
});

test("新建模板忽略并且不持久化任何来源等级字段", async () => {
  for (const sourceReference of ["legacy_system_hero", "legacy_personal_42"]) {
    const harness = createStatefulService();
    const created = await harness.service.create(17, {
      definition: definitionFixture(),
      sourceReference,
    } as any);
    assert.equal(created.sourceReference ?? null, null);
    const createCall = harness.calls.find((call) => call.operation === "template.create");
    assert.equal(
      Object.prototype.hasOwnProperty.call(createCall?.args.data ?? {}, "sourceReference"),
      false,
    );
  }
});

test("统一目录与写生命周期只接受当前账号的 CUSTOM 模板", async () => {
  const systemHarness = createStatefulService();
  const definition = definitionFixture();
  await systemHarness.service.create(17, { definition });
  systemHarness.setTemplateIdentity({ ownerId: null, sourceType: "SYSTEM" });

  const listed = await systemHarness.service.listMine(99);
  assert.equal(listed.length, 0);
  await assert.rejects(
    () => systemHarness.service.getDraft(99, definition.templateId),
    NotFoundException,
  );

  const customHarness = createStatefulService();
  await customHarness.service.create(17, { definition: definitionFixture() });
  assert.equal((await customHarness.service.listMine(99)).length, 0);
  await assert.rejects(
    () => customHarness.service.getDraft(99, definition.templateId),
    NotFoundException,
  );
});

test("可信复制只允许同一用户精确来源快照换身份，保留旧 schema 与历史默认值", async () => {
  const harness = createStatefulService();
  const source = definitionFixture();
  await harness.service.create(17, { definition: source });
  source.defaultContent.slot_heading = "历史文案";
  source.previewContent = { slot_heading: "历史试排" };
  source.slots.slot_heading.emptyPolicy = "use-default";
  source.nodes.node_container.responsive.desktop.padding = { top: { value: 40, unit: "px" }, right: { value: 40, unit: "px" }, bottom: { value: 40, unit: "px" }, left: { value: 40, unit: "px" } };
  harness.setDraftDefinition(source);
  const sourceState = harness.getState();
  const copySource = { templateId: source.templateId, revision: sourceState.draft.revision, definitionChecksum: sourceState.draft.definitionChecksum };
  const copied = { ...structuredClone(source), templateId: "tpl_exact_copy", name: "历史模板副本" };
  const callsBefore = harness.calls.length;
  const created = await harness.service.create(17, { definition: copied, copySource });
  assert.deepEqual(created.draft?.definition, copied);
  assert.equal((created.draft?.definition as any).schemaVersion, 1);
  assert.equal((created.draft?.definition as any).nodes.node_container.responsive.mobile.padding, undefined);
  const newCalls = harness.calls.slice(callsBefore);
  assert.ok(newCalls.some((call) => call.operation === "template.findFirst"));
  assert.ok(!newCalls.some((call) => call.operation.includes("update") || call.operation === "version.create"));
});

test("可信复制拒绝过期身份、损坏校验、跨用户及内容篡改，失败不创建模板", async () => {
  for (const scenario of ["revision", "checksum", "integrity", "owner", "content", "sameId", "unknown", "archived", "missing"]) {
    const harness = createStatefulService();
    const source = definitionFixture();
    await harness.service.create(17, { definition: source });
    source.defaultContent.slot_heading = "历史文案";
    harness.setDraftDefinition(source);
    const state = harness.getState();
    const copySource: any = { templateId: source.templateId, revision: state.draft.revision, definitionChecksum: state.draft.definitionChecksum };
    const copied = { ...structuredClone(source), templateId: "tpl_exact_copy", name: "副本" };
    if (scenario === "revision") copySource.revision += 1;
    if (scenario === "checksum") copySource.definitionChecksum = "a".repeat(64);
    if (scenario === "integrity") { harness.corruptDraftChecksum(); copySource.definitionChecksum = "0".repeat(64); }
    if (scenario === "content") copied.defaultContent.slot_heading = "注入新内容";
    if (scenario === "sameId") copied.templateId = source.templateId;
    if (scenario === "unknown") copySource.extra = true;
    if (scenario === "archived") harness.setTemplateStatus("ARCHIVED");
    if (scenario === "missing") harness.removeDraft();
    const before = harness.calls.length;
    await assert.rejects(() => harness.service.create(scenario === "owner" ? 99 : 17, { definition: copied, copySource }));
    assert.ok(!harness.calls.slice(before).some((call) => call.operation === "template.create"));
  }
});

test("复制来源 DTO 校验嵌套身份和未知属性", async () => {
  const valid = plainToInstance(CreateDynamicTemplateDto, { definition: {}, copySource: { templateId: "tpl_source", revision: 1, definitionChecksum: "a".repeat(64) } });
  assert.equal((await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).length, 0);
  for (const copySource of [{ templateId: "tpl_source", revision: 0, definitionChecksum: "a".repeat(64) }, { templateId: "tpl_source", revision: 1, definitionChecksum: "a".repeat(64), extra: true }]) {
    assert.ok((await validate(plainToInstance(CreateDynamicTemplateDto, { definition: {}, copySource }), { whitelist: true, forbidNonWhitelisted: true })).length > 0);
  }
});

test("schema3 默认内容可创建、修改、重新打开并发布，旧版本保持不变", async () => {
  const { service } = createStatefulService();
  const definition = definitionFixture();
  await service.create(17, { definition });
  const first = await service.publish(17, definition.templateId, { expectedRevision: 1 });
  const current = await service.getDraft(17, definition.templateId);
  assert.ok(current.draft);
  const upgraded = structuredClone(definition);
  upgraded.schemaVersion = 3;
  upgraded.defaultContent.slot_heading = "模板默认文案";
  upgraded.slots.slot_heading.emptyPolicy = "use-default";
  const updated = await service.updateDraft(17, definition.templateId, { expectedRevision: current.draft.revision, definition: upgraded });
  const reopened = await service.getDraft(17, definition.templateId);
  assert.deepEqual(reopened.draft?.definition, upgraded);
  assert.ok(updated.draft);
  const second = await service.publish(17, definition.templateId, { expectedRevision: updated.draft.revision });
  assert.equal(second.version, first.version + 1);
  assert.deepEqual((first.published.definition as any).defaultContent, {});
  const fresh = createStatefulService();
  const created = await fresh.service.create(17, { definition: upgraded });
  assert.deepEqual(created.draft?.definition, upgraded);
  const changed = structuredClone(upgraded); changed.defaultContent.slot_heading = "修改后的默认文案";
  await fresh.service.updateDraft(17, definition.templateId, { expectedRevision: 1, definition: changed });
  assert.deepEqual((await fresh.service.getDraft(17, definition.templateId)).draft?.definition, changed);
});

test("草稿更新绑定所有者、锁定 templateId 并使用乐观 revision", async () => {
  const { service, getState } = createStatefulService();
  const definition = definitionFixture();
  await service.create(17, { definition });
  const changed = definitionFixture();
  changed.name = "服务端母模板校验｜调整版";
  const updated = await service.updateDraft(17, definition.templateId, {
    expectedRevision: 1,
    definition: changed,
    versionNote: "调整标题",
  });
  assert.equal(updated?.draft?.revision, 2);
  assert.equal(getState().template.name, changed.name);
  await assert.rejects(
    () => service.updateDraft(17, definition.templateId, {
      expectedRevision: 1,
      definition: changed,
    }),
    ConflictException,
  );

  const foreignIdentity = definitionFixture();
  foreignIdentity.templateId = "tpl_other_identity";
  await assert.rejects(
    () => service.updateDraft(17, definition.templateId, {
      expectedRevision: 2,
      definition: foreignIdentity,
    }),
    BadRequestException,
  );
  await assert.rejects(() => service.getDraft(99, definition.templateId), NotFoundException);
});

test("归档已提交后旧草稿保存必须整体回滚且不得改写 ARCHIVED 模板", async () => {
  const harness = createStatefulService();
  const definition = definitionFixture();
  const created = await harness.service.create(17, { definition });
  const createdDraft = created.draft;
  assert.ok(createdDraft);
  const changed = clone(definition);
  changed.name = "归档后不得写穿";
  harness.simulateArchiveBeforeNextDraftUpdate();

  await assert.rejects(
    () => harness.service.updateDraft(17, definition.templateId, {
      expectedRevision: createdDraft.revision,
      definition: changed,
    }),
    ConflictException,
  );

  const state = harness.getState();
  assert.equal(state.template.status, "ARCHIVED");
  assert.equal(state.draft.revision, createdDraft.revision);
  assert.equal(state.draft.definition.name, definition.name);
});

test("新建模板是服务层唯一创建入口", () => {
  assert.equal(typeof DynamicTemplatesService.prototype.create, "function");
  assert.equal((DynamicTemplatesService.prototype as any).saveAs, undefined);
});

test("物化模板归档必须拒绝陈旧 revision 或 checksum", async () => {
  const staleRevision = createStatefulService();
  const definition = definitionFixture();
  const created = await staleRevision.service.create(17, { definition });
  const createdDraft = created.draft;
  assert.ok(createdDraft);
  const changed = clone(definition);
  changed.name = "归档前的并发修改";
  await staleRevision.service.updateDraft(17, definition.templateId, {
    expectedRevision: createdDraft.revision,
    definition: changed,
  });
  await assert.rejects(
    () => staleRevision.service.archive(17, definition.templateId, {
      expectedRevision: createdDraft.revision,
      expectedChecksum: createdDraft.definitionChecksum,
    } as any),
    ConflictException,
  );

  const staleChecksum = createStatefulService();
  const checksumDefinition = definitionFixture();
  const checksumCreated = await staleChecksum.service.create(17, { definition: checksumDefinition });
  const checksumDraft = checksumCreated.draft;
  assert.ok(checksumDraft);
  await assert.rejects(
    () => staleChecksum.service.archive(17, checksumDefinition.templateId, {
      expectedRevision: checksumDraft.revision,
      expectedChecksum: "f".repeat(64),
    } as any),
    ConflictException,
  );
});

test("持久化快照允许解锁后修改或修改后锁定合并为一次保存", async () => {
  const { service, getState } = createStatefulService();
  const locked = definitionFixture();
  locked.nodes.node_container.authoring = { structureLocked: true };
  await service.create(17, { definition: locked });

  const unlockedAndChanged = structuredClone(locked);
  delete unlockedAndChanged.nodes.node_container.authoring;
  unlockedAndChanged.nodes.node_heading.responsive.desktop.order = 4;
  const changedAfterUnlock = await service.updateDraft(17, locked.templateId, {
    expectedRevision: 1,
    definition: unlockedAndChanged,
  });
  assert.equal(changedAfterUnlock?.draft?.revision, 2);
  assert.equal(getState().draft.revision, 2);
  assert.equal(getState().draft.definition.nodes.node_container.authoring, undefined);
  assert.equal(getState().draft.definition.nodes.node_heading.responsive.desktop.order, 4);

  const changedAndLocked = structuredClone(unlockedAndChanged);
  changedAndLocked.nodes.node_heading.responsive.desktop.order = 5;
  changedAndLocked.nodes.node_container.authoring = { structureLocked: true };
  const lockedAfterChange = await service.updateDraft(17, locked.templateId, {
    expectedRevision: 2,
    definition: changedAndLocked,
  });
  assert.equal(lockedAfterChange?.draft?.revision, 3);
  assert.equal(getState().draft.revision, 3);
  assert.deepEqual(
    getState().draft.definition.nodes.node_container.authoring,
    { structureLocked: true },
  );
  assert.equal(getState().draft.definition.nodes.node_heading.responsive.desktop.order, 5);
});

test("持久化快照拒绝持续锁保护的变化且其他锁变化不能掩盖", async () => {
  const { service, getState } = createStatefulService();
  const locked = definitionFixture();
  locked.nodes.node_container.authoring = { structureLocked: true };
  await service.create(17, { definition: locked });

  const assertStructureLocked = async (
    submittedDefinition: typeof locked,
    expectedRevision: number,
  ) => {
    await assert.rejects(
      () => service.updateDraft(17, locked.templateId, {
        expectedRevision,
        definition: submittedDefinition,
      }),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.equal((error.getResponse() as any).code, "TEMPLATE_STRUCTURE_LOCKED");
        return true;
      },
    );
    assert.equal(getState().draft.revision, expectedRevision);
  };

  const stillLockedAndChanged = structuredClone(locked);
  stillLockedAndChanged.nodes.node_heading.responsive.desktop.order = 4;
  await assertStructureLocked(stillLockedAndChanged, 1);

  const persistentLockWithNewNestedLock = structuredClone(locked);
  persistentLockWithNewNestedLock.nodes.node_heading.authoring = { structureLocked: true };
  persistentLockWithNewNestedLock.nodes.node_heading.responsive.desktop.order = 4;
  await assertStructureLocked(persistentLockWithNewNestedLock, 1);

  const lockedWithNestedLock = structuredClone(locked);
  lockedWithNestedLock.nodes.node_heading.authoring = { structureLocked: true };
  const nestedLockUpdate = await service.updateDraft(17, locked.templateId, {
    expectedRevision: 1,
    definition: lockedWithNestedLock,
  });
  assert.equal(nestedLockUpdate?.draft?.revision, 2);

  const persistentLockWithRemovedNestedLock = structuredClone(lockedWithNestedLock);
  delete persistentLockWithRemovedNestedLock.nodes.node_heading.authoring;
  persistentLockWithRemovedNestedLock.nodes.node_heading.responsive.desktop.order = 4;
  await assertStructureLocked(persistentLockWithRemovedNestedLock, 2);
});

test("发布生成不可变正式版本、开放 STAFF 读取并保留下一版草稿", async () => {
  const { service, getState, calls } = createStatefulService();
  const definition = definitionFixture();
  definition.nodes.node_container.authoring = { structureLocked: true };
  await service.create(17, {
    definition,
    versionNote: "首版",
  });
  const first = await service.publish(17, definition.templateId, { expectedRevision: 1 });
  assert.equal(first.version, 1);
  assert.equal(getState().template.visibility, "STAFF");
  assert.equal(getState().template.publishedVersion, 1);
  assert.equal(getState().draft.baseVersion, 1);
  assert.equal(getState().draft.revision, 2);
  assert.equal(getState().versions.length, 1);
  assert.equal(getState().versions[0].versionNote, "首版");
  assert.deepEqual(
    (getState().versions[0].definition as any).nodes.node_container.authoring,
    { structureLocked: true },
  );
  const firstDraftClaim = calls.findIndex((call) => call.operation === "draft.updateMany");
  const firstVersionAdvance = calls.findIndex((call) => call.operation === "template.updateMany");
  const firstVersionInsert = calls.findIndex((call) => call.operation === "version.create");
  assert.ok(firstDraftClaim >= 0 && firstDraftClaim < firstVersionAdvance);
  assert.ok(firstVersionAdvance < firstVersionInsert);
  const firstAudit = calls.find((call) => call.operation === "operationLog.create");
  assert.equal(firstAudit?.args.data.action, "TEMPLATE_VERSION_PUBLISHED");
  assert.deepEqual(JSON.parse(firstAudit?.args.data.detail), {
    schemaVersion: 1,
    event: "TEMPLATE_VERSION_PUBLISHED",
    actor: 17,
    timestamp: "2026-08-28T12:00:00.000Z",
    templateId: definition.templateId,
    fromVersion: 0,
    toVersion: 1,
    result: "succeeded",
  });

  await assert.rejects(
    () => service.publish(17, definition.templateId, { expectedRevision: 2 }),
    BadRequestException,
  );

  const changed = structuredClone(definition);
  changed.name = "服务端母模板校验｜第二版";
  await service.updateDraft(17, definition.templateId, {
    expectedRevision: 2,
    definition: changed,
    versionNote: "第二版结构",
  });
  const second = await service.publish(17, definition.templateId, {
    expectedRevision: 3,
    versionNote: " ",
  });
  assert.equal(second.version, 2);
  assert.equal(getState().versions.length, 2);
  assert.equal((getState().versions[0].definition as any).name, definition.name);
  assert.equal((getState().versions[1].definition as any).name, changed.name);
  assert.equal(getState().versions[1].versionNote, null);

  const published = await service.listPublished();
  assert.equal(published.length, 1);
  assert.equal(published[0].version, 2);
  assert.equal(published[0].sourceReference, undefined);
  assert.equal((published[0].definition as any).name, changed.name);
});

test("正式目录资料只随发布推进，保存下一版草稿不改变正式名称和分类", async () => {
  const { service } = createStatefulService();
  const original = definitionFixture();
  const created = await service.create(17, { definition: original });
  const first = await service.publish(17, original.templateId, {
    expectedRevision: created.draft!.revision,
  });
  const beforeDraftEdit = await service.listPublished();
  const changed = clone(original);
  changed.name = "下一版模板名称";
  changed.description = "下一版说明";
  changed.metadata = {
    ...changed.metadata,
    category: "下一版分类",
    purpose: "下一版用途",
    layoutType: "下一版布局说明",
    slotSummary: "下一版槽位摘要",
    recommendedFor: ["about"],
    tags: ["next-version"],
  };
  const updated = await service.updateDraft(17, original.templateId, {
    expectedRevision: first.draft!.revision,
    definition: changed,
  });
  const editable = await service.getDraft(17, original.templateId);
  assert.equal(editable.name, changed.name);
  assert.equal(editable.category, changed.metadata.category);
  assert.equal(editable.purpose, changed.metadata.purpose);
  assert.deepEqual(editable.draft!.definition, changed);
  assert.deepEqual(await service.listPublished(), beforeDraftEdit);
  const historicalBeforePublish = await service.getPublishedVersion(original.templateId, 1);
  assert.equal(historicalBeforePublish.name, original.name);
  assert.equal(historicalBeforePublish.category, original.metadata.category);
  assert.equal(historicalBeforePublish.purpose, original.metadata.purpose);
  assert.equal(historicalBeforePublish.layoutType, original.metadata.layoutType);
  assert.equal(historicalBeforePublish.description, original.description);
  assert.deepEqual(historicalBeforePublish.definition, original);

  await service.publish(17, original.templateId, {
    expectedRevision: updated.draft!.revision,
  });
  const [published] = await service.listPublished();
  assert.equal(published.version, 2);
  assert.equal(published.name, changed.name);
  assert.equal(published.description, changed.description);
  assert.equal(published.category, changed.metadata.category);
  assert.equal(published.purpose, changed.metadata.purpose);
  assert.equal(published.layoutType, changed.metadata.layoutType);
  assert.equal(published.slotSummary, changed.metadata.slotSummary);
  assert.deepEqual(published.recommendedFor, changed.metadata.recommendedFor);
  assert.deepEqual(published.tags, changed.metadata.tags);
  assert.deepEqual(published.definition, changed);
  const historical = await service.getPublishedVersion(original.templateId, 1);
  assert.deepEqual(historical.definition, original);
});

test("正式目录保留模板身份上的历史来源引用", async () => {
  const definition = definitionFixture();
  const template = {
    ...catalogTemplate(1, 1, definition),
    sourceReference: "tpl_historical_source",
  };
  const { service } = createPublishedCatalogService(
    [template],
    [catalogVersion(21, 1, 1, definition)],
  );
  const [published] = await service.listPublished();
  assert.equal(published.sourceReference, template.sourceReference);
  assert.equal(published.templateId, template.templateId);
  assert.deepEqual(published.definition, definition);
});

test("发布目录以模板和版本组合键解析双模板指针并抵抗乱序额外版本", async () => {
  const firstDefinition = definitionFixture();
  const secondDefinition = structuredClone(firstDefinition);
  secondDefinition.templateId = "tpl_catalog_second";
  secondDefinition.name = "目录组合键第二模板";
  const firstTemplate = catalogTemplate(101, 1, firstDefinition);
  const secondTemplate = catalogTemplate(202, 2, secondDefinition);
  const catalog = createPublishedCatalogService(
    [firstTemplate, secondTemplate],
    [
      catalogVersion(31, secondTemplate.id, 2, secondDefinition),
      catalogVersion(32, firstTemplate.id, 1, firstDefinition),
      catalogVersion(33, firstTemplate.id, 99, firstDefinition),
    ],
  );

  const published = await catalog.service.listPublished();

  assert.deepEqual(
    published.map((item) => ({ templateId: item.templateId, version: item.version })),
    [
      { templateId: firstDefinition.templateId, version: 1 },
      { templateId: secondDefinition.templateId, version: 2 },
    ],
  );
  assert.equal(catalog.calls.filter((call) => call.operation === "template.findMany").length, 1);
  assert.equal(catalog.calls.filter((call) => call.operation === "version.findMany").length, 1);
  const versionQuery = catalog.calls.find((call) => call.operation === "version.findMany");
  assert.deepEqual(versionQuery?.args.where.OR, [
    { dynamicTemplateId: firstTemplate.id, version: 1 },
    { dynamicTemplateId: secondTemplate.id, version: 2 },
  ]);
});

test("发布目录混合缺指针项时省略坏项并保留合法项", async () => {
  const missingDefinition = definitionFixture();
  missingDefinition.templateId = "tpl_catalog_missing";
  missingDefinition.name = "目录缺失指针模板";
  const validDefinition = definitionFixture();
  validDefinition.templateId = "tpl_catalog_valid";
  validDefinition.name = "目录合法模板";
  const missingTemplate = catalogTemplate(303, 3, missingDefinition);
  const validTemplate = catalogTemplate(404, 1, validDefinition);
  const catalog = createPublishedCatalogService(
    [missingTemplate, validTemplate],
    [
      catalogVersion(41, missingTemplate.id, 4, missingDefinition),
      catalogVersion(42, validTemplate.id, 1, validDefinition),
    ],
  );

  const published = await catalog.service.listPublished();

  assert.deepEqual(
    published.map((item) => ({ templateId: item.templateId, version: item.version })),
    [{ templateId: validDefinition.templateId, version: 1 }],
  );
  assert.equal(catalog.calls.filter((call) => call.operation === "template.findMany").length, 1);
  assert.equal(catalog.calls.filter((call) => call.operation === "version.findMany").length, 1);
});

test("发布目录在指针版本 checksum 或 definition 完整性失败时省略模板", async () => {
  const checksumFailure = createStatefulService();
  const checksumDefinition = definitionFixture();
  await checksumFailure.service.create(17, { definition: checksumDefinition });
  await checksumFailure.service.publish(17, checksumDefinition.templateId, { expectedRevision: 1 });
  checksumFailure.corruptVersionChecksum(1);
  assert.deepEqual(await checksumFailure.service.listPublished(), []);

  const definitionFailure = createStatefulService();
  const invalidDefinition = definitionFixture();
  await definitionFailure.service.create(17, { definition: invalidDefinition });
  await definitionFailure.service.publish(17, invalidDefinition.templateId, { expectedRevision: 1 });
  definitionFailure.corruptVersionDefinition(1);
  assert.deepEqual(await definitionFailure.service.listPublished(), []);
});

test("严格发布以规范化版本说明参与首次发布和事务内同说明重放身份", async () => {
  const { service, getState, calls } = createStatefulService();
  const definition = definitionFixture();
  const created = await service.create(17, { definition, versionNote: "首版" });
  const expectedChecksum = created.draft!.definitionChecksum;
  const beforePublish = calls.length;

  const first = await service.publish(17, definition.templateId, {
    expectedRevision: 1,
    expectedChecksum,
    targetVersion: 1,
    versionNote: "  严格首版  ",
  });
  const replay = await service.publish(17, definition.templateId, {
    expectedRevision: 1,
    expectedChecksum,
    targetVersion: 1,
    versionNote: "严格首版",
  });

  assert.equal(first.outcome, "published");
  assert.equal(replay.outcome, "already-published");
  assert.equal(replay.version, first.version);
  assert.equal(replay.published.id, first.published.id);
  assert.equal(replay.published.definitionChecksum, first.published.definitionChecksum);
  assert.equal(replay.published.versionNote, "严格首版");
  assert.equal(getState().versions.length, 1);
  assert.equal(getState().draft.revision, 2);
  const publishCalls = calls.slice(beforePublish);
  assert.equal(publishCalls.filter((call) => call.operation === "version.create").length, 1);
  assert.equal(publishCalls.filter((call) => call.operation === "draft.updateMany").length, 1);
  assert.equal(publishCalls.filter((call) => call.operation === "operationLog.create").length, 1);
  assert.equal(publishCalls.some((call) => call.operation.startsWith("pageDocument.")), false);
  assert.equal(publishCalls.some((call) => call.operation.startsWith("pageScheme.")), false);
});

test("严格事务内重放对不同规范化版本说明返回精确 409 且零新增写入", async () => {
  const stateful = createStatefulService();
  const definition = definitionFixture();
  const created = await stateful.service.create(17, { definition });
  const expectedChecksum = created.draft!.definitionChecksum;
  await stateful.service.publish(17, definition.templateId, {
    expectedRevision: 1,
    expectedChecksum,
    targetVersion: 1,
    versionNote: "  首版说明  ",
  });
  const beforeReplay = stateful.getState();
  const writesBeforeReplay = stateful.calls.filter((call) => [
    "draft.updateMany",
    "template.updateMany",
    "version.create",
    "operationLog.create",
  ].includes(call.operation)).length;

  await assertApiConflict(
    () => stateful.service.publish(17, definition.templateId, {
      expectedRevision: 1,
      expectedChecksum,
      targetVersion: 1,
      versionNote: "不同说明",
    }),
    "DYNAMIC_TEMPLATE_VERSION_NOTE_CONFLICT",
    { targetVersion: 1 },
  );

  assert.deepEqual(stateful.getState(), beforeReplay);
  assert.equal(stateful.calls.filter((call) => [
    "draft.updateMany",
    "template.updateMany",
    "version.create",
    "operationLog.create",
  ].includes(call.operation)).length, writesBeforeReplay);
});

test("严格发布在事务外 P2002 赢家处同说明折叠、不同说明精确 409 且无重复写入", async () => {
  const same = createStatefulService();
  const sameDefinition = definitionFixture();
  const sameCreated = await same.service.create(17, { definition: sameDefinition });
  same.simulateConcurrentPublish("version");
  const replay = await same.service.publish(17, sameDefinition.templateId, {
    expectedRevision: 1,
    expectedChecksum: sameCreated.draft!.definitionChecksum,
    targetVersion: 1,
    versionNote: "  竞态首版  ",
  });
  assert.equal(replay.outcome, "already-published");
  assert.equal(replay.published.versionNote, "竞态首版");
  assert.equal(same.getState().versions.length, 1);
  assert.equal(same.getState().operationLogs.length, 1);

  const different = createStatefulService();
  const differentDefinition = definitionFixture();
  const differentCreated = await different.service.create(17, { definition: differentDefinition });
  different.simulateConcurrentPublish("version", undefined, "竞争说明");
  await assertApiConflict(
    () => different.service.publish(17, differentDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: differentCreated.draft!.definitionChecksum,
      targetVersion: 1,
      versionNote: "请求说明",
    }),
    "DYNAMIC_TEMPLATE_VERSION_NOTE_CONFLICT",
    { targetVersion: 1 },
  );
  const state = different.getState();
  assert.equal(state.template.publishedVersion, 1);
  assert.equal(state.draft.revision, 2);
  assert.equal(state.versions.length, 1);
  assert.equal(state.versions[0].versionNote, "竞争说明");
  assert.equal(state.operationLogs.length, 1);
});

test("严格重放拒绝发布指针或可见性未覆盖的孤立版本，并保留合法历史及归档版本", async () => {
  const orphan = createStatefulService();
  const orphanDefinition = definitionFixture();
  const orphanCreated = await orphan.service.create(17, { definition: orphanDefinition });
  const orphanChecksum = orphanCreated.draft!.definitionChecksum;
  orphan.insertOrphanVersion();
  await assert.rejects(
    () => orphan.service.getPublishedVersion(orphanDefinition.templateId, 1),
    NotFoundException,
  );
  await assertApiConflict(
    () => orphan.service.publish(17, orphanDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: orphanChecksum,
      targetVersion: 1,
    }),
    "DYNAMIC_TEMPLATE_PUBLISH_STATE_INTEGRITY_FAILED",
    { targetVersion: 1, publishedVersion: 0, visibility: "PRIVATE" },
  );
  assert.equal(orphan.getState().template.publishedVersion, 0);
  assert.equal(orphan.getState().template.visibility, "PRIVATE");
  assert.equal(orphan.getState().draft.revision, 1);
  assert.equal(orphan.getState().versions.length, 1);
  assert.equal(orphan.getState().operationLogs.length, 0);

  const historical = createStatefulService();
  const historicalDefinition = definitionFixture();
  const historicalCreated = await historical.service.create(17, { definition: historicalDefinition });
  const historicalChecksum = historicalCreated.draft!.definitionChecksum;
  await historical.service.publish(17, historicalDefinition.templateId, {
    expectedRevision: 1,
    expectedChecksum: historicalChecksum,
    targetVersion: 1,
  });
  const changed = structuredClone(historicalDefinition);
  changed.name = "历史版本重放 v2";
  const updated = await historical.service.updateDraft(17, historicalDefinition.templateId, {
    expectedRevision: 2,
    definition: changed,
  });
  await historical.service.publish(17, historicalDefinition.templateId, {
    expectedRevision: 3,
    expectedChecksum: updated!.draft!.definitionChecksum,
    targetVersion: 2,
  });
  const replayV1 = await historical.service.publish(17, historicalDefinition.templateId, {
    expectedRevision: 1,
    expectedChecksum: historicalChecksum,
    targetVersion: 1,
  });
  assert.equal(replayV1.outcome, "already-published");
  assert.equal(replayV1.version, 1);
  assert.equal(historical.getState().versions.length, 2);
  assert.equal(historical.getState().operationLogs.length, 2);

  await historical.service.archive(
    17,
    historicalDefinition.templateId,
    draftIdentity({ draft: historical.getState().draft }),
  );
  assert.equal(
    (await historical.service.getPublishedVersion(historicalDefinition.templateId, 1)).version,
    1,
  );
  const archivedReplay = await historical.service.publish(17, historicalDefinition.templateId, {
    expectedRevision: 1,
    expectedChecksum: historicalChecksum,
    targetVersion: 1,
  });
  assert.equal(archivedReplay.outcome, "already-published");
  assert.equal(archivedReplay.version, 1);
  assert.equal(historical.getState().versions.length, 2);
  assert.equal(historical.getState().operationLogs.length, 3);

  await assertApiConflict(
    () => historical.service.publish(17, historicalDefinition.templateId, {
      expectedRevision: 4,
      expectedChecksum: updated!.draft!.definitionChecksum,
      targetVersion: 3,
    }),
    "DYNAMIC_TEMPLATE_STATUS_CONFLICT",
    { status: "ARCHIVED", targetVersion: 3 },
  );
  assert.equal(historical.getState().template.publishedVersion, 2);
  assert.equal(historical.getState().draft.revision, 4);
  assert.equal(historical.getState().versions.length, 2);
  assert.equal(historical.getState().operationLogs.length, 3);
});

test("P2034 对严格同 checksum 重放、不同 checksum 和 legacy 409 均保持事务原子性", async () => {
  const same = createStatefulService();
  const sameDefinition = definitionFixture();
  const sameCreated = await same.service.create(17, { definition: sameDefinition });
  const sameChecksum = sameCreated.draft!.definitionChecksum;
  same.simulateP2034(true);
  const folded = await same.service.publish(17, sameDefinition.templateId, {
    expectedRevision: 1,
    expectedChecksum: sameChecksum,
    targetVersion: 1,
  });
  assert.equal(folded.outcome, "already-published");
  assert.equal(same.getState().draft.revision, 2);
  assert.equal(same.getState().versions.length, 1);
  assert.equal(same.getState().operationLogs.length, 1);

  const different = createStatefulService();
  const differentDefinition = definitionFixture();
  const differentCreated = await different.service.create(17, { definition: differentDefinition });
  different.simulateP2034(true, "f".repeat(64));
  await assertApiConflict(
    () => different.service.publish(17, differentDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: differentCreated.draft!.definitionChecksum,
      targetVersion: 1,
    }),
    "DYNAMIC_TEMPLATE_TARGET_VERSION_CONFLICT",
  );
  assert.equal(different.getState().draft.revision, 2);
  assert.equal(different.getState().versions.length, 1);
  assert.equal(different.getState().operationLogs.length, 1);

  const legacy = createStatefulService();
  const legacyDefinition = definitionFixture();
  await legacy.service.create(17, { definition: legacyDefinition });
  legacy.simulateP2034(false);
  await assertApiConflict(
    () => legacy.service.publish(17, legacyDefinition.templateId, { expectedRevision: 1 }),
    "DYNAMIC_TEMPLATE_PUBLISH_CONCURRENT_CONFLICT",
  );
  assert.equal(legacy.getState().template.publishedVersion, 0);
  assert.equal(legacy.getState().draft.revision, 1);
  assert.equal(legacy.getState().versions.length, 0);
  assert.equal(legacy.getState().operationLogs.length, 0);
});

test("无关 P2002 且事务外没有目标版本赢家时透传原错误并保持零部分写入", async () => {
  const stateful = createStatefulService();
  const definition = definitionFixture();
  const created = await stateful.service.create(17, { definition });
  const unrelatedError = stateful.simulateTransactionPrismaError(
    "P2002",
    false,
    undefined,
    ["operation_logs_unique_key"],
  );

  await assert.rejects(
    () => stateful.service.publish(17, definition.templateId, {
      expectedRevision: 1,
      expectedChecksum: created.draft!.definitionChecksum,
      targetVersion: 1,
    }),
    (error: unknown) => error === unrelatedError,
  );
  assert.equal(stateful.getState().template.publishedVersion, 0);
  assert.equal(stateful.getState().template.visibility, "PRIVATE");
  assert.equal(stateful.getState().draft.revision, 1);
  assert.equal(stateful.getState().versions.length, 0);
  assert.equal(stateful.getState().operationLogs.length, 0);
});

test("P2034 且事务外没有目标版本赢家时透传原错误并保持零部分写入", async () => {
  const stateful = createStatefulService();
  const definition = definitionFixture();
  const created = await stateful.service.create(17, { definition });
  const originalError = stateful.simulateTransactionPrismaError("P2034", false);

  await assert.rejects(
    () => stateful.service.publish(17, definition.templateId, {
      expectedRevision: 1,
      expectedChecksum: created.draft!.definitionChecksum,
      targetVersion: 1,
    }),
    (error: unknown) => error === originalError,
  );
  assert.equal(stateful.getState().template.publishedVersion, 0);
  assert.equal(stateful.getState().template.visibility, "PRIVATE");
  assert.equal(stateful.getState().draft.revision, 1);
  assert.equal(stateful.getState().versions.length, 0);
  assert.equal(stateful.getState().operationLogs.length, 0);
});

test("严格发布在 revision、目标版本和两层 checksum 冲突时保持零写入", async () => {
  const assertNoPublishWrites = (stateful: ReturnType<typeof createStatefulService>) => {
    const state = stateful.getState();
    assert.equal(state.template.publishedVersion, 0);
    assert.equal(state.draft.revision, 1);
    assert.equal(state.versions.length, 0);
    assert.equal(stateful.calls.some((call) => call.operation === "operationLog.create"), false);
  };

  const paired = createStatefulService();
  const pairedDefinition = definitionFixture();
  await paired.service.create(17, { definition: pairedDefinition });
  await assert.rejects(
    () => paired.service.publish(17, pairedDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: "a".repeat(64),
    }),
    BadRequestException,
  );
  await assert.rejects(
    () => paired.service.publish(17, pairedDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: "A".repeat(64),
      targetVersion: 1,
    }),
    BadRequestException,
  );
  assertNoPublishWrites(paired);

  const revision = createStatefulService();
  const revisionDefinition = definitionFixture();
  const revisionCreated = await revision.service.create(17, { definition: revisionDefinition });
  await assertApiConflict(
    () => revision.service.publish(17, revisionDefinition.templateId, {
      expectedRevision: 2,
      expectedChecksum: revisionCreated.draft!.definitionChecksum,
      targetVersion: 1,
    }),
    "DYNAMIC_TEMPLATE_DRAFT_REVISION_CONFLICT",
    { expectedRevision: 2, currentRevision: 1 },
  );
  assertNoPublishWrites(revision);

  const missingDraft = createStatefulService();
  const missingDraftDefinition = definitionFixture();
  const missingDraftCreated = await missingDraft.service.create(17, {
    definition: missingDraftDefinition,
  });
  const missingDraftChecksum = missingDraftCreated.draft!.definitionChecksum;
  missingDraft.removeDraft();
  await assertApiConflict(
    () => missingDraft.service.publish(17, missingDraftDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: missingDraftChecksum,
      targetVersion: 1,
    }),
    "DYNAMIC_TEMPLATE_DRAFT_INTEGRITY_FAILED",
    { targetVersion: 1 },
  );
  assert.equal(missingDraft.getState().template.publishedVersion, 0);
  assert.equal(missingDraft.getState().draft, null);
  assert.equal(missingDraft.getState().versions.length, 0);
  assert.equal(missingDraft.getState().operationLogs.length, 0);

  const target = createStatefulService();
  const targetDefinition = definitionFixture();
  const targetCreated = await target.service.create(17, { definition: targetDefinition });
  await assertApiConflict(
    () => target.service.publish(17, targetDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: targetCreated.draft!.definitionChecksum,
      targetVersion: 2,
    }),
    "DYNAMIC_TEMPLATE_TARGET_VERSION_CONFLICT",
  );
  assertNoPublishWrites(target);

  const persistedChecksum = createStatefulService();
  const persistedDefinition = definitionFixture();
  const persistedCreated = await persistedChecksum.service.create(17, { definition: persistedDefinition });
  persistedChecksum.corruptDraftChecksum();
  await assertApiConflict(
    () => persistedChecksum.service.publish(17, persistedDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: persistedCreated.draft!.definitionChecksum,
      targetVersion: 1,
    }),
    "DYNAMIC_TEMPLATE_DRAFT_CHECKSUM_CONFLICT",
  );
  assertNoPublishWrites(persistedChecksum);

  const recomputedChecksum = createStatefulService();
  const recomputedDefinition = definitionFixture();
  await recomputedChecksum.service.create(17, { definition: recomputedDefinition });
  recomputedChecksum.corruptDraftChecksum();
  await assertApiConflict(
    () => recomputedChecksum.service.publish(17, recomputedDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: "0".repeat(64),
      targetVersion: 1,
    }),
    "DYNAMIC_TEMPLATE_DEFINITION_CHECKSUM_CONFLICT",
  );
  assertNoPublishWrites(recomputedChecksum);
});

test("严格发布把 CAS 或唯一键竞争折叠为同 checksum 成功，不同 checksum 返回 409", async () => {
  for (const stage of ["draft", "version"] as const) {
    const stateful = createStatefulService();
    const definition = definitionFixture();
    const created = await stateful.service.create(17, { definition });
    const expectedChecksum = created.draft!.definitionChecksum;
    stateful.simulateConcurrentPublish(stage);

    const result = await stateful.service.publish(17, definition.templateId, {
      expectedRevision: 1,
      expectedChecksum,
      targetVersion: 1,
    });

    assert.equal(result.outcome, "already-published");
    assert.equal(result.version, 1);
    assert.equal(result.published.definitionChecksum, expectedChecksum);
    assert.equal(stateful.getState().versions.length, 1);
    assert.equal(stateful.getState().draft.revision, 2);
    assert.equal(
      stateful.calls.filter((call) => call.operation === "operationLog.create").length,
      1,
    );
  }

  const conflicting = createStatefulService();
  const definition = definitionFixture();
  const created = await conflicting.service.create(17, { definition });
  conflicting.simulateConcurrentPublish("version", "f".repeat(64));
  await assertApiConflict(
    () => conflicting.service.publish(17, definition.templateId, {
      expectedRevision: 1,
      expectedChecksum: created.draft!.definitionChecksum,
      targetVersion: 1,
    }),
    "DYNAMIC_TEMPLATE_TARGET_VERSION_CONFLICT",
  );
  assert.equal(conflicting.getState().versions.length, 1);
  assert.equal(
    conflicting.calls.filter((call) => call.operation === "operationLog.create").length,
    1,
  );

  const occupied = createStatefulService();
  const occupiedDefinition = definitionFixture();
  const occupiedCreated = await occupied.service.create(17, { definition: occupiedDefinition });
  await occupied.service.publish(17, occupiedDefinition.templateId, {
    expectedRevision: 1,
    expectedChecksum: occupiedCreated.draft!.definitionChecksum,
    targetVersion: 1,
  });
  await assertApiConflict(
    () => occupied.service.publish(17, occupiedDefinition.templateId, {
      expectedRevision: 1,
      expectedChecksum: "f".repeat(64),
      targetVersion: 1,
    }),
    "DYNAMIC_TEMPLATE_TARGET_VERSION_CONFLICT",
  );
  assert.equal(occupied.getState().versions.length, 1);
  assert.equal(
    occupied.calls.filter((call) => call.operation === "operationLog.create").length,
    1,
  );
});

test("严格发布保留 v1/v2，不改 v1，并由精确 GET 区分成功、404 与完整性 409", async () => {
  const { service, getState, corruptVersionChecksum } = createStatefulService();
  const firstDefinition = definitionFixture();
  const created = await service.create(17, { definition: firstDefinition });
  await service.publish(17, firstDefinition.templateId, {
    expectedRevision: 1,
    expectedChecksum: created.draft!.definitionChecksum,
    targetVersion: 1,
  });

  const secondDefinition = structuredClone(firstDefinition);
  secondDefinition.name = "严格发布第二版";
  const updated = await service.updateDraft(17, firstDefinition.templateId, {
    expectedRevision: 2,
    definition: secondDefinition,
  });
  await service.publish(17, firstDefinition.templateId, {
    expectedRevision: 3,
    expectedChecksum: updated!.draft!.definitionChecksum,
    targetVersion: 2,
  });

  assert.equal(getState().versions.length, 2);
  assert.equal((getState().versions[0].definition as any).name, firstDefinition.name);
  assert.equal((getState().versions[1].definition as any).name, secondDefinition.name);
  assert.equal((await service.getPublishedVersion(firstDefinition.templateId, 1)).version, 1);
  await assert.rejects(
    () => service.getPublishedVersion(firstDefinition.templateId, 3),
    NotFoundException,
  );
  corruptVersionChecksum(2);
  await assert.rejects(
    () => service.getPublishedVersion(firstDefinition.templateId, 2),
    ConflictException,
  );
});

test("模板版本列表分页只返回摘要，详情仍通过可信正式版本读取", async () => {
  const { service, calls } = createStatefulService();
  const definition = definitionFixture();
  await service.create(17, { definition });
  await service.publish(17, definition.templateId, { expectedRevision: 1 });
  const changed = structuredClone(definition);
  changed.name = "分页摘要第二版";
  await service.updateDraft(17, definition.templateId, { expectedRevision: 2, definition: changed });
  await service.publish(17, definition.templateId, { expectedRevision: 3 });

  const firstPage = await service.listVersions(17, definition.templateId, undefined, 1);
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.items[0].version, 2);
  assert.equal("definition" in firstPage.items[0], false);
  assert.equal(firstPage.nextBeforeVersion, 2);
  const secondPage = await service.listVersions(17, definition.templateId, firstPage.nextBeforeVersion!, 1);
  assert.equal(secondPage.items[0].version, 1);
  assert.equal(secondPage.nextBeforeVersion, null);
  const query = [...calls].reverse().find((call) => call.operation === "version.findMany");
  assert.deepEqual(query?.args.where.version, { lt: 2 });
  assert.equal(query?.args.select.definition, undefined);

  const detail = await service.getPublishedVersion(definition.templateId, 1);
  assert.equal(detail.version, 1);
  assert.equal(detail.definition.templateId, definition.templateId);
});

test("跨 schema3 恢复可信旧版本默认内容和空值策略，不混入当前内容", async () => {
  const harness = createStatefulService();
  const legacy = definitionFixture();
  await harness.service.create(17, { definition: legacy });
  legacy.defaultContent.slot_heading = "历史默认文案";
  legacy.previewContent = { slot_heading: "历史预览" };
  legacy.slots.slot_heading.emptyPolicy = "use-default";
  harness.setDraftDefinition(legacy);
  harness.insertOrphanVersion(undefined, 1);
  const historicalChecksum = harness.getState().versions[0].definitionChecksum;
  const current = structuredClone(legacy); current.schemaVersion = 3;
  current.previewContent = {}; current.defaultContent.slot_heading = "当前默认文案";
  current.slots.slot_heading.emptyPolicy = "hide";
  await harness.service.updateDraft(17, legacy.templateId, { expectedRevision: 1, definition: current });
  const before = harness.getState();
  const attempts = [
    { definition: legacy, restoreFromVersion: undefined, restoreFromChecksum: undefined },
    { definition: legacy, restoreFromVersion: 1, restoreFromChecksum: "0".repeat(64) },
    { definition: { ...structuredClone(legacy), defaultContent: { slot_heading: "篡改历史默认文案" } }, restoreFromVersion: 1, restoreFromChecksum: historicalChecksum },
  ];
  for (const attempt of attempts) {
    await assert.rejects(() => harness.service.updateDraft(17, legacy.templateId, { expectedRevision: before.draft.revision, ...attempt }));
    assert.deepEqual(harness.getState().draft, before.draft);
  }
  const restored = await harness.service.updateDraft(17, legacy.templateId, { expectedRevision: before.draft.revision, definition: legacy, restoreFromVersion: 1, restoreFromChecksum: historicalChecksum });
  assert.deepEqual(restored.draft?.definition, legacy);
  assert.deepEqual(harness.getState().versions, before.versions);
});

test("旧 schema1/2 之间恢复仍禁止恢复已清空的历史默认内容", async () => {
  const harness = createStatefulService();
  const legacy = definitionFixture();
  await harness.service.create(17, { definition: legacy });
  legacy.defaultContent.slot_heading = "历史默认文案";
  legacy.slots.slot_heading.emptyPolicy = "use-default";
  harness.setDraftDefinition(legacy); harness.insertOrphanVersion(undefined, 1);
  const historicalChecksum = harness.getState().versions[0].definitionChecksum;
  const cleared = definitionFixture(); cleared.schemaVersion = 2;
  await harness.service.updateDraft(17, legacy.templateId, { expectedRevision: 1, definition: cleared });
  const before = harness.getState();
  await assert.rejects(() => harness.service.updateDraft(17, legacy.templateId, { expectedRevision: before.draft.revision, definition: legacy, restoreFromVersion: 1, restoreFromChecksum: historicalChecksum }));
  assert.deepEqual(harness.getState(), before);
});

test("历史版本只在显式保存时以同模板可信来源越过结构锁，校验失败保持零写入", async () => {
  const { service, calls, getState, corruptVersionChecksum } = createStatefulService();
  const first = definitionFixture();
  first.nodes.node_container.authoring = { structureLocked: true };
  await service.create(17, { definition: first });
  const publishedFirst = await service.publish(17, first.templateId, { expectedRevision: 1 });

  const unlocked = structuredClone(first);
  delete unlocked.nodes.node_container.authoring;
  unlocked.nodes.node_heading.responsive.desktop.order = 4;
  await service.updateDraft(17, first.templateId, { expectedRevision: 2, definition: unlocked });
  const second = structuredClone(unlocked);
  second.nodes.node_container.authoring = { structureLocked: true };
  await service.updateDraft(17, first.templateId, { expectedRevision: 3, definition: second });
  await service.publish(17, first.templateId, { expectedRevision: 4 });

  await assert.rejects(
    () => service.updateDraft(17, first.templateId, {
      expectedRevision: 5,
      definition: first,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_STRUCTURE_LOCKED");
      return true;
    },
  );
  const writesBeforeInvalidSource = calls.filter((call) => (
    call.operation === "draft.updateMany" || call.operation === "template.update"
  )).length;
  await assert.rejects(
    () => service.updateDraft(17, first.templateId, {
      expectedRevision: 5,
      definition: first,
      restoreFromVersion: 1,
      restoreFromChecksum: "0".repeat(64),
    }),
    ConflictException,
  );
  assert.equal(calls.filter((call) => (
    call.operation === "draft.updateMany" || call.operation === "template.update"
  )).length, writesBeforeInvalidSource);

  const restored = await service.updateDraft(17, first.templateId, {
    expectedRevision: 5,
    definition: first,
    restoreFromVersion: 1,
    restoreFromChecksum: publishedFirst.published.definitionChecksum,
  });
  assert.equal(restored?.draft?.revision, 6);
  assert.equal(getState().draft.definition.nodes.node_heading.responsive.desktop.order, 0);
  assert.equal(getState().versions.length, 2);

  corruptVersionChecksum(1);
  await assert.rejects(
    () => service.getPublishedVersion(first.templateId, 1),
    ConflictException,
  );
  const writesBeforeRestore = calls.filter((call) => (
    call.operation === "draft.updateMany" || call.operation === "template.update"
  )).length;
  await assert.rejects(
    () => service.updateDraft(17, first.templateId, {
      expectedRevision: 6,
      definition: first,
      restoreFromVersion: 1,
      restoreFromChecksum: publishedFirst.published.definitionChecksum,
    }),
    ConflictException,
  );
  assert.equal(calls.filter((call) => (
    call.operation === "draft.updateMany" || call.operation === "template.update"
  )).length, writesBeforeRestore);
});

test("发布模板 v2 不读取或修改 PageDocument、PageDocumentRevision、PageScheme，旧实例继续引用 v1", async () => {
  const { service, calls, setPageDocuments, getState } = createStatefulService();
  const definition = definitionFixture();
  await service.create(17, { definition });
  await service.publish(17, definition.templateId, { expectedRevision: 1 });
  const pageDocument = {
    id: 81,
    pageKey: "home",
    updatedAt: "2026-08-30T08:00:00.000Z",
    puckData: {
      content: [{
        type: "动态模板实例",
        props: {
          instanceId: "instance-v1",
          templateId: definition.templateId,
          templateVersion: 1,
        },
      }],
      zones: {},
      root: { props: {} },
    },
  };
  setPageDocuments([pageDocument]);
  const changed = definitionFixture();
  changed.name = "发布隔离 v2";
  await service.updateDraft(17, definition.templateId, {
    expectedRevision: 2,
    definition: changed,
  });
  const beforePublishCallCount = calls.length;

  const result = await service.publish(17, definition.templateId, { expectedRevision: 3 });

  assert.equal(result.version, 2);
  assert.equal(getState().versions.length, 2);
  const publishCalls = calls.slice(beforePublishCallCount);
  assert.equal(publishCalls.some((call) => call.operation.startsWith("pageDocument.")), false);
  assert.equal(publishCalls.some((call) => call.operation.startsWith("pageDocumentRevision.")), false);
  assert.equal(publishCalls.some((call) => call.operation.startsWith("pageScheme.")), false);
  assert.equal(pageDocument.puckData.content[0].props.templateVersion, 1);
  assert.equal(pageDocument.updatedAt, "2026-08-30T08:00:00.000Z");
});

test("新建、发布版本与归档生命周期保留按轴尺寸兼容状态", async () => {
  const { service, getState, calls } = createStatefulService();
  const definition = definitionFixture();
  definition.nodes.node_hero_template = {
    nodeId: "node_hero_template",
    type: "HeroTemplate",
    name: "首屏主视觉组件",
    slotId: "slot_hero_template",
    childIds: [],
    props: {
      contentTemplateLayoutData: {
        version: 2,
        nodes: {
          action: {
            rectByViewport: {
              desktop: { x: 0.05, y: 0.8, width: 0.04, height: 0.03 },
            },
            sizeCompatibilityByViewport: {
              desktop: {
                width: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
                height: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
              },
            },
          },
        },
      },
    },
    responsive: {
      desktop: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  definition.nodes.node_container.childIds.push("node_hero_template");
  definition.slots.slot_hero_template = {
    slotId: "slot_hero_template",
    key: "heroTemplateContent",
    type: "heroTemplate",
    label: "首屏主视觉组件",
    required: false,
    editable: true,
    hideable: true,
    validation: {},
    desktopRules: {},
    mobileRules: {},
  };
  const created = await service.create(17, { definition });
  assert.ok(created.draft);
  const createdCompatibility = (created.draft.definition as any).nodes.node_hero_template
    .props.contentTemplateLayoutData.nodes.action.sizeCompatibilityByViewport.desktop;
  assert.deepEqual(createdCompatibility, {
    width: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
    height: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
  });

  await service.publish(17, created.templateId, { expectedRevision: 1 });
  const publishedCompatibility = (await service.getPublishedVersion(created.templateId, 1)
    .then((version) => version.definition as any)).nodes.node_hero_template
    .props.contentTemplateLayoutData.nodes.action.sizeCompatibilityByViewport.desktop;
  assert.deepEqual(publishedCompatibility, createdCompatibility);
  await service.archive(17, created.templateId, draftIdentity({ draft: getState().draft }));
  assert.equal(getState().template.status, "ARCHIVED");
  assert.equal(getState().versions.length, 1);
  assert.equal((await service.listPublished()).length, 0);
  const archivedVersion = await service.getPublishedVersion(created.templateId, 1);
  assert.equal(archivedVersion.version, 1);
  assert.equal(archivedVersion.status, "ARCHIVED");
  await service.restore(17, created.templateId);
  assert.equal(getState().template.status, "ACTIVE");
  const lifecycleAudits = calls
    .filter((call) => call.operation === "operationLog.create")
    .filter((call) => ["TEMPLATE_ARCHIVED", "TEMPLATE_RESTORED"].includes(call.args.data.action));
  assert.deepEqual(lifecycleAudits.map((call) => call.args.data.action), [
    "TEMPLATE_ARCHIVED",
    "TEMPLATE_RESTORED",
  ]);
  assert.deepEqual(
    lifecycleAudits.map((call) => {
      const detail = JSON.parse(call.args.data.detail);
      return {
        action: call.args.data.action,
        module: call.args.data.module,
        targetId: call.args.data.targetId,
        actor: detail.actor,
        event: detail.event,
        templateId: detail.templateId,
        fromStatus: detail.fromStatus,
        toStatus: detail.toStatus,
        publishedVersion: detail.publishedVersion,
        result: detail.result,
        hasTimestamp: typeof detail.timestamp === "string",
      };
    }),
    [
      {
        action: "TEMPLATE_ARCHIVED",
        module: "page-builder-template",
        targetId: getState().template.id,
        actor: 17,
        event: "TEMPLATE_ARCHIVED",
        templateId: created.templateId,
        fromStatus: "ACTIVE",
        toStatus: "ARCHIVED",
        publishedVersion: 1,
        result: "succeeded",
        hasTimestamp: true,
      },
      {
        action: "TEMPLATE_RESTORED",
        module: "page-builder-template",
        targetId: getState().template.id,
        actor: 17,
        event: "TEMPLATE_RESTORED",
        templateId: created.templateId,
        fromStatus: "ARCHIVED",
        toStatus: "ACTIVE",
        publishedVersion: 1,
        result: "succeeded",
        hasTimestamp: true,
      },
    ],
  );
});

test("新母模板不持久化内容，历史内容只允许原样兼容或显式清空", async () => {
  const direct = createStatefulService();
  const withDefaultContent = definitionFixture();
  withDefaultContent.defaultContent = { slot_heading: "历史默认标题" };
  await assert.rejects(
    () => direct.service.create(17, { definition: withDefaultContent }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_CONTENT_MUST_BE_EMPTY");
      return true;
    },
  );
  const withPreviewContent = definitionFixture();
  withPreviewContent.previewContent = { slot_heading: "历史预览标题" };
  await assert.rejects(
    () => direct.service.create(17, { definition: withPreviewContent }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_CONTENT_MUST_BE_EMPTY");
      return true;
    },
  );
  const withLegacyEmptyPolicy = definitionFixture();
  withLegacyEmptyPolicy.slots.slot_heading.emptyPolicy = "use-default";
  await assert.rejects(
    () => direct.service.create(17, { definition: withLegacyEmptyPolicy }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_LEGACY_EMPTY_POLICY_NOT_ALLOWED");
      return true;
    },
  );

  const currentPolicy = createStatefulService();
  const currentDefinition = definitionFixture();
  await currentPolicy.service.create(17, { definition: currentDefinition });
  const addedLegacyPolicy = structuredClone(currentDefinition);
  addedLegacyPolicy.slots.slot_heading.emptyPolicy = "use-default";
  await assert.rejects(
    () => currentPolicy.service.updateDraft(17, currentDefinition.templateId, {
      expectedRevision: 1,
      definition: addedLegacyPolicy,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_LEGACY_EMPTY_POLICY_IS_READ_ONLY");
      return true;
    },
  );

  const historical = createStatefulService();
  const definition = definitionFixture();
  await historical.service.create(17, { definition });
  const historicalDefinition = definitionFixture();
  historicalDefinition.defaultContent = { slot_heading: "历史默认标题" };
  historicalDefinition.previewContent = { slot_heading: "历史预览标题" };
  historicalDefinition.slots.slot_heading.emptyPolicy = "use-default";
  historical.setDraftDefinition(historicalDefinition);

  const preserved = structuredClone(historicalDefinition);
  preserved.name = "只修改模板名称";
  await historical.service.updateDraft(17, definition.templateId, {
    expectedRevision: 1,
    definition: preserved,
  });
  assert.deepEqual(historical.getState().draft.definition.defaultContent, {
    slot_heading: "历史默认标题",
  });

  const modified = structuredClone(preserved);
  modified.defaultContent.slot_heading = "试图改写历史内容";
  await assert.rejects(
    () => historical.service.updateDraft(17, definition.templateId, {
      expectedRevision: 2,
      definition: modified,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_CONTENT_IS_READ_ONLY");
      return true;
    },
  );

  const cleared = structuredClone(preserved);
  cleared.defaultContent = {};
  cleared.previewContent = {};
  cleared.slots.slot_heading.emptyPolicy = "hide";
  await historical.service.updateDraft(17, definition.templateId, {
    expectedRevision: 2,
    definition: cleared,
  });
  assert.deepEqual(historical.getState().draft.definition.defaultContent, {});
  assert.deepEqual(historical.getState().draft.definition.previewContent, {});
  assert.equal(historical.getState().draft.definition.slots.slot_heading.emptyPolicy, "hide");

  const restoredLegacyPolicy = structuredClone(cleared);
  restoredLegacyPolicy.slots.slot_heading.emptyPolicy = "use-default";
  await assert.rejects(
    () => historical.service.updateDraft(17, definition.templateId, {
      expectedRevision: 3,
      definition: restoredLegacyPolicy,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as any).code, "TEMPLATE_LEGACY_EMPTY_POLICY_IS_READ_ONLY");
      return true;
    },
  );

});

test("未通过新建模板持久化的兼容来源不能被归档物化", async () => {
  const harness = createStatefulService();
  await assert.rejects(
    () => harness.service.archive(17, "legacy_system_hero", {
      expectedRevision: 1,
      expectedChecksum: "a".repeat(64),
    }),
    NotFoundException,
  );
  assert.equal(harness.getState().template, null);
  assert.equal(harness.calls.some((call) => call.operation === "template.create"), false);
});

test("仅真实数据 blocker 决定回收站母模板能否永久删除，不按 SYSTEM/CUSTOM 分级", async () => {
  const deletable = createStatefulService();
  const definition = definitionFixture();
  const created = await deletable.service.create(17, { definition });
  assert.equal(created.canDelete, false);
  assert.equal(created.deleteBlockers[0].code, "NOT_IN_TRASH");
  const reopened = await deletable.service.getDraft(17, definition.templateId);
  assert.equal(reopened.canDelete, false);
  assert.equal(reopened.deleteBlockers[0].code, "NOT_IN_TRASH");
  const catalog = await deletable.service.listMine(17);
  assert.equal(catalog[0].canDelete, false);
  assert.equal(catalog[0].deleteBlockers[0].code, "NOT_IN_TRASH");
  await assert.rejects(
    () => deletable.service.deleteDraft(17, definition.templateId),
    ConflictException,
  );
  await deletable.service.archive(17, definition.templateId, draftIdentity(created));
  const trashCatalog = await deletable.service.listMine(17);
  assert.equal(trashCatalog[0].canDelete, true);
  assert.deepEqual(trashCatalog[0].deleteBlockers, []);
  assert.deepEqual(await deletable.service.deleteDraft(17, definition.templateId), {
    templateId: definition.templateId,
    deleted: true,
  });
  const deleteAudit = deletable.calls.find((call) => (
    call.operation === "operationLog.create"
    && call.args.data.action === "TEMPLATE_DRAFT_DELETED"
  ));
  assert.equal(deleteAudit?.args.data.module, "page-builder-template");
  assert.deepEqual({
    ...JSON.parse(deleteAudit?.args.data.detail),
    timestamp: "<timestamp>",
  }, {
    schemaVersion: 1,
    event: "TEMPLATE_DRAFT_DELETED",
    actor: 17,
    timestamp: "<timestamp>",
    templateId: definition.templateId,
    fromStatus: "ARCHIVED",
    toStatus: "DELETED",
    publishedVersion: 0,
    result: "succeeded",
  });
  assert.equal(deletable.getState().template, null);

  const referenced = createStatefulService();
  const referencedCreated = await referenced.service.create(17, { definition: definitionFixture() });
  referenced.setPageDocuments([{
    puckData: {
      content: [{
        type: "动态模板实例",
        props: {
          instanceId: "instance-blocking-delete",
          templateId: definition.templateId,
          templateVersion: 1,
        },
      }],
      zones: {},
    },
    revisions: [],
    localizations: [],
  }]);
  await referenced.service.archive(17, definition.templateId, draftIdentity(referencedCreated));
  const referencedCatalog = await referenced.service.listMine(17);
  assert.equal(referencedCatalog[0].canDelete, false);
  assert.equal(referencedCatalog[0].deleteBlockers[0].code, "REFERENCED_BY_PAGE");
  await assert.rejects(
    () => referenced.service.deleteDraft(17, definition.templateId),
    ConflictException,
  );
  assert.equal(referenced.calls.some((call) => (
    call.operation === "operationLog.create"
    && call.args.data.action === "TEMPLATE_DRAFT_DELETED"
  )), false);

  const historicalVersion = createStatefulService();
  const historicalVersionDefinition = definitionFixture();
  const historicalVersionCreated = await historicalVersion.service.create(17, {
    definition: historicalVersionDefinition,
  });
  historicalVersion.insertOrphanVersion(undefined, 1);
  await historicalVersion.service.archive(
    17,
    historicalVersionDefinition.templateId,
    draftIdentity(historicalVersionCreated),
  );
  const historicalVersionCatalog = await historicalVersion.service.listMine(17);
  const historicalVersionDraft = await historicalVersion.service.getDraft(
    17,
    historicalVersionDefinition.templateId,
  );
  for (const resource of [historicalVersionCatalog[0], historicalVersionDraft]) {
    assert.equal(resource.canDelete, false);
    assert.deepEqual(
      resource.deleteBlockers.map((blocker: { code: string }) => blocker.code),
      ["HAS_VERSION_HISTORY"],
    );
  }
  await assert.rejects(
    () => historicalVersion.service.deleteDraft(17, historicalVersionDefinition.templateId),
    (error: unknown) => error instanceof ConflictException
      && JSON.stringify(error.getResponse()).includes("HAS_VERSION_HISTORY"),
  );

  const historicalActivation = createStatefulService();
  const historicalActivationDefinition = definitionFixture();
  const historicalActivationCreated = await historicalActivation.service.create(17, {
    definition: historicalActivationDefinition,
  });
  historicalActivation.setActivationCount(1);
  await historicalActivation.service.archive(
    17,
    historicalActivationDefinition.templateId,
    draftIdentity(historicalActivationCreated),
  );
  const historicalActivationCatalog = await historicalActivation.service.listMine(17);
  const historicalActivationDraft = await historicalActivation.service.getDraft(
    17,
    historicalActivationDefinition.templateId,
  );
  for (const resource of [historicalActivationCatalog[0], historicalActivationDraft]) {
    assert.equal(resource.canDelete, false);
    assert.deepEqual(
      resource.deleteBlockers.map((blocker: { code: string }) => blocker.code),
      ["HAS_ACTIVATION_HISTORY"],
    );
  }
  await assert.rejects(
    () => historicalActivation.service.deleteDraft(17, historicalActivationDefinition.templateId),
    (error: unknown) => error instanceof ConflictException
      && JSON.stringify(error.getResponse()).includes("HAS_ACTIVATION_HISTORY"),
  );

  const published = createStatefulService();
  await published.service.create(17, { definition: definitionFixture() });
  await published.service.publish(17, definition.templateId, { expectedRevision: 1 });
  await published.service.archive(
    17,
    definition.templateId,
    draftIdentity({ draft: published.getState().draft }),
  );
  await assert.rejects(
    () => published.service.deleteDraft(17, definition.templateId),
    ConflictException,
  );
  assert.equal(published.calls.some((call) => (
    call.operation === "operationLog.create"
    && call.args.data.action === "TEMPLATE_DRAFT_DELETED"
  )), false);
});

test("其他母模板以 sourceReference 保留来源时阻断永久删除", async () => {
  const harness = createStatefulService();
  const definition = definitionFixture();
  const created = await harness.service.create(17, { definition });
  const createdDraft = created.draft;
  assert.ok(createdDraft);
  await harness.service.archive(17, definition.templateId, {
    expectedRevision: createdDraft.revision,
    expectedChecksum: createdDraft.definitionChecksum,
  } as any);
  harness.setLineageReferences([{
    id: created.id + 100,
    sourceReference: definition.templateId,
  }]);

  const catalog = await harness.service.listMine(17);
  assert.equal(catalog[0].canDelete, false);
  assert.equal(catalog[0].deleteBlockers[0].code, "REFERENCED_BY_TEMPLATE");
  await assert.rejects(
    () => harness.service.deleteDraft(17, definition.templateId),
    ConflictException,
  );
  assert.ok(harness.getState().template);
});

test("母模板持久化拒绝无身份、非法 JSON 定义和越界版本说明", async () => {
  const { service } = createStatefulService();
  await assert.rejects(() => service.listMine(undefined), BadRequestException);
  const invalid = definitionFixture() as unknown as Record<string, unknown>;
  invalid.unknownRootField = true;
  await assert.rejects(() => service.create(17, { definition: invalid }), BadRequestException);
  await assert.rejects(
    () => service.create(17, { definition: definitionFixture(), versionNote: "x".repeat(501) }),
    BadRequestException,
  );
});
