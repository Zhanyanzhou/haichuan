/*
  Warnings:

  - You are about to drop the column `role` on the `product_images` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `product_images` DROP COLUMN `role`,
    ADD COLUMN `crop_data` JSON NULL,
    ADD COLUMN `file_size` INTEGER NULL,
    ADD COLUMN `height` INTEGER NULL,
    ADD COLUMN `mime_type` VARCHAR(50) NULL,
    ADD COLUMN `source_image_id` INTEGER NULL,
    ADD COLUMN `width` INTEGER NULL;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `listing_image_id` INTEGER NULL,
    ADD COLUMN `primary_image_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_primary_image_id_fkey` FOREIGN KEY (`primary_image_id`) REFERENCES `product_images`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_listing_image_id_fkey` FOREIGN KEY (`listing_image_id`) REFERENCES `product_images`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_source_image_id_fkey` FOREIGN KEY (`source_image_id`) REFERENCES `product_images`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
