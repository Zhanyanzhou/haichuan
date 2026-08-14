-- 客户收藏（心愿单）：奢侈品体验三件套之一
-- 一人一作品唯一约束在应用层幂等（toggle）之外再兜底防重复
CREATE TABLE `customer_favorites` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customer_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_favorites_customer_id_product_id_key` (`customer_id`, `product_id`),
  INDEX `customer_favorites_product_id_idx` (`product_id`),
  CONSTRAINT `customer_favorites_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customer_favorites_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
