-- 交易成熟度前向迁移：所有存量不一致均失败关闭，禁止静默删除、合并或改写交易事实。

-- 1. 渠道交易号在全库唯一。NULL 仍可重复，兼容尚未获得渠道结果的记录。
CREATE TEMPORARY TABLE `_guard_duplicate_gateway_trade_no` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_duplicate_gateway_trade_no` (`ok`)
SELECT 0 FROM `payments`
WHERE `gateway_trade_no` IS NOT NULL
GROUP BY `gateway_trade_no` HAVING COUNT(*) > 1 LIMIT 1;
DROP TEMPORARY TABLE `_guard_duplicate_gateway_trade_no`;

CREATE TEMPORARY TABLE `_guard_blank_gateway_trade_no` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_blank_gateway_trade_no` (`ok`)
SELECT 0 FROM `payments`
WHERE `gateway_trade_no` IS NOT NULL AND TRIM(`gateway_trade_no`) = ''
LIMIT 1;
DROP TEMPORARY TABLE `_guard_blank_gateway_trade_no`;

CREATE TEMPORARY TABLE `_guard_duplicate_gateway_refund_no` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_duplicate_gateway_refund_no` (`ok`)
SELECT 0 FROM `refunds`
WHERE `gateway_refund_no` IS NOT NULL
GROUP BY `gateway_refund_no` HAVING COUNT(*) > 1 LIMIT 1;
DROP TEMPORARY TABLE `_guard_duplicate_gateway_refund_no`;

CREATE TEMPORARY TABLE `_guard_blank_gateway_refund_no` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_blank_gateway_refund_no` (`ok`)
SELECT 0 FROM `refunds`
WHERE `gateway_refund_no` IS NOT NULL AND TRIM(`gateway_refund_no`) = ''
LIMIT 1;
DROP TEMPORARY TABLE `_guard_blank_gateway_refund_no`;

-- 所有可能暴露存量不一致的检查必须在首个持久 DDL 前完成。MySQL DDL 会隐式提交，
-- 因此不能在 ALTER TABLE 之后才发现无法可靠回填的数据。
CREATE TEMPORARY TABLE `_guard_order_snapshot_source` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_order_snapshot_source` (`ok`)
SELECT 0 FROM `orders`
WHERE TRIM(COALESCE(`customer_name`, '')) = ''
   OR TRIM(COALESCE(`customer_phone`, '')) = ''
   OR TRIM(COALESCE(`address`, '')) = ''
LIMIT 1;
DROP TEMPORARY TABLE `_guard_order_snapshot_source`;

CREATE TEMPORARY TABLE `_guard_order_amount_formula` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_order_amount_formula` (`ok`)
SELECT 0 FROM `orders`
WHERE `final_amount` <> `total_amount` - `discount_amount` + `adjustment_amount`
LIMIT 1;
DROP TEMPORARY TABLE `_guard_order_amount_formula`;

CREATE TEMPORARY TABLE `_guard_unresolved_fulfillment_warehouse` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_unresolved_fulfillment_warehouse` (`ok`)
SELECT 0
FROM `fulfillments` AS `f`
LEFT JOIN (
  SELECT `ir`.`order_id`, MIN(`i`.`warehouse_id`) AS `warehouse_id`
  FROM `inventory_reservations` AS `ir`
  JOIN `inventories` AS `i` ON `i`.`id` = `ir`.`inventory_id`
  WHERE `ir`.`released_at` IS NULL AND `ir`.`consumed_at` IS NOT NULL
  GROUP BY `ir`.`order_id`
  HAVING COUNT(DISTINCT `i`.`warehouse_id`) = 1
) AS `source` ON `source`.`order_id` = `f`.`order_id`
WHERE `source`.`warehouse_id` IS NULL
LIMIT 1;
DROP TEMPORARY TABLE `_guard_unresolved_fulfillment_warehouse`;

CREATE TEMPORARY TABLE `_guard_duplicate_order_warehouse_fulfillment` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_duplicate_order_warehouse_fulfillment` (`ok`)
SELECT 0 FROM `fulfillments`
GROUP BY `order_id` HAVING COUNT(*) > 1 LIMIT 1;
DROP TEMPORARY TABLE `_guard_duplicate_order_warehouse_fulfillment`;

