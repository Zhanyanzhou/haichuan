/**
 * 从图片文件名提取中文产品名称，批量更新数据库
 * 用法: npx ts-node scripts/update-product-names.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  // 1. 从图片文件名提取名称
  const imgDir = path.resolve(__dirname, "../../client/public/images/products");
  const nameMap = new Map<string, string>();

  if (fs.existsSync(imgDir)) {
    const files = fs.readdirSync(imgDir);
    for (const f of files) {
      const match = f.match(/^(ATP\d+)/i);
      if (!match) continue;
      const sku = match[1].toUpperCase();
      if (nameMap.has(sku)) continue;

      // 提取第二个 SKU 之后的中文名称
      const afterSecondSku = f.replace(
        /^ATP\d+_(FRONT|BACK|SIDE|TOP|DETAIL)_ATP\d+/,
        ""
      );
      const nameMatch = afterSecondSku.match(
        /[\u4e00-\u9fa5][\u4e00-\u9fa5a-zA-Z0-9·，、。；：\u00b7]+/
      );
      if (nameMatch) {
        const name = nameMatch[0]
          .replace(/(正面|侧面|背面|顶部|细节|主图)$/, "")
          .replace(/\.(png|jpg|jpeg|webp)$/i, "")
          .trim();
        if (name.length >= 3) nameMap.set(sku, name);
      }
    }
  }

  // 2. 从 CSV 补充
  const csvPath = path.resolve(__dirname, "../../upload-products.csv");
  if (fs.existsSync(csvPath)) {
    const csv = fs.readFileSync(csvPath, "utf8");
    const lines = csv.trim().split("\n").slice(1);
    for (const line of lines) {
      const parts = line.match(/^([^,]+),"([^"]+)"/);
      if (parts) {
        const sku = parts[1].trim().toUpperCase();
        const name = parts[2].trim();
        if (name && name.length >= 3 && !name.match(/^ATP\d+$/i) && !nameMap.has(sku)) {
          nameMap.set(sku, name);
        }
      }
    }
  }

  console.log(`共提取到 ${nameMap.size} 个 SKU 的中文名称\n`);

  // 3. 批量更新数据库
  let updated = 0;
  let skipped = 0;

  for (const [code, name] of nameMap) {
    try {
      const result = await prisma.product.updateMany({
        where: { code },
        data: { name },
      });
      if (result.count > 0) {
        updated++;
        if (updated % 50 === 0) console.log(`  已更新 ${updated} ...`);
      } else {
        skipped++;
      }
    } catch (e: any) {
      console.log(`  错误 [${code}]: ${e.message}`);
    }
  }

  console.log(`\n完成！更新=${updated} 跳过(未匹配)=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
