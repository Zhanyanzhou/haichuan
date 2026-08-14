-- 交易中心：订单扩展（类型/销售顾问/来源/定金尾款/已收已退/定制阶段/发货维度）+ 报价管理 + 角色扩展
-- 重要：本文件由 AI 生成，尚未执行。需由项目负责人在目标环境执行：
--   cd server && npx prisma migrate deploy
-- 或开发环境（会同时触发 prisma generate）：
--   npx prisma migrate dev
--
-- 兼容性：所有新列均为可空或有默认值；老订单零影响，发货维度按现有 status 回填。

-- 1. 角色扩展：新增销售顾问、财务（users.role 原为 5 值 ENUM，扩展为 7 值）
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'CUSTOMER_SERVICE', 'WAREHOUSE', 'SALES_CONSULTANT', 'FINANCE') NOT NULL DEFAULT 'EDITOR';

-- 2. 订单交易中心扩展字段（老订单默认现货 / 无顾问 / 已收已退为 0 / 发货维度按 status 回填）
ALTER TABLE `orders`
  ADD COLUMN `order_type` ENUM('SPOT', 'CUSTOM', 'RESERVATION', 'OFFLINE') NOT NULL DEFAULT 'SPOT',
  ADD COLUMN `sales_consultant_id` INTEGER NULL,
  ADD COLUMN `source` VARCHAR(50) NULL,
  ADD COLUMN `adjustment_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `deposit_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `paid_deposit` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `balance_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `paid_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `paid_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `refunded_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `custom_stage` ENUM('NEED_CONFIRM', 'QUOTE_CONFIRM', 'PENDING_DEPOSIT', 'DEPOSIT_PAID', 'DESIGN_CONFIRM', 'IN_PRODUCTION', 'QC_PASSED', 'PENDING_BALANCE', 'BALANCE_PAID', 'PENDING_DELIVERY', 'DELIVERED', 'COMPLETED') NULL,
  ADD COLUMN `delivery_status` ENUM('NONE', 'PENDING_SHIP', 'SHIPPED', 'RECEIVED', 'ABNORMAL') NOT NULL DEFAULT 'NONE',
  ADD COLUMN `received_at` DATETIME(3) NULL;

-- 老订单发货维度回填：按现有主状态推断（保证列表多维筛选对历史数据也准确）
UPDATE `orders` SET `delivery_status` = 'PENDING_SHIP' WHERE `status` = 'PENDING_SHIP';
UPDATE `orders` SET `delivery_status` = 'SHIPPED' WHERE `status` = 'SHIPPED';

CREATE INDEX `orders_order_type_idx` ON `orders`(`order_type`);
CREATE INDEX `orders_sales_consultant_id_idx` ON `orders`(`sales_consultant_id`);
CREATE INDEX `orders_delivery_status_idx` ON `orders`(`delivery_status`);

-- 订单销售顾问外键
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_sales_consultant_id_fkey`
    FOREIGN KEY (`sales_consultant_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. 报价单主表
CREATE TABLE `quotations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quote_no` VARCHAR(30) NOT NULL,
    `customer_id` INTEGER NULL,
    `customer_name` VARCHAR(50) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `customer_email` VARCHAR(100) NULL,
    `sales_consultant_id` INTEGER NULL,
    `status` ENUM('DRAFT', 'PENDING_CONFIRM', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'CONVERTED') NOT NULL DEFAULT 'DRAFT',
    `total_amount` DECIMAL(12, 2) NOT NULL,
    `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `final_amount` DECIMAL(12, 2) NOT NULL,
    `deposit_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `valid_until` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `converted_order_id` INTEGER NULL,
    `converted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `quotations_quote_no_key`(`quote_no`),
    UNIQUE INDEX `quotations_converted_order_id_key`(`converted_order_id`),
    INDEX `quotations_status_idx`(`status`),
    INDEX `quotations_customer_phone_idx`(`customer_phone`),
    INDEX `quotations_customer_id_idx`(`customer_id`),
    INDEX `quotations_sales_consultant_id_idx`(`sales_consultant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. 报价单明细
CREATE TABLE `quotation_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quotation_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `sku_id` INTEGER NULL,
    `product_name` VARCHAR(200) NOT NULL,
    `product_image` VARCHAR(500) NULL,
    `spec` VARCHAR(200) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `quoted_price` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,

    INDEX `quotation_items_quotation_id_idx`(`quotation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. 报价相关外键
ALTER TABLE `quotations`
  ADD CONSTRAINT `quotations_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quotations`
  ADD CONSTRAINT `quotations_sales_consultant_id_fkey`
    FOREIGN KEY (`sales_consultant_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quotations`
  ADD CONSTRAINT `quotations_converted_order_id_fkey`
    FOREIGN KEY (`converted_order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `quotation_items`
  ADD CONSTRAINT `quotation_items_quotation_id_fkey`
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `quotation_items`
  ADD CONSTRAINT `quotation_items_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quotation_items`
  ADD CONSTRAINT `quotation_items_sku_id_fkey`
    FOREIGN KEY (`sku_id`) REFERENCES `product_skus`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
