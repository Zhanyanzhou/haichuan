-- 成熟交易基础第一阶段：为商品增加正交库存策略。
-- 存量商品统一采用 STANDARD；本迁移不推断、不回填任何 SINGLE_UNIT 商品。
ALTER TABLE `products`
  ADD COLUMN `inventory_policy` ENUM('STANDARD', 'SINGLE_UNIT') NOT NULL DEFAULT 'STANDARD';
