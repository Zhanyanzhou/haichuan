import { Prisma } from '@prisma/client';
import {
  CUSTOMER_LEAD_REPLY_SELECT,
  toCustomerLeadReply,
} from '../leads/customer-lead-reply.response';

export const CUSTOMER_INQUIRY_SUBMISSION_SELECT = {
  id: true,
  status: true,
  createdAt: true,
} satisfies Prisma.InquirySelect;

export const CUSTOMER_INQUIRY_LIST_SELECT = {
  id: true,
  status: true,
  message: true,
  createdAt: true,
  updatedAt: true,
  consultationType: true,
  preferredContact: true,
  preferredTime: true,
  budgetRange: true,
  product: { select: { name: true } },
  lead: { select: CUSTOMER_LEAD_REPLY_SELECT },
} satisfies Prisma.InquirySelect;

export const CUSTOMER_INQUIRY_EXPORT_SELECT = {
  message: true,
  reply: true,
  status: true,
  createdAt: true,
} satisfies Prisma.InquirySelect;

type CustomerInquirySubmissionSource = Prisma.InquiryGetPayload<{
  select: typeof CUSTOMER_INQUIRY_SUBMISSION_SELECT;
}>;

type CustomerInquiryListSource = Prisma.InquiryGetPayload<{
  select: typeof CUSTOMER_INQUIRY_LIST_SELECT;
}>;

export function toCustomerInquirySubmission(
  inquiry: CustomerInquirySubmissionSource,
) {
  return {
    id: inquiry.id,
    status: inquiry.status,
    createdAt: inquiry.createdAt,
  };
}

export function toCustomerInquiryListItem(inquiry: CustomerInquiryListSource) {
  const lead = toCustomerLeadReply(inquiry.lead);
  return {
    id: inquiry.id,
    leadId: lead.leadId,
    status: lead.status ?? inquiry.status,
    message: inquiry.message,
    createdAt: inquiry.createdAt,
    updatedAt: lead.updatedAt ?? inquiry.updatedAt,
    consultationType: inquiry.consultationType,
    preferredContact: inquiry.preferredContact,
    preferredTime: inquiry.preferredTime,
    budgetRange: inquiry.budgetRange,
    product: inquiry.product ? { name: inquiry.product.name } : null,
    reply: lead.reply,
  };
}
