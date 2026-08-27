-- Additive privacy-disposition metadata for the canonical Lead pipeline.
-- This migration does not anonymize, delete or rewrite any existing business row.

ALTER TABLE `leads`
  ADD COLUMN `legal_hold_at` DATETIME(3) NULL,
  ADD COLUMN `legal_hold_reason` VARCHAR(50) NULL,
  ADD COLUMN `legal_hold_by` INTEGER NULL,
  ADD COLUMN `privacy_disposition` ENUM('ANONYMIZED') NULL,
  ADD COLUMN `privacy_disposed_at` DATETIME(3) NULL,
  ADD COLUMN `privacy_disposed_by` INTEGER NULL;

CREATE INDEX `leads_retention_until_legal_hold_at_privacy_disposed_at_idx`
  ON `leads`(`retention_until`, `legal_hold_at`, `privacy_disposed_at`);
CREATE INDEX `leads_legal_hold_by_legal_hold_at_idx`
  ON `leads`(`legal_hold_by`, `legal_hold_at`);
CREATE INDEX `leads_privacy_disposed_by_privacy_disposed_at_idx`
  ON `leads`(`privacy_disposed_by`, `privacy_disposed_at`);

ALTER TABLE `leads`
  ADD CONSTRAINT `leads_legal_hold_by_fkey`
    FOREIGN KEY (`legal_hold_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `leads_privacy_disposed_by_fkey`
    FOREIGN KEY (`privacy_disposed_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
