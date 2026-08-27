export type ReleaseProfile = "lead-generation" | "commerce";

export function parseReleaseProfile(value?: string): ReleaseProfile {
  const profile = value?.trim() || "lead-generation";
  if (profile !== "lead-generation" && profile !== "commerce") {
    throw new Error("unsupported release profile");
  }
  return profile;
}

/** 运行时采用安全默认：只有显式 commerce 才允许公开直购商品事实。 */
export function isCommerceReleaseProfile(value = process.env.RELEASE_PROFILE) {
  return value?.trim() === "commerce";
}

/**
 * 客户交易只有在“交易发布档位”和“交易功能开关”同时显式开启时才可用。
 * 这样 lead-generation 候选即使误配 CUSTOMER_COMMERCE_ENABLED=true 也会保持关闭。
 */
export function isCommerceFeatureEnabled(
  releaseProfile: string | undefined,
  featureFlag: string | undefined,
) {
  return (
    isCommerceReleaseProfile(releaseProfile) &&
    featureFlag?.trim().toLowerCase() === "true"
  );
}

export function isCustomerCommerceEnabled(
  releaseProfile = process.env.RELEASE_PROFILE,
  commerceFlag = process.env.CUSTOMER_COMMERCE_ENABLED,
) {
  return isCommerceFeatureEnabled(releaseProfile, commerceFlag);
}

/**
 * 合作申请写能力独立于交易档位，缺失或非严格 true 时一律关闭。
 * 读取既有申请与合作资格不受影响，便于安全暂停期间继续服务存量客户。
 */
export function isPartnerApplicationsWriteEnabled(
  value = process.env.PARTNER_APPLICATIONS_WRITE_ENABLED,
) {
  return value?.trim().toLowerCase() === "true";
}

export function customerFacingReleaseWhere() {
  return isCommerceReleaseProfile()
    ? {}
    : { NOT: { salesMode: "DIRECT_PURCHASE" as const } };
}
