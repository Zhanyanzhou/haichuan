-- 清扫死表（2026-08-14 审计确认服务端零引用）：
-- product_series / series_items：产品系列功能未上线即废弃，模块与接口不存在
-- price_history：只写不读（金价调价历史无任何消费方，写入代码已随本批删除）
-- notifications：站内信模块已删（无生产者无消费者）
-- home_sections：旧首页 DIY 段落存储，已被 PageDocument（Puck）替代
-- page_templates：页面模板功能未启用，前端无消费方
-- 注意：Drop 前应已确认生产库无手工数据依赖；IF EXISTS 保证幂等。
-- 排序说明：本迁移与 20260814120000_seed_attribute_dictionary 数字时间戳相同（目录名唯一即合法），
-- 字典序排其之前；DROP 的表与属性/标签字典迁移零关联且幂等，执行顺序无功能影响。
DROP TABLE IF EXISTS `series_items`;
DROP TABLE IF EXISTS `product_series`;
DROP TABLE IF EXISTS `price_history`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `home_sections`;
DROP TABLE IF EXISTS `page_templates`;
