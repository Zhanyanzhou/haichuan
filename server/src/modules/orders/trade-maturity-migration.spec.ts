import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "prisma/migrations/20260906160000_close_trade_maturity_invariants/migration.sql";
const sql = readFileSync(migrationPath, "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");

test("交易成熟度迁移在首个持久 DDL 前失败关闭所有不可可靠回填的存量数据", () => {
  const firstPersistentDdl = sql.indexOf(
    "CREATE UNIQUE INDEX `payments_gateway_trade_no_key`",
  );
  assert.ok(firstPersistentDdl > 0);

  const requiredGuards = [
    "_guard_duplicate_gateway_trade_no",
    "_guard_blank_gateway_trade_no",
    "_guard_duplicate_gateway_refund_no",
    "_guard_blank_gateway_refund_no",
    "_guard_order_snapshot_source",
    "_guard_order_amount_formula",
    "_guard_unresolved_fulfillment_warehouse",
    "_guard_duplicate_order_warehouse_fulfillment",
    "_guard_duplicate_order_sku_items",
    "_guard_consumed_reservation_orphan",
    "_guard_fulfillment_without_reservation",
    "_guard_after_sales_order_item_orphan",
    "_guard_refund_after_sales_orphan",
    "_guard_duplicate_plan_quotation",
    "_guard_duplicate_plan_order",
    "_guard_duplicate_installment_payment",
    "_guard_invalid_payment_plan_source",
    "_guard_invalid_fulfillment_quantity",
    "_guard_invalid_payment_plan_amount",
    "_guard_invalid_installment_amount_or_sequence",
    "_guard_installment_payment_orphan",
  ];

  for (const guard of requiredGuards) {
    const guardPosition = sql.indexOf(
      `CREATE TEMPORARY TABLE \`${guard}\``,
    );
    assert.ok(guardPosition >= 0, `缺少迁移守卫 ${guard}`);
    assert.ok(
      guardPosition < firstPersistentDdl,
      `${guard} 必须在首个持久 DDL 前执行`,
    );
  }
});

test("临时迁移守卫拒绝空白渠道号且不会用普通 DROP TABLE 触发隐式提交", () => {
  assert.match(
    sql,
    /FROM `payments`\s+WHERE `gateway_trade_no` IS NOT NULL\s+GROUP BY `gateway_trade_no`/,
  );
  assert.match(sql, /TRIM\(`gateway_trade_no`\) = ''/);
  assert.match(sql, /TRIM\(`gateway_refund_no`\) = ''/);
  assert.doesNotMatch(
    sql,
    /`gateway_(?:trade|refund)_no` IS NOT NULL AND `gateway_(?:trade|refund)_no` <> ''/,
  );

  const guards = [
    ...sql.matchAll(/CREATE TEMPORARY TABLE `(_guard_[^`]+)`/g),
  ].map((match) => match[1]);
  assert.ok(guards.length > 0);
  for (const guard of guards) {
    assert.match(sql, new RegExp(`DROP TEMPORARY TABLE \`${guard}\`;`));
  }
  assert.doesNotMatch(sql, /DROP TABLE `_guard_/);
});

test("重复订单 SKU 在持久 DDL 前失败关闭且 Schema 与唯一索引一致", () => {
  const guardPosition = sql.indexOf(
    "CREATE TEMPORARY TABLE `_guard_duplicate_order_sku_items`",
  );
  const indexPosition = sql.indexOf(
    "CREATE UNIQUE INDEX `order_items_order_id_sku_id_key`",
  );
  assert.ok(guardPosition >= 0 && guardPosition < indexPosition);
  assert.match(
    sql,
    /FROM `order_items`\s+GROUP BY `order_id`, `sku_id` HAVING COUNT\(\*\) > 1/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX `order_items_order_id_sku_id_key` ON `order_items`\(`order_id`, `sku_id`\)/,
  );
  const orderItemModel = schema.match(/model OrderItem \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(orderItemModel, /@@unique\(\[orderId, skuId\]\)/);
});

test("订单和履约回填只消费既有可信事实", () => {
  assert.match(sql, /TRIM\(COALESCE\(`customer_name`, ''\)\) = ''/);
  assert.match(sql, /`final_amount` <> `total_amount` - `discount_amount` \+ `adjustment_amount`/);
  assert.match(
    sql,
    /WHERE `ir`\.`released_at` IS NULL AND `ir`\.`consumed_at` IS NOT NULL/,
  );
  assert.match(
    sql,
    /HAVING COUNT\(DISTINCT `i`\.`warehouse_id`\) = 1/,
  );
  assert.doesNotMatch(sql, /SET `warehouse_id` = \d+/);
  assert.match(sql, /CREATE TABLE `fulfillment_items`/);
  assert.match(
    sql,
    /UNIQUE INDEX `fulfillment_items_inventory_reservation_id_key`/,
  );
});

test("数据库约束覆盖渠道幂等、交易关系和报价版本指针", () => {
  assert.match(sql, /CREATE UNIQUE INDEX `payments_gateway_trade_no_key`/);
  assert.match(sql, /CREATE UNIQUE INDEX `refunds_gateway_refund_no_key`/);
  assert.match(sql, /CREATE UNIQUE INDEX `order_items_order_id_sku_id_key`/);
  assert.match(sql, /ADD UNIQUE INDEX `orders_quotation_version_id_key`/);
  assert.match(sql, /ADD CONSTRAINT `after_sales_cases_order_item_id_fkey`/);
  assert.match(sql, /ADD CONSTRAINT `refunds_after_sales_case_id_fkey`/);
  assert.match(sql, /ADD CONSTRAINT `payment_plan_installments_payment_id_fkey`/);
  assert.match(
    sql,
    /SET `q`\.`current_version` = COALESCE\(`latest`\.`current_version`, 0\)/,
  );
});

