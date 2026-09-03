-- AlterTable
ALTER TABLE `analytics_events`
    ADD COLUMN `visitor_id_hash` CHAR(64) NULL,
    ADD COLUMN `country_code` VARCHAR(2) NULL,
    ADD COLUMN `region` VARCHAR(100) NULL,
    ADD COLUMN `city` VARCHAR(100) NULL;

-- CreateIndex
CREATE INDEX `analytics_events_dataset_event_time_idx`
    ON `analytics_events`(`dataset`, `eventName`, `occurred_at`);

-- CreateIndex
CREATE INDEX `analytics_events_dataset_visitor_time_idx`
    ON `analytics_events`(`dataset`, `visitor_id_hash`, `occurred_at`);
