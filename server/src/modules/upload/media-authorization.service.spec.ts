import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MediaAuthorizationService } from './media-authorization.service';

const incremented = (current: number, value: unknown) => {
  if (value && typeof value === 'object' && 'increment' in value) {
    return current + Number((value as { increment: unknown }).increment);
  }
  return value as number;
};

test('授权草稿、提交、独立审核在 Serializable 事务内形成连续事件哈希与 OperationLog', async () => {
  const events: Array<Record<string, any>> = [];
  const operationLogs: Array<Record<string, any>> = [];
  const isolationLevels: string[] = [];
  let authorization: Record<string, any> = {
    assetId: 17,
    revision: 1,
    publicUseEpoch: 0,
    sourceType: 'LEGACY_UNVERIFIED',
    authorizationBasis: null,
    evidenceReference: null,
    publicWebUseAllowed: false,
    reviewStatus: 'DRAFT',
    preparedById: 2,
    submittedById: null,
    submittedAt: null,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    validFrom: null,
    validUntil: null,
    revocationStatus: 'ACTIVE',
    revokedById: null,
    revokedAt: null,
    revocationReason: null,
    createdAt: new Date('2026-09-13T00:00:00Z'),
    updatedAt: new Date('2026-09-13T00:00:00Z'),
  };
  const asset = {
    id: 17,
    storageKey: 'page-assets/abc.png',
    originalName: 'abc.png',
    mimeType: 'image/png',
    byteSize: 1,
    checksumSha256: 'a'.repeat(64),
    width: 1,
    height: 1,
    durationMs: null,
    altText: null,
    locale: null,
    accessLevel: 'PUBLIC',
    status: 'READY',
    lifecycleRevision: 1,
    integrityCheckedAt: null,
    quarantineReason: null,
    uploadedBy: 2,
    createdAt: new Date('2026-09-13T00:00:00Z'),
    updatedAt: new Date('2026-09-13T00:00:00Z'),
  };
  const transaction = {
    mediaAsset: {
      findFirst: async () => ({ ...asset, authorization: { ...authorization } }),
    },
    mediaAssetAuthorization: {
      updateMany: async ({ where, data }: any) => {
        if (where.assetId !== authorization.assetId || where.revision !== authorization.revision) return { count: 0 };
        authorization = {
          ...authorization,
          ...data,
          revision: incremented(authorization.revision, data.revision),
          publicUseEpoch: incremented(authorization.publicUseEpoch, data.publicUseEpoch),
          updatedAt: new Date(),
        };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...authorization }),
    },
    mediaAssetAuthorizationEvent: {
      findFirst: async () => events.at(-1) ?? null,
      findMany: async () => [...events],
      create: async ({ data }: any) => {
        const event = { id: BigInt(events.length + 1), occurredAt: new Date(), ...data };
        events.push(event);
        return event;
      },
    },
    operationLog: {
      create: async ({ data }: any) => operationLogs.push(data),
    },
  };
  const prisma = {
    $transaction: async (action: (tx: any) => Promise<unknown>, options: { isolationLevel: string }) => {
      isolationLevels.push(options.isolationLevel);
      return action(transaction);
    },
  };
  const service = new MediaAuthorizationService(prisma as never);

  const draft = await service.saveDraft(17, 2, {
    expectedRevision: 1,
    sourceType: 'BRAND_OWNED',
    authorizationBasis: '品牌自有拍摄档案',
    evidenceReference: 'internal://evidence/media-17',
    publicWebUseAllowed: true,
    validFrom: '2026-09-01T00:00:00.000Z',
    validUntil: '2027-09-01T00:00:00.000Z',
  });
  assert.ok(draft.authorization);
  assert.equal(draft.authorization.revision, 2);
  assert.equal(draft.asset.previewUrl, '/api/upload/media/17/preview');
  assert.equal(draft.asset.publicUrl, null);
  await service.submit(17, 2, 2);
  await assert.rejects(() => service.approve(17, 2, 3), ForbiddenException);
  await assert.rejects(
    () => service.reject(17, 3, { expectedRevision: 3, reviewNote: '   ' }),
    BadRequestException,
  );
  const approved = await service.approve(17, 3, 3, '证据已复核');

  assert.ok(approved.authorization);
  assert.equal(approved.authorization.reviewStatus, 'APPROVED');
  assert.equal(approved.publicEligibility.eligible, true);
  assert.equal(approved.asset.publicUrl, '/api/upload/public-media/17');
  assert.equal(isolationLevels.length, 5);
  assert.equal(isolationLevels.every((level) => level === 'Serializable'), true);
  assert.deepEqual(events.map((event) => event.authorizationRevision), [2, 3, 4]);
  assert.equal(events.every((event) => /^[a-f0-9]{64}$/.test(event.eventHash)), true);
  assert.equal(events[1].previousEventHash, events[0].eventHash);
  assert.equal(events[2].previousEventHash, events[1].eventHash);
  assert.equal(operationLogs.length, 3);
  assert.equal(operationLogs.every((log) => !log.detail.includes('internal://evidence')), true);
  await assert.rejects(
    () => service.revoke(17, 3, { expectedRevision: 4, reason: '\t  ' }),
    BadRequestException,
  );
  await assert.rejects(
    () => service.renew(17, 3, {
      expectedRevision: 4,
      authorizationBasis: '   ',
      validUntil: '2028-09-01T00:00:00.000Z',
    }),
    BadRequestException,
  );
  await assert.rejects(
    () => service.renew(17, 3, {
      expectedRevision: 4,
      evidenceReference: '\n ',
      validUntil: '2028-09-01T00:00:00.000Z',
    }),
    BadRequestException,
  );
  assert.equal(authorization.revision, 4, '空白业务字段必须在 update 前拒绝');
  assert.equal(events.length, 3);
  assert.equal(operationLogs.length, 3);
  await assert.rejects(() => service.submit(17, 2, 2), ConflictException);
});