CREATE TEMPORARY TABLE `_guard_duplicate_order_sku_items` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_duplicate_order_sku_items` (`ok`)
SELECT 0 FROM `order_items`
GROUP BY `order_id`, `sku_id` HAVING COUNT(*) > 1 LIMIT 1;
DROP TEMPORARY TABLE `_guard_duplicate_order_sku_items`;

CREATE TEMPORARY TABLE `_guard_consumed_reservation_orphan` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_consumed_reservation_orphan` (`ok`)
SELECT 0
FROM `inventory_reservations` AS `ir`
JOIN `fulfillments` AS `f` ON `f`.`order_id` = `ir`.`order_id`
LEFT JOIN `inventories` AS `i` ON `i`.`id` = `ir`.`inventory_id`
LEFT JOIN `order_items` AS `oi`
  ON `oi`.`order_id` = `ir`.`order_id` AND `oi`.`sku_id` = `ir`.`sku_id`
WHERE `ir`.`released_at` IS NULL AND `ir`.`consumed_at` IS NOT NULL
  AND (`i`.`id` IS NULL OR `oi`.`id` IS NULL)
LIMIT 1;
DROP TEMPORARY TABLE `_guard_consumed_reservation_orphan`;

CREATE TEMPORARY TABLE `_guard_fulfillment_without_reservation` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_fulfillment_without_reservation` (`ok`)
SELECT 0
FROM `fulfillments` AS `f`
LEFT JOIN `inventory_reservations` AS `ir`
  ON `ir`.`order_id` = `f`.`order_id`
  AND `ir`.`released_at` IS NULL
  AND `ir`.`consumed_at` IS NOT NULL
LEFT JOIN `inventories` AS `i` ON `i`.`id` = `ir`.`inventory_id`
LEFT JOIN `order_items` AS `oi`
  ON `oi`.`order_id` = `ir`.`order_id` AND `oi`.`sku_id` = `ir`.`sku_id`
WHERE `ir`.`id` IS NULL OR `i`.`id` IS NULL OR `oi`.`id` IS NULL
LIMIT 1;
DROP TEMPORARY TABLE `_guard_fulfillment_without_reservation`;

CREATE TEMPORARY TABLE `_guard_after_sales_order_item_orphan` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_after_sales_order_item_orphan` (`ok`)
SELECT 0 FROM `after_sales_cases` AS `a`
LEFT JOIN `order_items` AS `oi` ON `oi`.`id` = `a`.`order_item_id`
WHERE `a`.`order_item_id` IS NOT NULL AND (`oi`.`id` IS NULL OR `oi`.`order_id` <> `a`.`order_id`)
LIMIT 1;
DROP TEMPORARY TABLE `_guard_after_sales_order_item_orphan`;

CREATE TEMPORARY TABLE `_guard_refund_after_sales_orphan` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_refund_after_sales_orphan` (`ok`)
SELECT 0 FROM `refunds` AS `r`
LEFT JOIN `after_sales_cases` AS `a` ON `a`.`id` = `r`.`after_sales_case_id`
WHERE `r`.`after_sales_case_id` IS NOT NULL AND (`a`.`id` IS NULL OR `a`.`order_id` <> `r`.`order_id`)
LIMIT 1;
DROP TEMPORARY TABLE `_guard_refund_after_sales_orphan`;

CREATE TEMPORARY TABLE `_guard_duplicate_plan_quotation` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_duplicate_plan_quotation` (`ok`)
SELECT 0 FROM `payment_plans` WHERE `quotation_version_id` IS NOT NULL
GROUP BY `quotation_version_id` HAVING COUNT(*) > 1 LIMIT 1;
DROP TEMPORARY TABLE `_guard_duplicate_plan_quotation`;

