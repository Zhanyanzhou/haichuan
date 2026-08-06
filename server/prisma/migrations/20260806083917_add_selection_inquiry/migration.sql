-- CreateTable
CREATE TABLE `selection_inquiries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_name` VARCHAR(50) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(100) NULL,
    `wechat` VARCHAR(50) NULL,
    `message` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `handled_by` INTEGER NULL,
    `handled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `selection_inquiries_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `selection_inquiry_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `selection_inquiry_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `product_name_snapshot` VARCHAR(200) NOT NULL,
    `product_sku_snapshot` VARCHAR(100) NULL,
    `product_image_snapshot` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `selection_inquiries` ADD CONSTRAINT `selection_inquiries_handled_by_fkey` FOREIGN KEY (`handled_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `selection_inquiry_items` ADD CONSTRAINT `selection_inquiry_items_selection_inquiry_id_fkey` FOREIGN KEY (`selection_inquiry_id`) REFERENCES `selection_inquiries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `selection_inquiry_items` ADD CONSTRAINT `selection_inquiry_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
