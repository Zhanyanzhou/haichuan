const { PrismaClient } = require("./node_modules/@prisma/client");
const p = new PrismaClient();
(async () => {
  const categories = await p.category.findMany({ select: { id: true, name: true } });
  const catMap = new Map(categories.map(c => [c.id, c.name]));

  // 查名称仍是纯货号的产品
  const products = await p.product.findMany({
    select: { id: true, code: true, name: true, categoryId: true },
  });
  const noName = products.filter(x => /^ATP\d+$/i.test(x.name));
  console.log("仍为纯货号:", noName.length);

  // 批量更新：分类名 + 货号
  let updated = 0;
  for (const prod of noName) {
    const catName = catMap.get(prod.categoryId) || "";
    const newName = catName ? `${catName} ${prod.code}` : prod.code;
    await p.product.update({ where: { id: prod.id }, data: { name: newName } });
    updated++;
    if (updated % 200 === 0) console.log("  已更新", updated, "...");
  }
  console.log("完成！更新=", updated);
  await p.$disconnect();
})();
