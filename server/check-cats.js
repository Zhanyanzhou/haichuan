const { PrismaClient } = require("./node_modules/@prisma/client");
const p = new PrismaClient();
(async () => {
  const cats = await p.category.findMany({ select: { id: true, name: true, level: true } });
  console.log("分类列表:");
  cats.forEach(c => console.log("  id=" + c.id + " L" + c.level + " " + c.name));

  console.log("\n产品分布:");
  const groups = await p.product.groupBy({ by: ["categoryId"], _count: true });
  const catMap = new Map(cats.map(c => [c.id, c.name]));
  groups.sort((a, b) => b._count - a._count).forEach(g => {
    console.log("  " + catMap.get(g.categoryId) + ": " + g._count + "件");
  });
  await p.$disconnect();
})();
