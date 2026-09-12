-- MySQL 不允许 CHECK 约束引用由 ON UPDATE CASCADE 外键控制的列。
-- 先以前向迁移收紧两个来源外键，再由后续交易成熟度迁移添加来源 CHECK。
ALTER TABLE `payment_plans`
  DROP FOREIGN KEY `payment_plans_quotation_version_id_fkey`,
  DROP FOREIGN KEY `payment_plans_order_id_fkey`;

ALTER TABLE `payment_plans`
  ADD CONSTRAINT `payment_plans_quotation_version_id_fkey`
    FOREIGN KEY (`quotation_version_id`) REFERENCES `quotation_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `payment_plans_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
