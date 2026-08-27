-- Unified lead pipeline. This migration is additive: the legacy inquiry,
-- selection-inquiry and follow-up tables remain available during rollback.

CREATE TABLE `leads` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `source_type` ENUM('INQUIRY', 'SELECTION_INQUIRY') NOT NULL,
  `inquiry_id` INTEGER NULL,
  `selection_inquiry_id` INTEGER NULL,
  `customer_id` INTEGER NULL,
  `customer_name` VARCHAR(50) NOT NULL,
  `phone` VARCHAR(20) NULL,
  `email` VARCHAR(100) NULL,
  `wechat` VARCHAR(50) NULL,
  `status` ENUM('PENDING', 'CONTACTED', 'FOLLOWING', 'COMPLETED', 'INVALID') NOT NULL DEFAULT 'PENDING',
  `assigned_to` INTEGER NULL,
  `internal_note` TEXT NULL,
  `next_follow_up_at` DATETIME(3) NULL,
  `closed_at` DATETIME(3) NULL,
  `retention_until` DATETIME(3) NULL,
  `idempotency_key_hash` CHAR(64) NULL,
  `submission_fingerprint` CHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `leads_inquiry_id_key`(`inquiry_id`),
  UNIQUE INDEX `leads_selection_inquiry_id_key`(`selection_inquiry_id`),
  UNIQUE INDEX `leads_idempotency_key_hash_key`(`idempotency_key_hash`),
  INDEX `leads_source_type_created_at_idx`(`source_type`, `created_at`),
  INDEX `leads_status_created_at_idx`(`status`, `created_at`),
  INDEX `leads_assigned_to_status_next_follow_up_at_idx`(`assigned_to`, `status`, `next_follow_up_at`),
  INDEX `leads_customer_id_created_at_idx`(`customer_id`, `created_at`),
  INDEX `leads_retention_until_idx`(`retention_until`),
  PRIMARY KEY (`id`),
  CONSTRAINT `leads_inquiry_id_fkey` FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `leads_selection_inquiry_id_fkey` FOREIGN KEY (`selection_inquiry_id`) REFERENCES `selection_inquiries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `leads_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `leads_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_activities` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lead_id` INTEGER NOT NULL,
  `type` ENUM('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'FOLLOW_UP', 'REPLY', 'NOTE') NOT NULL,
  `content` TEXT NULL,
  `contact_method` VARCHAR(30) NULL,
  `previous_status` ENUM('PENDING', 'CONTACTED', 'FOLLOWING', 'COMPLETED', 'INVALID') NULL,
  `current_status` ENUM('PENDING', 'CONTACTED', 'FOLLOWING', 'COMPLETED', 'INVALID') NULL,
  `next_follow_up_at` DATETIME(3) NULL,
  `created_by` INTEGER NULL,
  `idempotency_key_hash` CHAR(64) NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `lead_activities_idempotency_key_hash_key`(`idempotency_key_hash`),
  INDEX `lead_activities_lead_id_created_at_idx`(`lead_id`, `created_at`),
  INDEX `lead_activities_created_by_created_at_idx`(`created_by`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `lead_activities_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lead_activities_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill legacy inquiries into the canonical lead states without changing the
-- source rows. PROCESSING means assigned but not contacted, so it maps to PENDING.
INSERT INTO `leads` (
  `source_type`, `inquiry_id`, `customer_id`, `customer_name`, `phone`, `email`,
  `status`, `assigned_to`, `internal_note`, `next_follow_up_at`, `closed_at`,
  `retention_until`, `created_at`, `updated_at`
)
SELECT
  'INQUIRY', i.`id`, i.`customer_id`, i.`customer_name`, i.`customer_phone`, i.`customer_email`,
  CASE
    WHEN UPPER(i.`status`) = 'REPLIED' THEN 'CONTACTED'
    WHEN UPPER(i.`status`) IN ('CLOSED', 'COMPLETED') THEN 'COMPLETED'
    WHEN UPPER(i.`status`) = 'INVALID' THEN 'INVALID'
    WHEN UPPER(i.`status`) = 'FOLLOWING' THEN 'FOLLOWING'
    WHEN UPPER(i.`status`) = 'CONTACTED' THEN 'CONTACTED'
    ELSE 'PENDING'
  END,
  i.`assigned_to`, i.`internal_note`, i.`next_follow_up_at`,
  CASE WHEN UPPER(i.`status`) IN ('CLOSED', 'COMPLETED', 'INVALID') THEN i.`updated_at` ELSE NULL END,
  CASE
    WHEN UPPER(i.`status`) IN ('CLOSED', 'COMPLETED') THEN DATE_ADD(i.`updated_at`, INTERVAL 12 MONTH)
    WHEN UPPER(i.`status`) = 'INVALID' THEN DATE_ADD(i.`updated_at`, INTERVAL 30 DAY)
    ELSE NULL
  END,
  i.`created_at`, i.`updated_at`
