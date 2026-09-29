import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';

const { validateTarget } = require('../../../scripts/run-real-mysql-tests.cjs');
const databaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL;

test(
  '真实 MySQL：同一 UPLOADED 凭证并发绑定两个订单时只有一个 CAS 成功',
  { skip: databaseUrl ? false : '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env), '付款凭证测试必须使用显式隔离库');
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    await prisma.$connect();
    const customer = await prisma.customer.create({
      data: { phone: `17${String(Date.now()).slice(-9)}`, name: `凭证隔离客户-${suffix}` },
    });
    const orderData = (sequence: number) => ({
      orderNo: `PFA${suffix}${sequence}`.slice(0, 30),
      customerId: customer.id,
      customerName: customer.name || '隔离客户',
      customerPhone: customer.phone,
      address: '付款凭证隔离测试地址',
      totalAmount: 10,
      finalAmount: 10,
      shippingAddressSnapshot: { version: 1, recipientName: '隔离客户', recipientPhone: customer.phone, detail: '测试地址' },
      pricingSnapshot: { version: 1, currency: 'CNY', itemSubtotalCents: 1000, discountCents: 0, shippingCents: 0, insuranceCents: 0, taxCents: 0, adjustmentCents: 0, finalCents: 1000 },
    });
    const orders = await Promise.all([
      prisma.order.create({ data: orderData(1) }),
      prisma.order.create({ data: orderData(2) }),
    ]);
    const proofMetadata = (submissionOrderId: number) => ({
      submissionOrderId,
      submissionKeyHash: createHash('sha256').update(randomUUID()).digest('hex'),
      fileChecksumSha256: createHash('sha256').update(randomUUID()).digest('hex'),
      fileSize: 1024,
      mimeType: 'image/png',
      fileReadyAt: new Date(),
    });
    const asset = await prisma.paymentProofAsset.create({
      data: {
        customerId: customer.id,
        storageKey: `${customer.id}/2026/09/20/${randomUUID()}.png`,
        ...proofMetadata(orders[0].id),
      },
    });

    try {
      const results = await Promise.all(orders.map((order) => prisma.$transaction((tx) =>
        tx.paymentProofAsset.updateMany({
          where: { id: asset.id, status: 'UPLOADED', orderId: null },
          data: { status: 'ATTACHED', orderId: order.id, attachedAt: new Date() },
        }))));
      assert.equal(results.reduce((sum, result) => sum + result.count, 0), 1);
      const attached = await prisma.paymentProofAsset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(attached.status, 'ATTACHED');
      assert.ok(orders.some((order) => order.id === attached.orderId));
      assert.equal((await prisma.paymentProofAsset.updateMany({
        where: { id: asset.id, status: 'UPLOADED', orderId: null },
        data: { status: 'ATTACHED', orderId: orders.find((order) => order.id !== attached.orderId)!.id, attachedAt: new Date() },
      })).count, 0);

      const sameOrderAssets = await Promise.all([1, 2].map(() => prisma.paymentProofAsset.create({
        data: {
          customerId: customer.id,
          storageKey: `${customer.id}/2026/09/20/${randomUUID()}.png`,
          ...proofMetadata(orders[0].id),
        },
      })));
      const sameOrderClaims = await Promise.all(sameOrderAssets.map((candidate) =>
        prisma.paymentProofAsset.updateMany({
          where: { id: candidate.id, status: 'UPLOADED', orderId: null },
          data: { status: 'ATTACHED', orderId: orders[0].id, attachedAt: new Date() },
        })));
      assert.deepEqual(sameOrderClaims.map((claim) => claim.count), [1, 1]);
    } finally {
      await prisma.paymentProofAsset.deleteMany({ where: { customerId: customer.id } });
      await prisma.order.deleteMany({ where: { id: { in: orders.map((order) => order.id) } } });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.$disconnect();
    }
  },
);
