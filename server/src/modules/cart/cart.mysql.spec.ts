import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ProductsService } from '../products/products.service';
import { CartService } from './cart.service';

const testDatabaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL?.trim();

function assertIsolatedMysqlUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    !['mysql:', 'mysqls:'].includes(parsed.protocol) ||
    !databaseName ||
    !/(^|[_-])(test|tests|e2e|isolated|ci)([_-]|$)/i.test(databaseName)
  ) {
    throw new Error(
      'REAL_MYSQL_TEST_DATABASE_URL 必须指向名称含 test/e2e/isolated/ci 的专用 MySQL 数据库',
    );
  }
}

test(
  '真实 MySQL：合作资格暂停与添加购物车按客户锁串行并使用最新资格',
  { skip: !testDatabaseUrl ? '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' : false },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const control = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const phone = `15${String(Date.now()).slice(-9)}`;
    let customerId: number | null = null;
    let visibility: unknown;
    let cartWrites = 0;

    try {
      const customer = await prisma.customer.create({
        data: {
          phone,
          name: `购物车资格竞态-${suffix}`,
          accountType: 'PARTNER',
          partnerStatus: 'APPROVED',
        },
      });
      customerId = customer.id;
      const principal = {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        authVersion: customer.authVersion,
        accountType: customer.accountType,
        partnerStatus: customer.partnerStatus,
      };
      const facade = {
        $transaction: (callback: (tx: any) => Promise<unknown>, options: unknown) =>
          prisma.$transaction(async (tx) => callback({
            $queryRaw: tx.$queryRaw.bind(tx),
            productSKU: {
              findFirst: async ({ where }: any) => {
                visibility = where.product.visibility;
                return null;
              },
            },
            cart: {
              findFirst: async () => null,
              create: async () => {
                cartWrites += 1;
              },
              updateMany: async () => {
                cartWrites += 1;
                return { count: 1 };
              },
            },
          }), options as never),
      } as unknown as PrismaService;
      const service = new CartService(facade, {} as ProductsService);

      let settled = false;
      let pending: Promise<unknown> | undefined;
      await control.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id} FOR UPDATE`;
        pending = service.addItem({
          customer: principal,
          productId: 900001,
          skuId: 900001,
          quantity: 1,
        }).then(
          (value) => {
            settled = true;
            return value;
          },
          (error: unknown) => {
            settled = true;
            throw error;
          },
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(settled, false, '合作资格行锁释放前添加购物车必须保持等待');
        await tx.customer.update({
          where: { id: customer.id },
          data: { partnerStatus: 'SUSPENDED' },
        });
      });

      await assert.rejects(
        pending as Promise<unknown>,
        (error: unknown) => error instanceof BadRequestException,
      );
      assert.deepEqual(visibility, { in: ['PUBLIC', 'MEMBER'] });
      assert.equal(cartWrites, 0);
      assert.equal(
        (await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).partnerStatus,
        'SUSPENDED',
      );
    } finally {
      if (customerId) {
        await prisma.cart.deleteMany({ where: { userId: customerId } });
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
      await Promise.all([prisma.$disconnect(), control.$disconnect()]);
    }
  },
);
