-- 后台首次创建报价草稿可能在事务提交后丢失响应；仅保存员工作用域键哈希与完整请求摘要，
-- 不持久化调用方原始 Idempotency-Key。
ALTER TABLE `quotations`
  ADD COLUMN `creation_idempotency_key_hash` CHAR(64) NULL,
  ADD COLUMN `creation_request_hash` CHAR(64) NULL,
  ADD UNIQUE INDEX `quotations_creation_idempotency_key_hash_key` (`creation_idempotency_key_hash`);
