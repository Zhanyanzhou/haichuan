-- 会员可选用户名。既有客户保持 NULL，手机号与微信登录不受影响。
-- MySQL 唯一索引允许多个 NULL。
ALTER TABLE `customers`
    ADD COLUMN `username` VARCHAR(32) NULL;

CREATE UNIQUE INDEX `customers_username_key` ON `customers`(`username`);
