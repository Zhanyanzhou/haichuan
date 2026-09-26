ALTER TABLE `orders`
  ADD COLUMN `checkout_idempotency_key_hash` CHAR(64) NULL,
  ADD COLUMN `checkout_request_hash` CHAR(64) NULL,
  ADD UNIQUE INDEX `orders_checkout_idempotency_key_hash_key` (`checkout_idempotency_key_hash`);
