-- 微信开放平台扫码登录：客户微信身份绑定（openid 唯一，unionid 同开放平台账号跨应用一致）
-- 未扫码绑定前均为 NULL，不影响既有手机号/密码登录。
ALTER TABLE `customers`
    ADD COLUMN `wechat_open_id` VARCHAR(64) NULL,
    ADD COLUMN `wechat_union_id` VARCHAR(64) NULL;

CREATE UNIQUE INDEX `customers_wechat_open_id_key` ON `customers`(`wechat_open_id`);
