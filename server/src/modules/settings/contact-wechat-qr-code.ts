/** 微信加好友码只引用既有受控图片库；实际公开读取继续由媒体授权门禁决定。 */
export function isSafeContactWechatQrCode(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 500
    && (value === ''
      || /^\/uploads\/page-assets\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)
      || /^\/api\/upload\/public-media\/[1-9]\d*$/.test(value));
}