test('自动建档使用 DRAFT/LEGACY_UNVERIFIED 并写入第一个 SHA-256 事件', async () => {
  const createdRecords: Array<Record<string, any>> = [];
  const eventRecords: Array<Record<string, any>> = [];
  const transaction = {
    mediaAssetAuthorization: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        const created = {
          ...data,
          revision: 1,
          publicUseEpoch: 0,
          authorizationBasis: null,
          evidenceReference: null,
          publicWebUseAllowed: false,
          submittedById: null,
          submittedAt: null,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          validFrom: null,
          validUntil: null,
          revokedById: null,
          revokedAt: null,
          revocationReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        createdRecords.push(created);
        return created;
      },
    },
    mediaAssetAuthorizationEvent: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        eventRecords.push(data);
        return data;
      },
    },
    operationLog: { create: async () => undefined },
  };
  const service = new MediaAuthorizationService({} as never);
  await service.ensureLegacyDraft(transaction as never, 9, 4);
  const created = createdRecords[0];
  const event = eventRecords[0];
  assert.equal(created.sourceType, 'LEGACY_UNVERIFIED');
  assert.equal(created.reviewStatus, 'DRAFT');
  assert.equal(created.publicWebUseAllowed, false);
  assert.equal(event.authorizationRevision, 1);
  assert.equal(event.publicUseEpoch, 0);
  assert.match(event.eventHash, /^[a-f0-9]{64}$/);
});

test('旧素材可用 expectedRevision=0 首次显式建立草稿，但不能覆盖并发或既有记录', async () => {
  let authorization: Record<string, any> | null = null;
  const events: Array<Record<string, any>> = [];
  const operationLogs: Array<Record<string, any>> = [];
  const asset = {
    id: 31,
    storageKey: 'page-assets/legacy.png',
    originalName: 'legacy.png',
    mimeType: 'image/png',
    byteSize: 1,
    checksumSha256: 'b'.repeat(64),
    width: 1,
    height: 1,
    durationMs: null,
    altText: null,
    locale: null,
    accessLevel: 'PUBLIC',
    status: 'READY',
    lifecycleRevision: 1,
    integrityCheckedAt: null,
    quarantineReason: null,
    uploadedBy: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const transaction = {
    mediaAsset: {
      findFirst: async () => ({ ...asset, authorization }),
    },
    mediaAssetAuthorization: {
      create: async ({ data }: any) => {
        authorization = {
          ...data,
          revision: 1,
          publicUseEpoch: 0,
          submittedById: null,
          submittedAt: null,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          revokedById: null,
          revokedAt: null,
          revocationReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return authorization;
      },
    },
    mediaAssetAuthorizationEvent: {
      findFirst: async () => events.at(-1) ?? null,
      findMany: async () => [...events],
      create: async ({ data }: any) => {
        const event = { id: 1n, occurredAt: new Date(), ...data };
        events.push(event);
        return event;
      },
    },
    operationLog: {
      create: async ({ data }: any) => operationLogs.push(data),
    },
  };
  const prisma = {
    $transaction: async (action: (tx: any) => Promise<unknown>, options: { isolationLevel: string }) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return action(transaction);
    },
  };
  const service = new MediaAuthorizationService(prisma as never);
  const created = await service.saveDraft(31, 8, {
    expectedRevision: 0,
    sourceType: 'BRAND_OWNED',
    authorizationBasis: '旧素材品牌自有档案',
    evidenceReference: 'internal://legacy/31',
    publicWebUseAllowed: true,
    validUntil: '2027-09-13T00:00:00.000Z',
  });

  assert.ok(created.authorization);
  assert.equal(created.authorization.revision, 1);
  assert.equal(created.authorization.reviewStatus, 'DRAFT');
  assert.equal(created.publicEligibility.eligible, false, '首次建档不能自动批准或公开');
  assert.equal(events[0].eventType, 'CREATED');
  assert.equal(events[0].authorizationRevision, 1);
  assert.match(events[0].eventHash, /^[a-f0-9]{64}$/);
  assert.equal(operationLogs.length, 1);
  assert.equal(operationLogs[0].detail.includes('internal://legacy/31'), false);
  await assert.rejects(
    () => service.saveDraft(31, 9, {
      expectedRevision: 0,
      sourceType: 'OTHER',
      publicWebUseAllowed: false,
    }),
    ConflictException,
  );
});

test('首次显式建档的并发唯一冲突映射为 409', async () => {
  const uniqueConflict = Object.assign(new Error('duplicate'), { code: 'P2002' });
  const transaction = {
    mediaAsset: {
      findFirst: async () => ({
        id: 41,
        storageKey: 'page-assets/race.png',
        status: 'READY',
        accessLevel: 'PUBLIC',
        lifecycleRevision: 1,
        authorization: null,
      }),
    },
    mediaAssetAuthorization: {
      create: async () => { throw uniqueConflict; },
    },
  };
  const service = new MediaAuthorizationService({
    $transaction: async (action: (tx: any) => Promise<unknown>) => action(transaction),
  } as never);
  await assert.rejects(
    () => service.saveDraft(41, 8, {
      expectedRevision: 0,
      sourceType: 'OTHER',
      publicWebUseAllowed: false,
    }),
    (error: unknown) => error instanceof ConflictException && error.getStatus() === 409,
  );
});
