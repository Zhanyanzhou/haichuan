-- DropIndex
DROP INDEX `analytics_events_eventName_idx` ON `analytics_events`;

-- CreateTable
CREATE TABLE `attributes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(50) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_filterable` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `attributes_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attribute_values` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `attribute_id` INTEGER NOT NULL,
    `value` VARCHAR(100) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `attribute_values_attribute_id_value_key`(`attribute_id`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_attribute_values` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `attribute_value_id` INTEGER NOT NULL,

    UNIQUE INDEX `product_attribute_values_product_id_attribute_value_id_key`(`product_id`, `attribute_value_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `analytics_events_eventName_occurred_at_idx` ON `analytics_events`(`eventName`, `occurred_at`);

-- CreateIndex
CREATE INDEX `inquiries_created_at_idx` ON `inquiries`(`created_at`);

-- CreateIndex
CREATE INDEX `orders_created_at_idx` ON `orders`(`created_at`);

-- CreateIndex
CREATE INDEX `orders_status_created_at_idx` ON `orders`(`status`, `created_at`);

-- CreateIndex
CREATE INDEX `selection_inquiries_created_at_idx` ON `selection_inquiries`(`created_at`);

-- AddForeignKey
ALTER TABLE `attribute_values` ADD CONSTRAINT `attribute_values_attribute_id_fkey` FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_attribute_values` ADD CONSTRAINT `product_attribute_values_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_attribute_values` ADD CONSTRAINT `product_attribute_values_attribute_value_id_fkey` FOREIGN KEY (`attribute_value_id`) REFERENCES `attribute_values`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
