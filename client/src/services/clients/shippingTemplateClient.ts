import api from "../httpClient";
import { mockDelay, USE_MOCK } from "../mockData";
import { mockResponse } from "../mockResponse";

export type ShippingFeeMode = "FREE" | "FIXED" | "CONDITIONAL";

export interface ShippingTemplateCreateInput {
  name: string;
  carrier?: string;
  feeMode?: ShippingFeeMode;
  baseFee?: number;
  remoteSurcharge?: number;
  freeShippingThreshold?: number | null;
  excludedRegions?: string[];
  insured?: boolean;
  signatureRequired?: boolean;
  isDefault?: boolean;
  isActive?: boolean;
}

export type ShippingTemplateUpdateInput =
  Partial<ShippingTemplateCreateInput>;

export const shippingTemplateApi = {
  list: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockResponse([
        {
          id: 1,
          name: "系统模板-珠宝默认模板",
          carrier: "顺丰速运",
          feeMode: "FREE",
          baseFee: 0,
          remoteSurcharge: 0,
          insured: true,
          signatureRequired: true,
          isDefault: true,
          isActive: true,
        },
      ]);
    }
    return api.get("/shipping-templates");
  },
  create: async (data: ShippingTemplateCreateInput) => {
    if (USE_MOCK) {
      await mockDelay(120);
      return mockResponse({
        id: Date.now(),
        ...data,
        isDefault: false,
        isActive: true,
      });
    }
    return api.post("/shipping-templates", data);
  },
  update: async (id: number, data: ShippingTemplateUpdateInput) => {
    if (USE_MOCK) {
      await mockDelay(120);
      return mockResponse({ id, ...data });
    }
    return api.put(`/shipping-templates/${id}`, data);
  },
};
