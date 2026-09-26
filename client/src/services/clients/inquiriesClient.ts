import { USE_MOCK, mockDelay } from "../mockData";
import api, { customerAuthHeaders } from "../httpClient";
import { mockResponse } from "../mockResponse";
import type { ConsultationSubmissionReceipt } from "./consultationSubmissionReceipt";
import {
  PRIVACY_CONSENT_CONTENT_HASH,
  PRIVACY_CONSENT_VERSION,
} from "@/config/privacyConsent";

export type { ConsultationSubmissionReceipt } from "./consultationSubmissionReceipt";

export type InquiryListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
};

export type InquiryStatusUpdateInput =
  | {
      reply: string;
      expectedUpdatedAt: string;
      idempotencyKey: string;
      assignedTo?: never;
    }
  | {
      assignedTo: number;
      reply?: never;
      expectedUpdatedAt?: never;
      idempotencyKey: string;
    };

export type InquirySubmitInput = {
  name: string;
  phone: string;
  email?: string;
  consultationType: string;
  preferredContact: string;
  preferredTime?: string;
  budgetRange?: string;
  productId?: number;
  message: string;
  privacyConsent: boolean;
};

export const inquiriesApi = {
  getList: async (params?: InquiryListQuery) => {
    if (USE_MOCK) {
      await mockDelay(300);
      return mockResponse({ items: [], total: 0 });
    }
    return api.get("/inquiries", { params });
  },
  updateStatus: async (id: number, data: InquiryStatusUpdateInput) => {
    if (USE_MOCK) {
      await mockDelay(300);
      return mockResponse({ success: true });
    }
    if (data.reply !== undefined) {
      return api.put(
        `/inquiries/${id}/reply`,
        {
          reply: data.reply,
          expectedUpdatedAt: data.expectedUpdatedAt,
        },
        { headers: { "Idempotency-Key": data.idempotencyKey } },
      );
    }
    return api.put(
      `/inquiries/${id}/assign`,
      { assignedTo: data.assignedTo },
      { headers: { "Idempotency-Key": data.idempotencyKey } },
    );
  },
  submit: async (data: InquirySubmitInput, idempotencyKey: string) => {
    if (USE_MOCK) {
      await mockDelay(500);
      const sourceId = Date.now();
      return mockResponse<ConsultationSubmissionReceipt>({
        id: sourceId,
        sourceId,
        leadId: sourceId + 1,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      });
    }
    return api.post<ConsultationSubmissionReceipt>(
      "/inquiries",
      {
        ...data,
        privacyConsentVersion: PRIVACY_CONSENT_VERSION,
        privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
        customerName: data.name,
        customerPhone: data.phone,
        customerEmail: data.email,
      },
      {
        headers: {
          ...customerAuthHeaders(),
          "Idempotency-Key": idempotencyKey,
        },
      },
    );
  },
};
