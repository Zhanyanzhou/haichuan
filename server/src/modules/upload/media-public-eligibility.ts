export type MediaAuthorizationReviewState = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
export type MediaAuthorizationRevocationState = 'ACTIVE' | 'REVOKED';

export type MediaPublicIneligibilityReason =
  | 'ASSET_NOT_READY'
  | 'ASSET_NOT_PUBLIC'
  | 'AUTHORIZATION_MISSING'
  | 'AUTHORIZATION_NOT_APPROVED'
  | 'PUBLIC_WEB_USE_NOT_ALLOWED'
  | 'AUTHORIZATION_NOT_STARTED'
  | 'AUTHORIZATION_EXPIRED'
  | 'AUTHORIZATION_REVOKED';

export type MediaPublicEligibilityInput = {
  assetStatus: string;
  accessLevel: string;
  authorization?: {
    reviewStatus: MediaAuthorizationReviewState | string;
    revocationStatus: MediaAuthorizationRevocationState | string;
    publicWebUseAllowed: boolean;
    validFrom?: Date | string | null;
    validUntil?: Date | string | null;
  } | null;
};

export type MediaPublicEligibility = {
  eligible: boolean;
  reasons: MediaPublicIneligibilityReason[];
};

const dateValue = (value: Date | string | null | undefined): number | undefined => {
  if (!value) return undefined;
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
};

/**
 * 公开资格的唯一纯裁决。后台预览不消费此结果；公开读取与发布校验必须消费。
 * 截止时刻按半开区间处理：validUntil 等于当前时刻即视为失效。
 */
export function evaluateMediaPublicEligibility(
  input: MediaPublicEligibilityInput,
  now: Date = new Date(),
): MediaPublicEligibility {
  const reasons: MediaPublicIneligibilityReason[] = [];
  if (input.assetStatus !== 'READY') reasons.push('ASSET_NOT_READY');
  if (input.accessLevel !== 'PUBLIC') reasons.push('ASSET_NOT_PUBLIC');

  const authorization = input.authorization;
  if (!authorization) {
    reasons.push('AUTHORIZATION_MISSING');
    return { eligible: false, reasons };
  }
  if (authorization.reviewStatus !== 'APPROVED') reasons.push('AUTHORIZATION_NOT_APPROVED');
  if (authorization.revocationStatus === 'REVOKED') reasons.push('AUTHORIZATION_REVOKED');
  if (!authorization.publicWebUseAllowed) reasons.push('PUBLIC_WEB_USE_NOT_ALLOWED');

  const nowValue = now.getTime();
  const validFrom = dateValue(authorization.validFrom);
  const validUntil = dateValue(authorization.validUntil);
  if (validFrom !== undefined && validFrom > nowValue) reasons.push('AUTHORIZATION_NOT_STARTED');
  if (validUntil !== undefined && validUntil <= nowValue) reasons.push('AUTHORIZATION_EXPIRED');

  return { eligible: reasons.length === 0, reasons };
}
