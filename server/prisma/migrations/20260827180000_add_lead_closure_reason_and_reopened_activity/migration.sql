-- Keep the committed unified lead migration immutable. Add the closure audit
-- fields required by the current Lead model in an append-only migration.
ALTER TABLE `leads`
  ADD COLUMN `closure_reason` TEXT NULL AFTER `internal_note`;

ALTER TABLE `lead_activities`
  MODIFY COLUMN `type` ENUM(
    'CREATED',
    'ASSIGNED',
    'STATUS_CHANGED',
    'REOPENED',
    'FOLLOW_UP',
    'REPLY',
    'NOTE'
  ) NOT NULL;

-- Preserve the legacy terminal-state note as the initial closure reason.
-- Only fill empty values so an explicitly recorded reason is never replaced.
UPDATE `leads` AS `l`
LEFT JOIN `inquiries` AS `i` ON `i`.`id` = `l`.`inquiry_id`
LEFT JOIN `selection_inquiries` AS `s`
  ON `s`.`id` = `l`.`selection_inquiry_id`
SET `l`.`closure_reason` = CASE
  WHEN `l`.`source_type` = 'INQUIRY' THEN `i`.`internal_note`
  WHEN `l`.`source_type` = 'SELECTION_INQUIRY' THEN `s`.`internal_note`
  ELSE NULL
END
WHERE `l`.`status` IN ('COMPLETED', 'INVALID')
  AND `l`.`closure_reason` IS NULL;
