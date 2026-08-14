-- 客户密码找回（OR-2 触达批）：一次性重置令牌表
-- tokenHash 为令牌本身的 SHA-256（64 位十六进制），明文令牌只出现在邮件链接中
CREATE TABLE `customer_password_reset_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customer_id` INT NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_password_reset_tokens_token_hash_key` (`token_hash`),
  INDEX `customer_password_reset_tokens_customer_id_idx` (`customer_id`),
  CONSTRAINT `customer_password_reset_tokens_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
