import api from "../httpClient";

export type TrendMetric = "orders" | "revenue" | "inquiries" | "pageViews";

export const statisticsApi = {
  getDashboard: () => api.get("/statistics/dashboard"),
  getTrend: (days = 7, metric: TrendMetric = "orders") =>
    api.get("/statistics/trend", { params: { days, metric } }),
};
