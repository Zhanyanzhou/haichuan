/*
  Warnings:

  - The values [PENDING,APPROVED,REJECTED,OFF_SHELF] on the enum `products_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `products` ADD COLUMN `sales_mode` ENUM('DISPLAY_ONLY', 'SELECTION', 'APPOINTMENT', 'DIRECT_PURCHASE', 'CUSTOM_INQUIRY') NOT NULL DEFAULT 'DISPLAY_ONLY',
    ADD COLUMN `short_description` VARCHAR(500) NULL,
    ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0,
    MODIFY `status` ENUM('DRAFT', 'PUBLISHED', 'OFFLINE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT';