CREATE TEMPORARY TABLE `_guard_duplicate_plan_order` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_duplicate_plan_order` (`ok`)
SELECT 0 FROM `payment_plans` WHERE `order_id` IS NOT NULL
GROUP BY `order_id` HAVING COUNT(*) > 1 LIMIT 1;
DROP TEMPORARY TABLE `_guard_duplicate_plan_order`;

CREATE TEMPORARY TABLE `_guard_duplicate_installment_payment` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_duplicate_installment_payment` (`ok`)
SELECT 0 FROM `payment_plan_installments` WHERE `payment_id` IS NOT NULL
GROUP BY `payment_id` HAVING COUNT(*) > 1 LIMIT 1;
DROP TEMPORARY TABLE `_guard_duplicate_installment_payment`;

CREATE TEMPORARY TABLE `_guard_invalid_payment_plan_source` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_payment_plan_source` (`ok`)
SELECT 0 FROM `payment_plans`
WHERE `quotation_version_id` IS NULL AND `order_id` IS NULL LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_payment_plan_source`;

CREATE TEMPORARY TABLE `_guard_invalid_fulfillment_quantity` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_fulfillment_quantity` (`ok`)
SELECT 0 FROM `inventory_reservations` AS `ir`
JOIN `fulfillments` AS `f` ON `f`.`order_id` = `ir`.`order_id`
WHERE `ir`.`released_at` IS NULL AND `ir`.`consumed_at` IS NOT NULL
  AND `ir`.`quantity` <= 0
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_fulfillment_quantity`;

CREATE TEMPORARY TABLE `_guard_invalid_payment_plan_amount` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_payment_plan_amount` (`ok`)
SELECT 0 FROM `payment_plans` WHERE `total_amount` <= 0 LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_payment_plan_amount`;

CREATE TEMPORARY TABLE `_guard_invalid_installment_amount_or_sequence` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_installment_amount_or_sequence` (`ok`)
SELECT 0 FROM `payment_plan_installments`
WHERE `amount` <= 0 OR `sequence` <= 0 LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_installment_amount_or_sequence`;

CREATE TEMPORARY TABLE `_guard_installment_payment_orphan` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_installment_payment_orphan` (`ok`)
SELECT 0
FROM `payment_plan_installments` AS `installment`
LEFT JOIN `payments` AS `payment` ON `payment`.`id` = `installment`.`payment_id`
WHERE `installment`.`payment_id` IS NOT NULL AND `payment`.`id` IS NULL
LIMIT 1;
DROP TEMPORARY TABLE `_guard_installment_payment_orphan`;

CREATE UNIQUE INDEX `payments_gateway_trade_no_key` ON `payments`(`gateway_trade_no`);
CREATE UNIQUE INDEX `refunds_gateway_refund_no_key` ON `refunds`(`gateway_refund_no`);
CREATE UNIQUE INDEX `order_items_order_id_sku_id_key` ON `order_items`(`order_id`, `sku_id`);

-- 2. 仓库默认标识由唯一 default_key 提供数据库级互斥；现有多仓不会被迁移擅自指定默认仓。
ALTER TABLE `warehouses`
  ADD COLUMN `is_default` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `default_key` VARCHAR(20) NULL;

UPDATE `warehouses`
SET `is_default` = true, `default_key` = 'PRIMARY'
WHERE `id` = (
  SELECT `single_active`.`id`
  FROM (
    SELECT MIN(`id`) AS `id`
    FROM `warehouses`
    WHERE `is_active` = true
    HAVING COUNT(*) = 1
  ) AS `single_active`
);

CREATE UNIQUE INDEX `warehouses_default_key_key` ON `warehouses`(`default_key`);
ALTER TABLE `warehouses`
  ADD CONSTRAINT `warehouses_default_key_check`
  CHECK ((`is_default` = true AND `default_key` = 'PRIMARY') OR (`is_default` = false AND `default_key` IS NULL));

-- 3. 订单保存初次成交费用和地址快照。旧记录仅按现有可信字段做可审计的 legacy 包装。
ALTER TABLE `orders`
  ADD COLUMN `shipping_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `insurance_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `tax_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
  ADD COLUMN `shipping_address_snapshot` JSON NULL,
  ADD COLUMN `pricing_snapshot` JSON NULL,
  ADD COLUMN `quotation_version_id` INTEGER NULL;

