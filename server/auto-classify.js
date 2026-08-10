const { PrismaClient } = require("./node_modules/@prisma/client");
const p = new PrismaClient();

// 关键词 → categoryId 映射（优先长关键词）
const KEYWORD_MAP = [
  // 吊坠子类
  ["平安扣", 5], ["锁包", 6], ["葫芦", 7], ["佛公", 8], ["无事牌", 9],
  ["生肖牌", 10], ["生肖", 10], ["叶子", 38], ["叶片", 38], ["如意", 39],
  ["福牌", 41], ["长命锁", 6], ["钱币牌", 5], ["算盘", 1],
  // 吊坠类关键词（放在子类之后，作为兜底）
  ["吊坠", 1], ["挂件", 1],

  // 手镯子类
  ["固口镯", 11], ["推拉镯", 12], ["C形镯", 13], ["链镯", 14],
  ["卡家手镯", 23], ["传承手镯", 24], ["抽拉手镯", 25],
  ["开口手镯", 26], ["开口镯", 26], ["闭口手镯", 27], ["闭口镯", 27],
  ["镂空手镯", 28],
  // 手镯兜底
  ["手镯", 2], ["镯子", 2], ["bangle", 2],

  // 戒指子类
  ["情侣对戒", 45], ["对戒", 18], ["男戒", 17], ["镶钻戒", 44],
  ["光圈戒", 43], ["花戒", 16], ["素圈", 15],
  // 戒指兜底
  ["戒指", 3], ["指环", 3],

  // 耳饰子类
  ["耳钉", 19], ["耳环", 20], ["耳坠", 21], ["耳线", 22],
  // 耳饰兜底
  ["耳饰", 4],

  // 特殊工艺（跨品类，用于辅助判断）
  // 雕刻/镂空等不改变品类归属
];

(async () => {
  const products = await p.product.findMany({
    select: { id: true, name: true, code: true, categoryId: true },
  });

  let changed = 0;
  let skipped = 0;

  for (const prod of products) {
    const name = prod.name || "";
    let bestCat = null;
    let bestLen = 0;

    // 匹配最长关键词
    for (const [kw, catId] of KEYWORD_MAP) {
      if (name.includes(kw) && kw.length > bestLen) {
        bestCat = catId;
        bestLen = kw.length;
      }
    }

    if (bestCat && bestCat !== prod.categoryId) {
      await p.product.update({
        where: { id: prod.id },
        data: { categoryId: bestCat },
      });
      changed++;
      if (changed % 200 === 0) console.log("  已迁移", changed, "...");
    } else {
      skipped++;
    }
  }

  console.log("\n完成！迁移=" + changed + " 未变=" + skipped);
  await p.$disconnect();
})();
