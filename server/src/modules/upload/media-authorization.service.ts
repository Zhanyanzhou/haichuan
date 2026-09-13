import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MediaAssetSourceType,
  MediaAuthorizationEventType,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  MediaAuthorizationImpactPreviewDto,
  RejectMediaAuthorizationDto,
  RenewMediaAuthorizationDto,
  RevokeMediaAuthorizationDto,
  SaveMediaAuthorizationDraftDto,
} from './dto/media-authorization.dto';
import { evaluateMediaPublicEligibility } from './media-public-eligibility';

const AUTHORIZATION_INCLUDE = { authorization: true } as const;

type AuthorizationAsset = Prisma.MediaAssetGetPayload<{ include: typeof AUTHORIZATION_INCLUDE }>;
type AuthorizationRecord = NonNullable<AuthorizationAsset['authorization']>;

type AuthorizationMutation = {
  eventType: MediaAuthorizationEventType;
  action: string;
  data: Prisma.MediaAssetAuthorizationUncheckedUpdateInput;
};

@Injectable()
export class MediaAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getDetail(assetId: number) {
    const asset = await this.findAsset(this.prisma, assetId);
    const events = await this.prisma.mediaAssetAuthorizationEvent.findMany({
      where: { assetId },
      orderBy: { authorizationRevision: 'asc' },
    });
    return this.toDetail(asset, events);
  }

  async saveDraft(assetId: number, actorId: number, dto: SaveMediaAuthorizationDraftDto) {
    if (dto.expectedRevision === 0) {
      this.assertDateRange(dto.validFrom, dto.validUntil);
      return this.withSerializable(async (transaction) => {
        const asset = await this.findAsset(transaction, assetId);
        if (asset.authorization) {
          throw this.revisionConflict(0, asset.authorization.revision);
        }
        const created = await transaction.mediaAssetAuthorization.create({
          data: {
            assetId,
            sourceType: dto.sourceType as MediaAssetSourceType,
            authorizationBasis: this.nullableTrim(dto.authorizationBasis),
            evidenceReference: this.nullableTrim(dto.evidenceReference),
            publicWebUseAllowed: dto.publicWebUseAllowed,
            validFrom: this.dateOrNull(dto.validFrom),
            validUntil: this.dateOrNull(dto.validUntil),
            reviewStatus: 'DRAFT',
            revocationStatus: 'ACTIVE',
            preparedById: actorId,
          },
        });
        await this.appendEvent(transaction, created, 'CREATED', actorId);
        await this.writeOperationLog(transaction, actorId, assetId, 'media.authorization.create', created);
        const events = await transaction.mediaAssetAuthorizationEvent.findMany({
          where: { assetId },
          orderBy: { authorizationRevision: 'asc' },
        });
        return this.toDetail({ ...asset, authorization: created }, events);
      });
    }
    return this.mutate(assetId, actorId, dto.expectedRevision, (authorization) => {
      if (!['DRAFT', 'REJECTED'].includes(authorization.reviewStatus)) {
        throw new ConflictException('只有草稿或已拒绝授权可以继续编辑');
      }
      this.assertDateRange(dto.validFrom, dto.validUntil);
      return {
        eventType: 'UPDATED',
        action: 'media.authorization.draft.update',
        data: {
          sourceType: dto.sourceType as MediaAssetSourceType,
          authorizationBasis: this.nullableTrim(dto.authorizationBasis),
          evidenceReference: this.nullableTrim(dto.evidenceReference),
          publicWebUseAllowed: dto.publicWebUseAllowed,
          validFrom: this.dateOrNull(dto.validFrom),
          validUntil: this.dateOrNull(dto.validUntil),
          reviewStatus: 'DRAFT',
          preparedById: actorId,
          submittedById: null,
          submittedAt: null,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          revocationStatus: 'ACTIVE',
          revokedById: null,
          revokedAt: null,
          revocationReason: null,
        },
      };
    });
  }

  async submit(assetId: number, actorId: number, expectedRevision: number) {
    return this.mutate(assetId, actorId, expectedRevision, (authorization) => {
      if (!['DRAFT', 'REJECTED'].includes(authorization.reviewStatus)) {
        throw new ConflictException('只有草稿或已拒绝授权可以提交审核');
      }
      this.assertReadyForReview(authorization);
      return {
        eventType: 'SUBMITTED',
        action: 'media.authorization.submit',
        data: {
          reviewStatus: 'IN_REVIEW',
          submittedById: actorId,
          submittedAt: new Date(),
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
        },
      };
    });
  }

  async approve(assetId: number, actorId: number, expectedRevision: number, reviewNote?: string | null) {
    return this.mutate(assetId, actorId, expectedRevision, (authorization) => {
      this.assertIndependentReviewer(authorization, actorId);
      if (authorization.reviewStatus !== 'IN_REVIEW') {
        throw new ConflictException('只有审核中的授权可以批准');
      }
      if (!authorization.publicWebUseAllowed) {
        throw new ConflictException('未明确允许公网使用，不能批准公开授权');
      }
      this.assertDateRange(authorization.validFrom, authorization.validUntil);
      if (authorization.validUntil && authorization.validUntil.getTime() <= Date.now()) {
        throw new ConflictException('授权有效期已结束，不能批准');
      }
      return {
        eventType: 'APPROVED',
        action: 'media.authorization.approve',
        data: {
          reviewStatus: 'APPROVED',
          revocationStatus: 'ACTIVE',
          reviewedById: actorId,
          reviewedAt: new Date(),
          reviewNote: this.nullableTrim(reviewNote),
        },
      };
    });
  }

  async reject(assetId: number, actorId: number, dto: RejectMediaAuthorizationDto) {
    return this.mutate(assetId, actorId, dto.expectedRevision, (authorization) => {
      this.assertIndependentReviewer(authorization, actorId);
      if (authorization.reviewStatus !== 'IN_REVIEW') {
        throw new ConflictException('只有审核中的授权可以拒绝');
      }
      const reviewNote = this.requiredTrim(dto.reviewNote, '拒绝原因');
      return {
        eventType: 'REJECTED',
        action: 'media.authorization.reject',
        data: {
          reviewStatus: 'REJECTED',
          reviewedById: actorId,
          reviewedAt: new Date(),
          reviewNote,
        },
      };
    });
  }

  async revoke(assetId: number, actorId: number, dto: RevokeMediaAuthorizationDto) {
    return this.mutate(assetId, actorId, dto.expectedRevision, (authorization) => {
      if (authorization.reviewStatus !== 'APPROVED' || authorization.revocationStatus === 'REVOKED') {
        throw new ConflictException('只有当前有效的已批准授权可以撤权');
      }
      const revocationReason = this.requiredTrim(dto.reason, '撤权原因');
      return {
        eventType: 'REVOKED',
        action: 'media.authorization.revoke',
        data: {
          revocationStatus: 'REVOKED',
          revokedById: actorId,
          revokedAt: new Date(),
          revocationReason,
        },
      };
    });
  }

  async renew(assetId: number, actorId: number, dto: RenewMediaAuthorizationDto) {
    return this.mutate(assetId, actorId, dto.expectedRevision, (authorization) => {
      this.assertIndependentReviewer(authorization, actorId);
      if (authorization.reviewStatus !== 'APPROVED' || authorization.revocationStatus !== 'ACTIVE') {
        throw new ConflictException('只有未撤权的已批准授权可以续期');
      }
      const authorizationBasis = dto.authorizationBasis === undefined
        ? authorization.authorizationBasis
        : this.nullableTrim(dto.authorizationBasis);
      const evidenceReference = dto.evidenceReference === undefined
        ? authorization.evidenceReference
        : this.nullableTrim(dto.evidenceReference);
      if (!authorizationBasis?.trim() || !evidenceReference?.trim()) {
        throw new BadRequestException('续期必须保留授权依据和证据引用');
      }
      this.assertDateRange(dto.validFrom ?? authorization.validFrom, dto.validUntil);
      const validUntil = new Date(dto.validUntil);
      if (validUntil.getTime() <= Date.now()) throw new BadRequestException('续期截止时间必须晚于当前时间');
      return {
        eventType: 'RENEWED',
        action: 'media.authorization.renew',
        data: {
          authorizationBasis,
          evidenceReference,
          validFrom: dto.validFrom === undefined ? authorization.validFrom : this.dateOrNull(dto.validFrom),
          validUntil,
          reviewedById: actorId,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote === undefined ? authorization.reviewNote : this.nullableTrim(dto.reviewNote),
        },
      };
    });
  }

  async impactPreview(dto: MediaAuthorizationImpactPreviewDto) {
    const ids = [...new Set(dto.assetIds)];
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: ids } },
      include: AUTHORIZATION_INCLUDE,
    });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const items = ids.map((assetId) => {
      const asset = byId.get(assetId);
      const publicEligibility = asset
        ? evaluateMediaPublicEligibility({
          assetStatus: asset.status,
          accessLevel: asset.accessLevel,
          authorization: asset.authorization,
        })
        : { eligible: false, reasons: ['ASSET_NOT_FOUND'] as const };
      return {
        assetId,
        found: Boolean(asset),
        reviewStatus: asset?.authorization?.reviewStatus ?? null,
        revocationStatus: asset?.authorization?.revocationStatus ?? null,
        publicEligibility,
        eligibleForPublic: publicEligibility.eligible,
        blockingReasons: [...publicEligibility.reasons],
        affectedPublishedPages: [],
        affectedDraftPages: [],
        pageImpact: { complete: false, reason: 'PAGE_MANIFEST_NOT_AVAILABLE' as const },
      };
    });
    return {
      complete: false,
      reason: 'PAGE_MANIFEST_NOT_AVAILABLE' as const,
      items,
      summary: {
        total: items.length,
        eligible: items.filter((item) => item.publicEligibility.eligible).length,
        blocked: items.filter((item) => !item.publicEligibility.eligible).length,
        publishedAffected: 0,
        draftAffected: 0,
        complete: false,
        reason: 'PAGE_MANIFEST_NOT_AVAILABLE' as const,
      },
    };
  }

  async ensureLegacyDraft(
    transaction: Prisma.TransactionClient,
    assetId: number,
    actorId?: number,
  ): Promise<AuthorizationRecord> {
    const existing = await transaction.mediaAssetAuthorization.findUnique({ where: { assetId } });
    if (existing) return existing;
    const created = await transaction.mediaAssetAuthorization.create({
      data: {
        assetId,
        sourceType: 'LEGACY_UNVERIFIED',
        reviewStatus: 'DRAFT',
        revocationStatus: 'ACTIVE',
        publicWebUseAllowed: false,
        preparedById: actorId,
      },
    });
    await this.appendEvent(transaction, created, 'CREATED', actorId);
    if (actorId) await this.writeOperationLog(transaction, actorId, assetId, 'media.authorization.create', created);
    return created;
  }

  private async mutate(
    assetId: number,
    actorId: number,
    expectedRevision: number,
    decide: (authorization: AuthorizationRecord) => AuthorizationMutation,
  ) {
    return this.withSerializable(async (transaction) => {
      const asset = await this.findAsset(transaction, assetId);
      const authorization = asset.authorization;
      if (!authorization) throw new ConflictException('素材尚未建立授权记录');
      if (authorization.revision !== expectedRevision) {
        throw this.revisionConflict(expectedRevision, authorization.revision);
      }
      const mutation = decide(authorization);
      const result = await transaction.mediaAssetAuthorization.updateMany({
        where: { assetId: authorization.assetId, revision: expectedRevision },
        data: {
          ...mutation.data,
          revision: { increment: 1 },
          publicUseEpoch: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException('授权记录已被其他人修改，请刷新后重试');
      }
      const updated = await transaction.mediaAssetAuthorization.findUniqueOrThrow({
        where: { assetId: authorization.assetId },
      });
      await this.appendEvent(transaction, updated, mutation.eventType, actorId);
      await this.writeOperationLog(transaction, actorId, assetId, mutation.action, updated);
      const events = await transaction.mediaAssetAuthorizationEvent.findMany({
        where: { assetId },
        orderBy: { authorizationRevision: 'asc' },
      });
      return this.toDetail({ ...asset, authorization: updated }, events);
    });
  }

  private async appendEvent(
    transaction: Prisma.TransactionClient,
    authorization: AuthorizationRecord,
    eventType: MediaAuthorizationEventType,
    actorId?: number,
  ) {
    const previous = await transaction.mediaAssetAuthorizationEvent.findFirst({
      where: { assetId: authorization.assetId },
      orderBy: { authorizationRevision: 'desc' },
    });
    if (previous && previous.authorizationRevision !== authorization.revision - 1) {
      throw new ConflictException('授权事件链版本不连续');
    }
    const snapshot = this.authorizationSnapshot(authorization);
    const hashMaterial = {
      schemaVersion: 1,
      assetId: authorization.assetId,
      authorizationRevision: authorization.revision,
      eventType,
      actorId: actorId ?? null,
      previousEventHash: previous?.eventHash ?? null,
      publicUseEpoch: authorization.publicUseEpoch,
      snapshot,
    };
    const eventHash = createHash('sha256').update(this.stableJson(hashMaterial)).digest('hex');
    return transaction.mediaAssetAuthorizationEvent.create({
      data: {
        assetId: authorization.assetId,
        authorizationRevision: authorization.revision,
        publicUseEpoch: authorization.publicUseEpoch,
        eventType,
        actorId,
        snapshot,
        previousEventHash: previous?.eventHash,
        eventHash,
      },
    });
  }

  private async writeOperationLog(
    transaction: Prisma.TransactionClient,
    actorId: number,
    assetId: number,
    action: string,
    authorization: AuthorizationRecord,
  ) {
    await transaction.operationLog.create({
      data: {
        userId: actorId,
        action,
        module: 'media_authorization',
        targetId: assetId,
        detail: JSON.stringify({
          schemaVersion: 1,
          assetId,
          authorizationRevision: authorization.revision,
          publicUseEpoch: authorization.publicUseEpoch,
          reviewStatus: authorization.reviewStatus,
          revocationStatus: authorization.revocationStatus,
        }),
      },
    });
  }

  private async findAsset(
    client: PrismaService | Prisma.TransactionClient,
    assetId: number,
  ): Promise<AuthorizationAsset> {
    if (!Number.isInteger(assetId) || assetId <= 0) throw new BadRequestException('素材编号无效');
    const asset = await client.mediaAsset.findFirst({
      where: {
        id: assetId,
        OR: [
          { storageKey: { startsWith: 'page-assets/' } },
          { storageKey: { startsWith: 'product-assets/' } },
        ],
      },
      include: AUTHORIZATION_INCLUDE,
    });
    if (!asset) throw new NotFoundException('素材不存在');
    return asset;
  }

  private toDetail(
    asset: AuthorizationAsset,
    events: Array<{
      id: bigint;
      authorizationRevision: number;
      eventType: MediaAuthorizationEventType;
      actorId: number | null;
      snapshot: Prisma.JsonValue;
      previousEventHash: string | null;
      eventHash: string;
      occurredAt: Date;
    }>,
  ) {
    const authorization = asset.authorization;
    const publicEligibility = evaluateMediaPublicEligibility({
      assetStatus: asset.status,
      accessLevel: asset.accessLevel,
      authorization,
    });
    return {
      asset: {
        id: asset.id,
        url: `/uploads/${asset.storageKey}`,
        name: asset.originalName,
        mimeType: asset.mimeType,
        status: asset.status,
        accessLevel: asset.accessLevel,
        lifecycleRevision: asset.lifecycleRevision,
        previewUrl: `/api/upload/media/${asset.id}/preview`,
        publicUrl: publicEligibility.eligible ? `/api/upload/public-media/${asset.id}` : null,
      },
      authorization,
      publicEligibility,
      proof: authorization ? {
        authorizationBasis: authorization.authorizationBasis,
        evidenceReference: authorization.evidenceReference,
        reviewNote: authorization.reviewNote,
        revocationReason: authorization.revocationReason,
        events: events.map((event) => ({ ...event, id: event.id.toString() })),
      } : null,
    };
  }

  private authorizationSnapshot(authorization: AuthorizationRecord): Prisma.InputJsonValue {
    return {
      sourceType: authorization.sourceType,
      authorizationBasis: authorization.authorizationBasis,
      evidenceReference: authorization.evidenceReference,
      publicWebUseAllowed: authorization.publicWebUseAllowed,
      reviewStatus: authorization.reviewStatus,
      preparedById: authorization.preparedById,
      submittedById: authorization.submittedById,
      submittedAt: authorization.submittedAt?.toISOString() ?? null,
      reviewedById: authorization.reviewedById,
      reviewedAt: authorization.reviewedAt?.toISOString() ?? null,
      reviewNote: authorization.reviewNote,
      validFrom: authorization.validFrom?.toISOString() ?? null,
      validUntil: authorization.validUntil?.toISOString() ?? null,
      revocationStatus: authorization.revocationStatus,
      revokedById: authorization.revokedById,
      revokedAt: authorization.revokedAt?.toISOString() ?? null,
      revocationReason: authorization.revocationReason,
      publicUseEpoch: authorization.publicUseEpoch,
    };
  }

  private assertReadyForReview(authorization: AuthorizationRecord) {
    if (authorization.sourceType === 'LEGACY_UNVERIFIED') {
      throw new ConflictException('历史未核验素材必须先补充来源类型');
    }
    if (!authorization.authorizationBasis?.trim() || !authorization.evidenceReference?.trim()) {
      throw new ConflictException('提交审核前必须填写授权依据和证据引用');
    }
    this.assertDateRange(authorization.validFrom, authorization.validUntil);
  }

  private assertIndependentReviewer(authorization: AuthorizationRecord, actorId: number) {
    if (!authorization.submittedById) throw new ConflictException('授权尚未记录提交人');
    if (authorization.submittedById === actorId) {
      throw new ForbiddenException('提交人不能审核自己的授权记录');
    }
  }

  private assertDateRange(
    validFrom?: Date | string | null,
    validUntil?: Date | string | null,
  ) {
    const from = validFrom ? new Date(validFrom).getTime() : undefined;
    const until = validUntil ? new Date(validUntil).getTime() : undefined;
    if ((from !== undefined && !Number.isFinite(from)) || (until !== undefined && !Number.isFinite(until))) {
      throw new BadRequestException('授权有效期格式无效');
    }
    if (from !== undefined && until !== undefined && from >= until) {
      throw new BadRequestException('授权截止时间必须晚于开始时间');
    }
  }

  private nullableTrim(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private requiredTrim(value: string, fieldName: string): string {
    const trimmed = value.trim();
    if (!trimmed) throw new BadRequestException(`${fieldName}不能为空`);
    return trimmed;
  }

  private dateOrNull(value?: string | null): Date | null {
    return value ? new Date(value) : null;
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private async withSerializable<T>(action: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        if (attempt < 2 && this.isWriteConflict(error)) continue;
        if (this.isUniqueConflict(error)) {
          throw new ConflictException({
            code: 'MEDIA_AUTHORIZATION_REVISION_CONFLICT',
            message: '授权记录已由其他人建立或修改，请刷新后重试',
          });
        }
        throw error;
      }
    }
    throw new ConflictException('授权记录正在被其他人修改，请稍后重试');
  }

  private isWriteConflict(error: unknown) {
    return error instanceof Error && 'code' in error && String((error as { code?: unknown }).code) === 'P2034';
  }

  private isUniqueConflict(error: unknown) {
    return error instanceof Error && 'code' in error && String((error as { code?: unknown }).code) === 'P2002';
  }

  private revisionConflict(expectedRevision: number, currentRevision: number) {
    return new ConflictException({
      code: 'MEDIA_AUTHORIZATION_REVISION_CONFLICT',
      message: '授权记录已被其他人修改，请刷新后重试',
      expectedRevision,
      currentRevision,
    });
  }
}
