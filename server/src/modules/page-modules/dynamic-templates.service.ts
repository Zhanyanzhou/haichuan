import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  getDynamicTemplateStructureLockViolation,
  validateDynamicTemplateDefinition,
  validateDynamicTemplatePublishDefinition,
} from "./generated/validateTemplateDefinition.generated";
import type { TemplateDefinitionV2 } from "./generated/templateDefinition.generated";
import { CONTENT_TEMPLATE_REGISTRY } from "./generated/contentTemplates.generated";
import {
  calculateDynamicTemplateDefinitionChecksum,
  matchesDynamicTemplateDefinitionChecksum,
} from "./dynamic-template-definition-integrity";
import { collectDynamicTemplateInstanceReferences } from "./dynamic-template-instance";

const TEMPLATE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const MAX_DEFINITION_BYTES = 1024 * 1024;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const LEGACY_SYSTEM_SOURCE_REFERENCES = new Set(
  CONTENT_TEMPLATE_REGISTRY.map((template) => `legacy_system_${template.key}`),
);

interface ValidatedDefinition {
  definition: TemplateDefinitionV2;
  checksum: string;
}

const TEMPLATE_CONTENT_FIELDS = ["defaultContent", "previewContent"] as const;
type TemplateContentField = (typeof TEMPLATE_CONTENT_FIELDS)[number];

