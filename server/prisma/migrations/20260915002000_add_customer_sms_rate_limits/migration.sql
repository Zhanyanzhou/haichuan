-- 每手机号一行的共享发送额度状态，为多连接/多实例并发提供稳定行锁。
-- 不回填客户或历史验证码；旧版本应用可安全忽略本表。
CREATE TABLE `customer_sms_rate_limits` (
    `phone` VARCHAR(20) NOT NULL,
    `window_start` DATETIME(3) NOT NULL,
    `daily_count` INTEGER NOT NULL DEFAULT 0,
    `last_attempt_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`phone`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
