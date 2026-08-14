-- 预置标准商品属性字典（材质/工艺/尺寸/场景）。
-- 金重为数值型（Decimal），筛选时按重量区间派生，不进字典。
INSERT INTO `attributes` (`key`, `name`, `sort_order`, `is_filterable`, `is_active`, `created_at`, `updated_at`) VALUES
('material', '材质', 1, 1, 1, NOW(), NOW()),
('craft', '工艺', 2, 1, 1, NOW(), NOW()),
('size', '尺寸', 3, 1, 1, NOW(), NOW()),
('scene', '场景', 4, 1, 1, NOW(), NOW());

INSERT INTO `attribute_values` (`attribute_id`, `value`, `sort_order`, `is_active`)
SELECT a.id, v.value, v.sort_order, 1
FROM (
  SELECT 'material' AS k, '足金999' AS value, 1 AS sort_order
  UNION ALL SELECT 'material', '足金9999', 2
  UNION ALL SELECT 'material', '18K金', 3
  UNION ALL SELECT 'material', '铂金950', 4
  UNION ALL SELECT 'material', '银925', 5
  UNION ALL SELECT 'material', '镶钻', 6
  UNION ALL SELECT 'material', '玉石', 7
  UNION ALL SELECT 'material', '珍珠', 8
  UNION ALL SELECT 'material', '彩宝', 9
  UNION ALL SELECT 'craft', '古法金', 1
  UNION ALL SELECT 'craft', '3D硬金', 2
  UNION ALL SELECT 'craft', '花丝', 3
  UNION ALL SELECT 'craft', '錾刻', 4
  UNION ALL SELECT 'craft', '镂空', 5
  UNION ALL SELECT 'craft', '镶嵌', 6
  UNION ALL SELECT 'craft', '抛光', 7
  UNION ALL SELECT 'craft', '拉丝', 8
  UNION ALL SELECT 'craft', '喷砂', 9
  UNION ALL SELECT 'size', '实心', 1
  UNION ALL SELECT 'size', '空心', 2
  UNION ALL SELECT 'size', '开口', 3
  UNION ALL SELECT 'size', '闭口', 4
  UNION ALL SELECT 'size', '耳针', 5
  UNION ALL SELECT 'size', '耳钩', 6
  UNION ALL SELECT 'scene', '日常佩戴', 1
  UNION ALL SELECT 'scene', '婚嫁', 2
  UNION ALL SELECT 'scene', '赠礼', 3
  UNION ALL SELECT 'scene', '收藏', 4
  UNION ALL SELECT 'scene', '传承', 5
) AS v
JOIN `attributes` AS a ON a.`key` = v.k;
