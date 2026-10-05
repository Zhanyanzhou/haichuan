-- 客户售后创建的响应可能在事务提交后丢失；只保存作用域哈希与请求指纹，
-- 不持久化调用方原始 Idempotency-Key。
ALTER TABLE `after_sales_cases`
  ADD COLUMN `idempotency_key_hash` CHAR(64) NULL,
  ADD COLUMN `submission_fingerprint` CHAR(64) NULL;

CREATE UNIQUE INDEX `after_sales_cases_idempotency_key_hash_key`
  ON `after_sales_cases`(`idempotency_key_hash`);