UPDATE `orders`
SET
  `shipping_address_snapshot` = JSON_OBJECT(
    'version', 1,
    'legacy', true,
    'recipientName', `customer_name`,
    'recipientPhone', `customer_phone`,
    'detail', `address`
  ),
  `pricing_snapshot` = JSON_OBJECT(
    'version', 1,
    'legacy', true,
    'currency', 'CNY',
    'itemSubtotalCents', CAST(ROUND(`total_amount` * 100) AS SIGNED),
    'discountCents', CAST(ROUND(`discount_amount` * 100) AS SIGNED),
    'shippingCents', 0,
    'insuranceCents', 0,
    'taxCents', 0,
    'adjustmentCents', CAST(ROUND(`adjustment_amount` * 100) AS SIGNED),
    'finalCents', CAST(ROUND(`final_amount` * 100) AS SIGNED)
  );

ALTER TABLE `orders`
  MODIFY `shipping_address_snapshot` JSON NOT NULL,
  MODIFY `pricing_snapshot` JSON NOT NULL;

ALTER TABLE `orders`
  ADD CONSTRAINT `orders_amount_formula_check`
    CHECK (`final_amount` = `total_amount` - `discount_amount` + `adjustment_amount`
      + `shipping_amount` + `insurance_amount` + `tax_amount`),
  ADD UNIQUE INDEX `orders_quotation_version_id_key`(`quotation_version_id`);

-- 4. 每张履约单必须绑定来源仓；存量记录只有能从预占唯一推导时才回填。
ALTER TABLE `fulfillments` ADD COLUMN `warehouse_id` INTEGER NULL;

UPDATE `fulfillments` AS `f`
JOIN (
  SELECT `ir`.`order_id`, MIN(`i`.`warehouse_id`) AS `warehouse_id`
  FROM `inventory_reservations` AS `ir`
  JOIN `inventories` AS `i` ON `i`.`id` = `ir`.`inventory_id`
  WHERE `ir`.`released_at` IS NULL AND `ir`.`consumed_at` IS NOT NULL
  GROUP BY `ir`.`order_id`
  HAVING COUNT(DISTINCT `i`.`warehouse_id`) = 1
) AS `source` ON `source`.`order_id` = `f`.`order_id`
SET `f`.`warehouse_id` = `source`.`warehouse_id`;

