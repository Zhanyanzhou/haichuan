import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { PRIVACY_CONSENT_CONTENT_HASH } from '../../common/privacy/privacy-consent';
import { runConsultationBrowserJourney } from './consultation-browser-runner';

const { validateTarget } = require('../../../scripts/run-real-mysql-tests.cjs');

// 只由清洗环境、迁移空库的统一 runner 启用；不读取工作区 .env，不连接日常业务库。
test('真实 HTTP + MySQL：作品咨询/选款回执、后台领取回复、本人隔离与重启回读', {
  skip: process.env.CONSULTATION_REAL_MYSQL_TEST !== '1'
    ? '需要统一一次性 MySQL runner 显式启用' : false,
}, async () => {
  assert.equal(process.versions.node.split('.')[0], '22');
  const databaseUrl = validateTarget(process.env);
  assert.equal(process.env.DATABASE_URL, databaseUrl);
  assert.equal(existsSync('.env'), false, '必须从无环境文件的隔离运行目录启动');
  assert.equal(process.env.RELEASE_PROFILE, 'lead-generation');
  for (const key of [
    'CUSTOMER_COMMERCE_ENABLED', 'CUSTOMER_QUOTATION_ORDERING_ENABLED',
    'PAYMENT_GATEWAY_TRANSACTIONS_ENABLED', 'PAYMENT_GATEWAY_REFUNDS_ENABLED',
    'NOTIFICATION_DELIVERY_ENABLED',
  ]) assert.equal(process.env[key], 'false', `${key} 必须关闭`);
  for (const key of Object.keys(process.env)) {
    assert.ok(!/^(SMTP_|SMS_|WECHAT_|ALIPAY_)/.test(key), '不得继承外部渠道配置');
  }
  const runId = process.env.CONSULTATION_RUN_ID || '';
  assert.match(runId, /^[a-z0-9]{6,12}$/);
  const { PrismaClient } = await import('@prisma/client');
  const bcrypt = await import('bcrypt');
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let app: INestApplication | undefined;
  let baseUrl = '';
  const stage = (value: string) => console.log(`REAL_MYSQL_STAGE consultation-journey ${value}`);
  const stop = async () => {
    if (!app) return;
    const current = app;
    app = undefined;
    const server = current.getHttpServer() as Server;
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await current.close();
  };
  const start = async () => {
    const { AppModule } = await import('../../app.module');
    app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
  };
  const call = async (path: string, token?: string, body?: unknown, key?: string) => {
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (key) headers.set('Idempotency-Key', key);
    const response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const envelope = await response.json();
    return { status: response.status, headers: response.headers, data: envelope.data ?? envelope };
  };
  const password = 'Consultation9!';
  const login = async (kind: 'staff' | 'customer', identifier: string) => {
    const result = await call(kind === 'staff' ? '/auth/login' : '/customers/login', undefined,
      kind === 'staff' ? { username: identifier, password } : { phone: identifier, password });
    assert.equal(result.status, 201, `${kind} 真实登录`);
    assert.equal(typeof result.data.accessToken, 'string');
    return result.data.accessToken as string;
  };
  try {
    await prisma.$connect();
    assert.deepEqual(await Promise.all([
      prisma.user.count(), prisma.customer.count(), prisma.product.count(),
      prisma.inquiry.count(), prisma.selectionInquiry.count(), prisma.lead.count(),
    ]), [0, 0, 0, 0, 0, 0], '只允许空的一次性业务库');
    stage('empty-database-confirmed');
    const passwordHash = await bcrypt.hash(password, 4);
    const advisor = await prisma.user.create({ data: {
      username: `journey-advisor-${runId}`, password: passwordHash, role: 'CUSTOMER_SERVICE',
    } });
    const warehouse = await prisma.user.create({ data: {
      username: `journey-warehouse-${runId}`, password: passwordHash, role: 'WAREHOUSE',
    } });
    const mediaReviewer = await prisma.user.create({ data: {
      username: `journey-media-reviewer-${runId}`, password: passwordHash, role: 'ADMIN',
    } });
    const customer = await prisma.customer.create({ data: {
      phone: '13900000001', name: '隔离咨询客户甲', passwordHash,
    } });
    const other = await prisma.customer.create({ data: {
      phone: '13900000002', name: '隔离咨询客户乙', passwordHash,
    } });
    const category = await prisma.category.create({ data: {
      name: '隔离咨询作品', slug: `journey-${runId}`,
    } });
    const sharp = (await import('sharp')).default;
    const mediaBytes = await sharp({ create: {
      width: 64, height: 64, channels: 3, background: '#e8e4df',
    } }).png().toBuffer();
    const storageKey = `product-assets/journey-${runId}/synthetic.png`;
    const mediaPath = resolve(process.cwd(), 'private-media/products', storageKey);
    await mkdir(dirname(mediaPath), { recursive: true });
    await writeFile(mediaPath, mediaBytes, { flag: 'wx' });
    // 这是合成发布状态夹具，不构成真实作品事实、素材权利或发布流程验收。
    const asset = await prisma.mediaAsset.create({ data: {
      storageKey, originalName: 'synthetic.png',
      mimeType: 'image/png', byteSize: mediaBytes.length,
      checksumSha256: createHash('sha256').update(mediaBytes).digest('hex'),
      accessLevel: 'PUBLIC', status: 'READY', uploadedBy: advisor.id,
      authorization: { create: {
        sourceType: 'BRAND_OWNED', authorizationBasis: '仅合成测试，不作商用权利证明',
        evidenceReference: `local://isolated/${runId}`, publicWebUseAllowed: true,
        reviewStatus: 'APPROVED', preparedById: advisor.id,
        submittedById: advisor.id, submittedAt: new Date(),
        reviewedById: mediaReviewer.id,
        reviewedAt: new Date(),
      } },
    } });
    const product = await prisma.product.create({ data: {
      code: `JOURNEY-${runId}`, name: '隔离测试作品', categoryId: category.id,
      status: 'PUBLISHED', publicationQualityStatus: 'READY', visibility: 'PUBLIC',
      salesMode: 'DISPLAY_ONLY', publishedAt: new Date(),
    } });
    const image = await prisma.productImage.create({ data: {
      productId: product.id, mediaAssetId: asset.id, storageKey: asset.storageKey,
      url: '/isolated/synthetic.png', mimeType: 'image/png', type: 'FRONT',
    } });
    await prisma.product.update({ where: { id: product.id }, data: {
      primaryImageId: image.id, listingImageId: image.id,
    } });
    const selectionProduct = await prisma.product.create({ data: {
      code: `JOURNEY-SEL-${runId}`, name: '隔离选款作品', categoryId: category.id,
      status: 'PUBLISHED', publicationQualityStatus: 'READY', visibility: 'PUBLIC',
      salesMode: 'SELECTION', publishedAt: new Date(),
    } });
    const selectionImage = await prisma.productImage.create({ data: {
      productId: selectionProduct.id, mediaAssetId: asset.id, storageKey: asset.storageKey,
      url: '/isolated/synthetic.png', mimeType: 'image/png', type: 'FRONT',
    } });
    await prisma.product.update({ where: { id: selectionProduct.id }, data: {
      primaryImageId: selectionImage.id, listingImageId: selectionImage.id,
    } });
    await start();
    const customerToken = await login('customer', customer.phone);
    const otherToken = await login('customer', other.phone);
    const advisorToken = await login('staff', advisor.username);
    const warehouseToken = await login('staff', warehouse.username);
    const visible = await call(`/products/public/${product.code}`);
    assert.equal(visible.status, 200, '通过实际公开作品查询验证咨询引用');
    assert.equal(visible.data.id, product.id);
    stage('real-sessions-and-product-ready');

    // 先建立选款 Lead，再提交普通咨询，刻意让普通 inquiry id 与 leadId 不相等。
    const selection = await call('/selection-inquiries', customerToken, {
      customerName: customer.name, phone: customer.phone, privacyConsent: true,
      privacyConsentVersion: 'privacy-v2',
      privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
      message: '合成选款需求', items: [{ productId: selectionProduct.id }],
    }, `selection-journey-${runId}`);
    assert.equal(selection.status, 201);
    const submission = {
      customerName: customer.name, customerPhone: customer.phone, privacyConsent: true,
      privacyConsentVersion: 'privacy-v2',
      privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
      message: '合成作品咨询需求', productId: product.id, consultationType: '预约鉴赏',
    };
    const key = `inquiry-journey-${runId}`;
    const results = await Promise.all([
      call('/inquiries', customerToken, submission, key),
      call('/inquiries', customerToken, submission, key),
    ]);
    assert.deepEqual(results.map((result) => result.status), [201, 201]);
    assert.deepEqual(results[0].data, results[1].data, '并发同键返回相同回执');
    const receipt = results[0].data;
    assert.equal(receipt.id, receipt.sourceId);
    assert.notEqual(receipt.sourceId, receipt.leadId, '不能偶然同号掩盖 sourceId/leadId 混用');
    assert.equal(await prisma.inquiry.count(), 1);
    assert.equal(await prisma.lead.count(), 2);
    assert.equal((await call('/inquiries', customerToken, { ...submission, message: '异内容' }, key)).status, 409);
    stage('canonical-receipts-persisted');

    for (const [type, result] of [['selection', selection.data], ['inquiry', receipt]] as const) {
      const leadId = result.leadId;
      assert.ok(Number.isSafeInteger(leadId) && leadId > 0);
      const path = `/customers/me/consultations/${leadId}`;
      assert.equal((await call(path)).status, 401);
      const forbidden = await call(path, otherToken);
      assert.equal(forbidden.status, 404);
      assert.match(forbidden.headers.get('cache-control') || '', /private.*no-store/);
      const initial = await call(path, customerToken);
      assert.equal(initial.status, 200);
      assert.equal(initial.data.handlingState, 'WAITING_ASSIGNMENT');
      assert.equal(initial.data.type, type);
      assert.equal((await call(`/leads/${type}/${leadId}/claim`, warehouseToken, {})).status, 403);
      assert.equal((await call(`/leads/${type}/${leadId}/claim`, advisorToken, {})).status, 201);
      assert.equal((await call(path, customerToken)).data.handlingState, 'ADVISOR_ASSIGNED');
      const followUp = { content: '仅内部的合成跟进标记', contactMethod: 'phone' };
      const followUpKey = `follow-up-${type}-${runId}`;
      assert.equal((await call(`/leads/${type}/${leadId}/follow-up`, advisorToken, followUp, followUpKey)).status, 201);
      assert.equal((await call(`/leads/${type}/${leadId}/follow-up`, advisorToken, followUp, followUpKey)).status, 201);
      const detail = await call(`/leads/${type}/${leadId}`, advisorToken);
      assert.equal(detail.status, 200);
      const replyBody = { reply: `合成顾问回复-${type}`, expectedUpdatedAt: detail.data.updatedAt };
      const replyKey = `reply-${type}-${runId}`;
      const reply = await call(`/leads/${type}/${leadId}/reply`, advisorToken, replyBody, replyKey);
      assert.equal(reply.status, 201);
      const retry = await call(`/leads/${type}/${leadId}/reply`, advisorToken, replyBody, replyKey);
      assert.equal(retry.status, 201);
      assert.deepEqual(retry.data, reply.data);
      assert.equal(await prisma.leadActivity.count({ where: { leadId, type: 'FOLLOW_UP' } }), 1);
      assert.equal(await prisma.leadActivity.count({ where: { leadId, type: 'REPLY' } }), 1);
      const readback = await call(path, customerToken);
      assert.equal(readback.status, 200);
      assert.equal(readback.data.reply.content, replyBody.reply);
      assert.equal(readback.data.nextAction, 'REVIEW_ADVISOR_REPLY');
      for (const privateKey of ['assignedTo', 'internalNote', 'phone', 'email', 'followUps']) {
        assert.equal(Object.prototype.hasOwnProperty.call(readback.data, privateKey), false);
      }
      assert.ok(!JSON.stringify(readback.data).includes(followUp.content));
    }
    stage('advisor-reply-and-owner-readback');
    // 作品下架后同键恢复仍返回原回执；不同新请求必须重新经过作品核验。
    await prisma.product.update({ where: { id: product.id }, data: { status: 'DRAFT' } });
    const recovered = await call('/inquiries', customerToken, submission, key);
    assert.equal(recovered.status, 201);
    assert.deepEqual(recovered.data, receipt);
    assert.equal((await call('/inquiries', customerToken, submission, `new-${key}`)).status, 400);
    await stop();
    await start();
    const newToken = await login('customer', customer.phone);
    const persisted = await call(`/customers/me/consultations/${receipt.leadId}`, newToken);
    assert.equal(persisted.status, 200);
    assert.equal(persisted.data.reply.content, '合成顾问回复-inquiry');
    assert.equal(persisted.data.sourceId, receipt.sourceId);
    const list = await call('/customers/me/inquiries', newToken);
    assert.equal(list.status, 200);
    assert.equal(list.data.list[0].leadId, receipt.leadId);
    assert.equal(list.data.list[0].reply.content, persisted.data.reply.content);
    const persistedSelection = await call(
      `/customers/me/consultations/${selection.data.leadId}`,
      newToken,
    );
    assert.equal(persistedSelection.status, 200);
    assert.equal(persistedSelection.data.type, 'selection');
    assert.equal(persistedSelection.data.reply.content, '合成顾问回复-selection');
    assert.equal(persistedSelection.data.sourceId, selection.data.sourceId);
    const selectionList = await call('/customers/me/selection-inquiries', newToken);
    assert.equal(selectionList.status, 200);
    assert.equal(
      selectionList.data.some((item: { leadId?: number }) => item.leadId === selection.data.leadId),
      true,
    );
    assert.equal(await prisma.inquiry.count(), 1);
    stage('restart-readback-pass');
    // 恢复的只是本次合成夹具，浏览器仍通过真实产品门禁和受控图片接口。
    await prisma.product.update({ where: { id: product.id }, data: { status: 'PUBLISHED' } });
    await runConsultationBrowserJourney({
      apiOrigin: new URL(baseUrl).origin, productCode: product.code,
      selectionProductCode: selectionProduct.code,
      customerPhone: customer.phone, password, staffUsername: advisor.username,
    });
    stage('browser-journey-pass');
  } finally {
    await stop();
    await prisma.$disconnect();
    // 不清理任何业务库；统一 runner 只在已验证一次性目标中重置或销毁其拥有的容器。
  }
});
