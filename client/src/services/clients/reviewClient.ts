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

export type CustomerReviewRecord = {
  id: number;
  orderId: number;
  productId: number;
  rating: number;
  content: string;
  images: string[];
  submissionFingerprint: string;
  status: string;
};

export type ReviewImageUploadResult = { reference: string };
export type ReviewImageUploadStatus = {
  status: "AVAILABLE" | "MISSING";
  reference?: string;
};

export const reviewApi = {
  uploadImage: (file: File, idempotencyKey: string) => {
    const body = new FormData();
    body.append("file", file);
    return api.post<ReviewImageUploadResult>("/reviews/media", body, {
      headers: {
        ...customerAuthHeaders(),
        "Idempotency-Key": idempotencyKey,
      },
      suppressGlobalError: true,
    });
  },
  imageUploadStatus: (idempotencyKey: string) =>
    api.get<ReviewImageUploadStatus>("/reviews/media/status", {
      headers: {
        ...customerAuthHeaders(),
        "Idempotency-Key": idempotencyKey,
      },
      suppressGlobalError: true,
    }),
  submit: (data: ReviewSubmitInput) =>
    api.post("/reviews", data, {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),
  mine: () => api.get<CustomerReviewRecord[]>("/reviews/me", {
    headers: customerAuthHeaders(),
    suppressGlobalError: true,
  }),
  listForProduct: (productId: number, params?: ReviewListQuery) =>
    api.get(`/reviews/product/${productId}`, { params, suppressGlobalError: true }),
  adminList: (params?: ReviewAdminListQuery) => api.get("/reviews", { params }),
  moderate: (id: number, data: ReviewModerationInput) =>
    api.put(`/reviews/${id}/moderate`, data),
};
