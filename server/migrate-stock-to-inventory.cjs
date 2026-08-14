/**
 * 阶段1 数据迁移 [2/3] —— 把 ProductSKU.stock 迁到 Inventory(库存单一源)
 *
 * 幂等:每个 stock>0 的 SKU 在默认仓库建一条 Inventory;该 SKU 已有 Inventory 记录则跳过。
 *   原 ProductSKU.stock 值保留(字段已废弃,不再读写),不删除以保数据安全。
 *
 * ⚠️ 跑前请先备份数据库。
 * 用法: node server/migrate-stock-to-inventory.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    // 选默认仓库:优先活跃 STORE,其次任意活跃,再次任意;全无则建一个
    let warehouse = await p.warehouse.findFirst({
      where: { type: 'STORE', isActive: true },
      select: { id: true, name: true },
    });
    if (!warehouse) warehouse = await p.warehouse.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
    if (!warehouse) warehouse = await p.warehouse.findFirst({ select: { id: true, name: true } });
    if (!warehouse) {
      warehouse = await p.warehouse.create({ data: { name: '默认仓库', type: 'STORE' } });
      console.log('[2/3] 未发现仓库,已创建"默认仓库"(STORE)');
    }
    console.log(`[2/3] 使用仓库: ${warehouse.name} (id=${warehouse.id})`);

    const skus = await p.productSKU.findMany({
      where: { stock: { gt: 0 } },
      select: { id: true, skuCode: true, stock: true, safetyStock: true },
    });
    console.log(`[2/3] 扫描 stock>0 的 SKU ${skus.length} 个,迁到 Inventory ...`);

    let migrated = 0, skipped = 0;
    for (const sku of skus) {
      // 幂等:该 SKU 在默认仓库已有 Inventory → 不重复迁移
      const existing = await p.inventory.findUnique({
        where: { skuId_warehouseId: { skuId: sku.id, warehouseId: warehouse.id } },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      await p.inventory.create({
        data: {
          skuId: sku.id,
          warehouseId: warehouse.id,
          quantity: sku.stock,
          safetyStock: sku.safetyStock ?? 5,
        },
      });
      migrated++;
    }
    console.log(`[2/3] 完成: 迁移 ${migrated} 条 / 已存在跳过 ${skipped} 条`);
    console.log('[2/3] 注意: ProductSKU.stock 原值保留(已废弃,不再读写),未删除以保数据安全。');
  } catch (e) {
    console.error('[2/3] 失败:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
