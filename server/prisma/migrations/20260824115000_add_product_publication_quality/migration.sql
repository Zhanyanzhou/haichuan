-- Product publication quality gate only.
-- Existing products remain quarantined until an operator corrects and
-- republishes each product through the current application-level gate.
-- Rollout phase 1 records this state but does not hide an otherwise published
-- product solely because its quality status is still QUARANTINED. Enforcing
-- READY in customer-facing queries requires a separately approved phase 2.
-- This migration never changes product content, prices, SKU facts, inventory,
-- visibility, publication status, or any commerce/payment capability.

ALTER TABLE `products`
  ADD COLUMN `publication_quality_status` ENUM('QUARANTINED', 'READY') NOT NULL DEFAULT 'QUARANTINED',
  ADD COLUMN `publication_quality_hash` CHAR(64) NULL,
  ADD COLUMN `publication_quality_checked_at` DATETIME(3) NULL,
  ADD INDEX `products_publication_quality_idx`(`status`, `visibility`, `publication_quality_status`);
