const { PrismaClient } = require("./node_modules/@prisma/client");
const fs = require("fs");
const path = require("path");
const p = new PrismaClient();

// 从图片文件名提取真实产品名称
function extractNamesFromFiles() {
  const dir = path.resolve(__dirname, "../client/public/images/products");
  if (!fs.existsSync(dir)) return new Map();
  const files = fs.readdirSync(dir);
  const nameMap = new Map();

  for (const f of files) {
    const match = f.match(/^(ATP\d+)/i);
    if (!match) continue;
    const sku = match[1].toUpperCase();
    if (nameMap.has(sku)) continue;

    const afterSku = f.replace(/^ATP\d+_(FRONT|BACK|SIDE|TOP|DETAIL)_ATP\d+/i, "");
    const nameMatch = afterSku.match(/[\u4e00-\u9fa5][\u4e00-\u9fa5a-zA-Z0-9\u00b7]+/);
    if (nameMatch) {
      const name = nameMatch[0]
        .replace(/(正面|侧面|背面|顶部|细节|主图)$/, "")
        .replace(/\.(png|jpg|jpeg|webp)$/i, "")
        .trim();
      if (name.length >= 4) nameMap.set(sku, name);
    }
  }
  return nameMap;
}

// SKU → 分类关键词匹配
function classifyByName(name) {
  const rules = [
    ["平安扣", 5], ["锁包", 6], ["葫芦", 7], ["佛公", 8],
    ["无事牌", 9], ["如意", 39], ["叶子", 38], ["福牌", 41],
    ["长命锁", 6], ["钱币", 5], ["算盘", 1], ["转经筒", 1],
    ["圆牌", 1], ["环形牌", 1], ["花形牌", 1], ["水滴形", 1],
    ["方孔", 1], ["圆孔", 1], ["龙形", 1], ["元宝形", 1],
    ["手镯", 2], ["镯", 2],
    ["戒指", 3], ["戒", 3],
    ["耳钉", 19], ["耳环", 20], ["耳坠", 21], ["耳线", 22],
  ];
  for (const [kw, catId] of rules) {
    if (name.includes(kw)) return catId;
  }
  return null;
}

(async () => {
  // 1. 提取权威名称
  const fileNames = extractNamesFromFiles();
  console.log("从文件名提取到名称的SKU:", fileNames.size);

  // 2. 为有权威名称的产品确定分类
  const skuCategory = new Map(); // SKU → categoryId
  for (const [sku, name] of fileNames) {
    const cat = classifyByName(name);
    if (cat) skuCategory.set(sku, cat);
  }
  console.log("可确定分类的SKU:", skuCategory.size);

  // 3. 获取所有产品，按编号排序
  const products = await p.product.findMany({
    select: { id: true, code: true, name: true, categoryId: true },
    orderBy: { code: "asc" },
  });

  // 4. 按编号范围传播分类
  // 提取纯数字部分用于排序
  function numPart(code) {
    const m = code.match(/(\d+)/);
    return m ? parseInt(m[1]) : 0;
  }

  // 建立编号→分类映射
  const numToCat = [];
  for (const [sku, cat] of skuCategory) {
    numToCat.push({ num: numPart(sku), cat });
  }
  numToCat.sort((a, b) => a.num - b.num);

  // 对于每个产品，找最近的已知分类
  function findNearestCat(num) {
    let best = null;
    let bestDist = Infinity;
    for (const item of numToCat) {
      const dist = Math.abs(item.num - num);
      if (dist < bestDist && dist <= 50) { // 50以内视为同系列
        best = item.cat;
        bestDist = dist;
      }
    }
    return best;
  }

  let changed = 0;
  for (const prod of products) {
    const num = numPart(prod.code);
    
    // 优先用权威名称分类
    let targetCat = skuCategory.get(prod.code);
    
    // 其次用编号近邻推断
    if (!targetCat) {
      targetCat = findNearestCat(num);
    }
    
    // 兜底保持原分类
    if (!targetCat) targetCat = prod.categoryId;

    if (targetCat !== prod.categoryId) {
      await p.product.update({
        where: { id: prod.id },
        data: { categoryId: targetCat },
      });
      changed++;
      if (changed % 200 === 0) console.log("  已迁移", changed, "...");
    }
  }

  console.log("\n完成！迁移=" + changed + " 未变=" + (products.length - changed));
  await p.$disconnect();
})();
