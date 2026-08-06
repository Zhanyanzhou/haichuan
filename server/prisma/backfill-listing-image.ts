/**
 * 数据回填脚本：为现有商品设置 primaryImageId 和 listingImageId
 * 
 * 规则：
 * 1. 优先选择 type='FRONT' 且 sortOrder 最小的图片作为 primaryImage
 * 2. 如果没有 FRONT，选择 sortOrder 最小的第一张图片
 * 3. listingImageId 默认等于 primaryImageId
 * 4. 没有图片的商品保持为空
 * 
 * 运行：npx ts-node server/prisma/backfill-listing-image.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfill() {
  console.log('开始回填 primaryImageId 和 listingImageId...');

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    include: { images: { orderBy: { sortOrder: 'asc' } } },
  });

  let updated = 0;
  let skipped = 0;

  for (const product of products) {
    if (product.images.length === 0) {
      skipped++;
      continue;
    }

    // 优先 FRONT + 最小 sortOrder，否则第一张
    const primary = product.images.find(img => img.type === 'FRONT') || product.images[0];

    await prisma.product.update({
      where: { id: product.id },
      data: {
        primaryImageId: primary.id,
        listingImageId: primary.id,
      },
    });

    updated++;
    console.log(`  [${product.code || product.id}] ${product.name?.substring(0, 30)} → primary=${primary.id} listing=${primary.id}`);
  }

  console.log(`\n完成：${updated} 个商品已更新，${skipped} 个商品无图片跳过`);
}

backfill()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
