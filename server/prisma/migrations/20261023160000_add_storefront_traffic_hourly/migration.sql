-- CreateTable
CREATE TABLE `storefront_traffic_hourly` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `traffic_date` CHAR(10) NOT NULL,
    `hour` TINYINT UNSIGNED NOT NULL,
    `page_path` VARCHAR(300) NOT NULL,
    `views` INTEGER NOT NULL DEFAULT 0,
    `visitors` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `storefront_traffic_bucket_key`(`traffic_date`, `hour`, `page_path`),
    INDEX `storefront_traffic_hourly_date_hour_idx`(`traffic_date`, `hour`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
