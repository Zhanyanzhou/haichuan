import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from './products.service';

const testDatabaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL?.trim();

function assertIsolatedMysqlUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    !['mysql:', 'mysqls:'].includes(parsed.protocol)
    || !databaseName
    || !/(^|[_-])(test|tests|e2e|isolated|ci)([_-]|$)/i.test(databaseName)
  ) {
    throw new Error(
      'REAL_MYSQL_TEST_DATABASE_URL 必须指向名称含 test/e2e/isolated/ci 的专用 MySQL 数据库',
    );
  }
}

async function assertPendingWhileLocked(operation: Promise<unknown>, message: string) {
  const state = await Promise.race([
    operation.then(
      () => 'settled' as const,
      () => 'settled' as const,
    ),
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 150)),
  ]);
  assert.equal(state, 'pending', message);
}

test(
  '真实 MySQL：商品私有读写等待员工与会话锁并使用提交后的当前授权',
  {
    skip: !testDatabaseUrl
      ? '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL'
      : false,
  },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    let userId: number | null = null;
    let refreshSessionId: number | null = null;

    try {
      const user = await prisma.user.create({
        data: {
          username: `product_auth_${suffix}`,
          password: 'isolated-test-only',
          realName: '商品授权隔离测试员工',
          role: 'EDITOR',
          status: 'ACTIVE',
        },
      });
      userId = user.id;
      const sessionFamilyId = randomUUID();
      const refreshSession = await prisma.adminRefreshSession.create({
        data: {
          userId: user.id,
          tokenHash: `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`,
          familyId: sessionFamilyId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      refreshSessionId = refreshSession.id;
      const actor = { id: user.id, role: 'EDITOR' as const, sessionFamilyId };
      const service = new ProductsService(
        prisma as never,
        {
          isProductMediaReadable: () => true,
          invalidate: () => undefined,
        } as never,
        {} as never,
      );

      let staleRead: ReturnType<typeof service.getCounts> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        staleRead = service.getCounts(actor);
        await assertPendingWhileLocked(
          staleRead,
          '商品私有读取必须等待员工行锁，不能越过并发降权',
        );
        await transaction.user.update({
          where: { id: user.id },
          data: { role: 'CUSTOMER_SERVICE' },
        });
      });
      assert.ok(staleRead);
      await assert.rejects(staleRead, ForbiddenException);

      await prisma.user.update({ where: { id: user.id }, data: { role: 'EDITOR' } });
      let staleWrite: ReturnType<typeof service.addImage> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE id = ${refreshSession.id} FOR UPDATE`,
        );
        staleWrite = service.addImage(999_991, {
          mediaAssetId: 999_992,
          storageKey: 'product-assets/session-revoked.jpg',
        }, actor);
        await assertPendingWhileLocked(
          staleWrite,
          '商品写入必须等待会话族行锁，不能越过并发登出',
        );
        await transaction.adminRefreshSession.update({
          where: { id: refreshSession.id },
          data: { revokedAt: new Date() },
        });
      });
      assert.ok(staleWrite);
      await assert.rejects(staleWrite, ForbiddenException);
      assert.equal(
        await prisma.productImage.count({ where: { productId: 999_991 } }),
        0,
      );
    } finally {
      if (refreshSessionId !== null) {
        await prisma.adminRefreshSession.deleteMany({ where: { id: refreshSessionId } });
      }
      if (userId !== null) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  },
);

test(
  '真实 MySQL：回收站永久移除有库存、发布与页面关联的商品，保留历史并允许释放预占',
  { skip: !testDatabaseUrl ? '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' : false },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const key = `trash_test_${randomUUID().slice(0, 12)}`;
    let userId: number | undefined;
    let categoryId: number | undefined;
    let warehouseId: number | undefined;
    try {
      const user = await prisma.user.create({ data: {
        username: key, password: 'isolated-test-only', realName: '商品回收站测试', role: 'ADMIN',
      } });
      userId = user.id;
      const category = await prisma.category.create({ data: { name: key, slug: key } });
      categoryId = category.id;
      const warehouse = await prisma.warehouse.create({ data: { name: key, type: 'STORE' } });
      warehouseId = warehouse.id;
      const product = await prisma.product.create({ data: {
        name: key, code: key, categoryId, status: 'ARCHIVED',
        skus: { create: { skuCode: key, price: 0 } },
      }, include: { skus: true } });
      const id = product.id;
      const skuId = product.skus[0].id;
      const actor = { id: user.id, role: 'SUPER_ADMIN' as const };
      const service = new ProductsService(prisma as never, { invalidate: () => undefined } as never, {} as never);
      const withCode = (code: string) => (error: unknown) =>
        error instanceof ConflictException && (error.getResponse() as { code: string }).code === code;

      await assert.rejects(() => service.deletePermanently(id, actor), ForbiddenException);
      await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN' } });
      await service.restore(id, actor);
      await assert.rejects(() => service.deletePermanently(id, actor), withCode('PRODUCT_PERMANENT_DELETE_NOT_ARCHIVED'));
      await service.archive(id, actor);
      const legacy = await prisma.product.create({ data: {
        name: key, code: `${key}_legacy`, categoryId, status: 'PUBLISHED',
      } });
      await service.archive(legacy.id, actor);
      assert.deepEqual(await service.deletePermanently(legacy.id, actor), { id: legacy.id });
      assert.ok((await prisma.product.findUniqueOrThrow({ where: { id: legacy.id } })).deletedAt);

      let deleting: ReturnType<typeof service.deletePermanently> | undefined;
      await prisma.$transaction(async (tx) => {
        const stock = await tx.inventory.create({ data: { skuId, warehouseId: warehouse.id, quantity: 1 } });
        await tx.order.create({ data: {
          orderNo: key, customerName: '测试', customerPhone: 'test', address: '测试',
          totalAmount: 100, finalAmount: 100, shippingAddressSnapshot: {}, pricingSnapshot: {},
          items: { create: { skuId, productId: id, unitPrice: 100, subtotal: 100, productNameSnapshot: key } },
          reservations: { create: {
            skuId, inventoryId: stock.id, quantity: 1, expiresAt: new Date(Date.now() + 60_000),
          } },
        } });
        deleting = service.deletePermanently(id, actor);
        await assertPendingWhileLocked(deleting, '永久移除必须等待库存和订单关联提交');
      });
      assert.ok(deleting);
      assert.deepEqual(await deleting, { id });
      assert.ok((await prisma.product.findUniqueOrThrow({ where: { id } })).deletedAt);
      assert.equal((await service.getCounts(actor)).ARCHIVED, await prisma.product.count({ where: { status: 'ARCHIVED', deletedAt: null } }));
      assert.equal(await service.findById(id, actor), null);
      await assert.rejects(() => service.restore(id, actor), NotFoundException);
      assert.equal((await service.checkImportCodeConflicts([key], actor))[0]?.removed, true);
      const audit = { userId: user.id, targetId: id, action: 'product.delete.permanent' };
      assert.equal(await prisma.operationLog.count({ where: audit }), 1);
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNo: key }, include: { items: true } });
      assert.equal(order.items[0].productNameSnapshot, key);
      const orders = new OrdersService(prisma as never, {} as never, {} as never, {} as never);
      const released = await prisma.$transaction((tx) => orders['releaseStockReservations'](tx, order.id, new Date()));
      assert.equal(released, 1);
      const inventory = await prisma.inventory.findFirstOrThrow({ where: { skuId } });
      assert.equal(inventory.quantity, 2);
      const inventoryService = new InventoryService(prisma as never, service);
      const adjusted = await inventoryService.updateStock(inventory.id, { type: 'out', quantity: 1, expectedQuantity: 2 }, actor);
      assert.equal(adjusted.quantity, 1);

      const importedCode = `${key}_imported`;
      const imported = await service.create({ name: key, code: importedCode, categoryId, requireNewCode: true }, actor);
      const initialized = await prisma.inventory.findFirstOrThrow({ where: { sku: { productId: imported.id } } });
      const initialization = { module: 'inventory', action: 'inventory.initialize', targetId: initialized.id };
      assert.equal(await prisma.operationLog.count({ where: initialization }), 1);
      await service.archive(imported.id, actor);

      const historical = await prisma.product.create({ data: {
        name: key, code: `${key}_historical`, categoryId, status: 'ARCHIVED',
      } });
      const historicalSku = await prisma.productSKU.create({ data: {
        productId: historical.id, skuCode: `${key}_historical`, price: 0,
      } });
      const historicalInventory = await prisma.inventory.create({ data: {
        skuId: historicalSku.id, warehouseId: warehouse.id, quantity: 0,
        updatedAt: new Date(historicalSku.createdAt.getTime() + 4),
      } });
      assert.deepEqual(await service.deletePermanently(historical.id, actor), { id: historical.id });
      assert.equal(await prisma.inventory.count({ where: { id: historicalInventory.id } }), 0);

      const page = await prisma.pageDocument.create({ data: {
        pageKey: key, puckData: { content: [{ props: { contentBySlotId: { featured: [` ${importedCode} `] } } }] },
      } });
      assert.deepEqual(await service.deletePermanently(imported.id, actor), { id: imported.id });
      assert.ok((await prisma.product.findUniqueOrThrow({ where: { id: imported.id } })).deletedAt);
      assert.deepEqual((await prisma.pageDocument.findUniqueOrThrow({ where: { id: page.id } })).puckData, page.puckData);
      await assert.rejects(() => service.deletePermanently(imported.id, actor), NotFoundException);
      assert.equal(await prisma.operationLog.count({ where: { ...audit, targetId: imported.id } }), 1);
    } finally {
      await prisma.pageDocument.deleteMany({ where: { pageKey: key } });
      await prisma.order.deleteMany({ where: { orderNo: key } });
      await prisma.product.deleteMany({ where: { code: { in: [key, `${key}_legacy`, `${key}_imported`, `${key}_historical`] } } });
      if (warehouseId !== undefined) await prisma.warehouse.delete({ where: { id: warehouseId } });
      if (categoryId !== undefined) await prisma.category.delete({ where: { id: categoryId } });
      if (userId !== undefined) {
        await prisma.operationLog.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
      }
      await prisma.$disconnect();
    }
  },
);
