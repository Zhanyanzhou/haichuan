-- Product publication-quality v3 adds public image type and sort order to the hash.
-- Existing READY rows were checked with an older hash contract and must fail closed
-- until the normal publication-quality gate recomputes their current v3 hash.
UPDATE `products`
SET
  `publication_quality_status` = 'QUARANTINED',
  `publication_quality_hash` = NULL,
  `publication_quality_checked_at` = NULL
WHERE `publication_quality_status` = 'READY';
