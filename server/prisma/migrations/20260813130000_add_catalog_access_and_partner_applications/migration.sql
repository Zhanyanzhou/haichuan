-- 受控产品库 + 合作商家体系 + 商品访问审计 + 受控媒体存储标识
-- 重要：本文件由 AI 生成，尚未执行。需由项目负责人在目标环境执行：
--   cd server && npx prisma migrate deploy
-- 或开发环境（会同时触发 prisma generate）：
--   npx prisma migrate dev
--
-- 存量数据迁移规则（任务书第三节 E）：
--   - 所有已发布商品默认迁移为 MEMBER（匿名不可访问）；草稿/下架/归档仍遵从 status，不受影响。
--   - 所有存量客户默认 MEMBER / NONE（不自动升级为合作商家）。
--   - 不修改真实客户联系方式、订单、咨询数据；不删除业务数据。

-- 1. 商品可见范围 visibility（受控产品库核心字段）
ALTER TABLE `products`
  ADD COLUMN `visibility` ENUM('PUBLIC', 'MEMBER', 'PARTNER', 'INTERNAL') NOT NULL DEFAULT 'MEMBER';

-- 存量商品统一迁移为 MEMBER（NOT NULL DEFAULT 已在加列时赋值，此处显式声明以满足任务书语义并兜底）
UPDATE `products` SET `visibility` = 'MEMBER' WHERE `visibility` NOT IN ('PUBLIC', 'MEMBER', 'PARTNER', 'INTERNAL');

CREATE INDEX `products_status_visibility_idx` ON `products`(`status`, `visibility`);
CREATE INDEX `products_category_id_status_visibility_idx` ON `products`(`category_id`, `status`, `visibility`);
CREATE INDEX `products_visibility_idx` ON `products`(`visibility`);

-- 2. 产品图片受控存储标识 storage_key（仅保存相对 private-media/products 的安全键）
ALTER TABLE `product_images`
  ADD COLUMN `storage_key` VARCHAR(300) NULL;

-- 3. 客户合作权限状态（独立于后台 User.Role）
ALTER TABLE `customers`
  ADD COLUMN `account_type` ENUM('MEMBER', 'PARTNER') NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN `partner_status` ENUM('NONE', 'PENDING', 'NEEDS_SUPPLEMENT', 'APPROVED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'NONE',
  ADD COLUMN `partner_approved_at` DATETIME(3) NULL;

-- 存量客户默认 MEMBER / NONE（不自动升级为合作商家）
UPDATE `customers` SET `account_type` = 'MEMBER' WHERE `account_type` NOT IN ('MEMBER', 'PARTNER');
UPDATE `customers` SET `partner_status` = 'NONE' WHERE `partner_status` NOT IN ('NONE', 'PENDING', 'NEEDS_SUPPLEMENT', 'APPROVED', 'REJECTED', 'SUSPENDED');

CREATE INDEX `customers_partner_status_idx` ON `customers`(`partner_status`);

-- 4. 合作商家申请（保留完整历史记录，不覆盖旧版本）
CREATE TABLE `partner_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `applicant_name` VARCHAR(50) NOT NULL,
    `applicant_phone` VARCHAR(20) NOT NULL,
    `company_name` VARCHAR(200) NULL,
    `city` VARCHAR(100) NULL,
    `business_type` VARCHAR(50) NULL,
    `channel_type` VARCHAR(50) NULL,
    `business_description` TEXT NULL,
    `expected_purchase_range` VARCHAR(50) NULL,
    `contact_wechat` VARCHAR(50) NULL,
    `status` ENUM('PENDING', 'NEEDS_SUPPLEMENT', 'APPROVED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
    `review_note` TEXT NULL,
    `reviewer_id` INTEGER NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewed_at` DATETIME(3) NULL,
    `agreement_accepted_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `partner_applications_customer_id_created_at_idx`(`customer_id`, `created_at`),
    INDEX `partner_applications_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. 商品访问审计（服务端可信日志；推荐系统热度来源 + 合作商家访问审计）
CREATE TABLE `product_access_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `event_type` ENUM('DETAIL_VIEW', 'MEDIA_VIEW', 'RECOMMENDATION_IMPRESSION', 'ADD_TO_SELECTION', 'ADD_TO_CART', 'INQUIRY_SUBMITTED', 'ORDER_COMPLETED') NOT NULL DEFAULT 'DETAIL_VIEW',
    `source` VARCHAR(50) NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `product_access_logs_customer_id_product_id_occurred_at_idx`(`customer_id`, `product_id`, `occurred_at`),
    INDEX `product_access_logs_product_id_occurred_at_idx`(`product_id`, `occurred_at`),
    INDEX `product_access_logs_event_type_occurred_at_idx`(`event_type`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. 外键约束
ALTER TABLE `partner_applications`
  ADD CONSTRAINT `partner_applications_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `partner_applications`
  ADD CONSTRAINT `partner_applications_reviewer_id_fkey`
    FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `product_access_logs`
  ADD CONSTRAINT `product_access_logs_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_access_logs`
  ADD CONSTRAINT `product_access_logs_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
