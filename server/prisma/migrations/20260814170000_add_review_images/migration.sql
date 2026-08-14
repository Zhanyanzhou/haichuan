-- 评价晒单图：JSON 数组存公开上传管线的图片 URL（最多 6 张）
ALTER TABLE `product_reviews` ADD COLUMN `images` JSON NULL AFTER `content`;
