import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const products = await p.product.findMany({ 
    where: { status: "PUBLISHED" },
    orderBy: { code: "asc" }
  });
  
  // 只合并 ATP 开头且有 -N 后缀的
  const groups = new Map<string, number[]>();
  for (const prod of products) {
    if (!prod.code.startsWith("ATP")) continue;
    const match = prod.code.match(/^(ATP\d+)(-\d+)?$/);
    if (!match) continue;
    const base = match[1];
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(prod.id);
  }
  
  let merged = 0;
  for (const [baseCode, ids] of groups) {
    if (ids.length <= 1) continue;
    
    const prods = await Promise.all(ids.map(id => p.product.findUnique({ where: { id }, include: { images: true } })));
    // 主产品：code就是base的（无后缀）
    let main = prods.find(pp => pp!.code === baseCode);
    if (!main) main = prods[0];
    const variants = prods.filter(pp => pp!.id !== main!.id);
    
    // 重命名主产品货号为base
    if (main!.code !== baseCode) {
      await p.product.update({ where: { id: main!.id }, data: { code: baseCode } });
      console.log(`  改名: ${main!.code} → ${baseCode}`);
      main!.code = baseCode;
    }
    
    for (const v of variants) {
      if (!v) continue;
      // 移动图片
      for (const img of v.images) {
        await p.productImage.update({ where: { id: img.id }, data: { productId: main!.id } });
      }
      // 软删除变体
      await p.product.update({ where: { id: v.id }, data: { status: "ARCHIVED", deletedAt: new Date() } });
      merged++;
      console.log(`  合并: ${v.code} → ${main!.code}`);
    }
    
    // 确保封面
    const images = await p.productImage.findMany({ where: { productId: main!.id }, orderBy: { sortOrder: "asc" } });
    if (images.length > 0) {
      await p.product.update({ where: { id: main!.id }, data: { primaryImageId: images[0].id, listingImageId: images[0].id } });
    }
  }
  
  // 修复 HC-ZD-001/002 错误合并
  const hcProd = await p.product.findFirst({ where: { code: "HC-ZD-002" }, include: { images: true } });
  if (hcProd && hcProd.name.includes("平安扣")) {
    // 分离回去
    await p.product.update({ where: { id: hcProd.id }, data: { name: "浩瀚宇宙 · 3D硬金葫芦吊坠" } });
  }
  
  console.log(`\n✅ 合并 ${merged} 个变体`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());