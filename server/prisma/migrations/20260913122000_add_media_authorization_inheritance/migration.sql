-- D.29 phase 1: managed media lifecycle, authorization facts, immutable events,
-- and immutable publication manifests. This migration is intentionally additive.

ALTER TABLE `media_assets`
  ADD COLUMN `lifecycle_revision` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `integrity_checked_at` DATETIME(3) NULL,
  ADD COLUMN `quarantine_reason` VARCHAR(1000) NULL,
  ADD CONSTRAINT `media_assets_lifecycle_revision_check`
    CHECK (`lifecycle_revision` > 0);

CREATE TABLE `media_asset_authorizations` (
  `asset_id` INTEGER NOT NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `public_use_epoch` INTEGER NOT NULL DEFAULT 0,
  `source_type` ENUM(
    'BRAND_OWNED',
    'COMMISSIONED',
    'LICENSED_THIRD_PARTY',
    'PUBLIC_DOMAIN',
    'CUSTOMER_SUPPLIED',
    'AI_GENERATED',
    'LEGACY_UNVERIFIED',
    'OTHER'
  ) NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
  `authorization_basis` TEXT NULL,
  `evidence_reference` VARCHAR(1000) NULL,
  `public_web_use_allowed` BOOLEAN NOT NULL DEFAULT false,
  `review_status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
  `prepared_by` INTEGER NULL,
  `submitted_by` INTEGER NULL,
  `submitted_at` DATETIME(3) NULL,
  `reviewed_by` INTEGER NULL,
  `reviewed_at` DATETIME(3) NULL,
  `review_note` TEXT NULL,
  `valid_from` DATETIME(3) NULL,
  `valid_until` DATETIME(3) NULL,
  `revocation_status` ENUM('ACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  `revoked_by` INTEGER NULL,
  `revoked_at` DATETIME(3) NULL,
  `revocation_reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `media_asset_authorizations_public_eligibility_idx` (`review_status`, `revocation_status`, `public_web_use_allowed`, `valid_until`),
  INDEX `media_asset_authorizations_source_review_idx` (`source_type`, `review_status`),
  CONSTRAINT `media_asset_authorizations_asset_id_fkey`
    FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `media_asset_authorizations_prepared_by_fkey`
    FOREIGN KEY (`prepared_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `media_asset_authorizations_submitted_by_fkey`
    FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `media_asset_authorizations_reviewed_by_fkey`
    FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `media_asset_authorizations_revoked_by_fkey`
    FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `media_asset_authorizations_revision_check`
    CHECK (`revision` > 0 AND `public_use_epoch` >= 0),
  CONSTRAINT `media_asset_authorizations_validity_check`
    CHECK (`valid_until` IS NULL OR `valid_from` IS NULL OR `valid_until` > `valid_from`),
  CONSTRAINT `media_asset_authorizations_review_check`
    CHECK (
      (`review_status` <> 'DRAFT' OR (
        `submitted_by` IS NULL
        AND `submitted_at` IS NULL
        AND `reviewed_by` IS NULL
        AND `reviewed_at` IS NULL
        AND `review_note` IS NULL
      ))
      AND
      (`review_status` <> 'IN_REVIEW' OR (
        `submitted_by` IS NOT NULL
        AND `submitted_at` IS NOT NULL
        AND `reviewed_by` IS NULL
        AND `reviewed_at` IS NULL
        AND `review_note` IS NULL
      ))
      AND
      (`review_status` <> 'APPROVED' OR (
        `public_web_use_allowed` = true
        AND `source_type` <> 'LEGACY_UNVERIFIED'
        AND `authorization_basis` IS NOT NULL
        AND CHAR_LENGTH(TRIM(`authorization_basis`)) > 0
        AND `evidence_reference` IS NOT NULL
        AND CHAR_LENGTH(TRIM(`evidence_reference`)) > 0
        AND `submitted_by` IS NOT NULL
        AND `submitted_at` IS NOT NULL
        AND `reviewed_by` IS NOT NULL
        AND `reviewed_at` IS NOT NULL
        AND `reviewed_by` <> `submitted_by`
      ))
      AND
      (`review_status` <> 'REJECTED' OR (
        `submitted_by` IS NOT NULL
        AND `submitted_at` IS NOT NULL
        AND `reviewed_by` IS NOT NULL
        AND `reviewed_at` IS NOT NULL
        AND `reviewed_by` <> `submitted_by`
        AND `review_note` IS NOT NULL
        AND CHAR_LENGTH(TRIM(`review_note`)) > 0
      ))
    ),
  CONSTRAINT `media_asset_authorizations_revocation_check`
    CHECK (
      (`revocation_status` = 'ACTIVE' AND `revoked_by` IS NULL AND `revoked_at` IS NULL AND `revocation_reason` IS NULL)
      OR
      (`revocation_status` = 'REVOKED' AND `review_status` = 'APPROVED' AND `revoked_by` IS NOT NULL AND `revoked_at` IS NOT NULL AND `revocation_reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`revocation_reason`)) > 0)
    ),
  PRIMARY KEY (`asset_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `media_asset_authorization_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `asset_id` INTEGER NOT NULL,
  `authorization_revision` INTEGER NOT NULL,
  `public_use_epoch` INTEGER NOT NULL,
  `event_type` ENUM(
    'CREATED',
    'UPDATED',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'REVOKED',
    'RENEWED',
    'IMPORTED_LEGACY'
  ) NOT NULL,
  `actor_id` INTEGER NULL,
  `snapshot` JSON NOT NULL,
  `previous_event_hash` CHAR(64) NULL,
  `event_hash` CHAR(64) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `media_auth_events_asset_revision_key` (`asset_id`, `authorization_revision`),
  UNIQUE INDEX `media_asset_authorization_events_event_hash_key` (`event_hash`),
  INDEX `media_auth_events_asset_occurred_idx` (`asset_id`, `occurred_at`),
  INDEX `media_auth_events_actor_occurred_idx` (`actor_id`, `occurred_at`),
  CONSTRAINT `media_asset_authorization_events_asset_id_fkey`
    FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `media_asset_authorization_events_actor_id_fkey`
    FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `media_auth_events_revision_check`
    CHECK (`authorization_revision` > 0 AND `public_use_epoch` >= 0),
  CONSTRAINT `media_auth_events_hash_chain_check`
    CHECK (
      `event_hash` REGEXP '^[0-9A-Fa-f]{64}$'
      AND (`previous_event_hash` IS NULL OR (`previous_event_hash` REGEXP '^[0-9A-Fa-f]{64}$' AND `previous_event_hash` <> `event_hash`))
    ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 授权事件是追加写入的审计事实。无论写入来自 Prisma、脚本还是直接 SQL，
-- 已落库事件都不得被修改或删除；合法 INSERT 不受影响。
CREATE TRIGGER `media_auth_events_immutable_update`
BEFORE UPDATE ON `media_asset_authorization_events`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'media authorization events are immutable';
END;

CREATE TRIGGER `media_auth_events_immutable_delete`
BEFORE DELETE ON `media_asset_authorization_events`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'media authorization events are immutable';
END;

CREATE TABLE `dynamic_template_version_media_assets` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `dynamic_template_version_id` INTEGER NOT NULL,
  `asset_id` INTEGER NOT NULL,
  `reference_key` CHAR(64) NOT NULL,
  `reference_path` VARCHAR(1000) NOT NULL,
  `origin` ENUM('PAGE_INSTANCE', 'PAGE_METADATA', 'TEMPLATE_DEFAULT', 'TEMPLATE_BACKGROUND', 'LEGACY_URL') NOT NULL,
  `asset_lifecycle_revision` INTEGER NOT NULL,
  `authorization_revision` INTEGER NOT NULL,
  `public_use_epoch` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `dynamic_template_version_media_reference_key` (`dynamic_template_version_id`, `reference_key`),
  INDEX `dynamic_template_version_media_asset_idx` (`asset_id`),
  CONSTRAINT `dtv_media_assets_version_fkey`
    FOREIGN KEY (`dynamic_template_version_id`) REFERENCES `dynamic_template_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `dtv_media_assets_asset_fkey`
    FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `dtv_media_assets_revisions_check`
    CHECK (`asset_lifecycle_revision` > 0 AND `authorization_revision` > 0 AND `public_use_epoch` >= 0),
  CONSTRAINT `dtv_media_assets_reference_check`
    CHECK (`reference_key` REGEXP '^[0-9A-Fa-f]{64}$' AND CHAR_LENGTH(TRIM(`reference_path`)) > 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 发布清单与其所属正式版本共同构成历史快照，只允许追加写入。
CREATE TRIGGER `dtv_media_assets_immutable_update`
BEFORE UPDATE ON `dynamic_template_version_media_assets`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'template publication media manifests are immutable';
END;

CREATE TRIGGER `dtv_media_assets_immutable_delete`
BEFORE DELETE ON `dynamic_template_version_media_assets`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'template publication media manifests are immutable';
END;

CREATE TABLE `page_document_revision_media_assets` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `page_document_revision_id` INTEGER NOT NULL,
  `dynamic_template_version_id` INTEGER NULL,
  `asset_id` INTEGER NOT NULL,
  `reference_key` CHAR(64) NOT NULL,
  `reference_path` VARCHAR(1000) NOT NULL,
  `origin` ENUM('PAGE_INSTANCE', 'PAGE_METADATA', 'TEMPLATE_DEFAULT', 'TEMPLATE_BACKGROUND', 'LEGACY_URL') NOT NULL,
  `asset_lifecycle_revision` INTEGER NOT NULL,
  `authorization_revision` INTEGER NOT NULL,
  `public_use_epoch` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `page_document_revision_media_reference_key` (`page_document_revision_id`, `reference_key`),
  INDEX `page_document_revision_media_asset_idx` (`asset_id`),
  INDEX `page_revision_media_template_version_idx` (`dynamic_template_version_id`),
  CONSTRAINT `pdr_media_assets_revision_fkey`
    FOREIGN KEY (`page_document_revision_id`) REFERENCES `page_document_revisions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `pdr_media_assets_template_version_fkey`
    FOREIGN KEY (`dynamic_template_version_id`) REFERENCES `dynamic_template_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `pdr_media_assets_asset_fkey`
    FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `pdr_media_assets_revisions_check`
    CHECK (`asset_lifecycle_revision` > 0 AND `authorization_revision` > 0 AND `public_use_epoch` >= 0),
  CONSTRAINT `pdr_media_assets_reference_check`
    CHECK (`reference_key` REGEXP '^[0-9A-Fa-f]{64}$' AND CHAR_LENGTH(TRIM(`reference_path`)) > 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TRIGGER `pdr_media_assets_immutable_update`
BEFORE UPDATE ON `page_document_revision_media_assets`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'page publication media manifests are immutable';
END;

CREATE TRIGGER `pdr_media_assets_immutable_delete`
BEFORE DELETE ON `page_document_revision_media_assets`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'page publication media manifests are immutable';
END;
