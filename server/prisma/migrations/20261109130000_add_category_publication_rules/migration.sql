ALTER TABLE `categories` ADD COLUMN `publication_rules` JSON NULL;

ALTER TABLE `products`
    ADD COLUMN `publication_rules_accepted_at` DATETIME(3) NULL,
    ADD COLUMN `fulfillment_confirmed` BOOLEAN NOT NULL DEFAULT false,
    ALTER COLUMN `includes_certificate` SET DEFAULT false;
