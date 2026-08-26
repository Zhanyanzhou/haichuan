import api, { customerAuthHeaders } from "../httpClient";

// 规则推荐仅对登录客户开放；三条读接口共享同一客户令牌来源。
export const recommendationApi = {
  getHot: (limit = 12) =>
    api.get("/recommendations/hot", {
      params: { limit },
      headers: customerAuthHeaders(),
    }),
  getForYou: (limit = 12) =>
    api.get("/recommendations/for-you", {
      params: { limit },
      headers: customerAuthHeaders(),
    }),
  getSimilar: (productId: number, limit = 12) =>
    api.get(`/recommendations/similar/${productId}`, {
      params: { limit },
      headers: customerAuthHeaders(),
    }),
};
