-- Product publication-quality v4 changes the hash contract version.
-- Existing READY rows were checked with the v3 contract and must fail closed
-- until the normal publication-quality gate recomputes their current v4 hash.
UPDATE `products`
SET
  `publication_quality_status` = 'QUARANTINED',
  `publication_quality_hash` = NULL,
  `publication_quality_checked_at` = NULL
WHERE `publication_quality_status` = 'READY';
