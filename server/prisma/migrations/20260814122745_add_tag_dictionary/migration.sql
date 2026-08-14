-- 1. 创建标签字典表
CREATE TABLE `tags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `group` VARCHAR(50) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tags_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 将既有标签名去重迁入字典
INSERT INTO `tags` (`name`, `slug`, `sort_order`, `is_active`, `created_at`, `updated_at`)
SELECT `tag_name`, `tag_name`, 0, true, NOW(3), NOW(3)
FROM `product_tags`
GROUP BY `tag_name`;

-- 3. 增加可空的 tag_id
ALTER TABLE `product_tags` ADD COLUMN `tag_id` INTEGER NULL;

-- 4. 回填 tag_id
UPDATE `product_tags` pt
JOIN `tags` t ON pt.`tag_name` = t.`name`
SET pt.`tag_id` = t.`id`;

-- 5. 先删旧 product_id 外键（它依赖旧唯一索引，必须先删才能删索引）
ALTER TABLE `product_tags` DROP FOREIGN KEY `product_tags_product_id_fkey`;

-- 6. 删旧唯一索引
ALTER TABLE `product_tags` DROP INDEX `product_tags_product_id_tag_name_key`;

-- 7. 删旧列 + tag_id 非空
ALTER TABLE `product_tags` DROP COLUMN `tag_name`,
    MODIFY `tag_id` INTEGER NOT NULL;

-- 8. tag_id 索引（tag_id 外键需要）
CREATE INDEX `product_tags_tag_id_idx` ON `product_tags`(`tag_id`);

-- 9. 新唯一索引
CREATE UNIQUE INDEX `product_tags_product_id_tag_id_key` ON `product_tags`(`product_id`, `tag_id`);

-- 10. 重建 product_id 外键
ALTER TABLE `product_tags` ADD CONSTRAINT `product_tags_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 11. tag_id 外键
ALTER TABLE `product_tags` ADD CONSTRAINT `product_tags_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
