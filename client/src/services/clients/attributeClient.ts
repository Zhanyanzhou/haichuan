import api from "../httpClient";
import { mockDelay, USE_MOCK } from "../mockData";
import { mockResponse } from "../mockResponse";

export interface AttributeCreateInput {
  name: string;
  key: string;
  sortOrder?: number;
  isFilterable?: boolean;
}

export interface AttributeUpdateInput {
  name?: string;
  sortOrder?: number;
  isFilterable?: boolean;
  isActive?: boolean;
}

export interface AttributeValueInput {
  value?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export const attributeApi = {
  getPublic: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse({ list: [] });
    }
    return api.get("/attributes", { suppressGlobalError: true });
  },
  getAll: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse({ list: [] });
    }
    return api.get("/attributes/admin");
  },
  create: async (data: AttributeCreateInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse(data);
    }
    return api.post("/attributes", data);
  },
  update: async (id: number, data: AttributeUpdateInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse(data);
    }
    return api.put(`/attributes/${id}`, data);
  },
  remove: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse({ id });
    }
    return api.delete(`/attributes/${id}`);
  },
  addValue: async (attributeId: number, data: AttributeValueInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse(data);
    }
    return api.post(`/attributes/${attributeId}/values`, data);
  },
  updateValue: async (valueId: number, data: AttributeValueInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse(data);
    }
    return api.put(`/attributes/values/${valueId}`, data);
  },
  removeValue: async (valueId: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse({ id: valueId });
    }
    return api.delete(`/attributes/values/${valueId}`);
  },
};
