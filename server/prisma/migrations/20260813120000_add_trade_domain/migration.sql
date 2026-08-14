-- 交易域基础框架：交易事件时间线、履约、售后工单 + 退款审核/幂等字段扩展
-- 重要：本文件由 AI 生成，尚未执行。需由项目负责人在目标环境执行：
--   cd server && npx prisma migrate deploy
-- 或开发环境：npx prisma migrate dev

-- 1. 交易事件（不可变时间线）
CREATE TABLE `trade_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `entity_type` VARCHAR(30) NOT NULL,
    `entity_id` INTEGER NOT NULL,
    `event_type` VARCHAR(40) NOT NULL,
    `from_status` VARCHAR(30) NULL,
    `to_status` VARCHAR(30) NULL,
    `operator_type` VARCHAR(20) NOT NULL,
    `operator_id` INTEGER NULL,
    `operator_name` VARCHAR(50) NULL,
    `reason` VARCHAR(500) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `trade_events_order_id_created_at_idx`(`order_id`, `created_at`),
    INDEX `trade_events_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `trade_events_event_type_idx`(`event_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 履约
CREATE TABLE `fulfillments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fulfillment_no` VARCHAR(50) NOT NULL,
    `order_id` INTEGER NOT NULL,
    `status` ENUM('PENDING_PICK', 'PENDING_CHECK', 'PENDING_SHIP', 'SHIPPED', 'DELIVERED', 'ABNORMAL') NOT NULL DEFAULT 'PENDING_PICK',
    `carrier` VARCHAR(50) NULL,
    `tracking_no` VARCHAR(100) NULL,
    `shipped_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `abnormal_reason` VARCHAR(500) NULL,
    `internal_note` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fulfillments_fulfillment_no_key`(`fulfillment_no`),
    INDEX `fulfillments_order_id_idx`(`order_id`),
    INDEX `fulfillments_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. 售后工单
CREATE TABLE `after_sales_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `case_no` VARCHAR(50) NOT NULL,
    `order_id` INTEGER NOT NULL,
    `order_item_id` INTEGER NULL,
    `customer_id` INTEGER NULL,
    `type` ENUM('REFUND', 'EXCHANGE', 'REPAIR') NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'RETURNING', 'QC_PASSED', 'QC_FAILED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `reason` VARCHAR(500) NOT NULL,
    `evidence_urls` JSON NULL,
    `customer_note` TEXT NULL,
    `admin_note` TEXT NULL,
    `requested_refund_amount` DECIMAL(12, 2) NULL,
    `approved_refund_amount` DECIMAL(12, 2) NULL,
    `handled_by` INTEGER NULL,
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `after_sales_cases_case_no_key`(`case_no`),
    INDEX `after_sales_cases_order_id_idx`(`order_id`),
    INDEX `after_sales_cases_status_idx`(`status`),
    INDEX `after_sales_cases_customer_id_idx`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. 退款表扩展：审核链路 + 幂等键 + 售后关联
ALTER TABLE `refunds` ADD COLUMN `requested_by` INTEGER NULL;
ALTER TABLE `refunds` ADD COLUMN `reviewed_by` INTEGER NULL;
ALTER TABLE `refunds` ADD COLUMN `reviewed_at` DATETIME(3) NULL;
ALTER TABLE `refunds` ADD COLUMN `review_note` VARCHAR(500) NULL;
ALTER TABLE `refunds` ADD COLUMN `processed_by` INTEGER NULL;
ALTER TABLE `refunds` ADD COLUMN `completed_at` DATETIME(3) NULL;
ALTER TABLE `refunds` ADD COLUMN `idempotency_key` VARCHAR(64) NULL;
ALTER TABLE `refunds` ADD COLUMN `after_sales_case_id` INTEGER NULL;

-- 退款状态枚举扩展：原 PENDING/PROCESSING/COMPLETED/REJECTED → 新增 APPROVED/FAILED
-- MySQL 枚举变更：用新枚举集合替换（兼容已有数据）。
ALTER TABLE `refunds` MODIFY COLUMN `status` ENUM('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED') NOT NULL DEFAULT 'PENDING';

CREATE UNIQUE INDEX `refunds_idempotency_key_key` ON `refunds`(`idempotency_key`);
CREATE INDEX `refunds_status_idx` ON `refunds`(`status`);
CREATE INDEX `refunds_payment_id_idx` ON `refunds`(`payment_id`);

-- 5. 外键
ALTER TABLE `trade_events` ADD CONSTRAINT `trade_events_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `fulfillments` ADD CONSTRAINT `fulfillments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `after_sales_cases` ADD CONSTRAINT `after_sales_cases_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `after_sales_cases` ADD CONSTRAINT `after_sales_cases_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. 审核/执行人外键（关联 users 表，均为可空）
-- payments.reviewed_by（既有列，补外键）
ALTER TABLE `payments` ADD CONSTRAINT `payments_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- refunds 新列
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_processed_by_fkey` FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- fulfillments 新列
ALTER TABLE `fulfillments` ADD CONSTRAINT `fulfillments_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- after_sales_cases 新列
ALTER TABLE `after_sales_cases` ADD CONSTRAINT `after_sales_cases_handled_by_fkey` FOREIGN KEY (`handled_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
