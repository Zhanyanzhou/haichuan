/**
 * 检查无名称产品的分类分布
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 统计无名称产品：name 等于 code 或为空
  const unnamed = await (prisma as any).$queryRawUnsafe(
    `SELECT p.id, p.code, p.name, p.category_id, c.name as catName
     FROM products p LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.name = p.code OR p.name IS NULL OR p.name = ''
     ORDER BY p.id
     LIMIT 20`
  );
  console.log("无名称产品示例（前20条）:");
  for (const p of unnamed as any[]) {
    console.log(`  ${p.code} | cat=${p.catName || "?"} (id=${p.categoryId})`);
  }

  // 统计总数
  const count: any = await (prisma as any).$queryRawUnsafe(
    `SELECT COUNT(*) as cnt FROM products WHERE name = code OR name IS NULL OR name = ''`
  );
  console.log(`\n无名称产品总数: ${count[0].cnt}`);

  // 按分类统计
  const dist: any = await (prisma as any).$queryRawUnsafe(
    `SELECT c.name as catName, COUNT(*) as cnt
     FROM products p LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.name = p.code OR p.name IS NULL OR p.name = ''
     GROUP BY c.name ORDER BY cnt DESC`
  );
  console.log("\n分类分布:");
  for (const d of dist as any[]) {
    console.log(`  ${d.catName || "未分类"}: ${d.cnt} 个`);
  }
}

main().finally(() => prisma.$disconnect());
