/**
 * 阶段1 数据迁移 [1/3] —— 为"无活跃 SKU"的商品补建默认 SKU(统一 SKU 模型)
 *
 * 幂等:以 skuCode = `${product.code}-DEFAULT` 为准。
 *   - 商品已有任意活跃 SKU           → 跳过
 *   - 已有同 skuCode 的默认 SKU(停用) → 重新启用
 *   - 否则                            → 用商品 materialType/size/goldWeight/price 建默认 SKU
 *
 * ⚠️ 跑前请先备份数据库(见 plan §二.4)。
 * 用法: node server/migrate-ensure-default-sku.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const products = await p.product.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, materialType: true, size: true, goldWeight: true, price: true },
    });
    console.log(`[1/3] 扫描商品 ${products.length} 个,补建默认 SKU ...`);

    let created = 0, reactivated = 0, skipped = 0;
    for (const pr of products) {
      // 已有任意活跃 SKU → 该商品已满足统一模型,跳过
      const hasActive = await p.productSKU.findFirst({
        where: { productId: pr.id, isActive: true },
        select: { id: true },
      });
      if (hasActive) { skipped++; continue; }

      const defaultCode = `${pr.code}-DEFAULT`;
      // 历史建过的默认 SKU(可能被停用)→ 重新启用,避免 skuCode 唯一冲突
      const dormant = await p.productSKU.findFirst({
        where: { skuCode: defaultCode },
        select: { id: true },
      });
      if (dormant) {
        await p.productSKU.update({ where: { id: dormant.id }, data: { isActive: true } });
        reactivated++;
        continue;
      }

      await p.productSKU.create({
        data: {
          productId: pr.id,
          skuCode: defaultCode,
          material: pr.materialType || 'GOLD_999',
          size: pr.size ?? null,
          goldWeight: pr.goldWeight ?? 0,
          price: pr.price ?? 0,
          isActive: true,
        },
      });
      created++;
    }
    console.log(`[1/3] 完成: 新建 ${created} / 重新启用 ${reactivated} / 已有活跃SKU跳过 ${skipped}`);
  } catch (e) {
    console.error('[1/3] 失败:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
