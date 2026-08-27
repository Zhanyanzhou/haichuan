export const LEAD_TYPES = ['inquiry', 'selection'] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const LEAD_STATUSES = [
  'PENDING',
  'CONTACTED',
  'FOLLOWING',
  'COMPLETED',
  'INVALID',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_CONTACT_METHODS = [
  'phone',
  'wechat',
  'email',
  'store',
  'other',
] as const;

// 法律保留原因只允许结构化代码，避免把案件、人名或其他个人信息写入审计元数据。
export const LEAD_LEGAL_HOLD_REASONS = [
  'LEGAL_REQUIREMENT',
  'DISPUTE_OR_CLAIM',
  'RIGHTS_REQUEST_REVIEW',
  'OTHER_REVIEW',
] as const;

export const LEAD_LEGAL_HOLD_RELEASE_REASONS = [
  'REQUIREMENT_ENDED',
  'DISPUTE_RESOLVED',
  'REVIEW_COMPLETED',
  'ENTERED_IN_ERROR',
] as const;
