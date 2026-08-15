-- CreateTable
CREATE TABLE `page_schemes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pageKey` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `puckData` JSON NOT NULL,
    `metadata` JSON NOT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `page_schemes_pageKey_idx`(`pageKey`),
    UNIQUE INDEX `page_schemes_pageKey_name_key`(`pageKey`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
