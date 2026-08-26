import { USE_MOCK, mockDelay } from "../mockData";
import api, { customerAuthHeaders } from "../httpClient";
import { mockResponse } from "../mockResponse";

export type InquiryListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
};

export type InquiryStatusUpdateInput = {
  status?: string;
  reply?: string;
  assignedTo?: number;
};

export type InquirySubmitInput = {
  name: string;
  phone: string;
  email?: string;
  consultationType: string;
  preferredContact: string;
  preferredTime: string;
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
    if (data.reply) {
      return api.put(`/inquiries/${id}/reply`, { reply: data.reply });
    }
    if (data.assignedTo) {
      return api.put(`/inquiries/${id}/assign`, {
        assignedTo: data.assignedTo,
      });
    }
    return api.put(`/inquiries/${id}/reply`, data);
  },
  submit: async (data: InquirySubmitInput) => {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockResponse({
        id: Date.now(),
        ...data,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      });
    }
    return api.post(
      "/inquiries",
      {
        ...data,
        customerName: data.name,
        customerPhone: data.phone,
        customerEmail: data.email,
      },
      { headers: customerAuthHeaders() },
    );
  },
};
