/**
 * 数据迁移 —— 为缺少 Inventory 记录的活跃 SKU 补建库存（Inventory 单一来源，P1-1 闭环）
 *
 * 背景：orders.service 已移除 ProductSKU.stock fallback，Inventory 为唯一库存来源。
 *   历史 SKU（包括 migrate-ensure-default-sku.cjs 建的默认 SKU）若没有 Inventory 行，
 *   下单时会直接抛"库存不足"，导致全部历史商品无法下单。本脚本为这些 SKU 补建 Inventory。
 *
 * 幂等：以 (skuId, warehouseId) 复合唯一键为准，已有 Inventory 的 SKU 跳过。
 *   - 挂在第一个 active 仓库（seed 已建深圳展厅 / 广州工厂 / 北京门店）
 *   - 无 active 仓库时自动建"默认主仓库"
 *   - 初始 quantity 取该 SKU 的 stock 残留值（兼容历史双轨数据），无则 0
 *   - safetyStock 取 SKU.safetyStock 或 5
 *
 * ⚠️ 跑前请先备份数据库。
 * 用法: node server/migrate-ensure-inventory.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    // 确定默认仓库（与 products.service.ensureDefaultWarehouseId 同逻辑）
    let warehouse = await p.warehouse.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
    if (!warehouse) {
      warehouse = await p.warehouse.create({ data: { name: '默认主仓库', type: 'STORE', isActive: true } });
      console.log(`[inventory] 无 active 仓库，已自动建"默认主仓库" (id=${warehouse.id})`);
    }
    console.log(`[inventory] 默认仓库: ${warehouse.name} (id=${warehouse.id})`);

    const skus = await p.productSKU.findMany({
      where: { isActive: true },
      select: { id: true, skuCode: true, stock: true, safetyStock: true },
    });
    console.log(`[inventory] 扫描活跃 SKU ${skus.length} 个，补建 Inventory ...`);

    let created = 0;
    let skipped = 0;
    for (const sku of skus) {
      const has = await p.inventory.findUnique({
        where: { skuId_warehouseId: { skuId: sku.id, warehouseId: warehouse.id } },
      });
      if (has) { skipped++; continue; }
      await p.inventory.create({
        data: {
          skuId: sku.id,
          warehouseId: warehouse.id,
          quantity: sku.stock ?? 0,
          safetyStock: sku.safetyStock ?? 5,
        },
      });
      created++;
    }
    console.log(`[inventory] 完成: 新建 ${created} / 已有跳过 ${skipped}`);
  } catch (e) {
    console.error('[inventory] 失败:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
