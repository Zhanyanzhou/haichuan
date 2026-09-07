import { Prisma } from '@prisma/client';
import {
  CUSTOMER_LEAD_REPLY_SELECT,
  toCustomerLeadReply,
} from '../leads/customer-lead-reply.response';

export const CUSTOMER_SELECTION_INQUIRY_SUBMISSION_SELECT = {
  id: true,
  status: true,
  createdAt: true,
} satisfies Prisma.SelectionInquirySelect;

export const CUSTOMER_SELECTION_INQUIRY_LIST_SELECT = {
  id: true,
  status: true,
  message: true,
  createdAt: true,
  updatedAt: true,
  items: { select: { productNameSnapshot: true } },
  lead: { select: CUSTOMER_LEAD_REPLY_SELECT },
} satisfies Prisma.SelectionInquirySelect;

export const CUSTOMER_SELECTION_INQUIRY_EXPORT_SELECT = {
  message: true,
  status: true,
  createdAt: true,
} satisfies Prisma.SelectionInquirySelect;

export const CUSTOMER_SELECTION_INQUIRY_DEDUPE_SELECT = {
  ...CUSTOMER_SELECTION_INQUIRY_SUBMISSION_SELECT,
  items: { select: { productId: true } },
} satisfies Prisma.SelectionInquirySelect;

type CustomerSelectionInquirySubmissionSource =
  Prisma.SelectionInquiryGetPayload<{
    select: typeof CUSTOMER_SELECTION_INQUIRY_SUBMISSION_SELECT;
  }>;

type CustomerSelectionInquiryListSource = Prisma.SelectionInquiryGetPayload<{
  select: typeof CUSTOMER_SELECTION_INQUIRY_LIST_SELECT;
}>;

export function toCustomerSelectionInquirySubmission(
  inquiry: CustomerSelectionInquirySubmissionSource,
) {
  return {
    id: inquiry.id,
    status: inquiry.status,
    createdAt: inquiry.createdAt,
  };
}

export function toCustomerSelectionInquiryListItem(
  inquiry: CustomerSelectionInquiryListSource,
) {
  const lead = toCustomerLeadReply(inquiry.lead);
  return {
    id: inquiry.id,
    leadId: lead.leadId,
    status: lead.status ?? inquiry.status,
    message: inquiry.message,
    createdAt: inquiry.createdAt,
    updatedAt: lead.updatedAt ?? inquiry.updatedAt,
    items: inquiry.items.map((item) => ({
      productNameSnapshot: item.productNameSnapshot,
    })),
    reply: lead.reply,
  };
}
