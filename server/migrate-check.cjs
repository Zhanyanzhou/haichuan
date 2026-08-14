/**
 * 阶段1 迁移前只读体检 —— 不写任何数据,统计"将受影响"的商品/SKU 数量。
 * 用法: node server/migrate-check.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const products = await p.product.findMany({
      where: { deletedAt: null },
      select: { id: true, price: true },
    });
    let noActiveSku = 0, priceMismatch = 0;
    for (const pr of products) {
      const activeSkus = await p.productSKU.findMany({
        where: { productId: pr.id, isActive: true },
        select: { price: true },
      });
      if (activeSkus.length === 0) noActiveSku++;
      const prices = activeSkus
        .map((s) => Number(s.price))
        .filter((n) => Number.isFinite(n) && n > 0);
      const starting = prices.length ? Math.min(...prices) : 0;
      if (Number(pr.price) !== starting) priceMismatch++;
    }
    const skuWithStock = await p.productSKU.count({ where: { stock: { gt: 0 } } });
    const warehouseCount = await p.warehouse.count();
    const inventoryCount = await p.inventory.count();

    console.log('=== 阶段1 迁移前体检(只读,不改数据) ===');
    console.log(`有效商品数 (deletedAt=null): ${products.length}`);
    console.log(`[1/3] 无活跃 SKU 的商品 (将补建默认 SKU): ${noActiveSku}`);
    console.log(`[2/3] stock>0 的 SKU (将迁到 Inventory): ${skuWithStock}`);
    console.log(`      现有仓库 ${warehouseCount} 个, 现有 Inventory 记录 ${inventoryCount} 条`);
    console.log(`[3/3] 起价与活跃SKU最低价不一致的商品 (将更新 price): ${priceMismatch}`);
    console.log('=== 体检完成。确认数量合理后,按 [1/3]→[2/3]→[3/3] 顺序跑迁移脚本 ===');
  } catch (e) {
    console.error('体检失败:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
