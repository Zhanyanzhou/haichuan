import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const products = await p.product.findMany({ where: { status: "PUBLISHED" } });
  for (const prod of products) {
    const match = prod.code.match(/^(ATP\d+)-\d+$/);
    if (!match) continue;
    const base = match[1];
    const existing = await p.product.findFirst({ where: { code: base } });
    if (existing) {
      // 同base产品已存在，移动图片后归档
      const imgs = await p.productImage.findMany({ where: { productId: prod.id } });
      for (const img of imgs) {
        await p.productImage.update({ where: { id: img.id }, data: { productId: existing.id } });
      }
      await p.product.update({ where: { id: prod.id }, data: { status: "ARCHIVED", deletedAt: new Date() } });
      console.log(`  合并图片: ${prod.code} → ${base}`);
    } else {
      await p.product.update({ where: { id: prod.id }, data: { code: base } });
      console.log(`  改名: ${prod.code} → ${base}`);
    }
  }
  console.log("✅ 完成");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());