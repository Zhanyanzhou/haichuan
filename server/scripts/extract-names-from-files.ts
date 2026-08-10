/**
 * 从图片文件名提取描述信息作为产品名称
 * 例如: ATP1420_FRONT_ATP1420镶嵌正面.png → 名称: "镶嵌"
 *       没有描述信息的用分类名 + 货号
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  const imgDir = path.resolve(__dirname, "../../client/public/images/products");
  if (!fs.existsSync(imgDir)) { console.log("图片目录不存在"); return; }

  const files = fs.readdirSync(imgDir);

  // 按 SKU 收集文件名中的描述片段
  const skuDescriptions = new Map<string, string[]>();

  for (const f of files) {
    const match = f.match(/^(ATP\d+)/i);
    if (!match) continue;
    const sku = match[1].toUpperCase();

    // 提取第二个 ATP 之后、角度词之前的中文
    const afterSku = f.replace(/^ATP\d+_(FRONT|BACK|SIDE|TOP|DETAIL)_ATP\d+/i, "");
    const descMatch = afterSku.match(
      /[\u4e00-\u9fa5a-zA-Z0-9]+/
    );
    if (descMatch) {
      let desc = descMatch[0]
        .replace(/^(正面|侧面|背面|顶部|细节|主图)$/, "")
        .replace(/\.(png|jpg|jpeg|webp)$/i, "")
        .trim();
      if (desc && desc.length >= 1) {
        if (!skuDescriptions.has(sku)) skuDescriptions.set(sku, []);
        const arr = skuDescriptions.get(sku)!;
        if (!arr.includes(desc)) arr.push(desc);
      }
    }
  }

  // 获取分类名称映射
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const catMap = new Map(categories.map(c => [c.id, c.name]));

  let updated = 0;
  let skipped = 0;

  for (const [code, descs] of skuDescriptions) {
    // 查找产品
    const product = await prisma.product.findFirst({
      where: { code },
      select: { id: true, name: true, categoryId: true },
    });
    if (!product) { skipped++; continue; }

    // 如果已有中文名（非纯货号），跳过
    if (product.name && !/^ATP\d+$/i.test(product.name)) {
      skipped++;
      continue;
    }

    // 构建名称：描述 + 分类名
    const catName = catMap.get(product.categoryId) || "";
    const descPart = descs.join("");
    let newName = "";

    if (descPart) {
      // 有描述就用 分类+描述
      newName = catName ? `${catName}${descPart}` : descPart;
    } else {
      // 没有描述就用 分类+货号 作为名称
      newName = catName ? `${catName} ${code}` : code;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { name: newName },
    });
    updated++;
    if (updated % 100 === 0) console.log(`  已更新 ${updated} ...`);
  }

  console.log(`\n完成！更新=${updated} 跳过(已有名称)=${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
