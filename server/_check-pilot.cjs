const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const cat = await p.category.findUnique({ where: { slug: 'pilot-import' }, select: { id: true, name: true } });
    console.log('pilot-import 分类:', JSON.stringify(cat));
    console.log('全库有效商品数(deletedAt=null):', await p.product.count({ where: { deletedAt: null } }));
    console.log('全库 productImage 数:', await p.productImage.count());
    if (cat) {
      const products = await p.product.findMany({
        where: { categoryId: cat.id, deletedAt: null },
        select: { id: true, code: true, name: true, status: true, salesMode: true },
        orderBy: { createdAt: 'desc' },
      });
      console.log('\npilot 分类下商品数:', products.length);
      for (const pr of products) {
        console.log('  - [' + pr.id + '] code=' + pr.code + ' status=' + pr.status + ' salesMode=' + pr.salesMode + ' name=' + (pr.name || '').slice(0, 30));
      }
    }
  } catch (e) {
    console.error('查询失败:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
