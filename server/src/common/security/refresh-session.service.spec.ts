import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshSessionService } from './refresh-session.service';

type Row = {
  id: number;
  userId: number;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByHash: string | null;
  lastUsedAt: Date | null;
  userAgentHash: string | null;
  ipHash: string | null;
};

function adminFixture() {
  const rows: Row[] = [];
  const delegate = {
    create: async ({ data }: any) => {
      const row: Row = {
        id: rows.length + 1,
        revokedAt: null,
        replacedByHash: null,
        lastUsedAt: null,
        userAgentHash: null,
        ipHash: null,
        ...data,
      };
      rows.push(row);
      return row;
    },
    findUnique: async ({ where }: any) => {
      const row = rows.find((candidate) => candidate.tokenHash === where.tokenHash);
      return row ? { id: row.id, userId: row.userId, familyId: row.familyId, user: { status: 'ACTIVE' } } : null;
    },
    updateMany: async ({ where, data }: any) => {
      const matched = rows.filter((row) => {
        if (where.id !== undefined && row.id !== where.id) return false;
        if (where.userId !== undefined && row.userId !== where.userId) return false;
        if (where.familyId !== undefined && row.familyId !== where.familyId) return false;
        if (where.tokenHash !== undefined && row.tokenHash !== where.tokenHash) return false;
        if (where.revokedAt === null && row.revokedAt !== null) return false;
        if (where.replacedByHash === null && row.replacedByHash !== null) return false;
        if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) return false;
        return true;
      });
      for (const row of matched) Object.assign(row, data);
      return { count: matched.length };
    },
  };
  const prisma = {
    adminRefreshSession: delegate,
    $transaction: async (callback: (tx: any) => Promise<any>) => callback({ adminRefreshSession: delegate }),
  };
  return { service: new RefreshSessionService(prisma as any), rows };
}

test('refresh token 只以哈希落库，轮换沿用同一 family 并作废旧 token', async () => {
  const fixture = adminFixture();
  const issued = await fixture.service.issueAdmin(7, { userAgent: 'browser', ip: '127.0.0.1' });
  assert.equal(fixture.rows.length, 1);
  assert.notEqual(fixture.rows[0].tokenHash, issued.refreshToken);
  assert.equal(fixture.rows[0].userAgentHash?.includes('browser'), false);
  const familyId = fixture.rows[0].familyId;
  assert.equal(issued.familyId, familyId);

  const rotated = await fixture.service.rotateAdmin(issued.refreshToken, { userAgent: 'browser-2' });
  assert.equal(rotated.userId, 7);
  assert.equal(fixture.rows.length, 2);
  assert.equal(fixture.rows[0].revokedAt instanceof Date, true);
  assert.equal(fixture.rows[1].familyId, familyId);
  assert.equal(rotated.familyId, familyId);
  assert.notEqual(rotated.refreshToken, issued.refreshToken);
});

test('员工 access family 可按员工与 family 精确吊销', async () => {
  const fixture = adminFixture();
  const first = await fixture.service.issueAdmin(7, {});
  await fixture.service.issueAdmin(7, {});
  await fixture.service.issueAdmin(8, {});

  await fixture.service.revokeAdminFamilyForUser(7, first.familyId);

  assert.equal(fixture.rows[0].revokedAt instanceof Date, true);
  assert.equal(fixture.rows[1].revokedAt, null);
  assert.equal(fixture.rows[2].revokedAt, null);
});

test('重复使用已轮换 refresh token 会撤销整个 family', async () => {
  const fixture = adminFixture();
  const issued = await fixture.service.issueAdmin(9, {});
  await fixture.service.rotateAdmin(issued.refreshToken, {});

  await assert.rejects(
    fixture.service.rotateAdmin(issued.refreshToken, {}),
    UnauthorizedException,
  );
  assert.equal(fixture.rows.every((row) => row.revokedAt instanceof Date), true);
});

test('客户认证版本变化后旧 refresh family 立即失效且不能轮换', async () => {
  let currentAuthVersion = 1;
  const rows: Array<Record<string, any>> = [];
  const delegate = {
    create: async ({ data }: any) => {
      const row = {
        id: rows.length + 1,
        revokedAt: null,
        replacedByHash: null,
        lastUsedAt: null,
        ...data,
      };
      rows.push(row);
      return row;
    },
    findUnique: async ({ where }: any) => {
      const row = rows.find((candidate) => candidate.tokenHash === where.tokenHash);
      return row ? {
        id: row.id,
        customerId: row.customerId,
        familyId: row.familyId,
        authVersion: row.authVersion,
        customer: { status: 'ACTIVE', authVersion: currentAuthVersion },
      } : null;
    },
    updateMany: async ({ where, data }: any) => {
      const matched = rows.filter((row) => {
        if (where.familyId !== undefined && row.familyId !== where.familyId) return false;
        if (where.revokedAt === null && row.revokedAt !== null) return false;
        return true;
      });
      for (const row of matched) Object.assign(row, data);
      return { count: matched.length };
    },
  };
  const service = new RefreshSessionService({
    customer: {
      findFirst: async ({ where }: any) => where.authVersion === currentAuthVersion
        ? { id: where.id }
        : null,
    },
    customerRefreshSession: delegate,
    $transaction: async (callback: (tx: any) => Promise<any>) => callback({ customerRefreshSession: delegate }),
  } as any);

  const issued = await service.issueCustomer(11, {}, 1);
  assert.equal(rows[0].authVersion, 1);
  currentAuthVersion = 2;
  await assert.rejects(
    service.rotateCustomer(issued.refreshToken, {}),
    UnauthorizedException,
  );
  assert.equal(rows[0].revokedAt instanceof Date, true);

  await assert.rejects(
    service.issueCustomer(11, {}, 1),
    UnauthorizedException,
  );
  assert.equal(rows.length, 1);
});
