-- 三通道报价与客户确认转单合同的加法式扩展。
-- 本迁移增加可空字段、新表、索引与外键，并收紧不可变交易来源的既有外键；
-- 旧报价版本保持 snapshot_schema_version=1，旧订单的新交易快照字段保持 NULL，不做任何业务语义回填。

-- MySQL DDL 会隐式提交。先确认当前数据库仍是完整的 53 migration 基线：
-- 任何目标列/表已经存在都视为曾经部分应用，必须人工核对并用 prisma migrate resolve
-- 处理失败记录；本 migration 不猜测、补写或自动恢复部分应用状态。
CREATE TEMPORARY TABLE `_guard_m54_clean_baseline` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_m54_clean_baseline` (`ok`)
SELECT 0
WHERE EXISTS (
  SELECT 1
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
)
OR EXISTS (
  SELECT 1
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
)
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
    AND (
      (`CONSTRAINT_NAME` = 'partner_price_agreements_customer_id_fkey'
        AND `TABLE_NAME` = 'partner_price_agreements'
        AND `REFERENCED_TABLE_NAME` = 'customers')
      OR (`CONSTRAINT_NAME` = 'cooperation_design_file_versions_design_file_id_fkey'
        AND `TABLE_NAME` = 'cooperation_design_file_versions'
        AND `REFERENCED_TABLE_NAME` = 'cooperation_design_files')
      OR (`CONSTRAINT_NAME` = 'cooperation_design_file_versions_confirmed_by_customer_id_fkey'
        AND `TABLE_NAME` = 'cooperation_design_file_versions'
        AND `REFERENCED_TABLE_NAME` = 'customers')
      OR (`CONSTRAINT_NAME` = 'quotation_versions_quotation_id_fkey'
        AND `TABLE_NAME` = 'quotation_versions'
        AND `REFERENCED_TABLE_NAME` = 'quotations')
      OR (`CONSTRAINT_NAME` = 'quotation_versions_accepted_by_customer_id_fkey'
        AND `TABLE_NAME` = 'quotation_versions'
        AND `REFERENCED_TABLE_NAME` = 'customers')
      OR (`CONSTRAINT_NAME` = 'quotation_version_items_quotation_version_id_fkey'
        AND `TABLE_NAME` = 'quotation_version_items'
        AND `REFERENCED_TABLE_NAME` = 'quotation_versions')
      OR (`CONSTRAINT_NAME` = 'orders_quotation_version_id_fkey'
        AND `TABLE_NAME` = 'orders'
        AND `REFERENCED_TABLE_NAME` = 'quotation_versions')
    )
) <> 7
LIMIT 1;
DROP TEMPORARY TABLE `_guard_m54_clean_baseline`;

ALTER TABLE `quotations`
  ADD COLUMN `lead_id` INTEGER NULL,
  ADD INDEX `quotations_lead_id_idx`(`lead_id`),
  ADD CONSTRAINT `quotations_lead_id_fkey`
    FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `partner_price_agreements`
  ADD COLUMN `previous_agreement_id` INTEGER NULL,
  ADD UNIQUE INDEX `partner_price_agreements_previous_agreement_id_key`(`previous_agreement_id`),
  ADD CONSTRAINT `partner_price_agreements_previous_agreement_id_fkey`
    FOREIGN KEY (`previous_agreement_id`) REFERENCES `partner_price_agreements`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `quotation_versions`
  ADD COLUMN `snapshot_schema_version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `business_snapshot` JSON NULL;

