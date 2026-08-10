-- 客户账号、预约咨询及选款咨询的客户关联
ALTER TABLE `customers`
  ADD COLUMN `password_hash` VARCHAR(255) NULL;

ALTER TABLE `inquiries`
  ADD COLUMN `customer_id` INTEGER NULL,
  ADD INDEX `inquiries_customer_id_created_at_idx`(`customer_id`, `created_at`);

ALTER TABLE `selection_inquiries`
  ADD COLUMN `customer_id` INTEGER NULL,
  ADD INDEX `selection_inquiries_customer_id_created_at_idx`(`customer_id`, `created_at`);

ALTER TABLE `inquiries`
  ADD CONSTRAINT `inquiries_customer_id_fkey`
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `selection_inquiries`
  ADD CONSTRAINT `selection_inquiries_customer_id_fkey`
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
