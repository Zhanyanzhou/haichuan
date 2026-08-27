import api, { customerAuthHeaders } from "../httpClient";

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
  update: (id: number, data: SelectionInquiryUpdateInput) =>
    api.put(`/selection-inquiries/${id}`, data),
  submit: (data: SelectionInquirySubmitInput, idempotencyKey?: string) =>
    api.post("/selection-inquiries", data, {
      headers: {
        ...customerAuthHeaders(),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
    }),
};
