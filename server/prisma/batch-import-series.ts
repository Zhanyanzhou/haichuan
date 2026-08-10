const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const p = new PrismaClient();
const srcBase = "G:/AI整理文件/input/原始3D和历史资料/整理文件合集/ATP吊坠文件合集/ATP犀牛文件/按吊坠扣分类/系列";
const destDir = "g:/网站搭建2/client/public/images/products";

async function main() {
  // 收集所有图片
  const images = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { walk(path.join(dir, e.name)); continue; }
      if (!e.name.match(/\.(png|jpg|jpeg|webp)$/i)) continue;
      const match = e.name.match(/^(ATP\d+)/);
      if (!match) continue;
      let view = "FRONT";
      if (e.name.includes("背面")) view = "BACK";
      else if (e.name.includes("侧面")) view = "SIDE";
      else if (!e.name.includes("正面")) continue;
      images.push({ code: match[1], view, srcPath: path.join(dir, e.name), name: e.name });
    }
  }
  walk(srcBase);
  console.log(`共 ${images.length} 张图片，${new Set(images.map(i => i.code)).size} 个款式`);

  // 获取已有商品
  const existing = await p.product.findMany({ where: { code: { startsWith: "ATP" } } });
  const existingMap = new Map(existing.map(p => [p.code, p.id]));
  console.log(`数据库中已有 ${existing.length} 个ATP商品`);

  let copied = 0, created = 0, linked = 0;
  
  // 按款式分组处理
  const byCode = new Map();
  for (const img of images) {
    if (!byCode.has(img.code)) byCode.set(img.code, []);
    byCode.get(img.code).push(img);
  }

  for (const [code, imgs] of byCode) {
    // 获取或创建产品
    let productId = existingMap.get(code);
    if (!productId) {
      const prod = await p.product.create({
        data: { code, name: code, categoryId: 10, materialType: "GOLD_999", status: "PUBLISHED", salesMode: "DISPLAY_ONLY" }
      });
      productId = prod.id;
      existingMap.set(code, productId);
      created++;
      if (created % 100 === 0) console.log(`  已创建 ${created} 个商品...`);
    }

    // 添加图片（每种视角一张）
    for (const img of imgs) {
      const destName = `${img.code}_${img.view}_${img.name.replace(/[\\/:*?"<>|]/g, '_')}`.substring(0, 250);
      const destPath = path.join(destDir, destName);
      
      // 复制文件
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(img.srcPath, destPath);
        copied++;
      }
      
      const url = `/images/products/${destName}`;
      const exists = await p.productImage.count({ where: { productId, url } });
      if (exists > 0) { linked++; continue; }
      
      // 检查同视角是否已有
      const viewType = img.view === "BACK" ? "DETAIL" : img.view === "SIDE" ? "SIDE" : "FRONT";
      const sameView = await p.productImage.count({ where: { productId, type: viewType } });
      
      await p.productImage.create({
        data: { productId, url, type: viewType, sortOrder: img.view === "FRONT" ? 0 : img.view === "BACK" ? 2 : 1, isVideo: false }
      });
      linked++;
    }

    // 设置封面和列表图
    const frontImg = await p.productImage.findFirst({ where: { productId, type: "FRONT" }, orderBy: { sortOrder: "asc" } });
    if (frontImg) {
      const prod = await p.product.findUnique({ where: { id: productId } });
      if (!prod.primaryImageId || !prod.listingImageId) {
        await p.product.update({ where: { id: productId }, data: { primaryImageId: frontImg.id, listingImageId: frontImg.id } });
      }
    }
  }

  const total = await p.product.count({ where: { status: "PUBLISHED" } });
  console.log(`\n✅ 完成: 复制${copied}张, 新建${created}个商品, 关联${linked}张图`);
  console.log(`   PUBLISHED商品总数: ${total}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());