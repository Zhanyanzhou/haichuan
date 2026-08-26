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
