-- CreateTable
CREATE TABLE `page_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pageKey` VARCHAR(50) NOT NULL,
    `schemaVersion` INTEGER NOT NULL DEFAULT 1,
    `editorType` VARCHAR(30) NOT NULL DEFAULT 'puck',
    `editorVersion` VARCHAR(30) NULL,
    `template_id` VARCHAR(50) NULL,
    `template_version` INTEGER NULL,
    `puckData` JSON NOT NULL,
    `metadata` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    `published_at` DATETIME(3) NULL,
    `published_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `page_documents_pageKey_key`(`pageKey`),
    INDEX `page_documents_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `page_document_revisions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `puckData` JSON NOT NULL,
    `metadata` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'published',
    `published_by` INTEGER NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `page_document_revisions_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `page_templates` (
    `id` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `pageType` VARCHAR(30) NOT NULL DEFAULT 'custom',
    `defaultPuckData` JSON NOT NULL,
    `allowedBlockTypes` JSON NOT NULL,
    `lockedComponents` JSON NOT NULL,
    `permissions` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
