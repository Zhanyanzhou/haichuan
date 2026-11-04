import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, it } from 'node:test';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { MediaAuthorizationService } from './media-authorization.service';

const sharp = require('sharp');

const READY_URL = '/uploads/page-assets/ready.png';
const MISSING_URL = '/uploads/page-assets/missing.png';
const ARCHIVED_URL = '/uploads/page-assets/archived.png';
const ABSENT_FILE_URL = '/uploads/page-assets/absent-file.png';

function guardContext(user: { role?: string } | undefined) {
  return {
    getHandler: () => UploadController.prototype.getPageMediaByUrl,
    getClass: () => UploadController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
}

function sqlText(query: unknown): string {
  if (Array.isArray(query)) return query.join(' ');
  if (query && typeof query === 'object' && 'strings' in query && Array.isArray(query.strings)) {
    return query.strings.join(' ');
  }
  return '';
}

describe('页面素材 by-url 直接鉴权与读取', () => {
  const reflector = new Reflector();
  const rolesGuard = new RolesGuard(reflector);
  const staffRoles = ['EDITOR', 'ADMIN', 'SUPER_ADMIN'] as const;

  it('控制器声明员工角色，客户和缺用户不能通过角色守卫', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UploadController) as unknown[];
    assert.ok(guards.includes(JwtAuthGuard));
    assert.ok(guards.includes(RolesGuard));
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, UploadController), ['SUPER_ADMIN', 'ADMIN', 'EDITOR']);

    for (const role of staffRoles) {
      assert.equal(rolesGuard.canActivate(guardContext({ role }) as never), true, role);
    }
    assert.equal(rolesGuard.canActivate(guardContext({ role: 'CUSTOMER' }) as never), false);
    assert.equal(rolesGuard.canActivate(guardContext(undefined) as never), false);
  });

  it('该路由不是公开路由，没有 JWT 策略时不能放行', async () => {
    const guard = new JwtAuthGuard(reflector);
    let allowed = false;
    try {
      allowed = await Promise.resolve(guard.canActivate(guardContext(undefined) as never)) === true;
    } catch {
      allowed = false;
    }
    assert.equal(allowed, false);
  });

  it('非法地址在进入服务前被拒绝', async () => {
    let calls = 0;
    const controller = new UploadController({
      async getPageMediaByPublicUrl() {
        calls += 1;
        return {};
      },
    } as never, {} as never);
    const actor = { id: 7, role: 'EDITOR', sessionFamilyId: 'family' };

    await assert.rejects(
      () => controller.getPageMediaByUrl({ user: actor } as never, '   '),
      (error: unknown) => error instanceof BadRequestException && error.message === '素材地址无效',
    );
    await assert.rejects(
      () => controller.getPageMediaByUrl({ user: actor } as never, `/${'a'.repeat(1024)}`),
      (error: unknown) => error instanceof BadRequestException,
    );
    assert.equal(calls, 0);

    const seen: unknown[] = [];
    const passing = new UploadController({
      async getPageMediaByPublicUrl(url: string, user: unknown) {
        seen.push({ url, user });
        return { id: 1, status: 'READY', metadataStatus: 'measured' };
      },
    } as never, {} as never);
    const result = await passing.getPageMediaByUrl({ user: actor } as never, `  ${READY_URL}  `);
    assert.equal(result.metadataStatus, 'measured');
    assert.deepEqual(seen, [{ url: READY_URL, user: actor }]);
  });

  it('缺失、归档、文件缺失、测量成功和失败恢复都不写库', async () => {
    const root = mkdtempSync(join(tmpdir(), 'haichuan-by-url-'));
    const publicRoot = join(root, 'uploads');
    const previousPublic = process.env.PUBLIC_MEDIA_ROOT;
    const previousArchive = process.env.PAGE_MEDIA_ARCHIVE_ROOT;
    const previousProof = process.env.PAYMENT_PROOF_MEDIA_ROOT;
    const previousProduct = process.env.PRODUCT_MEDIA_ROOT;
    process.env.PUBLIC_MEDIA_ROOT = publicRoot;
    process.env.PAGE_MEDIA_ARCHIVE_ROOT = join(root, 'archive');
    process.env.PAYMENT_PROOF_MEDIA_ROOT = join(root, 'proofs');
    process.env.PRODUCT_MEDIA_ROOT = join(root, 'products');
    mkdirSync(join(publicRoot, 'page-assets'), { recursive: true });
    await sharp({
      create: { width: 8, height: 6, channels: 3, background: { r: 12, g: 18, b: 24 } },
    }).png().toFile(join(publicRoot, 'page-assets', 'ready.png'));

    const updates: string[] = [];
    const assets = new Map<string, Record<string, unknown>>([
      [READY_URL.slice('/uploads/'.length), asset('ready.png', 'READY')],
      [ARCHIVED_URL.slice('/uploads/'.length), asset('archived.png', 'ARCHIVED')],
      [ABSENT_FILE_URL.slice('/uploads/'.length), asset('absent-file.png', 'READY')],
    ]);
    let readyReads = 0;
    const prisma = {
      mediaAsset: {
        findFirst: async ({ where }: { where: { storageKey?: string } }) => {
          const row = where.storageKey ? assets.get(where.storageKey) : undefined;
          if (where.storageKey === 'page-assets/ready.png') {
            readyReads += 1;
            if (readyReads === 1) throw new Error('temporary-read-failure');
          }
          return row ?? null;
        },
        update: async () => {
          updates.push('update');
          throw new Error('by-url must not update');
        },
      },
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(prisma),
      $queryRaw: async (query: unknown) => {
        const text = sqlText(query);
        if (text.includes('FROM users')) return [{ id: 7, role: 'EDITOR' }];
        if (text.includes('admin_refresh_sessions')) return [{ id: 1 }];
        throw new Error(`unexpected staff query: ${text.slice(0, 80)}`);
      },
    };
    const service = new UploadService(prisma as never, new MediaAuthorizationService(prisma as never));
    const actor = { id: 7, role: 'EDITOR' as const, sessionFamilyId: 'family' };

    try {
      await assert.rejects(
        () => service.getPageMediaByPublicUrl(MISSING_URL, actor),
        (error: unknown) => httpError(error, 404, '素材不存在'),
      );

      const archived = await service.getPageMediaByPublicUrl(ARCHIVED_URL, actor);
      assert.equal(archived.status, 'ARCHIVED');
      assert.equal(archived.metadataStatus, undefined);
      assert.equal(archived.width, 400);

      const absent = await service.getPageMediaByPublicUrl(ABSENT_FILE_URL, actor);
      assert.equal(absent.metadataStatus, 'unknown');
      assert.equal(absent.displayWidth, undefined);
      assert.equal(absent.width, 400);

      await assert.rejects(
        () => service.getPageMediaByPublicUrl(READY_URL, actor),
        (error: unknown) => error instanceof Error && error.message === 'temporary-read-failure',
      );
      const measured = await service.getPageMediaByPublicUrl(READY_URL, actor);
      assert.equal(measured.metadataStatus, 'measured');
      assert.equal(measured.displayWidth, 8);
      assert.equal(measured.displayHeight, 6);

      const deniedStaff = {
        ...prisma,
        $queryRaw: async (query: unknown) => {
          const text = sqlText(query);
          if (text.includes('FROM users')) return [];
          return [{ id: 1 }];
        },
      };
      deniedStaff.$transaction = async (work: (tx: unknown) => Promise<unknown>) => work(deniedStaff);
      const denied = new UploadService(deniedStaff as never, new MediaAuthorizationService(deniedStaff as never));
      await assert.rejects(
        () => denied.getPageMediaByPublicUrl(READY_URL, actor),
        (error: unknown) => httpError(error, 403, '当前员工已停用或无权访问媒体管理'),
      );

      const expiredSession = {
        ...prisma,
        $queryRaw: async (query: unknown) => {
          const text = sqlText(query);
          if (text.includes('FROM users')) return [{ id: 7, role: 'EDITOR' }];
          if (text.includes('admin_refresh_sessions')) return [];
          throw new Error(text);
        },
      };
      expiredSession.$transaction = async (work: (tx: unknown) => Promise<unknown>) => work(expiredSession);
      const expired = new UploadService(expiredSession as never, new MediaAuthorizationService(expiredSession as never));
      await assert.rejects(
        () => expired.getPageMediaByPublicUrl(READY_URL, { ...actor, sessionFamilyId: 'family' }),
        (error: unknown) => httpError(error, 403, '当前员工会话已失效，不能访问媒体管理'),
      );

      assert.deepEqual(updates, []);
    } finally {
      restoreEnv('PUBLIC_MEDIA_ROOT', previousPublic);
      restoreEnv('PAGE_MEDIA_ARCHIVE_ROOT', previousArchive);
      restoreEnv('PAYMENT_PROOF_MEDIA_ROOT', previousProof);
      restoreEnv('PRODUCT_MEDIA_ROOT', previousProduct);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function asset(name: string, status: 'READY' | 'ARCHIVED') {
  return {
    id: name,
    storageKey: `page-assets/${name}`,
    originalName: name,
    mimeType: 'image/png',
    byteSize: 80,
    width: 400,
    height: 300,
    createdAt: new Date('2026-11-04T00:00:00Z'),
    status,
    accessLevel: 'PUBLIC',
    checksumSha256: 'abc',
    integrityCheckedAt: null,
    quarantineReason: null,
    authorization: {
      reviewStatus: 'APPROVED',
      revocationStatus: 'ACTIVE',
      revision: 1,
      publicUseEpoch: 1,
      sourceType: 'PAGE_UPLOAD',
      validUntil: null,
    },
  };
}

function httpError(error: unknown, status: number, message: string) {
  const http = error as { message?: string; getStatus?: () => number; constructor?: { name?: string } };
  assert.equal(http.getStatus?.(), status, `${http.constructor?.name ?? 'unknown'}: ${http.message ?? error}`);
  assert.equal(http.message, message);
  return true;
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
