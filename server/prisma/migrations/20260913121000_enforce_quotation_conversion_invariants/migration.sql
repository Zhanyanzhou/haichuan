-- 三通道报价与客户确认转单的数据库不变量。
-- MySQL DDL 会隐式提交；因此所有存量/阶段性数据检查均在首个持久 DDL 前完成，
-- 发现不一致时失败关闭，不删除、不修复、不回填任何交易事实。

-- 只接受第 54 份已完整完成、且本 migration 尚未部分应用的数据库。
-- 这里仅识别并失败关闭；失败 migration 的恢复仍需人工核对后使用 Prisma 官方流程处理。
CREATE TEMPORARY TABLE `_guard_m55_clean_baseline` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_m55_clean_baseline` (`ok`)
SELECT 0
WHERE (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND CONCAT(`TABLE_NAME`, '.', `COLUMN_NAME`) IN (
      'quotations.lead_id',
      'partner_price_agreements.previous_agreement_id',
      'quotation_versions.snapshot_schema_version',
      'quotation_versions.business_snapshot',
      'orders.quote_channel',
      'orders.customer_account_type_snapshot',
      'orders.fee_amount',
      'orders.confirmed_by_customer_id',
      'orders.confirmed_at',
      'orders.snapshot_schema_version',
      'orders.transaction_snapshot',
      'orders.transaction_snapshot_hash'
    )
) <> 12
OR (
  SELECT COUNT(*)
  FROM `information_schema`.`TABLES`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` IN (
      'quotation_fee_rules',
      'quotation_version_fee_lines',
      'trade_resource_buckets',
      'quotation_version_resource_requirements',
      'quoted_order_lines',
      'quotation_conversions',
      'order_resource_reservations'
    )
) <> 7
OR EXISTS (
  SELECT 1
  FROM `information_schema`.`REFERENTIAL_CONSTRAINTS`
  WHERE `CONSTRAINT_SCHEMA` = DATABASE()
    AND `CONSTRAINT_NAME` IN (
      'm54_guard_partner_price_customer_fkey',
      'm54_guard_design_file_parent_fkey',
      'm54_guard_design_file_confirmer_fkey',
      'm54_guard_quote_version_parent_fkey',
      'm54_guard_quote_version_acceptor_fkey',
      'm54_guard_quote_item_parent_fkey',
      'm54_guard_order_quote_version_fkey'
    )
)
OR (
  SELECT COUNT(*)
  FROM `information_schema`.`REFERENTIAL_CONSTRAINTS`
  WHERE `CONSTRAINT_SCHEMA` = DATABASE()
    -- MySQL 中 NO ACTION 与 RESTRICT 均为立即拒绝父行变更的严格语义。
    AND `DELETE_RULE` IN ('RESTRICT', 'NO ACTION')
    AND `UPDATE_RULE` IN ('RESTRICT', 'NO ACTION')
    AND `CONSTRAINT_NAME` IN (
      'partner_price_agreements_customer_id_fkey',
      'cooperation_design_file_versions_design_file_id_fkey',
      'cooperation_design_file_versions_confirmed_by_customer_id_fkey',
      'quotation_versions_quotation_id_fkey',
      'quotation_versions_accepted_by_customer_id_fkey',
      'quotation_version_items_quotation_version_id_fkey',
      'orders_quotation_version_id_fkey'
    )
) <> 7
OR (
  SELECT COUNT(*)
  FROM `information_schema`.`TABLE_CONSTRAINTS`
  WHERE `CONSTRAINT_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'orders'
    AND `CONSTRAINT_TYPE` = 'CHECK'
    AND `CONSTRAINT_NAME` = 'orders_amount_formula_check'
) <> 1
OR EXISTS (
  SELECT 1
  FROM `information_schema`.`TABLE_CONSTRAINTS`
  WHERE `CONSTRAINT_SCHEMA` = DATABASE()
    AND `CONSTRAINT_TYPE` = 'CHECK'
    AND `CONSTRAINT_NAME` IN (
      'm55_guard_orders_amount_formula_check',
      'partner_price_agreements_values_check',
      'partner_price_agreements_window_check',
      'design_file_versions_positive_weights_check',
      'quotation_versions_amount_formula_check',
      'quotation_versions_snapshot_check',
      'quotation_version_items_amount_check',
      'quotation_fee_rules_values_check',
      'quotation_fee_rules_window_check',
      'quotation_version_fee_lines_calculation_check',
      'trade_resource_buckets_values_check',
      'trade_resource_buckets_window_check',
      'qv_resource_requirements_quantity_check',
      'quoted_order_lines_amount_check',
      'quotation_conversions_hashes_check',
      'order_resource_reservations_state_check'
    )
)
OR EXISTS (
  SELECT 1
  FROM `information_schema`.`TRIGGERS`
  WHERE `TRIGGER_SCHEMA` = DATABASE()
    AND `EVENT_OBJECT_TABLE` = 'partner_price_agreements'
    AND `TRIGGER_NAME` IN (
      'partner_price_agreements_no_self_previous_insert',
      'partner_price_agreements_no_self_previous_update'
    )
)
OR EXISTS (
  SELECT 1
  FROM `information_schema`.`TRIGGERS`
  WHERE `TRIGGER_SCHEMA` = DATABASE()
    AND `TRIGGER_NAME` IN (
      'cooperation_design_file_versions_confirmation_insert',
      'cooperation_design_file_versions_confirmation_update',
      'quotation_versions_acceptance_insert',
      'quotation_versions_acceptance_update',
      'orders_quote_invariants_insert',
      'orders_quote_invariants_update'
    )
)
LIMIT 1;
DROP TEMPORARY TABLE `_guard_m55_clean_baseline`;

CREATE TEMPORARY TABLE `_guard_invalid_partner_price_agreement` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_partner_price_agreement` (`ok`)
SELECT 0 FROM `partner_price_agreements`
WHERE `version` <= 0
   OR `red_wax_rate` <= 0
   OR `purple_wax_rate` <= 0
   OR (`effective_until` IS NOT NULL AND `effective_until` <= `effective_from`)
   OR `previous_agreement_id` = `id`
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_partner_price_agreement`;

-- 同一客户的价格协议使用半开区间 [effective_from, effective_until)：
-- 首尾相接不算重叠，effective_until=NULL 表示向未来持续生效。
CREATE TEMPORARY TABLE `_guard_overlapping_partner_price_agreement` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_overlapping_partner_price_agreement` (`ok`)
SELECT 0
FROM `partner_price_agreements` AS `earlier`
JOIN `partner_price_agreements` AS `later`
  ON `later`.`customer_id` = `earlier`.`customer_id`
  AND `later`.`id` > `earlier`.`id`
  AND (`later`.`effective_until` IS NULL OR `earlier`.`effective_from` < `later`.`effective_until`)
  AND (`earlier`.`effective_until` IS NULL OR `later`.`effective_from` < `earlier`.`effective_until`)
LIMIT 1;
DROP TEMPORARY TABLE `_guard_overlapping_partner_price_agreement`;

CREATE TEMPORARY TABLE `_guard_invalid_design_file_weight` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_design_file_weight` (`ok`)
SELECT 0 FROM `cooperation_design_file_versions`
WHERE (`target_gold_weight` IS NOT NULL AND `target_gold_weight` <= 0)
   OR (`red_wax_weight` IS NOT NULL AND `red_wax_weight` <= 0)
   OR (`purple_wax_weight` IS NOT NULL AND `purple_wax_weight` <= 0)
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_design_file_weight`;

CREATE TEMPORARY TABLE `_guard_invalid_design_file_confirmation` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_design_file_confirmation` (`ok`)
SELECT 0 FROM `cooperation_design_file_versions`
WHERE `status` = 'CONFIRMED'
  AND (`confirmed_at` IS NULL
    OR `confirmed_by_customer_id` IS NULL
    OR COALESCE(`red_wax_weight`, `purple_wax_weight`) IS NULL)
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_design_file_confirmation`;

CREATE TEMPORARY TABLE `_guard_invalid_quotation_version_amount` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_quotation_version_amount` (`ok`)
SELECT 0 FROM `quotation_versions`
WHERE `subtotal_amount` < 0
   OR `discount_amount` < 0
   OR `fee_amount` < 0
   OR `total_amount` < 0
   OR `total_amount` <> `subtotal_amount` - `discount_amount` + `fee_amount`
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_quotation_version_amount`;

CREATE TEMPORARY TABLE `_guard_invalid_quotation_version_snapshot` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_quotation_version_snapshot` (`ok`)
SELECT 0 FROM `quotation_versions`
WHERE `snapshot_schema_version` < 1
   OR (`snapshot_schema_version` >= 2 AND (`customer_snapshot` IS NULL OR `business_snapshot` IS NULL))
   OR (`snapshot_schema_version` >= 2 AND CHAR_LENGTH(TRIM(`content_hash`)) <> 64)
   OR (`snapshot_schema_version` >= 2 AND `status` IN ('ISSUED', 'ACCEPTED') AND `issued_at` IS NULL)
   OR (`status` = 'ACCEPTED' AND (`accepted_by_customer_id` IS NULL OR `accepted_at` IS NULL))
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_quotation_version_snapshot`;

CREATE TEMPORARY TABLE `_guard_invalid_quotation_version_item` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_quotation_version_item` (`ok`)
SELECT 0 FROM `quotation_version_items`
WHERE `quantity` <= 0
   OR `unit_price` < 0
   OR `subtotal` < 0
   OR `subtotal` <> ROUND(`unit_price` * `quantity`, 2)
   OR TRIM(`description`) = ''
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_quotation_version_item`;

CREATE TEMPORARY TABLE `_guard_invalid_order_amount_formula` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_order_amount_formula` (`ok`)
SELECT 0 FROM `orders`
WHERE `fee_amount` < 0
   OR `final_amount` <> `total_amount` - `discount_amount` + `adjustment_amount`
     + `shipping_amount` + `insurance_amount` + `tax_amount` + `fee_amount`
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_order_amount_formula`;

CREATE TEMPORARY TABLE `_guard_invalid_order_quote_snapshot` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_order_quote_snapshot` (`ok`)
SELECT 0 FROM `orders`
WHERE (`confirmed_by_customer_id` IS NULL AND `confirmed_at` IS NOT NULL)
   OR (`confirmed_by_customer_id` IS NOT NULL AND `confirmed_at` IS NULL)
   OR (`snapshot_schema_version` IS NOT NULL AND `snapshot_schema_version` < 1)
   OR (`snapshot_schema_version` >= 2 AND (
        `quotation_version_id` IS NULL
        OR `quote_channel` IS NULL
        OR `customer_account_type_snapshot` IS NULL
        OR `confirmed_by_customer_id` IS NULL
        OR `confirmed_at` IS NULL
        OR `transaction_snapshot` IS NULL
        OR `transaction_snapshot_hash` IS NULL
        OR CHAR_LENGTH(TRIM(`transaction_snapshot_hash`)) <> 64
      ))
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_order_quote_snapshot`;

CREATE TEMPORARY TABLE `_guard_invalid_quotation_fee_rule` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_quotation_fee_rule` (`ok`)
SELECT 0 FROM `quotation_fee_rules`
WHERE `version` <= 0
   OR `unit_amount` < 0
   OR TRIM(`code`) = ''
   OR TRIM(`display_text`) = ''
   OR (`effective_until` IS NOT NULL AND `effective_until` <= `effective_from`)
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_quotation_fee_rule`;

CREATE TEMPORARY TABLE `_guard_invalid_quotation_fee_line` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_quotation_fee_line` (`ok`)
SELECT 0 FROM `quotation_version_fee_lines`
WHERE `rate` < 0
   OR `amount` < 0
   OR TRIM(`code`) = ''
   OR TRIM(`display_text`) = ''
   OR (`calculation_method` = 'PER_GRAM'
       AND (`basis_quantity` IS NULL OR `basis_quantity` <= 0
         OR `amount` <> ROUND(`rate` * `basis_quantity`, 2)))
   OR (`calculation_method` IN ('FIXED', 'PER_ORDER')
       AND (`basis_quantity` IS NOT NULL OR `amount` <> `rate`))
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_quotation_fee_line`;

CREATE TEMPORARY TABLE `_guard_invalid_trade_resource_bucket` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_trade_resource_bucket` (`ok`)
SELECT 0 FROM `trade_resource_buckets`
WHERE `channel` NOT IN ('CUSTOM', 'PARTNER_WAX')
   OR `available_quantity` < 0
   OR `reserved_quantity` < 0
   OR `reserved_quantity` > `available_quantity`
   OR `version` <= 0
   OR TRIM(`code`) = ''
   OR TRIM(`bucket_key`) = ''
   OR TRIM(`display_name`) = ''
   OR TRIM(`unit`) = ''
   OR (`bucket_end` IS NOT NULL AND (`bucket_start` IS NULL OR `bucket_end` <= `bucket_start`))
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_trade_resource_bucket`;

CREATE TEMPORARY TABLE `_guard_invalid_quote_resource_requirement` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_quote_resource_requirement` (`ok`)
SELECT 0 FROM `quotation_version_resource_requirements`
WHERE `required_quantity` <= 0
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_quote_resource_requirement`;

CREATE TEMPORARY TABLE `_guard_invalid_quoted_order_line` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_quoted_order_line` (`ok`)
SELECT 0 FROM `quoted_order_lines`
WHERE `quantity` <= 0
   OR `unit_amount` < 0
   OR `line_amount` < 0
   OR `line_amount` <> ROUND(`unit_amount` * `quantity`, 2)
   OR TRIM(`description`) = ''
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_quoted_order_line`;

CREATE TEMPORARY TABLE `_guard_invalid_quotation_conversion_hash` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_quotation_conversion_hash` (`ok`)
SELECT 0 FROM `quotation_conversions`
WHERE CHAR_LENGTH(TRIM(`idempotency_key_hash`)) <> 64
   OR CHAR_LENGTH(TRIM(`request_hash`)) <> 64
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_quotation_conversion_hash`;

CREATE TEMPORARY TABLE `_guard_invalid_order_resource_reservation` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_invalid_order_resource_reservation` (`ok`)
SELECT 0 FROM `order_resource_reservations`
WHERE `quantity` <= 0
   OR (`status` = 'RESERVED' AND (`consumed_at` IS NOT NULL OR `released_at` IS NOT NULL))
   OR (`status` = 'CONSUMED' AND (`consumed_at` IS NULL OR `released_at` IS NOT NULL))
   OR (`status` = 'RELEASED' AND (`released_at` IS NULL OR `consumed_at` IS NOT NULL))
LIMIT 1;
DROP TEMPORARY TABLE `_guard_invalid_order_resource_reservation`;

-- MySQL 8 禁止 CHECK 引用 AUTO_INCREMENT 列。插入时必须在 id 已生成后比较，
-- 更新时则在写入前拒绝自引用；InnoDB 会在触发器 SIGNAL 时回滚整条语句。
CREATE TRIGGER `partner_price_agreements_no_self_previous_insert`
AFTER INSERT ON `partner_price_agreements`
FOR EACH ROW
BEGIN
  IF NEW.`previous_agreement_id` IS NOT NULL
     AND NEW.`previous_agreement_id` = NEW.`id` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'previous_agreement_id must differ from id';
  END IF;
END;

CREATE TRIGGER `partner_price_agreements_no_self_previous_update`
BEFORE UPDATE ON `partner_price_agreements`
FOR EACH ROW
BEGIN
  IF NEW.`previous_agreement_id` IS NOT NULL
     AND NEW.`previous_agreement_id` = NEW.`id` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'previous_agreement_id must differ from id';
  END IF;
END;

-- 下列不变量涉及带 ON DELETE/ON UPDATE 行为的外键列；MySQL 8 同样禁止
-- 这些列出现在 CHECK 中，因此用行级触发器保持与原约束完全相同的拒绝语义。
CREATE TRIGGER `cooperation_design_file_versions_confirmation_insert`
BEFORE INSERT ON `cooperation_design_file_versions`
FOR EACH ROW
BEGIN
  IF NEW.`status` = 'CONFIRMED'
     AND (NEW.`confirmed_at` IS NULL
       OR NEW.`confirmed_by_customer_id` IS NULL
       OR COALESCE(NEW.`red_wax_weight`, NEW.`purple_wax_weight`) IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'confirmed design file version requires confirmation facts';
  END IF;
END;

CREATE TRIGGER `cooperation_design_file_versions_confirmation_update`
BEFORE UPDATE ON `cooperation_design_file_versions`
FOR EACH ROW
BEGIN
  IF NEW.`status` = 'CONFIRMED'
     AND (NEW.`confirmed_at` IS NULL
       OR NEW.`confirmed_by_customer_id` IS NULL
       OR COALESCE(NEW.`red_wax_weight`, NEW.`purple_wax_weight`) IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'confirmed design file version requires confirmation facts';
  END IF;
END;

CREATE TRIGGER `quotation_versions_acceptance_insert`
BEFORE INSERT ON `quotation_versions`
FOR EACH ROW
BEGIN
  IF NEW.`status` = 'ACCEPTED'
     AND (NEW.`accepted_by_customer_id` IS NULL OR NEW.`accepted_at` IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'accepted quotation version requires acceptance facts';
  END IF;
END;

CREATE TRIGGER `quotation_versions_acceptance_update`
BEFORE UPDATE ON `quotation_versions`
FOR EACH ROW
BEGIN
  IF NEW.`status` = 'ACCEPTED'
     AND (NEW.`accepted_by_customer_id` IS NULL OR NEW.`accepted_at` IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'accepted quotation version requires acceptance facts';
  END IF;
END;

CREATE TRIGGER `orders_quote_invariants_insert`
BEFORE INSERT ON `orders`
FOR EACH ROW
BEGIN
  IF (NEW.`confirmed_by_customer_id` IS NULL AND NEW.`confirmed_at` IS NOT NULL)
     OR (NEW.`confirmed_by_customer_id` IS NOT NULL AND NEW.`confirmed_at` IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'order customer confirmation facts must be paired';
  END IF;

  IF NEW.`snapshot_schema_version` IS NOT NULL
     AND (NEW.`snapshot_schema_version` < 1
       OR (NEW.`snapshot_schema_version` >= 2
         AND (NEW.`quotation_version_id` IS NULL
           OR NEW.`quote_channel` IS NULL
           OR NEW.`customer_account_type_snapshot` IS NULL
           OR NEW.`confirmed_by_customer_id` IS NULL
           OR NEW.`confirmed_at` IS NULL
           OR NEW.`transaction_snapshot` IS NULL
           OR NEW.`transaction_snapshot_hash` IS NULL
           OR CHAR_LENGTH(TRIM(NEW.`transaction_snapshot_hash`)) <> 64))) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'order quotation snapshot is incomplete';
  END IF;
END;

CREATE TRIGGER `orders_quote_invariants_update`
BEFORE UPDATE ON `orders`
FOR EACH ROW
BEGIN
  IF (NEW.`confirmed_by_customer_id` IS NULL AND NEW.`confirmed_at` IS NOT NULL)
     OR (NEW.`confirmed_by_customer_id` IS NOT NULL AND NEW.`confirmed_at` IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'order customer confirmation facts must be paired';
  END IF;

  IF NEW.`snapshot_schema_version` IS NOT NULL
     AND (NEW.`snapshot_schema_version` < 1
       OR (NEW.`snapshot_schema_version` >= 2
         AND (NEW.`quotation_version_id` IS NULL
           OR NEW.`quote_channel` IS NULL
           OR NEW.`customer_account_type_snapshot` IS NULL
           OR NEW.`confirmed_by_customer_id` IS NULL
           OR NEW.`confirmed_at` IS NULL
           OR NEW.`transaction_snapshot` IS NULL
           OR NEW.`transaction_snapshot_hash` IS NULL
           OR CHAR_LENGTH(TRIM(NEW.`transaction_snapshot_hash`)) <> 64))) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'order quotation snapshot is incomplete';
  END IF;
END;

ALTER TABLE `partner_price_agreements`
  ADD CONSTRAINT `partner_price_agreements_values_check`
    CHECK (`version` > 0 AND `red_wax_rate` > 0 AND `purple_wax_rate` > 0),
  ADD CONSTRAINT `partner_price_agreements_window_check`
    CHECK (`effective_until` IS NULL OR `effective_until` > `effective_from`);

ALTER TABLE `cooperation_design_file_versions`
  ADD CONSTRAINT `design_file_versions_positive_weights_check`
    CHECK ((`target_gold_weight` IS NULL OR `target_gold_weight` > 0)
      AND (`red_wax_weight` IS NULL OR `red_wax_weight` > 0)
      AND (`purple_wax_weight` IS NULL OR `purple_wax_weight` > 0));

ALTER TABLE `quotation_versions`
  ADD CONSTRAINT `quotation_versions_amount_formula_check`
    CHECK (`subtotal_amount` >= 0
      AND `discount_amount` >= 0
      AND `fee_amount` >= 0
      AND `total_amount` >= 0
      AND `total_amount` = `subtotal_amount` - `discount_amount` + `fee_amount`),
  ADD CONSTRAINT `quotation_versions_snapshot_check`
    CHECK (`snapshot_schema_version` >= 1
      AND (`snapshot_schema_version` < 2
        OR (`customer_snapshot` IS NOT NULL
          AND `business_snapshot` IS NOT NULL
          AND CHAR_LENGTH(TRIM(`content_hash`)) = 64))
      AND (`snapshot_schema_version` < 2
        OR `status` NOT IN ('ISSUED', 'ACCEPTED')
        OR `issued_at` IS NOT NULL));

ALTER TABLE `quotation_version_items`
  ADD CONSTRAINT `quotation_version_items_amount_check`
    CHECK (`quantity` > 0
      AND `unit_price` >= 0
      AND `subtotal` >= 0
      AND `subtotal` = ROUND(`unit_price` * `quantity`, 2)
      AND TRIM(`description`) <> '');

-- 与第 54 份外键替换采用相同的无保护窗口规避策略：先增加不同名称的
-- v2 公式保护，再单独替换历史名称，最后移除临时保护约束。
ALTER TABLE `orders`
  ADD CONSTRAINT `m55_guard_orders_amount_formula_check`
    CHECK (`fee_amount` >= 0
      AND `final_amount` = `total_amount` - `discount_amount` + `adjustment_amount`
        + `shipping_amount` + `insurance_amount` + `tax_amount` + `fee_amount`);

ALTER TABLE `orders`
  DROP CHECK `orders_amount_formula_check`;

ALTER TABLE `orders`
  ADD CONSTRAINT `orders_amount_formula_check`
    CHECK (`fee_amount` >= 0
      AND `final_amount` = `total_amount` - `discount_amount` + `adjustment_amount`
        + `shipping_amount` + `insurance_amount` + `tax_amount` + `fee_amount`);

ALTER TABLE `orders`
  DROP CHECK `m55_guard_orders_amount_formula_check`;

ALTER TABLE `quotation_fee_rules`
  ADD CONSTRAINT `quotation_fee_rules_values_check`
    CHECK (`version` > 0 AND `unit_amount` >= 0
      AND TRIM(`code`) <> '' AND TRIM(`display_text`) <> ''),
  ADD CONSTRAINT `quotation_fee_rules_window_check`
    CHECK (`effective_until` IS NULL OR `effective_until` > `effective_from`);

ALTER TABLE `quotation_version_fee_lines`
  ADD CONSTRAINT `quotation_version_fee_lines_calculation_check`
    CHECK (`rate` >= 0 AND `amount` >= 0
      AND TRIM(`code`) <> '' AND TRIM(`display_text`) <> ''
      AND ((`calculation_method` = 'PER_GRAM'
          AND `basis_quantity` IS NOT NULL
          AND `basis_quantity` > 0
          AND `amount` = ROUND(`rate` * `basis_quantity`, 2))
        OR (`calculation_method` IN ('FIXED', 'PER_ORDER')
          AND `basis_quantity` IS NULL
          AND `amount` = `rate`)));

ALTER TABLE `trade_resource_buckets`
  ADD CONSTRAINT `trade_resource_buckets_values_check`
    CHECK (`channel` IN ('CUSTOM', 'PARTNER_WAX')
      AND `available_quantity` >= 0
      AND `reserved_quantity` >= 0
      AND `reserved_quantity` <= `available_quantity`
      AND `version` > 0
      AND TRIM(`code`) <> ''
      AND TRIM(`bucket_key`) <> ''
      AND TRIM(`display_name`) <> ''
      AND TRIM(`unit`) <> ''),
  ADD CONSTRAINT `trade_resource_buckets_window_check`
    CHECK (`bucket_end` IS NULL OR (`bucket_start` IS NOT NULL AND `bucket_end` > `bucket_start`));

ALTER TABLE `quotation_version_resource_requirements`
  ADD CONSTRAINT `qv_resource_requirements_quantity_check`
    CHECK (`required_quantity` > 0);

ALTER TABLE `quoted_order_lines`
  ADD CONSTRAINT `quoted_order_lines_amount_check`
    CHECK (`quantity` > 0
      AND `unit_amount` >= 0
      AND `line_amount` >= 0
      AND `line_amount` = ROUND(`unit_amount` * `quantity`, 2)
      AND TRIM(`description`) <> '');

ALTER TABLE `quotation_conversions`
  ADD CONSTRAINT `quotation_conversions_hashes_check`
    CHECK (CHAR_LENGTH(TRIM(`idempotency_key_hash`)) = 64
      AND CHAR_LENGTH(TRIM(`request_hash`)) = 64);

ALTER TABLE `order_resource_reservations`
  ADD CONSTRAINT `order_resource_reservations_state_check`
    CHECK (`quantity` > 0
      AND ((`status` = 'RESERVED' AND `consumed_at` IS NULL AND `released_at` IS NULL)
        OR (`status` = 'CONSUMED' AND `consumed_at` IS NOT NULL AND `released_at` IS NULL)
        OR (`status` = 'RELEASED' AND `released_at` IS NOT NULL AND `consumed_at` IS NULL)));
