import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { ReviewMediaService } from './review-media.service';
import { projectCustomerReviewImages } from './review-media-reference';

const sharp = require('sharp');

async function imageFile(color: { r: number; g: number; b: number }): Promise<Express.Multer.File> {
  const buffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: color },
  }).png().toBuffer();
  return {
    fieldname: 'file',
    originalname: 'review.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

async function withService(
  run: (service: ReviewMediaService, prisma: Record<string, unknown>, root: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'review-media-'));
  const previousRoot = process.env.REVIEW_MEDIA_ROOT;
  process.env.REVIEW_MEDIA_ROOT = root;
  const prisma = {
    $queryRaw: async () => [{ id: 18 }],
    customer: {
      findUnique: async () => ({ status: 'ACTIVE', authVersion: 3 }),
    },
    productReview: {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
    },
  };
  Object.assign(prisma, {
    $transaction: async (action: (transaction: typeof prisma) => Promise<unknown>) => action(prisma),
  });
  const service = new ReviewMediaService(prisma as never, new IdempotencyService());
  try {
    await run(service, prisma as never, root);
  } finally {
    if (previousRoot === undefined) delete process.env.REVIEW_MEDIA_ROOT;
    else process.env.REVIEW_MEDIA_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
}

test('晒单图写入私有目录且同键同内容可安全重放', async () => {
  await withService(async (service) => {
    const principal = { id: 18, authVersion: 3 };
    const file = await imageFile({ r: 20, g: 40, b: 60 });
    const first = await service.upload(principal, file, 'review-image:test-0001');
    const replay = await service.upload(principal, file, 'review-image:test-0001');

    assert.equal(first.reference, replay.reference);
    assert.match(first.reference, /^review-image:v1:18:[a-f0-9]{64}$/);
    assert.deepEqual(
      await service.uploadStatus(principal, 'review-image:test-0001'),
      { status: 'AVAILABLE', reference: first.reference },
    );
    await service.assertOwnedReferences(18, [first.reference]);
    await assert.rejects(service.assertOwnedReferences(19, [first.reference]), /晒单图凭据无效/);
  });
});

test('同一幂等键不能被另一张晒单图复用', async () => {
  await withService(async (service) => {
    const principal = { id: 18, authVersion: 3 };
    await service.upload(principal, await imageFile({ r: 20, g: 40, b: 60 }), 'review-image:test-0002');
    await assert.rejects(
      service.upload(principal, await imageFile({ r: 200, g: 40, b: 60 }), 'review-image:test-0002'),
      /该上传凭据已用于另一张晒单图/,
    );
  });
});

test('只有审核通过评价的私有晒单图可以走公开读取端点', async () => {
  await withService(async (service, prisma) => {
    const principal = { id: 18, authVersion: 3 };
    const uploaded = await service.upload(
      principal,
      await imageFile({ r: 20, g: 40, b: 60 }),
      'review-image:test-0003',
    );
    const reviewStore = prisma.productReview as {
      findFirst: () => Promise<{ images: string[] } | null>;
      findUnique: () => Promise<{ images: string[] } | null>;
    };
    reviewStore.findFirst = async () => ({ images: [uploaded.reference] });
    reviewStore.findUnique = async () => ({ images: [uploaded.reference] });

    assert.ok((await service.readPublic(91, 0)).length > 0);
    assert.ok((await service.readForStaff({ id: 18 }, 91, 0)).length > 0);
    reviewStore.findFirst = async () => null;
    await assert.rejects(service.readPublic(91, 0), /评价图片不存在/);
    assert.ok((await service.readForStaff({ id: 18 }, 91, 0)).length > 0);
  });
});

test('客户只能读取本人评价图片且导出投影不泄漏私有凭据', async () => {
  await withService(async (service, prisma) => {
    const principal = { id: 18, authVersion: 3 };
    const uploaded = await service.upload(
      principal,
      await imageFile({ r: 42, g: 84, b: 126 }),
      'review-image:customer-export',
    );
    const reviewStore = prisma.productReview as {
      findFirst: (args: { where: { id: number; customerId?: number } }) => Promise<{ images: string[] } | null>;
    };
    reviewStore.findFirst = async ({ where }) => (
      where.id === 91 && where.customerId === 18
        ? { images: [uploaded.reference] }
        : null
    );

    assert.ok((await service.readForCustomer(principal, 91, 0)).length > 0);
    await assert.rejects(
      service.readForCustomer({ id: 19, authVersion: 3 }, 91, 0),
      /评价图片不存在/,
    );
    assert.deepEqual(
      projectCustomerReviewImages(91, 18, [
        uploaded.reference,
        '/uploads/legacy/review.jpg',
        `review-image:v1:19:${'b'.repeat(64)}`,
        'https://tracker.example/pixel.png',
      ]),
      ['/reviews/me/91/media/0', '/uploads/legacy/review.jpg'],
    );
  });
});

test('本人晒单图读取在认证版本失效后不查询评价', async () => {
  await withService(async (service, prisma) => {
    let reviewRead = false;
    Object.assign(prisma, {
      $queryRaw: async () => [],
      productReview: {
        findFirst: async () => {
          reviewRead = true;
          return null;
        },
      },
    });

    await assert.rejects(
      service.readForCustomer({ id: 18, authVersion: 2 }, 91, 0),
      /重新登录/,
    );
    assert.equal(reviewRead, false);
  });
});

test('评价列表只投影受控私有地址和安全的历史同源地址', () => {
  const service = new ReviewMediaService({} as never, new IdempotencyService());
  const reference = `review-image:v1:18:${'a'.repeat(64)}`;
  const images = [reference, '/uploads/legacy/review.jpg', 'https://tracker.example/pixel.png', '../secret'];

  assert.deepEqual(service.projectPublic(91, images), [
    '/reviews/media/public/91/0',
    '/uploads/legacy/review.jpg',
  ]);
  assert.deepEqual(service.projectStaff(91, images), [
    '/reviews/91/media/0',
    '/uploads/legacy/review.jpg',
  ]);
});

test('启动清理在客户行锁内删除旧孤儿并保留评价已引用图片', async () => {
  await withService(async (service, prisma, root) => {
    const principal = { id: 18, authVersion: 3 };
    const orphan = await service.upload(
      principal,
      await imageFile({ r: 30, g: 60, b: 90 }),
      'review-image:cleanup-orphan',
    );
    const referenced = await service.upload(
      principal,
      await imageFile({ r: 90, g: 60, b: 30 }),
      'review-image:cleanup-kept',
    );
    const fileName = (reference: string) => `${reference.split(':').at(-1)}.webp`;
    const orphanPath = join(root, '18', fileName(orphan.reference));
    const referencedPath = join(root, '18', fileName(referenced.reference));
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(orphanPath, old, old);
    await utimes(referencedPath, old, old);

    const events: string[] = [];
    const testPrisma = prisma as {
      $queryRaw: () => Promise<Array<{ id: number }>>;
      productReview: { findMany: () => Promise<Array<{ images: string[] }>> };
    };
    testPrisma.$queryRaw = async () => {
      events.push('lock');
      return [{ id: 18 }];
    };
    testPrisma.productReview.findMany = async () => {
      events.push('read-references');
      return [{ images: [referenced.reference] }];
    };

    await service.onModuleInit();

    assert.deepEqual(events, ['lock', 'read-references']);
    await assert.rejects(stat(orphanPath), /ENOENT/);
    assert.equal((await stat(referencedPath)).isFile(), true);
  });
});
