import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ApiError } from '../../common/errors/api-error';
import { AuthService } from './auth.service';

test('员工历史密码长于 18 位仍能按原哈希登录，响应不包含哈希', async () => {
  const password = 'historical-valid-password';
  const passwordHash = await bcrypt.hash(password, 4);
  const service = new AuthService(
    { user: { findUnique: async () => ({ id: 7, username: 'legacy-staff', status: 'ACTIVE', password: passwordHash }) } } as never,
    {} as never,
    {} as never,
  );
  const staff = await service.validateUser('legacy-staff', password);
  assert.equal(staff.id, 7);
  assert.equal('password' in staff, false);
});

test('后台员工连续登录失败后返回稳定且不泄露账号存在性的锁定错误码', async () => {
  const existingPasswordHash = await bcrypt.hash('historical-valid-password', 4);
  const scenarios = [
    { username: 'missing-admin', user: null },
    {
      username: 'existing-admin',
      user: {
        id: 7,
        username: 'existing-admin',
        password: existingPasswordHash,
        status: 'ACTIVE',
      },
    },
  ] as const;

  for (const scenario of scenarios) {
    const service = new AuthService(
      { user: { findUnique: async () => scenario.user } } as never,
      {} as never,
      {} as never,
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(
        () => service.validateUser(scenario.username, 'invalid-password'),
        /用户名或密码错误/,
      );
    }

    await assert.rejects(
      () => service.validateUser(scenario.username, 'invalid-password'),
      (error: unknown) =>
        error instanceof ApiError
        && error.getStatus() === HttpStatus.FORBIDDEN
        && error.errorCode === 'ADMIN_LOGIN_TEMPORARILY_LOCKED'
        && error.details?.retryAfterMinutes === 15,
    );
  }
});
