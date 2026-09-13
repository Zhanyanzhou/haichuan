import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MediaAuthorizationResolverService } from './media-authorization-resolver.service';

const prisma = {
  mediaAsset: {
    findMany: async () => [{
      id: 7,
      storageKey: 'page-assets/abc.png',
      status: 'READY',
      accessLevel: 'PUBLIC',
      lifecycleRevision: 2,
      authorization: {
        revision: 4,
        publicUseEpoch: 3,
        reviewStatus: 'DRAFT',
        revocationStatus: 'ACTIVE',
        publicWebUseAllowed: false,
        validFrom: null,
        validUntil: null,
      },
    }],
  },
};

test('resolver 返回生命周期与授权快照，SHADOW 只降级授权问题', async () => {
  const service = new MediaAuthorizationResolverService(prisma as never);
  const result = await service.resolveReferences([{
    url: '/uploads/page-assets/abc.png',
    path: 'content.hero.image',
    sourceType: 'PAGE_INSTANCE',
    sourceId: 'home',
  }], { mode: 'SHADOW', now: new Date('2026-09-13T00:00:00Z') });
  assert.equal(result.eligible, true);
  assert.equal(result.issues.every((issue) => issue.severity === 'WARNING'), true);
  assert.deepEqual(result.items[0], {
    url: '/uploads/page-assets/abc.png',
    context: { path: 'content.hero.image', sourceType: 'PAGE_INSTANCE', sourceId: 'home' },
    assetId: 7,
    storageKey: 'page-assets/abc.png',
    assetStatus: 'READY',
    accessLevel: 'PUBLIC',
    lifecycleRevision: 2,
    authorizationRevision: 4,
    publicUseEpoch: 3,
    reviewStatus: 'DRAFT',
    revocationStatus: 'ACTIVE',
    eligibility: {
      eligible: false,
      reasons: ['AUTHORIZATION_NOT_APPROVED', 'PUBLIC_WEB_USE_NOT_ALLOWED'],
    },
  });
});

test('resolver 对外部、危险和未登记的本站上传素材失败关闭', async () => {
  const service = new MediaAuthorizationResolverService({
    mediaAsset: { findMany: async () => [] },
  } as never);
  const result = await service.resolveReferences([
    { url: 'https://example.com/a.jpg' },
    { url: 'javascript:alert(1)' },
    { url: '/uploads/page-assets/missing.png' },
  ]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    'EXTERNAL_UNMANAGED',
    'DANGEROUS_URL',
    'UNREGISTERED_MEDIA',
  ]);
});

test('resolver 把畸形百分号和编码后的穿越、反斜杠、控制字符统一判为危险地址', async () => {
  const service = new MediaAuthorizationResolverService({
    mediaAsset: { findMany: async () => assert.fail('危险地址不应进入数据库查询') },
  } as never);
  const result = await service.resolveReferences([
    { url: '/uploads/page-assets/bad%.png' },
    { url: '/uploads/page-assets/%2e%2e/secret.png' },
    { url: '/uploads/page-assets/%5cescape.png' },
    { url: '/uploads/page-assets/%00control.png' },
  ]);
  assert.equal(result.eligible, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['DANGEROUS_URL', 'DANGEROUS_URL', 'DANGEROUS_URL', 'DANGEROUS_URL'],
  );
});

test('resolver 在已批准授权上继续核对受控文件可达性与 SHA-256', async () => {
  const publicRoot = await mkdtemp(join(tmpdir(), 'haichuan-media-resolver-'));
  const pageAssetsRoot = join(publicRoot, 'page-assets');
  const mediaPath = join(pageAssetsRoot, 'verified.png');
  const previousRoot = process.env.PUBLIC_MEDIA_ROOT;
  const content = Buffer.from('authorized-public-media');
  await mkdir(pageAssetsRoot, { recursive: true });
  await writeFile(mediaPath, content);
  process.env.PUBLIC_MEDIA_ROOT = publicRoot;
  try {
    const asset = {
      id: 19,
      storageKey: 'page-assets/verified.png',
      checksumSha256: createHash('sha256').update(content).digest('hex'),
      status: 'READY',
      accessLevel: 'PUBLIC',
      lifecycleRevision: 3,
      authorization: {
        revision: 6,
        publicUseEpoch: 5,
        reviewStatus: 'APPROVED',
        revocationStatus: 'ACTIVE',
        publicWebUseAllowed: true,
        validFrom: null,
        validUntil: null,
      },
    };
    const service = new MediaAuthorizationResolverService({
      mediaAsset: { findMany: async () => [asset] },
    } as never);
    const reference = [{ url: '/uploads/page-assets/verified.png' }];

    assert.equal((await service.resolveReferences(reference)).eligible, true);
    await writeFile(mediaPath, Buffer.from('tampered'));
    assert.deepEqual(
      (await service.resolveReferences(reference)).issues.map((issue) => issue.code),
      ['ASSET_INTEGRITY_MISMATCH'],
    );
    await unlink(mediaPath);
    assert.deepEqual(
      (await service.resolveReferences(reference)).issues.map((issue) => issue.code),
      ['ASSET_FILE_UNAVAILABLE'],
    );
  } finally {
    if (previousRoot === undefined) delete process.env.PUBLIC_MEDIA_ROOT;
    else process.env.PUBLIC_MEDIA_ROOT = previousRoot;
    await rm(publicRoot, { recursive: true, force: true });
  }
});
