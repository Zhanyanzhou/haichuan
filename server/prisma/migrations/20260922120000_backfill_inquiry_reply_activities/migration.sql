-- Preserve replies that predate the unified lead activity stream.
-- This migration is append-only and intentionally limited to ordinary inquiries.
INSERT INTO `lead_activities` (
  `lead_id`,
  `type`,
  `content`,
  `contact_method`,
  `created_by`,
  `idempotency_key_hash`,
  `created_at`
)
SELECT
  l.`id`,
  'REPLY',
  TRIM(i.`reply`),
  CASE
    WHEN NULLIF(TRIM(i.`customer_email`), '') IS NOT NULL THEN 'email'
    ELSE 'other'
  END,
  NULL,
  SHA2(CONCAT('legacy-inquiry-reply:', i.`id`), 256),
  COALESCE(i.`replied_at`, i.`updated_at`)
FROM `inquiries` AS i
INNER JOIN `leads` AS l
  ON l.`source_type` = 'INQUIRY'
  AND l.`inquiry_id` = i.`id`
  AND l.`selection_inquiry_id` IS NULL
WHERE NULLIF(TRIM(i.`reply`), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `lead_activities` AS existing_reply
    WHERE existing_reply.`lead_id` = l.`id`
      AND existing_reply.`type` = 'REPLY'
  )
ON DUPLICATE KEY UPDATE
  `idempotency_key_hash` = VALUES(`idempotency_key_hash`);
