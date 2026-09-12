import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'prisma/migrations/20260911220000_add_customer_profile_security/migration.sql';
const sql = readFileSync(migrationPath, 'utf8');

test('客户邮箱唯一索引在空白与归一化重复值守卫之后创建', () => {
  const firstPersistentDdl = sql.indexOf('ALTER TABLE `customers`');
  const uniqueIndex = sql.indexOf('CREATE UNIQUE INDEX `customers_email_key`');
  assert.ok(firstPersistentDdl > 0);
  assert.ok(uniqueIndex > firstPersistentDdl);

  for (const guard of [
    '_guard_blank_customer_email',
    '_guard_duplicate_customer_email',
  ]) {
    const guardPosition = sql.indexOf(`CREATE TEMPORARY TABLE \`${guard}\``);
    assert.ok(guardPosition >= 0, `缺少迁移守卫 ${guard}`);
    assert.ok(guardPosition < firstPersistentDdl, `${guard} 必须在首个持久 DDL 前执行`);
    assert.match(sql, new RegExp('DROP TEMPORARY TABLE `' + guard + '`;'));
  }

  assert.match(sql, /`email` IS NOT NULL AND TRIM\(`email`\) = ''/);
  assert.match(
    sql,
    /WHERE `email` IS NOT NULL\s+GROUP BY LOWER\(TRIM\(`email`\)\) HAVING COUNT\(\*\) > 1/,
  );
  assert.doesNotMatch(sql.slice(0, firstPersistentDdl), /\b(?:UPDATE|DELETE)\b/);
});
