-- Historical /uploads product-media guards query by the exact legacy URL on every candidate request.
-- Keep that authorization lookup indexed so anonymous misses cannot force a full product_images scan.
-- Require online DDL explicitly so this migration fails closed instead of silently taking a blocking table lock.
ALTER TABLE `product_images`
  ADD INDEX `product_images_url_idx` (`url`),
  ALGORITHM=INPLACE,
  LOCK=NONE;
