import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const products = await p.product.findMany({ where: { status: "PUBLISHED" } });
  console.log(`找到 ${products.length} 个商品`);
  const imgDir = "g:/网站搭建2/client/public/images/products";
  const fs = require("fs");
  const files = fs.readdirSync(imgDir).filter((f: string) => f.endsWith(".png"));
  for (const product of products) {
    const existing = await p.productImage.count({ where: { productId: product.id } });
    if (existing > 0) { console.log(`  ${product.name}: 已有图片，跳过`); continue; }
    const file = files[products.indexOf(product) % files.length];
    const url = `/images/products/${file}`;
    await p.productImage.create({
      data: { productId: product.id, url, type: "FRONT", sortOrder: 1, isVideo: false },
    });
    await p.product.update({ where: { id: product.id }, data: { primaryImageId: (await p.productImage.findFirst({ where: { productId: product.id }, orderBy: { sortOrder: "asc" } }))!.id } });
    console.log(`  ${product.name} -> ${file}`);
  }
  // 设置列表图
  for (const product of products) {
    const img = await p.productImage.findFirst({ where: { productId: product.id }, orderBy: { sortOrder: "asc" } });
    if (img && !product.listingImageId) {
      await p.product.update({ where: { id: product.id }, data: { listingImageId: img.id } });
    }
  }
  console.log("✅ 完成");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
