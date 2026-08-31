-- Successful template activation records are immutable audit/idempotency facts.
-- Page documents, revisions and schemes are upgraded by the application in the
-- same transaction; this migration performs no data backfill.

CREATE TABLE `dynamic_template_activations` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `dynamic_template_id` INTEGER NOT NULL,
  `from_version` INTEGER NOT NULL,
  `to_version` INTEGER NOT NULL,
  `expected_draft_revision` INTEGER NOT NULL,
  `draft_checksum` CHAR(64) NOT NULL,
  `impact_hash` CHAR(64) NOT NULL,
  `idempotency_key_hash` CHAR(64) NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `affected_document_count` INTEGER NOT NULL,
  `affected_draft_instance_count` INTEGER NOT NULL,
  `affected_published_instance_count` INTEGER NOT NULL,
  `affected_scheme_count` INTEGER NOT NULL,
  `affected_scheme_instance_count` INTEGER NOT NULL,
  `created_page_revision_count` INTEGER NOT NULL,
  `result_summary` JSON NOT NULL,
  `activated_by_id` INTEGER NULL,
  `activated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `dynamic_template_activations_idempotency_key_hash_key`(`idempotency_key_hash`),
  UNIQUE INDEX `dynamic_template_activations_dynamic_template_id_to_version_key`(`dynamic_template_id`, `to_version`),
  INDEX `dynamic_template_activations_template_activated_idx`(`dynamic_template_id`, `activated_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dynamic_template_activations`
  ADD CONSTRAINT `dynamic_template_activations_dynamic_template_id_fkey`
  FOREIGN KEY (`dynamic_template_id`) REFERENCES `dynamic_templates`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `dynamic_template_activations_activated_by_id_fkey`
  FOREIGN KEY (`activated_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
