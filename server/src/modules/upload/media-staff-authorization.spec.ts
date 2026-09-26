import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import {
  lockAuthorizedMediaStaff,
  normalizeMediaStaffActor,
} from './media-staff-authorization';

function sqlText(query: unknown): string {
  if (!query || typeof query !== 'object' || !('strings' in query)) return '';
  return Array.from((query as { strings: readonly string[] }).strings).join('?');
}

test('媒体员工授权先锁当前 ACTIVE 角色，再锁 refresh family', async () => {
  const queries: string[] = [];
  const transaction = {
    $queryRaw: async (query: unknown) => {
      const text = sqlText(query);
      queries.push(text);
      return text.includes('admin_refresh_sessions')
        ? [{ id: 91 }]
        : [{ id: 7, role: 'EDITOR' }];
    },
  };

  const staff = await lockAuthorizedMediaStaff(
    transaction as never,
    { id: 7, sessionFamilyId: '2c68f9e0-3f93-4b5f-9fa5-92250f44c1f2' },
    'LIBRARY',
    'write',
  );

  assert.deepEqual(staff, { id: 7, role: 'EDITOR' });
  assert.equal(queries.length, 2);
  assert.match(queries[0], /users[\s\S]+status = 'ACTIVE'[\s\S]+EDITOR[\s\S]+FOR UPDATE/);
  assert.match(queries[1], /admin_refresh_sessions[\s\S]+revoked_at IS NULL[\s\S]+FOR UPDATE/);
});

test('媒体员工授权在角色降权或 refresh family 撤销后失败关闭', async () => {
  await assert.rejects(
    () => lockAuthorizedMediaStaff(
      { $queryRaw: async () => [] } as never,
      8,
      'REVIEW',
      'write',
    ),
    ForbiddenException,
  );

  let call = 0;
  await assert.rejects(
    () => lockAuthorizedMediaStaff(
      {
        $queryRaw: async () => {
          call += 1;
          return call === 1 ? [{ id: 9, role: 'SUPER_ADMIN' }] : [];
        },
      } as never,
      { id: 9, sessionFamilyId: 'db852787-6d59-47c2-942a-9eb35a5390c2' },
      'SUPER_REVIEW',
      'read',
    ),
    ForbiddenException,
  );
});

test('媒体员工授权拒绝缺失或非法身份编号', () => {
  assert.throws(() => normalizeMediaStaffActor(0), ForbiddenException);
  assert.throws(() => normalizeMediaStaffActor({ id: Number.NaN }), ForbiddenException);
});
