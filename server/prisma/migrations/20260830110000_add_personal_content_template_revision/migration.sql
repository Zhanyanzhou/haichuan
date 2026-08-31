-- Legacy personal templates remain read-only during the unified V2 migration.
-- Some isolated/staged databases received this revision column through the
-- earlier application fallback, so both known start states must converge.
SET @personal_template_revision_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'personal_content_templates'
    AND `COLUMN_NAME` = 'revision'
);
SET @personal_template_revision_statement = IF(
  @personal_template_revision_exists = 0,
  'ALTER TABLE `personal_content_templates` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE personal_template_revision_migration FROM @personal_template_revision_statement;
EXECUTE personal_template_revision_migration;
DEALLOCATE PREPARE personal_template_revision_migration;
