import assert from 'node:assert/strict';
import test from 'node:test';
import { randomInt, randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from '../orders/orders.service';
import { MarketingService } from '../marketing/marketing.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomerAvatarService } from './customer-avatar.service';
import { CustomerNotificationsService } from './customer-notifications.service';
import { ReliableNotificationDeliveryWorker } from '../../common/notifications/reliable-notification-delivery.worker';
import { NotificationDeliveryPolicyService } from '../../common/notifications/notification-delivery-policy.service';
import { CustomerProfileService } from './customer-profile.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

const { validateTarget } = require('../../../scripts/run-real-mysql-tests.cjs');
const databaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL;

test(
  '真实 Nest HTTP + MySQL：客户资源、身份域与改密会话保持隔离',
  { skip: databaseUrl ? false : '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env), '客户隔离测试必须使用显式隔离库');
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const prismaService = prisma as unknown as PrismaService;
    const jwt = new JwtService({ secret: `customer-isolation-${randomUUID()}` });
    const refreshSessions = new RefreshSessionService(prismaService);
    const mailer = {
      isAvailable: () => false,
      send: async () => ({ delivered: false }),
      renderShell: (value: string) => value,
      getSiteBaseUrl: () => 'http://127.0.0.1',
    };
    const sms = {
      isAvailable: () => false,
      isRegisterVerificationRequired: () => false,
      sendVerificationCode: async () => ({ delivered: false }),
    };
    const orders = new OrdersService(
      prismaService,
      {} as never,
      mailer as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const avatars = {
      replace: async () => undefined,
      read: async () => undefined,
      delete: async () => undefined,
      remove: async () => undefined,
    };
    const customers = new CustomersService(
      prismaService,
      orders,
      jwt,
      mailer as never,
      sms as never,
      refreshSessions,
    );
    const profile = new CustomerProfileService(prismaService, sms as never, mailer as never);
    @Module({
      controllers: [CustomersController],
      providers: [
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: prismaService },
        { provide: CustomersService, useValue: customers },
        { provide: OrdersService, useValue: orders },
        CustomerNotificationsService,
        { provide: RefreshSessionService, useValue: refreshSessions },
        { provide: MarketingService, useValue: { listUsableCoupons: async () => [] } },
        { provide: CustomerProfileService, useValue: profile },
        { provide: CustomerAvatarService, useValue: avatars },
        { provide: CustomerAuthGuard, useValue: new CustomerAuthGuard(jwt, prismaService) },
        { provide: CustomerCommerceGuard, useValue: { canActivate: () => true } },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
        { provide: RolesGuard, useValue: { canActivate: () => true } },
      ],
    })
    class CustomerIsolationTestModule {}

    const createTestApp = async () => {
      const instance = await NestFactory.create(CustomerIsolationTestModule, {
        abortOnError: false,
        logger: ['error'],
      });
      instance.setGlobalPrefix('api');
      instance.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
      return instance;
    };
    let app = await createTestApp();

    const marker = randomUUID().replaceAll('-', '').slice(0, 10);
    const phoneBase = randomInt(10_000_000, 99_999_998);
    const createdCustomerIds: number[] = [];
    let categoryId: number | undefined;
    let appStarted = false;
    let baseUrl = '';
    const startApp = async () => {
      await app.listen(0, '127.0.0.1');
      appStarted = true;
      const port = (app.getHttpServer().address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}/api/customers`;
    };
    await prisma.$connect();
    try {
      const passwordHash = await bcrypt.hash('Oldpass1', 4);
      const [customerA, customerB] = await Promise.all([
        prisma.customer.create({
          data: { phone: `139${phoneBase}`, name: `客户A-${marker}`, passwordHash },
        }),
        prisma.customer.create({
          data: { phone: `139${phoneBase + 1}`, name: `客户B-${marker}`, passwordHash },
        }),
      ]);
      createdCustomerIds.push(customerA.id, customerB.id);
      const category = await prisma.category.create({
        data: { name: `隔离分类-${marker}`, slug: `customer-isolation-${marker}` },
      });
      categoryId = category.id;
      const [productA, productB] = await Promise.all([
        prisma.product.create({
          data: {
            code: `CIA-${marker}`,
            name: `客户A收藏-${marker}`,
            categoryId: category.id,
            status: 'PUBLISHED',
            publicationQualityStatus: 'READY',
            visibility: 'MEMBER',
          },
        }),
        prisma.product.create({
          data: {
            code: `CIB-${marker}`,
            name: `客户B收藏-${marker}`,
            categoryId: category.id,
            status: 'PUBLISHED',
            publicationQualityStatus: 'READY',
            visibility: 'MEMBER',
          },
        }),
      ]);
      const [addressA, addressB] = await Promise.all([
        prisma.customerAddress.create({
          data: { customerId: customerA.id, recipientName: '地址A', recipientPhone: customerA.phone, detail: '客户A私有地址' },
        }),
        prisma.customerAddress.create({
          data: { customerId: customerB.id, recipientName: '地址B', recipientPhone: customerB.phone, detail: '客户B私有地址' },
        }),
      ]);
      const [, , notificationA, notificationB] = await Promise.all([
        prisma.customerFavorite.create({ data: { customerId: customerA.id, productId: productA.id } }),
        prisma.customerFavorite.create({ data: { customerId: customerB.id, productId: productB.id } }),
        prisma.notification.create({
          data: { customerId: customerA.id, type: 'TEST', locale: 'ZH_CN', title: '通知A', body: '客户A私有通知', status: 'AVAILABLE' },
        }),
        prisma.notification.create({
          data: { customerId: customerB.id, type: 'TEST', locale: 'ZH_CN', title: '通知B', body: '客户B私有通知', status: 'AVAILABLE' },
        }),
      ]);
      await Promise.all([
        prisma.notification.create({
          data: { customerId: customerA.id, type: 'TEST', locale: 'ZH_CN', title: '待发布通知', body: '不可见', status: 'PENDING' },
        }),
        prisma.notification.create({
          data: {
            customerId: customerA.id,
            type: 'TEST',
            locale: 'ZH_CN',
            title: '未来通知',
            body: '不可见',
            status: 'AVAILABLE',
            availableAt: new Date(Date.now() + 60_000),
          },
        }),
        prisma.notification.create({
          data: { customerId: customerA.id, type: 'TEST', locale: 'ZH_CN', title: '归档通知', body: '不可见', status: 'ARCHIVED' },
        }),
      ]);
      const orderSnapshot = {
        shippingAddressSnapshot: { version: 1, recipientName: '隔离客户', recipientPhone: customerA.phone, detail: '隔离地址' },
        pricingSnapshot: { version: 1, currency: 'CNY', itemSubtotalCents: 100, discountCents: 0, shippingCents: 0, insuranceCents: 0, taxCents: 0, adjustmentCents: 0, finalCents: 100 },
      };
      await Promise.all([
        prisma.order.create({
          data: { orderNo: `CIA${marker}`, customerId: customerA.id, customerName: '客户A', customerPhone: customerA.phone, address: 'A', totalAmount: 1, finalAmount: 1, ...orderSnapshot },
        }),
        prisma.order.create({
          data: { orderNo: `CIB${marker}`, customerId: customerB.id, customerName: '客户B', customerPhone: customerB.phone, address: 'B', totalAmount: 1, finalAmount: 1, ...orderSnapshot },
        }),
      ]);
      const [inquiryA, inquiryB] = await Promise.all([
        prisma.inquiry.create({
          data: { customerId: customerA.id, customerName: '客户A', customerPhone: customerA.phone, message: '客户A私有咨询' },
        }),
        prisma.inquiry.create({
          data: { customerId: customerB.id, customerName: '客户B', customerPhone: customerB.phone, message: '客户B私有咨询' },
        }),
      ]);
      const [leadA] = await Promise.all([
        prisma.lead.create({
          data: { sourceType: 'INQUIRY', inquiryId: inquiryA.id, customerId: customerA.id, customerName: '客户A', phone: customerA.phone },
        }),
        prisma.lead.create({
          data: { sourceType: 'INQUIRY', inquiryId: inquiryB.id, customerId: customerB.id, customerName: '客户B', phone: customerB.phone },
        }),
      ]);

      const oldAccessA = jwt.sign({ sub: customerA.id, type: 'customer', tokenUse: 'access', authVersion: customerA.authVersion });
      const accessB = jwt.sign({ sub: customerB.id, type: 'customer', tokenUse: 'access', authVersion: customerB.authVersion });
      const staffAccess = jwt.sign({ sub: 1, type: 'admin', tokenUse: 'access', role: 'ADMIN' });
      const oldRefreshA = await refreshSessions.issueCustomer(customerA.id, {}, customerA.authVersion);

      await startApp();
      const call = async (
        path: string,
        token?: string,
        init: RequestInit = {},
      ) => {
        const headers = new Headers(init.headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        if (init.body) headers.set('Content-Type', 'application/json');
        const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
        const body = await response.json().catch(() => null);
        return { response, body };
      };

      const [addresses, favorites, ordersResult, notificationsResult, inquiries] = await Promise.all([
        call('/me/addresses', oldAccessA),
        call('/me/favorites', oldAccessA),
        call('/me/orders', oldAccessA),
        call('/me/notifications', oldAccessA),
        call('/me/inquiries', oldAccessA),
      ]);
      for (const result of [addresses, favorites, ordersResult, notificationsResult, inquiries]) {
        assert.equal(result.response.status, 200);
      }
      assert.deepEqual(addresses.body.map((row: { id: number }) => row.id), [addressA.id]);
      assert.deepEqual(favorites.body.map((row: { productId: number }) => row.productId), [productA.id]);
      assert.deepEqual(ordersResult.body.map((row: { customerId: number }) => row.customerId), [customerA.id]);
      assert.deepEqual(notificationsResult.body.list.map((row: { title: string }) => row.title), ['通知A']);
      assert.deepEqual(inquiries.body.list.map((row: { message: string }) => row.message), ['客户A私有咨询']);

      const foreignNotificationWrite = await call(`/me/notifications/${notificationA.id}/read`, accessB, {
        method: 'PUT',
      });
      assert.equal(foreignNotificationWrite.response.status, 404);
      assert.equal(
        (await prisma.notification.findUniqueOrThrow({ where: { id: notificationA.id } })).status,
        'AVAILABLE',
      );
      const readAllA = await call('/me/notifications/read-all', oldAccessA, { method: 'PUT' });
      assert.equal(readAllA.response.status, 200);
      assert.equal(
        (await prisma.notification.findUniqueOrThrow({ where: { id: notificationA.id } })).status,
        'READ',
      );
      assert.equal(
        (await prisma.notification.findUniqueOrThrow({ where: { id: notificationB.id } })).status,
        'AVAILABLE',
      );

      const defaultPreferencesA = await call('/me/notification-preferences', oldAccessA);
      const defaultPreferencesB = await call('/me/notification-preferences', accessB);
      assert.equal(defaultPreferencesA.response.status, 200);
      assert.equal(defaultPreferencesB.response.status, 200);
      const defaultOrderEmail = defaultPreferencesA.body.list.find(
        (item: { channel: string; topic: string }) =>
          item.channel === 'EMAIL' && item.topic === 'SERVICE_ORDER_CREATED',
      );
      const defaultMarketingEmail = defaultPreferencesA.body.list.find(
        (item: { channel: string; topic: string }) =>
          item.channel === 'EMAIL' && item.topic === 'MARKETING_GENERAL',
      );
      assert.equal(defaultOrderEmail.enabled, true);
      assert.equal(defaultOrderEmail.defaulted, true);
      assert.equal(defaultMarketingEmail.enabled, false);
      assert.equal(defaultPreferencesA.body.marketingConsentGranted, false);

      const firstPreferenceWrite = await call('/me/notification-preferences', oldAccessA, {
        method: 'PATCH',
        body: JSON.stringify({
          channel: 'EMAIL',
          topic: 'SERVICE_ORDER_CREATED',
          enabled: false,
          expectedUpdatedAt: null,
        }),
      });
      assert.equal(firstPreferenceWrite.response.status, 200);
      assert.equal(firstPreferenceWrite.body.enabled, false);
      assert.equal(
        await prisma.notificationPreference.count({
          where: { customerId: customerB.id, topic: 'SERVICE_ORDER_CREATED' },
        }),
        0,
      );
      await app.close();
      appStarted = false;
      app = await createTestApp();
      await startApp();
      const persistedPreferences = await call('/me/notification-preferences', oldAccessA);
      const persistedOrderEmail = persistedPreferences.body.list.find(
        (item: { channel: string; topic: string }) =>
          item.channel === 'EMAIL' && item.topic === 'SERVICE_ORDER_CREATED',
      );
      assert.equal(persistedPreferences.response.status, 200);
      assert.equal(persistedOrderEmail.enabled, false);
      assert.equal(persistedOrderEmail.updatedAt, firstPreferenceWrite.body.updatedAt);
      const preferenceVersion = firstPreferenceWrite.body.updatedAt;
      const concurrentPreferences = await Promise.all([
        call('/me/notification-preferences', oldAccessA, {
          method: 'PATCH',
          body: JSON.stringify({
            channel: 'EMAIL',
            topic: 'SERVICE_ORDER_CREATED',
            enabled: true,
            expectedUpdatedAt: preferenceVersion,
          }),
        }),
        call('/me/notification-preferences', oldAccessA, {
          method: 'PATCH',
          body: JSON.stringify({
            channel: 'EMAIL',
            topic: 'SERVICE_ORDER_CREATED',
            enabled: true,
            expectedUpdatedAt: preferenceVersion,
          }),
        }),
      ]);
      assert.deepEqual(
        concurrentPreferences.map(({ response }) => response.status).sort(),
        [200, 409],
      );
      assert.equal(
        await prisma.customerSecurityEvent.count({
          where: {
            customerId: customerA.id,
            eventType: 'NOTIFY_PREF_EMAIL_SERVICE_ORDER_CREATED_ON',
          },
        }),
        1,
      );
      assert.equal(
        await prisma.customerSecurityEvent.count({
          where: {
            customerId: customerA.id,
            eventType: 'NOTIFY_PREF_EMAIL_SERVICE_ORDER_CREATED_OFF',
          },
        }),
        1,
      );
      const staffPreferenceAttempt = await call('/me/notification-preferences', staffAccess);
      assert.equal(staffPreferenceAttempt.response.status, 401);

      const foreignConsultation = await call(`/me/consultations/${leadA.id}`, accessB);
      assert.equal(foreignConsultation.response.status, 404);
      const foreignAddressWrite = await call(`/me/addresses/${addressA.id}`, accessB, {
        method: 'PUT',
        body: JSON.stringify({ recipientName: '越权', recipientPhone: customerB.phone, detail: '不得修改' }),
      });
      assert.equal(foreignAddressWrite.response.status, 404);
      assert.equal((await prisma.customerAddress.findUniqueOrThrow({ where: { id: addressA.id } })).detail, '客户A私有地址');

      const staffAttempt = await call('/me/addresses', staffAccess);
      assert.equal(staffAttempt.response.status, 401);

      const changed = await call('/me/password', oldAccessA, {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: 'Oldpass1', newPassword: 'Newpass2' }),
      });
      assert.equal(changed.response.status, 200);
      assert.equal(changed.body.requiresReauthentication, true);
      assert.equal((await call('/me/addresses', oldAccessA)).response.status, 401);
      const refreshAttempt = await call('/session/refresh', undefined, {
        method: 'POST',
        headers: { Cookie: `hc_customer_refresh=${oldRefreshA.refreshToken}` },
      });
      assert.equal(refreshAttempt.response.status, 401);
      const updatedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: customerA.id } });
      assert.equal(updatedCustomer.authVersion, customerA.authVersion + 1);
      assert.equal(await prisma.customerSecurityEvent.count({ where: { customerId: customerA.id, eventType: 'PASSWORD_CHANGED' } }), 1);
      assert.equal(await prisma.customerRefreshSession.count({ where: { customerId: customerA.id, revokedAt: null } }), 0);
      assert.equal(addressB.customerId, customerB.id);

      const delivery = await prisma.notificationDelivery.create({
        data: {
          notificationId: notificationB.id,
          channel: 'EMAIL',
          status: 'PENDING',
          destinationHash: 'a'.repeat(64),
        },
      });
      const outboxEvent = await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Notification',
          aggregateId: String(notificationB.id),
          eventType: 'notification.delivery.requested',
          payload: { notificationId: notificationB.id, orderId: 1 },
          deduplicationKey: `customer-close-${marker}`,
        },
      });
      await prisma.notificationPreference.create({
        data: {
          customerId: customerB.id,
          channel: 'EMAIL',
          topic: 'SERVICE_ORDER_CREATED',
          enabled: false,
        },
      });
      await customers.closeAccount(customerB.id, 'Oldpass1');
      const cancelled = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(cancelled.destinationHash, null);
      assert.equal(
        await prisma.notificationPreference.count({ where: { customerId: customerB.id } }),
        0,
      );
      assert.equal(
        (await prisma.notification.findUniqueOrThrow({ where: { id: notificationB.id } })).status,
        'ARCHIVED',
      );
      let externalSends = 0;
      const worker = new ReliableNotificationDeliveryWorker(
        prismaService,
        { get: () => 'true' } as never,
        {
          send: async () => {
            externalSends += 1;
            return { delivered: true };
          },
        } as never,
        new NotificationDeliveryPolicyService(),
      );
      assert.equal(await worker.drainOnce(1), 1);
      assert.equal(externalSends, 0);
      assert.equal(
        (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: outboxEvent.id } })).status,
        'PROCESSED',
      );
      await prisma.outboxEvent.delete({ where: { id: outboxEvent.id } });
    } finally {
      if (appStarted) await app.close();
      await prisma.lead.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.inquiry.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.order.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      if (createdCustomerIds.length > 0) {
        await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
      }
      if (categoryId !== undefined) {
        await prisma.product.deleteMany({ where: { categoryId } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
      await prisma.$disconnect();
    }
  },
);
