import { Prisma } from "@prisma/client";

export const CUSTOMER_LEAD_REPLY_SELECT = {
  id: true,
  status: true,
  assignedTo: true,
  updatedAt: true,
  activities: {
    where: { type: "REPLY" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      content: true,
      createdAt: true,
    },
  },
} satisfies Prisma.LeadSelect;

export const CUSTOMER_CONSULTATION_DETAIL_SELECT = {
  ...CUSTOMER_LEAD_REPLY_SELECT,
  sourceType: true,
  createdAt: true,
  inquiry: {
    select: {
      id: true,
      message: true,
      consultationType: true,
      preferredContact: true,
      preferredTime: true,
      budgetRange: true,
      product: { select: { name: true } },
    },
  },
  selectionInquiry: {
    select: {
      id: true,
      message: true,
      items: { select: { productNameSnapshot: true } },
    },
  },
} satisfies Prisma.LeadSelect;

type CustomerLeadReplySource = Prisma.LeadGetPayload<{
  select: typeof CUSTOMER_LEAD_REPLY_SELECT;
}>;

type CustomerConsultationDetailSource = Prisma.LeadGetPayload<{
  select: typeof CUSTOMER_CONSULTATION_DETAIL_SELECT;
}>;

export type CustomerConsultationHandlingState =
  | "WAITING_ASSIGNMENT"
  | "ADVISOR_ASSIGNED"
  | "IN_PROGRESS"
  | "CLOSED";

export type CustomerConsultationNextAction =
  | "WAIT_FOR_ADVISOR"
  | "REVIEW_ADVISOR_REPLY"
  | "START_NEW_CONSULTATION";

function toCustomerConsultationProgress(
  lead: CustomerLeadReplySource,
  hasReply: boolean,
): {
  handlingState: CustomerConsultationHandlingState;
  nextAction: CustomerConsultationNextAction;
} {
  if (lead.status === "COMPLETED" || lead.status === "INVALID") {
    return {
      handlingState: "CLOSED",
      nextAction: "START_NEW_CONSULTATION",
    };
  }
  if (lead.status === "CONTACTED" || lead.status === "FOLLOWING") {
    return {
      handlingState: "IN_PROGRESS",
      nextAction: hasReply ? "REVIEW_ADVISOR_REPLY" : "WAIT_FOR_ADVISOR",
    };
  }
  return {
    handlingState: lead.assignedTo === null
      ? "WAITING_ASSIGNMENT"
      : "ADVISOR_ASSIGNED",
    nextAction: "WAIT_FOR_ADVISOR",
  };
}

export function toCustomerLeadReply(lead: CustomerLeadReplySource | null) {
  const activity = lead?.activities[0];
  const progress = lead
    ? toCustomerConsultationProgress(lead, Boolean(activity?.content))
    : { handlingState: null, nextAction: null };
  return {
    leadId: lead?.id ?? null,
    status: lead?.status ?? null,
    updatedAt: lead?.updatedAt ?? null,
    ...progress,
    reply: activity?.content
      ? {
          id: activity.id,
          content: activity.content,
          createdAt: activity.createdAt,
        }
      : null,
  };
}

export function toLeadReplyMutationResult(
  lead: { id: number; status: string; updatedAt: Date },
  activity: { id: number; content: string | null; createdAt: Date },
) {
  return {
    leadId: lead.id,
    status: lead.status,
    updatedAt: lead.updatedAt,
    reply: {
      id: activity.id,
      content: activity.content ?? "",
      createdAt: activity.createdAt,
    },
  };
}

export function toCustomerConsultationDetail(
  lead: CustomerConsultationDetailSource,
) {
  const common = toCustomerLeadReply(lead);
  if (lead.sourceType === "INQUIRY" && lead.inquiry) {
    return {
      ...common,
      type: "inquiry" as const,
      sourceId: lead.inquiry.id,
      createdAt: lead.createdAt,
      message: lead.inquiry.message,
      consultationType: lead.inquiry.consultationType,
      preferredContact: lead.inquiry.preferredContact,
      preferredTime: lead.inquiry.preferredTime,
      budgetRange: lead.inquiry.budgetRange,
      product: lead.inquiry.product
        ? { name: lead.inquiry.product.name }
        : null,
      items: [],
    };
  }
  if (lead.sourceType === "SELECTION_INQUIRY" && lead.selectionInquiry) {
    return {
      ...common,
      type: "selection" as const,
      sourceId: lead.selectionInquiry.id,
      createdAt: lead.createdAt,
      message: lead.selectionInquiry.message,
      consultationType: null,
      preferredContact: null,
      preferredTime: null,
      budgetRange: null,
      product: null,
      items: lead.selectionInquiry.items.map((item) => ({
        productNameSnapshot: item.productNameSnapshot,
      })),
    };
  }
  throw new Error("线索来源关联不完整");
}