FROM `inquiries` i
ON DUPLICATE KEY UPDATE `inquiry_id` = VALUES(`inquiry_id`);

INSERT INTO `leads` (
  `source_type`, `selection_inquiry_id`, `customer_id`, `customer_name`, `phone`, `email`, `wechat`,
  `status`, `assigned_to`, `internal_note`, `next_follow_up_at`, `closed_at`,
  `retention_until`, `created_at`, `updated_at`
)
SELECT
  'SELECTION_INQUIRY', s.`id`, s.`customer_id`, s.`customer_name`, s.`phone`, s.`email`, s.`wechat`,
  CASE
    WHEN UPPER(s.`status`) = 'REPLIED' THEN 'CONTACTED'
    WHEN UPPER(s.`status`) IN ('CLOSED', 'COMPLETED') THEN 'COMPLETED'
    WHEN UPPER(s.`status`) = 'INVALID' THEN 'INVALID'
    WHEN UPPER(s.`status`) = 'FOLLOWING' THEN 'FOLLOWING'
    WHEN UPPER(s.`status`) = 'CONTACTED' THEN 'CONTACTED'
    ELSE 'PENDING'
  END,
  s.`handled_by`, s.`internal_note`, s.`next_follow_up_at`,
  CASE WHEN UPPER(s.`status`) IN ('CLOSED', 'COMPLETED', 'INVALID') THEN s.`updated_at` ELSE NULL END,
  CASE
    WHEN UPPER(s.`status`) IN ('CLOSED', 'COMPLETED') THEN DATE_ADD(s.`updated_at`, INTERVAL 12 MONTH)
    WHEN UPPER(s.`status`) = 'INVALID' THEN DATE_ADD(s.`updated_at`, INTERVAL 30 DAY)
    ELSE NULL
  END,
  s.`created_at`, s.`updated_at`
FROM `selection_inquiries` s
ON DUPLICATE KEY UPDATE `selection_inquiry_id` = VALUES(`selection_inquiry_id`);

-- Every imported lead receives an auditable creation event. The deterministic
-- hash makes this data step safe to rerun independently during recovery.
INSERT INTO `lead_activities` (
  `lead_id`, `type`, `content`, `current_status`, `idempotency_key_hash`, `created_at`
)
SELECT
  l.`id`, 'CREATED', '由历史咨询记录回填', l.`status`,
  SHA2(CONCAT('legacy-lead-created:', l.`id`), 256), l.`created_at`
FROM `leads` l
ON DUPLICATE KEY UPDATE `lead_id` = VALUES(`lead_id`);

-- Preserve existing follow-up history in the new FK-backed audit stream.
INSERT INTO `lead_activities` (
  `lead_id`, `type`, `content`, `contact_method`, `next_follow_up_at`, `created_by`,
  `idempotency_key_hash`, `created_at`
)
SELECT
  l.`id`, 'FOLLOW_UP', f.`content`, f.`contact_method`, f.`next_follow_up_at`, f.`created_by`,
  SHA2(CONCAT('legacy-lead-follow-up:', f.`id`), 256), f.`created_at`
FROM `lead_follow_ups` f
INNER JOIN `leads` l ON (
  (f.`leadType` = 'inquiry' AND l.`inquiry_id` = f.`lead_id`)
  OR (f.`leadType` IN ('selection', 'selection_inquiry') AND l.`selection_inquiry_id` = f.`lead_id`)
)
ON DUPLICATE KEY UPDATE `lead_id` = VALUES(`lead_id`);
