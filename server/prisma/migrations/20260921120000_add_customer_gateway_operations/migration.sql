-- 第 63 条 migration：以客户级短期 operation lease 线性化主动支付/关单与账户注销。
-- lease 只保存内部 UUID、认证版本、订单与支付记录 ID，不保存联系方式或渠道响应。
CREATE TABLE `customer_gateway_operations` (
  `id` CHAR(36) NOT NULL,
  `customer_id` INTEGER NOT NULL,
  `auth_version` INTEGER NOT NULL,
  `kind` VARCHAR(30) NOT NULL,
  `order_id` INTEGER NOT NULL,
  `payment_id` INTEGER NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `customer_gateway_operations_customer_expiry_idx` (`customer_id`, `expires_at`),
  INDEX `customer_gateway_operations_order_expiry_idx` (`customer_id`, `order_id`, `expires_at`),
  CONSTRAINT `customer_gateway_operations_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
