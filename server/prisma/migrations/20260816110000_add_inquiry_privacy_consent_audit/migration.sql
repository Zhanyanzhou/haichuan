-- 保持历史咨询的审计字段为空，不能将旧记录倒填为“已同意”。
ALTER TABLE `inquiries`
    ADD COLUMN `privacy_consent_version` VARCHAR(50) NULL,
    ADD COLUMN `privacy_consented_at` DATETIME(3) NULL;

ALTER TABLE `selection_inquiries`
    ADD COLUMN `privacy_consent` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `privacy_consent_version` VARCHAR(50) NULL,
    ADD COLUMN `privacy_consented_at` DATETIME(3) NULL;
