import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ApiError } from "../../common/errors/api-error";
import {
  getDynamicTemplateStructureLockViolation,
  validateDynamicTemplateDefinition,
  validateDynamicTemplatePublishDefinition,
} from "./generated/validateTemplateDefinition.generated";
import type { TemplateDefinitionV2 } from "./generated/templateDefinition.generated";
import {
  calculateDynamicTemplateDefinitionChecksum,
  matchesDynamicTemplateDefinitionChecksum,
} from "./dynamic-template-definition-integrity";
import {
  collectDynamicTemplateInstanceReferences,
  getDynamicTemplateDefinitionMediaReferences,
} from "./dynamic-template-instance";
import { MediaAuthorizationResolverService } from "../upload/media-authorization-resolver.service";
import {
  buildManagedMediaShadowReport,
  buildMediaPublicationManifestRows,
  type MediaPublicationResolution,
  type PublicationMediaReference,
} from "./media-publication-manifest";

const TEMPLATE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const MAX_DEFINITION_BYTES = 1024 * 1024;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);

interface ValidatedDefinition {
  definition: TemplateDefinitionV2;
  checksum: string;
}

interface StrictPublishIdentity {
  expectedChecksum: string;
  targetVersion: number;
  versionNote?: string | null;
}

interface ExpectedDraftIdentity {
  expectedRevision: number;
  expectedChecksum: string;
}

class DynamicTemplatePublishRaceError extends Error {}

const TEMPLATE_CONTENT_FIELDS = ["defaultContent", "previewContent"] as const;
interface DynamicTemplateCopySource {
  templateId: string;
  revision: number;
  definitionChecksum: string;
}
type TemplateContentField = (typeof TEMPLATE_CONTENT_FIELDS)[number];

export interface DynamicTemplateDeleteBlocker {
  code: "NOT_IN_TRASH" | "HAS_PUBLISHED_VERSION" | "HAS_VERSION_HISTORY" | "HAS_ACTIVATION_HISTORY" | "REFERENCED_BY_PAGE" | "REFERENCED_BY_TEMPLATE";
  message: string;
}

interface DynamicTemplateDeleteEvidence {
  referencedTemplateIds: ReadonlySet<string>;
  lineageReferencedTemplateIds: ReadonlySet<string>;
  versionHistoryTemplateIds: ReadonlySet<number>;
  activationHistoryTemplateIds: ReadonlySet<number>;
}

type DynamicTemplateWithDraft = Prisma.DynamicTemplateGetPayload<{
  include: { draft: true };
}>;

function canonicalizeJson(value: unknown, depth = 0): unknown {
  if (depth > 30) throw new BadRequestException("模板定义嵌套层级过深");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item, depth + 1));
  if (!value || typeof value !== "object") {
    throw new BadRequestException("模板定义包含不可序列化值");
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (FORBIDDEN_JSON_KEYS.has(key)) throw new BadRequestException("模板定义包含禁止的对象键");
    sorted[key] = canonicalizeJson((value as Record<string, unknown>)[key], depth + 1);
  }
  return sorted;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

function readTemplateContent(
  definition: unknown,
  field: TemplateContentField,
): Record<string, unknown> {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) return {};
  const value = (definition as Record<string, unknown>)[field];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getLegacyEmptyPolicySlotIds(definition: TemplateDefinitionV2): string[] {
  return Object.values(definition.slots)
    .filter((slot) => slot.emptyPolicy === "use-default")
    .map((slot) => slot.slotId);
}