ALTER TABLE `fulfillments`
  MODIFY `warehouse_id` INTEGER NOT NULL,
  ADD UNIQUE INDEX `fulfillments_order_id_warehouse_id_key`(`order_id`, `warehouse_id`),
  ADD CONSTRAINT `fulfillments_warehouse_id_fkey`
    FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `fulfillment_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `fulfillment_id` INTEGER NOT NULL,
  `order_item_id` INTEGER NOT NULL,
  `inventory_reservation_id` INTEGER NOT NULL,
  `quantity` INTEGER NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `fulfillment_items_inventory_reservation_id_key`(`inventory_reservation_id`),
  INDEX `fulfillment_items_fulfillment_id_idx`(`fulfillment_id`),
  INDEX `fulfillment_items_order_item_id_idx`(`order_item_id`),
  CONSTRAINT `fulfillment_items_quantity_check` CHECK (`quantity` > 0),
  CONSTRAINT `fulfillment_items_fulfillment_id_fkey`
    FOREIGN KEY (`fulfillment_id`) REFERENCES `fulfillments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fulfillment_items_order_item_id_fkey`
    FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fulfillment_items_inventory_reservation_id_fkey`
    FOREIGN KEY (`inventory_reservation_id`) REFERENCES `inventory_reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO `fulfillment_items` (`fulfillment_id`, `order_item_id`, `inventory_reservation_id`, `quantity`)
SELECT `f`.`id`, `oi`.`id`, `ir`.`id`, `ir`.`quantity`
FROM `inventory_reservations` AS `ir`
JOIN `inventories` AS `i` ON `i`.`id` = `ir`.`inventory_id`
JOIN `fulfillments` AS `f`
  ON `f`.`order_id` = `ir`.`order_id` AND `f`.`warehouse_id` = `i`.`warehouse_id`
JOIN `order_items` AS `oi`
  ON `oi`.`order_id` = `ir`.`order_id` AND `oi`.`sku_id` = `ir`.`sku_id`
WHERE `ir`.`released_at` IS NULL AND `ir`.`consumed_at` IS NOT NULL;

-- 5. 售后与退款建立真实外键；孤儿引用已在首个 DDL 前阻断。
ALTER TABLE `after_sales_cases`
  ADD CONSTRAINT `after_sales_cases_order_item_id_fkey`
    FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `refunds`
  ADD CONSTRAINT `refunds_after_sales_case_id_fkey`
    FOREIGN KEY (`after_sales_case_id`) REFERENCES `after_sales_cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. 合作申请、设计确认、报价版本、转单与付款计划的精确关系。
ALTER TABLE `quotations`
  ADD COLUMN `channel` ENUM('RETAIL', 'CUSTOM', 'PARTNER_WAX') NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN `current_version` INTEGER NOT NULL DEFAULT 0;

UPDATE `quotations` AS `q`
LEFT JOIN (
  SELECT `quotation_id`, MAX(`version`) AS `current_version`
  FROM `quotation_versions`
  GROUP BY `quotation_id`
) AS `latest` ON `latest`.`quotation_id` = `q`.`id`
SET `q`.`current_version` = COALESCE(`latest`.`current_version`, 0);

ALTER TABLE `partner_applications`
  ADD COLUMN `agreement_version` VARCHAR(50) NULL,
  ADD COLUMN `agreement_hash` CHAR(64) NULL,
  ADD COLUMN `qualification_snapshot` JSON NULL;

ALTER TABLE `cooperation_design_file_versions`
  ADD COLUMN `confirmed_by_customer_id` INTEGER NULL,
  ADD CONSTRAINT `cooperation_design_file_versions_confirmed_by_customer_id_fkey`
    FOREIGN KEY (`confirmed_by_customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `quotation_versions`
  ADD COLUMN `customer_snapshot` JSON NULL,
  ADD COLUMN `partner_price_agreement_id` INTEGER NULL,
  ADD INDEX `quotation_versions_partner_price_agreement_id_idx`(`partner_price_agreement_id`),
  ADD CONSTRAINT `quotation_versions_partner_price_agreement_id_fkey`
    FOREIGN KEY (`partner_price_agreement_id`) REFERENCES `partner_price_agreements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `orders`
  ADD CONSTRAINT `orders_quotation_version_id_fkey`
    FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `payment_plans`
  ADD UNIQUE INDEX `payment_plans_quotation_version_id_key`(`quotation_version_id`),
  ADD UNIQUE INDEX `payment_plans_order_id_key`(`order_id`),
  ADD CONSTRAINT `payment_plans_source_check`
    CHECK (`quotation_version_id` IS NOT NULL OR `order_id` IS NOT NULL),
  ADD CONSTRAINT `payment_plans_total_amount_check` CHECK (`total_amount` > 0);

ALTER TABLE `payment_plan_installments`
  ADD UNIQUE INDEX `payment_plan_installments_payment_id_key`(`payment_id`),
  ADD CONSTRAINT `payment_plan_installments_payment_id_fkey`
    FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `payment_plan_installments_amount_check` CHECK (`amount` > 0),
  ADD CONSTRAINT `payment_plan_installments_sequence_check` CHECK (`sequence` > 0);

