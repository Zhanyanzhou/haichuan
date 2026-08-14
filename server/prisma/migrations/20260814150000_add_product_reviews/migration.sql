-- 商品评价（奢侈品体验三件套之三）：先审后展
-- 唯一约束 (order_id, product_id)：一人一单商品一条，防刷评
CREATE TABLE `product_reviews` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `customer_id` INT NOT NULL,
  `order_id` INT NOT NULL,
  `rating` INT NOT NULL,
  `content` TEXT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `reply` TEXT NULL,
  `replied_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `product_reviews_order_id_product_id_key` (`order_id`, `product_id`),
  INDEX `product_reviews_product_id_status_idx` (`product_id`, `status`),
  CONSTRAINT `product_reviews_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_reviews_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_reviews_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
