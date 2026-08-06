-- CreateTable
CREATE TABLE `analytics_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventName` VARCHAR(50) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `page_path` VARCHAR(300) NULL,
    `product_id` INTEGER NULL,
    `search_term` VARCHAR(200) NULL,
    `source` VARCHAR(50) NULL,
    `device_type` VARCHAR(20) NULL,
    `session_id` VARCHAR(100) NULL,
    `customer_id` INTEGER NULL,
    `metadata` JSON NULL,

    INDEX `analytics_events_eventName_idx`(`eventName`),
    INDEX `analytics_events_occurred_at_idx`(`occurred_at`),
    INDEX `analytics_events_session_id_idx`(`session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
