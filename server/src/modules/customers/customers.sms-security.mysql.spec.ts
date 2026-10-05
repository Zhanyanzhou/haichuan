import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { WechatAuthService } from '../wechat-auth/wechat-auth.service';
import { CustomersService } from './customers.service';

const { validateTarget } = require('../../../scripts/run-real-mysql-tests.cjs');
const databaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL;

type SmsResult = { delivered: boolean; reason?: string };

function fakeSms(options: {
  available?: boolean;
  result?: SmsResult;
  onSend?: (phone: string, code: string, idempotencyKey?: string) => void;
} = {}) {
  return {
    isAvailable: () => options.available ?? true,
    isRegisterVerificationRequired: () => true,
    sendVerificationCode: async (
      phone: string,
      code: string,
      sendOptions: { idempotencyKey?: string } = {},
    ) => {
      options.onSend?.(phone, code, sendOptions.idempotencyKey);
      return options.result ?? { delivered: true };
    },
  };
}

function serviceFor(prisma: PrismaService, sms: ReturnType<typeof fakeSms>) {
  return new CustomersService(
    prisma,
    {} as never,
    new JwtService({ secret: `sms-security-${randomUUID()}` }),
    {} as never,
    sms as never,
    new RefreshSessionService(prisma),
  );
}

