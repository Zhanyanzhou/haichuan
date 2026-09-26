-- 到期匿名化批次可能在提交后丢失 CLI 响应；保存同一操作凭据的无 PII 结果，
-- 使显式恢复只能返回原批次，不能静默继续处理下一批。
CREATE TABLE `lead_retention_disposition_runs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `idempotency_key_hash` CHAR(64) NOT NULL,
  `operation_fingerprint` CHAR(64) NOT NULL,
  `actor_id` INTEGER NOT NULL,
  `limit` INTEGER NOT NULL,
  `as_of` DATETIME(3) NOT NULL,
  `requested` INTEGER NOT NULL,
  `anonymized` INTEGER NOT NULL,
  `skipped` JSON NOT NULL,
  `eligible_remaining` INTEGER NOT NULL,
  `complete` BOOLEAN NOT NULL,
  `operation_log_id` INTEGER NOT NULL,
  `candidate_set_sha256` CHAR(64) NOT NULL,
  `policy_approval_reference_sha256` CHAR(64) NOT NULL,
  `policy_version` VARCHAR(50) NOT NULL,
  `policy_fingerprint_sha256` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `lead_retention_runs_idempotency_key_hash_key` (`idempotency_key_hash`),
  UNIQUE INDEX `lead_retention_runs_operation_log_id_key` (`operation_log_id`),
  INDEX `lead_retention_runs_actor_created_idx` (`actor_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `lead_retention_disposition_runs`
  ADD CONSTRAINT `lead_retention_runs_actor_id_fkey`
  FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
