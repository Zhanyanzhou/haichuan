/**
 * 公开表单同意记录的服务端版本标识。
 *
 * 该值只由服务端落库，客户端不得自行决定版本或时间。更新隐私说明时，
 * 应先同步更新公开说明中的版本标识，再提升该常量并完成发布验收。
 */
export const PRIVACY_CONSENT_VERSION = "privacy-v2";

/**
 * 当前公开隐私说明的法律来源哈希。
 *
 * 该值与发布快照的 public-legal-source-v1 算法一致，覆盖经营主体来源、
 * 隐私页源码和公开法律页投影。公开表单必须提交同一哈希，服务端只接受
 * 当前值并负责落库；修改隐私页或经营主体来源后，目标合同会要求同步提升。
 */
export const PRIVACY_CONSENT_CONTENT_HASH =
  "ff2db381714488dffef106eba605554fb9d59044b1eb52c437ebf5b384941720";
