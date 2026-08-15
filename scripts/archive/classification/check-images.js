const { PrismaClient } = require("./node_modules/@prisma/client");
const p = new PrismaClient();
(async () => {
  const imgCount = await p.productImage.count();
  const productsWithImg = await p.productImage.groupBy({ by: ["productId"] });
  console.log("ProductImage总记录:", imgCount);
  console.log("有图片的产品数:", productsWithImg.length);
  console.log("产品总数: 1793");
  console.log("覆盖率:", Math.round((productsWithImg.length / 1793) * 100) + "%");
  await p.$disconnect();
})();
