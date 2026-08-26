import api, { customerAuthHeaders } from "../httpClient";

export type ReviewSubmitInput = {
  orderId: number;
  productId: number;
  rating: number;
  content: string;
  imageUrls?: string[];
};

export type ReviewListQuery = {
  page?: number;
  pageSize?: number;
};

export type ReviewAdminListQuery = ReviewListQuery & {
  status?: string;
};

export type ReviewModerationInput = {
  status: "APPROVED" | "REJECTED";
  reply?: string;
};

export const reviewApi = {
  submit: (data: ReviewSubmitInput) =>
    api.post("/reviews", data, { headers: customerAuthHeaders() }),
  mine: () => api.get("/reviews/me", { headers: customerAuthHeaders() }),
  listForProduct: (productId: number, params?: ReviewListQuery) =>
    api.get(`/reviews/product/${productId}`, { params }),
  adminList: (params?: ReviewAdminListQuery) => api.get("/reviews", { params }),
  moderate: (id: number, data: ReviewModerationInput) =>
    api.put(`/reviews/${id}/moderate`, data),
};
