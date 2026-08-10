-- DropIndex
DROP INDEX `page_document_revisions_document_id_idx` ON `page_document_revisions`;

-- CreateIndex
CREATE INDEX `page_document_revisions_document_id_version_idx` ON `page_document_revisions`(`document_id`, `version`);
