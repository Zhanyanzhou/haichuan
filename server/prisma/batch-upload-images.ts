import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const p = new PrismaClient();
const imgDir = "g:/网站搭建2/client/public/images/products";

async function main() {
  const files = fs.readdirSync(imgDir).filter((f: string) => f.match(/\.(png|jpg|jpeg|webp)$/i));
  console.log(`图片文件: ${files.length} 个`);

  const products = await p.product.findMany({ where: { status: "PUBLISHED" } });
  
  // 构建货号→产品映射
  const codeMap = new Map<string, number>();
  for (const prod of products) {
    codeMap.set(prod.code, prod.id);
    // 也添加去掉后缀的版本 (ATP1056-2 → ATP1056)
    const base = prod.code.replace(/-\d+$/, "");
    if (base !== prod.code) codeMap.set(base, prod.id);
  }

  let added = 0;
  let created = 0;

  for (const file of files) {
    // 从文件名提取ATP编码
    const match = file.match(/^(ATP\d+)/i);
    if (!match) continue;
    const code = match[1];
    
    let productId = codeMap.get(code);
    
    // 如果找不到匹配产品，创建新产品
    if (!productId) {
      const name = file.replace(/\.[^.]+$/, "").replace(/([A-Z]+\d+)/, "$1 ");
      const newProd = await p.product.create({
        data: {
          code: code,
          name: name,
          categoryId: 9, // 平安扣分类
          materialType: "GOLD_999",
          status: "PUBLISHED",
          salesMode: "DISPLAY_ONLY",
        },
      });
      productId = newProd.id;
      codeMap.set(code, productId);
      created++;
      console.log(`  新建商品: ${code} → ${name}`);
    }

    // 检查是否已有此图片
    const url = `/images/products/${file}`;
    const exists = await p.productImage.count({ where: { productId, url } });
    if (exists > 0) continue;

    // 添加图片
    const img = await p.productImage.create({
      data: { productId, url, type: "FRONT", sortOrder: 0, isVideo: false },
    });
    added++;

    // 设置为封面和列表图（如果还没有）
    const prod = await p.product.findUnique({ where: { id: productId } });
    if (!prod!.primaryImageId) {
      await p.product.update({ where: { id: productId }, data: { primaryImageId: img.id } });
    }
    if (!prod!.listingImageId) {
      await p.product.update({ where: { id: productId }, data: { listingImageId: img.id } });
    }
  }

  console.log(`\n✅ 完成: 新增图片 ${added} 张, 新建商品 ${created} 个`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());