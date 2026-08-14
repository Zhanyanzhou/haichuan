-- 基线迁移：products.multi_discount 列此前已存在于数据库（非迁移历史创建），
-- 此处仅补录迁移记录，使 prisma migrate 不再因漂移要求重置数据库。
ALTER TABLE `products` ADD COLUMN `multi_discount` BOOLEAN NOT NULL DEFAULT false;