ALTER TABLE `orders`
  ADD COLUMN `quote_channel` ENUM('RETAIL', 'CUSTOM', 'PARTNER_WAX') NULL,
  ADD COLUMN `customer_account_type_snapshot` ENUM('MEMBER', 'PARTNER') NULL,
  ADD COLUMN `fee_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `confirmed_by_customer_id` INTEGER NULL,
  ADD COLUMN `confirmed_at` DATETIME(3) NULL,
  ADD COLUMN `snapshot_schema_version` INTEGER NULL,
  ADD COLUMN `transaction_snapshot` JSON NULL,
  ADD COLUMN `transaction_snapshot_hash` CHAR(64) NULL,
  ADD INDEX `orders_quote_channel_created_at_idx`(`quote_channel`, `created_at`),
  ADD INDEX `orders_confirmed_by_customer_id_confirmed_at_idx`(`confirmed_by_customer_id`, `confirmed_at`),
  ADD CONSTRAINT `orders_confirmed_by_customer_id_fkey`
    FOREIGN KEY (`confirmed_by_customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE `quotation_fee_rules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(80) NOT NULL,
  `version` INTEGER NOT NULL,
  `channel` ENUM('RETAIL', 'CUSTOM', 'PARTNER_WAX') NOT NULL,
  `wax_type` ENUM('RED', 'PURPLE') NULL,
  `calculation_method` ENUM('FIXED', 'PER_GRAM', 'PER_ORDER') NOT NULL,
  `unit_amount` DECIMAL(12, 2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `effective_from` DATETIME(3) NOT NULL,
  `effective_until` DATETIME(3) NULL,
  `display_text` VARCHAR(200) NOT NULL,
  `reason` TEXT NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `quotation_fee_rules_code_version_channel_key`(`code`, `version`, `channel`),
  INDEX `quotation_fee_rules_effective_idx`(`channel`, `enabled`, `effective_from`, `effective_until`),
  PRIMARY KEY (`id`),
  CONSTRAINT `quotation_fee_rules_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quotation_version_fee_lines` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quotation_version_id` INTEGER NOT NULL,
  `fee_rule_id` INTEGER NULL,
  `code` VARCHAR(80) NOT NULL,
  `display_text` VARCHAR(200) NOT NULL,
  `calculation_method` ENUM('FIXED', 'PER_GRAM', 'PER_ORDER') NOT NULL,
  `rate` DECIMAL(12, 2) NOT NULL,
  `basis_quantity` DECIMAL(14, 3) NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
  UNIQUE INDEX `quotation_version_fee_lines_quotation_version_id_code_key`(`quotation_version_id`, `code`),
  INDEX `quotation_version_fee_lines_fee_rule_id_idx`(`fee_rule_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `quotation_version_fee_lines_quotation_version_id_fkey`
    FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `quotation_version_fee_lines_fee_rule_id_fkey`
    FOREIGN KEY (`fee_rule_id`) REFERENCES `quotation_fee_rules`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `trade_resource_buckets` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `channel` ENUM('RETAIL', 'CUSTOM', 'PARTNER_WAX') NOT NULL,
  `kind` ENUM('CAPACITY', 'MATERIAL') NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `bucket_key` VARCHAR(80) NOT NULL,
  `display_name` VARCHAR(120) NOT NULL,
  `unit` VARCHAR(30) NOT NULL,
  `bucket_start` DATETIME(3) NULL,
  `bucket_end` DATETIME(3) NULL,
  `available_quantity` DECIMAL(14, 3) NOT NULL,
  `reserved_quantity` DECIMAL(14, 3) NOT NULL DEFAULT 0,
  `version` INTEGER NOT NULL DEFAULT 1,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INTEGER NULL,
  `updated_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `trade_resource_buckets_channel_kind_code_bucket_key_key`(`channel`, `kind`, `code`, `bucket_key`),
  INDEX `trade_resource_buckets_availability_idx`(`channel`, `kind`, `is_active`, `bucket_start`, `bucket_end`),
  PRIMARY KEY (`id`),
  CONSTRAINT `trade_resource_buckets_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `trade_resource_buckets_updated_by_fkey`
    FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quotation_version_resource_requirements` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quotation_version_id` INTEGER NOT NULL,
  `resource_bucket_id` INTEGER NOT NULL,
  `required_quantity` DECIMAL(14, 3) NOT NULL,
  `resource_snapshot` JSON NOT NULL,
  UNIQUE INDEX `qv_resource_requirements_version_bucket_key`(`quotation_version_id`, `resource_bucket_id`),
  INDEX `qv_resource_requirements_bucket_idx`(`resource_bucket_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `qv_resource_requirements_version_fkey`
    FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `qv_resource_requirements_bucket_fkey`
    FOREIGN KEY (`resource_bucket_id`) REFERENCES `trade_resource_buckets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quoted_order_lines` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `order_id` INTEGER NOT NULL,
  `quotation_version_item_id` INTEGER NOT NULL,
  `product_id` INTEGER NULL,
  `sku_id` INTEGER NULL,
  `wax_type` ENUM('RED', 'PURPLE') NULL,
  `description` VARCHAR(500) NOT NULL,
  `quantity` INTEGER NOT NULL DEFAULT 1,
  `unit_amount` DECIMAL(12, 2) NOT NULL,
  `line_amount` DECIMAL(12, 2) NOT NULL,
  `pricing_snapshot` JSON NOT NULL,
  UNIQUE INDEX `quoted_order_lines_quotation_version_item_id_key`(`quotation_version_item_id`),
  INDEX `quoted_order_lines_order_id_idx`(`order_id`),
  INDEX `quoted_order_lines_product_id_idx`(`product_id`),
  INDEX `quoted_order_lines_sku_id_idx`(`sku_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `quoted_order_lines_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `quoted_order_lines_quotation_version_item_id_fkey`
    FOREIGN KEY (`quotation_version_item_id`) REFERENCES `quotation_version_items`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `quoted_order_lines_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `quoted_order_lines_sku_id_fkey`
    FOREIGN KEY (`sku_id`) REFERENCES `product_skus`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quotation_conversions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quotation_version_id` INTEGER NOT NULL,
  `order_id` INTEGER NOT NULL,
  `customer_id` INTEGER NOT NULL,
  `idempotency_key_hash` CHAR(64) NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `quotation_conversions_quotation_version_id_key`(`quotation_version_id`),
  UNIQUE INDEX `quotation_conversions_order_id_key`(`order_id`),
  UNIQUE INDEX `quotation_conversions_idempotency_key_hash_key`(`idempotency_key_hash`),
  INDEX `quotation_conversions_customer_id_created_at_idx`(`customer_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `quotation_conversions_quotation_version_id_fkey`
    FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `quotation_conversions_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `quotation_conversions_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_resource_reservations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `order_id` INTEGER NOT NULL,
  `quotation_requirement_id` INTEGER NOT NULL,
  `resource_bucket_id` INTEGER NOT NULL,
  `quantity` DECIMAL(14, 3) NOT NULL,
  `status` ENUM('RESERVED', 'CONSUMED', 'RELEASED') NOT NULL DEFAULT 'RESERVED',
  `reserved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `consumed_at` DATETIME(3) NULL,
  `released_at` DATETIME(3) NULL,
  UNIQUE INDEX `order_resource_reservations_quotation_requirement_id_key`(`quotation_requirement_id`),
  INDEX `order_resource_reservations_order_id_status_idx`(`order_id`, `status`),
  INDEX `order_resource_reservations_resource_bucket_id_status_idx`(`resource_bucket_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `order_resource_reservations_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `order_resource_reservations_quotation_requirement_id_fkey`
    FOREIGN KEY (`quotation_requirement_id`) REFERENCES `quotation_version_resource_requirements`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `order_resource_reservations_resource_bucket_id_fkey`
    FOREIGN KEY (`resource_bucket_id`) REFERENCES `trade_resource_buckets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 客户确认人和成交版本属于不可变交易事实。MySQL 不能在同一 ALTER TABLE 中
-- DROP 后以原名称重新 ADD 外键（会报 1826）。每个旧外键先由不同名称的
-- RESTRICT/RESTRICT 保护外键接管，再分语句删除和重建原名，整个过程中不出现
-- 无外键保护窗口；若某条 DDL 意外中断，只会留下更严格的冗余保护约束。
ALTER TABLE `partner_price_agreements`
  ADD CONSTRAINT `m54_guard_partner_price_customer_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `cooperation_design_file_versions`
  ADD CONSTRAINT `m54_guard_design_file_parent_fkey`
    FOREIGN KEY (`design_file_id`) REFERENCES `cooperation_design_files`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `m54_guard_design_file_confirmer_fkey`
    FOREIGN KEY (`confirmed_by_customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `quotation_versions`
  ADD CONSTRAINT `m54_guard_quote_version_parent_fkey`
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `m54_guard_quote_version_acceptor_fkey`
    FOREIGN KEY (`accepted_by_customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `quotation_version_items`
  ADD CONSTRAINT `m54_guard_quote_item_parent_fkey`
    FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `orders`
  ADD CONSTRAINT `m54_guard_order_quote_version_fkey`
    FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `partner_price_agreements`
  DROP FOREIGN KEY `partner_price_agreements_customer_id_fkey`;
ALTER TABLE `cooperation_design_file_versions`
  DROP FOREIGN KEY `cooperation_design_file_versions_design_file_id_fkey`,
  DROP FOREIGN KEY `cooperation_design_file_versions_confirmed_by_customer_id_fkey`;
ALTER TABLE `quotation_versions`
  DROP FOREIGN KEY `quotation_versions_quotation_id_fkey`,
  DROP FOREIGN KEY `quotation_versions_accepted_by_customer_id_fkey`;
ALTER TABLE `quotation_version_items`
  DROP FOREIGN KEY `quotation_version_items_quotation_version_id_fkey`;
ALTER TABLE `orders`
  DROP FOREIGN KEY `orders_quotation_version_id_fkey`;

ALTER TABLE `partner_price_agreements`
  ADD CONSTRAINT `partner_price_agreements_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `cooperation_design_file_versions`
  ADD CONSTRAINT `cooperation_design_file_versions_design_file_id_fkey`
    FOREIGN KEY (`design_file_id`) REFERENCES `cooperation_design_files`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `cooperation_design_file_versions_confirmed_by_customer_id_fkey`
    FOREIGN KEY (`confirmed_by_customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `quotation_versions`
  ADD CONSTRAINT `quotation_versions_quotation_id_fkey`
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `quotation_versions_accepted_by_customer_id_fkey`
    FOREIGN KEY (`accepted_by_customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `quotation_version_items`
  ADD CONSTRAINT `quotation_version_items_quotation_version_id_fkey`
    FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_quotation_version_id_fkey`
    FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `partner_price_agreements`
  DROP FOREIGN KEY `m54_guard_partner_price_customer_fkey`;
ALTER TABLE `cooperation_design_file_versions`
  DROP FOREIGN KEY `m54_guard_design_file_parent_fkey`,
  DROP FOREIGN KEY `m54_guard_design_file_confirmer_fkey`;
ALTER TABLE `quotation_versions`
  DROP FOREIGN KEY `m54_guard_quote_version_parent_fkey`,
  DROP FOREIGN KEY `m54_guard_quote_version_acceptor_fkey`;
ALTER TABLE `quotation_version_items`
  DROP FOREIGN KEY `m54_guard_quote_item_parent_fkey`;
ALTER TABLE `orders`
  DROP FOREIGN KEY `m54_guard_order_quote_version_fkey`;
