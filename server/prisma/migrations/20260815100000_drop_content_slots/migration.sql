-- ContentSlot 死资产清退（2026-08-15）：
-- content_slots：旧首页内容插槽存储，写侧（saveDraft/publish 端点）从未有前端入口，
-- HOME_HERO 插槽永远为空，页面内容已统一由 PageDocument（Puck）承载；
-- 模块/控制器/前端消费方（useContentSlots）已随本批删除。
-- 注意：Drop 前应已确认生产库无手工数据依赖；IF EXISTS 保证幂等。
DROP TABLE IF EXISTS `content_slots`;
