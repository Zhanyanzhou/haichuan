CREATE TABLE `personal_content_templates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `owner_id` INTEGER NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `module_type` VARCHAR(100) NOT NULL,
  `contract_key` VARCHAR(50) NOT NULL,
  `contract_version` INTEGER NOT NULL,
  `layout_data` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `personal_content_templates_owner_id_name_key`(`owner_id`, `name`),
  INDEX `personal_content_templates_owner_id_updated_at_idx`(`owner_id`, `updated_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `personal_content_templates`
  ADD CONSTRAINT `personal_content_templates_owner_id_fkey`
  FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
