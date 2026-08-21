-- CreateTable
CREATE TABLE `shipping_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `carrier` VARCHAR(100) NULL,
    `fee_mode` ENUM('FREE', 'FIXED', 'CONDITIONAL') NOT NULL DEFAULT 'FREE',
    `base_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `remote_surcharge` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `free_shipping_threshold` DECIMAL(10, 2) NULL,
    `excluded_regions` JSON NULL,
    `insured` BOOLEAN NOT NULL DEFAULT true,
    `signature_required` BOOLEAN NOT NULL DEFAULT true,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `shipping_templates_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `products`
    ADD COLUMN `detail_content` JSON NULL,
    ADD COLUMN `purchase_region` ENUM('MAINLAND', 'CROSS_BORDER') NOT NULL DEFAULT 'MAINLAND',
    ADD COLUMN `publish_mode` ENUM('IMMEDIATE', 'SCHEDULED', 'WAREHOUSE') NOT NULL DEFAULT 'WAREHOUSE',
    ADD COLUMN `scheduled_publish_at` DATETIME(3) NULL,
    ADD COLUMN `scheduled_publish_error` VARCHAR(500) NULL,
    ADD COLUMN `fulfillment_type` ENUM('IN_STOCK', 'PREORDER', 'CUSTOM') NOT NULL DEFAULT 'IN_STOCK',
    ADD COLUMN `dispatch_time` ENUM('SAME_DAY', 'WITHIN_24_HOURS', 'WITHIN_48_HOURS', 'OVER_48_HOURS', 'CUSTOM') NOT NULL DEFAULT 'WITHIN_48_HOURS',
    ADD COLUMN `shipping_template_id` INTEGER NULL,
    ADD COLUMN `delivery_methods` JSON NULL,
    ADD COLUMN `requires_insured_shipping` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `requires_signature` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `includes_certificate` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `package_type` VARCHAR(100) NULL,
    ADD COLUMN `custom_lead_time` VARCHAR(100) NULL;

CREATE INDEX `products_publish_mode_scheduled_publish_at_idx` ON `products`(`publish_mode`, `scheduled_publish_at`);
CREATE INDEX `products_shipping_template_id_idx` ON `products`(`shipping_template_id`);

ALTER TABLE `products`
    ADD CONSTRAINT `products_shipping_template_id_fkey`
    FOREIGN KEY (`shipping_template_id`) REFERENCES `shipping_templates`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedData
INSERT INTO `shipping_templates` (
    `name`, `carrier`, `fee_mode`, `base_fee`, `remote_surcharge`,
    `insured`, `signature_required`, `is_default`, `is_active`, `updated_at`
) VALUES (
    '系统模板-珠宝顺丰保价', '顺丰速运', 'FREE', 0, 0,
    true, true, true, true, CURRENT_TIMESTAMP(3)
);
