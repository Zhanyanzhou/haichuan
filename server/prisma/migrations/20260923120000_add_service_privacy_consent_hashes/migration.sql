-- Bind new service-privacy grants to the exact public legal source shown by the
-- current client build. Existing rows stay NULL because their historical body
-- cannot be reconstructed from a version label alone.
ALTER TABLE `inquiries`
  ADD COLUMN `privacy_consent_hash` CHAR(64) NULL;

ALTER TABLE `selection_inquiries`
  ADD COLUMN `privacy_consent_hash` CHAR(64) NULL;

ALTER TABLE `consent_records`
  ADD COLUMN `policy_content_hash` CHAR(64) NULL;
