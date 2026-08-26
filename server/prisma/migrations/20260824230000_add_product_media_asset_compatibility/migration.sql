-- CreateTable
CREATE TABLE `media_assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storage_key` VARCHAR(300) NOT NULL,
    `original_name` VARCHAR(255) NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `byte_size` INTEGER NOT NULL,
    `checksum_sha256` CHAR(64) NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `duration_ms` INTEGER NULL,
    `alt_text` VARCHAR(500) NULL,
    `locale` ENUM('zh-CN', 'en') NULL,
    `access_level` ENUM('PUBLIC', 'CUSTOMER', 'STAFF', 'PRIVATE') NOT NULL DEFAULT 'PRIVATE',
    `status` ENUM('PENDING', 'READY', 'QUARANTINED', 'ARCHIVED') NOT NULL DEFAULT 'PENDING',
    `uploaded_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_assets_storage_key_key`(`storage_key`),
    INDEX `media_assets_checksum_sha256_idx`(`checksum_sha256`),
    INDEX `media_assets_status_access_level_idx`(`status`, `access_level`),
    INDEX `media_assets_uploaded_by_idx`(`uploaded_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `product_images`
    ADD COLUMN `media_asset_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `media_assets`
    ADD CONSTRAINT `media_assets_uploaded_by_fkey`
    FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_images`
    ADD CONSTRAINT `product_images_media_asset_id_fkey`
    FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
