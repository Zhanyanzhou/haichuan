-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `real_name` VARCHAR(50) NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(100) NULL,
    `avatar` VARCHAR(500) NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'CUSTOMER_SERVICE', 'WAREHOUSE') NOT NULL DEFAULT 'EDITOR',
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `last_login_ip` VARCHAR(50) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(150) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `parent_id` INTEGER NULL,
    `icon` VARCHAR(500) NULL,
    `cover_image` VARCHAR(500) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `seo_title` VARCHAR(200) NULL,
    `seo_desc` VARCHAR(500) NULL,
    `seo_keywords` VARCHAR(300) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `category_id` INTEGER NOT NULL,
    `material_type` ENUM('GOLD_999', 'GOLD_9999', 'AU750', 'PT950', 'S925', 'DIAMOND', 'JADE', 'PEARL', 'COLOR_GEM', 'OTHER') NOT NULL DEFAULT 'GOLD_999',
    `gold_weight` DECIMAL(8, 2) NULL DEFAULT 0,
    `craft_fee` DECIMAL(10, 2) NULL DEFAULT 0,
    `price` DECIMAL(10, 2) NULL DEFAULT 0,
    `price_min` DECIMAL(10, 2) NULL DEFAULT 0,
    `price_max` DECIMAL(10, 2) NULL DEFAULT 0,
    `weight` DECIMAL(8, 2) NULL DEFAULT 0,
    `size` VARCHAR(100) NULL,
    `gem_info` JSON NULL,
    `craft_technique` JSON NULL,
    `status` ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'OFF_SHELF') NOT NULL DEFAULT 'DRAFT',
    `is_hot` BOOLEAN NOT NULL DEFAULT false,
    `is_new` BOOLEAN NOT NULL DEFAULT false,
    `is_recommended` BOOLEAN NOT NULL DEFAULT false,
    `is_limited` BOOLEAN NOT NULL DEFAULT false,
    `is_custom` BOOLEAN NOT NULL DEFAULT false,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `sales_count` INTEGER NOT NULL DEFAULT 0,
    `published_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_code_key`(`code`),
    INDEX `products_category_id_idx`(`category_id`),
    INDEX `products_status_idx`(`status`),
    INDEX `products_material_type_idx`(`material_type`),
    INDEX `products_is_hot_idx`(`is_hot`),
    INDEX `products_category_id_status_idx`(`category_id`, `status`),
    INDEX `products_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `type` ENUM('FRONT', 'SIDE', 'TOP', 'DETAIL', 'WEARING') NOT NULL DEFAULT 'FRONT',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_video` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_skus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `sku_code` VARCHAR(100) NOT NULL,
    `material` ENUM('GOLD_999', 'GOLD_9999', 'AU750', 'PT950', 'S925', 'DIAMOND', 'JADE', 'PEARL', 'COLOR_GEM', 'OTHER') NOT NULL DEFAULT 'GOLD_999',
    `size` VARCHAR(50) NULL,
    `gold_weight` DECIMAL(8, 2) NULL,
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `safety_stock` INTEGER NOT NULL DEFAULT 5,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `product_skus_sku_code_key`(`sku_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_tags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `tag_name` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `product_tags_product_id_tag_name_key`(`product_id`, `tag_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_series` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `cover_image` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `series_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `series_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `series_items_series_id_product_id_key`(`series_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certificates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `cert_type` ENUM('NATIONAL', 'PROVINCIAL', 'GIA', 'OTHER') NOT NULL,
    `cert_number` VARCHAR(100) NOT NULL,
    `cert_image` VARCHAR(500) NULL,
    `expire_date` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gold_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `price` DECIMAL(10, 2) NOT NULL,
    `source` ENUM('AUTO', 'MANUAL') NOT NULL DEFAULT 'AUTO',
    `operator_id` INTEGER NULL,
    `remark` VARCHAR(500) NULL,
    `record_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `gold_prices_record_date_idx`(`record_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `price_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `old_price` DECIMAL(10, 2) NOT NULL,
    `new_price` DECIMAL(10, 2) NOT NULL,
    `gold_price` DECIMAL(10, 2) NOT NULL,
    `operator_id` INTEGER NOT NULL,
    `reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `price_history_product_id_idx`(`product_id`),
    INDEX `price_history_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warehouses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `type` ENUM('SHOWROOM', 'FACTORY', 'STORE') NOT NULL,
    `address` VARCHAR(300) NULL,
    `contact` VARCHAR(50) NULL,
    `phone` VARCHAR(20) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sku_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `safety_stock` INTEGER NOT NULL DEFAULT 5,
    `last_check_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventories_sku_id_warehouse_id_key`(`sku_id`, `warehouse_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_no` VARCHAR(30) NOT NULL,
    `user_id` INTEGER NULL,
    `customer_name` VARCHAR(50) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `customer_email` VARCHAR(100) NULL,
    `address` VARCHAR(500) NOT NULL,
    `total_amount` DECIMAL(12, 2) NOT NULL,
    `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `final_amount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PENDING_PAYMENT', 'PENDING_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_PAYMENT',
    `payment_method` VARCHAR(50) NULL,
    `payment_proof` VARCHAR(500) NULL,
    `logistics_company` VARCHAR(50) NULL,
    `logistics_no` VARCHAR(100) NULL,
    `internal_note` TEXT NULL,
    `locked_gold_price` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `coupon_id` INTEGER NULL,

    UNIQUE INDEX `orders_order_no_key`(`order_no`),
    INDEX `orders_order_no_idx`(`order_no`),
    INDEX `orders_status_idx`(`status`),
    INDEX `orders_customer_phone_idx`(`customer_phone`),
    INDEX `orders_customer_phone_created_at_idx`(`customer_phone`, `created_at`),
    INDEX `orders_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `sku_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `session_id` VARCHAR(100) NULL,
    `sku_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `carts_user_id_idx`(`user_id`),
    INDEX `carts_session_id_idx`(`session_id`),
    INDEX `carts_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inquiries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NULL,
    `customer_name` VARCHAR(50) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `customer_email` VARCHAR(100) NULL,
    `consultation_type` VARCHAR(30) NULL,
    `preferred_contact` VARCHAR(20) NULL,
    `preferred_time` VARCHAR(20) NULL,
    `budget_range` VARCHAR(30) NULL,
    `message` TEXT NOT NULL,
    `privacy_consent` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('PENDING', 'PROCESSING', 'REPLIED', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    `assigned_to` INTEGER NULL,
    `reply` TEXT NULL,
    `replied_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inquiries_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `link` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_user_id_is_read_idx`(`user_id`, `is_read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operation_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `module` VARCHAR(50) NOT NULL,
    `target_id` INTEGER NULL,
    `detail` TEXT NULL,
    `ip` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `operation_logs_user_id_idx`(`user_id`),
    INDEX `operation_logs_module_idx`(`module`),
    INDEX `operation_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_classify_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `image_url` VARCHAR(500) NOT NULL,
    `predicted_category_id` INTEGER NULL,
    `confidence` DECIMAL(5, 2) NULL,
    `confirmed_category_id` INTEGER NULL,
    `operator_id` INTEGER NULL,
    `product_id` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_classify_records_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promotions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `type` ENUM('FULL_REDUCTION', 'DISCOUNT', 'GIFT') NOT NULL,
    `rule` JSON NOT NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `min_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_count` INTEGER NOT NULL DEFAULT 100,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `home_sections` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(30) NOT NULL,
    `title` VARCHAR(200) NULL,
    `subtitle` VARCHAR(300) NULL,
    `content` TEXT NULL,
    `image_url` VARCHAR(500) NULL,
    `video_url` VARCHAR(500) NULL,
    `link_url` VARCHAR(500) NULL,
    `link_text` VARCHAR(50) NULL,
    `settings` JSON NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_slots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slotKey` VARCHAR(100) NOT NULL,
    `pageKey` VARCHAR(50) NOT NULL,
    `sectionKey` VARCHAR(50) NOT NULL,
    `contentType` VARCHAR(20) NOT NULL DEFAULT 'image',
    `desktop_asset` VARCHAR(500) NULL,
    `mobile_asset` VARCHAR(500) NULL,
    `title` VARCHAR(300) NULL,
    `subtitle` VARCHAR(500) NULL,
    `link_url` VARCHAR(500) NULL,
    `alt_text` VARCHAR(200) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `content_slots_slotKey_key`(`slotKey`),
    INDEX `content_slots_pageKey_idx`(`pageKey`),
    INDEX `content_slots_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `page_modules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pageKey` VARCHAR(50) NOT NULL,
    `moduleType` VARCHAR(30) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    `content` JSON NOT NULL,
    `layout_config` JSON NOT NULL,
    `style_config` JSON NOT NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `page_modules_pageKey_idx`(`pageKey`),
    INDEX `page_modules_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_skus` ADD CONSTRAINT `product_skus_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_tags` ADD CONSTRAINT `product_tags_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `series_items` ADD CONSTRAINT `series_items_series_id_fkey` FOREIGN KEY (`series_id`) REFERENCES `product_series`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `series_items` ADD CONSTRAINT `series_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventories` ADD CONSTRAINT `inventories_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `product_skus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventories` ADD CONSTRAINT `inventories_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `product_skus`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carts` ADD CONSTRAINT `carts_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carts` ADD CONSTRAINT `carts_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `product_skus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inquiries` ADD CONSTRAINT `inquiries_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inquiries` ADD CONSTRAINT `inquiries_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_classify_records` ADD CONSTRAINT `ai_classify_records_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
