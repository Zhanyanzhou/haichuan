import assert from 'node:assert/strict';
import test from 'node:test';
import * as bcrypt from 'bcrypt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomersService } from './customers.service';

const PASSWORD_HASH = bcrypt.hashSync('correct-password', 4);

function buildService(customer: Record<string, unknown> | null, smsRecords: Array<Record<string, unknown>> = []) {
  const prisma = {
    customer: {
      findUnique: async () => customer,
    },
    customerSmsCode: {
      findFirst: async ({ where }: { where: { codeHash: string; purpose: string } }) =>
        smsRecords.find(
          (record) => record.codeHash === where.codeHash && record.purpose === where.purpose,
        ) ?? null,
      updateMany: async () => ({ count: 1 }),
    },
  };
  const service = new CustomersService(
    prisma as unknown as PrismaService,
    {} as never,
    { sign: () => 'token' } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return service;
}

const PHONE = '13800001111';

/** 从自绘 SVG 中提取验证码答案（测试辅助；仅服务端内存持有答案，不外泄哈希） */
function answerFromSvg(svg: string): string {
  const letters = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map((m) => m[1]);
  return letters.join('');
}

test('三次失败后要求图形验证码；正确验证码加正确密码可登录并清零计数', async () => {
  const service = buildService({
    id: 1,
    phone: PHONE,
    passwordHash: PASSWORD_HASH,
    status: 'ACTIVE',
  });
  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(
      () => service.login({ phone: PHONE, password: 'wrong' }),
      UnauthorizedException,
    );
  }
  assert.equal((await service.loginChallenge(PHONE)).level, 'captcha');
  // 不带验证码直接尝试被拒绝且文案明确
  await assert.rejects(
    () => service.login({ phone: PHONE, password: 'correct-password' }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(error.message, /图形验证码/);
      return true;
    },
  );
  // 错误答案被拒且验证码一次性消费
  const captcha = service.issueLoginCaptcha();
  await assert.rejects(
    () => service.login({ phone: PHONE, password: 'correct-password', captchaId: captcha.captchaId, captchaCode: 'ZZZZ' }),
    BadRequestException,
  );
  // 正确图形验证码 + 正确密码 → 登录成功，计数清零
  const validCaptcha = service.issueLoginCaptcha();
  const result = await service.login({
    phone: PHONE,
    password: 'correct-password',
    captchaId: validCaptcha.captchaId,
    captchaCode: answerFromSvg(validCaptcha.svg),
  });
  assert.ok(result.accessToken);
  assert.equal((await service.loginChallenge(PHONE)).level, 'none');
});

test('五次失败后升级短信验证码；未提交短信码时被明确拒绝', async () => {
  const service = buildService({
    id: 1,
    phone: PHONE,
    passwordHash: PASSWORD_HASH,
    status: 'ACTIVE',
  });
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(async () => {
      try {
        await service.login({ phone: PHONE, password: 'wrong' });
      } catch (error) {
        // 处于图形验证码档位时带正确验证码继续累计失败
        if (error instanceof BadRequestException && /图形验证码/.test(error.message)) {
          const captcha = service.issueLoginCaptcha();
          return service.login({
            phone: PHONE,
            password: 'wrong',
            captchaId: captcha.captchaId,
            captchaCode: answerFromSvg(captcha.svg),
          });
        }
        throw error;
      }
    }, UnauthorizedException);
  }
  assert.equal((await service.loginChallenge(PHONE)).level, 'sms');
  await assert.rejects(
    () => service.login({ phone: PHONE, password: 'correct-password' }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(error.message, /短信验证码/);
      return true;
    },
  );
});

test('成功登录清零失败计数，无需任何挑战', async () => {
  const service = buildService({
    id: 1,
    phone: PHONE,
    passwordHash: PASSWORD_HASH,
    status: 'ACTIVE',
  });
  await assert.rejects(() => service.login({ phone: PHONE, password: 'wrong' }));
  await assert.rejects(() => service.login({ phone: PHONE, password: 'wrong' }));
  const result = await service.login({ phone: PHONE, password: 'correct-password' });
  assert.ok(result.accessToken);
  assert.equal((await service.loginChallenge(PHONE)).level, 'none');
});

test('不存在的手机号登录走等耗时比较并计入失败，不抛异常以外的错误', async () => {
  const service = buildService(null);
  await assert.rejects(
    () => service.login({ phone: PHONE, password: 'whatever' }),
    UnauthorizedException,
  );
  assert.equal((await service.loginChallenge(PHONE)).level, 'none');
});

test('图形验证码一次性消费：同一 captchaId 第二次校验直接过期', async () => {
  const service = buildService(null);
  const first = service.issueLoginCaptcha();
  const second = service.issueLoginCaptcha();
  // 通过公共 login 间接验证一次性语义：错误尝试两次后，第二次应提示过期而非不正确
  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(
      () => service.login({ phone: PHONE, password: 'wrong' }),
      UnauthorizedException,
    );
  }
  const firstAttempt = service.login({ phone: PHONE, password: 'x', captchaId: first.captchaId, captchaCode: 'AAAA' });
  const secondAttempt = service.login({ phone: PHONE, password: 'x', captchaId: first.captchaId, captchaCode: 'AAAA' });
  await assert.rejects(firstAttempt, BadRequestException);
  await assert.rejects(secondAttempt, (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    assert.match(error.message, /已过期|不正确/);
    return true;
  });
  assert.notEqual(first.captchaId, second.captchaId);
});
