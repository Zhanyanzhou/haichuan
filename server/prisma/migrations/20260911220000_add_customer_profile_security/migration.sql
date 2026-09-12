-- 个人资料安全基础：邮箱唯一、头像私有引用、换绑冷却与会话版本。
-- 所有存量邮箱不一致均在首个持久 DDL 前失败关闭；本迁移不会自动合并或覆盖客户资料。
CREATE TEMPORARY TABLE `_guard_blank_customer_email` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_blank_customer_email` (`ok`)
SELECT 0 FROM `customers`
WHERE `email` IS NOT NULL AND TRIM(`email`) = ''
LIMIT 1;
DROP TEMPORARY TABLE `_guard_blank_customer_email`;

CREATE TEMPORARY TABLE `_guard_duplicate_customer_email` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
INSERT INTO `_guard_duplicate_customer_email` (`ok`)
SELECT 0 FROM `customers`
WHERE `email` IS NOT NULL
GROUP BY LOWER(TRIM(`email`)) HAVING COUNT(*) > 1
LIMIT 1;
DROP TEMPORARY TABLE `_guard_duplicate_customer_email`;

ALTER TABLE `customers`
  ADD COLUMN `avatar_storage_key` VARCHAR(300) NULL,
  ADD COLUMN `phone_changed_at` DATETIME(3) NULL,
  ADD COLUMN `email_changed_at` DATETIME(3) NULL,
  ADD COLUMN `auth_version` INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX `customers_email_key` ON `customers`(`email`);

ALTER TABLE `customer_refresh_sessions`
  ADD COLUMN `auth_version` INTEGER NOT NULL DEFAULT 1;

CREATE TABLE `customer_contact_changes` (
  `id` CHAR(36) NOT NULL,
  `customer_id` INTEGER NOT NULL,
  `type` ENUM('PHONE', 'EMAIL') NOT NULL,
  `target_value` VARCHAR(100) NOT NULL,
  `verification_hash` CHAR(64) NOT NULL,
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `expires_at` DATETIME(3) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  `cancelled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `customer_contact_changes_lookup_idx`(`customer_id`, `type`, `completed_at`, `expires_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `customer_contact_changes_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_security_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER NOT NULL,
  `event_type` VARCHAR(50) NOT NULL,
  `ip_hash` CHAR(64) NULL,
  `user_agent_hash` CHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `customer_security_events_customer_id_created_at_idx`(`customer_id`, `created_at`),
  INDEX `customer_security_events_event_type_created_at_idx`(`event_type`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `customer_security_events_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