export interface DynamicTemplateDeleteBlocker {
  code: "NOT_IN_TRASH" | "SYSTEM_TEMPLATE" | "HAS_PUBLISHED_VERSION" | "HAS_VERSION_HISTORY" | "HAS_ACTIVATION_HISTORY" | "REFERENCED_BY_PAGE";
  message: string;
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

function clearTemplateCompatibilityContent(definition: TemplateDefinitionV2) {
  definition.defaultContent = {};
  definition.previewContent = {};
  for (const slot of Object.values(definition.slots)) {
    if (slot.emptyPolicy === "use-default") slot.emptyPolicy = "hide";
  }
}

@Injectable()
export class DynamicTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
      OR: [
        { ownerId, sourceType: "CUSTOM" },
        { ownerId: null, sourceType: "SYSTEM" },
      ],
    };
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

  private catalogDeleteBlockers(
    template: { sourceType: string; status: string; publishedVersion: number; templateId: string },
    referencedTemplateIds: ReadonlySet<string>,
  ): DynamicTemplateDeleteBlocker[] {
    const blockers: DynamicTemplateDeleteBlocker[] = [];
    if (template.status !== "ARCHIVED") {
      blockers.push({ code: "NOT_IN_TRASH", message: "请先将模板移入回收站，再永久删除。" });
    }
    if (template.sourceType !== "CUSTOM") {
      blockers.push({ code: "SYSTEM_TEMPLATE", message: "SYSTEM 模板属于共享治理资产，只能保留在回收站或恢复。" });
    }
    if (template.publishedVersion > 0) {
      blockers.push({ code: "HAS_PUBLISHED_VERSION", message: "模板已生成正式版本，必须保留历史页面；只能留在回收站或恢复。" });
    }
    if (referencedTemplateIds.has(template.templateId)) {
      blockers.push({ code: "REFERENCED_BY_PAGE", message: "已有页面、历史版本、本地化页面或装修方案引用该模板。" });
    }
    return blockers;
  }

  private async withDeleteCapability<T extends {
    sourceType: string;
    status: string;
    publishedVersion: number;
    templateId: string;
  }>(template: T) {
    const referencedTemplateIds = await this.collectReferencedTemplateIds();
    const deleteBlockers = this.catalogDeleteBlockers(template, referencedTemplateIds);
    return { ...template, canDelete: deleteBlockers.length === 0, deleteBlockers };
  }

  async listMine(ownerId?: number) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    const [templates, referencedTemplateIds] = await Promise.all([
      this.prisma.dynamicTemplate.findMany({
        where: this.editableTemplateScope(resolvedOwnerId),
        include: { draft: true },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
      }),
      this.collectReferencedTemplateIds(),
    ]);
    return templates.map((template) => {
      const deleteBlockers = this.catalogDeleteBlockers(template, referencedTemplateIds);
      return { ...template, canDelete: deleteBlockers.length === 0, deleteBlockers };
    });
  }

  async listPublished() {
    const templates = await this.prisma.dynamicTemplate.findMany({
      where: {
        status: "ACTIVE",
        visibility: "STAFF",
        publishedVersion: { gt: 0 },
      },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return templates.flatMap((template) => {
      const published = template.versions[0];
      if (!published) return [];
      const definition = this.trustedPublishedDefinition({
        templateId: template.templateId,
        schemaVersion: published.schemaVersion,
        definition: published.definition,
        definitionChecksum: published.definitionChecksum,
      });
      if (!definition) return [];
      return [{
        templateId: template.templateId,
        name: template.name,
        category: template.category,
        purpose: template.purpose,
        layoutType: template.layoutType,
        description: template.description,
        slotSummary: template.slotSummary,
        recommendedFor: template.recommendedFor,
        tags: template.tags,
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

  async create(
    ownerId: number | undefined,
    input: { definition: unknown; versionNote?: string; sourceReference?: string },
  ) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    const validated = this.validateDefinition(input.definition);
    this.assertNewTemplateContentEmpty(validated.definition);
    this.assertNewTemplateUsesCurrentEmptyPolicies(validated.definition);
    const templateId = this.assertTemplateId(validated.definition.templateId);
    const sourceReference = input.sourceReference?.trim();
    if (sourceReference && !TEMPLATE_ID_PATTERN.test(sourceReference)) {
      throw new BadRequestException("来源模板标识无效");
    }
    if (sourceReference?.startsWith("legacy_system_")
      && !LEGACY_SYSTEM_SOURCE_REFERENCES.has(sourceReference)) {
      throw new BadRequestException("旧系统模板来源标识不在当前 24 个活动模板合同中");
    }
    const createsSystemReplacement = Boolean(
      sourceReference && LEGACY_SYSTEM_SOURCE_REFERENCES.has(sourceReference),
    );
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (createsSystemReplacement) {
          const existing = await tx.dynamicTemplate.findFirst({
            where: {
              ownerId: null,
              sourceType: "SYSTEM",
              sourceReference,
            },
            select: { templateId: true },
          });
          if (existing) {
            throw new ConflictException("该旧系统兼容来源已经存在对应母模板草稿，请直接打开现有模板");
          }
        }
        return tx.dynamicTemplate.create({
          data: {
            templateId,
            ownerId: createsSystemReplacement ? null : resolvedOwnerId,
            sourceType: createsSystemReplacement ? "SYSTEM" : "CUSTOM",
            visibility: "PRIVATE",
            status: "ACTIVE",
            ...this.definitionProjection(validated.definition),
            ...(sourceReference ? { sourceReference } : {}),
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
      }, {
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
    input: { expectedRevision: number; definition: unknown; versionNote?: string },
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
      throw new BadRequestException("草稿不能改变 templateId；请使用另存为");
    }
    const existingDefinition = this.validateDefinition(existing.draft.definition).definition;
    const structureLockViolation = getDynamicTemplateStructureLockViolation(
      existingDefinition,
      validated.definition,
      { mode: "persistenceSnapshot" },
    );
    if (structureLockViolation) {
      throw new BadRequestException({
        message: structureLockViolation,
        code: "TEMPLATE_STRUCTURE_LOCKED",
      });
    }
    this.assertHistoricalTemplateContentPreserved(existing.draft.definition, validated.definition);
    this.assertHistoricalEmptyPoliciesPreserved(existing.draft.definition, validated.definition);
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
        await tx.dynamicTemplate.update({
          where: { id: existing.id },
          data: this.definitionProjection(validated.definition),
        });
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

  async saveAs(
    ownerId: number | undefined,
    templateId: string,
    input: { name: string; versionNote?: string },
  ) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    const source = await this.getOwnedTemplate(resolvedOwnerId, templateId);
    if (!source.draft) throw new ConflictException("来源模板没有可复制草稿");
    const name = input.name.trim();
    if (!name || name.length > 100) throw new BadRequestException("模板名称必须为 1–100 个字符");
    const definition = this.validateDefinition(source.draft.definition).definition;
    definition.templateId = `tpl_${randomUUID()}`;
    definition.name = name;
    clearTemplateCompatibilityContent(definition);
    return this.create(resolvedOwnerId, {
      definition,
      versionNote: input.versionNote,
      sourceReference: source.templateId,
    });
  }

  async publish(
    ownerId: number | undefined,
    templateId: string,
    input: { expectedRevision: number; versionNote?: string },
  ) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision <= 0) {
      throw new BadRequestException("草稿 revision 无效");
    }
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.dynamicTemplate.findFirst({
        where: {
          templateId: this.assertTemplateId(templateId),
          ...this.editableTemplateScope(resolvedOwnerId),
        },
        include: { draft: true },
      });
      if (!template) throw new NotFoundException("模板不存在或无权访问");
      if (template.status !== "ACTIVE") throw new ConflictException("已归档模板不能发布");
      if (!template.draft) throw new ConflictException("模板草稿不存在");
      if (template.draft.revision !== input.expectedRevision) {
        throw new ConflictException("模板草稿已被其他会话更新，请刷新后重试");
      }
      const validated = this.validatePublishDefinition(template.draft.definition);
      if (validated.definition.templateId !== template.templateId) {
        throw new BadRequestException("草稿 templateId 与模板记录不一致");
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
      const nextVersion = template.publishedVersion + 1;
      const requestedVersionNote = this.normalizeVersionNote(input.versionNote);
      const versionNote = requestedVersionNote === undefined
        ? template.draft.versionNote ?? null
        : requestedVersionNote;
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
      if (advanced.count !== 1) throw new ConflictException("模板已由其他会话发布，请刷新后重试");
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
            result: "succeeded",
          }),
        },
      });
      return { templateId: template.templateId, version: published.version, published, draft };
    });
  }

  async listVersions(ownerId: number | undefined, templateId: string) {
    const template = await this.getOwnedTemplate(this.requireOwnerId(ownerId), templateId);
    return this.prisma.dynamicTemplateVersion.findMany({
      where: { dynamicTemplateId: template.id },
      orderBy: { version: "desc" },
    });
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
    return {
      templateId: template.templateId,
      name: template.name,
      category: template.category,
      status: template.status,
      sourceReference: template.sourceReference,
      ...published,
      definition,
      definitionChecksum: calculateDynamicTemplateDefinitionChecksum(definition),
    };
  }

  async archive(ownerId: number | undefined, templateId: string) {
    const resolvedOwnerId = this.requireOwnerId(ownerId);
    return this.prisma.$transaction(async (tx) => {
      const template = await this.getOwnedTemplate(resolvedOwnerId, templateId, tx);
      if (template.status !== "ACTIVE") {
        throw new NotFoundException("模板不存在、已归档或无权访问");
      }
      const archivedAt = new Date();
      const updated = await tx.dynamicTemplate.updateMany({
        where: {
          id: template.id,
          templateId: this.assertTemplateId(templateId),
          ...this.editableTemplateScope(resolvedOwnerId),
          status: "ACTIVE",
        },
        data: { status: "ARCHIVED", archivedAt },
      });
      if (updated.count !== 1) throw new NotFoundException("模板不存在、已归档或无权访问");
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
      return { templateId, status: "ARCHIVED" as const };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
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
      const referencedTemplateIds = await this.collectReferencedTemplateIds(tx);
      const blockers = this.catalogDeleteBlockers(template, referencedTemplateIds);
      if (template.sourceType === "CUSTOM" && template.publishedVersion === 0) {
        const [versionCount, activationCount] = await Promise.all([
          tx.dynamicTemplateVersion.count({ where: { dynamicTemplateId: template.id } }),
          tx.dynamicTemplateActivation.count({ where: { dynamicTemplateId: template.id } }),
        ]);
        if (versionCount > 0) {
          blockers.push({ code: "HAS_VERSION_HISTORY", message: "模板存在正式版本历史，不能永久删除。" });
        }
        if (activationCount > 0) {
          blockers.push({ code: "HAS_ACTIVATION_HISTORY", message: "模板存在版本激活历史，不能永久删除。" });
        }
      }
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
          ownerId: resolvedOwnerId,
          sourceType: "CUSTOM",
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
