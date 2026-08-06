/*
  Warnings:

  - You are about to alter the column `status` on the `inquiries` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(10))` to `VarChar(20)`.
  - Added the required column `updated_at` to the `inquiries` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `inquiries` ADD COLUMN `internal_note` TEXT NULL,
    ADD COLUMN `next_follow_up_at` DATETIME(3) NULL,
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL,
    MODIFY `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `selection_inquiries` ADD COLUMN `internal_note` TEXT NULL,
    ADD COLUMN `next_follow_up_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `lead_follow_ups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leadType` VARCHAR(30) NOT NULL,
    `lead_id` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `contact_method` VARCHAR(30) NULL,
    `next_follow_up_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lead_follow_ups_leadType_lead_id_idx`(`leadType`, `lead_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lead_follow_ups` ADD CONSTRAINT `lead_follow_ups_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
