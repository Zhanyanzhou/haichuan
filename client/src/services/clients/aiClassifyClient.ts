import api from "../httpClient";
import { mockDelay, paginate, USE_MOCK } from "../mockData";
import { mockResponse } from "../mockResponse";

export interface AiClassifyRecordQuery {
  page?: number;
  pageSize?: number;
  status?: string;
}

export interface AiDescriptionInput {
  productName: string;
  category: string;
  material: string;
  style?: string;
}

export interface AiClassifyConfirmationInput {
  status: "confirmed" | "rejected";
  confirmedCategoryId?: number;
}

export const aiClassifyApi = {
  // 单张/批量识别：服务端 DTO 要求 JSON（imageUrl / imageUrls），非 multipart。
  classify: (data: { imageUrl: string }) =>
    api.post("/ai-classify/single", data),
  batchClassify: (data: { imageUrls: string[] }) =>
    api.post("/ai-classify/batch", data),
  generateDescription: (data: AiDescriptionInput) =>
    api.post("/ai-classify/generate-description", data),
  // 通用 AI 对话（产品文案/客户咨询/数据分析等，Kimi 驱动）。
  chat: (data: { message: string; systemPrompt?: string }) =>
    api.post("/ai-classify/chat", data),
  getReport: () => api.get("/ai-classify/report"),
  getRecords: async (params: AiClassifyRecordQuery) => {
    if (USE_MOCK) {
      await mockDelay();
      const records = [
        {
          id: 1,
          imageUrl: "",
          predictedCategoryName: "平安扣",
          confidence: 96.5,
          status: "auto_confirmed",
          createdAt: "2024-07-31 10:30",
        },
        {
          id: 2,
          imageUrl: "",
          predictedCategoryName: "葫芦",
          confidence: 82.3,
          status: "pending_confirm",
          createdAt: "2024-07-31 10:25",
        },
        {
          id: 3,
          imageUrl: "",
          predictedCategoryName: "花戒",
          confidence: 65,
          status: "pending_review",
          createdAt: "2024-07-31 10:20",
        },
        {
          id: 4,
          imageUrl: "",
          predictedCategoryName: "锁包",
          confidence: 93.1,
          status: "auto_confirmed",
          createdAt: "2024-07-31 09:15",
        },
        {
          id: 5,
          imageUrl: "",
          predictedCategoryName: "佛公",
          confidence: 88.7,
          status: "pending_confirm",
          confirmedCategoryName: "平安扣",
          createdAt: "2024-07-30 16:00",
        },
      ];
      return mockResponse(
        paginate(records, params.page || 1, params.pageSize || 20),
      );
    }
    return api.get("/ai-classify/records", { params });
  },
  confirm: (id: number, data: AiClassifyConfirmationInput) =>
    api.put(`/ai-classify/confirm/${id}`, data),
};
