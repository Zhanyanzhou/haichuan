-- 第 62 条 migration：付款凭证先成为持久资产，再由订单事务原子认领。
-- 历史双字段只有在客户归属与跨单唯一键无冲突时才允许回填。
CREATE TEMPORARY TABLE `_payment_proof_backfill_refs` (
  `storage_key` VARCHAR(500) NOT NULL,
  `order_id` INTEGER NOT NULL,
  `customer_id` INTEGER NULL,
  `payment_id` INTEGER NULL,
  `reference_created_at` DATETIME(3) NOT NULL
);

INSERT INTO `_payment_proof_backfill_refs` (`storage_key`, `order_id`, `customer_id`, `payment_id`, `reference_created_at`)
SELECT `payment_proof`, `id`, `customer_id`, NULL, `created_at`
FROM `orders`
WHERE `payment_proof` IS NOT NULL;

INSERT INTO `_payment_proof_backfill_refs` (`storage_key`, `order_id`, `customer_id`, `payment_id`, `reference_created_at`)
SELECT p.`proof_url`, p.`order_id`, o.`customer_id`, p.`id`, p.`created_at`
FROM `payments` p
INNER JOIN `orders` o ON o.`id` = p.`order_id`
WHERE p.`proof_url` IS NOT NULL;

CREATE TEMPORARY TABLE `_guard_payment_proof_invalid_owner` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_payment_proof_invalid_owner` (`ok`)
SELECT 0
FROM `_payment_proof_backfill_refs`
WHERE `customer_id` IS NULL
   OR `storage_key` NOT REGEXP '^[0-9]+/[0-9]{4}/[0-9]{2}/[0-9]{2}/[0-9A-Fa-f-]{36}\\.(jpg|png|webp|gif)$'
   OR SUBSTRING_INDEX(`storage_key`, '/', 1) <> CAST(`customer_id` AS CHAR)
LIMIT 1;
DROP TEMPORARY TABLE `_guard_payment_proof_invalid_owner`;

CREATE TEMPORARY TABLE `_guard_payment_proof_key_conflict` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_payment_proof_key_conflict` (`ok`)
SELECT 0
FROM `_payment_proof_backfill_refs`
GROUP BY `storage_key`
HAVING COUNT(DISTINCT `order_id`) > 1
LIMIT 1;
DROP TEMPORARY TABLE `_guard_payment_proof_key_conflict`;

CREATE TABLE `payment_proof_assets` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `storage_key` VARCHAR(500) NOT NULL,
  `customer_id` INTEGER NOT NULL,
  `order_id` INTEGER NULL,
  `payment_id` INTEGER NULL,
  `submission_order_id` INTEGER NULL,
  `submission_key_hash` CHAR(64) NULL,
  `file_checksum_sha256` CHAR(64) NULL,
  `file_size` INTEGER NULL,
  `mime_type` VARCHAR(50) NULL,
  `file_ready_at` DATETIME(3) NULL,
  `status` ENUM('UPLOADED', 'ATTACHED', 'DELETING') NOT NULL DEFAULT 'UPLOADED',
  `attached_at` DATETIME(3) NULL,
  `deleting_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `payment_proof_assets_storage_key_key` (`storage_key`),
  UNIQUE INDEX `payment_proof_assets_submission_key_hash_key` (`submission_key_hash`),
  INDEX `payment_proof_assets_order_id_idx` (`order_id`),
  INDEX `payment_proof_assets_payment_id_idx` (`payment_id`),
  INDEX `payment_proof_assets_customer_status_created_idx` (`customer_id`, `status`, `created_at`),
  INDEX `payment_proof_assets_status_created_idx` (`status`, `created_at`),
  CONSTRAINT `payment_proof_assets_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `payment_proof_assets_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `payment_proof_assets_payment_id_fkey`
    FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `payment_proof_assets_state_check`
    CHECK ((`status` = 'UPLOADED' AND `order_id` IS NULL AND `payment_id` IS NULL AND `file_size` > 0 AND `attached_at` IS NULL AND `deleting_at` IS NULL)
      OR (`status` = 'ATTACHED' AND `order_id` IS NOT NULL AND `file_size` > 0 AND `attached_at` IS NOT NULL AND `deleting_at` IS NULL)
      OR (`status` = 'DELETING' AND `order_id` IS NULL AND `payment_id` IS NULL AND `attached_at` IS NULL AND `deleting_at` IS NOT NULL)),
  CONSTRAINT `payment_proof_assets_submission_check`
    CHECK ((`status` = 'DELETING' AND `submission_key_hash` IS NULL AND `submission_order_id` IS NULL AND `file_checksum_sha256` IS NULL AND `file_size` IS NULL AND `mime_type` IS NULL)
      OR (`status` = 'ATTACHED' AND `submission_key_hash` IS NULL AND `submission_order_id` IS NULL AND `file_checksum_sha256` IS NULL AND `file_size` > 0 AND `mime_type` IS NULL)
      OR (`submission_key_hash` IS NOT NULL AND `submission_order_id` IS NOT NULL AND `file_checksum_sha256` IS NOT NULL AND `file_size` > 0 AND `mime_type` IS NOT NULL)),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_proof_gc_state` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `scan_offset` INTEGER NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `payment_proof_gc_state` (`id`, `scan_offset`) VALUES (1, 0);

INSERT INTO `payment_proof_assets` (
  `storage_key`, `customer_id`, `order_id`, `payment_id`, `submission_order_id`,
  `file_size`, `file_ready_at`, `status`, `attached_at`, `created_at`, `updated_at`
)
SELECT
  `storage_key`,
  MIN(`customer_id`),
  `order_id`,
  MAX(`payment_id`),
  NULL,
  10485760,
  MAX(`reference_created_at`),
  'ATTACHED',
  MAX(`reference_created_at`),
  MIN(`reference_created_at`),
  MAX(`reference_created_at`)
FROM `_payment_proof_backfill_refs`
GROUP BY `storage_key`, `order_id`;

DROP TEMPORARY TABLE `_payment_proof_backfill_refs`;

CREATE TRIGGER `payment_proof_assets_controlled_update`
BEFORE UPDATE ON `payment_proof_assets`
FOR EACH ROW
BEGIN
  IF NEW.`storage_key` <> OLD.`storage_key`
     OR NEW.`customer_id` <> OLD.`customer_id`
     OR NOT (NEW.`submission_order_id` <=> OLD.`submission_order_id`)
     OR NOT (NEW.`submission_key_hash` <=> OLD.`submission_key_hash`)
     OR NOT (NEW.`file_checksum_sha256` <=> OLD.`file_checksum_sha256`)
     OR NOT (NEW.`file_size` <=> OLD.`file_size`)
     OR NOT (NEW.`mime_type` <=> OLD.`mime_type`)
     OR NOT (NEW.`file_ready_at` <=> OLD.`file_ready_at`)
     OR (OLD.`status` = 'ATTACHED' AND (
       NEW.`status` <> 'ATTACHED'
       OR NOT (NEW.`order_id` <=> OLD.`order_id`)
       OR (OLD.`payment_id` IS NOT NULL AND NOT (NEW.`payment_id` <=> OLD.`payment_id`))
     ))
     OR (OLD.`status` = 'DELETING' AND NEW.`status` <> 'DELETING')
     OR (OLD.`status` = 'UPLOADED' AND NEW.`status` NOT IN ('UPLOADED', 'ATTACHED', 'DELETING')) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'payment proof asset transition is not allowed';
  END IF;
END;
