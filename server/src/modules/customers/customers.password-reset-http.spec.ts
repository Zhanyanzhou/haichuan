import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { Module, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { MarketingService } from '../marketing/marketing.service';
import { OrdersService } from '../orders/orders.service';
import { CustomerAvatarService } from './customer-avatar.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomerNotificationsService } from './customer-notifications.service';
import { CustomerProfileService } from './customer-profile.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PASSWORD_RESET_ACCEPTED_MESSAGE } from './password-reset-outbox';

let passwordResetShouldFail = false;

@Module({
  controllers: [CustomersController],
  providers: [
    { provide: JwtService, useValue: {} },
    { provide: PrismaService, useValue: {} },
    {
      provide: CustomersService,
      useValue: {
        requestPasswordReset: async () => {
          if (passwordResetShouldFail) {
            throw new ServiceUnavailableException('synthetic unavailable');
          }
          return { message: PASSWORD_RESET_ACCEPTED_MESSAGE };
        },
      },
    },
    { provide: OrdersService, useValue: {} },
    { provide: CustomerNotificationsService, useValue: {} },
    { provide: RefreshSessionService, useValue: {} },
    { provide: MarketingService, useValue: {} },
    { provide: CustomerProfileService, useValue: {} },
    { provide: CustomerAvatarService, useValue: {} },
    CustomerAuthGuard,
    CustomerCommerceGuard,
  ],
})
class PasswordResetHttpModule {}

test('Nest HTTP 密码找回实际发出 202、统一 envelope 与禁止缓存头', async () => {
  passwordResetShouldFail = false;
  const app = await NestFactory.create(PasswordResetHttpModule, {
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix('api');
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const endpoint = `http://127.0.0.1:${port}/api/customers/forgot-password`;

  try {
    const accepted = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'member@example.test' }),
    });
    assert.equal(accepted.status, 202);
    assert.equal(accepted.headers.get('cache-control'), 'no-store, max-age=0');
    const acceptedBody = await accepted.json() as {
      code: number;
      data: { message: string };
      message: string;
    };
    assert.equal(acceptedBody.code, 200);
    assert.equal(acceptedBody.message, 'success');
    assert.deepEqual(acceptedBody.data, { message: PASSWORD_RESET_ACCEPTED_MESSAGE });

    passwordResetShouldFail = true;
    const failed = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'member@example.test' }),
    });
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get('cache-control'), 'no-store, max-age=0');
  } finally {
    await app.close();
  }
});
