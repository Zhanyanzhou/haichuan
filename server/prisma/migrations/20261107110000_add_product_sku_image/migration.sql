ALTER TABLE `product_skus`
  ADD COLUMN `image_id` INTEGER NULL,
  ADD INDEX `product_skus_image_id_idx` (`image_id`),
  ADD CONSTRAINT `product_skus_image_id_fkey`
    FOREIGN KEY (`image_id`) REFERENCES `product_images` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
