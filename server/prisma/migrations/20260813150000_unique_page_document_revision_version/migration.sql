-- 同一页面文档的发布版本号必须唯一，作为并发发布锁之外的数据库最终防线。
DROP INDEX `page_document_revisions_document_id_version_idx` ON `page_document_revisions`;

CREATE UNIQUE INDEX `page_document_revisions_document_id_version_key`
ON `page_document_revisions`(`document_id`, `version`);
