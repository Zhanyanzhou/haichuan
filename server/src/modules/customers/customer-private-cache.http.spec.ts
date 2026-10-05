import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { Module, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { MarketingService } from '../marketing/marketing.service';
import { OrdersService } from '../orders/orders.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomerAvatarService } from './customer-avatar.service';
import { CustomerNotificationsService } from './customer-notifications.service';
import { CustomerProfileService } from './customer-profile.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

let profileShouldFail = false;

@Module({
  controllers: [CustomersController],
  providers: [
    {
      provide: JwtService,
      useValue: {
        verifyAsync: async () => ({
          type: 'customer',
          tokenUse: 'access',
          sub: 31,
          authVersion: 2,
        }),
      },
    },
    {
      provide: PrismaService,
      useValue: {
        customer: {
          findFirst: async () => ({
            id: 31,
            name: '测试客户',
            phone: '13800000000',
            email: null,
            authVersion: 2,
            accountType: 'PERSONAL',
            partnerStatus: 'NONE',
          }),
        },
      },
    },
    { provide: CustomersService, useValue: {} },
    { provide: OrdersService, useValue: {} },
    { provide: CustomerNotificationsService, useValue: {} },
    { provide: RefreshSessionService, useValue: {} },
    { provide: MarketingService, useValue: {} },
    {
      provide: CustomerProfileService,
      useValue: {
        getProfile: async (customer: { id: number }) => {
          if (profileShouldFail) {
            throw new ServiceUnavailableException('synthetic unavailable');
          }
          return { id: customer.id, name: '测试客户' };
        },
      },
    },
    {
      provide: CustomerAvatarService,
      useValue: {
        replaceStatus: async () => ({ status: 'CURRENT' }),
      },
    },
    CustomerAuthGuard,
    CustomerCommerceGuard,
  ],
})
class PrivateCacheHttpModule {}

test('Nest HTTP 对客户成功与失败响应实际发出私有禁止缓存头', async () => {
  profileShouldFail = false;
  const app = await NestFactory.create(PrivateCacheHttpModule, {
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const profile = await fetch(`${baseUrl}/customers/me`, {
      headers: {
        Authorization: 'Bearer synthetic-customer',
        Cookie: 'hc_customer_access=synthetic-customer',
      },
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(profile.headers.get('vary'), 'Cookie, Authorization');
    assert.deepEqual(await profile.json(), { id: 31, name: '测试客户' });

    profileShouldFail = true;
    const failedProfile = await fetch(`${baseUrl}/customers/me`, {
      headers: { Authorization: 'Bearer synthetic-customer' },
    });
    assert.equal(failedProfile.status, 503);
    assert.equal(
      failedProfile.headers.get('cache-control'),
      'private, no-store, max-age=0',
    );
    assert.equal(failedProfile.headers.get('vary'), 'Cookie, Authorization');

    const avatarStatus = await fetch(`${baseUrl}/customers/me/avatar/status`, {
      headers: {
        Authorization: 'Bearer synthetic-customer',
        'Idempotency-Key': 'avatar-status-test-0001',
      },
    });
    assert.equal(avatarStatus.status, 200);
    assert.equal(avatarStatus.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(avatarStatus.headers.get('vary'), 'Cookie, Authorization');
    assert.deepEqual(await avatarStatus.json(), { status: 'CURRENT' });

  } finally {
    await app.close();
  }
});
