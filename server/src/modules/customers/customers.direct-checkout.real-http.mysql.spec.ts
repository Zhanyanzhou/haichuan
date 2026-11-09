import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import test from 'node:test';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';

const enabled = process.env.DIRECT_CHECKOUT_REAL_MYSQL_TEST === '1';
const { validateTarget } = require('../../../scripts/run-real-mysql-tests.cjs');

test('真实 Nest HTTP + 一次性 MySQL：立即购买只结算所选 SKU 并保留购物车', {
  skip: enabled ? false : '需要显式提供一次性隔离 MySQL 与 DIRECT_CHECKOUT_REAL_MYSQL_TEST=1',
}, async () => {
  assert.equal(process.versions.node.split('.')[0], '22');
  const databaseUrl = validateTarget(process.env);
  assert.equal(new URL(process.env.DATABASE_URL!).href, databaseUrl);
  assert.equal(process.env.RELEASE_PROFILE, 'commerce');
  assert.equal(process.env.CUSTOMER_COMMERCE_ENABLED, 'true');
  assert.equal(process.env.PAYMENT_GATEWAY_TRANSACTIONS_ENABLED, 'false');
  assert.equal(process.env.PAYMENT_GATEWAY_REFUNDS_ENABLED, 'false');
  assert.equal(process.env.NOTIFICATION_DELIVERY_ENABLED, 'false');

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let app: INestApplication | undefined;
  try {
    assert.deepEqual(await Promise.all([
      prisma.customer.count(), prisma.product.count(), prisma.cart.count(), prisma.order.count(),
    ]), [0, 0, 0, 0], '只允许空的一次性业务库');
    const password = 'IsolatedDirect9!';
    const customer = await prisma.customer.create({ data: {
      phone: '13900000000', name: '合成直购客户', passwordHash: await bcrypt.hash(password, 4),
    } });
    const category = await prisma.category.create({ data: {
      name: '合成商品分类', slug: 'isolated-direct-checkout',
    } });
    const shipping = await prisma.shippingTemplate.create({ data: {
      name: '合成免费运费模板', feeMode: 'FREE', baseFee: 0, remoteSurcharge: 0, isActive: true,
    } });
    const warehouse = await prisma.warehouse.create({ data: {
      name: '合成库存仓', type: 'FACTORY', isDefault: true, defaultKey: 'PRIMARY',
    } });
    const product = await prisma.product.create({ data: {
      code: 'ISOLATED-DIRECT', name: '合成多重量戒指', categoryId: category.id,
      status: 'PUBLISHED', publicationQualityStatus: 'READY', visibility: 'PUBLIC',
      salesMode: 'DIRECT_PURCHASE', shippingTemplateId: shipping.id,
      price: 88.8, publishedAt: new Date(),
    } });
    const [lighter, heavier] = await Promise.all([
      prisma.productSKU.create({ data: {
        productId: product.id, skuCode: 'DIRECT-2G', goldWeight: 2, price: 88.8,
      } }),
      prisma.productSKU.create({ data: {
        productId: product.id, skuCode: 'DIRECT-3G', goldWeight: 3, price: 129.95,
      } }),
    ]);
    await prisma.inventory.createMany({ data: [
      { skuId: lighter.id, warehouseId: warehouse.id, quantity: 6 },
      { skuId: heavier.id, warehouseId: warehouse.id, quantity: 3 },
    ] });

    const { AppModule } = await import('../../app.module');
    app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const baseUrl = `${await app.getUrl()}/api`;
    const post = async (path: string, body: unknown, expected: number, token?: string, key?: string) => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (key) headers.set('Idempotency-Key', key);
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST', body: JSON.stringify(body), headers,
      });
      assert.equal(response.status, expected, `POST ${path}`);
      return (await response.json()).data;
    };
    const checkoutPath = '/customers/checkout';
    const input = { address: '合成收货地址', items: [{ skuId: heavier.id, quantity: 2 }] };
    const direct = { ...input, purchaseSource: 'DIRECT' };
    const key = 'isolated-direct-checkout-01';
    await post(checkoutPath, direct, 401, undefined, key);
    const login = await post('/customers/login', { phone: customer.phone, password }, 201);
    const token: string = login.accessToken;
    assert.ok(token);
    process.env.CUSTOMER_COMMERCE_ENABLED = 'false';
    try {
      await post(checkoutPath, direct, 503, token, key);
    } finally {
      process.env.CUSTOMER_COMMERCE_ENABLED = 'true';
    }
    await post(checkoutPath, {
      ...direct, items: [...input.items, { skuId: lighter.id, quantity: 1 }],
    }, 400, token, key);
    assert.equal(await prisma.order.count(), 0);

    for (const sku of [lighter, heavier]) {
      await post('/cart', { productId: product.id, skuId: sku.id, quantity: 1 }, 201, token);
    }
    const cartQuery = { where: { userId: customer.id }, orderBy: { id: 'asc' } } as const;
    const cartBefore = await prisma.cart.findMany(cartQuery);
    assert.equal(cartBefore.length, 2);

    const created = await post(checkoutPath, direct, 201, token, key);
    const orderId: number = created.order.id;
    const replay = await post(checkoutPath, direct, 201, token, key);
    assert.equal(replay.order.id, orderId);
    await post(checkoutPath, input, 409, token, key);
    await post(checkoutPath, direct, 400, token, 'isolated-direct-checkout-02');

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId }, include: { items: true },
    });
    assert.equal(order.customerId, customer.id);
    assert.equal(order.status, 'PENDING_PAYMENT');
    assert.equal(order.finalAmount.toFixed(2), '259.90');
    assert.deepEqual(order.items.map(({ skuId, quantity, unitPrice }) => ({
      skuId, quantity, unitPrice: unitPrice.toFixed(2),
    })), [{ skuId: heavier.id, quantity: 2, unitPrice: '129.95' }]);
    const inventory = await prisma.inventory.findMany({ where: { warehouseId: warehouse.id } });
    assert.equal(inventory.find(({ skuId }) => skuId === lighter.id)?.quantity, 6);
    assert.equal(inventory.find(({ skuId }) => skuId === heavier.id)?.quantity, 1);
    const reservations = await prisma.inventoryReservation.findMany({ where: { orderId } });
    assert.deepEqual(reservations.map(({ skuId, quantity }) => ({ skuId, quantity })), [
      { skuId: heavier.id, quantity: 2 },
    ]);
    assert.deepEqual(await prisma.cart.findMany(cartQuery), cartBefore);
    assert.equal(await prisma.order.count(), 1);
    assert.equal(await prisma.payment.count(), 0);
  } finally {
    if (app) {
      const server = app.getHttpServer() as Server;
      server.closeAllConnections?.();
      await app.close();
    }
    await prisma.$disconnect();
  }
});
