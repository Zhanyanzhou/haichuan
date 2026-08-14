-- 手机验真（短信验证码）：只存哈希，5 分钟时效，一次性
-- 冷却（60s）与每日上限（10 条/手机号）由服务层基于 (phone, created_at) 索引查询实现
CREATE TABLE `customer_sms_codes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `phone` VARCHAR(20) NOT NULL,
  `code_hash` VARCHAR(64) NOT NULL,
  `purpose` VARCHAR(20) NOT NULL DEFAULT 'REGISTER',
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `customer_sms_codes_phone_created_at_idx` (`phone`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
