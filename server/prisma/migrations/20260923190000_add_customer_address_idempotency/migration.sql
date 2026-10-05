-- 新增收货地址的响应可能在事务提交后丢失；仅保存客户作用域键摘要和请求摘要，
-- 不持久化调用方原始 Idempotency-Key，也不改写历史地址。
ALTER TABLE `customer_addresses`
  ADD COLUMN `creation_idempotency_key_hash` CHAR(64) NULL,
  ADD COLUMN `creation_request_hash` CHAR(64) NULL;

CREATE UNIQUE INDEX `customer_addresses_creation_idempotency_key_hash_key`
  ON `customer_addresses`(`creation_idempotency_key_hash`);
