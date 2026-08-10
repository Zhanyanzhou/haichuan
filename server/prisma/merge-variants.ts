import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const products = await p.product.findMany({ 
    where: { status: "PUBLISHED" },
    orderBy: { code: "asc" }
  });
  
  // 按基础货号分组（去掉 -N 后缀）
  const groups = new Map<string, number[]>();
  for (const prod of products) {
    const base = prod.code.replace(/-\d+$/, "");
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(prod.id);
  }
  
  let merged = 0;
  for (const [baseCode, ids] of groups) {
    if (ids.length <= 1) continue;
    
    // 选名字最长的作为主产品
    const prods = await Promise.all(ids.map(id => p.product.findUnique({ where: { id }, include: { images: true } })));
    prods.sort((a, b) => (b!.name.length - a!.name.length));
    const main = prods[0]!;
    const variants = prods.slice(1);
    
    // 移动图片到主产品
    for (const v of variants) {
      if (!v) continue;
      for (const img of v.images) {
        await p.productImage.update({
          where: { id: img.id },
          data: { productId: main.id }
        });
      }
      // 合并名字信息
      if (v.name && v.name !== main.name && !main.name.includes(v.name)) {
        await p.product.update({
          where: { id: main.id },
          data: { name: main.name + " / " + v.name }
        });
        main.name = main.name + " / " + v.name;
      }
      // 软删除变体
      await p.product.update({
        where: { id: v.id },
        data: { status: "ARCHIVED", deletedAt: new Date() }
      });
      merged++;
      console.log(`  合并: ${v.code}(${v.name}) → ${main.code}`);
    }
    
    // 确保主产品有封面
    const images = await p.productImage.findMany({ where: { productId: main.id }, orderBy: { sortOrder: "asc" } });
    if (images.length > 0 && !main.primaryImageId) {
      await p.product.update({ where: { id: main.id }, data: { primaryImageId: images[0].id, listingImageId: images[0].id } });
    }
  }
  
  console.log(`\n✅ 合并 ${merged} 个变体到主产品`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());