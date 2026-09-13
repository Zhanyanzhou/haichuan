import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QuotationConfigurationService } from './quotation-configuration.service';

function createDesignVersionHarness(media: {
  status: 'PENDING' | 'READY' | 'QUARANTINED' | 'ARCHIVED';
  checksumSha256: string;
}) {
  let createData: Record<string, unknown> | undefined;
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    cooperationDesignFile: {
      findUnique: async () => ({ id: 1, currentVersion: 0 }),
      update: async () => ({ id: 1, currentVersion: 1 }),
    },
    mediaAsset: {
      findUnique: async () => ({ id: 9, ...media }),
    },
    cooperationDesignFileVersion: {
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createData = data;
        return { id: 11, ...data };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService;
  return {
    service: new QuotationConfigurationService(prisma, {
      readVerifiedDesignFile: async (asset: { status: string; checksumSha256: string }) => {
        if (asset.status !== 'READY') {
          throw new BadRequestException('只能使用完整性校验通过且可用的媒体资产');
        }
        return {
          buffer: Buffer.from('verified-design'),
          mimeType: 'application/octet-stream',
          originalName: 'design.3dm',
          byteSize: 15,
          checksumSha256: asset.checksumSha256,
        };
      },
    } as never),
    created: () => createData,
  };
}

test('3D 文件版本从 READY 媒体资产派生权威校验值', async () => {
  const checksumSha256 = 'a'.repeat(64);
  const harness = createDesignVersionHarness({ status: 'READY', checksumSha256 });
  await harness.service.createDesignFileVersion(1, {
    mediaAssetId: 9,
    redWaxWeight: 1.234,
  }, 3);
  assert.equal(harness.created()?.checksumSha256, checksumSha256);
});

test('3D 文件版本拒绝未就绪媒体资产', async () => {
  const harness = createDesignVersionHarness({
    status: 'QUARANTINED',
    checksumSha256: 'b'.repeat(64),
  });
  await assert.rejects(
    () => harness.service.createDesignFileVersion(1, {
      mediaAssetId: 9,
      redWaxWeight: 1,
    }, 3),
    (error: unknown) => error instanceof BadRequestException
      && error.message.includes('完整性校验通过'),
  );
  assert.equal(harness.created(), undefined);
});

test('兼容旧调用方传 checksum 时拒绝与媒体资产权威值不一致', async () => {
  const harness = createDesignVersionHarness({
    status: 'READY',
    checksumSha256: 'c'.repeat(64),
  });
  await assert.rejects(
    () => harness.service.createDesignFileVersion(1, {
      mediaAssetId: 9,
      checksumSha256: 'd'.repeat(64),
      purpleWaxWeight: 2,
    }, 3),
    (error: unknown) => error instanceof BadRequestException
      && error.message.includes('校验值不匹配'),
  );
  assert.equal(harness.created(), undefined);
});
