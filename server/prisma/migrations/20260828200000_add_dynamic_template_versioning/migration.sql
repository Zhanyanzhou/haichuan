-- Dynamic template persistence is additive. Existing personal templates, page
-- documents, revisions and renderers remain untouched and require no backfill.

CREATE TABLE `dynamic_templates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `template_id` VARCHAR(128) NOT NULL,
  `owner_id` INTEGER NULL,
  `source_type` ENUM('SYSTEM', 'CUSTOM') NOT NULL DEFAULT 'CUSTOM',
  `visibility` ENUM('PRIVATE', 'STAFF') NOT NULL DEFAULT 'PRIVATE',
  `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `name` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `purpose` VARCHAR(100) NOT NULL,
  `layout_type` VARCHAR(50) NOT NULL,
  `description` TEXT NULL,
  `slot_summary` VARCHAR(200) NOT NULL,
  `recommended_for` JSON NOT NULL,
  `tags` JSON NOT NULL,
  `definition_schema_version` INTEGER NOT NULL,
  `published_version` INTEGER NOT NULL DEFAULT 0,
  `source_reference` VARCHAR(128) NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `dynamic_templates_template_id_key`(`template_id`),
  UNIQUE INDEX `dynamic_templates_owner_id_name_key`(`owner_id`, `name`),
  INDEX `dynamic_templates_owner_id_status_updated_at_idx`(`owner_id`, `status`, `updated_at`),
  INDEX `dynamic_templates_visibility_status_updated_at_idx`(`visibility`, `status`, `updated_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dynamic_template_drafts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `dynamic_template_id` INTEGER NOT NULL,
  `base_version` INTEGER NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `definition` JSON NOT NULL,
  `definition_checksum` CHAR(64) NOT NULL,
  `version_note` VARCHAR(500) NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `dynamic_template_drafts_dynamic_template_id_key`(`dynamic_template_id`),
  INDEX `dynamic_template_drafts_updated_at_idx`(`updated_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dynamic_template_versions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `dynamic_template_id` INTEGER NOT NULL,
  `version` INTEGER NOT NULL,
  `schema_version` INTEGER NOT NULL,
  `definition` JSON NOT NULL,
  `definition_checksum` CHAR(64) NOT NULL,
  `version_note` VARCHAR(500) NULL,
  `published_by_id` INTEGER NULL,
  `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `dynamic_template_versions_dynamic_template_id_version_key`(`dynamic_template_id`, `version`),
  INDEX `dynamic_template_versions_dynamic_template_id_published_at_idx`(`dynamic_template_id`, `published_at`),
  INDEX `dynamic_template_versions_definition_checksum_idx`(`definition_checksum`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dynamic_templates`
  ADD CONSTRAINT `dynamic_templates_owner_id_fkey`
  FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `dynamic_template_drafts`
  ADD CONSTRAINT `dynamic_template_drafts_dynamic_template_id_fkey`
  FOREIGN KEY (`dynamic_template_id`) REFERENCES `dynamic_templates`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `dynamic_template_drafts_updated_by_id_fkey`
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `dynamic_template_versions`
  ADD CONSTRAINT `dynamic_template_versions_dynamic_template_id_fkey`
  FOREIGN KEY (`dynamic_template_id`) REFERENCES `dynamic_templates`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `dynamic_template_versions_published_by_id_fkey`
  FOREIGN KEY (`published_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
