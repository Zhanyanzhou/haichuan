import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { createPaymentSimulatorServer } from '../../common/payment-gateway/payment-simulator.server';
import { PaymentGatewayService } from '../../common/payment-gateway/payment-gateway.service';
import { ProductsService } from '../products/products.service';
import { reconcileBill } from '../../cli/payment-reconciliation';

const databaseUrl = process.env.CUSTOMER_PAYMENT_REAL_MYSQL_URL?.trim();
const { validateTarget } = require('../../../scripts/run-real-mysql-tests.cjs');
const simulatorSecret = 'isolated-customer-payment-simulator-secret';

type ApiResult = { status: number; body: unknown; data: any };

function assertStatus(result: ApiResult, status: number, label: string) {
  assert.equal(result.status, status,
    `${label}: expected ${status}, received ${result.status}, body=${JSON.stringify(result.body)}`);
}

async function closeApi(app?: INestApplication) {
  if (!app) return;
  const server = app.getHttpServer() as Server;
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  await app.close();
}

test('真实 Nest HTTP + 一次性 MySQL：客户结算、微信模拟支付、退款与对账', {
  skip: databaseUrl && process.env.CUSTOMER_PAYMENT_REAL_MYSQL_TEST === '1'
    ? false : '需要显式提供一次性隔离 MySQL 与 CUSTOMER_PAYMENT_REAL_MYSQL_TEST=1',
}, async () => {
  assert.equal(process.versions.node.split('.')[0], '22');
  assert.equal(process.env.REAL_MYSQL_TEST_ISOLATED, '1');
  assert.equal(process.env.CUSTOMER_PAYMENT_REAL_MYSQL_TEST, '1');
  assert.equal(process.env.RELEASE_PROFILE, 'commerce');
  assert.equal(process.env.PAYMENT_PROVIDER_MODE, 'simulator');
  assert.equal(process.env.CUSTOMER_COMMERCE_ENABLED, 'true');
  assert.equal(process.env.PAYMENT_GATEWAY_TRANSACTIONS_ENABLED, 'true');
  assert.equal(process.env.PAYMENT_GATEWAY_REFUNDS_ENABLED, 'true');
  assert.ok(databaseUrl);
  assert.equal(new URL(databaseUrl).href, validateTarget(process.env));
  assert.equal(new URL(process.env.DATABASE_URL!).href, new URL(databaseUrl).href);
  const runId = process.env.CUSTOMER_PAYMENT_RUN_ID?.trim() ?? '';
  assert.match(runId, /^[a-z0-9]{6,12}$/);
  const apiPort = Number(process.env.CUSTOMER_PAYMENT_API_PORT);
  assert.ok(Number.isInteger(apiPort) && apiPort >= 1024 && apiPort <= 65535);

  const simulator = createPaymentSimulatorServer({ signingSecret: simulatorSecret });
  const simulatorUrl = await simulator.listen();
  process.env.PAYMENT_SIMULATOR_BASE_URL = simulatorUrl;
  process.env.PAYMENT_SIMULATOR_SCENARIO = 'success';
  process.env.PAYMENT_SIMULATOR_SIGNING_SECRET = simulatorSecret;
  const mediaRoot = await mkdtemp(join(tmpdir(), 'hc-payment-media-'));
  process.env.PRODUCT_MEDIA_ROOT = mediaRoot;
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let app: INestApplication | undefined;
  try {
    await prisma.$connect();
    assert.deepEqual([
      await prisma.user.count(), await prisma.customer.count(),
      await prisma.product.count(), await prisma.order.count(),
    ], [0, 0, 0, 0], '只允许空的一次性业务库');

    const password = 'IsolatedPay9!';
    const passwordHash = await bcrypt.hash(password, 4);
    const admin = await prisma.user.create({ data: {
      username: `pay-admin-${runId}`, password: passwordHash,
      realName: '交易核验管理员', role: 'ADMIN',
    } });
    const serviceStaff = await prisma.user.create({ data: {
      username: `pay-service-${runId}`, password: passwordHash,
      realName: '交易核验客服', role: 'CUSTOMER_SERVICE',
    } });
    const phoneSuffix = runId.replace(/\D/g, '').slice(-8).padStart(8, '0');
    const customer = await prisma.customer.create({ data: {
      phone: `139${phoneSuffix}`, name: '交易核验客户', passwordHash,
    } });
    const otherCustomer = await prisma.customer.create({ data: {
      phone: `138${phoneSuffix}`, name: '其他核验客户', passwordHash,
    } });
    const category = await prisma.category.create({ data: {
      name: '金工首饰', slug: `pay-${runId}`,
    } });
    const shipping = await prisma.shippingTemplate.create({ data: {
      name: '全国标准包邮', feeMode: 'FREE', baseFee: 0,
      remoteSurcharge: 0, isActive: true,
    } });
    const warehouse = await prisma.warehouse.create({ data: {
      name: `交易核验仓-${runId}`, type: 'FACTORY', isDefault: true,
      defaultKey: 'PRIMARY',
    } });
    const product = await prisma.product.create({ data: {
      code: `HC-PAY-${runId.toUpperCase()}`, name: '金质素圈戒指',
      shortDescription: '以手工打磨呈现温润金质光泽的日常戒指',
      description: '此款金质戒指采用细致的手工打磨工序，呈现平滑的轮廓与温润的表面质感，适于日常佩戴。',
      detailContent: { sections: [{ type: 'text', value: '金质表面经过细致打磨，线条简洁。' }] },
      categoryId: category.id, goldWeight: 1, weight: 1,
      price: 88.8, salesMode: 'DIRECT_PURCHASE', visibility: 'PUBLIC',
      shippingTemplateId: shipping.id, deliveryMethods: ['EXPRESS'],
    } });
    const sku = await prisma.productSKU.create({ data: {
      productId: product.id, skuCode: `PAY-SKU-${runId}`, price: 88.8, goldWeight: 1,
    } });
    await prisma.inventory.create({ data: {
      skuId: sku.id, warehouseId: warehouse.id, quantity: 2,
    } });
    const bytes = Buffer.from('isolated-product-media');
    const storageKey = `product-assets/payment-${runId}/piece.png`;
    await mkdir(join(mediaRoot, 'product-assets', `payment-${runId}`), { recursive: true });
    await writeFile(join(mediaRoot, storageKey), bytes);
    const asset = await prisma.mediaAsset.create({ data: {
      storageKey, originalName: 'piece.png', mimeType: 'image/png',
      byteSize: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex'),
      accessLevel: 'PUBLIC', status: 'READY', uploadedBy: admin.id,
      authorization: { create: {
        revision: 1, publicUseEpoch: 1, sourceType: 'BRAND_OWNED',
        authorizationBasis: 'isolated integration fixture',
        evidenceReference: 'local://isolated/payment-media',
        publicWebUseAllowed: true, reviewStatus: 'APPROVED',
        preparedById: admin.id, submittedById: admin.id, submittedAt: new Date(),
        reviewedById: admin.id, reviewedAt: new Date(),
      } },
    } });
    const image = await prisma.productImage.create({ data: {
      productId: product.id, url: `/products/catalog/${product.id}/media/piece`,
      storageKey, mediaAssetId: asset.id, type: 'FRONT', isVideo: false,
      mimeType: 'image/png',
    } });
    await prisma.product.update({ where: { id: product.id }, data: {
      primaryImageId: image.id, listingImageId: image.id,
    } });

    const { AppModule } = await import('../../app.module');
    app = await NestFactory.create(AppModule, { abortOnError: false, logger: false, rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true,
      transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(apiPort, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${apiPort}/api`;
    const call = async (path: string, token?: string, init: RequestInit = {}): Promise<ApiResult> => {
      const headers = new Headers(init.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers, keepalive: false });
      const body = await response.json().catch(() => null);
      const envelope = body as { data?: unknown } | null;
      return { status: response.status, body,
        data: envelope && 'data' in envelope ? envelope.data : body };
    };
    const write = (path: string, token: string, method: string, body: unknown,
      headers: Record<string, string> = {}) => call(path, token, {
        method, headers, body: JSON.stringify(body),
      });
    const loginStaff = async (username: string) => {
      const result = await call('/auth/login', undefined, {
        method: 'POST', body: JSON.stringify({ username, password }),
      });
      assertStatus(result, 201, '员工登录');
      return result.data.accessToken as string;
    };
    const loginCustomer = async (phone: string) => {
      const result = await call('/customers/login', undefined, {
        method: 'POST', body: JSON.stringify({ phone, password }),
      });
      assertStatus(result, 201, '客户登录');
      return result.data.accessToken as string;
    };
    const adminToken = await loginStaff(admin.username);
    const serviceToken = await loginStaff(serviceStaff.username);
    const customerToken = await loginCustomer(customer.phone);
    const otherToken = await loginCustomer(otherCustomer.phone);

    await app.get(ProductsService).canPublish(product.id);
    await prisma.product.update({ where: { id: product.id }, data: {
      status: 'PUBLISHED', publishedAt: new Date(),
    } });
    assertStatus(await write('/cart', customerToken, 'POST', {
      productId: product.id, skuId: sku.id, quantity: 1,
    }), 201, '客户加入购物车');
    const checkoutPayload = {
      address: '广东省深圳市南山区珠宝路 1 号',
      items: [{ skuId: sku.id, quantity: 1 }],
    };
    const checkout = await write('/customers/checkout', customerToken, 'POST', checkoutPayload,
      { 'Idempotency-Key': `pay-checkout-${runId}` });
    assertStatus(checkout, 201, '客户本人结算');
    const orderId = checkout.data.order.id as number;
    assert.ok(orderId > 0);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status,
      'PENDING_PAYMENT');
    const replay = await write('/customers/checkout', customerToken, 'POST', checkoutPayload,
      { 'Idempotency-Key': `pay-checkout-${runId}` });
    assertStatus(replay, 201, '结算回执重放');
    assert.equal(replay.data.order.id, orderId);
    assert.equal(await prisma.order.count(), 1);

    assertStatus(await call(`/customers/me/orders/${orderId}/payment`, otherToken), 404,
      '其他客户不得查询支付');
    const paymentResult = await write(`/customers/me/orders/${orderId}/payment`, customerToken,
      'POST', {}, { 'user-agent': 'Mozilla/5.0 Windows NT 10.0' });
    assertStatus(paymentResult, 201, '客户创建微信模拟支付');
    assert.equal(paymentResult.data.provider, 'wechat');
    assert.equal(paymentResult.data.reused, false);
    assert.equal(paymentResult.data.payment.amount, 88.8);
    assert.match(paymentResult.data.qrCode, /^http:\/\/127\.0\.0\.1:\d+\/checkout\/wechat\//);
    const paymentNo = paymentResult.data.payment.paymentNo as string;
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { paymentNo } })).status,
      'PENDING');
    const query = await call(`/customers/me/orders/${orderId}/payment`, customerToken);
    assertStatus(query, 200, '客户主动查单');
    assert.equal(query.data.state, 'PAID');
    const paid = await prisma.payment.findUniqueOrThrow({ where: { paymentNo } });
    assert.equal(paid.status, 'PAID');
    assert.match(paid.gatewayTradeNo ?? '', /^SIM-WECHAT-/);
    assert.equal(Number((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paidAmount), 88.8);
    assert.equal((await call(`/customers/me/orders/${orderId}/payment`, otherToken)).status, 404);

    assertStatus(await write('/refunds', serviceToken, 'POST', {
      orderId, paymentId: paid.id, amount: 20, reason: '客户申请部分退款',
      idempotencyKey: `pay-refund-${runId}`,
    }), 403, '客服不能创建退款');
    const refundResult = await write('/refunds', adminToken, 'POST', {
      orderId, paymentId: paid.id, amount: 20, reason: '客户申请部分退款',
      idempotencyKey: `pay-refund-${runId}`,
    });
    assertStatus(refundResult, 201, '管理员创建退款');
    const refundId = refundResult.data.id as number;
    assertStatus(await write(`/refunds/${refundId}/review`, adminToken, 'PUT', {
      action: 'APPROVED', reviewNote: '已核对原付款',
    }), 200, '审核退款');
    const startedRefund = await write(`/refunds/${refundId}/channel`, adminToken, 'PUT', {});
    assertStatus(startedRefund, 200, '发起微信模拟原路退款');
    const refundQuery = await call(`/refunds/${refundId}/channel`, adminToken);
    assertStatus(refundQuery, 200, '查询模拟退款');
    const storedRefund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    assert.equal(storedRefund.status, 'COMPLETED');
    assert.equal(Number((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).refundedAmount), 20);

    const statement = await app.get(PaymentGatewayService).getReconciliationStatement(
      'wechat', new Date().toISOString().slice(0, 10));
    assert.match(statement.downloadUrl, /^simulator:\/\/wechat\/statements\//);
    const localPayments = [{ paymentNo: paid.paymentNo, amount: paid.amount.toString() }];
    const localRefunds = [{ refundNo: storedRefund.refundNo, amount: storedRefund.amount.toString() }];
    const bill = [
      { wechatOrderNo: paid.gatewayTradeNo!, paymentNo, refundNo: '', tradeState: 'SUCCESS',
        orderAmountCents: 8880, refundAmountCents: 0, rawLine: 3 },
      { wechatOrderNo: paid.gatewayTradeNo!, paymentNo, refundNo: storedRefund.refundNo,
        tradeState: 'REFUND', orderAmountCents: 0, refundAmountCents: 2000, rawLine: 4 },
    ];
    assert.deepEqual(reconcileBill(bill, localPayments, localRefunds), []);
    assert.ok(reconcileBill(bill.slice(0, 1), localPayments, localRefunds)
      .some((issue) => issue.type === 'REFUND_MISMATCH'));
  } finally {
    await closeApi(app);
    await prisma.$disconnect();
    await simulator.close();
    assert.ok(mediaRoot.startsWith(join(tmpdir(), 'hc-payment-media-')));
    await rm(mediaRoot, { recursive: true, force: true });
  }
});