function codeHash(phone: string, code: string) {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

function countBarrier(participants: number) {
  let arrived = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  return async () => {
    arrived += 1;
    if (arrived === participants) release();
    await released;
  };
}

/**
 * 修复前的 Service 在事务外执行 find/count/create。这里仅在事务外 count 处设置栅栏，
 * 让多个真实连接稳定读到同一旧快照；修复后的原子事务不会经过该栅栏。
 */
function multiInstancePrismaPort(prisma: PrismaClient, afterCount: () => Promise<void>) {
  return {
    customerSmsRateLimit: {
      create: (args: never) => prisma.customerSmsRateLimit.create(args),
    },
    customerSmsCode: {
      findFirst: (args: never) => prisma.customerSmsCode.findFirst(args),
      count: async (args: never) => {
        const count = await prisma.customerSmsCode.count(args);
        await afterCount();
        return count;
      },
      create: (args: never) => prisma.customerSmsCode.create(args),
      update: (args: never) => prisma.customerSmsCode.update(args),
    },
    $transaction: (action: never, options: never) => prisma.$transaction(action, options),
  } as unknown as PrismaService;
}

test(
  '真实 MySQL：注册验证码绑定手机号与用途、一次性消费，并保留正常注册登录',
  { skip: databaseUrl ? false : '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env));
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const phone = '13900001001';
    const code = '428731';
    const service = serviceFor(prisma as unknown as PrismaService, fakeSms());
    try {
      await assert.rejects(
        service.register({ phone, name: '合成会员', password: 'secure12' }),
        /请输入短信验证码/,
      );
      await assert.rejects(
        service.register({ phone, name: '合成会员', password: 'secure12', smsCode: '111111' }),
        /短信验证码错误或已过期/,
      );

      await prisma.customerSmsCode.createMany({
        data: [
          {
            phone: '13900001002',
            codeHash: codeHash('13900001002', code),
            purpose: 'REGISTER',
            expiresAt: new Date(Date.now() + 300_000),
          },
          {
            phone,
            codeHash: codeHash(phone, code),
            purpose: 'LOGIN',
            expiresAt: new Date(Date.now() + 300_000),
          },
          {
            phone,
            codeHash: codeHash(phone, '520419'),
            purpose: 'REGISTER',
            expiresAt: new Date(Date.now() - 1_000),
          },
        ],
      });
      await assert.rejects(
        service.register({ phone, name: '合成会员', password: 'secure12', smsCode: code }),
        /短信验证码错误或已过期/,
      );
      await assert.rejects(
        service.register({ phone, name: '合成会员', password: 'secure12', smsCode: '520419' }),
        /短信验证码错误或已过期/,
      );

      await prisma.customerSmsCode.create({
        data: {
          phone,
          codeHash: codeHash(phone, code),
          purpose: 'REGISTER',
          expiresAt: new Date(Date.now() + 300_000),
        },
      });
      const registered = await service.register({
        phone,
        name: '合成会员',
        password: 'secure12',
        smsCode: code,
      });
      assert.equal(registered.customer.phone, phone);
      assert.ok(registered.accessToken);
      const loggedIn = await service.login({ phone, password: 'secure12' });
      assert.equal(loggedIn.customer.id, registered.customer.id);

      await prisma.customer.delete({ where: { id: registered.customer.id } });
      await assert.rejects(
        service.register({ phone, name: '重复消费', password: 'secure12', smsCode: code }),
        /短信验证码错误或已过期/,
      );
    } finally {
      await prisma.customer.deleteMany({ where: { phone: { startsWith: '13900001' } } });
      await prisma.customerSmsCode.deleteMany({ where: { phone: { startsWith: '13900001' } } });
      await prisma.customerSmsRateLimit.deleteMany({ where: { phone: { startsWith: '13900001' } } });
      await prisma.$disconnect();
    }
  },
);

test(
  '真实 MySQL：多连接同时请求同一号码时只保留一次额度并只调用一次 fake SMS',
  { skip: databaseUrl ? false : '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env));
    const participants = 6;
    const clients = Array.from(
      { length: participants },
      () => new PrismaClient({ datasourceUrl: databaseUrl }),
    );
    const phone = '13900002001';
    const barrier = countBarrier(participants);
    const sends: Array<{ phone: string; key?: string }> = [];
    const sms = fakeSms({ onSend: (sentPhone, _code, key) => sends.push({ phone: sentPhone, key }) });
    const services = clients.map((client) => serviceFor(multiInstancePrismaPort(client, barrier), sms));
    try {
      const results = await Promise.allSettled(
        services.map((service) => service.requestSmsCode(phone)),
      );
      assert.equal(
        results.filter(({ status }) => status === 'fulfilled').length,
        1,
        results.map((result) => result.status === 'fulfilled'
          ? 'fulfilled'
          : `${result.reason?.constructor?.name ?? 'Error'}:${result.reason?.message ?? 'unknown'}`).join(' | '),
      );
      assert.equal(sends.length, 1);
      assert.equal(await clients[0].customerSmsCode.count({ where: { phone } }), 1);
      assert.equal((await clients[0].customerSmsCode.findFirstOrThrow({ where: { phone } })).usedAt, null);
      assert.match(sends[0]?.key ?? '', /^sms:verification:\d+$/);
    } finally {
      await clients[0].customerSmsCode.deleteMany({ where: { phone } });
      await clients[0].customerSmsRateLimit.deleteMany({ where: { phone } });
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  },
);

test(
  '真实 MySQL：每日额度边界、不同号码及发送失败重试保持可审计一致',
  { skip: databaseUrl ? false : '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env));
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const nearLimit = '13900003001';
    const independentA = '13900003002';
    const independentB = '13900003003';
    const failedPhone = '13900003004';
    const unavailablePhone = '13900003005';
    const dayStart = new Date();
    dayStart.setHours(0, 0, 1, 0);
    const sends: string[] = [];
    const success = serviceFor(
      prisma as unknown as PrismaService,
      fakeSms({ onSend: (phone) => sends.push(phone) }),
    );
    try {
      await prisma.customerSmsCode.createMany({
        data: Array.from({ length: 9 }, (_, index) => ({
          phone: nearLimit,
          codeHash: codeHash(nearLimit, String(100000 + index)),
          purpose: 'REGISTER',
          expiresAt: new Date(Date.now() - 1_000),
          createdAt: new Date(dayStart.getTime() + index),
        })),
      });
      const nearLimitResults = await Promise.allSettled([
        success.requestSmsCode(nearLimit),
        success.requestSmsCode(nearLimit),
      ]);
      assert.equal(nearLimitResults.filter(({ status }) => status === 'fulfilled').length, 1);
      assert.equal(await prisma.customerSmsCode.count({ where: { phone: nearLimit } }), 10);
      assert.equal(sends.filter((phone) => phone === nearLimit).length, 1);
      await prisma.customerSmsRateLimit.update({
        where: { phone: nearLimit },
        data: { lastAttemptAt: new Date(Date.now() - 61_000) },
      });
      await assert.rejects(
        success.requestSmsCode(nearLimit),
        /今日该手机号验证码发送次数已达上限/,
      );
      assert.equal(sends.filter((phone) => phone === nearLimit).length, 1);

      const independent = await Promise.all([
        success.requestSmsCode(independentA),
        success.requestSmsCode(independentB),
      ]);
      assert.equal(independent.length, 2);
      assert.equal(sends.filter((phone) => phone === independentA).length, 1);
      assert.equal(sends.filter((phone) => phone === independentB).length, 1);

      let failedCalls = 0;
      const failed = serviceFor(
        prisma as unknown as PrismaService,
        fakeSms({
          result: { delivered: false, reason: 'result_unknown' },
          onSend: () => { failedCalls += 1; },
        }),
      );
      await assert.rejects(failed.requestSmsCode(failedPhone), /短信发送结果未确认/);
      await assert.rejects(failed.requestSmsCode(failedPhone), /发送过于频繁/);
      assert.equal(failedCalls, 1);
      assert.equal(await prisma.customerSmsCode.count({ where: { phone: failedPhone } }), 1);
      assert.ok((await prisma.customerSmsCode.findFirstOrThrow({ where: { phone: failedPhone } })).usedAt);

      const unavailable = serviceFor(
        prisma as unknown as PrismaService,
        fakeSms({ available: false }),
      );
      await assert.rejects(unavailable.requestSmsCode(unavailablePhone), /短信服务暂不可用/);
      assert.equal(await prisma.customerSmsCode.count({ where: { phone: unavailablePhone } }), 0);
    } finally {
      await prisma.customerSmsCode.deleteMany({ where: { phone: { startsWith: '13900003' } } });
      await prisma.customerSmsRateLimit.deleteMany({ where: { phone: { startsWith: '13900003' } } });
      await prisma.$disconnect();
    }
  },
);

test(
  '真实 MySQL：微信新号创建失败时 REGISTER 验证码消费随事务回滚',
  { skip: databaseUrl ? false : '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env));
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const occupiedPhone = '13900004001';
    const newPhone = '13900004002';
    const code = '684219';
    try {
      await prisma.customer.create({
        data: {
          phone: occupiedPhone,
          name: '合成占位会员',
          wechatOpenId: 'wechat-openid-occupied',
        },
      });
      const smsRecord = await prisma.customerSmsCode.create({
        data: {
          phone: newPhone,
          codeHash: codeHash(newPhone, code),
          purpose: 'REGISTER',
          expiresAt: new Date(Date.now() + 300_000),
        },
      });
      const wechat = new WechatAuthService(
        prisma as unknown as PrismaService,
        {
          verifyAsync: async () => ({
            type: 'customer',
            tokenUse: 'wechat-bind',
            openid: 'wechat-openid-occupied',
            unionid: null,
          }),
          sign: () => 'test-access-token',
        } as never,
        fakeSms() as never,
      );
      await assert.rejects(wechat.bindWechat({
        bindToken: 'header.payload.signature',
        phone: newPhone,
        password: 'secure12',
        name: '合成新会员',
        smsCode: code,
      }));
      assert.equal(
        (await prisma.customerSmsCode.findUniqueOrThrow({ where: { id: smsRecord.id } })).usedAt,
        null,
      );
      assert.equal(await prisma.customer.count({ where: { phone: newPhone } }), 0);
    } finally {
      await prisma.customer.deleteMany({ where: { phone: { startsWith: '13900004' } } });
      await prisma.customerSmsCode.deleteMany({ where: { phone: { startsWith: '13900004' } } });
      await prisma.customerSmsRateLimit.deleteMany({ where: { phone: { startsWith: '13900004' } } });
      await prisma.$disconnect();
    }
  },
);
