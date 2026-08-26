-- Release-foundation forward migration for the schema gap after
-- 20260825110000_add_personal_content_template_content_defaults.
-- Production execution still requires target-specific migration status, backup/restore
-- evidence, a rollback window, and separate approval.
-- This additive migration does not enable commerce, payment gateways, notifications,
-- analytics ingestion, logistics polling, or any other external write.

CREATE TABLE `product_translations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `product_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'en') NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `short_description` VARCHAR(500) NULL,
  `description` TEXT NULL,
  `detail_content` JSON NULL,
  `seo_title` VARCHAR(200) NULL,
  `seo_description` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `product_translations_product_id_locale_key`(`product_id`, `locale`),
  INDEX `product_translations_locale_idx`(`locale`),
  PRIMARY KEY (`id`),
  CONSTRAINT `product_translations_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `category_translations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `category_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'en') NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `seo_title` VARCHAR(200) NULL,
  `seo_description` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `category_translations_category_id_locale_key`(`category_id`, `locale`),
  INDEX `category_translations_locale_idx`(`locale`),
  PRIMARY KEY (`id`),
  CONSTRAINT `category_translations_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Historical analytics rows are isolated as TEST data and expire immediately.
-- Production rows are only created by the runtime when the production dataset is explicit.
ALTER TABLE `analytics_events`
  ADD COLUMN `dataset` ENUM('PRODUCTION', 'TEST') NOT NULL DEFAULT 'TEST',
  ADD COLUMN `retention_expires_at` DATETIME(3) NULL;

UPDATE `analytics_events`
SET `retention_expires_at` = CURRENT_TIMESTAMP(3)
WHERE `retention_expires_at` IS NULL;

ALTER TABLE `analytics_events`
  MODIFY COLUMN `retention_expires_at` DATETIME(3) NOT NULL,
  ADD INDEX `analytics_events_retention_idx`(`dataset`, `retention_expires_at`);

