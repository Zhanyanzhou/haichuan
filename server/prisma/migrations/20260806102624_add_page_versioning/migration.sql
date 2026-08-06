-- AlterTable
ALTER TABLE `page_modules` ADD COLUMN `published_content` JSON NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `page_module_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `module_id` INTEGER NOT NULL,
    `pageKey` VARCHAR(50) NOT NULL,
    `moduleType` VARCHAR(30) NOT NULL,
    `content` JSON NOT NULL,
    `layout_config` JSON NOT NULL,
    `style_config` JSON NOT NULL,
    `version` INTEGER NOT NULL,
    `saved_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `page_module_versions_module_id_idx`(`module_id`),
    INDEX `page_module_versions_module_id_version_idx`(`module_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
