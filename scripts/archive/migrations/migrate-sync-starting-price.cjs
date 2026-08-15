/**
 * 阶段1 数据迁移 [3/3] —— 同步 Product.price = 活跃 SKU 最低价(起价单一源)
 *
 * 幂等:重算所有商品起价,可重复执行。
 *   无活跃 SKU 的商品 → price 置 0(将被上架门禁 canPublish 拦截)。
 *   依赖 [1/3] 先跑完(无 SKU 的商品已被补建默认 SKU)。
 *
 * ⚠️ 跑前请先备份数据库。
 * 用法: node server/migrate-sync-starting-price.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const products = await p.product.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, price: true },
    });
    console.log(`[3/3] 扫描商品 ${products.length} 个,同步起价 = 活跃 SKU 最低价 ...`);

    let updated = 0, unchanged = 0;
    for (const pr of products) {
      const skus = await p.productSKU.findMany({
        where: { productId: pr.id, isActive: true },
        select: { price: true },
      });
      const prices = skus
        .map((s) => Number(s.price))
        .filter((n) => Number.isFinite(n) && n > 0);
      const startingPrice = prices.length ? Math.min(...prices) : 0;
      if (Number(pr.price) !== startingPrice) {
        await p.product.update({ where: { id: pr.id }, data: { price: startingPrice } });
        updated++;
      } else {
        unchanged++;
      }
    }
    console.log(`[3/3] 完成: 更新 ${updated} 个 / 已一致跳过 ${unchanged} 个`);
  } catch (e) {
    console.error('[3/3] 失败:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