CREATE TABLE `media_variants` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `asset_id` INTEGER NOT NULL,
  `variant_key` VARCHAR(50) NOT NULL,
  `storage_key` VARCHAR(300) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `byte_size` INTEGER NOT NULL,
  `checksum_sha256` CHAR(64) NOT NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `media_variants_storage_key_key`(`storage_key`),
  UNIQUE INDEX `media_variants_asset_id_variant_key_key`(`asset_id`, `variant_key`),
  PRIMARY KEY (`id`),
  CONSTRAINT `media_variants_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_refresh_sessions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `family_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `last_used_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `replaced_by_hash` CHAR(64) NULL,
  `user_agent_hash` CHAR(64) NULL,
  `ip_hash` CHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `admin_refresh_sessions_token_hash_key`(`token_hash`),
  INDEX `admin_refresh_sessions_user_id_revoked_at_expires_at_idx`(`user_id`, `revoked_at`, `expires_at`),
  INDEX `admin_refresh_sessions_family_id_idx`(`family_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `admin_refresh_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_refresh_sessions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `family_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `last_used_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `replaced_by_hash` CHAR(64) NULL,
  `user_agent_hash` CHAR(64) NULL,
  `ip_hash` CHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `customer_refresh_sessions_token_hash_key`(`token_hash`),
  INDEX `customer_refresh_sessions_customer_id_revoked_at_expires_at_idx`(`customer_id`, `revoked_at`, `expires_at`),
  INDEX `customer_refresh_sessions_family_id_idx`(`family_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `customer_refresh_sessions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `consent_records` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER NULL,
  `anonymous_id_hash` CHAR(64) NULL,
  `purpose` ENUM('SERVICE_PRIVACY', 'MARKETING', 'ANALYTICS') NOT NULL,
  `decision` ENUM('GRANTED', 'DENIED', 'WITHDRAWN') NOT NULL,
  `policy_version` VARCHAR(50) NOT NULL,
  `locale` ENUM('zh-CN', 'en') NOT NULL,
  `source` VARCHAR(50) NOT NULL,
  `decided_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `consent_records_customer_id_purpose_decided_at_idx`(`customer_id`, `purpose`, `decided_at`),
  INDEX `consent_records_anonymous_id_hash_purpose_decided_at_idx`(`anonymous_id_hash`, `purpose`, `decided_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `consent_records_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER NOT NULL,
  `type` VARCHAR(80) NOT NULL,
  `locale` ENUM('zh-CN', 'en') NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT NOT NULL,
  `action_url` VARCHAR(500) NULL,
  `payload` JSON NULL,
  `status` ENUM('PENDING', 'AVAILABLE', 'READ', 'ARCHIVED') NOT NULL DEFAULT 'PENDING',
  `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `read_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `notifications_customer_id_status_available_at_idx`(`customer_id`, `status`, `available_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `notifications_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notification_deliveries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `notification_id` INTEGER NOT NULL,
  `channel` ENUM('IN_APP', 'SMS', 'EMAIL') NOT NULL,
  `status` ENUM('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'SUPPRESSED') NOT NULL DEFAULT 'PENDING',
  `destination_hash` CHAR(64) NULL,
  `provider` VARCHAR(50) NULL,
  `provider_ref` VARCHAR(200) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME(3) NULL,
  `sent_at` DATETIME(3) NULL,
  `delivered_at` DATETIME(3) NULL,
  `failed_at` DATETIME(3) NULL,
  `last_error_code` VARCHAR(100) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `notification_deliveries_notification_id_channel_key`(`notification_id`, `channel`),
  INDEX `notification_deliveries_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `notification_deliveries_notification_id_fkey` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notification_preferences` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER NOT NULL,
  `channel` ENUM('IN_APP', 'SMS', 'EMAIL') NOT NULL,
  `topic` VARCHAR(80) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `notification_preferences_customer_id_channel_topic_key`(`customer_id`, `channel`, `topic`),
  PRIMARY KEY (`id`),
  CONSTRAINT `notification_preferences_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `outbox_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `aggregate_type` VARCHAR(80) NOT NULL,
  `aggregate_id` VARCHAR(100) NOT NULL,
  `event_type` VARCHAR(120) NOT NULL,
  `payload` JSON NOT NULL,
  `deduplication_key` VARCHAR(128) NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `locked_at` DATETIME(3) NULL,
  `locked_by` VARCHAR(100) NULL,
  `processed_at` DATETIME(3) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `last_error_code` VARCHAR(100) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `outbox_events_deduplication_key_key`(`deduplication_key`),
  INDEX `outbox_events_status_available_at_idx`(`status`, `available_at`),
  INDEX `outbox_events_aggregate_type_aggregate_id_occurred_at_idx`(`aggregate_type`, `aggregate_id`, `occurred_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `page_document_revisions`
  ADD CONSTRAINT `page_document_revisions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `page_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `page_document_localizations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `document_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'en') NOT NULL,
  `puck_data` JSON NOT NULL,
  `metadata` JSON NOT NULL,
  `review_status` ENUM('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `content_hash` CHAR(64) NOT NULL,
  `submitted_by` INTEGER NULL,
  `submitted_at` DATETIME(3) NULL,
  `reviewed_by` INTEGER NULL,
  `reviewed_at` DATETIME(3) NULL,
  `review_note` TEXT NULL,
  `published_revision_id` INTEGER NULL,
  `published_hash` CHAR(64) NULL,
  `published_by` INTEGER NULL,
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `page_document_localizations_document_id_locale_key`(`document_id`, `locale`),
  INDEX `page_document_localizations_locale_review_status_idx`(`locale`, `review_status`),
  INDEX `page_document_localizations_published_revision_id_idx`(`published_revision_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `page_document_localizations_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `page_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `page_document_localizations_submitted_by_fkey` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `page_document_localizations_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `page_document_localizations_published_by_fkey` FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `page_document_localizations_published_revision_id_fkey` FOREIGN KEY (`published_revision_id`) REFERENCES `page_document_revisions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `partner_price_applications` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER NOT NULL,
  `requested_red_rate` DECIMAL(10, 2) NULL,
  `requested_purple_rate` DECIMAL(10, 2) NULL,
  `reason` TEXT NULL,
  `status` ENUM('PENDING', 'NEEDS_SUPPLEMENT', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `reviewer_id` INTEGER NULL,
  `review_note` TEXT NULL,
  `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `partner_price_applications_customer_id_submitted_at_idx`(`customer_id`, `submitted_at`),
  INDEX `partner_price_applications_status_submitted_at_idx`(`status`, `submitted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `partner_price_applications_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `partner_price_applications_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `partner_price_agreements` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER NOT NULL,
  `version` INTEGER NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
  `red_wax_rate` DECIMAL(10, 2) NOT NULL,
  `purple_wax_rate` DECIMAL(10, 2) NOT NULL,
  `effective_from` DATETIME(3) NOT NULL,
  `effective_until` DATETIME(3) NULL,
  `reason` TEXT NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `partner_price_agreements_customer_id_version_key`(`customer_id`, `version`),
  INDEX `partner_price_agreements_customer_effective_idx`(`customer_id`, `effective_from`, `effective_until`),
  PRIMARY KEY (`id`),
  CONSTRAINT `partner_price_agreements_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `partner_price_agreements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cooperation_design_files` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER NOT NULL,
  `product_id` INTEGER NULL,
  `reference_no` VARCHAR(50) NOT NULL,
  `current_version` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `cooperation_design_files_reference_no_key`(`reference_no`),
  INDEX `cooperation_design_files_customer_id_created_at_idx`(`customer_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cooperation_design_files_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cooperation_design_files_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cooperation_design_file_versions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `design_file_id` INTEGER NOT NULL,
  `version` INTEGER NOT NULL,
  `media_asset_id` INTEGER NOT NULL,
  `status` ENUM('DRAFT', 'SUBMITTED', 'CONFIRMED', 'SUPERSEDED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  `target_gold_weight` DECIMAL(10, 3) NULL,
  `red_wax_weight` DECIMAL(10, 3) NULL,
  `purple_wax_weight` DECIMAL(10, 3) NULL,
  `checksum_sha256` CHAR(64) NOT NULL,
  `created_by` INTEGER NULL,
  `confirmed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `cooperation_design_file_versions_design_file_id_version_key`(`design_file_id`, `version`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cooperation_design_file_versions_design_file_id_fkey` FOREIGN KEY (`design_file_id`) REFERENCES `cooperation_design_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cooperation_design_file_versions_media_asset_id_fkey` FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cooperation_design_file_versions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quotation_versions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quotation_id` INTEGER NOT NULL,
  `version` INTEGER NOT NULL,
  `channel` ENUM('RETAIL', 'CUSTOM', 'PARTNER_WAX') NOT NULL,
  `status` ENUM('DRAFT', 'ISSUED', 'ACCEPTED', 'SUPERSEDED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
  `subtotal_amount` DECIMAL(12, 2) NOT NULL,
  `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `fee_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `total_amount` DECIMAL(12, 2) NOT NULL,
  `valid_until` DATETIME(3) NULL,
  `content_hash` CHAR(64) NOT NULL,
  `design_file_version_id` INTEGER NULL,
  `created_by` INTEGER NULL,
  `issued_at` DATETIME(3) NULL,
  `accepted_by_customer_id` INTEGER NULL,
  `accepted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `quotation_versions_quotation_id_version_key`(`quotation_id`, `version`),
  INDEX `quotation_versions_status_valid_until_idx`(`status`, `valid_until`),
  PRIMARY KEY (`id`),
  CONSTRAINT `quotation_versions_quotation_id_fkey` FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `quotation_versions_design_file_version_id_fkey` FOREIGN KEY (`design_file_version_id`) REFERENCES `cooperation_design_file_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `quotation_versions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `quotation_versions_accepted_by_customer_id_fkey` FOREIGN KEY (`accepted_by_customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quotation_version_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quotation_version_id` INTEGER NOT NULL,
  `product_id` INTEGER NULL,
  `sku_id` INTEGER NULL,
  `wax_type` ENUM('RED', 'PURPLE') NULL,
  `description` VARCHAR(500) NOT NULL,
  `quantity` INTEGER NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(12, 2) NOT NULL,
  `subtotal` DECIMAL(12, 2) NOT NULL,
  `pricing_snapshot` JSON NOT NULL,
  INDEX `quotation_version_items_quotation_version_id_idx`(`quotation_version_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `quotation_version_items_quotation_version_id_fkey` FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `quotation_version_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `quotation_version_items_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `product_skus`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_plans` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `quotation_version_id` INTEGER NULL,
  `order_id` INTEGER NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
  `total_amount` DECIMAL(12, 2) NOT NULL,
  `status` ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `payment_plans_quotation_version_id_idx`(`quotation_version_id`),
  INDEX `payment_plans_order_id_idx`(`order_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `payment_plans_quotation_version_id_fkey` FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payment_plans_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_plan_installments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payment_plan_id` INTEGER NOT NULL,
  `sequence` INTEGER NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `due_at` DATETIME(3) NULL,
  `status` ENUM('PENDING', 'DUE', 'PAID', 'WAIVED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `paid_at` DATETIME(3) NULL,
  `payment_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `payment_plan_installments_payment_plan_id_sequence_key`(`payment_plan_id`, `sequence`),
  INDEX `payment_plan_installments_status_due_at_idx`(`status`, `due_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `payment_plan_installments_payment_plan_id_fkey` FOREIGN KEY (`payment_plan_id`) REFERENCES `payment_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `logistics_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `order_id` INTEGER NOT NULL,
  `fulfillment_id` INTEGER NULL,
  `source` ENUM('MANUAL', 'KUAIDI100', 'CARRIER') NOT NULL,
  `carrier_code` VARCHAR(50) NULL,
  `tracking_no_hash` CHAR(64) NULL,
  `event_code` VARCHAR(80) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `location` VARCHAR(200) NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `external_id` VARCHAR(150) NULL,
  `raw_payload` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `logistics_events_source_external_id_key`(`source`, `external_id`),
  INDEX `logistics_events_order_id_occurred_at_idx`(`order_id`, `occurred_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `logistics_events_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `logistics_events_fulfillment_id_fkey` FOREIGN KEY (`fulfillment_id`) REFERENCES `fulfillments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_snapshots` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `page_localization_id` INTEGER NULL,
  `product_id` INTEGER NULL,
  `locale` ENUM('zh-CN', 'en') NOT NULL,
  `route_path` VARCHAR(500) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` VARCHAR(500) NULL,
  `canonical_url` VARCHAR(500) NOT NULL,
  `robots` VARCHAR(100) NOT NULL DEFAULT 'index,follow',
  `structured_data` JSON NULL,
  `content_hash` CHAR(64) NOT NULL,
  `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `published_at` DATETIME(3) NULL,
  UNIQUE INDEX `seo_snapshots_locale_route_path_content_hash_key`(`locale`, `route_path`, `content_hash`),
  INDEX `seo_snapshots_page_localization_id_published_at_idx`(`page_localization_id`, `published_at`),
  INDEX `seo_snapshots_product_id_locale_published_at_idx`(`product_id`, `locale`, `published_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `seo_snapshots_page_localization_id_fkey` FOREIGN KEY (`page_localization_id`) REFERENCES `page_document_localizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `seo_snapshots_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Existing Chinese content is copied into zh-CN without modifying or deleting the legacy source columns.
-- Each statement is idempotent under its unique key, so a protected manual rerun cannot duplicate rows.
INSERT INTO `product_translations` (
  `product_id`, `locale`, `name`, `short_description`, `description`, `detail_content`,
  `created_at`, `updated_at`
)
SELECT
  p.`id`, 'zh-CN', p.`name`, p.`short_description`, p.`description`, p.`detail_content`,
  p.`created_at`, p.`updated_at`
FROM `products` p
ON DUPLICATE KEY UPDATE `product_id` = VALUES(`product_id`);

INSERT INTO `category_translations` (
  `category_id`, `locale`, `name`, `seo_title`, `seo_description`, `created_at`, `updated_at`
)
SELECT
  c.`id`, 'zh-CN', c.`name`, c.`seo_title`, c.`seo_desc`, c.`created_at`, c.`updated_at`
FROM `categories` c
ON DUPLICATE KEY UPDATE `category_id` = VALUES(`category_id`);

INSERT INTO `page_document_localizations` (
  `document_id`, `locale`, `puck_data`, `metadata`, `review_status`, `content_hash`,
  `published_hash`, `published_by`, `published_at`, `created_at`, `updated_at`
)
SELECT
  d.`id`, 'zh-CN', d.`puckData`, d.`metadata`,
  CASE WHEN UPPER(d.`status`) = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'DRAFT' END,
  SHA2(CONCAT(CAST(d.`puckData` AS CHAR), '|', CAST(d.`metadata` AS CHAR)), 256),
  CASE WHEN UPPER(d.`status`) = 'PUBLISHED'
    THEN SHA2(CONCAT(CAST(d.`puckData` AS CHAR), '|', CAST(d.`metadata` AS CHAR)), 256)
    ELSE NULL END,
  d.`published_by`, d.`published_at`, d.`created_at`, d.`updated_at`
FROM `page_documents` d
ON DUPLICATE KEY UPDATE `document_id` = VALUES(`document_id`);
