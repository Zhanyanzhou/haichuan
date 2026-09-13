export const RELEASE_PROFILES = ["lead-generation", "commerce"] as const;
export type ReleaseProfile = (typeof RELEASE_PROFILES)[number];
export const DEFAULT_RELEASE_PROFILE: ReleaseProfile = RELEASE_PROFILES[0];
export const COMMERCE_RELEASE_PROFILE: ReleaseProfile = RELEASE_PROFILES[1];

export const RELEASE_RUNTIME_GATE_KEYS = [
  "customer-commerce",
  "customer-quotation-ordering",
  "payment-gateway-transactions",
  "payment-gateway-refunds",
] as const;
export type ReleaseRuntimeGateKey = (typeof RELEASE_RUNTIME_GATE_KEYS)[number];

export type ReleaseRuntimeGateEnvironment = {
  CUSTOMER_COMMERCE_ENABLED?: string;
  CUSTOMER_QUOTATION_ORDERING_ENABLED?: string;
  PAYMENT_GATEWAY_TRANSACTIONS_ENABLED?: string;
  PAYMENT_GATEWAY_REFUNDS_ENABLED?: string;
};

export type ReleaseRuntimeGateEvaluation = {
  capability: ReleaseRuntimeGateKey;
  environmentVariable: keyof ReleaseRuntimeGateEnvironment;
  configuredEnabled: boolean;
  effectiveEnabled: boolean;
  requiredEnabled: boolean;
  ready: boolean;
};

export const COMMERCE_CODE_READINESS = [
  {
    capability: "frontend-payment-visibility-contract",
    ready: false,
    summary:
      "公开 flags 已区分报价确认、客户交易和支付网关门禁；尚缺生产 React/Nginx 与真实 Chrome 对开关组合的隔离验收",
  },
  {
    capability: "three-quotation-channels",
    ready: false,
    summary:
      "零售、定制和合作蜡模的版本、价格、设计与资源门禁代码已接线；尚缺三通道真实 MySQL/Nest/UI 全旅程证据",
  },
  {
    capability: "customer-self-confirmation-entry",
    ready: false,
    summary:
      "客户本人读取、文件确认和报价成交 HTTP 入口已由客户认证保护；尚缺真实客户隔离、权限失败与重启回读证据",
  },
  {
    capability: "transactional-quotation-conversion-entry",
    ready: false,
    summary:
      "三通道已接入 Serializable 同事务转单、幂等键和请求哈希；尚缺真实数据库并发、重复请求及回滚矩阵证据",
  },
  {
    capability: "inventory-and-price-snapshots",
    ready: false,
    summary:
      "零售库存、定制与合作资源预占、不可变报价及订单交易快照代码已建立；尚缺真实数据库逐字段和服务重启验收",
  },
  {
    capability: "payment-refund-reconciliation-code",
    ready: true,
    summary:
      "支付、原路退款、回调/查单和掉单对账代码链已建立；真实渠道、凭据、回调与资金验收仍由生产证据门禁裁决",
  },
] as const;

export function parseReleaseProfile(value?: string): ReleaseProfile {
  const profile = value?.trim() || DEFAULT_RELEASE_PROFILE;
  if (!RELEASE_PROFILES.includes(profile as ReleaseProfile)) {
    throw new Error("unsupported release profile");
  }
  return profile as ReleaseProfile;
}

/** 运行时采用安全默认：只有显式 commerce 才允许公开直购商品事实。 */
export function isCommerceReleaseProfile(value = process.env.RELEASE_PROFILE) {
  return value?.trim() === COMMERCE_RELEASE_PROFILE;
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

function isExplicitlyEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

/**
 * 发布候选的运行门禁画像。
 *
 * runtime 会继续以 profile + 单项开关共同裁决；候选门禁额外要求配置意图
 * 与所选 profile 一致，避免 lead-generation 携带预先打开的危险开关，也避免
 * commerce 在前台入口与支付/退款后端仍关闭时被误报为 ready。
 */
export function evaluateReleaseRuntimeGates(
  releaseProfile: ReleaseProfile,
  environment: ReleaseRuntimeGateEnvironment = process.env,
): ReleaseRuntimeGateEvaluation[] {
  const requiredEnabled = releaseProfile === COMMERCE_RELEASE_PROFILE;
  const gates = [
    {
      capability: "customer-commerce" as const,
      environmentVariable: "CUSTOMER_COMMERCE_ENABLED" as const,
    },
    {
      capability: "customer-quotation-ordering" as const,
      environmentVariable: "CUSTOMER_QUOTATION_ORDERING_ENABLED" as const,
    },
    {
      capability: "payment-gateway-transactions" as const,
      environmentVariable: "PAYMENT_GATEWAY_TRANSACTIONS_ENABLED" as const,
    },
    {
      capability: "payment-gateway-refunds" as const,
      environmentVariable: "PAYMENT_GATEWAY_REFUNDS_ENABLED" as const,
    },
  ];

  return gates.map(({ capability, environmentVariable }) => {
    const configuredEnabled = isExplicitlyEnabled(environment[environmentVariable]);
    const effectiveEnabled = isCommerceFeatureEnabled(
      releaseProfile,
      environment[environmentVariable],
    );
    return {
      capability,
      environmentVariable,
      configuredEnabled,
      effectiveEnabled,
      requiredEnabled,
      ready: configuredEnabled === requiredEnabled && effectiveEnabled === requiredEnabled,
    };
  });
}

export function isCustomerCommerceEnabled(
  releaseProfile = process.env.RELEASE_PROFILE,
  commerceFlag = process.env.CUSTOMER_COMMERCE_ENABLED,
) {
  return isCommerceFeatureEnabled(releaseProfile, commerceFlag);
}

/**
 * 客户报价确认转单独立于零售结算和支付网关；缺失或非严格 true 时安全关闭。
 * 发布档位仍是父级门禁，避免 lead-generation 环境误开放交易写入。
 */
export function isCustomerQuotationOrderingEnabled(
  releaseProfile = process.env.RELEASE_PROFILE,
  quotationOrderingFlag = process.env.CUSTOMER_QUOTATION_ORDERING_ENABLED,
) {
  return isCommerceFeatureEnabled(releaseProfile, quotationOrderingFlag);
}

/** 新建在线支付交易的公开可见门禁；不影响既有支付的回调、查单与对账。 */
export function isPaymentGatewayTransactionsEnabled(
  releaseProfile = process.env.RELEASE_PROFILE,
  paymentTransactionsFlag = process.env.PAYMENT_GATEWAY_TRANSACTIONS_ENABLED,
) {
  return isCommerceFeatureEnabled(releaseProfile, paymentTransactionsFlag);
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