@Injectable()
export class DynamicTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAuthorizationResolver?: MediaAuthorizationResolverService,
  ) {}

  private async resolvePublicationMedia(
    transaction: Prisma.TransactionClient,
    definition: TemplateDefinitionV2,
    version: number,
  ): Promise<{
    references: PublicationMediaReference[];
    resolution: MediaPublicationResolution;
  } | null> {
    if (!this.mediaAuthorizationResolver) return null;
    const references = getDynamicTemplateDefinitionMediaReferences(definition, {
      preserveReferencePaths: true,
    }).map(
      (reference): PublicationMediaReference => ({
        url: reference.url,
        path: reference.path,
        sourceType: "DYNAMIC_TEMPLATE_VERSION",
        sourceId: `${definition.templateId}:v${version}`,
        origin: reference.field.endsWith(".backgroundImage")
          ? "TEMPLATE_BACKGROUND"
          : "TEMPLATE_DEFAULT",
      }),
    );
    const resolution = await this.mediaAuthorizationResolver.resolveReferences(
      references,
      { transaction, mode: "ENFORCE" },
    ) as MediaPublicationResolution;
    return { references, resolution };
  }

  private requireOwnerId(ownerId: number | undefined): number {
    if (!Number.isInteger(ownerId) || Number(ownerId) <= 0) {
      throw new BadRequestException("缺少有效的模板所有者身份");
    }
    return Number(ownerId);
  }

  private normalizeVersionNote(value: string | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim();
    if (normalized.length > 500) throw new BadRequestException("版本说明最多 500 个字符");
    return normalized || null;
  }

  private strictPublishIdentity(input: {
    expectedChecksum?: string;
    targetVersion?: number;
    versionNote?: string;
  }): StrictPublishIdentity | null {
    const hasChecksum = input.expectedChecksum !== undefined;
    const hasTargetVersion = input.targetVersion !== undefined;
    if (hasChecksum !== hasTargetVersion) {
      throw new BadRequestException("严格发布必须同时包含 expectedChecksum 和 targetVersion");
    }
    if (!hasChecksum || !hasTargetVersion) return null;
    if (!/^[a-f0-9]{64}$/.test(input.expectedChecksum!)) {
      throw new BadRequestException("发布校验值必须为 64 位小写 SHA-256");
    }
    if (!Number.isInteger(input.targetVersion) || Number(input.targetVersion) <= 0) {
      throw new BadRequestException("目标发布版本无效");
    }
    return {
      expectedChecksum: input.expectedChecksum!,
      targetVersion: Number(input.targetVersion),
      versionNote: this.normalizeVersionNote(input.versionNote),
    };
  }

  private requireDraftIdentity(input: {
    expectedRevision?: number;
    expectedChecksum?: string;
  }): ExpectedDraftIdentity {
    if (!Number.isInteger(input.expectedRevision) || Number(input.expectedRevision) <= 0) {
      throw new BadRequestException("草稿 revision 无效");
    }
    if (!/^[a-f0-9]{64}$/.test(input.expectedChecksum ?? "")) {
      throw new BadRequestException("草稿校验值必须为 64 位小写 SHA-256");
    }
    return {
      expectedRevision: Number(input.expectedRevision),
      expectedChecksum: input.expectedChecksum!,
    };
  }

  private assertCurrentDraftIdentity(
    draft: { revision: number; definitionChecksum: string; definition: unknown },
    input: { expectedRevision?: number; expectedChecksum?: string },
    conflictMessage: string,
  ): ExpectedDraftIdentity {
    const identity = this.requireDraftIdentity(input);
    if (
      draft.revision !== identity.expectedRevision
      || draft.definitionChecksum !== identity.expectedChecksum
      || !matchesDynamicTemplateDefinitionChecksum(
        draft.definition as TemplateDefinitionV2,
        identity.expectedChecksum,
      )
    ) {
      throw new ConflictException(conflictMessage);
    }
    return identity;
  }

  private publishConflict(
    code: string,
    message: string,
    details: Record<string, string | number> = {},
  ): ApiError {
    return new ApiError(HttpStatus.CONFLICT, code, message, details);
  }

  private assertReplayPublicationState(
    template: { publishedVersion: number; visibility: string },
    targetVersion: number,
  ) {
    if (template.publishedVersion >= targetVersion && template.visibility === "STAFF") return;
    throw this.publishConflict(
      "DYNAMIC_TEMPLATE_PUBLISH_STATE_INTEGRITY_FAILED",
      "目标版本存在，但模板发布指针或可见性未确认该版本已正式发布",
      {
        targetVersion,
        publishedVersion: template.publishedVersion,
        visibility: template.visibility,
      },
    );
  }

  private assertReplayVersionIntegrity(
    templateId: string,
    published: {
      schemaVersion: number;
      definition: unknown;
      definitionChecksum: string;
    },
  ) {
    const definition = this.trustedPublishedDefinition({
      templateId,
      schemaVersion: published.schemaVersion,
      definition: published.definition,
      definitionChecksum: published.definitionChecksum,
    });
    if (!definition) {
      throw this.publishConflict(
        "DYNAMIC_TEMPLATE_VERSION_INTEGRITY_FAILED",
        "目标模板版本完整性校验失败，已拒绝重放发布结果",
      );
    }
  }

  private assertReplayVersionNote(
    published: { versionNote: string | null },
    identity: StrictPublishIdentity,
  ) {
    if (identity.versionNote === undefined || published.versionNote === identity.versionNote) return;
    throw this.publishConflict(
      "DYNAMIC_TEMPLATE_VERSION_NOTE_CONFLICT",
      "目标版本已存在，但规范化版本说明与本次发布不一致",
      { targetVersion: identity.targetVersion },
    );
  }

  private isPublishRaceError(error: unknown): boolean {
    return error instanceof DynamicTemplatePublishRaceError || (
      error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === "P2002" || error.code === "P2034")
    );
  }

  private async resolveStrictPublishRace(
    ownerId: number,
    templateId: string,
    identity: StrictPublishIdentity,
    raceError: unknown,
  ) {
    const template = await this.prisma.dynamicTemplate.findFirst({
      where: {
        templateId: this.assertTemplateId(templateId),
        ...this.editableTemplateScope(ownerId),
      },
      include: { draft: true },
    });
    if (!template) {
      if (raceError instanceof Prisma.PrismaClientKnownRequestError) throw raceError;
      throw this.publishConflict(
        "DYNAMIC_TEMPLATE_PUBLISH_CONCURRENT_CONFLICT",
        "模板在并发发布期间已变化，请刷新后核对",
      );
    }
    const published = await this.prisma.dynamicTemplateVersion.findUnique({
      where: {
        dynamicTemplateId_version: {
          dynamicTemplateId: template.id,
          version: identity.targetVersion,
        },
      },
    });
    if (!published) {
      if (raceError instanceof Prisma.PrismaClientKnownRequestError) throw raceError;
      throw this.publishConflict(
        "DYNAMIC_TEMPLATE_PUBLISH_CONCURRENT_CONFLICT",
        "并发发布结果尚未形成，请重新核对目标版本",
        { targetVersion: identity.targetVersion },
      );
    }
    this.assertReplayPublicationState(template, identity.targetVersion);
    if (published.definitionChecksum !== identity.expectedChecksum) {
      throw this.publishConflict(
        "DYNAMIC_TEMPLATE_TARGET_VERSION_CONFLICT",
        "目标版本已被其他发布占用，校验值与本次发布不一致",
        { targetVersion: identity.targetVersion },
      );
    }
    this.assertReplayVersionIntegrity(template.templateId, published);
    this.assertReplayVersionNote(published, identity);
    return {
      templateId: template.templateId,
      version: published.version,
      published,
      draft: template.draft,
      outcome: "already-published" as const,
    };
  }

  private validateDefinition(input: unknown): ValidatedDefinition {
    const validation = validateDynamicTemplateDefinition(input);
    if (!validation.valid || !validation.definition) {
      const error = validation.issues.find((issue) => issue.level === "error");
      throw new BadRequestException({
        message: error?.message ?? "母模板定义校验失败",
        code: error?.code ?? "INVALID_DYNAMIC_TEMPLATE",
        issues: validation.issues,
      });
    }
    const definition = structuredClone(validation.definition);
    const serialized = canonicalJson(definition);
    if (Buffer.byteLength(serialized, "utf8") > MAX_DEFINITION_BYTES) {
      throw new BadRequestException("模板定义不能超过 1 MiB");
    }
    return {
      definition,
      checksum: createHash("sha256").update(serialized).digest("hex"),
    };
  }

  private validatePublishDefinition(input: unknown): ValidatedDefinition {
    const validation = validateDynamicTemplatePublishDefinition(input);
    if (!validation.valid || !validation.definition) {
      const error = validation.issues.find((issue) => issue.level === "error");
      throw new BadRequestException({
        message: error?.message ?? "母模板发布检查未通过",
        code: error?.code ?? "INVALID_DYNAMIC_TEMPLATE_PUBLISH",
        issues: validation.issues,
      });
    }
    return this.validateDefinition(validation.definition);
  }

  private assertNewTemplateContentEmpty(definition: TemplateDefinitionV2) {
    // schema3 的默认内容是模板可编辑默认值；临时预览仍不得持久化。
    if (definition.schemaVersion >= 3) return;
    const populated = TEMPLATE_CONTENT_FIELDS.filter(
      (field) => Object.keys(readTemplateContent(definition, field)).length > 0,
    );
    if (populated.length === 0) return;
    throw new BadRequestException({
      message: "新母模板只能保存结构、样式和槽位规则；默认内容与预览内容必须为空",
      code: "TEMPLATE_CONTENT_MUST_BE_EMPTY",
      fields: populated,
    });
  }

  private assertNewTemplateUsesCurrentEmptyPolicies(definition: TemplateDefinitionV2) {
    if (definition.schemaVersion >= 3) return;
    const slotIds = getLegacyEmptyPolicySlotIds(definition);
    if (slotIds.length === 0) return;
    throw new BadRequestException({
      message: "新母模板没有可读取的默认内容，空槽位必须隐藏或由页面填写",
      code: "TEMPLATE_LEGACY_EMPTY_POLICY_NOT_ALLOWED",
      slotIds,
    });
  }

  private assertHistoricalTemplateContentPreserved(
    existingDefinition: unknown,
    nextDefinition: TemplateDefinitionV2,
  ) {
    if (nextDefinition.schemaVersion >= 3) return;
    const changedToPopulated = TEMPLATE_CONTENT_FIELDS.filter((field) => {
      const existing = readTemplateContent(existingDefinition, field);
      const next = readTemplateContent(nextDefinition, field);
      return Object.keys(next).length > 0 && canonicalJson(existing) !== canonicalJson(next);
    });
    if (changedToPopulated.length === 0) return;
    throw new BadRequestException({
      message: "历史默认内容与预览内容只能保持原样或显式清空，不能新增或修改",
      code: "TEMPLATE_CONTENT_IS_READ_ONLY",
      fields: changedToPopulated,
    });
  }

  private assertHistoricalEmptyPoliciesPreserved(
    existingDefinition: unknown,
    nextDefinition: TemplateDefinitionV2,
  ) {
    if (nextDefinition.schemaVersion >= 3) return;
    const existingSlots = existingDefinition
      && typeof existingDefinition === "object"
      && !Array.isArray(existingDefinition)
      && (existingDefinition as Record<string, unknown>).slots
      && typeof (existingDefinition as Record<string, unknown>).slots === "object"
      && !Array.isArray((existingDefinition as Record<string, unknown>).slots)
      ? (existingDefinition as { slots: Record<string, { emptyPolicy?: unknown }> }).slots
      : {};
    const addedSlotIds = Object.values(nextDefinition.slots)
      .filter((slot) => (
        slot.emptyPolicy === "use-default"
        && existingSlots[slot.slotId]?.emptyPolicy !== "use-default"
      ))
      .map((slot) => slot.slotId);
    if (addedSlotIds.length === 0) return;
    throw new BadRequestException({
      message: "历史 use-default 只能原样保留或改为 hide，不能新增或恢复",
      code: "TEMPLATE_LEGACY_EMPTY_POLICY_IS_READ_ONLY",
      slotIds: addedSlotIds,
    });
  }

  private definitionProjection(definition: TemplateDefinitionV2) {
    return {
      name: definition.name.trim(),
      category: definition.metadata.category.trim(),
      purpose: definition.metadata.purpose.trim(),
      layoutType: definition.metadata.layoutType.trim(),
      description: definition.description?.trim() || null,
      slotSummary: definition.metadata.slotSummary.trim(),
      recommendedFor: definition.metadata.recommendedFor as Prisma.InputJsonValue,
      tags: definition.metadata.tags as Prisma.InputJsonValue,
      definitionSchemaVersion: definition.schemaVersion,
    };
  }

  private trustedPublishedDefinition(input: {
    templateId: string;
    schemaVersion: number;
    definition: unknown;
    definitionChecksum: string;
  }): TemplateDefinitionV2 | null {
    const validation = validateDynamicTemplateDefinition(input.definition);
    if (
      !validation.valid
      || !validation.definition
      || validation.definition.templateId !== input.templateId
      || validation.definition.schemaVersion !== input.schemaVersion
      || !matchesDynamicTemplateDefinitionChecksum(
        validation.definition,
        input.definitionChecksum,
      )
    ) return null;
    return validation.definition;
  }

  private assertTemplateId(templateId: string): string {
    if (!TEMPLATE_ID_PATTERN.test(templateId)) throw new BadRequestException("母模板 ID 无效");
    return templateId;
  }

  private editableTemplateScope(ownerId: number): Prisma.DynamicTemplateWhereInput {
    return { ownerId, sourceType: "CUSTOM" };
  }

  private async getOwnedTemplate(
    ownerId: number,
    templateId: string,
    client: Pick<Prisma.TransactionClient, "dynamicTemplate"> = this.prisma,
  ) {
    const template = await client.dynamicTemplate.findFirst({
      where: {
        templateId: this.assertTemplateId(templateId),
        ...this.editableTemplateScope(ownerId),
      },
      include: { draft: true },
    });
    if (!template) throw new NotFoundException("模板不存在或无权访问");
    return template;
  }

  private async collectReferencedTemplateIds(
    client: Pick<Prisma.TransactionClient, "pageDocument" | "pageScheme"> = this.prisma,
  ): Promise<Set<string>> {
    const [documents, schemes] = await Promise.all([
      client.pageDocument.findMany({
        select: {
          puckData: true,
          revisions: { select: { puckData: true } },
          localizations: { select: { puckData: true } },
        },
      }),
      client.pageScheme.findMany({ select: { puckData: true } }),
    ]);
    const referenced = new Set<string>();
    const collect = (puckData: unknown) => {
      for (const reference of collectDynamicTemplateInstanceReferences(puckData)) {
        referenced.add(reference.templateId);
      }
    };
    for (const document of documents) {
      collect(document.puckData);
      for (const revision of document.revisions ?? []) collect(revision.puckData);
      for (const localization of document.localizations ?? []) collect(localization.puckData);
    }
    for (const scheme of schemes) collect(scheme.puckData);
    return referenced;
  }

  private async collectDeleteEvidence(
    dynamicTemplates: readonly { id: number; templateId: string }[],
    client: Pick<
      Prisma.TransactionClient,
      "dynamicTemplate" | "dynamicTemplateVersion" | "dynamicTemplateActivation" | "pageDocument" | "pageScheme"
    > = this.prisma,
  ): Promise<DynamicTemplateDeleteEvidence> {
    const uniqueIds = [...new Set(dynamicTemplates.map((template) => template.id))];
    const uniqueTemplateIds = [...new Set(dynamicTemplates.map((template) => template.templateId))];
    if (uniqueIds.length === 0) {
      return {
        referencedTemplateIds: new Set(),
        lineageReferencedTemplateIds: new Set(),
        versionHistoryTemplateIds: new Set(),
        activationHistoryTemplateIds: new Set(),
      };
    }
    const [referencedTemplateIds, lineageReferences, versions, activations] = await Promise.all([
      this.collectReferencedTemplateIds(client),
      client.dynamicTemplate.findMany({
        where: {
          sourceReference: { in: uniqueTemplateIds },
          id: { notIn: uniqueIds },
        },
        distinct: ["sourceReference"],
        select: { sourceReference: true },
      }),
      client.dynamicTemplateVersion.findMany({
        where: { dynamicTemplateId: { in: uniqueIds } },
        distinct: ["dynamicTemplateId"],
        select: { dynamicTemplateId: true },
      }),
      client.dynamicTemplateActivation.findMany({
        where: { dynamicTemplateId: { in: uniqueIds } },
        distinct: ["dynamicTemplateId"],
        select: { dynamicTemplateId: true },
      }),
    ]);
    return {
      referencedTemplateIds,
      lineageReferencedTemplateIds: new Set(lineageReferences.flatMap((item) => (
        item.sourceReference ? [item.sourceReference] : []
      ))),
      versionHistoryTemplateIds: new Set(versions.map((item) => item.dynamicTemplateId)),
      activationHistoryTemplateIds: new Set(activations.map((item) => item.dynamicTemplateId)),
    };
  }

  private catalogDeleteBlockers(
    template: {
      id: number;
      sourceType: string;
      sourceReference: string | null;
      status: string;
      publishedVersion: number;
      templateId: string;
    },
    evidence: DynamicTemplateDeleteEvidence,
  ): DynamicTemplateDeleteBlocker[] {
    const blockers: DynamicTemplateDeleteBlocker[] = [];
    if (template.status !== "ARCHIVED") {
      blockers.push({ code: "NOT_IN_TRASH", message: "请先将模板移入回收站，再永久删除。" });
    }
    if (template.publishedVersion > 0) {
      blockers.push({ code: "HAS_PUBLISHED_VERSION", message: "模板已生成正式版本，必须保留历史页面；只能留在回收站或恢复。" });
    }
    if (evidence.versionHistoryTemplateIds.has(template.id)) {
      blockers.push({ code: "HAS_VERSION_HISTORY", message: "模板存在正式版本历史，不能永久删除。" });
    }
    if (evidence.activationHistoryTemplateIds.has(template.id)) {
      blockers.push({ code: "HAS_ACTIVATION_HISTORY", message: "模板存在版本激活历史，不能永久删除。" });
    }
    if (evidence.referencedTemplateIds.has(template.templateId)) {
      blockers.push({ code: "REFERENCED_BY_PAGE", message: "已有页面、历史版本、本地化页面或装修方案引用该模板。" });
    }
    if (evidence.lineageReferencedTemplateIds.has(template.templateId)) {
      blockers.push({ code: "REFERENCED_BY_TEMPLATE", message: "已有其他模板引用此模板作为来源，不能永久删除。" });
    }
    return blockers;
  }

  private async withDeleteCapability<T extends {
    id: number;
    sourceType: string;
    sourceReference: string | null;
    status: string;
    publishedVersion: number;
    templateId: string;
  }>(template: T) {
    const evidence = await this.collectDeleteEvidence([template]);
    const deleteBlockers = this.catalogDeleteBlockers(template, evidence);
    return { ...template, canDelete: deleteBlockers.length === 0, deleteBlockers };
  }

  async listMine(ownerId?: number) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    const templates = await this.prisma.dynamicTemplate.findMany({
      where: this.editableTemplateScope(resolvedOwnerId),
      include: { draft: true },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
    });
    const evidence = await this.collectDeleteEvidence(templates);
    return templates.map((template) => {
      const deleteBlockers = this.catalogDeleteBlockers(template, evidence);
      return { ...template, canDelete: deleteBlockers.length === 0, deleteBlockers };
    });
  }

  async listPublished() {
    const templates = await this.prisma.dynamicTemplate.findMany({
      where: {
        status: "ACTIVE",
        visibility: "STAFF",
        sourceType: "CUSTOM",
        publishedVersion: { gt: 0 },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const publishedVersions = templates.length === 0
      ? []
      : await this.prisma.dynamicTemplateVersion.findMany({
        where: {
          OR: templates.map((template) => ({
            dynamicTemplateId: template.id,
            version: template.publishedVersion,
          })),
        },
      });
    const publishedVersionKey = (dynamicTemplateId: number, version: number) => (
      `${dynamicTemplateId}:${version}`
    );
    const publishedByTemplateVersion = new Map(
      publishedVersions.map((published) => [
        publishedVersionKey(published.dynamicTemplateId, published.version),
        published,
      ]),
    );
    return templates.flatMap((template) => {
      const published = publishedByTemplateVersion.get(
        publishedVersionKey(template.id, template.publishedVersion),
      );
      if (!published) return [];
      const definition = this.trustedPublishedDefinition({
        templateId: template.templateId,
        schemaVersion: published.schemaVersion,
        definition: published.definition,
        definitionChecksum: published.definitionChecksum,
      });
      if (!definition) return [];
      // 正式目录资料与预览使用同一发布快照，不能混入下一版草稿的投影。
      const publishedMetadata = this.definitionProjection(definition);
      return [{
        templateId: template.templateId,
        name: publishedMetadata.name,
        category: publishedMetadata.category,
        purpose: publishedMetadata.purpose,
        layoutType: publishedMetadata.layoutType,
        description: publishedMetadata.description,
        slotSummary: publishedMetadata.slotSummary,
        recommendedFor: publishedMetadata.recommendedFor,
        tags: publishedMetadata.tags,
        sourceReference: template.sourceReference,
        version: published.version,
        schemaVersion: published.schemaVersion,
        definition,
        definitionChecksum: calculateDynamicTemplateDefinitionChecksum(definition),
        versionNote: published.versionNote,
        publishedAt: published.publishedAt,
      }];
    });
  }

  async getDraft(ownerId: number | undefined, templateId: string) {
    const template = await this.getOwnedTemplate(this.requireOwnerId(ownerId), templateId);
    return this.withDeleteCapability(template);
  }

  private isExactRebuiltDraft(
    template: DynamicTemplateWithDraft,
    published: {
      dynamicTemplateId: number;
      version: number;
      schemaVersion: number;
      definition: unknown;
      definitionChecksum: string;
    } | null,
    identity: { expectedVersion: number; expectedChecksum: string },
  ) {
    return template.status === "ACTIVE"
      && template.publishedVersion === identity.expectedVersion
      && template.draft?.baseVersion === identity.expectedVersion
      && template.draft.revision === 1
      && template.draft.definitionChecksum === identity.expectedChecksum
      && published?.dynamicTemplateId === template.id
      && published.version === identity.expectedVersion
      && published.definitionChecksum === identity.expectedChecksum
      && Boolean(this.trustedPublishedDefinition({
        templateId: template.templateId,
        schemaVersion: published.schemaVersion,
        definition: published.definition,
        definitionChecksum: published.definitionChecksum,
      }))
      && Boolean(this.trustedPublishedDefinition({
        templateId: template.templateId,
        schemaVersion: published.schemaVersion,
        definition: template.draft.definition,
        definitionChecksum: template.draft.definitionChecksum,
      }));
  }

  async rebuildDraftFromPublished(
    ownerId: number | undefined,
    templateId: string,
    input: { expectedVersion: number; expectedChecksum: string },
  ) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    const canonicalTemplateId = this.assertTemplateId(templateId);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new BadRequestException("正式版本号无效");
    }
    if (!/^[a-f0-9]{64}$/.test(input.expectedChecksum)) {
      throw new BadRequestException("正式版本校验值必须为 64 位小写 SHA-256");
    }
    const identity = {
      expectedVersion: Number(input.expectedVersion),
      expectedChecksum: input.expectedChecksum,
    };
    try {
      const rebuilt = await this.prisma.$transaction(async (tx) => {
        const template = await tx.dynamicTemplate.findFirst({
          where: {
            templateId: canonicalTemplateId,
            ...this.editableTemplateScope(resolvedOwnerId),
            status: "ACTIVE",
          },
          include: { draft: true },
        });
        if (!template) throw new NotFoundException("活动模板不存在或无权访问");
        if (template.draft) {
          throw this.publishConflict(
            "DYNAMIC_TEMPLATE_DRAFT_ALREADY_EXISTS",
            "模板已有可编辑草稿，已拒绝覆盖",
            { expectedVersion: identity.expectedVersion },
          );
        }
        if (template.publishedVersion !== identity.expectedVersion) {
          throw this.publishConflict(
            "DYNAMIC_TEMPLATE_DRAFT_REBUILD_VERSION_CONFLICT",
            "当前正式版本已变化，请重新读取后再重建草稿",
            {
              expectedVersion: identity.expectedVersion,
              currentVersion: template.publishedVersion,
            },
          );
        }
        const published = await tx.dynamicTemplateVersion.findUnique({
          where: {
            dynamicTemplateId_version: {
              dynamicTemplateId: template.id,
              version: identity.expectedVersion,
            },
          },
        });
        if (!published) {
          throw this.publishConflict(
            "DYNAMIC_TEMPLATE_PUBLISHED_VERSION_MISSING",
            "当前正式版本记录缺失，已拒绝重建草稿",
            { expectedVersion: identity.expectedVersion },
          );
        }
        if (published.definitionChecksum !== identity.expectedChecksum) {
          throw this.publishConflict(
            "DYNAMIC_TEMPLATE_DRAFT_REBUILD_CHECKSUM_CONFLICT",
            "当前正式版本校验值已变化，请重新读取后再重建草稿",
            { expectedVersion: identity.expectedVersion },
          );
        }
        const definition = this.trustedPublishedDefinition({
          templateId: template.templateId,
          schemaVersion: published.schemaVersion,
          definition: published.definition,
          definitionChecksum: published.definitionChecksum,
        });
        if (!definition) {
          throw this.publishConflict(
            "DYNAMIC_TEMPLATE_VERSION_INTEGRITY_FAILED",
            "当前正式版本完整性校验失败，已拒绝重建草稿",
            { expectedVersion: identity.expectedVersion },
          );
        }
        const draft = await tx.dynamicTemplateDraft.create({
          data: {
            dynamicTemplateId: template.id,
            baseVersion: identity.expectedVersion,
            revision: 1,
            definition: definition as unknown as Prisma.InputJsonValue,
            definitionChecksum: identity.expectedChecksum,
            versionNote: null,
            updatedById: resolvedOwnerId,
          },
        });
        const rebuiltAt = new Date();
        await tx.operationLog.create({
          data: {
            userId: resolvedOwnerId,
            action: "TEMPLATE_DRAFT_REBUILT_FROM_PUBLISHED",
            module: "page-builder-template",
            targetId: template.id,
            detail: JSON.stringify({
              schemaVersion: 1,
              event: "TEMPLATE_DRAFT_REBUILT_FROM_PUBLISHED",
              actor: resolvedOwnerId,
              timestamp: rebuiltAt.toISOString(),
              templateId: template.templateId,
              fromVersion: identity.expectedVersion,
              toRevision: 1,
              result: "succeeded",
            }),
          },
        });
        return { ...template, draft };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      return this.withDeleteCapability(rebuilt);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)
        || (error.code !== "P2002" && error.code !== "P2034")) throw error;
      const winner = await this.prisma.dynamicTemplate.findFirst({
        where: {
          templateId: canonicalTemplateId,
          ...this.editableTemplateScope(resolvedOwnerId),
          status: "ACTIVE",
        },
        include: { draft: true },
      });
      const published = winner
        ? await this.prisma.dynamicTemplateVersion.findUnique({
            where: {
              dynamicTemplateId_version: {
                dynamicTemplateId: winner.id,
                version: identity.expectedVersion,
              },
            },
          })
        : null;
      if (winner && this.isExactRebuiltDraft(winner, published, identity)) {
        return this.withDeleteCapability(winner);
      }
      throw this.publishConflict(
        "DYNAMIC_TEMPLATE_DRAFT_REBUILD_CONCURRENT_CONFLICT",
        "模板或草稿在重建期间已变化，请刷新后重试",
        { expectedVersion: identity.expectedVersion },
      );
    }
  }

  private async createInTransaction(
    resolvedOwnerId: number,
    input: { definition: unknown; versionNote?: string; copySource?: DynamicTemplateCopySource },
    tx: Pick<Prisma.TransactionClient, "dynamicTemplate">,
  ): Promise<DynamicTemplateWithDraft> {
    const validated = this.validateDefinition(input.definition);
    if (input.copySource !== undefined) {
      const identity = input.copySource;
      if (!identity || typeof identity !== "object" || Array.isArray(identity)
        || Object.keys(identity).some((key) => !["templateId", "revision", "definitionChecksum"].includes(key))
        || typeof identity.templateId !== "string" || !Number.isInteger(identity.revision) || identity.revision < 1
        || typeof identity.definitionChecksum !== "string" || !/^[a-f0-9]{64}$/.test(identity.definitionChecksum)) {
        throw new BadRequestException("复制来源必须包含精确模板、草稿修订与校验值");
      }
      const source = await this.getOwnedTemplate(resolvedOwnerId, identity.templateId, tx);
      if (source.status !== "ACTIVE" || !source.draft || source.draft.revision !== identity.revision
        || source.draft.definitionChecksum !== identity.definitionChecksum) {
        throw new ConflictException("复制来源已变化，请重新选择模板");
      }
      const original = this.validateDefinition(source.draft.definition);
      if (original.checksum !== identity.definitionChecksum || original.definition.templateId !== source.templateId) {
        throw new ConflictException("复制来源完整性校验失败，请重新加载模板");
      }
      const expected = { ...original.definition, templateId: validated.definition.templateId, name: validated.definition.name };
      if (validated.definition.templateId === source.templateId || canonicalJson(expected) !== canonicalJson(validated.definition)) {
        throw new BadRequestException("复制只能更换模板身份与名称；请先完成复制，再调整设计");
      }
    } else {
      this.assertNewTemplateContentEmpty(validated.definition);
      this.assertNewTemplateUsesCurrentEmptyPolicies(validated.definition);
    }
    const templateId = this.assertTemplateId(validated.definition.templateId);
    return tx.dynamicTemplate.create({
      data: {
        templateId,
        ownerId: resolvedOwnerId,
        sourceType: "CUSTOM",
        visibility: "PRIVATE",
        status: "ACTIVE",
        ...this.definitionProjection(validated.definition),
        draft: {
          create: {
            revision: 1,
            definition: validated.definition as unknown as Prisma.InputJsonValue,
            definitionChecksum: validated.checksum,
            versionNote: this.normalizeVersionNote(input.versionNote) ?? null,
            updatedById: resolvedOwnerId,
          },
        },
      },
      include: { draft: true },
    });
  }

  async create(
    ownerId: number | undefined,
    input: { definition: unknown; versionNote?: string; copySource?: DynamicTemplateCopySource },
  ) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    try {
      const created = await this.prisma.$transaction((tx) => (
        this.createInTransaction(resolvedOwnerId, input, tx)
      ), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      return this.withDeleteCapability(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("当前账号已存在同名模板，或模板 ID 已被使用");
      }
      throw error;
    }
  }

  async updateDraft(
    ownerId: number | undefined,
    templateId: string,
    input: {
      expectedRevision: number;
      definition: unknown;
      versionNote?: string;
      restoreFromVersion?: number;
      restoreFromChecksum?: string;
    },
  ) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision <= 0) {
      throw new BadRequestException("草稿 revision 无效");
    }
    const existing = await this.getOwnedTemplate(resolvedOwnerId, templateId);
    if (existing.status !== "ACTIVE") throw new ConflictException("已归档模板不能保存草稿");
    if (!existing.draft) throw new ConflictException("模板草稿不存在");
    if (existing.draft.revision !== input.expectedRevision) {
      throw new ConflictException("模板草稿已被其他会话更新，请刷新后重试");
    }
    const validated = this.validateDefinition(input.definition);
    if (validated.definition.templateId !== existing.templateId) {
      throw new BadRequestException("草稿不能改变 templateId；如需新身份，请使用“新建模板”");
    }
    const hasRestoreVersion = input.restoreFromVersion !== undefined;
    const hasRestoreChecksum = input.restoreFromChecksum !== undefined;
    if (hasRestoreVersion !== hasRestoreChecksum) {
      throw new BadRequestException("历史恢复来源必须同时包含版本号和校验值");
    }
    let structureBaseline = this.validateDefinition(existing.draft.definition).definition;
    const existingSchemaVersion = structureBaseline.schemaVersion;
    let historicalContentBaseline: unknown = existing.draft.definition;
    if (hasRestoreVersion && hasRestoreChecksum) {
      if (!Number.isInteger(input.restoreFromVersion) || Number(input.restoreFromVersion) <= 0) {
        throw new BadRequestException("历史恢复版本无效");
      }
      if (!/^[a-f0-9]{64}$/.test(input.restoreFromChecksum!)) {
        throw new BadRequestException("历史恢复校验值无效");
      }
      const sourceVersion = await this.prisma.dynamicTemplateVersion.findUnique({
        where: {
          dynamicTemplateId_version: {
            dynamicTemplateId: existing.id,
            version: input.restoreFromVersion!,
          },
        },
      });
      if (!sourceVersion) throw new NotFoundException("历史恢复来源版本不存在");
      const trustedSource = this.trustedPublishedDefinition({
        templateId: existing.templateId,
        schemaVersion: sourceVersion.schemaVersion,
        definition: sourceVersion.definition,
        definitionChecksum: sourceVersion.definitionChecksum,
      });
      if (!trustedSource) {
        throw new ConflictException("历史恢复来源完整性校验失败，已拒绝保存");
      }
      if (sourceVersion.definitionChecksum !== input.restoreFromChecksum) {
        throw new ConflictException("历史恢复来源已变化，请重新选择版本");
      }
      structureBaseline = trustedSource;
      const crossesDefaultContentSchema = (existingSchemaVersion >= 3)
        !== (trustedSource.schemaVersion >= 3);
      if (crossesDefaultContentSchema && validated.definition.schemaVersion === trustedSource.schemaVersion) {
        // 跨默认内容语义恢复只信任已核验历史版本；不把当前 schema3 文案混进旧结构。
        historicalContentBaseline = trustedSource;
      }
    }
    const structureLockViolation = getDynamicTemplateStructureLockViolation(
      structureBaseline,
      validated.definition,
      { mode: "persistenceSnapshot" },
    );
    if (structureLockViolation) {
      throw new BadRequestException({
        message: structureLockViolation,
        code: "TEMPLATE_STRUCTURE_LOCKED",
      });
    }
    this.assertHistoricalTemplateContentPreserved(historicalContentBaseline, validated.definition);
    this.assertHistoricalEmptyPoliciesPreserved(historicalContentBaseline, validated.definition);
    const note = this.normalizeVersionNote(input.versionNote);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const updatedDraft = await tx.dynamicTemplateDraft.updateMany({
          where: { id: existing.draft!.id, revision: input.expectedRevision },
          data: {
            revision: { increment: 1 },
            definition: validated.definition as unknown as Prisma.InputJsonValue,
            definitionChecksum: validated.checksum,
            ...(note !== undefined ? { versionNote: note } : {}),
            updatedById: resolvedOwnerId,
          },
        });
        if (updatedDraft.count !== 1) {
          throw new ConflictException("模板草稿已被其他会话更新，请刷新后重试");
        }
        const updatedTemplate = await tx.dynamicTemplate.updateMany({
          where: {
            id: existing.id,
            ...this.editableTemplateScope(resolvedOwnerId),
            status: "ACTIVE",
          },
          data: this.definitionProjection(validated.definition),
        });
        if (updatedTemplate.count !== 1) {
          throw new ConflictException("模板状态已变化，请刷新目录后重试");
        }
        return tx.dynamicTemplate.findUnique({
          where: { id: existing.id },
          include: { draft: true },
        });
      });
      if (!updated) throw new ConflictException("模板草稿保存后无法回读，请刷新后重试");
      return this.withDeleteCapability(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("当前账号已存在同名模板");
      }
      throw error;
    }
  }

  async publish(
    ownerId: number | undefined,
    templateId: string,
    input: {
      expectedRevision: number;
      versionNote?: string;
      expectedChecksum?: string;
      targetVersion?: number;
    },
  ) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision <= 0) {
      throw new BadRequestException("草稿 revision 无效");
    }
    const strictIdentity = this.strictPublishIdentity(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.dynamicTemplate.findFirst({
          where: {
            templateId: this.assertTemplateId(templateId),
            ...this.editableTemplateScope(resolvedOwnerId),
          },
          include: { draft: true },
        });
        if (!template) throw new NotFoundException("模板不存在或无权访问");
        if (strictIdentity) {
          const existingTarget = await tx.dynamicTemplateVersion.findUnique({
            where: {
              dynamicTemplateId_version: {
                dynamicTemplateId: template.id,
                version: strictIdentity.targetVersion,
              },
            },
          });
          if (existingTarget) {
            this.assertReplayPublicationState(template, strictIdentity.targetVersion);
            if (existingTarget.definitionChecksum !== strictIdentity.expectedChecksum) {
              throw this.publishConflict(
                "DYNAMIC_TEMPLATE_TARGET_VERSION_CONFLICT",
                "目标版本已存在，但校验值与本次发布不一致",
                { targetVersion: strictIdentity.targetVersion },
              );
            }
            this.assertReplayVersionIntegrity(template.templateId, existingTarget);
            this.assertReplayVersionNote(existingTarget, strictIdentity);
            return {
              templateId: template.templateId,
              version: existingTarget.version,
              published: existingTarget,
              draft: template.draft,
              outcome: "already-published" as const,
            };
          }
          const nextExpectedVersion = template.publishedVersion + 1;
          if (strictIdentity.targetVersion !== nextExpectedVersion) {
            throw this.publishConflict(
              "DYNAMIC_TEMPLATE_TARGET_VERSION_CONFLICT",
              "目标版本必须是当前正式版本的下一版",
              {
                targetVersion: strictIdentity.targetVersion,
                nextExpectedVersion,
              },
            );
          }
        }

        if (template.status !== "ACTIVE") {
          if (strictIdentity) {
            throw this.publishConflict(
              "DYNAMIC_TEMPLATE_STATUS_CONFLICT",
              "已归档模板不能创建新的正式版本",
              { status: template.status, targetVersion: strictIdentity.targetVersion },
            );
          }
          throw new ConflictException("已归档模板不能发布");
        }
        if (!template.draft) {
          if (strictIdentity) {
            throw this.publishConflict(
              "DYNAMIC_TEMPLATE_DRAFT_INTEGRITY_FAILED",
              "模板草稿不存在，已拒绝创建正式版本",
              { targetVersion: strictIdentity.targetVersion },
            );
          }
          throw new ConflictException("模板草稿不存在");
        }

        if (template.draft.revision !== input.expectedRevision) {
          if (strictIdentity) {
            throw this.publishConflict(
              "DYNAMIC_TEMPLATE_DRAFT_REVISION_CONFLICT",
              "模板草稿已被其他会话更新，请重新执行发布检查",
              {
                expectedRevision: input.expectedRevision,
                currentRevision: template.draft.revision,
              },
            );
          }
          throw new ConflictException("模板草稿已被其他会话更新，请刷新后重试");
        }
        if (
          strictIdentity
          && template.draft.definitionChecksum !== strictIdentity.expectedChecksum
        ) {
          throw this.publishConflict(
            "DYNAMIC_TEMPLATE_DRAFT_CHECKSUM_CONFLICT",
            "模板草稿校验值已变化，请重新执行发布检查",
          );
        }
        const validated = this.validatePublishDefinition(template.draft.definition);
        if (validated.definition.templateId !== template.templateId) {
          throw new BadRequestException("草稿 templateId 与模板记录不一致");
        }
        if (strictIdentity && validated.checksum !== strictIdentity.expectedChecksum) {
          throw this.publishConflict(
            "DYNAMIC_TEMPLATE_DEFINITION_CHECKSUM_CONFLICT",
            "模板草稿内容与发布检查校验值不一致",
          );
        }
        if (template.publishedVersion > 0) {
          const current = await tx.dynamicTemplateVersion.findUnique({
            where: {
              dynamicTemplateId_version: {
                dynamicTemplateId: template.id,
                version: template.publishedVersion,
              },
            },
          });
          if (current?.definitionChecksum === validated.checksum) {
            throw new BadRequestException("模板内容与当前正式版本相同，无需重复发布");
          }
        }
        const nextVersion = strictIdentity?.targetVersion ?? template.publishedVersion + 1;
        const requestedVersionNote = strictIdentity
          ? strictIdentity.versionNote
          : this.normalizeVersionNote(input.versionNote);
        const versionNote = requestedVersionNote === undefined
          ? template.draft.versionNote ?? null
          : requestedVersionNote;
        const publicationMedia = await this.resolvePublicationMedia(
          tx,
          validated.definition,
          nextVersion,
        );
        const publicationMediaErrors = publicationMedia?.resolution.issues.filter(
          (issue) => issue.severity === "ERROR",
        ) ?? [];
        if (publicationMediaErrors.length > 0) {
          throw new BadRequestException({
            message: `母模板素材校验失败：${publicationMediaErrors.slice(0, 8).map((issue) => issue.message).join("；")}`,
            code: "DYNAMIC_TEMPLATE_MEDIA_INELIGIBLE",
            issues: publicationMediaErrors,
            shadowReport: buildManagedMediaShadowReport(publicationMedia!.resolution),
          });
        }
        const claimedDraft = await tx.dynamicTemplateDraft.updateMany({
          where: { id: template.draft.id, revision: input.expectedRevision },
          data: {
            baseVersion: nextVersion,
            revision: { increment: 1 },
            definitionChecksum: validated.checksum,
            versionNote: null,
            updatedById: resolvedOwnerId,
          },
        });
        if (claimedDraft.count !== 1) {
          if (strictIdentity) throw new DynamicTemplatePublishRaceError();
          throw new ConflictException("模板草稿已被其他会话更新，请刷新后重试");
        }
        const advanced = await tx.dynamicTemplate.updateMany({
          where: {
            id: template.id,
            ...this.editableTemplateScope(resolvedOwnerId),
            status: "ACTIVE",
            publishedVersion: template.publishedVersion,
          },
          data: {
            publishedVersion: nextVersion,
            visibility: "STAFF",
            ...this.definitionProjection(validated.definition),
          },
        });
        if (advanced.count !== 1) {
          if (strictIdentity) throw new DynamicTemplatePublishRaceError();
          throw new ConflictException("模板已由其他会话发布，请刷新后重试");
        }
        const published = await tx.dynamicTemplateVersion.create({
          data: {
            dynamicTemplateId: template.id,
            version: nextVersion,
            schemaVersion: validated.definition.schemaVersion,
            definition: validated.definition as unknown as Prisma.InputJsonValue,
            definitionChecksum: validated.checksum,
            versionNote,
            publishedById: resolvedOwnerId,
          },
        });
        if (publicationMedia) {
          const manifestRows = buildMediaPublicationManifestRows(
            publicationMedia.references,
            publicationMedia.resolution,
          );
          if (manifestRows.length > 0) {
            await tx.dynamicTemplateVersionMediaAsset.createMany({
              data: manifestRows.map((row) => ({
                ...row,
                dynamicTemplateVersionId: published.id,
              })),
            });
          }
        }
        const draft = await tx.dynamicTemplateDraft.findUnique({
          where: { id: template.draft.id },
        });
        await tx.operationLog.create({
          data: {
            userId: resolvedOwnerId,
            action: "TEMPLATE_VERSION_PUBLISHED",
            module: "page-builder-template",
            targetId: template.id,
            detail: JSON.stringify({
              schemaVersion: 1,
              event: "TEMPLATE_VERSION_PUBLISHED",
              actor: resolvedOwnerId,
              timestamp: published.publishedAt.toISOString(),
              templateId: template.templateId,
              fromVersion: template.publishedVersion,
              toVersion: published.version,
              ...(publicationMedia ? {
                managedMediaAuthorization:
                  buildManagedMediaShadowReport(publicationMedia.resolution),
              } : {}),
              result: "succeeded",
            }),
          },
        });
        return {
          templateId: template.templateId,
          version: published.version,
          published,
          draft,
          outcome: "published" as const,
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (strictIdentity && this.isPublishRaceError(error)) {
        return this.resolveStrictPublishRace(
          resolvedOwnerId,
          templateId,
          strictIdentity,
          error,
        );
      }
      if (
        !strictIdentity
        && error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2034"
      ) {
        throw this.publishConflict(
          "DYNAMIC_TEMPLATE_PUBLISH_CONCURRENT_CONFLICT",
          "模板已由其他会话发布，请刷新后重试",
        );
      }
      throw error;
    }
  }

  async listVersions(
    ownerId: number | undefined,
    templateId: string,
    beforeVersion?: number,
    requestedLimit = 20,
  ) {
    const template = await this.getOwnedTemplate(this.requireOwnerId(ownerId), templateId);
    if (beforeVersion !== undefined && (!Number.isInteger(beforeVersion) || beforeVersion <= 0)) {
      throw new BadRequestException("模板版本游标无效");
    }
    if (!Number.isInteger(requestedLimit) || requestedLimit <= 0) {
      throw new BadRequestException("模板版本分页大小无效");
    }
    const limit = Math.min(requestedLimit, 50);
    const rows = await this.prisma.dynamicTemplateVersion.findMany({
      where: {
        dynamicTemplateId: template.id,
        ...(beforeVersion === undefined ? {} : { version: { lt: beforeVersion } }),
      },
      orderBy: { version: "desc" },
      take: limit + 1,
      select: {
        id: true,
        dynamicTemplateId: true,
        version: true,
        schemaVersion: true,
        definitionChecksum: true,
        versionNote: true,
        publishedAt: true,
      },
    });
    const items = rows.slice(0, limit);
    return {
      items,
      nextBeforeVersion: rows.length > limit ? items.at(-1)?.version ?? null : null,
    };
  }

  async getPublishedVersion(templateId: string, version: number) {
    if (!Number.isInteger(version) || version <= 0) throw new BadRequestException("模板版本无效");
    const template = await this.prisma.dynamicTemplate.findFirst({
      where: {
        templateId: this.assertTemplateId(templateId),
        visibility: "STAFF",
        publishedVersion: { gte: version },
      },
    });
    if (!template) throw new NotFoundException("正式模板不存在或无权访问");
    const published = await this.prisma.dynamicTemplateVersion.findUnique({
      where: { dynamicTemplateId_version: { dynamicTemplateId: template.id, version } },
    });
    if (!published) throw new NotFoundException("模板版本不存在");
    const definition = this.trustedPublishedDefinition({
      templateId: template.templateId,
      schemaVersion: published.schemaVersion,
      definition: published.definition,
      definitionChecksum: published.definitionChecksum,
    });
    if (!definition) throw new ConflictException("正式模板版本完整性校验失败，已拒绝加载");
    const publishedMetadata = this.definitionProjection(definition);
    return {
      templateId: template.templateId,
      name: publishedMetadata.name,
      category: publishedMetadata.category,
      status: template.status,
      purpose: publishedMetadata.purpose,
      layoutType: publishedMetadata.layoutType,
      description: publishedMetadata.description,
      slotSummary: publishedMetadata.slotSummary,
      recommendedFor: publishedMetadata.recommendedFor,
      tags: publishedMetadata.tags,
      sourceReference: template.sourceReference,
      ...published,
      definition,
      definitionChecksum: calculateDynamicTemplateDefinitionChecksum(definition),
    };
  }

  async archive(
    ownerId: number | undefined,
    templateId: string,
    input: {
      expectedRevision?: number;
      expectedChecksum?: string;
    },
  ) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    const canonicalTemplateId = this.assertTemplateId(templateId);
    const expectedIdentity = this.requireDraftIdentity(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.dynamicTemplate.findFirst({
          where: {
            templateId: canonicalTemplateId,
            ...this.editableTemplateScope(resolvedOwnerId),
          },
          include: { draft: true },
        });
        if (!template) throw new NotFoundException("模板不存在或无权访问");
        if (!template.draft) throw new ConflictException("模板没有可归档草稿");
        this.assertCurrentDraftIdentity(
          template.draft,
          expectedIdentity,
          "模板草稿已变化，请重新确认后再移入回收站",
        );
        if (template.status === "ARCHIVED") {
          return { templateId: template.templateId, status: "ARCHIVED" as const };
        }
        const archivedAt = new Date();
        const updated = await tx.dynamicTemplate.updateMany({
          where: {
            id: template.id,
            templateId: canonicalTemplateId,
            ...this.editableTemplateScope(resolvedOwnerId),
            status: "ACTIVE",
          },
          data: { status: "ARCHIVED", archivedAt },
        });
        if (updated.count !== 1) throw new ConflictException("模板状态已变化，请刷新目录后重试");
        await tx.operationLog.create({
          data: {
            userId: resolvedOwnerId,
            action: "TEMPLATE_ARCHIVED",
            module: "page-builder-template",
            targetId: template.id,
            detail: JSON.stringify({
              schemaVersion: 1,
              event: "TEMPLATE_ARCHIVED",
              actor: resolvedOwnerId,
              timestamp: archivedAt.toISOString(),
              templateId: template.templateId,
              fromStatus: "ACTIVE",
              toStatus: "ARCHIVED",
              publishedVersion: template.publishedVersion,
              result: "succeeded",
            }),
          },
        });
        return { templateId: template.templateId, status: "ARCHIVED" as const };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)
        || (error.code !== "P2002" && error.code !== "P2034")) throw error;
      const winner = await this.prisma.dynamicTemplate.findFirst({
        where: {
          templateId: canonicalTemplateId,
          ...this.editableTemplateScope(resolvedOwnerId),
        },
        include: { draft: true },
      });
      if (
        winner
        && winner.status === "ARCHIVED"
        && winner.draft
        && winner.draft.revision === expectedIdentity.expectedRevision
        && winner.draft.definitionChecksum === expectedIdentity.expectedChecksum
        && matchesDynamicTemplateDefinitionChecksum(
          winner.draft.definition as unknown as TemplateDefinitionV2,
          expectedIdentity.expectedChecksum,
        )
      ) {
        return { templateId: winner.templateId, status: "ARCHIVED" as const };
      }
      throw new ConflictException("模板归档发生并发冲突，请刷新目录后重试");
    }
  }

  async restore(ownerId: number | undefined, templateId: string) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    return this.prisma.$transaction(async (tx) => {
      const template = await this.getOwnedTemplate(resolvedOwnerId, templateId, tx);
      if (template.status !== "ARCHIVED") {
        throw new NotFoundException("模板不存在、未归档或无权访问");
      }
      const restoredAt = new Date();
      const updated = await tx.dynamicTemplate.updateMany({
        where: {
          id: template.id,
          templateId: this.assertTemplateId(templateId),
          ...this.editableTemplateScope(resolvedOwnerId),
          status: "ARCHIVED",
        },
        data: { status: "ACTIVE", archivedAt: null },
      });
      if (updated.count !== 1) throw new NotFoundException("模板不存在、未归档或无权访问");
      await tx.operationLog.create({
        data: {
          userId: resolvedOwnerId,
          action: "TEMPLATE_RESTORED",
          module: "page-builder-template",
          targetId: template.id,
          detail: JSON.stringify({
            schemaVersion: 1,
            event: "TEMPLATE_RESTORED",
            actor: resolvedOwnerId,
            timestamp: restoredAt.toISOString(),
            templateId: template.templateId,
            fromStatus: "ARCHIVED",
            toStatus: "ACTIVE",
            publishedVersion: template.publishedVersion,
            result: "succeeded",
          }),
        },
      });
      return { templateId, status: "ACTIVE" as const };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  async deleteDraft(ownerId: number | undefined, templateId: string) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    return this.prisma.$transaction(async (tx) => {
      const template = await this.getOwnedTemplate(resolvedOwnerId, templateId, tx);
      const evidence = await this.collectDeleteEvidence([template], tx);
      const blockers = this.catalogDeleteBlockers(template, evidence);
      if (blockers.length > 0) {
        throw new ConflictException({
          message: blockers[0].message,
          code: "DYNAMIC_TEMPLATE_DELETE_BLOCKED",
          deleteBlockers: blockers,
        });
      }
      const deleted = await tx.dynamicTemplate.deleteMany({
        where: {
          id: template.id,
          templateId: this.assertTemplateId(templateId),
          ...this.editableTemplateScope(resolvedOwnerId),
          status: "ARCHIVED",
          publishedVersion: 0,
        },
      });
      if (deleted.count !== 1) {
        throw new ConflictException("模板状态已变化，请刷新目录后重试");
      }
      const deletedAt = new Date();
      await tx.operationLog.create({
        data: {
          userId: resolvedOwnerId,
          action: "TEMPLATE_DRAFT_DELETED",
          module: "page-builder-template",
          targetId: template.id,
          detail: JSON.stringify({
            schemaVersion: 1,
            event: "TEMPLATE_DRAFT_DELETED",
            actor: resolvedOwnerId,
            timestamp: deletedAt.toISOString(),
            templateId: template.templateId,
            fromStatus: "ARCHIVED",
            toStatus: "DELETED",
            publishedVersion: template.publishedVersion,
            result: "succeeded",
          }),
        },
      });
      return { templateId, deleted: true as const };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
