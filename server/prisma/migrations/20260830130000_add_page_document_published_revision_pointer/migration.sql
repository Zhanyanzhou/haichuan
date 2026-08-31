-- P0 发布安全：只建立 nullable 权威发布指针，不在 migration 中隐式回填或发布页面。
-- 现有数据必须先运行 page-published-revision-backfill 的 dry-run 报告，
-- 再在另行确认的目标环境显式执行 apply。
ALTER TABLE `page_documents`
  ADD COLUMN `published_revision_id` INTEGER NULL;

CREATE INDEX `page_documents_published_revision_id_idx`
  ON `page_documents`(`published_revision_id`);

ALTER TABLE `page_documents`
  ADD CONSTRAINT `page_documents_published_revision_id_fkey`
  FOREIGN KEY (`published_revision_id`)
  REFERENCES `page_document_revisions`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
