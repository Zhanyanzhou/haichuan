-- 模板组件库可选预览图：身份级元数据，不进入模板定义或客户前台。
ALTER TABLE `dynamic_templates`
  ADD COLUMN `catalog_cover_url` VARCHAR(500) NULL AFTER `source_reference`;
