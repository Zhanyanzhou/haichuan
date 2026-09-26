import api, { customerAuthHeaders } from "../httpClient";
import type { ConsultationSubmissionReceipt } from "./consultationSubmissionReceipt";
import {
  PRIVACY_CONSENT_CONTENT_HASH,
  PRIVACY_CONSENT_VERSION,
} from "@/config/privacyConsent";

export type { ConsultationSubmissionReceipt } from "./consultationSubmissionReceipt";

export type SelectionInquiryListQuery = {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type SelectionInquiryUpdateInput = {
  status?: string;
  handlerId?: number;
};

export type SelectionInquirySubmitItem = {
  productId?: number;
  productNameSnapshot: string;
  productSkuSnapshot?: string;
  productImageSnapshot?: string;
};

export type SelectionInquirySubmitInput = {
  customerName?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  message?: string;
  privacyConsent: boolean;
  items: SelectionInquirySubmitItem[];
};

export const selectionInquiryApi = {
  getList: (params?: SelectionInquiryListQuery) =>
    api.get("/selection-inquiries", { params }),
  getDetail: (id: number) => api.get(`/selection-inquiries/${id}`),
  update: (id: number, data: SelectionInquiryUpdateInput, idempotencyKey: string) =>
    api.put(`/selection-inquiries/${id}`, data, {
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  submit: (data: SelectionInquirySubmitInput, idempotencyKey: string) =>
    api.post<ConsultationSubmissionReceipt>("/selection-inquiries", {
      ...data,
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
      privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
    }, {
      headers: {
        ...customerAuthHeaders(),
        "Idempotency-Key": idempotencyKey,
      },
    }),
};
